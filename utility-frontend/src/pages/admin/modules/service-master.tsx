import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { DataTable } from "@/components/shared/data-table"
import { FilterSelect } from "@/components/shared/filter-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMasterResource } from "@/hooks/use-master-resource"
import { useApiQuery } from "@/hooks/use-api"
import { api } from "@/lib/api"
import { exportToCsv } from "@/lib/utils"
import { formatMoney, isPositiveAmount, toMoneyString, toNumber } from "@/lib/money"

/**
 * A service as the API returns it.
 *
 * Monetary bounds arrive as decimal strings, never numbers: parsing them to a
 * float here and writing them back would round-trip through binary floating
 * point and corrupt the stored limit.
 */
interface ServiceRecord {
  id: string
  name: string
  categoryId: string
  category: string
  apiProvider: string
  providerCode?: string
  minAmount: string
  maxAmount: string
  status: "active" | "inactive"
}

interface CategoryOption {
  id: string
  name: string
}

/**
 * The upstreams this build actually integrates with.
 *
 * Listing providers we have no client for would let an admin wire a service to
 * nothing and only find out at the first transaction.
 */
const API_PROVIDERS = ["bharat-connect", "aeps"]

const PROVIDER_LABELS: Record<string, string> = {
  "bharat-connect": "Bharat Connect (MobiKwik)",
  aeps: "AEPS (MobiKwik)",
}

const formSchema = z
  .object({
    name: z.string().min(2, "Service name must be at least 2 characters"),
    categoryId: z.string().min(1, "Select a category"),
    apiProvider: z.string().min(1, "Select an API provider"),
    providerCode: z.string(),
    minAmount: z
      .string()
      .min(1, "Minimum amount is required")
      .refine((v) => isPositiveAmount(v), "Minimum amount must be greater than zero"),
    maxAmount: z
      .string()
      .min(1, "Maximum amount is required")
      .refine((v) => isPositiveAmount(v), "Maximum amount must be greater than zero"),
    status: z.boolean(),
  })
  .refine((data) => (toNumber(data.maxAmount) ?? 0) >= (toNumber(data.minAmount) ?? 0), {
    message: "Maximum amount must be greater than or equal to minimum amount",
    path: ["maxAmount"],
  })

type FormValues = z.infer<typeof formSchema>

export function ServiceMasterPage() {
  const resource = useMasterResource<ServiceRecord>("services", { label: "Service" })

  // Loaded live because Service.categoryId is a required foreign key: a hardcoded
  // category list would produce ids that do not exist and every create would fail.
  const categoryQuery = useApiQuery(
    () => api.admin.master<CategoryOption>("service-categories").list({ pageSize: 100 }),
    [],
  )
  const categories = categoryQuery.data?.items ?? []

  const [categoryFilter, setCategoryFilter] = React.useState("all")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ServiceRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ServiceRecord | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "", categoryId: "", apiProvider: "", providerCode: "",
      minAmount: "10", maxAmount: "10000", status: true,
    },
  })

  // Category is filtered client-side: the list endpoint filters on status only,
  // and the page size is small enough that this stays accurate.
  const visible = React.useMemo(
    () => resource.items.filter((s) => categoryFilter === "all" || s.category === categoryFilter),
    [resource.items, categoryFilter],
  )

  function openAdd() {
    setEditing(null)
    form.reset({
      name: "", categoryId: "", apiProvider: "", providerCode: "",
      minAmount: "10", maxAmount: "10000", status: true,
    })
    setSheetOpen(true)
  }

  function openEdit(item: ServiceRecord) {
    setEditing(item)
    form.reset({
      name: item.name,
      categoryId: item.categoryId,
      apiProvider: item.apiProvider,
      providerCode: item.providerCode ?? "",
      minAmount: item.minAmount,
      maxAmount: item.maxAmount,
      status: item.status === "active",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: FormValues) {
    // The category name is denormalised onto the row so listings and reports do
    // not have to join; it must stay in step with the id.
    const categoryName = categories.find((c) => c.id === values.categoryId)?.name ?? ""

    const payload = {
      name: values.name,
      categoryId: values.categoryId,
      category: categoryName,
      apiProvider: values.apiProvider,
      providerCode: values.providerCode,
      minAmount: toMoneyString(values.minAmount),
      maxAmount: toMoneyString(values.maxAmount),
      status: values.status ? "active" : "inactive",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as unknown as Partial<ServiceRecord>)

    if (result !== undefined) setSheetOpen(false)
  }

  function toggleStatus(item: ServiceRecord) {
    void resource.update(item.id, {
      status: item.status === "active" ? "inactive" : "active",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  const columns: ColumnDef<ServiceRecord>[] = [
    {
      accessorKey: "name",
      header: "Service",
      cell: ({ row }) => <span className="text-sm font-medium text-gray-900">{row.original.name}</span>,
    },
    {
      accessorKey: "category",
      header: "Category",
      cell: ({ row }) => <span className="text-xs text-gray-600">{row.original.category}</span>,
    },
    {
      accessorKey: "apiProvider",
      header: "API Provider",
      cell: ({ row }) => (
        <div>
          <p className="text-xs text-gray-600">
            {PROVIDER_LABELS[row.original.apiProvider] ?? row.original.apiProvider}
          </p>
          {row.original.providerCode && (
            <p className="text-[11px] text-gray-400">{row.original.providerCode}</p>
          )}
        </div>
      ),
    },
    {
      id: "range",
      header: "Amount Range",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-700">
          {formatMoney(row.original.minAmount)} &ndash; {formatMoney(row.original.maxAmount)}
        </span>
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

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Service Master"
        description="Manage AEPS and Bharat Connect services only"
        actions={
          <Button variant="brand" size="sm" onClick={openAdd}>
            <Plus className="size-3.5" /> Add New
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={visible}
        loading={resource.loading}
        searchValue={resource.search}
        onSearchChange={resource.setSearch}
        searchPlaceholder="Search services..."
        filters={
          <>
            <FilterSelect
              label="Category"
              value={categoryFilter}
              onChange={setCategoryFilter}
              options={categories.map((c) => ({ label: c.name, value: c.name }))}
            />
            <FilterSelect
              label="Status"
              value={resource.statusFilter}
              onChange={resource.setStatusFilter}
              options={[
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
              ]}
            />
          </>
        }
        serverPagination={{
          page: resource.page,
          pageSize: resource.pageSize,
          total: resource.total,
          totalPages: resource.totalPages,
          onPageChange: resource.setPage,
        }}
        onExport={() => exportToCsv("services", visible)}
        emptyTitle="No services found"
        emptyDescription="Add a new service to get started"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Service" : "Add Service"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update the service details below" : "Create a new service within a category"}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Service Name</Label>
              <Input id="name" placeholder="e.g. DTH Recharge" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-danger-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="categoryId">Category</Label>
              <Controller
                control={form.control}
                name="categoryId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="categoryId">
                      <SelectValue
                        placeholder={categoryQuery.loading ? "Loading categories..." : "Select category"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {categories.length === 0 && !categoryQuery.loading && (
                <p className="text-xs text-warning-600">
                  No service categories exist yet. Create one in Service Category first.
                </p>
              )}
              {form.formState.errors.categoryId && (
                <p className="text-xs text-danger-500">{form.formState.errors.categoryId.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="apiProvider">API Provider</Label>
              <Controller
                control={form.control}
                name="apiProvider"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="apiProvider">
                      <SelectValue placeholder="Select API provider" />
                    </SelectTrigger>
                    <SelectContent>
                      {API_PROVIDERS.map((p) => (
                        <SelectItem key={p} value={p}>{PROVIDER_LABELS[p] ?? p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.apiProvider && (
                <p className="text-xs text-danger-500">{form.formState.errors.apiProvider.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="providerCode">Provider Code (optional)</Label>
              <Input id="providerCode" placeholder="e.g. cash-withdrawal" {...form.register("providerCode")} />
              <p className="text-xs text-gray-400">
                The upstream's own identifier for this service, used when routing the request.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="minAmount">Min Amount (₹)</Label>
                <Input id="minAmount" inputMode="decimal" {...form.register("minAmount")} />
                {form.formState.errors.minAmount && (
                  <p className="text-xs text-danger-500">{form.formState.errors.minAmount.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxAmount">Max Amount (₹)</Label>
                <Input id="maxAmount" inputMode="decimal" {...form.register("maxAmount")} />
                {form.formState.errors.maxAmount && (
                  <p className="text-xs text-danger-500">{form.formState.errors.maxAmount.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">Make this service available to retailers</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={resource.saving}>
                {editing ? "Save Changes" : "Create Service"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete service?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
