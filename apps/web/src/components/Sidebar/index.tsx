"use client"

import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/lib/auth/auth-context"
import { UserRole } from "@/lib/auth/roles"
import type { UserPermissions } from "@/lib/auth/permissions"
import Link from "next/link"
import { useSidebarState } from "./useSidebarState"
import { useMotionConfig, sidebarVariants } from "./motion"
import { SidebarGroup } from "./SidebarGroup"
import { SidebarFooter } from "./SidebarFooter"
import { SidebarSettingsNav } from "./SidebarSettingsNav"
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { NavGroup } from "./sidebar.config"
import {
  SIDEBAR_WIDTH_EXPANDED,
  SIDEBAR_WIDTH_COLLAPSED,
  PEEK_ENTER_DELAY,
  PEEK_EXIT_DELAY,
} from "./sidebar.config"
import {
  LayoutDashboard,
  MapPin,
  Truck,
  Package,
  Users2,
  FileText,
  Boxes,
  MessageSquare,
  UserCircle,
  Route,
  Building2,
  ListChecks,
  CalendarDays,
  FileScan,
} from "lucide-react"
import { DispatchBadge } from "@/components/navigation/dispatch-badge"
import { MessagesBadge } from "@/components/navigation/messages-badge"
import { useEffect, useState, useRef, useCallback } from "react"

interface AnimatedSidebarProps {
  /** @deprecated Support badge removed — footer now has Settings + Help */
}

/**
 * Check if a manager has access to a specific permission key.
 * Default-all-true: returns true unless explicitly set to false.
 */
function managerHasPermission(
  permissions: UserPermissions | undefined,
  key: keyof UserPermissions
): boolean {
  if (!permissions) return true
  return permissions[key] !== false
}

/**
 * AnimatedSidebar - Main sidebar component with fixed positioning
 *
 * CRITICAL DESIGN DECISIONS:
 * - Sidebar is ALWAYS position: fixed (never scrolls with page)
 * - Flush to viewport edges: left-0 top-0 h-screen (no offset, no rounded corners)
 * - Solid gradient surface (NO backdrop-filter, NO transparency)
 * - Peek renders as SEPARATE overlay element (doesn't mutate collapsed rail)
 * - Main content uses margin-left to offset for sidebar width
 */
export function AnimatedSidebar(_props: AnimatedSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { isExpanded, toggle, setExpanded, isHydrated } = useSidebarState()
  const motionConfig = useMotionConfig()

  // Hover-peek state (visual only, not persisted)
  const [isPeeking, setIsPeeking] = useState(false)
  const peekEnterTimerRef = useRef<NodeJS.Timeout | null>(null)
  const peekExitTimerRef = useRef<NodeJS.Timeout | null>(null)
  const sidebarRef = useRef<HTMLElement>(null)

  // Detect touch device (hover-peek disabled)
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  // Detect reduced motion preference
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false)

  const userRole = user?.role as UserRole | undefined
  const isOwnerOrManager =
    userRole === UserRole.OWNER || userRole === UserRole.MANAGER
  const isManager = userRole === UserRole.MANAGER
  const perms = user?.permissions as UserPermissions | undefined

  // Check if we're on a settings page (drill-down nav pattern)
  const isSettingsView = pathname.startsWith("/settings")

  // Note: hasAnyFleetPerm removed — Fleet items now in OPERATIONS section

  // Detect touch device and reduced motion on mount
  useEffect(() => {
    setIsTouchDevice("ontouchstart" in window || navigator.maxTouchPoints > 0)

    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)")
    setPrefersReducedMotion(motionQuery.matches)
    const motionHandler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches)
    motionQuery.addEventListener("change", motionHandler)
    return () => motionQuery.removeEventListener("change", motionHandler)
  }, [])

  // Update CSS variable when sidebar state changes
  useEffect(() => {
    if (!isHydrated) return

    const width = isExpanded ? SIDEBAR_WIDTH_EXPANDED : SIDEBAR_WIDTH_COLLAPSED
    document.documentElement.style.setProperty("--sidebar-width", `${width}px`)
  }, [isExpanded, isHydrated])

  // Keyboard navigation: Ctrl/Cmd+B or Cmd+\ to toggle sidebar, Esc to close peek
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Cmd+B or Cmd+\ to toggle sidebar
      const isToggleShortcut =
        (event.key === "b" && (event.metaKey || event.ctrlKey)) ||
        (event.key === "\\" && event.metaKey)
      if (isToggleShortcut) {
        event.preventDefault()
        toggle()
      }
      // Esc closes peek immediately
      if (event.key === "Escape" && isPeeking) {
        setIsPeeking(false)
        clearTimers()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggle, isPeeking])

  // Clear peek timers helper
  const clearTimers = useCallback(() => {
    if (peekEnterTimerRef.current) {
      clearTimeout(peekEnterTimerRef.current)
      peekEnterTimerRef.current = null
    }
    if (peekExitTimerRef.current) {
      clearTimeout(peekExitTimerRef.current)
      peekExitTimerRef.current = null
    }
  }, [])

  // Hover-peek handlers for the COLLAPSED RAIL only
  const handleRailMouseEnter = useCallback(() => {
    if (isExpanded || isTouchDevice) return

    // Clear any pending exit timer
    if (peekExitTimerRef.current) {
      clearTimeout(peekExitTimerRef.current)
      peekExitTimerRef.current = null
    }

    // Start enter timer (or instant if reduced motion)
    const delay = prefersReducedMotion ? 0 : PEEK_ENTER_DELAY
    peekEnterTimerRef.current = setTimeout(() => {
      setIsPeeking(true)
    }, delay)
  }, [isExpanded, isTouchDevice, prefersReducedMotion])

  const handleRailMouseLeave = useCallback(() => {
    if (isExpanded || isTouchDevice) return

    // Clear any pending enter timer
    if (peekEnterTimerRef.current) {
      clearTimeout(peekEnterTimerRef.current)
      peekEnterTimerRef.current = null
    }

    // Start exit timer (or instant if reduced motion)
    const delay = prefersReducedMotion ? 0 : PEEK_EXIT_DELAY
    peekExitTimerRef.current = setTimeout(() => {
      setIsPeeking(false)
    }, delay)
  }, [isExpanded, isTouchDevice, prefersReducedMotion])

  // Peek overlay mouse handlers (keep open while hovering overlay)
  const handlePeekMouseEnter = useCallback(() => {
    // Clear any pending exit timer when entering peek overlay
    if (peekExitTimerRef.current) {
      clearTimeout(peekExitTimerRef.current)
      peekExitTimerRef.current = null
    }
  }, [])

  const handlePeekMouseLeave = useCallback(() => {
    if (isTouchDevice) return

    // Start exit timer when leaving peek overlay
    const delay = prefersReducedMotion ? 0 : PEEK_EXIT_DELAY
    peekExitTimerRef.current = setTimeout(() => {
      setIsPeeking(false)
    }, delay)
  }, [isTouchDevice, prefersReducedMotion])

  // Focus handler for accessibility (triggers peek)
  const handleFocus = useCallback(() => {
    if (isExpanded || isTouchDevice) return
    clearTimers()
    setIsPeeking(true)
  }, [isExpanded, isTouchDevice, clearTimers])

  const handleBlur = useCallback((e: React.FocusEvent) => {
    if (isExpanded || isTouchDevice) return
    // Only close if focus is leaving the sidebar entirely
    if (!sidebarRef.current?.contains(e.relatedTarget as Node)) {
      const delay = prefersReducedMotion ? 0 : PEEK_EXIT_DELAY
      peekExitTimerRef.current = setTimeout(() => {
        setIsPeeking(false)
      }, delay)
    }
  }, [isExpanded, isTouchDevice, prefersReducedMotion])

  // Clean up timers on unmount
  useEffect(() => {
    return () => clearTimers()
  }, [clearTimers])

  // Build navigation groups based on user role and permissions
  const navGroups: NavGroup[] = []

  // ============================================================================
  // INTELLIGENCE — "What's happening right now?" (situational awareness)
  // Max 2 items: Live Map, Dashboard
  // ============================================================================
  if (isOwnerOrManager) {
    const intelligenceItems = []

    if (managerHasPermission(perms, "liveMap")) {
      intelligenceItems.push({
        label: "Live Map",
        href: "/live-map",
        icon: MapPin,
        // Live Board (quick-551) is a CHILD of Live Map rather than a third
        // INTELLIGENCE item, deliberately: this section is capped at two, and
        // the board is not a peer of the map — it is the same page rendered as
        // a list (`/live-map?view=board`, the same route, the same data, a
        // different view). A submenu says exactly that; a third top-level entry
        // would claim a separate destination and break the cap.
        //
        // Gated on `liveMap` because it IS the live map: a manager who may not
        // see the map may not see the board.
        children: [
          {
            label: "Live Board",
            href: "/live-map?view=board",
            icon: ListChecks,
          },
        ],
      })
    }

    if (managerHasPermission(perms, "carrierDashboard")) {
      intelligenceItems.push({
        label: "Carrier Dashboard",
        href: "/carrier/dashboard",
        icon: LayoutDashboard,
      })
    }

    if (intelligenceItems.length > 0) {
      navGroups.push({
        label: "Intelligence",
        items: intelligenceItems,
      })
    }
  }

  // ============================================================================
  // OPERATIONS — "The workflow — things that happen"
  // Client → Contract → Route → Load → Trip (carrier workflow order)
  // MAX 5 ITEMS — force discussion before adding more
  // ============================================================================
  if (isOwnerOrManager) {
    const operationsItems = []

    if (managerHasPermission(perms, "clients")) {
      operationsItems.push({
        label: "Clients",
        href: "/carrier/clients",
        icon: Users2,
      })
    }

    if (managerHasPermission(perms, "contracts")) {
      operationsItems.push({
        label: "Contracts",
        href: "/carrier/contracts",
        icon: FileText,
      })
    }

    // Routes — route blueprints for recurring trips (e.g., Wisconsin route, NW Indiana route)
    // Legacy route system (/routes) — SEPARATE from carrier Route Templates (/carrier/templates)
    // Permission: currently ungated (TODO: add 'routes' permission key if needed)
    operationsItems.push({
      label: "Routes",
      href: "/routes",
      icon: Route,
    })

    if (managerHasPermission(perms, "carrierLoads")) {
      operationsItems.push({
        label: "Loads",
        href: "/carrier/loads",
        icon: Package,
      })
    }

    if (managerHasPermission(perms, "dispatches")) {
      operationsItems.push({
        label: "Trips",
        href: "/carrier/trips",
        icon: Truck,
        badge: <DispatchBadge />,
        // Document Import (spec Sections 1-12). A CHILD of Trips rather than a
        // sixth OPERATIONS item, deliberately: this section is capped at five
        // and the cap says "force discussion before adding more". An import is
        // not a peer of Trips — it is one of the ways a trip comes to exist,
        // which is exactly what a submenu says.
        //
        // The module has had its own URLs since Phase 2 and NO sidebar entry
        // through five phases; the only ways in were the picker inside the
        // upload flow and a resume banner. Gated on `dispatches` because an
        // import's only outcome is a trip: anyone who may not see trips has no
        // use for the thing that makes one.
        children: [
          {
            label: "Document Imports",
            href: "/carrier/imports",
            icon: FileScan,
          },
        ],
      })
    }

    if (operationsItems.length > 0) {
      navGroups.push({
        label: "Operations",
        items: operationsItems,
      })
    }
  }

  // ============================================================================
  // RESOURCES — "The things being managed"
  // Drivers, Fleet, Facilities, Checklists
  // MAX 5 ITEMS — force discussion before adding more
  // ============================================================================
  if (isOwnerOrManager) {
    const resourcesItems = []

    if (managerHasPermission(perms, "carrierDrivers")) {
      resourcesItems.push({
        label: "Drivers",
        href: "/carrier/fleet/drivers",
        icon: UserCircle,
      })
    }

    if (managerHasPermission(perms, "carrierTrucks")) {
      resourcesItems.push({
        label: "Fleet",
        href: "/carrier/fleet/trucks",
        icon: Boxes,
      })
    }

    // Facilities — operational memory of every facility (pickup, delivery, or stop)
    // Carrier owners need to see who they've worked with, where, how often, and any operational notes
    if (managerHasPermission(perms, "facilities")) {
      resourcesItems.push({
        label: "Facilities",
        href: "/carrier/facilities",
        icon: Building2,
      })
    }

    // Checklists — triage view of all checklists across the fleet
    // Daily compliance (pre-trip, post-trip), vehicle compliance (maintenance), driver compliance (licenses)
    // Permission: currently ungated (TODO: add 'checklists' permission key if needed)
    resourcesItems.push({
      label: "Checklists",
      href: "/checklists",
      icon: ListChecks,
    })

    // Route Templates — reusable carrier route blueprints that feed the Trip "Route Template" picker
    // Permission: currently ungated (matches Routes/Checklists; TODO: add a permission key if needed)
    resourcesItems.push({
      label: "Route Templates",
      href: "/carrier/templates",
      icon: CalendarDays,
    })

    if (resourcesItems.length > 0) {
      navGroups.push({
        label: "Resources",
        items: resourcesItems,
      })
    }
  }

  // ============================================================================
  // MESSAGES — Standalone item (no section header, floats between RESOURCES and footer)
  // Former COMMUNICATIONS section had only one item — section header removed per IA fix
  // ============================================================================
  if (isOwnerOrManager && managerHasPermission(perms, "carrierDrivers")) {
    navGroups.push({
      label: "", // Empty label = no section header, just a divider
      items: [
        {
          label: "Messages",
          href: "/carrier/messages",
          icon: MessageSquare,
          badge: <MessagesBadge />,
        },
      ],
    })
  }

  // Don't render until hydrated to avoid SSR mismatch
  if (!isHydrated) {
    return (
      <aside
        className="h-screen sidebar-solid hidden lg:block fixed left-0 top-0 z-40 overflow-hidden"
        style={{ width: `${SIDEBAR_WIDTH_EXPANDED}px` }}
      />
    )
  }

  // Shared sidebar content renderer for MAIN navigation
  const renderMainNavContent = (expanded: boolean, onNav?: () => void) => (
    <>
      {/* Header with logo */}
      <div className="border-b border-[hsl(var(--sidebar-border-color))] px-2 py-3 shrink-0">
        <Link
          href="/carrier/dashboard"
          className={cn(
            "flex items-center rounded-lg px-2 py-3 hover:bg-[hsl(var(--sidebar-bg-hover))] transition-colors",
            !expanded && "justify-center px-0"
          )}
          style={{ gap: expanded ? "10px" : "0" }}
        >
          {/* Icon stays constant 28px in both states — wordmark scales beside it */}
          <AppLogo size={28} variant="light" />
          <AnimatePresence mode="wait">
            {expanded && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.15 }}
                className="flex items-center"
              >
                <DriveCommandWordmark size="md" className="text-[hsl(var(--sidebar-fg))]" />
              </motion.div>
            )}
          </AnimatePresence>
        </Link>
      </div>

      {/* Main navigation - scrollable area */}
      <ScrollArea className="flex-1 px-2 sidebar-scroll">
        {navGroups.map((group) => (
          <SidebarGroup
            key={group.label}
            group={group}
            isExpanded={expanded}
            activePath={pathname}
            onNavigate={() => {
              // Close peek on navigation
              if (isPeeking) setIsPeeking(false)
              onNav?.()
            }}
          />
        ))}
      </ScrollArea>

      {/* Footer - pinned to bottom (Settings, Help, Collapse toggle) */}
      <div className="shrink-0">
        <SidebarFooter
          isExpanded={expanded}
          actualSidebarExpanded={isExpanded}
          onToggle={toggle}
        />
      </div>
    </>
  )

  // Sidebar content renderer for SETTINGS navigation (drill-down view)
  const renderSettingsNavContent = (expanded: boolean, onNav?: () => void) => (
    <SidebarSettingsNav
      isExpanded={expanded}
      actualSidebarExpanded={isExpanded}
      onToggle={toggle}
      onNavigate={() => {
        if (isPeeking) setIsPeeking(false)
        onNav?.()
      }}
      prefersReducedMotion={prefersReducedMotion}
    />
  )

  // Choose which content to render based on current view
  const renderSidebarContent = (expanded: boolean, onNav?: () => void) =>
    isSettingsView
      ? renderSettingsNavContent(expanded, onNav)
      : renderMainNavContent(expanded, onNav)

  return (
    <TooltipProvider delayDuration={0}>
      {/*
        MAIN SIDEBAR - Flush to viewport edges (no floating, no rounded corners)
        When expanded: full width (240px)
        When collapsed: rail width (56px)
      */}
      <motion.aside
        ref={sidebarRef}
        className={cn(
          "fixed left-0 top-0 h-screen sidebar-solid hidden lg:flex flex-col z-40 overflow-hidden"
        )}
        variants={sidebarVariants}
        animate={isExpanded ? "expanded" : "collapsed"}
        transition={motionConfig}
        data-state={isExpanded ? "expanded" : "collapsed"}
        onMouseEnter={!isExpanded ? handleRailMouseEnter : undefined}
        onMouseLeave={!isExpanded ? handleRailMouseLeave : undefined}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {renderSidebarContent(isExpanded)}
      </motion.aside>

      {/*
        PEEK OVERLAY - Separate element that appears ON TOP of everything
        Only renders when collapsed AND peeking
        Does NOT affect the main sidebar or main content positioning
      */}
      <AnimatePresence>
        {!isExpanded && isPeeking && (
          <motion.div
            className="fixed left-0 top-0 h-screen sidebar-peek-overlay hidden lg:flex flex-col z-50 overflow-hidden"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{
              duration: prefersReducedMotion ? 0 : 0.2,
              ease: [0.32, 0.72, 0, 1],
            }}
            style={{ width: SIDEBAR_WIDTH_EXPANDED }}
            onMouseEnter={handlePeekMouseEnter}
            onMouseLeave={handlePeekMouseLeave}
            data-peek="true"
          >
            {renderSidebarContent(true, () => setIsPeeking(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </TooltipProvider>
  )
}
