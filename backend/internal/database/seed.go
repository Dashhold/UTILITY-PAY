package database

import (
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/shopspring/decimal"
	"gorm.io/gorm"

	"github.com/utilipay/backend/internal/auth"
	"github.com/utilipay/backend/internal/models"
)

// SeedAccount is a bootstrap login created on first migration.
type SeedAccount struct {
	Name     string
	Email    string
	Password string
	Phone    string
	Role     models.Role
	ShopName string

	// MerchantCode pins the AEPS merchant code rather than deriving one from the
	// generated user id. The provider keys every AEPS call on this value, so an
	// account used against their host has to carry the code that was actually
	// onboarded there.
	MerchantCode string
	// AEPSReady provisions the account past every gate the AEPS endpoints check:
	// verified KYC and completed provider onboarding. It exists so the provider
	// integration can be exercised without first walking a fresh retailer
	// through admin approval, which is unrelated to what is being tested.
	AEPSReady bool
	// WalletOpeningBalance funds the wallet. Cash withdrawal is debited before
	// dispatch, so without an opening balance it fails on the hold rather than
	// reaching the provider. Empty means no opening credit.
	WalletOpeningBalance string
}

// SeedAccounts returns the bootstrap credentials.
//
// Read from the environment so a deployment can set its own without a rebuild,
// which also means the production credentials never appear in version control.
// The accounts are created only when absent, so a password changed through the
// app is never silently reset by a redeploy.
func SeedAccounts() []SeedAccount {
	return []SeedAccount{
		{
			Name:     seedEnv("SEED_ADMIN_NAME", "UtiliPay Hub Admin"),
			Email:    seedEnv("SEED_ADMIN_EMAIL", "adminutilihub@gmail.com"),
			Password: seedEnv("SEED_ADMIN_PASSWORD", "utilihub@admin"),
			Phone:    seedEnv("SEED_ADMIN_PHONE", "9876543210"),
			Role:     models.RoleAdmin,
		},
		{
			Name:     seedEnv("SEED_RETAILER_NAME", "Demo Retailer"),
			Email:    seedEnv("SEED_RETAILER_EMAIL", "retailer.demo@gmail.com"),
			Password: seedEnv("SEED_RETAILER_PASSWORD", "demo@retailer"),
			Phone:    seedEnv("SEED_RETAILER_PHONE", "9876500001"),
			Role:     models.RoleRetailer,
			ShopName: seedEnv("SEED_RETAILER_SHOP", "Demo Digital Services"),
		},
		{
			// A second retailer that is already through KYC and provider
			// onboarding. The demo retailer above deliberately starts at
			// not_submitted so the onboarding journey itself stays testable; this
			// one exists to test what comes after it.
			Name:                 seedEnv("SEED_AEPS_RETAILER_NAME", "AEPS Test Retailer"),
			Email:                seedEnv("SEED_AEPS_RETAILER_EMAIL", "aeps.test@gmail.com"),
			Password:             seedEnv("SEED_AEPS_RETAILER_PASSWORD", "aeps@retailer"),
			Phone:                seedEnv("SEED_AEPS_RETAILER_PHONE", "9999999999"),
			Role:                 models.RoleRetailer,
			ShopName:             seedEnv("SEED_AEPS_RETAILER_SHOP", "AEPS Test Services"),
			MerchantCode:         seedEnv("SEED_AEPS_RETAILER_MERCHANT_CODE", "TEST001"),
			AEPSReady:            true,
			WalletOpeningBalance: seedEnv("SEED_AEPS_RETAILER_BALANCE", "25000.00"),
		},
	}
}

// seedEnv reads a seed override, falling back to the default.
func seedEnv(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

// Seed populates master data and the demo accounts.
//
// Every step is idempotent so it is safe to run on every boot.
func Seed(db *gorm.DB, log *slog.Logger) error {
	steps := []struct {
		name string
		fn   func(*gorm.DB, *slog.Logger) error
	}{
		{"user types", seedUserTypes},
		{"service categories", seedServiceCategories},
		{"cities", seedCities},
		{"services", seedServices},
		{"commission slots", seedCommissionSlots},
		{"ticket departments", seedTicketDepartments},
		{"company banks", seedCompanyBanks},
		{"billers", seedBillers},
		{"accounts", seedAccounts},
		{"announcements", seedAnnouncements},
	}

	for _, step := range steps {
		if err := step.fn(db, log); err != nil {
			return fmt.Errorf("seed %s: %w", step.name, err)
		}
	}

	log.Info("seed data ensured")
	return nil
}

// seedAccounts creates the bootstrap admin and retailer if they do not exist.
func seedAccounts(db *gorm.DB, log *slog.Logger) error {
	for _, acct := range SeedAccounts() {
		email := auth.NormalizeEmail(acct.Email)

		var existing models.User
		err := db.Where("lower(email) = ?", email).First(&existing).Error
		if err == nil {
			log.Debug("seed account already present", slog.String("email", email))
			continue
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		// Seeded credentials are fixed by operator decision, so the interactive
		// strength policy is bypassed deliberately here. Passwords changed through
		// the API still go through auth.HashPassword and are validated.
		hash, err := auth.HashProvisionedPassword(acct.Password)
		if err != nil {
			return fmt.Errorf("hash password for %s: %w", email, err)
		}

		user := models.User{
			Name:         acct.Name,
			Email:        email,
			Phone:        acct.Phone,
			PasswordHash: hash,
			Role:         acct.Role,
			Status:       models.AccountActive,
		}

		err = db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Create(&user).Error; err != nil {
				return err
			}
			if acct.Role != models.RoleRetailer {
				return nil
			}

			// A retailer needs a profile row; without one, retailer-scoped
			// endpoints have nothing to scope to.
			var userType models.UserType
			if err := tx.Where("name = ?", "Retailer").First(&userType).Error; err != nil {
				return fmt.Errorf("locate default user type: %w", err)
			}

			var city models.City
			_ = tx.Where("name = ?", "Mohali").First(&city).Error

			merchantCode := acct.MerchantCode
			if merchantCode == "" {
				merchantCode = "SH" + user.ID.String()[:5]
			}

			retailer := models.Retailer{
				UserID:        user.ID,
				MerchantCode:  merchantCode,
				ShopName:      acct.ShopName,
				FirmName:      acct.ShopName,
				AddressLine:   "420, 4th Floor, Metro Trade Center, VIP Road",
				City:          "Mohali",
				State:         "Punjab",
				Pincode:       "140603",
				UserType:      userType.Name,
				UserTypeID:    &userType.ID,
				WalletBalance: decimal.NewFromInt(0),
				KYCStatus:     models.KYCNotSubmitted,
				Status:        models.AccountActive,
				JoinedDate:    time.Now().UTC(),
			}
			if city.ID != (models.City{}).ID {
				retailer.CityID = &city.ID
			}
			if acct.AEPSReady {
				now := time.Now().UTC()
				retailer.KYCStatus = models.KYCVerified
				retailer.AEPSOnboardStatus = models.OnboardCompleted
				retailer.AEPSOnboardedAt = &now
			}
			if err := tx.Create(&retailer).Error; err != nil {
				return err
			}

			return seedOpeningBalance(tx, retailer.ID, acct.WalletOpeningBalance)
		})
		if err != nil {
			return err
		}

		log.Info("seed account created",
			slog.String("email", email),
			slog.String("role", string(acct.Role)),
		)
	}
	return nil
}

// seedOpeningBalance credits a newly created wallet inside the caller's
// transaction.
//
// The ledger is authoritative and retailers.wallet_balance is a projection of
// it, so the opening credit is written as a real ledger row rather than by
// setting the column directly. Skipping the ledger would leave the account
// permanently failing WalletService.ReconcileBalance.
//
// This duplicates a small part of WalletService.applyLocked rather than calling
// it: the service layer imports this package's models but seeding runs before
// any service exists, and reaching the other way would be an import cycle.
func seedOpeningBalance(tx *gorm.DB, retailerID uuid.UUID, amount string) error {
	amount = strings.TrimSpace(amount)
	if amount == "" {
		return nil
	}

	opening, err := decimal.NewFromString(amount)
	if err != nil {
		return fmt.Errorf("parse opening balance %q: %w", amount, err)
	}
	if opening.LessThanOrEqual(decimal.Zero) {
		return nil
	}

	// The retailer row was created in this same transaction, so the balance
	// before this credit is unambiguously zero and no row lock is needed.
	ledger := models.WalletLedger{
		RetailerID:    retailerID,
		Direction:     models.LedgerCredit,
		Reason:        models.ReasonAdminAdjustment,
		Amount:        opening,
		BalanceBefore: decimal.Zero,
		BalanceAfter:  opening,
		Narration:     "Seeded opening balance for testing",
	}
	if err := tx.Create(&ledger).Error; err != nil {
		return fmt.Errorf("write opening balance ledger: %w", err)
	}

	if err := tx.Model(&models.Retailer{}).
		Where("id = ?", retailerID).
		Update("wallet_balance", opening).Error; err != nil {
		return fmt.Errorf("set opening wallet balance: %w", err)
	}
	return nil
}

func seedUserTypes(db *gorm.DB, _ *slog.Logger) error {
	rows := []models.UserType{
		{
			Name:        "Retailer",
			Description: "Front-line outlet offering AEPS and Bharat Connect services",
			Permissions: []string{"aeps", "bbps", "recharge", "reports"},
			Status:      models.StatusActive,
		},
		{
			Name:        "Distributor",
			Description: "Manages a network of retailers and their fund requests",
			Permissions: []string{"aeps", "bbps", "recharge", "reports", "manage_retailers"},
			Status:      models.StatusActive,
		},
		{
			Name:        "Super Distributor",
			Description: "Regional head managing distributors",
			Permissions: []string{"aeps", "bbps", "recharge", "reports", "manage_retailers", "manage_distributors"},
			Status:      models.StatusActive,
		},
	}
	return upsertByName(db, rows, func(r models.UserType) string { return r.Name })
}

func seedServiceCategories(db *gorm.DB, _ *slog.Logger) error {
	rows := []models.ServiceCategory{
		{Name: "AEPS", Icon: "fingerprint", Description: "Aadhaar Enabled Payment System", Status: models.StatusEnabled, SortOrder: 1},
		{Name: "Bharat Connect", Icon: "receipt", Description: "Utility bill payments over Bharat Connect (BBPS)", Status: models.StatusEnabled, SortOrder: 2},
		{Name: "Recharge", Icon: "smartphone", Description: "Mobile and DTH recharge", Status: models.StatusEnabled, SortOrder: 3},
		{Name: "FASTag", Icon: "car", Description: "FASTag recharge", Status: models.StatusEnabled, SortOrder: 4},
		{Name: "Money Transfer", Icon: "send", Description: "Domestic money transfer", Status: models.StatusEnabled, SortOrder: 5},
		{Name: "Verification", Icon: "badge-check", Description: "PAN, Aadhaar and GST verification", Status: models.StatusEnabled, SortOrder: 6},
		{Name: "Insurance", Icon: "shield", Description: "Insurance premium collection", Status: models.StatusEnabled, SortOrder: 7},
	}
	return upsertByName(db, rows, func(r models.ServiceCategory) string { return r.Name })
}

func seedCities(db *gorm.DB, _ *slog.Logger) error {
	rows := []models.City{
		{Name: "Mohali", State: "Punjab", PincodeFrom: "140301", PincodeTo: "140901", Status: models.StatusActive},
		{Name: "Chandigarh", State: "Chandigarh", PincodeFrom: "160001", PincodeTo: "160104", Status: models.StatusActive},
		{Name: "Ludhiana", State: "Punjab", PincodeFrom: "141001", PincodeTo: "141120", Status: models.StatusActive},
		{Name: "Amritsar", State: "Punjab", PincodeFrom: "143001", PincodeTo: "143109", Status: models.StatusActive},
		{Name: "Delhi", State: "Delhi", PincodeFrom: "110001", PincodeTo: "110096", Status: models.StatusActive},
		{Name: "Jaipur", State: "Rajasthan", PincodeFrom: "302001", PincodeTo: "302039", Status: models.StatusActive},
	}

	for _, row := range rows {
		var count int64
		if err := db.Model(&models.City{}).
			Where("name = ? AND state = ?", row.Name, row.State).
			Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		if err := db.Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedServices(db *gorm.DB, _ *slog.Logger) error {
	categories := map[string]models.ServiceCategory{}
	var cats []models.ServiceCategory
	if err := db.Find(&cats).Error; err != nil {
		return err
	}
	for _, c := range cats {
		categories[c.Name] = c
	}

	type svc struct {
		name     string
		category string
		provider string
		min, max int64
	}

	defs := []svc{
		{"AEPS Cash Withdrawal", "AEPS", "Excisoft AEPS", 100, 10000},
		{"AEPS Balance Enquiry", "AEPS", "Excisoft AEPS", 0, 0},
		{"AEPS Mini Statement", "AEPS", "Excisoft AEPS", 0, 0},
		{"Aadhaar Pay", "AEPS", "Excisoft AEPS", 1, 10000},
		{"Electricity Bill", "Bharat Connect", "MobiKwik Bharat Connect", 1, 200000},
		{"Gas Bill", "Bharat Connect", "MobiKwik Bharat Connect", 1, 50000},
		{"Water Bill", "Bharat Connect", "MobiKwik Bharat Connect", 1, 50000},
		{"Broadband Bill", "Bharat Connect", "MobiKwik Bharat Connect", 1, 50000},
		{"Mobile Postpaid", "Bharat Connect", "MobiKwik Bharat Connect", 1, 50000},
		{"Mobile Prepaid Recharge", "Recharge", "MobiKwik Bharat Connect", 10, 5000},
		{"DTH Recharge", "Recharge", "MobiKwik Bharat Connect", 10, 5000},
		{"FASTag Recharge", "FASTag", "MobiKwik Bharat Connect", 100, 20000},
		{"PAN Verification", "Verification", "Internal", 0, 0},
		{"Aadhaar Verification", "Verification", "Internal", 0, 0},
		{"GST Verification", "Verification", "Internal", 0, 0},
	}

	for _, d := range defs {
		cat, ok := categories[d.category]
		if !ok {
			continue
		}

		var count int64
		if err := db.Model(&models.Service{}).Where("name = ?", d.name).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}

		row := models.Service{
			Name:        d.name,
			CategoryID:  cat.ID,
			Category:    cat.Name,
			APIProvider: d.provider,
			MinAmount:   decimal.NewFromInt(d.min),
			MaxAmount:   decimal.NewFromInt(d.max),
			Status:      models.StatusActive,
		}
		if err := db.Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}

func seedCommissionSlots(db *gorm.DB, _ *slog.Logger) error {
	var count int64
	if err := db.Model(&models.CommissionSlot{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	var retailerType models.UserType
	if err := db.Where("name = ?", "Retailer").First(&retailerType).Error; err != nil {
		return err
	}

	// Percentage slabs on AEPS withdrawals, flat fees on bill payments: this
	// mirrors how these products are normally priced.
	rows := []models.CommissionSlot{
		{
			Service: "AEPS Cash Withdrawal", SlabType: models.SlabPercentage,
			Value: decimal.RequireFromString("0.45"), TDS: decimal.RequireFromString("5"), GST: decimal.RequireFromString("18"),
			MinAmount: decimal.NewFromInt(100), MaxAmount: decimal.NewFromInt(10000),
			UserType: retailerType.Name, UserTypeID: &retailerType.ID, Status: models.StatusActive,
		},
		{
			Service: "Electricity Bill", SlabType: models.SlabFlat,
			Value: decimal.RequireFromString("4.00"), TDS: decimal.RequireFromString("5"), GST: decimal.RequireFromString("18"),
			MinAmount: decimal.NewFromInt(1), MaxAmount: decimal.NewFromInt(200000),
			UserType: retailerType.Name, UserTypeID: &retailerType.ID, Status: models.StatusActive,
		},
		{
			Service: "Mobile Prepaid Recharge", SlabType: models.SlabPercentage,
			Value: decimal.RequireFromString("2.50"), TDS: decimal.RequireFromString("5"), GST: decimal.RequireFromString("18"),
			MinAmount: decimal.NewFromInt(10), MaxAmount: decimal.NewFromInt(5000),
			UserType: retailerType.Name, UserTypeID: &retailerType.ID, Status: models.StatusActive,
		},
		{
			Service: "DTH Recharge", SlabType: models.SlabPercentage,
			Value: decimal.RequireFromString("3.00"), TDS: decimal.RequireFromString("5"), GST: decimal.RequireFromString("18"),
			MinAmount: decimal.NewFromInt(10), MaxAmount: decimal.NewFromInt(5000),
			UserType: retailerType.Name, UserTypeID: &retailerType.ID, Status: models.StatusActive,
		},
		{
			Service: "FASTag Recharge", SlabType: models.SlabFlat,
			Value: decimal.RequireFromString("5.00"), TDS: decimal.RequireFromString("5"), GST: decimal.RequireFromString("18"),
			MinAmount: decimal.NewFromInt(100), MaxAmount: decimal.NewFromInt(20000),
			UserType: retailerType.Name, UserTypeID: &retailerType.ID, Status: models.StatusActive,
		},
	}

	return db.Create(&rows).Error
}

func seedTicketDepartments(db *gorm.DB, _ *slog.Logger) error {
	rows := []models.TicketDepartment{
		{Name: "Technical Support", Description: "API, device and integration issues", Status: models.StatusActive, AgentsCount: 4},
		{Name: "Settlement & Accounts", Description: "Wallet, settlement and reconciliation queries", Status: models.StatusActive, AgentsCount: 3},
		{Name: "KYC & Onboarding", Description: "Document verification and onboarding help", Status: models.StatusActive, AgentsCount: 2},
		{Name: "Transaction Disputes", Description: "Failed and disputed transaction resolution", Status: models.StatusActive, AgentsCount: 5},
	}
	return upsertByName(db, rows, func(r models.TicketDepartment) string { return r.Name })
}

func seedCompanyBanks(db *gorm.DB, _ *slog.Logger) error {
	var count int64
	if err := db.Model(&models.CompanyBank{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	rows := []models.CompanyBank{
		{
			BankName: "HDFC Bank", AccountName: "UTILIPAY HUB (OPC) PRIVATE LIMITED",
			AccountNumber: "50200098765432", IFSC: "HDFC0001234", Branch: "Zirakpur",
			AccountType: "Current", UPIID: "utilipayhub@hdfcbank",
			IsDefault: true, Status: models.StatusActive,
		},
		{
			BankName: "State Bank of India", AccountName: "UTILIPAY HUB (OPC) PRIVATE LIMITED",
			AccountNumber: "39876543210", IFSC: "SBIN0004567", Branch: "Mohali",
			AccountType: "Current", Status: models.StatusActive,
		},
	}
	return db.Create(&rows).Error
}

// seedBillers loads a starter Bharat Connect biller set.
//
// The live list is refreshed from the provider; these entries exist so the bill
// payment UI is navigable before the first sync.
func seedBillers(db *gorm.DB, _ *slog.Logger) error {
	var count int64
	if err := db.Model(&models.Biller{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	rows := []models.Biller{
		{
			BillerID: "PSPC00000PUN01", Name: "Punjab State Power Corporation Ltd",
			Category: "Electricity", Coverage: "Punjab",
			CustomerParams:    models.JSONMap{"Account Number": map[string]any{"type": "numeric", "minLength": 6, "maxLength": 12}},
			SupportsBillFetch: true, PartialPayAllowed: false,
			MinAmount: decimal.NewFromInt(1), MaxAmount: decimal.NewFromInt(200000),
			Status: models.StatusActive,
		},
		{
			BillerID: "MAHA00000MAH01", Name: "Maharashtra State Electricity Distribution",
			Category: "Electricity", Coverage: "Maharashtra",
			CustomerParams:    models.JSONMap{"Consumer Number": map[string]any{"type": "numeric", "minLength": 12, "maxLength": 12}},
			SupportsBillFetch: true, PartialPayAllowed: false,
			MinAmount: decimal.NewFromInt(1), MaxAmount: decimal.NewFromInt(200000),
			Status: models.StatusActive,
		},
		{
			BillerID: "INDA00000NAT01", Name: "Indane Gas",
			Category: "Gas", Coverage: "National",
			CustomerParams:    models.JSONMap{"Consumer Number": map[string]any{"type": "numeric", "minLength": 8, "maxLength": 16}},
			SupportsBillFetch: true,
			MinAmount:         decimal.NewFromInt(1), MaxAmount: decimal.NewFromInt(50000),
			Status: models.StatusActive,
		},
		{
			BillerID: "AIRT00000NAT01", Name: "Airtel Postpaid",
			Category: "Mobile Postpaid", Coverage: "National",
			CustomerParams:    models.JSONMap{"Mobile Number": map[string]any{"type": "numeric", "minLength": 10, "maxLength": 10}},
			SupportsBillFetch: true,
			MinAmount:         decimal.NewFromInt(1), MaxAmount: decimal.NewFromInt(50000),
			Status: models.StatusActive,
		},
		{
			BillerID: "JIOF00000NAT01", Name: "Jio Fiber",
			Category: "Broadband", Coverage: "National",
			CustomerParams:    models.JSONMap{"Customer ID": map[string]any{"type": "alphanumeric", "minLength": 6, "maxLength": 20}},
			SupportsBillFetch: true,
			MinAmount:         decimal.NewFromInt(1), MaxAmount: decimal.NewFromInt(50000),
			Status: models.StatusActive,
		},
	}
	return db.Create(&rows).Error
}

func seedAnnouncements(db *gorm.DB, _ *slog.Logger) error {
	var count int64
	if err := db.Model(&models.Announcement{}).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	now := time.Now().UTC()
	expiry := now.AddDate(0, 3, 0)

	rows := []models.Announcement{
		{
			Title:    "BBPS is now Bharat Connect",
			Message:  "NPCI has rebranded BBPS to Bharat Connect. Updated logos and receipt formats are live across the platform.",
			Audience: models.AudienceAll, Status: models.AnnouncementPublished,
			PublishedDate: &now, ExpiryDate: &expiry,
		},
		{
			Title:    "Complete your KYC to activate AEPS",
			Message:  "AEPS services activate once your KYC is verified. Submit your documents from the KYC section of your dashboard.",
			Audience: models.AudienceRetailer, Status: models.AnnouncementPublished,
			PublishedDate: &now, ExpiryDate: &expiry,
		},
	}
	return db.Create(&rows).Error
}

// upsertByName inserts rows whose Name is not already present.
//
// Generic over the row type so each master table does not need its own loop.
func upsertByName[T any](db *gorm.DB, rows []T, nameOf func(T) string) error {
	for i := range rows {
		row := rows[i]
		var count int64
		if err := db.Model(new(T)).Where("name = ?", nameOf(row)).Count(&count).Error; err != nil {
			return err
		}
		if count > 0 {
			continue
		}
		if err := db.Create(&row).Error; err != nil {
			return err
		}
	}
	return nil
}
