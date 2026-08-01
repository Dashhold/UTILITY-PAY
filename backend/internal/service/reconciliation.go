package service

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/utilipay/backend/internal/config"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider"
)

// Reconciler resolves transactions that never reached a terminal state.
//
// This implements the behaviour the UAT checklist requires answers for:
//
//	Item 15 (pending handling)  — Pending transactions are those whose provider
//	  response was accepted-but-unsettled. They are marked pending, a wallet hold
//	  is retained (never reversed), and NextStatusCheckAt is scheduled. They stay
//	  pending until a status check returns a terminal verdict or the retry ladder
//	  is exhausted, at which point they are flagged for manual review rather than
//	  silently failed.
//
//	Item 16 (timeout handling)  — A timeout is detected at the transport layer
//	  (see provider.classifyTransportError) and is recorded distinctly via the
//	  TimedOut column. It is treated exactly like pending for retry purposes and
//	  is never auto-reversed, because the provider may have completed the payment.
//	  A definitive 4xx rejection, by contrast, is terminal and reverses the hold
//	  immediately. Final reconciliation is via the provider status API; anything
//	  still unresolved after the ladder is escalated.
//
//	Item 17 (retry interval)    — The ladder is configured in
//	  config.ReconciliationConfig.BackoffSchedule: 30s, 2m, 5m, 15m, 30m, 1h, 3h,
//	  6h, measured from transaction creation, for a maximum of 8 attempts over
//	  roughly 11 hours. Early checks catch fast-settling transactions; later ones
//	  stretch toward the provider's T+1 window without hammering their API.
type Reconciler struct {
	db     *gorm.DB
	cfg    config.ReconciliationConfig
	wallet *WalletService
	log    *slog.Logger

	// resolvers map a provider to the function that polls it.
	resolvers map[models.ProviderName]StatusResolver
}

// StatusResolver polls an upstream provider for a transaction's outcome.
type StatusResolver interface {
	// ResolveStatus returns the current outcome for a transaction.
	ResolveStatus(ctx context.Context, txn *models.Transaction) (*StatusResult, error)
}

// StatusResult is a normalised status-check outcome.
type StatusResult struct {
	Outcome            provider.Outcome
	ProviderTxnID      string
	BharatConnectTxnID string
	StatusCode         string
	Message            string
}

// NewReconciler builds a Reconciler.
func NewReconciler(db *gorm.DB, cfg config.ReconciliationConfig, wallet *WalletService, log *slog.Logger) *Reconciler {
	return &Reconciler{
		db:        db,
		cfg:       cfg,
		wallet:    wallet,
		log:       log,
		resolvers: make(map[models.ProviderName]StatusResolver),
	}
}

// Register wires a resolver for a provider.
func (r *Reconciler) Register(name models.ProviderName, resolver StatusResolver) {
	r.resolvers[name] = resolver
}

// Run drives the sweep loop until the context is cancelled.
func (r *Reconciler) Run(ctx context.Context) {
	if !r.cfg.Enabled {
		r.log.Info("reconciliation worker disabled by configuration")
		return
	}

	r.log.Info("reconciliation worker started",
		slog.Duration("interval", r.cfg.Interval),
		slog.Int("maxAttempts", r.cfg.MaxAttempts),
		slog.Int("batchSize", r.cfg.BatchSize),
	)

	ticker := time.NewTicker(r.cfg.Interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			r.log.Info("reconciliation worker stopped")
			return
		case <-ticker.C:
			if err := r.Sweep(ctx); err != nil {
				// A failed sweep must not kill the loop: the next tick retries.
				r.log.Error("reconciliation sweep failed", slog.Any("error", err))
			}
		}
	}
}

// Sweep processes one batch of due transactions.
func (r *Reconciler) Sweep(ctx context.Context) error {
	due, err := r.claimDue(ctx)
	if err != nil {
		return err
	}
	if len(due) == 0 {
		return nil
	}

	r.log.Info("reconciling transactions", slog.Int("count", len(due)))

	for i := range due {
		txn := &due[i]
		if err := r.resolve(ctx, txn); err != nil {
			// One transaction's failure must not abort the batch.
			r.log.Error("failed to resolve transaction",
				slog.String("txnId", txn.TxnID),
				slog.Any("error", err),
			)
		}
	}
	return nil
}

// claimDue selects transactions whose next status check is due.
//
// SKIP LOCKED lets multiple worker instances run concurrently without two of
// them polling the same transaction.
func (r *Reconciler) claimDue(ctx context.Context) ([]models.Transaction, error) {
	var txns []models.Transaction

	err := r.db.WithContext(ctx).
		Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
		Where("status IN ?", []models.TxStatus{models.TxStatusPending, models.TxStatusProcessing}).
		Where("needs_manual_review = ?", false).
		Where("next_status_check_at IS NOT NULL AND next_status_check_at <= ?", time.Now().UTC()).
		Order("next_status_check_at ASC").
		Limit(r.cfg.BatchSize).
		Find(&txns).Error
	if err != nil {
		return nil, fmt.Errorf("reconciler: claim due transactions: %w", err)
	}
	return txns, nil
}

// resolve polls one transaction and applies the verdict.
func (r *Reconciler) resolve(ctx context.Context, txn *models.Transaction) error {
	resolver, ok := r.resolvers[txn.Provider]
	if !ok {
		// No resolver means we cannot ever settle this automatically. Escalating
		// is the honest outcome; leaving it to spin forever is not.
		return r.escalate(ctx, txn, fmt.Sprintf("no status resolver registered for provider %q", txn.Provider))
	}

	attempt := txn.StatusCheckAttempts + 1
	result, err := resolver.ResolveStatus(ctx, txn)

	now := time.Now().UTC()
	txn.StatusCheckAttempts = attempt
	txn.LastStatusCheckAt = &now

	if err != nil {
		outcome := provider.OutcomeOf(err)
		// A status check that itself fails or times out tells us nothing new, so
		// the transaction stays unresolved and is rescheduled.
		if outcome.NeedsStatusCheck() || errors.Is(err, provider.ErrIntegrationDisabled) {
			return r.reschedule(ctx, txn, err.Error())
		}
		return r.reschedule(ctx, txn, err.Error())
	}

	switch result.Outcome {
	case provider.OutcomeSuccess:
		return r.settleSuccess(ctx, txn, result)
	case provider.OutcomeFailed:
		return r.settleFailure(ctx, txn, result)
	default:
		// Still pending or inconclusive.
		return r.reschedule(ctx, txn, result.Message)
	}
}

// settleSuccess marks a transaction successful and records provider references.
func (r *Reconciler) settleSuccess(ctx context.Context, txn *models.Transaction, res *StatusResult) error {
	now := time.Now().UTC()

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{
			"status":                models.TxStatusSuccess,
			"status_check_attempts": txn.StatusCheckAttempts,
			"last_status_check_at":  now,
			"next_status_check_at":  nil,
			"completed_at":          now,
			"provider_status_code":  res.StatusCode,
			"provider_message":      truncateStr(res.Message, 500),
		}
		if res.ProviderTxnID != "" {
			updates["provider_txn_id"] = res.ProviderTxnID
		}
		if res.BharatConnectTxnID != "" {
			updates["bharat_connect_txn_id"] = res.BharatConnectTxnID
		}

		if err := tx.Model(&models.Transaction{}).Where("id = ?", txn.ID).Updates(updates).Error; err != nil {
			return fmt.Errorf("reconciler: mark success: %w", err)
		}
		return nil
	})
}

// settleFailure marks a transaction failed and reverses the wallet hold.
//
// This is the only path that returns money to a retailer automatically, and it
// runs solely on a definitive provider rejection.
func (r *Reconciler) settleFailure(ctx context.Context, txn *models.Transaction, res *StatusResult) error {
	now := time.Now().UTC()

	return r.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		updates := map[string]any{
			"status":                models.TxStatusFailed,
			"status_check_attempts": txn.StatusCheckAttempts,
			"last_status_check_at":  now,
			"next_status_check_at":  nil,
			"completed_at":          now,
			"provider_status_code":  res.StatusCode,
			"provider_message":      truncateStr(res.Message, 500),
		}
		if err := tx.Model(&models.Transaction{}).Where("id = ?", txn.ID).Updates(updates).Error; err != nil {
			return fmt.Errorf("reconciler: mark failed: %w", err)
		}

		// Reverse the hold only once. A guard on the ledger prevents a double
		// refund if a sweep somehow processes the same transaction twice.
		var existing int64
		if err := tx.Model(&models.WalletLedger{}).
			Where("transaction_id = ? AND reason = ?", txn.ID, models.ReasonReversal).
			Count(&existing).Error; err != nil {
			return fmt.Errorf("reconciler: check existing reversal: %w", err)
		}
		if existing > 0 {
			return nil
		}

		// Only reverse what was actually debited.
		if txn.NetAmount.IsZero() {
			return nil
		}

		txnID := txn.ID
		if _, err := r.wallet.applyLocked(tx, LedgerEntry{
			RetailerID:    txn.RetailerID,
			Amount:        txn.NetAmount,
			Reason:        models.ReasonReversal,
			Narration:     fmt.Sprintf("Reversal for failed transaction %s", txn.TxnID),
			TransactionID: &txnID,
		}, models.LedgerCredit); err != nil {
			return fmt.Errorf("reconciler: reverse hold: %w", err)
		}
		return nil
	})
}

// reschedule advances the retry ladder, escalating when it is exhausted.
func (r *Reconciler) reschedule(ctx context.Context, txn *models.Transaction, note string) error {
	if txn.StatusCheckAttempts >= r.cfg.MaxAttempts || txn.StatusCheckAttempts >= len(r.cfg.BackoffSchedule) {
		return r.escalate(ctx, txn, note)
	}

	next := r.nextCheckAt(txn.CreatedAt, txn.StatusCheckAttempts)
	now := time.Now().UTC()

	err := r.db.WithContext(ctx).Model(&models.Transaction{}).
		Where("id = ?", txn.ID).
		Updates(map[string]any{
			"status_check_attempts": txn.StatusCheckAttempts,
			"last_status_check_at":  now,
			"next_status_check_at":  next,
			"provider_message":      truncateStr(note, 500),
		}).Error
	if err != nil {
		return fmt.Errorf("reconciler: reschedule: %w", err)
	}

	r.log.Debug("transaction rescheduled",
		slog.String("txnId", txn.TxnID),
		slog.Int("attempt", txn.StatusCheckAttempts),
		slog.Time("nextCheck", next),
	)
	return nil
}

// escalate flags a transaction for human intervention.
//
// The wallet hold is intentionally left in place: an unresolved transaction may
// have succeeded upstream, so refunding it automatically could hand the retailer
// money for a payment the customer received.
func (r *Reconciler) escalate(ctx context.Context, txn *models.Transaction, note string) error {
	now := time.Now().UTC()

	err := r.db.WithContext(ctx).Model(&models.Transaction{}).
		Where("id = ?", txn.ID).
		Updates(map[string]any{
			"needs_manual_review":   true,
			"next_status_check_at":  nil,
			"status_check_attempts": txn.StatusCheckAttempts,
			"last_status_check_at":  now,
			"provider_message":      truncateStr("escalated for manual review: "+note, 500),
		}).Error
	if err != nil {
		return fmt.Errorf("reconciler: escalate: %w", err)
	}

	r.log.Warn("transaction escalated for manual review",
		slog.String("txnId", txn.TxnID),
		slog.String("provider", string(txn.Provider)),
		slog.Int("attempts", txn.StatusCheckAttempts),
		slog.String("note", note),
	)
	return nil
}

// nextCheckAt computes the next poll time from the transaction's creation time
// and the number of completed attempts.
//
// Anchoring on CreatedAt rather than "now" keeps the ladder honest: a worker
// outage does not push the whole schedule later, it just means the next due
// check fires immediately on recovery.
func (r *Reconciler) nextCheckAt(createdAt time.Time, completedAttempts int) time.Time {
	schedule := r.cfg.BackoffSchedule
	if len(schedule) == 0 {
		return time.Now().UTC().Add(5 * time.Minute)
	}

	idx := completedAttempts
	if idx >= len(schedule) {
		idx = len(schedule) - 1
	}

	next := createdAt.UTC().Add(schedule[idx])
	// Never schedule in the past: that would busy-loop the worker.
	if earliest := time.Now().UTC().Add(10 * time.Second); next.Before(earliest) {
		return earliest
	}
	return next
}

// ScheduleFirstCheck sets the initial poll time on a freshly created
// unresolved transaction.
func (r *Reconciler) ScheduleFirstCheck(ctx context.Context, txnID uuid.UUID, createdAt time.Time, timedOut bool) error {
	next := r.nextCheckAt(createdAt, 0)

	err := r.db.WithContext(ctx).Model(&models.Transaction{}).
		Where("id = ?", txnID).
		Updates(map[string]any{
			"next_status_check_at": next,
			"timed_out":            timedOut,
		}).Error
	if err != nil {
		return fmt.Errorf("reconciler: schedule first check: %w", err)
	}
	return nil
}

// PendingSummary reports the current reconciliation backlog, for an operations
// dashboard or alert.
type PendingSummary struct {
	Pending           int64 `json:"pending"`
	Processing        int64 `json:"processing"`
	TimedOut          int64 `json:"timedOut"`
	AwaitingReview    int64 `json:"awaitingReview"`
	DueForStatusCheck int64 `json:"dueForStatusCheck"`
}

// Summary returns the reconciliation backlog.
func (r *Reconciler) Summary(ctx context.Context) (*PendingSummary, error) {
	var out PendingSummary
	base := func() *gorm.DB { return r.db.WithContext(ctx).Model(&models.Transaction{}) }

	if err := base().Where("status = ?", models.TxStatusPending).Count(&out.Pending).Error; err != nil {
		return nil, err
	}
	if err := base().Where("status = ?", models.TxStatusProcessing).Count(&out.Processing).Error; err != nil {
		return nil, err
	}
	if err := base().Where("timed_out = ? AND status NOT IN ?", true,
		[]models.TxStatus{models.TxStatusSuccess, models.TxStatusFailed, models.TxStatusRefunded}).
		Count(&out.TimedOut).Error; err != nil {
		return nil, err
	}
	if err := base().Where("needs_manual_review = ?", true).Count(&out.AwaitingReview).Error; err != nil {
		return nil, err
	}
	if err := base().
		Where("status IN ?", []models.TxStatus{models.TxStatusPending, models.TxStatusProcessing}).
		Where("needs_manual_review = ?", false).
		Where("next_status_check_at IS NOT NULL AND next_status_check_at <= ?", time.Now().UTC()).
		Count(&out.DueForStatusCheck).Error; err != nil {
		return nil, err
	}
	return &out, nil
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
