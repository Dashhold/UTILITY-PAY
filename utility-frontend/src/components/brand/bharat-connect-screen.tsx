import * as React from "react"
import { Link } from "react-router-dom"
import { ArrowLeft, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BharatConnectBrandBar } from "@/components/brand/bharat-connect-logo"
import { cn } from "@/lib/utils"

/**
 * Standard chrome for every Bharat Connect screen.
 *
 * Guarantees the NPCI-mandated top-right placement of the Bharat Connect logo,
 * so no individual screen can accidentally ship without it.
 */
export interface BharatConnectScreenProps {
  title: string
  description?: string
  /** Rendered under the title, e.g. the flow stepper. */
  meta?: React.ReactNode
  backTo?: string
  backLabel?: string
  actions?: React.ReactNode
  /** Set to false only for print surfaces that carry the mark themselves. */
  showBrandMark?: boolean
  brandLabel?: string
  children: React.ReactNode
  className?: string
}

export function BharatConnectScreen({
  title,
  description,
  meta,
  backTo,
  backLabel = "Back",
  actions,
  showBrandMark = true,
  brandLabel,
  children,
  className,
}: BharatConnectScreenProps) {
  return (
    <div className={cn("flex flex-col gap-5", className)}>
      <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          {backTo && (
            <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-7 px-2 text-gray-500" asChild>
              <Link to={backTo}>
                <ArrowLeft className="size-3.5" /> {backLabel}
              </Link>
            </Button>
          )}
          <h1 className="truncate text-xl font-semibold tracking-tight text-gray-900">{title}</h1>
          {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
          {meta && <div className="mt-3">{meta}</div>}
        </div>

        {/* NPCI mandate: Bharat Connect logo on the top right of every screen. */}
        {showBrandMark && (
          <div className="flex shrink-0 items-start gap-4 self-start">
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
            <BharatConnectBrandBar label={brandLabel} />
          </div>
        )}
        {!showBrandMark && actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>

      {children}
    </div>
  )
}

export const JOURNEY_STEPS = [
  { key: "category", label: "Category" },
  { key: "biller", label: "Biller" },
  { key: "fetch", label: "Bill Details" },
  { key: "payment", label: "Payment" },
  { key: "receipt", label: "Receipt" },
] as const

export type JourneyStepKey = (typeof JOURNEY_STEPS)[number]["key"]

/** Progress indicator for the bill-payment journey. */
export function JourneyStepper({ current }: { current: JourneyStepKey }) {
  const currentIndex = JOURNEY_STEPS.findIndex((s) => s.key === current)

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2">
      {JOURNEY_STEPS.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                done && "bg-success-500 text-white",
                active && "bg-gray-900 text-white",
                !done && !active && "bg-gray-150 text-gray-500"
              )}
            >
              {done ? <Check className="size-3" strokeWidth={3} /> : i + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                active ? "text-gray-900" : done ? "text-gray-600" : "text-gray-400"
              )}
            >
              {step.label}
            </span>
            {i < JOURNEY_STEPS.length - 1 && (
              <span className={cn("h-px w-6", done ? "bg-success-500" : "bg-gray-200")} />
            )}
          </li>
        )
      })}
    </ol>
  )
}
