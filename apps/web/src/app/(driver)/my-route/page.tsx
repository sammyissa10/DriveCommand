import {
  getMyActiveDispatch,
  getMyDispatchHistory,
  startTrip,
  arriveAtStop,
  completeCurrentStop,
} from '@/app/(driver)/actions/driver-routes';
import { DispatchDetail } from '@/components/driver/route-detail-readonly';
import { DispatchHistoryList } from '@/components/driver/dispatch-history-list';
import { RouteTabView } from '@/components/driver/route-tab-view';
import { logger } from '@/lib/logger';

// Force dynamic rendering — this page requires auth cookies and must never be
// statically cached at build time (no session exists at build time).
export const dynamic = 'force-dynamic';

/**
 * Driver Route tab — Carrier Ops edition.
 * Shows Active/History tabs:
 *   - Active: current CarrierDispatch with stops timeline and action buttons.
 *   - History: up to 20 completed dispatches with drill-down detail views.
 *
 * SECURITY: All data fetched through driver-scoped server actions.
 */
export default async function MyRoutePage() {
  // Fetch active dispatch and history in parallel
  const [dispatch, history] = await Promise.allSettled([
    getMyActiveDispatch(),
    getMyDispatchHistory(),
  ]);

  const activeDispatch = dispatch.status === 'fulfilled' ? dispatch.value : null;
  const historyDispatches = history.status === 'fulfilled' ? history.value : [];

  if (dispatch.status === 'rejected') {
    logger.error('[MyRoutePage] Failed to fetch active dispatch:', dispatch.reason);
  }
  if (history.status === 'rejected') {
    logger.error('[MyRoutePage] Failed to fetch dispatch history:', history.reason);
  }

  // Normalize plannedMiles from Prisma Decimal to plain number to avoid
  // serialization errors when passing from server component to client component
  const normalizedDispatch = activeDispatch
    ? {
        ...activeDispatch,
        plannedMiles: activeDispatch.plannedMiles != null ? Number(activeDispatch.plannedMiles) : null,
      }
    : null;

  const activeTab = (
    normalizedDispatch ? (
      <DispatchDetail
        dispatch={normalizedDispatch}
        startAction={startTrip}
        arriveAction={arriveAtStop}
        completeAction={completeCurrentStop}
      />
    ) : (
      <ActiveEmptyState />
    )
  );

  const historyTab = (
    <DispatchHistoryList dispatches={historyDispatches} />
  );

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">My Route</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {normalizedDispatch
            ? `${normalizedDispatch.stops.length} stop${normalizedDispatch.stops.length !== 1 ? 's' : ''} · ${normalizedDispatch.truck.displayName || normalizedDispatch.truck.unitNumber}`
            : 'Active dispatch and completed history'}
        </p>
      </div>

      {/* Tab view — client component manages tab state */}
      <RouteTabView
        hasActiveDispatch={!!normalizedDispatch}
        historyCount={historyDispatches.length}
        activeTab={activeTab}
        historyTab={historyTab}
      />
    </div>
  );
}

function ActiveEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <svg className="h-7 w-7 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-foreground">No route assigned</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        You don&apos;t have an active route right now. Check back later or contact your dispatcher.
      </p>
    </div>
  );
}
