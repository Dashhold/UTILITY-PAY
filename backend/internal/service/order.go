package service

import (
	"context"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// OrderService manages the product-order lifecycle.
type OrderService struct {
	db *gorm.DB
}

// NewOrderService builds an OrderService.
func NewOrderService(db *gorm.DB) *OrderService {
	return &OrderService{db: db}
}

// SetStatus applies a status change and any side effects it implies.
//
// Cancelling returns the ordered quantities to stock, which the Product model
// documents as the behaviour. Doing it here in a transaction alongside the status
// write means stock and status cannot disagree if one of the two fails.
func (s *OrderService) SetStatus(
	ctx context.Context,
	orderID uuid.UUID,
	status models.OrderStatus,
	updates map[string]any,
) (*models.ProductOrder, error) {
	var order models.ProductOrder

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// The row is locked for the duration so two admins cancelling the same
		// order concurrently cannot both restore its stock.
		err := tx.Preload("Items").
			Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", orderID).
			First(&order).Error
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return httpx.ErrNotFound
		}
		if err != nil {
			return fmt.Errorf("order: load: %w", err)
		}

		if order.Status == status {
			// Nothing to do, and re-running the side effects would double-count.
			return nil
		}

		// A delivered order is the end of the line. Allowing it to be cancelled
		// afterwards would return stock that has already left the warehouse.
		if order.Status == models.OrderDelivered && status == models.OrderCancelled {
			return fmt.Errorf("%w: a delivered order cannot be cancelled", httpx.ErrConflict)
		}
		if order.Status == models.OrderCancelled && status != models.OrderCancelled {
			return fmt.Errorf("%w: a cancelled order cannot be reopened", httpx.ErrConflict)
		}

		if err := tx.Model(&models.ProductOrder{}).
			Where("id = ?", orderID).
			Updates(updates).Error; err != nil {
			return fmt.Errorf("order: update status: %w", err)
		}

		if status == models.OrderCancelled {
			if err := restoreStock(tx, order); err != nil {
				return err
			}
		}

		return tx.Preload("Items").Where("id = ?", orderID).First(&order).Error
	})
	if err != nil {
		return nil, err
	}
	return &order, nil
}

// restoreStock returns an order's quantities to the catalogue.
//
// Lines whose product has since been deleted are skipped rather than failing the
// cancellation: the order still needs to be cancelled either way.
func restoreStock(tx *gorm.DB, order models.ProductOrder) error {
	for _, item := range order.Items {
		if item.ProductID == nil || item.Quantity <= 0 {
			continue
		}
		res := tx.Model(&models.Product{}).
			Where("id = ?", *item.ProductID).
			UpdateColumn("stock", gorm.Expr("stock + ?", item.Quantity))
		if res.Error != nil {
			return fmt.Errorf("order: restore stock: %w", res.Error)
		}
	}
	return nil
}
