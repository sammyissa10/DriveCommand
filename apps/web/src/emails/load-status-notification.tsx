import * as React from 'react';
import { Shell, Button } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface LoadStatusNotificationEmailProps {
  customerName: string;
  loadNumber: string;
  status: string;
  origin: string;
  destination: string;
  driverName: string;
  truckInfo: string;
  estimatedDelivery?: string;
  trackingUrl: string;
}

const STATUS_MESSAGES: Record<string, string> = {
  DISPATCHED: 'Your load has been dispatched',
  PICKED_UP: 'Your load has been picked up',
  IN_TRANSIT: 'Your load is in transit',
  DELIVERED: 'Your load has been delivered',
};

const STATUS_LABELS: Record<string, string> = {
  DISPATCHED: 'Dispatched',
  PICKED_UP: 'Picked up',
  IN_TRANSIT: 'In transit',
  DELIVERED: 'Delivered',
};

export function LoadStatusNotificationEmail({
  customerName,
  loadNumber,
  status,
  origin,
  destination,
  driverName,
  truckInfo,
  estimatedDelivery,
  trackingUrl,
}: LoadStatusNotificationEmailProps) {
  const message = STATUS_MESSAGES[status] ?? `Your load status: ${status}`;
  const statusLabel = STATUS_LABELS[status] ?? status;

  return (
    <Shell
      preheader={`Load ${loadNumber} update: ${statusLabel} — ${destination}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>{message}</h2>
      <p>Hello, {customerName}</p>
      <p>
        We want to keep you informed about your shipment. Here is the latest
        status update for load <strong>{loadNumber}</strong>:
      </p>
      <p><strong>Status:</strong> {statusLabel}</p>
      <p><strong>Load #:</strong> {loadNumber}</p>
      <p><strong>Origin:</strong> {origin}</p>
      <p><strong>Destination:</strong> {destination}</p>
      <p><strong>Driver:</strong> {driverName}</p>
      <p><strong>Truck:</strong> {truckInfo}</p>
      {estimatedDelivery ? (
        <p><strong>Estimated delivery:</strong> {estimatedDelivery}</p>
      ) : null}
      <Button href={trackingUrl} label="Track this shipment" />
      <p>This is an automated notification about your shipment.</p>
    </Shell>
  );
}
