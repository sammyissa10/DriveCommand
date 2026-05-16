"use client"

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
                className="shrink-0"
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
            className="absolute left-2 top-1/2 -translate-y-1/2 shrink-0 text-sidebar-foreground/60"
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder="Search..."
            className={cn(
              "pl-8 h-9 text-[13px] bg-sidebar-accent/50 border-sidebar-border",
              "focus-visible:ring-sidebar-ring placeholder:text-sidebar-foreground/40"
            )}
            style={{
              borderRadius: `${ITEM_BORDER_RADIUS}px`,
            }}
          />
        </div>
      </motion.div>
    </div>
  )
}
