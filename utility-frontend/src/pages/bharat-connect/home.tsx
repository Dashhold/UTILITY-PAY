import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { ArrowRight, History, LifeBuoy, Search, ShieldCheck, Star } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  BharatConnectBrandBar,
  BharatConnectMnemonic,
} from "@/components/brand/bharat-connect-logo"
import { CategoryIcon } from "@/components/brand/category-icon"
import { BHARAT_CONNECT, BRAND_COLORS, LIVE_CATEGORIES } from "@/lib/brand"
import { LIVE_BILLERS, popularBillers, searchBillers } from "@/lib/bharat-connect/billers"
import { useBharatConnectFlow } from "@/lib/bharat-connect/flow-context"
import { cn } from "@/lib/utils"

/**
 * Bharat Connect homepage — NPCI compliance screen 1.
 *
 * Mandate: the B mnemonic of the Bharat Connect logo must be present, and every
 * live category must be visible.
 */
export function BharatConnectHome() {
  const navigate = useNavigate()
  const { selectCategory, selectBiller } = useBharatConnectFlow()
  const [query, setQuery] = React.useState("")

  const matches = React.useMemo(
    () => (query.trim().length < 2 ? [] : searchBillers(query).slice(0, 6)),
    [query]
  )

  function openCategory(slug: string) {
    selectCategory(slug)
    navigate(`/retailer/bharat-connect/billers/${slug}`)
  }

  function openBiller(billerId: string, categorySlug: string) {
    selectBiller(billerId)
    navigate(`/retailer/bharat-connect/billers/${categorySlug}/${billerId}`)
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------------------------------------------------- hero */}
      <section
        className="relative overflow-hidden rounded-xl border border-gray-200 bg-white"
        aria-labelledby="bc-hero-title"
      >
        <div
          className="absolute inset-x-0 top-0 h-1"
          style={{ background: `linear-gradient(90deg, ${BRAND_COLORS.blue} 0%, ${BRAND_COLORS.orange} 100%)` }}
        />
        {/* NPCI mandate: Bharat Connect logo on the top right. */}
        <div className="absolute right-5 top-5 hidden sm:block">
          <BharatConnectBrandBar />
        </div>

        <div className="flex flex-col gap-6 px-5 py-7 sm:px-8 sm:py-10 lg:flex-row lg:items-center lg:gap-10">
          {/* NPCI mandate: B mnemonic on the homepage. */}
          <div className="flex shrink-0 items-center gap-4">
            <BharatConnectMnemonic size="xl" />
            <div className="h-16 w-px bg-gray-200 sm:h-20" />
            <div className="sm:hidden">
              <BharatConnectBrandBar label={undefined} size="sm" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <Badge variant="info" dot className="mb-3">
              {LIVE_CATEGORIES.length} categories live &middot; {LIVE_BILLERS.length} billers
            </Badge>
            <h1 id="bc-hero-title" className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl">
              Pay any bill with {BHARAT_CONNECT.name}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-gray-500">
              One interoperable platform for electricity, water, gas, broadband, insurance,
              loan repayment, municipal taxes and more &mdash; with instant confirmation and a
              Bharat Connect reference ID on every payment.
            </p>

            <div className="mt-5 flex max-w-xl flex-col gap-2 sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search for a biller, e.g. MSEDCL, Airtel, LIC..."
                  className="h-10 pl-9"
                  aria-label="Search billers"
                />
              </div>
              <Button variant="brand" className="h-10" asChild>
                <Link to="/retailer/bharat-connect/categories">
                  Browse categories <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </div>

            {matches.length > 0 && (
              <div className="mt-2 max-w-xl overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
                {matches.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => openBiller(b.id, b.categorySlug)}
                    className="flex w-full items-center gap-3 border-b border-gray-100 px-3 py-2.5 text-left last:border-0 hover:bg-gray-50"
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                      <CategoryIcon
                        name={LIVE_CATEGORIES.find((c) => c.slug === b.categorySlug)?.icon ?? ""}
                        className="size-3.5"
                      />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-gray-900">{b.name}</span>
                      <span className="block truncate text-xs text-gray-500">
                        {LIVE_CATEGORIES.find((c) => c.slug === b.categorySlug)?.name} &middot; {b.coverage}
                      </span>
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-gray-400" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- all categories */}
      <section aria-labelledby="bc-categories-title">
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <h2 id="bc-categories-title" className="text-base font-semibold text-gray-900">
              All live categories
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Every category currently live on {BHARAT_CONNECT.name}
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/retailer/bharat-connect/categories">
              View all <ArrowRight className="size-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {LIVE_CATEGORIES.map((cat) => (
            <button
              key={cat.slug}
              type="button"
              onClick={() => openCategory(cat.slug)}
              className={cn(
                "group flex flex-col items-start gap-2.5 rounded-lg border border-gray-200 bg-white p-3.5 text-left",
                "transition-colors hover:border-gray-900 hover:shadow-sm"
              )}
            >
              <span
                className="flex size-9 items-center justify-center rounded-md text-white transition-transform group-hover:scale-105"
                style={{ background: BRAND_COLORS.blue }}
              >
                <CategoryIcon name={cat.icon} className="size-4.5" />
              </span>
              <span className="block text-sm font-medium leading-tight text-gray-900">{cat.name}</span>
              <span className="block text-[11px] leading-snug text-gray-500">
                {LIVE_BILLERS.filter((b) => b.categorySlug === cat.slug).length} billers
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------- popular + actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent className="pt-5">
            <div className="mb-3 flex items-center gap-2">
              <Star className="size-4 text-brand-500" />
              <h2 className="text-sm font-semibold text-gray-900">Popular billers</h2>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {popularBillers().slice(0, 10).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => openBiller(b.id, b.categorySlug)}
                  className="flex items-center gap-3 rounded-md border border-gray-200 px-3 py-2.5 text-left hover:border-gray-900"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-600">
                    <CategoryIcon
                      name={LIVE_CATEGORIES.find((c) => c.slug === b.categorySlug)?.icon ?? ""}
                      className="size-3.5"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-gray-900">{b.name}</span>
                    <span className="block truncate text-[11px] text-gray-500">{b.coverage}</span>
                  </span>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3">
          <QuickLink
            to="/retailer/bharat-connect/transactions"
            icon={History}
            title="Transaction History"
            description="Search by reference ID or mobile number and date"
          />
          <QuickLink
            to="/retailer/bharat-connect/complaints"
            icon={LifeBuoy}
            title="Raise a Complaint"
            description="Register and track Bharat Connect disputes"
          />
          <Card>
            <CardContent className="flex items-start gap-3 pt-5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-success-bg text-success-600">
                <ShieldCheck className="size-4" />
              </span>
              <div>
                <p className="text-[13px] font-semibold text-gray-900">Every payment is B Assured</p>
                <p className="mt-0.5 text-[11px] leading-snug text-gray-500">
                  Payments are settled through {BHARAT_CONNECT.legalName} with an instant
                  confirmation and a unique Bharat Connect reference ID.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

function QuickLink({
  to,
  icon: Icon,
  title,
  description,
}: {
  to: string
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <Link
      to={to}
      className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-900"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-700">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-gray-900">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-gray-500">{description}</span>
      </span>
      <ArrowRight className="size-3.5 shrink-0 text-gray-400" />
    </Link>
  )
}
