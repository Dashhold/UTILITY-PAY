// Package config loads and validates all runtime configuration from the
// environment. Nothing else in the codebase reads os.Getenv directly, so this
// file is the single source of truth for deployment-time knobs.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config is the fully-resolved application configuration.
type Config struct {
	App            AppConfig
	DB             DBConfig
	JWT            JWTConfig
	Storage        StorageConfig
	AEPS           AEPSConfig
	BharatConnect  BharatConnectConfig
	Reconciliation ReconciliationConfig
}

// StorageConfig holds settings for retailer-uploaded files.
//
// KYC uploads are identity documents. Whichever driver is in use they are only
// ever served through an authenticated handler that checks ownership, so neither
// the bucket nor the directory may be publicly readable.
type StorageConfig struct {
	// Driver selects where files are kept: "local" or "s3".
	Driver string

	// UploadDir is the filesystem root for the local driver.
	UploadDir string

	// MaxUploadBytes bounds a single upload. Without a cap a client could exhaust
	// disk space or run up a storage bill with one request.
	MaxUploadBytes int64

	S3Bucket string
	S3Region string
	// S3Prefix namespaces objects so the bucket can be shared.
	S3Prefix string
	// S3Endpoint targets an S3-compatible service such as MinIO. Empty means AWS.
	S3Endpoint string
	// S3ForcePathStyle is required by most S3-compatible services.
	S3ForcePathStyle bool
	// S3AccessKeyID and S3SecretAccessKey are optional: leaving them empty makes
	// the SDK use its default chain, which on EC2 picks up the instance role. That
	// is preferred over long-lived keys in the environment.
	S3AccessKeyID     string
	S3SecretAccessKey string
}

// UsesS3 reports whether the S3 driver is selected.
func (s StorageConfig) UsesS3() bool { return s.Driver == "s3" }

// AppConfig holds general server settings.
type AppConfig struct {
	Env             string
	Port            string
	AllowedOrigins  []string
	ShutdownTimeout time.Duration
	LogLevel        string
}

// IsProduction reports whether the app runs in a production environment.
func (a AppConfig) IsProduction() bool { return a.Env == "production" }

// DBConfig holds PostgreSQL connection settings.
type DBConfig struct {
	Host            string
	Port            string
	User            string
	Password        string
	Name            string
	SSLMode         string
	TimeZone        string
	MaxOpenConns    int
	MaxIdleConns    int
	ConnMaxLifetime time.Duration
	AutoMigrate     bool
}

// DSN builds the PostgreSQL connection string.
func (d DBConfig) DSN() string {
	return fmt.Sprintf(
		"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s TimeZone=%s",
		d.Host, d.Port, d.User, d.Password, d.Name, d.SSLMode, d.TimeZone,
	)
}

// JWTConfig holds token signing settings.
type JWTConfig struct {
	Secret          string
	AccessTokenTTL  time.Duration
	RefreshTokenTTL time.Duration
	Issuer          string
}

// AEPSConfig holds credentials for the Excisoft AEPS provider.
//
// Source: AEPS/api_doc.md
type AEPSConfig struct {
	BaseURL     string
	APIKey      string
	CallbackURL string
	Timeout     time.Duration
	Enabled     bool

	// BankPipe selects the sponsor bank rail the provider routes through
	// (`bank_pipe` / `pipe` in the provider documentation). Which pipe a partner
	// is live on is decided by the provider, so it is configurable rather than
	// hard-coded.
	BankPipe string
	// Device is the RD-service vendor name sent as `device`, e.g. Mantra.
	Device string
	// AccessMode is `accessmodetype` / `accessmode`: SITE for a web terminal,
	// APP for a mobile client.
	AccessMode string
}

// BharatConnectConfig holds credentials for the MobiKwik Bharat Connect
// (formerly BBPS) provider.
//
// Source: bharat_connect/encryption.md
type BharatConnectConfig struct {
	BaseURL string
	// ClientID / ClientSecret authenticate the token-generation call.
	ClientID     string
	ClientSecret string
	// PublicKeyBase64 is the provider's RSA public key (SPKI, base64 DER) used
	// to wrap the per-request AES session key.
	PublicKeyBase64 string
	// KeyVersion is echoed back in every encrypted envelope.
	KeyVersion string
	// AgentID / TenantID identify us to the provider on transactional calls.
	AgentID  string
	TenantID string
	Timeout  time.Duration
	Enabled  bool

	// TokenSafetyWindow shrinks the cached token lifetime so we never present a
	// token that expires mid-flight. The provider issues 24h tokens but rotates
	// an existing token out after 5 minutes when a new one is requested, so we
	// refresh proactively rather than on failure.
	TokenSafetyWindow time.Duration

	// UATLogging enables detailed audit logs showing BOTH encrypted AND decrypted
	// request/response pairs. Required for UAT submission but MUST be disabled in
	// production (exposes session keys and plaintext payloads in logs).
	UATLogging bool
}

// ReconciliationConfig controls the pending/timeout transaction status poller.
//
// The UAT checklist (items 15-17) requires a documented, deterministic retry
// schedule. These values drive it.
type ReconciliationConfig struct {
	Enabled bool
	// Interval is how often the worker wakes up to scan for unresolved
	// transactions.
	Interval time.Duration
	// BackoffSchedule is the elapsed-time ladder after which each successive
	// status check fires, measured from transaction creation.
	BackoffSchedule []time.Duration
	// MaxAttempts caps status checks before a transaction is escalated to
	// manual review.
	MaxAttempts int
	// BatchSize limits how many transactions a single sweep claims.
	BatchSize int
}

// Load reads configuration from the environment, applying defaults and then
// validating the result. It returns an error rather than panicking so callers
// can decide how to report startup failures.
func Load() (*Config, error) {
	cfg := &Config{
		App: AppConfig{
			Env:             env("APP_ENV", "development"),
			Port:            env("PORT", "8080"),
			AllowedOrigins:  envCSV("ALLOWED_ORIGINS", []string{"http://localhost:5173", "http://localhost:3000"}),
			ShutdownTimeout: envDuration("SHUTDOWN_TIMEOUT", 15*time.Second),
			LogLevel:        env("LOG_LEVEL", "info"),
		},
		DB: DBConfig{
			Host:            env("DB_HOST", "localhost"),
			Port:            env("DB_PORT", "5432"),
			User:            env("DB_USER", "postgres"),
			Password:        env("DB_PASSWORD", "postgres"),
			Name:            env("DB_NAME", "utilipay"),
			SSLMode:         env("DB_SSLMODE", "disable"),
			TimeZone:        env("DB_TIMEZONE", "Asia/Kolkata"),
			MaxOpenConns:    envInt("DB_MAX_OPEN_CONNS", 25),
			MaxIdleConns:    envInt("DB_MAX_IDLE_CONNS", 5),
			ConnMaxLifetime: envDuration("DB_CONN_MAX_LIFETIME", time.Hour),
			AutoMigrate:     envBool("DB_AUTO_MIGRATE", true),
		},
		JWT: JWTConfig{
			Secret:          env("JWT_SECRET", ""),
			AccessTokenTTL:  envDuration("JWT_ACCESS_TTL", 24*time.Hour),
			RefreshTokenTTL: envDuration("JWT_REFRESH_TTL", 720*time.Hour),
			Issuer:          env("JWT_ISSUER", "utilipay-api"),
		},
		Storage: StorageConfig{
			Driver:            strings.ToLower(env("STORAGE_DRIVER", "local")),
			UploadDir:         env("UPLOAD_DIR", "./data/uploads"),
			MaxUploadBytes:    int64(envInt("MAX_UPLOAD_BYTES", 5*1024*1024)),
			S3Bucket:          env("S3_BUCKET", ""),
			S3Region:          env("S3_REGION", env("AWS_REGION", "")),
			S3Prefix:          env("S3_PREFIX", "kyc"),
			S3Endpoint:        env("S3_ENDPOINT", ""),
			S3ForcePathStyle:  envBool("S3_FORCE_PATH_STYLE", false),
			S3AccessKeyID:     env("S3_ACCESS_KEY_ID", env("AWS_ACCESS_KEY_ID", "")),
			S3SecretAccessKey: env("S3_SECRET_ACCESS_KEY", env("AWS_SECRET_ACCESS_KEY", "")),
		},
		AEPS: AEPSConfig{
			BaseURL:     env("AEPS_BASE_URL", "https://apidev.excisofttech.com"),
			APIKey:      env("AEPS_API_KEY", ""),
			CallbackURL: env("AEPS_CALLBACK_URL", ""),
			Timeout:     envDuration("AEPS_TIMEOUT", 45*time.Second),
			Enabled:     envBool("AEPS_ENABLED", true),
			BankPipe:    env("AEPS_BANK_PIPE", "bank3"),
			Device:      env("AEPS_DEVICE", "Mantra"),
			AccessMode:  env("AEPS_ACCESS_MODE", "SITE"),
		},
		BharatConnect: BharatConnectConfig{
			BaseURL:           env("BC_BASE_URL", "https://alpha3.mobikwik.com"),
			ClientID:          env("BC_CLIENT_ID", ""),
			ClientSecret:      env("BC_CLIENT_SECRET", ""),
			PublicKeyBase64:   env("BC_PUBLIC_KEY_BASE64", ""),
			KeyVersion:        env("BC_KEY_VERSION", "1.0"),
			AgentID:           env("BC_AGENT_ID", ""),
			TenantID:          env("BC_TENANT_ID", ""),
			Timeout:           envDuration("BC_TIMEOUT", 45*time.Second),
			Enabled:           envBool("BC_ENABLED", true),
			TokenSafetyWindow: envDuration("BC_TOKEN_SAFETY_WINDOW", 30*time.Minute),
			UATLogging:        envBool("BC_UAT_LOGGING", false),
		},
		Reconciliation: ReconciliationConfig{
			Enabled:     envBool("RECON_ENABLED", true),
			Interval:    envDuration("RECON_INTERVAL", 60*time.Second),
			MaxAttempts: envInt("RECON_MAX_ATTEMPTS", 8),
			BatchSize:   envInt("RECON_BATCH_SIZE", 100),
			// Escalating ladder: quick first checks catch fast-settling
			// transactions, later checks stretch out to the provider's T+1
			// reconciliation window without hammering their API.
			BackoffSchedule: []time.Duration{
				30 * time.Second,
				2 * time.Minute,
				5 * time.Minute,
				15 * time.Minute,
				30 * time.Minute,
				1 * time.Hour,
				3 * time.Hour,
				6 * time.Hour,
			},
		},
	}

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return cfg, nil
}

// validate enforces invariants that would otherwise surface as confusing
// runtime failures deep inside a request.
func (c *Config) validate() error {
	var problems []string

	if c.JWT.Secret == "" {
		problems = append(problems, "JWT_SECRET is required")
	} else if len(c.JWT.Secret) < 32 && c.App.IsProduction() {
		problems = append(problems, "JWT_SECRET must be at least 32 characters in production")
	}

	if c.DB.Name == "" {
		problems = append(problems, "DB_NAME is required")
	}

	// Provider credentials are only mandatory when that provider is switched
	// on, so local development can run with integrations disabled.
	if c.AEPS.Enabled && c.AEPS.APIKey == "" {
		problems = append(problems, "AEPS_API_KEY is required when AEPS_ENABLED=true")
	}
	if c.BharatConnect.Enabled {
		if c.BharatConnect.ClientID == "" {
			problems = append(problems, "BC_CLIENT_ID is required when BC_ENABLED=true")
		}
		if c.BharatConnect.ClientSecret == "" {
			problems = append(problems, "BC_CLIENT_SECRET is required when BC_ENABLED=true")
		}
		if c.BharatConnect.PublicKeyBase64 == "" {
			problems = append(problems, "BC_PUBLIC_KEY_BASE64 is required when BC_ENABLED=true")
		}
	}

	// Docker Compose keeps its Postgres service on a private bridge network.
	// TLS is mandatory for every other production database endpoint, but requiring
	// it for that internal hostname would make the supplied self-contained stack
	// unable to start because the official Postgres image does not enable TLS.
	if c.App.IsProduction() && c.DB.SSLMode == "disable" && !isInternalComposePostgres(c.DB.Host) {
		problems = append(problems, "DB_SSLMODE must not be 'disable' in production outside the internal Compose postgres service")
	}

	switch c.Storage.Driver {
	case "local":
		// Not fatal: the compose file mounts a named volume over the upload
		// directory, so documents do survive a container being replaced. The
		// remaining exposure is losing the instance and not being able to run more
		// than one, which Warnings() reports at startup rather than blocking a
		// deployment that is otherwise fine.
	case "s3":
		if c.Storage.S3Bucket == "" {
			problems = append(problems, "S3_BUCKET is required when STORAGE_DRIVER=s3")
		}
		// A region is needed unless a custom endpoint supplies one implicitly.
		if c.Storage.S3Region == "" && c.Storage.S3Endpoint == "" {
			problems = append(problems, "S3_REGION (or AWS_REGION) is required when STORAGE_DRIVER=s3")
		}
	default:
		problems = append(problems,
			fmt.Sprintf("STORAGE_DRIVER must be 'local' or 's3', got %q", c.Storage.Driver))
	}

	if c.Storage.MaxUploadBytes <= 0 {
		problems = append(problems, "MAX_UPLOAD_BYTES must be greater than zero")
	}

	// Every Bharat Connect transactional payload carries agentId as a mandatory
	// field, so without it balance, validation, view-bill, payment and status all
	// fail on every call. In production that is a hard error rather than a
	// surprise discovered at the counter; in development it is only a warning so
	// the rest of the platform stays runnable before UAT sign-off.
	if c.BharatConnect.Enabled && c.BharatConnect.AgentID == "" && c.App.IsProduction() {
		problems = append(problems,
			"BC_AGENT_ID is required when BC_ENABLED=true (MobiKwik supplies it after UAT sign-off)")
	}

	if len(problems) > 0 {
		return fmt.Errorf("invalid configuration:\n  - %s", strings.Join(problems, "\n  - "))
	}
	return nil
}

// Warnings returns configuration that works but should be changed before the
// platform carries real money.
//
// Separate from validate() on purpose: none of these should stop a deployment, but
// all of them are things an operator would want to know they are running with, and
// discovering them from a support ticket is worse than reading them at boot.
func (c *Config) Warnings() []string {
	var out []string

	if c.Storage.Driver == "local" {
		out = append(out,
			"STORAGE_DRIVER=local: KYC documents are stored on this instance. They survive "+
				"container restarts and rebuilds, but are lost if the instance is terminated and "+
				"cannot be shared across more than one instance. Set STORAGE_DRIVER=s3 with "+
				"S3_BUCKET and S3_REGION before onboarding real retailers.")
	}

	if c.BharatConnect.Enabled && c.BharatConnect.AgentID == "" {
		out = append(out,
			"BC_AGENT_ID is empty: Bharat Connect balance, validation, view-bill, payment and "+
				"status calls will be rejected as incomplete. MobiKwik supplies it after UAT sign-off.")
	}

	// Checked by value rather than by "was it set", because the risk is the value
	// being guessable, not where it came from.
	if weakDBPasswords[c.DB.Password] {
		out = append(out,
			"DB_PASSWORD is a well-known default. This is tolerable only because Postgres is "+
				"not published outside the Docker network. Set DB_PASSWORD if you ever expose it, "+
				"or move to RDS.")
	}

	if !c.App.IsProduction() {
		out = append(out,
			"APP_ENV is not 'production': stack traces are more verbose and TLS checks on the "+
				"database are relaxed.")
	}

	if c.BharatConnect.UATLogging {
		out = append(out,
			"BC_UAT_LOGGING is enabled: detailed logs will include BOTH encrypted AND decrypted "+
				"payloads (session keys, plaintext JSON). This is REQUIRED for UAT submission but "+
				"MUST be disabled (BC_UAT_LOGGING=false) in production as it exposes sensitive data.")
	}

	return out
}

// isInternalComposePostgres reports whether the DB host is the unexposed
// service name used by the supplied single-host Compose stack. This is deliberately
// an exact allow-list; an IP address, localhost, RDS hostname, or external service
// must use PostgreSQL TLS in production.
func isInternalComposePostgres(host string) bool {
	return strings.EqualFold(strings.TrimSpace(host), "postgres")
}

// weakDBPasswords are values common enough to be in any credential list.
var weakDBPasswords = map[string]bool{
	"postgres": true, "password": true, "root": true, "admin": true,
	"changeme": true, "utilipay": true, "": true,
}

// --- environment helpers ---

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if v, err := strconv.Atoi(env(key, "")); err == nil {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	if v, err := strconv.ParseBool(env(key, "")); err == nil {
		return v
	}
	return fallback
}

func envDuration(key string, fallback time.Duration) time.Duration {
	raw := env(key, "")
	if raw == "" {
		return fallback
	}
	if d, err := time.ParseDuration(raw); err == nil {
		return d
	}
	// Bare numbers are interpreted as seconds for operator convenience.
	if n, err := strconv.Atoi(raw); err == nil {
		return time.Duration(n) * time.Second
	}
	return fallback
}

func envCSV(key string, fallback []string) []string {
	raw := env(key, "")
	if raw == "" {
		return fallback
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if trimmed := strings.TrimSpace(p); trimmed != "" {
			out = append(out, trimmed)
		}
	}
	if len(out) == 0 {
		return fallback
	}
	return out
}
