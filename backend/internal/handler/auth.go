// Package handler contains HTTP handlers. Handlers validate input, delegate to
// the service layer, and shape the response; they hold no business logic.
package handler

import (
	"errors"
	"log/slog"
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/utilipay/backend/internal/auth"
	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/middleware"
	"github.com/utilipay/backend/internal/service"
)

// AuthHandler serves the authentication endpoints.
type AuthHandler struct {
	svc *service.AuthService
	log *slog.Logger
}

// NewAuthHandler builds an AuthHandler.
func NewAuthHandler(svc *service.AuthService, log *slog.Logger) *AuthHandler {
	return &AuthHandler{svc: svc, log: log}
}

// loginRequest is the sign-in body.
type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=1"`
}

// Login handles POST /api/v1/auth/login.
func (h *AuthHandler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.FailFields(c, map[string]string{
			"email":    "A valid email address is required",
			"password": "Password is required",
		})
		return
	}

	session, err := h.svc.Login(c.Request.Context(), service.LoginInput{
		Email:     req.Email,
		Password:  req.Password,
		IPAddress: c.ClientIP(),
		UserAgent: c.Request.UserAgent(),
	})
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrInvalidCredentials):
			// The same message for both causes, so valid emails cannot be
			// enumerated through the error text.
			httpx.Fail(c, http.StatusUnauthorized, httpx.CodeUnauthorized, "Invalid email or password")
		case errors.Is(err, httpx.ErrForbidden):
			httpx.Forbidden(c, err.Error())
		default:
			h.log.Error("login failed", slog.Any("error", err))
			httpx.Internal(c)
		}
		return
	}

	httpx.OK(c, session)
}

// refreshRequest is the token-refresh body.
type refreshRequest struct {
	RefreshToken string `json:"refreshToken" binding:"required"`
}

// Refresh handles POST /api/v1/auth/refresh.
func (h *AuthHandler) Refresh(c *gin.Context) {
	var req refreshRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.BadRequest(c, "refreshToken is required")
		return
	}

	session, err := h.svc.Refresh(c.Request.Context(), req.RefreshToken, c.ClientIP(), c.Request.UserAgent())
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrTokenInvalid), errors.Is(err, auth.ErrTokenExpired):
			httpx.Unauthorized(c, "Session expired, please sign in again")
		case errors.Is(err, httpx.ErrForbidden):
			httpx.Forbidden(c, err.Error())
		default:
			h.log.Error("refresh failed", slog.Any("error", err))
			httpx.Internal(c)
		}
		return
	}

	httpx.OK(c, session)
}

// Logout handles POST /api/v1/auth/logout.
func (h *AuthHandler) Logout(c *gin.Context) {
	var req refreshRequest
	// A missing body is tolerated: sign-out should succeed even if the client has
	// already discarded its refresh token.
	_ = c.ShouldBindJSON(&req)

	if err := h.svc.Logout(c.Request.Context(), req.RefreshToken); err != nil {
		h.log.Error("logout failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.OK(c, gin.H{"message": "Signed out"})
}

// LogoutAll handles POST /api/v1/auth/logout-all.
func (h *AuthHandler) LogoutAll(c *gin.Context) {
	userID, ok := middleware.UserID(c)
	if !ok {
		httpx.Unauthorized(c, "")
		return
	}
	if err := h.svc.LogoutAll(c.Request.Context(), userID); err != nil {
		h.log.Error("logout-all failed", slog.Any("error", err))
		httpx.Internal(c)
		return
	}
	httpx.OK(c, gin.H{"message": "Signed out of all devices"})
}

// Me handles GET /api/v1/auth/me.
func (h *AuthHandler) Me(c *gin.Context) {
	userID, ok := middleware.UserID(c)
	if !ok {
		httpx.Unauthorized(c, "")
		return
	}

	user, err := h.svc.Me(c.Request.Context(), userID)
	if err != nil {
		httpx.FromError(c, err)
		return
	}
	httpx.OK(c, user)
}

// changePasswordRequest is the password-change body.
type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=8"`
}

// ChangePassword handles POST /api/v1/auth/change-password.
func (h *AuthHandler) ChangePassword(c *gin.Context) {
	userID, ok := middleware.UserID(c)
	if !ok {
		httpx.Unauthorized(c, "")
		return
	}

	var req changePasswordRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		httpx.FailFields(c, map[string]string{
			"currentPassword": "Current password is required",
			"newPassword":     "New password must be at least 8 characters",
		})
		return
	}

	err := h.svc.ChangePassword(c.Request.Context(), userID, req.CurrentPassword, req.NewPassword)
	if err != nil {
		switch {
		case errors.Is(err, auth.ErrInvalidCredentials):
			httpx.Unauthorized(c, "Current password is incorrect")
		case errors.Is(err, auth.ErrWeakPassword):
			httpx.FailFields(c, map[string]string{"newPassword": err.Error()})
		default:
			h.log.Error("change password failed", slog.Any("error", err))
			httpx.Internal(c)
		}
		return
	}

	httpx.OK(c, gin.H{"message": "Password updated. Please sign in again."})
}
