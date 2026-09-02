import * as React from 'react';
import { Shell, Button } from '../_system';
import { getAppBaseUrl } from '@/lib/app-url';

/** A single stop line rendered in the dispatch itinerary. */
export interface DispatchStopLine {
  /** 1-based position within the dispatch. */
  sequence: number;
  /** Raw stop type from the DB, e.g. 'pickup' | 'delivery'. */
  type: string;
  facilityName: string;
  city: string | null;
}

export interface DispatchAssignedEmailProps {
  dispatchNumber: string;
  scheduledDeparture: string;
  stopCount: number;
  /** Ordered stop itinerary for the assigned load(s). */
  stops: DispatchStopLine[];
  truckUnitNumber: string;
  driverPortalUrl: string;
  companyName: string;
}

function stopTypeLabel(type: string): string {
  if (!type) return 'Stop';
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
}

export function DispatchAssignedEmail({
  dispatchNumber,
  scheduledDeparture,
  stopCount,
  stops,
  truckUnitNumber,
  driverPortalUrl,
  companyName,
}: DispatchAssignedEmailProps) {
  return (
    <Shell
      preheader={`Dispatch ${dispatchNumber} — ${stopCount} stop${stopCount !== 1 ? 's' : ''}, truck ${truckUnitNumber}, departing ${scheduledDeparture}`}
      logoBaseUrl={getAppBaseUrl()}
    >
      <h2>New Dispatch Assigned</h2>
      <p>
        You have been assigned a new dispatch. Please review the details below and
        log in to the driver portal to view your full itinerary.
      </p>

      {/*
        StatGrid was deliberately NOT used here: the unit test at
        src/lib/carrier/__tests__/dispatch-assigned-email.test.ts asserts the
        literal string `Total Stops:</strong>\s*2`, which a StatGrid's
        value-over-label layout would not produce. The test winning over the
        presentation is the correct trade — see 579-SUMMARY.md.
      */}
      <p><strong>Dispatch Number:</strong> {dispatchNumber}</p>
      <p><strong>Scheduled Departure:</strong> {scheduledDeparture}</p>
      <p><strong>Total Stops:</strong> {stopCount}</p>
      <p><strong>Truck Unit:</strong> {truckUnitNumber}</p>

      {stops.length > 0 && (
        <>
          <h2>Itinerary</h2>
          {stops.map((stop) => (
            <p key={stop.sequence}>
              <strong>
                {stop.sequence}. {stopTypeLabel(stop.type)}
              </strong>{' '}
              — {stop.facilityName}
              {stop.city ? `, ${stop.city}` : ''}
            </p>
          ))}
        </>
      )}

      <Button href={driverPortalUrl} label="View Dispatch" />

      <p>This is an automated notification from {companyName}.</p>
    </Shell>
  );
}
