import * as React from "react"
import { cn } from "@/lib/utils"

export interface DetailRowProps {
  label: string
  value: React.ReactNode
  /** Tabular-numeral rendering for IDs and amounts. */
  mono?: boolean
  emphasis?: boolean
  className?: string
}

/** Label/value row used on bill fetch, payment, success and receipt screens. */
export function DetailRow({ label, value, mono, emphasis, className }: DetailRowProps) {
  return (
    <div className={cn("flex items-start justify-between gap-4 py-1.5", className)}>
      <span className={cn("shrink-0 text-xs", emphasis ? "font-medium text-gray-700" : "text-gray-500")}>
        {label}
      </span>
      <span
        className={cn(
          "text-right text-sm",
          mono && "table-num",
          emphasis ? "font-semibold text-gray-900" : "font-medium text-gray-800"
        )}
      >
        {value}
      </span>
    </div>
  )
}
