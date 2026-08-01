import * as React from "react"
import { toast } from "sonner"
import type { ColumnDef } from "@tanstack/react-table"
import { Wallet, CheckCircle2, XCircle, ListChecks, Check, X } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { DataTable } from "@/components/shared/data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs"
import { formatDate } from "@/lib/utils"
import { api } from "@/lib/api"
import type { FundRequest } from "@/lib/api-types"
import { formatMoney, toNumberOrZero } from "@/lib/money"
import { useApiList, useMutation } from "@/hooks/use-api"

function isToday(dateStr: string) {
  const d = new Date(dateStr)
  const now = new Date()
  return d.toDateString() === now.toDateString()
}

export function FundRequestsPage() {
  // A larger page size than the tables display: the summary tiles below are
  // computed from this set, so a small page would understate them.
  const list = useApiList<FundRequest>((page) => api.admin.fundRequests({ page, pageSize: 100 }), [])

  const [approveTarget, setApproveTarget] = React.useState<FundRequest | null>(null)
  const [rejectTarget, setRejectTarget] = React.useState<FundRequest | null>(null)
  const [rejectionReason, setRejectionReason] = React.useState("")
  const [approveNote, setApproveNote] = React.useState("")

  const requests = list.items

  const totalPendingAmount = React.useMemo(
    () =>
      requests
        .filter((r) => r.status === "pending")
        .reduce((sum, r) => sum + toNumberOrZero(r.amount), 0),
    [requests],
  )
  const approvedToday = React.useMemo(
    () =>
      requests
        .filter((r) => r.status === "approved" && r.reviewedAt && isToday(r.reviewedAt))
        .reduce((sum, r) => sum + toNumberOrZero(r.amount), 0),
    [requests],
  )
  const rejectedToday = React.useMemo(
    () => requests.filter((r) => r.status === "rejected" && r.reviewedAt && isToday(r.reviewedAt)).length,
    [requests],
  )

  // Approving credits the retailer's wallet server-side, so the list is refetched
  // rather than patched locally: the authoritative balance and status come back
  // from the server.
  const approve = useMutation(
    (id: string, note: string) => api.admin.approveFundRequest(id, note),
    {
      successMessage: "Fund request approved and wallet credited",
      onSuccess: () => {
        list.refetch()
        setApproveTarget(null)
        setApproveNote("")
      },
    },
  )

  const reject = useMutation((id: string, reason: string) => api.admin.rejectFundRequest(id, reason), {
    successMessage: "Fund request rejected",
    onSuccess: () => {
      list.refetch()
      setRejectTarget(null)
      setRejectionReason("")
    },
  })

  function handleApprove() {
    if (!approveTarget) return
    void approve.run(approveTarget.id, approveNote)
  }

  function handleReject() {
    if (!rejectTarget) return
    // The backend requires a reason, so it is enforced here too rather than
    // letting the request fail after the dialog closes.
    if (rejectionReason.trim() === "") {
      toast.error("A rejection reason is required")
      return
    }
    void reject.run(rejectTarget.id, rejectionReason.trim())
  }

  function buildColumns(showActions: boolean): ColumnDef<FundRequest, any>[] {
    const base: ColumnDef<FundRequest, any>[] = [
      { accessorKey: "retailer", header: "Retailer" },
      {
        accessorKey: "amount",
        header: "Amount",
        cell: ({ row }) => (
          <span className="table-num font-medium text-gray-900">{formatMoney(row.original.amount)}</span>
        ),
      },
      { accessorKey: "mode", header: "Mode" },
      { accessorKey: "bank", header: "Bank" },
      {
        accessorKey: "utr",
        header: "UTR",
        cell: ({ row }) => (
          <span className="font-mono text-xs text-gray-500">{row.original.utr || "—"}</span>
        ),
      },
      {
        accessorKey: "createdAt",
        header: "Requested",
        cell: ({ row }) => (
          <span className="text-xs text-gray-500">{formatDate(row.original.createdAt, true)}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
    ]

    if (showActions) {
      base.push({
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={approve.pending || reject.pending}
              onClick={() => setApproveTarget(row.original)}
            >
              <Check className="size-3.5" /> Approve
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={approve.pending || reject.pending}
              onClick={() => setRejectTarget(row.original)}
            >
              <X className="size-3.5" /> Reject
            </Button>
          </div>
        ),
      })
    }

    return base
  }

  // Rebuilt when the mutation pending state changes so the action buttons
  // disable while a review is in flight, which is what stops a double approval.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const pendingColumns = React.useMemo(() => buildColumns(true), [approve.pending, reject.pending])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const columns = React.useMemo(() => buildColumns(false), [])

  const pending = requests.filter((r) => r.status === "pending")
  const approved = requests.filter((r) => r.status === "approved")
  const rejected = requests.filter((r) => r.status === "rejected")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fund Requests"
        description="Review and manage retailer fund add requests"
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Total Pending Amount"
          value={formatMoney(totalPendingAmount)}
          icon={Wallet}
          iconClassName="bg-warning-bg text-warning"
        />
        <StatCard
          label="Approved Today"
          value={formatMoney(approvedToday)}
          icon={CheckCircle2}
          iconClassName="bg-success-bg text-success"
        />
        <StatCard
          label="Rejected Today"
          value={String(rejectedToday)}
          icon={XCircle}
          iconClassName="bg-danger-bg text-danger"
        />
        <StatCard
          label="Total Requests"
          value={String(requests.length)}
          icon={ListChecks}
          iconClassName="bg-info-bg text-info"
        />
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
          <TabsTrigger value="approved">Approved ({approved.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejected.length})</TabsTrigger>
          <TabsTrigger value="history">History ({requests.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <DataTable
            columns={pendingColumns}
            data={pending}
            searchKey="retailer"
            searchPlaceholder="Search retailer..."
            emptyTitle="No pending requests"
            emptyDescription="All fund requests have been processed."
          />
        </TabsContent>

        <TabsContent value="approved">
          <DataTable
            columns={columns}
            data={approved}
            searchKey="retailer"
            searchPlaceholder="Search retailer..."
            emptyTitle="No approved requests"
          />
        </TabsContent>

        <TabsContent value="rejected">
          <DataTable
            columns={columns}
            data={rejected}
            searchKey="retailer"
            searchPlaceholder="Search retailer..."
            emptyTitle="No rejected requests"
          />
        </TabsContent>

        <TabsContent value="history">
          <DataTable
            columns={columns}
            data={requests}
            searchKey="retailer"
            searchPlaceholder="Search retailer..."
            emptyTitle="No fund requests found"
          />
        </TabsContent>
      </Tabs>

      <ConfirmDialog
        open={!!approveTarget}
        onOpenChange={(open) => !open && setApproveTarget(null)}
        title="Approve fund request?"
        description={
          approveTarget
            ? `Approve ${formatMoney(approveTarget.amount)} fund request from ${approveTarget.retailer}? This will credit their wallet.`
            : undefined
        }
        confirmLabel="Approve"
        onConfirm={handleApprove}
      />

      <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectionReason("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject fund request</DialogTitle>
            <DialogDescription>
              {rejectTarget
                ? `Provide a reason for rejecting ${formatMoney(rejectTarget.amount)} request from ${rejectTarget.retailer}.`
                : undefined}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="rejection-reason">Rejection reason</Label>
            <Textarea
              id="rejection-reason"
              placeholder="e.g. UTR could not be verified against bank statement"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectionReason("") }}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={!rejectionReason.trim()} onClick={handleReject}>
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
