import { ArrowDownRight, ArrowUpRight, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Card } from "@/components/ui/card"

interface StatCardProps {
  label: string
  value: string
  change?: string
  trend?: "up" | "down" | "flat"
  icon: LucideIcon
  iconClassName?: string
  loading?: boolean
}

export function StatCard({ label, value, change, trend, icon: Icon, iconClassName, loading }: StatCardProps) {
  if (loading) {
    return (
      <Card className="p-4">
        <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
        <div className="mt-3 h-6 w-24 animate-pulse rounded bg-gray-100" />
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-2 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <div className={cn("flex size-8 items-center justify-center rounded-md bg-gray-100", iconClassName)}>
          <Icon className="size-4" />
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="table-num text-2xl font-semibold tracking-tight text-gray-900">{value}</span>
      </div>
      {change && (
        <div className="flex items-center gap-1 text-xs font-medium">
          {trend === "up" && <ArrowUpRight className="size-3.5 text-success-500" />}
          {trend === "down" && <ArrowDownRight className="size-3.5 text-danger-500" />}
          <span className={cn(trend === "up" && "text-success-600", trend === "down" && "text-danger-600", trend === "flat" && "text-gray-500")}>
            {change}
          </span>
          <span className="text-gray-400">vs yesterday</span>
        </div>
      )}
    </Card>
  )
}
