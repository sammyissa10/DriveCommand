import {
  getMyAssignedRoute,
  getMyCompletedRoutes,
} from '@/app/(driver)/actions/driver-routes';
import { CompletedRouteHistory } from '@/components/driver/completed-route-history';
import {
  getMyRouteDocuments,
  getMyTruckDocuments,
  getDriverDownloadUrl,
} from '@/app/(driver)/actions/driver-documents';
import { RouteDetailReadOnly } from '@/components/driver/route-detail-readonly';
import { DocumentListReadOnly } from '@/components/driver/document-list-readonly';
import { MessagingPanel } from '@/components/driver/messaging-panel';
import { formatDateInTenantTimezone } from '@/lib/utils/date';
import { MapPin, Package } from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/logger';

/**
 * Driver route detail page.
 * Shows the driver's assigned route with complete read-only view:
 * - Route details (origin, destination, status, dates)
 * - Truck details (make, model, year, VIN, plate, odometer)
 * - Route documents (download-only)
 * - Truck documents (download-only)
 *
 * SECURITY: All data fetched through driver-scoped server actions.
 * No edit/delete/upload/status-transition controls visible.
 */
export default async function MyRoutePage() {
  // Get the driver's assigned route
  let route = null;
  try {
    route = await getMyAssignedRoute();
  } catch (err) {
    logger.error('[MyRoutePage] Failed to fetch assigned route:', err);
  }

  // Fetch completed routes regardless of active route status
  let completedRoutes: Awaited<ReturnType<typeof getMyCompletedRoutes>> = [];
  try {
    completedRoutes = await getMyCompletedRoutes();
  } catch (err) {
    logger.error('[MyRoutePage] Failed to fetch completed routes:', err);
  }

  // No route assigned - show empty state + history
  if (!route) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <MapPin className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No route assigned</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don&apos;t have an active route right now. Check back later or contact your dispatcher.
          </p>
        </div>
        <CompletedRouteHistory completedRoutes={completedRoutes} />
      </div>
    );
  }

  // Get route and truck documents
  let routeDocuments: Awaited<ReturnType<typeof getMyRouteDocuments>> = [];
  let truckDocuments: Awaited<ReturnType<typeof getMyTruckDocuments>> = [];
  try {
    [routeDocuments, truckDocuments] = await Promise.all([
      getMyRouteDocuments(),
      getMyTruckDocuments(),
    ]);
  } catch (err) {
    logger.error('[MyRoutePage] Failed to fetch documents:', err);
  }

  // Loads linked to this route via routeId FK
  const routeLoads = route.loads ?? [];

  // Format dates in UTC timezone (tenant timezone would come from tenant settings in future)
  const formattedScheduledDate = formatDateInTenantTimezone(
    route.scheduledDate,
    'UTC'
  );
  const formattedCompletedAt = route.completedAt
    ? formatDateInTenantTimezone(route.completedAt, 'UTC')
    : undefined;

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">My Route</h1>
        <p className="mt-1 text-muted-foreground">
          {route.origin} to {route.destination}
        </p>
      </div>

      {/* Loads on this Route section (via routeId FK) */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border border-l-4 border-l-blue-500 bg-card p-4 lg:p-5 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Package className="h-4 w-4" />
          Loads on this Route
        </h3>
        {routeLoads.length > 0 ? (
          <div className="space-y-3">
            {routeLoads.map((load) => (
              <div key={load.id} className="text-sm">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-bold text-foreground">Load #{load.loadNumber}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      load.status === 'IN_TRANSIT'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : load.status === 'DISPATCHED'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : load.status === 'PICKED_UP'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {load.status.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-muted-foreground mt-0.5">
                  {load.origin} &rarr; {load.destination}
                </p>
              </div>
            ))}
            <div className="border-t border-border pt-3">
              <Link href="/my-load" className="text-sm text-primary hover:underline">
                View load details &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No loads linked to this route.</p>
        )}
      </div>

      {/* Route + Truck details */}
      <RouteDetailReadOnly
        route={route}
        formattedScheduledDate={formattedScheduledDate}
        formattedCompletedAt={formattedCompletedAt}
      />

      {/* Route Documents section */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Route Documents</h2>
        <DocumentListReadOnly
          documents={routeDocuments}
          downloadAction={getDriverDownloadUrl}
        />
      </div>

      {/* Truck Documents section */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Truck Documents</h2>
        <DocumentListReadOnly
          documents={truckDocuments}
          downloadAction={getDriverDownloadUrl}
        />
      </div>

      {/* Route Messages section */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-foreground">Route Messages</h2>
        <MessagingPanel />
      </div>

      {/* Completed Routes history */}
      <CompletedRouteHistory completedRoutes={completedRoutes} />
    </div>
  );
}
