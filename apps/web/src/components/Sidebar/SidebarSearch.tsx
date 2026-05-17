"use client"

import { useEffect } from "react"
import { Search } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { labelVariants } from "./motion"
import { ITEM_BORDER_RADIUS } from "./sidebar.config"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { assertContrast } from "@/lib/devAssertions"

interface SidebarSearchProps {
  isExpanded: boolean
  onExpandClick?: () => void
}

/**
 * SidebarSearch - search input at top of sidebar
 * - When expanded: full input with Search icon and placeholder
 * - When collapsed: Search icon button only
 * - Focus ring: ring-sidebar-ring
 */
export function SidebarSearch({
  isExpanded,
  onExpandClick,
}: SidebarSearchProps) {
  // Dev-only contrast assertion
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && isExpanded) {
      // Check input text contrast against input bg
      assertContrast("0 0% 98%", "220 28% 11%", "SidebarSearch input text")
      // Check placeholder contrast against input bg
      assertContrast("220 10% 55%", "220 28% 11%", "SidebarSearch placeholder")
    }
  }, [isExpanded])

  if (!isExpanded) {
    return (
      <div className="px-2 mb-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onExpandClick}
              className={cn(
                "flex items-center justify-center p-2 rounded-lg transition-colors duration-150 w-full",
                "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1"
              )}
              style={{
                borderRadius: `${ITEM_BORDER_RADIUS}px`,
              }}
              aria-label="Expand to search"
            >
              <Search
                className="shrink-0 text-[hsl(var(--sidebar-fg-muted))]"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Search
          </TooltipContent>
        </Tooltip>
      </div>
    )
  }

  return (
    <div className="px-2 mb-4">
      <motion.div
        variants={labelVariants}
        initial="hidden"
        animate="visible"
        exit="hidden"
        transition={{ duration: 0.15 }}
      >
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 -translate-y-1/2 shrink-0 text-[hsl(var(--sidebar-fg-muted))]"
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search..."
            className={cn(
              "pl-8 h-9 text-[13px] sidebar-input",
              "focus-visible:ring-sidebar-ring"
            )}
            style={{
              borderRadius: `${ITEM_BORDER_RADIUS}px`,
              // Solid input: elevated from sidebar gradient
              backgroundColor: "hsl(220 30% 11%)",
              border: "1px solid hsl(220 22% 18%)",
              // Typed text uses sidebar fg
              color: "hsl(var(--sidebar-fg))",
              // Caret visible
              caretColor: "hsl(var(--sidebar-fg))",
            }}
          />
        </div>
      </motion.div>
    </div>
  )
}
