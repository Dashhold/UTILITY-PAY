import * as React from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { MoreHorizontal, Plus, Pencil, Trash2, Star, Landmark } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMasterResource } from "@/hooks/use-master-resource"
import { useMutation } from "@/hooks/use-api"
import { api, ApiError } from "@/lib/api"
import type { CompanyBank } from "@/lib/api-types"
import { exportToCsv } from "@/lib/utils"

const ACCOUNT_TYPES = ["Current", "Savings", "Overdraft"]

const bankFormSchema = z.object({
  bankName: z.string().min(2, "Bank name is required"),
  accountName: z.string().min(2, "Account holder name is required"),
  accountNumber: z
    .string()
    .regex(/^\d{9,18}$/, "Account number must be 9-18 digits"),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code (e.g. HDFC0001234)"),
  branch: z.string().min(2, "Branch is required"),
  accountType: z.string().min(1, "Select an account type"),
  upiId: z.string(),
  status: z.boolean(),
})

type BankFormValues = z.infer<typeof bankFormSchema>

const EMPTY_FORM: BankFormValues = {
  bankName: "", accountName: "", accountNumber: "", ifsc: "",
  branch: "", accountType: "Current", upiId: "", status: true,
}

/** Shows only the last four digits, which is enough to identify an account. */
function maskAccountNumber(accountNumber: string): string {
  if (accountNumber.length <= 4) return accountNumber
  return `••••••${accountNumber.slice(-4)}`
}

export function CompanyBanksPage() {
  const resource = useMasterResource<CompanyBank>("company-banks", { label: "Bank account" })

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<CompanyBank | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<CompanyBank | null>(null)

  const form = useForm<BankFormValues>({
    resolver: zodResolver(bankFormSchema),
    defaultValues: EMPTY_FORM,
  })

  // Setting the default is a two-row change, so it has its own endpoint rather
  // than being a field update that could leave two defaults.
  const setDefault = useMutation((id: string) => api.admin.setDefaultCompanyBank(id), {
    successMessage: "Default account updated",
    onSuccess: () => resource.refetch(),
  })

  function openAdd() {
    setEditing(null)
    form.reset(EMPTY_FORM)
    setSheetOpen(true)
  }

  function openEdit(bank: CompanyBank) {
    setEditing(bank)
    form.reset({
      bankName: bank.bankName,
      accountName: bank.accountName ?? "",
      accountNumber: bank.accountNumber,
      ifsc: bank.ifsc,
      branch: bank.branch ?? "",
      accountType: bank.accountType || "Current",
      upiId: bank.upiId ?? "",
      status: bank.status === "active",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: BankFormValues) {
    const payload = {
      bankName: values.bankName,
      accountName: values.accountName,
      accountNumber: values.accountNumber,
      ifsc: values.ifsc.toUpperCase(),
      branch: values.branch,
      accountType: values.accountType,
      upiId: values.upiId,
      status: values.status ? "active" : "inactive",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as unknown as Partial<CompanyBank>)

    if (result !== undefined) setSheetOpen(false)
  }

  async function confirmDelete() {
    if (!deleteTarget) return

    // Removing the default would leave retailers with no account to deposit into,
    // so the guard is here as well as in the reviewer's head.
    if (deleteTarget.isDefault) {
      toast.warning("Set another account as default before deleting this one.")
      setDeleteTarget(null)
      return
    }
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  async function handleSetDefault(bank: CompanyBank) {
    if (bank.status !== "active") {
      toast.error("Activate this account before making it the default.")
      return
    }
    try {
      await setDefault.run(bank.id)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "The default could not be changed")
    }
  }

  const columns: ColumnDef<CompanyBank>[] = [
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
            <p className="text-xs text-gray-500">{row.original.accountName || "Holder not set"}</p>
          </div>
        </div>
      ),
    },
    {
      accessorKey: "accountNumber",
      header: "Account Number",
      cell: ({ row }) => (
        <div>
          <p className="table-num text-sm text-gray-700">{maskAccountNumber(row.original.accountNumber)}</p>
          {row.original.accountType && (
            <p className="text-[11px] text-gray-400">{row.original.accountType}</p>
          )}
        </div>
      ),
    },
    {
      accessorKey: "ifsc",
      header: "IFSC",
      cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.ifsc}</span>,
    },
    {
      accessorKey: "branch",
      header: "Branch",
      cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.branch || "—"}</span>,
    },
    {
      accessorKey: "upiId",
      header: "UPI ID",
      cell: ({ row }) => <span className="text-xs text-gray-600">{row.original.upiId || "—"}</span>,
    },
    {
      id: "default",
      header: "Default",
      cell: ({ row }) =>
        row.original.isDefault ? (
          <Badge variant="brand">
            <Star className="size-3 fill-current" /> Default
          </Badge>
        ) : (
          <span className="text-xs text-gray-400">—</span>
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
            <DropdownMenuItem
              disabled={row.original.isDefault || setDefault.pending}
              onClick={() => void handleSetDefault(row.original)}
            >
              <Star className="size-3.5" /> Set as Default
            </DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTarget(row.original)}>
              <Trash2 className="size-3.5" /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Company Banks"
        description="Accounts retailers deposit into when topping up their wallet"
        actions={
          <Button size="sm" variant="brand" onClick={openAdd}>
            <Plus className="size-3.5" /> Add Bank
          </Button>
        }
      />

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
          // The full account number is deliberately not exported; the masked form
          // is enough to identify a row and a spreadsheet is easily mislaid.
          exportToCsv(
            "company-banks",
            resource.items.map((b) => ({
              bankName: b.bankName,
              accountName: b.accountName,
              accountNumber: maskAccountNumber(b.accountNumber),
              ifsc: b.ifsc,
              branch: b.branch,
              accountType: b.accountType,
              upiId: b.upiId ?? "",
              isDefault: b.isDefault,
              status: b.status,
            })),
          )
        }
        emptyTitle="No bank accounts"
        emptyDescription="Add the account retailers should deposit into"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Bank Account" : "Add Bank Account"}</SheetTitle>
            <SheetDescription>
              Retailers see these details when raising a fund request, so an error here sends money to the wrong
              account.
            </SheetDescription>
          </SheetHeader>

          <form
            id="company-bank-form"
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
              <Label htmlFor="accountName">Account Holder Name</Label>
              <Input id="accountName" placeholder="Registered company name" {...form.register("accountName")} />
              {form.formState.errors.accountName && (
                <p className="text-xs text-danger-500">{form.formState.errors.accountName.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountNumber">Account Number</Label>
              <Input
                id="accountNumber"
                inputMode="numeric"
                placeholder="50100234567890"
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
                placeholder="HDFC0001234"
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
              <Input id="branch" placeholder="e.g. Andheri East, Mumbai" {...form.register("branch")} />
              {form.formState.errors.branch && (
                <p className="text-xs text-danger-500">{form.formState.errors.branch.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="accountType">Account Type</Label>
              <Select
                value={form.watch("accountType")}
                onValueChange={(v) => form.setValue("accountType", v, { shouldValidate: true })}
              >
                <SelectTrigger id="accountType">
                  <SelectValue placeholder="Select account type" />
                </SelectTrigger>
                <SelectContent>
                  {ACCOUNT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.formState.errors.accountType && (
                <p className="text-xs text-danger-500">{form.formState.errors.accountType.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="upiId">UPI ID (optional)</Label>
              <Input id="upiId" placeholder="company@bank" {...form.register("upiId")} />
              <p className="text-xs text-gray-400">Shown to retailers who prefer to top up over UPI.</p>
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">Show this account to retailers</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>
          </form>

          <SheetFooter>
            <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="company-bank-form" variant="brand" disabled={resource.saving}>
              {editing ? "Save Changes" : "Add Bank"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Delete ${deleteTarget?.bankName}?`}
        description="Retailers will no longer see this account when topping up. Existing fund requests are unaffected."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
