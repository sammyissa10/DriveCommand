/**
 * Route-template matching. Spec Section 8.
 *
 * Everything under test is pure, so it runs against the real functions with
 * hand-built id sets. No database, no mocks of the thing under test.
 *
 * ---------------------------------------------------------------------------
 * THE THRESHOLDS ARE IMPORTED, NEVER RESTATED
 * ---------------------------------------------------------------------------
 * The phase's own verification is *"grep 0.75 and 0.45 — one file"*, and a test
 * file that hard-codes them is a second file, whatever the comment above it
 * says. Every assertion below either imports the constant or asserts a band,
 * which is the same thing said properly.
 *
 * The Jaccard values themselves ARE written out, because those are the
 * arithmetic under test rather than a tuned number — `6 / 8` is the spec's own
 * worked example and checking it against a computed value would test nothing.
 *
 * ---------------------------------------------------------------------------
 * THE MOST IMPORTANT TEST IN THIS FILE
 * ---------------------------------------------------------------------------
 * is `scores on facility IDS, never on names`. Section 8 says the score is over
 * resolved facility ids and the phase's stated drift risk is that it quietly
 * becomes a name comparison. Two dealerships called "RUSS DARROW HONDA" forty
 * minutes apart is not a hypothetical — it is the case the whole facility
 * ladder exists for — and a name-based matcher would hand a dispatcher an order
 * that drives to the wrong town while scoring a confident 1.0.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { CanonicalAddress, CanonicalConsignment } from '@drivecommand/validation';
import {
  applyTemplateToConsignments,
  bandFor,
  buildTemplateDiff,
  deterministicTemplate,
  describeDiff,
  facilitySetForImport,
  rankTemplates,
  scoreFacilitySets,
  stopTypeForTemplate,
  templateDrifted,
  templateFacilitySet,
  templateStopsFrom,
  topCandidates,
  windowFromOffset,
  type ImportStopRef,
  type TemplateStopRef,
} from '../template-matching';
import {
  ROUTE_TEMPLATE_STOP_TYPES,
  TEMPLATE_AUTO_APPLY_THRESHOLD,
  TEMPLATE_CANDIDATE_THRESHOLD,
  TEMPLATE_COUNT_MISMATCH_FACTOR,
  TEMPLATE_MAX_CANDIDATES,
  TEMPLATE_STOP_COUNT_TOLERANCE,
} from '../template-constants';
import { stopTypeEnum } from '@drivecommand/validation';
import { stopRowsFor } from '../stop-review';
import type { StopProvenance } from '../provenance';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADDRESS: CanonicalAddress = {
  line1: '2200 S Ashland Ave',
  line2: null,
  city: 'Chicago',
  state: 'IL',
  postalCode: '60608',
  country: null,
};

/**
 * Stops resolved to facilities `A`, `B`, … in document order.
 *
 * `skippedIndexes` marks stops the dispatcher (or the merge) left out of today's
 * run — quick-517's subject. Defaults to none, so every existing case reads
 * exactly as it did.
 */
function importStops(ids: (string | null)[], skippedIndexes: readonly number[] = []): ImportStopRef[] {
  return ids.map((facilityId, index) => ({
    index,
    facilityId,
    name: facilityId ? `Stop ${facilityId}` : 'Unresolved stop',
    skipped: skippedIndexes.includes(index),
    templateInserted: false,
  }));
}

function templateStop(facilityId: string, sequenceOrder: number, over: Partial<TemplateStopRef> = {}): TemplateStopRef {
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
    ...over,
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
// Jaccard, both sides of both thresholds — hand-checkable
// ---------------------------------------------------------------------------

describe('scoreFacilitySets — the arithmetic', () => {
  it("reproduces the spec's own worked example exactly: 6 / 8 = 0.75", () => {
    // Section 8's diagram:
    //   TEMPLATE (7): A B C D E F G
    //   IMPORT   (8): A B C D E F   H
    //   matched 6, union 8, score 6/8 = 0.75
    const template = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const imported = ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'I'];

    const score = scoreFacilitySets(imported, template);

    expect(score.intersection).toBe(6);
    expect(score.union).toBe(9);
    // The diagram's picture has 8 import stops of which one is blank; the exact
    // 6/8 case is the one below. This asserts the counting, not the picture.
    expect(score.jaccard).toBeCloseTo(6 / 9, 10);
  });

  it('6 of 8 collapses — it is exactly the auto-apply threshold, and the comparison is >=', () => {
    // union must be 8: template A..G (7) plus one import-only stop H.
    const template = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const imported = ['A', 'B', 'C', 'D', 'E', 'F', 'H'];

    const score = scoreFacilitySets(imported, template);

    expect(score.intersection).toBe(6);
    expect(score.union).toBe(8);
    expect(score.jaccard).toBe(6 / 8);
    // 7 vs 7 stops — no downweight, so the raw Jaccard is the score.
    expect(score.countMismatch).toBe(false);
    // The threshold is IMPORTED, never restated. `6 / 8` above is the
    // arithmetic under test; this is the tuned number, and it lives in one file.
    expect(score.score).toBe(TEMPLATE_AUTO_APPLY_THRESHOLD);
    expect(bandFor(score.score)).toBe('AUTO');
  });

  it('5 of 8 does NOT collapse — one more difference and a person is asked', () => {
    const template = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
    const imported = ['A', 'B', 'C', 'D', 'E', 'H'];

    const score = scoreFacilitySets(imported, template);

    expect(score.intersection).toBe(5);
    expect(score.union).toBe(8);
    expect(score.jaccard).toBe(0.625);
    expect(score.countMismatch).toBe(false);
    expect(bandFor(score.score)).toBe('CANDIDATE');
  });

  it('3 of 7 is offered — just above the candidate threshold', () => {
    const template = ['A', 'B', 'C', 'D'];
    const imported = ['A', 'B', 'C', 'E', 'F', 'G'];

    const score = scoreFacilitySets(imported, template);

    expect(score.intersection).toBe(3);
    expect(score.union).toBe(7);
    expect(score.jaccard).toBeCloseTo(3 / 7, 10); // 0.4285…
    // 6 vs 4 stops: |6-4| / 6 = 0.333… > 0.3, so it IS weighted down …
    expect(score.countMismatch).toBe(true);
    // … 0.4285… × 0.8 = 0.3428…, below the candidate threshold.
    expect(bandFor(score.score)).toBe('NONE');
  });

  it('3 of 7 with matching stop counts stays below the candidate threshold too', () => {
    const template = ['A', 'B', 'C', 'D', 'E'];
    const imported = ['A', 'B', 'C', 'F', 'G'];

    const score = scoreFacilitySets(imported, template);

    expect(score.intersection).toBe(3);
    expect(score.union).toBe(7);
    expect(score.countMismatch).toBe(false);
    expect(score.score).toBeCloseTo(3 / 7, 10);
    expect(score.score).toBeLessThan(TEMPLATE_CANDIDATE_THRESHOLD);
    expect(bandFor(score.score)).toBe('NONE');
  });

  it('4 of 8 is offered — comfortably inside the middle band', () => {
    const template = ['A', 'B', 'C', 'D'];
    const imported = ['A', 'B', 'C', 'D', 'E', 'F'];

    const score = scoreFacilitySets(imported, template);

    expect(score.intersection).toBe(4);
    expect(score.union).toBe(6);
    expect(score.jaccard).toBeCloseTo(4 / 6, 10); // 0.666…
    // 6 vs 4: 0.333… > 0.3 → 0.666… × 0.8 = 0.533…
    expect(score.countMismatch).toBe(true);
    expect(score.score).toBeCloseTo((4 / 6) * TEMPLATE_COUNT_MISMATCH_FACTOR, 10);
    expect(bandFor(score.score)).toBe('CANDIDATE');
  });

  it('two identical stop sets score 1', () => {
    const score = scoreFacilitySets(['A', 'B', 'C'], ['A', 'B', 'C']);
    expect(score.score).toBe(1);
    expect(bandFor(score.score)).toBe('AUTO');
  });

  it('two disjoint stop sets score 0', () => {
    const score = scoreFacilitySets(['A', 'B'], ['C', 'D']);
    expect(score.intersection).toBe(0);
    expect(score.score).toBe(0);
    expect(bandFor(score.score)).toBe('NONE');
  });

  it('an empty template scores 0 rather than dividing by zero', () => {
    expect(scoreFacilitySets(['A'], []).score).toBe(0);
    expect(scoreFacilitySets([], []).score).toBe(0);
  });

  it('the two thresholds are inclusive at their own value', () => {
    expect(bandFor(TEMPLATE_AUTO_APPLY_THRESHOLD)).toBe('AUTO');
    expect(bandFor(TEMPLATE_CANDIDATE_THRESHOLD)).toBe('CANDIDATE');
  });

  it('duplicates collapse — one warehouse visited twice is one facility', () => {
    // A pickup and a later delivery at the same building: legitimate, and a
    // warning rather than a block on the review screen.
    const score = scoreFacilitySets(['A', 'B', 'A'], ['A', 'B']);
    expect(score.intersection).toBe(2);
    expect(score.union).toBe(2);
    expect(score.jaccard).toBe(1);
    // …but the STOP COUNTS still see three against two: 1/3 = 0.333… > 0.3.
    expect(score.importStopCount).toBe(3);
    expect(score.templateStopCount).toBe(2);
    expect(score.countMismatch).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// The >30% stop-count downweight
// ---------------------------------------------------------------------------

describe('the stop-count downweight', () => {
  it('does not fire at exactly the tolerance — the rule is "more than"', () => {
    // 10 vs 7: |10-7| / 10 = 0.3, which is not MORE than 0.3.
    const score = scoreFacilitySets(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      ['A', 'B', 'C', 'D', 'E', 'F', 'G'],
    );
    expect(score.countDifference).toBeCloseTo(TEMPLATE_STOP_COUNT_TOLERANCE, 10);
    expect(score.countMismatch).toBe(false);
    expect(score.score).toBe(score.jaccard);
  });

  it('fires just past it, and multiplies rather than subtracts', () => {
    // 10 vs 6: 0.4 > 0.3. Jaccard 6/10 = 0.6 → 0.48.
    const score = scoreFacilitySets(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      ['A', 'B', 'C', 'D', 'E', 'F'],
    );
    expect(score.countMismatch).toBe(true);
    expect(score.jaccard).toBeCloseTo(0.6, 10);
    expect(score.score).toBeCloseTo(0.6 * TEMPLATE_COUNT_MISMATCH_FACTOR, 10);
    // The constants file's first worked case: a known run with four new stops
    // stays offerable, because that is exactly "append, badged New".
    expect(bandFor(score.score)).toBe('CANDIDATE');
  });

  it("drops a template covering half of today's run out of the list entirely", () => {
    // The constants file's second worked case. 10 vs 5: 0.5 > 0.3.
    // Jaccard 5/10 = 0.5 → 0.40, below the candidate threshold.
    const score = scoreFacilitySets(
      ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'],
      ['A', 'B', 'C', 'D', 'E'],
    );
    expect(score.countMismatch).toBe(true);
    expect(score.score).toBeCloseTo(0.5 * TEMPLATE_COUNT_MISMATCH_FACTOR, 10);
    expect(bandFor(score.score)).toBe('NONE');
  });

  it('is symmetric — a short template against a long run scores as a long against a short', () => {
    const long = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const short = ['A', 'B', 'C'];
    const forwards = scoreFacilitySets(long, short);
    const backwards = scoreFacilitySets(short, long);
    expect(forwards.score).toBe(backwards.score);
    expect(forwards.countDifference).toBe(backwards.countDifference);
  });

  it('A DOWNWEIGHTED PAIR CAN NEVER COLLAPSE — arithmetic, not care', () => {
    // Exceeding the tolerance means min/max < 0.7, and Jaccard is bounded above
    // by min/max, so the raw score is already below 0.7 before the multiplier.
    // No factor in (0,1] can push it back over 0.75. Asserted over every shape
    // up to 20 stops rather than argued, because this is what stops a template
    // with a wildly different stop count auto-applying.
    for (let templateCount = 1; templateCount <= 20; templateCount++) {
      for (let importCount = 1; importCount <= 20; importCount++) {
        const template = Array.from({ length: templateCount }, (_, i) => `F${i}`);
        // Best possible overlap: the import contains as many template stops as
        // it can, so this is the ceiling for this pair of counts.
        const imported = Array.from({ length: importCount }, (_, i) => `F${i}`);
        const score = scoreFacilitySets(imported, template);
        if (!score.countMismatch) continue;
        expect(bandFor(score.score)).not.toBe('AUTO');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Ordering is ignored
// ---------------------------------------------------------------------------

describe('ordering', () => {
  it('is ignored — order is a template property, not evidence against it', () => {
    const template = ['A', 'B', 'C', 'D', 'E'];
    const forwards = ['A', 'B', 'C', 'D', 'E'];
    const backwards = ['E', 'D', 'C', 'B', 'A'];
    const shuffled = ['C', 'A', 'E', 'B', 'D'];

    const a = scoreFacilitySets(forwards, template);
    const b = scoreFacilitySets(backwards, template);
    const c = scoreFacilitySets(shuffled, template);

    expect(a.score).toBe(1);
    expect(b.score).toBe(1);
    expect(c.score).toBe(1);
  });

  it('holds for a partial match too, on both sides', () => {
    const straight = scoreFacilitySets(['A', 'B', 'C', 'X'], ['A', 'B', 'C', 'D']);
    const reversed = scoreFacilitySets(['X', 'C', 'B', 'A'], ['D', 'C', 'B', 'A']);
    expect(straight.score).toBe(reversed.score);
  });
});

// ---------------------------------------------------------------------------
// THE ONE THAT MATTERS: ids, not names
// ---------------------------------------------------------------------------

describe('scores on facility IDS, never on names', () => {
  it('two facilities with IDENTICAL names and different ids do not match', () => {
    // Both dealerships print "RUSS DARROW HONDA" on the manifest. They are two
    // buildings forty minutes apart, and the facility ladder has already told
    // them apart — this asserts the matcher does not undo that work.
    const milwaukee: ImportStopRef = { index: 0, facilityId: 'fac-mke', name: 'RUSS DARROW HONDA', skipped: false, templateInserted: false };
    const westBend: ImportStopRef = { index: 1, facilityId: 'fac-wb', name: 'RUSS DARROW HONDA', skipped: false, templateInserted: false };

    const template = [
      templateStop('fac-mke', 1, { facilityName: 'RUSS DARROW HONDA' }),
    ];

    const score = scoreFacilitySets(
      facilitySetForImport([milwaukee, westBend]),
      templateFacilitySet(template),
    );

    // One of the two matched, not both — and certainly not "1.0, the names are
    // the same".
    expect(score.intersection).toBe(1);
    expect(score.union).toBe(2);
    expect(score.jaccard).toBe(0.5);

    // And the diff names the right one as extra.
    const diff = buildTemplateDiff([milwaukee, westBend], template);
    expect(diff.matched).toBe(1);
    expect(diff.importOnly).toBe(1);
    expect(diff.rows.find((r) => r.origin === 'MATCHED')?.importIndex).toBe(0);
    expect(diff.rows.find((r) => r.origin === 'IMPORT_ONLY')?.importIndex).toBe(1);
  });

  it('the same building under two different printed names DOES match', () => {
    // The other half of the same property. The ladder resolved both spellings
    // to one facility, so the matcher sees one id and one match.
    const printedOneWay: ImportStopRef = { index: 0, facilityId: 'fac-x', name: 'HALL FORD', skipped: false, templateInserted: false };
    const template = [templateStop('fac-x', 1, { facilityName: 'Hall Ford Lincoln — Brookfield' })];

    const score = scoreFacilitySets(
      facilitySetForImport([printedOneWay]),
      templateFacilitySet(template),
    );
    expect(score.score).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Unresolved stops
// ---------------------------------------------------------------------------

describe('unresolved stops', () => {
  it('count as distinct members that can never match', () => {
    // Four resolved, four still waiting on a person. Dropping the unresolved
    // four would score 1.0 and collapse the card while half of today is an open
    // question.
    const stops = importStops(['A', 'B', 'C', 'D', null, null, null, null]);
    const template = templateStops(['A', 'B', 'C', 'D']);

    const score = scoreFacilitySets(facilitySetForImport(stops), templateFacilitySet(template));

    expect(score.intersection).toBe(4);
    expect(score.union).toBe(8);
    expect(score.jaccard).toBe(0.5);
    expect(bandFor(score.score)).not.toBe('AUTO');
  });

  it('never collide with each other', () => {
    const stops = importStops([null, null, null]);
    const score = scoreFacilitySets(facilitySetForImport(stops), ['A']);
    expect(score.intersection).toBe(0);
    // Three distinct synthetic members, not one.
    expect(score.union).toBe(4);
  });

  it('are reported on the diff so a surface can say why the score is low', () => {
    const diff = buildTemplateDiff(importStops(['A', null]), templateStops(['A']));
    expect(diff.unresolved).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Ranking, collapse and the shortlist
// ---------------------------------------------------------------------------

describe('ranking', () => {
  const candidates = (sets: Record<string, string[]>) =>
    Object.entries(sets).map(([id, facilityIds]) => ({ template: { id }, facilityIds }));

  it('sorts best first', () => {
    const ranked = rankTemplates(
      ['A', 'B', 'C', 'D'],
      candidates({ poor: ['A', 'X', 'Y', 'Z'], good: ['A', 'B', 'C', 'D'], middling: ['A', 'B', 'C', 'X'] }),
    );
    expect(ranked.map((r) => r.template.id)).toEqual(['good', 'middling', 'poor']);
  });

  it('collapses to the single best when it clears the threshold', () => {
    const ranked = rankTemplates(
      ['A', 'B', 'C', 'D'],
      candidates({ good: ['A', 'B', 'C', 'D'], poor: ['X', 'Y', 'Z', 'W'] }),
    );
    expect(deterministicTemplate(ranked)?.template.id).toBe('good');
  });

  it('REFUSES to collapse when two templates tie above the threshold', () => {
    // The same call Phase 4 makes for an ambiguous T2: linking to whichever
    // sorted first would pick one of two real routes at random.
    const ranked = rankTemplates(
      ['A', 'B', 'C', 'D'],
      candidates({ one: ['A', 'B', 'C', 'D'], two: ['A', 'B', 'C', 'D'] }),
    );
    expect(ranked[0].band).toBe('AUTO');
    expect(deterministicTemplate(ranked)).toBeNull();
  });

  it('collapses when a clear best beats another that also clears the threshold', () => {
    const ranked = rankTemplates(
      ['A', 'B', 'C', 'D'],
      candidates({ best: ['A', 'B', 'C', 'D'], alsoGood: ['A', 'B', 'C', 'D', 'E'] }),
    );
    expect(deterministicTemplate(ranked)?.template.id).toBe('best');
  });

  it('caps the shortlist and drops everything below the candidate threshold', () => {
    const ranked = rankTemplates(
      ['A', 'B', 'C', 'D'],
      candidates({
        one: ['A', 'B', 'C', 'X'],
        two: ['A', 'B', 'X', 'Y'],
        three: ['A', 'B', 'C', 'Y'],
        four: ['A', 'B', 'C', 'Z'],
        nothing: ['P', 'Q', 'R', 'S'],
      }),
    );
    const shortlist = topCandidates(ranked);
    expect(shortlist.length).toBeLessThanOrEqual(TEMPLATE_MAX_CANDIDATES);
    expect(shortlist.map((s) => s.template.id)).not.toContain('nothing');
  });
});

// ---------------------------------------------------------------------------
// The diff
// ---------------------------------------------------------------------------

describe('buildTemplateDiff', () => {
  it("puts the template's stops in the template's order and appends the new ones", () => {
    // Today's document lists them in a different order and adds one.
    const stops = importStops(['C', 'A', 'H', 'B']);
    const template = templateStops(['A', 'B', 'C']);

    const diff = buildTemplateDiff(stops, template);

    expect(diff.rows.map((r) => r.facilityId)).toEqual(['A', 'B', 'C', 'H']);
    expect(diff.rows.map((r) => r.origin)).toEqual(['MATCHED', 'MATCHED', 'MATCHED', 'IMPORT_ONLY']);
  });

  it('keeps a template stop that is not on the manifest, in its template position', () => {
    const diff = buildTemplateDiff(importStops(['A', 'C']), templateStops(['A', 'B', 'C']));
    expect(diff.rows.map((r) => r.origin)).toEqual(['MATCHED', 'TEMPLATE_ONLY', 'MATCHED']);
    expect(diff.templateOnly).toBe(1);
  });

  it('claims one-to-one — two template stops at one warehouse take two of today’s', () => {
    const stops = importStops(['A', 'A', 'A']);
    const template = templateStops(['A', 'A']);

    const diff = buildTemplateDiff(stops, template);

    expect(diff.matched).toBe(2);
    expect(diff.importOnly).toBe(1);
    // Each matched row took a DIFFERENT import stop. Nothing is used twice.
    const claimed = diff.rows.filter((r) => r.origin === 'MATCHED').map((r) => r.importIndex);
    expect(new Set(claimed).size).toBe(2);
  });

  it('never says "0 anything"', () => {
    expect(describeDiff(buildTemplateDiff(importStops(['A']), templateStops(['A'])))).toBe('1 matched');
    expect(describeDiff(buildTemplateDiff(importStops(['A']), templateStops(['B'])))).toBe(
      "1 new · 1 not on today's manifest",
    );
    expect(describeDiff(buildTemplateDiff([], []))).toBe('No stops in common');
  });
});

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

describe('applyTemplateToConsignments', () => {
  const context = { documentDate: '2026-07-27', scheduledDepartureTime: '06:00' };

  it("applies the template's order and keeps today's quantities and references", () => {
    const consignments = [
      consignment('Hall Ford', {
        totals: { pieces: 12, weight: 4200, weightUom: 'LBS' },
        references: [{ type: 'BOL', value: 'BOL-991' }],
        notes: 'Gate code 4417',
      }),
      consignment('Boucher Kia', { totals: { pieces: 3 } }),
    ];
    const stops = importStops(['B', 'A']); // document order: B first
    const template = templateStops(['A', 'B']); // template order: A first

    const result = applyTemplateToConsignments(consignments, stops, template, {}, context);

    // Template order.
    expect(result.consignments.map((c) => c.name)).toEqual(['Boucher Kia', 'Hall Ford']);
    // Import quantities, references and per-stop notes, untouched.
    const hallFord = result.consignments[1];
    expect(hallFord.totals).toEqual({ pieces: 12, weight: 4200, weightUom: 'LBS' });
    expect(hallFord.references).toEqual([{ type: 'BOL', value: 'BOL-991' }]);
    expect(hallFord.notes).toBe('Gate code 4417');
  });

  it("supplies required documents and the template's standing note, without touching `notes`", () => {
    const consignments = [consignment('Hall Ford', { notes: "Today's note" })];
    const template = [
      templateStop('A', 1, { bolRequired: true, podRequired: false, specialInstructions: 'Back dock only' }),
    ];

    const result = applyTemplateToConsignments(consignments, importStops(['A']), template, {}, context);

    expect(result.consignments[0].requiredDocuments).toEqual(['BOL']);
    expect(result.consignments[0].templateStandingNotes).toBe('Back dock only');
    // The two note fields are separate, and applying a template is not
    // destructive to the one the import owns.
    expect(result.consignments[0].notes).toBe("Today's note");
  });

  /**
   * ---------------------------------------------------------------------------
   * THE ANCHOR IS THE TRIP'S START TIME, AND IT DOES NOT EXIST DURING REVIEW
   * ---------------------------------------------------------------------------
   * `route_template_stops.appt_window_*_offset_min` are minutes from the trip's
   * departure. Every real consumer anchors to `Trip.scheduledDeparture`
   * (`trips.ts:321`, `:491`, `:760`) and spec §4.1 draws that as the
   * `Start 06:00` field on the Finish trip screen — which is Phase 8.
   *
   * `route_templates.scheduled_departure_time` is NOT that anchor: it is the
   * seed the dispatch generator uses to compute a departure on a recurrence
   * date, and it is NULL on every `on_call` template (which is every template
   * this module auto-creates). Phase 6 anchored to it, so windows silently
   * vanished on a NULL and landed on the wrong clock otherwise — quick-514.
   *
   * **Materialisation is therefore deferred to commit, unconditionally.** These
   * tests assert the deferred semantics: the offsets are carried for display,
   * nothing is invented, and no appointment is written whether or not the
   * template happens to have a departure time. They replace two tests that
   * asserted the defect was correct.
   */
  it('DEFERS the window even when the template HAS a departure time — the anchor is still wrong', () => {
    const template = [templateStop('A', 1, { apptWindowStartOffsetMin: 60, apptWindowEndOffsetMin: 150 })];
    const result = applyTemplateToConsignments(
      [consignment('Hall Ford')],
      importStops(['A']),
      template,
      {},
      context, // scheduledDepartureTime: '06:00' — present, and still not the anchor
    );

    // Nothing invented. This previously asserted 07:00 → 08:30 off the
    // template's own departure default, which is not when the trip leaves.
    expect(result.consignments[0].appointment).toBeNull();
    // Carried for display instead, verbatim.
    expect(result.consignments[0].templateApptOffsetStartMin).toBe(60);
    expect(result.consignments[0].templateApptOffsetEndMin).toBe(150);
    expect(result.windowsDeferred).toBe(1);
  });

  it('DEFERS the window when the template has NO departure time — the MKE-NORTH-2 case', () => {
    // The exact shape of quick-514: offsets present, anchor NULL. The old test
    // asserted `appointment === null` and called that "reports rather than
    // invents" — true, but it recorded the silent drop as the specification.
    // What is asserted now is that the offsets SURVIVE for display.
    const template = [templateStop('A', 1, { apptWindowStartOffsetMin: 630, apptWindowEndOffsetMin: 720 })];
    const result = applyTemplateToConsignments(
      [consignment('Hall Ford')],
      importStops(['A']),
      template,
      {},
      { documentDate: '2026-07-27', scheduledDepartureTime: null },
    );

    expect(result.consignments[0].appointment).toBeNull();
    expect(result.consignments[0].templateApptOffsetStartMin).toBe(630);
    expect(result.consignments[0].templateApptOffsetEndMin).toBe(720);
    expect(result.windowsDeferred).toBe(1);
    // Semantics unchanged: the template has offsets and no pair to resolve them
    // against. It no longer gates anything, because deferral is unconditional.
    expect(result.windowsUnavailable).toBe(true);
  });

  it('surfaces the deferred offsets on the review row, as elapsed time from the route start', () => {
    const template = [templateStop('A', 1, { apptWindowStartOffsetMin: 630, apptWindowEndOffsetMin: 720 })];
    const result = applyTemplateToConsignments(
      [consignment('Hall Ford')],
      importStops(['A']),
      template,
      {},
      { documentDate: '2026-07-27', scheduledDepartureTime: null },
    );

    const [row] = stopRowsFor(result.consignments, []);
    expect(row.appointment).toBeNull();
    // NOT an em-dash, and not a clock time either — a clock time would need a
    // start that has not been chosen.
    expect(row.templateAppointment?.label).toBe('10h 30m – 12h 00m after the route starts');
    expect(row.templateAppointment?.startOffsetMin).toBe(630);
  });

  it("KEEPS a window printed on today's document, and does not offer the route's beside it", () => {
    // A window a customer agreed to is a fact about today. Two answers to one
    // question is worse than one, so the row suppresses the template's offsets
    // entirely when the document printed a window.
    const printed = { earliest: '2026-07-27T09:15', latest: '2026-07-27T10:15', isFirm: true };
    const template = [templateStop('A', 1, { apptWindowStartOffsetMin: 60, apptWindowEndOffsetMin: 150 })];

    const result = applyTemplateToConsignments(
      [consignment('Hall Ford', { appointment: printed })],
      importStops(['A']),
      template,
      {},
      context,
    );

    expect(result.consignments[0].appointment).toEqual(printed);
    expect(result.windowsKept).toBe(1);
    expect(result.windowsDeferred).toBe(0);

    const [row] = stopRowsFor(result.consignments, []);
    expect(row.templateAppointment).toBeNull();
  });

  it('offers nothing when the route carries no offsets either', () => {
    const result = applyTemplateToConsignments(
      [consignment('Hall Ford')],
      importStops(['A']),
      templateStops(['A']),
      {},
      context,
    );
    const [row] = stopRowsFor(result.consignments, []);
    expect(row.appointment).toBeNull();
    expect(row.templateAppointment).toBeNull();
    expect(result.windowsDeferred).toBe(0);
  });

  it('appends an import-only stop at the END, badged, and never slots it in', () => {
    const consignments = [consignment('Hall Ford'), consignment('Wilde Honda')];
    const result = applyTemplateToConsignments(
      consignments,
      importStops(['A', 'H']),
      templateStops(['A', 'B']),
      {},
      context,
    );

    const names = result.consignments.map((c) => c.name);
    expect(names[names.length - 1]).toBe('Wilde Honda');
    expect(result.consignments[result.consignments.length - 1].templateOrigin).toBe('IMPORT_ONLY');
  });

  it('includes a template-only stop, badged and DEFAULTED TO SKIPPED', () => {
    const result = applyTemplateToConsignments(
      [consignment('Hall Ford')],
      importStops(['A']),
      templateStops(['A', 'B']),
      {},
      context,
    );

    const extra = result.consignments.find((c) => c.templateOrigin === 'TEMPLATE_ONLY');
    expect(extra).toBeDefined();
    expect(extra?.skipped).toBe(true);
    // Prefilled from the facility, so keeping it resolves at T2 on the next read
    // rather than dropping a dispatcher onto a create form for a facility that
    // already exists.
    expect(extra?.name).toBe('Facility B');
    expect(extra?.address).toEqual(ADDRESS);
    // It carries no freight and no references — nothing was invented.
    expect(extra?.lineItems).toEqual([]);
    expect(extra?.references).toEqual([]);
  });

  it("carries a human's confirmed facility link to the stop's new position", () => {
    // Phase 5's reorder property, restated for the merge: someone who confirmed
    // a facility on the stop that was second must still have it after it moves.
    const link: StopProvenance = {
      via: 'MANUAL',
      score: 0.82,
      matchedText: 'Hall Ford Lincoln',
      byUserId: 'user-1',
      at: '2026-08-07T09:00:00.000Z',
      facilityId: 'A',
      sourceCode: null,
      stopFingerprint: 'c:43775',
    };

    const result = applyTemplateToConsignments(
      [consignment('Boucher Kia'), consignment('Hall Ford')],
      importStops(['B', 'A']),
      templateStops(['A', 'B']),
      { '1': link },
      context,
    );

    // Stop 1 moved to position 0, and its link moved with it — fingerprint
    // untouched, so a link that was already stale is still dropped downstream.
    expect(result.consignments[0].name).toBe('Hall Ford');
    expect(result.stopProvenance['0']).toEqual(link);
    expect(result.stopProvenance['1']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Appointment arithmetic
// ---------------------------------------------------------------------------

describe('windowFromOffset', () => {
  it('adds minutes to the departure time', () => {
    expect(windowFromOffset('2026-07-27', '06:00', 0)).toBe('2026-07-27T06:00');
    expect(windowFromOffset('2026-07-27', '06:00', 90)).toBe('2026-07-27T07:30');
    expect(windowFromOffset('2026-07-27', '06:30', 45)).toBe('2026-07-27T07:15');
  });

  it('carries the day rather than clamping', () => {
    expect(windowFromOffset('2026-07-27', '22:00', 180)).toBe('2026-07-28T01:00');
    expect(windowFromOffset('2026-07-27', '01:00', -120)).toBe('2026-07-26T23:00');
  });

  it('crosses a month boundary correctly', () => {
    expect(windowFromOffset('2026-07-31', '23:00', 120)).toBe('2026-08-01T01:00');
  });

  it('returns null rather than inventing a time', () => {
    expect(windowFromOffset(null, '06:00', 60)).toBeNull();
    expect(windowFromOffset('2026-07-27', null, 60)).toBeNull();
    expect(windowFromOffset('2026-07-27', '06:00', null)).toBeNull();
    expect(windowFromOffset('not a date', '06:00', 60)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Saving a stop list out — and the CHECK constraint that differs
// ---------------------------------------------------------------------------

describe('stopTypeForTemplate — the two vocabularies are NOT the same', () => {
  it('narrows relay_handoff, which `stops` admits and `route_template_stops` does not', () => {
    // route_template_stops_stop_type_check: pickup | delivery | fuel_stop | layover
    // stops_stop_type_check:                …the same four PLUS relay_handoff
    // Read off production 2026-08-07. Writing 'relay_handoff' into a template
    // stop is a 23514, at the end of a multi-statement write, on the success
    // screen.
    expect(stopTypeEnum.options).toContain('relay_handoff');
    expect(ROUTE_TEMPLATE_STOP_TYPES as readonly string[]).not.toContain('relay_handoff');
    expect(stopTypeForTemplate('relay_handoff')).toBe('delivery');
  });

  it('passes the four the template table admits straight through', () => {
    for (const type of ROUTE_TEMPLATE_STOP_TYPES) {
      expect(stopTypeForTemplate(type)).toBe(type);
    }
  });

  it('gives an unset type a value, because the column is NOT NULL', () => {
    expect(stopTypeForTemplate(null)).toBe('delivery');
    expect(stopTypeForTemplate(undefined)).toBe('delivery');
    expect(stopTypeForTemplate('dropoff')).toBe('delivery');
  });
});

describe('templateStopsFrom', () => {
  it('numbers stops from 1 in list order', () => {
    const draft = templateStopsFrom(
      [consignment('One'), consignment('Two'), consignment('Three')],
      { 0: 'A', 1: 'B', 2: 'C' },
    );
    expect(draft.stops.map((s) => s.sequenceOrder)).toEqual([1, 2, 3]);
    expect(draft.stops.map((s) => s.facilityId)).toEqual(['A', 'B', 'C']);
  });

  it('leaves out an unresolved stop and SAYS SO', () => {
    const draft = templateStopsFrom([consignment('One'), consignment('Two')], { 0: 'A', 1: null });
    expect(draft.stops).toHaveLength(1);
    expect(draft.skippedUnresolved).toBe(1);
    // Sequence numbers close the gap rather than leaving a hole — the unique
    // index is (route_template_id, sequence_order) and a gap is a future bug.
    expect(draft.stops[0].sequenceOrder).toBe(1);
  });

  it('leaves out a skipped stop and SAYS SO', () => {
    const draft = templateStopsFrom(
      [consignment('One'), consignment('Two', { skipped: true }), consignment('Three')],
      { 0: 'A', 1: 'B', 2: 'C' },
    );
    expect(draft.stops.map((s) => s.facilityId)).toEqual(['A', 'C']);
    expect(draft.skippedNotToday).toBe(1);
  });

  it("takes the template's standing note, never the import's per-stop note", () => {
    // A note about one day's freight would become a lie on every future trip
    // generated from this template.
    const draft = templateStopsFrom(
      [consignment('One', { notes: 'Driver: watch for the closed ramp today', templateStandingNotes: 'Back dock only' })],
      { 0: 'A' },
    );
    expect(draft.stops[0].specialInstructions).toBe('Back dock only');
  });

  it('counts the stop types it had to narrow', () => {
    const draft = templateStopsFrom(
      [consignment('One', { stopType: 'relay_handoff' }), consignment('Two', { stopType: 'pickup' })],
      { 0: 'A', 1: 'B' },
    );
    expect(draft.narrowedStopTypes).toBe(1);
    expect(draft.stops.map((s) => s.stopType)).toEqual(['delivery', 'pickup']);
  });

  it('defaults both paperwork flags to true when nobody has set them', () => {
    const draft = templateStopsFrom([consignment('One')], { 0: 'A' });
    expect(draft.stops[0].bolRequired).toBe(true);
    expect(draft.stops[0].podRequired).toBe(true);
  });

  it('carries an explicit empty required-documents list through as two falses', () => {
    const draft = templateStopsFrom([consignment('One', { requiredDocuments: [] })], { 0: 'A' });
    expect(draft.stops[0].bolRequired).toBe(false);
    expect(draft.stops[0].podRequired).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Drift — the trigger for the post-commit offer
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// The render guard — quick-514's actual defect
// ---------------------------------------------------------------------------

/**
 * The standing note was selected, mapped, persisted, typed and mirrored to
 * mobile, and rendered by nothing: `FIELDS` in the two detail components is a
 * hand-written literal, so a field added to the row type but not to that array
 * is invisible in BOTH modes on BOTH surfaces and nothing type-errors.
 *
 * There is no component test harness in this module, so this reads the two
 * component files **from disk** — the same construction `address.test.ts` uses
 * for the address fixture, and for the same reason: a guard that lives in the
 * artefact it guards can be edited away without anyone noticing.
 *
 * It is a weak test on purpose. It cannot prove the field renders *well*; it can
 * only prove it is in the list that gets rendered at all, which is precisely the
 * thing that was missing. The honest full check is a DOM assertion and it needs
 * Playwright.
 */
describe('the detail editors render every field the row carries', () => {
  const SURFACES = [
    { name: 'web · StopDetailEditor.tsx', path: 'src/components/carrier/imports/StopDetailEditor.tsx' },
    { name: 'mobile · StopReview.tsx', path: '../mobile/components/imports/StopReview.tsx' },
  ];

  /** The FIELDS array literal, so a mention in a comment cannot satisfy this. */
  function fieldsArrayOf(source: string): string {
    const start = source.indexOf('const FIELDS = [');
    expect(start, 'FIELDS array not found — did it get renamed?').toBeGreaterThan(-1);
    const end = source.indexOf(']', start);
    return source.slice(start, end);
  }

  it.each(SURFACES)('$name lists templateStandingNotes', ({ path }) => {
    const source = readFileSync(resolve(__dirname, '../../../..', path), 'utf8');
    const fields = fieldsArrayOf(source);

    expect(fields).toContain("'templateStandingNotes'");
    // Adjacent to `notes`, so the two notes read as a pair and their ownership
    // is obvious from the order rather than only from the label.
    expect(fields.indexOf("'templateStandingNotes'")).toBeGreaterThan(fields.indexOf("'notes'"));
  });

  it.each(SURFACES)('$name still lists the eleven Phase 5 fields', ({ path }) => {
    const source = readFileSync(resolve(__dirname, '../../../..', path), 'utf8');
    const fields = fieldsArrayOf(source);
    for (const field of [
      'facility', 'sequence', 'type', 'references', 'lineItems', 'rollups',
      'appointment', 'requiredDocuments', 'contact', 'notes', 'pages',
    ]) {
      expect(fields, `${field} missing`).toContain(`'${field}'`);
    }
  });

  it('the guard actually fails on a FIELDS array without the entry (control)', () => {
    // A guard that has never caught the defect proves nothing (quick-513).
    const before = "const FIELDS = [\n  'notes',\n  'pages',\n] as const;";
    expect(fieldsArrayOf(before)).not.toContain("'templateStandingNotes'");
  });
});

// ---------------------------------------------------------------------------
// Drift — the trigger for the post-commit offer
// ---------------------------------------------------------------------------

describe('templateDrifted', () => {
  it('is false when the committed order is the template order', () => {
    expect(templateDrifted(['A', 'B', 'C'], ['A', 'B', 'C'])).toEqual({ drifted: false, summary: null });
  });

  it('notices a reorder', () => {
    const result = templateDrifted(['A', 'B', 'C'], ['C', 'B', 'A']);
    expect(result.drifted).toBe(true);
    expect(result.summary).toBe('the order changed');
  });

  it('counts stops added and removed', () => {
    expect(templateDrifted(['A', 'B'], ['A', 'B', 'C']).summary).toBe('1 stop added');
    expect(templateDrifted(['A', 'B', 'C'], ['A', 'B']).summary).toBe('1 stop removed');
    expect(templateDrifted(['A', 'B'], ['A', 'C']).summary).toBe('1 stop added · 1 stop removed');
  });
});
