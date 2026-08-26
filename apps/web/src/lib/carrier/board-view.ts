/**
 * Phase 11 — projecting the one set of facts into the three surfaces.
 *
 * Pure. `loadBoardFacts` fetches once; this file turns that into the Drivers
 * view, the Trucks view and the Today's Trips report without touching the
 * database again. That is what makes the segmented toggle a state change rather
 * than a refetch, and it is why the three cannot disagree about a trip.
 *
 * ─── ONE ROW SHAPE, SWAPPED PRIMARY COLUMN ─────────────────────────────────
 *
 * `BoardRowData` is the same type for both views. The projection decides what
 * goes in `primary` and `secondary` — driver-first for one, truck-first for the
 * other — and fills `facts` with the per-view cells. The component renders
 * arrays and never asks which view it is in.
 *
 * That is deliberate and it is the phase's named drift risk: *"Two nearly
 * identical row components — exactly the duplication the architecture avoids."*
 * Putting the per-view difference in DATA rather than in a `variant` branch is
 * what makes a second row component impossible to add by accident, because
 * there is nothing for it to specialise.
 */

import { formatDateOnlyShort } from '@/lib/utils/date';
import {
  attentionRank,
  currentOrNextStop,
  deriveOnTime,
  deriveTripAttention,
  exceptionCount,
  minutesToWindowClose,
  stopProgress,
  type InspectionBadgeState,
  type OnTimeState,
  type TripAttention,
} from './board-status';
import { boardTrips, type BoardFacts, type BoardTripFact } from './board-lookup';

// ---------------------------------------------------------------------------
// Shapes crossing the wire
// ---------------------------------------------------------------------------

export type FactTone = 'default' | 'muted' | 'warning' | 'danger';

export interface BoardFact {
  label: string;
  value: string;
  tone?: FactTone;
}

export interface BoardIdentity {
  title: string;
  subtitle: string | null;
  /**
   * Set only on a driver identity, and only when one is on file.
   *
   * Carried as its own field rather than parsed back out of `subtitle` at the
   * render site: a phone number recovered by regex from a display string is a
   * phone number that breaks the first time somebody changes the subtitle.
   */
  phone?: string | null;
}

export interface BoardRowData {
  key: string;
  tripId: string | null;
  href: string | null;
  /** The swapped column. Driver in the Drivers view, truck in the Trucks view. */
  primary: BoardIdentity;
  /** The other one. */
  secondary: BoardIdentity | null;
  tripReference: string | null;
  tripStatus: string | null;
  facts: BoardFact[];
  inspection: InspectionBadgeState;
  onTime: OnTimeState;
  attention: TripAttention;
  attentionRank: number;
  /** ISO. `Timestamptz`, so local rendering at the edge is correct (quick-541). */
  lastPositionAt: string | null;
}

export interface LiveBoardPayload {
  drivers: BoardRowData[];
  trucks: BoardRowData[];
  /** ISO server clock the derivations used. */
  computedAt: string;
}

export interface TodaysTripRow {
  id: string;
  reference: string;
  clientName: string | null;
  driverName: string | null;
  driverId: string | null;
  truckLabel: string | null;
  status: string;
  /** ISO `Timestamptz`. */
  plannedStart: string;
  /** ISO `Timestamptz`, null until the driver starts. */
  actualStart: string | null;
  inspection: InspectionBadgeState;
  stopsCompleted: number;
  stopsTotal: number;
  onTime: OnTimeState;
  exceptionCount: number;
  currentLocation: string;
  attention: TripAttention;
  /** The default sort. Ascending puts problems first — see ATTENTION_RANK. */
  attentionRank: number;
}

// ---------------------------------------------------------------------------
// Shared derivations
// ---------------------------------------------------------------------------

export function truckLabel(truck: BoardTripFact['truck']): string {
  if (!truck) return 'No truck';
  return truck.unitNumber || truck.licensePlate || 'Truck';
}

function truckSubtitle(truck: BoardTripFact['truck']): string | null {
  if (!truck) return null;
  const parts = [truck.year ? String(truck.year) : null, truck.make, truck.model].filter(Boolean);
  return parts.length ? parts.join(' ') : (truck.licensePlate ?? null);
}

function facilityLabel(stop: BoardTripFact['stops'][number] | null): string | null {
  if (!stop?.facility) return null;
  const place = [stop.facility.city, stop.facility.state].filter(Boolean).join(', ');
  return place ? `${stop.facility.name} · ${place}` : stop.facility.name;
}

/**
 * Where this truck is, in words, from rows that actually exist.
 *
 * There is no reverse geocoder on this page and no column holding a place name,
 * so this never claims a street. It reports the trip's own stop state — which is
 * the fact a dispatcher wants anyway ("at Hall Ford" beats a lat/lng pair) — and
 * says `Unknown` rather than guessing. The GPS timestamp is reported separately
 * as its own fact, so freshness is never confused with position.
 */
export function describeLocation(trip: BoardTripFact): string {
  const next = currentOrNextStop(trip.stops);
  if (next) {
    const label = facilityLabel(next);
    if (!label) return 'Unknown';
    return next.status === 'arrived' ? `At ${label}` : `En route to ${label}`;
  }
  if (trip.status === 'completed') return 'Trip complete';
  if (trip.stops.length === 0) return 'No stops on this trip';
  return 'All stops done';
}

/** "4 / 12". */
export function progressLabel(trip: BoardTripFact): string {
  const p = stopProgress(trip.stops);
  return `${p.completed} / ${p.total}`;
}

/**
 * "in 45m" / "12m late" / null.
 *
 * A window, not a travel-time ETA — see `minutesToWindowClose`. The label says
 * "window" so nobody reads it as a routing promise.
 */
export function windowLabel(trip: BoardTripFact, now: Date): BoardFact {
  const next = currentOrNextStop(trip.stops);
  const mins = minutesToWindowClose(next, now);
  if (mins === null) {
    return { label: 'Window closes', value: 'No window set', tone: 'muted' };
  }
  if (mins < 0) {
    return { label: 'Window closes', value: `${Math.abs(mins)}m ago`, tone: 'danger' };
  }
  if (mins < 60) return { label: 'Window closes', value: `in ${mins}m`, tone: 'warning' };
  const hrs = Math.floor(mins / 60);
  return { label: 'Window closes', value: `in ${hrs}h ${mins % 60}m` };
}

function hoursLabel(minutes: number | null): BoardFact {
  if (minutes === null) {
    return { label: 'On duty today', value: 'Not logged', tone: 'muted' };
  }
  const h = Math.floor(minutes / 60);
  return { label: 'On duty today', value: `${h}h ${minutes % 60}m` };
}

function complianceFact(truck: BoardTripFact['truck']): BoardFact {
  const due = truck?.nextComplianceDue;
  if (!due) return { label: 'Next due', value: 'Nothing on file', tone: 'muted' };
  // `@db.Date` → `formatDateOnlyShort`, never `toLocaleDateString` (quick-541).
  return { label: due.label, value: formatDateOnlyShort(due.on) };
}

function commonShape(trip: BoardTripFact, now: Date) {
  const onTime = deriveOnTime(trip.status, trip.stops, now);
  const attention = deriveTripAttention({
    tripStatus: trip.status,
    inspection: trip.inspection,
    stops: trip.stops,
    now,
  });
  return {
    tripId: trip.id,
    href: `/carrier/trips/${trip.id}`,
    tripReference: trip.reference,
    tripStatus: trip.status,
    inspection: trip.inspection,
    onTime,
    attention,
    attentionRank: attentionRank(attention),
    lastPositionAt: trip.position?.reportedAt?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// The two views
// ---------------------------------------------------------------------------

/**
 * One row per on-duty driver.
 *
 * "On duty" here means "has a trip on today's board" — the board is a view of
 * trips, and a driver with no trip has nothing for it to show. A roster of
 * everyone employed is the Drivers page's job, and duplicating it here would put
 * a dozen empty rows above the three that matter.
 */
export function driversView(facts: BoardFacts): BoardRowData[] {
  const rows = boardTrips(facts)
    .filter((t) => t.driver !== null)
    .map((trip) => {
      const next = currentOrNextStop(trip.stops);
      return {
        key: `driver:${trip.driver!.id}:${trip.id}`,
        ...commonShape(trip, facts.now),
        primary: {
          title: trip.driver!.name,
          subtitle: trip.driver!.phone,
          phone: trip.driver!.phone,
        },
        secondary: { title: truckLabel(trip.truck), subtitle: truckSubtitle(trip.truck) },
        facts: [
          {
            label: 'Current or next stop',
            value: facilityLabel(next) ?? 'No stop outstanding',
            tone: next ? ('default' as FactTone) : ('muted' as FactTone),
          },
          { label: 'Stops', value: progressLabel(trip) },
          windowLabel(trip, facts.now),
        ],
      };
    });
  return sortByAttention(rows);
}

/**
 * One row per active truck.
 *
 * Same trips, truck-first. `status` is the truck's own stored status, not the
 * trip's — Section 13 lists both a trip column and a status column, and
 * `computeTruckDisplayStatus` is the existing single source of truth for what a
 * truck's status means, so this reports the raw stored value and lets the trip
 * column carry the trip.
 */
export function trucksView(facts: BoardFacts): BoardRowData[] {
  const rows = boardTrips(facts)
    .filter((t) => t.truck !== null)
    .map((trip) => ({
      key: `truck:${trip.truck!.id}:${trip.id}`,
      ...commonShape(trip, facts.now),
      primary: { title: truckLabel(trip.truck), subtitle: truckSubtitle(trip.truck) },
      secondary: trip.driver
        ? { title: trip.driver.name, subtitle: trip.driver.phone, phone: trip.driver.phone }
        : { title: 'Unassigned', subtitle: null },
      facts: [
        { label: 'Current location', value: describeLocation(trip) },
        hoursLabel(trip.onDutyMinutesToday),
        complianceFact(trip.truck),
      ],
    }));
  return sortByAttention(rows);
}

/**
 * Problems first on the board too, not only in the report.
 *
 * The spec only asks the report to sort this way, but a board that lists a
 * failed inspection below four healthy trips is a board an owner has to read
 * rather than glance at. Ties break on the trip reference so the order is
 * stable between polls — an unstable sort makes rows jump under the cursor
 * every fifteen seconds.
 */
function sortByAttention(rows: BoardRowData[]): BoardRowData[] {
  return [...rows].sort(
    (a, b) =>
      a.attentionRank - b.attentionRank ||
      (a.tripReference ?? '').localeCompare(b.tripReference ?? ''),
  );
}

export function liveBoardPayload(facts: BoardFacts): LiveBoardPayload {
  return {
    drivers: driversView(facts),
    trucks: trucksView(facts),
    computedAt: facts.now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// The report
// ---------------------------------------------------------------------------

/**
 * Today's Trips.
 *
 * Includes cancelled and TONU (ruling 2) — the report is a record of the day —
 * ranked CLOSED, after completed. The board excludes them via `boardTrips`;
 * this reads `facts.trips` directly.
 */
export function todaysTripsReport(facts: BoardFacts): TodaysTripRow[] {
  const rows = facts.trips.map((trip) => {
    const progress = stopProgress(trip.stops);
    const attention = deriveTripAttention({
      tripStatus: trip.status,
      inspection: trip.inspection,
      stops: trip.stops,
      now: facts.now,
    });
    return {
      id: trip.id,
      reference: trip.reference,
      clientName: trip.clientName,
      driverName: trip.driver?.name ?? null,
      driverId: trip.driver?.id ?? null,
      truckLabel: trip.truck ? truckLabel(trip.truck) : null,
      status: trip.status,
      plannedStart: trip.scheduledDeparture.toISOString(),
      actualStart: trip.actualDeparture?.toISOString() ?? null,
      inspection: trip.inspection,
      stopsCompleted: progress.completed,
      stopsTotal: progress.total,
      onTime: deriveOnTime(trip.status, trip.stops, facts.now),
      exceptionCount: exceptionCount({
        stops: trip.stops,
        inspectionFailureCount: trip.inspectionFailureCount,
        now: facts.now,
      }),
      currentLocation: describeLocation(trip),
      attention,
      attentionRank: attentionRank(attention),
    };
  });

  return rows.sort(
    (a, b) => a.attentionRank - b.attentionRank || a.reference.localeCompare(b.reference),
  );
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface ReportFilters {
  status?: string | null;
  driverId?: string | null;
  clientName?: string | null;
  inspection?: string | null;
}

/**
 * Section 13's four filters, applied to already-projected rows.
 *
 * Applied AFTER projection rather than in the `where` clause on purpose: the
 * report and the board share one fetch, so narrowing the query would narrow the
 * board too. Today's trips are tens of rows, not thousands — this is the cheap
 * direction, and it keeps "one data source" literally true.
 *
 * Every filter is independent and they compose, which is Phase 11 verify check
 * 3 ("each filter, then combined").
 */
export function applyReportFilters(rows: TodaysTripRow[], f: ReportFilters): TodaysTripRow[] {
  return rows.filter((r) => {
    if (f.status && r.status !== f.status) return false;
    if (f.driverId && r.driverId !== f.driverId) return false;
    if (f.clientName && (r.clientName ?? '') !== f.clientName) return false;
    if (f.inspection && r.inspection !== f.inspection) return false;
    return true;
  });
}

/** Distinct filter options, derived from the rows the owner can actually see. */
export function reportFilterOptions(rows: TodaysTripRow[]) {
  const statuses = [...new Set(rows.map((r) => r.status))].sort();
  const inspections = [...new Set(rows.map((r) => r.inspection))].sort();
  const drivers = [
    ...new Map(
      rows.filter((r) => r.driverId).map((r) => [r.driverId!, r.driverName ?? 'Driver']),
    ).entries(),
  ]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
  const clients = [...new Set(rows.map((r) => r.clientName).filter((c): c is string => !!c))].sort();
  return { statuses, inspections, drivers, clients };
}
