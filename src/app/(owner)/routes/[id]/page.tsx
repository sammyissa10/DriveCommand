import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getRoute, updateRouteStatus } from '@/app/(owner)/actions/routes';
import { formatDateInTenantTimezone } from '@/lib/utils/date';
import { RouteDetail } from '@/components/routes/route-detail';
import { RouteStatusActions } from '@/components/routes/route-status-actions';

interface RouteDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function RouteDetailPage({
  params,
}: RouteDetailPageProps) {
  const { id } = await params;
  const route = await getRoute(id);

  if (!route) {
    notFound();
  }

  // Format dates in tenant timezone (hardcode UTC for v1)
  const formattedScheduledDate = formatDateInTenantTimezone(
    route.scheduledDate,
    'UTC'
  );
  const formattedCompletedAt = route.completedAt
    ? formatDateInTenantTimezone(route.completedAt, 'UTC')
    : undefined;

  return (
    <div className="space-y-6 p-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/routes" className="text-blue-600 hover:text-blue-800">
            ← Back to Routes
          </Link>
        </div>
        <Link
          href={`/routes/${id}/edit`}
          className="rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Edit Route
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">
        {route.origin} to {route.destination}
      </h1>

      {/* Route Detail */}
      <RouteDetail
        route={route}
        formattedScheduledDate={formattedScheduledDate}
        formattedCompletedAt={formattedCompletedAt}
        statusActions={
          <RouteStatusActions
            routeId={route.id}
            currentStatus={route.status}
            updateStatusAction={updateRouteStatus}
          />
        }
      />
    </div>
  );
}
