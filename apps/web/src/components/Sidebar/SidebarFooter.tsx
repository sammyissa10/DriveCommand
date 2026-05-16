"use client"

import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, LifeBuoy } from "lucide-react"
import Link from "next/link"
import { labelVariants } from "./motion"
import { ITEM_BORDER_RADIUS } from "./sidebar.config"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarFooterProps {
  isExpanded: boolean
  onToggle: () => void
  supportBadge?: React.ReactNode
}

/**
 * SidebarFooter - support card and toggle button
 * - When expanded: show support card with icon + label + badge
 * - When collapsed: show icon only with tooltip
 * - Toggle button: chevron icon (left when expanded, right when collapsed)
 * - Border-top separator
 */
export function SidebarFooter({
  isExpanded,
  onToggle,
  supportBadge,
}: SidebarFooterProps) {
  const supportContent = (
    <Link
      href="/support"
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
        "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
        !isExpanded && "justify-center"
      )}
      style={{
        borderRadius: `${ITEM_BORDER_RADIUS}px`,
      }}
    >
      <LifeBuoy
        className="shrink-0"
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      {isExpanded && (
        <motion.span
          variants={labelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.15 }}
          className="text-[13px] font-normal"
        >
          Support
        </motion.span>
      )}
      {isExpanded && supportBadge && (
        <motion.div
          variants={labelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ delay: 0.05, duration: 0.15 }}
          className="ml-auto"
        >
          {supportBadge}
        </motion.div>
      )}
    </Link>
  )

  return (
    <div className="mt-auto border-t border-sidebar-border pt-4 pb-4 px-2">
      <div className="mb-2">
        {!isExpanded ? (
          <Tooltip>
            <TooltipTrigger asChild>{supportContent}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Support
            </TooltipContent>
          </Tooltip>
        ) : (
          supportContent
        )}
      </div>

      <button
        onClick={onToggle}
        className={cn(
          "flex items-center gap-3 p-2 rounded-lg transition-colors duration-150 w-full",
          "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
          !isExpanded && "justify-center"
        )}
        style={{
          borderRadius: `${ITEM_BORDER_RADIUS}px`,
        }}
        aria-label={isExpanded ? "Collapse sidebar" : "Expand sidebar"}
      >
        {isExpanded ? (
          <ChevronLeft
            className="shrink-0"
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : (
          <ChevronRight
            className="shrink-0"
            size={16}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
        <AnimatePresence mode="wait">
          {isExpanded && (
            <motion.span
              variants={labelVariants}
              initial="hidden"
              animate="visible"
              exit="hidden"
              transition={{ duration: 0.15 }}
              className="text-[13px] font-normal"
            >
              Collapse
            </motion.span>
          )}
        </AnimatePresence>
      </button>
    </div>
  )
}
