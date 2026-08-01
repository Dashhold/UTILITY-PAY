// Command api runs the UtiliPay HTTP API.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"github.com/utilipay/backend/internal/auth"
	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/cryptoenv"
	"github.com/utilipay/backend/internal/database"
	"github.com/utilipay/backend/internal/handler"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider/aeps"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
	"github.com/utilipay/backend/internal/server"
	"github.com/utilipay/backend/internal/service"
	"github.com/utilipay/backend/internal/storage"
)

func main() {
	if err := run(); err != nil {
		// Startup failures print plainly: a structured logger may not exist yet.
		fmt.Fprintf(os.Stderr, "fatal: %v\n", err)
		os.Exit(1)
	}
}

func run() error {
	// A missing .env is fine in container deployments where the environment is
	// injected directly.
	_ = godotenv.Load()

	cfg, err := config.Load()
	if err != nil {
		return err
	}

	log := newLogger(cfg.App.LogLevel, cfg.App.IsProduction())
	log.Info("starting utilipay api",
		slog.String("env", cfg.App.Env),
		slog.String("port", cfg.App.Port),
	)

	// Surfaced at boot so an operator reading the logs sees what the deployment is
	// running with, rather than finding out when it matters.
	for _, warning := range cfg.Warnings() {
		log.Warn(warning)
	}

	db, err := database.Open(cfg.DB, cfg.App.Env, log)
	if err != nil {
		return err
	}
	defer func() {
		if cerr := database.Close(db); cerr != nil {
			log.Error("closing database", slog.Any("error", cerr))
		}
	}()

	if cfg.DB.AutoMigrate {
		if err := database.Migrate(db, log); err != nil {
			return err
		}
		if err := database.Seed(db, log); err != nil {
			return err
		}
	}

	// --- integrations ---

	auditSink := service.NewProviderAuditSink(db, log)

	aepsClient := aeps.New(cfg.AEPS, auditSink)

	gcmIVSize, _ := strconv.Atoi(os.Getenv("BC_GCM_IV_SIZE"))
	suite, err := cryptoenv.ParseSuite(
		os.Getenv("BC_AES_MODE"),
		os.Getenv("BC_RSA_PADDING"),
		gcmIVSize,
	)
	if err != nil {
		return err
	}
	// The IV length is read back off the resolved suite rather than from the
	// default constant, so an operator overriding BC_GCM_IV_SIZE sees the value
	// actually in force.
	log.Info("bharat connect cipher suite",
		slog.String("aesMode", string(suite.AESMode)),
		slog.String("rsaPadding", string(suite.RSAPadding)),
		slog.Int("gcmIvBytes", suite.IVSize()),
	)

	// agentId is mandatory on every transactional payload, so its absence means
	// those calls cannot succeed. Warning loudly at boot beats discovering it one
	// failed transaction at a time.
	if cfg.BharatConnect.Enabled && cfg.BharatConnect.AgentID == "" {
		log.Warn("BC_AGENT_ID is not set: Bharat Connect balance, validation, " +
			"view-bill, payment and status calls will be rejected locally as incomplete. " +
			"MobiKwik supplies this value after UAT sign-off.")
	}

	bcClient, err := bharatconnect.New(
		cfg.BharatConnect,
		service.NewDBTokenStore(db, models.ProviderBharatConnect),
		auditSink,
		suite,
	)
	if err != nil {
		return err
	}

	// --- services ---

	authManager := auth.NewManager(cfg.JWT)

	walletService := service.NewWalletService(db)
	authService := service.NewAuthService(db, authManager)
	commissionService := service.NewCommissionService(db)
	reconciler := service.NewReconciler(db, cfg.Reconciliation, walletService, log)
	txnService := service.NewTransactionService(db, walletService, commissionService, reconciler, log)
	retailerService := service.NewRetailerService(db)
	billerService := service.NewBillerService(db)
	fundService := service.NewFundService(db, walletService)
	contentService := service.NewContentService(db)
	reportService := service.NewReportService(db)
	masterService := service.NewMasterService(db)

	// Storage is resolved before the KYC service so a misconfigured bucket fails
	// the boot rather than the first upload a retailer attempts.
	docStore, err := newDocumentStore(cfg.Storage, log)
	if err != nil {
		return err
	}
	log.Info("document storage ready", slog.String("store", docStore.Describe()))

	kycService := service.NewKYCService(db, docStore, cfg.Storage.MaxUploadBytes)
	orderService := service.NewOrderService(db)

	// The UAT service reads the resolved cipher suite and retry configuration so
	// the generated submission always describes the deployed behaviour.
	uatService := service.NewUATService(
		db, cfg.Reconciliation, cfg.BharatConnect,
		string(suite.AESMode), string(suite.RSAPadding), suite.IVSize(),
	)

	// Resolvers let the reconciliation worker settle pending transactions by
	// polling the provider that created them.
	reconciler.Register(models.ProviderBharatConnect, service.NewBharatConnectResolver(bcClient))
	reconciler.Register(models.ProviderAEPSExcisoft, service.NewAEPSResolver(aepsClient))

	aepsHandler := handler.NewAEPSHandler(aepsClient, txnService, retailerService, log)
	bcHandler := handler.NewBharatConnectHandler(bcClient, txnService, billerService, log)

	// --- background workers ---

	rootCtx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	go reconciler.Run(rootCtx)

	// --- http server ---

	httpHandler := server.New(server.Dependencies{
		Config:      cfg,
		DB:          db,
		Log:         log,
		AuthManager: authManager,

		AuthService:        authService,
		WalletService:      walletService,
		Reconciler:         reconciler,
		AuditSink:          auditSink,
		UATService:         uatService,
		TransactionService: txnService,
		CommissionService:  commissionService,
		RetailerService:    retailerService,
		BillerService:      billerService,
		FundService:        fundService,
		ContentService:     contentService,
		ReportService:      reportService,
		MasterService:      masterService,
		KYCService:         kycService,
		OrderService:       orderService,

		AEPSHandler:          aepsHandler,
		BharatConnectHandler: bcHandler,

		AEPS:          aepsClient,
		BharatConnect: bcClient,
	})

	srv := &http.Server{
		Addr:    ":" + cfg.App.Port,
		Handler: httpHandler,
		// Explicit timeouts prevent a slow or stalled client from holding a
		// connection open indefinitely.
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      60 * time.Second,
		IdleTimeout:       120 * time.Second,
	}

	serverErr := make(chan error, 1)
	go func() {
		log.Info("http server listening", slog.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			serverErr <- err
		}
	}()

	select {
	case err := <-serverErr:
		return fmt.Errorf("http server: %w", err)
	case <-rootCtx.Done():
		log.Info("shutdown signal received")
	}

	// Graceful shutdown lets in-flight provider calls finish rather than being
	// cut mid-transaction, which would create avoidable pending records.
	shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.App.ShutdownTimeout)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown: %w", err)
	}

	log.Info("shutdown complete")
	return nil
}

// newDocumentStore builds the KYC document store for the configured driver.
//
// S3 is verified at boot with a HeadBucket call. That turns a wrong bucket name,
// a missing IAM permission or a bad region into a startup failure the operator
// sees immediately, instead of a retailer's upload failing mid-onboarding.
func newDocumentStore(cfg config.StorageConfig, log *slog.Logger) (storage.Store, error) {
	if !cfg.UsesS3() {
		log.Warn("using local document storage: uploads are lost when the container is " +
			"replaced and are not shared between instances. Set STORAGE_DRIVER=s3 for any " +
			"deployment with more than one container or a rolling release.")
		return storage.NewLocal(cfg.UploadDir)
	}

	// Bounded so an unreachable endpoint cannot hang the boot indefinitely.
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	return storage.NewS3(ctx, storage.S3Options{
		Bucket:          cfg.S3Bucket,
		Region:          cfg.S3Region,
		Prefix:          cfg.S3Prefix,
		Endpoint:        cfg.S3Endpoint,
		ForcePathStyle:  cfg.S3ForcePathStyle,
		AccessKeyID:     cfg.S3AccessKeyID,
		SecretAccessKey: cfg.S3SecretAccessKey,
	})
}

// newLogger builds the application logger. Production emits JSON for ingestion;
// development emits text for readability.
func newLogger(level string, production bool) *slog.Logger {
	var lvl slog.Level
	switch strings.ToLower(level) {
	case "debug":
		lvl = slog.LevelDebug
	case "warn":
		lvl = slog.LevelWarn
	case "error":
		lvl = slog.LevelError
	default:
		lvl = slog.LevelInfo
	}

	opts := &slog.HandlerOptions{Level: lvl}
	if production {
		return slog.New(slog.NewJSONHandler(os.Stdout, opts))
	}
	return slog.New(slog.NewTextHandler(os.Stdout, opts))
}
