import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { NewRouteClient } from './new-route-client';
import { RouteCreateMobile } from './RouteCreateMobile';
import { logger } from '@/lib/logger';

export default async function NewRoutePage() {
  const orgId = await requireTenantId();
  const tenantPrisma = await getTenantPrisma();
  const [drivers, trucks] = await Promise.all([
    // Real carrier fleet drivers only — no User login accounts / sample data
    // (TKT-0074). userId is the portal login used as Route.driverId; drivers
    // without one are shown but disabled in the form until granted portal access.
    tenantPrisma.carrierDriver
      .findMany({
        where: { orgId, deletedAt: null, isSample: false, status: 'active' },
        select: { id: true, userId: true, firstName: true, lastName: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      })
      .catch((err) => {
        logger.error('Failed to load carrier drivers for route form:', err);
        return [] as Array<{ id: string; userId: string | null; firstName: string | null; lastName: string | null }>;
      }),
    listCarrierTrucks(orgId)
      .then((r) => r.items)
      .catch((err) => {
        logger.error('Failed to load carrier trucks for route form:', err);
        return [] as any[];
      }),
  ]);

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <RouteCreateMobile drivers={drivers} trucks={trucks} />
      </div>

      {/* Desktop form (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
        <div>
          <Link
            href="/routes"
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
            Back to Routes
          </Link>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Create Route</h1>
          <p className="mt-1 text-muted-foreground">Set up a new delivery route</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <NewRouteClient drivers={drivers} trucks={trucks} />
        </div>
      </div>
    </>
  );
}
