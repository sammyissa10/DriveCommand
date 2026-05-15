import * as React from "react"

import { cn } from "@/lib/utils"

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-11 w-full rounded-brand-sm border border-n-200 bg-n-000 px-4 py-2.5 text-sm shadow-1 transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-n-900 placeholder:text-n-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-b-500 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
