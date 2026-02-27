import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { getRole } from "@/lib/auth/server";
import { UserRole } from "@/lib/auth/roles";
import { UserMenu } from "@/components/navigation/user-menu";
import { Truck } from "lucide-react";
import { DriverNav } from "@/components/driver/driver-nav";
import { GpsTracker } from "@/components/driver/gps-tracker";
import { prisma, TX_OPTIONS } from "@/lib/db/prisma";

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
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-blue-700 text-white">
              <Truck className="h-4 w-4" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">DriveCommand</h1>
          </div>
          <UserMenu />
        </div>
        <DriverNav />
        <GpsTracker truckId={truckId} />
      </header>
      <main className="p-4 sm:p-6">{children}</main>
    </div>
  );
}
