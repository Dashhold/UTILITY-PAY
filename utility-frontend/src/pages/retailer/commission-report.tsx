import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Percent, TrendingUp, Calculator, Layers } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { DataTable } from "@/components/shared/data-table"
import { DateRangeFilter, type DateRange } from "@/components/shared/date-range-filter"
import { ErrorState } from "@/components/shared/error-state"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useApiQuery } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { CommissionRow } from "@/lib/api-types"
import { exportToCsv } from "@/lib/utils"
import { formatCount, formatMoney, toNumberOrZero } from "@/lib/money"
import {
  AreaChart, Area, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
} from "recharts"

/** Renders "2026-07" as "Jul 2026" for the chart axis. */
function shortMonth(month: string): string {
  const [year, m] = month.split("-")
  const index = Number(m) - 1
  if (!year || Number.isNaN(index)) return month
  return `${new Date(2000, index, 1).toLocaleString("en-IN", { month: "short" })} ${year.slice(2)}`
}

const columns: ColumnDef<CommissionRow>[] = [
  {
    accessorKey: "service",
    header: "Service",
    cell: ({ row }) => <span className="text-sm font-medium text-gray-900">{row.original.service}</span>,
  },
  {
    accessorKey: "category",
    header: "Category",
    cell: ({ row }) => <Badge variant="outline" className="text-[11px]">{row.original.category}</Badge>,
  },
  {
    accessorKey: "count",
    header: "Transactions",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{formatCount(row.original.count)}</span>,
  },
  {
    accessorKey: "volume",
    header: "Volume",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{formatMoney(row.original.volume)}</span>,
  },
  {
    accessorKey: "commission",
    header: "Gross Commission",
    cell: ({ row }) => (
      <span className="table-num text-sm font-medium text-gray-900">{formatMoney(row.original.commission)}</span>
    ),
  },
  {
    accessorKey: "tds",
    header: "TDS",
    cell: ({ row }) => <span className="table-num text-sm text-danger-600">{formatMoney(row.original.tds)}</span>,
  },
  {
    accessorKey: "gst",
    header: "GST",
    cell: ({ row }) => <span className="table-num text-sm text-danger-600">{formatMoney(row.original.gst)}</span>,
  },
  {
    accessorKey: "netEarnings",
    header: "Net Earnings",
    cell: ({ row }) => (
      <span className="table-num text-sm font-semibold text-success-600">{formatMoney(row.original.netEarnings)}</span>
    ),
  },
]

export function CommissionReportPage() {
  const [range, setRange] = React.useState<DateRange>({})

  const query = useApiQuery(() => api.reports.commission(range), [range.from, range.to])
  const report = query.data

  const rows = report?.rows ?? []
  const total = report?.total

  // Series values are converted to numbers only for rendering. The figures shown
  // as text come straight from the decimal strings the server sent.
  const series = React.useMemo(
    () =>
      (report?.monthly ?? []).map((m) => ({
        month: shortMonth(m.month),
        commission: toNumberOrZero(m.commission),
        volume: toNumberOrZero(m.volume),
      })),
    [report?.monthly],
  )

  const totalCount = total?.count ?? 0
  const averagePerTxn = totalCount > 0 ? toNumberOrZero(total?.commission) / totalCount : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Commission Report"
        description="Commission earned across every service, after TDS and GST"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      {query.error ? (
        <ErrorState description={query.error} onRetry={query.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Gross Commission"
              value={formatMoney(total?.commission ?? "0")}
              icon={Percent}
              iconClassName="bg-brand-50 text-brand-600"
              loading={query.loading}
            />
            <StatCard
              label="Net Earnings"
              value={formatMoney(total?.netEarnings ?? "0")}
              icon={TrendingUp}
              iconClassName="bg-success-bg text-success"
              loading={query.loading}
            />
            <StatCard
              label="Transaction Volume"
              value={formatMoney(total?.volume ?? "0")}
              icon={Layers}
              iconClassName="bg-info-bg text-info"
              loading={query.loading}
            />
            <StatCard
              label="Average per Transaction"
              value={averagePerTxn === null ? "—" : formatMoney(averagePerTxn)}
              icon={Calculator}
              iconClassName="bg-gray-100 text-gray-600"
              loading={query.loading}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Commission Trend</CardTitle>
              <CardDescription>
                Commission by month for the selected period. Only settled transactions are counted.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-2">
              {series.length === 0 ? (
                <p className="py-12 text-center text-sm text-gray-500">
                  {query.loading ? "Loading…" : "No settled transactions in this period yet."}
                </p>
              ) : (
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={series}>
                    <defs>
                      <linearGradient id="commissionFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#F4B400" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#F4B400" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#9ca3af" }} />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: "#9ca3af" }}
                      tickFormatter={(v) => `₹${Number(v).toLocaleString("en-IN")}`}
                    />
                    <RTooltip
                      formatter={(v) => formatMoney(Number(v))}
                      contentStyle={{ borderRadius: 8, border: "1px solid #e5e7eb", fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="commission"
                      name="Commission"
                      stroke="#F4B400"
                      strokeWidth={2}
                      fill="url(#commissionFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            data={rows}
            loading={query.loading}
            searchKey="service"
            searchPlaceholder="Search by service..."
            onExport={() => exportToCsv("commission-report", rows)}
            emptyTitle="No commission earned in this period"
            emptyDescription="Commission appears here once transactions settle successfully"
          />
        </>
      )}
    </div>
  )
}
