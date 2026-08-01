package aeps

import (
	"context"
	"errors"
	"io"
	"mime"
	"mime/multipart"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/provider"
)

// stubDoer returns a canned response and captures the request it was given.
type stubDoer struct {
	status       int
	body         string
	err          error
	captured     *http.Request
	capturedBody []byte
}

func (s *stubDoer) Do(req *http.Request) (*http.Response, error) {
	s.captured = req
	if req.Body != nil {
		s.capturedBody, _ = io.ReadAll(req.Body)
	}
	if s.err != nil {
		return nil, s.err
	}
	return &http.Response{
		StatusCode: s.status,
		Body:       io.NopCloser(strings.NewReader(s.body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}, nil
}

func testClient(t *testing.T, doer provider.Doer) *Client {
	t.Helper()
	cfg := config.AEPSConfig{
		BaseURL:     "https://apidev.excisofttech.com",
		APIKey:      "Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze",
		CallbackURL: "https://utilipayhub.com/aeps/callback",
		Timeout:     10 * time.Second,
		Enabled:     true,
	}
	return New(cfg, provider.NoopSink{}).WithTransport(doer)
}

func validRequest() OnboardRequest {
	return OnboardRequest{
		Mobile:       "9694310969",
		MerchantCode: "SH86561",
		FirmName:     "SH86561",
		Email:        "retailer@example.com",
		IsNew:        true,
	}
}

// documentedSuccessBody is the success response verbatim from AEPS/api_doc.md,
// including the polymorphic boolean `status` and numeric `onboard_pending`.
const documentedSuccessBody = `{
    "status": true,
    "response_code": 1,
    "redirecturl": "https://merchantkyc.com/onboarding?env=eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.abc.def",
    "onboard_pending": 1,
    "message": "Balance successfully fetched"
}`

// documentedFailureBody is the error response verbatim from the same document,
// where `status` is the string "error" rather than a boolean.
const documentedFailureBody = `{
    "status": "error",
    "message": "The field 'merchantcode' is required and cannot be empty."
}`

func TestOnboard_DocumentedSuccessResponse(t *testing.T) {
	doer := &stubDoer{status: 200, body: documentedSuccessBody}
	got, err := testClient(t, doer).Onboard(context.Background(), validRequest())
	if err != nil {
		t.Fatalf("Onboard: %v", err)
	}

	if !strings.HasPrefix(got.RedirectURL, "https://merchantkyc.com/onboarding?env=") {
		t.Errorf("RedirectURL = %q, want the provider KYC URL", got.RedirectURL)
	}
	// onboard_pending arrives as the number 1 and must decode to true.
	if !got.OnboardPending {
		t.Error("OnboardPending = false, want true (provider sent numeric 1)")
	}
	if got.ResponseCode != 1 {
		t.Errorf("ResponseCode = %d, want 1", got.ResponseCode)
	}
}

func TestOnboard_DocumentedFailureResponse(t *testing.T) {
	// The provider reports this failure with HTTP 200 and a string `status`, so
	// the body verdict must override the status code.
	doer := &stubDoer{status: 200, body: documentedFailureBody}
	_, err := testClient(t, doer).Onboard(context.Background(), validRequest())
	if err == nil {
		t.Fatal("expected an error for status:\"error\" body, got nil")
	}

	var apiErr *provider.APIError
	if !errors.As(err, &apiErr) {
		t.Fatalf("error is %T, want *provider.APIError", err)
	}
	if apiErr.Outcome != provider.OutcomeFailed {
		t.Errorf("Outcome = %q, want %q", apiErr.Outcome, provider.OutcomeFailed)
	}
	if !strings.Contains(apiErr.Message, "merchantcode") {
		t.Errorf("Message = %q, want it to carry the provider's explanation", apiErr.Message)
	}
}

func TestOnboard_SendsDocumentedMultipartFields(t *testing.T) {
	doer := &stubDoer{status: 200, body: documentedSuccessBody}
	if _, err := testClient(t, doer).Onboard(context.Background(), validRequest()); err != nil {
		t.Fatalf("Onboard: %v", err)
	}

	if got, want := doer.captured.Method, http.MethodPost; got != want {
		t.Errorf("method = %s, want %s", got, want)
	}
	if got, want := doer.captured.URL.String(), "https://apidev.excisofttech.com/api/v1/aeps/onboard"; got != want {
		t.Errorf("URL = %s, want %s", got, want)
	}

	// The PHP reference passes an array to CURLOPT_POSTFIELDS, which libcurl
	// encodes as multipart/form-data.
	contentType := doer.captured.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		t.Fatalf("parse Content-Type %q: %v", contentType, err)
	}
	if mediaType != "multipart/form-data" {
		t.Fatalf("media type = %q, want multipart/form-data", mediaType)
	}

	reader := multipart.NewReader(strings.NewReader(string(doer.capturedBody)), params["boundary"])
	form, err := reader.ReadForm(1 << 20)
	if err != nil {
		t.Fatalf("read multipart form: %v", err)
	}

	want := map[string]string{
		"apiKey":       "Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze",
		"mobile":       "9694310969",
		"merchantcode": "SH86561",
		"firm_name":    "SH86561",
		"email":        "retailer@example.com",
		"is_new":       "1",
		"callback_url": "https://utilipayhub.com/aeps/callback",
	}
	for field, expected := range want {
		values := form.Value[field]
		if len(values) == 0 {
			t.Errorf("field %q missing from request", field)
			continue
		}
		if values[0] != expected {
			t.Errorf("field %q = %q, want %q", field, values[0], expected)
		}
	}
	if len(form.Value) != len(want) {
		t.Errorf("sent %d fields, want exactly %d: %v", len(form.Value), len(want), keysOf(form.Value))
	}
}

func TestOnboard_IsNewFlagReflectsInput(t *testing.T) {
	for _, tc := range []struct {
		isNew bool
		want  string
	}{
		{true, "1"},
		{false, "0"},
	} {
		doer := &stubDoer{status: 200, body: documentedSuccessBody}
		req := validRequest()
		req.IsNew = tc.isNew
		if _, err := testClient(t, doer).Onboard(context.Background(), req); err != nil {
			t.Fatalf("isNew=%v: %v", tc.isNew, err)
		}
		if !strings.Contains(string(doer.capturedBody), "\r\n\r\n"+tc.want+"\r\n") {
			t.Errorf("isNew=%v: expected is_new field value %q in body", tc.isNew, tc.want)
		}
	}
}

func TestOnboard_ValidatesRequiredFieldsLocally(t *testing.T) {
	// Failing locally avoids a pointless round trip and produces a message that
	// names every missing field, unlike the provider's one-at-a-time error.
	cases := map[string]func(*OnboardRequest){
		"mobile":       func(r *OnboardRequest) { r.Mobile = "" },
		"merchantcode": func(r *OnboardRequest) { r.MerchantCode = "" },
		"firm_name":    func(r *OnboardRequest) { r.FirmName = "  " },
		"email":        func(r *OnboardRequest) { r.Email = "" },
	}

	for field, mutate := range cases {
		t.Run(field, func(t *testing.T) {
			doer := &stubDoer{status: 200, body: documentedSuccessBody}
			req := validRequest()
			mutate(&req)

			_, err := testClient(t, doer).Onboard(context.Background(), req)
			if err == nil {
				t.Fatal("expected validation error, got nil")
			}
			if !strings.Contains(err.Error(), field) {
				t.Errorf("error %q should name the missing field %q", err, field)
			}
			if doer.captured != nil {
				t.Error("no HTTP request should be made when validation fails")
			}
		})
	}
}

func TestOnboard_RejectsSuccessWithoutRedirectURL(t *testing.T) {
	// A success verdict with no redirect URL is unusable: the retailer would be
	// marked as onboarding with nowhere to go.
	doer := &stubDoer{status: 200, body: `{"status":true,"response_code":1,"message":"ok"}`}
	_, err := testClient(t, doer).Onboard(context.Background(), validRequest())
	if err == nil {
		t.Fatal("expected an error when redirecturl is absent, got nil")
	}
	if !strings.Contains(err.Error(), "redirecturl") {
		t.Errorf("error %q should mention the missing redirecturl", err)
	}
}

func TestOnboard_TimeoutIsNotReportedAsFailure(t *testing.T) {
	// A timeout must not be classified as failed: onboarding may have been
	// registered upstream.
	doer := &stubDoer{err: context.DeadlineExceeded}
	_, err := testClient(t, doer).Onboard(context.Background(), validRequest())
	if err == nil {
		t.Fatal("expected an error on timeout, got nil")
	}
	if got := provider.OutcomeOf(err); got != provider.OutcomeTimeout {
		t.Errorf("OutcomeOf = %q, want %q", got, provider.OutcomeTimeout)
	}
}

func TestOnboard_MalformedJSONSurfacesContext(t *testing.T) {
	doer := &stubDoer{status: 502, body: "<html>Bad Gateway</html>"}
	_, err := testClient(t, doer).Onboard(context.Background(), validRequest())
	if err == nil {
		t.Fatal("expected an error for non-JSON body, got nil")
	}
	// The message must include the status and a body excerpt, otherwise
	// diagnosing a provider outage from logs alone is guesswork.
	if !strings.Contains(err.Error(), "502") || !strings.Contains(err.Error(), "Bad Gateway") {
		t.Errorf("error %q should include the HTTP status and a body excerpt", err)
	}
}

func TestOnboard_DisabledIntegration(t *testing.T) {
	cfg := config.AEPSConfig{BaseURL: "https://x", APIKey: "k", Timeout: time.Second, Enabled: false}
	_, err := New(cfg, provider.NoopSink{}).Onboard(context.Background(), validRequest())
	if !errors.Is(err, provider.ErrIntegrationDisabled) {
		t.Fatalf("error = %v, want ErrIntegrationDisabled", err)
	}
}

func TestUndocumentedOperationsReportNotImplemented(t *testing.T) {
	c := testClient(t, &stubDoer{status: 200, body: "{}"})

	// These must fail loudly rather than return a fabricated success, because a
	// silent fake would look like a completed cash withdrawal.
	if _, err := c.Transact(context.Background(), TxnRequest{Operation: "cash_withdrawal"}); !errors.Is(err, ErrNotImplemented) {
		t.Errorf("Transact error = %v, want ErrNotImplemented", err)
	}
	if _, err := c.CheckStatus(context.Background(), "ref"); !errors.Is(err, ErrNotImplemented) {
		t.Errorf("CheckStatus error = %v, want ErrNotImplemented", err)
	}

	caps := c.Capabilities()
	if !caps.Onboard {
		t.Error("Onboard capability should be true: it is the documented endpoint")
	}
	for name, enabled := range map[string]bool{
		"CashWithdrawal": caps.CashWithdrawal,
		"BalanceEnquiry": caps.BalanceEnquiry,
		"MiniStatement":  caps.MiniStatement,
		"AadhaarPay":     caps.AadhaarPay,
		"StatusCheck":    caps.StatusCheck,
	} {
		if enabled {
			t.Errorf("%s capability is advertised but no specification exists for it", name)
		}
	}
}

func TestMaskIdentifier(t *testing.T) {
	for in, want := range map[string]string{
		"999988887777": "XXXXXXXX7777",
		"9694310969":   "XXXXXX0969",
		"1234":         "XXXX",
		"12":           "XX",
		"":             "",
	} {
		if got := MaskIdentifier(in); got != want {
			t.Errorf("MaskIdentifier(%q) = %q, want %q", in, got, want)
		}
	}
}

func TestFlexBool(t *testing.T) {
	cases := []struct {
		raw  string
		want bool
	}{
		{`true`, true},
		{`false`, false},
		{`1`, true},
		{`0`, false},
		{`"error"`, false},
		{`"success"`, true},
		{`"true"`, true},
		{`"1"`, true},
		{`"0"`, false},
		{`"false"`, false},
	}
	for _, tc := range cases {
		var f flexBool
		if err := f.UnmarshalJSON([]byte(tc.raw)); err != nil {
			t.Errorf("UnmarshalJSON(%s): %v", tc.raw, err)
			continue
		}
		if f.Bool() != tc.want {
			t.Errorf("UnmarshalJSON(%s).Bool() = %v, want %v", tc.raw, f.Bool(), tc.want)
		}
	}

	// A null or absent value must decode as unset rather than erroring.
	var f flexBool
	if err := f.UnmarshalJSON([]byte("null")); err != nil {
		t.Errorf("null: %v", err)
	}
	if f.Set() {
		t.Error("null should leave the field unset")
	}
}

func TestOnboard_APIKeyRedactedFromAuditRecord(t *testing.T) {
	// The API key is transmitted in the request body, so the audit record must
	// not retain it: these rows are long-lived and admin-readable.
	sink := &capturingSink{}
	cfg := config.AEPSConfig{
		BaseURL: "https://apidev.excisofttech.com",
		APIKey:  "Bw6MxIIzqXJ2edfmagbYysyMqWtcWUze",
		Timeout: time.Second,
		Enabled: true,
	}
	c := New(cfg, sink).WithTransport(&stubDoer{status: 200, body: documentedSuccessBody})

	if _, err := c.Onboard(context.Background(), validRequest()); err != nil {
		t.Fatalf("Onboard: %v", err)
	}
	if len(sink.entries) != 1 {
		t.Fatalf("recorded %d audit entries, want 1", len(sink.entries))
	}
	entry := sink.entries[0]
	if strings.Contains(entry.RequestPlaintext, cfg.APIKey) {
		t.Error("audit record retains the raw API key")
	}
	if !strings.Contains(entry.RequestPlaintext, "REDACTED") {
		t.Error("audit record should show the key as redacted")
	}
	if entry.Operation != "onboard" {
		t.Errorf("Operation = %q, want %q", entry.Operation, "onboard")
	}
	if entry.Curl == "" {
		t.Error("audit record must include a cURL equivalent for UAT evidence")
	}
}

type capturingSink struct{ entries []provider.CallLog }

func (s *capturingSink) Record(_ context.Context, e provider.CallLog) {
	s.entries = append(s.entries, e)
}

func keysOf(m map[string][]string) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}
