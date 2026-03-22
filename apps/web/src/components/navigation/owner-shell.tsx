"use client"

import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/navigation/sidebar"
import { Separator } from "@/components/ui/separator"
import { OwnerBottomNav } from "@/components/navigation/owner-bottom-nav"

interface OwnerShellProps {
  children: React.ReactNode;
  supportBadge?: React.ReactNode;
  tenantName?: string | null;
}

export function OwnerShell({ children, supportBadge, tenantName }: OwnerShellProps) {
  return (
    <SidebarProvider defaultOpen={true}>
      <AppSidebar supportBadge={supportBadge} />
      <SidebarInset>
        <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-6">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {tenantName && (
            <span className="text-sm font-semibold text-foreground truncate">{tenantName}</span>
          )}
        </header>
        <main className="flex-1 p-6 pb-20 lg:pb-6">
          {children}
        </main>
      </SidebarInset>
      <OwnerBottomNav />
    </SidebarProvider>
  )
}
