"use client"

import { AnimatedSidebar } from "@/components/Sidebar"
import { OwnerBottomNav } from "@/components/navigation/owner-bottom-nav"
import { UserMenu } from "@/components/navigation/user-menu"
import { NotificationBell } from "@/components/navigation/notification-bell"
import { TopBarHelpButton } from "@/components/navigation/topbar-help-button"
import { AppLogo } from "@/components/navigation/app-logo"
import { CommandPalette, SearchTrigger, CommandPaletteProvider } from "@/components/search"
import { QuickActionsMenu } from "@/components/quick-actions"

interface OwnerShellProps {
  children: React.ReactNode;
  tenantName?: string | null;
}

/**
 * OwnerShell - Main layout for owner/manager portal
 *
 * CRITICAL LAYOUT DECISIONS:
 * - Sidebar: position: fixed (always visible, never scrolls with page)
 * - TopBar: position: fixed (always visible at top, offset by sidebar width)
 * - Main content: margin-left = sidebar width, margin-top = topbar height
 * - This ensures scrolling the page never moves the sidebar or topbar
 *
 * Features:
 * - Global command palette (Cmd+K)
 * - Quick actions menu (Create button)
 * - Keyboard shortcuts for quick create (C then L = Create Load, etc.)
 *
 * Mobile layout uses standard stacked layout with bottom nav.
 */
export function OwnerShell({ children, tenantName }: OwnerShellProps) {
  return (
    <CommandPaletteProvider>
      {/* Command Palette - renders as dialog overlay */}
      <CommandPalette />

      {/* Desktop: Fixed sidebar + fixed topbar + scrollable main content */}
      <div className="hidden lg:block min-h-screen page-bg-fixed">
        {/* Sidebar - fixed to left edge, renders its own fixed element */}
        <AnimatedSidebar />

        {/* TopBar - fixed to top, offset by sidebar width, dark gradient to match sidebar */}
        <header
          className="fixed top-0 right-0 z-[45] flex h-14 shrink-0 items-center gap-4 px-6 topbar-solid sidebar-margin-transition"
          style={{
            left: "var(--sidebar-width, 240px)",
          }}
        >
          {/* Tenant name */}
          <span
            className="text-[15px] font-medium text-[hsl(var(--sidebar-fg))] truncate overflow-hidden text-ellipsis shrink-0"
            style={{ maxWidth: "200px" }}
          >
            {tenantName || "Workspace"}
          </span>

          {/* Global Search Trigger - center area */}
          <div className="flex-1 flex justify-center">
            <SearchTrigger />
          </div>

          {/* Right side actions */}
          <div className="flex items-center gap-3 topbar-dark-context shrink-0">
            <QuickActionsMenu />
            <TopBarHelpButton />
            <NotificationBell />
            <UserMenu compactOnMobile />
          </div>
        </header>

        {/* Main content - offset by sidebar width and topbar height */}
        <main
          className="min-h-screen pt-14 p-6 sidebar-margin-transition"
          style={{
            marginLeft: "var(--sidebar-width, 240px)",
          }}
        >
          {children}
        </main>
      </div>

      {/* Mobile: Standard stacked layout with bottom nav - uses theme-appropriate colors */}
      <div className="lg:hidden min-h-screen flex flex-col bg-background">
        <header
          className="sticky top-0 z-[1001] flex h-14 shrink-0 items-center gap-2 px-4 bg-card border-b border-border shadow-sm"
        >
          <AppLogo size={28} variant="dark" />
          {tenantName && (
            <span className="text-sm font-semibold text-foreground truncate">{tenantName}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <QuickActionsMenu />
            <TopBarHelpButton />
            <NotificationBell />
            <UserMenu compactOnMobile />
          </div>
        </header>
        <main className="flex-1 p-4 pb-20">
          {children}
        </main>
        <OwnerBottomNav />
      </div>
    </CommandPaletteProvider>
  )
}
