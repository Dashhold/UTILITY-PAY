// Package server wires configuration, dependencies and routes into an
// http.Handler.
package server

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/auth"
	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/handler"
	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/middleware"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider"
	"github.com/utilipay/backend/internal/provider/aeps"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
	"github.com/utilipay/backend/internal/service"
)

// Dependencies is everything the router needs.
type Dependencies struct {
	Config *config.Config
	DB     *gorm.DB
	Log    *slog.Logger

	AuthManager *auth.Manager

	AuthService        *service.AuthService
	WalletService      *service.WalletService
	Reconciler         *service.Reconciler
	AuditSink          *service.ProviderAuditSink
	UATService         *service.UATService
	TransactionService *service.TransactionService
	CommissionService  *service.CommissionService
	RetailerService    *service.RetailerService
	BillerService      *service.BillerService
	FundService        *service.FundService
	ContentService     *service.ContentService
	ReportService      *service.ReportService
	MasterService      *service.MasterService
	KYCService         *service.KYCService
	OrderService       *service.OrderService

	AEPSHandler          *handler.AEPSHandler
	BharatConnectHandler *handler.BharatConnectHandler

	AEPS          *aeps.Client
	BharatConnect *bharatconnect.Client
}

// New builds the HTTP handler.
func New(deps Dependencies) http.Handler {
	if deps.Config.App.IsProduction() {
		gin.SetMode(gin.ReleaseMode)
	}

	// The default gin engine installs its own logger and recovery; this builds a
	// bare engine so the structured equivalents below are the only ones active.
	r := gin.New()

	// Trusting arbitrary proxy headers would let a client spoof its IP and
	// bypass rate limiting, so the trusted set is explicit.
	_ = r.SetTrustedProxies(nil)

	r.Use(
		middleware.RequestID(),
		middleware.Recovery(deps.Log),
		middleware.Logger(deps.Log),
		middleware.SecurityHeaders(),
		cors.New(cors.Config{
			AllowOrigins: deps.Config.App.AllowedOrigins,
			AllowMethods: []string{
				http.MethodGet, http.MethodPost, http.MethodPut,
				http.MethodPatch, http.MethodDelete, http.MethodOptions,
			},
			AllowHeaders: []string{
				"Origin", "Content-Type", "Accept", "Authorization",
				"X-Request-ID", "Idempotency-Key",
			},
			ExposeHeaders: []string{"X-Request-ID"},
			// Credentials are not used: the frontend sends a bearer token, so
			// cookies are unnecessary and enabling them would widen CSRF surface.
			AllowCredentials: false,
			MaxAge:           12 * time.Hour,
		}),
	)

	r.NoRoute(func(c *gin.Context) { httpx.NotFound(c, "Endpoint") })
	r.NoMethod(func(c *gin.Context) {
		httpx.Fail(c, http.StatusMethodNotAllowed, httpx.CodeNotFound, "Method not allowed")
	})

	registerHealth(r, deps)
	registerAPI(r, deps)

	return r
}

// registerHealth exposes liveness and readiness probes.
func registerHealth(r *gin.Engine, deps Dependencies) {
	// Liveness answers "is the process up", so it must not touch dependencies.
	r.GET("/healthz", func(c *gin.Context) {
		httpx.OK(c, gin.H{"status": "ok", "time": time.Now().UTC()})
	})

	// Readiness answers "can this instance serve traffic", so it does check the
	// database. An orchestrator uses this to keep a broken pod out of rotation.
	r.GET("/readyz", func(c *gin.Context) {
		sqlDB, err := deps.DB.DB()
		if err != nil {
			httpx.Unavailable(c, "Database handle unavailable")
			return
		}
		ctx, cancel := contextWithTimeout(c, 2*time.Second)
		defer cancel()
		if err := sqlDB.PingContext(ctx); err != nil {
			deps.Log.Error("readiness check failed", slog.Any("error", err))
			httpx.Unavailable(c, "Database unreachable")
			return
		}

		httpx.OK(c, gin.H{
			"status":   "ready",
			"database": "ok",
			"integrations": gin.H{
				"aeps":          integrationStatus(deps.AEPS != nil && deps.AEPS.Enabled()),
				"bharatConnect": integrationStatus(deps.BharatConnect != nil && deps.BharatConnect.Enabled()),
			},
		})
	})
}

// registerAPI mounts the versioned API.
func registerAPI(r *gin.Engine, deps Dependencies) {
	authHandler := handler.NewAuthHandler(deps.AuthService, deps.Log)

	// Login is rate limited per IP. This is a single-instance limiter; a
	// horizontally scaled deployment needs a shared store to enforce a global
	// limit, otherwise the effective ceiling multiplies by replica count.
	loginLimiter := middleware.NewRateLimit(10, time.Minute)
	generalLimiter := middleware.NewRateLimit(300, time.Minute)

	v1 := r.Group("/api/v1")
	v1.Use(generalLimiter.Middleware(nil))

	// --- public ---
	authGroup := v1.Group("/auth")
	{
		authGroup.POST("/login", loginLimiter.Middleware(nil), authHandler.Login)
		authGroup.POST("/refresh", loginLimiter.Middleware(nil), authHandler.Refresh)
		authGroup.POST("/logout", authHandler.Logout)
	}

	// --- authenticated ---
	authed := v1.Group("")
	authed.Use(middleware.Auth(deps.AuthManager, deps.DB))
	{
		me := authed.Group("/auth")
		{
			me.GET("/me", authHandler.Me)
			me.POST("/logout-all", authHandler.LogoutAll)
			me.POST("/change-password", authHandler.ChangePassword)
		}

		registerAdminRoutes(authed, deps)
		registerAdminAPI(authed, deps)
		registerRetailerAPI(authed, deps)
	}

	// The AEPS onboarding callback is public: the provider redirects the
	// retailer's browser here and carries no session. It is treated as untrusted
	// input and can only ever record a pending state.
	v1.GET("/webhooks/aeps/onboard", deps.AEPSHandler.OnboardCallback)
	v1.POST("/webhooks/aeps/onboard", deps.AEPSHandler.OnboardCallback)
}

// registerAdminRoutes mounts admin-only endpoints.
func registerAdminRoutes(g *gin.RouterGroup, deps Dependencies) {
	admin := g.Group("/admin")
	admin.Use(middleware.RequireRole(models.RoleAdmin))

	// Reconciliation backlog, for the operations dashboard.
	admin.GET("/reconciliation/summary", func(c *gin.Context) {
		summary, err := deps.Reconciler.Summary(c.Request.Context())
		if err != nil {
			deps.Log.Error("reconciliation summary failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, summary)
	})

	// UAT evidence export. Admin-only because these rows contain decrypted
	// request payloads and AES session keys.
	admin.GET("/uat/provider-logs", func(c *gin.Context) {
		rows, err := deps.AuditSink.ExportForUAT(c.Request.Context(), service.UATExportFilter{
			Provider:  c.Query("provider"),
			Operation: c.Query("operation"),
			Limit:     queryInt(c, "limit", 100),
		})
		if err != nil {
			deps.Log.Error("uat export failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, rows)
	})

	// The full UAT submission: captured evidence for checklist items 1-14 grouped
	// by section, plus the written answers for items 15-18 derived from live
	// configuration.
	admin.GET("/uat/bundle", func(c *gin.Context) {
		bundle, err := deps.UATService.Bundle(c.Request.Context(), queryInt(c, "perSection", 3))
		if err != nil {
			deps.Log.Error("uat bundle failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, bundle)
	})

	// Per-operation capture counts, so gaps in UAT coverage are visible.
	admin.GET("/uat/coverage", func(c *gin.Context) {
		coverage, err := deps.UATService.OperationCoverage(c.Request.Context())
		if err != nil {
			deps.Log.Error("uat coverage failed", slog.Any("error", err))
			httpx.Internal(c)
			return
		}
		httpx.OK(c, coverage)
	})

	// Integration capability report, so the UI can hide operations that are not
	// live rather than letting a retailer hit a 503.
	admin.GET("/integrations", func(c *gin.Context) {
		httpx.OK(c, gin.H{
			"aeps":          deps.AEPS.Capabilities(),
			"bharatConnect": deps.BharatConnect.Capabilities(),
		})
	})

	// Float balance held with the Bharat Connect provider.
	//
	// This is the platform's own balance upstream, not a retailer wallet. It is
	// the operational signal for whether transactions can continue to be funded,
	// and it doubles as the cleanest end-to-end check of the encrypted channel
	// because it touches no biller.
	admin.GET("/integrations/bharat-connect/balance", func(c *gin.Context) {
		memberID := c.Query("memberId")
		if memberID == "" {
			httpx.BadRequest(c, "memberId is required (the onboarded email address)")
			return
		}

		res, err := deps.BharatConnect.Balance(c.Request.Context(), bharatconnect.BalanceRequest{
			MemberID: memberID,
		})
		if err != nil {
			var apiErr *provider.APIError
			if errors.As(err, &apiErr) {
				// The provider's own message is surfaced verbatim: masking it would
				// hide exactly the detail an operator needs.
				httpx.Fail(c, http.StatusBadGateway, httpx.CodeUpstream, apiErr.Message)
				return
			}
			deps.Log.Error("provider balance check failed", slog.Any("error", err))
			httpx.Unavailable(c, "Could not reach the provider")
			return
		}
		httpx.OK(c, gin.H{"balance": res.Balance, "raw": res.Raw})
	})
}

func integrationStatus(enabled bool) string {
	if enabled {
		return "enabled"
	}
	return "disabled"
}
