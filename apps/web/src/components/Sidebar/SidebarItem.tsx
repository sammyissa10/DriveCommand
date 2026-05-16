"use client"

import { motion } from "framer-motion"
import Link from "next/link"
import { labelVariants } from "./motion"
import { ITEM_BORDER_RADIUS } from "./sidebar.config"
import type { NavItem } from "./sidebar.config"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarItemProps {
  item: NavItem
  isExpanded: boolean
  isActive: boolean
  index: number
  onNavigate: () => void
}

/**
 * SidebarItem - individual navigation link with icon + animated label
 * - Icon always visible (16px, stroke-width 1.75)
 * - Label animates with stagger delay (index * 20ms)
 * - Tooltip shown when collapsed
 * - Active state: bg-sidebar-accent background tint
 * - Hover: 150-200ms ease-out
 */
export function SidebarItem({
  item,
  isExpanded,
  isActive,
  index,
  onNavigate,
}: SidebarItemProps) {
  const Icon = item.icon

  const content = (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
        "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
        isActive && "bg-sidebar-accent",
        !isExpanded && "justify-center"
      )}
      style={{
        borderRadius: `${ITEM_BORDER_RADIUS}px`,
      }}
    >
      <Icon
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
          transition={{
            delay: index * 0.02,
            duration: 0.15,
          }}
          className={cn(
            "text-[13px] truncate",
            isActive ? "font-medium" : "font-normal"
          )}
        >
          {item.label}
        </motion.span>
      )}
      {isExpanded && item.badge && (
        <motion.div
          variants={labelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{
            delay: index * 0.02 + 0.05,
            duration: 0.15,
          }}
          className="ml-auto"
        >
          {item.badge}
        </motion.div>
      )}
    </Link>
  )

  // When collapsed, wrap in tooltip
  if (!isExpanded) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {item.label}
        </TooltipContent>
      </Tooltip>
    )
  }

  return content
}
