package models

import (
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
)

// ServiceCategory is an admin-managed grouping of services, surfaced on the
// retailer services hub. Mirrors ServiceCategoryItem in types.ts.
type ServiceCategory struct {
	Base
	SoftDelete

	Name        string       `gorm:"size:120;not null;uniqueIndex" json:"name"`
	Icon        string       `gorm:"size:60" json:"icon"`
	Description string       `gorm:"size:500" json:"description"`
	Status      ToggleStatus `gorm:"size:20;not null;default:enabled" json:"status"`
	SortOrder   int          `gorm:"not null;default:0" json:"sortOrder"`

	Services []Service `gorm:"foreignKey:CategoryID" json:"-"`
}

func (ServiceCategory) TableName() string { return "service_categories" }

// City is the serviceable-location master. Mirrors City in types.ts.
type City struct {
	Base
	SoftDelete

	Name        string       `gorm:"size:120;not null;index:idx_city_name_state,unique,priority:1" json:"name"`
	State       string       `gorm:"size:120;not null;index:idx_city_name_state,unique,priority:2" json:"state"`
	PincodeFrom string       `gorm:"size:10" json:"pincodeFrom"`
	PincodeTo   string       `gorm:"size:10" json:"pincodeTo"`
	Status      EntityStatus `gorm:"size:20;not null;default:active" json:"status"`
}

func (City) TableName() string { return "cities" }

// UserType is a retailer tier that drives permissions and commission plans.
// Mirrors UserTypeItem in types.ts.
type UserType struct {
	Base
	SoftDelete

	Name        string `gorm:"size:120;not null;uniqueIndex" json:"name"`
	Description string `gorm:"size:500" json:"description"`

	// Permissions is a Postgres text[]; the frontend models it as string[].
	Permissions pq.StringArray `gorm:"type:text[]" json:"permissions"`

	Status EntityStatus `gorm:"size:20;not null;default:active" json:"status"`
}

func (UserType) TableName() string { return "user_types" }

// Service is a concrete offering wired to an upstream API provider.
// Mirrors ServiceItem in types.ts.
type Service struct {
	Base
	SoftDelete

	Name       string    `gorm:"size:150;not null" json:"name"`
	CategoryID uuid.UUID `gorm:"type:uuid;not null;index" json:"categoryId"`
	Category   string    `gorm:"size:120" json:"category"`

	// APIProvider names the upstream integration handling this service.
	APIProvider string `gorm:"size:80" json:"apiProvider"`
	// ProviderCode is the upstream's own identifier for the service.
	ProviderCode string `gorm:"size:80;index" json:"providerCode,omitempty"`

	MinAmount Money `gorm:"type:numeric(18,2);not null;default:0" json:"minAmount"`
	MaxAmount Money `gorm:"type:numeric(18,2);not null;default:0" json:"maxAmount"`

	Status EntityStatus `gorm:"size:20;not null;default:active;index" json:"status"`
}

func (Service) TableName() string { return "services" }

// CommissionPlan groups commission slots and binds them to a user type.
// Mirrors CommissionPlan in types.ts.
type CommissionPlan struct {
	Base
	SoftDelete

	Name       string     `gorm:"size:150;not null;uniqueIndex" json:"name"`
	UserTypeID *uuid.UUID `gorm:"type:uuid;index" json:"userTypeId,omitempty"`
	UserType   string     `gorm:"size:120" json:"userType"`

	Status EntityStatus `gorm:"size:20;not null;default:active" json:"status"`

	Slots []CommissionSlot `gorm:"foreignKey:PlanID" json:"slots,omitempty"`
}

func (CommissionPlan) TableName() string { return "commission_plans" }

// CommissionSlot is a single commission rule. Mirrors CommissionSlot in
// types.ts.
//
// Slabs are amount-bounded so a service can pay different rates by ticket size;
// MinAmount/MaxAmount default to an open range when unset.
type CommissionSlot struct {
	Base
	SoftDelete

	PlanID *uuid.UUID `gorm:"type:uuid;index" json:"planId,omitempty"`

	ServiceID *uuid.UUID `gorm:"type:uuid;index" json:"serviceId,omitempty"`
	Service   string     `gorm:"size:150;not null" json:"service"`

	SlabType SlabType `gorm:"size:20;not null" json:"slabType"`
	// Value is a flat rupee amount when SlabType is flat, or a percentage of the
	// transaction amount when percentage.
	Value Money `gorm:"type:numeric(18,4);not null" json:"value"`

	// TDS and GST are percentages applied to the earned commission.
	TDS Money `gorm:"type:numeric(9,4);not null;default:0" json:"tds"`
	GST Money `gorm:"type:numeric(9,4);not null;default:0" json:"gst"`

	MinAmount Money `gorm:"type:numeric(18,2);not null;default:0" json:"minAmount"`
	MaxAmount Money `gorm:"type:numeric(18,2);not null;default:0" json:"maxAmount"`

	UserTypeID *uuid.UUID `gorm:"type:uuid;index" json:"userTypeId,omitempty"`
	UserType   string     `gorm:"size:120" json:"userType"`

	Status EntityStatus `gorm:"size:20;not null;default:active;index" json:"status"`
}

func (CommissionSlot) TableName() string { return "commission_slots" }

// Announcement is a broadcast message. Mirrors Announcement in types.ts.
type Announcement struct {
	Base
	SoftDelete

	Title   string `gorm:"size:200;not null" json:"title"`
	Message string `gorm:"type:text;not null" json:"message"`

	Audience AnnouncementAudience `gorm:"size:20;not null;default:All;index" json:"audience"`
	Status   AnnouncementStatus   `gorm:"size:20;not null;default:draft;index" json:"status"`

	PublishedDate *time.Time `json:"publishedDate,omitempty"`
	ExpiryDate    *time.Time `gorm:"index" json:"expiryDate,omitempty"`

	CreatedByID *uuid.UUID `gorm:"type:uuid" json:"createdById,omitempty"`
}

func (Announcement) TableName() string { return "announcements" }

// IsVisibleTo reports whether the announcement should be shown to a role now.
func (a *Announcement) IsVisibleTo(role Role) bool {
	if a.Status != AnnouncementPublished {
		return false
	}
	if a.ExpiryDate != nil && a.ExpiryDate.Before(time.Now()) {
		return false
	}
	switch a.Audience {
	case AudienceAll:
		return true
	case AudienceAdmin:
		return role == RoleAdmin
	case AudienceRetailer:
		return role == RoleRetailer
	default:
		return false
	}
}

// TicketDepartment routes support tickets. Mirrors TicketDepartment in types.ts.
type TicketDepartment struct {
	Base
	SoftDelete

	Name        string       `gorm:"size:150;not null;uniqueIndex" json:"name"`
	Description string       `gorm:"size:500" json:"description"`
	Status      EntityStatus `gorm:"size:20;not null;default:active" json:"status"`
	AgentsCount int          `gorm:"not null;default:0" json:"agentsCount"`
}

func (TicketDepartment) TableName() string { return "ticket_departments" }

// CompanyBank is a company-owned account retailers deposit into when topping up.
type CompanyBank struct {
	Base
	SoftDelete

	BankName      string `gorm:"size:150;not null" json:"bankName"`
	AccountName   string `gorm:"size:150" json:"accountName"`
	AccountNumber string `gorm:"size:40;not null" json:"accountNumber"`
	IFSC          string `gorm:"size:20;not null" json:"ifsc"`
	Branch        string `gorm:"size:150" json:"branch"`
	AccountType   string `gorm:"size:40" json:"accountType"`
	UPIID         string `gorm:"size:120" json:"upiId,omitempty"`

	// IsDefault marks the account shown first to retailers. Exactly one row
	// should carry this flag; the service layer enforces it.
	IsDefault bool         `gorm:"not null;default:false" json:"isDefault"`
	Status    EntityStatus `gorm:"size:20;not null;default:active" json:"status"`
}

func (CompanyBank) TableName() string { return "company_banks" }

// PayoutBank is an account used to disburse funds. Mirrors PayoutBank in
// types.ts.
type PayoutBank struct {
	Base
	SoftDelete

	BankName      string `gorm:"size:150;not null" json:"bankName"`
	AccountNumber string `gorm:"size:40;not null" json:"accountNumber"`
	IFSC          string `gorm:"size:20;not null" json:"ifsc"`
	Branch        string `gorm:"size:150" json:"branch"`

	// LinkedRetailers is a cached count maintained by the service layer.
	LinkedRetailers int          `gorm:"not null;default:0" json:"linkedRetailers"`
	Status          EntityStatus `gorm:"size:20;not null;default:active" json:"status"`
}

func (PayoutBank) TableName() string { return "payout_banks" }

// Biller is the Bharat Connect biller master, refreshed from the provider.
//
// The retailer bill-payment flow needs biller metadata (which customer
// parameters to collect, whether partial payment is allowed) before it can
// render a fetch form, so this is cached locally rather than fetched per view.
type Biller struct {
	Base

	// BillerID is the NPCI biller identifier, e.g. "MAHA00000MAH01".
	BillerID string `gorm:"size:60;not null;uniqueIndex" json:"billerId"`
	Name     string `gorm:"size:200;not null;index" json:"name"`

	// Category is the Bharat Connect category, e.g. "Electricity".
	Category string `gorm:"size:80;not null;index" json:"category"`
	Coverage string `gorm:"size:80" json:"coverage,omitempty"`

	// CustomerParams describes the inputs to collect before a bill fetch. Stored
	// as JSON because the shape is provider-defined and varies per biller.
	CustomerParams JSONMap `gorm:"type:jsonb" json:"customerParams,omitempty"`

	SupportsBillFetch  bool `gorm:"not null;default:true" json:"supportsBillFetch"`
	SupportsValidation bool `gorm:"not null;default:false" json:"supportsValidation"`
	PartialPayAllowed  bool `gorm:"not null;default:false" json:"partialPayAllowed"`

	MinAmount Money `gorm:"type:numeric(18,2);not null;default:0" json:"minAmount"`
	MaxAmount Money `gorm:"type:numeric(18,2);not null;default:0" json:"maxAmount"`

	Status EntityStatus `gorm:"size:20;not null;default:active;index" json:"status"`

	SyncedAt *time.Time `json:"syncedAt,omitempty"`
}

func (Biller) TableName() string { return "billers" }

// BillFetch caches a fetched bill between the fetch and the payment.
//
// Paying against a stored fetch rather than client-supplied figures means the
// amount cannot be tampered with between the two calls.
type BillFetch struct {
	Base

	RetailerID uuid.UUID `gorm:"type:uuid;not null;index" json:"retailerId"`
	BillerID   string    `gorm:"size:60;not null;index" json:"billerId"`
	BillerName string    `gorm:"size:200" json:"billerName"`

	// RequestRef is our reference for the fetch, quoted back on payment.
	RequestRef string `gorm:"size:80;not null;uniqueIndex" json:"requestRef"`

	CustomerParams JSONMap `gorm:"type:jsonb" json:"customerParams"`

	CustomerName string     `gorm:"size:200" json:"customerName"`
	BillNumber   string     `gorm:"size:80" json:"billNumber"`
	BillDate     *time.Time `json:"billDate,omitempty"`
	DueDate      *time.Time `json:"dueDate,omitempty"`
	BillAmount   Money      `gorm:"type:numeric(18,2);not null;default:0" json:"billAmount"`
	BillPeriod   string     `gorm:"size:60" json:"billPeriod,omitempty"`

	// ProviderPayload is the raw decrypted provider response, retained so the
	// payment call can echo back any opaque fields the provider requires.
	ProviderPayload JSONMap `gorm:"type:jsonb" json:"-"`

	// ExpiresAt bounds how long a fetched bill may be paid against.
	ExpiresAt time.Time `gorm:"not null;index" json:"expiresAt"`
	// ConsumedByTransactionID is set once the bill has been paid, which makes a
	// double payment against one fetch detectable.
	ConsumedByTransactionID *uuid.UUID `gorm:"type:uuid" json:"consumedByTransactionId,omitempty"`
}

func (BillFetch) TableName() string { return "bill_fetches" }

// IsUsable reports whether the fetch can still be paid against.
func (b *BillFetch) IsUsable() bool {
	return b.ConsumedByTransactionID == nil && b.ExpiresAt.After(time.Now())
}
