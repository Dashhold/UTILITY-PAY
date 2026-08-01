// Package auth handles password hashing, JWT issuance and verification.
package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/models"
)

// DefaultBcryptCost is deliberately above bcrypt.DefaultCost. Password hashing
// is meant to be slow: cost 12 keeps verification near a quarter-second on
// typical hardware, which is unnoticeable for a login and expensive at scale for
// an attacker with a stolen table.
const DefaultBcryptCost = 12

// bcryptCost is the active cost factor.
//
// It is a variable rather than a constant only so tests can lower it. Cost 12
// under the race detector makes a test suite take minutes, which is a real cost
// with no security benefit in a test binary. Production never changes it.
var bcryptCost = DefaultBcryptCost

// SetBcryptCostForTesting lowers the hashing cost and returns a function that
// restores the previous value.
//
// It panics if given a cost outside bcrypt's accepted range, so a typo cannot
// silently disable hashing strength.
func SetBcryptCostForTesting(cost int) (restore func()) {
	if cost < bcrypt.MinCost || cost > bcrypt.MaxCost {
		panic(fmt.Sprintf("auth: bcrypt cost %d outside valid range %d-%d",
			cost, bcrypt.MinCost, bcrypt.MaxCost))
	}
	previous := bcryptCost
	bcryptCost = cost
	return func() { bcryptCost = previous }
}

// Sentinel errors returned by this package.
var (
	ErrInvalidCredentials = errors.New("auth: invalid email or password")
	ErrTokenExpired       = errors.New("auth: token expired")
	ErrTokenInvalid       = errors.New("auth: token invalid")
	ErrWeakPassword       = errors.New("auth: password does not meet the minimum requirements")
)

// HashPassword validates a user-chosen password against the strength policy and
// returns a bcrypt digest.
//
// Use this for anything a user types: registration, password change, admin
// reset. For operator-provisioned credentials see HashProvisionedPassword.
func HashPassword(plain string) (string, error) {
	if err := ValidatePasswordStrength(plain); err != nil {
		return "", err
	}
	return HashProvisionedPassword(plain)
}

// HashProvisionedPassword hashes a password without applying the strength
// policy.
//
// This exists for credentials an operator sets deliberately, such as the seeded
// demo accounts, where the value is fixed by an external decision rather than
// chosen by an end user. It is intentionally separate from HashPassword so that
// bypassing the policy is always an explicit, greppable choice rather than a
// default. It still refuses an empty password and still respects bcrypt's 72-byte
// input limit.
func HashProvisionedPassword(plain string) (string, error) {
	if plain == "" {
		return "", fmt.Errorf("%w: password must not be empty", ErrWeakPassword)
	}
	// Beyond 72 bytes bcrypt silently ignores the remainder, which would make two
	// different passwords interchangeable.
	if len(plain) > 72 {
		return "", fmt.Errorf("%w: password must be at most 72 bytes", ErrWeakPassword)
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	if err != nil {
		return "", fmt.Errorf("auth: hash password: %w", err)
	}
	return string(hash), nil
}

// VerifyPassword compares a plaintext password against a stored digest.
//
// bcrypt.CompareHashAndPassword is constant-time with respect to the hash, so a
// timing side channel cannot reveal how much of the password matched.
func VerifyPassword(hash, plain string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// ValidatePasswordStrength enforces a minimum policy.
//
// The rules are intentionally modest but non-negotiable: length does most of the
// work, and the character-class requirement blocks the most common weak choices.
func ValidatePasswordStrength(p string) error {
	if len(p) < 8 {
		return fmt.Errorf("%w: must be at least 8 characters", ErrWeakPassword)
	}
	if len(p) > 128 {
		// bcrypt silently truncates beyond 72 bytes; rejecting very long input
		// avoids the surprise of two different passwords hashing identically.
		return fmt.Errorf("%w: must be at most 128 characters", ErrWeakPassword)
	}

	var hasLetter, hasDigit bool
	for _, r := range p {
		switch {
		case unicode.IsLetter(r):
			hasLetter = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}
	if !hasLetter || !hasDigit {
		return fmt.Errorf("%w: must contain at least one letter and one digit", ErrWeakPassword)
	}
	return nil
}

// Claims is the JWT payload.
type Claims struct {
	jwt.RegisteredClaims

	UserID uuid.UUID   `json:"uid"`
	Role   models.Role `json:"role"`
	Email  string      `json:"email"`
	// RetailerID is present only for retailer tokens, so a handler can scope a
	// query without an extra lookup.
	RetailerID *uuid.UUID `json:"rid,omitempty"`
}

// Manager issues and verifies tokens.
type Manager struct {
	secret     []byte
	issuer     string
	accessTTL  time.Duration
	refreshTTL time.Duration
}

// NewManager builds a Manager.
func NewManager(cfg config.JWTConfig) *Manager {
	return &Manager{
		secret:     []byte(cfg.Secret),
		issuer:     cfg.Issuer,
		accessTTL:  cfg.AccessTokenTTL,
		refreshTTL: cfg.RefreshTokenTTL,
	}
}

// AccessTTL returns the configured access-token lifetime.
func (m *Manager) AccessTTL() time.Duration { return m.accessTTL }

// RefreshTTL returns the configured refresh-token lifetime.
func (m *Manager) RefreshTTL() time.Duration { return m.refreshTTL }

// IssueAccessToken mints a signed access token for a user.
func (m *Manager) IssueAccessToken(user *models.User, retailerID *uuid.UUID) (string, time.Time, error) {
	now := time.Now().UTC()
	expiresAt := now.Add(m.accessTTL)

	claims := Claims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    m.issuer,
			Subject:   user.ID.String(),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			ID:        uuid.NewString(),
		},
		UserID:     user.ID,
		Role:       user.Role,
		Email:      user.Email,
		RetailerID: retailerID,
	}

	signed, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(m.secret)
	if err != nil {
		return "", time.Time{}, fmt.Errorf("auth: sign token: %w", err)
	}
	return signed, expiresAt, nil
}

// ParseAccessToken verifies a token and returns its claims.
func (m *Manager) ParseAccessToken(raw string) (*Claims, error) {
	claims := &Claims{}

	token, err := jwt.ParseWithClaims(raw, claims,
		func(t *jwt.Token) (any, error) {
			// Pinning the algorithm is essential: without it a token could be
			// presented with alg=none, or an RSA public key could be abused as
			// an HMAC secret.
			if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
				return nil, fmt.Errorf("auth: unexpected signing method %q", t.Method.Alg())
			}
			return m.secret, nil
		},
		jwt.WithIssuer(m.issuer),
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
	)

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, fmt.Errorf("%w: %v", ErrTokenInvalid, err)
	}
	if !token.Valid {
		return nil, ErrTokenInvalid
	}
	if !claims.Role.Valid() {
		return nil, fmt.Errorf("%w: unknown role %q", ErrTokenInvalid, claims.Role)
	}
	return claims, nil
}

// GenerateRefreshToken returns a new opaque refresh token and its storage hash.
//
// The plaintext goes to the client and the hash to the database, so a database
// disclosure yields no usable sessions.
func GenerateRefreshToken() (plaintext, hash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("auth: generate refresh token: %w", err)
	}
	plaintext = base64.RawURLEncoding.EncodeToString(buf)
	return plaintext, HashToken(plaintext), nil
}

// HashToken returns the hex SHA-256 of a token.
//
// SHA-256 rather than bcrypt is correct here: the input is 256 bits of entropy,
// so it is not brute-forceable and a slow hash would only add latency.
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// GenerateAPIKey returns a new API key, its display prefix, and its storage hash.
func GenerateAPIKey() (plaintext, prefix, hash string, err error) {
	buf := make([]byte, 24)
	if _, err := rand.Read(buf); err != nil {
		return "", "", "", fmt.Errorf("auth: generate api key: %w", err)
	}
	body := base64.RawURLEncoding.EncodeToString(buf)
	plaintext = "up_live_" + body
	// The prefix is stored in cleartext so the UI can identify a key without
	// holding the secret.
	prefix = plaintext[:16]
	return plaintext, prefix, HashToken(plaintext), nil
}

// NormalizeEmail lowercases and trims an email so lookups are consistent with
// the database's functional unique index on lower(email).
func NormalizeEmail(email string) string {
	return strings.ToLower(strings.TrimSpace(email))
}

// LockoutPolicy describes login throttling.
type LockoutPolicy struct {
	MaxAttempts int
	LockFor     time.Duration
}

// DefaultLockoutPolicy locks an account for 15 minutes after 5 consecutive
// failures. This blunts credential stuffing without giving an attacker an easy
// way to deny service to a real user for long.
func DefaultLockoutPolicy() LockoutPolicy {
	return LockoutPolicy{MaxAttempts: 5, LockFor: 15 * time.Minute}
}

// ShouldLock reports whether the attempt count warrants a lock.
func (p LockoutPolicy) ShouldLock(failedAttempts int) bool {
	return failedAttempts >= p.MaxAttempts
}
