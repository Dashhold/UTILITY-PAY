import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, MoreHorizontal, Pencil, Trash2, Landmark, CheckCircle2, Users } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMasterResource } from "@/hooks/use-master-resource"
import { exportToCsv } from "@/lib/utils"
import { formatCount } from "@/lib/money"

/** A payout bank as the API returns it. */
interface PayoutBankRecord {
  id: string
  bankName: string
  accountNumber: string
  ifsc: string
  branch: string
  linkedRetailers: number
  status: "active" | "inactive"
}

const payoutBankSchema = z.object({
  bankName: z.string().min(2, "Bank name is required"),
  accountNumber: z.string().regex(/^\d{9,18}$/, "Account number must be 9-18 digits"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code (e.g. HDFC0000060)"),
  branch: z.string().min(2, "Branch is required"),
  status: z.boolean(),
})

type FormValues = z.infer<typeof payoutBankSchema>

const EMPTY_FORM: FormValues = {
  bankName: "", accountNumber: "", ifsc: "", branch: "", status: true,
}

function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber
  return `••••••${accountNumber.slice(-4)}`
}

export function PayoutBanksPage() {
  const resource = useMasterResource<PayoutBankRecord>("payout-banks", { label: "Payout bank" })

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PayoutBankRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<PayoutBankRecord | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(payoutBankSchema),
    defaultValues: EMPTY_FORM,
  })

  function openAdd() {
    setEditing(null)
    form.reset(EMPTY_FORM)
    setSheetOpen(true)
  }

  function openEdit(bank: PayoutBankRecord) {
    setEditing(bank)
    form.reset({
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      ifsc: bank.ifsc,
      branch: bank.branch ?? "",
      status: bank.status === "active",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      bankName: values.bankName,
      accountNumber: values.accountNumber,
      ifsc: values.ifsc.toUpperCase(),
      branch: values.branch,
      status: values.status ? "active" : "inactive",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as unknown as Partial<PayoutBankRecord>)

    if (result !== undefined) setSheetOpen(false)
  }

  function toggleStatus(bank: PayoutBankRecord) {
    void resource.update(bank.id, {
      status: bank.status === "active" ? "inactive" : "active",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  const columns: ColumnDef<PayoutBankRecord>[] = [
    {
      accessorKey: "bankName",
      header: "Bank",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-gray-100">
            <Landmark className="size-4 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">{row.original.bankName}</p>
            <p className="text-xs text-gray-500">{row.original.branch || "Branch not set"}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "accountNumber",
      header: "Account Number",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-700">{maskAccountNumber(row.original.accountNumber)}</span>
      ),
    },
    {
      accessorKey: "ifsc",
      header: "IFSC",
      cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.ifsc}</span>,
    },
    {
      accessorKey: "linkedRetailers",
      header: "Linked Retailers",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-700">{formatCount(row.original.linkedRetailers)}</span>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.original.status === "active"}
            disabled={resource.saving}
            onCheckedChange={() => toggleStatus(row.original)}
          />
          <StatusBadge status={row.original.status} />
        </div>
      ),
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8">
              <MoreHorizontal className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => openEdit(row.original)}>
              <Pencil className="size-3.5" /> Edit
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(row.original)}>
              <Trash2 className="size-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  // Counts describe the page in view. The list endpoint paginates and returns no
  // status breakdown, so calling these platform-wide totals would be wrong.
  const activeOnPage = resource.items.filter((b) => b.status === "active").length
  const linkedOnPage = resource.items.reduce((sum, b) => sum + b.linkedRetailers, 0)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Payout Banks"
        description="Accounts used to settle commission and payouts to retailers"
        actions={
          <Button variant="brand" size="sm" onClick={openAdd}>
            <Plus className="size-3.5" /> Add Payout Bank
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Payout Banks"
          value={formatCount(resource.total)}
          icon={Landmark}
          iconClassName="bg-brand-50 text-brand-600"
          loading={resource.loading}
        />
        <StatCard
          label="Active (this page)"
          value={formatCount(activeOnPage)}
          icon={CheckCircle2}
          iconClassName="bg-success-bg text-success"
          loading={resource.loading}
        />
        <StatCard
          label="Linked Retailers (this page)"
          value={formatCount(linkedOnPage)}
          icon={Users}
          iconClassName="bg-info-bg text-info"
          loading={resource.loading}
        />
      </div>

      <DataTable
        columns={columns}
        data={resource.items}
        loading={resource.loading}
        searchValue={resource.search}
        onSearchChange={resource.setSearch}
        searchPlaceholder="Search by bank, account number or IFSC..."
        filters={
          <FilterSelect
            label="Status"
            value={resource.statusFilter}
            onChange={resource.setStatusFilter}
            options={[
              { label: "Active", value: "active" },
              { label: "Inactive", value: "inactive" },
            ]}
          />
        }
        serverPagination={{
          page: resource.page,
          pageSize: resource.pageSize,
          total: resource.total,
          totalPages: resource.totalPages,
          onPageChange: resource.setPage,
        }}
        onExport={() =>
          exportToCsv(
            "payout-banks",
            resource.items.map((b) => ({
              bankName: b.bankName,
              accountNumber: maskAccountNumber(b.accountNumber),
              ifsc: b.ifsc,
              branch: b.branch,
              linkedRetailers: b.linkedRetailers,
              status: b.status,
            })),
          )
        }
        emptyTitle="No payout banks configured"
        emptyDescription="Add a bank account to start settling payouts to retailers"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Payout Bank" : "Add Payout Bank"}</SheetTitle>
            <SheetDescription>
              {editing
                ? "Update the settlement account details."
                : "Add a settlement account for retailer payouts."}
            </SheetDescription>
          </SheetHeader>

          <form
            id="payout-bank-form"
            className="flex flex-1 flex-col gap-4 overflow-y-auto py-2"
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bankName">Bank Name</Label>
              <Input id="bankName" placeholder="e.g. HDFC Bank" {...form.register("bankName")} />
              {form.formState.errors.bankName && (
                <p className="text-xs text-danger-500">{form.formState.errors.bankName.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                inputMode="numeric"
                placeholder="e.g. 50100234567890"
                {...form.register("accountNumber")}
              />
              {form.formState.errors.accountNumber && (
                <p className="text-xs text-danger-500">{form.formState.errors.accountNumber.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ifsc">IFSC Code</Label>
              <Input
                id="ifsc"
                className="uppercase"
                placeholder="e.g. HDFC0000060"
                {...form.register("ifsc", {
                  onChange: (e) => {
                    e.target.value = e.target.value.toUpperCase()
                  },
                })}
              />
              {form.formState.errors.ifsc && (
                <p className="text-xs text-danger-500">{form.formState.errors.ifsc.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="branch">Branch</Label>
              <Input id="branch" placeholder="e.g. Nariman Point, Mumbai" {...form.register("branch")} />
              {form.formState.errors.branch && (
                <p className="text-xs text-danger-500">{form.formState.errors.branch.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">Available for new payouts</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>
          </form>

          <SheetFooter>
            <Button variant="outline" onClick={() => setSheetOpen(false)}>Cancel</Button>
            <Button type="submit" form="payout-bank-form" variant="brand" disabled={resource.saving}>
              {editing ? "Save Changes" : "Add Bank"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete payout bank?"
        description={
          deleteTarget
            ? `${deleteTarget.bankName} will no longer be available for payouts.${
                deleteTarget.linkedRetailers > 0
                  ? ` ${deleteTarget.linkedRetailers} retailer(s) are currently linked to it.`
                  : ""
              }`
            : undefined
        }
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
