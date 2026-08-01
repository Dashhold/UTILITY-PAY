import * as React from "react"
import {
  Wallet,
  TrendingUp,
  Percent,
  Receipt,
  ArrowRight,
  Megaphone,
  Fingerprint,
  Smartphone,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Clock,
} from "lucide-react"
import { Link } from "react-router-dom"
import { toast } from "sonner"
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RTooltip } from "recharts"

import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/context/auth-context"
import { api, ApiError } from "@/lib/api"
import type { RetailerDashboard as DashboardData } from "@/lib/api-types"
import { formatCount, formatMoney, toNumberOrZero } from "@/lib/money"
import { formatDate } from "@/lib/utils"

/**
 * Retailer dashboard.
 *
 * Everything here comes from GET /api/v1/retailer/dashboard, which returns the
 * stats, profile, recent transactions, announcements and provider capabilities in
 * one call. A single round trip keeps the first paint fast and means the numbers
 * on screen are all from the same moment rather than stitched from several
 * requests that could disagree.
 */

const CHART_COLOURS = ["#111827", "#4B5563", "#9CA3AF", "#D1D5DB", "#6B7280", "#374151"]

export function RetailerDashboard() {
  const { user } = useAuth()
  const [data, setData] = React.useState<DashboardData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false

    api.retailer
      .dashboard()
      .then((result) => {
        if (!cancelled) setData(result)
      })
      .catch((err) => {
        if (cancelled) return
        const message = err instanceof ApiError ? err.message : "Could not load your dashboard"
        setError(message)
        toast.error(message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const firstName = user?.name.split(" ")[0] ?? "there"

  if (loading) return <DashboardSkeleton />

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={`Welcome back, ${firstName}`} />
        <Card className="border-danger-200 bg-danger-50/40">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Dashboard unavailable</p>
                <p className="text-sm text-gray-700">{error ?? "Please try again."}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const { stats, profile, recentTransactions, announcements, capabilities } = data

  const kycPending = profile.kycStatus !== "verified"
  const aepsPending = profile.aepsOnboardStatus !== "completed"

  // Service mix is derived from the transactions actually returned, so an empty
  // account shows an empty chart rather than invented slices.
  const serviceMix = React.useMemo(() => {
    const totals = new Map<string, number>()
    for (const txn of recentTransactions) {
      totals.set(txn.category, (totals.get(txn.category) ?? 0) + toNumberOrZero(txn.amount))
    }
    return [...totals.entries()].map(([name, value]) => ({ name, value }))
  }, [recentTransactions])

  const quickActions = [
    { label: "AEPS", icon: Fingerprint, href: "/retailer/services/aeps", enabled: capabilities.aeps.onboard },
    {
      label: "Bill Payments",
      icon: Receipt,
      href: "/retailer/bharat-connect",
      enabled: capabilities.bharatConnect.payment,
    },
    {
      label: "Recharge",
      icon: Smartphone,
      href: "/retailer/bharat-connect/categories",
      enabled: capabilities.bharatConnect.payment,
    },
    { label: kycPending ? "Complete KYC" : "View KYC", icon: ShieldCheck, href: "/retailer/kyc", enabled: true },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description={`${profile.shopName} · ${profile.city}, ${profile.state}`}
      />

      {kycPending && (
        <ActionBanner
          tone="warning"
          icon={ShieldAlert}
          title="Complete your KYC"
          body="KYC verification unlocks AEPS cash withdrawal and higher transaction limits."
          actionLabel="Complete KYC"
          actionHref="/retailer/kyc"
        />
      )}

      {aepsPending && (
        <ActionBanner
          tone="info"
          icon={Fingerprint}
          title="AEPS onboarding pending"
          body="Complete the provider's merchant KYC to start offering AEPS services."
          actionLabel="Start onboarding"
          actionHref="/retailer/services/aeps"
        />
      )}

      {stats.pendingCount > 0 && (
        <ActionBanner
          tone="info"
          icon={Clock}
          title={`${formatCount(stats.pendingCount)} transaction${stats.pendingCount === 1 ? "" : "s"} pending`}
          body="These are awaiting confirmation and resolve automatically. Do not retry them."
          actionLabel="View history"
          actionHref="/retailer/account-history"
        />
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Wallet Balance"
          value={formatMoney(stats.walletBalance)}
          icon={Wallet}
          iconClassName="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Today's Earnings"
          value={formatMoney(stats.todayCommission)}
          icon={TrendingUp}
          iconClassName="bg-success-bg text-success"
        />
        <StatCard
          label="Today's Transactions"
          value={formatCount(stats.todayCount)}
          icon={Receipt}
          iconClassName="bg-info-bg text-info"
        />
        <StatCard
          label="Lifetime Commission"
          value={formatMoney(stats.totalCommission)}
          icon={Percent}
          iconClassName="bg-warning-bg text-warning"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Successful" value={formatCount(stats.successCount)} tone="success" />
        <MiniStat label="Pending" value={formatCount(stats.pendingCount)} tone="warning" />
        <MiniStat label="Failed" value={formatCount(stats.failedCount)} tone="danger" />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick actions</CardTitle>
          <CardDescription>Actions disabled here are not yet live for your account</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {quickActions.map((action) => {
              const Icon = action.icon

              // A disabled action renders as a non-interactive tile rather than a
              // link, so a retailer cannot start a journey that ends in a 503.
              if (!action.enabled) {
                return (
                  <div
                    key={action.label}
                    className="flex cursor-not-allowed flex-col items-center gap-2 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 opacity-60"
                    title="Not available yet"
                  >
                    <Icon className="size-5 text-gray-400" />
                    <span className="text-xs font-medium text-gray-500">{action.label}</span>
                  </div>
                )
              }

              return (
                <Link
                  key={action.label}
                  to={action.href}
                  className="flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white p-4 transition-colors hover:border-gray-900 hover:bg-gray-50"
                >
                  <Icon className="size-5 text-gray-900" />
                  <span className="text-xs font-medium text-gray-900">{action.label}</span>
                </Link>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base">Recent transactions</CardTitle>
              <CardDescription>Your latest activity</CardDescription>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/retailer/account-history">
                View all <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <EmptyPanel
                title="No transactions yet"
                body="Your completed transactions will appear here."
              />
            ) : (
              <div className="divide-y divide-gray-100">
                {recentTransactions.map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-900">{txn.service}</p>
                      <p className="mt-0.5 font-mono text-xs text-gray-500">
                        {txn.txnId} · {formatDate(txn.createdAt, true)}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-sm font-semibold text-gray-900">
                        {formatMoney(txn.amount)}
                      </span>
                      <StatusBadge status={txn.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Service mix</CardTitle>
            <CardDescription>By value, recent activity</CardDescription>
          </CardHeader>
          <CardContent>
            {serviceMix.length === 0 ? (
              <EmptyPanel title="No data yet" body="Chart appears once you transact." />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={serviceMix} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80}>
                    {serviceMix.map((_, i) => (
                      <Cell key={i} fill={CHART_COLOURS[i % CHART_COLOURS.length]} />
                    ))}
                  </Pie>
                  <RTooltip formatter={(value) => formatMoney(Number(value))} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {announcements.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Megaphone className="size-4 text-gray-500" />
            <CardTitle className="text-base">Announcements</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-gray-100">
              {announcements.map((item) => (
                <div key={item.id} className="py-3">
                  <p className="text-sm font-medium text-gray-900">{item.title}</p>
                  <p className="mt-0.5 text-sm text-gray-600">{item.message}</p>
                  {item.publishedDate && (
                    <p className="mt-1 text-xs text-gray-400">{formatDate(item.publishedDate)}</p>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ActionBanner({
  tone,
  icon: Icon,
  title,
  body,
  actionLabel,
  actionHref,
}: {
  tone: "warning" | "info"
  icon: React.ComponentType<{ className?: string }>
  title: string
  body: string
  actionLabel: string
  actionHref: string
}) {
  const classes =
    tone === "warning"
      ? { card: "border-warning-500/30 bg-warning-bg", icon: "text-warning-500" }
      : { card: "border-blue-200 bg-blue-50", icon: "text-blue-600" }

  return (
    <Card className={classes.card}>
      <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-white">
            <Icon className={`size-4 ${classes.icon}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900">{title}</p>
            <p className="text-xs text-gray-600">{body}</p>
          </div>
        </div>
        <Button size="sm" variant="brand" asChild>
          <Link to={actionHref}>{actionLabel}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: string
  tone: "success" | "warning" | "danger"
}) {
  const colour = {
    success: "text-success-600",
    warning: "text-amber-600",
    danger: "text-danger-600",
  }[tone]

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${colour}`}>{value}</p>
    </div>
  )
}

function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5 py-10 text-center">
      <p className="text-sm font-medium text-gray-900">{title}</p>
      <p className="text-sm text-gray-500">{body}</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-64 animate-pulse rounded bg-gray-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="h-72 animate-pulse rounded-lg bg-gray-100 lg:col-span-2" />
        <div className="h-72 animate-pulse rounded-lg bg-gray-100" />
      </div>
      <div className="flex items-center justify-center gap-2 text-sm text-gray-500">
        <Loader2 className="size-4 animate-spin" /> Loading your dashboard...
      </div>
    </div>
  )
}
