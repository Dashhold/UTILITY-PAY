package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
	"github.com/utilipay/backend/internal/provider/bharatconnect"
)

// fetchValidity bounds how long a fetched bill may be paid against.
//
// A bill amount can change at the biller, so a stale fetch must not remain
// payable indefinitely. Fifteen minutes comfortably covers a retailer completing
// a counter transaction.
const fetchValidity = 15 * time.Minute

// BillerService manages the biller catalogue and fetched bills.
type BillerService struct {
	db *gorm.DB
}

// NewBillerService builds a BillerService.
func NewBillerService(db *gorm.DB) *BillerService {
	return &BillerService{db: db}
}

// Category is a Bharat Connect category with its live biller count.
type Category struct {
	Name        string `json:"name"`
	BillerCount int64  `json:"billerCount"`
}

// Categories lists categories that have at least one active biller.
//
// The compliance checklist requires the category screen to show all live
// categories, so this is derived from the catalogue rather than a fixed list.
func (s *BillerService) Categories(ctx context.Context) ([]Category, error) {
	var rows []Category
	err := s.db.WithContext(ctx).
		Model(&models.Biller{}).
		Select("category as name, count(*) as biller_count").
		Where("status = ?", models.StatusActive).
		Group("category").
		Order("category ASC").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("biller: list categories: %w", err)
	}
	return rows, nil
}

// BillerFilter narrows a biller search.
type BillerFilter struct {
	Category string
	Search   string
}

// List returns active billers matching the filter.
func (s *BillerService) List(ctx context.Context, f BillerFilter) ([]models.Biller, error) {
	q := s.db.WithContext(ctx).Where("status = ?", models.StatusActive)

	if f.Category != "" && f.Category != "all" {
		q = q.Where("category = ?", f.Category)
	}
	if f.Search != "" {
		like := "%" + strings.TrimSpace(f.Search) + "%"
		q = q.Where("name ILIKE ? OR biller_id ILIKE ?", like, like)
	}

	var billers []models.Biller
	if err := q.Order("name ASC").Limit(500).Find(&billers).Error; err != nil {
		return nil, fmt.Errorf("biller: list: %w", err)
	}
	return billers, nil
}

// StoreFetchInput carries a freshly fetched bill for persistence.
type StoreFetchInput struct {
	RetailerID uuid.UUID
	OperatorID string
	BillerName string
	Connection string
	CircleID   string
	Bill       bharatconnect.Bill
	AdParams   map[string]string
}

// StoreFetch persists a fetched bill and returns it with a reference.
//
// Persisting the amount server-side is what makes the later payment tamper-proof:
// the client quotes a reference, not a figure.
func (s *BillerService) StoreFetch(ctx context.Context, in StoreFetchInput) (*models.BillFetch, error) {
	amount, err := parseProviderAmount(in.Bill.BillAmount, in.Bill.BillNetAmount)
	if err != nil {
		return nil, fmt.Errorf("biller: parse fetched bill amount: %w", err)
	}

	ref, err := newRequestRef()
	if err != nil {
		return nil, err
	}

	params := models.JSONMap{
		"connection": in.Connection,
		"operatorId": in.OperatorID,
		"circleId":   in.CircleID,
	}
	for k, v := range in.AdParams {
		params[k] = v
	}

	fetch := &models.BillFetch{
		RetailerID:     in.RetailerID,
		BillerID:       in.OperatorID,
		BillerName:     in.BillerName,
		RequestRef:     ref,
		CustomerParams: params,
		CustomerName:   in.Bill.CustomerName,
		// The View Bill response carries no bill number, so the connection
		// number is recorded as the customer-facing identifier on the receipt.
		BillNumber: in.Connection,
		BillAmount: amount,
		ExpiresAt:  time.Now().UTC().Add(fetchValidity),
	}

	if d := parseProviderDate(in.Bill.BillDate); d != nil {
		fetch.BillDate = d
	}
	if d := parseProviderDate(in.Bill.DueDate); d != nil {
		fetch.DueDate = d
	}

	if err := s.db.WithContext(ctx).Create(fetch).Error; err != nil {
		return nil, fmt.Errorf("biller: store fetch: %w", err)
	}
	return fetch, nil
}

// ConsumableFetch loads a fetch that is still valid and unpaid.
//
// It is scoped to the retailer so one retailer cannot pay against another's
// fetched bill.
func (s *BillerService) ConsumableFetch(ctx context.Context, ref string, retailerID uuid.UUID) (*models.BillFetch, error) {
	var fetch models.BillFetch
	err := s.db.WithContext(ctx).
		Where("request_ref = ? AND retailer_id = ?", ref, retailerID).
		First(&fetch).Error

	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, fmt.Errorf("%w: bill fetch %s", httpx.ErrNotFound, ref)
	}
	if err != nil {
		return nil, fmt.Errorf("biller: load fetch: %w", err)
	}

	if fetch.ConsumedByTransactionID != nil {
		return nil, fmt.Errorf("%w: this bill has already been paid", httpx.ErrConflict)
	}
	if !fetch.ExpiresAt.After(time.Now()) {
		return nil, fmt.Errorf("%w: this bill fetch has expired, please fetch again", httpx.ErrConflict)
	}
	return &fetch, nil
}

// ConsumeFetch marks a fetch as paid.
//
// The update is conditional on the row still being unconsumed, so two concurrent
// payments cannot both claim the same bill.
func (s *BillerService) ConsumeFetch(ctx context.Context, ref string, txnID uuid.UUID) error {
	res := s.db.WithContext(ctx).
		Model(&models.BillFetch{}).
		Where("request_ref = ? AND consumed_by_transaction_id IS NULL", ref).
		Update("consumed_by_transaction_id", txnID)

	if res.Error != nil {
		return fmt.Errorf("biller: consume fetch: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("%w: bill fetch %s was already consumed", httpx.ErrConflict, ref)
	}
	return nil
}

// PurgeExpiredFetches deletes fetches that expired and were never paid.
func (s *BillerService) PurgeExpiredFetches(ctx context.Context, olderThan time.Duration) (int64, error) {
	cutoff := time.Now().UTC().Add(-olderThan)
	res := s.db.WithContext(ctx).
		Where("consumed_by_transaction_id IS NULL AND expires_at < ?", cutoff).
		Delete(&models.BillFetch{})
	return res.RowsAffected, res.Error
}

// parseProviderAmount reads a decimal amount from the provider's string fields,
// preferring the net amount when the two differ.
func parseProviderAmount(billAmount, netAmount string) (Money, error) {
	// The specification notes billnetamount is the final figure for some
	// operators, so it takes precedence when present.
	for _, candidate := range []string{netAmount, billAmount} {
		trimmed := strings.TrimSpace(strings.ReplaceAll(candidate, ",", ""))
		if trimmed == "" {
			continue
		}
		if d, err := decimal.NewFromString(trimmed); err == nil {
			return d, nil
		}
	}
	return decimal.Zero, fmt.Errorf("no parseable amount in %q / %q", billAmount, netAmount)
}

// parseProviderDate parses the date formats the provider emits.
//
// The View Bill example returns "24-Nov-2025" while the credit-card example
// returns "2025-10-02", so both are accepted.
func parseProviderDate(raw string) *time.Time {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	for _, layout := range []string{"02-Jan-2006", "2006-01-02", "02/01/2006", time.RFC3339} {
		if t, err := time.Parse(layout, raw); err == nil {
			return &t
		}
	}
	return nil
}

// newRequestRef generates an unguessable bill-fetch reference.
func newRequestRef() (string, error) {
	buf := make([]byte, 12)
	if _, err := rand.Read(buf); err != nil {
		return "", fmt.Errorf("biller: generate request ref: %w", err)
	}
	return "BF" + strings.ToUpper(hex.EncodeToString(buf)), nil
}
