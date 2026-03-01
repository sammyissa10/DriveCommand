import { redirect } from 'next/navigation';
import { Route } from 'lucide-react';
import { getMyAssignedRoute } from '@/app/(driver)/actions/driver-routes';

/**
 * Driver landing page.
 * Checks for active route assignment:
 * - If assigned: redirect to /my-route
 * - If not assigned: show "No Route Assigned" message
 */
export default async function DriverHomePage() {
  let route = null;
  try {
    route = await getMyAssignedRoute();
  } catch (err) {
    console.error('[DriverHomePage] Failed to fetch assigned route:', err);
  }

  // If driver has an assigned route, redirect to detail page
  if (route) {
    redirect('/my-route');
  }

  // No route assigned - show empty state
  return (
    <div className="max-w-2xl mx-auto text-center py-16">
      <Route className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
      <h1 className="text-2xl font-semibold text-foreground">No Route Assigned</h1>
      <p className="mt-3 text-muted-foreground">
        You don&apos;t have an active route assignment. Contact your manager for details.
      </p>
    </div>
  );
}
