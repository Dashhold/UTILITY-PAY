/**
 * API client for the UtiliPay backend.
 *
 * Every network call goes through this module so token storage, transparent
 * refresh-on-401 and error shaping exist in exactly one place.
 */

import type {
  AdminDashboard,
  AdminLedgerEntry,
  AepsBankListResult,
  AepsCapabilities,
  AepsMerchantKycResult,
  AepsOnboardResult,
  AepsOnboardStatusResult,
  AepsTwoFactorResult,
  Announcement,
  Biller,
  BillerCategory,
  CommissionReport,
  CommissionSlot,
  CompanyBank,
  ComplaintTargets,
  Circle,
  FetchedBill,
  FundRequest,
  GSTReport,
  IntegrationCapabilities,
  KycApplication,
  KycDocument,
  LoginHistoryEntry,
  MoneyString,
  PaymentModeOption,
  ProductOrder,
  Receipt,
  RechargePlan,
  ReconciliationSummary,
  RetailerDashboard,
  RetailerProfile,
  RetailerSummary,
  ServiceReportRow,
  Settlement,
  TDSReport,
  Transaction,
  ValidationResult,
  WalletLedgerEntry,
} from "./api-types"
import type { Role } from "./types"

/**
 * Where the API lives.
 *
 * An empty VITE_API_URL means same-origin, which is how production runs: nginx
 * serves the app and proxies /api to the backend on the same host, so there is no
 * cross-origin request and therefore no CORS preflight. Only set an absolute URL
 * when the API is genuinely on another origin.
 */
const rawApiUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? ""
const BASE_URL = rawApiUrl.trim().replace(/\/$/, "")

const ACCESS_TOKEN_KEY = "up-access-token"
const REFRESH_TOKEN_KEY = "up-refresh-token"
const USER_KEY = "up-auth"

interface Envelope<T> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    fields?: Record<string, string>
    /** Extra failure context, e.g. an upstream provider's verbatim response. */
    details?: Record<string, unknown>
  }
  meta?: {
    page: number
    pageSize: number
    total: number
    totalPages: number
    /** Endpoint-specific aggregates covering the whole filtered set. */
    extra?: Record<string, unknown>
  }
}

export interface SessionUser {
  id: string
  name: string
  email: string
  phone?: string
  role: Role
  retailerId?: string
  shopName?: string
  kycStatus?: string
}

export interface Session {
  accessToken: string
  refreshToken: string
  expiresAt: string
  user: SessionUser
}

/** Response including pagination metadata. */
export interface Paginated<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/**
 * Error thrown by every failed request.
 *
 * It carries the backend's stable error code so callers branch on the cause
 * rather than pattern-matching a message.
 */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly fields?: Record<string, string>
  /**
   * Extra context the backend attached to the failure.
   *
   * Upstream rejections put the provider's verbatim response body here under
   * `providerResponse`, which is what a provider's UAT evidence is read from.
   */
  readonly details?: Record<string, unknown>

  constructor(
    status: number,
    code: string,
    message: string,
    fields?: Record<string, string>,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.fields = fields
    this.details = details
  }

  /** The provider's raw response body, when the backend supplied one. */
  get providerResponse(): unknown {
    return this.details?.providerResponse
  }

  get isAuthError() {
    return this.status === 401
  }

  /** True when the upstream provider is unreachable or the feature is not live. */
  get isUnavailable() {
    return this.status === 503 || this.code === "SERVICE_UNAVAILABLE"
  }

  /** True when the provider rejected the request. */
  get isUpstreamError() {
    return this.status === 502 || this.code === "UPSTREAM_ERROR"
  }

  get isInsufficientBalance() {
    return this.code === "INSUFFICIENT_BALANCE"
  }
}

// --- token storage ---

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_TOKEN_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_TOKEN_KEY),
  getUser: (): SessionUser | null => {
    const raw = localStorage.getItem(USER_KEY)
    if (!raw) return null
    try {
      return JSON.parse(raw) as SessionUser
    } catch {
      // Corrupt storage should log the user out cleanly, not crash the app.
      return null
    }
  },
  save: (session: Session) => {
    localStorage.setItem(ACCESS_TOKEN_KEY, session.accessToken)
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken)
    localStorage.setItem(USER_KEY, JSON.stringify(session.user))
  },
  clear: () => {
    localStorage.removeItem(ACCESS_TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  },
}

// --- refresh coordination ---

/**
 * A single in-flight refresh shared by all callers.
 *
 * The backend rotates refresh tokens on use, so several concurrent 401s each
 * triggering their own refresh would leave all but one holding a revoked token
 * and log the user out spuriously.
 */
let refreshInFlight: Promise<string | null> | null = null
let onSessionExpired: (() => void) | null = null

export function setSessionExpiredHandler(handler: () => void) {
  onSessionExpired = handler
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight

  refreshInFlight = (async () => {
    const refreshToken = tokenStore.getRefresh()
    if (!refreshToken) return null

    try {
      const res = await fetch(`${BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      })
      const body: Envelope<Session> = await res.json()
      if (!res.ok || !body.success || !body.data) return null

      tokenStore.save(body.data)
      return body.data.accessToken
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()

  return refreshInFlight
}

// --- core request ---

/**
 * Query parameters.
 *
 * Typed as a plain object rather than Record<string, ...> because TypeScript
 * does not consider a named interface assignable to an index-signature type, and
 * every filter type in this file is a named interface. Values are narrowed and
 * stringified in buildUrl, so nothing untyped reaches the URL.
 */
type QueryParams = object

interface RequestOptions extends Omit<RequestInit, "body"> {
  body?: unknown
  /**
   * A body passed through untouched, for FormData uploads.
   *
   * Kept separate from `body` so the JSON path can keep unconditionally
   * stringifying and setting Content-Type, which FormData must not have.
   */
  rawBody?: FormData | Blob
  query?: QueryParams
  /** Set for endpoints that must not attach a token. */
  skipAuth?: boolean
  /** Makes a retried submission idempotent server-side. */
  idempotencyKey?: string
  /** Internal guard so a retried request cannot recurse. */
  _isRetry?: boolean
}

function buildUrl(path: string, query?: QueryParams): string {
  if (!query) return `${BASE_URL}${path}`

  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    // Empty and nullish values are dropped so a cleared filter does not become
    // a literal "?status=" that the backend would treat as a real filter.
    if (value === undefined || value === null || value === "") continue

    // Only primitives belong in a query string; anything else is a caller error
    // and is skipped rather than stringified into "[object Object]".
    if (typeof value === "object") continue

    params.set(key, String(value))
  }
  const qs = params.toString()
  return `${BASE_URL}${path}${qs ? `?${qs}` : ""}`
}

async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<Envelope<T>> {
  const { body, rawBody, query, skipAuth, idempotencyKey, _isRetry, headers, ...rest } = options

  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  }
  // Only the JSON path declares a content type. FormData must be left alone so
  // the browser can generate the multipart boundary.
  if (body !== undefined) finalHeaders["Content-Type"] = "application/json"
  if (idempotencyKey) finalHeaders["Idempotency-Key"] = idempotencyKey
  if (!skipAuth) {
    const token = tokenStore.getAccess()
    if (token) finalHeaders.Authorization = `Bearer ${token}`
  }

  let res: Response
  try {
    res = await fetch(buildUrl(path, query), {
      ...rest,
      headers: finalHeaders,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    })
  } catch {
    // A transport failure is distinct from a rejected request. It must not be
    // reported as a server error, because for a submission the request may or
    // may not have been received.
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.")
  }

  if (res.status === 204) return { success: true }

  let envelope: Envelope<T>
  try {
    envelope = await res.json()
  } catch {
    throw new ApiError(res.status, "INVALID_RESPONSE", "The server returned an unreadable response.")
  }

  if (res.ok && envelope.success) return envelope

  if (res.status === 401 && !skipAuth && !_isRetry) {
    const newToken = await refreshAccessToken()
    if (newToken) return rawRequest<T>(path, { ...options, _isRetry: true })
    tokenStore.clear()
    onSessionExpired?.()
  }

  throw new ApiError(
    res.status,
    envelope.error?.code ?? "UNKNOWN_ERROR",
    envelope.error?.message ?? "Something went wrong.",
    envelope.error?.fields,
    envelope.error?.details,
  )
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const envelope = await rawRequest<T>(path, options)
  return envelope.data as T
}

/**
 * Fetches a binary response as an object URL.
 *
 * File endpoints require the bearer token, so their bytes cannot be pulled by an
 * <img src> or an <iframe src> directly. This retries once through the refresh
 * path for the same reason JSON requests do, otherwise a preview opened on a
 * stale token would fail while every other call on the page succeeded.
 *
 * The caller owns the returned URL and must revoke it.
 */
async function fetchBlobUrl(path: string, isRetry = false): Promise<string> {
  const token = tokenStore.getAccess()

  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    })
  } catch {
    throw new ApiError(0, "NETWORK_ERROR", "Cannot reach the server. Check your connection and try again.")
  }

  if (res.status === 401 && !isRetry) {
    const refreshed = await refreshAccessToken()
    if (refreshed) return fetchBlobUrl(path, true)
    tokenStore.clear()
    onSessionExpired?.()
  }

  if (!res.ok) {
    throw new ApiError(res.status, "FILE_ERROR", "That file could not be loaded.")
  }
  return URL.createObjectURL(await res.blob())
}

async function requestPaginated<T>(path: string, options: RequestOptions = {}): Promise<Paginated<T>> {
  const envelope = await rawRequest<T[]>(path, options)
  return {
    items: envelope.data ?? [],
    page: envelope.meta?.page ?? 1,
    pageSize: envelope.meta?.pageSize ?? 25,
    total: envelope.meta?.total ?? 0,
    totalPages: envelope.meta?.totalPages ?? 0,
  }
}

/** A paginated response that also carries whole-set aggregates. */
export interface PaginatedWithExtra<T, E> extends Paginated<T> {
  extra: E | null
}

async function requestPaginatedWithExtra<T, E>(
  path: string,
  options: RequestOptions = {},
): Promise<PaginatedWithExtra<T, E>> {
  const envelope = await rawRequest<T[]>(path, options)
  return {
    items: envelope.data ?? [],
    page: envelope.meta?.page ?? 1,
    pageSize: envelope.meta?.pageSize ?? 25,
    total: envelope.meta?.total ?? 0,
    totalPages: envelope.meta?.totalPages ?? 0,
    extra: (envelope.meta?.extra as E | undefined) ?? null,
  }
}

/** Common list filters. */
export interface ListParams {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  from?: string
  to?: string
}

// --- endpoints ---

export const api = {
  auth: {
    register: (body: {
      name: string
      email: string
      mobile: string
      shopName: string
      city: string
      state: string
      password: string
    }) =>
      request<{ message: string }>("/api/v1/auth/register", { method: "POST", body, skipAuth: true }),

    login: (email: string, password: string) =>
      request<Session>("/api/v1/auth/login", { method: "POST", body: { email, password }, skipAuth: true }),

    logout: async () => {
      const refreshToken = tokenStore.getRefresh()
      try {
        await request("/api/v1/auth/logout", { method: "POST", body: { refreshToken }, skipAuth: true })
      } finally {
        // Local state clears even if the revoke fails, so the user is never left
        // appearing signed in after choosing to sign out.
        tokenStore.clear()
      }
    },

    logoutAll: () => request<{ message: string }>("/api/v1/auth/logout-all", { method: "POST" }),
    me: () => request<SessionUser>("/api/v1/auth/me"),
    changePassword: (currentPassword: string, newPassword: string) =>
      request<{ message: string }>("/api/v1/auth/change-password", {
        method: "POST",
        body: { currentPassword, newPassword },
      }),
  },

  retailer: {
    dashboard: () => request<RetailerDashboard>("/api/v1/retailer/dashboard"),
    profile: () => request<RetailerProfile>("/api/v1/retailer/profile"),
    updateProfile: (patch: Partial<RetailerProfile>) =>
      request<RetailerProfile>("/api/v1/retailer/profile", { method: "PUT", body: patch }),

    walletBalance: () => request<{ balance: string }>("/api/v1/retailer/wallet/balance"),
    walletLedger: (params?: ListParams & { reason?: string; direction?: string }) =>
      requestPaginated<WalletLedgerEntry>("/api/v1/retailer/wallet/ledger", { query: params }),

    loginHistory: (limit = 50) =>
      request<LoginHistoryEntry[]>("/api/v1/retailer/login-history", { query: { limit } }),

    serviceAvailability: () => request<IntegrationCapabilities>("/api/v1/retailer/services/availability"),

    fundRequests: (params?: ListParams) =>
      requestPaginated<FundRequest>("/api/v1/retailer/fund-requests", { query: params }),
    createFundRequest: (body: {
      amount: string
      mode: string
      bank?: string
      utr?: string
      depositDate?: string
      remarks?: string
      companyBankId?: string
    }) => request<FundRequest>("/api/v1/retailer/fund-requests", { method: "POST", body }),

    companyBanks: () => request<CompanyBank[]>("/api/v1/retailer/company-banks"),
  },

  kyc: {
    application: () => request<KycApplication>("/api/v1/retailer/kyc"),

    saveProgress: (body: { currentStep?: number; pan?: string; gstin?: string; aadhaar?: string }) =>
      request<KycApplication>("/api/v1/retailer/kyc", { method: "PUT", body }),

    /**
     * Uploads one document.
     *
     * Sent as multipart rather than through the JSON helper: base64 in a JSON
     * body inflates the payload by a third and would need a matching decode path
     * on the server for no benefit.
     */
    uploadDocument: async (docType: string, file: File, docNumber?: string) => {
      const form = new FormData()
      form.append("docType", docType)
      form.append("file", file)
      if (docNumber) form.append("docNumber", docNumber)

      // Content-Type is deliberately unset so the browser adds the multipart
      // boundary; setting it by hand produces a body the server cannot parse.
      return request<KycDocument>("/api/v1/retailer/kyc/documents", {
        method: "POST",
        rawBody: form,
      })
    },

    deleteDocument: (id: string) =>
      request<void>(`/api/v1/retailer/kyc/documents/${id}`, { method: "DELETE" }),

    submit: () => request<KycApplication>("/api/v1/retailer/kyc/submit", { method: "POST" }),

    /**
     * Fetches a document as a blob URL.
     *
     * The file endpoint requires the bearer token, so it cannot be used directly
     * as an <img src>; the bytes are fetched here and handed over as an object URL.
     * Callers must revoke the URL when done.
     */
    documentPreviewUrl: (id: string) => fetchBlobUrl(`/api/v1/retailer/kyc/documents/${id}/file`),
  },

  aeps: {
    capabilities: () => request<AepsCapabilities>("/api/v1/retailer/aeps/capabilities"),

    /**
     * The provider's sponsor bank list.
     *
     * Needs no merchant context, which makes it the integration's connectivity
     * check as well as the source of the IIN every transactional call keys on.
     */
    banks: () => request<AepsBankListResult>("/api/v1/retailer/aeps/banks"),

    onboard: () => request<AepsOnboardResult>("/api/v1/retailer/aeps/onboard", { method: "POST" }),

    /**
     * Asks the provider whether merchant KYC has completed.
     *
     * A POST because it is authoritative and updates the stored onboarding
     * state; the browser callback is unauthenticated and only ever a hint.
     */
    onboardStatus: () =>
      request<AepsOnboardStatusResult>("/api/v1/retailer/aeps/onboard/status", { method: "POST" }),

    /** Provider-side merchant activation with the retailer's own biometric. */
    merchantKyc: (body: {
      aadhaar: string
      pidData: string
      /** The retailer's date of birth as YYYY-MM-DD. */
      dob: string
      latitude?: string
      longitude?: string
    }) => request<AepsMerchantKycResult>("/api/v1/retailer/aeps/merchant-kyc", { method: "POST", body }),

    /** One-time merchant biometric registration. */
    register: (body: {
      aadhaar: string
      pidData: string
      latitude?: string
      longitude?: string
    }) => request<AepsTwoFactorResult>("/api/v1/retailer/aeps/register", { method: "POST", body }),

    /**
     * The day's merchant two-factor authentication.
     *
     * NPCI requires the retailer to re-authenticate with their own biometric
     * before transacting for customers. The returned merAuthTxnId must be quoted
     * on every subsequent cash withdrawal.
     */
    merchantAuth: (body: {
      aadhaar: string
      pidData: string
      latitude?: string
      longitude?: string
    }) => request<AepsTwoFactorResult>("/api/v1/retailer/aeps/merchant-auth", { method: "POST", body }),

    transact: (
      body: {
        operation: "cash_withdrawal" | "balance_enquiry" | "mini_statement" | "aadhaar_pay"
        customerAadhaar: string
        customerMobile: string
        bankIin: string
        bankName?: string
        amount?: string
        pidData: string
        /** Required for cash withdrawal: the reference from merchantAuth. */
        merAuthTxnId?: string
        latitude?: string
        longitude?: string
      },
      idempotencyKey?: string,
    ) => request<Receipt>("/api/v1/retailer/aeps/transact", { method: "POST", body, idempotencyKey }),

    transactions: (params?: ListParams & { reference?: string }) =>
      requestPaginated<Transaction>("/api/v1/retailer/aeps/transactions", { query: params }),

    settlements: () => request<Settlement[]>("/api/v1/retailer/aeps/settlements"),
  },

  bharatConnect: {
    categories: () => request<BillerCategory[]>("/api/v1/retailer/bharat-connect/categories"),
    billers: (params?: { category?: string; search?: string }) =>
      request<Biller[]>("/api/v1/retailer/bharat-connect/billers", { query: params }),
    circles: () => request<Circle[]>("/api/v1/retailer/bharat-connect/circles"),
    paymentModes: () => request<PaymentModeOption[]>("/api/v1/retailer/bharat-connect/payment-modes"),
    plans: (operatorId: string, circleId: string, planType?: string) =>
      request<RechargePlan[]>("/api/v1/retailer/bharat-connect/plans", {
        query: { operatorId, circleId, planType },
      }),

    validate: (body: {
      amount: string
      connection: string
      operatorId: string
      circleId?: string
      planCode?: string
      adParams?: Record<string, string>
    }) => request<ValidationResult>("/api/v1/retailer/bharat-connect/validate", { method: "POST", body }),

    viewBill: (body: {
      connection: string
      operatorId: string
      circleId?: string
      adParams?: Record<string, string>
    }) => request<FetchedBill>("/api/v1/retailer/bharat-connect/view-bill", { method: "POST", body }),

    pay: (
      body: {
        requestRef?: string
        connection: string
        operatorId: string
        circleId?: string
        amount: string
        customerMobile: string
        remitterName: string
        paymentMode: string
        paymentRefId?: string
        paymentAccountInfo?: string
        category?: string
        billerName?: string
      },
      idempotencyKey?: string,
    ) => request<Receipt>("/api/v1/retailer/bharat-connect/pay", { method: "POST", body, idempotencyKey }),

    status: (txnId: string) => request<Receipt>(`/api/v1/retailer/bharat-connect/status/${txnId}`),
    receipt: (txnId: string) => request<Receipt>(`/api/v1/retailer/bharat-connect/receipt/${txnId}`),

    /** Supports both compliance-mandated lookup modes: mobile+date and reference. */
    transactions: (params?: ListParams & { reference?: string; mobile?: string; category?: string }) =>
      requestPaginated<Transaction>("/api/v1/retailer/bharat-connect/transactions", { query: params }),

    complaintTargets: () => request<ComplaintTargets>("/api/v1/retailer/bharat-connect/complaint-targets"),
  },

  reports: {
    transactions: (params?: ListParams & { category?: string; reference?: string; mobile?: string }) =>
      requestPaginated<Transaction>("/api/v1/retailer/reports/transactions", { query: params }),
    /** Per-service activity for the signed-in retailer, including failures. */
    service: (params?: { from?: string; to?: string }) =>
      request<ServiceReportRow[]>("/api/v1/retailer/reports/service", { query: params }),
    commissionSlab: () => request<CommissionSlot[]>("/api/v1/retailer/reports/commission-slab"),
    commission: (params?: { from?: string; to?: string }) =>
      request<CommissionReport>("/api/v1/retailer/reports/commission", { query: params }),
    gst: (params?: { from?: string; to?: string }) =>
      request<GSTReport>("/api/v1/retailer/reports/gst", { query: params }),
    tds: (params?: { from?: string; to?: string }) =>
      request<TDSReport>("/api/v1/retailer/reports/tds", { query: params }),
    accountHistory: (params?: ListParams) =>
      requestPaginated<WalletLedgerEntry>("/api/v1/retailer/reports/account-history", { query: params }),
  },

  admin: {
    dashboard: () => request<AdminDashboard>("/api/v1/admin/dashboard"),
    integrations: () => request<IntegrationCapabilities>("/api/v1/admin/integrations"),
    providerBalance: (memberId: string) =>
      request<{ balance: number; raw: string }>("/api/v1/admin/integrations/bharat-connect/balance", {
        query: { memberId },
      }),

    reconciliationSummary: () => request<ReconciliationSummary>("/api/v1/admin/reconciliation/summary"),
    uatBundle: (perSection = 3) => request<unknown>("/api/v1/admin/uat/bundle", { query: { perSection } }),
    uatCoverage: () => request<Record<string, number>>("/api/v1/admin/uat/coverage"),

    transactions: (params?: ListParams & { category?: string; reference?: string; mobile?: string }) =>
      requestPaginated<Transaction>("/api/v1/admin/transactions", { query: params }),
    serviceReport: (params?: { from?: string; to?: string }) =>
      request<ServiceReportRow[]>("/api/v1/admin/reports/service", { query: params }),

    /**
     * The platform-wide wallet ledger.
     *
     * Credit and debit totals cover the whole filtered set, not the page, so they
     * can be reconciled against a bank statement.
     */
    walletLedger: (params?: ListParams & { reason?: string; direction?: string }) =>
      requestPaginatedWithExtra<AdminLedgerEntry, { credits: MoneyString; debits: MoneyString }>(
        "/api/v1/admin/wallet/ledger",
        { query: params },
      ),

    retailerLoginHistory: (retailerId: string, limit = 50) =>
      request<LoginHistoryEntry[]>(`/api/v1/admin/retailers/${retailerId}/login-history`, {
        query: { limit },
      }),

    retailerKyc: (retailerId: string) =>
      request<KycApplication>(`/api/v1/admin/retailers/${retailerId}/kyc`),
    reviewKycDocument: (docId: string, status: "verified" | "rejected", remarks?: string) =>
      request<{ message: string }>(`/api/v1/admin/kyc/documents/${docId}`, {
        method: "PATCH",
        body: { status, remarks },
      }),
    kycDocumentPreviewUrl: (docId: string) => fetchBlobUrl(`/api/v1/admin/kyc/documents/${docId}/file`),

    retailers: (params?: ListParams & { kycStatus?: string; city?: string }) =>
      requestPaginated<RetailerSummary>("/api/v1/admin/retailers", { query: params }),
    retailer: (id: string) => request<RetailerProfile>(`/api/v1/admin/retailers/${id}`),
    retailerTransactions: (id: string, params?: ListParams) =>
      requestPaginated<Transaction>(`/api/v1/admin/retailers/${id}/transactions`, { query: params }),
    retailerLedger: (id: string, params?: ListParams) =>
      requestPaginated<WalletLedgerEntry>(`/api/v1/admin/retailers/${id}/ledger`, { query: params }),
    setRetailerStatus: (id: string, status: string) =>
      request<{ message: string }>(`/api/v1/admin/retailers/${id}/status`, { method: "PATCH", body: { status } }),
    setRetailerKyc: (id: string, status: string, reason?: string) =>
      request<{ message: string }>(`/api/v1/admin/retailers/${id}/kyc`, {
        method: "PATCH",
        body: { status, reason },
      }),
    completeAepsOnboarding: (id: string) =>
      request<{ message: string }>(`/api/v1/admin/retailers/${id}/aeps-complete`, { method: "POST" }),

    fundRequests: (params?: ListParams) =>
      requestPaginated<FundRequest>("/api/v1/admin/fund-requests", { query: params }),
    approveFundRequest: (id: string, note?: string) =>
      request<FundRequest>(`/api/v1/admin/fund-requests/${id}/approve`, { method: "POST", body: { note } }),
    rejectFundRequest: (id: string, reason: string) =>
      request<FundRequest>(`/api/v1/admin/fund-requests/${id}/reject`, { method: "POST", body: { reason } }),
    fundTransfer: (body: { fromRetailerId: string; toRetailerId: string; amount: string; narration?: string }) =>
      request<{ message: string }>("/api/v1/admin/fund-transfer", { method: "POST", body }),

    /** Manual wallet credit or debit. Recorded against the acting admin. */
    adjustWallet: (
      retailerId: string,
      body: { direction: "credit" | "debit"; amount: string; narration: string },
    ) =>
      request<WalletLedgerEntry>(`/api/v1/admin/retailers/${retailerId}/wallet-adjust`, {
        method: "POST",
        body,
      }),

    orders: (params?: ListParams) => requestPaginated<ProductOrder>("/api/v1/admin/orders", { query: params }),
    order: (id: string) => request<ProductOrder>(`/api/v1/admin/orders/${id}`),
    setOrderStatus: (id: string, body: { status: string; trackingNumber?: string; courier?: string }) =>
      request<ProductOrder>(`/api/v1/admin/orders/${id}/status`, { method: "PATCH", body }),

    setDefaultCompanyBank: (id: string) =>
      request<{ message: string }>(`/api/v1/admin/company-banks/${id}/default`, { method: "POST" }),

    /** Generic CRUD over any admin master-data resource. */
    master: <T>(resource: AdminMasterResource) => ({
      list: (params?: ListParams) => requestPaginated<T>(`/api/v1/admin/${resource}`, { query: params }),
      get: (id: string) => request<T>(`/api/v1/admin/${resource}/${id}`),
      create: (body: Partial<T>) => request<T>(`/api/v1/admin/${resource}`, { method: "POST", body }),
      update: (id: string, body: Record<string, unknown>) =>
        request<T>(`/api/v1/admin/${resource}/${id}`, { method: "PUT", body }),
      remove: (id: string) => request<void>(`/api/v1/admin/${resource}/${id}`, { method: "DELETE" }),
    }),
  },

  health: {
    ready: () =>
      request<{ status: string; database: string; integrations: Record<string, string> }>("/readyz", {
        skipAuth: true,
      }),
  },
}

/** The admin master-data resources exposed by the generic CRUD endpoints. */
export type AdminMasterResource =
  | "service-categories"
  | "cities"
  | "user-types"
  | "services"
  | "commission-plans"
  | "commission-slots"
  | "announcements"
  | "ticket-departments"
  | "company-banks"
  | "payout-banks"
  | "products"
  | "billers"

export { BASE_URL as apiBaseUrl }
export type { Announcement }
