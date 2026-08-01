import type { LucideIcon } from "lucide-react"
import {
  LayoutDashboard, Boxes, MapPin, Users, Wrench, ClipboardList, Percent, Megaphone,
  Ticket, Landmark, UserCog, History, FileBarChart, Wallet,
  Send, Settings, User, ShieldCheck, Fingerprint, Grid3x3, FileText, Receipt, BadgePercent,
  BadgeIndianRupee, SlidersHorizontal, LifeBuoy, ArrowLeftRight,
} from "lucide-react"

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  children?: NavItem[]
}

export const adminNav: NavItem[] = [
  { label: "Dashboard", href: "/admin", icon: LayoutDashboard },
  {
    label: "Modules", href: "/admin/modules", icon: Boxes,
    children: [
      { label: "Service Category", href: "/admin/modules/service-category", icon: Grid3x3 },
      { label: "City Master", href: "/admin/modules/city-master", icon: MapPin },
      { label: "User Type Master", href: "/admin/modules/user-type-master", icon: Users },
      { label: "Service Master", href: "/admin/modules/service-master", icon: Wrench },
      { label: "Plan Master", href: "/admin/modules/plan-master", icon: ClipboardList },
      { label: "Commission Slots", href: "/admin/modules/commission-slots", icon: Percent },
      { label: "Announcements", href: "/admin/modules/announcements", icon: Megaphone },
      { label: "Ticket Departments", href: "/admin/modules/ticket-departments", icon: Ticket },
    ],
  },
  // Products and Orders are deliberately absent: the catalogue is out of scope
  // for this release and there is no way for a retailer to place an order yet,
  // so the screens would only ever show an empty table.
  { label: "Company Banks", href: "/admin/company-banks", icon: Landmark },
  { label: "User Manager", href: "/admin/user-manager", icon: UserCog },
  { label: "Account History", href: "/admin/account-history", icon: History },
  { label: "Service Report", href: "/admin/service-report", icon: FileBarChart },
  { label: "Fund Requests", href: "/admin/fund-requests", icon: Wallet },
  { label: "Payout Banks", href: "/admin/payout-banks", icon: Landmark },
  { label: "Fund Transfer", href: "/admin/fund-transfer", icon: Send },
  { label: "Settings", href: "/admin/settings", icon: Settings },
]

export const retailerNav: NavItem[] = [
  { label: "Dashboard", href: "/retailer", icon: LayoutDashboard },
  { label: "Profile", href: "/retailer/profile", icon: User },
  { label: "KYC", href: "/retailer/kyc", icon: ShieldCheck },
  { label: "AEPS", href: "/retailer/services/aeps", icon: Fingerprint },
  {
    label: "Bharat Connect", href: "/retailer/bharat-connect", icon: Receipt,
    children: [
      { label: "Pay a Bill", href: "/retailer/bharat-connect", icon: Receipt },
      { label: "All Categories", href: "/retailer/bharat-connect/categories", icon: Grid3x3 },
      { label: "Transaction History", href: "/retailer/bharat-connect/transactions", icon: ArrowLeftRight },
      { label: "Complaints", href: "/retailer/bharat-connect/complaints", icon: LifeBuoy },
    ],
  },
  { label: "Service Report", href: "/retailer/service-report", icon: FileText },
  { label: "Account History", href: "/retailer/account-history", icon: History },
  { label: "My Commission Slab", href: "/retailer/commission-slab", icon: BadgePercent },
  { label: "GST Report", href: "/retailer/gst-report", icon: Receipt },
  { label: "TDS Report", href: "/retailer/tds-report", icon: BadgeIndianRupee },
  { label: "Commission Report", href: "/retailer/commission-report", icon: Percent },
  { label: "Account Settings", href: "/retailer/settings", icon: SlidersHorizontal },
]
