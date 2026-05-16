"use client"

import { AnimatedSidebar } from "@/components/Sidebar"
import { OwnerBottomNav } from "@/components/navigation/owner-bottom-nav"
import { UserMenu } from "@/components/navigation/user-menu"
import { NotificationBell } from "@/components/navigation/notification-bell"
import { AppLogo } from "@/components/navigation/app-logo"

interface OwnerShellProps {
  children: React.ReactNode;
  supportBadge?: React.ReactNode;
  tenantName?: string | null;
}

export function OwnerShell({ children, supportBadge, tenantName }: OwnerShellProps) {
  return (
    <>
      <AnimatedSidebar supportBadge={supportBadge} />
      <div className="lg:pl-[256px]">
        <header className="relative z-[1001] flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-4 lg:px-6">
          {/* DC logo — visible on all screen sizes */}
          <AppLogo size={28} variant="dark" />
          {tenantName && (
            <span className="text-sm font-semibold text-foreground truncate hidden lg:block">{tenantName}</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            {/* compactOnMobile hides name/email text on mobile — shows avatar only */}
            <UserMenu compactOnMobile />
          </div>
        </header>
        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </div>
      <OwnerBottomNav />
    </>
  )
}
