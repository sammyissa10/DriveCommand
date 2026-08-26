/**
 * Phase 11 — reading the board. No writes in this file.
 *
 * ─── ONE DATA SOURCE ────────────────────────────────────────────────────────
 *
 * Section 13: *"Both views share ONE data source and ONE row component with a
 * swapped primary column."* `loadBoardFacts` is that source. The Drivers view,
 * the Trucks view and Today's Trips report are three projections of one fetch,
 * so the segmented toggle changes no network state at all (Phase 11 verify
 * check 1 is "toggle views, network tab open → no refetch"), and the three
 * surfaces cannot disagree about a trip.
 *
 * ─── WHY THIS IS NEW CODE AND NOT `getLatestVehicleLocations` ───────────────
 *
 * The existing live map reads the LEGACY models — `"Truck"`, `"Route"`,
 * `"Load"`, `"User"` — and knows nothing about `dispatches`, `stops`,
 * `carrier_drivers` or `carrier_trucks`. Everything Document Import commits,
 * and everything the Phase 9 inspection gate guards, lives in the carrier
 * tables. A board built on the legacy source could not show a trip this module
 * created. Same trap as `/api/v1/carrier/live-map/trips`, which is named
 * "carrier" and queries `db.route`.
 *
 * ─── DRIVER RESIDENCE ───────────────────────────────────────────────────────
 *
 * The board names a trip's current or next stop, and that stop can be a
 * DRIVER_RESIDENCE end stop. This is therefore a Section 9 facility read site
 * and it MASKS rather than filters — dropping the row would delete the end stop
 * and make the day look like it finishes at the last delivery. See
 * `facility-visibility.ts` for why those are two mechanisms.
 */

import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import { computeHOSClocks, type RawHOSEntry } from '@/lib/hos/compute-hos-clocks';
import { INSPECTION_ITEM_STEP_TYPE } from './inspection-coverage';
import { TRIP_INSPECTION_ENTITY_TYPE } from './inspection-constants';
import { maskFacilityForViewer, type FacilityViewer } from './facility-visibility';
import { isBoardExcludedTrip, type BoardStop, type InspectionBadgeState } from './board-status';

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export interface BoardFacilityRef {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

export interface BoardStopFact extends BoardStop {
  stopType: string;
  facility: BoardFacilityRef | null;
}

export interface BoardDriverFact {
  id: string;
  userId: string | null;
  name: string;
  phone: string | null;
}

export interface BoardTruckFact {
  id: string;
  unitNumber: string;
  licensePlate: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string;
  /** Nearest of licence / registration / insurance expiry — see `nextComplianceDue`. */
  nextComplianceDue: { label: string; on: Date } | null;
}

export interface BoardPositionFact {
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  reportedAt: Date | null;
}

export interface BoardTripFact {
  id: string;
  reference: string;
  status: string;
  scheduledDeparture: Date;
  actualDeparture: Date | null;
  clientName: string | null;
  driver: BoardDriverFact | null;
  truck: BoardTruckFact | null;
  stops: BoardStopFact[];
  inspection: InspectionBadgeState;
  inspectionFailureCount: number;
  position: BoardPositionFact | null;
  /** On-duty minutes today for this trip's driver, or null when nothing is logged. */
  onDutyMinutesToday: number | null;
}

export interface BoardFacts {
  trips: BoardTripFact[];
  /** Server clock at fetch time. Every derivation uses this, never `Date.now()`. */
  now: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DISPATCH_NUMBER_RE = /\[DISPATCH_NUMBER=([^\]]+)\]/;

function tripReference(id: string, notes: string | null): string {
  const matched = notes ? DISPATCH_NUMBER_RE.exec(notes)?.[1] : null;
  return matched ?? `Trip ${id.slice(0, 8)}`;
}

/**
 * Local-midnight bounds for "today", from the server's clock.
 *
 * Used for TRIP selection, where the owner's question is "what is running
 * today" and the answer should turn over at their midnight, not at UTC's.
 */
export function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

/**
 * UTC-midnight bounds, for HOS only.
 *
 * `computeHOSClocks` clamps its own totals with `setUTCHours`, and
 * `fleet-drivers.ts` already queries the entries with the matching UTC window.
 * The board must hand that function the same set the Drivers page does or the
 * same driver reads different hours on two screens.
 */
export function utcDayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setUTCHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * The nearest of a truck's three expiry dates.
 *
 * Section 13 asks the Trucks view for "next scheduled maintenance", and
 * **`CarrierTruck` has no maintenance relation** — `MaintenanceEvent` and
 * `ScheduledService` both hang off the LEGACY `Truck`, verified in
 * `schema.prisma` rather than assumed from the sibling's existence. Rather than
 * render an always-empty column or invent a table nobody asked for, the column
 * shows the nearest compliance date the carrier truck really carries, and is
 * LABELLED for what it is ("Registration due", not "Maintenance"). The gap is
 * reported in 11-SUMMARY.md rather than papered over.
 *
 * All three are `@db.Date`, so they are calendar dates and must never be
 * rendered with `toLocaleDateString` — quick-541. The Date object is passed
 * through untouched and formatted by `formatDateOnlyShort` at the edge.
 */
export function nextComplianceDue(truck: {
  licenseExpiry: Date | null;
  registrationExpiry: Date | null;
  insuranceExpiry: Date | null;
}): { label: string; on: Date } | null {
  const candidates: { label: string; on: Date }[] = [];
  if (truck.licenseExpiry) candidates.push({ label: 'Licence due', on: truck.licenseExpiry });
  if (truck.registrationExpiry)
    candidates.push({ label: 'Registration due', on: truck.registrationExpiry });
  if (truck.insuranceExpiry) candidates.push({ label: 'Insurance due', on: truck.insuranceExpiry });
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => a.on.getTime() - b.on.getTime())[0];
}

/**
 * One trip's inspection badge, from step rows already fetched in bulk.
 *
 * Deliberately NOT `evaluateTripStartGate`: that function needs a per-trip
 * snapshot plus a prior-inspection lookup, which is two queries per row and
 * would make a 40-trip board 80 round trips. It reuses the same VOCABULARY and
 * the same source of truth (`isDispatchBlocker` off `stepSnapshot`, `FAILED`
 * off live `StepStatus`), so the badge and the gate cannot describe the same
 * checklist differently.
 *
 * `OVERRIDDEN` outranks the step outcomes for the same reason the gate puts
 * OWNER_OVERRIDE above the inspection result: an override is a decision a human
 * made about this trip, and it is the answer.
 */
export function inspectionBadge(args: {
  required: boolean;
  overriddenAt: Date | null;
  steps: { status: string; isCritical: boolean }[] | null;
}): { state: InspectionBadgeState; failureCount: number } {
  const { required, overriddenAt, steps } = args;
  if (overriddenAt) return { state: 'OVERRIDDEN', failureCount: 0 };
  if (!required) return { state: 'NOT_REQUIRED', failureCount: 0 };
  if (!steps || steps.length === 0) return { state: 'NOT_STARTED', failureCount: 0 };

  const failures = steps.filter((s) => s.status === 'FAILED');
  const unanswered = steps.filter(
    (s) => s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS',
  );

  if (failures.some((f) => f.isCritical))
    return { state: 'FAILED', failureCount: failures.length };
  if (unanswered.length === steps.length) return { state: 'NOT_STARTED', failureCount: 0 };
  if (unanswered.length > 0) return { state: 'IN_PROGRESS', failureCount: failures.length };
  if (failures.length > 0)
    return { state: 'PASSED_WITH_DEFECTS', failureCount: failures.length };
  return { state: 'PASSED', failureCount: 0 };
}

// ---------------------------------------------------------------------------
// The fetch
// ---------------------------------------------------------------------------

interface StepSnapshotShape {
  stepType?: string;
  isDispatchBlocker?: boolean;
}

/**
 * Every trip that belongs to today's board, with everything three surfaces need.
 *
 * "Today" is: scheduled to depart today, OR currently `in_progress` whatever day
 * it started. The second clause is not padding — a multi-day run that departed
 * yesterday is exactly the trip an owner most needs on the board, and a naive
 * `scheduled_departure = today` drops it.
 */
export async function loadBoardFacts(
  orgId: string,
  viewer: FacilityViewer,
  now: Date = new Date(),
): Promise<BoardFacts> {
  const db = await getTenantPrismaForOrg(orgId);
  const { start, end } = dayBounds(now);
  const { start: utcStart, end: utcEnd } = utcDayBounds(now);

  const trips = await db.trip.findMany({
    where: {
      orgId,
      deletedAt: null,
      OR: [{ scheduledDeparture: { gte: start, lt: end } }, { status: 'in_progress' }],
    },
    orderBy: { scheduledDeparture: 'asc' },
    select: {
      id: true,
      notes: true,
      status: true,
      scheduledDeparture: true,
      actualDeparture: true,
      inspectionRequired: true,
      inspectionOverriddenAt: true,
      primaryDriver: {
        select: { id: true, userId: true, firstName: true, lastName: true, phone: true },
      },
      truck: {
        select: {
          id: true,
          unitNumber: true,
          licensePlate: true,
          make: true,
          model: true,
          year: true,
          status: true,
          licenseExpiry: true,
          registrationExpiry: true,
          insuranceExpiry: true,
        },
      },
      carrierLoads: {
        where: { deletedAt: null },
        select: { client: { select: { name: true } } },
        take: 1,
      },
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        select: {
          id: true,
          sequenceOrder: true,
          stopType: true,
          status: true,
          appointmentEnd: true,
          arrivedAt: true,
          facility: {
            select: {
              id: true,
              name: true,
              city: true,
              state: true,
              isDriverResidence: true,
              residentDriverId: true,
            },
          },
        },
      },
    },
  });

  if (trips.length === 0) return { trips: [], now };

  const tripIds = trips.map((t) => t.id);
  const truckIds = [...new Set(trips.map((t) => t.truck?.id).filter((v): v is string => !!v))];
  const driverUserIds = [
    ...new Set(trips.map((t) => t.primaryDriver?.userId).filter((v): v is string => !!v)),
  ];

  const tenantSettings = await db.tenant.findUnique({
    where: { id: orgId },
    select: { requirePreTripInspection: true },
  });
  const tenantRequiresInspection = tenantSettings?.requirePreTripInspection ?? false;

  const [instances, positions, hosEntries] = await Promise.all([
    db.playbookInstance.findMany({
      where: {
        tenantId: orgId,
        entityType: TRIP_INSPECTION_ENTITY_TYPE,
        entityId: { in: tripIds },
        playbook: { category: 'VEHICLE_INSPECTION', deletedAt: null },
      },
      orderBy: { createdAt: 'desc' },
      select: {
        entityId: true,
        stepInstances: {
          where: { deletedAt: null },
          select: { status: true, stepSnapshot: true },
        },
      },
    }),
    truckIds.length
      ? db.gPSLocation.findMany({
          where: { carrierTruckId: { in: truckIds } },
          orderBy: { timestamp: 'desc' },
          select: {
            carrierTruckId: true,
            latitude: true,
            longitude: true,
            speed: true,
            timestamp: true,
          },
        })
      : Promise.resolve([]),
    driverUserIds.length
      ? db.driverHOSEntry.findMany({
          // UTC day bounds + any open overnight entry. This is deliberately the
          // SAME window `fleet-drivers.ts` already queries, because
          // `computeHOSClocks` clamps its own totals to the UTC day: filtering
          // by LOCAL midnight here would hand it a different set from the one
          // the Drivers page hands it, and the same driver would show different
          // hours on two screens. Two conventions for one day boundary is the
          // quick-541 defect class.
          where: {
            tenantId: orgId,
            driverId: { in: driverUserIds },
            OR: [{ startTime: { gte: utcStart, lte: utcEnd } }, { endTime: null }],
          },
          orderBy: { startTime: 'asc' },
          select: { driverId: true, status: true, startTime: true, endTime: true },
        })
      : Promise.resolve([]),
  ]);

  // Newest instance per trip wins — the query is already ordered desc.
  const instanceByTrip = new Map<string, (typeof instances)[number]>();
  for (const i of instances) if (!instanceByTrip.has(i.entityId)) instanceByTrip.set(i.entityId, i);

  // Newest position per truck wins — likewise.
  const positionByTruck = new Map<string, BoardPositionFact>();
  for (const p of positions) {
    if (!p.carrierTruckId || positionByTruck.has(p.carrierTruckId)) continue;
    positionByTruck.set(p.carrierTruckId, {
      latitude: p.latitude != null ? Number(p.latitude) : null,
      longitude: p.longitude != null ? Number(p.longitude) : null,
      speed: p.speed != null ? Number(p.speed) : null,
      reportedAt: p.timestamp ?? null,
    });
  }

  const hosByUser = new Map<string, RawHOSEntry[]>();
  for (const e of hosEntries) {
    const list = hosByUser.get(e.driverId) ?? [];
    list.push({ status: e.status, startTime: e.startTime, endTime: e.endTime } as RawHOSEntry);
    hosByUser.set(e.driverId, list);
  }

  const factRows: BoardTripFact[] = trips.map((t) => {
    const instance = instanceByTrip.get(t.id) ?? null;
    const steps =
      instance?.stepInstances
        .map((s) => {
          const snap = (s.stepSnapshot ?? {}) as StepSnapshotShape;
          return {
            status: s.status as string,
            stepType: snap.stepType,
            isCritical: snap.isDispatchBlocker === true,
          };
        })
        // Only INSPECTION_ITEM steps are inspection outcomes — the starter
        // playbook's SIGNATURE step is `isDispatchBlocker` too, and counting it
        // would report an unsigned checklist as an unanswered item.
        .filter((s) => s.stepType === INSPECTION_ITEM_STEP_TYPE) ?? null;

    // `Trip.inspectionRequired` is a per-trip override; null means "fall back to
    // the tenant setting".
    const required = t.inspectionRequired ?? tenantRequiresInspection;
    const badge = inspectionBadge({
      required,
      overriddenAt: t.inspectionOverriddenAt,
      steps,
    });

    const hos = t.primaryDriver?.userId ? hosByUser.get(t.primaryDriver.userId) : undefined;

    return {
      id: t.id,
      reference: tripReference(t.id, t.notes),
      status: t.status,
      scheduledDeparture: t.scheduledDeparture,
      actualDeparture: t.actualDeparture,
      clientName: t.carrierLoads[0]?.client?.name ?? null,
      driver: t.primaryDriver
        ? {
            id: t.primaryDriver.id,
            userId: t.primaryDriver.userId,
            name: `${t.primaryDriver.firstName} ${t.primaryDriver.lastName}`.trim(),
            phone: t.primaryDriver.phone,
          }
        : null,
      truck: t.truck
        ? {
            id: t.truck.id,
            unitNumber: t.truck.unitNumber,
            licensePlate: t.truck.licensePlate,
            make: t.truck.make,
            model: t.truck.model,
            year: t.truck.year,
            status: t.truck.status,
            nextComplianceDue: nextComplianceDue(t.truck),
          }
        : null,
      stops: t.stops.map((s) => {
        // Section 9 read site. Mask, never filter — see the file header.
        const masked = s.facility ? maskFacilityForViewer(s.facility, viewer) : null;
        return {
          id: s.id,
          sequenceOrder: s.sequenceOrder,
          stopType: s.stopType,
          status: s.status,
          appointmentEnd: s.appointmentEnd,
          arrivedAt: s.arrivedAt,
          facility: masked
            ? { id: masked.id, name: masked.name, city: masked.city, state: masked.state }
            : null,
        };
      }),
      inspection: badge.state,
      inspectionFailureCount: badge.failureCount,
      position: t.truck ? (positionByTruck.get(t.truck.id) ?? null) : null,
      onDutyMinutesToday: hos?.length ? computeHOSClocks(hos, now).onDutyMinutesToday : null,
    };
  });

  return { trips: factRows, now };
}

/**
 * The same facts, minus the trips the live board excludes (ruling 2).
 *
 * Cancelled and TONU trips are dropped HERE rather than in each view, so the
 * two views cannot drift about it and the report — which wants them, ranked
 * last — simply does not call this.
 */
export function boardTrips(facts: BoardFacts): BoardTripFact[] {
  return facts.trips.filter((t) => !isBoardExcludedTrip(t.status));
}

/** Non-throwing wrapper for surfaces that must render something on failure. */
export async function tryLoadBoardFacts(
  orgId: string,
  viewer: FacilityViewer,
  now: Date = new Date(),
): Promise<{ facts: BoardFacts | null; error: string | null }> {
  try {
    return { facts: await loadBoardFacts(orgId, viewer, now), error: null };
  } catch (err) {
    // `logger.error(message, error, context)` — the error goes SECOND. Passing
    // a context object there collapses it to `new Error('[object Object]')` and
    // tells Sentry nothing.
    logger.error('loadBoardFacts failed', err, { orgId, error: serializeError(err) });
    return { facts: null, error: 'We could not load the board.' };
  }
}
