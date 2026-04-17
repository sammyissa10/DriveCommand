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
   * SCOPE: Reads CarrierDriver + CarrierDispatch rows for this driver within their tenant.
   *        Filtered by userId = session.userId AND orgId = session.tenantId.
   * SAFETY: Gated by getSession() + getRole() checks above. Both userId and
   *         tenantId come from the verified session cookie, not user input.
   *
   * TODO: GPS tracker expects a legacy Truck.id, but Carrier Ops dispatches use
   *       CarrierTruck.id (different table). Set truckId = null for now.
   *       When GPS is reconnected to Carrier Ops, map CarrierTruck.id here.
   */
  // Look up driver's active dispatch to get truckId for GPS tracking
  // NOTE: truckId is intentionally null — GPS uses legacy Truck table which
  //       is incompatible with CarrierTruck. GPS tracking degrades gracefully.
  const truckId: string | null = null;
  try {
    // We still do the lookup to confirm the driver has an active dispatch,
    // but we cannot pass CarrierTruck.id to the legacy GPS tracker.
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      const carrierDriver = await tx.carrierDriver.findFirst({
        where: { userId: session.userId, orgId: session.tenantId },
      });
      if (!carrierDriver) return null;
      return tx.carrierDispatch.findFirst({
        where: {
          primaryDriverId: carrierDriver.id,
          orgId: session.tenantId,
          status: { in: ['planned', 'in_progress'] },
        },
        select: { truckId: true },
      });
    }, TX_OPTIONS);
  } catch {
    // GPS tracking gracefully degrades if dispatch lookup fails
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
