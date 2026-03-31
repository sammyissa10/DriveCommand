import { redirect } from "next/navigation";
import { getSession, getRole } from "@/lib/auth/supabase";
import { UserRole } from "@/lib/auth/roles";
import { UserMenu } from "@/components/navigation/user-menu";
import { AppLogo, DriveCommandWordmark } from "@/components/navigation/app-logo";
import { DriverNav } from "@/components/driver/driver-nav";
import { GpsTracker } from "@/components/driver/gps-tracker";
import { DriverBottomNav } from "@/components/driver/driver-bottom-nav";
import { prisma, TX_OPTIONS } from "@/lib/db/prisma";

// Prevent static pre-rendering at build time — driver pages require auth context
export const dynamic = 'force-dynamic';

/**
 * Driver portal layout
 *
 * Accessible by DRIVER role only.
 * Unauthorized users are redirected to /unauthorized.
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

  /**
   * @bypass_rls reason: pre-auth
   * WHY: The driver layout runs during session bootstrap — the tenant context is
   *      established from the session cookie, not from an RLS-scoped connection.
   *      The middleware injects x-tenant-id, but server layouts use prisma directly
   *      (not through the tenant-scoped repository layer).
   * SCOPE: Reads one Route row for this driver's active route within their tenant.
   *        Filtered by driverId = session.userId AND tenantId = session.tenantId.
   * SAFETY: Gated by getSession() + getRole() checks above. Both driverId and
   *         tenantId come from the verified session cookie, not user input.
   */
  // Look up driver's active route to get truckId for GPS tracking
  let truckId: string | null = null;
  try {
    const activeRoute = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.route.findFirst({
        where: {
          driverId: session.userId,
          tenantId: session.tenantId,
          status: { in: ["PLANNED", "IN_PROGRESS"] },
        },
        select: { truckId: true },
      });
    }, TX_OPTIONS);
    truckId = activeRoute?.truckId ?? null;
  } catch {
    // GPS tracking gracefully degrades if route lookup fails
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="flex items-center justify-between px-4 py-3 sm:px-6 sm:py-4">
          <div className="flex items-center gap-3">
            <AppLogo size={32} variant="dark" />
            <DriveCommandWordmark size="md" />
          </div>
          <UserMenu compactOnMobile />
        </div>
        <div className="hidden lg:block">
          <DriverNav />
        </div>
        <GpsTracker truckId={truckId} />
      </header>
      <main className="p-4 pb-20 sm:p-6 lg:pb-6">{children}</main>
      <DriverBottomNav />
    </div>
  );
}
