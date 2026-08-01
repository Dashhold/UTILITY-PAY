import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium w-fit",
  {
    variants: {
      variant: {
        default: "border-gray-200 bg-gray-100 text-gray-700",
        success: "border-success-500/20 bg-success-bg text-success-600",
        danger: "border-danger-500/20 bg-danger-bg text-danger-600",
        warning: "border-warning-500/20 bg-warning-bg text-warning-500",
        info: "border-info-500/20 bg-info-bg text-info-500",
        brand: "border-brand-500/30 bg-brand-50 text-brand-700",
        outline: "border-gray-300 bg-white text-gray-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "size-1.5 rounded-full",
            variant === "success" && "bg-success-500",
            variant === "danger" && "bg-danger-500",
            variant === "warning" && "bg-warning-500",
            variant === "info" && "bg-info-500",
            variant === "brand" && "bg-brand-500",
            (!variant || variant === "default" || variant === "outline") &&
              "bg-gray-400"
          )}
        />
      )}
      {children}
    </div>
  )
}

export { Badge, badgeVariants }
