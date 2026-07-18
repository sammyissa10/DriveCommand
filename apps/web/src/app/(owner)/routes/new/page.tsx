import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { listDrivers } from '@/app/(owner)/actions/drivers';
import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks';
import { requireTenantId } from '@/lib/context/tenant-context';
import { NewRouteClient } from './new-route-client';
import { logger } from '@/lib/logger';

export default async function NewRoutePage() {
  const orgId = await requireTenantId();
  const [allDrivers, trucks] = await Promise.all([
    listDrivers().catch((err) => {
      logger.error('Failed to load drivers for route form:', err);
      return [] as any[];
    }),
    listCarrierTrucks(orgId)
      .then((r) => r.items)
      .catch((err) => {
        logger.error('Failed to load carrier trucks for route form:', err);
        return [] as any[];
      }),
  ]);

  const drivers = allDrivers;

  return (
    <div className="space-y-6">
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
  );
}
