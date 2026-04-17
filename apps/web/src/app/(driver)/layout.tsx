import { redirect } from "next/navigation";
import { getSession, getRole } from "@/lib/auth/supabase";
import { UserRole } from "@/lib/auth/roles";
import { UserMenu } from "@/components/navigation/user-menu";
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo";
import { DriverNav } from "@/components/driver/driver-nav";
import { DriverBottomNav } from "@/components/driver/driver-bottom-nav";
import { DriverNotificationBell } from "@/components/driver/driver-notification-bell";

// Prevent static pre-rendering at build time — driver pages require auth context
export const dynamic = 'force-dynamic';

/**
 * Driver portal layout
 *
 * Accessible by DRIVER role only.
 * Unauthorized users are redirected to /unauthorized.
 *
 * GPS pinging is handled by the DriverGpsPing component on the dashboard,
 * not at the layout level. This keeps layout clean and avoids layout-level
 * truckId resolution (which was incompatible with CarrierTruck anyway).
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

      <main className="p-4 pb-24 sm:p-6 lg:pb-6">{children}</main>

      <DriverBottomNav />
    </div>
  );
}
