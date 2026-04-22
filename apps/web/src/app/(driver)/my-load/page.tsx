import { getMyLoads } from '@/app/(driver)/actions/driver-load';
import { CompletedLoadHistory } from '@/components/driver/completed-load-history';
import { Package } from 'lucide-react';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

/**
 * Driver Load tab — Carrier Ops edition.
 * Shows CarrierLoads from the driver's active dispatches.
 * Load status is managed via stop completion cascades, not direct updates.
 *
 * SECURITY: All data fetched through driver-scoped server actions.
 */
export default async function MyLoadPage() {
  let loads: Awaited<ReturnType<typeof getMyLoads>> = [];
  try {
    loads = await getMyLoads();
  } catch (err) {
    logger.error('[MyLoadPage] Failed to fetch loads:', err);
  }

  if (loads.length === 0) {
    return (
      <div className="space-y-4 lg:space-y-6">
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Package className="h-7 w-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">No loads on active dispatch</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            You don&apos;t have any loads assigned right now. Check back later or contact your dispatcher.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-6">
      {/* Page heading */}
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-foreground">My Loads</h1>
        <p className="mt-1 text-muted-foreground text-sm">
          {loads.length} load{loads.length !== 1 ? 's' : ''} on your active dispatch
        </p>
      </div>

      {/* Load cards */}
      <CompletedLoadHistory loads={loads} />
    </div>
  );
}
