import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import type { ColumnDef } from "@tanstack/react-table"
import * as Icons from "lucide-react"
import { MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react"
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

/** A service category as the API returns it. */
interface ServiceCategory {
  id: string
  name: string
  icon: string
  description: string
  status: "enabled" | "disabled"
  sortOrder: number
}

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  icon: z.string().min(2, "Icon name is required"),
  description: z.string().min(5, "Description must be at least 5 characters"),
  status: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.HelpCircle
  return <Icon className={className} />
}

export function ServiceCategoryPage() {
  const resource = useMasterResource<ServiceCategory>("service-categories", {
    label: "Service category",
  })

  const [sheetOpen, setSheetOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ServiceCategory | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<ServiceCategory | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", icon: "", description: "", status: true },
  })

  function openCreate() {
    setEditing(null)
    form.reset({ name: "", icon: "", description: "", status: true })
    setSheetOpen(true)
  }

  function openEdit(cat: ServiceCategory) {
    setEditing(cat)
    form.reset({
      name: cat.name,
      icon: cat.icon,
      description: cat.description,
      status: cat.status === "enabled",
    })
    setSheetOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const payload = {
      name: values.name,
      icon: values.icon,
      description: values.description,
      status: values.status ? "enabled" : "disabled",
    }

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as Partial<ServiceCategory>)

    // The sheet stays open on failure so the operator can correct the input
    // instead of losing everything they typed.
    if (result !== undefined) setSheetOpen(false)
  }

  function toggleStatus(cat: ServiceCategory) {
    void resource.update(cat.id, {
      status: cat.status === "enabled" ? "disabled" : "enabled",
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  const columns: ColumnDef<ServiceCategory>[] = [
    {
      accessorKey: "name",
      header: "Category",
      cell: ({ row }) => (
        <div className="flex items-center gap-2.5">
          <div className="flex size-8 items-center justify-center rounded-md bg-brand-50 text-brand-600">
            <CategoryIcon name={row.original.icon} className="size-4" />
          </div>
          <span className="text-sm font-medium text-gray-900">{row.original.name}</span>
        </div>
      ),
    },
    {
      accessorKey: "description",
      header: "Description",
      cell: ({ row }) => <span className="text-xs text-gray-500 line-clamp-1">{row.original.description}</span>,
    },
    {
      accessorKey: "sortOrder",
      header: "Order",
      cell: ({ row }) => <span className="table-num text-sm text-gray-700">{row.original.sortOrder}</span>,
    },
    {
      accessorKey: "status",
      header: "Status",
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <Switch
            checked={row.original.status === "enabled"}
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
        title="Service Category"
        description="Manage the top-level service categories shown to retailers"
        actions={
          <Button variant="brand" onClick={openCreate}>
            <Plus className="size-4" /> Add category
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={resource.items}
        loading={resource.loading}
        searchValue={resource.search}
        onSearchChange={resource.setSearch}
        searchPlaceholder="Search categories..."
        filters={
          <FilterSelect
            label="Status"
            value={resource.statusFilter}
            onChange={resource.setStatusFilter}
            options={[
              { label: "Enabled", value: "enabled" },
              { label: "Disabled", value: "disabled" },
            ]}
          />
        }
        onExport={() => exportToCsv("service-categories", resource.items)}
        emptyTitle="No service categories found"
        emptyDescription="Add a new service category to get started"
      />

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{editing ? "Edit Service Category" : "Add Service Category"}</SheetTitle>
            <SheetDescription>
              {editing ? "Update the category details below" : "Create a new top-level service category"}
            </SheetDescription>
          </SheetHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col gap-4 overflow-y-auto py-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="name">Category Name</Label>
              <Input id="name" placeholder="e.g. AEPS" {...form.register("name")} />
              {form.formState.errors.name && (
                <p className="text-xs text-danger-500">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="icon">Icon Name (lucide-react)</Label>
              <div className="flex items-center gap-2">
                <Input id="icon" placeholder="e.g. Fingerprint" {...form.register("icon")} />
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-gray-50">
                  <CategoryIcon name={form.watch("icon") || "HelpCircle"} className="size-4 text-gray-600" />
                </div>
              </div>
              <p className="text-xs text-gray-400">Use any icon name from lucide.dev/icons (e.g. Smartphone, Tv, Send)</p>
              {form.formState.errors.icon && (
                <p className="text-xs text-danger-500">{form.formState.errors.icon.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" placeholder="Short description of this category" {...form.register("description")} />
              {form.formState.errors.description && (
                <p className="text-xs text-danger-500">{form.formState.errors.description.message}</p>
              )}
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Enabled</p>
                <p className="text-xs text-gray-500">Show this category to retailers</p>
              </div>
              <Switch
                checked={form.watch("status")}
                onCheckedChange={(v) => form.setValue("status", v)}
              />
            </div>

            <SheetFooter>
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand">
                {editing ? "Save Changes" : "Create Category"}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete service category?"
        description={`This will permanently delete "${deleteTarget?.name}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
