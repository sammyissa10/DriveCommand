/**
 * The ladder, rung by rung, and the hard rule that guards it.
 *
 * `resolveFacilityTier` and `decideStops` are both pure, so everything here runs
 * against the real functions with hand-built candidates and a hand-built import
 * record. No database, no mocks of the thing under test.
 *
 * The most important test in this file is the last one in the first block:
 * **no T3 or T4 verdict can yield a facility to link to.** Spec Section 7 calls
 * auto-creating on T3 "the most damaging failure in the build", and the defence
 * is structural — the T3 and T4 members of the verdict union carry no facility
 * id at all, so there is nothing for a future edit to reach for.
 */

import { describe, expect, it } from 'vitest';

import {
  autoLinkTarget,
  normaliseSourceCode,
  resolveFacilityTier,
  type LadderContext,
  type LadderFacility,
} from '../facility-ladder';
import { decideStops } from '../facility-lookup';
import {
  FACILITY_FUZZY_THRESHOLD,
  FACILITY_MAX_CANDIDATES,
  FACILITY_TYPE_FOR_ROLE,
} from '../facility-constants';
import { stopFingerprint } from '../provenance';
import type { ImportRecord } from '../persistence';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const RUSS_DARROW: LadderFacility = {
  id: 'fac-russ',
  name: 'Russ Darrow Nissan',
  facilityType: 'customer_site',
  addressLine1: '12000 W Capitol Dr',
  addressLine2: null,
  city: 'Wauwatosa',
  state: 'WI',
  zip: '53222',
};

const BOUCHER: LadderFacility = {
  id: 'fac-boucher',
  name: 'Boucher Kia',
  facilityType: 'customer_site',
  addressLine1: '4141 S 108th St',
  addressLine2: null,
  city: 'Greenfield',
  state: 'WI',
  zip: '53228',
};

const context = (over: Partial<LadderContext> = {}): LadderContext => ({
  candidates: [RUSS_DARROW, BOUCHER],
  referencesByCode: new Map(),
  ...over,
});

const stop = (over: Partial<Parameters<typeof resolveFacilityTier>[0]> = {}) => ({
  sourceCode: null,
  name: 'Russ Darrow Nissan',
  address: {
    line1: '12000 W Capitol Dr',
    city: 'Wauwatosa',
    state: 'WI',
    postalCode: '53222',
  },
  ...over,
});

// ---------------------------------------------------------------------------

describe('the four-tier ladder', () => {
  it('T1 — a confirmed external reference links silently, and outranks everything', () => {
    const verdict = resolveFacilityTier(
      // The address here matches Boucher, not Russ Darrow. The code must win:
      // it is a decision a person already made about this exact code for this
      // exact client, and today's address may simply be printed wrong.
      stop({ sourceCode: '43775', address: { line1: '4141 S 108th St', city: 'Greenfield', state: 'WI', postalCode: '53228' } }),
      context({ referencesByCode: new Map([['43775', RUSS_DARROW.id]]) }),
    );

    expect(verdict.tier).toBe('T1');
    expect(autoLinkTarget(verdict)).toEqual({ facilityId: RUSS_DARROW.id, tier: 'T1' });
  });

  it('T1 — a reference pointing at a facility that is no longer a candidate does not resurrect it', () => {
    // Soft-deleted and driver-residence facilities are filtered out of
    // `candidates` upstream. A dangling reference must fall through, not link.
    const verdict = resolveFacilityTier(
      stop({ sourceCode: '43775' }),
      context({ referencesByCode: new Map([['43775', 'fac-deleted']]) }),
    );
    expect(verdict.tier).not.toBe('T1');
  });

  it('T2 — an address that normalises equal links silently and carries the backfill code', () => {
    const verdict = resolveFacilityTier(
      stop({
        sourceCode: '43775',
        // Abbreviations, ZIP+4, all-caps, a facility name in front of it.
        address: { line1: 'RUSS DARROW NISSAN', line2: '12000 West Capitol Drive', city: 'WAUWATOSA', state: 'Wisconsin', postalCode: '53222-1100' },
      }),
      context(),
    );

    expect(verdict.tier).toBe('T2');
    expect(autoLinkTarget(verdict)).toEqual({ facilityId: RUSS_DARROW.id, tier: 'T2' });
    if (verdict.tier === 'T2') expect(verdict.backfillCode).toBe('43775');
  });

  it('T2 — two facilities on one normalised address is a question, not a match', () => {
    const twin: LadderFacility = { ...RUSS_DARROW, id: 'fac-twin', name: 'Russ Darrow Kia' };
    const verdict = resolveFacilityTier(stop(), context({ candidates: [RUSS_DARROW, twin] }));

    // Silently picking whichever sorted first would link one of two real
    // buildings at random.
    expect(verdict.tier).toBe('T3');
    expect(autoLinkTarget(verdict)).toBeNull();
    if (verdict.tier === 'T3') expect(verdict.proposals).toHaveLength(2);
  });

  it('T3 — a near match proposes, shows the score and the differing fields, and cannot be linked', () => {
    const verdict = resolveFacilityTier(
      stop({ address: { line1: '12000 W Capitol Dr', city: 'Wauwatosa', state: 'WI', postalCode: '53226' } }),
      context(),
    );

    expect(verdict.tier).toBe('T3');
    expect(autoLinkTarget(verdict)).toBeNull();
    if (verdict.tier === 'T3') {
      expect(verdict.requiresHumanTap).toBe(true);
      expect(verdict.proposals[0].facilityId).toBe(RUSS_DARROW.id);
      expect(verdict.proposals[0].score).toBeGreaterThanOrEqual(FACILITY_FUZZY_THRESHOLD);
      expect(verdict.proposals[0].score).toBeLessThan(1);
      expect(verdict.proposals[0].differences.join(' ')).toContain('Postcode');
      // "None of these" is a real answer, so the create form comes with it.
      expect(verdict.prefill.name).toBe('Russ Darrow Nissan');
    }
  });

  it('T4 — nothing close proposes nothing, and offers a form pre-filled from the document', () => {
    const verdict = resolveFacilityTier(
      stop({
        name: 'Hall Ford Lincoln',
        sourceCode: '51002',
        address: { line1: '1200 E Sumner St', city: 'Hartford', state: 'WI', postalCode: '53027' },
      }),
      context(),
    );

    expect(verdict.tier).toBe('T4');
    expect(autoLinkTarget(verdict)).toBeNull();
    if (verdict.tier === 'T4') {
      expect(verdict.requiresHumanTap).toBe(true);
      expect(verdict.prefill).toMatchObject({
        name: 'Hall Ford Lincoln',
        addressLine1: '1200 E Sumner St',
        city: 'Hartford',
        state: 'WI',
        zip: '53027',
        sourceCode: '51002',
      });
    }
  });

  it('an empty tenant produces T4 for everything and never a link target', () => {
    const verdict = resolveFacilityTier(stop(), context({ candidates: [] }));
    expect(verdict.tier).toBe('T4');
    expect(autoLinkTarget(verdict)).toBeNull();
  });

  /**
   * The hard rule, asserted over every tier at once rather than tier by tier:
   * whatever the ladder is handed, a link target exists only for T1 and T2.
   */
  it('HARD RULE — no T3 or T4 verdict yields a facility to link', () => {
    const inputs = [
      stop(), // T2
      stop({ address: { line1: '12000 W Capitol Dr', city: 'Wauwatosa', state: 'WI', postalCode: '53226' } }), // T3
      stop({ name: 'Somewhere Else', address: { line1: '400 N Main St', city: 'Rockford', state: 'IL', postalCode: '61101' } }), // T4
      stop({ sourceCode: '43775' }), // T1-ish
    ];

    for (const input of inputs) {
      const verdict = resolveFacilityTier(input, context({ referencesByCode: new Map([['43775', RUSS_DARROW.id]]) }));
      const target = autoLinkTarget(verdict);
      if (verdict.tier === 'T3' || verdict.tier === 'T4') {
        expect(target).toBeNull();
        expect(verdict.requiresHumanTap).toBe(true);
        expect(verdict.autoLink).toBe(false);
        // And there is no id on the verdict for anything to reach around it.
        expect('facilityId' in verdict).toBe(false);
      } else {
        expect(target).not.toBeNull();
        expect(verdict.autoLink).toBe(true);
      }
    }
  });

  it('offers at most the configured number of candidates, best first', () => {
    const many: LadderFacility[] = Array.from({ length: 6 }, (_, i) => ({
      ...RUSS_DARROW,
      id: `fac-${i}`,
      name: `Depot ${i}`,
      // Same street and postcode, different unit-free house numbers would fail
      // the number test; vary the street name slightly instead so all clear the
      // threshold at different scores.
      addressLine1: `12000 W Capitol ${['Dr', 'Drive', 'Dr', 'Dr', 'Dr', 'Dr'][i]}`,
      zip: i === 0 ? '53222' : '53223',
    }));

    const verdict = resolveFacilityTier(
      stop({ address: { line1: '12000 W Capitol Dr', city: 'Wauwatosa', state: 'WI', postalCode: '53224' } }),
      context({ candidates: many }),
    );

    expect(verdict.tier).toBe('T3');
    if (verdict.tier === 'T3') {
      expect(verdict.proposals.length).toBeLessThanOrEqual(FACILITY_MAX_CANDIDATES);
      const scores = verdict.proposals.map((p) => p.score);
      expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    }
  });

  it('uses a facility type the database actually admits', () => {
    const verdict = resolveFacilityTier(
      stop({ name: 'Unknown Co', address: { line1: '9 Nowhere Rd', city: 'Nowhere', state: 'IA', postalCode: '50001' } }),
      context(),
    );
    if (verdict.tier === 'T4') {
      // Spec Section 7 says "consignees to receiver". `receiver` was deleted from
      // this database by TKT-0016 and writing it throws a CHECK violation, so the
      // role maps onto the live vocabulary instead (audit B1 / DEC-1).
      expect(verdict.prefill.facilityType).toBe(FACILITY_TYPE_FOR_ROLE.consignee);
      expect(verdict.prefill.facilityType).toBe('customer_site');
      expect(['receiver', 'shipper']).not.toContain(verdict.prefill.facilityType);
    }
  });

  it('proposes an exact name match only when the document gave no address at all', () => {
    const noAddress = resolveFacilityTier(
      stop({ name: 'Russ Darrow Nissan', address: {} }),
      context(),
    );
    expect(noAddress.tier).toBe('T3');

    // With an address that says otherwise, the name must not rescue it — this is
    // the fixture's `2200 S Ashland` / `2800 S Ashland` trap wearing a matching
    // sign over the door.
    const contradicted = resolveFacilityTier(
      stop({ name: 'Russ Darrow Nissan', address: { line1: '18000 W Capitol Dr', city: 'Brookfield', state: 'WI', postalCode: '53045' } }),
      context(),
    );
    expect(contradicted.tier).toBe('T4');
  });
});

// ---------------------------------------------------------------------------

describe('normaliseSourceCode', () => {
  it('folds the punctuation and case a document prints around a code', () => {
    expect(normaliseSourceCode('43775')).toBe('43775');
    expect(normaliseSourceCode(' #43775 ')).toBe('43775');
    expect(normaliseSourceCode('WHSE-43775')).toBe('whse43775');
    expect(normaliseSourceCode('')).toBeNull();
    expect(normaliseSourceCode(null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Stored decisions, and what happens when the stop underneath one moves
// ---------------------------------------------------------------------------

function importRecord(over: Partial<ImportRecord>): ImportRecord {
  return {
    id: 'imp-1',
    orgId: 'org-1',
    status: 'NEEDS_REVIEW',
    sourceFileKeys: [],
    sourceMimeType: null,
    originalName: null,
    contentHash: 'hash',
    documentNumber: null,
    documentDate: null,
    documentType: 'MANIFEST',
    clientId: 'client-1',
    contractId: null,
    routeTemplateId: null,
    documentProfileId: null,
    resolutionProvenance: null,
    rawExtraction: null,
    reviewedExtraction: null,
    extractionWarnings: null,
    modelIdentifier: null,
    inputTokens: null,
    outputTokens: null,
    pageCount: null,
    cachedPages: 0,
    failureCode: null,
    failureMessage: null,
    createdTripId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as ImportRecord;
}

const consignment = (name: string, code: string | null) => ({
  pageNumbers: [1],
  externalCode: code,
  name,
  address: { line1: '12000 W Capitol Dr', city: 'Wauwatosa', state: 'WI', postalCode: '53222' },
  references: [],
  totals: {},
  lineItems: [],
  fieldConfidence: {},
});

describe('decideStops', () => {
  it('prefers a stored decision over re-running the ladder, and says it is persisted', () => {
    const stops = [consignment('Russ Darrow Nissan', '43775')];
    const fingerprint = stopFingerprint({ sourceCode: '43775', name: 'Russ Darrow Nissan', addressKey: '' });

    const record = importRecord({
      rawExtraction: { documentType: 'MANIFEST', header: {}, consignments: stops, extractionWarnings: [] },
      resolutionProvenance: {
        stops: {
          '0': {
            via: 'MANUAL',
            facilityId: BOUCHER.id, // a person overrode the address match
            score: 0.81,
            matchedText: 'Boucher Kia',
            sourceCode: '43775',
            stopFingerprint: fingerprint,
            byUserId: 'user-1',
            at: '2026-08-06T00:00:00.000Z',
          },
        },
      },
    });

    const [decision] = decideStops(record, context());
    expect(decision.slot.state).toBe('LINKED');
    expect(decision.slot.persisted).toBe(true);
    expect(decision.slot.facility?.id).toBe(BOUCHER.id);
    expect(decision.slot.why?.via).toBe('MANUAL');
    expect(decision.slot.why?.score).toBe(0.81);
    // Nothing left to re-run: the verdict is null because the row already answered.
    expect(decision.verdict).toBeNull();
  });

  it('drops a stored decision whose stop is no longer the stop it was about', () => {
    const record = importRecord({
      rawExtraction: {
        documentType: 'MANIFEST',
        header: {},
        // Stop review reordered these; index 0 is now a different consignee, at
        // a different address, so a stale link would be visible as Russ Darrow
        // sitting on Boucher's freight.
        consignments: [
          {
            ...consignment('Boucher Kia', '51002'),
            address: { line1: '4141 S 108th St', city: 'Greenfield', state: 'WI', postalCode: '53228' },
          },
        ],
        extractionWarnings: [],
      },
      resolutionProvenance: {
        stops: {
          '0': {
            via: 'MANUAL',
            facilityId: RUSS_DARROW.id,
            score: 0.9,
            matchedText: 'Russ Darrow Nissan',
            sourceCode: '43775',
            stopFingerprint: stopFingerprint({ sourceCode: '43775', name: 'Russ Darrow Nissan', addressKey: '' }),
            byUserId: 'user-1',
            at: '2026-08-06T00:00:00.000Z',
          },
        },
      },
    });

    const [decision] = decideStops(record, context());
    // The stale link is NOT carried across to a consignee it was never about;
    // the ladder ran again and answered about the stop that is actually there.
    expect(decision.slot.persisted).toBe(false);
    expect(decision.slot.facility?.id).toBe(BOUCHER.id);
    expect(decision.slot.facility?.id).not.toBe(RUSS_DARROW.id);
  });

  it('marks a freshly derived silent link as displayed but not yet written', () => {
    const record = importRecord({
      rawExtraction: {
        documentType: 'MANIFEST',
        header: {},
        consignments: [consignment('Russ Darrow Nissan', '43775')],
        extractionWarnings: [],
      },
    });

    const [decision] = decideStops(record, context());
    expect(decision.slot.state).toBe('LINKED');
    expect(decision.slot.tier).toBe('T2');
    // The claim the Phase 3 footer had to drop, made correctly here instead.
    expect(decision.slot.persisted).toBe(false);
    expect(decision.slot.requiresHumanTap).toBe(false);
  });

  it('drops a stored decision pointing at a facility that is no longer available', () => {
    const record = importRecord({
      rawExtraction: {
        documentType: 'MANIFEST',
        header: {},
        consignments: [consignment('Russ Darrow Nissan', '43775')],
        extractionWarnings: [],
      },
      resolutionProvenance: {
        stops: {
          '0': {
            via: 'MANUAL',
            facilityId: 'fac-since-deleted',
            score: null,
            matchedText: 'Gone',
            sourceCode: '43775',
            stopFingerprint: stopFingerprint({
              sourceCode: '43775',
              name: 'Russ Darrow Nissan',
              addressKey: '',
            }),
            byUserId: 'user-1',
            at: '2026-08-06T00:00:00.000Z',
          },
        },
      },
    });

    const [decision] = decideStops(record, context());
    expect(decision.slot.facility?.id).not.toBe('fac-since-deleted');
    expect(decision.slot.persisted).toBe(false);
  });
});
