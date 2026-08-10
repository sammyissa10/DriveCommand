/**
 * A skipped stop must not move a template's score (quick-517).
 *
 * ---------------------------------------------------------------------------
 * THE BUG THIS PINS
 * ---------------------------------------------------------------------------
 * Applying a template inserts its `TEMPLATE_ONLY` rows into the stop list as
 * `skipped: true` consignments — Section 8's "included, badged, defaulted to
 * skipped, one tap to keep". On the next read the facility ladder resolves those
 * rows at T2, because the address on the row came from that very facility. So they
 * arrived back at the scorer as fully-resolved members of the import's set, and
 * every template was then scored against a run that had grown a stop nobody is
 * driving to:
 *
 * ```
 *   before apply   import 5, template 4, ∩4  →  union 5  →  4/5 = 0.80        80%
 *   after apply    import 6, template 4, ∩4  →  union 6  →  4/6 = 0.667
 *                  counts 6 v 4 = 0.333 > 0.30  →  ×0.8   =  0.533           53%
 * ```
 *
 * One skipped row did both halves of that damage at once — it added a member to
 * the union AND pushed the stop-count difference past the tolerance, firing the
 * downweight. On the live data a 0.80 template and a 0.50 template both rendered
 * 53%, which is worse than either number being wrong: the ranking stopped
 * discriminating.
 *
 * The two tests below are the two properties that matter, and neither depends on
 * a particular fixture:
 *
 *   1. INVARIANCE — adding a skipped stop changes nothing about the score.
 *   2. NO HYSTERESIS — applying a template and re-scoring returns the same
 *      numbers. This is the one the user actually hit, and it composes the real
 *      merge with the real scorer rather than asserting on a hand-built "after"
 *      state.
 *
 * Thresholds are imported, never restated (the phase's own verification step).
 */

import { describe, expect, it } from 'vitest';

import type { CanonicalAddress, CanonicalConsignment } from '@drivecommand/validation';
import {
  applyTemplateToConsignments,
  facilitySetForImport,
  isTemplateInsertedStop,
  rankTemplates,
  scoreFacilitySets,
  templateFacilitySet,
  type ImportStopRef,
  type TemplateStopRef,
} from '../template-matching';
import { TEMPLATE_AUTO_APPLY_THRESHOLD, TEMPLATE_CANDIDATE_THRESHOLD } from '../template-constants';

// ---------------------------------------------------------------------------
// Fixtures — the live shape: five stops today, two saved routes
// ---------------------------------------------------------------------------

const ADDRESS: CanonicalAddress = {
  line1: '2200 S Ashland Ave',
  line2: null,
  city: 'Chicago',
  state: 'IL',
  postalCode: '60608',
  country: null,
};

function stop(index: number, facilityId: string | null, skipped = false, templateInserted = false): ImportStopRef {
  return {
    index,
    facilityId,
    name: facilityId ? `Stop ${facilityId}` : 'Unresolved stop',
    skipped,
    templateInserted,
  };
}

function templateStop(facilityId: string, sequenceOrder: number): TemplateStopRef {
  return {
    sequenceOrder,
    facilityId,
    facilityName: `Facility ${facilityId}`,
    facilityAddress: ADDRESS,
    stopType: 'delivery',
    contactName: null,
    contactPhone: null,
    apptWindowStartOffsetMin: null,
    apptWindowEndOffsetMin: null,
    bolRequired: true,
    podRequired: true,
    specialInstructions: null,
  };
}

const templateStops = (ids: string[]) => ids.map((id, i) => templateStop(id, i + 1));

function consignment(name: string, over: Partial<CanonicalConsignment> = {}): CanonicalConsignment {
  return {
    pageNumbers: [1],
    externalCode: null,
    name,
    address: ADDRESS,
    contact: null,
    groupLabel: null,
    appointment: null,
    references: [],
    totals: {},
    lineItems: [],
    notes: null,
    fieldConfidence: {},
    ...over,
  };
}

// ---------------------------------------------------------------------------
// 1. Invariance
// ---------------------------------------------------------------------------

describe('a skipped stop does not contribute to the score', () => {
  it('scores identically with and without a skipped member', () => {
    const template = templateStops(['A', 'B', 'C', 'D']);
    const templateIds = templateFacilitySet(template);

    const today = [stop(0, 'A'), stop(1, 'B'), stop(2, 'C'), stop(3, 'D'), stop(4, 'E')];
    // The same run, plus one stop that is not being driven to — the shape the
    // merge leaves behind for a template stop that is not on today's manifest.
    const todayPlusSkipped = [...today, stop(5, 'HALL-FORD', true)];

    const without = scoreFacilitySets(facilitySetForImport(today), templateIds);
    const with_ = scoreFacilitySets(facilitySetForImport(todayPlusSkipped), templateIds);

    // Not "close to" — identical. The skipped stop is absent from the input, so
    // there is nothing for the arithmetic to round differently.
    expect(with_).toEqual(without);
  });

  it('is the difference between 80% and 53% on the reported numbers', () => {
    const template = templateStops(['A', 'B', 'C', 'D']);
    const templateIds = templateFacilitySet(template);
    const today = [stop(0, 'A'), stop(1, 'B'), stop(2, 'C'), stop(3, 'D'), stop(4, 'E')];
    const skipped = stop(5, 'HALL-FORD', true);

    const fixed = scoreFacilitySets(facilitySetForImport([...today, skipped]), templateIds);

    // ∩4, union 5, counts 5 v 4 — inside the tolerance, so no downweight.
    expect(fixed.intersection).toBe(4);
    expect(fixed.union).toBe(5);
    expect(fixed.countMismatch).toBe(false);
    expect(Math.round(fixed.score * 100)).toBe(80);
    expect(fixed.score).toBeGreaterThanOrEqual(TEMPLATE_AUTO_APPLY_THRESHOLD);

    // What it used to be: count the skipped stop and BOTH halves of the defect
    // fire — a sixth member in the union and a stop-count difference over the
    // tolerance. Asserted by scoring the un-filtered set directly, so the 53%
    // in the ticket is reproduced rather than described.
    const asItWas = scoreFacilitySets(
      [...today, skipped].map((s) => s.facilityId ?? `unresolved:${s.index}`),
      templateIds,
    );
    expect(asItWas.countMismatch).toBe(true);
    expect(Math.round(asItWas.score * 100)).toBe(53);
  });

  it('keeps two different templates apart instead of collapsing both to one number', () => {
    // The ranking's whole job. Before the fix these two both came out at 53%.
    const strong = templateStops(['A', 'B', 'C', 'D']); // ∩4 of union 5 → 0.80
    const weak = templateStops(['A', 'B', 'X']); // ∩2 of union 6 → 0.33…
    const today = [
      stop(0, 'A'),
      stop(1, 'B'),
      stop(2, 'C'),
      stop(3, 'D'),
      stop(4, 'E'),
      stop(5, 'HALL-FORD', true),
    ];

    const ranked = rankTemplates(facilitySetForImport(today), [
      { template: 'strong', facilityIds: templateFacilitySet(strong) },
      { template: 'weak', facilityIds: templateFacilitySet(weak) },
    ]);

    expect(ranked.map((r) => r.template)).toEqual(['strong', 'weak']);
    expect(ranked[0].score.score).not.toBeCloseTo(ranked[1].score.score, 2);
    expect(ranked[0].band).toBe('AUTO');
    expect(ranked[1].score.score).toBeLessThan(TEMPLATE_CANDIDATE_THRESHOLD);
  });

  it('an unresolved stop still counts — the opposite case, and it must not regress', () => {
    // `facilitySetForImport`'s other rule: a stop that IS on today's run but has
    // no building yet contributes a member that cannot match, so a half-read
    // manifest cannot score 1.0. Skipping and not-yet-known are different things.
    const template = templateFacilitySet(templateStops(['A', 'B']));
    const halfRead = [stop(0, 'A'), stop(1, 'B'), stop(2, null), stop(3, null)];

    const score = scoreFacilitySets(facilitySetForImport(halfRead), template);

    expect(score.union).toBe(4);
    expect(score.score).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// 2. No hysteresis — the regression the user hit
// ---------------------------------------------------------------------------

/**
 * Rebuild the import's stops from a list of consignments the way a live read
 * does.
 *
 * The facility for a template-only row resolves at T2 on the next read (the
 * address on the row came from that facility), which is precisely why the defect
 * was invisible until someone applied a template — so this models that, rather
 * than leaving the inserted row conveniently unresolved.
 */
function reread(consignments: readonly CanonicalConsignment[], facilityByName: Record<string, string>): ImportStopRef[] {
  return consignments.map((c, index) => ({
    index,
    facilityId: facilityByName[c.name ?? ''] ?? null,
    name: c.name ?? '',
    skipped: Boolean(c.skipped),
    // The real predicate, not a hand-set flag — this is the bridge production
    // uses (`importStopsFrom`), so the ghost detection under test is the one that
    // ships (quick-518).
    templateInserted: isTemplateInsertedStop(c),
  }));
}

describe('applying a template does not change any template score', () => {
  it('scores the same before and after the merge', () => {
    const facilityByName: Record<string, string> = {
      'Facility A': 'A',
      'Facility B': 'B',
      'Facility C': 'C',
      'Facility D': 'D',
      'Facility E': 'E',
      'Facility HALL-FORD': 'HALL-FORD',
    };

    // Today: A B C D E. The applied template also carries HALL-FORD, which is not
    // on today's document, so the merge appends it skipped.
    const consignments = [
      consignment('Facility A'),
      consignment('Facility B'),
      consignment('Facility C'),
      consignment('Facility D'),
      consignment('Facility E'),
    ];
    const before = consignments.map((c, i) => stop(i, facilityByName[c.name ?? '']));

    const applied = templateStops(['A', 'B', 'C', 'D', 'HALL-FORD']);
    const others = [
      { template: 'four-of-five', facilityIds: templateFacilitySet(templateStops(['A', 'B', 'C', 'D'])) },
      { template: 'three-of-six', facilityIds: templateFacilitySet(templateStops(['A', 'B', 'C', 'X', 'Y'])) },
      { template: 'the-applied-one', facilityIds: templateFacilitySet(applied) },
    ];

    const scoresBefore = rankTemplates(facilitySetForImport(before), others);

    // The real merge, not a hand-built "after" list.
    const result = applyTemplateToConsignments(consignments, before, applied, {}, {
      documentDate: '2026-08-09',
      scheduledDepartureTime: null,
    });

    // The merge really did add a skipped row — otherwise this test proves nothing.
    expect(result.consignments.length).toBe(6);
    expect(result.consignments.filter((c) => c.skipped)).toHaveLength(1);
    expect(result.diff.templateOnly).toBe(1);

    const after = reread(result.consignments, facilityByName);
    expect(after.filter((s) => s.skipped)).toHaveLength(1);
    // And that row IS resolved on the re-read — the condition that made the
    // inflation happen at all.
    expect(after.find((s) => s.skipped)?.facilityId).toBe('HALL-FORD');

    const scoresAfter = rankTemplates(facilitySetForImport(after), others);

    const byName = (rs: typeof scoresBefore) =>
      Object.fromEntries(rs.map((r) => [r.template as string, r.score.score]));

    expect(byName(scoresAfter)).toEqual(byName(scoresBefore));
    // And the ordering survives, which is what a dispatcher actually reads.
    expect(scoresAfter.map((r) => r.template)).toEqual(scoresBefore.map((r) => r.template));
  });

  /**
   * ---------------------------------------------------------------------------
   * WAS A CHARACTERISATION TEST. NOW AN ASSERTION. (quick-517 → quick-518)
   * ---------------------------------------------------------------------------
   * quick-517 recorded this as broken-but-out-of-scope and "not currently
   * reachable from the UI". **Both halves of that were wrong**: it is reachable
   * (apply A, then change to B through the chooser) and it was confirmed on screen.
   * The ghost came back as an ordinary stop — unskipped, badged New, Linked,
   * counted in "matched", with nothing to deliver.
   *
   * quick-518 fixed it by leaving template-inserted rows out of the diff, so a
   * second application re-derives them instead of promoting them. The assertions
   * below are the same scenario with the expectations turned the right way up.
   */
  it('re-derives a previously template-only row on a SECOND apply, and keeps it skipped', () => {
    const facilityByName: Record<string, string> = {
      'Facility A': 'A',
      'Facility B': 'B',
      'Facility GHOST': 'GHOST',
    };
    const consignments = [consignment('Facility A'), consignment('Facility B')];
    const stops = consignments.map((c, i) => stop(i, facilityByName[c.name ?? '']));
    const template = templateStops(['A', 'B', 'GHOST']);
    const candidates = [{ template: 't', facilityIds: templateFacilitySet(template) }];
    const score = (s: ImportStopRef[]) => rankTemplates(facilitySetForImport(s), candidates)[0].score.score;

    const first = applyTemplateToConsignments(consignments, stops, template, {}, {
      documentDate: null,
      scheduledDepartureTime: null,
    });
    const afterOne = reread(first.consignments, facilityByName);

    // The property this task is about: ONE apply moves nothing.
    expect(score(afterOne)).toBe(score(stops));
    expect(afterOne.filter((s) => s.skipped)).toHaveLength(1);

    const second = applyTemplateToConsignments(first.consignments, afterOne, template, {}, {
      documentDate: null,
      scheduledDepartureTime: null,
    });
    const afterTwo = reread(second.consignments, facilityByName);

    // The ghost is dropped and re-derived, so it is still exactly one skipped row
    // — not promoted, not duplicated.
    expect(afterTwo.filter((s) => s.skipped)).toHaveLength(1);
    expect(afterTwo.filter((s) => s.templateInserted)).toHaveLength(1);
    expect(second.consignments).toHaveLength(3);
    expect(second.diff.templateInsertedDropped).toBe(1);
    // Applying the same template twice is now idempotent, list and score alike.
    expect(score(afterTwo)).toBe(score(stops));
    expect(second.consignments.map((c) => [c.name, c.skipped])).toEqual(
      first.consignments.map((c) => [c.name, c.skipped]),
    );
  });
});
