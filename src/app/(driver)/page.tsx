import { redirect } from 'next/navigation';
import { getMyAssignedRoute } from '@/app/(driver)/actions/driver-routes';

/**
 * Driver landing page.
 * Checks for active route assignment:
 * - If assigned: redirect to /my-route
 * - If not assigned: show "No Route Assigned" message
 */
export default async function DriverHomePage() {
  const route = await getMyAssignedRoute();

  // If driver has an assigned route, redirect to detail page
  if (route) {
    redirect('/my-route');
  }

  // No route assigned - show empty state
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <h1 className="text-2xl font-semibold text-gray-900">No Route Assigned</h1>
      <p className="mt-4 text-gray-600">
        You don&apos;t have an active route assignment. Contact your manager for details.
      </p>
    </div>
  );
}
