import * as React from "react"
import { useNavigate } from "react-router-dom"
import { ArrowRight, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { BharatConnectScreen, JourneyStepper } from "@/components/brand/bharat-connect-screen"
import { CategoryIcon } from "@/components/brand/category-icon"
import { BRAND_COLORS, LIVE_CATEGORIES } from "@/lib/brand"
import { billersByCategory } from "@/lib/bharat-connect/billers"
import { useBillers } from "@/lib/bharat-connect/use-billers"
import { useBharatConnectFlow } from "@/lib/bharat-connect/flow-context"

/**
 * Category screen — NPCI compliance screen 2.
 *
 * Mandate: Bharat Connect logo on the top right and all live categories visible.
 */
export function BharatConnectCategories() {
  const navigate = useNavigate()
  const { selectCategory } = useBharatConnectFlow()
  const [query, setQuery] = React.useState("")
  
  // Load all billers to populate cache (billersByCategory reads from cache)
  useBillers()

  const categories = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LIVE_CATEGORIES
    return LIVE_CATEGORIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.description.toLowerCase().includes(q)
    )
  }, [query])

  function open(slug: string) {
    selectCategory(slug)
    navigate(`/retailer/bharat-connect/billers/${slug}`)
  }

  return (
    <BharatConnectScreen
      title="Select a category"
      description={`All ${LIVE_CATEGORIES.length} Bharat Connect categories currently live on this platform`}
      backTo="/retailer/bharat-connect"
      backLabel="Bharat Connect home"
      meta={<JourneyStepper current="category" />}
    >
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter categories..."
          className="h-9 pl-9"
          aria-label="Filter categories"
        />
      </div>

      {categories.length === 0 ? (
        <EmptyState title="No categories match your filter" description="Try a different keyword" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => {
            const count = billersByCategory(cat.slug).length
            return (
              <button
                key={cat.slug}
                type="button"
                onClick={() => open(cat.slug)}
                className="group flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-gray-900 hover:shadow-sm"
              >
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-md text-white"
                  style={{ background: BRAND_COLORS.blue }}
                >
                  <CategoryIcon name={cat.icon} className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-semibold text-gray-900">{cat.name}</span>
                    <Badge variant="success" className="shrink-0 px-1.5 py-0 text-[10px]">
                      Live
                    </Badge>
                  </span>
                  <span className="mt-1 block text-xs leading-snug text-gray-500">{cat.description}</span>
                  <span className="mt-1.5 block text-[11px] font-medium text-gray-400">
                    {count} biller{count === 1 ? "" : "s"} available
                  </span>
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-900" />
              </button>
            )
          })}
        </div>
      )}
    </BharatConnectScreen>
  )
}
