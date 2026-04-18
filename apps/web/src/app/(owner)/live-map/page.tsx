import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getLatestVehicleLocations } from './actions';
import LiveMapWrapper from '@/components/maps/live-map-wrapper';

// Force dynamic rendering for real-time data
export const fetchCache = 'force-no-store';

export default async function LiveMapPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const vehicles = await getLatestVehicleLocations().catch(() => []);

  return (
    <div className="h-[calc(100vh-3.5rem-5rem)] lg:h-[calc(100vh-8rem)]">
      <LiveMapWrapper initialVehicles={vehicles} />
    </div>
  );
}
