import type { Biller } from "./types"

/**
 * Bharat Connect UAT Test Billers
 *
 * IMPORTANT: This file previously contained extensive mock biller data.
 * All biller data now comes from the backend API via the useBillers hook.
 * 
 * After UAT approval, MobiKwik will provide the complete operator master file
 * with all production billers. All biller data should come from the API.
 * 
 * Reference: RT-Recharge API Documentation, page 8/33:
 * "For production system a separate Operator file with all details for 
 * additional params, paymodes, regex would be shared after UAT sign off"
 */

// Global biller cache populated by useBillers hook
let BILLER_CACHE: Biller[] = []

/**
 * Update the global biller cache. Called by useBillers hook.
 * @internal
 */
export function _updateBillerCache(billers: Biller[]): void {
  BILLER_CACHE = billers
}

/**
 * Get all billers from cache.
 * NOTE: Cache must be populated by useBillers hook first.
 */
export const BILLERS: Biller[] = []
export const LIVE_BILLERS: Biller[] = []

/**
 * Get billers by category from cache.
 */
export function billersByCategory(categorySlug: string): Biller[] {
  return BILLER_CACHE.filter((b) => b.categorySlug === categorySlug && b.live)
}

/**
 * Get popular billers from cache.
 */
export function popularBillers(categorySlug?: string): Biller[] {
  return BILLER_CACHE.filter((b) => b.popular && b.live && (!categorySlug || b.categorySlug === categorySlug))
}

/**
 * Find a biller by ID from cache.
 * NOTE: Cache must be populated by useBillers hook first.
 */
export function findBiller(id: string): Biller | undefined {
  return BILLER_CACHE.find((b) => b.id === id)
}

/**
 * Search billers by query from cache.
 */
export function searchBillers(query: string, categorySlug?: string): Biller[] {
  const q = query.trim().toLowerCase()
  const pool = categorySlug ? billersByCategory(categorySlug) : BILLER_CACHE.filter(b => b.live)
  if (!q) return pool
  return pool.filter(
    (b) =>
      b.name.toLowerCase().includes(q) ||
      b.coverage.toLowerCase().includes(q) ||
      b.id.toLowerCase().includes(q)
  )
}

/** Customer Convenience Fee for a given biller and bill amount. */
export function calculateCcf(biller: Biller, billAmount: number): number {
  const { type, value, cap } = biller.ccf
  if (type === "flat") return value
  const fee = (billAmount * value) / 100
  return Math.round((cap ? Math.min(fee, cap) : fee) * 100) / 100
}
