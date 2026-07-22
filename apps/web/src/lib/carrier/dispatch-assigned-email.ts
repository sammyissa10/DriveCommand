/**
 * Pure builders for the "New Dispatch Assigned" email payload.
 *
 * Extracted from sendDispatchAssignedNotification so the payload logic
 * (stop count / itinerary / timezone-aware datetime rendering) is unit-testable
 * without a DB, email transport, or React runtime.
 */

import type {
  DispatchAssignedEmailProps,
  DispatchStopLine,
} from '@/emails/carrier/dispatch-assigned';

/** Minimal shape of a stop needed to build an itinerary line. */
export interface RawDispatchStop {
  sequenceOrder: number;
  stopType: string;
  facility: { name: string; city: string | null } | null;
}

/** Minimal shape of an assigned load carrying its stops. */
export interface RawDispatchLoad {
  stops: RawDispatchStop[];
}

/**
 * Render an absolute instant (stored as UTC) in the tenant's local timezone,
 * including the zone abbreviation, e.g. "Jul 19, 2026, 8:00 AM CDT".
 *
 * The instant is NEVER mutated — only its presentation changes. Falls back to
 * UTC when no timezone is supplied.
 */
export function formatDispatchDateTime(
  instant: Date | string,
  timeZone: string | null | undefined
): string {
  const date = instant instanceof Date ? instant : new Date(instant);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timeZone || 'UTC',
    timeZoneName: 'short',
  });
}

/**
 * Flatten the stops across the assigned load(s) into a single ordered itinerary.
 *
 * Stops are ordered by their dispatch-wide sequenceOrder (which is unique per
 * dispatch: @@unique([dispatchId, sequenceOrder])), then re-numbered 1..N for
 * display so the email always reads cleanly regardless of raw sequence gaps.
 */
export function buildDispatchStops(loads: RawDispatchLoad[]): DispatchStopLine[] {
  return loads
    .flatMap((load) => load.stops)
    .slice()
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
    .map((stop, index) => ({
      sequence: index + 1,
      type: stop.stopType,
      facilityName: stop.facility?.name ?? 'Unknown facility',
      city: stop.facility?.city ?? null,
    }));
}

export interface BuildDispatchAssignedEmailInput {
  dispatchNumber: string;
  /** Absolute departure instant (UTC in DB), or null when unscheduled. */
  scheduledDeparture: Date | string | null;
  /** Tenant timezone for rendering (e.g. 'America/Chicago'). */
  timezone: string | null | undefined;
  /** Assigned load(s), each with their stops — the source of truth for stops. */
  loads: RawDispatchLoad[];
  truckUnitNumber: string;
  driverPortalUrl: string;
  companyName: string;
}

/**
 * Build the full DispatchAssignedEmail props from raw dispatch data.
 *
 * - Total stops are counted from the assigned load(s), not the trip relation.
 * - Scheduled departure is rendered in the tenant timezone with a zone label.
 */
export function buildDispatchAssignedEmailData(
  input: BuildDispatchAssignedEmailInput
): DispatchAssignedEmailProps {
  const stops = buildDispatchStops(input.loads);
  return {
    dispatchNumber: input.dispatchNumber,
    scheduledDeparture: input.scheduledDeparture
      ? formatDispatchDateTime(input.scheduledDeparture, input.timezone)
      : 'TBD',
    stopCount: stops.length,
    stops,
    truckUnitNumber: input.truckUnitNumber,
    driverPortalUrl: input.driverPortalUrl,
    companyName: input.companyName,
  };
}
