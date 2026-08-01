import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Receipt, FileText, IndianRupee } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { DataTable } from "@/components/shared/data-table"
import { DateRangeFilter, type DateRange } from "@/components/shared/date-range-filter"
import { ErrorState } from "@/components/shared/error-state"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { useApiQuery } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { GSTReport } from "@/lib/api-types"
import { exportToCsv } from "@/lib/utils"
import { formatCount, formatMoney, toNumberOrZero } from "@/lib/money"

type GstRow = GSTReport["rows"][number]

/** Renders "2026-07" as "July 2026". */
function monthLabel(month: string): string {
  const [year, m] = month.split("-")
  const index = Number(m) - 1
  if (!year || Number.isNaN(index)) return month
  const name = new Date(2000, index, 1).toLocaleString("en-IN", { month: "long" })
  return `${name} ${year}`
}

const columns: ColumnDef<GstRow>[] = [
  {
    accessorKey: "month",
    header: "Month",
    cell: ({ row }) => <span className="text-sm font-medium text-gray-900">{monthLabel(row.original.month)}</span>,
  },
  {
    accessorKey: "count",
    header: "Transactions",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{formatCount(row.original.count)}</span>,
  },
  {
    accessorKey: "commission",
    header: "Commission Earned",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{formatMoney(row.original.commission)}</span>,
  },
  {
    accessorKey: "gst",
    header: "GST Deducted",
    cell: ({ row }) => (
      <span className="table-num text-sm font-semibold text-gray-900">{formatMoney(row.original.gst)}</span>
    ),
  },
]

export function GstReportPage() {
  const [range, setRange] = React.useState<DateRange>({})

  const query = useApiQuery(() => api.reports.gst(range), [range.from, range.to])
  const report = query.data

  const rows = report?.rows ?? []

  // The current calendar month, matched against the backend's YYYY-MM grouping.
  const currentMonth = React.useMemo(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`
  }, [])
  const thisMonth = rows.find((r) => r.month === currentMonth)

  const totalTransactions = rows.reduce((sum, r) => sum + r.count, 0)

  // The GST here is what was withheld from commission, and it is a single
  // deduction rather than a CGST/SGST/IGST split: the backend records one GST
  // figure per transaction, so splitting it in the UI would be invented detail.
  const totalGst = report?.totalGst ?? "0"

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="GST Report"
        description="GST deducted from your commission earnings"
        actions={
          <DateRangeFilter value={range} onChange={setRange} />
        }
      />

      {query.error ? (
        <ErrorState description={query.error} onRetry={query.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total GST Deducted"
              value={formatMoney(totalGst)}
              icon={Receipt}
              iconClassName="bg-brand-50 text-brand-600"
              loading={query.loading}
            />
            <StatCard
              label="Transactions in Period"
              value={formatCount(totalTransactions)}
              icon={FileText}
              iconClassName="bg-info-bg text-info"
              loading={query.loading}
            />
            <StatCard
              label="This Month GST"
              value={formatMoney(thisMonth?.gst ?? "0")}
              icon={IndianRupee}
              iconClassName="bg-success-bg text-success"
              loading={query.loading}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Registration</CardTitle>
              <CardDescription>
                {report?.gstin
                  ? `GSTIN ${report.gstin}`
                  : "No GSTIN on file. Add it in your profile so it appears on this report."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">
                GST is withheld from the commission a transaction earns, not from the transaction amount. Only
                settled transactions are counted, so a pending or failed transaction contributes nothing here.
              </p>
            </CardContent>
          </Card>

          <DataTable
            columns={columns}
            data={rows}
            loading={query.loading}
            onExport={() =>
              exportToCsv(
                "gst-report",
                rows.map((r) => ({
                  month: monthLabel(r.month),
                  transactions: r.count,
                  commission: toNumberOrZero(r.commission),
                  gst: toNumberOrZero(r.gst),
                })),
              )
            }
            emptyTitle="No GST recorded for this period"
            emptyDescription="GST appears here once you have settled transactions that earned commission"
          />
        </>
      )}
    </div>
  )
}
