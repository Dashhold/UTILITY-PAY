import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import { Plus, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react"
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter,
} from "@/components/ui/sheet"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useMasterResource } from "@/hooks/use-master-resource"
import { exportToCsv } from "@/lib/utils"

/** A ticket department as the API returns it. */
interface DepartmentRecord {
  id: string
  name: string
  description: string
  agentsCount: number
  status: "active" | "inactive"
}

const formSchema = z.object({
  name: z.string().min(2, "Department name must be at least 2 characters"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  agentsCount: z
    .string()
    .min(1, "Agents count is required")
    .refine((v) => !Number.isNaN(Number(v)) && Number(v) >= 0, "Agents count cannot be negative"),
  status: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

export function TicketDepartmentsPage() {
  const resource = useMasterResource<DepartmentRecord>("ticket-departments", { label: "Ticket department" })

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<DepartmentRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<DepartmentRecord | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", description: "", agentsCount: "1", status: true },
  })

  function openAdd() {
    setEditing(null)
    form.reset({ name: "", description: "", agentsCount: "1", status: true })
    setSheetOpen(true)
  }

  function openEdit(dept: DepartmentRecord) {
    setEditing(dept)
    form.reset({
      name: dept.name,
      description: dept.description,
      agentsCount: String(dept.agentsCount),
      status: dept.status === "active",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      description: values.description,
      agentsCount: Number(values.agentsCount),
      status: values.status ? "active" : "inactive",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as Partial<DepartmentRecord>)

    if (result !== undefined) setSheetOpen(false)
  }

  function toggleStatus(dept: DepartmentRecord) {
    void resource.update(dept.id, {
      status: dept.status === "active" ? "inactive" : "active",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  const columns: ColumnDef<DepartmentRecord>[] = [
    {
      accessorKey: "name",
      header: "Department",
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium text-gray-900">{row.original.name}</p>
          <p className="text-xs text-gray-500 line-clamp-1">{row.original.description}</p>
        </div>
      ),
    },
    {
      accessorKey: "agentsCount",
      header: "Assigned Agents",
      cell: ({ row }) => (
        <span className="flex items-center gap-1.5 text-sm text-gray-700">
          <Users className="size-3.5 text-gray-400" />
          <span className="table-num">{row.original.agentsCount}</span>
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
        title="Ticket Departments"
        description="Manage support ticket departments and their assigned agents"
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
        searchPlaceholder="Search departments..."
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
        onExport={() => exportToCsv("ticket-departments", resource.items)}
        emptyTitle="No ticket departments found"
        emptyDescription="Add a new department to get started"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Department" : "Add Department"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update the department details below" : "Create a new support ticket department"}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Department Name</Label>
              <Input id="name" placeholder="e.g. AEPS Support" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-danger-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Describe what this department handles" {...form.register("description")} />
              {form.formState.errors.description && (
                <p className="text-xs text-danger-500">{form.formState.errors.description.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="agentsCount">Assigned Agents</Label>
              <Input id="agentsCount" type="number" min={0} {...form.register("agentsCount")} />
              {form.formState.errors.agentsCount && (
                <p className="text-xs text-danger-500">{form.formState.errors.agentsCount.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Active</p>
                <p className="text-xs text-gray-500">Department can receive new tickets</p>
              </div>
              <Switch checked={form.watch("status")} onCheckedChange={(v) => form.setValue("status", v)} />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={resource.saving}>
                {editing ? "Save Changes" : "Create Department"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete department?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
