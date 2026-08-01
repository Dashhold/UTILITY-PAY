package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// Product is an item sold to retailers (POS machines, biometric devices, etc.).
// Mirrors Product in types.ts.
type Product struct {
	Base
	SoftDelete

	Name        string `gorm:"size:200;not null;index" json:"name"`
	SKU         string `gorm:"size:60;not null;uniqueIndex" json:"sku"`
	Category    string `gorm:"size:80;not null;index" json:"category"`
	Description string `gorm:"type:text" json:"description"`

	Price Money `gorm:"type:numeric(18,2);not null" json:"price"`
	// Stock is decremented when an order is placed and restored on cancellation.
	Stock int `gorm:"not null;default:0" json:"stock"`

	// Images holds ordered image URLs; the first is treated as primary.
	Images pq.StringArray `gorm:"type:text[]" json:"images"`

	Status ToggleStatus `gorm:"size:20;not null;default:enabled;index" json:"status"`

	CreatedDate time.Time `gorm:"not null" json:"createdDate"`
}

func (Product) TableName() string { return "products" }

// InStock reports whether the requested quantity can be fulfilled.
func (p *Product) InStock(qty int) bool {
	return p.Status == StatusEnabled && qty > 0 && p.Stock >= qty
}

// ProductOrder is a retailer's purchase of one or more products.
// Mirrors ProductOrder in types.ts.
type ProductOrder struct {
	Base

	// OrderID is the human-facing reference.
	OrderID string `gorm:"size:40;not null;uniqueIndex" json:"orderId"`

	RetailerID uuid.UUID `gorm:"type:uuid;not null;index" json:"retailerId"`
	Retailer   string    `gorm:"size:200" json:"retailer"`

	// Product and Quantity summarise the order for list views, matching the
	// frontend's flat table columns; Items carries the authoritative breakdown.
	Product  string `gorm:"size:200" json:"product"`
	Quantity int    `gorm:"not null;default:0" json:"quantity"`

	Amount Money `gorm:"type:numeric(18,2);not null" json:"amount"`

	Status OrderStatus `gorm:"size:20;not null;default:pending;index" json:"status"`

	ShippingAddress string `gorm:"size:500" json:"shippingAddress"`
	TrackingNumber  string `gorm:"size:80" json:"trackingNumber,omitempty"`
	Courier         string `gorm:"size:80" json:"courier,omitempty"`

	PlacedAt    time.Time  `gorm:"not null;index" json:"date"`
	ShippedAt   *time.Time `json:"shippedAt,omitempty"`
	DeliveredAt *time.Time `json:"deliveredAt,omitempty"`
	CancelledAt *time.Time `json:"cancelledAt,omitempty"`

	Items []ProductOrderItem `gorm:"foreignKey:OrderID_FK" json:"items"`
}

func (ProductOrder) TableName() string { return "product_orders" }

// ProductOrderItem is a single line on an order. Mirrors ProductOrderItem.
//
// ProductName, SKU and Price are denormalised onto the line so a historical
// order still renders correctly after the catalogue changes.
type ProductOrderItem struct {
	Base

	OrderID_FK uuid.UUID  `gorm:"type:uuid;not null;index;column:order_id" json:"-"`
	ProductID  *uuid.UUID `gorm:"type:uuid;index" json:"productId,omitempty"`

	ProductName string `gorm:"size:200;not null" json:"productName"`
	SKU         string `gorm:"size:60;not null" json:"sku"`
	Quantity    int    `gorm:"not null" json:"quantity"`
	Price       Money  `gorm:"type:numeric(18,2);not null" json:"price"`
}

func (ProductOrderItem) TableName() string { return "product_order_items" }

// LineTotal returns Price multiplied by Quantity.
func (i *ProductOrderItem) LineTotal() Money {
	return i.Price.Mul(FromFloat(float64(i.Quantity)))
}

// KYCApplication tracks a retailer's KYC submission through the wizard steps.
type KYCApplication struct {
	Base

	RetailerID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"retailerId"`

	Status KYCStatus `gorm:"size:20;not null;default:not_submitted;index" json:"status"`

	// CurrentStep is the 1-based wizard position the retailer has reached.
	CurrentStep int `gorm:"not null;default:1" json:"currentStep"`
	// TotalSteps mirrors the frontend's 8-step wizard.
	TotalSteps int `gorm:"not null;default:8" json:"totalSteps"`

	SubmittedAt  *time.Time `json:"submittedAt,omitempty"`
	ReviewedAt   *time.Time `json:"reviewedAt,omitempty"`
	ReviewedBy   *uuid.UUID `gorm:"type:uuid" json:"reviewedBy,omitempty"`
	RejectReason string     `gorm:"size:500" json:"rejectReason,omitempty"`

	Documents []KYCDocument `gorm:"foreignKey:ApplicationID" json:"documents,omitempty"`
}

func (KYCApplication) TableName() string { return "kyc_applications" }

// KYCDocument is one uploaded artefact within a KYC application.
type KYCDocument struct {
	Base

	ApplicationID uuid.UUID `gorm:"type:uuid;not null;index" json:"applicationId"`
	RetailerID    uuid.UUID `gorm:"type:uuid;not null;index" json:"retailerId"`

	// DocType is a stable key such as "pan", "aadhaar_front", "gst",
	// "shop_photo", "cancelled_cheque".
	DocType string `gorm:"size:60;not null" json:"docType"`
	Name    string `gorm:"size:200" json:"name"`

	FileURL  string `gorm:"size:500" json:"fileUrl"`
	FileSize int64  `gorm:"not null;default:0" json:"fileSize"`
	MimeType string `gorm:"size:120" json:"mimeType"`

	// DocNumber is the identifier printed on the document. It is stored so an
	// admin can verify it; only the last four digits should be rendered for
	// Aadhaar.
	DocNumber string `gorm:"size:60" json:"docNumber,omitempty"`

	Status     KYCStatus  `gorm:"size:20;not null;default:pending;index" json:"status"`
	Remarks    string     `gorm:"size:500" json:"remarks,omitempty"`
	VerifiedAt *time.Time `json:"verifiedAt,omitempty"`
	VerifiedBy *uuid.UUID `gorm:"type:uuid" json:"verifiedBy,omitempty"`

	UploadedAt time.Time `gorm:"not null" json:"uploadedAt"`
}

func (KYCDocument) TableName() string { return "kyc_documents" }

// RetailerService records which services a retailer may use and their
// per-retailer commission override.
type RetailerService struct {
	Base

	RetailerID uuid.UUID `gorm:"type:uuid;not null;index:idx_retailer_service,unique,priority:1" json:"retailerId"`
	ServiceID  uuid.UUID `gorm:"type:uuid;not null;index:idx_retailer_service,unique,priority:2" json:"serviceId"`

	ServiceName string `gorm:"size:150" json:"serviceName"`
	Enabled     bool   `gorm:"not null;default:true" json:"enabled"`

	// CommissionOverride, when set, takes precedence over the plan slab.
	CommissionOverride *Money `gorm:"type:numeric(18,4)" json:"commissionOverride,omitempty"`
}

func (RetailerService) TableName() string { return "retailer_services" }

// APIKey is a retailer-issued credential for programmatic access.
//
// Only a hash is stored, so the plaintext key is shown exactly once at
// creation and cannot be recovered from the database.
type APIKey struct {
	Base

	UserID uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`

	Name string `gorm:"size:120;not null" json:"name"`
	// Prefix is the non-secret leading segment, used to identify a key in the UI
	// without revealing it.
	Prefix  string `gorm:"size:16;not null;index" json:"prefix"`
	KeyHash string `gorm:"size:64;not null;uniqueIndex" json:"-"`

	Scopes pq.StringArray `gorm:"type:text[]" json:"scopes"`

	LastUsedAt *time.Time `json:"lastUsedAt,omitempty"`
	ExpiresAt  *time.Time `json:"expiresAt,omitempty"`
	RevokedAt  *time.Time `json:"revokedAt,omitempty"`
}

func (APIKey) TableName() string { return "api_keys" }

// IsUsable reports whether the key may authenticate a request.
func (k *APIKey) IsUsable() bool {
	if k.RevokedAt != nil {
		return false
	}
	if k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now()) {
		return false
	}
	return true
}
