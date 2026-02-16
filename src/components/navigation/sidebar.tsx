"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useUser } from "@clerk/nextjs"
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
  const { user } = useUser()

  // Check if user has OWNER or MANAGER role for Fleet Intelligence visibility
  const userRole = user?.publicMetadata?.role as UserRole | undefined
  const canViewFleetIntelligence =
    userRole === UserRole.OWNER || userRole === UserRole.MANAGER

  return (
    <Sidebar collapsible="icon">
      {/* Header with company branding */}
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard">
                <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                  <Truck className="size-4" />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">DriveCommand</span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      {/* Main navigation content */}
      <SidebarContent>
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
                >
                  <Link href="/trucks/new" className="!bg-blue-600 !text-white hover:!bg-blue-700">
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
            <SidebarGroupLabel>Fleet Intelligence</SidebarGroupLabel>
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
                    tooltip="Fuel"
                  >
                    <Link href="/fuel">
                      <Fuel />
                      <span>Fuel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Fleet Management */}
        <SidebarGroup>
          <SidebarGroupLabel>Fleet Management</SidebarGroupLabel>
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

        {/* Maintenance - standalone */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
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
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <UserMenu />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
