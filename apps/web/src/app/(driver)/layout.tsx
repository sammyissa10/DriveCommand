import { redirect } from "next/navigation";
import { getSession, getRole } from "@/lib/auth/supabase";
import { UserRole } from "@/lib/auth/roles";
import { UserMenu } from "@/components/navigation/user-menu";
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo";
import { DriverNav } from "@/components/driver/driver-nav";
import { DriverBottomNav } from "@/components/driver/driver-bottom-nav";
import { DriverNotificationBell } from "@/components/driver/driver-notification-bell";
import { DriverGpsPing } from "@/components/driver/driver-gps-ping";

// Prevent static pre-rendering at build time — driver pages require auth context
export const dynamic = 'force-dynamic';

/**
 * Driver portal layout
 *
 * Accessible by DRIVER role only.
 * Unauthorized users are redirected to /unauthorized.
 *
 * GPS pinging is handled by the DriverGpsPing component at the layout level,
 * so GPS pings fire on ALL driver portal pages (not just the dashboard).
 */
export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session) {
    redirect("/sign-in");
  }

  const role = await getRole();
  if (role !== UserRole.DRIVER) {
    redirect("/unauthorized");
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Dark branded header */}
      <header className="bg-slate-900 text-white border-b border-slate-800">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <AppLogo size={32} variant="light" />
            <DriveCommandWordmark size="md" className="text-white" />
          </div>
          <div className="flex items-center gap-2">
            {/* Notification bell — accessible from any driver page */}
            <DriverNotificationBell />
            <UserMenu compactOnMobile />
          </div>
        </div>
        {/* Desktop nav */}
        <div className="hidden lg:block">
          <DriverNav />
        </div>
      </header>

      {/* Silent GPS ping — fires on ALL driver pages, no visual output */}
      <DriverGpsPing variant="silent" />

      <main className="p-4 pb-24 sm:p-6 lg:pb-6">{children}</main>

      <DriverBottomNav />
    </div>
  );
}
