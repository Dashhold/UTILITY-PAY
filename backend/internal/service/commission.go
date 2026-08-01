package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/models"
)

// CommissionService resolves what a retailer earns on a transaction.
type CommissionService struct {
	db *gorm.DB
}

// NewCommissionService builds a CommissionService.
func NewCommissionService(db *gorm.DB) *CommissionService {
	return &CommissionService{db: db}
}

// Breakdown is the resolved commission for one transaction.
//
// Gross is what the slab awards; TDS and GST are deducted from it; Net is what
// actually reaches the retailer wallet.
type Breakdown struct {
	Gross Money `json:"gross"`
	TDS   Money `json:"tds"`
	GST   Money `json:"gst"`
	Net   Money `json:"net"`

	SlabType  models.SlabType `json:"slabType"`
	SlabValue Money           `json:"slabValue"`
	SlotID    *uuid.UUID      `json:"slotId,omitempty"`
}

// Zero returns an empty breakdown, used when no slab matches.
func zeroBreakdown() Breakdown {
	return Breakdown{
		Gross: decimal.Zero, TDS: decimal.Zero,
		GST: decimal.Zero, Net: decimal.Zero,
	}
}

// Resolve computes the commission for a service and amount.
//
// Slab selection prefers the most specific match: a slot bound to the retailer's
// user type wins over a generic one, and only slots whose amount band contains
// the transaction are considered. When nothing matches the result is zero rather
// than an error, because a missing slab means "no commission configured", not a
// failed transaction.
func (s *CommissionService) Resolve(ctx context.Context, serviceName string, userTypeID *uuid.UUID, amount Money) (Breakdown, error) {
	q := s.db.WithContext(ctx).
		Where("service = ?", serviceName).
		Where("status = ?", models.StatusActive)

	// A max of zero is treated as "no upper bound", which is how the seeded
	// enquiry-style services are configured.
	q = q.Where("min_amount <= ?", amount).
		Where("(max_amount = 0 OR max_amount >= ?)", amount)

	var slots []models.CommissionSlot
	if err := q.Find(&slots).Error; err != nil {
		return zeroBreakdown(), fmt.Errorf("commission: load slabs: %w", err)
	}
	if len(slots) == 0 {
		return zeroBreakdown(), nil
	}

	chosen := pickSlab(slots, userTypeID)
	if chosen == nil {
		return zeroBreakdown(), nil
	}

	gross := chosen.Value
	if chosen.SlabType == models.SlabPercentage {
		// Percentage slabs are stored as whole percents, e.g. 0.45 means 0.45%.
		gross = amount.Mul(chosen.Value).Div(decimal.NewFromInt(100))
	}
	// Money is rounded to paise at the point it is computed, so downstream
	// arithmetic never carries sub-paise fractions into the ledger.
	gross = gross.Round(2)

	tds := gross.Mul(chosen.TDS).Div(decimal.NewFromInt(100)).Round(2)
	gst := gross.Mul(chosen.GST).Div(decimal.NewFromInt(100)).Round(2)

	net := gross.Sub(tds).Sub(gst)
	if net.LessThan(decimal.Zero) {
		// Deductions must never invert into a charge on the retailer.
		net = decimal.Zero
	}

	slotID := chosen.ID
	return Breakdown{
		Gross:     gross,
		TDS:       tds,
		GST:       gst,
		Net:       net,
		SlabType:  chosen.SlabType,
		SlabValue: chosen.Value,
		SlotID:    &slotID,
	}, nil
}

// pickSlab selects the best slab from the candidates.
func pickSlab(slots []models.CommissionSlot, userTypeID *uuid.UUID) *models.CommissionSlot {
	var generic *models.CommissionSlot

	for i := range slots {
		slot := &slots[i]
		if slot.UserTypeID == nil {
			if generic == nil {
				generic = slot
			}
			continue
		}
		if userTypeID != nil && *slot.UserTypeID == *userTypeID {
			// An exact user-type match is the most specific option available.
			return slot
		}
	}
	return generic
}

// SlabsForRetailer lists the commission slabs applicable to a retailer, for the
// "My Commission Slab" screen.
func (s *CommissionService) SlabsForRetailer(ctx context.Context, retailerID uuid.UUID) ([]models.CommissionSlot, error) {
	var retailer models.Retailer
	if err := s.db.WithContext(ctx).Where("id = ?", retailerID).First(&retailer).Error; err != nil {
		return nil, fmt.Errorf("commission: load retailer: %w", err)
	}

	q := s.db.WithContext(ctx).Where("status = ?", models.StatusActive)
	if retailer.UserTypeID != nil {
		// Slabs bound to another user type are not this retailer's rates and must
		// not be shown to them.
		q = q.Where("user_type_id IS NULL OR user_type_id = ?", *retailer.UserTypeID)
	} else {
		q = q.Where("user_type_id IS NULL")
	}

	var slots []models.CommissionSlot
	if err := q.Order("service ASC, min_amount ASC").Find(&slots).Error; err != nil {
		return nil, fmt.Errorf("commission: list slabs: %w", err)
	}
	return slots, nil
}
