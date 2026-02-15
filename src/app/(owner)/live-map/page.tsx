import { getLatestVehicleLocations } from './actions';
import LiveMapWrapper from '@/components/maps/live-map-wrapper';

// Force dynamic rendering for real-time data
export const fetchCache = 'force-no-store';

export default async function LiveMapPage() {
  // Fetch initial GPS data
  const vehicles = await getLatestVehicleLocations();

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
      {/* Header with title and legend */}
      <div className="mb-4 space-y-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Fleet Map</h1>
          <p className="text-muted-foreground">
            {vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} tracked
          </p>
        </div>

        {/* Status legend */}
        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-muted-foreground">Moving</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-muted-foreground">Idle</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-muted-foreground">Offline</span>
          </div>
        </div>
      </div>

      {/* Map container */}
      <div className="flex-1 relative rounded-lg overflow-hidden border">
        <LiveMapWrapper initialVehicles={vehicles} />
      </div>
    </div>
  );
}
