'use client';

import { Marker, Popup } from 'react-leaflet';
import { divIcon } from 'leaflet';
import { getVehicleStatus, STATUS_COLORS } from '@/lib/maps/vehicle-status';
import { VehicleLocation } from '@/lib/maps/map-utils';

interface VehicleMarkerProps {
  vehicle: VehicleLocation;
  onClick: () => void;
}

export default function VehicleMarker({ vehicle, onClick }: VehicleMarkerProps) {
  // Skip rendering if no GPS data (should be filtered by caller, but defensive)
  if (vehicle.latitude === null || vehicle.longitude === null) {
    return null;
  }

  // Calculate status using the pre-computed status or recompute client-side
  const status = vehicle.status !== 'no-location'
    ? vehicle.status
    : getVehicleStatus(vehicle.speed, vehicle.timestamp ? new Date(vehicle.timestamp) : null);

  const colors = STATUS_COLORS[status];

  // Create DivIcon with truck SVG
  const icon = divIcon({
    html: `
      <div class="relative">
        <div class="w-10 h-10 rounded-full ${colors.bg} border-2 ${colors.border} flex items-center justify-center shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
            <path d="M15 18H9"></path>
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path>
            <circle cx="17" cy="18" r="2"></circle>
            <circle cx="7" cy="18" r="2"></circle>
          </svg>
        </div>
        ${
          vehicle.heading !== null
            ? `
          <div class="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full border border-gray-300 flex items-center justify-center"
               style="transform: rotate(${vehicle.heading}deg)">
            <svg width="8" height="8" viewBox="0 0 10 10">
              <path d="M5 0 L10 10 L5 7 L0 10 Z" fill="#374151"/>
            </svg>
          </div>
        `
            : ''
        }
        <div class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap mt-0.5"
             style="top: 100%; pointer-events: none;">
          <span class="inline-block px-1.5 py-0 text-[10px] font-semibold leading-tight bg-gray-900/80 text-white rounded-sm shadow-sm backdrop-blur-sm">
            ${vehicle.truck.licensePlate || ''}
          </span>
        </div>
      </div>
    `,
    className: 'vehicle-marker-icon',
    iconSize: [40, 56],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

  return (
    <Marker
      position={[vehicle.latitude, vehicle.longitude]}
      icon={icon}
      eventHandlers={{ click: onClick }}
    >
      <Popup>
        <div className="space-y-2">
          <div className="font-semibold">
            {vehicle.truck.make} {vehicle.truck.model}
          </div>
          <div className="text-sm text-muted-foreground">
            {vehicle.truck.licensePlate}
          </div>
          {vehicle.driver && (
            <div className="text-sm">Driver: {vehicle.driver.name}</div>
          )}
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-3 h-3 rounded-full ${colors.bg}`}
            />
            <span className="text-sm capitalize">{status}</span>
          </div>
          {vehicle.speed !== null && (
            <div className="text-sm">
              Speed: {vehicle.speed.toFixed(1)} mph
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  );
}
