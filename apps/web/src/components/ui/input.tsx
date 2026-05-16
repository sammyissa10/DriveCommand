import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const inputVariants = cva(
  "flex w-full rounded-brand-sm border text-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      tone: {
        light:
          "h-11 px-4 py-2.5 bg-n-000 border-n-200 text-n-900 shadow-1 placeholder:text-n-300 file:text-n-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-b-500",
        dark:
          "h-11 px-4 py-2.5 bg-[#070B14] border-[#1C2536] text-white placeholder:text-n-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-b-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0E1424]",
      },
    },
    defaultVariants: {
      tone: "light",
    },
  }
)

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement>,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, tone, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(inputVariants({ tone, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input, inputVariants }
