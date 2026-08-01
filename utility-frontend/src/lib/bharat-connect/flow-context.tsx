import * as React from "react"
import { findBiller } from "./billers"
import { generatePartnerTxnId } from "./service"
import type { Biller, FetchedBill, PaymentMode } from "./types"

/**
 * State for the Bharat Connect payment journey.
 *
 * NPCI requires each stage of the journey (category, biller selection, bill
 * fetch, payment, success, receipt) to be a distinct screen, so the journey
 * spans several routes. State is mirrored into sessionStorage to survive
 * reloads and direct navigation while a payment is in progress.
 */
export interface BharatConnectFlowState {
  categorySlug: string | null
  billerId: string | null
  params: Record<string, string>
  bill: FetchedBill | null
  /** Amount the retailer is paying — may differ from `bill.billAmount` for part-pay/adhoc billers. */
  amount: number | null
  customerMobile: string
  paymentMode: PaymentMode
  /** Idempotency key for the payment call, minted once per journey. */
  partnerTxnId: string | null
  /**
   * Server-side reference for the fetched bill.
   *
   * Payment quotes this so the backend validates the amount against what the
   * biller actually returned. Without it a tampered client could pay less than
   * the bill while displaying the full figure to the customer.
   */
  fetchRef: string | null
  /** Customer name from the bill fetch, used as the remitter name on payment. */
  customerName: string
}

const EMPTY: BharatConnectFlowState = {
  categorySlug: null,
  billerId: null,
  params: {},
  bill: null,
  amount: null,
  customerMobile: "",
  paymentMode: "Wallet",
  partnerTxnId: null,
  fetchRef: null,
  customerName: "",
}

interface BharatConnectFlowValue extends BharatConnectFlowState {
  biller: Biller | null
  selectCategory: (slug: string) => void
  selectBiller: (billerId: string) => void
  setParams: (params: Record<string, string>) => void
  setBill: (bill: FetchedBill | null) => void
  setAmount: (amount: number | null) => void
  setCustomerMobile: (mobile: string) => void
  setPaymentMode: (mode: PaymentMode) => void
  setFetchRef: (ref: string | null) => void
  setCustomerName: (name: string) => void
  /** Mints the idempotency key if absent and returns it. */
  ensurePartnerTxnId: () => string
  reset: () => void
}

const STORAGE_KEY = "up-bc-flow"

const FlowContext = React.createContext<BharatConnectFlowValue | null>(null)

function load(): BharatConnectFlowState {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    return raw ? { ...EMPTY, ...(JSON.parse(raw) as BharatConnectFlowState) } : EMPTY
  } catch {
    return EMPTY
  }
}

export function BharatConnectFlowProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<BharatConnectFlowState>(load)

  React.useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      /* non-fatal */
    }
  }, [state])

  const patch = React.useCallback((next: Partial<BharatConnectFlowState>) => {
    setState((prev) => ({ ...prev, ...next }))
  }, [])

  const value = React.useMemo<BharatConnectFlowValue>(
    () => ({
      ...state,
      biller: state.billerId ? findBiller(state.billerId) ?? null : null,

      selectCategory: (slug) =>
        patch({ categorySlug: slug, billerId: null, params: {}, bill: null, amount: null, partnerTxnId: null, fetchRef: null, customerName: "" }),

      selectBiller: (billerId) => {
        const biller = findBiller(billerId)
        patch({
          billerId,
          categorySlug: biller?.categorySlug ?? state.categorySlug,
          params: {},
          bill: null,
          amount: null,
          partnerTxnId: null,
          // A new biller invalidates any previously fetched bill, so its
          // reference must not survive: paying against a stale ref would submit
          // the wrong biller's amount.
          fetchRef: null,
          customerName: "",
        })
      },

      setParams: (params) => patch({ params }),
      setBill: (bill) =>
        patch({
          bill,
          amount: bill?.billAmount ?? null,
          // The biller's own customer name is carried forward as the remitter
          // name, so the retailer does not retype it and risk a mismatch.
          customerName: bill?.customerName ?? state.customerName,
        }),
      setAmount: (amount) => patch({ amount }),
      setCustomerMobile: (customerMobile) => patch({ customerMobile }),
      setPaymentMode: (paymentMode) => patch({ paymentMode }),
      setFetchRef: (fetchRef) => patch({ fetchRef }),
      setCustomerName: (customerName) => patch({ customerName }),

      ensurePartnerTxnId: () => {
        if (state.partnerTxnId) return state.partnerTxnId
        const id = generatePartnerTxnId()
        patch({ partnerTxnId: id })
        return id
      },

      reset: () => {
        setState(EMPTY)
        try {
          window.sessionStorage.removeItem(STORAGE_KEY)
        } catch {
          /* non-fatal */
        }
      },
    }),
    [state, patch]
  )

  return <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
}

export function useBharatConnectFlow() {
  const ctx = React.useContext(FlowContext)
  if (!ctx) throw new Error("useBharatConnectFlow must be used within BharatConnectFlowProvider")
  return ctx
}
