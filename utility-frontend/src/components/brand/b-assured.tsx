import * as React from "react"
import { cn } from "@/lib/utils"
import { BRAND_ASSETS, BRAND_COLORS } from "@/lib/brand"

const ALT = "B Assured — Bharat Connect"

type AssuredSize = "sm" | "md" | "lg"

const HEIGHT: Record<AssuredSize, number> = { sm: 28, md: 44, lg: 64 }

export interface BAssuredMarkProps {
  size?: AssuredSize
  height?: number
  className?: string
}

/**
 * Official **B-Assured** trust mark.
 *
 * NPCI mandates this mark on the Payment Successful screen (displayed
 * simultaneously with the sonic branding clip) and on the Payment Receipt.
 *
 * The official artwork is not redistributable, so it is loaded from
 * `/public/brand/b-assured.png`. Until that file is added a clearly-marked
 * placeholder renders in its place — see /public/brand/README.md.
 */
export function BAssuredMark({ size = "md", height, className }: BAssuredMarkProps) {
  const [state, setState] = React.useState<"loading" | "ok" | "missing">("loading")
  const h = height ?? HEIGHT[size]

  React.useEffect(() => {
    let cancelled = false
    const probe = new Image()
    probe.onload = () => !cancelled && setState("ok")
    probe.onerror = () => {
      if (cancelled) return
      setState("missing")
      console.warn(
        `[brand] Official B-Assured mark missing at ${BRAND_ASSETS.assured}. ` +
          "This is mandatory for NPCI Bharat Connect compliance — see /public/brand/README.md."
      )
    }
    probe.src = BRAND_ASSETS.assured
    return () => {
      cancelled = true
    }
  }, [])

  if (state === "loading") {
    return <div className={cn("shrink-0", className)} style={{ height: h, width: h * 2.2 }} />
  }

  if (state === "ok") {
    return (
      <img
        src={BRAND_ASSETS.assured}
        alt={ALT}
        className={cn("shrink-0 object-contain", className)}
        style={{ height: h, width: "auto" }}
      />
    )
  }

  return (
    <div
      role="img"
      aria-label={ALT}
      title="Placeholder — add the official B-Assured mark to /public/brand/b-assured.png"
      data-brand-placeholder="b-assured"
      className={cn(
        "flex shrink-0 items-center gap-2 rounded-md border border-dashed px-3",
        className
      )}
      style={{ height: h, borderColor: BRAND_COLORS.blue }}
    >
      <span
        className="flex items-center justify-center rounded-md font-bold text-white"
        style={{
          background: BRAND_COLORS.blue,
          height: h * 0.62,
          width: h * 0.62,
          fontSize: h * 0.4,
        }}
      >
        B
      </span>
      <span
        className="font-semibold leading-none"
        style={{ color: BRAND_COLORS.orange, fontSize: h * 0.32 }}
      >
        Assured
      </span>
    </div>
  )
}
