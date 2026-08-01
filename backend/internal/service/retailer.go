package service

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/httpx"
	"github.com/utilipay/backend/internal/models"
)

// RetailerService manages retailer profiles, KYC and settlements.
type RetailerService struct {
	db *gorm.DB
}

// NewRetailerService builds a RetailerService.
func NewRetailerService(db *gorm.DB) *RetailerService {
	return &RetailerService{db: db}
}

// RetailerProfile is the retailer view of their own account, joined with the
// user record so the UI needs a single call.
type RetailerProfile struct {
	ID           uuid.UUID `json:"id"`
	UserID       uuid.UUID `json:"userId"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Phone        string    `json:"phone"`
	MerchantCode string    `json:"merchantCode"`

	ShopName    string `json:"shopName"`
	FirmName    string `json:"firmName"`
	AddressLine string `json:"addressLine"`
	City        string `json:"city"`
	State       string `json:"state"`
	Pincode     string `json:"pincode"`
	UserType    string `json:"userType"`

	WalletBalance Money                `json:"walletBalance"`
	KYCStatus     models.KYCStatus     `json:"kycStatus"`
	Status        models.AccountStatus `json:"status"`
	JoinedDate    time.Time            `json:"joinedDate"`

	AEPSOnboardStatus models.OnboardStatus `json:"aepsOnboardStatus"`
	AEPSOnboardedAt   *time.Time           `json:"aepsOnboardedAt,omitempty"`

	PAN   string `json:"pan"`
	GSTIN string `json:"gstin"`
	// AadhaarLast4 is the only part of the Aadhaar number retained.
	AadhaarLast4 string `json:"aadhaarLast4"`

	BankAccountName   string `json:"bankAccountName"`
	BankAccountNumber string `json:"bankAccountNumber"`
	BankIFSC          string `json:"bankIfsc"`
	BankName          string `json:"bankName"`

	NomineeName     string `json:"nomineeName"`
	NomineeRelation string `json:"nomineeRelation"`
	NomineeContact  string `json:"nomineeContact"`
}

// Profile returns a retailer's full profile.
func (s *RetailerService) Profile(ctx context.Context, retailerID uuid.UUID) (*RetailerProfile, error) {
	var retailer models.Retailer
	err := s.db.WithContext(ctx).Preload("User").Where("id = ?", retailerID).First(&retailer).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, httpx.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("retailer: load profile: %w", err)
	}

	out := &RetailerProfile{
		ID:                retailer.ID,
		UserID:            retailer.UserID,
		MerchantCode:      retailer.MerchantCode,
		ShopName:          retailer.ShopName,
		FirmName:          retailer.FirmName,
		AddressLine:       retailer.AddressLine,
		City:              retailer.City,
		State:             retailer.State,
		Pincode:           retailer.Pincode,
		UserType:          retailer.UserType,
		WalletBalance:     retailer.WalletBalance,
		KYCStatus:         retailer.KYCStatus,
		Status:            retailer.Status,
		JoinedDate:        retailer.JoinedDate,
		AEPSOnboardStatus: retailer.AEPSOnboardStatus,
		AEPSOnboardedAt:   retailer.AEPSOnboardedAt,
		PAN:               retailer.PAN,
		GSTIN:             retailer.GSTIN,
		AadhaarLast4:      retailer.AadhaarLast4,
		BankAccountName:   retailer.BankAccountName,
		BankAccountNumber: retailer.BankAccountNumber,
		BankIFSC:          retailer.BankIFSC,
		BankName:          retailer.BankName,
		NomineeName:       retailer.NomineeName,
		NomineeRelation:   retailer.NomineeRelation,
		NomineeContact:    retailer.NomineeContact,
	}
	if retailer.User != nil {
		out.Name = retailer.User.Name
		out.Email = retailer.User.Email
		out.Phone = retailer.User.Phone
	}
	return out, nil
}

// UpdateProfileInput carries retailer-editable profile fields.
//
// Deliberately excluded: wallet balance, KYC status, account status, merchant
// code and user type. Those are set by the platform or by an admin, and letting a
// retailer submit them would be a privilege-escalation path.
type UpdateProfileInput struct {
	ShopName    string `json:"shopName"`
	FirmName    string `json:"firmName"`
	AddressLine string `json:"addressLine"`
	City        string `json:"city"`
	State       string `json:"state"`
	Pincode     string `json:"pincode"`

	BankAccountName   string `json:"bankAccountName"`
	BankAccountNumber string `json:"bankAccountNumber"`
	BankIFSC          string `json:"bankIfsc"`
	BankName          string `json:"bankName"`

	NomineeName     string `json:"nomineeName"`
	NomineeRelation string `json:"nomineeRelation"`
	NomineeContact  string `json:"nomineeContact"`
}

// UpdateProfile applies retailer-editable changes.
//
// Only non-empty fields are written, so a partial form submission cannot blank
// out data the user did not intend to clear.
func (s *RetailerService) UpdateProfile(ctx context.Context, retailerID uuid.UUID, in UpdateProfileInput) (*RetailerProfile, error) {
	updates := map[string]any{}
	for column, value := range map[string]string{
		"shop_name":           in.ShopName,
		"firm_name":           in.FirmName,
		"address_line":        in.AddressLine,
		"city":                in.City,
		"state":               in.State,
		"pincode":             in.Pincode,
		"bank_account_name":   in.BankAccountName,
		"bank_account_number": in.BankAccountNumber,
		"bank_ifsc":           strings.ToUpper(in.BankIFSC),
		"bank_name":           in.BankName,
		"nominee_name":        in.NomineeName,
		"nominee_relation":    in.NomineeRelation,
		"nominee_contact":     in.NomineeContact,
	} {
		if strings.TrimSpace(value) != "" {
			updates[column] = strings.TrimSpace(value)
		}
	}

	if len(updates) == 0 {
		return s.Profile(ctx, retailerID)
	}

	if err := s.db.WithContext(ctx).Model(&models.Retailer{}).
		Where("id = ?", retailerID).Updates(updates).Error; err != nil {
		return nil, fmt.Errorf("retailer: update profile: %w", err)
	}
	return s.Profile(ctx, retailerID)
}

// MarkAEPSOnboarding records that onboarding has been initiated.
func (s *RetailerService) MarkAEPSOnboarding(ctx context.Context, retailerID uuid.UUID, pending bool) error {
	status := models.OnboardCompleted
	updates := map[string]any{}

	if pending {
		status = models.OnboardPending
	} else {
		now := time.Now().UTC()
		updates["aeps_onboarded_at"] = now
	}
	updates["aeps_onboard_status"] = status

	if err := s.db.WithContext(ctx).Model(&models.Retailer{}).
		Where("id = ?", retailerID).Updates(updates).Error; err != nil {
		return fmt.Errorf("retailer: mark aeps onboarding: %w", err)
	}
	return nil
}

// RecordAEPSCallback records the provider's onboarding redirect.
//
// The callback is unauthenticated, so a claimed success is recorded as pending
// rather than completed. Only a provider response on a subsequent onboarding call
// can move a retailer to completed, which stops a forged callback from unlocking
// AEPS.
func (s *RetailerService) RecordAEPSCallback(ctx context.Context, merchantCode, status string) error {
	next := models.OnboardPending
	if strings.EqualFold(status, "failed") || strings.EqualFold(status, "rejected") {
		next = models.OnboardFailed
	}

	res := s.db.WithContext(ctx).Model(&models.Retailer{}).
		Where("merchant_code = ?", merchantCode).
		Update("aeps_onboard_status", next)
	if res.Error != nil {
		return fmt.Errorf("retailer: record aeps callback: %w", res.Error)
	}
	if res.RowsAffected == 0 {
		return fmt.Errorf("%w: merchant code %s", httpx.ErrNotFound, merchantCode)
	}
	return nil
}

// SetAEPSOnboardComplete marks AEPS onboarding as verified. Admin action.
func (s *RetailerService) SetAEPSOnboardComplete(ctx context.Context, retailerID uuid.UUID) error {
	now := time.Now().UTC()
	return s.db.WithContext(ctx).Model(&models.Retailer{}).
		Where("id = ?", retailerID).
		Updates(map[string]any{
			"aeps_onboard_status": models.OnboardCompleted,
			"aeps_onboarded_at":   now,
		}).Error
}

// Settlements lists a retailer's settlement records, newest first.
func (s *RetailerService) Settlements(ctx context.Context, retailerID uuid.UUID) ([]models.Settlement, error) {
	var out []models.Settlement
	err := s.db.WithContext(ctx).
		Where("retailer_id = ?", retailerID).
		Order("settled_on DESC").
		Limit(200).
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("retailer: list settlements: %w", err)
	}
	return out, nil
}

// RetailerFilter narrows an admin retailer search.
type RetailerFilter struct {
	Search    string
	Status    string
	KYCStatus string
	City      string
	Page      int
	PageSize  int
}

// RetailerPage is a page of retailers.
type RetailerPage struct {
	Items []models.Retailer `json:"items"`
	Total int64             `json:"total"`
	Page  int               `json:"page"`
	Size  int               `json:"pageSize"`
}

// List returns a page of retailers for the admin user manager.
func (s *RetailerService) List(ctx context.Context, f RetailerFilter) (*RetailerPage, error) {
	q := s.db.WithContext(ctx).Model(&models.Retailer{}).Preload("User")

	if f.Status != "" && f.Status != "all" {
		q = q.Where("status = ?", f.Status)
	}
	if f.KYCStatus != "" && f.KYCStatus != "all" {
		q = q.Where("kyc_status = ?", f.KYCStatus)
	}
	if f.City != "" && f.City != "all" {
		q = q.Where("city = ?", f.City)
	}
	if f.Search != "" {
		like := "%" + strings.TrimSpace(f.Search) + "%"
		// The user table is joined so a search can match name or email, which is
		// what an admin actually types.
		q = q.Joins("LEFT JOIN users ON users.id = retailers.user_id").
			Where(`retailers.shop_name ILIKE ? OR retailers.merchant_code ILIKE ?
			       OR users.name ILIKE ? OR users.email ILIKE ? OR users.phone ILIKE ?`,
				like, like, like, like, like)
	}

	var total int64
	if err := q.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("retailer: count: %w", err)
	}

	page, size := normalisePaging(f.Page, f.PageSize)

	var items []models.Retailer
	err := q.Order("retailers.created_at DESC").
		Limit(size).Offset((page - 1) * size).
		Find(&items).Error
	if err != nil {
		return nil, fmt.Errorf("retailer: list: %w", err)
	}

	return &RetailerPage{Items: items, Total: total, Page: page, Size: size}, nil
}

// SetStatus changes a retailer's account status. Admin action.
//
// Suspending a retailer takes effect on their next request, because the auth
// middleware re-reads account status rather than trusting the token.
func (s *RetailerService) SetStatus(ctx context.Context, retailerID uuid.UUID, status models.AccountStatus) error {
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var retailer models.Retailer
		if err := tx.Where("id = ?", retailerID).First(&retailer).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return httpx.ErrNotFound
			}
			return err
		}

		if err := tx.Model(&models.Retailer{}).Where("id = ?", retailerID).
			Update("status", status).Error; err != nil {
			return fmt.Errorf("retailer: set status: %w", err)
		}
		// The login account is disabled alongside the profile, otherwise a
		// suspended retailer could still sign in.
		return tx.Model(&models.User{}).Where("id = ?", retailer.UserID).
			Update("status", status).Error
	})
}

// SetKYCStatus changes a retailer's KYC status. Admin action.
func (s *RetailerService) SetKYCStatus(ctx context.Context, retailerID uuid.UUID, status models.KYCStatus, reason string) error {
	now := time.Now().UTC()

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&models.Retailer{}).Where("id = ?", retailerID).
			Update("kyc_status", status).Error; err != nil {
			return fmt.Errorf("retailer: set kyc status: %w", err)
		}

		updates := map[string]any{"status": status, "reviewed_at": now}
		if status == models.KYCRejected {
			updates["reject_reason"] = reason
		}
		// The application row may not exist if KYC was never started, so a
		// missing row is not an error.
		return tx.Model(&models.KYCApplication{}).
			Where("retailer_id = ?", retailerID).
			Updates(updates).Error
	})
}

// LoginHistory returns a retailer's recent login attempts.
func (s *RetailerService) LoginHistory(ctx context.Context, userID uuid.UUID, limit int) ([]models.LoginHistory, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	var out []models.LoginHistory
	err := s.db.WithContext(ctx).
		Where("user_id = ?", userID).
		Order("created_at DESC").
		Limit(limit).
		Find(&out).Error
	if err != nil {
		return nil, fmt.Errorf("retailer: login history: %w", err)
	}
	return out, nil
}
