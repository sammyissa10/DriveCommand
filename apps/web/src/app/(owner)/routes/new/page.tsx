import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks';
import { requireTenantId } from '@/lib/context/tenant-context';
import { listRouteAssignableDrivers, type RouteAssignableDriver } from '@/lib/routes/assignable-drivers';
import { NewRouteClient } from './new-route-client';
import { RouteCreateMobile } from './RouteCreateMobile';
import { logger } from '@/lib/logger';

export default async function NewRoutePage() {
  const orgId = await requireTenantId();
  const [drivers, trucks] = await Promise.all([
    // TKT-0084: the picker must show the FULL carrier roster, but Route.driverId is a
    // NOT NULL FK to User.id (quick-477), so only rows with a linked DRIVER-role User.id
    // are selectable. Drivers who haven't accepted their portal invite (or whose access
    // was revoked) still render, disabled, with an explanatory reason instead of being
    // silently dropped — that silent drop was the TKT-0084 bug.
    listRouteAssignableDrivers(orgId).catch((err) => {
      logger.error('Failed to load drivers for route form:', err);
      return [] as RouteAssignableDriver[];
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
