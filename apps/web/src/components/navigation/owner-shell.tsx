"use client"

import { AnimatedSidebar } from "@/components/Sidebar"
import { OwnerBottomNav } from "@/components/navigation/owner-bottom-nav"
import { UserMenu } from "@/components/navigation/user-menu"
import { NotificationBell } from "@/components/navigation/notification-bell"
import { TopBarHelpButton } from "@/components/navigation/topbar-help-button"
import { AppLogo } from "@/components/navigation/app-logo"
import { CommandPalette, SearchTrigger, CommandPaletteProvider } from "@/components/search"
import { QuickActionsMenu } from "@/components/quick-actions"
import { OnboardingReminderRibbon } from "@/components/onboarding/OnboardingReminderRibbon"

interface OwnerShellProps {
  children: React.ReactNode;
  tenantName?: string | null;
  onboardingComplete?: boolean;
}

/**
 * OwnerShell - Main layout for owner/manager portal
 *
 * CRITICAL LAYOUT DECISIONS:
 * - Desktop: Sidebar flush to viewport edges (left/top/bottom)
 * - Sidebar: position: fixed, no rounded corners, no margins
 * - TopBar: Flush to viewport top, light background (bg-card)
 * - Main content: White panel with ONLY rounded-tl-2xl (top-left corner meets sidebar)
 * - Scrolling happens INSIDE the content panel, not the outer window
 *
 * Features:
 * - Global command palette (Cmd+K)
 * - Quick actions menu (Create button)
 * - Keyboard shortcuts for quick create (C then L = Create Load, etc.)
 *
 * Mobile layout uses standard stacked layout with bottom nav.
 */
export function OwnerShell({ children, tenantName, onboardingComplete = false }: OwnerShellProps) {
  return (
    <CommandPaletteProvider>
      {/* Command Palette - renders as dialog overlay */}
      <CommandPalette />

      {/* Desktop: Dark frame with floating white content card */}
      <div className="hidden lg:flex h-screen shell-bg">
        {/* Sidebar container - reserves space in flex layout */}
        <div
          className="shrink-0 sidebar-margin-transition"
          style={{ width: "var(--sidebar-width, 240px)" }}
        >
          <AnimatedSidebar />
        </div>

        {/* Right column: topbar + content panel */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* TopBar - dark background matching sidebar (inherits from shell) */}
          <header className="flex h-14 shrink-0 items-center gap-4 px-6 topbar-dark-context">
            {/* Tenant name - light text on dark background */}
            <span
              className="text-[15px] font-medium text-white truncate overflow-hidden text-ellipsis shrink-0"
              style={{ maxWidth: "200px" }}
            >
              {tenantName || "Workspace"}
            </span>

            {/* Global Search Trigger - center area */}
            <div className="flex-1 flex justify-center">
              <SearchTrigger />
            </div>

            {/* Right side actions */}
            <div className="flex items-center gap-3 shrink-0">
              <QuickActionsMenu />
              <TopBarHelpButton />
              <NotificationBell />
              <UserMenu compactOnMobile />
            </div>
          </header>

          {/* Scrollable content area - white card with all corners rounded, inset from dark frame */}
          <main className="flex-1 overflow-y-auto bg-white rounded-2xl m-3">
            <OnboardingReminderRibbon onboardingComplete={onboardingComplete} />
            <div className="p-6">
              {children}
            </div>
          </main>
        </div>
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
        {/* Mobile content panel with subtle inset */}
        <main className="flex-1 m-2 mb-[72px] bg-card rounded-lg overflow-auto">
          <OnboardingReminderRibbon onboardingComplete={onboardingComplete} />
          <div className="p-4">
            {children}
          </div>
        </main>
        <OwnerBottomNav />
      </div>
    </CommandPaletteProvider>
  )
}
