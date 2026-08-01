import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowUpCircle, ArrowDownCircle, Wallet, TrendingUp, TrendingDown } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { DateRangeFilter, type DateRange } from "@/components/shared/date-range-filter"
import { ErrorState } from "@/components/shared/error-state"
import { useApiList, useApiQuery } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { WalletLedgerEntry } from "@/lib/api-types"
import { exportToCsv, formatDate } from "@/lib/utils"
import { formatMoney, toNumberOrZero } from "@/lib/money"

const TYPE_OPTIONS = [
  { label: "Credit", value: "credit" },
  { label: "Debit", value: "debit" },
]

/**
 * The reasons the backend records on a ledger row.
 *
 * Kept in step with models.LedgerReason so the filter offers real values; an
 * invented option would just return an empty page.
 */
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

/** Turns "commission_credit" into "Commission credit". */
function reasonLabel(reason: string): string {
  const known = REASON_OPTIONS.find((r) => r.value === reason)
  if (known) return known.label
  const spaced = reason.replace(/_/g, " ")
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

export function RetailerAccountHistoryPage() {
  const [range, setRange] = React.useState<DateRange>({})
  const [typeFilter, setTypeFilter] = React.useState("all")
  const [reasonFilter, setReasonFilter] = React.useState("all")

  const balance = useApiQuery(() => api.retailer.walletBalance(), [])

  const list = useApiList<WalletLedgerEntry>(
    (page) =>
      api.retailer.walletLedger({
        page,
        pageSize: 25,
        from: range.from,
        to: range.to,
        direction: typeFilter === "all" ? undefined : typeFilter,
        reason: reasonFilter === "all" ? undefined : reasonFilter,
      }),
    [range.from, range.to, typeFilter, reasonFilter],
  )

  // Totals cover the page in view, not the whole account: the ledger endpoint
  // paginates and does not return period aggregates, so labelling these as
  // account-wide totals would be wrong.
  const pageCredit = list.items
    .filter((e) => e.direction === "credit")
    .reduce((sum, e) => sum + toNumberOrZero(e.amount), 0)
  const pageDebit = list.items
    .filter((e) => e.direction === "debit")
    .reduce((sum, e) => sum + toNumberOrZero(e.amount), 0)

  const columns: ColumnDef<WalletLedgerEntry>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => <span className="text-sm text-gray-700">{formatDate(row.original.createdAt, true)}</span>,
    },
    {
      accessorKey: "narration",
      header: "Description",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-gray-900">
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
      header: "Running Balance",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-700">{formatMoney(row.original.balanceAfter)}</span>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Account History"
        description="Every movement on your wallet, newest first"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      {list.error ? (
        <ErrorState description={list.error} onRetry={list.refetch} />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              label="Current Balance"
              value={formatMoney(balance.data?.balance ?? "0")}
              icon={Wallet}
              iconClassName="bg-brand-50 text-brand-600"
              loading={balance.loading}
            />
            <StatCard
              label="Credited (this page)"
              value={formatMoney(pageCredit)}
              icon={TrendingUp}
              iconClassName="bg-success-bg text-success"
              loading={list.loading}
            />
            <StatCard
              label="Debited (this page)"
              value={formatMoney(pageDebit)}
              icon={TrendingDown}
              iconClassName="bg-danger-bg text-danger"
              loading={list.loading}
            />
          </div>

          <DataTable
            columns={columns}
            data={list.items}
            loading={list.loading}
            filters={
              <>
                <FilterSelect label="Type" value={typeFilter} onChange={setTypeFilter} options={TYPE_OPTIONS} />
                <FilterSelect label="Reason" value={reasonFilter} onChange={setReasonFilter} options={REASON_OPTIONS} />
              </>
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
                "account-history",
                list.items.map((e) => ({
                  date: e.createdAt,
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
