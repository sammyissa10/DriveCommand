import * as React from 'react';
import { Shell, Button } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface ClientShipmentUpdateEmailProps {
  status: 'picked_up' | 'delivered';
  loadNumber: string;
  companyName: string;
  facilityName: string;
  timestamp: string;
  driverName: string;
  truckUnitNumber: string;
  referenceNumbers: string;
  commodity?: string;
  estimatedDelivery?: string;
  podNote?: string;
  portalUrl?: string;
}

export function ClientShipmentUpdateEmail({
  status,
  loadNumber,
  companyName,
  facilityName,
  timestamp,
  driverName,
  truckUnitNumber,
  referenceNumbers,
  commodity,
  estimatedDelivery,
  podNote,
  portalUrl,
}: ClientShipmentUpdateEmailProps) {
  const isPickup = status === 'picked_up';
  const greeting = isPickup ? 'Shipment Picked Up' : 'Shipment Delivered';
  const message = isPickup
    ? 'Your shipment has been picked up and is now in transit. We will notify you upon delivery.'
    : 'Your shipment has been successfully delivered. Thank you for your business.';

  return (
    <Shell
      preheader={`Load ${loadNumber} ${isPickup ? 'picked up from' : 'delivered to'} ${facilityName} at ${timestamp}`}
      logoBaseUrl={getAppBaseUrl()}
      statusBar={{
        tone: isPickup ? 'info' : 'success',
        label: isPickup ? 'Picked up — in transit' : 'Delivered',
      }}
    >
      <h2>{greeting}</h2>
      <p>{message}</p>

      <p><strong>Load Number:</strong> {loadNumber}</p>
      {referenceNumbers && (
        <p><strong>Reference Numbers:</strong> {referenceNumbers}</p>
      )}
      {commodity && (
        <p><strong>Commodity:</strong> {commodity}</p>
      )}
      <p>
        <strong>{isPickup ? 'Picked Up From' : 'Delivered To'}:</strong> {facilityName}
      </p>
      <p>
        <strong>{isPickup ? 'Pickup Time' : 'Delivery Time'}:</strong> {timestamp}
      </p>
      <p><strong>Driver:</strong> {driverName}</p>
      <p><strong>Truck Unit:</strong> {truckUnitNumber}</p>
      {isPickup && estimatedDelivery && (
        <p><strong>Estimated Delivery:</strong> {estimatedDelivery}</p>
      )}
      {!isPickup && podNote && (
        <p><strong>Proof of Delivery:</strong> {podNote}</p>
      )}

      {portalUrl && <Button href={portalUrl} label="Track Shipment" />}

      <p>This is an automated shipment notification from {companyName}.</p>
    </Shell>
  );
}
