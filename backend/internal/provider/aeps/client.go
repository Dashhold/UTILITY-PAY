// Package aeps integrates the Excisoft AEPS provider.
//
// # Documented surface
//
// AEPS/api_doc.md specifies exactly one endpoint:
//
//	POST {base}/api/v1/aeps/onboard
//	multipart/form-data: apiKey, mobile, merchantcode, firm_name, email,
//	                     is_new, callback_url
//
// The PHP reference passes CURLOPT_POSTFIELDS an array, which makes libcurl emit
// multipart/form-data. This client reproduces that encoding rather than
// url-encoding, because providers in this space commonly reject the latter.
//
// # Undocumented surface
//
// The retailer UI also offers cash withdrawal, balance enquiry, mini statement
// and Aadhaar Pay. Those endpoints are not present in the supplied
// documentation. They are declared here against the same request/response
// conventions as onboarding and gated behind Capabilities so the platform runs
// correctly with them disabled, and needs only the paths and field names filled
// in once the provider supplies the full specification. Nothing silently
// pretends to have transacted.
package aeps

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
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
		}
	}

	if strings.TrimSpace(parsed.RedirectURL) == "" {
		return nil, &provider.APIError{
			Provider: providerName,
			Op:       "onboard",
			Status:   resp.StatusCode,
			Message:  "provider reported success but returned no redirecturl",
			Outcome:  provider.OutcomeFailed,
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

// --- Transactional operations (specification pending) ---

// TxnRequest is the input to an AEPS financial or enquiry operation.
type TxnRequest struct {
	Operation string
	// AadhaarOrMobile is the customer identifier. Callers must pass the full
	// value; it is masked before it reaches any log.
	AadhaarOrMobile string
	BankIIN         string
	BankName        string
	Amount          string
	// PIDData is the base64 biometric capture block from an RD-service device.
	PIDData string
	// ReferenceID is our transaction reference, quoted back for idempotency.
	ReferenceID string

	RetailerID   *uuid.UUID
	MerchantCode string
}

// TxnResult is the outcome of an AEPS operation.
type TxnResult struct {
	Outcome       provider.Outcome
	ProviderRef   string
	BankRRN       string
	Balance       string
	StatusCode    string
	Message       string
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

// Capabilities reports which operations this client can actually perform.
//
// The service layer consults this before offering an operation, so an
// unspecified endpoint surfaces as an honest "temporarily unavailable" instead
// of a fabricated success. The frontend reads the same payload to disable
// controls rather than letting a retailer walk into a 503.
type Capabilities struct {
	Onboard        bool `json:"onboard"`
	CashWithdrawal bool `json:"cashWithdrawal"`
	BalanceEnquiry bool `json:"balanceEnquiry"`
	MiniStatement  bool `json:"miniStatement"`
	AadhaarPay     bool `json:"aadhaarPay"`
	StatusCheck    bool `json:"statusCheck"`
}

// Capabilities returns the supported operation set.
func (c *Client) Capabilities() Capabilities {
	return Capabilities{
		// Onboarding is the only endpoint the supplied documentation defines.
		Onboard: c.cfg.Enabled,

		// The remaining endpoints await the provider's full API specification:
		// their paths, field names and response codes are unknown, and guessing
		// them would produce silent financial errors.
		CashWithdrawal: false,
		BalanceEnquiry: false,
		MiniStatement:  false,
		AadhaarPay:     false,
		StatusCheck:    false,
	}
}

// Transact performs an AEPS operation.
//
// It returns ErrNotImplemented until the provider specification for the
// operation is available. See the package documentation.
func (c *Client) Transact(context.Context, TxnRequest) (*TxnResult, error) {
	return nil, fmt.Errorf("aeps: transact: %w", ErrNotImplemented)
}

// CheckStatus polls the status of a previously submitted AEPS transaction.
//
// It returns ErrNotImplemented until the provider specification is available.
func (c *Client) CheckStatus(context.Context, string) (*TxnResult, error) {
	return nil, fmt.Errorf("aeps: status check: %w", ErrNotImplemented)
}

// --- helpers ---

func (c *Client) endpoint(path string) string {
	return strings.TrimRight(c.cfg.BaseURL, "/") + path
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

// compile-time assertion that time is used; keeps the import meaningful if the
// transactional section is filled in later with deadline handling.
var _ = time.Second
