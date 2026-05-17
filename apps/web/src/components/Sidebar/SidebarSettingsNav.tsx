"use client"

import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, ChevronLeft, ChevronRight, HelpCircle } from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { labelVariants } from "./motion"
import { ITEM_BORDER_RADIUS } from "./sidebar.config"
import { SETTINGS_NAV_SECTIONS } from "@/components/settings/settings.config"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface SidebarSettingsNavProps {
  /** Visual expanded state — controls whether to show labels */
  isExpanded: boolean
  /** Actual sidebar collapsed state — controls toggle button label */
  actualSidebarExpanded: boolean
  /** Callback when sidebar toggle is clicked */
  onToggle: () => void
  /** Callback when navigation occurs (e.g., close peek) */
  onNavigate?: () => void
  /** Whether reduced motion is preferred */
  prefersReducedMotion?: boolean
}

/**
 * SidebarSettingsNav - Settings navigation that replaces main nav
 *
 * Vercel-style drill-down pattern:
 * - Back button at top to return to main navigation
 * - Settings navigation items grouped by section
 * - Collapse/Expand toggle at bottom
 */
export function SidebarSettingsNav({
  isExpanded,
  actualSidebarExpanded,
  onToggle,
  onNavigate,
  prefersReducedMotion = false,
}: SidebarSettingsNavProps) {
  const pathname = usePathname()
  const router = useRouter()

  // Single source of truth for collapse button labels
  const toggleLabel = actualSidebarExpanded ? "Collapse sidebar" : "Expand sidebar"
  const toggleLabelShort = actualSidebarExpanded ? "Collapse" : "Expand"

  // Shared styles for nav items
  const navItemBaseStyles = cn(
    "group flex items-center gap-3 p-2 rounded-lg transition-colors duration-150",
    "hover:bg-[hsl(var(--sidebar-bg-hover))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-1"
  )

  const handleBackClick = () => {
    // Navigate back to dashboard (main nav home)
    router.push("/carrier/dashboard")
    onNavigate?.()
  }

  const backButton = (
    <button
      onClick={handleBackClick}
      className={cn(
        navItemBaseStyles,
        "w-full",
        !isExpanded && "justify-center"
      )}
      style={{ borderRadius: `${ITEM_BORDER_RADIUS}px` }}
      aria-label="Back to main navigation"
    >
      <ArrowLeft
        className="shrink-0 text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))] transition-colors duration-150"
        size={16}
        strokeWidth={1.75}
        aria-hidden="true"
      />
      <AnimatePresence mode="wait">
        {isExpanded && (
          <motion.span
            variants={labelVariants}
            initial="hidden"
            animate="visible"
            exit="hidden"
            transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
            className="text-[13px] font-medium text-[hsl(var(--sidebar-fg))] group-hover:text-[hsl(var(--sidebar-fg))] transition-colors duration-150"
          >
            Settings
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )

  // Check if Help is active
  const isHelpActive = pathname.startsWith("/help")

  const helpContent = (
    <Link
      href="/help"
      onClick={onNavigate}
      className={cn(
        navItemBaseStyles,
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
          transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
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
      {/* Keyboard shortcut hint */}
      {isExpanded && (
        <motion.span
          variants={labelVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ delay: 0.05, duration: prefersReducedMotion ? 0 : 0.15 }}
          className="ml-auto text-[11px] font-medium text-[hsl(var(--sidebar-fg-muted))] opacity-60"
        >
          ?
        </motion.span>
      )}
    </Link>
  )

  return (
    <>
      {/* Header with back button */}
      <div className="border-b border-[hsl(var(--sidebar-border-color))] px-2 py-3 shrink-0">
        {!isExpanded ? (
          <Tooltip>
            <TooltipTrigger asChild>{backButton}</TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Back to Navigation
            </TooltipContent>
          </Tooltip>
        ) : (
          backButton
        )}
      </div>

      {/* Settings navigation - scrollable area */}
      <ScrollArea className="flex-1 px-2 sidebar-scroll">
        <div className="py-3 space-y-4">
          {SETTINGS_NAV_SECTIONS.map((section, sectionIndex) => (
            <div key={section.id}>
              {/* Section label */}
              {isExpanded && (
                <motion.h3
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: sectionIndex * 0.05, duration: prefersReducedMotion ? 0 : 0.15 }}
                  className="text-[11px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--sidebar-fg-subtle))] mb-2 px-2"
                >
                  {section.label}
                </motion.h3>
              )}

              {/* Section items */}
              <nav className="space-y-0.5">
                {section.items.map((item, itemIndex) => {
                  // Active state: exact match or starts with (for nested routes)
                  const isActive =
                    pathname === item.href || pathname.startsWith(`${item.href}/`)

                  const navItem = (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={onNavigate}
                      className={cn(
                        navItemBaseStyles,
                        !isExpanded && "justify-center",
                        isActive && [
                          "bg-[hsl(var(--sidebar-bg-active))]",
                          "border border-[hsl(var(--sidebar-bg-active-border))]",
                          // 2px left accent bar
                          "relative before:absolute before:left-0 before:top-1/2 before:-translate-y-1/2 before:h-4 before:w-[2px] before:rounded-full before:bg-[hsl(var(--sidebar-active-accent))]",
                        ]
                      )}
                      style={{ borderRadius: `${ITEM_BORDER_RADIUS}px` }}
                    >
                      {/* First letter as icon when collapsed */}
                      {!isExpanded && (
                        <span
                          className={cn(
                            "text-[13px] font-medium transition-colors duration-150",
                            isActive
                              ? "text-[hsl(var(--sidebar-fg))]"
                              : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
                          )}
                        >
                          {item.label.charAt(0)}
                        </span>
                      )}
                      {isExpanded && (
                        <motion.span
                          variants={labelVariants}
                          initial="hidden"
                          animate="visible"
                          exit="hidden"
                          transition={{
                            delay: (sectionIndex * section.items.length + itemIndex) * 0.02,
                            duration: prefersReducedMotion ? 0 : 0.15,
                          }}
                          className={cn(
                            "text-[13px] font-normal transition-colors duration-150",
                            isActive
                              ? "text-[hsl(var(--sidebar-fg))] font-medium"
                              : "text-[hsl(var(--sidebar-fg-muted))] group-hover:text-[hsl(var(--sidebar-fg))]"
                          )}
                        >
                          {item.label}
                        </motion.span>
                      )}
                    </Link>
                  )

                  // Wrap in tooltip when collapsed
                  if (!isExpanded) {
                    return (
                      <Tooltip key={item.id}>
                        <TooltipTrigger asChild>{navItem}</TooltipTrigger>
                        <TooltipContent side="right" sideOffset={8}>
                          {item.label}
                        </TooltipContent>
                      </Tooltip>
                    )
                  }

                  return navItem
                })}
              </nav>
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Footer - pinned to bottom (Help + Collapse toggle) */}
      <div className="mt-auto border-t border-[hsl(var(--sidebar-border-color))] pt-3 pb-4 px-2 space-y-1">
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
                    transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
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
    </>
  )
}
