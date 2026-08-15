import * as React from "react"
import { api } from "@/lib/api"
import type { Biller as ApiBiller } from "@/lib/api-types"
import type { Biller, BillerParam } from "./types"

/**
 * Hook to fetch billers from the backend API.
 * 
 * Converts API biller format to the UI format expected by the Bharat Connect screens.
 */
export function useBillers(category?: string, search?: string) {
  const [billers, setBillers] = React.useState<Biller[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    async function fetchBillers() {
      try {
        setLoading(true)
        setError(null)
        const data = await api.bharatConnect.billers({ category, search })
        
        if (cancelled) return

        // Convert API billers to UI format
        const converted = data.map(apiToUiBiller)
        setBillers(converted)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Failed to load billers")
        setBillers([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchBillers()

    return () => {
      cancelled = true
    }
  }, [category, search])

  return { billers, loading, error }
}

/**
 * Converts API biller format to UI biller format.
 */
function apiToUiBiller(api: ApiBiller): Biller {
  // Extract category slug from category name (e.g., "Electricity" -> "electricity")
  const categorySlug = api.category.toLowerCase().replace(/\s+/g, "-")

  // Convert customerParams from API format to UI BillerParam format
  const params: BillerParam[] = api.customerParams
    ? Object.entries(api.customerParams).map(([key, config]: [string, any]) => ({
        key: key.toLowerCase().replace(/\s+/g, ""),
        label: key,
        type: config.type === "numeric" ? "number" : config.type === "alphanumeric" ? "text" : "text",
        minLength: config.minLength || 1,
        maxLength: config.maxLength || 50,
        pattern: config.type === "numeric" ? "^[0-9]+$" : undefined,
        placeholder: `Enter ${config.maxLength}-digit ${key.toLowerCase()}`,
        helpText: undefined,
      }))
    : []

  return {
    id: api.billerId,
    operatorId: api.operatorId,
    name: api.name,
    categorySlug,
    coverage: api.coverage || "National",
    fetchRequirement: api.supportsBillFetch ? "MANDATORY" : "NOT_SUPPORTED",
    amountExactness: api.partialPayAllowed ? "Approximate" : "Exact",
    supportsAdhoc: !api.supportsBillFetch,
    supportsPartPay: api.partialPayAllowed,
    ccf: { type: "flat", value: 0 }, // CCF is calculated server-side, no need to show separately
    params,
    popular: false, // Can be determined by usage stats later
    live: api.status === "active",
  }
}
