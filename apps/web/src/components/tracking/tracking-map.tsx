'use client';

import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import { divIcon } from 'leaflet';

interface TrackingMapProps {
  latitude: number;
  longitude: number;
  truckLabel: string;
}

export default function TrackingMap({ latitude, longitude, truckLabel }: TrackingMapProps) {
  const icon = divIcon({
    html: `
      <div class="relative">
        <div style="width:40px;height:40px;border-radius:50%;background:#3b82f6;border:2px solid #1d4ed8;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 6px -1px rgba(0,0,0,0.3)">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
            <path d="M15 18H9"></path>
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path>
            <circle cx="17" cy="18" r="2"></circle>
            <circle cx="7" cy="18" r="2"></circle>
          </svg>
        </div>
        <div style="position:absolute;left:50%;top:100%;transform:translateX(-50%);margin-top:2px;pointer-events:none;">
          <span style="display:inline-block;padding:1px 6px;font-size:10px;font-weight:600;line-height:1.4;background:rgba(17,24,39,0.85);color:white;border-radius:3px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);">
            ${truckLabel}
          </span>
        </div>
      </div>
    `,
    className: 'tracking-marker-icon',
    iconSize: [40, 56],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20],
  });

  return (
    <MapContainer
      center={[latitude, longitude]}
      zoom={13}
      style={{ height: '300px', width: '100%', borderRadius: '0.5rem' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Marker position={[latitude, longitude]} icon={icon} />
    </MapContainer>
  );
}
