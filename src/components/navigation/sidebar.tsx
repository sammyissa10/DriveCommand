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
  Wrench,
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

export function AppSidebar() {
  const pathname = usePathname()
  const { user } = useAuth()

  // Check if user has OWNER or MANAGER role for Fleet Intelligence visibility
  const userRole = user?.role as UserRole | undefined
  const canViewFleetIntelligence =
    userRole === UserRole.OWNER || userRole === UserRole.MANAGER

  return (
    <Sidebar collapsible="icon">
      {/* Header with company branding */}
      <SidebarHeader className="border-b border-sidebar-border pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-md">
                  <Truck className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-bold tracking-tight">DriveCommand</span>
                  <span className="truncate text-xs text-sidebar-foreground/60">Fleet Management</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
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
                  isActive={pathname.startsWith("/trucks") && !pathname.includes("/maintenance")}
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
              <SidebarMenuItem>
                <SidebarMenuButton
                  asChild
                  isActive={
                    pathname.startsWith("/trucks") &&
                    pathname.includes("/maintenance")
                  }
                  tooltip="Maintenance"
                >
                  <Link href="/trucks">
                    <Wrench />
                    <span>Maintenance</span>
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
            <UserMenu />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
