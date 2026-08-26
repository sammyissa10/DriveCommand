/**
 * Phase 11 — the projections.
 *
 * The property worth pinning is the one the phase names as its likely drift:
 * both views come out of ONE fetch, with the same row shape and a swapped
 * primary column. A test that builds `BoardFacts` once and asserts both views
 * against it is what makes a second data source or a second row shape show up
 * as a failure rather than as a code review someone has to notice.
 */

import { describe, expect, it } from 'vitest';
import { inspectionBadge, nextComplianceDue, type BoardFacts, type BoardTripFact } from '../board-lookup';
import {
  applyReportFilters,
  describeLocation,
  driversView,
  liveBoardPayload,
  reportFilterOptions,
  todaysTripsReport,
  trucksView,
} from '../board-view';

const NOW = new Date('2026-08-26T15:00:00.000Z');
const PAST = new Date('2026-08-26T12:00:00.000Z');
const FUTURE = new Date('2026-08-26T18:00:00.000Z');

function trip(over: Partial<BoardTripFact> = {}): BoardTripFact {
  return {
    id: over.id ?? 't1',
    reference: over.reference ?? 'TRIP-001',
    status: over.status ?? 'in_progress',
    scheduledDeparture: over.scheduledDeparture ?? PAST,
    actualDeparture: over.actualDeparture ?? PAST,
    clientName: over.clientName ?? 'Hall Ford',
    driver: over.driver !== undefined
      ? over.driver
      : { id: 'd1', userId: 'u1', name: 'Mike R', phone: '555-0100' },
    truck: over.truck !== undefined
      ? over.truck
      : {
          id: 'tr1',
          unitNumber: 'T-104',
          licensePlate: 'ABC123',
          make: 'Volvo',
          model: 'VNL',
          year: 2022,
          status: 'active',
          nextComplianceDue: null,
        },
    stops: over.stops ?? [],
    inspection: over.inspection ?? 'PASSED',
    inspectionFailureCount: over.inspectionFailureCount ?? 0,
    position: over.position ?? { latitude: 43, longitude: -88, speed: 55, reportedAt: NOW },
    onDutyMinutesToday: over.onDutyMinutesToday ?? 185,
  };
}

function facts(trips: BoardTripFact[]): BoardFacts {
  return { trips, now: NOW };
}

describe('one fetch, two views', () => {
  const f = facts([trip()]);

  it('produces both views from the same facts with no second source', () => {
    const payload = liveBoardPayload(f);
    expect(payload.drivers).toHaveLength(1);
    expect(payload.trucks).toHaveLength(1);
    expect(payload.computedAt).toBe(NOW.toISOString());
  });

  it('swaps the primary column and nothing else about the shape', () => {
    const [d] = driversView(f);
    const [t] = trucksView(f);

    expect(d.primary.title).toBe('Mike R');
    expect(d.secondary?.title).toBe('T-104');
    expect(t.primary.title).toBe('T-104');
    expect(t.secondary?.title).toBe('Mike R');

    // Identical shape — the views differ in DATA, not in type.
    expect(Object.keys(d).sort()).toEqual(Object.keys(t).sort());
  });

  it('carries the driver phone as its own field on whichever side is the driver', () => {
    expect(driversView(f)[0].primary.phone).toBe('555-0100');
    expect(trucksView(f)[0].secondary?.phone).toBe('555-0100');
  });

  it('gives each view its own facts, three cells each', () => {
    expect(driversView(f)[0].facts.map((x) => x.label)).toEqual([
      'Current or next stop',
      'Stops',
      'Window closes',
    ]);
    expect(trucksView(f)[0].facts.map((x) => x.label)).toEqual([
      'Current location',
      'On duty today',
      'Next due',
    ]);
  });
});

describe('the live board excludes cancelled and TONU (ruling 2)', () => {
  const f = facts([
    trip({ id: 'a', reference: 'A', status: 'in_progress' }),
    trip({ id: 'b', reference: 'B', status: 'cancelled' }),
    trip({ id: 'c', reference: 'C', status: 'tonu' }),
  ]);

  it('drops them from both views', () => {
    expect(driversView(f).map((r) => r.tripReference)).toEqual(['A']);
    expect(trucksView(f).map((r) => r.tripReference)).toEqual(['A']);
  });

  it('keeps them in the report, ranked last', () => {
    const rows = todaysTripsReport(f);
    expect(rows).toHaveLength(3);
    expect(rows[rows.length - 1].attention).toBe('CLOSED');
    expect(rows[0].reference).toBe('A');
  });
});

describe('report ordering', () => {
  it('puts a failed inspection at the top and completed above closed', () => {
    const rows = todaysTripsReport(
      facts([
        trip({ id: '1', reference: 'DONE', status: 'completed', inspection: 'PASSED' }),
        trip({ id: '2', reference: 'CANX', status: 'cancelled' }),
        trip({ id: '3', reference: 'BLOCKED', status: 'planned', inspection: 'FAILED' }),
        trip({ id: '4', reference: 'PLANNED', status: 'planned', inspection: 'PASSED' }),
      ]),
    );
    expect(rows.map((r) => r.reference)).toEqual(['BLOCKED', 'PLANNED', 'DONE', 'CANX']);
  });

  it('breaks ties on the reference so polling does not reshuffle rows', () => {
    const rows = todaysTripsReport(
      facts([
        trip({ id: '1', reference: 'ZZZ', status: 'planned' }),
        trip({ id: '2', reference: 'AAA', status: 'planned' }),
      ]),
    );
    expect(rows.map((r) => r.reference)).toEqual(['AAA', 'ZZZ']);
  });
});

describe('describeLocation never invents a place', () => {
  const facility = { id: 'f1', name: 'Boucher', city: 'Milwaukee', state: 'WI' };

  it('says where the driver is when they have arrived', () => {
    const t = trip({
      stops: [
        { id: 's1', sequenceOrder: 1, status: 'arrived', appointmentEnd: null, arrivedAt: NOW, facility, stopType: 'delivery' },
      ],
    });
    expect(describeLocation(t)).toBe('At Boucher · Milwaukee, WI');
  });

  it('says where they are heading when they have not', () => {
    const t = trip({
      stops: [
        { id: 's1', sequenceOrder: 1, status: 'pending', appointmentEnd: FUTURE, arrivedAt: null, facility, stopType: 'delivery' },
      ],
    });
    expect(describeLocation(t)).toBe('En route to Boucher · Milwaukee, WI');
  });

  it('says Unknown rather than guessing when the facility was masked away', () => {
    const t = trip({
      stops: [
        { id: 's1', sequenceOrder: 1, status: 'pending', appointmentEnd: null, arrivedAt: null, facility: null, stopType: 'layover' },
      ],
    });
    expect(describeLocation(t)).toBe('Unknown');
  });

  it('handles a trip with no stops at all without crashing', () => {
    expect(describeLocation(trip({ stops: [] }))).toBe('No stops on this trip');
  });
});

describe('the window cell', () => {
  it('says no window is set rather than showing a false countdown', () => {
    const [row] = driversView(facts([trip({ stops: [] })]));
    const cell = row.facts.find((f) => f.label === 'Window closes')!;
    expect(cell.value).toBe('No window set');
    expect(cell.tone).toBe('muted');
  });

  it('marks an elapsed window as danger', () => {
    const [row] = driversView(
      facts([
        trip({
          stops: [
            { id: 's1', sequenceOrder: 1, status: 'pending', appointmentEnd: PAST, arrivedAt: null, facility: null, stopType: 'delivery' },
          ],
        }),
      ]),
    );
    const cell = row.facts.find((f) => f.label === 'Window closes')!;
    expect(cell.value).toBe('180m ago');
    expect(cell.tone).toBe('danger');
  });
});

describe('filters compose', () => {
  const rows = todaysTripsReport(
    facts([
      trip({ id: '1', reference: 'A', status: 'planned', inspection: 'FAILED', clientName: 'Hall Ford', driver: { id: 'd1', userId: 'u1', name: 'Mike R', phone: null } }),
      trip({ id: '2', reference: 'B', status: 'planned', inspection: 'PASSED', clientName: 'Hall Ford', driver: { id: 'd2', userId: 'u2', name: 'Dana P', phone: null } }),
      trip({ id: '3', reference: 'C', status: 'completed', inspection: 'PASSED', clientName: 'Boucher', driver: { id: 'd1', userId: 'u1', name: 'Mike R', phone: null } }),
    ]),
  );

  it('applies each filter alone', () => {
    expect(applyReportFilters(rows, { status: 'planned' }).map((r) => r.reference)).toEqual(['A', 'B']);
    expect(applyReportFilters(rows, { driverId: 'd1' }).map((r) => r.reference)).toEqual(['A', 'C']);
    expect(applyReportFilters(rows, { clientName: 'Boucher' }).map((r) => r.reference)).toEqual(['C']);
    expect(applyReportFilters(rows, { inspection: 'FAILED' }).map((r) => r.reference)).toEqual(['A']);
  });

  it('applies them combined', () => {
    expect(
      applyReportFilters(rows, { status: 'planned', driverId: 'd1' }).map((r) => r.reference),
    ).toEqual(['A']);
    expect(
      applyReportFilters(rows, { status: 'completed', driverId: 'd2' }),
    ).toHaveLength(0);
  });

  it('offers only values that exist in the day', () => {
    const options = reportFilterOptions(rows);
    expect(options.statuses).toEqual(['completed', 'planned']);
    expect(options.clients).toEqual(['Boucher', 'Hall Ford']);
    expect(options.drivers.map((d) => d.name)).toEqual(['Dana P', 'Mike R']);
  });
});

describe('inspectionBadge', () => {
  it('reports NOT_REQUIRED when the tenant does not require one', () => {
    expect(inspectionBadge({ required: false, overriddenAt: null, steps: null }).state).toBe(
      'NOT_REQUIRED',
    );
  });

  it('lets an override outrank the step outcomes, as the gate does', () => {
    expect(
      inspectionBadge({
        required: true,
        overriddenAt: NOW,
        steps: [{ status: 'FAILED', isCritical: true }],
      }).state,
    ).toBe('OVERRIDDEN');
  });

  it('distinguishes a critical failure from logged defects', () => {
    expect(
      inspectionBadge({
        required: true,
        overriddenAt: null,
        steps: [{ status: 'FAILED', isCritical: true }, { status: 'COMPLETE', isCritical: false }],
      }).state,
    ).toBe('FAILED');
    expect(
      inspectionBadge({
        required: true,
        overriddenAt: null,
        steps: [{ status: 'FAILED', isCritical: false }, { status: 'COMPLETE', isCritical: true }],
      }).state,
    ).toBe('PASSED_WITH_DEFECTS');
  });

  it('counts SKIPPED (N/A) as answered, matching the gate', () => {
    expect(
      inspectionBadge({
        required: true,
        overriddenAt: null,
        steps: [{ status: 'SKIPPED', isCritical: true }, { status: 'COMPLETE', isCritical: true }],
      }).state,
    ).toBe('PASSED');
  });

  it('separates not-started from part-answered', () => {
    expect(
      inspectionBadge({
        required: true,
        overriddenAt: null,
        steps: [{ status: 'NOT_STARTED', isCritical: true }],
      }).state,
    ).toBe('NOT_STARTED');
    expect(
      inspectionBadge({
        required: true,
        overriddenAt: null,
        steps: [{ status: 'COMPLETE', isCritical: true }, { status: 'NOT_STARTED', isCritical: true }],
      }).state,
    ).toBe('IN_PROGRESS');
  });
});

describe('nextComplianceDue', () => {
  it('picks the soonest of the three dates the carrier truck actually has', () => {
    expect(
      nextComplianceDue({
        licenseExpiry: new Date('2027-01-01'),
        registrationExpiry: new Date('2026-09-01'),
        insuranceExpiry: new Date('2026-12-01'),
      }),
    ).toEqual({ label: 'Registration due', on: new Date('2026-09-01') });
  });

  it('says nothing rather than something when none are on file', () => {
    expect(
      nextComplianceDue({ licenseExpiry: null, registrationExpiry: null, insuranceExpiry: null }),
    ).toBeNull();
  });
});

describe('empty day', () => {
  it('produces empty views and an empty report without throwing', () => {
    const f = facts([]);
    expect(driversView(f)).toEqual([]);
    expect(trucksView(f)).toEqual([]);
    expect(todaysTripsReport(f)).toEqual([]);
    expect(reportFilterOptions([])).toEqual({
      statuses: [],
      inspections: [],
      drivers: [],
      clients: [],
    });
  });

  it('drops a trip with no driver from the Drivers view and no truck from Trucks', () => {
    const f = facts([
      trip({ id: 'a', reference: 'A', driver: null }),
      trip({ id: 'b', reference: 'B', truck: null }),
    ]);
    expect(driversView(f).map((r) => r.tripReference)).toEqual(['B']);
    expect(trucksView(f).map((r) => r.tripReference)).toEqual(['A']);
  });
});
