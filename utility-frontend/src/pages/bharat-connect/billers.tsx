import * as React from "react"
import { Navigate, useNavigate, useParams } from "react-router-dom"
import { ArrowRight, Clock, Search, Star } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/shared/empty-state"
import { BharatConnectScreen, JourneyStepper } from "@/components/brand/bharat-connect-screen"
import { CategoryIcon } from "@/components/brand/category-icon"
import { BRAND_COLORS, LIVE_CATEGORIES } from "@/lib/brand"
import { useBillers } from "@/lib/bharat-connect/use-billers"
import { recentBillerIds } from "@/lib/bharat-connect/service"
import { useBharatConnectFlow } from "@/lib/bharat-connect/flow-context"
import type { Biller } from "@/lib/bharat-connect/types"

/**
 * Biller selection screen — NPCI compliance screen 3.
 *
 * Mandate: Bharat Connect logo on the top right. Provides biller search,
 * category filtering, popular billers and recently used billers.
 */
export function BharatConnectBillers() {
  const { categorySlug = "" } = useParams()
  const navigate = useNavigate()
  const { selectBiller } = useBharatConnectFlow()
  const [query, setQuery] = React.useState("")

  const category = LIVE_CATEGORIES.find((c) => c.slug === categorySlug)

  // Fetch billers from API
  const { billers: allBillers } = useBillers(category?.name, query.trim().length >= 2 ? query : undefined)

  // Filter billers by category if not already filtered by API
  const all = React.useMemo(() => 
    allBillers.filter((b) => b.categorySlug === categorySlug && b.live),
    [allBillers, categorySlug]
  )

  const results = React.useMemo(() => 
    query.trim().length >= 2 ? all : [],
    [query, all]
  )

  const popular = React.useMemo(() => 
    all.filter((b) => b.popular).slice(0, 10),
    [all]
  )

  const recent = React.useMemo(() => {
    const recentIds = recentBillerIds()
    return recentIds
      .map((id) => all.find((b) => b.id === id))
      .filter((b): b is Biller => !!b && b.categorySlug === categorySlug)
  }, [all, categorySlug])

  if (!category) return <Navigate to="/retailer/bharat-connect/categories" replace />

  function open(biller: Biller) {
    selectBiller(biller.id)
    navigate(`/retailer/bharat-connect/billers/${biller.categorySlug}/${biller.id}`)
  }

  const searching = query.trim().length > 0

  return (
    <BharatConnectScreen
      title={`${category.name} billers`}
      description={`${all.length} biller${all.length === 1 ? "" : "s"} live for ${category.name} on Bharat Connect`}
      backTo="/retailer/bharat-connect/categories"
      backLabel="All categories"
      meta={<JourneyStepper current="biller" />}
    >
      <div className="flex items-center gap-3">
        <span
          className="flex size-9 shrink-0 items-center justify-center rounded-md text-white"
          style={{ background: BRAND_COLORS.blue }}
        >
          <CategoryIcon name={category.icon} className="size-4.5" />
        </span>
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${category.name} billers by name, region or biller ID...`}
            className="h-9 pl-9"
            aria-label="Search billers"
          />
        </div>
      </div>

      {!searching && recent.length > 0 && (
        <BillerGroup title="Recent billers" icon={Clock} billers={recent} onSelect={open} />
      )}

      {!searching && popular.length > 0 && (
        <BillerGroup title="Popular billers" icon={Star} billers={popular} onSelect={open} />
      )}

      <section>
        <h2 className="mb-2 text-sm font-semibold text-gray-900">
          {searching ? `${results.length} result${results.length === 1 ? "" : "s"}` : "All billers"}
        </h2>
        {results.length === 0 ? (
          <EmptyState
            title="No billers found"
            description="Check the spelling, or search by the biller's region or biller ID"
          />
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {results.map((b) => (
              <BillerRow key={b.id} biller={b} onSelect={open} />
            ))}
          </div>
        )}
      </section>
    </BharatConnectScreen>
  )
}

function BillerGroup({
  title,
  icon: Icon,
  billers,
  onSelect,
}: {
  title: string
  icon: React.ComponentType<{ className?: string }>
  billers: Biller[]
  onSelect: (b: Biller) => void
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-3 flex items-center gap-2">
          <Icon className="size-3.5 text-gray-400" />
          <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        </div>
        <div className="flex flex-wrap gap-2">
          {billers.map((b) => (
            <button
              key={b.id}
              type="button"
              onClick={() => onSelect(b)}
              className="rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:border-gray-900 hover:text-gray-900"
            >
              {b.name}
            </button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function BillerRow({ biller, onSelect }: { biller: Biller; onSelect: (b: Biller) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(biller)}
      className="group flex items-center gap-3 rounded-lg border border-gray-200 bg-white p-3.5 text-left transition-colors hover:border-gray-900 hover:shadow-sm"
    >
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-semibold text-gray-900">{biller.name}</span>
          {biller.popular && (
            <Badge variant="brand" className="shrink-0 px-1.5 py-0 text-[10px]">
              Popular
            </Badge>
          )}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-500">
          <span>{biller.coverage}</span>
          <span className="text-gray-300">&bull;</span>
          <span className="table-num">{biller.id}</span>
        </span>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          <Tag>
            {biller.fetchRequirement === "NOT_SUPPORTED"
              ? "Quick pay only"
              : biller.fetchRequirement === "OPTIONAL"
                ? "Bill fetch optional"
                : "Bill fetch"}
          </Tag>
          {biller.supportsPartPay && <Tag>Part payment</Tag>}
          {biller.ccf.value > 0 && (
            <Tag>
              CCF {biller.ccf.type === "flat" ? `₹${biller.ccf.value}` : `${biller.ccf.value}%`}
            </Tag>
          )}
        </span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-gray-300 transition-colors group-hover:text-gray-900" />
    </button>
  )
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
      {children}
    </span>
  )
}
