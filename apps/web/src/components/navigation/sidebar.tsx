"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/auth/auth-context"
import {
  LayoutDashboard,
  MapPin,
  Shield,
  Fuel,
  Truck,
  Users,
  Route as RouteIcon,
  Tag,
  Plus,
  Building2,
  Receipt,
  DollarSign,
  Package,
  TrendingUp,
  ClipboardCheck,
  FileSearch,
  Calculator,
  FileSpreadsheet,
  Settings,
  LifeBuoy,
  CreditCard,
  Warehouse,
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

interface AppSidebarProps {
  supportBadge?: React.ReactNode;
}

export function AppSidebar({ supportBadge }: AppSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()
  const { setOpenMobile } = useSidebar()

  const handleNavClick = () => {
    setOpenMobile(false)
  }

  // Check if user has OWNER or MANAGER role for Fleet Intelligence visibility
  const userRole = user?.role as UserRole | undefined
  const canViewFleetIntelligence =
    userRole === UserRole.OWNER || userRole === UserRole.MANAGER

  return (
    <Sidebar collapsible="icon" className="[&_[data-sidebar=menu-button]]:transition-all [&_[data-sidebar=menu-button]]:duration-150 [&_[data-sidebar=menu-button]]:focus-visible:ring-2 [&_[data-sidebar=menu-button]]:focus-visible:ring-sidebar-ring [&_[data-sidebar=menu-button]]:focus-visible:ring-offset-1 [&_[data-sidebar=menu-button]]:focus-visible:outline-none">
      {/* Header with company branding */}
      <SidebarHeader className="border-b border-sidebar-border">
        <Link
          href="/dashboard"
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
        {/* Dashboard - standalone at top */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname === "/dashboard"}
                  tooltip="Dashboard"
                >
                  <Link href="/dashboard" onClick={handleNavClick}>
                    <LayoutDashboard />
                    <span>Dashboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Quick Create */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  tooltip="Add Truck"
                  className="bg-sidebar-primary/10 text-sidebar-primary hover:bg-sidebar-primary/20 hover:text-sidebar-primary font-medium"
                >
                  <Link href="/trucks/new" onClick={handleNavClick}>
                    <Plus />
                    <span>Add Truck</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Fleet Intelligence - OWNER/MANAGER only */}
        {canViewFleetIntelligence && (
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
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/safety")}
                    tooltip="Safety"
                  >
                    <Link href="/safety" onClick={handleNavClick}>
                      <Shield />
                      <span>Safety</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/fuel")}
                    tooltip="Fuel & Energy"
                  >
                    <Link href="/fuel" onClick={handleNavClick}>
                      <Fuel />
                      <span>Fuel & Energy</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <PermissionGuard permission="canViewLaneAnalytics">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/lane-analytics")}
                      tooltip="Lane Profitability"
                    >
                      <Link href="/lane-analytics" onClick={handleNavClick}>
                        <TrendingUp />
                        <span>Lane Profitability</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                <PermissionGuard permission="canViewProfitPredictor">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/profit-predictor")}
                      tooltip="Profit Predictor"
                    >
                      <Link href="/profit-predictor" onClick={handleNavClick}>
                        <Calculator />
                        <span>Profit Predictor</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/compliance")}
                    tooltip="Compliance"
                  >
                    <Link href="/compliance" onClick={handleNavClick}>
                      <ClipboardCheck />
                      <span>Compliance</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <PermissionGuard permission="canViewIFTA">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/ifta")}
                      tooltip="IFTA Reports"
                    >
                      <Link href="/ifta" onClick={handleNavClick}>
                        <FileSpreadsheet />
                        <span>IFTA Reports</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Business */}
        {canViewFleetIntelligence && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
              Business
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/loads")}
                    tooltip="Loads"
                  >
                    <Link href="/loads" onClick={handleNavClick}>
                      <Package />
                      <span>Loads</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <PermissionGuard permission="canViewCRM">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/crm")}
                      tooltip="CRM"
                    >
                      <Link href="/crm" onClick={handleNavClick}>
                        <Building2 />
                        <span>CRM</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                <PermissionGuard permission="canViewInvoices">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/invoices")}
                      tooltip="Invoices"
                    >
                      <Link href="/invoices" onClick={handleNavClick}>
                        <Receipt />
                        <span>Invoices</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                <PermissionGuard permission="canViewPayroll">
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname.startsWith("/payroll")}
                      tooltip="Payroll"
                    >
                      <Link href="/payroll" onClick={handleNavClick}>
                        <DollarSign />
                        <span>Payroll</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                </PermissionGuard>
                <PermissionGuard permission="canViewAIDocuments">
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
                </PermissionGuard>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Fleet Management */}
        <SidebarGroup>
          <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
            Management
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/trucks")}
                  tooltip="Trucks"
                >
                  <Link href="/trucks" onClick={handleNavClick}>
                    <Truck />
                    <span>Trucks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/drivers")}
                  tooltip="Drivers"
                >
                  <Link href="/drivers" onClick={handleNavClick}>
                    <Users />
                    <span>Drivers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/routes")}
                  tooltip="Routes"
                >
                  <Link href="/routes" onClick={handleNavClick}>
                    <RouteIcon />
                    <span>Routes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={pathname.startsWith("/tags")}
                  tooltip="Tags"
                >
                  <Link href="/tags" onClick={handleNavClick}>
                    <Tag />
                    <span>Tags</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {/* Carrier Ops - OWNER/MANAGER only */}
        {canViewFleetIntelligence && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
              Carrier Ops
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Dashboard */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/carrier/dashboard")}
                    tooltip="Dashboard"
                  >
                    <Link href="/carrier/dashboard" onClick={handleNavClick}>
                      <LayoutDashboard />
                      <span>Dashboard</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* Clients */}
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
                {/* Contracts */}
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
                {/* Templates */}
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
                {/* Dispatches with live needs-assignment badge */}
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
                {/* Loads */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname.startsWith("/carrier/loads")}
                    tooltip="Loads (Carrier)"
                  >
                    <Link href="/carrier/loads" onClick={handleNavClick}>
                      <Package />
                      <span>Loads</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {/* Fleet sub-group */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/carrier/fleet") || pathname.startsWith("/carrier/facilities")}
                    tooltip="Fleet"
                  >
                    <Boxes />
                    <span>Fleet</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        isActive={pathname.startsWith("/carrier/fleet/drivers")}
                      >
                        <Link href="/carrier/fleet/drivers" onClick={handleNavClick}>
                          Drivers
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                    <SidebarMenuSubItem>
                      <SidebarMenuSubButton
                        asChild
                        isActive={pathname.startsWith("/carrier/fleet/trucks")}
                      >
                        <Link href="/carrier/fleet/trucks" onClick={handleNavClick}>
                          Trucks
                        </Link>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
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
                  </SidebarMenuSub>
                </SidebarMenuItem>
                {/* Reports sub-group */}
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={pathname.startsWith("/carrier/reports")}
                    tooltip="Reports"
                  >
                    <BarChart3 />
                    <span>Reports</span>
                  </SidebarMenuButton>
                  <SidebarMenuSub>
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
                  </SidebarMenuSub>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Settings - OWNER and MANAGER (individual items gated by permission) */}
        {(userRole === UserRole.OWNER || userRole === UserRole.MANAGER) && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-sidebar-foreground/40 uppercase text-[11px] font-semibold tracking-wider">
              Settings
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Team Permissions - OWNER only */}
                {userRole === UserRole.OWNER && (
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
                <PermissionGuard permission="canViewBilling">
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
                </PermissionGuard>
                <PermissionGuard permission="canManageSettings">
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
                </PermissionGuard>
                <PermissionGuard permission="canManageSettings">
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
                </PermissionGuard>
                <PermissionGuard permission="canManageSettings">
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
                </PermissionGuard>
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
                    {userRole === UserRole.OWNER && supportBadge}
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
