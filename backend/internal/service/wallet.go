// Package service holds business logic. Handlers stay thin; anything that
// touches money or spans multiple tables lives here.
package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// WalletService moves money in and out of retailer wallets.
//
// Every balance change goes through this type so the ledger can never diverge
// from the cached balance: both are written inside one transaction, under a row
// lock on the retailer.
type WalletService struct {
	db *gorm.DB
}

// NewWalletService builds a WalletService.
func NewWalletService(db *gorm.DB) *WalletService {
	return &WalletService{db: db}
}

// LedgerEntry describes a requested balance change.
type LedgerEntry struct {
	RetailerID uuid.UUID
	Amount     models.Money
	Reason     models.LedgerReason
	Narration  string

	TransactionID *uuid.UUID
	FundRequestID *uuid.UUID
	OrderID       *uuid.UUID
	ActorID       *uuid.UUID
}

// validate checks the entry before any database work.
func (e LedgerEntry) validate() error {
	if e.RetailerID == uuid.Nil {
		return errors.New("wallet: retailer id is required")
	}
	// Amount is a magnitude; direction is supplied by the calling method. A
	// zero or negative amount would corrupt the ledger's meaning.
	if e.Amount.LessThanOrEqual(decimal.Zero) {
		return fmt.Errorf("wallet: amount must be positive, got %s", e.Amount)
	}
	if e.Reason == "" {
		return errors.New("wallet: reason is required")
	}
	return nil
}

// Credit adds funds to a wallet and returns the resulting ledger row.
func (s *WalletService) Credit(ctx context.Context, entry LedgerEntry) (*models.WalletLedger, error) {
	return s.apply(ctx, entry, models.LedgerCredit)
}

// Debit removes funds from a wallet.
//
// It fails with httpx.ErrInsufficientBalance rather than allowing a negative
// balance. The database also enforces this with a CHECK constraint, so even a
// bug here cannot overdraw an account.
func (s *WalletService) Debit(ctx context.Context, entry LedgerEntry) (*models.WalletLedger, error) {
	return s.apply(ctx, entry, models.LedgerDebit)
}

// Transfer moves funds between two retailer wallets atomically.
func (s *WalletService) Transfer(ctx context.Context, from, to uuid.UUID, amount models.Money, narration string, actorID *uuid.UUID) error {
	if from == to {
		return errors.New("wallet: cannot transfer to the same wallet")
	}
	if amount.LessThanOrEqual(decimal.Zero) {
		return fmt.Errorf("wallet: transfer amount must be positive, got %s", amount)
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// Locks are taken in a deterministic order (by UUID) so two concurrent
		// transfers between the same pair of wallets cannot deadlock by grabbing
		// the locks in opposite orders.
		first, second := from, to
		if first.String() > second.String() {
			first, second = second, first
		}
		if _, err := lockRetailer(tx, first); err != nil {
			return err
		}
		if _, err := lockRetailer(tx, second); err != nil {
			return err
		}

		if _, err := s.applyLocked(tx, LedgerEntry{
			RetailerID: from,
			Amount:     amount,
			Reason:     models.ReasonAdminAdjustment,
			Narration:  narration,
			ActorID:    actorID,
		}, models.LedgerDebit); err != nil {
			return err
		}
		if _, err := s.applyLocked(tx, LedgerEntry{
			RetailerID: to,
			Amount:     amount,
			Reason:     models.ReasonAdminAdjustment,
			Narration:  narration,
			ActorID:    actorID,
		}, models.LedgerCredit); err != nil {
			return err
		}
		return nil
	})
}

// apply opens a transaction and delegates to applyLocked.
func (s *WalletService) apply(ctx context.Context, entry LedgerEntry, dir models.LedgerDirection) (*models.WalletLedger, error) {
	if err := entry.validate(); err != nil {
		return nil, err
	}

	var out *models.WalletLedger
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		ledger, err := s.applyLocked(tx, entry, dir)
		if err != nil {
			return err
		}
		out = ledger
		return nil
	})
	return out, err
}

// applyLocked performs the balance change. It must be called inside a
// transaction.
func (s *WalletService) applyLocked(tx *gorm.DB, entry LedgerEntry, dir models.LedgerDirection) (*models.WalletLedger, error) {
	if err := entry.validate(); err != nil {
		return nil, err
	}

	// SELECT ... FOR UPDATE serialises concurrent changes to this wallet. Without
	// it, two simultaneous debits would both read the same starting balance and
	// the second write would silently discard the first.
	retailer, err := lockRetailer(tx, entry.RetailerID)
	if err != nil {
		return nil, err
	}

	before := retailer.WalletBalance
	var after models.Money

	switch dir {
	case models.LedgerCredit:
		after = before.Add(entry.Amount)
	case models.LedgerDebit:
		after = before.Sub(entry.Amount)
		if after.LessThan(decimal.Zero) {
			return nil, fmt.Errorf("%w: balance %s, requested %s",
				httpx.ErrInsufficientBalance, before.StringFixed(2), entry.Amount.StringFixed(2))
		}
	default:
		return nil, fmt.Errorf("wallet: unknown direction %q", dir)
	}

	ledger := &models.WalletLedger{
		RetailerID:    entry.RetailerID,
		Direction:     dir,
		Reason:        entry.Reason,
		Amount:        entry.Amount,
		BalanceBefore: before,
		BalanceAfter:  after,
		TransactionID: entry.TransactionID,
		FundRequestID: entry.FundRequestID,
		OrderID:       entry.OrderID,
		Narration:     entry.Narration,
		CreatedByID:   entry.ActorID,
	}
	if err := tx.Create(ledger).Error; err != nil {
		return nil, fmt.Errorf("wallet: write ledger: %w", err)
	}

	// The cached balance is updated in the same transaction as the ledger row, so
	// the two can never disagree.
	if err := tx.Model(&models.Retailer{}).
		Where("id = ?", entry.RetailerID).
		Update("wallet_balance", after).Error; err != nil {
		return nil, fmt.Errorf("wallet: update cached balance: %w", err)
	}

	return ledger, nil
}

// lockRetailer selects a retailer row FOR UPDATE.
func lockRetailer(tx *gorm.DB, retailerID uuid.UUID) (*models.Retailer, error) {
	var retailer models.Retailer
	err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("id = ?", retailerID).
		First(&retailer).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("%w: retailer %s", httpx.ErrNotFound, retailerID)
	}
	if err != nil {
		return nil, fmt.Errorf("wallet: lock retailer: %w", err)
	}
	return &retailer, nil
}

// Balance returns a retailer's current cached balance.
func (s *WalletService) Balance(ctx context.Context, retailerID uuid.UUID) (models.Money, error) {
	var retailer models.Retailer
	err := s.db.WithContext(ctx).Select("wallet_balance").Where("id = ?", retailerID).First(&retailer).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return decimal.Zero, fmt.Errorf("%w: retailer %s", httpx.ErrNotFound, retailerID)
	}
	if err != nil {
		return decimal.Zero, fmt.Errorf("wallet: read balance: %w", err)
	}
	return retailer.WalletBalance, nil
}

// ReconcileBalance recomputes a wallet balance from the ledger and reports any
// drift against the cached column.
//
// Nothing should ever produce drift, which is exactly why this check exists: it
// turns a silent accounting bug into a detectable one.
func (s *WalletService) ReconcileBalance(ctx context.Context, retailerID uuid.UUID) (cached, computed models.Money, err error) {
	var retailer models.Retailer
	if err := s.db.WithContext(ctx).Where("id = ?", retailerID).First(&retailer).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return decimal.Zero, decimal.Zero, fmt.Errorf("%w: retailer %s", httpx.ErrNotFound, retailerID)
		}
		return decimal.Zero, decimal.Zero, err
	}

	var result struct {
		Credits decimal.Decimal
		Debits  decimal.Decimal
	}
	err = s.db.WithContext(ctx).
		Model(&models.WalletLedger{}).
		Select(`COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END), 0) AS credits,
		        COALESCE(SUM(CASE WHEN direction = 'debit'  THEN amount ELSE 0 END), 0) AS debits`).
		Where("retailer_id = ?", retailerID).
		Scan(&result).Error
	if err != nil {
		return decimal.Zero, decimal.Zero, fmt.Errorf("wallet: aggregate ledger: %w", err)
	}

	return retailer.WalletBalance, result.Credits.Sub(result.Debits), nil
}

// LedgerPage is a page of ledger rows.
type LedgerPage struct {
	Entries []models.WalletLedger `json:"entries"`
	Total   int64                 `json:"total"`
}

// LedgerFilter narrows a ledger query.
type LedgerFilter struct {
	RetailerID uuid.UUID
	Reason     models.LedgerReason
	Direction  models.LedgerDirection
	From       *string
	To         *string
	Page       int
	PageSize   int
}

// AllLedgerEntry is one ledger row with its retailer identified.
//
// The platform-wide view needs the retailer's name and merchant code; without
// them an admin sees a list of amounts attached to opaque UUIDs.
type AllLedgerEntry struct {
	models.WalletLedger

	Retailer     string `json:"retailer"`
	MerchantCode string `json:"merchantCode"`
}

// AllLedgerPage is a page of platform-wide ledger rows.
type AllLedgerPage struct {
	Entries []AllLedgerEntry `json:"entries"`
	Total   int64            `json:"total"`
	// Credits and Debits are totals over the whole filtered set, not the page.
	// A page-only total would change as an admin browsed and could not be
	// reconciled against anything.
	Credits Money `json:"credits"`
	Debits  Money `json:"debits"`
}

// AllLedger returns a page of every retailer's ledger entries, newest first.
func (s *WalletService) AllLedger(ctx context.Context, f LedgerFilter, search string) (*AllLedgerPage, error) {
	base := s.db.WithContext(ctx).
		Table("wallet_ledgers AS wl").
		Joins("LEFT JOIN retailers r ON r.id = wl.retailer_id").
		Joins("LEFT JOIN users u ON u.id = r.user_id")

	if f.Reason != "" {
		base = base.Where("wl.reason = ?", f.Reason)
	}
	if f.Direction != "" {
		base = base.Where("wl.direction = ?", f.Direction)
	}
	if f.From != nil && *f.From != "" {
		base = base.Where("wl.created_at >= ?", *f.From)
	}
	if f.To != nil && *f.To != "" {
		base = base.Where("wl.created_at <= ?", *f.To)
	}
	if trimmed := strings.TrimSpace(search); trimmed != "" {
		like := "%" + trimmed + "%"
		base = base.Where(
			"u.name ILIKE ? OR r.shop_name ILIKE ? OR r.merchant_code ILIKE ? OR wl.narration ILIKE ?",
			like, like, like, like,
		)
	}

	var total int64
	if err := base.Session(&gorm.Session{}).Count(&total).Error; err != nil {
		return nil, fmt.Errorf("wallet: count all ledger: %w", err)
	}

	var totals struct {
		Credits Money
		Debits  Money
	}
	err := base.Session(&gorm.Session{}).
		Select(`COALESCE(SUM(wl.amount) FILTER (WHERE wl.direction = 'credit'), 0) AS credits,
		        COALESCE(SUM(wl.amount) FILTER (WHERE wl.direction = 'debit'), 0) AS debits`).
		Scan(&totals).Error
	if err != nil {
		return nil, fmt.Errorf("wallet: aggregate all ledger: %w", err)
	}

	page, pageSize := normalisePaging(f.Page, f.PageSize)

	var entries []AllLedgerEntry
	err = base.Session(&gorm.Session{}).
		Select("wl.*, COALESCE(u.name, '') AS retailer, COALESCE(r.merchant_code, '') AS merchant_code").
		Order("wl.created_at DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Scan(&entries).Error
	if err != nil {
		return nil, fmt.Errorf("wallet: list all ledger: %w", err)
	}

	return &AllLedgerPage{
		Entries: entries, Total: total,
		Credits: totals.Credits, Debits: totals.Debits,
	}, nil
}

// Ledger returns a page of ledger entries, newest first.
func (s *WalletService) Ledger(ctx context.Context, f LedgerFilter) (*LedgerPage, error) {
	q := s.db.WithContext(ctx).Model(&models.WalletLedger{}).Where("retailer_id = ?", f.RetailerID)

	if f.Reason != "" {
		q = q.Where("reason = ?", f.Reason)
	}
	if f.Direction != "" {
		q = q.Where("direction = ?", f.Direction)
	}
	if f.From != nil && *f.From != "" {
		q = q.Where("created_at >= ?", *f.From)
	}
	if f.To != nil && *f.To != "" {
		q = q.Where("created_at <= ?", *f.To)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("wallet: count ledger: %w", err)
	}

	page, pageSize := normalisePaging(f.Page, f.PageSize)

	var entries []models.WalletLedger
	err := q.Order("created_at DESC").
		Limit(pageSize).
		Offset((page - 1) * pageSize).
		Find(&entries).Error
	if err != nil {
		return nil, fmt.Errorf("wallet: list ledger: %w", err)
	}

	return &LedgerPage{Entries: entries, Total: total}, nil
}

// normalisePaging clamps paging parameters to a safe range.
//
// An unbounded page size is a denial-of-service vector, so it is capped.
func normalisePaging(page, pageSize int) (int, int) {
	if page < 1 {
		page = 1
	}
	switch {
	case pageSize < 1:
		pageSize = 25
	case pageSize > 200:
		pageSize = 200
	}
	return page, pageSize
}
