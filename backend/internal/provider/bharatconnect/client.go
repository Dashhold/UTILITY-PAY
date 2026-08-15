// Package bharatconnect integrates the MobiKwik Recharge & Bill Payment API
// (Bharat Connect / BBPS).
//
// Implemented against "Recharge & Bill Payment API Documentation (Standard
// Format)" v1.0. The wire contract is transcribed in wire.go; the token
// lifecycle rules are in token.go; the request envelope is in
// internal/cryptoenv.
//
// Request bodies for the five /v3/retailer* endpoints and the credit-card bill
// fetch are encrypted. The token request and every response are plaintext JSON.
package bharatconnect

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/cryptoenv"
	"github.com/utilipay/backend/internal/provider"
)

const providerName = "mobikwik_bharat_connect"

// ErrInvalidRequest signals that a request was rejected locally, before any
// network call, because mandatory fields were missing.
//
// It exists so callers can respond 400 rather than 502/503. Reporting a missing
// field as a provider outage sends the user chasing the wrong problem, and hides
// a fixable input error behind an apparent infrastructure fault.
var ErrInvalidRequest = errors.New("bharatconnect: invalid request")

// Client talks to the MobiKwik Recharge & Bill Payment API.
type Client struct {
	cfg       config.BharatConnectConfig
	http      *provider.Client
	sealer    *cryptoenv.Sealer
	tokens    *tokenManager
	paths     endpointPaths
	sealed    map[string]bool
	uatLogger *slog.Logger
}

// New builds a Client. The sealer is constructed eagerly so a malformed public
// key fails at startup rather than on the first transaction.
func New(cfg config.BharatConnectConfig, store TokenStore, sink provider.AuditSink, suite cryptoenv.Suite) (*Client, error) {
	c := &Client{
		cfg:    cfg,
		http:   provider.NewClient(providerName, cfg.Timeout, sink),
		paths:  defaultPaths(),
		sealed: encryptedPaths(),
	}

	if cfg.Enabled {
		sealer, err := cryptoenv.NewSealer(cfg.PublicKeyBase64, cfg.KeyVersion, suite)
		if err != nil {
			return nil, fmt.Errorf("bharatconnect: build sealer: %w", err)
		}
		c.sealer = sealer
	}

	if store == nil {
		store = &MemoryTokenStore{}
	}
	c.tokens = newTokenManager(store, c.issueToken, cfg.TokenSafetyWindow)

	// UAT logging: captures BOTH encrypted AND decrypted payloads for UAT evidence.
	// MUST be disabled in production (exposes session keys + plaintext in logs).
	if cfg.UATLogging {
		c.uatLogger = slog.Default().With(slog.String("component", "bharatconnect_uat"))
		c.uatLogger.Warn("UAT logging enabled: encrypted+decrypted payloads will be logged. DISABLE in production.")
	}

	return c, nil
}

// WithTransport swaps the HTTP layer. Intended for tests.
func (c *Client) WithTransport(d provider.Doer) *Client {
	clone := *c
	clone.http = c.http.WithDoer(d)
	clone.tokens = newTokenManager(c.tokens.store, clone.issueToken, c.cfg.TokenSafetyWindow)
	return &clone
}

// Enabled reports whether the integration is switched on.
func (c *Client) Enabled() bool { return c.cfg.Enabled }

// Capabilities reports which operations may be invoked.
//
// Every operation is now backed by the provider specification, so the whole set
// is available whenever the integration is enabled.
type Capabilities struct {
	Token          bool `json:"token"`
	Plans          bool `json:"plans"`
	Balance        bool `json:"balance"`
	Validation     bool `json:"validation"`
	ViewBill       bool `json:"viewBill"`
	Payment        bool `json:"payment"`
	Status         bool `json:"status"`
	CreditCardBill bool `json:"creditCardBill"`
}

// Capabilities returns the supported operation set.
func (c *Client) Capabilities() Capabilities {
	e := c.cfg.Enabled
	return Capabilities{
		Token:          e,
		Plans:          e,
		Balance:        e,
		Validation:     e,
		ViewBill:       e,
		Payment:        e,
		Status:         e,
		CreditCardBill: e,
	}
}

// =============================================================================
// Token generation — POST /recharge/v1/verify/retailer (plaintext body)
// =============================================================================

func (c *Client) issueToken(ctx context.Context) (string, time.Time, time.Time, error) {
	if !c.cfg.Enabled {
		return "", time.Time{}, time.Time{}, fmt.Errorf("bharatconnect: %w", provider.ErrIntegrationDisabled)
	}

	payload, err := json.Marshal(tokenRequest{
		ClientID:     c.cfg.ClientID,
		ClientSecret: c.cfg.ClientSecret,
	})
	if err != nil {
		return "", time.Time{}, time.Time{}, fmt.Errorf("bharatconnect: marshal token request: %w", err)
	}

	// UAT logging: token request (plaintext, redact secret for safety)
	if c.uatLogger != nil {
		c.uatLogger.Info("UAT TOKEN REQUEST",
			slog.String("operation", OpToken),
			slog.String("url", c.endpoint(c.paths.token)),
			slog.String("clientId", c.cfg.ClientID),
			slog.String("clientSecret", "[REDACTED]"),
			slog.String("requestBody", redact(string(payload), c.cfg.ClientSecret)),
		)
	}

	resp, err := c.http.Do(ctx, provider.Request{
		Method:    http.MethodPost,
		URL:       c.endpoint(c.paths.token),
		Headers:   map[string]string{"Content-Type": "application/json", "Accept": "application/json"},
		Body:      payload,
		Operation: OpToken,
		// The credential body is plaintext on the wire, so the audit copy has the
		// secret masked: these rows are long-lived and admin-readable.
		RequestPlaintext: redact(string(payload), c.cfg.ClientSecret),
	})
	if err != nil {
		// UAT logging: token request failure
		if c.uatLogger != nil {
			c.uatLogger.Info("UAT TOKEN RESPONSE FAILURE",
				slog.String("operation", OpToken),
				slog.String("error", err.Error()),
			)
		}
		return "", time.Time{}, time.Time{}, err
	}

	// UAT logging: token response
	if c.uatLogger != nil {
		c.uatLogger.Info("UAT TOKEN RESPONSE SUCCESS",
			slog.String("operation", OpToken),
			slog.Int("statusCode", resp.StatusCode),
			slog.String("responseBody", string(resp.Body)),
		)
	}

	var parsed tokenEnvelope
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		return "", time.Time{}, time.Time{}, fmt.Errorf(
			"bharatconnect: decode token response (http %d, body %q): %w",
			resp.StatusCode, truncate(string(resp.Body), 300), err)
	}

	if !parsed.Success || parsed.Data.Token == "" {
		code, text := messageOf(parsed.Message)
		outcome := provider.OutcomeFailed
		if resp.Outcome == provider.OutcomeTimeout {
			outcome = provider.OutcomeTimeout
		}
		return "", time.Time{}, time.Time{}, &provider.APIError{
			Provider: providerName,
			Op:       "token",
			Status:   resp.StatusCode,
			Code:     code,
			Message:  firstNonEmpty(text, "token request rejected without a message"),
			Outcome:  outcome,
		}
	}

	issuedAt := time.Now().UTC()
	expiresAt := issuedAt.Add(TokenValidity)

	// expiryTime is documented as "YYYY-MM-DD HH:mm:ss" with no zone. It is read
	// when parseable, but the documented 24h validity is the fallback so a format
	// change cannot leave the cache with a nonsensical expiry.
	if parsed.Data.ExpiryTime != "" {
		if t, perr := time.Parse(expiryTimeLayout, strings.TrimSpace(parsed.Data.ExpiryTime)); perr == nil {
			if t.After(issuedAt) {
				expiresAt = t
			}
		}
	}

	return parsed.Data.Token, issuedAt, expiresAt, nil
}

// Token returns a valid token, minting one only when required.
func (c *Client) Token(ctx context.Context) (string, error) { return c.tokens.Token(ctx) }

// =============================================================================
// Balance — POST /recharge/v3/retailerBalance
// =============================================================================

// BalanceRequest asks for a retailer's wallet balance with the provider.
type BalanceRequest struct {
	// MemberID is the onboarded email address of the retailer account.
	MemberID   string
	RetailerID *uuid.UUID
}

// BalanceResult is the balance response.
type BalanceResult struct {
	Balance float64
	Raw     string
}

// Balance fetches the retailer's provider-side wallet balance.
func (c *Client) Balance(ctx context.Context, req BalanceRequest) (*BalanceResult, error) {
	if strings.TrimSpace(req.MemberID) == "" {
		return nil, errors.New("bharatconnect: balance: memberId is required")
	}

	payload, err := json.Marshal(balanceRequestPayload{MemberID: req.MemberID})
	if err != nil {
		return nil, fmt.Errorf("bharatconnect: marshal balance request: %w", err)
	}

	resp, err := c.call(ctx, callSpec{
		operation:  OpBalance,
		path:       c.paths.balance,
		payload:    payload,
		retailerID: req.RetailerID,
	})
	if err != nil {
		return nil, err
	}

	var parsed balanceEnvelope
	if err := json.Unmarshal(resp.body, &parsed); err != nil {
		return nil, fmt.Errorf("bharatconnect: decode balance response: %w", err)
	}
	if !parsed.Success {
		return nil, c.businessError("balance", resp, parsed.Message)
	}

	return &BalanceResult{Balance: parsed.Data.Balance, Raw: string(resp.body)}, nil
}

// =============================================================================
// Validation — POST /recharge/v3/retailerValidation
// =============================================================================

// ValidationRequest validates a prepaid recharge before payment.
//
// The documented execution order for prepaid is Validation, then Payment, then
// Status.
type ValidationRequest struct {
	Amount     string
	Connection string
	OperatorID string
	CircleID   string
	PlanCode   string
	AdParams   map[string]string

	RetailerID *uuid.UUID
}

// ValidationResult is the validation outcome.
type ValidationResult struct {
	Outcome         provider.Outcome
	Status          string
	Description     string
	Balance         float64
	DiscountedPrice float64
	Raw             string
}

// Validate checks amount, operator and circle for a connection.
func (c *Client) Validate(ctx context.Context, req ValidationRequest) (*ValidationResult, error) {
	if err := requireAll(map[string]string{
		"amt":     req.Amount,
		"cn":      req.Connection,
		"op":      req.OperatorID,
		"agentId": c.cfg.AgentID,
	}); err != nil {
		return nil, fmt.Errorf("bharatconnect: validate: %w", err)
	}

	payload, err := json.Marshal(validationRequestPayload{
		Amt:      req.Amount,
		CN:       req.Connection,
		Op:       req.OperatorID,
		Cir:      req.CircleID,
		AgentID:  c.cfg.AgentID,
		PlanCode: req.PlanCode,
		// The spec requires an empty map rather than null when there are no
		// additional parameters.
		AdParams: orEmptyMap(req.AdParams),
	})
	if err != nil {
		return nil, fmt.Errorf("bharatconnect: marshal validation request: %w", err)
	}

	resp, err := c.call(ctx, callSpec{
		operation:  OpValidation,
		path:       c.paths.validation,
		payload:    payload,
		retailerID: req.RetailerID,
	})
	if err != nil {
		return nil, err
	}

	var parsed validationEnvelope
	if err := json.Unmarshal(resp.body, &parsed); err != nil {
		return nil, fmt.Errorf("bharatconnect: decode validation response: %w", err)
	}

	result := &ValidationResult{
		Status:          parsed.Data.Status,
		Description:     parsed.Data.Description,
		Balance:         parsed.Data.Balance,
		DiscountedPrice: parsed.Data.DiscountedPrice,
		Raw:             string(resp.body),
	}

	// Validation is a pre-flight check with no money movement, so a rejection is
	// unambiguously terminal.
	switch {
	case parsed.Success && parsed.Data.Status == statusValidationSuccess:
		result.Outcome = provider.OutcomeSuccess
		return result, nil
	case parsed.Success && parsed.Data.Status == "":
		result.Outcome = provider.OutcomeSuccess
		return result, nil
	default:
		result.Outcome = provider.OutcomeFailed
		code, text := messageOf(parsed.Message)
		return result, &provider.APIError{
			Provider: providerName,
			Op:       "validation",
			Status:   resp.statusCode,
			Code:     firstNonEmpty(code, parsed.Data.Status),
			Message:  firstNonEmpty(text, parsed.Data.Description, "validation rejected"),
			Outcome:  provider.OutcomeFailed,
		}
	}
}

// =============================================================================
// View Bill — POST /recharge/v3/retailerViewbill
// =============================================================================

// ViewBillRequest fetches an outstanding bill for a postpaid connection.
type ViewBillRequest struct {
	Connection string
	OperatorID string
	CircleID   string
	AdParams   map[string]string

	RetailerID *uuid.UUID
}

// Bill is a fetched bill.
type Bill struct {
	// BillAmount and BillNetAmount arrive as strings from the provider.
	BillAmount    string
	BillNetAmount string
	BillDate      string
	DueDate       string
	AcceptPayment bool
	AcceptPartPay bool
	CustomerName  string
	CellNumber    string
	MinBillAmount float64
	// AdditionalDetails carries biller extras such as FASTag tag status.
	AdditionalDetails map[string]any
}

// ViewBillResult is the view-bill outcome.
type ViewBillResult struct {
	Bills []Bill
	Raw   string
}

// ViewBill fetches bill details for a connection.
func (c *Client) ViewBill(ctx context.Context, req ViewBillRequest) (*ViewBillResult, error) {
	if err := requireAll(map[string]string{
		"cn":      req.Connection,
		"op":      req.OperatorID,
		"agentId": c.cfg.AgentID,
	}); err != nil {
		return nil, fmt.Errorf("bharatconnect: view bill: %w", err)
	}

	payload, err := json.Marshal(viewBillRequestPayload{
		CN:       req.Connection,
		Op:       req.OperatorID,
		Cir:      req.CircleID,
		AgentID:  c.cfg.AgentID,
		AdParams: orEmptyMap(req.AdParams),
	})
	if err != nil {
		return nil, fmt.Errorf("bharatconnect: marshal view bill request: %w", err)
	}

	resp, err := c.call(ctx, callSpec{
		operation:  OpViewBill,
		path:       c.paths.viewBill,
		payload:    payload,
		retailerID: req.RetailerID,
	})
	if err != nil {
		return nil, err
	}

	var parsed viewBillEnvelope
	if err := json.Unmarshal(resp.body, &parsed); err != nil {
		return nil, fmt.Errorf("bharatconnect: decode view bill response: %w", err)
	}
	if !parsed.Success {
		return nil, c.businessError("view_bill", resp, parsed.Message)
	}

	out := &ViewBillResult{Raw: string(resp.body)}
	for _, rec := range parsed.Data {
		out.Bills = append(out.Bills, Bill{
			BillAmount:        rec.BillAmount,
			BillNetAmount:     rec.BillNetAmount,
			BillDate:          rec.BillDate,
			DueDate:           rec.DueDate,
			AcceptPayment:     rec.AcceptPayment,
			AcceptPartPay:     rec.AcceptPartPay,
			CustomerName:      rec.UserName,
			CellNumber:        rec.CellNumber,
			MinBillAmount:     rec.MinBillAmount,
			AdditionalDetails: rec.AdditionalDetails,
		})
	}
	return out, nil
}

// =============================================================================
// Payment — POST /recharge/v3/retailerPayment
// =============================================================================

// PaymentRequest initiates a recharge or bill payment.
type PaymentRequest struct {
	Connection string
	OperatorID string
	CircleID   string
	Amount     string

	// ReqID is our unique transaction reference, at most 20 characters. It
	// doubles as the idempotency key and is what Status is later queried by.
	ReqID string

	CustomerMobile     string
	RemitterName       string
	PaymentRefID       string
	PaymentMode        string
	PaymentAccountInfo string

	Ad1 string
	Ad2 string
	// Ad9 and Ad3 carry the card-linked mobile and bank code for credit cards.
	Ad9 string
	Ad3 string

	TransactionID *uuid.UUID
	RetailerID    *uuid.UUID
}

// PaymentResult is the payment outcome.
type PaymentResult struct {
	Outcome provider.Outcome

	Status        string
	TxID          string
	MobikwikStamp string
	OperatorRefNo string
	Balance       float64
	DiscountPrice float64

	Code    string
	Message string
	Raw     string
}

// Pay submits a recharge or bill payment.
//
// A transport timeout, a 5xx, or the documented inconclusive messages all yield
// OutcomePending rather than OutcomeFailed: the specification explicitly
// requires a status check in those cases, and treating them as failures would
// reverse a wallet hold for a payment that may have completed.
func (c *Client) Pay(ctx context.Context, req PaymentRequest) (*PaymentResult, error) {
	if err := requireAll(map[string]string{
		"cn":                 req.Connection,
		"op":                 req.OperatorID,
		"amt":                req.Amount,
		"reqid":              req.ReqID,
		"customerMobile":     req.CustomerMobile,
		"remitterName":       req.RemitterName,
		"paymentRefID":       req.PaymentRefID,
		"paymentMode":        req.PaymentMode,
		"paymentAccountInfo": req.PaymentAccountInfo,
		"agentId":            c.cfg.AgentID,
	}); err != nil {
		return nil, fmt.Errorf("bharatconnect: pay: %w", err)
	}
	if len(req.ReqID) > maxReqIDLength {
		return nil, fmt.Errorf("bharatconnect: pay: reqid %q is %d characters, max %d",
			req.ReqID, len(req.ReqID), maxReqIDLength)
	}

	payload, err := json.Marshal(paymentRequestPayload{
		CN:                 req.Connection,
		Op:                 req.OperatorID,
		Cir:                req.CircleID,
		Amt:                req.Amount,
		ReqID:              req.ReqID,
		CustomerMobile:     req.CustomerMobile,
		RemitterName:       req.RemitterName,
		PaymentRefID:       req.PaymentRefID,
		PaymentMode:        req.PaymentMode,
		AgentID:            c.cfg.AgentID,
		PaymentAccountInfo: req.PaymentAccountInfo,
		Ad1:                req.Ad1,
		Ad2:                req.Ad2,
		Ad9:                req.Ad9,
		Ad3:                req.Ad3,
	})
	if err != nil {
		return nil, fmt.Errorf("bharatconnect: marshal payment request: %w", err)
	}

	resp, err := c.call(ctx, callSpec{
		operation:     OpPayment,
		path:          c.paths.payment,
		payload:       payload,
		transactionID: req.TransactionID,
		retailerID:    req.RetailerID,
	})
	if err != nil {
		// The transport classified this. A timeout must surface as pending so the
		// reconciler picks it up rather than the hold being reversed.
		outcome := provider.OutcomeOf(err)
		if outcome == provider.OutcomeTimeout {
			outcome = provider.OutcomePending
		}
		return &PaymentResult{Outcome: outcome}, err
	}

	var parsed paymentEnvelope
	if err := json.Unmarshal(resp.body, &parsed); err != nil {
		// An undecodable response after the provider accepted the request is
		// inconclusive, not a failure.
		return &PaymentResult{Outcome: provider.OutcomePending},
			fmt.Errorf("bharatconnect: decode payment response: %w", err)
	}

	result := &PaymentResult{
		Status:        parsed.Data.Status,
		TxID:          firstNonEmpty(parsed.Data.TxID, req.ReqID),
		MobikwikStamp: parsed.Data.MobikwikStamp,
		OperatorRefNo: normaliseNull(parsed.Data.OpRefNo),
		Balance:       parsed.Data.Balance,
		DiscountPrice: parsed.Data.DiscountPrice,
		Raw:           string(resp.body),
	}
	result.Code, result.Message = messageOf(parsed.Message)

	if parsed.Success {
		switch parsed.Data.Status {
		case statusSuccess:
			result.Outcome = provider.OutcomeSuccess
		case statusSuccessPending:
			result.Outcome = provider.OutcomePending
		case statusRechargeFailure:
			result.Outcome = provider.OutcomeFailed
		default:
			// An unrecognised status resolves to pending: reconciling costs one
			// status call, whereas guessing "failed" risks a wrong reversal.
			result.Outcome = provider.OutcomePending
		}
		if result.Outcome == provider.OutcomeFailed {
			return result, &provider.APIError{
				Provider: providerName, Op: "payment", Status: resp.statusCode,
				Code:    firstNonEmpty(result.Code, parsed.Data.Status),
				Message: firstNonEmpty(result.Message, "payment failed"),
				Outcome: provider.OutcomeFailed,
			}
		}
		return result, nil
	}

	// success=false. Decide whether this is terminal or inconclusive.
	result.Outcome = classifyPaymentFailure(result.Code, result.Message, resp.outcome)

	apiErr := &provider.APIError{
		Provider: providerName, Op: "payment", Status: resp.statusCode,
		Code:    result.Code,
		Message: firstNonEmpty(result.Message, "payment rejected"),
		Outcome: result.Outcome,
	}
	return result, apiErr
}

// classifyPaymentFailure decides whether a payment rejection is terminal.
//
// The specification names two response texts that look like failures but
// explicitly require a status check, and a 5xx never carries a trustworthy
// verdict. Everything else with an explicit non-500 code is a genuine rejection.
func classifyPaymentFailure(code, text string, transport provider.Outcome) provider.Outcome {
	if transport == provider.OutcomeTimeout {
		return provider.OutcomePending
	}

	lowered := strings.ToLower(strings.TrimSpace(text))
	for _, marker := range inconclusivePaymentTexts {
		if strings.Contains(lowered, strings.ToLower(marker)) {
			return provider.OutcomePending
		}
	}

	switch code {
	case codeSystemError, codeInternalError:
		// The generic 500 on the payment endpoint is the documented
		// status-check-required case.
		return provider.OutcomePending
	case codeTokenRejected:
		return provider.OutcomeAuthExpired
	case codeEncryptionRejected, codeBadCredentials:
		// A malformed or unauthenticated request never reached the biller.
		return provider.OutcomeFailed
	case "":
		return provider.OutcomePending
	default:
		return provider.OutcomeFailed
	}
}

// =============================================================================
// Status check — POST /recharge/v3/retailerStatus
// =============================================================================

// StatusRequest polls a transaction's outcome.
type StatusRequest struct {
	// TxID is the reqid used at payment time, or the mobikwikstamp.
	TxID    string
	Attempt int

	TransactionID *uuid.UUID
	RetailerID    *uuid.UUID
}

// StatusResult is the status-check outcome.
type StatusResult struct {
	Outcome provider.Outcome

	TxID          string
	Status        string
	Description   string
	Balance       float64
	MobikwikStamp string
	OperatorRefNo string

	Code    string
	Message string
	Raw     string
}

// Status polls the provider for a transaction's current state.
func (c *Client) Status(ctx context.Context, req StatusRequest) (*StatusResult, error) {
	if strings.TrimSpace(req.TxID) == "" {
		return nil, errors.New("bharatconnect: status: txId is required")
	}

	payload, err := json.Marshal(statusRequestPayload{TxID: req.TxID})
	if err != nil {
		return nil, fmt.Errorf("bharatconnect: marshal status request: %w", err)
	}

	resp, err := c.call(ctx, callSpec{
		operation:     OpStatus,
		path:          c.paths.status,
		payload:       payload,
		attempt:       req.Attempt,
		transactionID: req.TransactionID,
		retailerID:    req.RetailerID,
	})
	if err != nil {
		outcome := provider.OutcomeOf(err)
		if outcome == provider.OutcomeTimeout {
			outcome = provider.OutcomePending
		}
		return &StatusResult{Outcome: outcome}, err
	}

	var parsed statusEnvelope
	if err := json.Unmarshal(resp.body, &parsed); err != nil {
		return &StatusResult{Outcome: provider.OutcomePending},
			fmt.Errorf("bharatconnect: decode status response: %w", err)
	}

	result := &StatusResult{
		TxID:          firstNonEmpty(parsed.Data.TxID, req.TxID),
		Status:        parsed.resolvedStatus(),
		Description:   firstNonEmpty(parsed.Data.Description, parsed.Data.StatusDetails),
		Balance:       parsed.Data.Balance,
		MobikwikStamp: parsed.resolvedStamp(),
		OperatorRefNo: normaliseNull(parsed.resolvedOperatorRef()),
		Raw:           string(resp.body),
	}
	result.Code, result.Message = messageOf(parsed.Message)

	if !parsed.Success {
		// "Invalid transaction ID!" means the provider never registered the
		// transaction. The spec says that, combined with a debit at our end,
		// permits marking it failed — so it is terminal.
		if strings.Contains(strings.ToLower(result.Message), "invalid transaction id") {
			result.Outcome = provider.OutcomeFailed
			return result, nil
		}
		if result.Code == codeTokenRejected {
			result.Outcome = provider.OutcomeAuthExpired
			return result, &provider.APIError{
				Provider: providerName, Op: "status", Status: resp.statusCode,
				Code: result.Code, Message: result.Message, Outcome: provider.OutcomeAuthExpired,
			}
		}
		// Any other status-check failure leaves the transaction unresolved.
		result.Outcome = provider.OutcomePending
		return result, nil
	}

	switch result.Status {
	case statusRechargeSuccess, statusSuccess:
		result.Outcome = provider.OutcomeSuccess
	case statusRechargeSuccessPending, statusSuccessPending:
		result.Outcome = provider.OutcomePending
	case statusRechargeFailure:
		result.Outcome = provider.OutcomeFailed
	default:
		result.Outcome = provider.OutcomePending
	}
	return result, nil
}

// =============================================================================
// Credit card bill fetch — POST /recharge/v3/retailerCCBill
// =============================================================================

// CreditCardBillRequest fetches a credit-card statement.
type CreditCardBillRequest struct {
	Last4    string
	Mobile   string
	BankCode string

	RetailerID *uuid.UUID
}

// CreditCardBill is a fetched credit-card statement.
type CreditCardBill struct {
	StatementDate    string
	DueDate          string
	DueAmount        float64
	MinimumAmountDue float64
	Raw              string
}

// CreditCardBill fetches a credit-card bill.
func (c *Client) CreditCardBill(ctx context.Context, req CreditCardBillRequest) (*CreditCardBill, error) {
	if err := requireAll(map[string]string{
		"last4":    req.Last4,
		"mobile":   req.Mobile,
		"bankCode": req.BankCode,
		"agentId":  c.cfg.AgentID,
	}); err != nil {
		return nil, fmt.Errorf("bharatconnect: credit card bill: %w", err)
	}

	payload, err := json.Marshal(ccBillRequestPayload{
		Last4:    req.Last4,
		Mobile:   req.Mobile,
		AgentID:  c.cfg.AgentID,
		BankCode: req.BankCode,
	})
	if err != nil {
		return nil, fmt.Errorf("bharatconnect: marshal cc bill request: %w", err)
	}

	resp, err := c.call(ctx, callSpec{
		operation:  OpCCBill,
		path:       c.paths.creditCardBill,
		payload:    payload,
		retailerID: req.RetailerID,
	})
	if err != nil {
		return nil, err
	}

	var parsed ccBillEnvelope
	if err := json.Unmarshal(resp.body, &parsed); err != nil {
		return nil, fmt.Errorf("bharatconnect: decode cc bill response: %w", err)
	}
	if !parsed.Success {
		return nil, c.businessError("cc_bill", resp, parsed.Message)
	}

	return &CreditCardBill{
		StatementDate:    parsed.Data.StatementDate,
		DueDate:          parsed.Data.DueDate,
		DueAmount:        parsed.Data.DueAmount,
		MinimumAmountDue: parsed.Data.MinimumAmountDue,
		Raw:              string(resp.body),
	}, nil
}

// =============================================================================
// Plan fetching — GET /recharge/v1/rechargePlansAPI/<opId>/<cirId>[/<planType>]
// =============================================================================

// PlansRequest fetches recharge plans. PlanType is optional.
type PlansRequest struct {
	OperatorID string
	CircleID   string
	PlanType   string

	RetailerID *uuid.UUID
}

// Plan is one recharge plan.
type Plan struct {
	ID              string  `json:"id"`
	OperatorID      int     `json:"operatorId"`
	CircleID        int     `json:"circleId"`
	PlanType        int     `json:"planType"`
	PlanCode        string  `json:"planCode"`
	Amount          float64 `json:"amount"`
	Talktime        float64 `json:"talktime"`
	Validity        string  `json:"validity"`
	PlanName        string  `json:"planName"`
	PlanDescription string  `json:"planDescription"`
	DataBenefit     string  `json:"dataBenefit"`
	ValidityInDays  int     `json:"validityInDays"`
}

type plansEnvelope struct {
	Success bool        `json:"success"`
	Message *apiMessage `json:"message,omitempty"`
	Data    struct {
		Plans []Plan `json:"plans"`
	} `json:"data"`
}

// Plans fetches available recharge plans for an operator and circle.
//
// This endpoint is a plain GET with no encrypted body, and requires the
// X-MClient header.
func (c *Client) Plans(ctx context.Context, req PlansRequest) ([]Plan, error) {
	if !c.cfg.Enabled {
		return nil, fmt.Errorf("bharatconnect: %w", provider.ErrIntegrationDisabled)
	}
	if err := requireAll(map[string]string{
		"opId":  req.OperatorID,
		"cirId": req.CircleID,
	}); err != nil {
		return nil, fmt.Errorf("bharatconnect: plans: %w", err)
	}

	path := c.paths.plans + "/" + req.OperatorID + "/" + req.CircleID
	if req.PlanType != "" {
		path += "/" + req.PlanType
	}

	token, err := c.tokens.Token(ctx)
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(ctx, provider.Request{
		Method: http.MethodGet,
		URL:    c.endpoint(path),
		Headers: map[string]string{
			"Content-Type":  "application/json",
			"Accept":        "application/json",
			"Authorization": token,
			xMClientHeader:  xMClientValue,
		},
		Operation:  OpPlans,
		RetailerID: req.RetailerID,
	})
	if err != nil {
		return nil, err
	}

	var parsed plansEnvelope
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		return nil, fmt.Errorf("bharatconnect: decode plans response: %w", err)
	}
	if !parsed.Success {
		code, text := messageOf(parsed.Message)
		return nil, &provider.APIError{
			Provider: providerName, Op: "plans", Status: resp.StatusCode,
			Code: code, Message: firstNonEmpty(text, "plans unavailable"),
			Outcome: provider.OutcomeFailed,
		}
	}
	return parsed.Data.Plans, nil
}

// =============================================================================
// shared call path
// =============================================================================

type callSpec struct {
	operation     string
	path          string
	payload       []byte
	attempt       int
	transactionID *uuid.UUID
	retailerID    *uuid.UUID
}

// rawResponse is the decoded transport result handed to each parser.
type rawResponse struct {
	body       []byte
	statusCode int
	outcome    provider.Outcome
}

// call performs an authenticated request, refreshing the token once on
// rejection.
//
// One retry is the right bound: a second consecutive token rejection indicates a
// credential fault rather than an expiry, and further retries would consume the
// provider's 100-tokens-per-day quota against a permanent failure.
func (c *Client) call(ctx context.Context, spec callSpec) (*rawResponse, error) {
	resp, err := c.callOnce(ctx, spec)

	// A rejected token is recoverable exactly once, and it can arrive two ways:
	// as a genuine HTTP 401, which callOnce converts into an error, or as HTTP 200
	// carrying code "401" in the body, which is what this provider actually does
	// per the Balance Check failure example. The body form leaves err nil, so
	// checking only the error would silently skip the refresh and surface an
	// auth failure to the caller.
	if !provider.IsAuthExpired(err) && !c.tokenRejected(resp) {
		return resp, err
	}

	if invErr := c.tokens.Invalidate(ctx); invErr != nil {
		return resp, fmt.Errorf("bharatconnect: invalidate token: %w", invErr)
	}
	if spec.attempt <= 0 {
		spec.attempt = 1
	}
	spec.attempt++
	return c.callOnce(ctx, spec)
}

// tokenRejected reports whether a decoded body carries the documented 401 code.
func (c *Client) tokenRejected(resp *rawResponse) bool {
	if resp == nil || len(resp.body) == 0 {
		return false
	}
	var probe struct {
		Success bool        `json:"success"`
		Message *apiMessage `json:"message"`
	}
	if err := json.Unmarshal(resp.body, &probe); err != nil {
		return false
	}
	return !probe.Success && probe.Message != nil && probe.Message.Code == codeTokenRejected
}

func (c *Client) callOnce(ctx context.Context, spec callSpec) (*rawResponse, error) {
	if !c.cfg.Enabled {
		return nil, fmt.Errorf("bharatconnect: %w", provider.ErrIntegrationDisabled)
	}

	token, err := c.tokens.Token(ctx)
	if err != nil {
		return nil, err
	}

	attempt := spec.attempt
	if attempt <= 0 {
		attempt = 1
	}

	req := provider.Request{
		Method: http.MethodPost,
		URL:    c.endpoint(spec.path),
		Headers: map[string]string{
			"Content-Type": "application/json",
			"Accept":       "application/json",
			// The provider expects the bare token with no "Bearer " prefix.
			"Authorization": token,
		},
		Operation:        spec.operation,
		Attempt:          attempt,
		RequestPlaintext: string(spec.payload),
		TransactionID:    spec.transactionID,
		RetailerID:       spec.retailerID,
	}

	if c.sealed[spec.path] {
		trace, sErr := c.sealer.Seal(spec.payload)
		if sErr != nil {
			return nil, sErr
		}
		body, mErr := json.Marshal(trace.Envelope)
		if mErr != nil {
			return nil, fmt.Errorf("bharatconnect: marshal envelope: %w", mErr)
		}
		req.Body = body
		req.EncryptedSessionKey = trace.Envelope.EncryptedSessionKey
		req.EncryptedPayload = trace.Envelope.EncryptedPayload
		req.KeyVersion = trace.Envelope.KeyVersion
		req.IV = trace.Envelope.IV
		req.SessionKeyBase64 = trace.SessionKeyBase64

		// UAT logging: capture both encrypted envelope AND decrypted payload
		if c.uatLogger != nil {
			c.uatLogger.Info("UAT REQUEST",
				slog.String("operation", spec.operation),
				slog.String("url", c.endpoint(spec.path)),
				slog.Group("encrypted",
					slog.String("encryptedSessionKey", trace.Envelope.EncryptedSessionKey),
					slog.String("encryptedPayload", trace.Envelope.EncryptedPayload),
					slog.String("keyVersion", trace.Envelope.KeyVersion),
					slog.String("iv", trace.Envelope.IV),
				),
				slog.Group("decrypted",
					slog.String("sessionKey", trace.SessionKeyBase64),
					slog.String("payload", string(trace.PlaintextPayload)),
				),
			)
		}
	} else {
		req.Body = spec.payload
	}

	resp, err := c.http.Do(ctx, req)
	if err != nil {
		out := &rawResponse{outcome: provider.OutcomeTimeout}
		if resp != nil {
			out.statusCode = resp.StatusCode
			out.outcome = resp.Outcome
		}
		// UAT logging: capture failures
		if c.uatLogger != nil {
			c.uatLogger.Info("UAT RESPONSE FAILURE",
				slog.String("operation", spec.operation),
				slog.Int("statusCode", out.statusCode),
				slog.String("outcome", string(out.outcome)),
				slog.String("error", err.Error()),
			)
		}
		return out, err
	}

	out := &rawResponse{
		body:       resp.Body,
		statusCode: resp.StatusCode,
		outcome:    resp.Outcome,
	}

	// UAT logging: capture response (always plaintext from provider)
	if c.uatLogger != nil {
		c.uatLogger.Info("UAT RESPONSE SUCCESS",
			slog.String("operation", spec.operation),
			slog.Int("statusCode", out.statusCode),
			slog.String("outcome", string(out.outcome)),
			slog.String("responseBody", string(out.body)),
		)
	}

	if resp.Outcome == provider.OutcomeAuthExpired {
		return out, &provider.APIError{
			Provider: providerName, Op: spec.operation, Status: resp.StatusCode,
			Message: "token rejected by provider", Outcome: provider.OutcomeAuthExpired,
		}
	}
	return out, nil
}

// businessError builds an APIError for a success=false response on an endpoint
// that has no money at stake.
func (c *Client) businessError(op string, resp *rawResponse, msg *apiMessage) error {
	code, text := messageOf(msg)

	outcome := provider.OutcomeFailed
	if code == codeTokenRejected {
		outcome = provider.OutcomeAuthExpired
	}

	return &provider.APIError{
		Provider: providerName,
		Op:       op,
		Status:   resp.statusCode,
		Code:     code,
		Message:  firstNonEmpty(text, "request rejected"),
		Outcome:  outcome,
	}
}

// =============================================================================
// helpers
// =============================================================================

func (c *Client) endpoint(path string) string {
	return strings.TrimRight(c.cfg.BaseURL, "/") + path
}

func messageOf(m *apiMessage) (code, text string) {
	if m == nil {
		return "", ""
	}
	return m.Code, m.Text
}

// requireAll reports the first missing mandatory field, naming it as the
// provider does so an error is actionable against the spec.
func requireAll(fields map[string]string) error {
	var missing []string
	for name, value := range fields {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	// Sorted so the message is stable across runs.
	for i := 0; i < len(missing); i++ {
		for j := i + 1; j < len(missing); j++ {
			if missing[j] < missing[i] {
				missing[i], missing[j] = missing[j], missing[i]
			}
		}
	}
	// Wrapping ErrInvalidRequest lets the caller distinguish "your input was
	// incomplete" from "the provider is unreachable". Without it, a missing field
	// surfaces to the user as a service outage.
	return fmt.Errorf("%w: missing mandatory field(s): %s", ErrInvalidRequest, strings.Join(missing, ", "))
}

// orEmptyMap returns an empty map rather than nil, since the spec requires
// "empty map JSON if none" and a nil map would marshal to null.
func orEmptyMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	return m
}

// normaliseNull collapses the provider's literal "null" strings to empty.
//
// Several fields are documented with the value "null" as a string rather than a
// JSON null, which would otherwise be stored and displayed verbatim.
func normaliseNull(s string) string {
	if strings.EqualFold(strings.TrimSpace(s), "null") {
		return ""
	}
	return s
}

func redact(body, secret string) string {
	if secret == "" {
		return body
	}
	return strings.ReplaceAll(body, secret, "***REDACTED***")
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// FormatAmount renders a rupee amount the way the provider expects: a plain
// decimal string with no separators or currency symbol.
func FormatAmount(rupees float64) string {
	return strconv.FormatFloat(rupees, 'f', -1, 64)
}

// NewReqID builds a provider transaction reference.
//
// The spec caps reqid at 20 characters and asks for a caller-specific prefix, so
// the prefix is preserved and the random tail is trimmed to fit rather than the
// whole value being truncated.
func NewReqID(prefix string) string {
	prefix = strings.TrimSpace(prefix)
	if len(prefix) > maxReqIDLength-6 {
		prefix = prefix[:maxReqIDLength-6]
	}
	tail := strings.ReplaceAll(uuid.NewString(), "-", "")
	room := maxReqIDLength - len(prefix)
	if room > len(tail) {
		room = len(tail)
	}
	return prefix + tail[:room]
}
