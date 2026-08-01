package provider

import (
	"errors"
	"fmt"
)

// ErrIntegrationDisabled is returned when an operation is attempted against a
// provider that is switched off by configuration.
var ErrIntegrationDisabled = errors.New("integration is disabled")

// APIError is a business-level rejection reported by a provider.
//
// It carries an Outcome so callers can decide whether to reverse a wallet hold
// immediately or wait for reconciliation, without re-inspecting status codes.
type APIError struct {
	Provider string
	Op       string
	Status   int
	Code     string
	Message  string
	Outcome  Outcome
}

// Error implements error.
func (e *APIError) Error() string {
	if e.Code != "" {
		return fmt.Sprintf("%s %s: [%s] %s (http %d)", e.Provider, e.Op, e.Code, e.Message, e.Status)
	}
	return fmt.Sprintf("%s %s: %s (http %d)", e.Provider, e.Op, e.Message, e.Status)
}

// ClassifiedOutcome exposes the outcome for callers that only hold an error.
func (e *APIError) ClassifiedOutcome() Outcome {
	if e.Outcome == "" {
		return OutcomeFailed
	}
	return e.Outcome
}

// OutcomeOf extracts the Outcome carried by an error, defaulting to
// OutcomeTimeout for unrecognised errors.
//
// Defaulting to timeout rather than failure is deliberate: an unknown error must
// not cause an automatic reversal of a transaction that may have succeeded
// upstream.
func OutcomeOf(err error) Outcome {
	if err == nil {
		return OutcomeSuccess
	}
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.ClassifiedOutcome()
	}
	if errors.Is(err, ErrIntegrationDisabled) {
		return OutcomeFailed
	}
	return OutcomeTimeout
}

// IsAuthExpired reports whether an error indicates a rejected or expired token,
// which the caller should resolve by refreshing and retrying once.
func IsAuthExpired(err error) bool {
	var apiErr *APIError
	if errors.As(err, &apiErr) {
		return apiErr.Outcome == OutcomeAuthExpired
	}
	return false
}
