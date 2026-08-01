import { Link, useLocation } from "react-router-dom"
import { ChevronRight, Home } from "lucide-react"

function titleCase(segment: string) {
  return segment
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ")
}

export function Breadcrumb() {
  const location = useLocation()
  const segments = location.pathname.split("/").filter(Boolean)

  if (segments.length <= 1) return null

  const crumbs = segments.map((seg, idx) => {
    const href = "/" + segments.slice(0, idx + 1).join("/")
    return { label: titleCase(seg), href }
  })

  return (
    <nav className="flex items-center gap-1.5 text-xs text-gray-500">
      <Link to="/" className="flex items-center hover:text-gray-900">
        <Home className="size-3.5" />
      </Link>
      {crumbs.map((c, idx) => (
        <span key={c.href} className="flex items-center gap-1.5">
          <ChevronRight className="size-3 text-gray-300" />
          {idx === crumbs.length - 1 ? (
            <span className="font-medium text-gray-900">{c.label}</span>
          ) : (
            <Link to={c.href} className="hover:text-gray-900">
              {c.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  )
}
