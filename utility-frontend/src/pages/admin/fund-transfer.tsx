import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowLeftRight, Send, Wallet } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { DataTable } from "@/components/shared/data-table"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { ErrorState } from "@/components/shared/error-state"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { useApiQuery, useMutation, useDebounced } from "@/hooks/use-api"
import { api } from "@/lib/api"
import type { AdminLedgerEntry, RetailerSummary } from "@/lib/api-types"
import { formatDate } from "@/lib/utils"
import { formatMoney, isPositiveAmount, toMoneyString } from "@/lib/money"

/** Matches the backend's own guard: amounts must be positive decimals. */
const amountField = z
  .string()
  .min(1, "Amount is required")
  .refine((v) => isPositiveAmount(v), "Enter an amount greater than zero")

const transferSchema = z
  .object({
    fromRetailerId: z.string().min(1, "Select the retailer to debit"),
    toRetailerId: z.string().min(1, "Select the retailer to credit"),
    amount: amountField,
    narration: z.string().max(200, "Narration must be under 200 characters"),
  })
  .refine((d) => d.fromRetailerId !== d.toRetailerId, {
    message: "Pick two different retailers",
    path: ["toRetailerId"],
  })

const adjustSchema = z.object({
  retailerId: z.string().min(1, "Select a retailer"),
  direction: z.enum(["credit", "debit"]),
  amount: amountField,
  // Required, not optional: an unexplained balance change cannot be audited, and
  // the backend rejects it anyway.
  narration: z.string().min(4, "Explain why this adjustment is being made").max(200, "Keep it under 200 characters"),
})

type TransferForm = z.infer<typeof transferSchema>
type AdjustForm = z.infer<typeof adjustSchema>

/** Renders a retailer for a picker, including their current balance. */
function retailerLabel(r: RetailerSummary): string {
  const name = r.user?.name ?? r.shopName
  return `${r.shopName || name} · ${r.merchantCode} · ${formatMoney(r.walletBalance)}`
}

export function FundTransferPage() {
  const [search, setSearch] = React.useState("")
  const debouncedSearch = useDebounced(search)

  // Only active retailers are offered: crediting a suspended account puts money
  // somewhere it cannot be spent.
  const retailerQuery = useApiQuery(
    () => api.admin.retailers({ pageSize: 100, status: "active", search: debouncedSearch.trim() || undefined }),
    [debouncedSearch],
    { showErrorToast: false },
  )
  const retailers = retailerQuery.data?.items ?? []

  // Recent movements come from the ledger filtered to the two reasons this page
  // can produce, so it reflects real activity rather than a local list.
  const recent = useApiQuery(
    () => api.admin.walletLedger({ pageSize: 15, reason: "admin_adjustment" }),
    [],
  )

  const transferForm = useForm<TransferForm>({
    resolver: zodResolver(transferSchema),
    defaultValues: { fromRetailerId: "", toRetailerId: "", amount: "", narration: "" },
  })

  const adjustForm = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: { retailerId: "", direction: "credit", amount: "", narration: "" },
  })

  const [pendingTransfer, setPendingTransfer] = React.useState<TransferForm | null>(null)
  const [pendingAdjust, setPendingAdjust] = React.useState<AdjustForm | null>(null)

  const transfer = useMutation(
    (values: TransferForm) =>
      api.admin.fundTransfer({
        fromRetailerId: values.fromRetailerId,
        toRetailerId: values.toRetailerId,
        amount: toMoneyString(values.amount),
        narration: values.narration,
      }),
    { successMessage: "Transfer complete" },
  )

  const adjust = useMutation(
    (values: AdjustForm) =>
      api.admin.adjustWallet(values.retailerId, {
        direction: values.direction,
        amount: toMoneyString(values.amount),
        narration: values.narration,
      }),
    { successMessage: "Wallet adjusted" },
  )

  async function confirmTransfer() {
    if (!pendingTransfer) return
    const result = await transfer.run(pendingTransfer)
    setPendingTransfer(null)
    if (result !== undefined) {
      transferForm.reset({ fromRetailerId: "", toRetailerId: "", amount: "", narration: "" })
      retailerQuery.refetch()
      recent.refetch()
    }
  }

  async function confirmAdjust() {
    if (!pendingAdjust) return
    const result = await adjust.run(pendingAdjust)
    setPendingAdjust(null)
    if (result !== undefined) {
      adjustForm.reset({ retailerId: "", direction: "credit", amount: "", narration: "" })
      retailerQuery.refetch()
      recent.refetch()
    }
  }

  const columns: ColumnDef<AdminLedgerEntry>[] = [
    {
      accessorKey: "createdAt",
      header: "Date",
      cell: ({ row }) => <span className="text-xs text-gray-500">{formatDate(row.original.createdAt, true)}</span>,
    },
    {
      accessorKey: "retailer",
      header: "Retailer",
      cell: ({ row }) => (
        <div>
          <p className="text-sm text-gray-900">{row.original.retailer || "Unknown"}</p>
          <p className="table-num text-[11px] text-gray-400">{row.original.merchantCode}</p>
        </div>
      ),
    },
    {
      accessorKey: "narration",
      header: "Narration",
      cell: ({ row }) => <span className="text-sm text-gray-700">{row.original.narration || "—"}</span>,
    },
    {
      accessorKey: "direction",
      header: "Direction",
      cell: ({ row }) => (
        <span
          className={
            row.original.direction === "credit"
              ? "text-sm font-medium text-success-600"
              : "text-sm font-medium text-danger-600"
          }
        >
          {row.original.direction === "credit" ? "Credit" : "Debit"}
        </span>
      ),
    },
    {
      accessorKey: "amount",
      header: "Amount",
      cell: ({ row }) => (
        <span className="table-num font-medium text-gray-900">{formatMoney(row.original.amount)}</span>
      ),
    },
    {
      accessorKey: "balanceAfter",
      header: "Balance After",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-600">{formatMoney(row.original.balanceAfter)}</span>
      ),
    },
  ]

  const fromRetailer = retailers.find((r) => r.id === pendingTransfer?.fromRetailerId)
  const toRetailer = retailers.find((r) => r.id === pendingTransfer?.toRetailerId)
  const adjustRetailer = retailers.find((r) => r.id === pendingAdjust?.retailerId)

  const emptyRetailers = !retailerQuery.loading && retailers.length === 0

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Fund Transfer"
        description="Move funds between retailer wallets or adjust a balance manually"
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Move Funds</CardTitle>
            <CardDescription>
              Both actions write to the wallet ledger against your account, so they are permanently attributable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emptyRetailers ? (
              <p className="text-sm text-gray-500">
                No active retailers found. Activate a retailer before moving funds.
              </p>
            ) : (
              <Tabs defaultValue="transfer">
                <TabsList className="w-full">
                  <TabsTrigger value="transfer" className="flex-1">
                    <ArrowLeftRight className="size-3.5" /> Transfer
                  </TabsTrigger>
                  <TabsTrigger value="adjust" className="flex-1">
                    <Wallet className="size-3.5" /> Adjust
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="transfer">
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={transferForm.handleSubmit((values) => setPendingTransfer(values))}
                  >
                    <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      Moves money from one retailer's wallet to another. The sending wallet must hold the full
                      amount; the transfer is rejected rather than partially applied.
                    </p>

                    <RetailerField
                      label="Debit from"
                      value={transferForm.watch("fromRetailerId")}
                      onChange={(v) => transferForm.setValue("fromRetailerId", v, { shouldValidate: true })}
                      retailers={retailers}
                      loading={retailerQuery.loading}
                      search={search}
                      onSearchChange={setSearch}
                      error={transferForm.formState.errors.fromRetailerId?.message}
                    />

                    <RetailerField
                      label="Credit to"
                      value={transferForm.watch("toRetailerId")}
                      onChange={(v) => transferForm.setValue("toRetailerId", v, { shouldValidate: true })}
                      retailers={retailers}
                      loading={retailerQuery.loading}
                      search={search}
                      onSearchChange={setSearch}
                      error={transferForm.formState.errors.toRetailerId?.message}
                    />

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="transfer-amount">Amount (₹)</Label>
                      <Input
                        id="transfer-amount"
                        inputMode="decimal"
                        placeholder="e.g. 5000"
                        {...transferForm.register("amount")}
                      />
                      {transferForm.formState.errors.amount && (
                        <p className="text-xs text-danger-500">{transferForm.formState.errors.amount.message}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="transfer-narration">Narration (optional)</Label>
                      <Textarea
                        id="transfer-narration"
                        placeholder="e.g. Reallocating float between outlets"
                        {...transferForm.register("narration")}
                      />
                    </div>

                    <Button type="submit" variant="brand" disabled={transfer.pending}>
                      <Send className="size-3.5" /> Transfer Funds
                    </Button>
                  </form>
                </TabsContent>

                <TabsContent value="adjust">
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={adjustForm.handleSubmit((values) => setPendingAdjust(values))}
                  >
                    <p className="rounded-md bg-warning-50 px-3 py-2 text-xs text-warning-700">
                      A manual adjustment has no counterparty. Use it only to correct a recorded error, and say
                      what you are correcting.
                    </p>

                    <RetailerField
                      label="Retailer"
                      value={adjustForm.watch("retailerId")}
                      onChange={(v) => adjustForm.setValue("retailerId", v, { shouldValidate: true })}
                      retailers={retailers}
                      loading={retailerQuery.loading}
                      search={search}
                      onSearchChange={setSearch}
                      error={adjustForm.formState.errors.retailerId?.message}
                    />

                    <div className="flex flex-col gap-2">
                      <Label>Direction</Label>
                      <Controller
                        control={adjustForm.control}
                        name="direction"
                        render={({ field }) => (
                          <RadioGroup
                            value={field.value}
                            onValueChange={field.onChange}
                            className="grid-flow-col grid-cols-2"
                          >
                            <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                              <RadioGroupItem value="credit" id="adj-credit" /> Credit
                            </label>
                            <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                              <RadioGroupItem value="debit" id="adj-debit" /> Debit
                            </label>
                          </RadioGroup>
                        )}
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="adjust-amount">Amount (₹)</Label>
                      <Input
                        id="adjust-amount"
                        inputMode="decimal"
                        placeholder="e.g. 250"
                        {...adjustForm.register("amount")}
                      />
                      {adjustForm.formState.errors.amount && (
                        <p className="text-xs text-danger-500">{adjustForm.formState.errors.amount.message}</p>
                      )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor="adjust-narration">Reason</Label>
                      <Textarea
                        id="adjust-narration"
                        placeholder="e.g. Reversing duplicate debit on TXN12345"
                        {...adjustForm.register("narration")}
                      />
                      {adjustForm.formState.errors.narration && (
                        <p className="text-xs text-danger-500">{adjustForm.formState.errors.narration.message}</p>
                      )}
                    </div>

                    <Button type="submit" variant="brand" disabled={adjust.pending}>
                      <Wallet className="size-3.5" /> Apply Adjustment
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Manual Adjustments</CardTitle>
            <CardDescription>
              Wallet movements recorded with the admin-adjustment reason, newest first
            </CardDescription>
          </CardHeader>
          <CardContent>
            {recent.error ? (
              <ErrorState description={recent.error} onRetry={recent.refetch} />
            ) : (
              <DataTable
                columns={columns}
                data={recent.data?.items ?? []}
                loading={recent.loading}
                emptyTitle="No manual adjustments yet"
                emptyDescription="Adjustments you make will appear here."
              />
            )}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={!!pendingTransfer}
        onOpenChange={(open) => !open && setPendingTransfer(null)}
        title="Confirm transfer"
        description={
          pendingTransfer
            ? `Move ${formatMoney(toMoneyString(pendingTransfer.amount))} from ${
                fromRetailer?.shopName ?? "the selected retailer"
              } to ${toRetailer?.shopName ?? "the selected retailer"}? This writes to both ledgers and cannot be undone.`
            : undefined
        }
        confirmLabel="Confirm & Transfer"
        onConfirm={() => void confirmTransfer()}
      />

      <ConfirmDialog
        open={!!pendingAdjust}
        onOpenChange={(open) => !open && setPendingAdjust(null)}
        title="Confirm adjustment"
        description={
          pendingAdjust
            ? `${pendingAdjust.direction === "credit" ? "Credit" : "Debit"} ${formatMoney(
                toMoneyString(pendingAdjust.amount),
              )} ${pendingAdjust.direction === "credit" ? "to" : "from"} ${
                adjustRetailer?.shopName ?? "the selected retailer"
              }'s wallet (current balance ${formatMoney(
                adjustRetailer?.walletBalance ?? "0",
              )})? This is recorded against your account and cannot be undone.`
            : undefined
        }
        confirmLabel="Confirm & Apply"
        destructive={pendingAdjust?.direction === "debit"}
        onConfirm={() => void confirmAdjust()}
      />
    </div>
  )
}

/**
 * A retailer picker with server-side search.
 *
 * The list is capped at 100 rows, so a deployment with more retailers needs the
 * search box to reach the rest; a plain select would silently hide them.
 */
function RetailerField({
  label, value, onChange, retailers, loading, search, onSearchChange, error,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  retailers: RetailerSummary[]
  loading: boolean
  search: string
  onSearchChange: (value: string) => void
  error?: string
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>{label}</Label>
      <Input
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search by name, shop or merchant code"
        className="h-8 text-xs"
      />
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder={loading ? "Loading retailers..." : "Select retailer"} />
        </SelectTrigger>
        <SelectContent>
          {retailers.map((r) => (
            <SelectItem key={r.id} value={r.id}>{retailerLabel(r)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-xs text-danger-500">{error}</p>}
    </div>
  )
}
