import * as React from 'react';
import { Shell, Button } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

export interface StopCompletedEmailProps {
  driverName: string;
  stopType: string;
  facilityName: string;
  completionTime: string;
  dispatchNumber: string;
  companyName: string;
  dispatchDetailUrl: string;
}

export function StopCompletedEmail({
  driverName,
  stopType,
  facilityName,
  completionTime,
  dispatchNumber,
  companyName,
  dispatchDetailUrl,
}: StopCompletedEmailProps) {
  const stopTypeLabel = stopType === 'pickup' ? 'Pickup' : 'Delivery';

  return (
    <Shell
      preheader={`${driverName} completed the ${stopTypeLabel.toLowerCase()} at ${facilityName} — dispatch ${dispatchNumber}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>Stop Completed</h2>
      <p>A driver has completed a stop. Review the details below.</p>

      <p><strong>Driver:</strong> {driverName}</p>
      <p><strong>Stop Type:</strong> {stopTypeLabel}</p>
      <p><strong>Facility:</strong> {facilityName}</p>
      <p><strong>Completed At:</strong> {completionTime}</p>
      <p><strong>Dispatch:</strong> {dispatchNumber}</p>

      <Button href={dispatchDetailUrl} label="View Dispatch" />

      <p>This is an automated notification from {companyName}.</p>
    </Shell>
  );
}
