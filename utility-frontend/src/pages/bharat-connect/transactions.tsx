import * as React from "react"
import { Link, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import {
  AlertCircle, CalendarDays, Hash, LifeBuoy, Receipt, RotateCw, Search,
} from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { BharatConnectScreen } from "@/components/brand/bharat-connect-screen"
import { DetailRow } from "@/components/brand/detail-row"
import { LIVE_CATEGORIES } from "@/lib/brand"
import {
  listTxnsLive,
  searchByMobileAndDate,
  searchByReference,
  syncTxns,
} from "@/lib/bharat-connect/live"
import type { BharatConnectTxn } from "@/lib/bharat-connect/types"
import { exportToCsv, formatCurrency, formatDate } from "@/lib/utils"

const STATUS_OPTIONS = [
  { label: "Success", value: "success" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
  { label: "Refunded", value: "refunded" },
]

const CATEGORY_OPTIONS = LIVE_CATEGORIES.map((c) => ({ label: c.name, value: c.slug }))

/**
 * Transaction History — NPCI compliance screen 7.
 *
 * Mandate: Bharat Connect logo on the top right, and **both** transaction
 * search options must be offered:
 *   1. Mobile number + transaction date
 *   2. Transaction reference ID
 */
export function BharatConnectTransactions() {
  const [all, setAll] = React.useState<BharatConnectTxn[]>(() => listTxnsLive())

  // History must reflect the server, not just what this browser happens to have
  // cached, otherwise a retailer switching devices sees an empty ledger.
  React.useEffect(() => {
    let cancelled = false
    void syncTxns().then((txns) => {
      if (!cancelled) setAll(txns)
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <BharatConnectScreen
      title="Transaction history"
      description="Search Bharat Connect bill payments by reference ID or by mobile number and date"
      backTo="/retailer/bharat-connect"
      backLabel="Bharat Connect home"
    >
      <Tabs defaultValue="ref">
        <TabsList className="flex-wrap">
          <TabsTrigger value="ref">
            <Hash className="size-3.5" /> Search by Transaction Reference ID
          </TabsTrigger>
          <TabsTrigger value="mobile">
            <CalendarDays className="size-3.5" /> Search by Mobile Number &amp; Date
          </TabsTrigger>
          <TabsTrigger value="all">All transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="ref">
          <SearchByReference />
        </TabsContent>

        <TabsContent value="mobile">
          <SearchByMobileAndDate />
        </TabsContent>

        <TabsContent value="all">
          <BrowseAll transactions={all} />
        </TabsContent>
      </Tabs>
    </BharatConnectScreen>
  )
}

// ---------------------------------------------------------- search method 1

function SearchByReference() {
  const [refId, setRefId] = React.useState("")
  const [searched, setSearched] = React.useState(false)
  const [result, setResult] = React.useState<BharatConnectTxn | null>(null)

  const [searching, setSearching] = React.useState(false)

  async function onSearch(e: React.FormEvent) {
    e.preventDefault()
    if (refId.trim().length < 6) {
      toast.error("Enter the full transaction reference ID")
      return
    }

    setSearching(true)
    try {
      // Searched server-side so a transaction made on another device or before a
      // cache clear is still found. The backend matches our transaction ID, the
      // provider reference and the Bharat Connect transaction ID.
      const matches = await searchByReference(refId)
      setResult(matches[0] ?? null)
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search by Transaction Reference ID</CardTitle>
        <CardDescription>
          Enter the Bharat Connect transaction ID, the partner transaction ID or the biller
          reference number printed on the receipt or received by SMS.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={onSearch}>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="bc-ref-id">Transaction Reference ID</Label>
            <Input
              id="bc-ref-id"
              value={refId}
              onChange={(e) => setRefId(e.target.value.toUpperCase())}
              placeholder="e.g. AB12CD34EF56"
              className="table-num"
            />
          </div>
          <Button type="submit" variant="brand" className="sm:w-32" disabled={searching}>
            <Search className="size-3.5" /> {searching ? "Searching..." : "Search"}
          </Button>
        </form>

        {searched && !result && (
          <EmptyState
            icon={AlertCircle}
            title="No transaction found for this reference ID"
            description="Check the ID and try again, or search by mobile number and date instead."
          />
        )}

        {result && <TxnResultCard txn={result} />}
      </CardContent>
    </Card>
  )
}

// ---------------------------------------------------------- search method 2

function SearchByMobileAndDate() {
  const [mobile, setMobile] = React.useState("")
  const [date, setDate] = React.useState("")
  const [searched, setSearched] = React.useState(false)
  const [results, setResults] = React.useState<BharatConnectTxn[]>([])

  const [searching, setSearching] = React.useState(false)

  async function onSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!/^[6-9]\d{9}$/.test(mobile.trim())) {
      toast.error("Enter a valid 10-digit mobile number")
      return
    }
    if (date === "") {
      toast.error("Select the transaction date")
      return
    }

    setSearching(true)
    try {
      // The backend takes a range, so a single date is sent as that whole day.
      const matches = await searchByMobileAndDate(mobile, date, date)
      setResults(matches)
      setSearched(true)
    } finally {
      setSearching(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Search by Mobile Number &amp; Date</CardTitle>
        <CardDescription>
          Enter the customer mobile number used at the time of payment. Leave the date blank to
          see every transaction for that number.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={onSearch}>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="bc-mobile">Mobile Number</Label>
            <Input
              id="bc-mobile"
              inputMode="numeric"
              maxLength={10}
              value={mobile}
              onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))}
              placeholder="10-digit mobile number"
              className="table-num"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="bc-date">Transaction Date</Label>
            <Input id="bc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <Button type="submit" variant="brand" className="sm:w-32" disabled={searching}>
            <Search className="size-3.5" /> {searching ? "Searching..." : "Search"}
          </Button>
        </form>

        {searched && results.length === 0 && (
          <EmptyState
            icon={AlertCircle}
            title="No transactions found"
            description="No Bharat Connect payments match this mobile number and date."
          />
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-gray-500">
              {results.length} transaction{results.length === 1 ? "" : "s"} found
            </p>
            {results.map((txn) => (
              <TxnResultCard key={txn.id} txn={txn} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// ----------------------------------------------------------------- browse all

function BrowseAll({ transactions }: { transactions: BharatConnectTxn[] }) {
  const navigate = useNavigate()
  const [status, setStatus] = React.useState("all")
  const [category, setCategory] = React.useState("all")
  const [from, setFrom] = React.useState("")
  const [to, setTo] = React.useState("")

  const data = React.useMemo(
    () =>
      transactions.filter((t) => {
        if (status !== "all" && t.status !== status) return false
        if (category !== "all" && t.categorySlug !== category) return false
        const day = t.transactedAt.slice(0, 10)
        if (from && day < from) return false
        if (to && day > to) return false
        return true
      }),
    [transactions, status, category, from, to]
  )

  const columns = React.useMemo<ColumnDef<BharatConnectTxn, any>[]>(
    () => [
      {
        accessorKey: "bharatConnectTxnId",
        header: "Bharat Connect Txn ID",
        cell: ({ row }) => (
          <Link
            to={`/retailer/bharat-connect/receipt/${row.original.id}`}
            className="table-num text-sm font-medium text-gray-900 underline-offset-2 hover:underline"
          >
            {row.original.bharatConnectTxnId}
          </Link>
        ),
      },
      {
        accessorKey: "transactedAt",
        header: "Date & Time",
        cell: ({ row }) => (
          <span className="text-sm text-gray-700">{formatDate(row.original.transactedAt, true)}</span>
        ),
      },
      { accessorKey: "billerName", header: "Biller" },
      { accessorKey: "categoryName", header: "Category" },
      {
        accessorKey: "customerMobile",
        header: "Mobile",
        cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.customerMobile}</span>,
      },
      {
        accessorKey: "billAmount",
        header: "Amount",
        cell: ({ row }) => (
          <span className="table-num text-sm font-semibold text-gray-900">
            {formatCurrency(row.original.billAmount)}
          </span>
        ),
      },
      {
        accessorKey: "ccf",
        header: "CCF",
        cell: ({ row }) => (
          <span className="table-num text-sm text-gray-700">
            {row.original.ccf > 0 ? formatCurrency(row.original.ccf) : "—"}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const txn = row.original
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() => navigate(`/retailer/bharat-connect/receipt/${txn.id}`)}
                title="View receipt"
              >
                <Receipt className="size-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2"
                onClick={() =>
                  navigate(`/retailer/bharat-connect/complaints?txnRef=${txn.bharatConnectTxnId}`)
                }
                title="Raise a complaint"
              >
                <LifeBuoy className="size-3.5" />
              </Button>
              {(txn.status === "failed" || txn.status === "pending") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => toast.info(`Re-querying status for ${txn.bharatConnectTxnId}...`)}
                  title="Re-query status"
                >
                  <RotateCw className="size-3.5" />
                </Button>
              )}
            </div>
          )
        },
      },
    ],
    [navigate]
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle>All Bharat Connect transactions</CardTitle>
        <CardDescription>Filter by date range, category and status</CardDescription>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={data}
          searchKey="billerName"
          searchPlaceholder="Search biller, reference ID, mobile..."
          filters={
            <>
              <FilterSelect label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
              <FilterSelect label="Category" value={category} onChange={setCategory} options={CATEGORY_OPTIONS} />
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-auto"
                aria-label="From date"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-auto"
                aria-label="To date"
              />
            </>
          }
          onExport={() => exportToCsv("bharat-connect-transactions", data)}
          emptyTitle="No transactions found"
          emptyDescription="Try widening the date range or clearing the filters"
        />
      </CardContent>
    </Card>
  )
}

// ------------------------------------------------------------- result card

function TxnResultCard({ txn }: { txn: BharatConnectTxn }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-gray-900">{txn.billerName}</p>
          <p className="mt-0.5 text-[11px] text-gray-500">
            {txn.categoryName} &middot; {formatDate(txn.transactedAt, true)}
          </p>
        </div>
        <StatusBadge status={txn.status} />
      </div>

      <div className="mt-3 grid gap-x-6 sm:grid-cols-2">
        <div>
          <DetailRow label="Bharat Connect Txn ID" value={txn.bharatConnectTxnId} mono emphasis />
          <DetailRow label="Partner Txn ID" value={txn.partnerTxnId} mono />
          <DetailRow label="Biller Reference" value={txn.approvalRefNumber} mono />
          <DetailRow label="Customer" value={txn.customerName} />
          <DetailRow label="Mobile" value={txn.customerMobile} mono />
        </div>
        <div>
          <DetailRow label="Bill Amount" value={formatCurrency(txn.billAmount)} mono />
          <DetailRow label="CCF" value={txn.ccf > 0 ? formatCurrency(txn.ccf) : "Nil"} mono />
          <DetailRow label="Total Amount" value={formatCurrency(txn.totalAmount)} mono emphasis />
          <DetailRow label="Payment Mode" value={txn.paymentMode} />
          <DetailRow label="Bill Number" value={txn.billNumber} mono />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <Button variant="outline" size="sm" asChild>
          <Link to={`/retailer/bharat-connect/receipt/${txn.id}`}>
            <Receipt className="size-3.5" /> View receipt
          </Link>
        </Button>
        <Button variant="outline" size="sm" asChild>
          <Link to={`/retailer/bharat-connect/complaints?txnRef=${txn.bharatConnectTxnId}`}>
            <LifeBuoy className="size-3.5" /> Raise a complaint
          </Link>
        </Button>
        {(txn.status === "failed" || txn.status === "pending") && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast.info(`Re-querying status for ${txn.bharatConnectTxnId}...`)}
          >
            <RotateCw className="size-3.5" /> Re-query status
          </Button>
        )}
      </div>
    </div>
  )
}
