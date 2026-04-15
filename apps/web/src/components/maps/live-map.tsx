'use client';

// CRITICAL: Import Leaflet CSS first
import 'leaflet/dist/leaflet.css';

import { useEffect, useState } from 'react';
import { divIcon } from 'leaflet';
import { MapContainer, TileLayer, useMap, Marker, Popup, Polyline } from 'react-leaflet';
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
import { RouteSegment, HistoryPoint } from './history-tab';

interface LiveMapProps {
  initialVehicles: VehicleLocation[];
  flyToTarget?: { lat: number; lng: number } | null;
  historySegments?: RouteSegment[] | null;
  historyPoints?: HistoryPoint[] | null;
  onVehicleClick?: (truckId: string) => void;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);

  return null;
}

/**
 * Helper component to fly to a target position when flyToTarget changes
 */
function FlyToController({ target }: { target: { lat: number; lng: number } | null | undefined }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    map.flyTo([target.lat, target.lng], 14, { animate: true, duration: 1 });
  }, [map, target]);

  return null;
}

/**
 * Start/end markers for GPS history trail
 */
function HistoryEndpointMarkers({ points }: { points: HistoryPoint[] }) {
  if (points.length === 0) return null;

  const first = points[0];
  const last = points[points.length - 1];

  const startIcon = divIcon({
    html: `<div style="width:12px;height:12px;background:#22c55e;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  const endIcon = divIcon({
    html: `<div style="width:12px;height:12px;background:#ef4444;border:2px solid white;border-radius:50%;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>`,
    className: '',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
  });

  return (
    <>
      <Marker position={[first.latitude, first.longitude]} icon={startIcon}>
        <Popup>
          <div className="text-xs">
            <strong>Start</strong>
            <br />
            {new Date(first.timestamp).toLocaleTimeString()}
          </div>
        </Popup>
      </Marker>
      {points.length > 1 && (
        <Marker position={[last.latitude, last.longitude]} icon={endIcon}>
          <Popup>
            <div className="text-xs">
              <strong>End</strong>
              <br />
              {new Date(last.timestamp).toLocaleTimeString()}
            </div>
          </Popup>
        </Marker>
      )}
    </>
  );
}

export default function LiveMap({
  initialVehicles,
  flyToTarget,
  historySegments,
  historyPoints,
  onVehicleClick,
}: LiveMapProps) {
  const [vehicles, setVehicles] = useState(initialVehicles);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);

  // Update vehicles when polled data flows in from wrapper
  useEffect(() => {
    setVehicles(initialVehicles);
  }, [initialVehicles]);

  // Determine initial map center from first vehicle with GPS
  const locatedVehicle = vehicles.find(
    (v) => v.latitude !== null && v.longitude !== null
  );
  const center = locatedVehicle
    ? [locatedVehicle.latitude!, locatedVehicle.longitude!]
    : DEFAULT_CENTER;

  const handleVehicleClick = (truckId: string) => {
    setSelectedVehicleId(truckId);
    onVehicleClick?.(truckId);
  };

  const showHistory = !!historySegments && historySegments.length > 0;

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

        {!showHistory && <FitBoundsOnMount vehicles={vehicles} />}
        <FlyToController target={flyToTarget} />

        {/* Live vehicle markers — only when not in history mode */}
        {!showHistory && (
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
                onClick={() => handleVehicleClick(vehicle.truckId)}
              />
            ))}
          </MarkerClusterGroup>
        )}

        {/* History polyline segments */}
        {showHistory && historySegments && historySegments.map((segment, index) => (
          <Polyline
            key={`history-segment-${index}`}
            positions={segment.positions}
            pathOptions={{
              color: segment.color,
              weight: 4,
              opacity: 0.8,
              lineCap: 'round',
              lineJoin: 'round',
            }}
          />
        ))}

        {/* Start/end markers for history */}
        {showHistory && historyPoints && (
          <HistoryEndpointMarkers points={historyPoints} />
        )}

        {/* Route history layer for selected vehicle (live tab) */}
        {!showHistory && selectedVehicleId && (
          <RouteHistoryLayer truckId={selectedVehicleId} />
        )}
      </MapContainer>

      {/* Vehicle details sheet — only in live mode */}
      {!showHistory && (
        <VehicleDetailsSheet
          truckId={selectedVehicleId || ''}
          open={!!selectedVehicleId}
          onClose={() => setSelectedVehicleId(null)}
        />
      )}
    </>
  );
}
