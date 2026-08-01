// Package middleware holds cross-cutting HTTP concerns.
package middleware

import (
	"errors"
	"log/slog"
	"net/http"
	"runtime/debug"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/auth"
	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// Context keys under which authenticated identity is stored.
const (
	CtxClaims     = "auth.claims"
	CtxUserID     = "auth.userID"
	CtxRole       = "auth.role"
	CtxRetailerID = "auth.retailerID"
	CtxRequestID  = "request.id"
)

// RequestID attaches a correlation id to every request and echoes it back, so a
// user-reported failure can be traced to exact log lines.
func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.GetHeader("X-Request-ID")
		if id == "" {
			id = uuid.NewString()
		}
		c.Set(CtxRequestID, id)
		c.Header("X-Request-ID", id)
		c.Next()
	}
}

// Recovery converts a panic into a 500 instead of dropping the connection.
func Recovery(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		defer func() {
			if r := recover(); r != nil {
				log.Error("panic recovered",
					slog.Any("panic", r),
					slog.String("path", c.Request.URL.Path),
					slog.String("method", c.Request.Method),
					slog.String("requestId", c.GetString(CtxRequestID)),
					// The stack goes to logs only; it must never reach the client.
					slog.String("stack", string(debug.Stack())),
				)
				httpx.Internal(c)
			}
		}()
		c.Next()
	}
}

// Logger records one structured line per request.
func Logger(log *slog.Logger) gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		path := c.Request.URL.Path

		c.Next()

		attrs := []any{
			slog.String("method", c.Request.Method),
			slog.String("path", path),
			slog.Int("status", c.Writer.Status()),
			slog.Duration("latency", time.Since(start)),
			slog.String("ip", c.ClientIP()),
			slog.String("requestId", c.GetString(CtxRequestID)),
		}
		if uid, ok := c.Get(CtxUserID); ok {
			attrs = append(attrs, slog.Any("userId", uid))
		}

		switch {
		case c.Writer.Status() >= 500:
			log.Error("request failed", attrs...)
		case c.Writer.Status() >= 400:
			log.Warn("request rejected", attrs...)
		default:
			log.Info("request", attrs...)
		}
	}
}

// SecurityHeaders sets conservative response headers.
func SecurityHeaders() gin.HandlerFunc {
	return func(c *gin.Context) {
		h := c.Writer.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		// This is a JSON API: a restrictive CSP costs nothing and blocks a
		// reflected-content attack from executing.
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(), camera=()")
		c.Next()
	}
}

// Auth verifies the bearer token and loads identity into the context.
//
// It re-checks account status against the database on every request rather than
// trusting the token alone, so suspending an account takes effect immediately
// instead of when its 24-hour token happens to expire.
func Auth(mgr *auth.Manager, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		raw := extractBearer(c.GetHeader("Authorization"))
		if raw == "" {
			httpx.Unauthorized(c, "Authorization header with a bearer token is required")
			return
		}

		claims, err := mgr.ParseAccessToken(raw)
		if err != nil {
			switch {
			case errors.Is(err, auth.ErrTokenExpired):
				httpx.Unauthorized(c, "Session expired, please sign in again")
			default:
				httpx.Unauthorized(c, "Invalid authentication token")
			}
			return
		}

		var user models.User
		if err := db.WithContext(c.Request.Context()).
			Select("id", "status", "role", "deleted_at", "locked_until").
			Where("id = ?", claims.UserID).
			First(&user).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				httpx.Unauthorized(c, "Account no longer exists")
				return
			}
			httpx.Internal(c)
			return
		}

		if !user.CanLogin() {
			httpx.Forbidden(c, "This account is not active")
			return
		}
		// A role change must invalidate an old token rather than let it keep the
		// previous privilege level.
		if user.Role != claims.Role {
			httpx.Unauthorized(c, "Session is no longer valid, please sign in again")
			return
		}

		c.Set(CtxClaims, claims)
		c.Set(CtxUserID, claims.UserID)
		c.Set(CtxRole, claims.Role)
		if claims.RetailerID != nil {
			c.Set(CtxRetailerID, *claims.RetailerID)
		}
		c.Next()
	}
}

// RequireRole restricts a route to the given roles.
func RequireRole(roles ...models.Role) gin.HandlerFunc {
	allowed := make(map[models.Role]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}

	return func(c *gin.Context) {
		role, ok := c.Get(CtxRole)
		if !ok {
			httpx.Unauthorized(c, "")
			return
		}
		if !allowed[role.(models.Role)] {
			httpx.Forbidden(c, "")
			return
		}
		c.Next()
	}
}

// RetailerScope ensures a retailer token carries a retailer profile.
//
// Without this, a retailer-scoped query would silently fall back to an
// unfiltered result set, which is a data-leak class of bug.
func RetailerScope() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, _ := c.Get(CtxRole)
		if role == models.RoleAdmin {
			c.Next()
			return
		}
		if _, ok := c.Get(CtxRetailerID); !ok {
			httpx.Forbidden(c, "No retailer profile is linked to this account")
			return
		}
		c.Next()
	}
}

// RateLimit applies a fixed-window per-key limit.
//
// This is a single-instance limiter. It is a useful guard against brute-force on
// login, but a multi-instance deployment needs a shared store (Redis) to enforce
// a global limit; see the note in the router.
type RateLimit struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
	lastGC time.Time
}

// NewRateLimit builds a limiter allowing limit requests per window.
func NewRateLimit(limit int, window time.Duration) *RateLimit {
	return &RateLimit{
		hits:   make(map[string][]time.Time),
		limit:  limit,
		window: window,
		lastGC: time.Now(),
	}
}

// Middleware returns the gin handler.
func (r *RateLimit) Middleware(keyFn func(*gin.Context) string) gin.HandlerFunc {
	if keyFn == nil {
		keyFn = func(c *gin.Context) string { return c.ClientIP() }
	}

	return func(c *gin.Context) {
		key := keyFn(c)
		if !r.allow(key) {
			c.Header("Retry-After", "60")
			httpx.Fail(c, http.StatusTooManyRequests, httpx.CodeRateLimited,
				"Too many requests, please try again shortly")
			return
		}
		c.Next()
	}
}

func (r *RateLimit) allow(key string) bool {
	now := time.Now()

	r.mu.Lock()
	defer r.mu.Unlock()

	// Periodic sweep stops the map growing without bound as keys go idle.
	if now.Sub(r.lastGC) > 5*time.Minute {
		for k, times := range r.hits {
			if len(times) == 0 || now.Sub(times[len(times)-1]) > r.window {
				delete(r.hits, k)
			}
		}
		r.lastGC = now
	}

	cutoff := now.Add(-r.window)
	kept := r.hits[key][:0]
	for _, t := range r.hits[key] {
		if t.After(cutoff) {
			kept = append(kept, t)
		}
	}

	if len(kept) >= r.limit {
		r.hits[key] = kept
		return false
	}

	r.hits[key] = append(kept, now)
	return true
}

// extractBearer pulls the token out of an Authorization header.
func extractBearer(header string) string {
	const prefix = "bearer "
	if len(header) <= len(prefix) || !strings.EqualFold(header[:len(prefix)], prefix) {
		return ""
	}
	return strings.TrimSpace(header[len(prefix):])
}

// UserID returns the authenticated user id from the context.
func UserID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(CtxUserID)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}

// RetailerID returns the authenticated retailer id from the context.
func RetailerID(c *gin.Context) (uuid.UUID, bool) {
	v, ok := c.Get(CtxRetailerID)
	if !ok {
		return uuid.Nil, false
	}
	id, ok := v.(uuid.UUID)
	return id, ok
}

// CurrentRole returns the authenticated role.
func CurrentRole(c *gin.Context) models.Role {
	v, ok := c.Get(CtxRole)
	if !ok {
		return ""
	}
	role, _ := v.(models.Role)
	return role
}
