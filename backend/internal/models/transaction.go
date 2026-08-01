package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

// Transaction is the canonical record of a single financial operation.
//
// Rows are append-only in spirit: status advances forward and provider
// responses accumulate, but a transaction is never deleted. This is what makes
// reconciliation and dispute handling possible.
type Transaction struct {
	Base

	// TxnID is the human-facing reference shown in the UI and on receipts. It
	// is unique and safe to expose.
	TxnID string `gorm:"size:40;not null;uniqueIndex" json:"txnId"`

	RetailerID uuid.UUID `gorm:"type:uuid;not null;index:idx_txn_retailer_created,priority:1" json:"retailerId"`
	Retailer   string    `gorm:"size:200" json:"retailer"`

	Category ServiceCategoryName `gorm:"size:40;not null;index" json:"category"`
	Service  string              `gorm:"size:120;not null" json:"service"`
	Mode     string              `gorm:"size:60" json:"mode,omitempty"`

	Amount     Money `gorm:"type:numeric(18,2);not null" json:"amount"`
	Commission Money `gorm:"type:numeric(18,2);not null;default:0" json:"commission"`
	TDS        Money `gorm:"type:numeric(18,2);not null;default:0" json:"tds"`
	GST        Money `gorm:"type:numeric(18,2);not null;default:0" json:"gst"`
	// NetAmount is what actually moved against the retailer wallet after
	// commission, TDS and GST.
	NetAmount Money `gorm:"type:numeric(18,2);not null;default:0" json:"netAmount"`

	Status TxStatus `gorm:"size:20;not null;index:idx_txn_status_created,priority:1" json:"status"`

	// --- Provider linkage ---

	Provider ProviderName `gorm:"size:40;index" json:"provider,omitempty"`
	// ProviderRef is the upstream transaction identifier. Indexed because
	// status polling and webhooks look transactions up by it.
	ProviderRef string `gorm:"size:120;index" json:"providerRef,omitempty"`
	// ProviderTxnID is a secondary upstream reference (for Bharat Connect this
	// carries the NPCI transaction ID that must appear on the receipt).
	ProviderTxnID string `gorm:"size:120;index" json:"providerTxnId,omitempty"`
	// BharatConnectTxnID and CCF are required on the payment receipt by
	// bharat_connect/ui_complience.md.
	BharatConnectTxnID string `gorm:"size:120" json:"bharatConnectTxnId,omitempty"`
	CCF                Money  `gorm:"type:numeric(18,2);not null;default:0" json:"ccf"`

	ProviderStatusCode string `gorm:"size:40" json:"providerStatusCode,omitempty"`
	ProviderMessage    string `gorm:"size:500" json:"providerMessage,omitempty"`

	// --- Idempotency ---

	// IdempotencyKey prevents a retried client request from creating a second
	// transaction. Nullable so non-idempotent internal writes are still valid,
	// but unique when present.
	IdempotencyKey *string `gorm:"size:120;uniqueIndex" json:"-"`

	// --- Reconciliation state (UAT checklist items 15-17) ---

	// StatusCheckAttempts counts completed upstream status polls.
	StatusCheckAttempts int `gorm:"not null;default:0" json:"statusCheckAttempts"`
	// NextStatusCheckAt is when the reconciliation worker should next poll.
	// Nil means no further polling is scheduled.
	NextStatusCheckAt *time.Time `gorm:"index" json:"nextStatusCheckAt,omitempty"`
	LastStatusCheckAt *time.Time `json:"lastStatusCheckAt,omitempty"`
	// TimedOut records that our HTTP call to the provider never returned a
	// verdict, which is operationally distinct from the provider replying
	// "pending".
	TimedOut bool `gorm:"not null;default:false" json:"timedOut"`
	// NeedsManualReview is set when automated retries are exhausted without a
	// terminal status.
	NeedsManualReview bool `gorm:"not null;default:false;index" json:"needsManualReview"`

	SettledAt   *time.Time `json:"settledAt,omitempty"`
	CompletedAt *time.Time `json:"completedAt,omitempty"`

	// Metadata holds operation-specific detail (masked Aadhaar, biller params,
	// bill fetch echo). Kept as JSONB so adding a field does not need a
	// migration, and so nothing sensitive has to live in a wide column set.
	Metadata datatypes.JSON `gorm:"type:jsonb" json:"metadata,omitempty"`
}

func (Transaction) TableName() string { return "transactions" }

// IsResolvable reports whether the transaction is a candidate for a status
// poll: not yet terminal, and not already escalated.
func (t *Transaction) IsResolvable() bool {
	return !t.Status.IsTerminal() && !t.NeedsManualReview
}

// WalletLedger is the append-only double-entry record of wallet movement.
//
// Every row carries the balance after applying the entry, so a retailer's
// statement is reproducible without replaying the whole table, and any drift
// between ledger and cached balance is detectable.
type WalletLedger struct {
	Base

	RetailerID uuid.UUID `gorm:"type:uuid;not null;index:idx_ledger_retailer_created,priority:1" json:"retailerId"`

	Direction LedgerDirection `gorm:"size:10;not null" json:"direction"`
	Reason    LedgerReason    `gorm:"size:40;not null;index" json:"reason"`

	Amount        Money `gorm:"type:numeric(18,2);not null" json:"amount"`
	BalanceBefore Money `gorm:"type:numeric(18,2);not null" json:"balanceBefore"`
	BalanceAfter  Money `gorm:"type:numeric(18,2);not null" json:"balanceAfter"`

	// Reference links the entry to whatever caused it.
	TransactionID *uuid.UUID `gorm:"type:uuid;index" json:"transactionId,omitempty"`
	FundRequestID *uuid.UUID `gorm:"type:uuid;index" json:"fundRequestId,omitempty"`
	OrderID       *uuid.UUID `gorm:"type:uuid;index" json:"orderId,omitempty"`

	Narration string `gorm:"size:300" json:"narration"`

	// CreatedByID is the actor responsible; nil for system-generated entries.
	CreatedByID *uuid.UUID `gorm:"type:uuid" json:"createdById,omitempty"`
}

func (WalletLedger) TableName() string { return "wallet_ledgers" }

// FundRequest is a retailer's request to top up their wallet, pending admin
// approval.
type FundRequest struct {
	Base

	RetailerID uuid.UUID `gorm:"type:uuid;not null;index" json:"retailerId"`
	Retailer   string    `gorm:"size:200" json:"retailer"`

	Amount Money  `gorm:"type:numeric(18,2);not null" json:"amount"`
	Mode   string `gorm:"size:60;not null" json:"mode"`
	Bank   string `gorm:"size:150" json:"bank"`
	UTR    string `gorm:"size:60;index" json:"utr,omitempty"`

	// CompanyBankID is the company account the retailer claims to have paid into.
	CompanyBankID *uuid.UUID `gorm:"type:uuid;index" json:"companyBankId,omitempty"`

	DepositDate *time.Time `json:"depositDate,omitempty"`
	ProofURL    string     `gorm:"size:500" json:"proofUrl,omitempty"`
	Remarks     string     `gorm:"size:500" json:"remarks,omitempty"`

	Status FundRequestStatus `gorm:"size:20;not null;default:pending;index" json:"status"`

	ReviewedByID *uuid.UUID `gorm:"type:uuid" json:"reviewedById,omitempty"`
	ReviewedAt   *time.Time `json:"reviewedAt,omitempty"`
	ReviewNote   string     `gorm:"size:500" json:"reviewNote,omitempty"`
}

func (FundRequest) TableName() string { return "fund_requests" }

// Settlement records a bank settlement of AEPS cash-withdrawal float back to
// the retailer.
type Settlement struct {
	Base

	RetailerID uuid.UUID `gorm:"type:uuid;not null;index" json:"retailerId"`

	AmountSettled Money    `gorm:"type:numeric(18,2);not null" json:"amountSettled"`
	Bank          string   `gorm:"size:150" json:"bank"`
	UTR           string   `gorm:"size:60;index" json:"utr"`
	Status        TxStatus `gorm:"size:20;not null;default:pending" json:"status"`

	SettledOn time.Time `gorm:"not null;index" json:"date"`
}

func (Settlement) TableName() string { return "settlements" }

// ProviderCallLog is the audit trail of every upstream request/response.
//
// bharat_connect/UAT_checklist.md requires submitting, for each API, the full
// request including BOTH encrypted and decrypted values of the envelope. This
// table is the system of record for that submission, which is why it stores
// plaintext alongside ciphertext.
//
// Security note: rows contain decrypted payloads and session keys. Access must
// be restricted to admins, retention should be bounded, and these fields must
// never be echoed into general application logs.
type ProviderCallLog struct {
	Base

	Provider ProviderName `gorm:"size:40;not null;index" json:"provider"`
	// Operation is a stable label such as "token", "balance", "validate",
	// "view_bill", "recharge", "status".
	Operation string `gorm:"size:60;not null;index" json:"operation"`

	TransactionID *uuid.UUID `gorm:"type:uuid;index" json:"transactionId,omitempty"`
	RetailerID    *uuid.UUID `gorm:"type:uuid;index" json:"retailerId,omitempty"`

	Method      string `gorm:"size:10" json:"method"`
	URL         string `gorm:"size:500" json:"url"`
	RequestHead string `gorm:"type:text" json:"requestHeaders"`

	// Encrypted envelope as transmitted.
	RequestEncryptedSessionKey string `gorm:"type:text" json:"requestEncryptedSessionKey,omitempty"`
	RequestEncryptedPayload    string `gorm:"type:text" json:"requestEncryptedPayload,omitempty"`
	RequestKeyVersion          string `gorm:"size:20" json:"requestKeyVersion,omitempty"`
	RequestIV                  string `gorm:"size:64" json:"requestIv,omitempty"`

	// Decrypted counterparts, required by the UAT submission.
	RequestPlaintext     string `gorm:"type:text" json:"requestPlaintext,omitempty"`
	RequestSessionKeyB64 string `gorm:"type:text" json:"requestSessionKey,omitempty"`

	ResponseStatus    int    `gorm:"not null;default:0" json:"responseStatus"`
	ResponseRaw       string `gorm:"type:text" json:"responseRaw,omitempty"`
	ResponsePlaintext string `gorm:"type:text" json:"responsePlaintext,omitempty"`

	// CurlEquivalent is a reproducible cURL command for the call, which the UAT
	// checklist asks for verbatim.
	CurlEquivalent string `gorm:"type:text" json:"curl,omitempty"`

	DurationMS int64  `gorm:"not null;default:0" json:"durationMs"`
	Error      string `gorm:"size:1000" json:"error,omitempty"`
	// Attempt distinguishes the original call from subsequent status checks.
	Attempt int `gorm:"not null;default:1" json:"attempt"`
}

func (ProviderCallLog) TableName() string { return "provider_call_logs" }

// ProviderToken caches a provider auth token.
//
// The Bharat Connect token is valid 24h with a hard cap of 100 tokens per day,
// and requesting a new one expires the incumbent after 5 minutes. Caching is
// therefore mandatory, not an optimisation: naive per-request token generation
// would exhaust the daily quota and continuously invalidate live tokens.
type ProviderToken struct {
	Base

	Provider ProviderName `gorm:"size:40;not null;uniqueIndex" json:"provider"`
	Token    string       `gorm:"type:text;not null" json:"-"`

	IssuedAt  time.Time `gorm:"not null" json:"issuedAt"`
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`

	// IssuedTodayCount and QuotaDate track the provider's daily issuance cap so
	// we can refuse to mint tokens past the limit instead of being throttled.
	IssuedTodayCount int       `gorm:"not null;default:0" json:"issuedTodayCount"`
	QuotaDate        time.Time `gorm:"not null" json:"quotaDate"`
}

func (ProviderToken) TableName() string { return "provider_tokens" }

// AuditLog records privileged state changes for accountability.
type AuditLog struct {
	Base

	ActorID   *uuid.UUID `gorm:"type:uuid;index" json:"actorId,omitempty"`
	ActorRole Role       `gorm:"size:20" json:"actorRole,omitempty"`

	Action   string `gorm:"size:120;not null;index" json:"action"`
	Entity   string `gorm:"size:80;index" json:"entity"`
	EntityID string `gorm:"size:60;index" json:"entityId"`

	Before    datatypes.JSON `gorm:"type:jsonb" json:"before,omitempty"`
	After     datatypes.JSON `gorm:"type:jsonb" json:"after,omitempty"`
	IPAddress string         `gorm:"size:64" json:"ipAddress"`
	Note      string         `gorm:"size:500" json:"note,omitempty"`
}

func (AuditLog) TableName() string { return "audit_logs" }
