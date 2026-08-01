package models

import (
	"time"

	"github.com/google/uuid"
)

// User is an authenticable account. Both admins and retailers are Users; a
// retailer additionally has a Retailer profile row.
type User struct {
	Base
	SoftDelete

	Name  string `gorm:"size:150;not null" json:"name"`
	Email string `gorm:"size:255;not null;uniqueIndex" json:"email"`
	Phone string `gorm:"size:20;index" json:"phone"`

	// PasswordHash is a bcrypt digest. It is never serialised: the json tag is
	// "-" so an accidental struct return cannot leak credentials.
	PasswordHash string `gorm:"size:255;not null" json:"-"`

	Role   Role          `gorm:"size:20;not null;index" json:"role"`
	Status AccountStatus `gorm:"size:20;not null;default:active;index" json:"status"`

	LastLoginAt *time.Time `json:"lastLoginAt,omitempty"`

	// FailedLoginAttempts and LockedUntil implement lockout after repeated
	// failures, so a stolen email cannot be brute-forced indefinitely.
	FailedLoginAttempts int        `gorm:"not null;default:0" json:"-"`
	LockedUntil         *time.Time `json:"-"`

	TwoFactorEnabled bool   `gorm:"not null;default:false" json:"twoFactorEnabled"`
	TwoFactorSecret  string `gorm:"size:255" json:"-"`

	Retailer *Retailer `gorm:"foreignKey:UserID" json:"retailer,omitempty"`
}

// TableName pins the table name so a future rename of the Go type cannot
// silently orphan the table.
func (User) TableName() string { return "users" }

// IsLocked reports whether the account is currently locked out.
func (u *User) IsLocked() bool {
	return u.LockedUntil != nil && u.LockedUntil.After(time.Now())
}

// CanLogin reports whether the account is permitted to authenticate.
func (u *User) CanLogin() bool {
	return u.Status == AccountActive && !u.IsLocked()
}

// Retailer is the business profile attached to a retailer User.
type Retailer struct {
	Base
	SoftDelete

	UserID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"userId"`
	User   *User     `gorm:"foreignKey:UserID" json:"user,omitempty"`

	// MerchantCode is the retailer's identifier with the AEPS provider. It is
	// supplied as `merchantcode` on the onboarding call (AEPS/api_doc.md).
	MerchantCode string `gorm:"size:50;uniqueIndex" json:"merchantCode"`

	ShopName string `gorm:"size:200;not null" json:"shopName"`
	FirmName string `gorm:"size:200" json:"firmName"`

	AddressLine string     `gorm:"size:300" json:"addressLine"`
	CityID      *uuid.UUID `gorm:"type:uuid;index" json:"cityId,omitempty"`
	City        string     `gorm:"size:100;index" json:"city"`
	State       string     `gorm:"size:100" json:"state"`
	Pincode     string     `gorm:"size:10" json:"pincode"`

	UserTypeID *uuid.UUID `gorm:"type:uuid;index" json:"userTypeId,omitempty"`
	UserType   string     `gorm:"size:80" json:"userType"`

	// WalletBalance is a cached projection of the wallet ledger, kept in step
	// inside the same transaction that writes each ledger row. The ledger is
	// authoritative; this column exists so listing pages avoid an aggregate.
	WalletBalance Money `gorm:"type:numeric(18,2);not null;default:0" json:"walletBalance"`

	KYCStatus KYCStatus     `gorm:"size:20;not null;default:not_submitted;index" json:"kycStatus"`
	Status    AccountStatus `gorm:"size:20;not null;default:active;index" json:"status"`

	JoinedDate time.Time `gorm:"not null" json:"joinedDate"`

	// AEPS onboarding state. The provider owns the KYC journey and calls back.
	AEPSOnboardStatus    OnboardStatus `gorm:"size:20;not null;default:not_started" json:"aepsOnboardStatus"`
	AEPSOnboardRequestID string        `gorm:"size:100;index" json:"-"`
	AEPSOnboardedAt      *time.Time    `json:"aepsOnboardedAt,omitempty"`

	PAN          string `gorm:"size:20" json:"pan"`
	AadhaarLast4 string `gorm:"size:4" json:"aadhaarLast4"`
	GSTIN        string `gorm:"size:20" json:"gstin"`

	BankAccountName   string `gorm:"size:150" json:"bankAccountName"`
	BankAccountNumber string `gorm:"size:40" json:"bankAccountNumber"`
	BankIFSC          string `gorm:"size:20" json:"bankIfsc"`
	BankName          string `gorm:"size:150" json:"bankName"`

	NomineeName     string `gorm:"size:150" json:"nomineeName"`
	NomineeRelation string `gorm:"size:60" json:"nomineeRelation"`
	NomineeContact  string `gorm:"size:20" json:"nomineeContact"`
}

func (Retailer) TableName() string { return "retailers" }

// LoginHistory records every authentication attempt outcome. Retained for the
// retailer login-history screen and for security review.
type LoginHistory struct {
	Base

	UserID uuid.UUID `gorm:"type:uuid;not null;index" json:"userId"`

	IPAddress string `gorm:"size:64" json:"ipAddress"`
	UserAgent string `gorm:"size:400" json:"userAgent"`
	Device    string `gorm:"size:120" json:"device"`
	Location  string `gorm:"size:160" json:"location"`

	Success bool   `gorm:"not null;index" json:"success"`
	Reason  string `gorm:"size:200" json:"reason,omitempty"`
}

func (LoginHistory) TableName() string { return "login_histories" }

// RefreshToken persists issued refresh tokens so they can be revoked.
//
// Only a SHA-256 hash of the token is stored: a database disclosure must not
// hand an attacker usable session credentials.
type RefreshToken struct {
	Base

	UserID    uuid.UUID  `gorm:"type:uuid;not null;index" json:"userId"`
	TokenHash string     `gorm:"size:64;not null;uniqueIndex" json:"-"`
	ExpiresAt time.Time  `gorm:"not null;index" json:"expiresAt"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
	IPAddress string     `gorm:"size:64" json:"ipAddress"`
	UserAgent string     `gorm:"size:400" json:"userAgent"`
}

func (RefreshToken) TableName() string { return "refresh_tokens" }

// IsUsable reports whether the token is neither expired nor revoked.
func (t *RefreshToken) IsUsable() bool {
	return t.RevokedAt == nil && t.ExpiresAt.After(time.Now())
}
