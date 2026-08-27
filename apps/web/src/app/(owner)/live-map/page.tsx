import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { logger, serializeError } from '@/lib/logger';
import { getLatestVehicleLocations } from './actions';
import LiveMapWrapper from '@/components/maps/live-map-wrapper';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';
import { LiveMapMobile } from './LiveMapMobile';

// Force dynamic rendering for real-time data
export const fetchCache = 'force-no-store';

export default async function LiveMapPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  /**
   * `?view=board` is how the sidebar's Live Board entry lands on the board. It is
   * read here rather than with `useSearchParams()` in the client wrapper so that
   * no component in this tree acquires a Suspense requirement. Anything other than
   * the literal 'board' falls through to the map, which stays the default.
   */
  const { view } = await searchParams;
  const initialViewMode = view === 'board' ? ('list' as const) : ('map' as const);

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

  /**
   * ONE lane mounts, not both — quick-559.
   *
   * This used to render both variants and hide one with `lg:hidden` /
   * `hidden lg:block`. That is CSS, not mounting: React mounts both subtrees,
   * both sets of effects run, and both `setInterval`s fire. On this page that
   * meant a THIRD poller nobody could see — at 1600px `LiveMapMobile` sat under
   * `display: none` fetching `/vehicles` every 15s for a view that is not on
   * screen, and at 390px the desktop wrapper did the mirror of it, polling the
   * full ~18kB `/live-board` payload into a hidden subtree on the device most
   * likely to be metered. Measured in quick-558: ~10.6MB per 8-hour desktop tab
   * for the invisible lane alone, and 100% of the board's traffic wasted on a
   * phone.
   *
   * `ResponsiveSwitch` is not a new mechanism — it is this repo's own answer to
   * exactly this pattern, already used on 10+ carrier pages, and its header
   * documents the duplicate-mount problem in its original form (two live
   * `<form>` trees, duplicate submit targets). Duplicate pollers are that same
   * defect wearing different symptoms, so the fix is the same component rather
   * than a bespoke width check here.
   *
   * The trade-off, stated rather than discovered later: `useIsDesktop()` returns
   * `undefined` until it has mounted on the client, so neither lane renders in
   * the server HTML and the page paints one frame later than it used to. The
   * `fallback` below reserves the space so that frame is a neutral surface and
   * not a layout jump. `initialVehicles` is still fetched server-side and still
   * seeds whichever lane wins — it just no longer appears in the initial HTML.
   * A resize across 1024px now unmounts one lane and mounts the other, which
   * re-fetches; that is a real behaviour change and is the honest cost of not
   * having two of everything alive at once.
   */
  return (
    <ResponsiveSwitch
      fallback={<div className="h-[calc(100vh-8rem)] w-full animate-pulse bg-muted/40" />}
      mobile={
        /*
          Mobile-web design system — pinned to the viewport rather than sized with a
          calc. The shell puts the onboarding ribbon in flow above the page content,
          so any height calc runs long by the ribbon's height and the map's bottom bar
          lands on top of the tab bar. top-14 clears the sticky header; bottom-[72px]
          matches the shell's own nav reserve (main's mb-[72px]). z-0 keeps it under
          the header (z-1001) and tab bar (z-50).
        */
        <div className="fixed inset-x-0 top-14 bottom-[72px] z-0">
          <LiveMapMobile initialVehicles={vehicles} initialLoadFailed={initial.failed} />
        </div>
      }
      desktop={
        <div className="lg:h-[calc(100vh-8rem)]">
          <LiveMapWrapper initialVehicles={vehicles} initialViewMode={initialViewMode} />
        </div>
      }
    />
  );
}
