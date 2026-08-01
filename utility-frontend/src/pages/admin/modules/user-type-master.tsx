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
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMasterResource } from "@/hooks/use-master-resource"
import { exportToCsv } from "@/lib/utils"

/**
 * A user type as the API returns it.
 *
 * Deliberately not `UserTypeItem` from lib/types: that carries a `usersCount`
 * the master endpoint does not compute, and rendering a hardcoded zero for it
 * would read as "no users assigned" rather than "not measured".
 */
interface UserTypeRecord {
  id: string
  name: string
  description: string
  permissions: string[]
  status: "active" | "inactive"
}

const ALL_PERMISSIONS = [
  "Perform Transactions", "View Reports", "Raise Tickets", "Fund Retailers",
  "Onboard Retailers", "Fund Distributors", "Onboard Distributors",
  "Manage Commission", "Full Access", "Manage Users", "Manage Services", "API Access",
]

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  permissions: z.array(z.string()).min(1, "Select at least one permission"),
  status: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

export function UserTypeMasterPage() {
  const resource = useMasterResource<UserTypeRecord>("user-types", { label: "User type" })

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<UserTypeRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<UserTypeRecord | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", permissions: [], status: true },
  })

  function openAdd() {
    setEditing(null)
    form.reset({ name: "", description: "", permissions: [], status: true })
    setSheetOpen(true)
  }

  function openEdit(item: UserTypeRecord) {
    setEditing(item)
    form.reset({
      name: item.name,
      description: item.description,
      permissions: item.permissions ?? [],
      status: item.status === "active",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      description: values.description,
      permissions: values.permissions,
      status: values.status ? "active" : "inactive",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as Partial<UserTypeRecord>)

    if (result !== undefined) setSheetOpen(false)
  }

  function toggleStatus(item: UserTypeRecord) {
    void resource.update(item.id, {
      status: item.status === "active" ? "inactive" : "active",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  function togglePermission(perm: string, checked: boolean) {
    const current = form.getValues("permissions")
    form.setValue(
      "permissions",
      checked ? [...current, perm] : current.filter((p) => p !== perm)
    )
  }

  const columns: ColumnDef<UserTypeRecord>[] = [
    {
      accessorKey: "name",
      header: "User Type",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.original.name}</p>
          <p className="text-xs text-gray-500 line-clamp-1">{row.original.description}</p>
        </div>
      ),
    },
    {
      id: "permissions",
      header: "Permissions",
      cell: ({ row }) => {
        // Postgres returns a null text[] as null rather than an empty array.
        const perms = row.original.permissions ?? []
        return (
          <div className="flex max-w-xs flex-wrap gap-1">
            {perms.slice(0, 2).map((p) => (
              <Badge key={p} variant="outline" className="text-[11px]">{p}</Badge>
            ))}
            {perms.length > 2 && (
              <Badge variant="default" className="text-[11px]">+{perms.length - 2} more</Badge>
            )}
            {perms.length === 0 && <span className="text-xs text-gray-400">None</span>}
          </div>
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
        title="User Type Master"
        description="Manage user roles like Retailer, Distributor, Master Distributor and Admin"
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
        searchPlaceholder="Search user types..."
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
        onExport={() => exportToCsv("user-types", resource.items)}
        emptyTitle="No user types found"
        emptyDescription="Add a new user type to get started"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit User Type" : "Add User Type"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update the user type details below" : "Create a new user role and assign permissions"}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Name</Label>
              <Input id="name" placeholder="e.g. Retailer" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-danger-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Describe this user type's role" {...form.register("description")} />
              {form.formState.errors.description && (
                <p className="text-xs text-danger-500">{form.formState.errors.description.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <Label>Permissions</Label>
              <div className="grid grid-cols-1 gap-2 rounded-md border border-gray-200 p-3">
                {ALL_PERMISSIONS.map((perm) => (
                  <label key={perm} className="flex items-center gap-2 text-sm text-gray-700">
                    <Checkbox
                      checked={form.watch("permissions").includes(perm)}
                      onCheckedChange={(checked) => togglePermission(perm, checked === true)}
                    />
                    {perm}
                  </label>
                ))}
              </div>
              {form.formState.errors.permissions && (
                <p className="text-xs text-danger-500">{form.formState.errors.permissions.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">Allow this user type to log in</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={resource.saving}>
                {editing ? "Save Changes" : "Create User Type"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete user type?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
