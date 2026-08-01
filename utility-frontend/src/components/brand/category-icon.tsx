import {
  Zap, Droplets, Flame, Cylinder, Wifi, PhoneCall, Smartphone, CreditCard,
  ShieldCheck, Landmark, Building2, Building, GraduationCap, Home, Tv, Repeat,
  HeartPulse, Users, KeyRound, Receipt, type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Maps the `icon` field of a Bharat Connect category to its lucide component.
 * Keys must match `BHARAT_CONNECT_CATEGORIES` in `src/lib/brand.ts`.
 */
const ICONS: Record<string, LucideIcon> = {
  Zap, Droplets, Flame, Cylinder, Wifi, PhoneCall, Smartphone, CreditCard,
  ShieldCheck, Landmark, Building2, Building, GraduationCap, Home, Tv, Repeat,
  HeartPulse, Users, KeyRound,
}

export function resolveCategoryIcon(name: string): LucideIcon {
  return ICONS[name] ?? Receipt
}

export function CategoryIcon({ name, className }: { name: string; className?: string }) {
  const Icon = resolveCategoryIcon(name)
  return <Icon className={cn("size-4", className)} />
}
