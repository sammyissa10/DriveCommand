"use client"

import { useState, useEffect } from "react"
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
import { assertContrast } from "@/lib/devAssertions"

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
 * - Active state: 220ms Apple smooth curve, 1px inner border
 * - Click feedback: 120ms tactile compress (respects prefers-reduced-motion)
 */
export function SidebarItem({
  item,
  isExpanded,
  isActive,
  index,
  onNavigate,
}: SidebarItemProps) {
  const Icon = item.icon
  const [isPressed, setIsPressed] = useState(false)
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(mediaQuery.matches)
    const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    mediaQuery.addEventListener("change", handler)
    return () => mediaQuery.removeEventListener("change", handler)
  }, [])

  // Dev-only contrast assertion
  useEffect(() => {
    if (process.env.NODE_ENV === "development" && isActive) {
      // Check active text contrast against active bg
      assertContrast("0 0% 98%", "220 25% 14%", `SidebarItem "${item.label}" active text`)
    }
  }, [isActive, item.label])

  const content = (
    <Link
      href={item.href}
      onClick={onNavigate}
      onMouseDown={() => !prefersReducedMotion && setIsPressed(true)}
      onMouseUp={() => setIsPressed(false)}
      onMouseEnter={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = "hsl(var(--sidebar-bg-hover))"
        }
      }}
      onMouseLeave={(e) => {
        if (!isActive) {
          e.currentTarget.style.backgroundColor = ""
        }
        setIsPressed(false)
      }}
      className={cn(
        "group flex items-center gap-3 p-2 rounded-lg relative overflow-hidden",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
        !isExpanded && "justify-center"
      )}
      style={{
        borderRadius: `${ITEM_BORDER_RADIUS}px`,
        // Apple smooth curve for background transition
        transition: "background-color 220ms cubic-bezier(0.32, 0.72, 0, 1), transform 120ms ease-out, box-shadow 220ms ease-out, border-color 220ms ease-out",
        // Active state: elevated pill with SOLID bg (10-15% lightness step from sidebar bg)
        backgroundColor: isActive
          ? "hsl(var(--sidebar-bg-active))"
          : undefined,
        // Active state: 1px solid inner border
        boxShadow: isActive
          ? "inset 0 0 0 1px hsl(var(--sidebar-bg-active-border))"
          : "none",
        // Click press feedback
        transform: isPressed ? "scale(0.985)" : "scale(1)",
      }}
    >
      {/* Active state: 2px left-edge accent bar (electric blue beacon) */}
      {isActive && (
        <span
          className="absolute left-0 top-[4px] bottom-[4px] w-[2px] rounded-r-full"
          style={{
            backgroundColor: "hsl(var(--sidebar-active-accent))",
          }}
          aria-hidden="true"
        />
      )}
      <Icon
        className={cn(
          "shrink-0",
          isActive
            ? "text-[hsl(var(--sidebar-fg))]"
            : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
        )}
        style={{
          transition: "color 180ms ease-out",
        }}
        size={16}
        strokeWidth={isActive ? 2.0 : 1.75}
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
            isActive
              ? "font-medium text-[hsl(var(--sidebar-fg))]"
              : "font-normal text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
          )}
          style={{
            transition: "color 180ms ease-out",
          }}
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
