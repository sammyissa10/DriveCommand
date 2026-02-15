import { redirect } from 'next/navigation';
import {
  getMyAssignedRoute,
} from '@/app/(driver)/actions/driver-routes';
import {
  getMyRouteDocuments,
  getMyTruckDocuments,
  getDriverDownloadUrl,
} from '@/app/(driver)/actions/driver-documents';
import { RouteDetailReadOnly } from '@/components/driver/route-detail-readonly';
import { DocumentListReadOnly } from '@/components/driver/document-list-readonly';
import { formatDateInTenantTimezone } from '@/lib/utils/date';

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
  const route = await getMyAssignedRoute();

  // No route assigned - redirect to landing page (which shows empty state)
  if (!route) {
    redirect('/');
  }

  // Get route and truck documents
  const [routeDocuments, truckDocuments] = await Promise.all([
    getMyRouteDocuments(),
    getMyTruckDocuments(),
  ]);

  // Format dates in UTC timezone (tenant timezone would come from tenant settings in future)
  const formattedScheduledDate = formatDateInTenantTimezone(
    route.scheduledDate,
    'UTC'
  );
  const formattedCompletedAt = route.completedAt
    ? formatDateInTenantTimezone(route.completedAt, 'UTC')
    : undefined;

  return (
    <div className="space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My Route</h1>
        <p className="mt-1 text-gray-600">
          {route.origin} to {route.destination}
        </p>
      </div>

      {/* Route + Truck details */}
      <RouteDetailReadOnly
        route={route}
        formattedScheduledDate={formattedScheduledDate}
        formattedCompletedAt={formattedCompletedAt}
      />

      {/* Route Documents section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Route Documents</h2>
        <DocumentListReadOnly
          documents={routeDocuments}
          downloadAction={getDriverDownloadUrl}
        />
      </div>

      {/* Truck Documents section */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Truck Documents</h2>
        <DocumentListReadOnly
          documents={truckDocuments}
          downloadAction={getDriverDownloadUrl}
        />
      </div>
    </div>
  );
}
