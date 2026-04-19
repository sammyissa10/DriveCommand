"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
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
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
  useSidebar,
} from "@/components/ui/sidebar"
import { UserRole } from "@/lib/auth/roles"
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo"
import { PermissionGuard } from "@/lib/auth/guards"
import { DispatchBadge } from "@/components/navigation/dispatch-badge"
import type { UserPermissions } from "@/lib/auth/permissions"

interface AppSidebarProps {
  supportBadge?: React.ReactNode;
}

/**
 * Check if a manager has access to a specific permission key.
 * Default-all-true: returns true unless explicitly set to false.
 */
function managerHasPermission(permissions: UserPermissions | undefined, key: keyof UserPermissions): boolean {
  if (!permissions) return true;
  return permissions[key] !== false;
}

export function AppSidebar({ supportBadge }: AppSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { setOpenMobile } = useSidebar()

  const handleNavClick = () => {
    setOpenMobile(false)
  }

  const userRole = user?.role as UserRole | undefined
  const isOwnerOrManager = userRole === UserRole.OWNER || userRole === UserRole.MANAGER
  const isOwner = userRole === UserRole.OWNER
  const isManager = userRole === UserRole.MANAGER
  const perms = user?.permissions as UserPermissions | undefined

  // For managers: check if they have ANY permission in a group (to show parent item)
  const hasAnyFleetPerm = !isManager || (
    managerHasPermission(perms, 'carrierDrivers') ||
    managerHasPermission(perms, 'carrierTrucks') ||
    managerHasPermission(perms, 'facilities')
  )

  const hasAnyReportsPerm = !isManager || (
    managerHasPermission(perms, 'revenueReport') ||
    managerHasPermission(perms, 'driverPayReport') ||
    managerHasPermission(perms, 'arAgingReport') ||
    managerHasPermission(perms, 'performanceReport')
  )

  return (
    <Sidebar collapsible="icon" className="[&_[data-sidebar=menu-button]]:transition-all [&_[data-sidebar=menu-button]]:duration-150 [&_[data-sidebar=menu-button]]:focus-visible:ring-2 [&_[data-sidebar=menu-button]]:focus-visible:ring-sidebar-ring [&_[data-sidebar=menu-button]]:focus-visible:ring-offset-1 [&_[data-sidebar=menu-button]]:focus-visible:outline-none">
      {/* Header with company branding */}
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          href="/carrier/dashboard"
          onClick={handleNavClick}
          className="flex items-center gap-3 rounded-lg px-2 py-3 hover:bg-sidebar-accent transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0 group-data-[collapsible=icon]:py-3"
        >
          <AppLogo size={32} variant="dark" />
          <div className="grid text-left text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <DriveCommandWordmark size="sm" />
            <span className="truncate text-xs text-sidebar-foreground/60">Fleet Management</span>
          </div>
        </Link>
      </SidebarHeader>

      {/* Main navigation content */}
      <SidebarContent className="pt-2">
        {/* Fleet Intelligence - OWNER/MANAGER only, gated by liveMap permission */}
        {isOwnerOrManager && (
          <PermissionGuard permission="liveMap">
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
                Intelligence
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/live-map")}
                      tooltip="Live Map"
                    >
                      <Link href="/live-map" onClick={handleNavClick}>
                        <MapPin />
                        <span>Live Map</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </PermissionGuard>
        )}

        {/* Carrier Ops - OWNER/MANAGER only */}
        {isOwnerOrManager && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
              Carrier Ops
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Dashboard */}
                <PermissionGuard permission="carrierDashboard">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/carrier/dashboard")}
                      tooltip="Carrier Dashboard"
                    >
                      <Link href="/carrier/dashboard" onClick={handleNavClick}>
                        <LayoutDashboard />
                        <span>Carrier Dashboard</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                {/* Clients */}
                <PermissionGuard permission="clients">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/carrier/clients")}
                      tooltip="Clients"
                    >
                      <Link href="/carrier/clients" onClick={handleNavClick}>
                        <Users2 />
                        <span>Clients</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                {/* Contracts */}
                <PermissionGuard permission="contracts">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/carrier/contracts")}
                      tooltip="Contracts"
                    >
                      <Link href="/carrier/contracts" onClick={handleNavClick}>
                        <FileText />
                        <span>Contracts</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                {/* Templates */}
                <PermissionGuard permission="templates">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/carrier/templates")}
                      tooltip="Templates"
                    >
                      <Link href="/carrier/templates" onClick={handleNavClick}>
                        <CalendarDays />
                        <span>Templates</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                {/* Dispatches */}
                <PermissionGuard permission="dispatches">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/carrier/dispatches")}
                      tooltip="Dispatches"
                    >
                      <Link href="/carrier/dispatches" onClick={handleNavClick}>
                        <Truck />
                        <span>Dispatches</span>
                        <DispatchBadge />
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                {/* Loads */}
                <PermissionGuard permission="carrierLoads">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/carrier/loads")}
                      tooltip="Carrier Loads"
                    >
                      <Link href="/carrier/loads" onClick={handleNavClick}>
                        <Package />
                        <span>Carrier Loads</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                {/* Fleet sub-group — only show if user has any fleet permission */}
                {hasAnyFleetPerm && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname.startsWith("/carrier/fleet") || pathname.startsWith("/carrier/facilities")}
                      tooltip="Fleet"
                    >
                      <Boxes />
                      <span>Fleet</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <PermissionGuard permission="carrierDrivers">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname.startsWith("/carrier/fleet/drivers")}
                          >
                            <Link href="/carrier/fleet/drivers" onClick={handleNavClick}>
                              Carrier Drivers
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </PermissionGuard>
                      <PermissionGuard permission="carrierTrucks">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname.startsWith("/carrier/fleet/trucks")}
                          >
                            <Link href="/carrier/fleet/trucks" onClick={handleNavClick}>
                              Carrier Trucks
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </PermissionGuard>
                      <PermissionGuard permission="facilities">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname.startsWith("/carrier/facilities")}
                          >
                            <Link href="/carrier/facilities" onClick={handleNavClick}>
                              Facilities
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </PermissionGuard>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                )}
                {/* Reports sub-group — only show if user has any report permission */}
                {hasAnyReportsPerm && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={pathname.startsWith("/carrier/reports")}
                      tooltip="Reports"
                    >
                      <BarChart3 />
                      <span>Reports</span>
                    </SidebarMenuButton>
                    <SidebarMenuSub>
                      <PermissionGuard permission="revenueReport">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === "/carrier/reports/revenue"}
                          >
                            <Link href="/carrier/reports/revenue" onClick={handleNavClick}>
                              Revenue
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </PermissionGuard>
                      <PermissionGuard permission="driverPayReport">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === "/carrier/reports/driver-pay"}
                          >
                            <Link href="/carrier/reports/driver-pay" onClick={handleNavClick}>
                              Driver Pay
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </PermissionGuard>
                      <PermissionGuard permission="arAgingReport">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === "/carrier/reports/aging"}
                          >
                            <Link href="/carrier/reports/aging" onClick={handleNavClick}>
                              AR Aging
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </PermissionGuard>
                      <PermissionGuard permission="performanceReport">
                        <SidebarMenuSubItem>
                          <SidebarMenuSubButton
                            asChild
                            isActive={pathname === "/carrier/reports/performance"}
                          >
                            <Link href="/carrier/reports/performance" onClick={handleNavClick}>
                              Performance
                            </Link>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      </PermissionGuard>
                    </SidebarMenuSub>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Business — AI Documents gated by aiDocuments permission */}
        {isOwnerOrManager && (
          <PermissionGuard permission="aiDocuments">
            <SidebarGroup>
              <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
                Business
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/ai-documents")}
                      tooltip="AI Documents"
                    >
                      <Link href="/ai-documents" onClick={handleNavClick}>
                        <FileSearch />
                        <span>AI Documents</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </PermissionGuard>
        )}

        {/* Settings - OWNER and MANAGER (settings pages always accessible to managers) */}
        {isOwnerOrManager && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
              Settings
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Team Permissions - OWNER only */}
                {isOwner && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/settings/team-permissions')}
                      tooltip="Team Permissions"
                    >
                      <Link href="/settings/team-permissions" onClick={handleNavClick}>
                        <Shield />
                        <span>Team Permissions</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* Subscription - OWNER only */}
                {isOwner && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith('/subscription')}
                      tooltip="Subscription"
                    >
                      <Link href="/subscription" onClick={handleNavClick}>
                        <CreditCard />
                        <span>Subscription</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {/* Expense Categories — always accessible to OWNER/MANAGER */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith('/settings/expense-categories')}
                    tooltip="Expense Categories"
                  >
                    <Link href="/settings/expense-categories" onClick={handleNavClick}>
                      <Tag />
                      <span>Expense Categories</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* Expense Templates — always accessible to OWNER/MANAGER */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith('/settings/expense-templates')}
                    tooltip="Expense Templates"
                  >
                    <Link href="/settings/expense-templates" onClick={handleNavClick}>
                      <FileSpreadsheet />
                      <span>Expense Templates</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* Integrations — always accessible to OWNER/MANAGER */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith('/settings/integrations')}
                    tooltip="Integrations"
                  >
                    <Link href="/settings/integrations" onClick={handleNavClick}>
                      <Settings />
                      <span>Integrations</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {/* Support — all roles */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
            Support
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith('/support')}
                  tooltip="My Tickets"
                >
                  <Link href="/support" onClick={handleNavClick}>
                    <LifeBuoy />
                    <span>My Tickets</span>
                    {isOwner && supportBadge}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
