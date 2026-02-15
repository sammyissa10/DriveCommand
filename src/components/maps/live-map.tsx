'use client';

// CRITICAL: Import Leaflet CSS first
import 'leaflet/dist/leaflet.css';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { useRouter } from 'next/navigation';
import VehicleMarker from './vehicle-marker';
import RouteHistoryLayer from './route-history-layer';
import VehicleDetailsSheet from '@/components/vehicle/vehicle-details-sheet';
import {
  VehicleLocation,
  calculateBounds,
  DEFAULT_CENTER,
  DEFAULT_ZOOM,
} from '@/lib/maps/map-utils';

interface LiveMapProps {
  initialVehicles: VehicleLocation[];
}

/**
 * Helper component to fit map bounds on mount
 * Uses useMap hook to access Leaflet map instance
 */
function FitBoundsOnMount({ vehicles }: { vehicles: VehicleLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (vehicles.length === 0) return;

    const bounds = calculateBounds(vehicles);
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, vehicles]);

  return null;
}

export default function LiveMap({ initialVehicles }: LiveMapProps) {
  const router = useRouter();
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null
  );

  // Update vehicles when server refresh occurs
  useEffect(() => {
    setVehicles(initialVehicles);
  }, [initialVehicles]);

  // Polling for real-time updates (30 second interval)
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger re-fetch via router refresh (Next.js 15 pattern)
      router.refresh();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [router]);

  // Determine initial map center
  const center =
    vehicles.length > 0
      ? [vehicles[0].latitude, vehicles[0].longitude]
      : DEFAULT_CENTER;

  return (
    <>
      <style jsx global>{`
        .vehicle-marker-icon {
          background: none !important;
          border: none !important;
        }
      `}</style>

      <MapContainer
        center={center as [number, number]}
        zoom={DEFAULT_ZOOM}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <FitBoundsOnMount vehicles={vehicles} />

        <MarkerClusterGroup chunkedLoading>
          {vehicles.map((vehicle) => (
            <VehicleMarker
              key={vehicle.id}
              vehicle={vehicle}
              onClick={() => setSelectedVehicleId(vehicle.truckId)}
            />
          ))}
        </MarkerClusterGroup>

        {selectedVehicleId && <RouteHistoryLayer truckId={selectedVehicleId} />}
      </MapContainer>

      <VehicleDetailsSheet
        truckId={selectedVehicleId || ''}
        open={!!selectedVehicleId}
        onClose={() => setSelectedVehicleId(null)}
      />
    </>
  );
}
