import * as React from "react"
import { NavLink, useLocation } from "react-router-dom"
import { ChevronDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { NavItem } from "@/config/nav"

interface SidebarProps {
  items: NavItem[]
  brandLabel: string
  mobileOpen: boolean
  onCloseMobile: () => void
}

// Explicit inline colors (not just Tailwind utility classes) so nothing —
// not CSS specificity, not inherited values, not a browser/OS forced-color
// pass — can silently swap these out after paint.
const COLOR_WHITE = "#ffffff"
const COLOR_BLACK = "#0a0a0a"

function NavGroup({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  const location = useLocation()
  const isChildActive = item.children?.some((c) => location.pathname === c.href)
  const [open, setOpen] = React.useState(!!isChildActive)

  React.useEffect(() => {
    if (isChildActive) setOpen(true)
  }, [isChildActive])

  if (!item.children) {
    return (
      <NavLink
        to={item.href}
        onClick={onNavigate}
        end={item.href === "/admin" || item.href === "/retailer"}
        className={({ isActive }) =>
          cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
            isActive ? "bg-white" : "bg-transparent hover:bg-gray-800"
          )
        }
      >
        {({ isActive }) => (
          <>
            <item.icon
              className="size-4 shrink-0"
              style={{ color: isActive ? COLOR_BLACK : COLOR_WHITE }}
            />
            <span className="truncate" style={{ color: isActive ? COLOR_BLACK : COLOR_WHITE }}>
              {item.label}
            </span>
          </>
        )}
      </NavLink>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium",
          isChildActive ? "bg-gray-800" : "bg-transparent hover:bg-gray-800"
        )}
      >
        <item.icon className="size-4 shrink-0" style={{ color: COLOR_WHITE }} />
        <span className="flex-1 truncate text-left" style={{ color: COLOR_WHITE }}>
          {item.label}
        </span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 transition-transform", open && "rotate-180")}
          style={{ color: COLOR_WHITE }}
        />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-gray-700 pl-3">
          {item.children.map((child) => (
            <NavLink
              key={child.href}
              to={child.href}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium",
                  isActive ? "bg-white" : "bg-transparent hover:bg-gray-800"
                )
              }
            >
              {({ isActive }) => (
                <span className="truncate" style={{ color: isActive ? COLOR_BLACK : COLOR_WHITE }}>
                  {child.label}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  )
}

export function Sidebar({ items, brandLabel, mobileOpen, onCloseMobile }: SidebarProps) {
  const content = (
    <div className="sidebar-shell flex h-full flex-col bg-black">
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-gray-800 px-4">
        <div className="flex items-center gap-2">
          <img src="/utili-logo.jpeg" alt="UtilityPay" className="size-8 rounded-md object-cover" />
          <div className="flex flex-col leading-none">
            <span className="text-sm font-semibold" style={{ color: COLOR_WHITE }}>UtilityPay</span>
            <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{brandLabel}</span>
          </div>
        </div>
        <button onClick={onCloseMobile} className="text-gray-400 hover:text-white lg:hidden">
          <X className="size-5" />
        </button>
      </div>
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-3">
        {items.map((item) => (
          <NavGroup key={item.href} item={item} onNavigate={onCloseMobile} />
        ))}
      </nav>
      <div className="border-t border-gray-800 p-3">
        <div className="rounded-md bg-gray-900 px-3 py-2.5">
          <p className="text-[11px] font-medium text-gray-400">API Status</p>
          <div className="mt-1 flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-success-500" />
            <span className="text-xs font-medium text-gray-200">All systems operational</span>
          </div>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-60 lg:flex-col">
        {content}
      </aside>

      {/* Mobile */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={onCloseMobile} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl">{content}</div>
        </div>
      )}
    </>
  )
}
