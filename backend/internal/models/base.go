// Package models contains the GORM domain model for the UtiliPay platform.
//
// Field names and enum values mirror utility-frontend/src/lib/types.ts so the
// API can serve the existing UI without a translation layer.
package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"
)

// Money is the canonical monetary type: an exact decimal backed by
// NUMERIC(18,2) in PostgreSQL.
//
// Binary floating point is never used for money here. Values are denominated in
// rupees, matching what the frontend's formatCurrency expects.
type Money = decimal.Decimal

// Base is embedded by every persisted entity.
//
// UUID primary keys are generated in Go rather than by the database so that a
// caller holds the identifier before the row is written, which keeps
// multi-table writes inside one transaction straightforward.
type Base struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	CreatedAt time.Time `gorm:"not null;index" json:"createdAt"`
	UpdatedAt time.Time `gorm:"not null" json:"updatedAt"`
}

// BeforeCreate assigns a UUIDv4 when the caller has not supplied one.
func (b *Base) BeforeCreate(*gorm.DB) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	return nil
}

// SoftDelete adds a soft-delete marker. It is applied only to entities that
// must survive deletion for audit or referential reasons; ledger rows are never
// soft-deleted because they are append-only.
type SoftDelete struct {
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// Zero returns a zero Money value.
func Zero() Money { return decimal.Zero }

// FromFloat builds Money from a float. Use only at the untrusted input boundary
// after validation; prefer FromString when the source is a JSON string.
func FromFloat(f float64) Money { return decimal.NewFromFloat(f) }

// FromString parses Money from a decimal string.
func FromString(s string) (Money, error) { return decimal.NewFromString(s) }
