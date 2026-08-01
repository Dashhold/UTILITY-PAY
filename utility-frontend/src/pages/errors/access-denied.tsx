import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { ShieldAlert } from "lucide-react"

export function AccessDenied() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-danger-50">
        <ShieldAlert className="size-7 text-danger-500" />
      </div>
      <div>
        <p className="text-2xl font-semibold text-gray-900">Access Denied</p>
        <p className="mt-1 text-sm text-gray-500">You don't have permission to view this page.</p>
      </div>
      <Button asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
