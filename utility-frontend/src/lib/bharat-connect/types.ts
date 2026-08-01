/**
 * Bharat Connect domain types.
 *
 * Field names mirror the NBBL (NPCI Bharat BillPay Ltd.) Bharat Connect
 * specification so the same shapes can be used once the live APIs are wired.
 */

export type ParamType = "text" | "number" | "tel" | "date" | "email"

/** A single bill-fetch input declared by the biller in the biller master. */
export interface BillerParam {
  key: string
  label: string
  type: ParamType
  minLength?: number
  maxLength?: number
  /** Serialised RegExp source, validated client-side before fetch. */
  pattern?: string
  placeholder?: string
  helpText?: string
  optional?: boolean
}

/** Whether the biller supports/requires a bill fetch before payment. */
export type FetchRequirement = "MANDATORY" | "OPTIONAL" | "NOT_SUPPORTED"

/** How closely the paid amount must match the fetched bill amount. */
export type AmountExactness =
  | "Exact"
  | "Exact and above"
  | "Exact and below"
  | "Exact, above and below"
  | "Any"

/** Customer Convenience Fee configuration, as published by the biller. */
export interface CcfConfig {
  type: "flat" | "percent"
  value: number
  /** Percent CCF is capped at this rupee amount when set. */
  cap?: number
}

export interface Biller {
  /** NBBL biller ID, e.g. "MAHADISCOM00MAH01". */
  id: string
  name: string
  categorySlug: string
  /** Operating region, e.g. "Maharashtra" or "National". */
  coverage: string
  fetchRequirement: FetchRequirement
  amountExactness: AmountExactness
  /** Biller accepts payments without a prior bill fetch (quick pay). */
  supportsAdhoc: boolean
  supportsPartPay: boolean
  ccf: CcfConfig
  params: BillerParam[]
  popular: boolean
  live: boolean
}

export type BillStatus = "DUE" | "PAID" | "NOT_AVAILABLE"

/** Response of a Bharat Connect bill fetch. */
export interface FetchedBill {
  customerName: string
  billNumber: string
  billDate: string
  billDueDate: string
  billPeriod?: string
  billAmount: number
  status: BillStatus
  /** Biller-declared extra rows, rendered verbatim on the bill fetch screen. */
  additionalInfo?: { name: string; value: string }[]
}

export type TxnStatus = "success" | "pending" | "failed" | "refunded"

export type PaymentMode = "Wallet" | "Cash" | "UPI" | "Card" | "Account Transfer"

export interface BharatConnectTxn {
  id: string
  /** Reference ID returned by NBBL. Quoted by the customer in complaints. */
  bharatConnectTxnId: string
  /** Our own reference, sent to NBBL as the agent transaction ID. */
  partnerTxnId: string
  /** Biller-side approval reference number. */
  approvalRefNumber: string

  billerId: string
  billerName: string
  categorySlug: string
  categoryName: string

  /** Bill-fetch inputs that identified the account, e.g. consumer number. */
  params: Record<string, string>

  customerName: string
  customerMobile: string

  billNumber: string
  billDate: string
  billDueDate: string

  billAmount: number
  /** Customer Convenience Fee. */
  ccf: number
  /** Retailer commission earned on this transaction. */
  commission: number
  totalAmount: number

  paymentMode: PaymentMode
  status: TxnStatus
  transactedAt: string

  retailerId: string
  retailerName: string
  /** Agent ID registered with NBBL for this outlet. */
  agentId: string

  complaintIds: string[]
}

export type ComplaintType = "Transaction" | "Service"

export type ComplaintStatus = "Open" | "In Progress" | "Resolved" | "Rejected"

export interface ComplaintTimelineEntry {
  at: string
  status: ComplaintStatus
  note: string
  by: string
}

export interface Complaint {
  id: string
  /** Reference ID assigned by the Bharat Connect complaint system. */
  complaintRefId: string
  type: ComplaintType
  /** Populated for transaction complaints. */
  bharatConnectTxnId?: string
  /** How the customer located the transaction. */
  lookupMethod: "txn-ref" | "mobile-date"
  customerMobile: string
  reason: string
  description: string
  attachmentName?: string
  status: ComplaintStatus
  raisedAt: string
  /** NBBL-mandated turn-around-time deadline. */
  slaDueAt: string
  resolution?: string
  timeline: ComplaintTimelineEntry[]
}

/** NBBL-published complaint reasons. */
export const COMPLAINT_REASONS = [
  "Amount debited but bill not paid",
  "Amount debited twice for the same bill",
  "Transaction pending for a long time",
  "Bill paid but biller has not updated the account",
  "Incorrect amount debited",
  "Refund not received for a failed transaction",
  "Wrong bill details fetched",
  "Others",
] as const

export type ComplaintReason = (typeof COMPLAINT_REASONS)[number]
