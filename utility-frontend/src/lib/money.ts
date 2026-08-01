/**
 * Money handling for the frontend.
 *
 * The backend serialises money as a decimal string from PostgreSQL NUMERIC(18,2).
 * Parsing that into a JavaScript number is lossy for large values and invites
 * float artefacts, so display goes through formatMoney and any arithmetic that
 * matters is done on the backend. The helpers here exist for the few places the
 * UI genuinely needs a numeric value: chart series and client-side range checks.
 */

import type { MoneyString } from "./api-types"

const INR = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const INR_COMPACT = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
})

/**
 * Formats a money value for display, e.g. "₹1,25,050.50".
 *
 * Accepts the string the API returns, a number, null or undefined, so a caller
 * never has to guard before formatting.
 */
export function formatMoney(value: MoneyString | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return "—"
  return INR.format(n)
}

/** Formats without paise, for dense dashboard tiles. */
export function formatMoneyCompact(value: MoneyString | number | null | undefined): string {
  const n = toNumber(value)
  if (n === null) return "—"
  return INR_COMPACT.format(n)
}

/**
 * Converts a money value to a number for charts and comparisons.
 *
 * Returns null rather than NaN or 0 for unparseable input, so a missing value is
 * distinguishable from a genuine zero.
 */
export function toNumber(value: MoneyString | number | null | undefined): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === "number") return Number.isFinite(value) ? value : null

  const trimmed = value.trim()
  if (trimmed === "") return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) ? parsed : null
}

/** Converts to a number, falling back to 0. For chart series where a gap would break rendering. */
export function toNumberOrZero(value: MoneyString | number | null | undefined): number {
  return toNumber(value) ?? 0
}

/**
 * Normalises user input into the decimal string the API expects.
 *
 * Strips grouping separators and currency symbols, and clamps to two decimal
 * places, because the backend column is NUMERIC(18,2) and would reject or round
 * anything finer.
 */
export function toMoneyString(input: string): string {
  const cleaned = input.replace(/[₹,\s]/g, "")
  if (cleaned === "" || cleaned === "." || !/^\d*\.?\d*$/.test(cleaned)) return ""

  const [whole, fraction] = cleaned.split(".")
  if (fraction === undefined) return whole || "0"
  return `${whole || "0"}.${fraction.slice(0, 2)}`
}

/** Reports whether a string is a valid positive money amount. */
export function isPositiveAmount(input: string): boolean {
  const n = toNumber(toMoneyString(input))
  return n !== null && n > 0
}

/** Formats a plain count with Indian digit grouping. */
export function formatCount(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return new Intl.NumberFormat("en-IN").format(value)
}

/** Formats a percentage from a 0-100 value. */
export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—"
  return `${value.toFixed(digits)}%`
}

/**
 * Computes a success rate, returning null when there is nothing to rate.
 *
 * Returning null rather than 0 matters: a retailer with no transactions has no
 * success rate, and showing "0%" would read as total failure.
 */
export function successRate(success: number, total: number): number | null {
  if (total <= 0) return null
  return (success / total) * 100
}
