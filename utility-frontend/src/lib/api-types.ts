/**
 * Response contracts for the UtiliPay backend.
 *
 * These mirror the Go structs in internal/service and internal/handler. Money
 * arrives as a decimal *string* rather than a number: the backend stores
 * NUMERIC(18,2) and serialising through a JavaScript double would silently
 * round paise. Always format with formatMoney and compute with the helpers in
 * lib/money.ts.
 */

export type TxStatus = "success" | "pending" | "failed" | "processing" | "refunded"
export type KYCStatus = "verified" | "pending" | "rejected" | "not_submitted"
export type AccountStatus = "active" | "inactive" | "suspended"
export type OnboardStatus = "not_started" | "pending" | "completed" | "failed"
export type FundRequestStatus = "pending" | "approved" | "rejected"
export type LedgerDirection = "credit" | "debit"

/** A decimal money value, e.g. "1250.50". Never parse this into a float for arithmetic. */
export type MoneyString = string

// --- capabilities ---

export interface AepsCapabilities {
  onboard: boolean
  cashWithdrawal: boolean
  balanceEnquiry: boolean
  miniStatement: boolean
  aadhaarPay: boolean
  statusCheck: boolean
}

export interface BharatConnectCapabilities {
  token: boolean
  plans: boolean
  balance: boolean
  validation: boolean
  viewBill: boolean
  payment: boolean
  status: boolean
  creditCardBill: boolean
}

export interface IntegrationCapabilities {
  aeps: AepsCapabilities
  bharatConnect: BharatConnectCapabilities
}

// --- transactions ---

export interface Transaction {
  id: string
  txnId: string
  retailerId: string
  retailer: string
  category: string
  service: string
  mode?: string
  amount: MoneyString
  commission: MoneyString
  tds: MoneyString
  gst: MoneyString
  netAmount: MoneyString
  status: TxStatus
  provider?: string
  providerRef?: string
  providerTxnId?: string
  /** Required on the payment receipt by NPCI Bharat Connect branding rules. */
  bharatConnectTxnId?: string
  /** Customer Convenience Fee. Also required on the receipt. */
  ccf: MoneyString
  providerStatusCode?: string
  providerMessage?: string
  timedOut: boolean
  needsManualReview: boolean
  statusCheckAttempts: number
  createdAt: string
  completedAt?: string
  metadata?: Record<string, unknown>
}

/** The receipt payload, shaped for the compliance-mandated receipt screen. */
export interface Receipt {
  txnId: string
  status: TxStatus
  category: string
  service: string
  amount: MoneyString
  commission: MoneyString
  mode?: string
  providerTxnId?: string
  providerRef?: string
  bharatConnectTxnId?: string
  ccf: MoneyString
  statusCode?: string
  message?: string
  /** True while the transaction is not yet terminal, so the UI keeps polling. */
  needsStatusCheck: boolean
  needsManualReview: boolean
  createdAt: string
  completedAt?: string
  metadata?: Record<string, unknown>
}

export interface Stats {
  todayCount: number
  todayVolume: MoneyString
  todayCommission: MoneyString
  successCount: number
  failedCount: number
  pendingCount: number
  totalVolume: MoneyString
  totalCommission: MoneyString
  walletBalance: MoneyString
}

// --- retailer ---

export interface RetailerProfile {
  id: string
  userId: string
  name: string
  email: string
  phone: string
  merchantCode: string
  shopName: string
  firmName: string
  addressLine: string
  city: string
  state: string
  pincode: string
  userType: string
  walletBalance: MoneyString
  kycStatus: KYCStatus
  status: AccountStatus
  joinedDate: string
  aepsOnboardStatus: OnboardStatus
  aepsOnboardedAt?: string
  pan: string
  gstin: string
  aadhaarLast4: string
  bankAccountName: string
  bankAccountNumber: string
  bankIfsc: string
  bankName: string
  nomineeName: string
  nomineeRelation: string
  nomineeContact: string
}

/** One sign-in attempt, successful or not. */
export interface LoginHistoryEntry {
  id: string
  ipAddress: string
  device: string
  success: boolean
  reason?: string
  createdAt: string
}

export interface Announcement {
  id: string
  title: string
  message: string
  audience: "Admin" | "Retailer" | "All"
  status: "published" | "draft" | "expired"
  publishedDate?: string
  expiryDate?: string
}

export interface RetailerDashboard {
  stats: Stats
  profile: RetailerProfile
  recentTransactions: Transaction[]
  announcements: Announcement[]
  capabilities: IntegrationCapabilities
}

export interface WalletLedgerEntry {
  id: string
  retailerId: string
  direction: LedgerDirection
  reason: string
  amount: MoneyString
  balanceBefore: MoneyString
  balanceAfter: MoneyString
  narration: string
  transactionId?: string
  createdAt: string
}

/** A ledger row on the platform-wide admin view, with its retailer named. */
export interface AdminLedgerEntry extends WalletLedgerEntry {
  retailer: string
  merchantCode: string
}

// --- Bharat Connect ---

export interface BillerCategory {
  name: string
  billerCount: number
}

export interface Biller {
  id: string
  billerId: string
  name: string
  category: string
  coverage?: string
  customerParams?: Record<string, unknown>
  supportsBillFetch: boolean
  supportsValidation: boolean
  partialPayAllowed: boolean
  minAmount: MoneyString
  maxAmount: MoneyString
  status: string
}

export interface Circle {
  id: number
  name: string
}

export interface PaymentModeOption {
  mode: string
  /** What paymentAccountInfo must contain for this mode, per the provider spec. */
  accountInfoHint: string
}

export interface RechargePlan {
  id: string
  operatorId: number
  circleId: number
  planType: number
  planTypeName?: string
  amount: number
  talktime: number
  validity: string
  planName: string
  planDescription: string
  dataBenefit?: string
}

/** A fetched bill. The amount is authoritative server-side; pay by requestRef. */
export interface FetchedBill {
  requestRef: string
  customerName: string
  billNumber: string
  billAmount: MoneyString
  billDate?: string
  dueDate?: string
  acceptPayment: boolean
  acceptPartPay: boolean
  expiresAt: string
}

export interface ValidationResult {
  status: string
  description: string
  validated: boolean
}

export interface ComplaintTargets {
  desktopUrl: string
  mobileUrl: string
  lookupModes: { id: string; label: string }[]
}

// --- AEPS ---

export interface AepsOnboardResult {
  redirectUrl: string
  onboardPending: boolean
  message: string
}

export interface Settlement {
  id: string
  retailerId: string
  amountSettled: MoneyString
  bank: string
  utr: string
  status: TxStatus
  date: string
}

// --- catalogue ---

export type OrderStatus = "pending" | "processing" | "shipped" | "delivered" | "cancelled"

export interface ProductOrderItem {
  productId?: string
  productName: string
  sku: string
  quantity: number
  price: MoneyString
}

export interface ProductOrder {
  id: string
  orderId: string
  retailerId: string
  retailer: string
  /** A summary of the order for list views; `items` is authoritative. */
  product: string
  quantity: number
  amount: MoneyString
  status: OrderStatus
  shippingAddress: string
  trackingNumber?: string
  courier?: string
  /** Serialised from PlacedAt. */
  date: string
  shippedAt?: string
  deliveredAt?: string
  cancelledAt?: string
  items?: ProductOrderItem[]
}

export interface Product {
  id: string
  name: string
  sku: string
  category: string
  description: string
  price: MoneyString
  stock: number
  images: string[] | null
  status: "enabled" | "disabled"
  createdDate: string
}

// --- KYC ---

/** The stable document keys the backend accepts. */
export type KycDocType =
  | "pan"
  | "aadhaar_front"
  | "aadhaar_back"
  | "shop_photo"
  | "address_proof"
  | "cancelled_cheque"
  | "gst"
  | "shop_interior"
  | "other"

export interface KycDocument {
  id: string
  applicationId: string
  retailerId: string
  docType: KycDocType
  name: string
  fileUrl: string
  fileSize: number
  mimeType: string
  docNumber?: string
  status: KYCStatus
  remarks?: string
  verifiedAt?: string
  uploadedAt: string
}

export interface KycApplication {
  id: string
  retailerId: string
  status: KYCStatus
  currentStep: number
  totalSteps: number
  submittedAt?: string
  reviewedAt?: string
  rejectReason?: string
  documents?: KycDocument[]

  /** What the server still requires. The wizard reads this rather than re-deriving it. */
  missingDocTypes: KycDocType[]
  canSubmit: boolean

  pan: string
  gstin: string
  aadhaarLast4: string
}

// --- funds ---

export interface FundRequest {
  id: string
  retailerId: string
  retailer: string
  amount: MoneyString
  mode: string
  bank: string
  utr?: string
  depositDate?: string
  proofUrl?: string
  remarks?: string
  status: FundRequestStatus
  reviewedAt?: string
  reviewNote?: string
  createdAt: string
}

export interface CompanyBank {
  id: string
  bankName: string
  accountName: string
  accountNumber: string
  ifsc: string
  branch: string
  accountType: string
  upiId?: string
  isDefault: boolean
  status: string
}

// --- reports ---

export interface CommissionRow {
  service: string
  category: string
  count: number
  volume: MoneyString
  commission: MoneyString
  tds: MoneyString
  gst: MoneyString
  netEarnings: MoneyString
}

export interface MonthlyEarnings {
  month: string
  volume: MoneyString
  commission: MoneyString
  count: number
}

export interface CommissionReport {
  from?: string
  to?: string
  rows: CommissionRow[]
  total: CommissionRow
  monthly: MonthlyEarnings[]
}

export interface GSTReport {
  from?: string
  to?: string
  rows: { month: string; count: number; commission: MoneyString; gst: MoneyString }[]
  totalGst: MoneyString
  gstin: string
}

export interface TDSReport {
  from?: string
  to?: string
  rows: { month: string; count: number; commission: MoneyString; tds: MoneyString }[]
  totalTds: MoneyString
  pan: string
  financialYear: string
}

export interface CommissionSlot {
  id: string
  service: string
  slabType: "flat" | "percentage"
  value: MoneyString
  tds: MoneyString
  gst: MoneyString
  minAmount: MoneyString
  maxAmount: MoneyString
  userType: string
  status: string
}

export interface ServiceReportRow {
  service: string
  category: string
  total: number
  successCount: number
  failedCount: number
  pendingCount: number
  volume: MoneyString
  commission: MoneyString
}

// --- admin ---

export interface ReconciliationSummary {
  pending: number
  processing: number
  timedOut: number
  awaitingReview: number
  dueForStatusCheck: number
}

export interface AdminDashboard {
  stats: Stats
  pendingFundRequests: number
  reconciliation: ReconciliationSummary
  recentTransactions: Transaction[]
  recentFundRequests: FundRequest[]
  recentRetailers: RetailerSummary[]
  serviceAnalytics: ServiceReportRow[]
  announcements: Announcement[]
  systemStatus: IntegrationCapabilities
}

export interface RetailerSummary {
  id: string
  userId: string
  merchantCode: string
  shopName: string
  city: string
  state: string
  walletBalance: MoneyString
  kycStatus: KYCStatus
  status: AccountStatus
  joinedDate: string
  userType: string
  user?: { name: string; email: string; phone: string }
}
