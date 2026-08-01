import { Link } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { FileQuestion } from "lucide-react"

export function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-gray-100">
        <FileQuestion className="size-7 text-gray-400" />
      </div>
      <div>
        <p className="text-3xl font-semibold text-gray-900">404</p>
        <p className="mt-1 text-sm text-gray-500">The page you're looking for doesn't exist or has been moved.</p>
      </div>
      <Button asChild>
        <Link to="/">Back to dashboard</Link>
      </Button>
    </div>
  )
}
