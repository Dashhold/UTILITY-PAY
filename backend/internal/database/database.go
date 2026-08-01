// Package database owns the GORM connection lifecycle and schema migration.
package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/models"
)

// Open connects to PostgreSQL, configures the pool, and verifies the connection
// with a ping so that a misconfigured DSN fails at startup rather than on the
// first request.
func Open(cfg config.DBConfig, appEnv string, log *slog.Logger) (*gorm.DB, error) {
	gormLogLevel := logger.Warn
	if appEnv != "production" {
		gormLogLevel = logger.Info
	}

	db, err := gorm.Open(postgres.Open(cfg.DSN()), &gorm.Config{
		Logger: logger.New(
			slogWriter{log: log},
			logger.Config{
				SlowThreshold:             300 * time.Millisecond,
				LogLevel:                  gormLogLevel,
				IgnoreRecordNotFoundError: true,
				ParameterizedQueries:      appEnv == "production",
				Colorful:                  false,
			},
		),
		// Timestamps are stored and compared in UTC; the display timezone is a
		// presentation concern handled at the edge.
		NowFunc: func() time.Time { return time.Now().UTC() },
		// Skipping the default transaction on single writes is a meaningful
		// throughput win; every multi-statement write in this codebase opens an
		// explicit transaction, so atomicity is not weakened.
		SkipDefaultTransaction: true,
		TranslateError:         true,
	})
	if err != nil {
		return nil, fmt.Errorf("database: open: %w", err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, fmt.Errorf("database: unwrap sql.DB: %w", err)
	}
	sqlDB.SetMaxOpenConns(cfg.MaxOpenConns)
	sqlDB.SetMaxIdleConns(cfg.MaxIdleConns)
	sqlDB.SetConnMaxLifetime(cfg.ConnMaxLifetime)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := sqlDB.PingContext(ctx); err != nil {
		return nil, fmt.Errorf("database: ping: %w", err)
	}

	log.Info("database connected",
		slog.String("host", cfg.Host),
		slog.String("database", cfg.Name),
		slog.Int("maxOpenConns", cfg.MaxOpenConns),
	)
	return db, nil
}

// Close releases the pool.
func Close(db *gorm.DB) error {
	sqlDB, err := db.DB()
	if err != nil {
		return err
	}
	return sqlDB.Close()
}

// allModels is the migration set. Order matters only for foreign keys, which
// GORM resolves, but keeping it grouped aids readability.
func allModels() []any {
	return []any{
		// Identity
		&models.User{},
		&models.Retailer{},
		&models.LoginHistory{},
		&models.RefreshToken{},
		&models.APIKey{},

		// Master data
		&models.ServiceCategory{},
		&models.City{},
		&models.UserType{},
		&models.Service{},
		&models.CommissionPlan{},
		&models.CommissionSlot{},
		&models.Announcement{},
		&models.TicketDepartment{},
		&models.CompanyBank{},
		&models.PayoutBank{},

		// Catalogue
		&models.Product{},
		&models.ProductOrder{},
		&models.ProductOrderItem{},

		// KYC
		&models.KYCApplication{},
		&models.KYCDocument{},
		&models.RetailerService{},

		// Money movement
		&models.Transaction{},
		&models.WalletLedger{},
		&models.FundRequest{},
		&models.Settlement{},

		// Integrations
		&models.Biller{},
		&models.BillFetch{},
		&models.ProviderToken{},
		&models.ProviderCallLog{},

		// Audit
		&models.AuditLog{},
	}
}

// Migrate runs AutoMigrate for every model and then applies constraints that
// GORM tags cannot express.
func Migrate(db *gorm.DB, log *slog.Logger) error {
	start := time.Now()

	if err := db.AutoMigrate(allModels()...); err != nil {
		return fmt.Errorf("database: automigrate: %w", err)
	}

	if err := applyConstraints(db, log); err != nil {
		return err
	}

	log.Info("migrations applied",
		slog.Int("models", len(allModels())),
		slog.Duration("took", time.Since(start)),
	)
	return nil
}

// applyConstraints installs invariants that must live in the database because
// application code alone cannot guarantee them under concurrency.
func applyConstraints(db *gorm.DB, log *slog.Logger) error {
	statements := []struct {
		name string
		sql  string
	}{
		{
			// A retailer wallet must never go negative. Concurrent debits could
			// otherwise interleave past an application-level balance check.
			name: "retailers_wallet_balance_non_negative",
			sql: `ALTER TABLE retailers
			      ADD CONSTRAINT retailers_wallet_balance_non_negative
			      CHECK (wallet_balance >= 0)`,
		},
		{
			// Ledger amounts are magnitudes; direction carries the sign.
			name: "wallet_ledgers_amount_positive",
			sql: `ALTER TABLE wallet_ledgers
			      ADD CONSTRAINT wallet_ledgers_amount_positive
			      CHECK (amount > 0)`,
		},
		{
			name: "transactions_amount_non_negative",
			sql: `ALTER TABLE transactions
			      ADD CONSTRAINT transactions_amount_non_negative
			      CHECK (amount >= 0)`,
		},
		{
			name: "products_stock_non_negative",
			sql: `ALTER TABLE products
			      ADD CONSTRAINT products_stock_non_negative
			      CHECK (stock >= 0)`,
		},
		{
			// Only one company bank may be the default. A partial unique index
			// expresses this without blocking multiple non-default rows.
			name: "company_banks_single_default",
			sql: `CREATE UNIQUE INDEX company_banks_single_default
			      ON company_banks (is_default)
			      WHERE is_default = true AND deleted_at IS NULL`,
		},
		{
			// Emails are compared case-insensitively. A functional unique index
			// stops "A@x.com" and "a@x.com" becoming two accounts.
			name: "users_email_lower_unique",
			sql: `CREATE UNIQUE INDEX users_email_lower_unique
			      ON users (lower(email))
			      WHERE deleted_at IS NULL`,
		},
		{
			// The reconciliation sweep scans for due status checks; this index
			// keeps that query from degrading into a full scan as the table grows.
			name: "transactions_pending_recheck_idx",
			sql: `CREATE INDEX transactions_pending_recheck_idx
			      ON transactions (next_status_check_at)
			      WHERE status IN ('pending', 'processing')
			        AND needs_manual_review = false`,
		},
	}

	for _, stmt := range statements {
		// Constraints are additive and idempotent-by-intent: a duplicate error
		// means a previous run already installed it, which is not a failure.
		if err := db.Exec(stmt.sql).Error; err != nil {
			if isAlreadyExists(err) {
				continue
			}
			return fmt.Errorf("database: apply constraint %s: %w", stmt.name, err)
		}
		log.Debug("constraint applied", slog.String("name", stmt.name))
	}
	return nil
}

// isAlreadyExists detects PostgreSQL "duplicate object" style errors.
func isAlreadyExists(err error) bool {
	if err == nil {
		return false
	}
	msg := err.Error()
	for _, needle := range []string{"already exists", "duplicate", "42P07", "42710"} {
		if containsFold(msg, needle) {
			return true
		}
	}
	return false
}

func containsFold(haystack, needle string) bool {
	h, n := []rune(haystack), []rune(needle)
	if len(n) == 0 {
		return true
	}
	lower := func(r rune) rune {
		if r >= 'A' && r <= 'Z' {
			return r + 32
		}
		return r
	}
	for i := 0; i+len(n) <= len(h); i++ {
		match := true
		for j := range n {
			if lower(h[i+j]) != lower(n[j]) {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

// slogWriter adapts GORM's logger.Writer to slog.
type slogWriter struct{ log *slog.Logger }

func (w slogWriter) Printf(format string, args ...any) {
	w.log.Debug(fmt.Sprintf(format, args...))
}
