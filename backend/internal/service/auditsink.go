package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
)

// ProviderAuditSink persists provider call logs to the database.
//
// bharat_connect/UAT_checklist.md requires, for every API, the full cURL request,
// the request body with both encrypted and decrypted values, and the response.
// This sink is the system of record for that submission, which is why it stores
// decrypted payloads.
//
// Security: rows contain plaintext request payloads and AES session keys. Access
// is admin-only at the route layer, and retention should be bounded by a
// scheduled purge (see Purge).
type ProviderAuditSink struct {
	db  *gorm.DB
	log *slog.Logger
}

// NewProviderAuditSink builds a ProviderAuditSink.
func NewProviderAuditSink(db *gorm.DB, log *slog.Logger) *ProviderAuditSink {
	return &ProviderAuditSink{db: db, log: log}
}

// Record implements provider.AuditSink.
//
// A failure to write the audit row is logged but never propagated: losing an
// audit line must not fail a customer's transaction.
func (s *ProviderAuditSink) Record(ctx context.Context, entry provider.CallLog) {
	row := &models.ProviderCallLog{
		Provider:      models.ProviderName(entry.Provider),
		Operation:     entry.Operation,
		Attempt:       entry.Attempt,
		TransactionID: entry.TransactionID,
		RetailerID:    entry.RetailerID,

		Method:      entry.Method,
		URL:         entry.URL,
		RequestHead: renderHeaders(entry.Headers),

		RequestEncryptedSessionKey: entry.EncryptedSessionKey,
		RequestEncryptedPayload:    entry.EncryptedPayload,
		RequestKeyVersion:          entry.KeyVersion,
		RequestIV:                  entry.IV,

		RequestPlaintext:     entry.RequestPlaintext,
		RequestSessionKeyB64: entry.SessionKeyBase64,

		ResponseStatus:    entry.StatusCode,
		ResponseRaw:       entry.ResponseRaw,
		ResponsePlaintext: entry.ResponsePlaintext,

		CurlEquivalent: entry.Curl,
		DurationMS:     entry.Duration.Milliseconds(),
		Error:          truncateStr(entry.Err, 1000),
	}

	// A detached context is used so an audit write still lands when the caller's
	// request context has already been cancelled, which is exactly the timeout
	// case the UAT checklist most wants evidence for.
	if err := s.db.WithContext(context.WithoutCancel(ctx)).Create(row).Error; err != nil {
		s.log.Error("failed to persist provider call log",
			slog.String("provider", entry.Provider),
			slog.String("operation", entry.Operation),
			slog.Any("error", err),
		)
	}
}

// renderHeaders flattens headers for storage, masking anything sensitive.
func renderHeaders(h http.Header) string {
	if len(h) == 0 {
		return ""
	}

	var b strings.Builder
	for name, values := range h {
		for _, v := range values {
			switch strings.ToLower(name) {
			case "authorization", "x-api-key", "cookie":
				// Bearer tokens and keys must not accumulate in a long-lived table.
				v = maskValue(v)
			}
			b.WriteString(name)
			b.WriteString(": ")
			b.WriteString(v)
			b.WriteString("\n")
		}
	}
	return b.String()
}

func maskValue(v string) string {
	const keep = 12
	if len(v) <= keep {
		return "***REDACTED***"
	}
	return v[:keep] + "***REDACTED***"
}

// UATExportFilter narrows a UAT evidence export.
type UATExportFilter struct {
	Provider  string
	Operation string
	Limit     int
}

// ExportForUAT returns call logs formatted for the UAT submission.
func (s *ProviderAuditSink) ExportForUAT(ctx context.Context, f UATExportFilter) ([]models.ProviderCallLog, error) {
	q := s.db.WithContext(ctx).Model(&models.ProviderCallLog{})

	if f.Provider != "" {
		q = q.Where("provider = ?", f.Provider)
	}
	if f.Operation != "" {
		q = q.Where("operation = ?", f.Operation)
	}

	limit := f.Limit
	if limit <= 0 || limit > 500 {
		limit = 100
	}

	var rows []models.ProviderCallLog
	if err := q.Order("created_at DESC").Limit(limit).Find(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

// Purge deletes call logs older than the given number of days.
//
// These rows hold decrypted payloads, so unbounded retention is a liability.
// Run this on a schedule with a retention period that satisfies the UAT window.
func (s *ProviderAuditSink) Purge(ctx context.Context, olderThanDays int) (int64, error) {
	if olderThanDays <= 0 {
		olderThanDays = 90
	}
	res := s.db.WithContext(ctx).
		Where("created_at < NOW() - (? || ' days')::interval", olderThanDays).
		Delete(&models.ProviderCallLog{})
	return res.RowsAffected, res.Error
}

// DBTokenStore persists the Bharat Connect auth token in the database.
//
// Persistence across restarts is required rather than optional: an in-memory
// cache would mint a fresh token on every deploy and walk into the provider's
// 100-tokens-per-day cap.
type DBTokenStore struct {
	db       *gorm.DB
	provider models.ProviderName
}

// NewDBTokenStore builds a DBTokenStore.
func NewDBTokenStore(db *gorm.DB, name models.ProviderName) *DBTokenStore {
	return &DBTokenStore{db: db, provider: name}
}

// Load implements bharatconnect.TokenStore.
func (s *DBTokenStore) Load(ctx context.Context) (*bharatconnect.TokenRecord, error) {
	var row models.ProviderToken
	err := s.db.WithContext(ctx).Where("provider = ?", s.provider).First(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// No token yet is a normal cold-start state, not an error.
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("token store: load: %w", err)
	}

	return &bharatconnect.TokenRecord{
		Token:            row.Token,
		IssuedAt:         row.IssuedAt,
		ExpiresAt:        row.ExpiresAt,
		IssuedTodayCount: row.IssuedTodayCount,
		QuotaDate:        row.QuotaDate,
	}, nil
}

// Save implements bharatconnect.TokenStore.
//
// The upsert is keyed on provider so exactly one row exists per integration and
// concurrent writers cannot create duplicates.
func (s *DBTokenStore) Save(ctx context.Context, rec bharatconnect.TokenRecord) error {
	row := models.ProviderToken{
		Provider:         s.provider,
		Token:            rec.Token,
		IssuedAt:         rec.IssuedAt,
		ExpiresAt:        rec.ExpiresAt,
		IssuedTodayCount: rec.IssuedTodayCount,
		QuotaDate:        rec.QuotaDate,
	}

	err := s.db.WithContext(ctx).Clauses(clause.OnConflict{
		Columns: []clause.Column{{Name: "provider"}},
		DoUpdates: clause.AssignmentColumns([]string{
			"token", "issued_at", "expires_at", "issued_today_count", "quota_date", "updated_at",
		}),
	}).Create(&row).Error
	if err != nil {
		return fmt.Errorf("token store: save: %w", err)
	}
	return nil
}
