'use client';

import dynamic from 'next/dynamic';
import { VehicleLocation } from '@/lib/maps/map-utils';

// Dynamic import of LiveMap with ssr: false (required for Leaflet)
const LiveMapDynamic = dynamic(
  () => import('./live-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>
    ),
  }
);

interface LiveMapWrapperProps {
  initialVehicles: VehicleLocation[];
}

export default function LiveMapWrapper({ initialVehicles }: LiveMapWrapperProps) {
  return <LiveMapDynamic initialVehicles={initialVehicles} />;
}
