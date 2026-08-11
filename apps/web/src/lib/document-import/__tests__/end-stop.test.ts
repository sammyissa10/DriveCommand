/**
 * End stop policy — the five policies, the resolution order, and the two rules
 * that cannot be allowed to drift (spec Section 9, Part A).
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE PIN
 * ---------------------------------------------------------------------------
 *  1. **All five policies resolve, and each to the right place.** Verify check
 *     #1 of the phase, as arithmetic rather than as a screenshot.
 *  2. **The order is tenant, then template, then trip — last one wins.** The
 *     failure mode is silent: a template override that stopped applying looks
 *     exactly like a tenant whose default happens to match.
 *  3. **The end stop is pinned last by its SEQUENCE, not by a sort.** `stops`
 *     carries `@@unique([dispatchId, sequenceOrder])`, so "last" is a fact about
 *     the row rather than about whoever renders the list.
 *  4. **Two vocabularies stay in step with the DB.** `end-stop-constants.ts`,
 *     `provenance.ts` and `route-template-save.ts` each hold the five policy
 *     strings — the parser and the carrier layer deliberately do not import the
 *     feature module — so the lists are pinned to each other here. A CHECK
 *     violation is a Postgres 23514 at runtime and TypeScript cannot see it
 *     (DEC-14).
 *
 * Nothing below restates a constant that lives in `end-stop-constants.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  DRIVER_RESIDENCE_FACILITY_TYPE,
  END_STOP_DEFAULT_POLICY,
  END_STOP_POLICIES,
  END_STOP_POLICY_LABELS,
  END_STOP_STOP_TYPE,
  isEndStopPolicy,
} from '../end-stop-constants';
import {
  endStopIsTracked,
  endStopStopDraft,
  endStopTargetFor,
  resolveEndStopPolicy,
  type EndStopTargetContext,
} from '../end-stop';

const FULL: EndStopTargetContext = {
  firstPickupFacilityId: 'fac-pickup',
  homeBaseFacilityId: 'fac-home',
  designatedParkingFacilityId: 'fac-yard',
  driverResidenceFacilityId: 'fac-house',
  assignedDriverId: 'driver-1',
};

const BARE: EndStopTargetContext = {
  firstPickupFacilityId: null,
  homeBaseFacilityId: null,
  designatedParkingFacilityId: null,
  driverResidenceFacilityId: null,
  assignedDriverId: null,
};

// ---------------------------------------------------------------------------

describe('the five policies', () => {
  it('has exactly the five the CHECK constraints admit', () => {
    expect([...END_STOP_POLICIES].sort()).toEqual(
      ['DESIGNATED_PARKING', 'DRIVER_RESIDENCE', 'HOME_BASE', 'NONE', 'RETURN_TO_ORIGIN'].sort(),
    );
  });

  it('labels every one of them, so no surface has to invent a word', () => {
    for (const policy of END_STOP_POLICIES) {
      expect(END_STOP_POLICY_LABELS[policy]).toBeTruthy();
    }
  });

  it('rejects a value that merely sounds right', () => {
    // The B1 lesson: `shipper` and `receiver` read perfectly and are a 23514.
    expect(isEndStopPolicy('YARD')).toBe(false);
    expect(isEndStopPolicy('return_to_origin')).toBe(false);
    expect(isEndStopPolicy('HOME_BASE')).toBe(true);
  });

  it('resolves each policy to the place Section 9 names', () => {
    expect(endStopTargetFor('RETURN_TO_ORIGIN', FULL)).toMatchObject({
      state: 'RESOLVED',
      facilityId: 'fac-pickup',
    });
    expect(endStopTargetFor('HOME_BASE', FULL)).toMatchObject({
      state: 'RESOLVED',
      facilityId: 'fac-home',
    });
    expect(endStopTargetFor('DESIGNATED_PARKING', FULL)).toMatchObject({
      state: 'RESOLVED',
      facilityId: 'fac-yard',
    });
    expect(endStopTargetFor('DRIVER_RESIDENCE', FULL)).toMatchObject({
      state: 'RESOLVED',
      facilityId: 'fac-house',
    });
    expect(endStopTargetFor('NONE', FULL)).toMatchObject({ state: 'NONE', facilityId: null });
  });
});

describe('when a policy cannot resolve', () => {
  it('says so rather than degrading to no end stop', () => {
    // The whole point of Part A is that the return leg stops being untracked.
    // A policy that quietly became NONE would put the miles back in the dark.
    for (const policy of END_STOP_POLICIES) {
      if (policy === 'NONE') continue;
      const target = endStopTargetFor(policy, BARE);
      expect(target.state).not.toBe('NONE');
      expect(target.facilityId).toBeNull();
      expect(target.reason).toBeTruthy();
    }
  });

  it('asks for a driver before it complains about a missing address', () => {
    const noDriver = endStopTargetFor('DRIVER_RESIDENCE', { ...FULL, assignedDriverId: null });
    expect(noDriver.state).toBe('NEEDS_DRIVER');

    const noAddress = endStopTargetFor('DRIVER_RESIDENCE', {
      ...FULL,
      driverResidenceFacilityId: null,
    });
    expect(noAddress.state).toBe('UNAVAILABLE');
  });

  it('treats unpicked designated parking as a choice, not a misconfiguration', () => {
    // NEEDS_CHOICE, because Section 9 makes this one "per template or trip" and
    // the answer is a tap away rather than a settings change.
    expect(
      endStopTargetFor('DESIGNATED_PARKING', { ...FULL, designatedParkingFacilityId: null }).state,
    ).toBe('NEEDS_CHOICE');
  });
});

describe('resolution order — tenant, then template, then trip', () => {
  it('falls back to the tenant default when nothing overrides it', () => {
    const r = resolveEndStopPolicy({ tenant: 'HOME_BASE', template: null, trip: null });
    expect(r).toMatchObject({ policy: 'HOME_BASE', source: 'TENANT' });
  });

  it('lets the template override the tenant', () => {
    const r = resolveEndStopPolicy({ tenant: 'HOME_BASE', template: 'RETURN_TO_ORIGIN', trip: null });
    expect(r).toMatchObject({ policy: 'RETURN_TO_ORIGIN', source: 'TEMPLATE' });
  });

  it('lets the trip override both', () => {
    const r = resolveEndStopPolicy({
      tenant: 'HOME_BASE',
      template: 'RETURN_TO_ORIGIN',
      trip: 'DRIVER_RESIDENCE',
    });
    expect(r).toMatchObject({ policy: 'DRIVER_RESIDENCE', source: 'TRIP' });
  });

  it('keeps every layer visible, so the "why" can say what was overridden', () => {
    const r = resolveEndStopPolicy({ tenant: 'NONE', template: 'HOME_BASE', trip: 'NONE' });
    expect(r.layers).toEqual({ tenant: 'NONE', template: 'HOME_BASE', trip: 'NONE' });
    // `NONE` at the trip layer is a real answer and must win over the template's
    // override. If it did not, "this trip ends nowhere" would be unsayable.
    expect(r.policy).toBe('NONE');
    expect(r.source).toBe('TRIP');
  });

  it('treats an unreadable value at any layer as absent', () => {
    const r = resolveEndStopPolicy({ tenant: 'GARAGE', template: 'shipper', trip: undefined });
    expect(r.policy).toBe(END_STOP_DEFAULT_POLICY);
    expect(r.source).toBe('TENANT');
  });
});

describe('the row Phase 8 writes', () => {
  it('lands one past the last stop, so "pinned last" is a sequence not a sort', () => {
    expect(endStopStopDraft('fac-home', 12).sequenceOrder).toBe(13);
    expect(endStopStopDraft('fac-home', 0).sequenceOrder).toBe(1);
  });

  it('uses a stop type the CHECK constraint admits, and carries no paperwork', () => {
    const draft = endStopStopDraft('fac-home', 3);
    // `stops_stop_type_check` has no value meaning "return to base" (audit B5),
    // so `layover` is forced rather than preferred, and `is_end_stop` is what
    // tells it apart from a real layover.
    expect(draft.stopType).toBe(END_STOP_STOP_TYPE);
    expect(['pickup', 'delivery', 'fuel_stop', 'layover', 'relay_handoff']).toContain(
      draft.stopType,
    );
    expect(draft.isEndStop).toBe(true);
    expect(draft.bolRequired).toBe(false);
    expect(draft.podRequired).toBe(false);
  });

  it('knows which policy gives up tracking', () => {
    expect(endStopIsTracked('NONE')).toBe(false);
    for (const policy of END_STOP_POLICIES) {
      if (policy === 'NONE') continue;
      expect(endStopIsTracked(policy)).toBe(true);
    }
  });
});

describe('the vocabularies stay in step with the database', () => {
  it('uses the facility type that is already in the live CHECK', () => {
    // Added by Phase 1 alongside `is_driver_residence`. Used exactly as spelled —
    // this is the constant that must not be "improved" into `driver_home`.
    expect(DRIVER_RESIDENCE_FACILITY_TYPE).toBe('driver_residence');
    expect([
      'terminal',
      'yard',
      'warehouse',
      'drop_yard',
      'customer_site',
      'driver_residence',
    ]).toContain(DRIVER_RESIDENCE_FACILITY_TYPE);
  });

  it('matches the list the provenance parser accepts', async () => {
    // `provenance.ts` is the shape layer and must not import a feature module,
    // so it restates the five. Pinned here rather than trusted.
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../provenance.ts', import.meta.url), 'utf8'),
    );
    for (const policy of END_STOP_POLICIES) {
      expect(source).toContain(`'${policy}'`);
    }
  });

  it('matches the list the route-template save path validates against', async () => {
    // Same reasoning: the carrier layer predates this module and must not depend
    // on it, so it restates the five. Two copies, one meaning, pinned together.
    const source = await import('node:fs/promises').then((fs) =>
      fs.readFile(new URL('../../carrier/route-template-save.ts', import.meta.url), 'utf8'),
    );
    for (const policy of END_STOP_POLICIES) {
      expect(source).toContain(`'${policy}'`);
    }
  });
});
