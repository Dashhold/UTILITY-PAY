// Package provider holds shared plumbing for outbound integrations: a logging
// HTTP transport, error classification, and the audit sink required for UAT
// evidence.
package provider

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Outcome classifies the result of an upstream call.
//
// The distinction between Failed, Pending and TimedOut is the crux of UAT
// checklist item 16: a timeout means we never learned the provider's verdict,
// so the money may well have moved. It must never be treated as a failure.
type Outcome string

const (
	// OutcomeSuccess means the provider returned a definitive success.
	OutcomeSuccess Outcome = "success"
	// OutcomeFailed means the provider returned a definitive rejection. Safe to
	// reverse any hold immediately.
	OutcomeFailed Outcome = "failed"
	// OutcomePending means the provider accepted the request but has not
	// settled it. Requires status polling.
	OutcomePending Outcome = "pending"
	// OutcomeTimeout means no verdict was received: connection timeout, read
	// timeout, or an inconclusive 5xx. Requires status polling and must not be
	// auto-reversed.
	OutcomeTimeout Outcome = "timeout"
	// OutcomeAuthExpired means the token was rejected; the caller should
	// refresh and retry once.
	OutcomeAuthExpired Outcome = "auth_expired"
)

// NeedsStatusCheck reports whether the outcome leaves the transaction
// unresolved and therefore requires reconciliation.
func (o Outcome) NeedsStatusCheck() bool {
	return o == OutcomePending || o == OutcomeTimeout
}

// IsTerminal reports whether the outcome is final.
func (o Outcome) IsTerminal() bool {
	return o == OutcomeSuccess || o == OutcomeFailed
}

// CallLog captures everything about one upstream call. It maps directly onto
// models.ProviderCallLog and satisfies the UAT evidence format.
type CallLog struct {
	Provider  string
	Operation string
	Attempt   int

	Method  string
	URL     string
	Headers http.Header

	// Envelope fields, populated for encrypted integrations.
	EncryptedSessionKey string
	EncryptedPayload    string
	KeyVersion          string
	IV                  string

	// Plaintext counterparts. UAT requires both halves for every logged call.
	RequestPlaintext  string
	SessionKeyBase64  string
	ResponseRaw       string
	ResponsePlaintext string

	StatusCode int
	Duration   time.Duration
	Curl       string
	Err        string

	TransactionID *uuid.UUID
	RetailerID    *uuid.UUID
}

// AuditSink persists call logs. Implementations must not block the caller for
// long; the database-backed sink writes a single row.
type AuditSink interface {
	Record(ctx context.Context, entry CallLog)
}

// NoopSink discards call logs. Used in tests.
type NoopSink struct{}

// Record implements AuditSink.
func (NoopSink) Record(context.Context, CallLog) {}

// Doer is the subset of *http.Client used here, so tests can substitute a stub.
type Doer interface {
	Do(*http.Request) (*http.Response, error)
}

// Client is a logging HTTP client shared by all provider integrations.
type Client struct {
	http     Doer
	sink     AuditSink
	provider string
	// redactHeaders lists header names whose values must be masked in audit
	// records. Authorization is masked by default so bearer tokens do not
	// accumulate in the database.
	redactHeaders map[string]bool
}

// NewClient builds a Client with a bounded-timeout http.Client.
func NewClient(providerName string, timeout time.Duration, sink AuditSink) *Client {
	if sink == nil {
		sink = NoopSink{}
	}
	return &Client{
		http: &http.Client{
			Timeout: timeout,
			Transport: &http.Transport{
				// Connection reuse matters: these providers are called on every
				// retailer transaction and TLS handshakes dominate latency
				// otherwise.
				MaxIdleConns:          100,
				MaxIdleConnsPerHost:   10,
				IdleConnTimeout:       90 * time.Second,
				TLSHandshakeTimeout:   10 * time.Second,
				ExpectContinueTimeout: 1 * time.Second,
				ForceAttemptHTTP2:     true,
			},
		},
		sink:          sink,
		provider:      providerName,
		redactHeaders: map[string]bool{"authorization": true, "x-api-key": true},
	}
}

// WithDoer replaces the underlying HTTP doer. Intended for tests.
func (c *Client) WithDoer(d Doer) *Client {
	clone := *c
	clone.http = d
	return &clone
}

// Request describes one outbound call.
type Request struct {
	Method    string
	URL       string
	Headers   map[string]string
	Body      []byte
	Operation string
	Attempt   int

	// Envelope metadata for the audit record; purely descriptive.
	EncryptedSessionKey string
	EncryptedPayload    string
	KeyVersion          string
	IV                  string
	RequestPlaintext    string
	SessionKeyBase64    string

	TransactionID *uuid.UUID
	RetailerID    *uuid.UUID
}

// Response is the result of a call.
type Response struct {
	StatusCode int
	Body       []byte
	Header     http.Header
	Duration   time.Duration
	// Outcome is the transport-level classification. Business-level
	// interpretation is the caller's job.
	Outcome Outcome
}

// Do executes the request, records an audit entry, and classifies the outcome.
//
// A non-nil error is always accompanied by a Response whose Outcome explains
// how the failure should be treated, so callers never have to guess whether a
// failed call is safe to reverse.
func (c *Client) Do(ctx context.Context, req Request) (*Response, error) {
	if req.Attempt <= 0 {
		req.Attempt = 1
	}

	httpReq, err := http.NewRequestWithContext(ctx, req.Method, req.URL, bytes.NewReader(req.Body))
	if err != nil {
		return &Response{Outcome: OutcomeFailed}, fmt.Errorf("provider: build request: %w", err)
	}
	for k, v := range req.Headers {
		httpReq.Header.Set(k, v)
	}

	entry := CallLog{
		Provider:            c.provider,
		Operation:           req.Operation,
		Attempt:             req.Attempt,
		Method:              req.Method,
		URL:                 req.URL,
		Headers:             httpReq.Header.Clone(),
		EncryptedSessionKey: req.EncryptedSessionKey,
		EncryptedPayload:    req.EncryptedPayload,
		KeyVersion:          req.KeyVersion,
		IV:                  req.IV,
		RequestPlaintext:    req.RequestPlaintext,
		SessionKeyBase64:    req.SessionKeyBase64,
		TransactionID:       req.TransactionID,
		RetailerID:          req.RetailerID,
		Curl:                c.buildCurl(req),
	}

	start := time.Now()
	httpResp, err := c.http.Do(httpReq)
	entry.Duration = time.Since(start)

	if err != nil {
		outcome := classifyTransportError(err)
		entry.Err = err.Error()
		c.sink.Record(ctx, entry)
		return &Response{Duration: entry.Duration, Outcome: outcome},
			fmt.Errorf("provider %s %s: %w", c.provider, req.Operation, err)
	}
	defer httpResp.Body.Close()

	// The body is read fully and capped: an unbounded provider response must
	// not be able to exhaust memory.
	body, readErr := io.ReadAll(io.LimitReader(httpResp.Body, maxResponseBytes))

	entry.StatusCode = httpResp.StatusCode
	entry.ResponseRaw = truncate(string(body), maxLoggedBody)

	if readErr != nil {
		entry.Err = readErr.Error()
		c.sink.Record(ctx, entry)
		// A partial read is inconclusive: the provider may have acted.
		return &Response{StatusCode: httpResp.StatusCode, Duration: entry.Duration, Outcome: OutcomeTimeout},
			fmt.Errorf("provider %s %s: read body: %w", c.provider, req.Operation, readErr)
	}

	c.sink.Record(ctx, entry)

	return &Response{
		StatusCode: httpResp.StatusCode,
		Body:       body,
		Header:     httpResp.Header,
		Duration:   entry.Duration,
		Outcome:    classifyStatus(httpResp.StatusCode),
	}, nil
}

const (
	maxResponseBytes = 8 << 20 // 8 MiB
	maxLoggedBody    = 64 << 10
)

// classifyTransportError maps a Go transport error onto an Outcome.
func classifyTransportError(err error) Outcome {
	// Context cancellation by our own deadline is inconclusive, not a failure.
	if errors.Is(err, context.DeadlineExceeded) {
		return OutcomeTimeout
	}
	if errors.Is(err, context.Canceled) {
		return OutcomeTimeout
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return OutcomeTimeout
	}

	var urlErr *url.Error
	if errors.As(err, &urlErr) {
		if urlErr.Timeout() {
			return OutcomeTimeout
		}
		// A refused connection or DNS failure means the request never reached
		// the provider, so nothing can have happened upstream.
		var dnsErr *net.DNSError
		if errors.As(urlErr.Err, &dnsErr) {
			return OutcomeFailed
		}
		var opErr *net.OpError
		if errors.As(urlErr.Err, &opErr) && opErr.Op == "dial" {
			return OutcomeFailed
		}
	}

	// Anything unrecognised is treated as inconclusive. Erring toward a status
	// check is safe; erring toward "failed" risks double-crediting a customer.
	return OutcomeTimeout
}

// classifyStatus maps an HTTP status onto an Outcome.
func classifyStatus(status int) Outcome {
	switch {
	case status >= 200 && status < 300:
		return OutcomeSuccess
	case status == http.StatusUnauthorized, status == http.StatusForbidden:
		return OutcomeAuthExpired
	case status == http.StatusRequestTimeout, status == http.StatusGatewayTimeout:
		return OutcomeTimeout
	case status == http.StatusTooManyRequests:
		return OutcomeTimeout
	case status >= 500:
		// A 5xx after the provider received the request is inconclusive.
		return OutcomeTimeout
	default:
		// 4xx other than auth is a definitive rejection of a malformed or
		// invalid request.
		return OutcomeFailed
	}
}

// buildCurl renders a reproducible cURL command.
//
// UAT checklist requires "Complete cURL Request (including headers)" for every
// logged API call, so this is evidence, not a debugging nicety.
func (c *Client) buildCurl(req Request) string {
	var b strings.Builder
	b.WriteString("curl --location --request ")
	b.WriteString(shellQuote(req.Method))
	b.WriteString(" ")
	b.WriteString(shellQuote(req.URL))

	// Headers are emitted in sorted order so the same call always renders
	// identically and diffs are meaningful.
	names := make([]string, 0, len(req.Headers))
	for k := range req.Headers {
		names = append(names, k)
	}
	sort.Strings(names)

	for _, k := range names {
		value := req.Headers[k]
		if c.redactHeaders[strings.ToLower(k)] {
			value = maskSecret(value)
		}
		b.WriteString(" \\\n  --header ")
		b.WriteString(shellQuote(k + ": " + value))
	}

	if len(req.Body) > 0 {
		b.WriteString(" \\\n  --data ")
		b.WriteString(shellQuote(truncate(string(req.Body), maxLoggedBody)))
	}
	return b.String()
}

// maskSecret keeps a short recognisable prefix so a log reader can correlate
// which credential was used without the value being reusable.
func maskSecret(v string) string {
	const keep = 8
	if len(v) <= keep {
		return "***"
	}
	return v[:keep] + "***REDACTED***"
}

// shellQuote wraps a value in single quotes, escaping embedded ones, so the
// rendered command is safe to paste even when values contain shell
// metacharacters.
func shellQuote(s string) string {
	return "'" + strings.ReplaceAll(s, "'", `'\''`) + "'"
}

func truncate(s string, limit int) string {
	if len(s) <= limit {
		return s
	}
	return s[:limit] + fmt.Sprintf("...[truncated %d bytes]", len(s)-limit)
}
