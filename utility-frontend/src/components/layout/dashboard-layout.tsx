import * as React from "react"
import { Outlet } from "react-router-dom"
import { Sidebar } from "./sidebar"
import { Header } from "./header"
import { Breadcrumb } from "./breadcrumb"
import type { NavItem } from "@/config/nav"

interface DashboardLayoutProps {
  navItems: NavItem[]
  brandLabel: string
}

export function DashboardLayout({ navItems, brandLabel }: DashboardLayoutProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar
        items={navItems}
        brandLabel={brandLabel}
        mobileOpen={mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
      />
      <div className="lg:pl-60">
        <Header onOpenMobileSidebar={() => setMobileOpen(true)} />
        <main className="px-4 py-5 lg:px-6 lg:py-6">
          <div className="mb-4">
            <Breadcrumb />
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
