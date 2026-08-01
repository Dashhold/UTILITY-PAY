import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowUpCircle, ArrowDownCircle, Scale, TrendingUp, TrendingDown } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { DateRangeFilter, type DateRange } from "@/components/shared/date-range-filter"
import { ErrorState } from "@/components/shared/error-state"
import { useApiQuery, useDebounced } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { AdminLedgerEntry, MoneyString } from "@/lib/api-types"
import { exportToCsv, formatDate } from "@/lib/utils"
import { formatMoney, toNumberOrZero } from "@/lib/money"

const TYPE_OPTIONS = [
  { label: "Credit", value: "credit" },
  { label: "Debit", value: "debit" },
]

/** Kept in step with models.LedgerReason so every option returns real rows. */
const REASON_OPTIONS = [
  { label: "Fund request", value: "fund_request" },
  { label: "Admin adjustment", value: "admin_adjustment" },
  { label: "Transaction debit", value: "transaction_debit" },
  { label: "Transaction hold", value: "transaction_hold" },
  { label: "Reversal", value: "reversal" },
  { label: "Commission", value: "commission" },
  { label: "Settlement", value: "settlement" },
  { label: "Product order", value: "product_order" },
]

function reasonLabel(reason: string): string {
  const known = REASON_OPTIONS.find((r) => r.value === reason)
  if (known) return known.label
  const spaced = reason.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function AccountHistoryPage() {
  const [range, setRange] = React.useState<DateRange>({})
  const [typeFilter, setTypeFilter] = React.useState("all")
  const [reasonFilter, setReasonFilter] = React.useState("all")
  const [search, setSearch] = React.useState("")
  const [page, setPage] = React.useState(1)
  const debouncedSearch = useDebounced(search)

  // Any filter change returns to page one: staying on page nine of a shorter
  // result set shows an empty table and reads as a failure.
  React.useEffect(() => {
    setPage(1)
  }, [range.from, range.to, typeFilter, reasonFilter, debouncedSearch])

  const query = useApiQuery(
    () =>
      api.admin.walletLedger({
        page,
        pageSize: 25,
        from: range.from,
        to: range.to,
        direction: typeFilter === "all" ? undefined : typeFilter,
        reason: reasonFilter === "all" ? undefined : reasonFilter,
        search: debouncedSearch.trim() || undefined,
      }),
    [page, range.from, range.to, typeFilter, reasonFilter, debouncedSearch],
  )

  const entries = query.data?.items ?? []

  // Aggregates cover the whole filtered period, supplied by the server, not just
  // the rows on screen.
  const credits: MoneyString = query.data?.extra?.credits ?? "0"
  const debits: MoneyString = query.data?.extra?.debits ?? "0"
  const net = toNumberOrZero(credits) - toNumberOrZero(debits)

  const columns: ColumnDef<AdminLedgerEntry>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => <span className="text-sm text-gray-700">{formatDate(row.original.createdAt, true)}</span>,
    },
    {
      accessorKey: "retailer",
      header: "Retailer",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.original.retailer || "Unknown"}</p>
          <p className="table-num text-[11px] text-gray-400">{row.original.merchantCode}</p>
        </div>
      ),
    },
    {
      accessorKey: "narration",
      header: "Description",
      cell: ({ row }) => (
        <div>
          <p className="text-sm text-gray-800">
            {row.original.narration || reasonLabel(row.original.reason)}
          </p>
          <p className="text-[11px] text-gray-400">{reasonLabel(row.original.reason)}</p>
        </div>
      ),
    },
    {
      accessorKey: "direction",
      header: "Type",
      cell: ({ row }) => (
        <span
          className={
            row.original.direction === "credit"
              ? "flex items-center gap-1.5 text-sm font-medium text-success-600"
              : "flex items-center gap-1.5 text-sm font-medium text-danger-600"
          }
        >
          {row.original.direction === "credit" ? (
            <ArrowUpCircle className="size-3.5" />
          ) : (
            <ArrowDownCircle className="size-3.5" />
          )}
          {row.original.direction === "credit" ? "Credit" : "Debit"}
        </span>
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
      accessorKey: "balanceAfter",
      header: "Balance After",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-700">{formatMoney(row.original.balanceAfter)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account History"
        description="Every wallet movement across all retailers"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      {query.error ? (
        <ErrorState description={query.error} onRetry={query.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Total Credited"
              value={formatMoney(credits)}
              icon={TrendingUp}
              iconClassName="bg-success-bg text-success"
              loading={query.loading}
            />
            <StatCard
              label="Total Debited"
              value={formatMoney(debits)}
              icon={TrendingDown}
              iconClassName="bg-danger-bg text-danger"
              loading={query.loading}
            />
            <StatCard
              label="Net Movement"
              value={formatMoney(net)}
              icon={Scale}
              iconClassName="bg-brand-50 text-brand-600"
              loading={query.loading}
            />
          </div>

          <DataTable
            columns={columns}
            data={entries}
            loading={query.loading}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search by retailer, merchant code or narration..."
            filters={
              <>
                <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
                <FilterSelect label="Reason" value={reasonFilter} onChange={setReasonFilter} options={REASON_OPTIONS} />
              </>
            }
            serverPagination={{
              page: query.data?.page ?? page,
              pageSize: query.data?.pageSize ?? 25,
              total: query.data?.total ?? 0,
              totalPages: query.data?.totalPages ?? 0,
              onPageChange: setPage,
            }}
            onExport={() =>
              exportToCsv(
                "account-history",
                entries.map((e) => ({
                  date: e.createdAt,
                  retailer: e.retailer,
                  merchantCode: e.merchantCode,
                  description: e.narration || reasonLabel(e.reason),
                  reason: e.reason,
                  type: e.direction,
                  amount: toNumberOrZero(e.amount),
                  balanceAfter: toNumberOrZero(e.balanceAfter),
                })),
              )
            }
            emptyTitle="No ledger entries found"
            emptyDescription="Try widening the date range or clearing the filters"
          />
        </>
      )}
    </div>
  )
}
