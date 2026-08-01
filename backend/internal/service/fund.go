package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// FundService handles retailer wallet top-up requests.
type FundService struct {
	db     *gorm.DB
	wallet *WalletService
}

// NewFundService builds a FundService.
func NewFundService(db *gorm.DB, wallet *WalletService) *FundService {
	return &FundService{db: db, wallet: wallet}
}

// CreateFundRequestInput is a retailer's top-up submission.
type CreateFundRequestInput struct {
	RetailerID uuid.UUID `json:"-"`

	Amount      Money      `json:"amount" binding:"required"`
	Mode        string     `json:"mode" binding:"required"`
	Bank        string     `json:"bank"`
	UTR         string     `json:"utr"`
	DepositDate *time.Time `json:"depositDate"`
	ProofURL    string     `json:"proofUrl"`
	Remarks     string     `json:"remarks"`

	CompanyBankID *uuid.UUID `json:"companyBankId"`
}

// Create records a pending fund request.
//
// No money moves here. The wallet is only credited when an admin approves, which
// is what prevents a retailer from crediting themselves.
func (s *FundService) Create(ctx context.Context, in CreateFundRequestInput) (*models.FundRequest, error) {
	if in.Amount.LessThanOrEqual(decimal.Zero) {
		return nil, fmt.Errorf("%w: amount must be positive", httpx.ErrConflict)
	}

	var retailer models.Retailer
	if err := s.db.WithContext(ctx).Where("id = ?", in.RetailerID).First(&retailer).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, httpx.ErrNotFound
		}
		return nil, err
	}

	// A duplicate UTR almost always means an accidental double submission of the
	// same bank transfer, which would otherwise be credited twice on approval.
	if utr := strings.TrimSpace(in.UTR); utr != "" {
		var existing int64
		if err := s.db.WithContext(ctx).Model(&models.FundRequest{}).
			Where("utr = ? AND status <> ?", utr, models.FundRequestRejected).
			Count(&existing).Error; err != nil {
			return nil, fmt.Errorf("fund: check duplicate utr: %w", err)
		}
		if existing > 0 {
			return nil, fmt.Errorf("%w: a request with UTR %s already exists", httpx.ErrConflict, utr)
		}
	}

	req := &models.FundRequest{
		RetailerID:    in.RetailerID,
		Retailer:      retailer.ShopName,
		Amount:        in.Amount,
		Mode:          in.Mode,
		Bank:          in.Bank,
		UTR:           strings.TrimSpace(in.UTR),
		CompanyBankID: in.CompanyBankID,
		DepositDate:   in.DepositDate,
		ProofURL:      in.ProofURL,
		Remarks:       in.Remarks,
		Status:        models.FundRequestPending,
	}

	if err := s.db.WithContext(ctx).Create(req).Error; err != nil {
		return nil, fmt.Errorf("fund: create request: %w", err)
	}
	return req, nil
}

// FundRequestFilter narrows a fund-request search.
type FundRequestFilter struct {
	RetailerID *uuid.UUID
	Status     string
	Search     string
	Page       int
	PageSize   int
}

// FundRequestPage is a page of fund requests.
type FundRequestPage struct {
	Items []models.FundRequest `json:"items"`
	Total int64                `json:"total"`
	Page  int                  `json:"page"`
	Size  int                  `json:"pageSize"`
}

// List returns a filtered page of fund requests.
func (s *FundService) List(ctx context.Context, f FundRequestFilter) (*FundRequestPage, error) {
	q := s.db.WithContext(ctx).Model(&models.FundRequest{})

	if f.RetailerID != nil {
		q = q.Where("retailer_id = ?", *f.RetailerID)
	}
	if f.Status != "" && f.Status != "all" {
		q = q.Where("status = ?", f.Status)
	}
	if f.Search != "" {
		like := "%" + strings.TrimSpace(f.Search) + "%"
		q = q.Where("retailer ILIKE ? OR utr ILIKE ? OR bank ILIKE ?", like, like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("fund: count: %w", err)
	}

	page, size := normalisePaging(f.Page, f.PageSize)

	var items []models.FundRequest
	err := q.Order("created_at DESC").Limit(size).Offset((page - 1) * size).Find(&items).Error
	if err != nil {
		return nil, fmt.Errorf("fund: list: %w", err)
	}

	return &FundRequestPage{Items: items, Total: total, Page: page, Size: size}, nil
}

// Approve credits a retailer's wallet and marks the request approved.
//
// The status transition and the wallet credit happen in one transaction under a
// row lock, so a double-click cannot credit twice.
func (s *FundService) Approve(ctx context.Context, requestID, adminID uuid.UUID, note string) (*models.FundRequest, error) {
	var out *models.FundRequest

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var req models.FundRequest
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", requestID).First(&req).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return httpx.ErrNotFound
			}
			return err
		}

		// Only a pending request may be approved. Re-approving an approved one
		// would credit the retailer a second time.
		if req.Status != models.FundRequestPending {
			return fmt.Errorf("%w: request is already %s", httpx.ErrConflict, req.Status)
		}

		now := time.Now().UTC()
		if err := tx.Model(&models.FundRequest{}).Where("id = ?", req.ID).
			Updates(map[string]any{
				"status":         models.FundRequestApproved,
				"reviewed_by_id": adminID,
				"reviewed_at":    now,
				"review_note":    note,
			}).Error; err != nil {
			return fmt.Errorf("fund: approve: %w", err)
		}

		reqID := req.ID
		if _, err := s.wallet.applyLocked(tx, LedgerEntry{
			RetailerID:    req.RetailerID,
			Amount:        req.Amount,
			Reason:        models.ReasonFundRequest,
			Narration:     fmt.Sprintf("Fund request approved (%s)", firstNonEmptyStr(req.UTR, req.Mode)),
			FundRequestID: &reqID,
			ActorID:       &adminID,
		}, models.LedgerCredit); err != nil {
			return err
		}

		var reloaded models.FundRequest
		if err := tx.Where("id = ?", req.ID).First(&reloaded).Error; err != nil {
			return err
		}
		out = &reloaded
		return nil
	})

	return out, err
}

// Reject marks a request rejected. No money moves.
func (s *FundService) Reject(ctx context.Context, requestID, adminID uuid.UUID, reason string) (*models.FundRequest, error) {
	var out *models.FundRequest

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var req models.FundRequest
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", requestID).First(&req).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return httpx.ErrNotFound
			}
			return err
		}
		if req.Status != models.FundRequestPending {
			return fmt.Errorf("%w: request is already %s", httpx.ErrConflict, req.Status)
		}

		now := time.Now().UTC()
		if err := tx.Model(&models.FundRequest{}).Where("id = ?", req.ID).
			Updates(map[string]any{
				"status":         models.FundRequestRejected,
				"reviewed_by_id": adminID,
				"reviewed_at":    now,
				"review_note":    reason,
			}).Error; err != nil {
			return fmt.Errorf("fund: reject: %w", err)
		}

		var reloaded models.FundRequest
		if err := tx.Where("id = ?", req.ID).First(&reloaded).Error; err != nil {
			return err
		}
		out = &reloaded
		return nil
	})

	return out, err
}

// PendingCount returns the number of requests awaiting review.
func (s *FundService) PendingCount(ctx context.Context) (int64, error) {
	var n int64
	err := s.db.WithContext(ctx).Model(&models.FundRequest{}).
		Where("status = ?", models.FundRequestPending).Count(&n).Error
	return n, err
}
