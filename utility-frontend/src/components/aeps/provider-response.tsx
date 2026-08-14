import * as React from "react"
import { ChevronDown, ChevronRight, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import type { ProviderResponse } from "@/lib/api-types"

/**
 * Shows the AEPS provider's response body verbatim.
 *
 * The provider requires evidence of the exact request and response for every
 * endpoint before UAT sign-off, and their rejection messages carry detail that
 * no summarised UI state preserves. It is collapsed by default so it informs a
 * support conversation without cluttering the retailer's normal flow.
 */
export function ProviderResponsePanel({
  response,
  label = "Provider response",
  defaultOpen = false,
}: {
  response: ProviderResponse
  label?: string
  /** Errors are worth expanding immediately; successes are not. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = React.useState(defaultOpen)

  // A missing body is not an empty one: there is nothing to show, and an empty
  // panel would suggest the provider answered with nothing.
  if (response === null || response === undefined) return null

  const formatted =
    typeof response === "string" ? response : JSON.stringify(response, null, 2)

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted)
      toast.success("Response copied")
    } catch {
      // Clipboard access is denied in some browsers and contexts. The text is
      // already selectable, so this is a convenience rather than the only route.
      toast.error("Could not copy. Select the text and copy manually.")
    }
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-2 bg-gray-50/60 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 hover:text-gray-900"
          aria-expanded={open}
        >
          {open ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
          {label}
        </button>

        {open && (
          <Button type="button" variant="ghost" size="sm" onClick={copy} className="h-7 gap-1.5 px-2">
            <Copy className="size-3.5" /> Copy
          </Button>
        )}
      </div>

      {open && (
        <pre className="max-h-72 overflow-auto border-t border-gray-100 bg-gray-950 p-3 text-[11px] leading-relaxed text-gray-100">
          {formatted}
        </pre>
      )}
    </div>
  )
}
