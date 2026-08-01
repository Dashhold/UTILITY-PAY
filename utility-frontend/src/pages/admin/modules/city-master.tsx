import * as React from "react"
import { useForm } from "react-hook-form"
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
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMasterResource } from "@/hooks/use-master-resource"
import { exportToCsv } from "@/lib/utils"
import type { City } from "@/lib/types"

const INDIAN_STATES = [
  "Maharashtra", "Delhi", "Karnataka", "Telangana", "Tamil Nadu", "Rajasthan",
  "Uttar Pradesh", "Gujarat", "West Bengal", "Madhya Pradesh", "Bihar",
  "Chandigarh", "Assam", "Kerala", "Punjab", "Haryana",
]

const pincodeSchema = z
  .string()
  .regex(/^\d{6}$/, "Pincode must be 6 digits")

const formSchema = z
  .object({
    name: z.string().min(2, "City name must be at least 2 characters"),
    state: z.string().min(2, "State is required"),
    pincodeFrom: pincodeSchema,
    pincodeTo: pincodeSchema,
    status: z.boolean(),
  })
  .refine((data) => Number(data.pincodeTo) >= Number(data.pincodeFrom), {
    message: "End pincode must be greater than or equal to start pincode",
    path: ["pincodeTo"],
  })

type FormValues = z.infer<typeof formSchema>

export function CityMasterPage() {
  const resource = useMasterResource<City>("cities", { label: "City" })

  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<City | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<City | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", state: "", pincodeFrom: "", pincodeTo: "", status: true },
  })

  function openAdd() {
    setEditing(null)
    form.reset({ name: "", state: "", pincodeFrom: "", pincodeTo: "", status: true })
    setDialogOpen(true)
  }

  function openEdit(city: City) {
    setEditing(city)
    form.reset({
      name: city.name,
      state: city.state,
      pincodeFrom: city.pincodeFrom,
      pincodeTo: city.pincodeTo,
      status: city.status === "active",
    })
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      state: values.state,
      pincodeFrom: values.pincodeFrom,
      pincodeTo: values.pincodeTo,
      status: values.status ? "active" : "inactive",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as Partial<City>)

    // The backend enforces a unique (name, state) pair, so a duplicate comes
    // back as an error. Keep the dialog open in that case so the operator can
    // amend the entry rather than retype it.
    if (result !== undefined) setDialogOpen(false)
  }

  function toggleStatus(city: City) {
    void resource.update(city.id, {
      status: city.status === "active" ? "inactive" : "active",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  const columns: ColumnDef<City>[] = [
    {
      accessorKey: "name",
      header: "City",
      cell: ({ row }) => <span className="text-sm font-medium text-gray-900">{row.original.name}</span>,
    },
    {
      accessorKey: "state",
      header: "State",
      cell: ({ row }) => <span className="text-sm text-gray-600">{row.original.state}</span>,
    },
    {
      id: "pincodeRange",
      header: "Pincode Range",
      cell: ({ row }) => (
        <span className="table-num text-sm text-gray-700">
          {row.original.pincodeFrom} &ndash; {row.original.pincodeTo}
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
        title="City Master"
        description="Manage serviceable cities and their pincode ranges"
        actions={
          <Button variant="brand" size="sm" onClick={openAdd}>
            <Plus className="size-3.5" /> Add New
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={resource.items}
        loading={resource.loading}
        searchValue={resource.search}
        onSearchChange={resource.setSearch}
        searchPlaceholder="Search cities..."
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
        onExport={() => exportToCsv("cities", resource.items)}
        emptyTitle="No cities found"
        emptyDescription="Add a new city to get started"
      />

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit City" : "Add City"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the city details below" : "Add a new serviceable city"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">City Name</Label>
                <Input id="name" placeholder="e.g. Mumbai" {...form.register("name")} />
                {form.formState.errors.name && (
                  <p className="text-xs text-danger-500">{form.formState.errors.name.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="state">State</Label>
                <Select
                  value={form.watch("state")}
                  onValueChange={(v) => form.setValue("state", v, { shouldValidate: true })}
                >
                  <SelectTrigger id="state">
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.formState.errors.state && (
                  <p className="text-xs text-danger-500">{form.formState.errors.state.message}</p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pincodeFrom">Pincode From</Label>
                <Input id="pincodeFrom" placeholder="e.g. 400001" maxLength={6} {...form.register("pincodeFrom")} />
                {form.formState.errors.pincodeFrom && (
                  <p className="text-xs text-danger-500">{form.formState.errors.pincodeFrom.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="pincodeTo">Pincode To</Label>
                <Input id="pincodeTo" placeholder="e.g. 400104" maxLength={6} {...form.register("pincodeTo")} />
                {form.formState.errors.pincodeTo && (
                  <p className="text-xs text-danger-500">{form.formState.errors.pincodeTo.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">City is serviceable for transactions</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={resource.saving}>
                {editing ? "Save Changes" : "Create City"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete city?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
