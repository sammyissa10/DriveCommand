import {
  getMyActiveDispatch,
  getMyDispatchHistory,
  startTrip,
  arriveAtStop,
  completeCurrentStop,
} from '@/app/(driver)/actions/driver-routes';
import { CompletedRouteHistory } from '@/components/driver/completed-route-history';
import { DispatchDetail } from '@/components/driver/route-detail-readonly';
import { MapPin } from 'lucide-react';
import { logger } from '@/lib/logger';

// Force dynamic rendering — this page requires auth cookies and must never be
// statically cached at build time (no session exists at build time).
export const dynamic = 'force-dynamic';

/**
 * Driver Route tab — Carrier Ops edition.
 * Shows the driver's active CarrierDispatch with stops timeline and action buttons.
 * Shows completed dispatches in history below.
 *
 * SECURITY: All data fetched through driver-scoped server actions.
 */
export default async function MyRoutePage() {
  // Fetch active dispatch
  let dispatch = null;
  try {
    dispatch = await getMyActiveDispatch();
  } catch (err) {
    logger.error('[MyRoutePage] Failed to fetch active dispatch:', err);
  }

  // Fetch dispatch history regardless of active dispatch status
  let history: Awaited<ReturnType<typeof getMyDispatchHistory>> = [];
  try {
    history = await getMyDispatchHistory();
  } catch (err) {
    logger.error('[MyRoutePage] Failed to fetch dispatch history:', err);
  }

  // No active dispatch — show empty state + history
  if (!dispatch) {
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
        <CompletedRouteHistory completedDispatches={history} />
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">My Route</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {dispatch.stops.length} stop{dispatch.stops.length !== 1 ? 's' : ''} &middot; Unit #{dispatch.truck.unitNumber}
        </p>
      </div>

      {/* Active dispatch detail with stops timeline and action buttons */}
      {/* Normalize plannedMiles from Prisma Decimal to plain number to avoid
          serialization errors when passing from server component to client component */}
      <DispatchDetail
        dispatch={{
          ...dispatch,
          plannedMiles: dispatch.plannedMiles != null ? Number(dispatch.plannedMiles) : null,
        }}
        startAction={startTrip}
        arriveAction={arriveAtStop}
        completeAction={completeCurrentStop}
      />

      {/* TODO: Reconnect Documents section to CarrierDocument table */}
      {/* TODO: Reconnect Messages section to Carrier Ops messaging */}

      {/* Completed dispatches history */}
      <CompletedRouteHistory completedDispatches={history} />
    </div>
  );
}
