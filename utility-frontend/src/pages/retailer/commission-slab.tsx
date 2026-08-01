import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { BadgePercent } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { DataTable } from "@/components/shared/data-table"
import { ErrorState } from "@/components/shared/error-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { useApiQuery } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { CommissionSlot } from "@/lib/api-types"
import { exportToCsv } from "@/lib/utils"
import { formatMoney, toNumber, toNumberOrZero } from "@/lib/money"
import {
  BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, Legend,
} from "recharts"

/** Renders "2026-07" as "Jul 26" for the chart axis. */
function shortMonth(month: string): string {
  const [year, m] = month.split("-")
  const index = Number(m) - 1
  if (!year || Number.isNaN(index)) return month
  return `${new Date(2000, index, 1).toLocaleString("en-IN", { month: "short" })} ${year.slice(2)}`
}

const columns: ColumnDef<CommissionSlot>[] = [
  {
    accessorKey: "service",
    header: "Service",
    cell: ({ row }) => <span className="text-sm font-medium text-gray-900">{row.original.service}</span>,
  },
  {
    accessorKey: "slabType",
    header: "Slab Type",
    cell: ({ row }) => (
      <Badge variant={row.original.slabType === "percentage" ? "brand" : "outline"}>
        {row.original.slabType === "percentage" ? "Percentage" : "Flat"}
      </Badge>
    ),
  },
  {
    accessorKey: "value",
    header: "Rate",
    cell: ({ row }) => (
      <span className="table-num text-sm font-semibold text-gray-900">
        {row.original.slabType === "percentage" ? `${row.original.value}%` : formatMoney(row.original.value)}
      </span>
    ),
  },
  {
    id: "band",
    header: "Applies To",
    cell: ({ row }) => {
      // A maximum of zero is the resolver's "no upper bound", not a ₹0 ceiling.
      const max = toNumber(row.original.maxAmount) ?? 0
      return (
        <span className="table-num text-xs text-gray-600">
          {formatMoney(row.original.minAmount)} &ndash; {max === 0 ? "no limit" : formatMoney(row.original.maxAmount)}
        </span>
      )
    },
  },
  {
    accessorKey: "tds",
    header: "TDS %",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.tds}%</span>,
  },
  {
    accessorKey: "gst",
    header: "GST %",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.gst}%</span>,
  },
]

export function CommissionSlabPage() {
  const slabs = useApiQuery(() => api.reports.commissionSlab(), [])
  const dashboard = useApiQuery(() => api.retailer.dashboard(), [])
  // Reuses the commission report's monthly aggregate rather than a second
  // endpoint, so the chart and the report can never disagree.
  const commission = useApiQuery(() => api.reports.commission({}), [])

  const rows = slabs.data ?? []
  const userType = dashboard.data?.profile.userType

  /**
   * Commission by month, split by category.
   *
   * Built from the per-service rows and the monthly totals: the report gives
   * category splits and month totals separately, so the split is applied
   * proportionally rather than fabricated per category per month.
   */
  const chartData = React.useMemo(() => {
    const monthly = commission.data?.monthly ?? []
    const byCategory = commission.data?.rows ?? []
    if (monthly.length === 0 || byCategory.length === 0) return { series: [], categories: [] as string[] }

    const totals = new Map<string, number>()
    for (const row of byCategory) {
      totals.set(row.category, (totals.get(row.category) ?? 0) + toNumberOrZero(row.commission))
    }
    const grand = [...totals.values()].reduce((a, b) => a + b, 0)
    if (grand <= 0) return { series: [], categories: [] as string[] }

    const categories = [...totals.keys()]
    const series = monthly.map((m) => {
      const monthCommission = toNumberOrZero(m.commission)
      const point: Record<string, string | number> = { month: shortMonth(m.month) }
      for (const category of categories) {
        const share = (totals.get(category) ?? 0) / grand
        point[category] = Math.round(monthCommission * share * 100) / 100
      }
      return point
    })

    return { series, categories }
  }, [commission.data])

  const BAR_COLOURS = ["#F4B400", "#111318", "#6b7280", "#0ea5e9", "#22c55e"]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="My Commission Slab"
        description="The commission rates currently applied to your account"
      />

      <Card>
        <CardContent className="flex flex-col items-start justify-between gap-3 p-5 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand-50 text-brand-700">
              <BadgePercent className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {userType ? `${userType} rates` : "Standard rates"}
              </p>
              <p className="text-xs text-gray-500">
                {rows.length === 0
                  ? "No slabs are configured for your account yet"
                  : `${rows.length} ${rows.length === 1 ? "slab" : "slabs"} applied across your enabled services`}
              </p>
            </div>
          </div>
          {rows.length > 0 && <Badge variant="success" dot>Active</Badge>}
        </CardContent>
      </Card>

      {slabs.error ? (
        <ErrorState description={slabs.error} onRetry={slabs.refetch} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          loading={slabs.loading}
          searchKey="service"
          searchPlaceholder="Search by service..."
          onExport={() => exportToCsv("commission-slabs", rows)}
          emptyTitle="No commission slabs configured"
          emptyDescription="Contact support if you expect to be earning commission on your transactions"
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle>Earnings by Category</CardTitle>
          <CardDescription>
            Commission by month, apportioned across categories by their share of your total earnings
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-2">
          {chartData.series.length === 0 ? (
            <p className="py-12 text-center text-sm text-gray-500">
              {commission.loading ? "Loading…" : "No settled transactions yet."}
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData.series}>
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
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {chartData.categories.map((category, i) => (
                  <Bar
                    key={category}
                    dataKey={category}
                    name={category}
                    fill={BAR_COLOURS[i % BAR_COLOURS.length]}
                    radius={[3, 3, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
