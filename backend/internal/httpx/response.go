// Package httpx holds HTTP response conventions shared by every handler.
package httpx

import (
	"errors"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

// Envelope is the response shape for every endpoint.
//
// A single consistent shape means the frontend has exactly one success path and
// one error path to handle, instead of guessing per endpoint.
type Envelope struct {
	Success bool   `json:"success"`
	Data    any    `json:"data,omitempty"`
	Error   *Error `json:"error,omitempty"`
	Meta    *Meta  `json:"meta,omitempty"`
}

// Error is a machine-readable failure description.
type Error struct {
	// Code is a stable identifier the frontend can branch on.
	Code string `json:"code"`
	// Message is safe to show a user.
	Message string `json:"message"`
	// Fields carries per-field validation messages.
	Fields map[string]string `json:"fields,omitempty"`
}

// Meta carries pagination details.
type Meta struct {
	Page       int   `json:"page"`
	PageSize   int   `json:"pageSize"`
	Total      int64 `json:"total"`
	TotalPages int   `json:"totalPages"`

	// Extra carries endpoint-specific aggregates that describe the whole filtered
	// set rather than the page, such as period credit and debit totals. It lives
	// in meta rather than data so the data array stays a plain list of rows.
	Extra map[string]any `json:"extra,omitempty"`
}

// Stable error codes. The frontend matches on these, so they must not change
// once released.
const (
	CodeValidation    = "VALIDATION_ERROR"
	CodeUnauthorized  = "UNAUTHORIZED"
	CodeForbidden     = "FORBIDDEN"
	CodeNotFound      = "NOT_FOUND"
	CodeConflict      = "CONFLICT"
	CodeRateLimited   = "RATE_LIMITED"
	CodeInternal      = "INTERNAL_ERROR"
	CodeUpstream      = "UPSTREAM_ERROR"
	CodeUnavailable   = "SERVICE_UNAVAILABLE"
	CodeInsufficient  = "INSUFFICIENT_BALANCE"
	CodeIdempotentHit = "IDEMPOTENT_REPLAY"
)

// OK writes a 200 with data.
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, Envelope{Success: true, Data: data})
}

// Created writes a 201 with data.
func Created(c *gin.Context, data any) {
	c.JSON(http.StatusCreated, Envelope{Success: true, Data: data})
}

// NoContent writes a 204.
func NoContent(c *gin.Context) { c.Status(http.StatusNoContent) }

// Paginated writes a 200 with data and pagination metadata.
func Paginated(c *gin.Context, data any, page, pageSize int, total int64) {
	PaginatedWithExtra(c, data, page, pageSize, total, nil)
}

// PaginatedWithExtra writes a paginated response carrying additional aggregates.
func PaginatedWithExtra(c *gin.Context, data any, page, pageSize int, total int64, extra map[string]any) {
	totalPages := 0
	if pageSize > 0 {
		totalPages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}
	c.JSON(http.StatusOK, Envelope{
		Success: true,
		Data:    data,
		Meta: &Meta{
			Page: page, PageSize: pageSize, Total: total,
			TotalPages: totalPages, Extra: extra,
		},
	})
}

// Fail writes an error response and aborts the handler chain.
//
// Aborting matters: without it a handler that has already written an error can
// continue and produce a second, contradictory body.
func Fail(c *gin.Context, status int, code, message string) {
	c.AbortWithStatusJSON(status, Envelope{
		Success: false,
		Error:   &Error{Code: code, Message: message},
	})
}

// FailFields writes a validation error carrying per-field messages.
func FailFields(c *gin.Context, fields map[string]string) {
	c.AbortWithStatusJSON(http.StatusBadRequest, Envelope{
		Success: false,
		Error: &Error{
			Code:    CodeValidation,
			Message: "One or more fields are invalid",
			Fields:  fields,
		},
	})
}

// Convenience wrappers for the common statuses.

// BadRequest writes a 400.
func BadRequest(c *gin.Context, message string) {
	Fail(c, http.StatusBadRequest, CodeValidation, message)
}

// Unauthorized writes a 401.
func Unauthorized(c *gin.Context, message string) {
	if message == "" {
		message = "Authentication required"
	}
	Fail(c, http.StatusUnauthorized, CodeUnauthorized, message)
}

// Forbidden writes a 403.
func Forbidden(c *gin.Context, message string) {
	if message == "" {
		message = "You do not have permission to perform this action"
	}
	Fail(c, http.StatusForbidden, CodeForbidden, message)
}

// NotFound writes a 404.
func NotFound(c *gin.Context, resource string) {
	if resource == "" {
		resource = "Resource"
	}
	Fail(c, http.StatusNotFound, CodeNotFound, resource+" not found")
}

// Conflict writes a 409.
func Conflict(c *gin.Context, message string) {
	Fail(c, http.StatusConflict, CodeConflict, message)
}

// Internal writes a 500 with a generic message.
//
// The underlying error is never echoed to the client: internal messages leak
// schema and dependency detail. Callers log the real error separately.
func Internal(c *gin.Context) {
	Fail(c, http.StatusInternalServerError, CodeInternal, "An unexpected error occurred")
}

// Unavailable writes a 503, used when an upstream integration is disabled or its
// contract is unconfirmed.
func Unavailable(c *gin.Context, message string) {
	if message == "" {
		message = "This service is temporarily unavailable"
	}
	Fail(c, http.StatusServiceUnavailable, CodeUnavailable, message)
}

// --- domain error mapping ---

// ErrNotFound and friends let the service layer signal intent without importing
// gin or knowing about HTTP.
var (
	ErrNotFound = errors.New("not found")
	ErrConflict = errors.New("conflict")
	// ErrValidation marks input the caller can fix. Without it a rejected value
	// would fall through to the default branch and be reported as a server fault,
	// telling the user to try again later when the fix is in their own hands.
	ErrValidation          = errors.New("validation")
	ErrForbidden           = errors.New("forbidden")
	ErrInsufficientBalance = errors.New("insufficient balance")
	ErrUnavailable         = errors.New("unavailable")
)

// FromError maps a service-layer error onto the right HTTP response.
//
// Anything unrecognised becomes a 500 with a generic message, so an unmapped
// internal error can never leak its text to a client.
func FromError(c *gin.Context, err error) {
	switch {
	case err == nil:
		return
	case errors.Is(err, ErrNotFound):
		NotFound(c, "Resource")
	case errors.Is(err, ErrConflict):
		Conflict(c, err.Error())
	case errors.Is(err, ErrValidation):
		// The sentinel prefix is stripped so the client sees only the actionable
		// part of the message.
		BadRequest(c, strings.TrimPrefix(err.Error(), ErrValidation.Error()+": "))
	case errors.Is(err, ErrForbidden):
		Forbidden(c, err.Error())
	case errors.Is(err, ErrInsufficientBalance):
		Fail(c, http.StatusPaymentRequired, CodeInsufficient, "Insufficient wallet balance")
	case errors.Is(err, ErrUnavailable):
		Unavailable(c, err.Error())
	default:
		Internal(c)
	}
}
