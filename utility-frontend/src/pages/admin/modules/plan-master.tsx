import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, MoreHorizontal, Pencil, Trash2, Eye } from "lucide-react"
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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMasterResource } from "@/hooks/use-master-resource"
import { useUserTypeOptions } from "@/hooks/use-lookups"
import { exportToCsv } from "@/lib/utils"
import { formatMoney } from "@/lib/money"

/** A commission slab, as nested on a plan by the API. */
interface PlanSlot {
  id: string
  service: string
  slabType: "flat" | "percentage"
  value: string
  userType: string
}

/**
 * A commission plan as the API returns it.
 *
 * `slots` is a preloaded relation and may be absent on a list response, so every
 * read of it has to tolerate undefined.
 */
interface PlanRecord {
  id: string
  name: string
  userTypeId?: string
  userType: string
  status: "active" | "inactive"
  slots?: PlanSlot[]
}

const formSchema = z.object({
  name: z.string().min(2, "Plan name must be at least 2 characters"),
  userTypeId: z.string().min(1, "Select a user type"),
  status: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

export function PlanMasterPage() {
  const resource = useMasterResource<PlanRecord>("commission-plans", { label: "Plan" })
  const userTypes = useUserTypeOptions()

  const [userTypeFilter, setUserTypeFilter] = React.useState("all")
  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<PlanRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<PlanRecord | null>(null)
  const [viewTarget, setViewTarget] = React.useState<PlanRecord | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", userTypeId: "", status: true },
  })

  const visible = React.useMemo(
    () => resource.items.filter((p) => userTypeFilter === "all" || p.userType === userTypeFilter),
    [resource.items, userTypeFilter],
  )

  function openAdd() {
    setEditing(null)
    form.reset({ name: "", userTypeId: "", status: true })
    setSheetOpen(true)
  }

  function openEdit(plan: PlanRecord) {
    setEditing(plan)
    form.reset({
      name: plan.name,
      userTypeId: plan.userTypeId ?? "",
      status: plan.status === "active",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: FormValues) {
    // The user-type name is stored alongside the id so listings need no join; it
    // has to be written from the same selection to stay consistent.
    const userTypeName = userTypes.options.find((u) => u.id === values.userTypeId)?.name ?? ""

    const payload = {
      name: values.name,
      userTypeId: values.userTypeId,
      userType: userTypeName,
      status: values.status ? "active" : "inactive",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as unknown as Partial<PlanRecord>)

    if (result !== undefined) setSheetOpen(false)
  }

  function toggleStatus(plan: PlanRecord) {
    void resource.update(plan.id, {
      status: plan.status === "active" ? "inactive" : "active",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  const columns: ColumnDef<PlanRecord>[] = [
    {
      accessorKey: "name",
      header: "Plan Name",
      cell: ({ row }) => <span className="text-sm font-medium text-gray-900">{row.original.name}</span>,
    },
    {
      accessorKey: "userType",
      header: "User Type",
      cell: ({ row }) =>
        row.original.userType ? (
          <Badge variant="outline">{row.original.userType}</Badge>
        ) : (
          <span className="text-xs text-gray-400">Any</span>
        ),
    },
    {
      id: "slotCount",
      header: "Slabs",
      cell: ({ row }) => {
        const count = row.original.slots?.length ?? 0
        return (
          <button
            className="table-num text-sm font-medium text-brand-700 hover:underline"
            onClick={() => setViewTarget(row.original)}
          >
            {count} {count === 1 ? "slab" : "slabs"}
          </button>
        )
      },
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
            <DropdownMenuItem onClick={() => setViewTarget(row.original)}>
              <Eye className="size-3.5" /> View Slabs
            </DropdownMenuItem>
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
        title="Plan Master"
        description="Manage commission plans and their applicable user types"
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
        searchPlaceholder="Search plans..."
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
        onExport={() =>
          exportToCsv(
            "commission-plans",
            visible.map(({ slots, ...plan }) => ({ ...plan, slabs: slots?.length ?? 0 })),
          )
        }
        emptyTitle="No plans found"
        emptyDescription="Add a new commission plan to get started"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Plan" : "Add Plan"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update the plan details below" : "Create a new commission plan"}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Plan Name</Label>
              <Input id="name" placeholder="e.g. Standard Retailer Plan" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-danger-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="userTypeId">Applicable User Type</Label>
              <Controller
                control={form.control}
                name="userTypeId"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="userTypeId">
                      <SelectValue
                        placeholder={userTypes.loading ? "Loading user types..." : "Select user type"}
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {userTypes.options.map((u) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {userTypes.empty && (
                <p className="text-xs text-warning-600">
                  No active user types exist yet. Create one in User Type Master first.
                </p>
              )}
              {form.formState.errors.userTypeId && (
                <p className="text-xs text-danger-500">{form.formState.errors.userTypeId.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">Plan can be assigned to eligible users</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={resource.saving}>
                {editing ? "Save Changes" : "Create Plan"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewTarget?.name}</DialogTitle>
            <DialogDescription>
              {viewTarget?.slots?.length ?? 0} commission slabs in this plan
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {viewTarget?.slots && viewTarget.slots.length > 0 ? (
              <ul className="flex flex-col gap-1.5">
                {viewTarget.slots.map((slot) => (
                  <li
                    key={slot.id}
                    className="flex items-center justify-between rounded-md border border-gray-100 px-3 py-2"
                  >
                    <span className="text-sm text-gray-800">{slot.service}</span>
                    <Badge variant="outline" className="table-num text-[11px]">
                      {slot.slabType === "flat" ? formatMoney(slot.value) : `${slot.value}%`}
                    </Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500">
                No slabs assigned to this plan yet. Add them in Commission Slots.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete plan?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
