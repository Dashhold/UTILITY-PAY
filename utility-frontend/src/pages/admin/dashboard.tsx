import {
  Wallet, TrendingUp, Percent, Clock, CheckCircle2, XCircle, ArrowRight,
  Megaphone, PlusCircle, Send, FileBarChart, UserPlus,
} from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Link } from "react-router-dom"
import { formatDate, initials } from "@/lib/utils"
import { api } from "@/lib/api"
import { useApiQuery } from "@/hooks/use-api"
import { formatCount, formatMoney, toNumberOrZero } from "@/lib/money"
import { AlertTriangle, Loader2 } from "lucide-react"
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, ResponsiveContainer,
  XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from "recharts"

const CHART_COLOURS = ["#111827", "#4B5563", "#6B7280", "#9CA3AF", "#D1D5DB", "#374151"]

export function AdminDashboard() {
  const { data, loading, error, refetch } = useApiQuery(() => api.admin.dashboard(), [])

  if (loading) return <DashboardSkeleton />

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Dashboard" />
        <Card className="border-danger-200 bg-danger-50/40">
          <CardContent className="flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">Dashboard unavailable</p>
                <p className="text-sm text-gray-700">{error ?? "Please try again."}</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={refetch}>
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const {
    stats,
    pendingFundRequests,
    reconciliation,
  } = data
  const transactions = Array.isArray(data.recentTransactions) ? data.recentTransactions : []
  const fundRequests = Array.isArray(data.recentFundRequests) ? data.recentFundRequests : []
  const retailers = Array.isArray(data.recentRetailers) ? data.recentRetailers : []
  const analytics = Array.isArray(data.serviceAnalytics) ? data.serviceAnalytics : []
  const announcements = Array.isArray(data.announcements) ? data.announcements : []

  // Service mix for the pie chart, derived from the server's per-service report so
  // the chart and the table below cannot disagree.
  const serviceMix = analytics
    .map((row) => ({ name: row.service, value: toNumberOrZero(row.volume) }))
    .filter((row) => row.value > 0)
    .slice(0, 6)

  // Success/failure split per service, for the bar chart.
  const serviceOutcomes = analytics.slice(0, 6).map((row) => ({
    name: row.service.length > 14 ? `${row.service.slice(0, 14)}…` : row.service,
    success: row.successCount,
    failed: row.failedCount,
    pending: row.pendingCount,
  }))

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Dashboard"
        description="Overview of your platform's performance today"
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link to="/admin/service-report">
                <FileBarChart className="size-3.5" /> Service Report
              </Link>
            </Button>
            <Button variant="brand" size="sm" asChild>
              <Link to="/admin/fund-transfer">
                <Send className="size-3.5" /> Transfer Funds
              </Link>
            </Button>
          </>
        }
      />

      {reconciliation.awaitingReview > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="flex flex-col items-start justify-between gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-semibold text-gray-900">
                  {formatCount(reconciliation.awaitingReview)} transaction
                  {reconciliation.awaitingReview === 1 ? "" : "s"} need manual review
                </p>
                <p className="text-xs text-gray-700">
                  Automated status checks were exhausted without a verdict. Funds remain on hold
                  until these are settled.
                </p>
              </div>
            </div>
            <Button size="sm" variant="outline" asChild>
              <Link to="/admin/service-report">Review</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Top stat row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Today's Volume"
          value={formatMoney(stats.todayVolume)}
          icon={Wallet}
          iconClassName="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Today's Transactions"
          value={formatCount(stats.todayCount)}
          icon={TrendingUp}
          iconClassName="bg-info-bg text-info"
        />
        <StatCard
          label="Lifetime Volume"
          value={formatMoney(stats.totalVolume)}
          icon={Wallet}
          iconClassName="bg-success-bg text-success"
        />
        <StatCard
          label="Today's Commission"
          value={formatMoney(stats.todayCommission)}
          icon={Percent}
          iconClassName="bg-warning-bg text-warning"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Pending Fund Requests"
          value={formatCount(pendingFundRequests)}
          icon={Clock}
          iconClassName="bg-warning-bg text-warning"
        />
        <StatCard
          label="Successful Transactions"
          value={formatCount(stats.successCount)}
          icon={CheckCircle2}
          iconClassName="bg-success-bg text-success"
        />
        <StatCard
          label="Failed Transactions"
          value={formatCount(stats.failedCount)}
          icon={XCircle}
          iconClassName="bg-danger-bg text-danger"
        />
        <StatCard
          label="Pending Transactions"
          value={formatCount(stats.pendingCount)}
          icon={Clock}
          iconClassName="bg-warning-bg text-warning"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Volume by Service</CardTitle>
              <CardDescription>Settled transaction value per service</CardDescription>
            </div>
            <Badge variant="success">{formatCount(stats.successCount)} settled</Badge>
          </CardHeader>
          <CardContent className="pt-2">
            {serviceMix.length === 0 ? (
              <ChartEmpty />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={serviceMix}>
                  <defs>
                    <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#F4B400" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#F4B400" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    tick={{ fontSize: 12, fill: "#9ca3af" }}
                    tickFormatter={(v) => `₹${Number(v) / 1000}k`}
                  />
                  <RTooltip
                    formatter={(v) => formatMoney(Number(v))}
                    contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="value" stroke="#F4B400" strokeWidth={2} fill="url(#revFill)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Service Wise Analytics</CardTitle>
            <CardDescription>Share of settled value by service</CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            {serviceMix.length === 0 ? (
              <ChartEmpty />
            ) : (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={serviceMix}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {serviceMix.map((_, idx) => (
                        <Cell
                          key={idx}
                          fill={CHART_COLOURS[idx % CHART_COLOURS.length]}
                          stroke="white"
                          strokeWidth={2}
                        />
                      ))}
                    </Pie>
                    <RTooltip
                      formatter={(v) => formatMoney(Number(v))}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="mt-2 grid grid-cols-1 gap-2">
                  {serviceMix.map((s, idx) => (
                    <div key={s.name} className="flex items-center gap-1.5 text-xs text-gray-600">
                      <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: CHART_COLOURS[idx % CHART_COLOURS.length] }}
                      />
                      <span className="truncate">{s.name}</span>
                      <span className="table-num ml-auto shrink-0 font-medium text-gray-900">
                        {formatMoney(s.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transaction Outcomes</CardTitle>
          <CardDescription>Success, failed and pending counts per service</CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {serviceOutcomes.length === 0 ? (
            <ChartEmpty />
          ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={serviceOutcomes}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
              <RTooltip contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="success" name="Success" fill="#16a34a" radius={[3, 3, 0, 0]} />
              <Bar dataKey="pending" name="Pending" fill="#F4B400" radius={[3, 3, 0, 0]} />
              <Bar dataKey="failed" name="Failed" fill="#dc2626" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Recent tables row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/service-report">
                View all <ArrowRight className="size-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {transactions.map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-md bg-gray-100 text-xs font-semibold text-gray-600">
                      {t.category.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{t.service}</p>
                      <p className="text-xs text-gray-500">{t.retailer} · {formatDate(t.createdAt, true)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="table-num text-sm font-semibold text-gray-900">{formatMoney(t.amount)}</span>
                    <StatusBadge status={t.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            {[
              { label: "Add Product", icon: PlusCircle, href: "/admin/products/add" },
              { label: "New Retailer", icon: UserPlus, href: "/admin/user-manager" },
              { label: "Fund Transfer", icon: Send, href: "/admin/fund-transfer" },
              { label: "Announcement", icon: Megaphone, href: "/admin/modules/announcements" },
            ].map((a) => (
              <Link
                key={a.label}
                to={a.href}
                className="flex flex-col items-center gap-2 rounded-md border border-gray-200 px-3 py-4 text-center hover:border-brand-500 hover:bg-brand-50/40"
              >
                <a.icon className="size-5 text-gray-700" />
                <span className="text-xs font-medium text-gray-700">{a.label}</span>
              </Link>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent Fund Requests</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/fund-requests">View all <ArrowRight className="size-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {fundRequests.map((f) => (
                <div key={f.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{f.retailer}</p>
                    <p className="text-xs text-gray-500">
                      {f.bank} · {formatDate(f.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="table-num text-sm font-semibold text-gray-900">{formatMoney(f.amount)}</p>
                    <StatusBadge status={f.status} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent Retailers</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/admin/user-manager">View all <ArrowRight className="size-3.5" /></Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {retailers.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-5 py-3">
                  {/* The retailer's personal name lives on the joined user
                      record; shopName is the fallback when that is absent. */}
                  <Avatar className="size-8">
                    <AvatarFallback className="text-[10px]">
                      {initials(r.user?.name ?? r.shopName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {r.user?.name ?? r.shopName}
                    </p>
                    <p className="truncate text-xs text-gray-500">
                      {r.shopName} · {r.city}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Announcements</CardTitle>
            <Megaphone className="size-4 text-gray-400" />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {announcements.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">No published announcements</p>
            ) : (
              announcements.map((a) => (
                <div key={a.id} className="rounded-md border border-gray-100 bg-gray-50/60 px-3 py-2.5">
                  <p className="text-sm font-medium text-gray-900">{a.title}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-gray-600">{a.message}</p>
                  {a.publishedDate && (
                    <p className="mt-1 text-xs text-gray-400">{formatDate(a.publishedDate)}</p>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* API status */}
      <Card>
        <CardHeader>
          <CardTitle>System Status</CardTitle>
          <CardDescription>Live status of core services and integrations</CardDescription>
        </CardHeader>
        {/* Status is derived from the provider capability report, not asserted.
            An operation whose upstream contract is not live reads as "Not live"
            rather than being shown green, which would misrepresent readiness. */}
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { name: "AEPS Onboarding", live: data.systemStatus.aeps.onboard },
            { name: "AEPS Transactions", live: data.systemStatus.aeps.cashWithdrawal },
            { name: "Bharat Connect Auth", live: data.systemStatus.bharatConnect.token },
            { name: "Bill Fetch", live: data.systemStatus.bharatConnect.viewBill },
            { name: "Bill Payment", live: data.systemStatus.bharatConnect.payment },
            { name: "Status Check", live: data.systemStatus.bharatConnect.status },
            { name: "Recharge Plans", live: data.systemStatus.bharatConnect.plans },
            { name: "Recon Engine", live: true },
          ].map((s) => (
            <div key={s.name} className="flex flex-col gap-1.5 rounded-md border border-gray-100 px-3 py-2.5">
              <div className="flex items-center gap-1.5">
                <span className={`size-1.5 shrink-0 rounded-full ${s.live ? "bg-success-500" : "bg-gray-300"}`} />
                <span className="truncate text-xs font-medium text-gray-900">{s.name}</span>
              </div>
              <span className="text-[11px] text-gray-500">{s.live ? "Operational" : "Not live"}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Reconciliation</CardTitle>
          <CardDescription>Transactions awaiting an upstream verdict</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <ReconTile label="Pending" value={reconciliation.pending} />
          <ReconTile label="Processing" value={reconciliation.processing} />
          <ReconTile label="Timed out" value={reconciliation.timedOut} />
          <ReconTile label="Due for check" value={reconciliation.dueForStatusCheck} />
          <ReconTile label="Manual review" value={reconciliation.awaitingReview} highlight />
        </CardContent>
      </Card>
    </div>
  )
}

function ReconTile({
  label,
  value,
  highlight,
}: {
  label: string
  value: number
  highlight?: boolean
}) {
  return (
    <div
      className={`rounded-md border px-3 py-2.5 ${
        highlight && value > 0 ? "border-amber-300 bg-amber-50" : "border-gray-100"
      }`}
    >
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-gray-900">{formatCount(value)}</p>
    </div>
  )
}

function ChartEmpty() {
  return (
    <div className="flex h-[200px] flex-col items-center justify-center gap-1 text-center">
      <p className="text-sm font-medium text-gray-900">No data yet</p>
      <p className="text-sm text-gray-500">This chart fills in once transactions settle.</p>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="h-8 w-56 animate-pulse rounded bg-gray-100" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-lg bg-gray-100" />
        ))}
      </div>
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
        <Loader2 className="size-4 animate-spin" /> Loading dashboard...
      </div>
    </div>
  )
}
