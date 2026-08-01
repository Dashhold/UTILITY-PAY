import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { PageHeader } from "@/components/shared/page-header"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { DateRangeFilter, type DateRange } from "@/components/shared/date-range-filter"
import { ErrorState } from "@/components/shared/error-state"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useApiList, useApiQuery, useDebounced } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { ServiceReportRow, Transaction } from "@/lib/api-types"
import { exportToCsv, formatDate } from "@/lib/utils"
import { formatCount, formatMoney, formatPercent, successRate, toNumberOrZero } from "@/lib/money"

const STATUS_OPTIONS = [
  { label: "Success", value: "success" },
  { label: "Pending", value: "pending" },
  { label: "Processing", value: "processing" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
]

/**
 * The categories this build transacts in.
 *
 * Only AEPS and Bharat Connect are integrated, so offering more tabs would show
 * permanently empty tables.
 */
const CATEGORY_TABS = [
  { value: "all", label: "All", category: undefined as string | undefined },
  { value: "aeps", label: "AEPS", category: "AEPS" },
  { value: "bharat-connect", label: "Bharat Connect", category: "Bharat Connect" },
]

const txnColumns: ColumnDef<Transaction>[] = [
  {
    accessorKey: "txnId",
    header: "Txn ID",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.txnId}</span>,
  },
  {
    accessorKey: "createdAt",
    header: "Date",
    cell: ({ row }) => <span className="text-sm text-gray-700">{formatDate(row.original.createdAt, true)}</span>,
  },
  {
    accessorKey: "service",
    header: "Service",
    cell: ({ row }) => (
      <div>
        <p className="text-sm font-medium text-gray-900">{row.original.service}</p>
        <p className="text-[11px] text-gray-400">{row.original.category}</p>
      </div>
    ),
  },
  {
    accessorKey: "amount",
    header: "Amount",
    cell: ({ row }) => (
      <span className="table-num text-sm font-semibold text-gray-900">{formatMoney(row.original.amount)}</span>
    ),
  },
  {
    accessorKey: "commission",
    header: "Commission",
    cell: ({ row }) => (
      <span className="table-num text-sm font-semibold text-success-600">{formatMoney(row.original.commission)}</span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <div className="flex items-center gap-1.5">
        <StatusBadge status={row.original.status} />
        {row.original.needsManualReview && (
          <Badge variant="warning" className="text-[10px]">Under review</Badge>
        )}
      </div>
    ),
  },
  {
    id: "reference",
    header: "Provider Ref",
    cell: ({ row }) => (
      <span className="table-num text-xs text-gray-500">
        {row.original.providerTxnId ?? row.original.providerRef ?? "—"}
      </span>
    ),
  },
]

const summaryColumns: ColumnDef<ServiceReportRow>[] = [
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
    accessorKey: "total",
    header: "Total",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{formatCount(row.original.total)}</span>,
  },
  {
    accessorKey: "successCount",
    header: "Success",
    cell: ({ row }) => (
      <span className="table-num text-sm text-success-600">{formatCount(row.original.successCount)}</span>
    ),
  },
  {
    accessorKey: "failedCount",
    header: "Failed",
    cell: ({ row }) => (
      <span className="table-num text-sm text-danger-600">{formatCount(row.original.failedCount)}</span>
    ),
  },
  {
    accessorKey: "pendingCount",
    header: "Pending",
    cell: ({ row }) => (
      <span className="table-num text-sm text-warning-600">{formatCount(row.original.pendingCount)}</span>
    ),
  },
  {
    id: "successRate",
    header: "Success Rate",
    cell: ({ row }) => (
      <span className="table-num text-sm font-medium text-gray-900">
        {formatPercent(successRate(row.original.successCount, row.original.total))}
      </span>
    ),
  },
  {
    accessorKey: "volume",
    header: "Settled Volume",
    cell: ({ row }) => <span className="table-num text-sm text-gray-700">{formatMoney(row.original.volume)}</span>,
  },
  {
    accessorKey: "commission",
    header: "Commission",
    cell: ({ row }) => (
      <span className="table-num text-sm font-semibold text-success-600">{formatMoney(row.original.commission)}</span>
    ),
  },
]

export function RetailerServiceReportPage() {
  const [range, setRange] = React.useState<DateRange>({})
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [tab, setTab] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounced(search)

  const category = CATEGORY_TABS.find((t) => t.value === tab)?.category

  const summary = useApiQuery(() => api.reports.service(range), [range.from, range.to])

  const list = useApiList<Transaction>(
    (page) =>
      api.reports.transactions({
        page,
        pageSize: 25,
        category,
        status: statusFilter === "all" ? undefined : statusFilter,
        search: debouncedSearch.trim() || undefined,
        from: range.from,
        to: range.to,
      }),
    [category, statusFilter, debouncedSearch, range.from, range.to],
  )

  const summaryRows = React.useMemo(
    () => (summary.data ?? []).filter((r) => !category || r.category === category),
    [summary.data, category],
  )

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Service Report"
        description="Every transaction on your account, with per-service success rates"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <Card>
        <CardHeader>
          <CardTitle>Per-Service Summary</CardTitle>
          <CardDescription>
            Counts include every status. Volume and commission count settled transactions only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {summary.error ? (
            <ErrorState description={summary.error} onRetry={summary.refetch} />
          ) : (
            <DataTable
              columns={summaryColumns}
              data={summaryRows}
              loading={summary.loading}
              onExport={() => exportToCsv("service-summary", summaryRows)}
              emptyTitle="No activity in this period"
            />
          )}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          {CATEGORY_TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {CATEGORY_TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            {list.error ? (
              <ErrorState description={list.error} onRetry={list.refetch} />
            ) : (
              <DataTable
                columns={txnColumns}
                data={list.items}
                loading={list.loading}
                searchValue={search}
                onSearchChange={setSearch}
                searchPlaceholder="Search by txn id, service or reference..."
                filters={
                  <FilterSelect
                    label="Status"
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={STATUS_OPTIONS}
                  />
                }
                serverPagination={{
                  page: list.page,
                  pageSize: list.pageSize,
                  total: list.total,
                  totalPages: list.totalPages,
                  onPageChange: list.setPage,
                }}
                onExport={() =>
                  exportToCsv(
                    "transactions",
                    list.items.map((txn) => ({
                      txnId: txn.txnId,
                      date: txn.createdAt,
                      category: txn.category,
                      service: txn.service,
                      amount: toNumberOrZero(txn.amount),
                      commission: toNumberOrZero(txn.commission),
                      tds: toNumberOrZero(txn.tds),
                      gst: toNumberOrZero(txn.gst),
                      status: txn.status,
                      providerRef: txn.providerTxnId ?? txn.providerRef ?? "",
                    })),
                  )
                }
                emptyTitle="No transactions found"
                emptyDescription="Try widening the date range or clearing the filters"
              />
            )}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
