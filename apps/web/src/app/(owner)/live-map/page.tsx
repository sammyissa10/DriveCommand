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
      {/* Mobile-web design system — full-bleed dark map; desktop keeps its own layout */}
      <div className="-m-4 h-[calc(100vh-3.5rem-5rem)] lg:hidden">
        <LiveMapMobile initialVehicles={vehicles} />
      </div>

      {/* Desktop */}
      <div className="hidden lg:block lg:h-[calc(100vh-8rem)]">
        <LiveMapWrapper initialVehicles={vehicles} />
      </div>
    </>
  );
}
