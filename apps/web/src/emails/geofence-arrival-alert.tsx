import * as React from 'react';
import { Shell, Button, colors, tintAccents } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface GeofenceArrivalAlertProps {
  loadNumber: string;
  stopType: 'pickup' | 'delivery';
  stopAddress: string;
  driverName: string;
  licensePlate: string;
  loadUrl: string;
}

export function GeofenceArrivalAlert({
  loadNumber,
  stopType,
  stopAddress,
  driverName,
  licensePlate,
  loadUrl,
}: GeofenceArrivalAlertProps) {
  const isPickup = stopType === 'pickup';
  const stopLabel = isPickup ? 'Pickup location' : 'Delivery location';
  const headline = isPickup
    ? `Truck arrived at pickup — Load ${loadNumber}`
    : `Truck arrived at delivery — Load ${loadNumber}`;

  return (
    <Shell
      preheader={`${headline} — ${stopAddress}`}
      logoBaseUrl={getAppBaseUrl()}
      statusBar={{ tone: isPickup ? 'info' : 'success', label: isPickup ? 'Arrived at pickup' : 'Arrived at delivery' }}
      accentColor={isPickup ? colors.signalBlue : tintAccents.success}
    >
      <h2>{headline}</h2>
      <p>
        GPS geofencing detected the truck entering the {stopType} zone. The load
        status has been automatically updated.
      </p>
      <p><strong>Load #:</strong> {loadNumber}</p>
      <p><strong>{stopLabel}:</strong> {stopAddress}</p>
      <p><strong>Driver:</strong> {driverName}</p>
      <p><strong>Truck:</strong> {licensePlate}</p>
      <Button href={loadUrl} label="View load" />
    </Shell>
  );
}
