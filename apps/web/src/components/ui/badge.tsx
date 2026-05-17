import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-brand-sm border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-b-500 focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-b-500 text-n-000 shadow-1 hover:bg-b-400",
        secondary:
          "border-transparent bg-n-100 text-n-900 hover:bg-n-200",
        destructive:
          "border-transparent bg-brand-critical text-n-000 shadow-1",
        outline: "text-n-900 border-n-200",
        // Semantic variants from brand guide
        success: "border-transparent bg-brand-success/10 text-brand-success",
        warning: "border-transparent bg-brand-warning/10 text-brand-warning",
        critical: "border-transparent bg-brand-critical/10 text-brand-critical",
        info: "border-transparent bg-b-050 text-b-600",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
