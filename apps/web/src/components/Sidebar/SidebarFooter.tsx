"use client"

import { motion, AnimatePresence } from "framer-motion"
import { ChevronLeft, ChevronRight, Settings, HelpCircle } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { labelVariants } from "./motion"
import { ITEM_BORDER_RADIUS } from "./sidebar.config"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarFooterProps {
  /** Visual expanded state — controls whether to show labels */
  isExpanded: boolean
  /** Actual sidebar collapsed state — controls toggle button label ("Expand" vs "Collapse") */
  actualSidebarExpanded: boolean
  onToggle: () => void
}

/**
 * SidebarFooter - Settings, Help, and toggle button
 *
 * Footer entries are visually separated from main nav by border-top.
 * - Settings: links to /settings, active when on any /settings/* route
 * - Help: links to /help, active when on any /help/* route, keyboard shortcut "?"
 * - Toggle: chevron icon (left when expanded, right when collapsed)
 */
export function SidebarFooter({
  isExpanded,
  actualSidebarExpanded,
  onToggle,
}: SidebarFooterProps) {
  const pathname = usePathname()

  // Single source of truth for collapse button labels — based on ACTUAL sidebar state
  // This ensures correct label even when rendered in peek overlay (visually expanded)
  const toggleLabel = actualSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"
  const toggleLabelShort = actualSidebarExpanded ? "Collapse" : "Expand"

  // Active state checks for footer items
  const isSettingsActive = pathname.startsWith("/settings")
  const isHelpActive = pathname.startsWith("/help")

  // Shared styles for footer nav items
  const footerItemBaseStyles = cn(
    "group flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
    "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1"
  )

  const settingsContent = (
    <Link
      href="/settings"
      className={cn(
        footerItemBaseStyles,
        !isExpanded && "justify-center",
        isSettingsActive && "bg-[hsl(var(--sidebar-bg-active))]"
      )}
      style={{ borderRadius: `${ITEM_BORDER_RADIUS}px` }}
    >
      <Settings
        className={cn(
          "shrink-0 transition-colors duration-150",
          isSettingsActive
            ? "text-[hsl(var(--sidebar-fg))]"
            : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
        )}
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
          className={cn(
            "text-[13px] font-normal transition-colors duration-150",
            isSettingsActive
              ? "text-[hsl(var(--sidebar-fg))]"
              : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
          )}
        >
          Settings
        </motion.span>
      )}
      {/* Chevron indicator - shows this opens a new navigation view */}
      {isExpanded && (
        <motion.div
          variants={labelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ delay: 0.05, duration: 0.15 }}
          className="ml-auto"
        >
          <ChevronRight
            className="text-[hsl(var(--sidebar-fg-muted))] opacity-60 group-hover:opacity-100 transition-opacity duration-150"
            size={14}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </motion.div>
      )}
    </Link>
  )

  const helpContent = (
    <Link
      href="/help"
      className={cn(
        footerItemBaseStyles,
        !isExpanded && "justify-center",
        isHelpActive && "bg-[hsl(var(--sidebar-bg-active))]"
      )}
      style={{ borderRadius: `${ITEM_BORDER_RADIUS}px` }}
    >
      <HelpCircle
        className={cn(
          "shrink-0 transition-colors duration-150",
          isHelpActive
            ? "text-[hsl(var(--sidebar-fg))]"
            : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
        )}
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
          className={cn(
            "text-[13px] font-normal transition-colors duration-150",
            isHelpActive
              ? "text-[hsl(var(--sidebar-fg))]"
              : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
          )}
        >
          Help
        </motion.span>
      )}
      {/* Keyboard shortcut hint in expanded mode */}
      {isExpanded && (
        <motion.span
          variants={labelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ delay: 0.05, duration: 0.15 }}
          className="ml-auto text-[11px] font-medium text-[hsl(var(--sidebar-fg-muted))] opacity-60"
        >
          ?
        </motion.span>
      )}
    </Link>
  )

  return (
    <div className="mt-auto border-t border-[hsl(var(--sidebar-border-color))] pt-3 pb-4 px-2 space-y-1">
      {/* Settings entry */}
      {!isExpanded ? (
        <Tooltip>
          <TooltipTrigger asChild>{settingsContent}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Settings
          </TooltipContent>
        </Tooltip>
      ) : (
        settingsContent
      )}

      {/* Help entry */}
      {!isExpanded ? (
        <Tooltip>
          <TooltipTrigger asChild>{helpContent}</TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            Help (?)
          </TooltipContent>
        </Tooltip>
      ) : (
        helpContent
      )}

      {/* Collapse/Expand toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={onToggle}
            className={cn(
              "group flex items-center gap-3 p-2 rounded-lg transition-colors duration-150 w-full",
              "hover:bg-sidebar-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1",
              !isExpanded && "justify-center"
            )}
            style={{
              borderRadius: `${ITEM_BORDER_RADIUS}px`,
            }}
            aria-label={`${toggleLabel} (⌘\\)`}
          >
            {actualSidebarExpanded ? (
              <ChevronLeft
                className="shrink-0 text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))] transition-colors duration-150"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            ) : (
              <ChevronRight
                className="shrink-0 text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))] transition-colors duration-150"
                size={16}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            )}
            <AnimatePresence mode="wait">
              {isExpanded && (
                <motion.span
                  key="collapse-label"
                  variants={labelVariants}
                  initial="hidden"
                  animate="visible"
                  exit="hidden"
                  transition={{ duration: 0.15 }}
                  className="text-[13px] font-normal text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))] transition-colors duration-150"
                >
                  {toggleLabelShort}
                </motion.span>
              )}
            </AnimatePresence>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right" sideOffset={8}>
          {toggleLabel}{" "}
          <span className="text-[hsl(var(--sidebar-fg-muted))]">(⌘\)</span>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}
