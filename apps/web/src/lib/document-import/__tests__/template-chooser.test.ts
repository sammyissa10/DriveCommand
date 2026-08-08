/**
 * The two controls on the Template row that did not do what they said (quick-516).
 *
 * ---------------------------------------------------------------------------
 * WHAT WAS BROKEN, AND WHAT PINS IT
 * ---------------------------------------------------------------------------
 * **"Change" declined.** It called `declineTemplate`, so the first tap wrote
 * `via: 'NONE'` and the only reachable answer was "no template at all". A
 * dispatcher wanting the 0.50 route instead of the 0.80 one had nowhere to say
 * so, because the ranked list simply was not on the payload outside the middle
 * band. The chooser is a component, but the thing that made it *possible* is
 * `TemplateSlotView.alternatives`, and that is what the first block asserts —
 * including that it is UNCAPPED, since `candidates` is capped at three and a
 * chooser that inherited the cap would hide the very row this ticket is about.
 *
 * **"Look again" was wired, to a read.** It re-fetched the resolution, and
 * `buildTemplateSlot` returns `DECLINED` before it scores anything whenever the
 * row carries `via: 'NONE'`. So the control worked, the request succeeded, and the
 * answer could never change. The second block runs the real
 * `clearTemplateDecision` against a fake database and asserts the two things that
 * make it a fix: the `template` key is *removed* (not overwritten with a record
 * that says nothing), and the slot that comes back is no longer `DECLINED`.
 *
 * Thresholds are imported from `template-constants.ts`, never restated — the
 * phase's own verification step is "grep 0.75 and 0.45, one file", and a test
 * that hardcodes 0.45 breaks it as surely as a component would.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportRecord } from '../persistence';
import type { StopDecision } from '../facility-lookup';
import type { LoadedTemplate } from '../template-lookup';
import {
  TEMPLATE_AUTO_APPLY_THRESHOLD,
  TEMPLATE_CANDIDATE_THRESHOLD,
  TEMPLATE_MAX_CANDIDATES,
} from '../template-constants';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const consignment = (name: string) => ({
  pageNumbers: [1],
  externalCode: null,
  name,
  address: { line1: '1 Main St', city: 'Milwaukee', state: 'WI', postalCode: '53202' },
  references: [],
  totals: {},
  lineItems: [],
  fieldConfidence: {},
});

function record(overrides: Partial<ImportRecord> = {}): ImportRecord {
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
    rawExtraction: {
      documentType: 'MANIFEST',
      header: {},
      consignments: [consignment('A'), consignment('B'), consignment('C'), consignment('D')],
      extractionWarnings: [],
    },
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
    ...overrides,
  } as ImportRecord;
}

/** A stop the ladder has settled on a building. Only the fields the slot reads. */
const decision = (index: number, facilityId: string): StopDecision =>
  ({
    slot: {
      index,
      documentName: `Stop ${index}`,
      facility: { id: facilityId, name: `Facility ${facilityId}` },
    },
  }) as unknown as StopDecision;

const templateStop = (sequenceOrder: number, facilityId: string) => ({
  sequenceOrder,
  facilityId,
  facilityName: `Facility ${facilityId}`,
  facilityAddress: { line1: null, line2: null, city: null, state: null, postalCode: null, country: null },
  stopType: 'delivery',
  contactName: null,
  contactPhone: null,
  apptWindowStartOffsetMin: null,
  apptWindowEndOffsetMin: null,
  bolRequired: true,
  podRequired: true,
  specialInstructions: null,
});

const template = (id: string, facilityIds: string[]): LoadedTemplate => ({
  id,
  templateName: `Route ${id}`,
  clientId: 'client-1',
  contractId: null,
  scheduledDepartureTime: null,
  isSuggested: false,
  widened: false,
  stops: facilityIds.map((facilityId, i) => templateStop(i + 1, facilityId)),
});

// The import visits four buildings. Everything below is scored against this set,
// so each template's score is hand-checkable from its overlap.
const FOUR_STOPS = [decision(0, 'fac-a'), decision(1, 'fac-b'), decision(2, 'fac-c'), decision(3, 'fac-d')];

// ---------------------------------------------------------------------------
// The chooser's list
// ---------------------------------------------------------------------------

describe('TemplateSlotView.alternatives — the list behind "Change"', () => {
  it('is present on an auto-collapsed row, which is where "Change" lives', async () => {
    const { buildTemplateSlot } = await import('../template-lookup');

    const slot = buildTemplateSlot({
      record: record(),
      decisions: FOUR_STOPS,
      templates: [
        template('t-exact', ['fac-a', 'fac-b', 'fac-c', 'fac-d']), // 4/4 -> 1.00
        template('t-three', ['fac-a', 'fac-b', 'fac-c']), // 3/4, counts within tolerance -> 0.75
      ],
      effectiveClientId: 'client-1',
    });

    expect(slot.state).toBe('RESOLVED');
    // The old payload. Still capped, still the middle band's — untouched.
    expect(slot.candidates).toEqual([]);
    // The new one: what a person could switch to, including what they have.
    expect(slot.alternatives.map((a) => a.id)).toEqual(['t-exact', 't-three']);
    expect(slot.alternatives[0].score).toBeGreaterThanOrEqual(TEMPLATE_AUTO_APPLY_THRESHOLD);
  });

  it('carries the SAME presentation the middle band renders, so one row serves both', async () => {
    const { buildTemplateSlot } = await import('../template-lookup');

    const slot = buildTemplateSlot({
      record: record(),
      decisions: FOUR_STOPS,
      templates: [template('t-exact', ['fac-a', 'fac-b', 'fac-c', 'fac-d'])],
      effectiveClientId: 'client-1',
    });

    const [candidate] = slot.alternatives;
    // Everything the chooser needs to be a choice rather than a list of names.
    expect(candidate).toMatchObject({
      id: 't-exact',
      name: 'Route t-exact',
      scorePercent: 100,
      stopCount: 4,
      countMismatch: false,
      isSuggested: false,
      widened: false,
    });
    expect(candidate.diffNote).toBe('4 matched');
    expect(candidate.diff.rows).toHaveLength(4);
  });

  it('is NOT capped at the middle band\'s three — the point of the ticket', async () => {
    const { buildTemplateSlot } = await import('../template-lookup');

    // Five templates, every one of them over the candidate line: the exact match
    // plus four three-of-four variants. Capping here is what made a lower-scoring
    // route unreachable when a better one existed.
    const slot = buildTemplateSlot({
      record: record(),
      decisions: FOUR_STOPS,
      templates: [
        template('t-1', ['fac-a', 'fac-b', 'fac-c', 'fac-d']),
        template('t-2', ['fac-a', 'fac-b', 'fac-c', 'fac-z']),
        template('t-3', ['fac-a', 'fac-b', 'fac-d', 'fac-z']),
        template('t-4', ['fac-a', 'fac-c', 'fac-d', 'fac-z']),
        template('t-5', ['fac-b', 'fac-c', 'fac-d', 'fac-z']),
      ],
      effectiveClientId: 'client-1',
    });

    expect(slot.alternatives.length).toBe(5);
    expect(slot.alternatives.length).toBeGreaterThan(TEMPLATE_MAX_CANDIDATES);
    // Ranked, best first — the ordering the chooser draws.
    const scores = slot.alternatives.map((a) => a.score);
    expect([...scores].sort((x, y) => y - x)).toEqual(scores);
  });

  it('leaves out anything under the candidate threshold', async () => {
    const { buildTemplateSlot } = await import('../template-lookup');

    const slot = buildTemplateSlot({
      record: record(),
      decisions: FOUR_STOPS,
      templates: [
        template('t-good', ['fac-a', 'fac-b', 'fac-c', 'fac-d']),
        // One building in common out of seven. Nowhere near the line.
        template('t-stranger', ['fac-a', 'fac-w', 'fac-x', 'fac-y']),
      ],
      effectiveClientId: 'client-1',
    });

    expect(slot.alternatives.map((a) => a.id)).toEqual(['t-good']);
    for (const alternative of slot.alternatives) {
      expect(alternative.score).toBeGreaterThanOrEqual(TEMPLATE_CANDIDATE_THRESHOLD);
    }
  });

  it('is empty on a DECLINED row — a stored decision still outranks matching', async () => {
    const { buildTemplateSlot } = await import('../template-lookup');

    const slot = buildTemplateSlot({
      record: record({
        resolutionProvenance: {
          template: { via: 'NONE', at: '2026-08-08T00:00:00.000Z', byUserId: 'user-1', templateId: null, templateName: null, appliedAt: null, offer: null },
        } as unknown as ImportRecord['resolutionProvenance'],
      }),
      decisions: FOUR_STOPS,
      templates: [template('t-exact', ['fac-a', 'fac-b', 'fac-c', 'fac-d'])],
      effectiveClientId: 'client-1',
    });

    // This is deliberate, not an oversight: nothing is matched on a row a person
    // has answered. "Look again" is the mutation that clears the answer, and it
    // is the subject of the next block.
    expect(slot.state).toBe('DECLINED');
    expect(slot.alternatives).toEqual([]);
    expect(slot.persisted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// "Look again"
// ---------------------------------------------------------------------------

const DECLINED_PROVENANCE = {
  client: { via: 'EXACT_MATCH', at: '2026-08-07T00:00:00.000Z', byUserId: null, matchedText: 'Dealer Tire' },
  template: {
    via: 'NONE',
    at: '2026-08-07T00:00:00.000Z',
    byUserId: 'user-1',
    templateId: null,
    templateName: null,
    appliedAt: null,
    offer: null,
  },
};

const updates: Array<{ data: Record<string, unknown> }> = [];
let currentRecord: ImportRecord;

const fakeDb = {
  carrierFacility: { findMany: vi.fn(async () => []) },
  facilityExternalReference: { findMany: vi.fn(async () => []) },
  routeTemplate: {
    findMany: vi.fn(async () => [
      {
        id: 't-exact',
        templateName: 'MKE NORTH 2',
        clientId: 'client-1',
        contractId: null,
        scheduledDepartureTime: null,
        isSuggested: false,
        stops: [],
      },
    ]),
  },
  documentImport: {
    updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
      updates.push(args);
      currentRecord = {
        ...currentRecord,
        resolutionProvenance: args.data.resolutionProvenance as ImportRecord['resolutionProvenance'],
        routeTemplateId: args.data.routeTemplateId as string | null,
      };
      return { count: 1 };
    }),
  },
};

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrismaForOrg: vi.fn(async () => fakeDb),
  getTenantPrisma: vi.fn(async () => fakeDb),
}));

vi.mock('@/lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('../persistence', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../persistence')>();
  return { ...actual, getImportRecord: vi.fn(async () => currentRecord) };
});

// The effective client is Phase 3's and quick-511's; here it is a constant so
// these tests are about the template decision and only that.
vi.mock('../resolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../resolution')>();
  return { ...actual, resolveEffectiveClientId: vi.fn(async () => 'client-1') };
});

describe('clearTemplateDecision — "Look again" as a real action', () => {
  beforeEach(() => {
    updates.length = 0;
    currentRecord = record({
      resolutionProvenance: DECLINED_PROVENANCE as unknown as ImportRecord['resolutionProvenance'],
    });
    vi.clearAllMocks();
  });

  it('REMOVES the template key rather than writing an empty record', async () => {
    const { clearTemplateDecision } = await import('../template-service');
    await clearTemplateDecision('org-1', 'user-1', 'imp-1');

    expect(updates).toHaveLength(1);
    const written = updates[0].data.resolutionProvenance as Record<string, unknown>;

    // The distinction the whole fix rests on. `buildTemplateSlot` short-circuits
    // on the PRESENCE of a template record, so overwriting it with anything at
    // all — including `via: 'NONE'` again — would leave the row exactly as stuck
    // as it was.
    expect('template' in written).toBe(false);
    expect(updates[0].data.routeTemplateId).toBeNull();
  });

  it('leaves the other slots alone', async () => {
    const { clearTemplateDecision } = await import('../template-service');
    await clearTemplateDecision('org-1', 'user-1', 'imp-1');

    const written = updates[0].data.resolutionProvenance as Record<string, unknown>;
    // One key of a jsonb column, merged in memory (the quick-509 pattern). The
    // client's provenance is not this function's business.
    expect(written.client).toEqual(DECLINED_PROVENANCE.client);
  });

  it('hands back a row that is no longer DECLINED, so the fresh look is visible', async () => {
    const { clearTemplateDecision } = await import('../template-service');
    const slot = await clearTemplateDecision('org-1', 'user-1', 'imp-1');

    // Before: DECLINED forever, however many times the old control re-read it.
    // After: matching actually ran. This tenant's one template has no stops, so
    // there is nothing to match and the honest answer is NONE — which the row
    // renders as "Nothing saved looks like today's run" instead of silence.
    expect(slot.state).not.toBe('DECLINED');
    expect(slot.state).toBe('NONE');
  });

  it('refuses on an import whose template can no longer change', async () => {
    currentRecord = record({
      status: 'COMMITTED',
      resolutionProvenance: DECLINED_PROVENANCE as unknown as ImportRecord['resolutionProvenance'],
    });

    const { clearTemplateDecision } = await import('../template-service');
    await expect(clearTemplateDecision('org-1', 'user-1', 'imp-1')).rejects.toThrow(/no longer be changed/);
    expect(updates).toHaveLength(0);
  });
});
