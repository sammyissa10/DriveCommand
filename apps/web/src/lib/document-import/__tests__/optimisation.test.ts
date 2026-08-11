/**
 * Route optimisation — the constraints, the floor, and the promise that nothing
 * moves without a tap (spec Section 9, Part B).
 *
 * ---------------------------------------------------------------------------
 * WHAT THESE PIN
 * ---------------------------------------------------------------------------
 *  1. **The floor is real and lives in one file.** Verify check #6 of the phase:
 *     a saving below it produces no suggestion at all. Every threshold below is
 *     IMPORTED from `optimisation-constants.ts` — the matrices are built
 *     *relative to* the constants, so re-tuning a constant re-tunes the test
 *     rather than breaking it, and a literal restated here would be the exact
 *     drift the constants file exists to prevent.
 *  2. **Firm windows are hard and soft windows are penalties.** Verify check #4.
 *  3. **A pickup precedes its deliveries** — and where the paperwork does not
 *     link them, it precedes all of them, which is the safe direction.
 *  4. **The end stop is a fixed terminal node.** It contributes the return leg
 *     to every candidate's cost and no permutation can move it, because it was
 *     never in the array being permuted.
 *  5. **Splicing leaves untouched rows untouched.** A dispatcher approved a
 *     driving order, not a tidy-up.
 *
 * The matrix is hand-built and no network is touched. `costOrder` is the same
 * function the solver minimises, so a test that asserts on a cost is asserting
 * on the real objective.
 */

import { describe, expect, it } from 'vitest';

import {
  OPTIMISATION_EXACT_MAX_STOPS,
  OPTIMISATION_MIN_SAVED_MILES,
  OPTIMISATION_MIN_SAVED_MINUTES,
  OPTIMISATION_MIN_STOPS,
  OPTIMISATION_SOFT_WINDOW_PENALTY_MINUTES,
} from '../optimisation-constants';
import {
  buildOptimisationSuggestion,
  costOrder,
  precedencePairs,
  respectsPrecedence,
  softWindowInversions,
  spliceSuggestedOrder,
  stopSetChanged,
  type DistanceMatrix,
  type OptimisableStop,
} from '../optimisation';
import { matrixCacheKey } from '../optimisation-matrix';
import { milesPhrase, minutesPhrase, savingsSentence } from '../optimisation-copy';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stop(partial: Partial<OptimisableStop> & { position: number; facilityId: string }): OptimisableStop {
  return {
    stopType: null,
    referenceKeys: [],
    appointmentStartMs: null,
    appointmentIsFirm: false,
    ...partial,
  };
}

/**
 * A symmetric matrix from a 1-D layout: facility `i` sits at `positions[i]`
 * miles along a straight road, and driving is one minute per mile.
 *
 * A line is the cleanest possible instrument here — the optimal order on a line
 * is the sorted one, so the expected answer never needs a solver to compute and
 * the test cannot be "verified" by the code under test.
 */
function lineMatrix(positions: Record<string, number>, minutesPerMile = 1): DistanceMatrix {
  const ids = Object.keys(positions);
  const miles = ids.map((a) => ids.map((b) => Math.abs(positions[a] - positions[b])));
  return {
    ids,
    miles,
    minutes: miles.map((row) => row.map((m) => m * minutesPerMile)),
  };
}

// ---------------------------------------------------------------------------

describe('cost', () => {
  const matrix = lineMatrix({ A: 0, B: 10, C: 20, YARD: 0 });

  it('sums the legs between consecutive stops', () => {
    const stops = [stop({ position: 0, facilityId: 'A' }), stop({ position: 1, facilityId: 'C' })];
    expect(costOrder([0, 1], stops, matrix, null, null)?.miles).toBe(20);
  });

  it('charges the return leg to the end stop — the whole point of Part A', () => {
    const stops = [stop({ position: 0, facilityId: 'A' }), stop({ position: 1, facilityId: 'C' })];
    // Without the end stop, finishing far away looks free. With it, the trip
    // pays to get home, which is Section 9's left-hand diagram.
    expect(costOrder([0, 1], stops, matrix, null, null)?.miles).toBe(20);
    expect(costOrder([0, 1], stops, matrix, null, 'YARD')?.miles).toBe(40);
  });

  it('charges the outbound leg when the loop is closed', () => {
    const stops = [stop({ position: 0, facilityId: 'B' })];
    expect(costOrder([0], stops, matrix, 'YARD', 'YARD')?.miles).toBe(20);
  });

  it('prices soft-window inversions into the objective but not into the miles', () => {
    const stops = [
      stop({ position: 0, facilityId: 'A', appointmentStartMs: 2_000 }),
      stop({ position: 1, facilityId: 'B', appointmentStartMs: 1_000 }),
    ];
    const cost = costOrder([0, 1], stops, matrix, null, null)!;
    expect(softWindowInversions([0, 1], stops)).toBe(1);
    expect(cost.minutes).toBe(10);
    expect(cost.objective).toBe(10 + OPTIMISATION_SOFT_WINDOW_PENALTY_MINUTES);
  });

  it('returns null rather than guessing when a facility is not in the matrix', () => {
    const stops = [stop({ position: 0, facilityId: 'A' }), stop({ position: 1, facilityId: 'ZZ' })];
    expect(costOrder([0, 1], stops, matrix, null, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------

describe('precedence', () => {
  it('puts a pickup before the delivery that shares its paperwork', () => {
    const stops = [
      stop({ position: 0, facilityId: 'A', stopType: 'delivery', referenceKeys: ['BOL1'] }),
      stop({ position: 1, facilityId: 'B', stopType: 'pickup', referenceKeys: ['BOL1'] }),
      stop({ position: 2, facilityId: 'C', stopType: 'delivery', referenceKeys: ['BOL9'] }),
    ];
    const pairs = precedencePairs(stops);
    expect(pairs).toContainEqual([1, 0]);
    // Not linked, and the pickup HAS links, so the unrelated delivery is free.
    expect(pairs).not.toContainEqual([1, 2]);
  });

  it('constrains an unlinked pickup against every delivery — the safe direction', () => {
    // A run whose paperwork does not link its stops is a run where we cannot
    // tell which delivery depends on which pickup. Assuming none of them do
    // lets the optimiser propose delivering before collecting.
    const stops = [
      stop({ position: 0, facilityId: 'A', stopType: 'delivery' }),
      stop({ position: 1, facilityId: 'B', stopType: 'pickup' }),
      stop({ position: 2, facilityId: 'C', stopType: 'delivery' }),
    ];
    const pairs = precedencePairs(stops);
    expect(pairs).toContainEqual([1, 0]);
    expect(pairs).toContainEqual([1, 2]);
  });

  it('orders firm windows by when they open, and leaves soft ones alone', () => {
    const firm = [
      stop({ position: 0, facilityId: 'A', appointmentStartMs: 9_000, appointmentIsFirm: true }),
      stop({ position: 1, facilityId: 'B', appointmentStartMs: 1_000, appointmentIsFirm: true }),
    ];
    expect(precedencePairs(firm)).toContainEqual([1, 0]);

    const soft = [
      stop({ position: 0, facilityId: 'A', appointmentStartMs: 9_000 }),
      stop({ position: 1, facilityId: 'B', appointmentStartMs: 1_000 }),
    ];
    expect(precedencePairs(soft)).toHaveLength(0);
  });

  it('respectsPrecedence agrees with the pairs it is given', () => {
    expect(respectsPrecedence([0, 1, 2], [[0, 2]])).toBe(true);
    expect(respectsPrecedence([2, 1, 0], [[0, 2]])).toBe(false);
  });
});

// ---------------------------------------------------------------------------

describe('the suggestion', () => {
  it('says nothing when there are too few stops to reorder', () => {
    const stops = Array.from({ length: OPTIMISATION_MIN_STOPS - 1 }, (_, i) =>
      stop({ position: i, facilityId: String.fromCharCode(65 + i) }),
    );
    const result = buildOptimisationSuggestion({
      stops,
      matrix: lineMatrix({ A: 0, B: 10, C: 20 }),
      startFacilityId: null,
      endFacilityId: null,
    });
    expect(result.offered).toBe(false);
    expect(result.declineReason).toBe('NOT_ENOUGH_STOPS');
  });

  it('finds the shortest order on a line and reports what it saves', () => {
    // A - C - B on a line: the detour is obvious and the arithmetic is checkable
    // by hand. Spaced so the saving comfortably clears the miles floor.
    const span = OPTIMISATION_MIN_SAVED_MILES * 10;
    const matrix = lineMatrix({ A: 0, B: span / 2, C: span });
    const stops = [
      stop({ position: 0, facilityId: 'A' }),
      stop({ position: 1, facilityId: 'C' }),
      stop({ position: 2, facilityId: 'B' }),
    ];

    const result = buildOptimisationSuggestion({
      stops,
      matrix,
      startFacilityId: null,
      endFacilityId: null,
    });

    expect(result.offered).toBe(true);
    // Positions, in the order to visit them: A, B, C.
    expect(result.movedOrder).toEqual([0, 2, 1]);
    expect(result.currentMiles).toBe(span + span / 2);
    expect(result.suggestedMiles).toBe(span);
    expect(result.savedMiles).toBe(span / 2);
  });

  it('offers nothing when the saving is below the floor', () => {
    // The same detour, scaled so the saving is a hair under the miles floor and
    // the minutes saving is under the minutes floor too. Both, because the floor
    // is an OR.
    const saving = Math.min(OPTIMISATION_MIN_SAVED_MILES, OPTIMISATION_MIN_SAVED_MINUTES) - 1;
    const matrix = lineMatrix({ A: 0, B: saving, C: saving * 2 });
    const stops = [
      stop({ position: 0, facilityId: 'A' }),
      stop({ position: 1, facilityId: 'C' }),
      stop({ position: 2, facilityId: 'B' }),
    ];

    const result = buildOptimisationSuggestion({
      stops,
      matrix,
      startFacilityId: null,
      endFacilityId: null,
    });

    expect(result.savedMiles).toBeGreaterThan(0);
    expect(result.savedMiles).toBeLessThan(OPTIMISATION_MIN_SAVED_MILES);
    expect(result.offered).toBe(false);
    expect(result.declineReason).toBe('BELOW_FLOOR');
    // Nothing to accept, so nothing is offered to accept.
    expect(result.movedOrder).toEqual([]);
  });

  it('clears the floor on TIME alone — the case an AND would suppress', () => {
    // Same distance either way; one order is far slower. This is the "same
    // miles, half an hour earlier home" suggestion, and it is the reason the two
    // floors are combined with OR.
    const ids = ['A', 'B', 'C'];
    const slow = OPTIMISATION_MIN_SAVED_MINUTES * 4;
    const miles = [
      [0, 10, 10],
      [10, 0, 10],
      [10, 10, 0],
    ];
    const minutes = [
      [0, slow, 10],
      [slow, 0, 10],
      [10, 10, 0],
    ];
    const matrix: DistanceMatrix = { ids, miles, minutes };

    const stops = [
      stop({ position: 0, facilityId: 'A' }),
      stop({ position: 1, facilityId: 'B' }),
      stop({ position: 2, facilityId: 'C' }),
    ];

    const result = buildOptimisationSuggestion({
      stops,
      matrix,
      startFacilityId: null,
      endFacilityId: null,
    });

    expect(result.savedMiles).toBe(0);
    expect(result.savedMinutes).toBeGreaterThanOrEqual(OPTIMISATION_MIN_SAVED_MINUTES);
    expect(result.offered).toBe(true);
  });

  it('never proposes an order that breaks a firm window', () => {
    // The shortest order on the line is A, B, C. The firm windows demand C then
    // B, so the suggestion — if there is one — must respect that.
    const span = OPTIMISATION_MIN_SAVED_MILES * 10;
    const matrix = lineMatrix({ A: 0, B: span / 2, C: span });
    const stops = [
      stop({ position: 0, facilityId: 'A', appointmentStartMs: 1_000, appointmentIsFirm: true }),
      stop({ position: 1, facilityId: 'C', appointmentStartMs: 2_000, appointmentIsFirm: true }),
      stop({ position: 2, facilityId: 'B', appointmentStartMs: 3_000, appointmentIsFirm: true }),
    ];

    const result = buildOptimisationSuggestion({
      stops,
      matrix,
      startFacilityId: null,
      endFacilityId: null,
    });

    // The current order IS the only feasible one, so there is nothing to offer.
    expect(result.offered).toBe(false);
    expect(result.declineReason).toBe('ALREADY_BEST');
  });

  it('never proposes delivering before collecting', () => {
    const span = OPTIMISATION_MIN_SAVED_MILES * 10;
    const matrix = lineMatrix({ A: 0, B: span / 2, C: span });
    const stops = [
      stop({ position: 0, facilityId: 'C', stopType: 'pickup', referenceKeys: ['B1'] }),
      stop({ position: 1, facilityId: 'A', stopType: 'delivery', referenceKeys: ['B1'] }),
      stop({ position: 2, facilityId: 'B', stopType: 'delivery', referenceKeys: ['B1'] }),
    ];

    const result = buildOptimisationSuggestion({
      stops,
      matrix,
      startFacilityId: null,
      endFacilityId: null,
    });

    if (result.offered) {
      expect(result.movedOrder[0]).toBe(0);
    }
  });

  it('keeps the end stop last by never putting it in the array', () => {
    const span = OPTIMISATION_MIN_SAVED_MILES * 10;
    const matrix = lineMatrix({ A: 0, B: span / 2, C: span, YARD: span * 2 });
    const stops = [
      stop({ position: 0, facilityId: 'A' }),
      stop({ position: 1, facilityId: 'C' }),
      stop({ position: 2, facilityId: 'B' }),
    ];

    const result = buildOptimisationSuggestion({
      stops,
      matrix,
      startFacilityId: null,
      endFacilityId: 'YARD',
    });

    // The yard is a cost, never a position: the suggested order lists exactly the
    // three movable stops and nothing else.
    expect(result.movedOrder.slice().sort()).toEqual([0, 1, 2]);
    expect(result.suggestedMiles).toBeGreaterThan(0);
  });

  it('says nothing at all when a stop has no facility', () => {
    // Different from a skipped stop, which the caller has already removed. An
    // unresolved stop is ON the run with an unknown location, so optimising the
    // half we can see would reorder a dispatcher's stops around a gap.
    const stops = [
      stop({ position: 0, facilityId: 'A' }),
      stop({ position: 1, facilityId: '' }),
      stop({ position: 2, facilityId: 'B' }),
    ];
    const result = buildOptimisationSuggestion({
      stops,
      matrix: lineMatrix({ A: 0, B: 10 }),
      startFacilityId: null,
      endFacilityId: null,
    });
    expect(result.offered).toBe(false);
    expect(result.declineReason).toBe('UNRESOLVED_STOPS');
  });

  it('still answers above the exact-enumeration threshold', () => {
    // The heuristic branch. Not asserted to be optimal — it is a suggestion a
    // human approves — but it must return a real permutation and never break a
    // constraint.
    const n = OPTIMISATION_EXACT_MAX_STOPS + 3;
    const positions: Record<string, number> = {};
    for (let i = 0; i < n; i++) positions[`F${i}`] = (i * 37) % 100;
    const matrix = lineMatrix(positions);
    const stops = Array.from({ length: n }, (_, i) => stop({ position: i, facilityId: `F${i}` }));

    const result = buildOptimisationSuggestion({
      stops,
      matrix,
      startFacilityId: null,
      endFacilityId: null,
    });

    if (result.offered) {
      expect(result.movedOrder.slice().sort((a, b) => a - b)).toEqual(
        Array.from({ length: n }, (_, i) => i),
      );
      expect(result.savedMiles).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------

describe('splicing an accepted suggestion into the full list', () => {
  it('refills only the slots the movable stops occupied', () => {
    // Positions 1 and 3 are skipped stops or ghosts. They stay exactly where
    // they are — the dispatcher approved a driving order, not a tidy-up.
    const order = spliceSuggestedOrder(5, [0, 2, 4], [4, 0, 2]);
    expect(order).toEqual([4, 1, 0, 3, 2]);
  });

  it('is a permutation of the whole array, which is what the reorder takes', () => {
    const order = spliceSuggestedOrder(4, [0, 1, 2, 3], [3, 2, 1, 0])!;
    expect(order.slice().sort()).toEqual([0, 1, 2, 3]);
  });

  it('refuses anything that is not a permutation of the movable positions', () => {
    expect(spliceSuggestedOrder(3, [0, 1], [0, 1, 2])).toBeNull();
    expect(spliceSuggestedOrder(3, [0, 1], [0, 0])).toBeNull();
    expect(spliceSuggestedOrder(3, [0, 1], [0, 2])).toBeNull();
  });
});

describe('the template-drift gate', () => {
  it('is a multiset comparison, not a set one', () => {
    // Two stops at the same cross-dock and one is a run that changed, and a
    // plain Set would call those equal.
    expect(stopSetChanged(['a', 'a', 'b'], ['a', 'b'])).toBe(true);
    expect(stopSetChanged(['a', 'a', 'b'], ['a', 'a', 'b'])).toBe(false);
  });

  it('ignores order — a reorder is not an addition or a removal', () => {
    expect(stopSetChanged(['a', 'b', 'c'], ['c', 'b', 'a'])).toBe(false);
  });

  it('notices an added or removed stop', () => {
    expect(stopSetChanged(['a', 'b'], ['a', 'b', 'c'])).toBe(true);
    expect(stopSetChanged(['a', 'b', 'c'], ['a', 'b'])).toBe(true);
    expect(stopSetChanged(['a', 'b'], ['a', 'z'])).toBe(true);
  });
});

describe('the matrix cache key', () => {
  it('is the same for the same set in any order — so a template hits daily', () => {
    expect(matrixCacheKey(['b', 'a', 'c'])).toBe(matrixCacheKey(['c', 'b', 'a']));
  });

  it('changes when the set changes — invalidation is structural', () => {
    expect(matrixCacheKey(['a', 'b'])).not.toBe(matrixCacheKey(['a', 'b', 'c']));
    expect(matrixCacheKey(['a', 'b'])).not.toBe(matrixCacheKey(['a', 'z']));
  });

  it('is unaffected by a repeated facility', () => {
    expect(matrixCacheKey(['a', 'a', 'b'])).toBe(matrixCacheKey(['a', 'b']));
  });
});

describe('the copy', () => {
  it('builds the savings line as ONE string (quick-517)', () => {
    const sentence = savingsSentence({
      offered: true,
      declineReason: null,
      movedOrder: [],
      currentMiles: 0,
      currentMinutes: 0,
      suggestedMiles: 0,
      suggestedMinutes: 0,
      savedMiles: 18,
      savedMinutes: 34,
      floors: { miles: OPTIMISATION_MIN_SAVED_MILES, minutes: OPTIMISATION_MIN_SAVED_MINUTES },
    });
    // Spaces on both sides of both counts, in one node, so there is no boundary
    // left for a renderer to join wrongly.
    expect(sentence).toBe('Suggested order saves 18 miles and 34 min.');
    expect(sentence).not.toMatch(/\d(miles|min)/);
  });

  it('agrees in singular and plural', () => {
    expect(milesPhrase(1)).toBe('1 mile');
    expect(milesPhrase(2)).toBe('2 miles');
    expect(minutesPhrase(59)).toBe('59 min');
    expect(minutesPhrase(60)).toBe('1 h');
    expect(minutesPhrase(75)).toBe('1 h 15 min');
  });
});
