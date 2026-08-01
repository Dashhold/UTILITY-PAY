import { Badge } from "@/components/ui/badge"
import type { TxStatus } from "@/lib/types"

const STATUS_MAP: Record<string, { label: string; variant: "success" | "warning" | "danger" | "info" | "default" }> = {
  success: { label: "Success", variant: "success" },
  approved: { label: "Approved", variant: "success" },
  verified: { label: "Verified", variant: "success" },
  active: { label: "Active", variant: "success" },
  completed: { label: "Completed", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  processing: { label: "Processing", variant: "info" },
  not_submitted: { label: "Not Submitted", variant: "default" },
  failed: { label: "Failed", variant: "danger" },
  rejected: { label: "Rejected", variant: "danger" },
  suspended: { label: "Suspended", variant: "danger" },
  inactive: { label: "Inactive", variant: "default" },
  refunded: { label: "Refunded", variant: "info" },
  disabled: { label: "Disabled", variant: "default" },
  enabled: { label: "Enabled", variant: "success" },
}

export function StatusBadge({ status }: { status: TxStatus | string }) {
  const meta = STATUS_MAP[status] ?? { label: status, variant: "default" as const }
  return (
    <Badge variant={meta.variant} dot>
      {meta.label}
    </Badge>
  )
}
