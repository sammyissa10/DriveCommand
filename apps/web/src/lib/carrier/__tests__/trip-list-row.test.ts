/**
 * quick-557 — the trips list rendered "Unassigned" and "—" for trips that had a
 * driver and a scheduled departure, because the client read `driverId` /
 * `scheduledDate` / `_count.loads` off a payload that carries
 * `primaryDriverId` / `scheduledDeparture` / `_count.carrierLoads`.
 *
 * Two guards here, and they catch different classes:
 *
 *  1. Row assertions — a realistic `listTrips()` item maps to a populated row.
 *  2. A SOURCE SCAN over `listTrips` and the two lanes of `/carrier/trips`,
 *     because a mapping test alone is blind to the query the rows come from
 *     (quick-549: "a test that calls the handler directly is structurally blind
 *     to the page that decides whether the handler is ever reached"). If the
 *     `_count` select loses `carrierLoads`, or a lane reintroduces its own
 *     legacy-shaped copy of the payload, only the scan fails.
 *
 * Per quick-546, every source-reading guard normalises line endings and carries
 * a "was it actually found" assertion plus a length floor — the failure mode of
 * a bad slice is green, not red.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toTripListRow, extractDispatchNumber, type TripListApiItem } from '../trip-list-row';

const WEB_SRC = join(__dirname, '..', '..', '..');

function readSource(relativePath: string): string {
  // CRLF in the working tree on Windows (core.autocrlf=true, no .gitattributes),
  // LF in the index — normalise or every assertion below is scanning a string
  // whose shape depends on the checkout.
  return readFileSync(join(WEB_SRC, relativePath), 'utf8').replace(/\r\n/g, '\n');
}

/** A row exactly as `listTrips()` serialises it. */
const API_ITEM: TripListApiItem = {
  id: 'a341c004-bb1c-4431-834f-ebe1f83486d7',
  primaryDriverId: '64f2b6f4-315e-4546-9fad-8f146baad5b8',
  primaryDriver: { firstName: 'SAMMY', lastName: 'ISSA' },
  truckId: '11111111-1111-1111-1111-111111111111',
  truck: { unitNumber: 'TX-1001' },
  scheduledDeparture: '2026-08-27T09:00:00.000Z',
  status: 'planned',
  notes: '[DISPATCH_NUMBER=DC-2026-00114] [AUTO-GENERATED]',
  _count: { stops: 4, carrierLoads: 2 },
};

describe('toTripListRow — the real payload maps to a populated row', () => {
  it('reads the driver and the date the API actually sends', () => {
    const row = toTripListRow(API_ITEM);

    expect(row.driverId).toBe('64f2b6f4-315e-4546-9fad-8f146baad5b8');
    expect(row.driverName).toBe('SAMMY ISSA');
    expect(row.scheduledDeparture).toBe('2026-08-27T09:00:00.000Z');
    expect(row.truckUnit).toBe('TX-1001');
    expect(row.loadCount).toBe(2);
    expect(row.stopCount).toBe(4);
    expect(row.dispatchNumber).toBe('DC-2026-00114');
  });

  it('renders nothing empty for a trip that has a driver and a date', () => {
    const row = toTripListRow(API_ITEM);

    // These two are precisely what the columns' "Unassigned" / "—" branches test.
    expect(row.driverId).not.toBeUndefined();
    expect(row.driverId).not.toBeNull();
    expect(row.scheduledDeparture).toBeTruthy();
    expect(Number.isNaN(new Date(row.scheduledDeparture).getTime())).toBe(false);
  });

  it('the LEGACY Route shape does NOT satisfy the mapping — this is the bug', () => {
    // What both lanes used to declare: `Route` columns, not `Trip` ones.
    const legacyShaped = {
      id: API_ITEM.id,
      driverId: '64f2b6f4-315e-4546-9fad-8f146baad5b8',
      truckId: API_ITEM.truckId,
      scheduledDate: '2026-08-27T09:00:00.000Z',
      status: 'planned',
      notes: API_ITEM.notes,
      _count: { loads: 2 },
    } as unknown as TripListApiItem;

    const row = toTripListRow(legacyShaped);

    expect(row.driverId).toBeNull();
    expect(row.driverName).toBeNull();
    expect(row.scheduledDeparture).toBeUndefined();
    expect(row.loadCount).toBe(0);
  });

  it('prefers the included relation over the active-only page maps', () => {
    // `TripsPage` builds driverMap from `status: 'active'` rows only, so a
    // deactivated driver is missing from it. The relation must still win.
    const row = toTripListRow(API_ITEM, { driverMap: {}, truckMap: {} });
    expect(row.driverName).toBe('SAMMY ISSA');
    expect(row.truckUnit).toBe('TX-1001');
  });

  it('falls back to the map when the relation was not included', () => {
    const row = toTripListRow(
      { ...API_ITEM, primaryDriver: null, truck: null },
      {
        driverMap: { '64f2b6f4-315e-4546-9fad-8f146baad5b8': 'Sammy Issa' },
        truckMap: { '11111111-1111-1111-1111-111111111111': 'TX-1001' },
      },
    );
    expect(row.driverName).toBe('Sammy Issa');
    expect(row.truckUnit).toBe('TX-1001');
  });

  it('a genuinely unassigned trip still reads as unassigned', () => {
    const row = toTripListRow({
      ...API_ITEM,
      primaryDriverId: null,
      primaryDriver: null,
      notes: null,
    });
    expect(row.driverId).toBeNull();
    expect(row.driverName).toBeNull();
    expect(row.dispatchNumber).toBeNull();
  });

  it('extractDispatchNumber tolerates a null/absent tag', () => {
    expect(extractDispatchNumber(null)).toBeNull();
    expect(extractDispatchNumber('no tag here')).toBeNull();
    expect(extractDispatchNumber('[DISPATCH_NUMBER=DC-1]')).toBe('DC-1');
  });
});

describe('source scan — the query still selects what the rows read', () => {
  it('listTrips includes the driver relation and counts carrierLoads', () => {
    const src = readSource(join('lib', 'carrier', 'trips.ts'));
    expect(src.length).toBeGreaterThan(1000); // slice-actually-read floor

    const start = src.indexOf('export async function listTrips');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n}\n', start));
    expect(body.length).toBeGreaterThan(500);

    expect(body).toContain('primaryDriver');
    expect(body).toContain('scheduledDeparture');
    // The "Loads" column reads this; without it every trip reports 0 loads.
    expect(body).toContain('carrierLoads: true');
    expect(body).toContain('stops: true');
  });

  it('neither lane of /carrier/trips reintroduces the legacy field names', () => {
    const lanes = [
      join('app', '(owner)', 'carrier', 'trips', '_grid', 'DispatchesGrid.tsx'),
      join('app', '(owner)', 'carrier', 'trips', 'TripsMobile.tsx'),
    ];

    for (const lane of lanes) {
      const src = readSource(lane);
      expect(src.length).toBeGreaterThan(1000);

      // Both lanes must go through the one shared mapper…
      expect(src).toContain('toTripListRow');
      // …and must not read the legacy `Route` names off the Trip payload.
      // (Comments naming them are fine — strip comment lines first.)
      const code = src
        .split('\n')
        .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
        .join('\n');
      expect(code).not.toMatch(/\.scheduledDate\b/);
      expect(code).not.toMatch(/\bit\.driverId\b|\bitem\.driverId\b/);
      expect(code).not.toMatch(/_count\??\.\s*loads\b/);
    }
  });
});
