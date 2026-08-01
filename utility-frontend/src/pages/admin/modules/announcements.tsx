import * as React from "react"
import { useForm, Controller } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Plus, Pencil, Trash2, Megaphone, Calendar, Send } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { FilterSelect } from "@/components/shared/filter-select"
import { StatusBadge } from "@/components/shared/status-badge"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { useMasterResource } from "@/hooks/use-master-resource"
import { formatDate } from "@/lib/utils"

type Audience = "Admin" | "Retailer" | "All"

/**
 * An announcement as the API returns it.
 *
 * Both dates are nullable: a draft has no published date, and an announcement
 * with no expiry runs indefinitely. Treating them as required strings would
 * crash on `.slice()` the moment a draft was opened for editing.
 */
interface AnnouncementRecord {
  id: string
  title: string
  message: string
  audience: Audience
  status: "published" | "draft" | "expired"
  publishedDate?: string | null
  expiryDate?: string | null
}

const formSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters"),
  message: z.string().min(10, "Message must be at least 10 characters"),
  audience: z.enum(["Admin", "Retailer", "All"]),
  // Optional because the backend models an open-ended announcement as a null
  // expiry, and forcing a date would make that state unreachable from the UI.
  expiryDate: z.string(),
  publish: z.boolean(),
})

type FormValues = z.infer<typeof formSchema>

const AUDIENCE_VARIANT: Record<Audience, "brand" | "info" | "default"> = {
  Admin: "info",
  Retailer: "brand",
  All: "default",
}

/** Converts a date input value to the RFC3339 timestamp the API expects. */
function toTimestamp(value: string): string | null {
  if (value.trim() === "") return null
  const parsed = new Date(`${value}T23:59:59`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

/** Converts an API timestamp to a date input value. */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : ""
}

export function AnnouncementsPage() {
  const resource = useMasterResource<AnnouncementRecord>("announcements", { label: "Announcement" })

  const [audienceFilter, setAudienceFilter] = React.useState("all")
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<AnnouncementRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = React.useState<AnnouncementRecord | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { title: "", message: "", audience: "All", expiryDate: "", publish: true },
  })

  const visible = React.useMemo(
    () => resource.items.filter((a) => audienceFilter === "all" || a.audience === audienceFilter),
    [resource.items, audienceFilter],
  )

  function openAdd() {
    setEditing(null)
    form.reset({ title: "", message: "", audience: "All", expiryDate: "", publish: true })
    setDialogOpen(true)
  }

  function openEdit(a: AnnouncementRecord) {
    setEditing(a)
    form.reset({
      title: a.title,
      message: a.message,
      audience: a.audience,
      expiryDate: toDateInput(a.expiryDate),
      publish: a.status === "published",
    })
    setDialogOpen(true)
  }

  async function onSubmit(values: FormValues) {
    const publish = values.publish

    const payload: Record<string, unknown> = {
      title: values.title,
      message: values.message,
      audience: values.audience,
      expiryDate: toTimestamp(values.expiryDate),
      status: publish ? "published" : "draft",
      // The published date is what the retailer sees as "posted on". Stamping it
      // only on the transition to published keeps a re-edited announcement from
      // jumping back to the top of the retailer's list.
      publishedDate:
        publish && editing?.status !== "published" ? new Date().toISOString() : undefined,
    }
    if (payload.publishedDate === undefined) delete payload.publishedDate

    const result = editing
      ? await resource.update(editing.id, payload)
      : await resource.create(payload as unknown as Partial<AnnouncementRecord>)

    if (result !== undefined) setDialogOpen(false)
  }

  function publishNow(a: AnnouncementRecord) {
    void resource.update(a.id, {
      status: "published",
      publishedDate: new Date().toISOString(),
    })
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    const ok = await resource.remove(deleteTarget.id)
    if (ok) setDeleteTarget(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Announcements"
        description="Broadcast messages to admins, retailers or everyone on the platform"
        actions={
          <Button variant="brand" size="sm" onClick={openAdd}>
            <Plus className="size-3.5" /> Add New
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Audience"
          value={audienceFilter}
          onChange={setAudienceFilter}
          options={[
            { label: "Admin", value: "Admin" },
            { label: "Retailer", value: "Retailer" },
            { label: "All", value: "All" },
          ]}
        />
        <FilterSelect
          label="Status"
          value={resource.statusFilter}
          onChange={resource.setStatusFilter}
          options={[
            { label: "Published", value: "published" },
            { label: "Draft", value: "draft" },
            { label: "Expired", value: "expired" },
          ]}
        />
      </div>

      {resource.loading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-2 h-3 w-5/6" />
              <Skeleton className="mt-4 h-3 w-1/3" />
            </Card>
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements found"
          description="Create a new announcement to broadcast to your users"
          actionLabel="Add New"
          onAction={openAdd}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((a) => (
            <Card key={a.id} className="flex flex-col">
              <CardHeader className="flex-row items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                    <Megaphone className="size-4" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-gray-900 line-clamp-1">{a.title}</p>
                    <Badge variant={AUDIENCE_VARIANT[a.audience]} className="mt-0.5 text-[11px]">{a.audience}</Badge>
                  </div>
                </div>
                <StatusBadge status={a.status} />
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-3">
                <p className="text-xs text-gray-600 line-clamp-3">{a.message}</p>
                <div className="mt-auto flex items-center justify-between text-[11px] text-gray-400">
                  <span className="flex items-center gap-1">
                    <Calendar className="size-3" />
                    {a.publishedDate ? formatDate(a.publishedDate) : "Not published"}
                  </span>
                  <span>{a.expiryDate ? `Expires ${formatDate(a.expiryDate)}` : "No expiry"}</span>
                </div>
                <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                  {a.status !== "published" && (
                    <Button
                      variant="brand"
                      size="sm"
                      className="flex-1"
                      disabled={resource.saving}
                      onClick={() => publishNow(a)}
                    >
                      <Send className="size-3.5" /> Publish
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => openEdit(a)}>
                    <Pencil className="size-3.5" /> Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-danger-600 hover:bg-danger-50" onClick={() => setDeleteTarget(a)}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Announcement" : "Add Announcement"}</DialogTitle>
            <DialogDescription>
              {editing ? "Update the announcement below" : "Broadcast a new announcement to your users"}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="title">Title</Label>
              <Input id="title" placeholder="e.g. Scheduled maintenance tonight" {...form.register("title")} />
              {form.formState.errors.title && (
                <p className="text-xs text-danger-500">{form.formState.errors.title.message}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="message">Message</Label>
              <Textarea id="message" rows={4} placeholder="Write the announcement message..." {...form.register("message")} />
              {form.formState.errors.message && (
                <p className="text-xs text-danger-500">{form.formState.errors.message.message}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="audience">Audience</Label>
                <Controller
                  control={form.control}
                  name="audience"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="audience">
                        <SelectValue placeholder="Select audience" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Admin">Admin</SelectItem>
                        <SelectItem value="Retailer">Retailer</SelectItem>
                        <SelectItem value="All">All</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="expiryDate">Expiry Date</Label>
                <Input id="expiryDate" type="date" {...form.register("expiryDate")} />
                <p className="text-xs text-gray-400">Leave blank to run indefinitely</p>
                {form.formState.errors.expiryDate && (
                  <p className="text-xs text-danger-500">{form.formState.errors.expiryDate.message}</p>
                )}
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-gray-900">Publish immediately</p>
                <p className="text-xs text-gray-500">
                  Turn off to save as a draft. Drafts are never shown to users.
                </p>
              </div>
              <Switch checked={form.watch("publish")} onCheckedChange={(v) => form.setValue("publish", v)} />
            </div>

            {/* Preview */}
            <div className="rounded-md border border-gray-200 bg-gray-50/60 p-3">
              <p className="mb-2 text-xs font-medium text-gray-500">Preview</p>
              <Card className="bg-white">
                <CardHeader className="flex-row items-center gap-2 py-3">
                  <div className="flex size-7 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                    <Megaphone className="size-3.5" />
                  </div>
                  <p className="text-sm font-semibold text-gray-900 line-clamp-1">
                    {form.watch("title") || "Announcement title"}
                  </p>
                </CardHeader>
                <CardContent className="py-2">
                  <p className="text-xs text-gray-600 line-clamp-2">
                    {form.watch("message") || "Announcement message preview will appear here..."}
                  </p>
                </CardContent>
              </Card>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" variant="brand" disabled={resource.saving}>
                {editing ? "Save Changes" : form.watch("publish") ? "Publish Announcement" : "Save Draft"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete announcement?"
        description={`This will permanently delete "${deleteTarget?.title}". This action cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={confirmDelete}
      />
    </div>
  )
}
