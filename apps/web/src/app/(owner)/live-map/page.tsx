import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getLatestVehicleLocations } from './actions';
import LiveMapWrapper from '@/components/maps/live-map-wrapper';
import { LiveMapMobile } from './LiveMapMobile';

// Force dynamic rendering for real-time data
export const fetchCache = 'force-no-store';

export default async function LiveMapPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const vehicles = await getLatestVehicleLocations().catch(() => []);

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
        <LiveMapMobile initialVehicles={vehicles} />
      </div>

      {/* Desktop */}
      <div className="hidden lg:block lg:h-[calc(100vh-8rem)]">
        <LiveMapWrapper initialVehicles={vehicles} />
      </div>
    </>
  );
}
