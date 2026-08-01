import { BHARAT_CONNECT_CATEGORIES } from "@/lib/brand"
import { calculateCcf, findBiller } from "./billers"
import type {
  BharatConnectTxn,
  Biller,
  Complaint,
  ComplaintStatus,
  FetchedBill,
  PaymentMode,
  TxnStatus,
} from "./types"

/**
 * Bharat Connect service layer.
 *
 * Every function here is the single seam between the UI and the Bharat Connect
 * APIs. While the NBBL certification is pending these run against deterministic
 * UAT fixtures; wiring the live gateway means replacing the bodies with HTTP
 * calls to the Go backend, with no UI changes.
 */

// ---------------------------------------------------------------- identifiers

const ALPHANUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

/**
 * Bharat Connect reference ID: 12-character alphanumeric, as issued by NBBL and
 * quoted by customers when raising complaints. Generated locally for UAT only —
 * in production this value comes verbatim from the NBBL payment response.
 */
export function generateBharatConnectTxnId(): string {
  let out = ""
  for (let i = 0; i < 12; i++) {
    out += ALPHANUM[Math.floor(Math.random() * ALPHANUM.length)]
  }
  return out
}

/** Our own agent-side reference, sent to NBBL as the agent transaction ID. */
export function generatePartnerTxnId(): string {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, "")
  const rand = Math.floor(100000 + Math.random() * 900000)
  return `UPBC${stamp}${rand}`
}

export function generateApprovalRef(): string {
  return String(Math.floor(100000000000 + Math.random() * 899999999999))
}

export function generateComplaintRefId(): string {
  return `CMP${Date.now().toString().slice(-9)}${Math.floor(10 + Math.random() * 89)}`
}

// ------------------------------------------------------------------ constants

/** Agent institution details registered with NBBL, shown on receipts. */
export const AGENT_PROFILE = {
  agentId: "UP01AGT0000123",
  agentInstitutionId: "UP01",
  outletName: "Shree Sai Digital Seva Kendra",
  retailerId: "ret-1",
  retailerName: "Rohit Sharma",
} as const

export function categoryName(slug: string): string {
  return BHARAT_CONNECT_CATEGORIES.find((c) => c.slug === slug)?.name ?? slug
}

// ---------------------------------------------------------------- bill fetch

const CUSTOMER_NAMES = [
  "RAHUL SHARMA", "PRIYA VERMA", "AMIT GUPTA", "SUNITA PATEL", "VIKAS KUMAR",
  "NEHA SINGH", "RAJESH IYER", "POOJA DESAI", "ANIL MEHTA", "KAVITA JOSHI",
]

/** Deterministic hash so the same account always fetches the same bill. */
function hash(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}

export interface FetchBillRequest {
  billerId: string
  params: Record<string, string>
}

export class BillFetchError extends Error {
  /** NBBL response code, surfaced to the retailer for support calls. */
  readonly code: string

  // The field is declared and assigned explicitly rather than via a constructor
  // parameter property, which this project's tsconfig disallows
  // (erasableSyntaxOnly).
  constructor(message: string, code: string) {
    super(message)
    this.name = "BillFetchError"
    this.code = code
  }
}

export async function fetchBill({ billerId, params }: FetchBillRequest): Promise<FetchedBill> {
  const biller = findBiller(billerId)
  if (!biller) throw new BillFetchError("Biller not found in the Bharat Connect biller master", "BC-404")
  if (biller.fetchRequirement === "NOT_SUPPORTED") {
    throw new BillFetchError("This biller does not support bill fetch. Use quick pay instead.", "BC-ERR-FETCH-NA")
  }

  await delay(900)

  const seed = hash(billerId + Object.values(params).join("|"))

  // A stable ~7% of accounts have no dues, which exercises the "no bill due"
  // path that NPCI asks to be demonstrated during UAT.
  if (seed % 14 === 0) {
    throw new BillFetchError("No outstanding bill found for this account", "BC-ERR-NO-DUE")
  }

  const billAmount = Math.round((((seed % 4800) + 180) + (seed % 97) / 100) * 100) / 100
  const billDate = new Date()
  billDate.setDate(billDate.getDate() - (seed % 18) - 2)
  const dueDate = new Date(billDate)
  dueDate.setDate(dueDate.getDate() + 21)

  const periodEnd = new Date(billDate)
  const periodStart = new Date(billDate)
  periodStart.setMonth(periodStart.getMonth() - 1)

  return {
    customerName: CUSTOMER_NAMES[seed % CUSTOMER_NAMES.length],
    billNumber: `${String(seed).slice(0, 6)}${String(seed % 9999).padStart(4, "0")}`,
    billDate: billDate.toISOString(),
    billDueDate: dueDate.toISOString(),
    billPeriod: `${shortMonth(periodStart)} - ${shortMonth(periodEnd)}`,
    billAmount,
    status: "DUE",
    additionalInfo: buildAdditionalInfo(biller, seed),
  }
}

function shortMonth(d: Date) {
  return d.toLocaleString("en-IN", { month: "short", year: "numeric" })
}

function buildAdditionalInfo(biller: Biller, seed: number) {
  switch (biller.categorySlug) {
    case "electricity":
      return [
        { name: "Units Consumed", value: String((seed % 420) + 40) },
        { name: "Meter Number", value: String(seed).slice(0, 9) },
        { name: "Load Sanctioned", value: `${(seed % 6) + 1} kW` },
      ]
    case "gas":
    case "water":
      return [
        { name: "Previous Reading", value: String((seed % 9000) + 1000) },
        { name: "Current Reading", value: String((seed % 9000) + 1000 + ((seed % 90) + 10)) },
      ]
    case "mobile-postpaid":
    case "broadband":
    case "landline":
      return [
        { name: "Plan Name", value: `Unlimited ${(seed % 4) * 100 + 399}` },
        { name: "Bill Cycle", value: `${(seed % 26) + 1} of every month` },
      ]
    case "insurance":
      return [
        { name: "Premium Frequency", value: ["Monthly", "Quarterly", "Half-Yearly", "Yearly"][seed % 4] },
        { name: "Policy Status", value: "In Force" },
      ]
    case "loan-emi":
      return [
        { name: "EMI Number", value: `${(seed % 48) + 1} of 60` },
        { name: "Outstanding Principal", value: `₹${((seed % 400000) + 20000).toLocaleString("en-IN")}` },
      ]
    case "credit-card":
      return [
        { name: "Total Amount Due", value: `₹${((seed % 40000) + 1000).toLocaleString("en-IN")}` },
        { name: "Minimum Amount Due", value: `₹${((seed % 4000) + 200).toLocaleString("en-IN")}` },
      ]
    default:
      return undefined
  }
}

// --------------------------------------------------------------- commissions

/**
 * Retailer commission slab. Mirrors the backend commission engine so the
 * amount shown before payment always matches what is credited afterwards.
 */
const COMMISSION_SLABS: Record<string, { type: "flat" | "percent"; value: number; cap?: number }> = {
  electricity: { type: "percent", value: 0.35, cap: 12 },
  water: { type: "flat", value: 3 },
  gas: { type: "flat", value: 4 },
  "lpg-cylinder": { type: "flat", value: 5 },
  broadband: { type: "percent", value: 0.6, cap: 20 },
  landline: { type: "percent", value: 0.5, cap: 15 },
  "mobile-postpaid": { type: "percent", value: 0.5, cap: 15 },
  fastag: { type: "flat", value: 3 },
  insurance: { type: "percent", value: 0.4, cap: 25 },
  "loan-emi": { type: "flat", value: 6 },
  "municipal-taxes": { type: "flat", value: 5 },
  "municipal-services": { type: "flat", value: 4 },
  "education-fees": { type: "flat", value: 6 },
  "housing-society": { type: "flat", value: 4 },
  "cable-tv": { type: "percent", value: 0.5, cap: 10 },
  subscription: { type: "percent", value: 0.5, cap: 10 },
  hospital: { type: "flat", value: 5 },
  "credit-card": { type: "flat", value: 4 },
  "clubs-associations": { type: "flat", value: 4 },
  rental: { type: "percent", value: 0.3, cap: 20 },
}

export function calculateCommission(categorySlug: string, amount: number): number {
  const slab = COMMISSION_SLABS[categorySlug] ?? { type: "flat" as const, value: 2 }
  if (slab.type === "flat") return slab.value
  const raw = (amount * slab.value) / 100
  return Math.round((slab.cap ? Math.min(raw, slab.cap) : raw) * 100) / 100
}

export { calculateCcf }

// ------------------------------------------------------------------- payment

export interface PayBillRequest {
  biller: Biller
  params: Record<string, string>
  customerName: string
  customerMobile: string
  billNumber: string
  billDate: string
  billDueDate: string
  amount: number
  paymentMode: PaymentMode
  /** Idempotency key. Replaying the same key never charges twice. */
  partnerTxnId: string
}

export class PaymentError extends Error {
  /** NBBL response code, surfaced to the retailer for support calls. */
  readonly code: string

  constructor(message: string, code: string) {
    super(message)
    this.name = "PaymentError"
    this.code = code
  }
}

export async function payBill(req: PayBillRequest): Promise<BharatConnectTxn> {
  const existing = getTxnByPartnerTxnId(req.partnerTxnId)
  if (existing) return existing

  await delay(1400)

  const ccf = calculateCcf(req.biller, req.amount)
  const commission = calculateCommission(req.biller.categorySlug, req.amount)
  const status: TxnStatus = "success"

  const txn: BharatConnectTxn = {
    id: `bctx-${Date.now()}`,
    bharatConnectTxnId: generateBharatConnectTxnId(),
    partnerTxnId: req.partnerTxnId,
    approvalRefNumber: generateApprovalRef(),
    billerId: req.biller.id,
    billerName: req.biller.name,
    categorySlug: req.biller.categorySlug,
    categoryName: categoryName(req.biller.categorySlug),
    params: req.params,
    customerName: req.customerName,
    customerMobile: req.customerMobile,
    billNumber: req.billNumber,
    billDate: req.billDate,
    billDueDate: req.billDueDate,
    billAmount: req.amount,
    ccf,
    commission,
    totalAmount: Math.round((req.amount + ccf) * 100) / 100,
    paymentMode: req.paymentMode,
    status,
    transactedAt: new Date().toISOString(),
    retailerId: AGENT_PROFILE.retailerId,
    retailerName: AGENT_PROFILE.retailerName,
    agentId: AGENT_PROFILE.agentId,
    complaintIds: [],
  }

  saveTxn(txn)
  rememberBiller(req.biller.id)
  return txn
}

// ------------------------------------------------------- transaction storage

const TXN_KEY = "up-bc-txns"
const RECENT_BILLERS_KEY = "up-bc-recent-billers"
const COMPLAINT_KEY = "up-bc-complaints"

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage full or unavailable — non-fatal */
  }
}

let seededOnce = false

/** UAT demo transactions, generated once and then persisted. */
function seedTxns(): BharatConnectTxn[] {
  const seeds: BharatConnectTxn[] = []
  const pool = [
    "MSEDCL00000MAH01", "ADANIELE0000MUM01", "TATAPOWE0000DEL01", "MAHANAGA0000MUM01",
    "AIRTELPO0000NAT01", "JIOFIBER0000NAT01", "LICOFIND0000NAT01", "ICICIFAS0000NAT01",
    "DELHIJAL0000DEL01", "BAJAJFIN0000NAT01", "BMCPROPT0000MUM01", "HDFCCRED0000NAT01",
    "INDANEGA0000IND01", "TATAPLAY0000NAT01", "DELHIUNI0000DEL01",
  ]
  const statuses: TxnStatus[] = [
    "success", "success", "success", "success", "success", "success",
    "success", "success", "pending", "failed", "refunded",
  ]

  for (let i = 0; i < 42; i++) {
    const biller = findBiller(pool[i % pool.length])!
    const seed = hash(`seed-${i}-${biller.id}`)
    const amount = Math.round((((seed % 4200) + 210) + (seed % 91) / 100) * 100) / 100
    const ccf = calculateCcf(biller, amount)
    const at = new Date()
    at.setDate(at.getDate() - (i % 62))
    at.setHours(9 + (seed % 11), seed % 60, seed % 60, 0)
    const status = statuses[seed % statuses.length]

    seeds.push({
      id: `bctx-seed-${i}`,
      bharatConnectTxnId: seededRefId(seed),
      partnerTxnId: `UPBC${at.toISOString().slice(2, 10).replace(/-/g, "")}${100000 + (seed % 899999)}`,
      approvalRefNumber: String(100000000000 + (seed % 899999999999)),
      billerId: biller.id,
      billerName: biller.name,
      categorySlug: biller.categorySlug,
      categoryName: categoryName(biller.categorySlug),
      params: { [biller.params[0].key]: String(400000000000 + (seed % 599999999999)).slice(0, biller.params[0].maxLength ?? 12) },
      customerName: CUSTOMER_NAMES[seed % CUSTOMER_NAMES.length],
      customerMobile: `9${String(800000000 + (seed % 199999999))}`,
      billNumber: `${String(seed).slice(0, 6)}${String(seed % 9999).padStart(4, "0")}`,
      billDate: new Date(at.getTime() - 12 * 864e5).toISOString(),
      billDueDate: new Date(at.getTime() + 9 * 864e5).toISOString(),
      billAmount: amount,
      ccf,
      commission: calculateCommission(biller.categorySlug, amount),
      totalAmount: Math.round((amount + ccf) * 100) / 100,
      paymentMode: (["Wallet", "Cash", "UPI"] as PaymentMode[])[seed % 3],
      status,
      transactedAt: at.toISOString(),
      retailerId: AGENT_PROFILE.retailerId,
      retailerName: AGENT_PROFILE.retailerName,
      agentId: AGENT_PROFILE.agentId,
      complaintIds: [],
    })
  }
  return seeds
}

function seededRefId(seed: number): string {
  let out = ""
  let s = seed
  for (let i = 0; i < 12; i++) {
    out += ALPHANUM[s % ALPHANUM.length]
    s = Math.floor(s / 7) + 31
  }
  return out
}

export function listTxns(): BharatConnectTxn[] {
  let txns = readJson<BharatConnectTxn[]>(TXN_KEY, [])
  if (txns.length === 0 && !seededOnce) {
    seededOnce = true
    txns = seedTxns()
    writeJson(TXN_KEY, txns)
  }
  return txns.sort((a, b) => +new Date(b.transactedAt) - +new Date(a.transactedAt))
}

function saveTxn(txn: BharatConnectTxn) {
  const txns = readJson<BharatConnectTxn[]>(TXN_KEY, listTxns())
  writeJson(TXN_KEY, [txn, ...txns.filter((t) => t.id !== txn.id)])
}

export function getTxn(id: string): BharatConnectTxn | undefined {
  return listTxns().find((t) => t.id === id || t.bharatConnectTxnId === id || t.partnerTxnId === id)
}

function getTxnByPartnerTxnId(partnerTxnId: string): BharatConnectTxn | undefined {
  return listTxns().find((t) => t.partnerTxnId === partnerTxnId)
}

/** Search method 1 mandated by NPCI: Bharat Connect / partner reference ID. */
export function findTxnByRefId(refId: string): BharatConnectTxn | undefined {
  const q = refId.trim().toUpperCase()
  if (!q) return undefined
  return listTxns().find(
    (t) =>
      t.bharatConnectTxnId.toUpperCase() === q ||
      t.partnerTxnId.toUpperCase() === q ||
      t.approvalRefNumber === q
  )
}

/** Search method 2 mandated by NPCI: mobile number + transaction date. */
export function findTxnsByMobileAndDate(mobile: string, isoDate: string): BharatConnectTxn[] {
  const m = mobile.trim()
  if (!m) return []
  return listTxns().filter((t) => {
    if (t.customerMobile !== m) return false
    if (!isoDate) return true
    return t.transactedAt.slice(0, 10) === isoDate
  })
}

// ------------------------------------------------------------ recent billers

export function recentBillerIds(): string[] {
  return readJson<string[]>(RECENT_BILLERS_KEY, [])
}

export function rememberBiller(billerId: string) {
  const next = [billerId, ...recentBillerIds().filter((id) => id !== billerId)].slice(0, 8)
  writeJson(RECENT_BILLERS_KEY, next)
}

// ---------------------------------------------------------------- complaints

export interface RaiseComplaintRequest {
  bharatConnectTxnId?: string
  lookupMethod: "txn-ref" | "mobile-date"
  customerMobile: string
  reason: string
  description: string
  attachmentName?: string
}

export async function raiseComplaint(req: RaiseComplaintRequest): Promise<Complaint> {
  await delay(800)

  const now = new Date()
  const sla = new Date(now)
  // NBBL turn-around-time for transaction complaints is T+5 calendar days.
  sla.setDate(sla.getDate() + 5)

  const complaint: Complaint = {
    id: `cmp-${Date.now()}`,
    complaintRefId: generateComplaintRefId(),
    type: req.bharatConnectTxnId ? "Transaction" : "Service",
    bharatConnectTxnId: req.bharatConnectTxnId,
    lookupMethod: req.lookupMethod,
    customerMobile: req.customerMobile,
    reason: req.reason,
    description: req.description,
    attachmentName: req.attachmentName,
    status: "Open",
    raisedAt: now.toISOString(),
    slaDueAt: sla.toISOString(),
    timeline: [
      {
        at: now.toISOString(),
        status: "Open",
        note: "Complaint registered with Bharat Connect and assigned a reference ID.",
        by: "Bharat Connect",
      },
    ],
  }

  const all = readJson<Complaint[]>(COMPLAINT_KEY, [])
  writeJson(COMPLAINT_KEY, [complaint, ...all])
  return complaint
}

export function listComplaints(): Complaint[] {
  const stored = readJson<Complaint[]>(COMPLAINT_KEY, [])
  if (stored.length > 0) return stored
  const seeds = seedComplaints()
  writeJson(COMPLAINT_KEY, seeds)
  return seeds
}

export function getComplaint(idOrRef: string): Complaint | undefined {
  return listComplaints().find((c) => c.id === idOrRef || c.complaintRefId === idOrRef)
}

function seedComplaints(): Complaint[] {
  const txns = listTxns()
  const disputed = txns.filter((t) => t.status !== "success").slice(0, 3)
  const reasons = [
    "Amount debited but bill not paid",
    "Transaction pending for a long time",
    "Refund not received for a failed transaction",
  ]
  const statuses: ComplaintStatus[] = ["Resolved", "In Progress", "Open"]

  return disputed.map((t, i) => {
    const raised = new Date(t.transactedAt)
    raised.setHours(raised.getHours() + 3)
    const sla = new Date(raised)
    sla.setDate(sla.getDate() + 5)

    const timeline = [
      {
        at: raised.toISOString(),
        status: "Open" as ComplaintStatus,
        note: "Complaint registered with Bharat Connect and assigned a reference ID.",
        by: "Bharat Connect",
      },
    ]
    if (i < 2) {
      const picked = new Date(raised)
      picked.setHours(picked.getHours() + 6)
      timeline.push({
        at: picked.toISOString(),
        status: "In Progress" as ComplaintStatus,
        note: "Complaint forwarded to the biller for verification.",
        by: "Biller Operations",
      })
    }
    if (i === 0) {
      const closed = new Date(raised)
      closed.setDate(closed.getDate() + 2)
      timeline.push({
        at: closed.toISOString(),
        status: "Resolved" as ComplaintStatus,
        note: "Biller confirmed the payment was posted. Receipt re-issued to the customer.",
        by: "Biller Operations",
      })
    }

    return {
      id: `cmp-seed-${i}`,
      complaintRefId: `CMP${String(700000000 + i * 1237).slice(0, 9)}${10 + i}`,
      type: "Transaction" as const,
      bharatConnectTxnId: t.bharatConnectTxnId,
      lookupMethod: (i % 2 === 0 ? "txn-ref" : "mobile-date") as "txn-ref" | "mobile-date",
      customerMobile: t.customerMobile,
      reason: reasons[i % reasons.length],
      description:
        "Customer reports the amount was debited at the outlet but the biller account still shows the bill as unpaid.",
      status: statuses[i % statuses.length],
      raisedAt: raised.toISOString(),
      slaDueAt: sla.toISOString(),
      resolution:
        statuses[i % statuses.length] === "Resolved"
          ? "Payment confirmed as posted by the biller. No further action required."
          : undefined,
      timeline,
    }
  })
}

// ---------------------------------------------------------------- SMS receipt

/**
 * SMS receipt sent to the customer after a successful payment.
 *
 * Kept within a single 160-character GSM-7 segment where possible and carries
 * the Bharat Connect reference ID, as required by the NPCI SMS receipt spec.
 */
export function buildSmsReceipt(txn: BharatConnectTxn): string {
  const amount = txn.totalAmount.toFixed(2)
  const when = new Date(txn.transactedAt).toLocaleString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
  return [
    `Bharat Connect: Rs.${amount} paid to ${txn.billerName}.`,
    `BC Txn ID ${txn.bharatConnectTxnId}.`,
    `Ref ${txn.partnerTxnId}.`,
    `${when}. Status ${txn.status.toUpperCase()}.`,
    `Paid at ${AGENT_PROFILE.outletName}. -UtilityPay`,
  ].join(" ")
}

export function smsSegments(message: string): number {
  return Math.max(1, Math.ceil(message.length / 160))
}

// --------------------------------------------------------------------- utils

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms))
}
