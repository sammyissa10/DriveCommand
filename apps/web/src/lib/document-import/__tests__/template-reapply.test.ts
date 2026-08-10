/**
 * Apply template A, then template B (quick-518).
 *
 * ---------------------------------------------------------------------------
 * THE BUG
 * ---------------------------------------------------------------------------
 * Applying A inserts A's not-on-manifest facilities as `TEMPLATE_ONLY`,
 * `skipped: true` rows — Section 8's "included, badged, one tap to keep".
 * Applying B afterwards treated those rows as part of today's document:
 * `buildTemplateDiff` ignored `skipped`, so B matched the ghost's facility, and
 * `mergeTemplateStop` cleared `skipped`. The row came back **unskipped, badged
 * New, Linked, counted in "matched"**, with no quantities and nothing to deliver —
 * a stop that existed only because of template A, promoted into the trip on
 * template B's say-so, riding along to a customer's dock.
 *
 * quick-517 recorded this as out of scope and "not currently reachable from the
 * UI". It is reachable — apply A, then Change to B through the chooser (quick-516
 * built that chooser) — and it was confirmed on screen.
 *
 * ---------------------------------------------------------------------------
 * THE SEMANTICS THESE TESTS PIN
 * ---------------------------------------------------------------------------
 * On apply, ghosts from the previous application are **re-derived, not
 * inherited**:
 *
 *   B lists the facility        →  inserted again, skipped, exactly as A left it
 *   B does not list it          →  gone
 *   a person kept it (unskipped)→  a real stop; treated like any other
 *   a document backs it         →  untouchable, whatever its origin says
 *
 * Every test below drives the real `applyTemplateToConsignments` twice and reads
 * the real `isTemplateInsertedStop` on the way back in, so what is under test is
 * the production bridge rather than a hand-set flag.
 */

import { describe, expect, it } from 'vitest';

import type { CanonicalAddress, CanonicalConsignment } from '@drivecommand/validation';
import {
  applyTemplateToConsignments,
  facilitySetForImport,
  isTemplateInsertedStop,
  rankTemplates,
  templateFacilitySet,
  type ImportStopRef,
  type TemplateStopRef,
} from '../template-matching';
import type { StopProvenance } from '../provenance';

// ---------------------------------------------------------------------------
// Fixtures — today's document has A and B; GHOST is on template A only
// ---------------------------------------------------------------------------

const ADDRESS: CanonicalAddress = {
  line1: '2200 S Ashland Ave',
  line2: null,
  city: 'Chicago',
  state: 'IL',
  postalCode: '60608',
  country: null,
};

const FACILITY_BY_NAME: Record<string, string> = {
  'Facility A': 'A',
  'Facility B': 'B',
  'Facility GHOST': 'GHOST',
  'Facility C': 'C',
};

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

/** A stop the extractor read off a page — document-backed, by definition. */
function documentStop(name: string, over: Partial<CanonicalConsignment> = {}): CanonicalConsignment {
  return {
    pageNumbers: [1],
    externalCode: null,
    name,
    address: ADDRESS,
    contact: null,
    groupLabel: null,
    appointment: null,
    references: [],
    totals: { pieces: 12 },
    lineItems: [{ description: 'Tires', quantity: 12 }],
    notes: null,
    fieldConfidence: {},
    ...over,
  } as CanonicalConsignment;
}

/** A facility link as the ladder would have written it. */
function link(via: StopProvenance['via'], facilityId: string, stopFingerprint: string): StopProvenance {
  return {
    via,
    facilityId,
    sourceCode: null,
    stopFingerprint,
    score: null,
    matchedText: null,
    at: '2026-08-10T00:00:00.000Z',
    byUserId: null,
  };
}

/** The live read: the ladder resolves the row, and the predicate classifies it. */
function reread(consignments: readonly CanonicalConsignment[]): ImportStopRef[] {
  return consignments.map((c, index) => ({
    index,
    facilityId: FACILITY_BY_NAME[c.name ?? ''] ?? null,
    name: c.name ?? '',
    skipped: Boolean(c.skipped),
    templateInserted: isTemplateInsertedStop(c),
  }));
}

const apply = (consignments: readonly CanonicalConsignment[], stops: readonly ImportStopRef[], template: TemplateStopRef[]) =>
  applyTemplateToConsignments(consignments, stops, template, {}, {
    documentDate: '2026-08-10',
    scheduledDepartureTime: null,
  });

const TODAY = [documentStop('Facility A'), documentStop('Facility B')];
const TEMPLATE_A = templateStops(['A', 'B', 'GHOST']);

/** Apply A and hand back the state a live re-read would produce. */
function afterA() {
  const stops = reread(TODAY);
  const first = apply(TODAY, stops, TEMPLATE_A);
  const stopsAfter = reread(first.consignments);
  return { consignments: first.consignments, stops: stopsAfter, result: first };
}

// ---------------------------------------------------------------------------
// The precondition
// ---------------------------------------------------------------------------

describe('applying template A', () => {
  it('inserts the not-on-manifest facility as a skipped, template-inserted ghost', () => {
    const { consignments, stops, result } = afterA();

    expect(result.diff.templateOnly).toBe(1);
    expect(consignments).toHaveLength(3);

    const ghost = consignments[2];
    expect(ghost.name).toBe('Facility GHOST');
    expect(ghost.skipped).toBe(true);
    expect(ghost.templateOrigin).toBe('TEMPLATE_ONLY');
    // No document behind it — the three conditions the predicate needs.
    expect(ghost.pageNumbers).toEqual([]);
    expect(ghost.lineItems).toEqual([]);
    expect(isTemplateInsertedStop(ghost)).toBe(true);

    // And the document's own stops are untouched by the classification.
    expect(stops.filter((s) => s.templateInserted).map((s) => s.name)).toEqual(['Facility GHOST']);
  });
});

// ---------------------------------------------------------------------------
// A → B, the facility on BOTH templates
// ---------------------------------------------------------------------------

describe('then applying template B, which also lists that facility', () => {
  const TEMPLATE_B = templateStops(['B', 'A', 'GHOST']); // different order, same set

  it('re-inserts it skipped instead of promoting it to a real stop', () => {
    const { consignments, stops } = afterA();

    const second = apply(consignments, stops, TEMPLATE_B);

    expect(second.consignments).toHaveLength(3);
    const ghost = second.consignments.find((c) => c.name === 'Facility GHOST');
    expect(ghost).toBeDefined();
    // The whole ticket, in four assertions.
    expect(ghost?.skipped).toBe(true);
    expect(ghost?.templateOrigin).toBe('TEMPLATE_ONLY');
    expect(ghost?.lineItems).toEqual([]);
    expect(second.diff.matched).toBe(2); // A and B — NOT the ghost
  });

  it('reports the ghost as re-derived rather than dropping it silently', () => {
    const { consignments, stops } = afterA();

    const second = apply(consignments, stops, TEMPLATE_B);

    expect(second.diff.templateInsertedDropped).toBe(1);
    expect(second.diff.templateOnly).toBe(1); // and put back by B
  });

  it('takes B’s order for the document stops', () => {
    const { consignments, stops } = afterA();

    const second = apply(consignments, stops, TEMPLATE_B);

    expect(second.consignments.map((c) => c.name)).toEqual([
      'Facility B',
      'Facility A',
      'Facility GHOST',
    ]);
  });
});

// ---------------------------------------------------------------------------
// A → B, the facility on NEITHER today's document nor B
// ---------------------------------------------------------------------------

describe('then applying template B, which does not list that facility', () => {
  const TEMPLATE_B = templateStops(['A', 'B']);

  it('drops the ghost entirely', () => {
    const { consignments, stops } = afterA();

    const second = apply(consignments, stops, TEMPLATE_B);

    expect(second.consignments.map((c) => c.name)).toEqual(['Facility A', 'Facility B']);
    expect(second.consignments.find((c) => c.name === 'Facility GHOST')).toBeUndefined();
    expect(second.diff.templateInsertedDropped).toBe(1);
    expect(second.diff.templateOnly).toBe(0);
  });

  it('does not carry the ghost’s facility link to the surviving stops', () => {
    const { consignments, stops } = afterA();
    // The ladder had linked the ghost at T2 on the previous read (its address came
    // from that facility), so there IS a link record keyed to its index.
    const links: Record<string, StopProvenance> = {
      '0': link('MANUAL', 'A', 'f0'),
      '2': link('NORMALISED_ADDRESS', 'GHOST', 'f2'),
    };

    const second = applyTemplateToConsignments(consignments, stops, TEMPLATE_B, links, {
      documentDate: null,
      scheduledDepartureTime: null,
    });

    const carried = Object.values(second.stopProvenance).map((p) => p.facilityId);
    expect(carried).toContain('A');
    expect(carried).not.toContain('GHOST');
  });
});

// ---------------------------------------------------------------------------
// The two things that must NEVER be removed
// ---------------------------------------------------------------------------

describe('what re-derivation must never touch', () => {
  it('keeps a ghost a person kept — un-skipping is how a human says "this is real"', () => {
    const { consignments, stops } = afterA();
    // Section 8's "one tap to keep".
    const kept = consignments.map((c) => (c.name === 'Facility GHOST' ? { ...c, skipped: false } : c));
    const keptStops = reread(kept);

    expect(keptStops.find((s) => s.name === 'Facility GHOST')?.templateInserted).toBe(false);

    const second = apply(kept, keptStops, templateStops(['A', 'B']));

    // B does not list it, so it is an ordinary import-only stop now — present,
    // appended, and NOT deleted.
    expect(second.consignments.map((c) => c.name)).toContain('Facility GHOST');
    expect(second.diff.templateInsertedDropped).toBe(0);
    expect(second.diff.importOnly).toBe(1);
  });

  it('keeps a skipped stop that came off the document', () => {
    // A dispatcher skipped a real consignment. Origin is not TEMPLATE_ONLY and a
    // document backs it — two independent reasons it survives.
    const withSkippedReal = [
      TODAY[0],
      { ...TODAY[1], skipped: true },
    ];
    const stops = reread(withSkippedReal);

    expect(stops.every((s) => !s.templateInserted)).toBe(true);

    const second = apply(withSkippedReal, stops, templateStops(['A']));

    expect(second.consignments.map((c) => c.name)).toContain('Facility B');
    expect(second.diff.templateInsertedDropped).toBe(0);
  });

  it('keeps a template-inserted row someone typed freight onto', () => {
    // Origin still says TEMPLATE_ONLY and it is still skipped, but there are line
    // items now. Removing it would delete a person's work, so the predicate
    // refuses — the conjunction is what makes every doubt keep the row.
    const { consignments } = afterA();
    const withFreight = consignments.map((c) =>
      c.name === 'Facility GHOST'
        ? { ...c, lineItems: [{ description: 'Added by hand', quantity: 3 }] }
        : c,
    ) as CanonicalConsignment[];

    expect(isTemplateInsertedStop(withFreight[2])).toBe(false);

    const second = apply(withFreight, reread(withFreight), templateStops(['A', 'B']));

    expect(second.consignments.map((c) => c.name)).toContain('Facility GHOST');
    expect(second.diff.templateInsertedDropped).toBe(0);
  });

  it('keeps a legacy row with no templateOrigin at all', () => {
    // Rows written before Phase 6 carry no origin. Never stripped — the safe
    // failure direction is a stale ghost, never deleted freight.
    const legacy = [TODAY[0], { ...TODAY[1], skipped: true, templateOrigin: null, pageNumbers: [], lineItems: [], totals: {} }] as CanonicalConsignment[];

    expect(isTemplateInsertedStop(legacy[1])).toBe(false);

    const second = apply(legacy, reread(legacy), templateStops(['A']));

    expect(second.consignments.map((c) => c.name)).toContain('Facility B');
  });
});

// ---------------------------------------------------------------------------
// Scoring through the whole sequence — 517's hysteresis test, extended
// ---------------------------------------------------------------------------

describe('scoring stays clean across A then B', () => {
  const CANDIDATES = [
    { template: 'A', facilityIds: templateFacilitySet(TEMPLATE_A) },
    { template: 'B-with-ghost', facilityIds: templateFacilitySet(templateStops(['B', 'A', 'GHOST'])) },
    { template: 'B-without', facilityIds: templateFacilitySet(templateStops(['A', 'B'])) },
    { template: 'unrelated', facilityIds: templateFacilitySet(templateStops(['C', 'GHOST'])) },
  ];

  const scores = (stops: readonly ImportStopRef[]) =>
    Object.fromEntries(
      rankTemplates(facilitySetForImport(stops), CANDIDATES).map((r) => [r.template as string, r.score.score]),
    );

  it('every template scores the same before A, after A, and after B', () => {
    const before = scores(reread(TODAY));

    const a = afterA();
    const afterApplyA = scores(a.stops);

    const b = apply(a.consignments, a.stops, templateStops(['B', 'A', 'GHOST']));
    const afterApplyB = scores(reread(b.consignments));

    expect(afterApplyA).toEqual(before);
    expect(afterApplyB).toEqual(before);
  });

  it('and the same after B drops the ghost', () => {
    const before = scores(reread(TODAY));

    const a = afterA();
    const b = apply(a.consignments, a.stops, templateStops(['A', 'B']));

    expect(scores(reread(b.consignments))).toEqual(before);
  });

  it('keeps the ranking order stable through the sequence', () => {
    const order = (stops: readonly ImportStopRef[]) =>
      rankTemplates(facilitySetForImport(stops), CANDIDATES).map((r) => r.template);

    const a = afterA();
    const b = apply(a.consignments, a.stops, templateStops(['B', 'A', 'GHOST']));

    expect(order(a.stops)).toEqual(order(reread(TODAY)));
    expect(order(reread(b.consignments))).toEqual(order(reread(TODAY)));
  });
});
