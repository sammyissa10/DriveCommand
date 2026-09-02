import * as React from 'react';
import { Shell, Button } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface LoadDeliveredEmailProps {
  loadNumber: string;
  clientName: string;
  originStop: string;
  destinationStop: string;
  deliveredAt: string;
  loadDetailUrl: string;
  companyName: string;
}

export function LoadDeliveredEmail({
  loadNumber,
  clientName,
  originStop,
  destinationStop,
  deliveredAt,
  loadDetailUrl,
  companyName,
}: LoadDeliveredEmailProps) {
  return (
    <Shell
      preheader={`Load ${loadNumber} delivered to ${destinationStop} — ${deliveredAt}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Load Delivered Successfully</h2>
      <p>A load has been marked as delivered. Review the delivery details below.</p>

      <p><strong>Load Number:</strong> {loadNumber}</p>
      <p><strong>Client:</strong> {clientName}</p>
      <p><strong>Origin:</strong> {originStop}</p>
      <p><strong>Destination:</strong> {destinationStop}</p>
      <p><strong>Delivered At:</strong> {deliveredAt}</p>

      <Button href={loadDetailUrl} label="View Load" />

      <p>This is an automated notification from {companyName}.</p>
    </Shell>
  );
}
