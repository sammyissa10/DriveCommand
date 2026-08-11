/**
 * The template rung of `DESIGNATED_PARKING` (quick-520, spec Section 9).
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE PIN
 * ---------------------------------------------------------------------------
 * Section 9 makes designated parking *"per template or trip"*, and until
 * quick-520 only the trip half could be expressed — `route_templates` had a
 * policy column and nowhere to put a facility id, so a template that said
 * "park at the yard" resolved to `NEEDS_CHOICE` and asked the dispatcher the
 * question the template had already answered.
 *
 *  1. **A template's parking facility resolves**, with `source: 'TEMPLATE'`.
 *  2. **The per-trip choice still outranks it.** That is Section 9's order, and
 *     inverting it would let a template quietly overrule a decision a person
 *     made for today. The failure is silent — a template whose facility happens
 *     to match looks identical.
 *  3. **The fallback cannot smuggle a facility into a different policy.** A
 *     stored `NONE` resolves to `NONE` with no facility even while the template
 *     column is set; the `??` in `buildEndStopSlot` is safe by construction
 *     rather than by luck, and this is what says so.
 *  4. **Nothing answering the question is STILL `NEEDS_CHOICE`.** The old
 *     behaviour is the correct behaviour when neither rung has an answer, and
 *     `end-stop.test.ts` asserts it unchanged and untouched.
 *
 * Pure: no database, no network. The context is hand-built the same way
 * `end-stop.test.ts` builds its target fixtures.
 */

import { describe, expect, it } from 'vitest';

import { buildEndStopSlot, type EndStopContext } from '../end-stop-lookup';
import type { ImportRecord } from '../persistence';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const facilityRow = (id: string, name: string) => ({
  id,
  name,
  facilityType: 'yard',
  addressLine1: '100 Industrial Dr',
  addressLine2: null,
  city: 'Milwaukee',
  state: 'WI',
  zip: '53202',
  isDriverResidence: false,
  residentDriverId: null,
});

const TEMPLATE_YARD = facilityRow('fac-template-yard', 'North Yard');
const TRIP_YARD = facilityRow('fac-trip-yard', 'South Yard');

/** Only `resolutionProvenance` is read off the record by `buildEndStopSlot`. */
function record(provenance: unknown): ImportRecord {
  return {
    id: 'imp-1',
    orgId: 'org-1',
    resolutionProvenance: provenance,
  } as unknown as ImportRecord;
}

function context(overrides: Partial<EndStopContext> = {}): EndStopContext {
  return {
    record: record(null),
    tenantPolicy: 'NONE',
    homeBaseFacilityId: null,
    templatePolicy: 'DESIGNATED_PARKING',
    templateEndStopFacilityId: TEMPLATE_YARD.id,
    assignedDriverId: null,
    driverResidenceFacilityId: null,
    firstPickupFacilityId: 'fac-pickup',
    facilities: new Map([
      [TEMPLATE_YARD.id, TEMPLATE_YARD],
      [TRIP_YARD.id, TRIP_YARD],
    ]),
    parkingCandidates: [TEMPLATE_YARD, TRIP_YARD],
    ...overrides,
  } as EndStopContext;
}

const storedEndStop = (policy: string, facilityId: string | null) => ({
  endStop: {
    via: 'MANUAL',
    score: null,
    matchedText: null,
    byUserId: 'user-1',
    at: '2026-08-11T12:00:00.000Z',
    policy,
    facilityId,
    materialisedAt: null,
  },
});

// ---------------------------------------------------------------------------

describe('the template rung', () => {
  it('resolves to the template’s own parking facility', () => {
    const slot = buildEndStopSlot(context());

    expect(slot.state).toBe('RESOLVED');
    expect(slot.policy).toBe('DESIGNATED_PARKING');
    expect(slot.source).toBe('TEMPLATE');
    expect(slot.facility?.id).toBe(TEMPLATE_YARD.id);
    // Derived on this read — nothing has been committed for this trip yet.
    expect(slot.persisted).toBe(false);
  });

  it('still reports NEEDS_CHOICE when no rung has an answer', () => {
    const slot = buildEndStopSlot(context({ templateEndStopFacilityId: null }));

    expect(slot.policy).toBe('DESIGNATED_PARKING');
    expect(slot.state).toBe('NEEDS_CHOICE');
    expect(slot.facility).toBeNull();
    expect(slot.blockedReason).toBeTruthy();
  });
});

describe('precedence — the trip outranks the template', () => {
  it('uses the facility a person chose for THIS trip, not the template’s', () => {
    const slot = buildEndStopSlot(
      context({
        record: record(storedEndStop('DESIGNATED_PARKING', TRIP_YARD.id)),
      }),
    );

    expect(slot.state).toBe('RESOLVED');
    expect(slot.source).toBe('TRIP');
    expect(slot.facility?.id).toBe(TRIP_YARD.id);
    expect(slot.persisted).toBe(true);
  });

  it('does not smuggle the template’s facility into a trip that chose NONE', () => {
    const slot = buildEndStopSlot(
      context({
        record: record(storedEndStop('NONE', null)),
      }),
    );

    expect(slot.policy).toBe('NONE');
    expect(slot.source).toBe('TRIP');
    expect(slot.facility).toBeNull();
    expect(slot.state).toBe('NONE');
  });
});
