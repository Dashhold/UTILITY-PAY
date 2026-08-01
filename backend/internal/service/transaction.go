package service

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/datatypes"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider"
)

// TransactionService owns the money-movement lifecycle.
//
// The invariant it enforces is that a retailer's wallet is debited before an
// upstream call is made, and that debit is only reversed on a definitive
// provider rejection. Debiting first means a retailer can never spend float they
// do not have; reversing only on certainty means a timed-out payment that
// actually succeeded is never silently refunded.
type TransactionService struct {
	db         *gorm.DB
	wallet     *WalletService
	commission *CommissionService
	reconciler *Reconciler
	log        *slog.Logger
}

// NewTransactionService builds a TransactionService.
func NewTransactionService(db *gorm.DB, wallet *WalletService, commission *CommissionService, reconciler *Reconciler, log *slog.Logger) *TransactionService {
	return &TransactionService{
		db:         db,
		wallet:     wallet,
		commission: commission,
		reconciler: reconciler,
		log:        log,
	}
}

// BeginInput describes a transaction about to be attempted.
type BeginInput struct {
	RetailerID uuid.UUID
	Category   models.ServiceCategoryName
	Service    string
	Mode       string

	// Amount is what the customer is transacting. It is debited from the wallet
	// as a hold before the provider is called.
	Amount Money

	// DebitWallet is false for enquiry-style operations that move no money
	// (balance enquiry, mini statement, bill fetch).
	DebitWallet bool

	Provider models.ProviderName
	// IdempotencyKey, when supplied, makes a repeated client request return the
	// original transaction instead of creating a second one.
	IdempotencyKey string

	Metadata map[string]any
}

// Begin creates a transaction and places the wallet hold, atomically.
func (s *TransactionService) Begin(ctx context.Context, in BeginInput) (*models.Transaction, error) {
	if in.Amount.LessThan(decimal.Zero) {
		return nil, fmt.Errorf("transaction: amount must not be negative, got %s", in.Amount)
	}

	// An idempotent replay must not re-debit the wallet, so the existing
	// transaction is returned before any work begins.
	if in.IdempotencyKey != "" {
		existing, err := s.findByIdempotencyKey(ctx, in.IdempotencyKey)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			return existing, nil
		}
	}

	var retailerName string
	var userTypeID *uuid.UUID

	var out *models.Transaction
	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var retailer models.Retailer
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", in.RetailerID).First(&retailer).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w: retailer %s", httpx.ErrNotFound, in.RetailerID)
			}
			return err
		}
		if retailer.Status != models.AccountActive {
			return fmt.Errorf("%w: retailer account is %s", httpx.ErrForbidden, retailer.Status)
		}
		retailerName = retailer.ShopName
		userTypeID = retailer.UserTypeID

		txn := &models.Transaction{
			TxnID:      NewTxnID(string(in.Category)),
			RetailerID: in.RetailerID,
			Retailer:   retailer.ShopName,
			Category:   in.Category,
			Service:    in.Service,
			Mode:       in.Mode,
			Amount:     in.Amount,
			Status:     models.TxStatusProcessing,
			Provider:   in.Provider,
			NetAmount:  decimal.Zero,
		}
		if in.IdempotencyKey != "" {
			key := in.IdempotencyKey
			txn.IdempotencyKey = &key
		}
		if len(in.Metadata) > 0 {
			raw, err := json.Marshal(in.Metadata)
			if err != nil {
				return fmt.Errorf("transaction: marshal metadata: %w", err)
			}
			txn.Metadata = datatypes.JSON(raw)
		}

		if in.DebitWallet && in.Amount.GreaterThan(decimal.Zero) {
			// applyLocked re-locks the same row, which is safe and keeps the
			// ledger write inside this transaction.
			if _, err := s.wallet.applyLocked(tx, LedgerEntry{
				RetailerID: in.RetailerID,
				Amount:     in.Amount,
				Reason:     models.ReasonTransactionHold,
				Narration:  fmt.Sprintf("%s - %s", in.Service, txn.TxnID),
			}, models.LedgerDebit); err != nil {
				return err
			}
			txn.NetAmount = in.Amount
		}

		if err := tx.Create(txn).Error; err != nil {
			return fmt.Errorf("transaction: create: %w", err)
		}

		// The ledger row is written before the transaction id exists, so it is
		// back-filled here to keep the audit trail navigable in both directions.
		if in.DebitWallet && in.Amount.GreaterThan(decimal.Zero) {
			if err := tx.Model(&models.WalletLedger{}).
				Where("retailer_id = ? AND reason = ? AND transaction_id IS NULL", in.RetailerID, models.ReasonTransactionHold).
				Order("created_at DESC").Limit(1).
				Update("transaction_id", txn.ID).Error; err != nil {
				return fmt.Errorf("transaction: link hold ledger: %w", err)
			}
		}

		out = txn
		return nil
	})
	if err != nil {
		return nil, err
	}

	_ = retailerName
	_ = userTypeID
	return out, nil
}

// SettleInput reports the provider verdict for a transaction.
type SettleInput struct {
	Outcome provider.Outcome

	ProviderRef        string
	ProviderTxnID      string
	BharatConnectTxnID string
	CCF                Money

	StatusCode string
	Message    string

	// TimedOut marks that no verdict was received from the provider.
	TimedOut bool

	// ExtraMetadata is merged into the transaction's metadata.
	ExtraMetadata map[string]any
}

// Settle applies a provider verdict, moving money only when the verdict is
// definitive.
//
// Success credits commission. Failure reverses the hold. Pending and timeout
// leave the hold in place and schedule a status check.
func (s *TransactionService) Settle(ctx context.Context, txnID uuid.UUID, in SettleInput) (*models.Transaction, error) {
	var out *models.Transaction

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var txn models.Transaction
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", txnID).First(&txn).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("%w: transaction %s", httpx.ErrNotFound, txnID)
			}
			return err
		}

		// A transaction that has already reached a terminal state must not be
		// re-settled: doing so could double-credit commission or double-reverse.
		if txn.Status.IsTerminal() {
			out = &txn
			return nil
		}

		now := time.Now().UTC()
		updates := map[string]any{
			"provider_status_code": in.StatusCode,
			"provider_message":     truncateStr(in.Message, 500),
			"timed_out":            in.TimedOut,
		}
		if in.ProviderRef != "" {
			updates["provider_ref"] = in.ProviderRef
		}
		if in.ProviderTxnID != "" {
			updates["provider_txn_id"] = in.ProviderTxnID
		}
		if in.BharatConnectTxnID != "" {
			updates["bharat_connect_txn_id"] = in.BharatConnectTxnID
		}
		if !in.CCF.IsZero() {
			updates["ccf"] = in.CCF
		}
		if len(in.ExtraMetadata) > 0 {
			merged, err := mergeMetadata(txn.Metadata, in.ExtraMetadata)
			if err != nil {
				return err
			}
			updates["metadata"] = merged
		}

		switch in.Outcome {
		case provider.OutcomeSuccess:
			updates["status"] = models.TxStatusSuccess
			updates["completed_at"] = now
			updates["next_status_check_at"] = nil

			if err := s.creditCommission(tx, &txn); err != nil {
				return err
			}

		case provider.OutcomeFailed:
			updates["status"] = models.TxStatusFailed
			updates["completed_at"] = now
			updates["next_status_check_at"] = nil

			if err := s.reverseHold(tx, &txn); err != nil {
				return err
			}

		default:
			// Pending or timeout: the hold stays, and reconciliation takes over.
			updates["status"] = models.TxStatusPending
			updates["next_status_check_at"] = s.reconciler.nextCheckAt(txn.CreatedAt, 0)
		}

		if err := tx.Model(&models.Transaction{}).Where("id = ?", txn.ID).Updates(updates).Error; err != nil {
			return fmt.Errorf("transaction: settle: %w", err)
		}

		var reloaded models.Transaction
		if err := tx.Where("id = ?", txn.ID).First(&reloaded).Error; err != nil {
			return err
		}
		out = &reloaded
		return nil
	})

	return out, err
}

// creditCommission resolves and credits the retailer's commission.
//
// Commission is credited as a separate ledger entry rather than netted against
// the hold, so a retailer's statement shows the transaction and its earnings as
// distinct lines.
func (s *TransactionService) creditCommission(tx *gorm.DB, txn *models.Transaction) error {
	var retailer models.Retailer
	if err := tx.Where("id = ?", txn.RetailerID).First(&retailer).Error; err != nil {
		return fmt.Errorf("transaction: load retailer for commission: %w", err)
	}

	breakdown, err := s.commission.Resolve(tx.Statement.Context, txn.Service, retailer.UserTypeID, txn.Amount)
	if err != nil {
		return err
	}
	if breakdown.Net.LessThanOrEqual(decimal.Zero) {
		return nil
	}

	// Guard against a double credit if this path is ever reached twice.
	var existing int64
	if err := tx.Model(&models.WalletLedger{}).
		Where("transaction_id = ? AND reason = ?", txn.ID, models.ReasonCommission).
		Count(&existing).Error; err != nil {
		return fmt.Errorf("transaction: check existing commission: %w", err)
	}
	if existing > 0 {
		return nil
	}

	txnID := txn.ID
	if _, err := s.wallet.applyLocked(tx, LedgerEntry{
		RetailerID:    txn.RetailerID,
		Amount:        breakdown.Net,
		Reason:        models.ReasonCommission,
		Narration:     fmt.Sprintf("Commission on %s", txn.TxnID),
		TransactionID: &txnID,
	}, models.LedgerCredit); err != nil {
		return err
	}

	return tx.Model(&models.Transaction{}).Where("id = ?", txn.ID).
		Updates(map[string]any{
			"commission": breakdown.Gross,
			"tds":        breakdown.TDS,
			"gst":        breakdown.GST,
		}).Error
}

// reverseHold returns a failed transaction's debit to the retailer.
func (s *TransactionService) reverseHold(tx *gorm.DB, txn *models.Transaction) error {
	if txn.NetAmount.LessThanOrEqual(decimal.Zero) {
		return nil
	}

	var existing int64
	if err := tx.Model(&models.WalletLedger{}).
		Where("transaction_id = ? AND reason = ?", txn.ID, models.ReasonReversal).
		Count(&existing).Error; err != nil {
		return fmt.Errorf("transaction: check existing reversal: %w", err)
	}
	if existing > 0 {
		return nil
	}

	txnID := txn.ID
	_, err := s.wallet.applyLocked(tx, LedgerEntry{
		RetailerID:    txn.RetailerID,
		Amount:        txn.NetAmount,
		Reason:        models.ReasonReversal,
		Narration:     fmt.Sprintf("Reversal for failed %s", txn.TxnID),
		TransactionID: &txnID,
	}, models.LedgerCredit)
	return err
}

// FailBeforeDispatch marks a transaction failed and reverses its hold, for the
// case where the provider was never successfully called.
//
// This is safe to treat as terminal precisely because nothing left our system.
func (s *TransactionService) FailBeforeDispatch(ctx context.Context, txnID uuid.UUID, reason string) error {
	_, err := s.Settle(ctx, txnID, SettleInput{
		Outcome: provider.OutcomeFailed,
		Message: reason,
	})
	return err
}

func (s *TransactionService) findByIdempotencyKey(ctx context.Context, key string) (*models.Transaction, error) {
	var txn models.Transaction
	err := s.db.WithContext(ctx).Where("idempotency_key = ?", key).First(&txn).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("transaction: idempotency lookup: %w", err)
	}
	return &txn, nil
}

// Get returns a transaction, scoped to a retailer when retailerID is non-nil.
//
// Scoping is mandatory for retailer callers: without it, one retailer could read
// another's transaction by guessing an id.
func (s *TransactionService) Get(ctx context.Context, txnID uuid.UUID, retailerID *uuid.UUID) (*models.Transaction, error) {
	q := s.db.WithContext(ctx).Where("id = ?", txnID)
	if retailerID != nil {
		q = q.Where("retailer_id = ?", *retailerID)
	}

	var txn models.Transaction
	if err := q.First(&txn).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httpx.ErrNotFound
		}
		return nil, fmt.Errorf("transaction: get: %w", err)
	}
	return &txn, nil
}

// GetByTxnID looks a transaction up by its human-facing reference.
func (s *TransactionService) GetByTxnID(ctx context.Context, txnID string, retailerID *uuid.UUID) (*models.Transaction, error) {
	q := s.db.WithContext(ctx).Where("txn_id = ?", txnID)
	if retailerID != nil {
		q = q.Where("retailer_id = ?", *retailerID)
	}

	var txn models.Transaction
	if err := q.First(&txn).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httpx.ErrNotFound
		}
		return nil, fmt.Errorf("transaction: get by txn id: %w", err)
	}
	return &txn, nil
}

// TransactionFilter narrows a transaction search.
//
// It supports both lookup modes the Bharat Connect UI compliance checklist
// mandates: by mobile number plus date range, and by transaction reference.
type TransactionFilter struct {
	RetailerID *uuid.UUID
	Category   string
	Service    string
	Status     string
	// Reference matches our txn id, the provider reference, or the Bharat
	// Connect transaction id.
	Reference string
	// Mobile matches the customer mobile recorded in metadata.
	Mobile string
	From   *time.Time
	To     *time.Time
	Search string

	Page     int
	PageSize int
}

// TransactionPage is a page of transactions.
type TransactionPage struct {
	Items []models.Transaction `json:"items"`
	Total int64                `json:"total"`
	Page  int                  `json:"page"`
	Size  int                  `json:"pageSize"`
}

// List returns a filtered page of transactions, newest first.
func (s *TransactionService) List(ctx context.Context, f TransactionFilter) (*TransactionPage, error) {
	q := s.db.WithContext(ctx).Model(&models.Transaction{})

	if f.RetailerID != nil {
		q = q.Where("retailer_id = ?", *f.RetailerID)
	}
	if f.Category != "" && f.Category != "all" {
		q = q.Where("category = ?", f.Category)
	}
	if f.Service != "" {
		q = q.Where("service = ?", f.Service)
	}
	if f.Status != "" && f.Status != "all" {
		q = q.Where("status = ?", f.Status)
	}

	if f.Reference != "" {
		ref := strings.TrimSpace(f.Reference)
		q = q.Where(
			"txn_id = ? OR provider_ref = ? OR provider_txn_id = ? OR bharat_connect_txn_id = ?",
			ref, ref, ref, ref,
		)
	}
	if f.Mobile != "" {
		// The customer mobile lives in the JSONB metadata, so it is matched with a
		// jsonb text extraction rather than a column comparison.
		q = q.Where("metadata->>'customerMobile' = ?", strings.TrimSpace(f.Mobile))
	}
	if f.From != nil {
		q = q.Where("created_at >= ?", *f.From)
	}
	if f.To != nil {
		q = q.Where("created_at <= ?", *f.To)
	}
	if f.Search != "" {
		like := "%" + strings.TrimSpace(f.Search) + "%"
		q = q.Where("txn_id ILIKE ? OR service ILIKE ? OR retailer ILIKE ?", like, like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("transaction: count: %w", err)
	}

	page, size := normalisePaging(f.Page, f.PageSize)

	var items []models.Transaction
	err := q.Order("created_at DESC").
		Limit(size).Offset((page - 1) * size).
		Find(&items).Error
	if err != nil {
		return nil, fmt.Errorf("transaction: list: %w", err)
	}

	return &TransactionPage{Items: items, Total: total, Page: page, Size: size}, nil
}

// Stats summarises transaction activity for a dashboard.
type Stats struct {
	TodayCount      int64 `json:"todayCount"`
	TodayVolume     Money `json:"todayVolume"`
	TodayCommission Money `json:"todayCommission"`

	SuccessCount int64 `json:"successCount"`
	FailedCount  int64 `json:"failedCount"`
	PendingCount int64 `json:"pendingCount"`

	TotalVolume     Money `json:"totalVolume"`
	TotalCommission Money `json:"totalCommission"`
	WalletBalance   Money `json:"walletBalance"`
}

// Summary computes dashboard statistics, scoped to a retailer when given.
func (s *TransactionService) Summary(ctx context.Context, retailerID *uuid.UUID) (*Stats, error) {
	out := &Stats{
		TodayVolume: decimal.Zero, TodayCommission: decimal.Zero,
		TotalVolume: decimal.Zero, TotalCommission: decimal.Zero,
		WalletBalance: decimal.Zero,
	}

	base := func() *gorm.DB {
		q := s.db.WithContext(ctx).Model(&models.Transaction{})
		if retailerID != nil {
			q = q.Where("retailer_id = ?", *retailerID)
		}
		return q
	}

	// The day boundary follows Asia/Kolkata, since that is the operating day for
	// settlement and for what a retailer considers "today".
	loc, err := time.LoadLocation("Asia/Kolkata")
	if err != nil {
		loc = time.UTC
	}
	now := time.Now().In(loc)
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)

	var todayAgg struct {
		Count      int64
		Volume     decimal.Decimal
		Commission decimal.Decimal
	}
	err = base().
		Select(`COUNT(*) AS count,
		        COALESCE(SUM(amount), 0) AS volume,
		        COALESCE(SUM(commission), 0) AS commission`).
		Where("created_at >= ?", startOfDay.UTC()).
		Where("status = ?", models.TxStatusSuccess).
		Scan(&todayAgg).Error
	if err != nil {
		return nil, fmt.Errorf("transaction: today stats: %w", err)
	}
	out.TodayCount = todayAgg.Count
	out.TodayVolume = todayAgg.Volume
	out.TodayCommission = todayAgg.Commission

	var lifetime struct {
		Volume     decimal.Decimal
		Commission decimal.Decimal
	}
	err = base().
		Select("COALESCE(SUM(amount),0) AS volume, COALESCE(SUM(commission),0) AS commission").
		Where("status = ?", models.TxStatusSuccess).
		Scan(&lifetime).Error
	if err != nil {
		return nil, fmt.Errorf("transaction: lifetime stats: %w", err)
	}
	out.TotalVolume = lifetime.Volume
	out.TotalCommission = lifetime.Commission

	for status, target := range map[models.TxStatus]*int64{
		models.TxStatusSuccess: &out.SuccessCount,
		models.TxStatusFailed:  &out.FailedCount,
		models.TxStatusPending: &out.PendingCount,
	} {
		if err := base().Where("status = ?", status).Count(target).Error; err != nil {
			return nil, fmt.Errorf("transaction: count %s: %w", status, err)
		}
	}

	if retailerID != nil {
		balance, err := s.wallet.Balance(ctx, *retailerID)
		if err != nil {
			return nil, err
		}
		out.WalletBalance = balance
	}

	return out, nil
}

// mergeMetadata merges new keys into existing JSON metadata.
func mergeMetadata(existing datatypes.JSON, extra map[string]any) (datatypes.JSON, error) {
	merged := map[string]any{}
	if len(existing) > 0 {
		if err := json.Unmarshal(existing, &merged); err != nil {
			// Corrupt existing metadata must not block a settlement, so it is
			// replaced rather than propagated as an error.
			merged = map[string]any{}
		}
	}
	for k, v := range extra {
		merged[k] = v
	}

	raw, err := json.Marshal(merged)
	if err != nil {
		return nil, fmt.Errorf("transaction: marshal merged metadata: %w", err)
	}
	return datatypes.JSON(raw), nil
}

// NewTxnID generates a unique, human-readable transaction reference.
//
// The format is a short category prefix, a compact timestamp and a random
// suffix. crypto/rand is used rather than math/rand so references cannot be
// predicted by a client.
func NewTxnID(category string) string {
	prefix := strings.ToUpper(strings.NewReplacer(" ", "", "-", "", "_", "").Replace(category))
	if len(prefix) > 4 {
		prefix = prefix[:4]
	}
	if prefix == "" {
		prefix = "TXN"
	}

	ts := time.Now().UTC().Format("060102150405")

	const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	suffix := make([]byte, 5)
	for i := range suffix {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(alphabet))))
		if err != nil {
			// A failure here is not worth aborting a transaction over; the
			// timestamp plus the unique index still guarantee correctness.
			suffix[i] = alphabet[0]
			continue
		}
		suffix[i] = alphabet[n.Int64()]
	}

	return prefix + ts + string(suffix)
}
