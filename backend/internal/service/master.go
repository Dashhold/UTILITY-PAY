package service

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// MasterService provides generic CRUD over the admin master-data tables.
//
// The admin panel manages eight structurally identical resources. Writing eight
// near-identical handler sets would multiply the surface for a scoping or
// validation mistake, so the shared behaviour lives here once and is
// parameterised by type.
type MasterService struct {
	db *gorm.DB
}

// NewMasterService builds a MasterService.
func NewMasterService(db *gorm.DB) *MasterService {
	return &MasterService{db: db}
}

// DB exposes the handle for the generic helpers below.
func (s *MasterService) DB() *gorm.DB { return s.db }

// ListOptions controls a master-data listing.
type ListOptions struct {
	Search string
	// SearchColumns are the columns a search term is matched against. Supplying
	// them explicitly avoids interpolating user input into a column position.
	SearchColumns []string
	Status        string
	OrderBy       string
	Page          int
	PageSize      int
}

// Page is a generic page of records.
type Page[T any] struct {
	Items []T   `json:"items"`
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Size  int   `json:"pageSize"`
}

// ListMaster returns a filtered page of a master-data type.
func ListMaster[T any](ctx context.Context, db *gorm.DB, opts ListOptions) (*Page[T], error) {
	var model T
	q := db.WithContext(ctx).Model(&model)

	if opts.Status != "" && opts.Status != "all" {
		q = q.Where("status = ?", opts.Status)
	}

	if search := strings.TrimSpace(opts.Search); search != "" && len(opts.SearchColumns) > 0 {
		like := "%" + search + "%"

		// Column names come from a fixed allow-list supplied by the caller, never
		// from the request, so this cannot become an injection point.
		clauses := make([]string, 0, len(opts.SearchColumns))
		args := make([]any, 0, len(opts.SearchColumns))
		for _, col := range opts.SearchColumns {
			clauses = append(clauses, col+" ILIKE ?")
			args = append(args, like)
		}
		q = q.Where(strings.Join(clauses, " OR "), args...)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("master: count: %w", err)
	}

	page, size := normalisePaging(opts.Page, opts.PageSize)

	order := opts.OrderBy
	if order == "" {
		order = "created_at DESC"
	}

	var items []T
	if err := q.Order(order).Limit(size).Offset((page - 1) * size).Find(&items).Error; err != nil {
		return nil, fmt.Errorf("master: list: %w", err)
	}

	return &Page[T]{Items: items, Total: total, Page: page, Size: size}, nil
}

// GetMaster loads one record by id.
func GetMaster[T any](ctx context.Context, db *gorm.DB, id uuid.UUID) (*T, error) {
	var out T
	err := db.WithContext(ctx).Where("id = ?", id).First(&out).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, httpx.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("master: get: %w", err)
	}
	return &out, nil
}

// CreateMaster inserts a record.
func CreateMaster[T any](ctx context.Context, db *gorm.DB, record *T) error {
	if err := db.WithContext(ctx).Create(record).Error; err != nil {
		if isUniqueViolation(err) {
			return fmt.Errorf("%w: a record with these details already exists", httpx.ErrConflict)
		}
		return fmt.Errorf("master: create: %w", err)
	}
	return nil
}

// UpdateMaster applies a field map to a record.
//
// A map is used rather than a struct so a zero value can be written
// deliberately; GORM's struct updates skip zero values, which would make it
// impossible to set a count back to zero or clear a flag.
func UpdateMaster[T any](ctx context.Context, db *gorm.DB, id uuid.UUID, updates map[string]any) (*T, error) {
	if len(updates) == 0 {
		return GetMaster[T](ctx, db, id)
	}

	var model T
	res := db.WithContext(ctx).Model(&model).Where("id = ?", id).Updates(updates)
	if res.Error != nil {
		if isUniqueViolation(res.Error) {
			return nil, fmt.Errorf("%w: a record with these details already exists", httpx.ErrConflict)
		}
		return nil, fmt.Errorf("master: update: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return nil, httpx.ErrNotFound
	}
	return GetMaster[T](ctx, db, id)
}

// DeleteMaster removes a record, soft-deleting when the model supports it.
func DeleteMaster[T any](ctx context.Context, db *gorm.DB, id uuid.UUID) error {
	var model T
	res := db.WithContext(ctx).Where("id = ?", id).Delete(&model)
	if res.Error != nil {
		return fmt.Errorf("master: delete: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return httpx.ErrNotFound
	}
	return nil
}

// SetDefaultCompanyBank makes one bank the default, clearing any previous one.
//
// Both writes happen in a transaction because a partial application would either
// leave two defaults, violating the partial unique index, or none at all.
func (s *MasterService) SetDefaultCompanyBank(ctx context.Context, id uuid.UUID) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.CompanyBank{}).
			Where("is_default = ?", true).
			Update("is_default", false).Error; err != nil {
			return fmt.Errorf("master: clear default bank: %w", err)
		}

		res := tx.Model(&models.CompanyBank{}).Where("id = ?", id).Update("is_default", true)
		if res.Error != nil {
			return fmt.Errorf("master: set default bank: %w", res.Error)
		}
		if res.RowsAffected == 0 {
			return httpx.ErrNotFound
		}
		return nil
	})
}

// AdjustProductStock changes stock by a delta, refusing to go negative.
//
// The guard is expressed in SQL so two concurrent orders cannot both pass a
// read-then-write check and oversell the last unit.
func (s *MasterService) AdjustProductStock(ctx context.Context, productID uuid.UUID, delta int) error {
	q := s.db.WithContext(ctx).Model(&models.Product{}).Where("id = ?", productID)
	if delta < 0 {
		q = q.Where("stock >= ?", -delta)
	}

	res := q.UpdateColumn("stock", gorm.Expr("stock + ?", delta))
	if res.Error != nil {
		return fmt.Errorf("master: adjust stock: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("%w: insufficient stock", httpx.ErrConflict)
	}
	return nil
}

// isUniqueViolation detects a duplicate-key error from PostgreSQL.
func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") ||
		strings.Contains(msg, "unique constraint") ||
		strings.Contains(msg, "23505")
}
