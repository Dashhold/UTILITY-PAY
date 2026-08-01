import { useNavigate } from "react-router-dom"
import { Search, Menu, LogOut, Settings, User as UserIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { initials } from "@/lib/utils"
import { useAuth } from "@/context/auth-context"

interface HeaderProps {
  onOpenMobileSidebar: () => void
}

export function Header({ onOpenMobileSidebar }: HeaderProps) {
  const { user, role, logout } = useAuth()
  const navigate = useNavigate()

  async function handleLogout() {
    // logout() revokes the refresh token server-side, then clears local state.
    // It resolves even if the revoke call fails, so navigation is unconditional.
    await logout()
    navigate("/login", { replace: true })
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:px-6">
      <button onClick={onOpenMobileSidebar} className="text-gray-500 hover:text-gray-900 lg:hidden">
        <Menu className="size-5" />
      </button>

      <div className="relative hidden max-w-md flex-1 sm:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
        <Input
          placeholder="Search transactions, retailers, orders..."
          className="h-9 border-gray-200 bg-gray-50 pl-9 focus-visible:bg-white"
        />
      </div>

      <div className="flex-1 sm:hidden" />

      <div className="ml-auto flex items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-gray-100">
              <Avatar className="size-8">
                <AvatarFallback className="text-xs font-medium">{initials(user?.name ?? "U")}</AvatarFallback>
              </Avatar>
              <div className="hidden flex-col items-start leading-tight md:flex">
                <span className="text-sm font-semibold text-gray-900">{user?.name}</span>
                <span className="text-xs capitalize text-gray-500">{role}</span>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="flex flex-col">
                <span className="text-sm font-medium text-gray-900">{user?.name}</span>
                <span className="text-xs text-gray-500">{user?.email}</span>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => navigate(role === "admin" ? "/admin/settings" : "/retailer/profile")}>
              <UserIcon className="size-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => navigate(role === "admin" ? "/admin/settings" : "/retailer/settings")}>
              <Settings className="size-4" /> Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={handleLogout}>
              <LogOut className="size-4" /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
