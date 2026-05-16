"use client"

import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/lib/auth/auth-context"
import { UserRole } from "@/lib/auth/roles"
import { PermissionGuard } from "@/lib/auth/guards"
import type { UserPermissions } from "@/lib/auth/permissions"
import Link from "next/link"
import { useSidebarState } from "./useSidebarState"
import { useMotionConfig, sidebarVariants } from "./motion"
import { SidebarGroup } from "./SidebarGroup"
import { SidebarFooter } from "./SidebarFooter"
import { SidebarSearch } from "./SidebarSearch"
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo"
import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import type { NavGroup } from "./sidebar.config"
import {
  LayoutDashboard,
  MapPin,
  Shield,
  Truck,
  Tag,
  Package,
  FileSearch,
  FileSpreadsheet,
  Settings,
  LifeBuoy,
  CreditCard,
  Users2,
  FileText,
  CalendarDays,
  Boxes,
  BarChart3,
  MessageSquare,
  ListChecks,
  HelpCircle,
  Bell,
} from "lucide-react"
import { DispatchBadge } from "@/components/navigation/dispatch-badge"
import { MessagesBadge } from "@/components/navigation/messages-badge"
import { PendingPayBadge } from "@/components/navigation/pending-pay-badge"
import { useEffect } from "react"

interface AnimatedSidebarProps {
  supportBadge?: React.ReactNode
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
 * AnimatedSidebar - Main sidebar component with Framer Motion spring animations
 * - Spring physics width animation (stiffness 400, damping 35)
 * - Staggered label fade+slide (~20ms per item)
 * - Flyout submenus when collapsed
 * - Footer with support card and toggle
 * - Search input (icon-only when collapsed)
 * - localStorage + cookie persistence
 * - Full keyboard navigation (arrows, Enter, Esc, Ctrl+B)
 * - prefers-reduced-motion respected
 */
export function AnimatedSidebar({ supportBadge }: AnimatedSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { isExpanded, toggle, setExpanded, isHydrated } = useSidebarState()
  const motionConfig = useMotionConfig()

  const userRole = user?.role as UserRole | undefined
  const isOwnerOrManager =
    userRole === UserRole.OWNER || userRole === UserRole.MANAGER
  const isOwner = userRole === UserRole.OWNER
  const isManager = userRole === UserRole.MANAGER
  const perms = user?.permissions as UserPermissions | undefined

  // For managers: check if they have ANY permission in a group (to show parent item)
  const hasAnyFleetPerm =
    !isManager ||
    managerHasPermission(perms, "carrierDrivers") ||
    managerHasPermission(perms, "carrierTrucks") ||
    managerHasPermission(perms, "facilities")

  const hasAnyReportsPerm =
    !isManager ||
    managerHasPermission(perms, "revenueReport") ||
    managerHasPermission(perms, "driverPayReport") ||
    managerHasPermission(perms, "arAgingReport") ||
    managerHasPermission(perms, "performanceReport")

  // Keyboard navigation: Ctrl/Cmd+B to toggle sidebar
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "b" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        toggle()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [toggle])

  // Build navigation groups based on user role and permissions
  const navGroups: NavGroup[] = []

  // Intelligence group - OWNER/MANAGER only, gated by liveMap permission
  if (isOwnerOrManager && managerHasPermission(perms, "liveMap")) {
    navGroups.push({
      label: "Intelligence",
      items: [
        {
          label: "Live Map",
          href: "/live-map",
          icon: MapPin,
        },
      ],
    })
  }

  // Carrier Ops - OWNER/MANAGER only
  if (isOwnerOrManager) {
    const carrierOpsItems = []

    if (managerHasPermission(perms, "carrierDashboard")) {
      carrierOpsItems.push({
        label: "Carrier Dashboard",
        href: "/carrier/dashboard",
        icon: LayoutDashboard,
      })
    }

    if (managerHasPermission(perms, "clients")) {
      carrierOpsItems.push({
        label: "Clients",
        href: "/carrier/clients",
        icon: Users2,
      })
    }

    if (managerHasPermission(perms, "contracts")) {
      carrierOpsItems.push({
        label: "Contracts",
        href: "/carrier/contracts",
        icon: FileText,
      })
    }

    if (managerHasPermission(perms, "templates")) {
      carrierOpsItems.push({
        label: "Templates",
        href: "/carrier/templates",
        icon: CalendarDays,
      })
    }

    if (managerHasPermission(perms, "dispatches")) {
      carrierOpsItems.push({
        label: "Dispatches",
        href: "/carrier/dispatches",
        icon: Truck,
        badge: <DispatchBadge />,
      })
    }

    if (managerHasPermission(perms, "carrierLoads")) {
      carrierOpsItems.push({
        label: "Carrier Loads",
        href: "/carrier/loads",
        icon: Package,
      })
    }

    if (managerHasPermission(perms, "carrierDrivers")) {
      carrierOpsItems.push({
        label: "Messages",
        href: "/carrier/messages",
        icon: MessageSquare,
        badge: <MessagesBadge />,
      })
    }

    // Fleet sub-group
    if (hasAnyFleetPerm) {
      const fleetChildren = []

      if (managerHasPermission(perms, "carrierDrivers")) {
        fleetChildren.push({
          label: "Carrier Drivers",
          href: "/carrier/fleet/drivers",
          icon: Users2,
        })
      }

      if (managerHasPermission(perms, "carrierTrucks")) {
        fleetChildren.push({
          label: "Carrier Trucks",
          href: "/carrier/fleet/trucks",
          icon: Truck,
        })
      }

      if (managerHasPermission(perms, "facilities")) {
        fleetChildren.push({
          label: "Facilities",
          href: "/carrier/facilities",
          icon: MapPin,
        })
      }

      carrierOpsItems.push({
        label: "Fleet",
        href: "/carrier/fleet",
        icon: Boxes,
        children: fleetChildren,
      })
    }

    // Driver Pay sub-group - OWNER always; MANAGER with driverPayReport permission
    if (isOwner || (isManager && managerHasPermission(perms, "driverPayReport"))) {
      carrierOpsItems.push({
        label: "Driver Pay",
        href: "/carrier/driver-pay",
        icon: CreditCard,
        children: [
          {
            label: "Pending Pay",
            href: "/carrier/driver-pay/pending",
            icon: CreditCard,
            badge: <PendingPayBadge />,
          },
          {
            label: "Settlements",
            href: "/carrier/driver-pay/settlements",
            icon: CreditCard,
          },
          {
            label: "Reports",
            href: "/carrier/driver-pay/reports",
            icon: BarChart3,
          },
        ],
      })
    }

    // Reports sub-group
    if (hasAnyReportsPerm) {
      const reportsChildren = []

      if (managerHasPermission(perms, "revenueReport")) {
        reportsChildren.push({
          label: "Revenue",
          href: "/carrier/reports/revenue",
          icon: BarChart3,
        })
      }

      if (managerHasPermission(perms, "arAgingReport")) {
        reportsChildren.push({
          label: "AR Aging",
          href: "/carrier/reports/aging",
          icon: BarChart3,
        })
      }

      if (managerHasPermission(perms, "performanceReport")) {
        reportsChildren.push({
          label: "Performance",
          href: "/carrier/reports/performance",
          icon: BarChart3,
        })
      }

      carrierOpsItems.push({
        label: "Reports",
        href: "/carrier/reports",
        icon: BarChart3,
        children: reportsChildren,
      })
    }

    if (carrierOpsItems.length > 0) {
      navGroups.push({
        label: "Carrier Ops",
        items: carrierOpsItems,
      })
    }
  }

  // Workflows - OWNER/MANAGER only
  if (isOwnerOrManager) {
    navGroups.push({
      label: "Workflows",
      items: [
        {
          label: "Checklists & Workflows",
          href: "/checklists",
          icon: ListChecks,
        },
      ],
    })
  }

  // Business - AI Documents gated by aiDocuments permission
  if (isOwnerOrManager && managerHasPermission(perms, "aiDocuments")) {
    navGroups.push({
      label: "Business",
      items: [
        {
          label: "AI Documents",
          href: "/ai-documents",
          icon: FileSearch,
        },
      ],
    })
  }

  // Settings - OWNER and MANAGER
  if (isOwnerOrManager) {
    const settingsItems = []

    // Team Permissions - OWNER only
    if (isOwner) {
      settingsItems.push({
        label: "Team Permissions",
        href: "/settings/team-permissions",
        icon: Shield,
      })
    }

    // Subscription - OWNER only
    if (isOwner) {
      settingsItems.push({
        label: "Subscription",
        href: "/subscription",
        icon: CreditCard,
      })
    }

    // Always accessible to OWNER/MANAGER
    settingsItems.push({
      label: "Notifications",
      href: "/settings/notifications",
      icon: Bell,
    })

    settingsItems.push({
      label: "Expense Categories",
      href: "/settings/expense-categories",
      icon: Tag,
    })

    settingsItems.push({
      label: "Expense Templates",
      href: "/settings/expense-templates",
      icon: FileSpreadsheet,
    })

    settingsItems.push({
      label: "Integrations",
      href: "/settings/integrations",
      icon: Settings,
    })

    navGroups.push({
      label: "Settings",
      items: settingsItems,
    })
  }

  // Account - OWNER/MANAGER
  if (isOwnerOrManager) {
    navGroups.push({
      label: "Account",
      items: [
        {
          label: "My Notifications",
          href: "/settings/my-notifications",
          icon: Bell,
        },
      ],
    })
  }

  // Support - all roles
  navGroups.push({
    label: "Support",
    items: [
      {
        label: "My Tickets",
        href: "/support",
        icon: LifeBuoy,
        badge: isOwner ? supportBadge : undefined,
      },
      {
        label: "Help Center",
        href: "/help",
        icon: HelpCircle,
      },
    ],
  })

  // Don't render until hydrated to avoid SSR mismatch
  if (!isHydrated) {
    return (
      <aside
        className="fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar hidden lg:block"
        style={{ width: "256px" }}
      />
    )
  }

  return (
    <TooltipProvider delayDuration={0}>
      <motion.aside
        className={cn(
          "fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar hidden lg:flex flex-col"
        )}
        variants={sidebarVariants}
        animate={isExpanded ? "expanded" : "collapsed"}
        transition={motionConfig}
        data-state={isExpanded ? "expanded" : "collapsed"}
      >
        {/* Header with logo */}
        <div className="border-b border-sidebar-border px-2 py-3">
          <Link
            href="/carrier/dashboard"
            className={cn(
              "flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-sidebar-accent transition-colors",
              !isExpanded && "justify-center px-0"
            )}
          >
            <AppLogo size={32} variant="light" />
            <AnimatePresence mode="wait">
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.15 }}
                  className="grid text-left text-sm leading-tight"
                >
                  <DriveCommandWordmark size="sm" />
                  <span className="truncate text-xs text-sidebar-foreground/60">
                    Fleet Management
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </Link>
        </div>

        {/* Search */}
        <SidebarSearch
          isExpanded={isExpanded}
          onExpandClick={() => setExpanded(true)}
        />

        {/* Main navigation */}
        <ScrollArea className="flex-1 px-2">
          {navGroups.map((group) => (
            <SidebarGroup
              key={group.label}
              group={group}
              isExpanded={isExpanded}
              activePath={pathname}
              onNavigate={() => {}}
            />
          ))}
        </ScrollArea>

        {/* Footer */}
        <SidebarFooter
          isExpanded={isExpanded}
          onToggle={toggle}
          supportBadge={supportBadge}
        />
      </motion.aside>
    </TooltipProvider>
  )
}
