'use client';

// CRITICAL: Import Leaflet CSS first
import 'leaflet/dist/leaflet.css';

import { useEffect, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
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
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(
    null
  );

  // Update vehicles when polled data flows in from wrapper
  useEffect(() => {
    setVehicles(initialVehicles);
  }, [initialVehicles]);

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

        <MarkerClusterGroup
          chunkedLoading
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          iconCreateFunction={(cluster: any) => {
            const count = cluster.getChildCount();
            const size = count < 10 ? 40 : count < 100 ? 48 : 56;
            return divIcon({
              html: `<div style="
                width:${size}px;height:${size}px;
                background:rgba(30,64,175,0.9);
                border:3px solid #fff;
                border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                box-shadow:0 2px 8px rgba(0,0,0,0.4);
                font-size:${size < 48 ? 14 : 16}px;
                font-weight:700;
                color:#fff;
                font-family:sans-serif;
              ">${count}</div>`,
              className: '',
              iconSize: [size, size],
              iconAnchor: [size / 2, size / 2],
            });
          }}
        >
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
