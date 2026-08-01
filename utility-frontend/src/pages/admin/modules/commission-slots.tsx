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
import { Badge } from "@/components/ui/badge"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
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
import { usePlanOptions, useServiceOptions, useUserTypeOptions } from "@/hooks/use-lookups"
import { exportToCsv } from "@/lib/utils"
import { formatMoney, toMoneyString, toNumber } from "@/lib/money"

/**
 * A commission slab as the API returns it.
 *
 * Every rate is a decimal string. The backend computes gross, TDS and GST on
 * exact decimals; converting to float here and writing back would round-trip the
 * rate through binary floating point.
 */
interface SlotRecord {
  id: string
  planId?: string
  serviceId?: string
  service: string
  slabType: "flat" | "percentage"
  value: string
  tds: string
  gst: string
  minAmount: string
  maxAmount: string
  userTypeId?: string
  userType: string
  status: "active" | "inactive"
}

/** A blank selection: the "applies to everyone" option in a picker. */
const ANY = "__any__"

const percentField = (label: string) =>
  z
    .string()
    .min(1, `${label} is required`)
    .refine((v) => {
      const n = toNumber(v)
      return n !== null && n >= 0 && n <= 100
    }, `${label} must be between 0 and 100%`)

const formSchema = z
  .object({
    serviceId: z.string().min(1, "Select a service"),
    planId: z.string(),
    slabType: z.enum(["flat", "percentage"]),
    value: z
      .string()
      .min(1, "Value is required")
      .refine((v) => (toNumber(v) ?? 0) > 0, "Value must be greater than 0"),
    tds: percentField("TDS"),
    gst: percentField("GST"),
    minAmount: z.string().refine((v) => (toNumber(v) ?? 0) >= 0, "Minimum must be zero or more"),
    maxAmount: z.string().refine((v) => (toNumber(v) ?? 0) >= 0, "Maximum must be zero or more"),
    userTypeId: z.string(),
    status: z.boolean(),
  })
  .refine(
    (data) => {
      // A max of zero means "no upper bound", which the resolver treats as open,
      // so it must not be compared against the minimum.
      const max = toNumber(data.maxAmount) ?? 0
      return max === 0 || max >= (toNumber(data.minAmount) ?? 0)
    },
    { message: "Maximum must be zero (open-ended) or at least the minimum", path: ["maxAmount"] },
  )
  .refine((data) => data.slabType !== "percentage" || (toNumber(data.value) ?? 0) <= 100, {
    message: "A percentage slab cannot exceed 100%",
    path: ["value"],
  })

type FormValues = z.infer<typeof formSchema>

const EMPTY_FORM: FormValues = {
  serviceId: "", planId: ANY, slabType: "flat", value: "5",
  tds: "0", gst: "0", minAmount: "0", maxAmount: "0", userTypeId: ANY, status: true,
}

export function CommissionSlotsPage() {
  const resource = useMasterResource<SlotRecord>("commission-slots", { label: "Commission slot" })
  const services = useServiceOptions()
  const userTypes = useUserTypeOptions()
  const plans = usePlanOptions()

  const [userTypeFilter, setUserTypeFilter] = React.useState("all")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<SlotRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<SlotRecord | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: EMPTY_FORM,
  })

  const visible = React.useMemo(
    () => resource.items.filter((s) => userTypeFilter === "all" || s.userType === userTypeFilter),
    [resource.items, userTypeFilter],
  )

  function openAdd() {
    setEditing(null)
    form.reset(EMPTY_FORM)
    setSheetOpen(true)
  }

  function openEdit(slot: SlotRecord) {
    setEditing(slot)
    form.reset({
      // Match on name, not id: slabs seeded before services were linked may carry
      // only the name, and the resolver matches on name anyway.
      serviceId:
        slot.serviceId ?? services.options.find((s) => s.name === slot.service)?.id ?? "",
      planId: slot.planId ?? ANY,
      slabType: slot.slabType,
      value: slot.value,
      tds: slot.tds,
      gst: slot.gst,
      minAmount: slot.minAmount,
      maxAmount: slot.maxAmount,
      userTypeId: slot.userTypeId ?? ANY,
      status: slot.status === "active",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const service = services.options.find((s) => s.id === values.serviceId)
    if (!service) {
      form.setError("serviceId", { message: "Select a service" })
      return
    }

    // The resolver matches slabs by service *name*, so the name is the load-bearing
    // field and the id is carried alongside it for reference.
    const payload: Record<string, unknown> = {
      serviceId: values.serviceId,
      service: service.name,
      slabType: values.slabType,
      value: toMoneyString(values.value),
      tds: toMoneyString(values.tds),
      gst: toMoneyString(values.gst),
      minAmount: toMoneyString(values.minAmount) || "0",
      maxAmount: toMoneyString(values.maxAmount) || "0",
      status: values.status ? "active" : "inactive",
      // A null user type is what makes a slab the generic fallback, so "any" has
      // to clear the column rather than write an empty string.
      userTypeId: values.userTypeId === ANY ? null : values.userTypeId,
      userType:
        values.userTypeId === ANY
          ? ""
          : (userTypes.options.find((u) => u.id === values.userTypeId)?.name ?? ""),
      planId: values.planId === ANY ? null : values.planId,
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as unknown as Partial<SlotRecord>)

    if (result !== undefined) setSheetOpen(false)
  }

  function toggleStatus(slot: SlotRecord) {
    void resource.update(slot.id, {
      status: slot.status === "active" ? "inactive" : "active",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  const columns: ColumnDef<SlotRecord>[] = [
    {
      accessorKey: "service",
      header: "Service",
      cell: ({ row }) => <span className="text-sm font-medium text-gray-900">{row.original.service}</span>,
    },
    {
      accessorKey: "userType",
      header: "User Type",
      cell: ({ row }) =>
        row.original.userType ? (
          <Badge variant="outline">{row.original.userType}</Badge>
        ) : (
          <Badge variant="default" className="text-[11px]">All types</Badge>
        ),
    },
    {
      id: "band",
      header: "Amount Band",
      cell: ({ row }) => {
        // Zero as a maximum is the resolver's "no upper bound", so it must not be
        // rendered as a ₹0.00 ceiling.
        const max = toNumber(row.original.maxAmount) ?? 0
        return (
          <span className="table-num text-xs text-gray-600">
            {formatMoney(row.original.minAmount)} &ndash; {max === 0 ? "no limit" : formatMoney(row.original.maxAmount)}
          </span>
        )
      },
    },
    {
      id: "slab",
      header: "Slab",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-800">
          {row.original.slabType === "flat" ? formatMoney(row.original.value) : `${row.original.value}%`}
          <span className="ml-1 text-xs text-gray-400">({row.original.slabType})</span>
        </span>
      ),
    },
    {
      accessorKey: "tds",
      header: "TDS",
      cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.tds}%</span>,
    },
    {
      accessorKey: "gst",
      header: "GST",
      cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.gst}%</span>,
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

  const slabType = form.watch("slabType")

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Commission Slots"
        description="Configure commission slabs per service with TDS and GST rates"
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
        searchPlaceholder="Search by service or user type..."
        filters={
          <>
            <FilterSelect
              label="User Type"
              value={userTypeFilter}
              onChange={setUserTypeFilter}
              options={userTypes.options.map((u) => ({ label: u.name, value: u.name }))}
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
        onExport={() => exportToCsv("commission-slots", visible)}
        emptyTitle="No commission slots found"
        emptyDescription="Add a new commission slab to get started"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Commission Slot" : "Add Commission Slot"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update the commission slab details below" : "Configure a new commission slab for a service"}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="serviceId">Service</Label>
              <Controller
                control={form.control}
                name="serviceId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="serviceId">
                      <SelectValue placeholder={services.loading ? "Loading services..." : "Select service"} />
                    </SelectTrigger>
                    <SelectContent>
                      {services.options.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                          <span className="ml-1 text-xs text-gray-400">{s.category}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {services.empty && (
                <p className="text-xs text-warning-600">
                  No active services exist yet. Create one in Service Master first.
                </p>
              )}
              {form.formState.errors.serviceId && (
                <p className="text-xs text-danger-500">{form.formState.errors.serviceId.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="userTypeId">User Type</Label>
              <Controller
                control={form.control}
                name="userTypeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="userTypeId">
                      <SelectValue placeholder="Select user type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>All user types (fallback)</SelectItem>
                      {userTypes.options.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-gray-400">
                A slab bound to a user type takes precedence over the fallback slab for the same service.
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="planId">Commission Plan (optional)</Label>
              <Controller
                control={form.control}
                name="planId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="planId">
                      <SelectValue placeholder="Not grouped" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY}>Not grouped</SelectItem>
                      {plans.options.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              <p className="text-xs text-gray-400">
                Grouping is for reporting only. Slab selection is driven by service, user type and amount.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label>Slab Type</Label>
              <Controller
                control={form.control}
                name="slabType"
                render={({ field }) => (
                  <RadioGroup value={field.value} onValueChange={field.onChange} className="grid-flow-col grid-cols-2">
                    <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                      <RadioGroupItem value="flat" id="flat" /> Flat (₹)
                    </label>
                    <label className="flex items-center gap-2 rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700">
                      <RadioGroupItem value="percentage" id="percentage" /> Percentage (%)
                    </label>
                  </RadioGroup>
                )}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="value">
                {slabType === "flat" ? "Flat Value (₹)" : "Percentage Value (%)"}
              </Label>
              <Input id="value" inputMode="decimal" {...form.register("value")} />
              {form.formState.errors.value && (
                <p className="text-xs text-danger-500">{form.formState.errors.value.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="minAmount">Applies From (₹)</Label>
                <Input id="minAmount" inputMode="decimal" {...form.register("minAmount")} />
                {form.formState.errors.minAmount && (
                  <p className="text-xs text-danger-500">{form.formState.errors.minAmount.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="maxAmount">Applies To (₹)</Label>
                <Input id="maxAmount" inputMode="decimal" {...form.register("maxAmount")} />
                <p className="text-xs text-gray-400">0 means no upper limit</p>
                {form.formState.errors.maxAmount && (
                  <p className="text-xs text-danger-500">{form.formState.errors.maxAmount.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tds">TDS (%)</Label>
                <Input id="tds" inputMode="decimal" {...form.register("tds")} />
                {form.formState.errors.tds && (
                  <p className="text-xs text-danger-500">{form.formState.errors.tds.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gst">GST (%)</Label>
                <Input id="gst" inputMode="decimal" {...form.register("gst")} />
                {form.formState.errors.gst && (
                  <p className="text-xs text-danger-500">{form.formState.errors.gst.message}</p>
                )}
              </div>
            </div>

            <p className="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
              TDS and GST are deducted from the commission this slab awards, not from the transaction amount.
            </p>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">This slab is applied on new transactions</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={resource.saving}>
                {editing ? "Save Changes" : "Create Slot"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete commission slot?"
        description="This will permanently delete this commission slab. This action cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
