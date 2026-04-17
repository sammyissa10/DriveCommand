import { redirect } from 'next/navigation';
import { Route } from 'lucide-react';
import { getMyActiveDispatch } from '@/app/(driver)/actions/driver-routes';
import { logger } from '@/lib/logger';

/**
 * Driver landing page.
 * Checks for active CarrierDispatch assignment:
 * - If assigned: redirect to /my-route
 * - If not assigned: show "No Route Assigned" message
 */
export default async function DriverHomePage() {
  let dispatch = null;
  try {
    dispatch = await getMyActiveDispatch();
  } catch (err) {
    logger.error('[DriverHomePage] Failed to fetch active dispatch:', err);
  }

  // If driver has an active dispatch, redirect to route detail page
  if (dispatch) {
    redirect('/my-route');
  }

  // No dispatch assigned - show empty state
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
