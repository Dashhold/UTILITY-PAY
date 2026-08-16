import * as React from "react"
import { cn } from "@/lib/utils"
import {
  BHARAT_CONNECT,
  BRAND_ASSETS,
  LOCKUP_ASPECT,
  LOCKUP_GEOMETRY,
  MNEMONIC_ASPECT,
} from "@/lib/brand"

const ALT_LOCKUP = `${BHARAT_CONNECT.name} logo`
const ALT_MNEMONIC = `${BHARAT_CONNECT.name} B mnemonic`

type LogoSize = "xs" | "sm" | "md" | "lg" | "xl"

/** Rendered height of the trimmed artwork, in px, per size token. */
const LOCKUP_HEIGHT: Record<LogoSize, number> = {
  xs: 16,
  sm: 20,
  md: 34,
  lg: 42,
  xl: 56,
}

const MNEMONIC_HEIGHT: Record<LogoSize, number> = {
  xs: 20,
  sm: 28,
  md: 52,
  lg: 64,
  xl: 92,
}

/**
 * The official lockup PNG ships with padding around the artwork. Both variants
 * below scale the full bitmap up and window it to the exact content bounding
 * box, so the artwork itself is never stretched, recoloured or re-proportioned.
 */
function croppedLockupStyle(
  box: { x: number; y: number; width: number; height: number },
  renderedHeight: number
): React.CSSProperties {
  const scale = renderedHeight / box.height
  return {
    width: box.width * scale,
    height: renderedHeight,
    backgroundImage: `url(${BRAND_ASSETS.logoLockup})`,
    backgroundRepeat: "no-repeat",
    backgroundSize: `${LOCKUP_GEOMETRY.width * scale}px ${LOCKUP_GEOMETRY.height * scale}px`,
    backgroundPosition: `-${box.x * scale}px -${box.y * scale}px`,
  }
}

export interface BharatConnectLogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: LogoSize
  /** Override the rendered artwork height in px, ignoring `size`. */
  height?: number
}

/**
 * Full Bharat Connect horizontal lockup (B mnemonic + wordmark).
 *
 * NPCI mandates this mark in the **top-right** of every Bharat Connect screen —
 * use `BharatConnectBrandBar` for that placement.
 */
export function BharatConnectLogo({
  size = "md",
  height,
  className,
  ...props
}: BharatConnectLogoProps) {
  const h = height ?? LOCKUP_HEIGHT[size]
  return (
    <div
      role="img"
      aria-label={ALT_LOCKUP}
      title={ALT_LOCKUP}
      className={cn("shrink-0", className)}
      style={{ ...croppedLockupStyle(LOCKUP_GEOMETRY.content, h), aspectRatio: LOCKUP_ASPECT }}
      {...props}
    />
  )
}

/**
 * Standalone Bharat Connect **B mnemonic**, mandated on the homepage.
 *
 * Prefers the official standalone asset at `BRAND_ASSETS.mnemonic`. If that
 * file has not been added to /public/brand yet, it falls back to windowing the
 * mnemonic out of the official lockup using its exact bounding box, which keeps
 * the colours and proportions identical to the official artwork.
 */
export function BharatConnectMnemonic({
  size = "md",
  height,
  className,
  ...props
}: BharatConnectLogoProps) {
  const [hasStandalone, setHasStandalone] = React.useState<boolean | null>(null)
  const h = height ?? MNEMONIC_HEIGHT[size]

  React.useEffect(() => {
    let cancelled = false
    const probe = new Image()
    probe.onload = () => !cancelled && setHasStandalone(true)
    probe.onerror = () => !cancelled && setHasStandalone(false)
    probe.src = BRAND_ASSETS.mnemonic
    return () => {
      cancelled = true
    }
  }, [])

  if (hasStandalone) {
    return (
      <img
        src={BRAND_ASSETS.mnemonic}
        alt={ALT_MNEMONIC}
        className={cn("shrink-0 object-contain", className)}
        style={{ height: h, width: "auto" }}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={ALT_MNEMONIC}
      title={ALT_MNEMONIC}
      className={cn("shrink-0", className)}
      style={{ ...croppedLockupStyle(LOCKUP_GEOMETRY.mnemonic, h), aspectRatio: MNEMONIC_ASPECT }}
      {...props}
    />
  )
}

export interface BharatConnectBrandBarProps {
  /** Optional caption rendered above the mark, e.g. "Powered by". */
  label?: string
  size?: LogoSize
  className?: string
}

/**
 * Top-right Bharat Connect brand mark.
 *
 * Mandatory on the Category, Biller Selection, Bill Fetch, Payment, Receipt,
 * Complaint Registration and Transaction History screens.
 */
export function BharatConnectBrandBar({
  label = "Powered by",
  size = "md",
  className,
}: BharatConnectBrandBarProps) {
  return (
    <div className={cn("flex shrink-0 flex-col items-end gap-1.5", className)}>
      {label && (
        <span className="whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-gray-500">
          {label}
        </span>
      )}
      <BharatConnectLogo size={size} />
    </div>
  )
}
