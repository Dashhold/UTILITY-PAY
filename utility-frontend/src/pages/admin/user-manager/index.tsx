import * as React from "react"
import { useNavigate } from "react-router-dom"
import type { ColumnDef } from "@tanstack/react-table"
import { Eye, MoreHorizontal, Power, PowerOff, Ban } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { exportToCsv, formatDate, initials } from "@/lib/utils"
import { api } from "@/lib/api"
import type { RetailerSummary } from "@/lib/api-types"
import { formatMoney } from "@/lib/money"
import { useApiList, useDebounced, useMutation } from "@/hooks/use-api"

const STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Suspended", value: "suspended" },
]

const KYC_OPTIONS = [
  { label: "Verified", value: "verified" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
  { label: "Not Submitted", value: "not_submitted" },
]

type PendingAction = { type: "toggle" | "suspend"; retailer: RetailerSummary } | null

/** The retailer's personal name, falling back to the shop when absent. */
function displayName(r: RetailerSummary): string {
  return r.user?.name ?? r.shopName
}

export function UserManagerPage() {
  const navigate = useNavigate()

  const [search, setSearch] = React.useState("")
  const [statusFilter, setStatusFilter] = React.useState("all")
  const [kycFilter, setKycFilter] = React.useState("all")
  const [pendingAction, setPendingAction] = React.useState<PendingAction>(null)

  const debouncedSearch = useDebounced(search)

  // Filtering happens server-side so the list stays correct beyond the first
  // page; filtering a single page client-side would silently hide matches.
  const list = useApiList<RetailerSummary>(
    (page) =>
      api.admin.retailers({
        page,
        pageSize: 25,
        search: debouncedSearch.trim() || undefined,
        status: statusFilter === "all" ? undefined : statusFilter,
        kycStatus: kycFilter === "all" ? undefined : kycFilter,
      }),
    [debouncedSearch, statusFilter, kycFilter],
  )

  const setStatus = useMutation(
    (id: string, status: string) => api.admin.setRetailerStatus(id, status),
    {
      onSuccess: () => {
        list.refetch()
        setPendingAction(null)
      },
    },
  )

  function applyAction() {
    if (!pendingAction) return
    const { type, retailer } = pendingAction

    // Suspending also disables the login account server-side, which is why this
    // goes through the API rather than a local status flip.
    const nextStatus = type === "suspend" ? "suspended" : retailer.status === "active" ? "inactive" : "active"

    void setStatus.run(retailer.id, nextStatus)
  }

  const columns: ColumnDef<RetailerSummary, any>[] = [
    {
      id: "name",
      header: "Retailer",
      cell: ({ row }) => (
        <div className="flex items-center gap-3">
          <Avatar className="size-8">
            <AvatarFallback className="text-[10px]">{initials(displayName(row.original))}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">{displayName(row.original)}</p>
            <p className="truncate text-xs text-gray-500">{row.original.user?.email ?? "—"}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "merchantCode",
      header: "Merchant Code",
      cell: ({ row }) => (
        <span className="font-mono text-xs text-gray-700">{row.original.merchantCode || "—"}</span>
      ),
    },
    {
      accessorKey: "shopName",
      header: "Shop Name",
      cell: ({ row }) => <span className="text-sm text-gray-700">{row.original.shopName}</span>,
    },
    {
      id: "location",
      header: "City / State",
      cell: ({ row }) => (
        <div>
          <p className="text-sm text-gray-900">{row.original.city}</p>
          <p className="text-xs text-gray-500">{row.original.state}</p>
        </div>
      ),
    },
    {
      accessorKey: "walletBalance",
      header: "Wallet Balance",
      cell: ({ row }) => (
        <span className="table-num text-sm font-semibold text-gray-900">
          {formatMoney(row.original.walletBalance)}
        </span>
      ),
    },
    {
      accessorKey: "kycStatus",
      header: "KYC Status",
      cell: ({ row }) => <StatusBadge status={row.original.kycStatus} />,
    },
    {
      accessorKey: "status",
      header: "Account Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: "joinedDate",
      header: "Joined",
      cell: ({ row }) => <span className="text-sm text-gray-600">{formatDate(row.original.joinedDate)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const retailer = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`/admin/user-manager/${retailer.id}`)}>
                <Eye /> View Profile
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setPendingAction({ type: "toggle", retailer })}>
                {retailer.status === "active" ? <PowerOff /> : <Power />}
                {retailer.status === "active" ? "Disable" : "Enable"}
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                disabled={retailer.status === "suspended"}
                onClick={() => setPendingAction({ type: "suspend", retailer })}
              >
                <Ban /> Suspend
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="User Manager" description="Manage retailer accounts, KYC and access status" />

      <DataTable
        columns={columns}
        data={list.items}
        loading={list.loading}
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by name, shop, merchant code, email or phone..."
        onExport={() => exportToCsv("retailers", list.items)}
        filters={
          <>
            <FilterSelect label="Status" value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} />
            <FilterSelect label="KYC Status" value={kycFilter} onChange={setKycFilter} options={KYC_OPTIONS} />
          </>
        }
        serverPagination={{
          page: list.page,
          pageSize: list.pageSize,
          total: list.total,
          totalPages: list.totalPages,
          onPageChange: list.setPage,
        }}
        emptyTitle="No retailers found"
        emptyDescription="Try adjusting your search or filters"
      />

      <ConfirmDialog
        open={!!pendingAction}
        onOpenChange={(open) => !open && setPendingAction(null)}
        title={
          pendingAction?.type === "suspend"
            ? `Suspend ${displayName(pendingAction.retailer)}?`
            : `${pendingAction?.retailer.status === "active" ? "Disable" : "Enable"} ${pendingAction ? displayName(pendingAction.retailer) : ""}?`
        }
        description={
          pendingAction?.type === "suspend"
            ? "This will block the retailer from accessing the platform and processing transactions."
            : "This will change the retailer's ability to log in and transact."
        }
        confirmLabel={pendingAction?.type === "suspend" ? "Suspend" : "Confirm"}
        destructive={pendingAction?.type === "suspend"}
        onConfirm={applyAction}
      />
    </div>
  )
}
