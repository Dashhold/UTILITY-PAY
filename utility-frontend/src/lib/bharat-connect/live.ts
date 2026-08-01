/**
 * Live Bharat Connect adapter.
 *
 * The screens under pages/bharat-connect were built against the mock service in
 * ./service.ts. This module implements the same operations against the real
 * backend and translates between the API contracts and the NBBL-shaped domain
 * types in ./types.ts, so the compliance screens work unchanged.
 *
 * Two deliberate choices:
 *
 *   - Money is a decimal *string* on the wire but a number in these domain
 *     types. Conversion happens here, in one place, at the boundary.
 *   - Transaction lookups are backed by a cache that syncTxns() refreshes from
 *     the server. This preserves the synchronous lookup signatures the screens
 *     already use while the underlying data is real, rather than forcing an
 *     async rewrite of every screen.
 */

import { api, ApiError } from "@/lib/api"
import type { Receipt, Transaction } from "@/lib/api-types"
import { toNumberOrZero } from "@/lib/money"
import { findBiller } from "./billers"
import type { BharatConnectTxn, FetchedBill, PaymentMode, TxnStatus } from "./types"

/** Thrown when a bill fetch fails. Mirrors the mock service's error shape. */
export class LiveFetchError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = "LiveFetchError"
    this.code = code
  }
}

/** Thrown when a payment fails outright. */
export class LivePaymentError extends Error {
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = "LivePaymentError"
    this.code = code
  }
}

/**
 * A fetched bill plus the server-side reference that authorises payment.
 *
 * The reference matters: payment quotes it so the backend enforces the biller's
 * amount instead of trusting whatever the form submits.
 */
export interface LiveFetchedBill extends FetchedBill {
  requestRef: string
  acceptPayment: boolean
  acceptPartPay: boolean
  expiresAt: string
}

/** Fetches a bill from the biller via the backend. */
export async function fetchBillLive(
  billerId: string,
  params: Record<string, string>,
): Promise<LiveFetchedBill> {
  // The biller declares which input identifies the account; the first non-empty
  // value is the connection number.
  const connection = Object.values(params).find((v) => v && v.trim() !== "")
  if (!connection) {
    throw new LiveFetchError("Enter the customer's account details", "BC-ERR-NO-PARAMS")
  }

  try {
    const bill = await api.bharatConnect.viewBill({
      connection: connection.trim(),
      operatorId: billerId,
      circleId: params.circleId ?? "",
      adParams: params,
    })

    return {
      customerName: bill.customerName || "",
      billNumber: bill.billNumber || connection.trim(),
      billDate: bill.billDate ?? "",
      billDueDate: bill.dueDate ?? "",
      billAmount: toNumberOrZero(bill.billAmount),
      status: bill.acceptPayment ? "DUE" : "NOT_AVAILABLE",
      requestRef: bill.requestRef,
      acceptPayment: bill.acceptPayment,
      acceptPartPay: bill.acceptPartPay,
      expiresAt: bill.expiresAt,
    }
  } catch (err) {
    if (err instanceof ApiError) {
      // The provider's message explains whether the account is unknown, has no
      // dues, or the biller is unreachable. A generic message would hide that.
      throw new LiveFetchError(err.message, err.code)
    }
    throw new LiveFetchError("Could not fetch the bill", "BC-ERR-UNKNOWN")
  }
}

export interface LivePayRequest {
  requestRef?: string
  billerId: string
  billerName: string
  categorySlug: string
  connection: string
  amount: number
  customerMobile: string
  customerName: string
  paymentMode: PaymentMode
  paymentAccountInfo?: string
  /** Reused across retries of one attempt so a resubmit cannot pay twice. */
  idempotencyKey: string
}

/** Submits a payment and returns the resulting transaction. */
export async function payBillLive(req: LivePayRequest): Promise<BharatConnectTxn> {
  try {
    const receipt = await api.bharatConnect.pay(
      {
        requestRef: req.requestRef,
        connection: req.connection,
        operatorId: req.billerId,
        amount: req.amount.toFixed(2),
        customerMobile: req.customerMobile,
        remitterName: req.customerName,
        paymentMode: mapPaymentMode(req.paymentMode),
        paymentAccountInfo: req.paymentAccountInfo,
        category: "BBPS",
        billerName: req.billerName,
      },
      req.idempotencyKey,
    )

    const txn = receiptToTxn(receipt, req)
    cacheTxn(txn)
    return txn
  } catch (err) {
    if (err instanceof ApiError) {
      throw new LivePaymentError(err.message, err.code)
    }
    throw new LivePaymentError("The payment could not be completed", "BC-ERR-UNKNOWN")
  }
}

/**
 * Maps our domain payment mode to the provider's vocabulary.
 *
 * The provider accepts a fixed set (Cash, Credit Card, Debit Card, Internet
 * Banking, UPI, Wallet); sending anything else is rejected.
 */
function mapPaymentMode(mode: PaymentMode): string {
  switch (mode) {
    case "Card":
      return "Debit Card"
    case "Account Transfer":
      return "Internet Banking"
    case "Wallet":
    case "Cash":
    case "UPI":
      return mode
    default:
      return "Cash"
  }
}

/** Polls a pending transaction's current state. */
export async function refreshTxnStatus(txnId: string): Promise<BharatConnectTxn | null> {
  try {
    const receipt = await api.bharatConnect.status(txnId)
    const existing = getCachedTxn(txnId)
    const merged = receiptToTxn(receipt, undefined, existing)
    cacheTxn(merged)
    return merged
  } catch {
    // A failed poll leaves the cached state untouched; the caller retries.
    return null
  }
}

// ------------------------------------------------------------------ cache

const CACHE_KEY = "up-bc-txns"

function readCache(): BharatConnectTxn[] {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as BharatConnectTxn[]) : []
  } catch {
    // Corrupt cache is discarded rather than crashing a screen.
    return []
  }
}

function writeCache(txns: BharatConnectTxn[]) {
  try {
    // Bounded so the cache cannot grow without limit on a busy counter.
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(txns.slice(0, 500)))
  } catch {
    /* storage unavailable or full — non-fatal, the server remains the source */
  }
}

function cacheTxn(txn: BharatConnectTxn) {
  const existing = readCache().filter((t) => t.id !== txn.id && t.partnerTxnId !== txn.partnerTxnId)
  writeCache([txn, ...existing])
}

function getCachedTxn(txnId: string): BharatConnectTxn | undefined {
  return readCache().find((t) => t.id === txnId || t.partnerTxnId === txnId)
}

/**
 * Refreshes the cache from the server.
 *
 * Screens call this before reading, which keeps the synchronous lookups below
 * honest without making every screen async.
 */
export async function syncTxns(): Promise<BharatConnectTxn[]> {
  try {
    const page = await api.bharatConnect.transactions({ pageSize: 200 })
    const mapped = page.items.map(transactionToTxn)
    writeCache(mapped)
    return mapped
  } catch {
    // Offline or unauthorised: fall back to what is cached so history still
    // renders rather than showing an empty screen.
    return readCache()
  }
}

/** All known transactions, newest first. Call syncTxns() first for fresh data. */
export function listTxnsLive(): BharatConnectTxn[] {
  return readCache()
}

export function getTxnLive(txnId: string): BharatConnectTxn | undefined {
  return getCachedTxn(txnId)
}

/** Finds a transaction by any of its three references. */
export function findTxnByRefLive(ref: string): BharatConnectTxn | undefined {
  const needle = ref.trim().toLowerCase()
  if (needle === "") return undefined

  return readCache().find(
    (t) =>
      t.bharatConnectTxnId.toLowerCase() === needle ||
      t.partnerTxnId.toLowerCase() === needle ||
      t.approvalRefNumber.toLowerCase() === needle,
  )
}

/** Finds transactions by customer mobile on a given date. */
export function findTxnsByMobileAndDateLive(mobile: string, isoDate: string): BharatConnectTxn[] {
  const target = isoDate.slice(0, 10)
  return readCache().filter(
    (t) => t.customerMobile === mobile.trim() && t.transactedAt.slice(0, 10) === target,
  )
}

/** Server-side search by reference, for records not in the local cache. */
export async function searchByReference(reference: string): Promise<BharatConnectTxn[]> {
  try {
    const page = await api.bharatConnect.transactions({ reference: reference.trim(), pageSize: 50 })
    return page.items.map(transactionToTxn)
  } catch {
    return []
  }
}

/** Server-side search by mobile and date range. */
export async function searchByMobileAndDate(
  mobile: string,
  from: string,
  to: string,
): Promise<BharatConnectTxn[]> {
  try {
    const page = await api.bharatConnect.transactions({
      mobile: mobile.trim(),
      from,
      to,
      pageSize: 100,
    })
    return page.items.map(transactionToTxn)
  } catch {
    return []
  }
}

// ------------------------------------------------------------------ mapping

/** Maps an API transaction onto the NBBL-shaped domain type. */
function transactionToTxn(t: Transaction): BharatConnectTxn {
  const meta = (t.metadata ?? {}) as Record<string, string>
  const biller = findBiller(String(meta.operatorId ?? ""))

  return {
    id: t.txnId,
    bharatConnectTxnId: t.bharatConnectTxnId ?? "",
    partnerTxnId: t.txnId,
    approvalRefNumber: t.providerTxnId ?? t.providerRef ?? "",

    billerId: String(meta.operatorId ?? ""),
    billerName: t.service,
    categorySlug: biller?.categorySlug ?? slugify(t.category),
    categoryName: t.category,

    params: { connection: String(meta.connection ?? "") },

    customerName: String(meta.remitterName ?? ""),
    customerMobile: String(meta.customerMobile ?? ""),

    billNumber: String(meta.connection ?? ""),
    billDate: "",
    billDueDate: "",

    billAmount: toNumberOrZero(t.amount),
    ccf: toNumberOrZero(t.ccf),
    commission: toNumberOrZero(t.commission),
    totalAmount: toNumberOrZero(t.amount) + toNumberOrZero(t.ccf),

    paymentMode: (t.mode as PaymentMode) ?? "Cash",
    status: mapStatus(t.status),
    transactedAt: t.createdAt,

    retailerId: t.retailerId,
    retailerName: t.retailer,
    agentId: "",

    complaintIds: [],
  }
}

/** Maps a payment receipt onto the domain type, preserving known request context. */
function receiptToTxn(
  receipt: Receipt,
  req?: LivePayRequest,
  existing?: BharatConnectTxn,
): BharatConnectTxn {
  const meta = (receipt.metadata ?? {}) as Record<string, string>

  return {
    id: receipt.txnId,
    bharatConnectTxnId: receipt.bharatConnectTxnId ?? existing?.bharatConnectTxnId ?? "",
    partnerTxnId: receipt.txnId,
    approvalRefNumber: receipt.providerTxnId ?? receipt.providerRef ?? existing?.approvalRefNumber ?? "",

    billerId: req?.billerId ?? existing?.billerId ?? String(meta.operatorId ?? ""),
    billerName: req?.billerName ?? receipt.service,
    categorySlug: req?.categorySlug ?? existing?.categorySlug ?? slugify(receipt.category),
    categoryName: receipt.category,

    params: { connection: req?.connection ?? String(meta.connection ?? "") },

    customerName: req?.customerName ?? existing?.customerName ?? String(meta.remitterName ?? ""),
    customerMobile: req?.customerMobile ?? existing?.customerMobile ?? String(meta.customerMobile ?? ""),

    billNumber: req?.connection ?? existing?.billNumber ?? "",
    billDate: existing?.billDate ?? "",
    billDueDate: existing?.billDueDate ?? "",

    billAmount: toNumberOrZero(receipt.amount),
    ccf: toNumberOrZero(receipt.ccf),
    commission: toNumberOrZero(receipt.commission),
    totalAmount: toNumberOrZero(receipt.amount) + toNumberOrZero(receipt.ccf),

    paymentMode: req?.paymentMode ?? (receipt.mode as PaymentMode) ?? "Cash",
    status: mapStatus(receipt.status),
    transactedAt: receipt.createdAt,

    retailerId: existing?.retailerId ?? "",
    retailerName: existing?.retailerName ?? "",
    agentId: existing?.agentId ?? "",

    complaintIds: existing?.complaintIds ?? [],
  }
}

/**
 * Maps API status onto the domain status.
 *
 * "processing" collapses to "pending": both mean unresolved, and the domain type
 * has no separate processing state. Treating it as anything else risks showing a
 * customer a settled outcome for a transaction still in flight.
 */
function mapStatus(status: string): TxnStatus {
  switch (status) {
    case "success":
      return "success"
    case "failed":
      return "failed"
    case "refunded":
      return "refunded"
    default:
      return "pending"
  }
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
}
