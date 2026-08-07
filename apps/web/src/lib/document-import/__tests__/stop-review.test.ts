/**
 * Stop review (spec Section 10), against the real functions.
 *
 * Everything under test here is pure, so nothing is mocked and nothing is faked
 * — the same discipline the ladder tests use, and the same reason: a faked
 * implementation only ever proves that the fake agrees with itself.
 *
 * The two tests that matter most are the two things Phase 5 says usually drift:
 *
 *  1. **`bulk apply — reaches a selected stop that no viewport contains`.**
 *     Forty stops, a selection of three that are nowhere near each other, and
 *     an assertion that all three changed and the other thirty-seven did not.
 *     `applyBulkToStops` has no concept of a rendered row, so the test is really
 *     asserting that no future edit introduces one.
 *
 *  2. **`reorder — a human's confirmed facility moves with its stop`.**
 *     Phase 4 keys stop links by index and drops a link whose fingerprint no
 *     longer matches. Left alone, that means every drag silently discards the
 *     confirmations a dispatcher just made. The permutation carries them, and
 *     the fingerprint is carried untouched so the safety property survives.
 */

import { describe, expect, it } from 'vitest';
import type { CanonicalConsignment } from '@drivecommand/validation';

import {
  applyBulkToStops,
  applyStopPatch,
  assertPermutation,
  buildStopReview,
  reorderConsignments,
  restampStopLink,
  rollupsOf,
  stopRowsFor,
  StopOrderError,
  validateStops,
} from '../stop-review';
import type { StopSlotView } from '../facility-lookup';
import type { StopProvenance } from '../provenance';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function consignment(over: Partial<CanonicalConsignment> = {}): CanonicalConsignment {
  return {
    pageNumbers: [1],
    externalCode: null,
    name: 'Russ Darrow Nissan',
    address: { line1: '12000 W Capitol Dr', city: 'Wauwatosa', state: 'WI', postalCode: '53222' },
    contact: null,
    groupLabel: null,
    appointment: null,
    references: [],
    totals: {},
    lineItems: [],
    notes: null,
    fieldConfidence: {},
    ...over,
  } as CanonicalConsignment;
}

/** A linked slot — nothing to do, does not block. */
function linked(index: number, facilityId = `fac-${index}`, name = `Facility ${index}`): StopSlotView {
  return {
    index,
    documentName: name,
    documentAddress: '12000 W Capitol Dr, Wauwatosa WI 53222',
    sourceCode: null,
    tier: 'T2',
    state: 'LINKED',
    facility: { id: facilityId, name, address: '12000 W Capitol Dr', facilityType: 'customer_site' },
    why: {
      via: 'NORMALISED_ADDRESS',
      matchedText: '12000 W Capitol Dr',
      documentText: name,
      score: 1,
      detail: 'normalised equal',
    },
    proposals: [],
    prefill: null,
    requiresHumanTap: false,
    persisted: true,
  };
}

/** A T4 slot — needs a human tap, and therefore blocks. */
function unresolved(index: number): StopSlotView {
  return {
    index,
    documentName: `Unknown ${index}`,
    documentAddress: '1 Nowhere Rd',
    sourceCode: null,
    tier: 'T4',
    state: 'NEW',
    facility: null,
    why: null,
    proposals: [],
    prefill: {
      name: `Unknown ${index}`,
      facilityType: 'customer_site',
      addressLine1: '1 Nowhere Rd',
      addressLine2: null,
      city: null,
      state: null,
      zip: null,
      sourceCode: null,
    },
    requiresHumanTap: true,
    persisted: false,
  };
}

function provenance(over: Partial<StopProvenance> = {}): StopProvenance {
  return {
    via: 'MANUAL',
    score: 0.82,
    matchedText: 'Hall Ford',
    byUserId: 'user-1',
    at: '2026-08-06T00:00:00.000Z',
    facilityId: 'fac-hall',
    sourceCode: null,
    stopFingerprint: 'n:hall ford|k',
    ...over,
  };
}

const COUNTS = { matched: 0, created: 0, needsReview: 0, note: '' };

// ---------------------------------------------------------------------------
// Rollups
// ---------------------------------------------------------------------------

describe('rollups', () => {
  it('adds the line items up when nothing has been typed over them', () => {
    const rollups = rollupsOf(
      consignment({
        lineItems: [
          { sku: 'A', description: null, quantity: 3, uom: 'EA', weight: 100, hazmat: false },
          { sku: 'B', description: null, quantity: 2, uom: 'EA', weight: 50, hazmat: false },
        ],
      }),
    );

    expect(rollups.pieces.computed).toBe(5);
    expect(rollups.pieces.value).toBe(5);
    expect(rollups.pieces.overridden).toBe(false);
    expect(rollups.weight.value).toBe(150);
  });

  it('keeps a quantity-0 substitution row in the sum rather than dropping it', () => {
    // Spec 1.2 callout (14): "Item 197592 subs" ships nothing and still exists.
    const rollups = rollupsOf(
      consignment({
        lineItems: [{ sku: '197592', description: 'subs', quantity: 0, uom: 'EA', weight: null, hazmat: false }],
      }),
    );
    expect(rollups.pieces.computed).toBe(0);
    expect(rollups.pieces.value).toBe(0);
  });

  it('reports an absent field as null, never as zero', () => {
    // "0 lbs" is a claim about the freight. Nothing read is not nothing shipped.
    const rollups = rollupsOf(
      consignment({
        lineItems: [{ sku: 'A', description: null, quantity: 4, uom: 'EA', weight: null, hazmat: false }],
      }),
    );
    expect(rollups.weight.computed).toBeNull();
    expect(rollups.weight.value).toBeNull();
    expect(rollups.label).toBe('4');
  });

  it('an override wins over the line items and says so', () => {
    const rollups = rollupsOf(
      consignment({
        lineItems: [{ sku: 'A', description: null, quantity: 5, uom: 'EA', weight: null, hazmat: false }],
        totals: { pieces: 12 },
        overriddenTotals: ['pieces'],
      }),
    );

    expect(rollups.pieces.computed).toBe(5);
    expect(rollups.pieces.value).toBe(12);
    expect(rollups.pieces.overridden).toBe(true);
  });

  it('an extracted total with no line items is used but is NOT marked as an override', () => {
    // Nobody typed it, so calling it "typed" would be a false claim about who
    // decided the number.
    const rollups = rollupsOf(consignment({ totals: { pieces: 9 } }));
    expect(rollups.pieces.value).toBe(9);
    expect(rollups.pieces.overridden).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Editing
// ---------------------------------------------------------------------------

describe('applyStopPatch', () => {
  it('typing a rollup IS the override; clearing it reverts to the line items', () => {
    const base = consignment({
      lineItems: [{ sku: 'A', description: null, quantity: 5, uom: 'EA', weight: null, hazmat: false }],
    });

    const typed = applyStopPatch(base, { pieces: 12 });
    expect(typed.overriddenTotals).toContain('pieces');
    expect(rollupsOf(typed).pieces.value).toBe(12);

    const cleared = applyStopPatch(typed, { pieces: null });
    expect(cleared.overriddenTotals).not.toContain('pieces');
    expect(rollupsOf(cleared).pieces.value).toBe(5);
  });

  it('only touches the keys it was given', () => {
    const base = consignment({ notes: 'keep me', stopType: 'delivery' });
    const next = applyStopPatch(base, { name: 'Renamed' });
    expect(next.name).toBe('Renamed');
    expect(next.notes).toBe('keep me');
    expect(next.stopType).toBe('delivery');
  });

  it('a hand edit takes the bulk mark off that field, so a later Clear leaves it alone', () => {
    const bulkApplied = consignment({ notes: 'Call ahead', bulkAppliedFields: ['notes', 'stopType'] });

    const edited = applyStopPatch(bulkApplied, { notes: 'Ring the bell round the back' });
    expect(edited.bulkAppliedFields).not.toContain('notes');
    // The other field's mark is untouched — only what was edited loses its mark.
    expect(edited.bulkAppliedFields).toContain('stopType');

    const afterClear = applyBulkToStops([edited], [0], { clear: ['notes'] });
    expect(afterClear.consignments[0].notes).toBe('Ring the bell round the back');
    expect(afterClear.skipped).toEqual([0]);
  });
});

// ---------------------------------------------------------------------------
// Bulk apply — the drift risk
// ---------------------------------------------------------------------------

describe('bulk apply', () => {
  it('reaches a selected stop that no viewport contains', () => {
    // Forty stops. Three selected, spread across the list — the middle one and
    // the last one are far below any fold. If bulk apply ever grew a notion of
    // "the rendered rows", this is the test that would fail.
    const stops = Array.from({ length: 40 }, (_, i) => consignment({ name: `Stop ${i}` }));
    const selection = [0, 19, 39];

    const result = applyBulkToStops(stops, selection, { notes: 'Call ahead 30 min' });

    expect(result.applied).toBe(3);
    expect(result.fields).toEqual(['notes']);
    for (const index of selection) {
      expect(result.consignments[index].notes).toBe('Call ahead 30 min');
      expect(result.consignments[index].bulkAppliedFields).toContain('notes');
    }
    const untouched = result.consignments.filter((c, i) => !selection.includes(i));
    expect(untouched).toHaveLength(37);
    expect(untouched.every((c) => c.notes === null || c.notes === undefined)).toBe(true);
  });

  it('applies required documents, a window and a type, and marks each field', () => {
    const stops = [consignment(), consignment(), consignment()];

    const docs = applyBulkToStops(stops, [0, 2], { requiredDocuments: ['BOL', 'POD'] });
    expect(docs.consignments[0].requiredDocuments).toEqual(['BOL', 'POD']);
    expect(docs.consignments[1].requiredDocuments).toBeUndefined();

    const window = applyBulkToStops(stops, [1], {
      appointment: { earliest: '2026-08-07T08:00', latest: '2026-08-07T12:00', isFirm: true },
    });
    expect(window.consignments[1].appointment?.isFirm).toBe(true);
    expect(window.consignments[1].bulkAppliedFields).toContain('appointment');

    const type = applyBulkToStops(stops, [0, 1, 2], { stopType: 'pickup' });
    expect(type.consignments.map((c) => c.stopType)).toEqual(['pickup', 'pickup', 'pickup']);
    expect(type.applied).toBe(3);
  });

  it('copies quantities from the stop above WITHOUT cascading down the selection', () => {
    // Selecting 1, 2 and 3 copies from 0, 1 and 2 AS THEY WERE. Cascading would
    // smear stop 0's numbers across all four, turning one mistake into four.
    const stops = [
      consignment({ totals: { pieces: 10 } }),
      consignment({ totals: { pieces: 20 } }),
      consignment({ totals: { pieces: 30 } }),
      consignment({ totals: { pieces: 40 } }),
    ];

    const result = applyBulkToStops(stops, [1, 2, 3], { copyQuantitiesFromAbove: true });

    expect(result.consignments.map((c) => c.totals?.pieces)).toEqual([10, 10, 20, 30]);
    expect(result.applied).toBe(3);
  });

  it('the first stop has nothing above it, and that is reported rather than hidden', () => {
    const stops = [consignment({ totals: { pieces: 10 } }), consignment({ totals: { pieces: 20 } })];
    const result = applyBulkToStops(stops, [0, 1], { copyQuantitiesFromAbove: true });

    expect(result.skipped).toEqual([0]);
    expect(result.applied).toBe(1);
    expect(result.consignments[0].totals?.pieces).toBe(10);
  });

  it('a copied quantity is marked as an override, because the line items did not produce it', () => {
    const stops = [
      consignment({ totals: { pieces: 10 } }),
      consignment({
        lineItems: [{ sku: 'A', description: null, quantity: 2, uom: 'EA', weight: null, hazmat: false }],
      }),
    ];

    const result = applyBulkToStops(stops, [1], { copyQuantitiesFromAbove: true });
    const rollups = rollupsOf(result.consignments[1]);

    expect(rollups.pieces.value).toBe(10);
    expect(rollups.pieces.computed).toBe(2);
    expect(rollups.pieces.overridden).toBe(true);
  });

  it('clear takes back a bulk value and leaves a hand-typed one alone', () => {
    const bulkNote = consignment({ notes: 'Call ahead', bulkAppliedFields: ['notes'] });
    const typedNote = consignment({ notes: 'Gate code 4412' });

    const result = applyBulkToStops([bulkNote, typedNote], [0, 1], { clear: ['notes'] });

    expect(result.consignments[0].notes).toBeNull();
    expect(result.consignments[0].bulkAppliedFields).not.toContain('notes');
    // The whole point. A dispatcher's own note survives a bulk clear.
    expect(result.consignments[1].notes).toBe('Gate code 4412');
    expect(result.skipped).toEqual([1]);
    expect(result.applied).toBe(1);
  });

  it('clearing bulk quantities also drops their override marks', () => {
    const stops = [consignment({ totals: { pieces: 10 } }), consignment()];
    const copied = applyBulkToStops(stops, [1], { copyQuantitiesFromAbove: true });
    const cleared = applyBulkToStops(copied.consignments, [1], { clear: ['totals'] });

    expect(cleared.consignments[1].overriddenTotals).toEqual([]);
    expect(rollupsOf(cleared.consignments[1]).pieces.value).toBeNull();
  });

  it('an index outside the document is ignored rather than throwing away the whole action', () => {
    const stops = [consignment(), consignment()];
    const result = applyBulkToStops(stops, [0, 99], { stopType: 'delivery' });
    expect(result.applied).toBe(1);
    expect(result.consignments).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Reorder
// ---------------------------------------------------------------------------

describe('reorder', () => {
  const fingerprintOf = (c: CanonicalConsignment) => `n:${(c.name ?? '').toLowerCase()}|k`;

  it('moves the consignments into the requested order', () => {
    const stops = [consignment({ name: 'A' }), consignment({ name: 'B' }), consignment({ name: 'C' })];
    const result = reorderConsignments(stops, [2, 0, 1], {}, fingerprintOf);
    expect(result.consignments.map((c) => c.name)).toEqual(['C', 'A', 'B']);
  });

  it("a human's confirmed facility moves with its stop", () => {
    // Phase 4 drops a link whose fingerprint no longer matches its index. Left
    // to that alone, every drag would silently discard a confirmation someone
    // had just made — and would do it again after every drag.
    const stops = [consignment({ name: 'A' }), consignment({ name: 'B' }), consignment({ name: 'Hall Ford' })];
    const links = { '2': provenance({ stopFingerprint: 'n:hall ford|k' }) };

    const result = reorderConsignments(stops, [2, 0, 1], links, fingerprintOf);

    expect(result.consignments[0].name).toBe('Hall Ford');
    expect(result.stopProvenance['0']?.facilityId).toBe('fac-hall');
    expect(result.stopProvenance['0']?.via).toBe('MANUAL');
    // The score the person was shown is carried untouched.
    expect(result.stopProvenance['0']?.score).toBe(0.82);
    expect(result.stopProvenance['2']).toBeUndefined();
  });

  it('a link that was ALREADY stale is dropped, not resurrected by the move', () => {
    // The safety property Phase 4 built has to survive the permutation. A record
    // whose fingerprint had already gone stale was not a link before the drag
    // and must not become one after it.
    const stops = [consignment({ name: 'A' }), consignment({ name: 'B' })];
    const links = { '1': provenance({ stopFingerprint: 'n:somebody else|k' }) };

    const result = reorderConsignments(stops, [1, 0], links, fingerprintOf);
    expect(result.stopProvenance).toEqual({});
  });

  it('rejects an order that is not a permutation', () => {
    const stops = [consignment(), consignment(), consignment()];
    expect(() => assertPermutation([0, 1], 3)).toThrow(StopOrderError);
    expect(() => assertPermutation([0, 1, 1], 3)).toThrow(StopOrderError);
    expect(() => assertPermutation([0, 1, 5], 3)).toThrow(StopOrderError);
    expect(() => reorderConsignments(stops, [0, 1], {}, fingerprintOf)).toThrow(StopOrderError);
  });
});

describe('restampStopLink', () => {
  it('carries a link across a typo fix rather than making someone confirm twice', () => {
    const record = provenance({ stopFingerprint: 'before' });
    const next = restampStopLink(record, 'before', 'after');
    expect(next?.stopFingerprint).toBe('after');
    expect(next?.facilityId).toBe('fac-hall');
    expect(next?.via).toBe('MANUAL');
  });

  it('leaves an already-stale record stale', () => {
    expect(restampStopLink(provenance({ stopFingerprint: 'x' }), 'before', 'after')).toBeNull();
  });

  it('does nothing when the edit did not change the identity', () => {
    expect(restampStopLink(provenance({ stopFingerprint: 'same' }), 'same', 'same')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Validation — spec Section 10
// ---------------------------------------------------------------------------

describe('validation', () => {
  it('blocks on an unresolved facility, and names the count', () => {
    const rows = stopRowsFor(
      [consignment({ name: 'A' }), consignment({ name: 'B' }), consignment({ name: 'C' })],
      [linked(0), unresolved(1), unresolved(2)],
    );
    const { blocks, canProceed, blockedReason } = validateStops(rows);

    expect(canProceed).toBe(false);
    expect(blocks.map((b) => b.code)).toContain('UNRESOLVED_FACILITY');
    expect(blockedReason).toBe('2 stops need a facility');
  });

  it('blocks on a missing name', () => {
    const rows = stopRowsFor([consignment({ name: '' })], [linked(0)]);
    const { blocks, canProceed } = validateStops(rows);
    expect(canProceed).toBe(false);
    expect(blocks.map((b) => b.code)).toContain('MISSING_NAME');
  });

  it('blocks on the same facility twice in a row, and only warns when they are apart', () => {
    const three = [consignment({ name: 'A' }), consignment({ name: 'B' }), consignment({ name: 'C' })];

    const adjacent = validateStops(
      stopRowsFor(three, [linked(0, 'fac-x'), linked(1, 'fac-x'), linked(2, 'fac-y')]),
    );
    expect(adjacent.canProceed).toBe(false);
    expect(adjacent.blocks.map((b) => b.code)).toContain('DUPLICATE_FACILITY');

    // A pickup and a later delivery at one warehouse is legitimate.
    const apart = validateStops(
      stopRowsFor(three, [linked(0, 'fac-x'), linked(1, 'fac-y'), linked(2, 'fac-x')]),
    );
    expect(apart.canProceed).toBe(true);
    expect(apart.warnings.map((w) => w.code)).toContain('REPEATED_FACILITY');
  });

  it('passes cleanly when every stop is linked, named and distinct', () => {
    const rows = stopRowsFor(
      [
        consignment({ name: 'A', references: [{ type: 'BOL', value: '1' }], stopType: 'delivery' }),
        consignment({ name: 'B', references: [{ type: 'BOL', value: '2' }], stopType: 'delivery' }),
      ],
      [linked(0, 'fac-a'), linked(1, 'fac-b')],
    );
    const { canProceed, blocks, blockedReason } = validateStops(rows);
    expect(blocks).toEqual([]);
    expect(canProceed).toBe(true);
    expect(blockedReason).toBeNull();
  });

  it('warnings are advisory and never make the primary action unavailable', () => {
    // No references, no type, no quantities on either stop — three warnings, and
    // the button is still live. Section 10: everything that is not a block is
    // one dismissible summary.
    const rows = stopRowsFor(
      [consignment({ name: 'A' }), consignment({ name: 'B' })],
      [linked(0, 'fac-a'), linked(1, 'fac-b')],
    );
    const { canProceed, warnings } = validateStops(rows);

    expect(canProceed).toBe(true);
    expect(warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['NO_QUANTITIES', 'NO_REFERENCES', 'NO_STOP_TYPE']),
    );
  });

  it('flags a hand-typed quantity as worth a look without blocking on it', () => {
    const rows = stopRowsFor(
      [
        consignment({
          name: 'A',
          lineItems: [{ sku: 'A', description: null, quantity: 5, uom: 'EA', weight: null, hazmat: false }],
          totals: { pieces: 12 },
          overriddenTotals: ['pieces'],
        }),
      ],
      [linked(0)],
    );
    const { canProceed, warnings } = validateStops(rows);
    expect(canProceed).toBe(true);
    expect(warnings.map((w) => w.code)).toContain('HAND_EDITED_ROLLUPS');
  });

  it('a document with no stops blocks, because a trip with no stops is not a trip', () => {
    const { canProceed, blockedReason } = validateStops([]);
    expect(canProceed).toBe(false);
    expect(blockedReason).toBe('This document has no stops');
  });
});

// ---------------------------------------------------------------------------
// The whole view
// ---------------------------------------------------------------------------

describe('buildStopReview', () => {
  it('joins the facility half and the document half by index', () => {
    const view = buildStopReview(
      [
        consignment({ name: 'Russ Darrow Nissan', references: [{ type: 'BOL', value: 'X1' }, { type: 'PRO', value: 'X2' }] }),
        consignment({ name: 'Hall Ford' }),
      ],
      [linked(0, 'fac-russ', 'Russ Darrow Nissan'), unresolved(1)],
      { ...COUNTS, matched: 1, needsReview: 1, note: '1 matched · 1 needs a look' },
    );

    expect(view.total).toBe(2);
    expect(view.stops[0].sequence).toBe(1);
    expect(view.stops[0].referenceCount).toBe(2);
    expect(view.stops[0].facility?.name).toBe('Russ Darrow Nissan');
    expect(view.stops[1].requiresHumanTap).toBe(true);
    expect(view.canProceed).toBe(false);
  });

  it('a consignment with no slot reports itself unresolved rather than claiming a facility', () => {
    // The two halves come from one read and should never be out of step. If they
    // ever are, the safe answer is "this needs a person", not a facility nothing
    // matched.
    const view = buildStopReview([consignment({ name: 'Orphan' })], [], COUNTS);
    expect(view.stops[0].requiresHumanTap).toBe(true);
    expect(view.stops[0].facility).toBeNull();
    expect(view.canProceed).toBe(false);
  });
});
