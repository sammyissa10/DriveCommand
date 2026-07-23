"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatedSidebar } from "@/components/Sidebar"
import { OwnerBottomNav } from "@/components/navigation/owner-bottom-nav"
import { UserMenu } from "@/components/navigation/user-menu"
import { NotificationBell } from "@/components/navigation/notification-bell"
import { TopBarHelpButton } from "@/components/navigation/topbar-help-button"
import { AppLogo } from "@/components/navigation/app-logo"
import { CommandPalette, SearchTrigger, CommandPaletteProvider } from "@/components/search"
import { QuickActionsMenu } from "@/components/quick-actions"
import { OnboardingReminderRibbon } from "@/components/onboarding/OnboardingReminderRibbon"
import { CongratsDialog } from "@/components/onboarding/CongratsDialog"
import { OnboardingTourProvider } from "@/components/onboarding/tour/OnboardingTour"
import { markCongratsShown } from "@/app/(owner)/actions/activation-congrats"
import { useIsDesktop } from "@/hooks/useIsDesktop"
import { toast } from "sonner"

interface OwnerShellProps {
  children: React.ReactNode;
  tenantName?: string | null;
  onboardingComplete?: boolean;
  congratsShownAt?: string | null;
  tourSeen?: boolean;
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
export function OwnerShell({ children, tenantName, onboardingComplete = false, congratsShownAt = null, tourSeen = true }: OwnerShellProps) {
  const [congratsOpen, setCongratsOpen] = useState(false);
  const firedRef = useRef(false);

  // Both chrome frames below are always mounted and CSS-toggled (hidden lg:flex /
  // lg:hidden). Rendering {children} into BOTH duplicated every page's content —
  // two <form> trees, doubled dropdowns, submit clicks binding to the wrong copy.
  // Gate children into exactly ONE frame so page content mounts once.
  //
  // `useIsDesktop` returns undefined until mounted (SSR-safe). The desktop frame
  // uses `!== false` (so it holds children during SSR + hydration, matching the
  // server HTML — no mismatch, and desktop keeps its server-rendered content); the
  // mobile frame uses `=== false`. The two conditions are mutually exclusive at
  // every instant, so children are never in both frames at once. The 1024px
  // breakpoint matches the `lg` visibility classes, so once resolved the populated
  // frame is the visible one. On mobile the content briefly lives in the hidden
  // desktop frame pre-mount, then moves to the mobile frame — never visible twice.
  const isDesktop = useIsDesktop();

  useEffect(() => {
    if (onboardingComplete && congratsShownAt == null && !firedRef.current) {
      firedRef.current = true;
      setCongratsOpen(true);
      toast.success("Your fleet is all set!");
      void markCongratsShown();
    }
  }, [onboardingComplete, congratsShownAt]);

  return (
    <CommandPaletteProvider>
      <OnboardingTourProvider tourSeen={tourSeen}>
      {/* Command Palette - renders as dialog overlay */}
      <CommandPalette />

      {/* One-time activation-complete congrats moment */}
      <CongratsDialog open={congratsOpen} onOpenChange={setCongratsOpen} />

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
              {isDesktop !== false ? children : null}
            </div>
          </main>
        </div>
      </div>

      {/* Mobile: Standard stacked layout with bottom nav - uses theme-appropriate colors */}
      <div className="lg:hidden min-h-screen flex flex-col bg-background">
        <header
          className="dark sticky top-0 z-[1001] flex h-14 shrink-0 items-center gap-2 px-4 bg-ds-bg"
        >
          {/* The workspace/company name is the mobile title. The product logo is
              dropped here (kept on the desktop sidebar) so a real tenant name gets
              the full width instead of clipping behind the brand mark — the
              standard in-app pattern. Falls back to the logo only if the name
              hasn't loaded. */}
          {tenantName ? (
            <span className="min-w-0 flex-1 truncate text-[17px] font-semibold text-ds-txt">
              {tenantName}
            </span>
          ) : (
            <AppLogo size={28} variant="light" />
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span data-tour="create" className="flex items-center">
              <QuickActionsMenu variant="mobile" />
            </span>
            <span data-tour="help" className="flex items-center">
              <TopBarHelpButton />
            </span>
            <NotificationBell variant="mobile" />
            <UserMenu compactOnMobile />
          </div>
        </header>
        {/* Mobile content panel with subtle inset */}
        <main className="flex-1 m-2 mb-[72px] bg-card rounded-lg overflow-auto">
          <div data-tour="checklist">
            <OnboardingReminderRibbon onboardingComplete={onboardingComplete} />
          </div>
          <div className="p-4">
            {isDesktop === false ? children : null}
          </div>
        </main>
        <OwnerBottomNav />
      </div>
      </OnboardingTourProvider>
    </CommandPaletteProvider>
  )
}
