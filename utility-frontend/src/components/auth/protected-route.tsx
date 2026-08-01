import { Navigate, Outlet, useLocation } from "react-router-dom"
import { Loader2 } from "lucide-react"
import { useAuth } from "@/context/auth-context"
import type { Role } from "@/lib/types"

interface ProtectedRouteProps {
  allowedRole: Role
}

export function ProtectedRoute({ allowedRole }: ProtectedRouteProps) {
  const { isAuthenticated, role, isLoading } = useAuth()
  const location = useLocation()

  // The stored token is validated against the server on mount. Redirecting
  // before that resolves would bounce a signed-in user to the login screen on
  // every refresh.
  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="size-6 animate-spin text-gray-400" />
          <p className="text-sm text-gray-500">Restoring your session...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  if (role !== allowedRole) {
    // Signed in, but as the other role — send them to their own dashboard.
    return <Navigate to={role === "admin" ? "/admin" : "/retailer"} replace />
  }

  return <Outlet />
}
