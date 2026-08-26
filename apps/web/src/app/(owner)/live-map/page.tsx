import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { logger, serializeError } from '@/lib/logger';
import { getLatestVehicleLocations } from './actions';
import LiveMapWrapper from '@/components/maps/live-map-wrapper';
import { LiveMapMobile } from './LiveMapMobile';

// Force dynamic rendering for real-time data
export const fetchCache = 'force-no-store';

export default async function LiveMapPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  /**
   * WHY THIS IS NOT `.catch(() => [])` ANY MORE.
   *
   * It used to be, and the empty array it produced was indistinguishable from a
   * tenant that genuinely owns no trucks — so a database failure rendered as a
   * confident "No trucks yet · Trucks you add to the fleet will show here". The
   * error was also never logged, so nothing anywhere recorded that it happened.
   *
   * It is the same swallow this module has now hit repeatedly: quick-548's
   * `notifyDispatchOfBlock` returning `{notified: 0}` from its catch with nobody
   * inspecting it, and quick-549's blocked screen asserting a delivery it had no
   * channel to learn about. A screen must not state as fact something it cannot
   * know, and "you have no trucks" is a statement of fact.
   *
   * `LiveMapMobile` had already been forced to work around it — it carried a
   * `hasLoaded` flag seeded from `initialVehicles.length > 0`, precisely because
   * an empty array meant "unknown". That workaround has a hole of its own: a
   * tenant that really owns zero trucks was treated as "still loading" forever
   * and never saw the empty state at all. Reporting the failure honestly fixes
   * both directions at once.
   */
  const initial = await getLatestVehicleLocations().then(
    (vehicles) => ({ vehicles, failed: false }),
    (err: unknown) => {
      logger.error('Live map initial vehicle load failed', err, {
        error: serializeError(err),
      });
      return { vehicles: [], failed: true };
    },
  );
  const vehicles = initial.vehicles;

  return (
    <>
      {/*
        Mobile-web design system — pinned to the viewport rather than sized with a
        calc. The shell puts the onboarding ribbon in flow above the page content,
        so any height calc runs long by the ribbon's height and the map's bottom bar
        lands on top of the tab bar. top-14 clears the sticky header; bottom-[72px]
        matches the shell's own nav reserve (main's mb-[72px]). z-0 keeps it under
        the header (z-1001) and tab bar (z-50).
      */}
      <div className="fixed inset-x-0 top-14 bottom-[72px] z-0 lg:hidden">
        <LiveMapMobile initialVehicles={vehicles} initialLoadFailed={initial.failed} />
      </div>

      {/* Desktop */}
      <div className="hidden lg:block lg:h-[calc(100vh-8rem)]">
        <LiveMapWrapper initialVehicles={vehicles} />
      </div>
    </>
  );
}
