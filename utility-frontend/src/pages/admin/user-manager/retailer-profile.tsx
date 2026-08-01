import * as React from "react"
import { useParams, useNavigate } from "react-router-dom"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  ArrowLeft, Wallet, Receipt, ShieldCheck, ShieldAlert, ArrowUpCircle, ArrowDownCircle,
  Eye, Fingerprint, Loader2, Percent, TrendingUp,
} from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { EmptyState } from "@/components/shared/empty-state"
import { ErrorState } from "@/components/shared/error-state"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable } from "@/components/shared/data-table"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import type { ColumnDef } from "@tanstack/react-table"
import { useApiList, useApiQuery, useMutation } from "@/hooks/use-api"
import { api, ApiError } from "@/lib/api"
import type {
  KycDocument, Transaction, WalletLedgerEntry,
} from "@/lib/api-types"
import { formatDate, initials } from "@/lib/utils"
import { formatCount, formatMoney, formatPercent, successRate, toMoneyString, isPositiveAmount } from "@/lib/money"

const adjustSchema = z.object({
  amount: z.string().min(1, "Amount is required").refine((v) => isPositiveAmount(v), "Enter an amount above zero"),
  direction: z.enum(["credit", "debit"]),
  // Required so a balance change is always explainable after the fact.
  narration: z.string().min(5, "Explain why this adjustment is being made"),
})
type AdjustValues = z.infer<typeof adjustSchema>

const KYC_STATUS_OPTIONS = [
  { label: "Verified", value: "verified" },
  { label: "Pending", value: "pending" },
  { label: "Rejected", value: "rejected" },
  { label: "Not submitted", value: "not_submitted" },
]

const ACCOUNT_STATUS_OPTIONS = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
  { label: "Suspended", value: "suspended" },
]

const DOC_LABELS: Record<string, string> = {
  pan: "PAN card",
  aadhaar_front: "Aadhaar (front)",
  aadhaar_back: "Aadhaar (back)",
  shop_photo: "Shop front",
  shop_interior: "Shop interior",
  address_proof: "Address proof",
  cancelled_cheque: "Cancelled cheque",
  gst: "GST certificate",
  other: "Other",
}

export function RetailerProfilePage() {
  const { id = "" } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const profileQuery = useApiQuery(() => api.admin.retailer(id), [id])
  const retailer = profileQuery.data

  const [adjustOpen, setAdjustOpen] = React.useState(false)
  const [pendingAdjust, setPendingAdjust] = React.useState<AdjustValues | null>(null)
  const [kycReason, setKycReason] = React.useState("")
  const [kycStatus, setKycStatus] = React.useState("")
  const [accountStatus, setAccountStatus] = React.useState("")

  React.useEffect(() => {
    if (!retailer) return
    setKycStatus(retailer.kycStatus)
    setAccountStatus(retailer.status)
  }, [retailer])

  const adjustForm = useForm<AdjustValues>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { amount: "", direction: "credit", narration: "" },
  })

  const adjust = useMutation(
    (values: AdjustValues) =>
      api.admin.adjustWallet(id, {
        direction: values.direction,
        amount: toMoneyString(values.amount),
        narration: values.narration,
      }),
    { successMessage: "Wallet adjusted" },
  )

  const setKyc = useMutation(
    (payload: { status: string; reason?: string }) =>
      api.admin.setRetailerKyc(id, payload.status, payload.reason),
    { successMessage: "KYC status updated", onSuccess: () => profileQuery.refetch() },
  )

  const setStatus = useMutation((status: string) => api.admin.setRetailerStatus(id, status), {
    successMessage: "Account status updated",
    onSuccess: () => profileQuery.refetch(),
  })

  const completeAeps = useMutation(() => api.admin.completeAepsOnboarding(id), {
    successMessage: "AEPS onboarding marked complete",
    onSuccess: () => profileQuery.refetch(),
  })

  if (profileQuery.error) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Retailer Profile"
          actions={
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/user-manager")}>
              <ArrowLeft className="size-3.5" /> Back
            </Button>
          }
        />
        <EmptyState title="Retailer not found" description={profileQuery.error} />
      </div>
    )
  }

  if (profileQuery.loading || !retailer) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Retailer Profile" />
        <Card className="p-5">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-3 h-3 w-64" />
        </Card>
      </div>
    )
  }

  async function confirmAdjust() {
    if (!pendingAdjust) return
    const result = await adjust.run(pendingAdjust)
    setPendingAdjust(null)
    if (result !== undefined) {
      adjustForm.reset({ amount: "", direction: "credit", narration: "" })
      setAdjustOpen(false)
      profileQuery.refetch()
    }
  }

  function applyKyc() {
    if (kycStatus === retailer!.kycStatus) {
      toast.info("KYC status is already set to that value")
      return
    }
    // The backend rejects a rejection without a reason; catching it here saves a
    // round trip and keeps the message next to the field.
    if (kycStatus === "rejected" && kycReason.trim() === "") {
      toast.error("A reason is required when rejecting KYC")
      return
    }
    void setKyc.run({ status: kycStatus, reason: kycReason.trim() || undefined })
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Retailer Profile"
        description={`${retailer.name} · ${retailer.merchantCode}`}
        actions={
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/user-manager")}>
            <ArrowLeft className="size-3.5" /> Back to List
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="size-14">
              <AvatarFallback className="text-base">{initials(retailer.name)}</AvatarFallback>
            </Avatar>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold text-gray-900">{retailer.name}</h2>
                <StatusBadge status={retailer.status} />
                <StatusBadge status={retailer.kycStatus} />
              </div>
              <p className="text-sm text-gray-500">{retailer.shopName || retailer.firmName}</p>
              <p className="text-xs text-gray-400">
                {retailer.email} · {retailer.phone}
                {retailer.city ? ` · ${retailer.city}, ${retailer.state}` : ""}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="brand" size="sm" onClick={() => setAdjustOpen(true)}>
              <Wallet className="size-3.5" /> Adjust Wallet
            </Button>
          </div>
        </CardContent>
      </Card>

      <StatsRow retailerId={id} walletBalance={retailer.walletBalance} />

      <Tabs defaultValue="details">
        <TabsList className="flex-wrap">
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="kyc">KYC</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="ledger">Wallet Ledger</TabsTrigger>
          <TabsTrigger value="logins">Sign-ins</TabsTrigger>
          <TabsTrigger value="controls">Controls</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card>
            <CardHeader>
              <CardTitle>Account &amp; Bank Details</CardTitle>
              <CardDescription>As supplied by the retailer</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Field label="Merchant Code" value={retailer.merchantCode} />
                <Field label="User Type" value={retailer.userType || "Retailer"} />
                <Field label="Joined" value={formatDate(retailer.joinedDate)} />
                <Field label="PAN" value={retailer.pan || "Not provided"} />
                <Field label="GSTIN" value={retailer.gstin || "Not provided"} />
                <Field
                  label="Aadhaar"
                  value={retailer.aadhaarLast4 ? `•••• •••• ${retailer.aadhaarLast4}` : "Not provided"}
                />
                <Field label="Shop Name" value={retailer.shopName || "Not set"} />
                <Field label="Firm Name" value={retailer.firmName || "Not set"} />
                <Field label="Pincode" value={retailer.pincode || "Not set"} />
                <Field
                  label="Address"
                  value={retailer.addressLine || "Not set"}
                  className="sm:col-span-3"
                />
                <Field label="Bank" value={retailer.bankName || "Not provided"} />
                <Field label="Account Holder" value={retailer.bankAccountName || "Not provided"} />
                <Field
                  label="Account Number"
                  value={
                    retailer.bankAccountNumber
                      ? `••••••${retailer.bankAccountNumber.slice(-4)}`
                      : "Not provided"
                  }
                />
                <Field label="IFSC" value={retailer.bankIfsc || "Not provided"} />
                <Field label="Nominee" value={retailer.nomineeName || "Not provided"} />
                <Field
                  label="Nominee Contact"
                  value={
                    retailer.nomineeContact
                      ? `${retailer.nomineeContact}${retailer.nomineeRelation ? ` (${retailer.nomineeRelation})` : ""}`
                      : "Not provided"
                  }
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="kyc">
          <KycTab retailerId={id} />
        </TabsContent>

        <TabsContent value="transactions">
          <TransactionsTab retailerId={id} />
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerTab retailerId={id} />
        </TabsContent>

        <TabsContent value="logins">
          <LoginsTab retailerId={id} />
        </TabsContent>

        <TabsContent value="controls">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>KYC Decision</CardTitle>
                <CardDescription>
                  Setting this to verified unlocks every service gated on KYC.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kyc-status">Status</Label>
                  <Select value={kycStatus} onValueChange={setKycStatus}>
                    <SelectTrigger id="kyc-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {KYC_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="kyc-reason">
                    Reason {kycStatus === "rejected" ? "(required)" : "(optional)"}
                  </Label>
                  <Textarea
                    id="kyc-reason"
                    value={kycReason}
                    onChange={(e) => setKycReason(e.target.value)}
                    placeholder="Shown to the retailer on their KYC page"
                  />
                </div>
                <Button variant="brand" disabled={setKyc.pending} onClick={applyKyc}>
                  {setKyc.pending && <Loader2 className="size-3.5 animate-spin" />} Save KYC Decision
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Account Status</CardTitle>
                <CardDescription>
                  Suspending also disables the login, so the retailer cannot sign in at all.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="account-status">Status</Label>
                  <Select value={accountStatus} onValueChange={setAccountStatus}>
                    <SelectTrigger id="account-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      {ACCOUNT_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  variant={accountStatus === "suspended" ? "destructive" : "brand"}
                  disabled={setStatus.pending || accountStatus === retailer.status}
                  onClick={() => void setStatus.run(accountStatus)}
                >
                  {setStatus.pending && <Loader2 className="size-3.5 animate-spin" />} Apply Status
                </Button>
              </CardContent>
            </Card>

            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>AEPS Onboarding</CardTitle>
                <CardDescription>
                  Current status: <span className="font-medium">{retailer.aepsOnboardStatus.replace(/_/g, " ")}</span>
                  {retailer.aepsOnboardedAt ? ` · ${formatDate(retailer.aepsOnboardedAt)}` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-xs text-gray-500">
                  Onboarding completes on the provider's own portal. Mark it complete here once the provider
                  confirms, which is what unlocks AEPS for this retailer.
                </p>
                <div>
                  <Button
                    variant="outline"
                    disabled={completeAeps.pending || retailer.aepsOnboardStatus === "completed"}
                    onClick={() => void completeAeps.run()}
                  >
                    {completeAeps.pending ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Fingerprint className="size-3.5" />
                    )}
                    {retailer.aepsOnboardStatus === "completed" ? "Already Complete" : "Mark Complete"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={adjustOpen} onOpenChange={setAdjustOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Wallet</DialogTitle>
            <DialogDescription>
              Current balance {formatMoney(retailer.walletBalance)}. The adjustment is recorded against your
              account in the ledger.
            </DialogDescription>
          </DialogHeader>

          <form
            id="adjust-form"
            className="flex flex-col gap-4"
            onSubmit={adjustForm.handleSubmit((values) => setPendingAdjust(values))}
          >
            <div className="flex flex-col gap-2">
              <Label>Direction</Label>
              <RadioGroup
                value={adjustForm.watch("direction")}
                onValueChange={(v) => adjustForm.setValue("direction", v as "credit" | "debit")}
                className="grid-flow-col grid-cols-2"
              >
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <RadioGroupItem value="credit" id="adj-credit" /> Credit
                </label>
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <RadioGroupItem value="debit" id="adj-debit" /> Debit
                </label>
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adj-amount">Amount (₹)</Label>
              <Input id="adj-amount" inputMode="decimal" {...adjustForm.register("amount")} />
              {adjustForm.formState.errors.amount && (
                <p className="text-xs text-danger-500">{adjustForm.formState.errors.amount.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="adj-narration">Reason</Label>
              <Textarea
                id="adj-narration"
                placeholder="e.g. Reversing duplicate debit on TXN12345"
                {...adjustForm.register("narration")}
              />
              {adjustForm.formState.errors.narration && (
                <p className="text-xs text-danger-500">{adjustForm.formState.errors.narration.message}</p>
              )}
            </div>
          </form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjustOpen(false)}>Cancel</Button>
            <Button type="submit" form="adjust-form" variant="brand" disabled={adjust.pending}>
              Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!pendingAdjust}
        onOpenChange={(open) => !open && setPendingAdjust(null)}
        title="Confirm adjustment"
        description={
          pendingAdjust
            ? `${pendingAdjust.direction === "credit" ? "Credit" : "Debit"} ${formatMoney(
                toMoneyString(pendingAdjust.amount),
              )} ${pendingAdjust.direction === "credit" ? "to" : "from"} ${retailer.name}'s wallet? This cannot be undone.`
            : undefined
        }
        confirmLabel="Confirm"
        destructive={pendingAdjust?.direction === "debit"}
        onConfirm={() => void confirmAdjust()}
      />
    </div>
  )
}

function Field({
  label, value, className,
}: { label: string; value: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="text-xs font-medium text-gray-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-gray-900">{value}</p>
    </div>
  )
}

/**
 * Headline figures for the retailer.
 *
 * Built from their service report so the counts cover their whole history rather
 * than one page of transactions.
 */
function StatsRow({ retailerId, walletBalance }: { retailerId: string; walletBalance: string }) {
  const txns = useApiList<Transaction>(
    (page) => api.admin.retailerTransactions(retailerId, { page, pageSize: 1 }),
    [retailerId],
  )

  const summary = useApiQuery(
    () => api.admin.retailerTransactions(retailerId, { pageSize: 100 }),
    [retailerId],
    { showErrorToast: false },
  )

  const sample = summary.data?.items ?? []
  const successful = sample.filter((t) => t.status === "success").length
  const commission = sample.reduce((sum, t) => sum + Number(t.commission || 0), 0)

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="Wallet Balance"
        value={formatMoney(walletBalance)}
        icon={Wallet}
        iconClassName="bg-brand-50 text-brand-600"
      />
      <StatCard
        label="Total Transactions"
        value={formatCount(txns.total)}
        icon={Receipt}
        iconClassName="bg-info-bg text-info"
        loading={txns.loading}
      />
      <StatCard
        label="Success Rate (last 100)"
        value={formatPercent(successRate(successful, sample.length))}
        icon={TrendingUp}
        iconClassName="bg-success-bg text-success"
        loading={summary.loading}
      />
      <StatCard
        label="Commission (last 100)"
        value={formatMoney(commission)}
        icon={Percent}
        iconClassName="bg-gray-100 text-gray-600"
        loading={summary.loading}
      />
    </div>
  )
}

function TransactionsTab({ retailerId }: { retailerId: string }) {
  const list = useApiList<Transaction>(
    (page) => api.admin.retailerTransactions(retailerId, { page, pageSize: 25 }),
    [retailerId],
  )

  const columns: ColumnDef<Transaction>[] = [
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
        <span className="table-num text-sm text-success-600">{formatMoney(row.original.commission)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
  ]

  if (list.error) return <ErrorState description={list.error} onRetry={list.refetch} />

  return (
    <DataTable
      columns={columns}
      data={list.items}
      loading={list.loading}
      serverPagination={{
        page: list.page,
        pageSize: list.pageSize,
        total: list.total,
        totalPages: list.totalPages,
        onPageChange: list.setPage,
      }}
      emptyTitle="No transactions yet"
    />
  )
}

function LedgerTab({ retailerId }: { retailerId: string }) {
  const list = useApiList<WalletLedgerEntry>(
    (page) => api.admin.retailerLedger(retailerId, { page, pageSize: 25 }),
    [retailerId],
  )

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
          <p className="text-sm text-gray-800">{row.original.narration || "—"}</p>
          <p className="text-[11px] text-gray-400">{row.original.reason.replace(/_/g, " ")}</p>
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

  if (list.error) return <ErrorState description={list.error} onRetry={list.refetch} />

  return (
    <DataTable
      columns={columns}
      data={list.items}
      loading={list.loading}
      serverPagination={{
        page: list.page,
        pageSize: list.pageSize,
        total: list.total,
        totalPages: list.totalPages,
        onPageChange: list.setPage,
      }}
      emptyTitle="No wallet movements yet"
    />
  )
}

function LoginsTab({ retailerId }: { retailerId: string }) {
  const query = useApiQuery(() => api.admin.retailerLoginHistory(retailerId, 50), [retailerId])
  const entries = query.data ?? []

  if (query.error) return <ErrorState description={query.error} onRetry={query.refetch} />

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign-in History</CardTitle>
        <CardDescription>The last 50 attempts, including failures</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {query.loading ? (
          <div className="flex flex-col gap-3 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : entries.length === 0 ? (
          <p className="p-5 text-sm text-gray-500">No sign-in activity recorded.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start justify-between gap-3 px-5 py-3">
                <div className="flex items-start gap-3">
                  <div
                    className={
                      entry.success
                        ? "flex size-9 items-center justify-center rounded-md bg-success-bg text-success"
                        : "flex size-9 items-center justify-center rounded-md bg-danger-bg text-danger"
                    }
                  >
                    {entry.success ? <ShieldCheck className="size-4" /> : <ShieldAlert className="size-4" />}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{entry.device || "Unknown device"}</p>
                      <Badge variant={entry.success ? "success" : "danger"} className="text-[10px]">
                        {entry.success ? "Success" : "Failed"}
                      </Badge>
                    </div>
                    <p className="table-num text-xs text-gray-500">{entry.ipAddress || "IP not recorded"}</p>
                    {!entry.success && entry.reason && (
                      <p className="text-xs text-danger-600">{entry.reason}</p>
                    )}
                  </div>
                </div>
                <p className="shrink-0 text-xs text-gray-400">{formatDate(entry.createdAt, true)}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function KycTab({ retailerId }: { retailerId: string }) {
  const query = useApiQuery(() => api.admin.retailerKyc(retailerId), [retailerId])
  const application = query.data

  const [reviewTarget, setReviewTarget] = React.useState<KycDocument | null>(null)
  const [decision, setDecision] = React.useState<"verified" | "rejected">("verified")
  const [remarks, setRemarks] = React.useState("")

  const review = useMutation(
    (payload: { docId: string; status: "verified" | "rejected"; remarks?: string }) =>
      api.admin.reviewKycDocument(payload.docId, payload.status, payload.remarks),
    { successMessage: "Document review saved", onSuccess: () => query.refetch() },
  )

  async function openDocument(doc: KycDocument) {
    try {
      const url = await api.admin.kycDocumentPreviewUrl(doc.id)
      window.open(url, "_blank", "noopener,noreferrer")
      // The tab holds its own reference to the blob, so the URL can be released
      // shortly after; keeping it would leak the file for the whole session.
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "That document could not be opened")
    }
  }

  async function submitReview() {
    if (!reviewTarget) return
    if (decision === "rejected" && remarks.trim() === "") {
      toast.error("Remarks are required when rejecting a document")
      return
    }
    const result = await review.run({
      docId: reviewTarget.id,
      status: decision,
      remarks: remarks.trim() || undefined,
    })
    if (result !== undefined) {
      setReviewTarget(null)
      setRemarks("")
    }
  }

  if (query.error) return <ErrorState description={query.error} onRetry={query.refetch} />

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>KYC Application</CardTitle>
          <CardDescription>
            {query.loading
              ? "Loading…"
              : application
                ? `Status ${application.status.replace(/_/g, " ")}${
                    application.submittedAt ? ` · submitted ${formatDate(application.submittedAt)}` : ""
                  } · step ${application.currentStep} of ${application.totalSteps}`
                : "No application on record"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {application && application.missingDocTypes.length > 0 && (
            <p className="mb-3 text-xs text-warning-700">
              Outstanding: {application.missingDocTypes.map((t) => DOC_LABELS[t] ?? t).join(", ")}
            </p>
          )}
          {application?.rejectReason && (
            <p className="mb-3 text-xs text-danger-600">Rejection reason on file: {application.rejectReason}</p>
          )}

          {query.loading ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : !application?.documents || application.documents.length === 0 ? (
            <p className="text-sm text-gray-500">No documents uploaded yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {application.documents.map((doc) => (
                <div
                  key={doc.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-gray-200 px-4 py-3"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">
                        {DOC_LABELS[doc.docType] ?? doc.docType}
                      </p>
                      <StatusBadge status={doc.status} />
                    </div>
                    <p className="text-xs text-gray-500">
                      {doc.name} · {(doc.fileSize / 1024).toFixed(0)} KB · uploaded{" "}
                      {formatDate(doc.uploadedAt)}
                    </p>
                    {doc.docNumber && (
                      <p className="table-num text-[11px] text-gray-400">{doc.docNumber}</p>
                    )}
                    {doc.remarks && <p className="text-xs text-danger-600">Note: {doc.remarks}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => void openDocument(doc)}>
                      <Eye className="size-3.5" /> View
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setReviewTarget(doc)
                        setDecision(doc.status === "rejected" ? "rejected" : "verified")
                        setRemarks(doc.remarks ?? "")
                      }}
                    >
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review Document</DialogTitle>
            <DialogDescription>
              {reviewTarget ? DOC_LABELS[reviewTarget.docType] ?? reviewTarget.docType : ""}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label>Decision</Label>
              <RadioGroup
                value={decision}
                onValueChange={(v) => setDecision(v as "verified" | "rejected")}
                className="grid-flow-col grid-cols-2"
              >
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <RadioGroupItem value="verified" id="doc-verified" /> Verify
                </label>
                <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                  <RadioGroupItem value="rejected" id="doc-rejected" /> Reject
                </label>
              </RadioGroup>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc-remarks">
                Remarks {decision === "rejected" ? "(required)" : "(optional)"}
              </Label>
              <Textarea
                id="doc-remarks"
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                placeholder="Shown to the retailer next to this document"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setReviewTarget(null)}>Cancel</Button>
            <Button variant="brand" disabled={review.pending} onClick={() => void submitReview()}>
              {review.pending && <Loader2 className="size-3.5 animate-spin" />} Save Review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
