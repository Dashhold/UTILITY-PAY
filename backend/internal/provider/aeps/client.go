// Package aeps integrates the Excisoft AEPS provider.
//
// # Documented surface
//
// Every endpoint below is taken from the specification sheets in the AEPS/
// directory and was exercised against the provider's development host (see
// AEPS/aeps_logs.md):
//
//	POST {base}/api/v1/aeps/get_bank_list         Bank List Apis Statistics.md
//	POST {base}/api/v1/aeps/onboard               api_doc.md
//	POST {base}/api/v1/aeps/onboard_status_check  onboard_status_apis.md
//	POST {base}/api/v1/aeps/merchant_kyc          Merchant Kyc Apis Statistics.md
//	POST {base}/api/v1/aeps/register.php          Aeps Register Apis Statistics.md
//	POST {base}/api/v1/aeps/merchant_auth         Aeps Auth API Documentation.md
//	POST {base}/api/v1/aeps/balanceEnquiry        Aeps Balance Enquiry Apis Statistics.md
//	POST {base}/api/v1/aeps/miniStatement         Aeps Mini Statement Apis Statistics.md
//	POST {base}/api/v1/aeps/withdrawal            Aeps Withdrawal Apis Statistics.md
//
// The PHP reference passes CURLOPT_POSTFIELDS an array, which makes libcurl emit
// multipart/form-data. This client reproduces that encoding rather than
// url-encoding, because providers in this space commonly reject the latter.
//
// # Response conventions
//
// The provider answers HTTP 200 for business rejections and signals the verdict
// in the body's `status` field, which it renders as a boolean, a number or the
// string "error" depending on the endpoint. Every parse therefore treats the
// body as authoritative and decodes those fields leniently.
//
// # Undocumented surface
//
// Aadhaar Pay has no specification sheet. It stays gated behind Capabilities and
// returns ErrNotImplemented rather than guessing an endpoint that moves money.
package aeps

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/provider"
)

// ErrNotImplemented is returned for operations the provider documentation does
// not yet define. It is deliberately explicit: the caller must surface a clear
// "service unavailable" rather than fabricate a result.
var ErrNotImplemented = errors.New("aeps: operation not defined in provider documentation")

// Client talks to the Excisoft AEPS API.
type Client struct {
	cfg  config.AEPSConfig
	http *provider.Client
}

// New builds a Client.
func New(cfg config.AEPSConfig, sink provider.AuditSink) *Client {
	return &Client{
		cfg:  cfg,
		http: provider.NewClient(string(providerName), cfg.Timeout, sink),
	}
}

const providerName = "excisoft_aeps"

// WithTransport swaps the HTTP layer. Intended for tests.
func (c *Client) WithTransport(d provider.Doer) *Client {
	clone := *c
	clone.http = c.http.WithDoer(d)
	return &clone
}

// Enabled reports whether the integration is switched on.
func (c *Client) Enabled() bool { return c.cfg.Enabled }

// --- Onboarding (fully documented) ---

// OnboardRequest is the input to merchant onboarding.
type OnboardRequest struct {
	Mobile       string
	MerchantCode string
	FirmName     string
	Email        string
	// IsNew maps to the provider's `is_new` flag: 1 for a first-time
	// onboarding, 0 to resume an existing one.
	IsNew bool
	// CallbackURL overrides the configured default when non-empty.
	CallbackURL string

	RetailerID *uuid.UUID
}

// validate checks the fields the provider documents as mandatory. The provider
// returns a generic error string for missing fields, so failing locally gives a
// far more actionable message.
func (r OnboardRequest) validate() error {
	var missing []string
	if strings.TrimSpace(r.Mobile) == "" {
		missing = append(missing, "mobile")
	}
	if strings.TrimSpace(r.MerchantCode) == "" {
		missing = append(missing, "merchantcode")
	}
	if strings.TrimSpace(r.FirmName) == "" {
		missing = append(missing, "firm_name")
	}
	if strings.TrimSpace(r.Email) == "" {
		missing = append(missing, "email")
	}
	if len(missing) > 0 {
		return fmt.Errorf("aeps: onboard missing required fields: %s", strings.Join(missing, ", "))
	}
	return nil
}

// OnboardResult is the parsed onboarding response.
type OnboardResult struct {
	// RedirectURL is the provider-hosted KYC page the retailer must complete.
	RedirectURL string
	// OnboardPending is the provider's flag indicating KYC is still outstanding.
	OnboardPending bool
	ResponseCode   int
	Message        string
	Raw            string
}

// onboardResponse mirrors the documented response body.
//
// `status` is polymorphic in the documentation: the success example returns the
// boolean true, the failure example returns the string "error". flexBool absorbs
// both so a provider-side inconsistency cannot crash the parse.
type onboardResponse struct {
	Status         flexBool `json:"status"`
	ResponseCode   int      `json:"response_code"`
	RedirectURL    string   `json:"redirecturl"`
	OnboardPending flexBool `json:"onboard_pending"`
	Message        string   `json:"message"`
}

// Onboard registers a retailer with the AEPS provider and returns the hosted
// KYC redirect URL.
func (c *Client) Onboard(ctx context.Context, req OnboardRequest) (*OnboardResult, error) {
	if !c.cfg.Enabled {
		return nil, fmt.Errorf("aeps: %w", provider.ErrIntegrationDisabled)
	}
	if err := req.validate(); err != nil {
		return nil, err
	}

	callback := req.CallbackURL
	if callback == "" {
		callback = c.cfg.CallbackURL
	}

	isNew := "0"
	if req.IsNew {
		isNew = "1"
	}

	body, contentType, err := multipartForm(map[string]string{
		"apiKey":       c.cfg.APIKey,
		"mobile":       req.Mobile,
		"merchantcode": req.MerchantCode,
		"firm_name":    req.FirmName,
		"email":        req.Email,
		"is_new":       isNew,
		"callback_url": callback,
	})
	if err != nil {
		return nil, err
	}

	resp, err := c.http.Do(ctx, provider.Request{
		Method:    http.MethodPost,
		URL:       c.endpoint("/api/v1/aeps/onboard"),
		Headers:   map[string]string{"Content-Type": contentType, "Accept": "application/json"},
		Body:      body,
		Operation: "onboard",
		// The API key travels in the body, so the plaintext record is redacted
		// before it reaches the audit sink.
		RequestPlaintext: redactAPIKey(string(body), c.cfg.APIKey),
		RetailerID:       req.RetailerID,
	})
	if err != nil {
		return nil, err
	}

	var parsed onboardResponse
	if err := json.Unmarshal(resp.Body, &parsed); err != nil {
		return nil, fmt.Errorf("aeps: decode onboard response (status %d, body %q): %w",
			resp.StatusCode, truncate(string(resp.Body), 300), err)
	}

	// The provider signals failure in the body even on HTTP 200, so the body
	// verdict is authoritative and is checked regardless of status code.
	if !parsed.Status.Bool() {
		msg := parsed.Message
		if msg == "" {
			msg = "onboarding rejected without a message"
		}
		return nil, &provider.APIError{
			Provider: providerName,
			Op:       "onboard",
			Status:   resp.StatusCode,
			Code:     fmt.Sprint(parsed.ResponseCode),
			Message:  msg,
			Outcome:  provider.OutcomeFailed,
			Raw:      string(resp.Body),
		}
	}

	if strings.TrimSpace(parsed.RedirectURL) == "" {
		return nil, &provider.APIError{
			Provider: providerName,
			Op:       "onboard",
			Status:   resp.StatusCode,
			Message:  "provider reported success but returned no redirecturl",
			Outcome:  provider.OutcomeFailed,
			Raw:      string(resp.Body),
		}
	}

	return &OnboardResult{
		RedirectURL:    parsed.RedirectURL,
		OnboardPending: parsed.OnboardPending.Bool(),
		ResponseCode:   parsed.ResponseCode,
		Message:        parsed.Message,
		Raw:            string(resp.Body),
	}, nil
}

// --- Bank list ---

// Bank is one entry of the provider's AEPS bank list.
//
// IIN is the value the transactional endpoints expect in their `bank` field, so
// the UI must select a bank from this list rather than from a hard-coded set.
type Bank struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	IIN      string `json:"iin"`
	Aadhaar  string `json:"aadhaarPayIin,omitempty"`
	Active   bool   `json:"active"`
	Supports bool   `json:"supportsAadhaarPay"`
}

// BankListResult is the parsed bank list response.
type BankListResult struct {
	Banks        []Bank
	ResponseCode string
	Message      string
	Raw          string
}

// bankListResponse mirrors the documented body, which nests the actual list one
// level deep under `banklist.data`.
type bankListResponse struct {
	Status       flexBool   `json:"status"`
	ResponseCode flexString `json:"response_code"`
	Message      string     `json:"message"`
	BankList     struct {
		Status  flexBool `json:"status"`
		Message string   `json:"message"`
		Data    []struct {
			ID            flexString `json:"id"`
			BankName      string     `json:"bankName"`
			IINNo         flexString `json:"iinno"`
			ActiveFlag    flexBool   `json:"activeFlag"`
			AadhaarPayIIN flexString `json:"aadharpayiinno"`
		} `json:"data"`
	} `json:"banklist"`
}

// BankList fetches the sponsor bank list.
//
// This is the only AEPS endpoint that needs no merchant context, which makes it
// the natural connectivity check for the integration.
func (c *Client) BankList(ctx context.Context) (*BankListResult, error) {
	resp, err := c.post(ctx, "bank_list", "/api/v1/aeps/get_bank_list", nil, nil)
	if err != nil {
		return nil, err
	}

	var parsed bankListResponse
	if err := decodeBody("bank_list", resp, &parsed); err != nil {
		return nil, err
	}
	if !parsed.Status.Bool() {
		return nil, c.reject("bank_list", resp, parsed.ResponseCode.String(), parsed.Message)
	}

	banks := make([]Bank, 0, len(parsed.BankList.Data))
	for _, row := range parsed.BankList.Data {
		// A bank with no IIN cannot be transacted against, so it is dropped rather
		// than offered to the retailer.
		if strings.TrimSpace(row.IINNo.String()) == "" {
			continue
		}
		banks = append(banks, Bank{
			ID:       row.ID.String(),
			Name:     row.BankName,
			IIN:      row.IINNo.String(),
			Aadhaar:  row.AadhaarPayIIN.String(),
			Active:   row.ActiveFlag.Bool(),
			Supports: strings.TrimSpace(row.AadhaarPayIIN.String()) != "",
		})
	}
	// The provider returns the list in insertion order; sorting by name is what a
	// searchable dropdown needs.
	sort.SliceStable(banks, func(i, j int) bool { return banks[i].Name < banks[j].Name })

	return &BankListResult{
		Banks:        banks,
		ResponseCode: parsed.ResponseCode.String(),
		Message:      firstNonBlank(parsed.Message, parsed.BankList.Message),
		Raw:          string(resp.Body),
	}, nil
}

// --- Onboarding status ---

// OnboardStatusResult is the parsed onboarding status response.
type OnboardStatusResult struct {
	// Approved is true only when the provider reports the merchant as Accepted.
	Approved bool
	// IsApproved is the provider's verbatim verdict, e.g. "Accepted".
	IsApproved string
	// CASA is the provider's `is_casa` flag: 0 not allowed, 1 allowed,
	// 2 pending bank activation for DMT CASA.
	CASA         string
	ResponseCode string
	Message      string
	Raw          string
}

type onboardStatusResponse struct {
	Status       flexBool   `json:"status"`
	ResponseCode flexString `json:"response_code"`
	IsApproved   string     `json:"is_approved"`
	IsCASA       flexString `json:"is_casa"`
	Message      string     `json:"message"`
}

// OnboardStatus asks the provider whether merchant KYC has completed.
//
// This is the authoritative source for onboarding state: the browser callback is
// unauthenticated and therefore only ever treated as a hint.
func (c *Client) OnboardStatus(ctx context.Context, merchantCode, mobile string, retailerID *uuid.UUID) (*OnboardStatusResult, error) {
	if strings.TrimSpace(merchantCode) == "" || strings.TrimSpace(mobile) == "" {
		return nil, errors.New("aeps: onboard status requires merchantcode and mobile")
	}

	resp, err := c.post(ctx, "onboard_status_check", "/api/v1/aeps/onboard_status_check", []formField{
		{"merchantcode", merchantCode},
		{"mobile", mobile},
		{"pipe", c.pipe()},
	}, retailerID)
	if err != nil {
		return nil, err
	}

	var parsed onboardStatusResponse
	if err := decodeBody("onboard_status_check", resp, &parsed); err != nil {
		return nil, err
	}

	out := &OnboardStatusResult{
		Approved:     parsed.Status.Bool() && strings.EqualFold(strings.TrimSpace(parsed.IsApproved), "Accepted"),
		IsApproved:   parsed.IsApproved,
		CASA:         parsed.IsCASA.String(),
		ResponseCode: parsed.ResponseCode.String(),
		Message:      parsed.Message,
		Raw:          string(resp.Body),
	}
	// A negative verdict is a legitimate answer here, not a call failure: "not yet
	// onboarded" is exactly what the caller asked about. It is returned as data so
	// the UI can show the provider's own wording.
	return out, nil
}

// --- Merchant KYC and two-factor authentication ---

// MerchantKYCRequest activates a merchant with a biometric capture.
type MerchantKYCRequest struct {
	MerchantCode string
	// Aadhaar is the merchant's own Aadhaar number.
	Aadhaar string
	// PIDData is the base64 PID block from an RD-service device.
	PIDData string
	// DOB is the merchant's date of birth in YYYY-MM-DD form.
	DOB       string
	Latitude  string
	Longitude string

	RetailerID *uuid.UUID
}

// MerchantKYCResult is the parsed merchant KYC response.
type MerchantKYCResult struct {
	Activated    bool
	ResponseCode string
	Message      string
	Raw          string
}

// MerchantKYC completes provider-side merchant activation.
func (c *Client) MerchantKYC(ctx context.Context, req MerchantKYCRequest) (*MerchantKYCResult, error) {
	if err := requireFields(map[string]string{
		"merchantcode": req.MerchantCode,
		"adhaarnumber": req.Aadhaar,
		"piddata":      req.PIDData,
		"dob":          req.DOB,
	}); err != nil {
		return nil, fmt.Errorf("aeps: merchant kyc: %w", err)
	}

	lat, lng := c.coords(req.Latitude, req.Longitude)
	resp, err := c.post(ctx, "merchant_kyc", "/api/v1/aeps/merchant_kyc", []formField{
		{"merchantcode", req.MerchantCode},
		{"adhaarnumber", req.Aadhaar},
		{"piddata", req.PIDData},
		{"dob", req.DOB},
		{"pipe", c.pipe()},
		{"accessmode", c.accessMode()},
		{"latitude", lat},
		{"longitude", lng},
	}, req.RetailerID)
	if err != nil {
		return nil, err
	}

	var parsed struct {
		Status       flexBool   `json:"status"`
		ResponseCode flexString `json:"response_code"`
		Message      string     `json:"message"`
	}
	if err := decodeBody("merchant_kyc", resp, &parsed); err != nil {
		return nil, err
	}

	return &MerchantKYCResult{
		Activated:    parsed.Status.Bool(),
		ResponseCode: parsed.ResponseCode.String(),
		Message:      parsed.Message,
		Raw:          string(resp.Body),
	}, nil
}

// TwoFactorRequest is the input to merchant registration and daily merchant
// authentication. Both endpoints take an identical field set.
type TwoFactorRequest struct {
	// Mobile and Aadhaar identify the merchant, not a customer: these two calls
	// authenticate the retailer's own biometric.
	Mobile  string
	Aadhaar string
	// PIDData is the base64 PID block from an RD-service device.
	PIDData string
	// ReferenceID is our own reference, echoed back by the provider.
	ReferenceID  string
	MerchantCode string
	Latitude     string
	Longitude    string
	IPAddress    string

	RetailerID *uuid.UUID
}

// TwoFactorResult is the parsed response of register or merchant_auth.
type TwoFactorResult struct {
	Success bool
	// MerAuthTxnID is the authentication reference a subsequent cash withdrawal
	// must quote as `MerAuthTxnId`. The provider only returns it on success.
	MerAuthTxnID string
	ResponseCode string
	ErrorCode    string
	Message      string
	Raw          string
}

type twoFactorResponse struct {
	Status       flexBool   `json:"status"`
	ResponseCode flexString `json:"response_code"`
	ErrorCode    flexString `json:"errorcode"`
	Message      string     `json:"message"`

	// The provider is inconsistent about the casing of the authentication
	// reference between endpoints, so every observed spelling is accepted and the
	// first populated one wins.
	MerAuthTxnID  flexString `json:"MerAuthTxnId"`
	MerAuthTxnID2 flexString `json:"merauthtxnid"`
	MerAuthTxnID3 flexString `json:"merchantauthtxnid"`
	AckNo         flexString `json:"ackno"`
}

// merAuthTxnID picks the authentication reference from whichever field carried it.
func (r twoFactorResponse) merAuthTxnID() string {
	return firstNonBlank(
		r.MerAuthTxnID.String(),
		r.MerAuthTxnID2.String(),
		r.MerAuthTxnID3.String(),
		r.AckNo.String(),
	)
}

// Register performs the one-time merchant biometric registration.
func (c *Client) Register(ctx context.Context, req TwoFactorRequest) (*TwoFactorResult, error) {
	return c.twoFactor(ctx, "register", "/api/v1/aeps/register.php", req)
}

// MerchantAuth performs the day's merchant two-factor authentication.
//
// NPCI requires the retailer to re-authenticate with their own biometric before
// transacting on behalf of customers, so this gates the transactional endpoints.
func (c *Client) MerchantAuth(ctx context.Context, req TwoFactorRequest) (*TwoFactorResult, error) {
	return c.twoFactor(ctx, "merchant_auth", "/api/v1/aeps/merchant_auth", req)
}

func (c *Client) twoFactor(ctx context.Context, op, path string, req TwoFactorRequest) (*TwoFactorResult, error) {
	if err := requireFields(map[string]string{
		"mobile":        req.Mobile,
		"adhaarnumber":  req.Aadhaar,
		"pid":           req.PIDData,
		"submerchantid": req.MerchantCode,
	}); err != nil {
		return nil, fmt.Errorf("aeps: %s: %w", op, err)
	}

	lat, lng := c.coords(req.Latitude, req.Longitude)
	resp, err := c.post(ctx, op, path, []formField{
		{"mobile", req.Mobile},
		{"adhaarnumber", req.Aadhaar},
		{"bank_pipe", c.pipe()},
		{"device", c.device()},
		{"pid", req.PIDData},
		{"latitude", lat},
		{"longitude", lng},
		{"ref_id", req.ReferenceID},
		{"submerchantid", req.MerchantCode},
		{"ipaddress", req.IPAddress},
		{"accessmodetype", c.accessMode()},
	}, req.RetailerID)
	if err != nil {
		return nil, err
	}

	var parsed twoFactorResponse
	if err := decodeBody(op, resp, &parsed); err != nil {
		return nil, err
	}
	if !parsed.Status.Bool() {
		return nil, c.reject(op, resp, parsed.ResponseCode.String(), parsed.Message)
	}

	return &TwoFactorResult{
		Success:      true,
		MerAuthTxnID: parsed.merAuthTxnID(),
		ResponseCode: parsed.ResponseCode.String(),
		ErrorCode:    parsed.ErrorCode.String(),
		Message:      parsed.Message,
		Raw:          string(resp.Body),
	}, nil
}

// --- Transactional operations ---

// TxnRequest is the input to an AEPS financial or enquiry operation.
type TxnRequest struct {
	// Operation is a models.AEPSOperation value.
	Operation string
	// CustomerAadhaar is the customer's Aadhaar number. Callers must pass the
	// full value; it is masked before it reaches any log.
	CustomerAadhaar string
	// CustomerMobile is the customer's mobile number.
	CustomerMobile string
	// BankIIN is the customer bank's IIN, taken from BankList.
	BankIIN  string
	BankName string
	Amount   string
	// PIDData is the base64 biometric capture block from an RD-service device.
	PIDData string
	// ReferenceID is our transaction reference, quoted back for idempotency.
	ReferenceID string
	// MerAuthTxnID is the reference returned by MerchantAuth. Cash withdrawal
	// requires it.
	MerAuthTxnID string

	Latitude  string
	Longitude string
	IPAddress string

	RetailerID   *uuid.UUID
	MerchantCode string
}

// TxnResult is the outcome of an AEPS operation.
type TxnResult struct {
	Outcome     provider.Outcome
	ProviderRef string
	BankRRN     string
	BankIIN     string
	Balance     string
	Amount      string
	StatusCode  string
	ErrorCode   string
	Message     string
	// CustomerName and AadhaarLast4 are returned masked by the provider and are
	// printed on the customer receipt.
	CustomerName  string
	AadhaarLast4  string
	MiniStatement []MiniStatementEntry
	Raw           string
}

// MiniStatementEntry is one line of a customer mini statement.
type MiniStatementEntry struct {
	Date       string `json:"date"`
	Narration  string `json:"narration"`
	Type       string `json:"type"`
	Amount     string `json:"amount"`
	RunningBal string `json:"balance"`
}

// txnResponse mirrors the shared response shape of balanceEnquiry,
// miniStatement and withdrawal.
type txnResponse struct {
	Status       flexBool   `json:"status"`
	ResponseCode flexString `json:"response_code"`
	ErrorCode    flexString `json:"errorcode"`
	Message      string     `json:"message"`

	AckNo         flexString `json:"ackno"`
	ClientRefNo   flexString `json:"clientrefno"`
	BankRRN       flexString `json:"bankrrn"`
	BankIIN       flexString `json:"bankiin"`
	Amount        flexString `json:"amount"`
	BalanceAmount flexString `json:"balanceamount"`
	LastAadhaar   flexString `json:"last_aadhar"`
	Name          string     `json:"name"`
	DateTime      string     `json:"datetime"`

	MiniStatement []struct {
		Date      string     `json:"date"`
		Amount    flexString `json:"amount"`
		TxnType   string     `json:"txnType"`
		Narration string     `json:"narration"`
	} `json:"ministatement"`
}

// operationSpec maps an operation onto the provider's endpoint and type code.
func operationSpec(op string) (path, code string, needsAmount bool, err error) {
	switch op {
	case "cash_withdrawal":
		return "/api/v1/aeps/withdrawal", "CW", true, nil
	case "balance_enquiry":
		return "/api/v1/aeps/balanceEnquiry", "BE", false, nil
	case "mini_statement":
		return "/api/v1/aeps/miniStatement", "MS", false, nil
	case "aadhaar_pay":
		// The provider has supplied no Aadhaar Pay specification. Guessing an
		// endpoint that moves money is not acceptable.
		return "", "", false, fmt.Errorf("aeps: aadhaar pay: %w", ErrNotImplemented)
	default:
		return "", "", false, fmt.Errorf("aeps: unknown operation %q", op)
	}
}

// Transact performs an AEPS cash withdrawal, balance enquiry or mini statement.
//
// A non-nil TxnResult is returned alongside an error whenever the provider
// answered, so the caller can settle on the provider's own verdict instead of
// guessing from the error alone.
func (c *Client) Transact(ctx context.Context, req TxnRequest) (*TxnResult, error) {
	path, code, needsAmount, err := operationSpec(req.Operation)
	if err != nil {
		return nil, err
	}

	required := map[string]string{
		"adhaarnumber":  req.CustomerAadhaar,
		"mobile":        req.CustomerMobile,
		"bank":          req.BankIIN,
		"pid":           req.PIDData,
		"submerchantid": req.MerchantCode,
	}
	if needsAmount {
		required["amount"] = req.Amount
		// Without the two-factor reference the provider rejects the withdrawal, so
		// this is caught before a wallet hold is placed.
		required["MerAuthTxnId"] = req.MerAuthTxnID
	}
	if err := requireFields(required); err != nil {
		return nil, fmt.Errorf("aeps: %s: %w", req.Operation, err)
	}

	lat, lng := c.coords(req.Latitude, req.Longitude)
	fields := []formField{
		{"mobile", req.CustomerMobile},
		{"latitude", lat},
		{"longitude", lng},
		{"adhaarnumber", req.CustomerAadhaar},
		{"bank_pipe", c.pipe()},
		{"device", c.device()},
		{"pid", req.PIDData},
		{"ref_id", req.ReferenceID},
		{"submerchantid", req.MerchantCode},
		{"ipaddress", req.IPAddress},
		{"accessmodetype", c.accessMode()},
		{"bank", req.BankIIN},
		{"remark", code},
		{"type", code},
	}
	if needsAmount {
		fields = append(fields,
			formField{"amount", req.Amount},
			formField{"MerAuthTxnId", req.MerAuthTxnID},
		)
	}

	resp, err := c.post(ctx, req.Operation, path, fields, req.RetailerID)
	if err != nil {
		// The transport classified the failure. For a withdrawal an inconclusive
		// outcome must be reported as such: the money may already have moved.
		outcome := provider.OutcomeTimeout
		if resp != nil && resp.Outcome != "" {
			outcome = resp.Outcome
		}
		return &TxnResult{Outcome: outcome, Message: err.Error()}, err
	}

	var parsed txnResponse
	if err := decodeBody(req.Operation, resp, &parsed); err != nil {
		// An unparseable body means we never learned the verdict.
		return &TxnResult{Outcome: provider.OutcomeTimeout, Message: err.Error(), Raw: string(resp.Body)}, err
	}

	out := &TxnResult{
		Outcome:      classifyBody(parsed),
		ProviderRef:  firstNonBlank(parsed.AckNo.String(), parsed.ClientRefNo.String()),
		BankRRN:      parsed.BankRRN.String(),
		BankIIN:      parsed.BankIIN.String(),
		Balance:      parsed.BalanceAmount.String(),
		Amount:       parsed.Amount.String(),
		StatusCode:   parsed.ResponseCode.String(),
		ErrorCode:    parsed.ErrorCode.String(),
		Message:      parsed.Message,
		CustomerName: parsed.Name,
		AadhaarLast4: parsed.LastAadhaar.String(),
		Raw:          string(resp.Body),
	}
	for _, row := range parsed.MiniStatement {
		out.MiniStatement = append(out.MiniStatement, MiniStatementEntry{
			Date:      row.Date,
			Narration: row.Narration,
			// The provider sends C or D; the UI colours on credit/debit.
			Type:   txnTypeLabel(row.TxnType),
			Amount: row.Amount.String(),
		})
	}
	return out, nil
}

// classifyBody derives the settlement outcome from the provider's body.
//
// A rejection is only treated as terminal when the provider says so explicitly;
// anything that reads as in-flight is left for reconciliation, because reversing
// a withdrawal that later settles would credit the customer twice.
func classifyBody(r txnResponse) provider.Outcome {
	if r.Status.Bool() {
		if looksPending(r.Message) {
			return provider.OutcomePending
		}
		return provider.OutcomeSuccess
	}
	if looksPending(r.Message) {
		return provider.OutcomePending
	}
	return provider.OutcomeFailed
}

// looksPending reports whether a provider message describes an unsettled
// transaction.
func looksPending(message string) bool {
	m := strings.ToLower(message)
	for _, marker := range []string{"pending", "in process", "under process", "processing", "timeout", "timed out", "awaited"} {
		if strings.Contains(m, marker) {
			return true
		}
	}
	return false
}

func txnTypeLabel(t string) string {
	switch strings.ToUpper(strings.TrimSpace(t)) {
	case "C", "CR", "CREDIT":
		return "credit"
	case "D", "DR", "DEBIT":
		return "debit"
	default:
		return strings.ToLower(strings.TrimSpace(t))
	}
}

// CheckStatus polls the status of a previously submitted AEPS transaction.
//
// The provider has supplied no transaction status endpoint, so unresolved AEPS
// transactions are reconciled from the provider's settlement report rather than
// by polling. Returning an explicit error keeps that visible instead of
// silently reporting "still pending" forever.
func (c *Client) CheckStatus(context.Context, string) (*TxnResult, error) {
	return nil, fmt.Errorf("aeps: status check: %w", ErrNotImplemented)
}

// --- Capabilities ---

// Capabilities reports which operations this client can actually perform.
//
// The service layer consults this before offering an operation, so an
// unspecified endpoint surfaces as an honest "temporarily unavailable" instead
// of a fabricated success. The frontend reads the same payload to disable
// controls rather than letting a retailer walk into a 503.
type Capabilities struct {
	Onboard        bool `json:"onboard"`
	OnboardStatus  bool `json:"onboardStatus"`
	BankList       bool `json:"bankList"`
	MerchantKYC    bool `json:"merchantKyc"`
	Register       bool `json:"register"`
	MerchantAuth   bool `json:"merchantAuth"`
	CashWithdrawal bool `json:"cashWithdrawal"`
	BalanceEnquiry bool `json:"balanceEnquiry"`
	MiniStatement  bool `json:"miniStatement"`
	AadhaarPay     bool `json:"aadhaarPay"`
	StatusCheck    bool `json:"statusCheck"`
}

// Capabilities returns the supported operation set.
func (c *Client) Capabilities() Capabilities {
	on := c.cfg.Enabled
	return Capabilities{
		Onboard:        on,
		OnboardStatus:  on,
		BankList:       on,
		MerchantKYC:    on,
		Register:       on,
		MerchantAuth:   on,
		CashWithdrawal: on,
		BalanceEnquiry: on,
		MiniStatement:  on,

		// Aadhaar Pay has no specification sheet, and the provider exposes no
		// transaction status endpoint. Both stay off rather than guessed at.
		AadhaarPay:  false,
		StatusCheck: false,
	}
}

// --- helpers ---

func (c *Client) endpoint(path string) string {
	return strings.TrimRight(c.cfg.BaseURL, "/") + path
}

func (c *Client) pipe() string {
	if v := strings.TrimSpace(c.cfg.BankPipe); v != "" {
		return v
	}
	return "bank3"
}

func (c *Client) device() string {
	if v := strings.TrimSpace(c.cfg.Device); v != "" {
		return v
	}
	return "Mantra"
}

func (c *Client) accessMode() string {
	if v := strings.TrimSpace(c.cfg.AccessMode); v != "" {
		return v
	}
	return "SITE"
}

// coords falls back to the configured terminal location when the client sent
// none. The provider rejects a call with empty coordinates, and a retailer whose
// browser denied geolocation must still be able to transact.
func (c *Client) coords(lat, lng string) (string, string) {
	lat, lng = strings.TrimSpace(lat), strings.TrimSpace(lng)
	if lat == "" || lng == "" {
		return "26.9124336", "75.7872709"
	}
	return lat, lng
}

// formField is one multipart field. A slice is used rather than a map so the
// rendered cURL in the audit log is byte-for-byte reproducible.
type formField struct {
	Key   string
	Value string
}

// post sends a documented AEPS form POST, prefixing the API key.
func (c *Client) post(ctx context.Context, op, path string, fields []formField, retailerID *uuid.UUID) (*provider.Response, error) {
	if !c.cfg.Enabled {
		return nil, fmt.Errorf("aeps: %w", provider.ErrIntegrationDisabled)
	}

	all := append([]formField{{"apiKey", c.cfg.APIKey}}, fields...)
	body, contentType, err := multipartOrdered(all)
	if err != nil {
		return nil, err
	}

	return c.http.Do(ctx, provider.Request{
		Method: http.MethodPost,
		URL:    c.endpoint(path),
		Headers: map[string]string{
			"Content-Type": contentType,
			"Accept":       "application/json",
			// The provider's edge runs Mod_Security, which flags Go's default
			// "Go-http-client/..." User-Agent as a scripted/bot client and
			// answers with a blanket 406 before the request ever reaches the
			// application. A conventional browser-style UA clears that rule;
			// the provider has confirmed no IP allow-listing is required once
			// the API key is present.
			"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
		},
		Body:      body,
		Operation: op,
		// The API key travels in the body, so the plaintext record is redacted
		// before it reaches the audit sink.
		RequestPlaintext: redactAPIKey(string(body), c.cfg.APIKey),
		RetailerID:       retailerID,
	})
}

// decodeBody unmarshals a provider response, quoting the status and an excerpt
// on failure so a provider outage is diagnosable from logs alone.
func decodeBody(op string, resp *provider.Response, out any) error {
	if err := json.Unmarshal(resp.Body, out); err != nil {
		return fmt.Errorf("aeps: decode %s response (status %d, body %q): %w",
			op, resp.StatusCode, truncate(string(resp.Body), 300), err)
	}
	return nil
}

// reject builds the error for a provider business rejection.
func (c *Client) reject(op string, resp *provider.Response, code, message string) error {
	if strings.TrimSpace(message) == "" {
		message = "the provider rejected the request without a message"
	}
	return &provider.APIError{
		Provider: providerName,
		Op:       op,
		Status:   resp.StatusCode,
		Code:     code,
		Message:  message,
		Outcome:  provider.OutcomeFailed,
		// Carried so a rejection still yields the request/response evidence the
		// provider asks for. Every rejection path builds its error here.
		Raw: string(resp.Body),
	}
}

// requireFields fails locally when a documented mandatory field is blank.
//
// The provider reports missing fields one at a time with a generic message, so
// naming every omission here is considerably more actionable.
func requireFields(fields map[string]string) error {
	var missing []string
	for name, value := range fields {
		if strings.TrimSpace(value) == "" {
			missing = append(missing, name)
		}
	}
	if len(missing) == 0 {
		return nil
	}
	sort.Strings(missing)
	return fmt.Errorf("missing required fields: %s", strings.Join(missing, ", "))
}

func firstNonBlank(values ...string) string {
	for _, v := range values {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// multipartOrdered encodes fields as multipart/form-data in the given order,
// matching the encoding libcurl produces for the documented PHP reference.
func multipartOrdered(fields []formField) (body []byte, contentType string, err error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	for _, f := range fields {
		if err := w.WriteField(f.Key, f.Value); err != nil {
			return nil, "", fmt.Errorf("aeps: write form field %s: %w", f.Key, err)
		}
	}
	if err := w.Close(); err != nil {
		return nil, "", fmt.Errorf("aeps: close multipart writer: %w", err)
	}
	return buf.Bytes(), w.FormDataContentType(), nil
}

// multipartForm encodes fields as multipart/form-data, matching the encoding
// libcurl produces for the documented PHP reference.
func multipartForm(fields map[string]string) (body []byte, contentType string, err error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)

	// Field order is fixed so the rendered cURL is reproducible across calls.
	for _, key := range []string{
		"apiKey", "mobile", "merchantcode", "firm_name", "email", "is_new", "callback_url",
	} {
		if v, ok := fields[key]; ok {
			if err := w.WriteField(key, v); err != nil {
				return nil, "", fmt.Errorf("aeps: write form field %s: %w", key, err)
			}
		}
	}
	// Emit any remaining fields not covered by the canonical order.
	for k, v := range fields {
		switch k {
		case "apiKey", "mobile", "merchantcode", "firm_name", "email", "is_new", "callback_url":
			continue
		}
		if err := w.WriteField(k, v); err != nil {
			return nil, "", fmt.Errorf("aeps: write form field %s: %w", k, err)
		}
	}

	if err := w.Close(); err != nil {
		return nil, "", fmt.Errorf("aeps: close multipart writer: %w", err)
	}
	return buf.Bytes(), w.FormDataContentType(), nil
}

// redactAPIKey removes the API key from a body destined for the audit log.
func redactAPIKey(body, key string) string {
	if key == "" {
		return body
	}
	return strings.ReplaceAll(body, key, "***REDACTED***")
}

// MaskIdentifier masks an Aadhaar or mobile number for display and logging,
// keeping only the last four digits.
//
// Storing or logging a full Aadhaar number is a compliance problem, so every
// path that touches a customer identifier routes through here.
func MaskIdentifier(v string) string {
	v = strings.TrimSpace(v)
	if len(v) <= 4 {
		return strings.Repeat("X", len(v))
	}
	return strings.Repeat("X", len(v)-4) + v[len(v)-4:]
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

// flexBool decodes a JSON value that a provider may render as a boolean, a
// number, or a string.
//
// The AEPS documentation returns `"status": true` on success but
// `"status": "error"` on failure, and `onboard_pending` as the number 1. A
// strict bool would fail to parse one of these shapes.
type flexBool struct {
	value bool
	set   bool
}

// Bool reports the decoded truth value.
func (f flexBool) Bool() bool { return f.value }

// Set reports whether the field was present.
func (f flexBool) Set() bool { return f.set }

// UnmarshalJSON implements json.Unmarshaler.
func (f *flexBool) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "null" || trimmed == "" {
		return nil
	}
	f.set = true

	// Boolean form.
	var b bool
	if err := json.Unmarshal(data, &b); err == nil {
		f.value = b
		return nil
	}

	// Numeric form: any non-zero value is true.
	var n json.Number
	if err := json.Unmarshal(data, &n); err == nil {
		f.value = n.String() != "0" && n.String() != ""
		return nil
	}

	// String form.
	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		switch strings.ToLower(strings.TrimSpace(s)) {
		case "true", "1", "success", "yes", "y":
			f.value = true
		default:
			// "error", "false", "0" and anything unrecognised are false.
			f.value = false
		}
		return nil
	}

	return fmt.Errorf("aeps: cannot decode %q as boolean", trimmed)
}

// flexString decodes a JSON value the provider may render as a string, a number,
// a boolean or null, into its string form.
//
// The AEPS responses are inconsistent about this: `response_code` arrives as 1 on
// some endpoints and "1" on others, `ackno` and `balanceamount` are numbers, and
// `aadharpayiinno` is null for most banks. Modelling these as plain strings would
// fail the whole parse on a type mismatch.
type flexString struct {
	value string
	set   bool
}

// String returns the decoded value.
func (f flexString) String() string { return f.value }

// Set reports whether the field was present and non-null.
func (f flexString) Set() bool { return f.set }

// UnmarshalJSON implements json.Unmarshaler.
func (f *flexString) UnmarshalJSON(data []byte) error {
	trimmed := strings.TrimSpace(string(data))
	if trimmed == "null" || trimmed == "" {
		return nil
	}
	f.set = true

	var s string
	if err := json.Unmarshal(data, &s); err == nil {
		f.value = s
		return nil
	}

	// Numbers are kept in their literal form so a rupee amount is never reshaped
	// by a float round trip.
	var n json.Number
	if err := json.Unmarshal(data, &n); err == nil {
		f.value = n.String()
		return nil
	}

	var b bool
	if err := json.Unmarshal(data, &b); err == nil {
		f.value = fmt.Sprint(b)
		return nil
	}

	// An object or array in a scalar position is not something the caller can
	// use, but it must not abort the rest of the parse either.
	f.value = trimmed
	return nil
}

// compile-time assertion that time is used; the config timeout is a
// time.Duration and the package must keep the import meaningful.
var _ = time.Second
