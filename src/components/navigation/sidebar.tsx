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
} from "lucide-react"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from "@/components/ui/sidebar"
import { UserMenu } from "@/components/navigation/user-menu"
import { UserRole } from "@/lib/auth/roles"
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo"
import { PermissionGuard } from "@/lib/auth/guards"

interface AppSidebarProps {
  supportBadge?: React.ReactNode;
}

export function AppSidebar({ supportBadge }: AppSidebarProps) {
  const pathname = usePathname()
  const { user } = useAuth()

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
                  <Link href="/dashboard">
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
                  <Link href="/trucks/new">
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
                    <Link href="/live-map">
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
                    <Link href="/safety">
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
                    <Link href="/fuel">
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
                      <Link href="/lane-analytics">
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
                      <Link href="/profit-predictor">
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
                    <Link href="/compliance">
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
                      <Link href="/ifta">
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
                    <Link href="/loads">
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
                      <Link href="/crm">
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
                      <Link href="/invoices">
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
                      <Link href="/payroll">
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
                      <Link href="/ai-documents">
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
                  <Link href="/trucks">
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
                  <Link href="/drivers">
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
                  <Link href="/routes">
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
                  <Link href="/tags">
                    <Tag />
                    <span>Tags</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
                      <Link href="/settings/team-permissions">
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
                      <Link href="/subscription">
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
                      <Link href="/settings/expense-categories">
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
                      <Link href="/settings/expense-templates">
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
                      <Link href="/settings/integrations">
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
                  <Link href="/support">
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

      {/* Footer with user menu */}
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <UserMenu dropdownDirection="up" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
