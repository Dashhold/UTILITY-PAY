package bharatconnect

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/cryptoenv"
	"github.com/utilipay/backend/internal/provider"
)

// testPublicKey is the RSA public key from bharat_connect/encryption.md.
const testPublicKey = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlHpOvQI7LvtOmK5jRfqvoUbJtlVVIbez31E0G7tNrCpOtwsV08yc1GYBqG4zSicvsMHUiCkvdeB4Eo0pXEcV5Gw7swMXUT/LkAQVm0L8JYpUVkZmAORVDpHCVX1kJP9mAaRVtkt6BItZQXcUBO7ykNJOY2hItZfVzyapXn7WfB+BV7Bbu+MiJKGJM3VYKHsokAFi36g3dSlVG2NCKD+q4wzhCZGygkYlAkmcBarbizYbATu2kkqWz1oCqClwIxwRUNh5chVu/vbyvgTcGYfA0IehcJePcX6+NVtAFsuifvdscnG93inJXpeJnbUEqcGMzdvsVwSit7eDZKoUW8WuOwIDAQAB"

// testConfig builds a configuration for the tests.
//
// The credentials are deliberately fake. Every test in this package answers from a
// scripted transport rather than reaching MobiKwik, so a real client secret would
// buy nothing and would sit in the repository history permanently.
func testConfig() config.BharatConnectConfig {
	return config.BharatConnectConfig{
		BaseURL:           "https://alpha3.mobikwik.com",
		ClientID:          "RCH_test_client_id",
		ClientSecret:      "test-client-secret-not-a-real-credential",
		PublicKeyBase64:   testPublicKey,
		KeyVersion:        "1.0",
		AgentID:           "MK01MK01INB523643654",
		Timeout:           10 * time.Second,
		Enabled:           true,
		TokenSafetyWindow: 30 * time.Minute,
	}
}

// --- test doubles ---

type scriptedResponse struct {
	status int
	body   string
	err    error
}

type recordedCall struct {
	req  *http.Request
	body []byte
}

// scriptedDoer replays canned responses and records every request.
type scriptedDoer struct {
	responses []scriptedResponse
	calls     []recordedCall
	idx       int
}

func (s *scriptedDoer) Do(req *http.Request) (*http.Response, error) {
	var body []byte
	if req.Body != nil {
		body, _ = io.ReadAll(req.Body)
	}
	s.calls = append(s.calls, recordedCall{req: req, body: body})

	if s.idx >= len(s.responses) {
		return nil, errors.New("scriptedDoer: no response scripted for this call")
	}
	r := s.responses[s.idx]
	s.idx++

	if r.err != nil {
		return nil, r.err
	}
	return &http.Response{
		StatusCode: r.status,
		Body:       io.NopCloser(strings.NewReader(r.body)),
		Header:     http.Header{"Content-Type": []string{"application/json"}},
	}, nil
}

// businessCall returns the last non-token call, which is the one under test.
func (s *scriptedDoer) businessCall(t *testing.T) recordedCall {
	t.Helper()
	for i := len(s.calls) - 1; i >= 0; i-- {
		if !strings.Contains(s.calls[i].req.URL.Path, "/verify/retailer") {
			return s.calls[i]
		}
	}
	t.Fatal("no business call recorded")
	return recordedCall{}
}

// tokenOK is the success response from the specification's Authentication API
// section, including the nested data object and the documented expiryTime format.
const tokenOK = `{"success":true,"data":{"token":"wQltGT9mP1HlXNHq0ZrdK-GhwdnHnIXs7mw33S8xTrI","expiryTime":"2030-10-29 12:26:53"}}`

func newClient(t *testing.T, doer provider.Doer) *Client {
	t.Helper()
	c, err := New(testConfig(), &MemoryTokenStore{}, provider.NoopSink{}, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return c.WithTransport(doer)
}

// decryptPayload recovers the plaintext a request carried, so tests can assert on
// the fields actually sent rather than on ciphertext.
func decryptPayload(t *testing.T, sink *capturingSink, body []byte) map[string]any {
	t.Helper()

	var env cryptoenv.Envelope
	if err := json.Unmarshal(body, &env); err != nil {
		t.Fatalf("request body is not an envelope: %v", err)
	}

	sealer, err := cryptoenv.NewSealer(testPublicKey, "1.0", cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("NewSealer: %v", err)
	}

	plain, err := sealer.Open(sink.lastSessionKey, env.EncryptedPayload, env.IV)
	if err != nil {
		t.Fatalf("decrypt request payload: %v", err)
	}

	var out map[string]any
	if err := json.Unmarshal(plain, &out); err != nil {
		t.Fatalf("decrypted payload is not JSON: %v", err)
	}
	return out
}

type capturingSink struct {
	entries        []provider.CallLog
	lastSessionKey string
}

func (s *capturingSink) Record(_ context.Context, e provider.CallLog) {
	s.entries = append(s.entries, e)
	if e.SessionKeyBase64 != "" {
		s.lastSessionKey = e.SessionKeyBase64
	}
}

// =========================================================================
// Authentication
// =========================================================================

// TestToken_MatchesDocumentedContract pins the three details of the token call
// that are easy to get wrong and that break every subsequent request: the
// endpoint path, the fact that the body is plaintext, and the nested response.
func TestToken_MatchesDocumentedContract(t *testing.T) {
	doer := &scriptedDoer{responses: []scriptedResponse{{status: 200, body: tokenOK}}}
	c := newClient(t, doer)

	token, err := c.Token(context.Background())
	if err != nil {
		t.Fatalf("Token: %v", err)
	}
	if token != "wQltGT9mP1HlXNHq0ZrdK-GhwdnHnIXs7mw33S8xTrI" {
		t.Errorf("token = %q, want the value from data.token", token)
	}

	call := doer.calls[0]

	// The specification gives this exact path under "Authentication & Token
	// Generation API".
	if got, want := call.req.URL.String(), "https://alpha3.mobikwik.com/recharge/v1/verify/retailer"; got != want {
		t.Errorf("URL = %s, want %s", got, want)
	}

	// The token call is the one encrypted API exception: its body is plaintext
	// clientId/clientSecret. Encrypting it would be rejected.
	var body map[string]any
	if err := json.Unmarshal(call.body, &body); err != nil {
		t.Fatalf("token body is not JSON: %v", err)
	}
	if body["clientId"] != testConfig().ClientID {
		t.Errorf("clientId = %v, want %q", body["clientId"], testConfig().ClientID)
	}
	if body["clientSecret"] != testConfig().ClientSecret {
		t.Errorf("clientSecret = %v, want the configured secret", body["clientSecret"])
	}
	if _, encrypted := body["encryptedPayload"]; encrypted {
		t.Error("token request must be plaintext, not enveloped")
	}
}

// TestToken_AuthorizationHeaderHasNoBearerPrefix guards a subtle spec detail.
// The documentation shows "Authorization: <token>" verbatim; adding "Bearer "
// would make every authenticated call fail with a 401.
func TestToken_AuthorizationHeaderHasNoBearerPrefix(t *testing.T) {
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"balance":303.5}}`},
	}}
	c := newClient(t, doer)

	if _, err := c.Balance(context.Background(), BalanceRequest{MemberID: "testalpha1@gmail.com"}); err != nil {
		t.Fatalf("Balance: %v", err)
	}

	got := doer.businessCall(t).req.Header.Get("Authorization")
	if got != "wQltGT9mP1HlXNHq0ZrdK-GhwdnHnIXs7mw33S8xTrI" {
		t.Errorf("Authorization = %q, want the bare token", got)
	}
	if strings.HasPrefix(strings.ToLower(got), "bearer") {
		t.Error("Authorization must not carry a Bearer prefix")
	}
}

func TestToken_ParsesDocumentedExpiryTime(t *testing.T) {
	// expiryTime is "YYYY-MM-DD HH:mm:ss" per the field table. Failing to parse it
	// would collapse the cache to the 24h fallback and risk presenting a token
	// the provider has already rotated out.
	store := &MemoryTokenStore{}
	c, err := New(testConfig(), store, provider.NoopSink{}, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	c = c.WithTransport(&scriptedDoer{responses: []scriptedResponse{{status: 200, body: tokenOK}}})

	if _, err := c.Token(context.Background()); err != nil {
		t.Fatalf("Token: %v", err)
	}

	rec, err := store.Load(context.Background())
	if err != nil || rec == nil {
		t.Fatalf("Load: %v", err)
	}

	want := time.Date(2030, 10, 29, 12, 26, 53, 0, time.UTC)
	if !rec.ExpiresAt.Equal(want) {
		t.Errorf("ExpiresAt = %v, want the parsed expiryTime %v", rec.ExpiresAt, want)
	}
}

func TestToken_DocumentedFailureCodes(t *testing.T) {
	// Code 1308 means the credentials are wrong: a permanent condition that must
	// not be retried as though it were transient.
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: `{"success":false,"message":{"code":"1308","text":"Invalid Request"}}`},
	}}
	c := newClient(t, doer)

	_, err := c.Token(context.Background())
	if err == nil {
		t.Fatal("expected an error for code 1308")
	}
	if !strings.Contains(err.Error(), "1308") {
		t.Errorf("error %q should carry the provider code", err)
	}
}

// =========================================================================
// Encryption envelope
// =========================================================================

// TestEncryptedAPIsUseDocumentedEnvelope verifies the four-field envelope and
// that the cipher suite matches the specification: AES-256-GCM plus RSA
// PKCS#1 v1.5.
func TestEncryptedAPIsUseDocumentedEnvelope(t *testing.T) {
	sink := &capturingSink{}
	c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"balance":303.5}}`},
	}}
	c = c.WithTransport(doer)

	if _, err := c.Balance(context.Background(), BalanceRequest{MemberID: "testalpha1@gmail.com"}); err != nil {
		t.Fatalf("Balance: %v", err)
	}

	var env map[string]json.RawMessage
	if err := json.Unmarshal(doer.businessCall(t).body, &env); err != nil {
		t.Fatalf("business body is not JSON: %v", err)
	}

	for _, field := range []string{"encryptedSessionKey", "encryptedPayload", "keyVersion", "iv"} {
		if _, ok := env[field]; !ok {
			t.Errorf("envelope missing required field %q", field)
		}
	}

	var keyVersion string
	if err := json.Unmarshal(env["keyVersion"], &keyVersion); err != nil {
		t.Fatalf("keyVersion: %v", err)
	}
	if keyVersion != "1.0" {
		t.Errorf("keyVersion = %q, want the configured 1.0", keyVersion)
	}

	// The plaintext must round-trip to exactly the documented balance payload.
	payload := decryptPayload(t, sink, doer.businessCall(t).body)
	if payload["memberId"] != "testalpha1@gmail.com" {
		t.Errorf("decrypted payload = %v, want memberId", payload)
	}
	if len(payload) != 1 {
		t.Errorf("balance payload has %d fields, want exactly memberId: %v", len(payload), payload)
	}
}

// =========================================================================
// Balance
// =========================================================================

func TestBalance_DocumentedSuccessAndFailure(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		doer := &scriptedDoer{responses: []scriptedResponse{
			{status: 200, body: tokenOK},
			{status: 200, body: `{"success":true,"data":{"balance":303.5}}`},
		}}
		res, err := newClient(t, doer).Balance(context.Background(), BalanceRequest{MemberID: "testalpha1@gmail.com"})
		if err != nil {
			t.Fatalf("Balance: %v", err)
		}
		if res.Balance != 303.5 {
			t.Errorf("Balance = %v, want 303.5", res.Balance)
		}
	})

	t.Run("code 401 in body is an auth failure", func(t *testing.T) {
		// The provider reports an expired token with HTTP 200 and code "401" in the
		// body. Relying on the HTTP status alone would misread this as success.
		doer := &scriptedDoer{responses: []scriptedResponse{
			{status: 200, body: tokenOK},
			{status: 200, body: `{"success":false,"message":{"code":"401","text":"Token is expired/Invalid Token/Token not found in request"}}`},
			{status: 200, body: `{"success":true,"data":{"token":"fresh-token","expiryTime":"2030-10-29 12:26:53"}}`},
			{status: 200, body: `{"success":true,"data":{"balance":100.0}}`},
		}}
		c := newClient(t, doer)

		res, err := c.Balance(context.Background(), BalanceRequest{MemberID: "testalpha1@gmail.com"})
		if err != nil {
			t.Fatalf("Balance should recover by refreshing the token: %v", err)
		}
		if res.Balance != 100.0 {
			t.Errorf("Balance = %v, want 100 after refresh", res.Balance)
		}
		if len(doer.calls) != 4 {
			t.Fatalf("made %d calls, want 4 (token, 401, re-mint, retry)", len(doer.calls))
		}
		if got := doer.calls[3].req.Header.Get("Authorization"); got != "fresh-token" {
			t.Errorf("retry Authorization = %q, want the refreshed token", got)
		}
	})

	t.Run("requires memberId", func(t *testing.T) {
		doer := &scriptedDoer{}
		if _, err := newClient(t, doer).Balance(context.Background(), BalanceRequest{}); err == nil {
			t.Error("expected an error when memberId is absent")
		}
		if len(doer.calls) != 0 {
			t.Error("no HTTP call should be made when validation fails")
		}
	})
}

// =========================================================================
// Validation
// =========================================================================

func TestValidate_DocumentedContract(t *testing.T) {
	sink := &capturingSink{}
	c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"status":"RECHARGEVALIDATIONSUCCESS","description":"","balance":0.0,"businessError":false}}`},
	}}
	c = c.WithTransport(doer)

	res, err := c.Validate(context.Background(), ValidationRequest{
		Amount:     "100",
		Connection: "9876876768",
		OperatorID: "7",
		CircleID:   "1",
		PlanCode:   "bsnl-Andhra-Pradesh-topup-plans-Rs-100.0",
	})
	if err != nil {
		t.Fatalf("Validate: %v", err)
	}
	if res.Outcome != provider.OutcomeSuccess {
		t.Errorf("Outcome = %q, want success for RECHARGEVALIDATIONSUCCESS", res.Outcome)
	}

	if got, want := doer.businessCall(t).req.URL.Path, "/recharge/v3/retailerValidation"; got != want {
		t.Errorf("path = %s, want %s", got, want)
	}

	// Field names are taken verbatim from the request-parameter table.
	payload := decryptPayload(t, sink, doer.businessCall(t).body)
	for field, want := range map[string]any{
		"amt":      "100",
		"cn":       "9876876768",
		"op":       "7",
		"cir":      "1",
		"agentId":  "MK01MK01INB523643654",
		"planCode": "bsnl-Andhra-Pradesh-topup-plans-Rs-100.0",
	} {
		if payload[field] != want {
			t.Errorf("payload[%q] = %v, want %v", field, payload[field], want)
		}
	}

	// adParams is documented as an empty map when unused, not omitted.
	adParams, ok := payload["adParams"]
	if !ok {
		t.Error("payload must carry adParams")
	} else if _, isMap := adParams.(map[string]any); !isMap {
		t.Errorf("adParams = %T, want an object", adParams)
	}
}

func TestValidate_FailureIsTerminal(t *testing.T) {
	// A validation failure happens before any money moves, so it is safe and
	// correct to treat it as terminal rather than scheduling a status check.
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":false,"message":{"code":"RECHARGEVALIDATIONFAILURE","text":"Invalid Hash Value"},"data":{"status":"RECHARGEVALIDATIONFAILURE","businessError":true}}`},
	}}
	c := newClient(t, doer)

	_, err := c.Validate(context.Background(), ValidationRequest{
		Amount: "10", Connection: "8434625057", OperatorID: "140", CircleID: "22",
		PlanCode: "Vi-UP-WEST-Uttarakhand-121-made-for-you-Rs-1.0",
	})
	if err == nil {
		t.Fatal("expected an error for RECHARGEVALIDATIONFAILURE")
	}
	if got := provider.OutcomeOf(err); got != provider.OutcomeFailed {
		t.Errorf("Outcome = %q, want failed", got)
	}
}

// =========================================================================
// View Bill
// =========================================================================

// TestViewBill_ParsesArrayResponse covers a shape trap: unlike every other
// endpoint, View Bill returns data as an array.
func TestViewBill_ParsesArrayResponse(t *testing.T) {
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":[{"billAmount":"1930.0","billnetamount":"1930.0","billdate":"24-Nov-2025","dueDate":"15-Dec-2025","acceptPayment":true,"acceptPartPay":false,"userName":"***** **** Ma***"}]}`},
	}}
	c := newClient(t, doer)

	res, err := c.ViewBill(context.Background(), ViewBillRequest{
		Connection: "151608882", OperatorID: "31", CircleID: "1",
	})
	if err != nil {
		t.Fatalf("ViewBill: %v", err)
	}
	if len(res.Bills) != 1 {
		t.Fatalf("parsed %d bills, want 1", len(res.Bills))
	}

	bill := res.Bills[0]
	if bill.BillAmount != "1930.0" {
		t.Errorf("BillAmount = %q, want 1930.0", bill.BillAmount)
	}
	if bill.DueDate != "15-Dec-2025" {
		t.Errorf("DueDate = %q", bill.DueDate)
	}
	if !bill.AcceptPayment {
		t.Error("AcceptPayment should be true")
	}
	if bill.AcceptPartPay {
		t.Error("AcceptPartPay should be false")
	}
	if bill.CustomerName != "***** **** Ma***" {
		t.Errorf("CustomerName = %q", bill.CustomerName)
	}

	if got, want := doer.businessCall(t).req.URL.Path, "/recharge/v3/retailerViewbill"; got != want {
		t.Errorf("path = %s, want %s (lowercase b, as the spec prints it)", got, want)
	}
}

// =========================================================================
// Payment — the safety-critical surface
// =========================================================================

func TestPay_DocumentedStatusValues(t *testing.T) {
	cases := []struct {
		name string
		body string
		want provider.Outcome
	}{
		{
			"SUCCESS is terminal success",
			`{"success":true,"data":{"status":"SUCCESS","txId":"223407623","balance":200000.0,"mobikwikstamp":"MBK766722936","discountprice":10.0}}`,
			provider.OutcomeSuccess,
		},
		{
			// The provider returns HTTP 200 with success:true for a pending
			// payment. It must not be reported as complete.
			"SUCCESSPENDING requires a status check",
			`{"success":true,"data":{"status":"SUCCESSPENDING","txId":"xxxxxxxxx","balance":299.5,"mobikwikstamp":"xxxxxxxxxxx","discountprice":10.0}}`,
			provider.OutcomePending,
		},
		{
			"RECHARGEFAILURE is terminal failure",
			`{"success":true,"data":{"status":"RECHARGEFAILURE","txId":"x","balance":100.0}}`,
			provider.OutcomeFailed,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doer := &scriptedDoer{responses: []scriptedResponse{
				{status: 200, body: tokenOK},
				{status: 200, body: tc.body},
			}}
			c := newClient(t, doer)

			res, _ := c.Pay(context.Background(), PaymentRequest{
				Connection: "9876543210", OperatorID: "7", Amount: "10",
				ReqID: "tessjdk103", CustomerMobile: "9999999999",
				RemitterName: "P****na T****g", PaymentRefID: "NX231107767681728991",
				PaymentMode: "UPI", PaymentAccountInfo: "1234567890@ybl",
			})
			if res == nil {
				t.Fatal("Result must be returned so the outcome is inspectable")
			}
			if res.Outcome != tc.want {
				t.Errorf("Outcome = %q, want %q", res.Outcome, tc.want)
			}
		})
	}
}

// TestPay_InconclusiveFailureRequiresStatusCheck covers the specification's most
// dangerous case. Under "Final Notes" it states a status recheck is required when
// "Sorry! The transaction couldn't succeed" is returned. That response looks like
// a failure but is indeterminate: treating it as failed would reverse the wallet
// hold for a payment that may have gone through.
func TestPay_InconclusiveFailureRequiresStatusCheck(t *testing.T) {
	// Both apostrophe forms are covered: the specification prints a curly
	// apostrophe, while a JSON encoder may emit a straight one.
	bodies := []string{
		`{"success":false,"message":{"code":"500","text":"Sorry! The transaction couldn’t succeed"}}`,
		`{"success":false,"message":{"code":"500","text":"Sorry! The transaction couldn't succeed"}}`,
		`{"success":false,"message":{"code":"500","text":"Something went wrong. Please try again later."}}`,
	}

	for _, body := range bodies {
		doer := &scriptedDoer{responses: []scriptedResponse{
			{status: 200, body: tokenOK},
			{status: 200, body: body},
		}}
		res, _ := newClient(t, doer).Pay(context.Background(), PaymentRequest{
			Connection: "7797833489", OperatorID: "19", Amount: "200",
			ReqID: "testshkdfcj9168", CustomerMobile: "9999999999",
			RemitterName: "x", PaymentRefID: "xxxx", PaymentMode: "UPI",
			PaymentAccountInfo: "xxxx@ybl",
		})

		if res == nil {
			t.Fatalf("Result must be returned for %s", body)
		}
		if res.Outcome == provider.OutcomeFailed {
			t.Errorf("inconclusive payment response was classified as failed, which would "+
				"wrongly reverse the hold: %s", body)
		}
		if !res.Outcome.NeedsStatusCheck() {
			t.Errorf("Outcome = %q, want one that triggers a status check: %s", res.Outcome, body)
		}
	}
}

func TestPay_TimeoutAndServerErrorAreInconclusive(t *testing.T) {
	for name, resp := range map[string]scriptedResponse{
		"transport timeout": {err: context.DeadlineExceeded},
		"http 500":          {status: 500, body: `{"success":false,"message":{"code":"500","text":"internal"}}`},
		"http 504":          {status: 504, body: `gateway timeout`},
	} {
		t.Run(name, func(t *testing.T) {
			doer := &scriptedDoer{responses: []scriptedResponse{{status: 200, body: tokenOK}, resp}}
			res, _ := newClient(t, doer).Pay(context.Background(), PaymentRequest{
				Connection: "9876543210", OperatorID: "7", Amount: "10", ReqID: "req1",
				CustomerMobile: "9999999999", RemitterName: "x", PaymentRefID: "r",
				PaymentMode: "UPI", PaymentAccountInfo: "a@ybl",
			})
			if res == nil {
				t.Fatal("Result must be returned alongside the error")
			}
			if res.Outcome == provider.OutcomeFailed {
				t.Error("an inconclusive transport result must never be classified as failed")
			}
			if !res.Outcome.NeedsStatusCheck() {
				t.Errorf("Outcome = %q, want a status check", res.Outcome)
			}
		})
	}
}

func TestPay_SendsDocumentedFields(t *testing.T) {
	sink := &capturingSink{}
	c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"status":"SUCCESS","txId":"1","balance":1.0}}`},
	}}
	c = c.WithTransport(doer)

	if _, err := c.Pay(context.Background(), PaymentRequest{
		Connection: "9876543210", OperatorID: "7", CircleID: "", Amount: "10",
		ReqID: "tessjdk103", RemitterName: "P****na T****g",
		CustomerMobile: "9999999999", PaymentRefID: "NX231107767681728991",
		PaymentMode: "UPI", PaymentAccountInfo: "1234567890@ybl",
	}); err != nil {
		t.Fatalf("Pay: %v", err)
	}

	if got, want := doer.businessCall(t).req.URL.Path, "/recharge/v3/retailerPayment"; got != want {
		t.Errorf("path = %s, want %s", got, want)
	}

	payload := decryptPayload(t, sink, doer.businessCall(t).body)
	for field, want := range map[string]any{
		"cn":                 "9876543210",
		"op":                 "7",
		"amt":                "10",
		"reqid":              "tessjdk103",
		"remitterName":       "P****na T****g",
		"customerMobile":     "9999999999",
		"paymentRefID":       "NX231107767681728991",
		"paymentMode":        "UPI",
		"agentId":            "MK01MK01INB523643654",
		"paymentAccountInfo": "1234567890@ybl",
	} {
		if payload[field] != want {
			t.Errorf("payload[%q] = %v, want %v", field, payload[field], want)
		}
	}
}

func TestPay_RejectsOverlongReqID(t *testing.T) {
	// The specification caps reqid at 20 characters. Exceeding it risks silent
	// truncation upstream, which would make the status check query the wrong id.
	doer := &scriptedDoer{}
	_, err := newClient(t, doer).Pay(context.Background(), PaymentRequest{
		Connection: "9876543210", OperatorID: "7", Amount: "10",
		ReqID:          strings.Repeat("x", 21),
		CustomerMobile: "9999999999", RemitterName: "x", PaymentRefID: "r",
		PaymentMode: "UPI", PaymentAccountInfo: "a@ybl",
	})
	if err == nil {
		t.Fatal("expected an error for a reqid longer than 20 characters")
	}
	if len(doer.calls) != 0 {
		t.Error("no payment should be submitted when reqid is invalid")
	}
}

// =========================================================================
// Status check
// =========================================================================

func TestStatus_DocumentedStatusValues(t *testing.T) {
	cases := []struct {
		name string
		body string
		want provider.Outcome
	}{
		{
			"RECHARGESUCCESS",
			`{"success":true,"data":{"txId":"x","status":"RECHARGESUCCESS","description":"Recharge Successful","discountedPrice":100.0,"balance":99999900.0,"operatorRefNo":"y","mobikwikStamp":"z"}}`,
			provider.OutcomeSuccess,
		},
		{
			"RECHARGESUCCESSPENDING",
			`{"success":true,"data":{"txId":"x","status":"RECHARGESUCCESSPENDING","description":"Recharge Initiated","operatorRefNo":null,"mobikwikStamp":"z"}}`,
			provider.OutcomePending,
		},
		{
			"RECHARGEFAILURE",
			`{"success":true,"data":{"txId":"x","status":"RECHARGEFAILURE","description":"Recharge Failed","discountedPrice":0.0,"balance":100000000.0}}`,
			provider.OutcomeFailed,
		},
		{
			// The failed-case example uses txStatus rather than status.
			"txStatus alias",
			`{"success":true,"data":{"txStatus":"RECHARGEFAILURE","mobikwikrefno":"Init","statusDetails":"Recharge Failed","operatorname":"bsnl"}}`,
			provider.OutcomeFailed,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			doer := &scriptedDoer{responses: []scriptedResponse{
				{status: 200, body: tokenOK},
				{status: 200, body: tc.body},
			}}
			res, _ := newClient(t, doer).Status(context.Background(), StatusRequest{TxID: "863065445721724_test10"})
			if res == nil {
				t.Fatal("Result must be returned")
			}
			if res.Outcome != tc.want {
				t.Errorf("Outcome = %q, want %q", res.Outcome, tc.want)
			}
		})
	}
}

// TestStatus_InvalidTransactionIDIsNotSilentlySuccessful covers the documented
// case where a status check for an unknown id returns success:false with code
// 500 and "Invalid transaction ID!".
func TestStatus_InvalidTransactionIDIsNotSilentlySuccessful(t *testing.T) {
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":false,"message":{"code":"500","text":"Invalid transaction ID!"}}`},
	}}
	res, err := newClient(t, doer).Status(context.Background(), StatusRequest{TxID: "unknown"})

	if err == nil && res != nil && res.Outcome == provider.OutcomeSuccess {
		t.Fatal("an unknown transaction id must never resolve to success")
	}
}

func TestStatus_SendsOnlyTxID(t *testing.T) {
	sink := &capturingSink{}
	c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"txId":"x","status":"RECHARGESUCCESS"}}`},
	}}
	c = c.WithTransport(doer)

	if _, err := c.Status(context.Background(), StatusRequest{TxID: "863065445721724_test10"}); err != nil {
		t.Fatalf("Status: %v", err)
	}

	if got, want := doer.businessCall(t).req.URL.Path, "/recharge/v3/retailerStatus"; got != want {
		t.Errorf("path = %s, want %s", got, want)
	}

	payload := decryptPayload(t, sink, doer.businessCall(t).body)
	if payload["txId"] != "863065445721724_test10" {
		t.Errorf("payload = %v, want txId", payload)
	}
	if len(payload) != 1 {
		t.Errorf("status payload has %d fields, want exactly txId: %v", len(payload), payload)
	}
}

// =========================================================================
// Credit card and plans
// =========================================================================

func TestCreditCardBill_DocumentedContract(t *testing.T) {
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"statementDate":"2025-10-02","dueDate":"2025-10-25","dueAmount":2500.0,"minimumAmountDue":100.0}}`},
	}}
	res, err := newClient(t, doer).CreditCardBill(context.Background(), CreditCardBillRequest{
		Last4: "4357", Mobile: "7865789567", BankCode: "HDFC",
	})
	if err != nil {
		t.Fatalf("CreditCardBill: %v", err)
	}
	if res.DueAmount != 2500.0 || res.MinimumAmountDue != 100.0 {
		t.Errorf("amounts = %v / %v, want 2500 / 100", res.DueAmount, res.MinimumAmountDue)
	}
	if got, want := doer.businessCall(t).req.URL.Path, "/recharge/v3/retailerCCBill"; got != want {
		t.Errorf("path = %s, want %s", got, want)
	}
}

// TestPlans_IsUnencryptedGet verifies the plans endpoint, which the encryption
// section deliberately excludes: it is a plain GET with the X-MClient header.
func TestPlans_IsUnencryptedGet(t *testing.T) {
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"plans":[{"id":"1008583","operatorId":1,"circleId":1,"planType":3,"amount":10.0,"talktime":7.47,"validity":"NA days","planName":"Voice Tariff","planDescription":"Talktime of Rs. 7.47"}]}}`},
	}}
	c := newClient(t, doer)

	plans, err := c.Plans(context.Background(), PlansRequest{OperatorID: "1", CircleID: "1", PlanType: "3"})
	if err != nil {
		t.Fatalf("Plans: %v", err)
	}
	if len(plans) != 1 {
		t.Fatalf("parsed %d plans, want 1", len(plans))
	}

	call := doer.businessCall(t)
	if call.req.Method != http.MethodGet {
		t.Errorf("method = %s, want GET", call.req.Method)
	}
	if got, want := call.req.URL.Path, "/recharge/v1/rechargePlansAPI/1/1/3"; got != want {
		t.Errorf("path = %s, want %s", got, want)
	}
	if got := call.req.Header.Get("X-MClient"); got != "14" {
		t.Errorf("X-MClient = %q, want 14 as documented", got)
	}
	if len(call.body) != 0 {
		t.Error("a GET plans request must not carry a body")
	}
}

// =========================================================================
// Cross-cutting
// =========================================================================

func TestNew_FailsFastOnBadPublicKey(t *testing.T) {
	cfg := testConfig()
	cfg.PublicKeyBase64 = "not-a-key"
	if _, err := New(cfg, nil, provider.NoopSink{}, cryptoenv.DefaultSuite()); err == nil {
		t.Fatal("a malformed public key must fail at construction, not on first use")
	}
}

func TestDisabledIntegrationRefusesCalls(t *testing.T) {
	cfg := testConfig()
	cfg.Enabled = false
	cfg.PublicKeyBase64 = ""

	c, err := New(cfg, nil, provider.NoopSink{}, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("a disabled integration should construct cleanly: %v", err)
	}
	if _, err := c.Balance(context.Background(), BalanceRequest{MemberID: "a@b.com"}); !errors.Is(err, provider.ErrIntegrationDisabled) {
		t.Errorf("error = %v, want ErrIntegrationDisabled", err)
	}
	if caps := c.Capabilities(); caps.Token || caps.Payment {
		t.Error("a disabled integration must advertise no capabilities")
	}
}

func TestCapabilities_AllDocumentedOperationsAvailable(t *testing.T) {
	// Every operation now has a documented contract, so none should be gated.
	caps := newClient(t, &scriptedDoer{}).Capabilities()

	for name, enabled := range map[string]bool{
		"Token":          caps.Token,
		"Plans":          caps.Plans,
		"Balance":        caps.Balance,
		"Validation":     caps.Validation,
		"ViewBill":       caps.ViewBill,
		"Payment":        caps.Payment,
		"Status":         caps.Status,
		"CreditCardBill": caps.CreditCardBill,
	} {
		if !enabled {
			t.Errorf("%s should be available: its contract is documented", name)
		}
	}
}

func TestTokenCachedAcrossOperations(t *testing.T) {
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"balance":1.0}}`},
		{status: 200, body: `{"success":true,"data":{"balance":2.0}}`},
		{status: 200, body: `{"success":true,"data":{"balance":3.0}}`},
	}}
	c := newClient(t, doer)

	for i := 0; i < 3; i++ {
		if _, err := c.Balance(context.Background(), BalanceRequest{MemberID: "a@b.com"}); err != nil {
			t.Fatalf("Balance #%d: %v", i, err)
		}
	}

	// One token plus three balance calls. Minting per request would exhaust the
	// documented 100-tokens-per-day quota.
	if len(doer.calls) != 4 {
		t.Errorf("made %d calls, want 4 (one token, three balance)", len(doer.calls))
	}
}

func TestAuditRecordCarriesBothEncryptedAndDecryptedHalves(t *testing.T) {
	// UAT checklist requirement: every logged request must show both the encrypted
	// and the decrypted value of the session key and payload.
	sink := &capturingSink{}
	c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	c = c.WithTransport(&scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		{status: 200, body: `{"success":true,"data":{"balance":10.0}}`},
	}})

	if _, err := c.Balance(context.Background(), BalanceRequest{MemberID: "a@b.com"}); err != nil {
		t.Fatalf("Balance: %v", err)
	}
	if len(sink.entries) < 2 {
		t.Fatalf("recorded %d entries, want at least 2", len(sink.entries))
	}

	business := sink.entries[len(sink.entries)-1]
	for name, value := range map[string]string{
		"EncryptedSessionKey": business.EncryptedSessionKey,
		"EncryptedPayload":    business.EncryptedPayload,
		"IV":                  business.IV,
		"KeyVersion":          business.KeyVersion,
		"RequestPlaintext":    business.RequestPlaintext,
		"SessionKeyBase64":    business.SessionKeyBase64,
		"Curl":                business.Curl,
	} {
		if value == "" {
			t.Errorf("audit entry field %s is empty; UAT evidence requires it", name)
		}
	}

	// The token must be masked: these rows are long-lived and admin-readable.
	if strings.Contains(business.Curl, "wQltGT9mP1HlXNHq0ZrdK-GhwdnHnIXs7mw33S8xTrI") {
		t.Error("cURL evidence leaks the raw auth token")
	}
}

func TestTokenRequestSecretRedactedFromAudit(t *testing.T) {
	// The client secret travels in a plaintext body, so it must not persist in the
	// audit trail.
	sink := &capturingSink{}
	c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	c = c.WithTransport(&scriptedDoer{responses: []scriptedResponse{{status: 200, body: tokenOK}}})

	if _, err := c.Token(context.Background()); err != nil {
		t.Fatalf("Token: %v", err)
	}
	if len(sink.entries) == 0 {
		t.Fatal("no audit entry recorded")
	}
	if strings.Contains(sink.entries[0].RequestPlaintext, testConfig().ClientSecret) {
		t.Error("audit record retains the raw client secret")
	}
}

// TestEncryptionIsRequestOnly documents an asymmetry in the protocol that is easy
// to get backwards.
//
// The specification's "Steps for Encryption" section describes only the request
// envelope, and every documented response body across Balance, Validation, View
// Bill, Payment and Status is plaintext JSON. So the client encrypts what it
// sends and parses what it receives as cleartext. This test pins that, because
// adding response decryption would break every call, and if the provider ever
// starts enveloping responses this test is where the change surfaces.
func TestEncryptionIsRequestOnly(t *testing.T) {
	sink := &capturingSink{}
	c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	doer := &scriptedDoer{responses: []scriptedResponse{
		{status: 200, body: tokenOK},
		// Plaintext response, exactly as the Balance Check section shows it.
		{status: 200, body: `{"success":true,"data":{"balance":303.5}}`},
	}}
	c = c.WithTransport(doer)

	res, err := c.Balance(context.Background(), BalanceRequest{MemberID: "testalpha1@gmail.com"})
	if err != nil {
		t.Fatalf("Balance: %v", err)
	}
	if res.Balance != 303.5 {
		t.Errorf("Balance = %v, want 303.5 parsed from a plaintext response", res.Balance)
	}

	// The request, by contrast, must have been enveloped.
	body := doer.businessCall(t).body
	if !strings.Contains(string(body), "encryptedPayload") {
		t.Error("the request should be encrypted even though the response is not")
	}
	if strings.Contains(string(body), "testalpha1@gmail.com") {
		t.Error("memberId leaked in cleartext in the request body")
	}
}

func TestNewReqID(t *testing.T) {
	// reqid is capped at 20 characters and must be unique, since it is both the
	// idempotency key and the handle used for status checks.
	seen := map[string]bool{}
	for i := 0; i < 500; i++ {
		id := NewReqID("UP")
		if len(id) > 20 {
			t.Fatalf("NewReqID returned %d characters: %q", len(id), id)
		}
		if !strings.HasPrefix(id, "UP") {
			t.Fatalf("NewReqID lost its prefix: %q", id)
		}
		if seen[id] {
			t.Fatalf("NewReqID collision at iteration %d: %q", i, id)
		}
		seen[id] = true
	}
}

func TestFormatAmount(t *testing.T) {
	// The provider takes amounts as decimal strings, so formatting must be exact
	// and never use scientific notation.
	for in, want := range map[float64]string{
		10:      "10",
		10.5:    "10.5",
		1250.50: "1250.5",
		0:       "0",
		200:     "200",
	} {
		if got := FormatAmount(in); got != want {
			t.Errorf("FormatAmount(%v) = %q, want %q", in, got, want)
		}
	}
}

// TestLocalValidationIsDistinguishableFromOutage guards a real bug that shipped
// once: a missing mandatory field was surfacing to the user as "the service is
// not responding", because the generic outcome classifier defaults unknown errors
// to inconclusive. Callers must be able to tell the two apart.
func TestLocalValidationIsDistinguishableFromOutage(t *testing.T) {
	// Each case gets a fresh doer, so the "no HTTP call" assertion measures only
	// that case rather than accumulating across subtests.
	cases := map[string]func(*Client, context.Context) error{
		"view bill without connection": func(c *Client, ctx context.Context) error {
			_, err := c.ViewBill(ctx, ViewBillRequest{OperatorID: "31", CircleID: "1"})
			return err
		},
		"validation without amount": func(c *Client, ctx context.Context) error {
			_, err := c.Validate(ctx, ValidationRequest{Connection: "9876543210", OperatorID: "7"})
			return err
		},
		"payment without mode": func(c *Client, ctx context.Context) error {
			_, err := c.Pay(ctx, PaymentRequest{
				Connection: "9876543210", OperatorID: "7", Amount: "10", ReqID: "r1",
				CustomerMobile: "9999999999", RemitterName: "x",
			})
			return err
		},
		"status without txId": func(c *Client, ctx context.Context) error {
			_, err := c.Status(ctx, StatusRequest{})
			return err
		},
		"balance without memberId": func(c *Client, ctx context.Context) error {
			_, err := c.Balance(ctx, BalanceRequest{})
			return err
		},
	}

	for name, invoke := range cases {
		t.Run(name, func(t *testing.T) {
			doer := &scriptedDoer{}
			err := invoke(newClient(t, doer), context.Background())

			if err == nil {
				t.Fatal("expected a validation error")
			}
			// No network call may be attempted for a request we already know is
			// invalid, and no token quota may be spent on it.
			if len(doer.calls) != 0 {
				t.Errorf("made %d HTTP calls for an invalid request, want 0", len(doer.calls))
			}
		})
	}
}

// TestViewBillValidationMatchesSpecPrecisely captures a subtlety worth pinning.
//
// The request-parameter table marks cir mandatory, but the specification's own
// View Bill sample sends "cir": "". So the field must be present in the payload
// while its value may be empty, and requiring a non-empty circle would reject
// requests the provider accepts.
func TestViewBillValidationMatchesSpecPrecisely(t *testing.T) {
	t.Run("empty circle is accepted", func(t *testing.T) {
		sink := &capturingSink{}
		c, err := New(testConfig(), &MemoryTokenStore{}, sink, cryptoenv.DefaultSuite())
		if err != nil {
			t.Fatalf("New: %v", err)
		}
		doer := &scriptedDoer{responses: []scriptedResponse{
			{status: 200, body: tokenOK},
			{status: 200, body: `{"success":true,"data":[{"billAmount":"100.0","dueDate":"15-Dec-2025","acceptPayment":true}]}`},
		}}
		c = c.WithTransport(doer)

		if _, err := c.ViewBill(context.Background(), ViewBillRequest{
			Connection: "151608882", OperatorID: "31", CircleID: "",
		}); err != nil {
			t.Fatalf("an empty circle should be accepted, as the spec sample shows: %v", err)
		}

		// The key is that cir is still transmitted, just empty.
		payload := decryptPayload(t, sink, doer.businessCall(t).body)
		cir, present := payload["cir"]
		if !present {
			t.Error("cir must be present in the payload even when empty")
		}
		if cir != "" {
			t.Errorf("cir = %v, want an empty string", cir)
		}
	})

	t.Run("missing connection is rejected", func(t *testing.T) {
		doer := &scriptedDoer{}
		_, err := newClient(t, doer).ViewBill(context.Background(), ViewBillRequest{OperatorID: "31"})
		if !errors.Is(err, ErrInvalidRequest) {
			t.Errorf("error %v should wrap ErrInvalidRequest", err)
		}
		if !strings.Contains(err.Error(), "cn") {
			t.Errorf("error %q should name the missing cn field", err)
		}
	})
}
