/**
 * The one place the `GET /api/v1/carrier/dispatches` list payload is written down.
 *
 * quick-557 — both lanes of `/carrier/trips` (the desktop `DispatchesGrid` and
 * the mobile-web `TripsMobile`) each carried their own copy of this shape, and
 * both copies described the LEGACY `Route` model instead of the carrier `Trip`
 * the endpoint actually serves: `driverId` instead of `primaryDriverId`,
 * `scheduledDate` instead of `scheduledDeparture`, `_count.loads` instead of
 * `_count.carrierLoads`. Reading a name the payload does not carry yields
 * `undefined`, and `undefined` is exactly what the Driver column's "Unassigned"
 * branch and the Date column's "—" branch are written to display — so a
 * fully-populated database rendered as missing data.
 *
 * The vocabulary here is the API's, not the legacy model's, so the two cannot
 * silently drift apart again: a field renamed on `listTrips` is a type error
 * here rather than an `undefined` on screen.
 *
 * Source of truth: `listTrips()` in `lib/carrier/trips.ts`.
 */

/** A carrier `Trip` row exactly as `listTrips()` serialises it over JSON. */
export interface TripListApiItem {
  id: string;
  primaryDriverId: string | null;
  primaryDriver?: { firstName: string; lastName: string } | null;
  truckId: string | null;
  truck?: { unitNumber: string } | null;
  scheduledDeparture: string;
  status: string;
  notes: string | null;
  _count?: { stops?: number; carrierLoads?: number };
}

/** The shape both trip lists render from. */
export interface TripListRow {
  id: string;
  dispatchNumber: string | null;
  driverId: string | null;
  driverName: string | null;
  truckId: string | null;
  truckUnit: string | null;
  scheduledDeparture: string;
  status: string;
  loadCount: number;
  stopCount: number;
  notes: string | null;
}

/** Trip numbers live in `notes` as a `[DISPATCH_NUMBER=…]` tag. */
export function extractDispatchNumber(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : null;
}

export interface TripListLookups {
  /** carrierDriver id → "First Last". Active drivers only — see below. */
  driverMap?: Record<string, string>;
  /** carrierTruck id → unit number. Active trucks only — see below. */
  truckMap?: Record<string, string>;
}

/**
 * Name resolution order is deliberate: the relation the query already
 * **included** wins, and the page's map is only a fallback.
 *
 * `TripsPage` builds `driverMap` / `truckMap` from `status: 'active'` rows, so a
 * trip assigned to a since-deactivated driver is absent from the map — and a map
 * lookup alone would render it "Unassigned", which is the same false statement
 * this task exists to remove, just from a different cause. The included relation
 * has no such filter.
 */
export function toTripListRow(
  item: TripListApiItem,
  { driverMap, truckMap }: TripListLookups = {},
): TripListRow {
  const driverId = item.primaryDriverId ?? null;
  const truckId = item.truckId ?? null;

  const driverName = item.primaryDriver
    ? `${item.primaryDriver.firstName} ${item.primaryDriver.lastName}`.trim()
    : driverId
      ? (driverMap?.[driverId] ?? null)
      : null;

  const truckUnit = item.truck?.unitNumber ?? (truckId ? (truckMap?.[truckId] ?? null) : null);

  return {
    id: item.id,
    dispatchNumber: extractDispatchNumber(item.notes),
    driverId,
    driverName,
    truckId,
    truckUnit,
    scheduledDeparture: item.scheduledDeparture,
    status: item.status,
    loadCount: item._count?.carrierLoads ?? 0,
    stopCount: item._count?.stops ?? 0,
    notes: item.notes,
  };
}
