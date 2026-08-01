package service

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/auth"
	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// AuthService handles sign-in, token refresh and sign-out.
type AuthService struct {
	db      *gorm.DB
	tokens  *auth.Manager
	lockout auth.LockoutPolicy
}

// NewAuthService builds an AuthService.
func NewAuthService(db *gorm.DB, tokens *auth.Manager) *AuthService {
	return &AuthService{
		db:      db,
		tokens:  tokens,
		lockout: auth.DefaultLockoutPolicy(),
	}
}

// LoginInput is a sign-in request.
type LoginInput struct {
	Email     string
	Password  string
	IPAddress string
	UserAgent string
}

// Session is what a successful sign-in returns.
type Session struct {
	AccessToken  string      `json:"accessToken"`
	RefreshToken string      `json:"refreshToken"`
	ExpiresAt    time.Time   `json:"expiresAt"`
	User         SessionUser `json:"user"`
}

// SessionUser is the identity payload the frontend stores.
//
// It mirrors what utility-frontend's auth context expects, so the UI needs no
// translation layer.
type SessionUser struct {
	ID         uuid.UUID   `json:"id"`
	Name       string      `json:"name"`
	Email      string      `json:"email"`
	Phone      string      `json:"phone,omitempty"`
	Role       models.Role `json:"role"`
	RetailerID *uuid.UUID  `json:"retailerId,omitempty"`
	ShopName   string      `json:"shopName,omitempty"`
	KYCStatus  string      `json:"kycStatus,omitempty"`
}

// Login authenticates a user and issues a session.
//
// The returned error is deliberately identical for "no such account" and "wrong
// password": distinguishing them would let an attacker enumerate valid emails.
func (s *AuthService) Login(ctx context.Context, in LoginInput) (*Session, error) {
	email := auth.NormalizeEmail(in.Email)

	var user models.User
	err := s.db.WithContext(ctx).
		Preload("Retailer").
		Where("lower(email) = ?", email).
		First(&user).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		// A bcrypt comparison against a dummy hash keeps the response time for a
		// missing account similar to that of a wrong password, closing a timing
		// side channel that would otherwise reveal which emails are registered.
		auth.VerifyPassword("$2a$12$vvvvvvvvvvvvvvvvvvvvvuvvvvvvvvvvvvvvvvvvvvvvvvvvvvvvv", in.Password)
		s.recordLogin(ctx, uuid.Nil, in, false, "account not found")
		return nil, auth.ErrInvalidCredentials
	}
	if err != nil {
		return nil, fmt.Errorf("auth: load user: %w", err)
	}

	if user.IsLocked() {
		s.recordLogin(ctx, user.ID, in, false, "account locked")
		return nil, fmt.Errorf("%w: too many failed attempts, try again later", httpx.ErrForbidden)
	}
	if user.Status != models.AccountActive {
		s.recordLogin(ctx, user.ID, in, false, "account "+string(user.Status))
		return nil, fmt.Errorf("%w: this account is %s", httpx.ErrForbidden, user.Status)
	}

	if !auth.VerifyPassword(user.PasswordHash, in.Password) {
		s.registerFailure(ctx, &user)
		s.recordLogin(ctx, user.ID, in, false, "wrong password")
		return nil, auth.ErrInvalidCredentials
	}

	return s.issueSession(ctx, &user, in)
}

// registerFailure increments the failure counter and locks the account when the
// policy threshold is reached.
func (s *AuthService) registerFailure(ctx context.Context, user *models.User) {
	attempts := user.FailedLoginAttempts + 1
	updates := map[string]any{"failed_login_attempts": attempts}

	if s.lockout.ShouldLock(attempts) {
		until := time.Now().UTC().Add(s.lockout.LockFor)
		updates["locked_until"] = until
		// Reset the counter alongside the lock so the next window starts clean.
		updates["failed_login_attempts"] = 0
	}

	// A failure to persist the counter must not turn a wrong password into a
	// server error, so the result is intentionally not propagated.
	_ = s.db.WithContext(ctx).Model(&models.User{}).Where("id = ?", user.ID).Updates(updates).Error
}

// issueSession mints tokens and records the successful login.
func (s *AuthService) issueSession(ctx context.Context, user *models.User, in LoginInput) (*Session, error) {
	var retailerID *uuid.UUID
	var shopName, kycStatus string
	if user.Retailer != nil {
		id := user.Retailer.ID
		retailerID = &id
		shopName = user.Retailer.ShopName
		kycStatus = string(user.Retailer.KYCStatus)
	}

	accessToken, expiresAt, err := s.tokens.IssueAccessToken(user, retailerID)
	if err != nil {
		return nil, err
	}

	refreshPlain, refreshHash, err := auth.GenerateRefreshToken()
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(&models.RefreshToken{
			UserID:    user.ID,
			TokenHash: refreshHash,
			ExpiresAt: now.Add(s.tokens.RefreshTTL()),
			IPAddress: in.IPAddress,
			UserAgent: in.UserAgent,
		}).Error; err != nil {
			return fmt.Errorf("auth: store refresh token: %w", err)
		}

		return tx.Model(&models.User{}).Where("id = ?", user.ID).
			Updates(map[string]any{
				"last_login_at":         now,
				"failed_login_attempts": 0,
				"locked_until":          nil,
			}).Error
	})
	if err != nil {
		return nil, err
	}

	s.recordLogin(ctx, user.ID, in, true, "")

	return &Session{
		AccessToken:  accessToken,
		RefreshToken: refreshPlain,
		ExpiresAt:    expiresAt,
		User: SessionUser{
			ID:         user.ID,
			Name:       user.Name,
			Email:      user.Email,
			Phone:      user.Phone,
			Role:       user.Role,
			RetailerID: retailerID,
			ShopName:   shopName,
			KYCStatus:  kycStatus,
		},
	}, nil
}

// Refresh exchanges a valid refresh token for a new session.
//
// The presented token is revoked and replaced (rotation), so a leaked refresh
// token has a single use and its reuse is detectable.
func (s *AuthService) Refresh(ctx context.Context, refreshToken, ip, userAgent string) (*Session, error) {
	hash := auth.HashToken(refreshToken)

	var stored models.RefreshToken
	err := s.db.WithContext(ctx).Where("token_hash = ?", hash).First(&stored).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, auth.ErrTokenInvalid
	}
	if err != nil {
		return nil, fmt.Errorf("auth: load refresh token: %w", err)
	}
	if !stored.IsUsable() {
		return nil, auth.ErrTokenExpired
	}

	var user models.User
	if err := s.db.WithContext(ctx).Preload("Retailer").Where("id = ?", stored.UserID).First(&user).Error; err != nil {
		return nil, fmt.Errorf("auth: load user for refresh: %w", err)
	}
	if !user.CanLogin() {
		return nil, fmt.Errorf("%w: this account is not active", httpx.ErrForbidden)
	}

	now := time.Now().UTC()
	if err := s.db.WithContext(ctx).Model(&models.RefreshToken{}).
		Where("id = ?", stored.ID).
		Update("revoked_at", now).Error; err != nil {
		return nil, fmt.Errorf("auth: revoke old refresh token: %w", err)
	}

	return s.issueSession(ctx, &user, LoginInput{IPAddress: ip, UserAgent: userAgent})
}

// Logout revokes a refresh token.
func (s *AuthService) Logout(ctx context.Context, refreshToken string) error {
	if refreshToken == "" {
		// Nothing to revoke. Reporting success keeps sign-out idempotent.
		return nil
	}
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Model(&models.RefreshToken{}).
		Where("token_hash = ? AND revoked_at IS NULL", auth.HashToken(refreshToken)).
		Update("revoked_at", now).Error
}

// LogoutAll revokes every active refresh token for a user, used by the
// "sign out of all devices" control.
func (s *AuthService) LogoutAll(ctx context.Context, userID uuid.UUID) error {
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Model(&models.RefreshToken{}).
		Where("user_id = ? AND revoked_at IS NULL", userID).
		Update("revoked_at", now).Error
}

// Me returns the current user's identity payload.
func (s *AuthService) Me(ctx context.Context, userID uuid.UUID) (*SessionUser, error) {
	var user models.User
	err := s.db.WithContext(ctx).Preload("Retailer").Where("id = ?", userID).First(&user).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, httpx.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("auth: load current user: %w", err)
	}

	out := &SessionUser{
		ID:    user.ID,
		Name:  user.Name,
		Email: user.Email,
		Phone: user.Phone,
		Role:  user.Role,
	}
	if user.Retailer != nil {
		id := user.Retailer.ID
		out.RetailerID = &id
		out.ShopName = user.Retailer.ShopName
		out.KYCStatus = string(user.Retailer.KYCStatus)
	}
	return out, nil
}

// ChangePassword updates a user's password after verifying the current one.
func (s *AuthService) ChangePassword(ctx context.Context, userID uuid.UUID, currentPassword, newPassword string) error {
	var user models.User
	if err := s.db.WithContext(ctx).Where("id = ?", userID).First(&user).Error; err != nil {
		return fmt.Errorf("auth: load user: %w", err)
	}
	if !auth.VerifyPassword(user.PasswordHash, currentPassword) {
		return auth.ErrInvalidCredentials
	}

	hash, err := auth.HashPassword(newPassword)
	if err != nil {
		return err
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.User{}).Where("id = ?", userID).
			Update("password_hash", hash).Error; err != nil {
			return fmt.Errorf("auth: update password: %w", err)
		}
		// Every existing session is invalidated: a password change is the user's
		// signal that previous sessions should no longer be trusted.
		return tx.Model(&models.RefreshToken{}).
			Where("user_id = ? AND revoked_at IS NULL", userID).
			Update("revoked_at", time.Now().UTC()).Error
	})
}

// recordLogin appends a login-history row. Failures are swallowed because audit
// logging must never block authentication.
func (s *AuthService) recordLogin(ctx context.Context, userID uuid.UUID, in LoginInput, success bool, reason string) {
	if userID == uuid.Nil {
		// A login attempt for an unknown email has no user to attach to.
		return
	}
	_ = s.db.WithContext(ctx).Create(&models.LoginHistory{
		UserID:    userID,
		IPAddress: in.IPAddress,
		UserAgent: in.UserAgent,
		Device:    deviceFromUserAgent(in.UserAgent),
		Success:   success,
		Reason:    reason,
	}).Error
}

// deviceFromUserAgent produces a coarse device label for the login-history UI.
func deviceFromUserAgent(ua string) string {
	switch {
	case ua == "":
		return "Unknown"
	case containsAny(ua, "Android"):
		return "Android"
	case containsAny(ua, "iPhone", "iPad", "iOS"):
		return "iOS"
	case containsAny(ua, "Windows"):
		return "Windows"
	case containsAny(ua, "Macintosh", "Mac OS"):
		return "macOS"
	case containsAny(ua, "Linux"):
		return "Linux"
	default:
		return "Unknown"
	}
}

func containsAny(s string, needles ...string) bool {
	for _, n := range needles {
		if len(n) > 0 && len(s) >= len(n) {
			for i := 0; i+len(n) <= len(s); i++ {
				if s[i:i+len(n)] == n {
					return true
				}
			}
		}
	}
	return false
}
