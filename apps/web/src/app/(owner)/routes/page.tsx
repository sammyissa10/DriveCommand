/**
 * Routes list page — uses Suspense streaming so the header renders
 * instantly and the grid streams in as the DB query resolves.
 */

import { Suspense } from 'react';
import { listRoutes, deleteRoute } from '@/app/(owner)/actions/routes';
import { RoutesGrid } from './_grid/RoutesGrid';
import { LoadingSkeleton } from '@/components/data-grid/shell';
import { logger } from '@/lib/logger';
import type { RouteRow } from './_grid/types';

// Async data section
async function RouteGridSection() {
  let routes: Awaited<ReturnType<typeof listRoutes>> = [];
  try {
    routes = await listRoutes();
  } catch (e) {
    logger.error('[routes] listRoutes failed:', e);
  }

  // Transform to RouteRow format
  const routeRows: RouteRow[] = routes.map((r) => ({
    id: r.id,
    name: r.name ?? '',
    origin: r.origin || null,
    destination: r.destination || null,
    scheduledDate: r.scheduledDate ? r.scheduledDate.toISOString() : null,
    driverId: r.driverId || null,
    driverName: r.driver ? `${r.driver.firstName} ${r.driver.lastName}` : null,
    truckId: r.truckId || null,
    truckUnit: r.truck?.licensePlate || null,
    status: r.status || 'planned',
  }));

  return <RoutesGrid routes={routeRows} deleteAction={deleteRoute} />;
}

// Skeleton fallback
function RouteGridSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <LoadingSkeleton rows={5} columns={7} showHeader />
    </div>
  );
}

// Page
export default function RoutesPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Routes</h1>
          <p className="mt-1 text-muted-foreground text-sm">Plan and track truck journeys</p>
        </div>
      </div>

      <Suspense fallback={<RouteGridSkeleton />}>
        <RouteGridSection />
      </Suspense>
    </div>
  );
}
