package models

// Enum values are declared as string types so GORM stores them readably and the
// JSON payloads match utility-frontend/src/lib/types.ts exactly.

// Role identifies the actor type. Mirrors `Role` in types.ts.
type Role string

const (
	RoleAdmin    Role = "admin"
	RoleRetailer Role = "retailer"
)

// Valid reports whether r is a recognised role.
func (r Role) Valid() bool { return r == RoleAdmin || r == RoleRetailer }

// TxStatus is the lifecycle state of a transaction. Mirrors `TxStatus`.
type TxStatus string

const (
	TxStatusSuccess    TxStatus = "success"
	TxStatusPending    TxStatus = "pending"
	TxStatusFailed     TxStatus = "failed"
	TxStatusProcessing TxStatus = "processing"
	TxStatusRefunded   TxStatus = "refunded"
)

// IsTerminal reports whether the status will no longer change on its own.
// Only terminal transactions are excluded from reconciliation sweeps.
func (s TxStatus) IsTerminal() bool {
	switch s {
	case TxStatusSuccess, TxStatusFailed, TxStatusRefunded:
		return true
	default:
		return false
	}
}

// ServiceCategoryName groups transactions by product line. Mirrors the
// `category` union on Transaction.
type ServiceCategoryName string

const (
	CategoryAEPS          ServiceCategoryName = "AEPS"
	CategoryBBPS          ServiceCategoryName = "BBPS"
	CategoryRecharge      ServiceCategoryName = "Recharge"
	CategoryDTH           ServiceCategoryName = "DTH"
	CategoryMoneyTransfer ServiceCategoryName = "Money Transfer"
	CategoryFASTag        ServiceCategoryName = "FASTag"
	CategoryInsurance     ServiceCategoryName = "Insurance"
	CategoryVerification  ServiceCategoryName = "Verification"
)

// KYCStatus mirrors the `kycStatus` union on Retailer.
type KYCStatus string

const (
	KYCVerified     KYCStatus = "verified"
	KYCPending      KYCStatus = "pending"
	KYCRejected     KYCStatus = "rejected"
	KYCNotSubmitted KYCStatus = "not_submitted"
)

// AccountStatus mirrors the `status` union on Retailer.
type AccountStatus string

const (
	AccountActive    AccountStatus = "active"
	AccountInactive  AccountStatus = "inactive"
	AccountSuspended AccountStatus = "suspended"
)

// EntityStatus is the active/inactive flag used by master-data tables.
type EntityStatus string

const (
	StatusActive   EntityStatus = "active"
	StatusInactive EntityStatus = "inactive"
)

// ToggleStatus is the enabled/disabled flag used by products and service
// categories.
type ToggleStatus string

const (
	StatusEnabled  ToggleStatus = "enabled"
	StatusDisabled ToggleStatus = "disabled"
)

// FundRequestStatus mirrors the `status` union on FundRequest.
type FundRequestStatus string

const (
	FundRequestPending  FundRequestStatus = "pending"
	FundRequestApproved FundRequestStatus = "approved"
	FundRequestRejected FundRequestStatus = "rejected"
)

// OrderStatus mirrors `OrderStatus`.
type OrderStatus string

const (
	OrderPending    OrderStatus = "pending"
	OrderProcessing OrderStatus = "processing"
	OrderShipped    OrderStatus = "shipped"
	OrderDelivered  OrderStatus = "delivered"
	OrderCancelled  OrderStatus = "cancelled"
)

// SlabType mirrors the `slabType` union on CommissionSlot.
type SlabType string

const (
	SlabFlat       SlabType = "flat"
	SlabPercentage SlabType = "percentage"
)

// AnnouncementAudience mirrors `AnnouncementAudience`.
type AnnouncementAudience string

const (
	AudienceAdmin    AnnouncementAudience = "Admin"
	AudienceRetailer AnnouncementAudience = "Retailer"
	AudienceAll      AnnouncementAudience = "All"
)

// AnnouncementStatus mirrors the `status` union on Announcement.
type AnnouncementStatus string

const (
	AnnouncementPublished AnnouncementStatus = "published"
	AnnouncementDraft     AnnouncementStatus = "draft"
	AnnouncementExpired   AnnouncementStatus = "expired"
)

// LedgerDirection is the sign of a wallet ledger entry.
type LedgerDirection string

const (
	LedgerCredit LedgerDirection = "credit"
	LedgerDebit  LedgerDirection = "debit"
)

// LedgerReason explains why a wallet entry exists. Every balance change is
// attributable to exactly one reason, which makes the ledger auditable.
type LedgerReason string

const (
	ReasonFundRequest      LedgerReason = "fund_request"
	ReasonAdminAdjustment  LedgerReason = "admin_adjustment"
	ReasonTransactionDebit LedgerReason = "transaction_debit"
	ReasonTransactionHold  LedgerReason = "transaction_hold"
	ReasonReversal         LedgerReason = "reversal"
	ReasonCommission       LedgerReason = "commission"
	ReasonSettlement       LedgerReason = "settlement"
	ReasonProductOrder     LedgerReason = "product_order"
)

// AEPSOperation enumerates the AEPS transaction types offered to retailers.
type AEPSOperation string

const (
	AEPSCashWithdrawal AEPSOperation = "cash_withdrawal"
	AEPSBalanceEnquiry AEPSOperation = "balance_enquiry"
	AEPSMiniStatement  AEPSOperation = "mini_statement"
	AEPSAadhaarPay     AEPSOperation = "aadhaar_pay"
)

// Valid reports whether o is a recognised AEPS operation.
func (o AEPSOperation) Valid() bool {
	switch o {
	case AEPSCashWithdrawal, AEPSBalanceEnquiry, AEPSMiniStatement, AEPSAadhaarPay:
		return true
	default:
		return false
	}
}

// RequiresAmount reports whether the operation debits a customer account and
// therefore needs an amount.
func (o AEPSOperation) RequiresAmount() bool {
	return o == AEPSCashWithdrawal || o == AEPSAadhaarPay
}

// OnboardStatus tracks AEPS merchant onboarding, which is a redirect-based
// KYC flow completed on the provider's hosted page.
type OnboardStatus string

const (
	OnboardNotStarted OnboardStatus = "not_started"
	OnboardPending    OnboardStatus = "pending"
	OnboardCompleted  OnboardStatus = "completed"
	OnboardFailed     OnboardStatus = "failed"
)

// ProviderName identifies an upstream integration.
type ProviderName string

const (
	ProviderAEPSExcisoft  ProviderName = "excisoft_aeps"
	ProviderBharatConnect ProviderName = "mobikwik_bharat_connect"
)
