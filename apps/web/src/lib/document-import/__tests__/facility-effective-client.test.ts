/**
 * quick-511 — the ladder is scoped by the EFFECTIVE client, not the persisted one.
 *
 * The bug this pins down (`.planning/debug/doc-import-t1-not-firing-on-learned-refs.md`):
 * external references are keyed `(org_id, client_id, source_code)`, and the
 * lookup read `record.clientId` straight off the import row. That column is null
 * whenever a client auto-resolved and no mutation has fired (quick-508), so the
 * reference map came back empty, **T1 never executed**, and seven codes the
 * tenant had already confirmed silently resolved on address as T2 instead.
 *
 * Two properties are asserted here, and the second is the one that matters
 * structurally:
 *
 *  1. With a null `clientId` and a deterministic client, a learned code resolves
 *     T1 through the real `getStopResolution`.
 *  2. The view path and the commit path load the **identical reference map** for
 *     that record — asserted by capturing the actual `where` clause each issues.
 *     They reach it from opposite directions (the view derives, the commit has
 *     already persisted) and must still agree, because "the card's tier equals
 *     the tier that will be written" is the property this module rests on.
 *
 * `../resolution` is deliberately NOT mocked: the real `resolveEffectiveClientId`,
 * the real `resolveClientDeterministic` and the real `ensureClientCommitted` are
 * what is under test. Only the database is faked.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportRecord } from '../persistence';

// ---------------------------------------------------------------------------
// Fake database
// ---------------------------------------------------------------------------

const CLIENT_ID = 'client-dealer-tire';

const FACILITY = {
  id: 'fac-russ',
  name: 'Russ Darrow Nissan',
  facilityType: 'customer_site',
  addressLine1: '12000 W Capitol Dr',
  addressLine2: null,
  city: 'Wauwatosa',
  state: 'WI',
  zip: '53222',
};

const PROFILE_ROW = {
  id: 'prof-1',
  orgId: 'org-1',
  clientId: CLIENT_ID,
  documentType: 'MANIFEST',
  extractionHints: {},
  columnMapping: null,
  commitStrategy: null,
  defaultEndStopPolicy: null,
  pinnedContractId: null,
};

/** Every `where` the reference table was queried with, in order. */
const referenceQueries: Array<Record<string, unknown>> = [];

let clientRows: Array<Record<string, unknown>> = [];
let referenceRows: Array<{ sourceCode: string; facilityId: string }> = [];
let currentRecord: ImportRecord;

const fakeDb = {
  carrierClient: {
    findMany: vi.fn(async () => clientRows),
    findFirst: vi.fn(async ({ where }: { where: { id: string } }) =>
      clientRows.find((c) => c.id === where.id) ?? null,
    ),
  },
  documentProfile: {
    findMany: vi.fn(async () => []),
    findFirst: vi.fn(async () => null),
    // `recordClientConfirmation` upserts — the commit path learns the alias as
    // it goes, and mocking the wrong verb here silently breaks that half.
    upsert: vi.fn(async () => PROFILE_ROW),
    create: vi.fn(async () => PROFILE_ROW),
    update: vi.fn(async () => PROFILE_ROW),
  },
  // `assignClient` returns the whole resolution view, so the commit path runs
  // the contract slot too. Empty is fine — this suite is about the stop ladder.
  carrierContract: { findMany: vi.fn(async () => []), findFirst: vi.fn(async () => null) },
  carrierFacility: { findMany: vi.fn(async () => [FACILITY]) },
  facilityExternalReference: {
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      referenceQueries.push(where);
      // The real table is keyed by client; a query for the wrong client (or a
      // query that never happens) must not see these rows.
      return where.clientId === CLIENT_ID ? referenceRows : [];
    }),
    upsert: vi.fn(async () => ({})),
  },
  documentImport: {
    updateMany: vi.fn(async (args: { data: Record<string, unknown> }) => {
      currentRecord = { ...currentRecord, ...(args.data as Partial<ImportRecord>) };
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

vi.mock('@/lib/carrier/facilities', () => ({
  createFacility: vi.fn(async () => {
    throw new Error('createFacility must never be reached from these paths');
  }),
}));

const { getStopResolution, ensureStopsCommitted } = await import('../facility-resolution');
const { resolveEffectiveClientId } = await import('../resolution');

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** The consignee whose code the tenant confirmed on a previous import. */
const consignment = {
  pageNumbers: [1],
  externalCode: '43775',
  name: 'Russ Darrow Nissan',
  // Deliberately NOT the facility's address, so a T2 address match is
  // impossible and only T1 can produce a link. If the reference lookup is
  // scoped wrongly this lands on T4 and the test fails loudly.
  address: { line1: '900 Elsewhere Rd', city: 'Milwaukee', state: 'WI', postalCode: '53202' },
  references: [],
  totals: {},
  lineItems: [],
  fieldConfidence: {},
};

function record(over: Partial<ImportRecord> = {}): ImportRecord {
  return {
    id: 'imp-511',
    orgId: 'org-1',
    status: 'NEEDS_REVIEW',
    sourceFileKeys: [],
    sourceMimeType: null,
    originalName: 'page-1.jpg',
    contentHash: 'hash',
    documentNumber: null,
    documentDate: null,
    documentType: 'MANIFEST',
    // THE POINT: null, exactly as the live second import had it.
    clientId: null,
    contractId: null,
    routeTemplateId: null,
    documentProfileId: null,
    resolutionProvenance: null,
    rawExtraction: {
      documentType: 'MANIFEST',
      header: { originName: 'DEALER TIRE - CHICAGO WHSE' },
      consignments: [consignment],
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
    ...over,
  } as ImportRecord;
}

/** One active client whose name matches the document exactly -> deterministic. */
const DETERMINISTIC_CLIENT = {
  id: CLIENT_ID,
  name: 'DEALER TIRE - CHICAGO WHSE',
  dbaName: null,
  city: 'Chicago',
  state: 'IL',
  isSample: false,
  contracts: [],
};

beforeEach(() => {
  referenceQueries.length = 0;
  clientRows = [DETERMINISTIC_CLIENT];
  referenceRows = [{ sourceCode: '43775', facilityId: FACILITY.id }];
  currentRecord = record();
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------

describe('resolveEffectiveClientId', () => {
  it('returns the persisted client without touching the database', async () => {
    const persisted = record({ clientId: CLIENT_ID });
    const id = await resolveEffectiveClientId(fakeDb as never, 'org-1', persisted);

    expect(id).toBe(CLIENT_ID);
    // The early return is what makes this free on every commit-path call.
    expect(fakeDb.carrierClient.findMany).not.toHaveBeenCalled();
    expect(fakeDb.documentProfile.findMany).not.toHaveBeenCalled();
  });

  it('derives the deterministic client when nothing is persisted', async () => {
    expect(await resolveEffectiveClientId(fakeDb as never, 'org-1', record())).toBe(CLIENT_ID);
  });

  it('returns null when the client is genuinely unresolvable, and does not throw', async () => {
    // Two active clients, neither an exact match: ambiguous, so nothing
    // deterministic — which is the case the null short-circuit exists for.
    clientRows = [
      { ...DETERMINISTIC_CLIENT, id: 'c1', name: 'Some Other Co' },
      { ...DETERMINISTIC_CLIENT, id: 'c2', name: 'Another Co' },
    ];
    expect(await resolveEffectiveClientId(fakeDb as never, 'org-1', record())).toBeNull();
  });

  it('never commits — resolving is not writing', async () => {
    await resolveEffectiveClientId(fakeDb as never, 'org-1', record());
    expect(fakeDb.documentImport.updateMany).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------

describe('the stop view, on a record whose client is not persisted', () => {
  it('resolves a learned code as T1 — the quick-511 regression', async () => {
    const view = await getStopResolution('org-1', 'user-1', 'imp-511');

    expect(view).not.toBeNull();
    const stop = view!.stops[0];

    // Before the fix this was T2/NORMALISED_ADDRESS on a matching address, and
    // here — where the address deliberately does NOT match — it would be T4.
    expect(stop.tier).toBe('T1');
    expect(stop.state).toBe('LINKED');
    expect(stop.facility?.id).toBe(FACILITY.id);
    expect(stop.why?.via).toBe('EXTERNAL_REF');
    expect(stop.why?.matchedText).toBe('43775');
    // Still only displayed. The view wrote nothing.
    expect(stop.persisted).toBe(false);
    expect(fakeDb.documentImport.updateMany).not.toHaveBeenCalled();
    expect(fakeDb.facilityExternalReference.upsert).not.toHaveBeenCalled();
  });

  it('scopes the reference lookup by the derived client, not by null', async () => {
    await getStopResolution('org-1', 'user-1', 'imp-511');

    expect(referenceQueries).toHaveLength(1);
    expect(referenceQueries[0]).toEqual({ orgId: 'org-1', clientId: CLIENT_ID });
  });

  it('falls through without throwing when the client cannot be resolved', async () => {
    clientRows = [
      { ...DETERMINISTIC_CLIENT, id: 'c1', name: 'Some Other Co' },
      { ...DETERMINISTIC_CLIENT, id: 'c2', name: 'Another Co' },
    ];

    const view = await getStopResolution('org-1', 'user-1', 'imp-511');

    // No key to look references up by, so no T1 — and that is the ladder
    // working, not an error. The stop asks a person instead.
    expect(view!.stops[0].tier).toBe('T4');
    expect(view!.stops[0].requiresHumanTap).toBe(true);
    // The short-circuit means no pointless query was issued either.
    expect(referenceQueries).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('view context and commit context', () => {
  /**
   * The structural property. They arrive from opposite directions — the view
   * derives the client, the commit has already persisted it — and must still
   * scope the reference lookup identically, or the tier on the card is not the
   * tier that gets written.
   */
  it('load identical reference maps for a record with a null clientId', async () => {
    await getStopResolution('org-1', 'user-1', 'imp-511');
    const fromView = [...referenceQueries];

    referenceQueries.length = 0;
    currentRecord = record();
    await ensureStopsCommitted('org-1', 'user-1', currentRecord);
    const fromCommit = [...referenceQueries];

    expect(fromView).toHaveLength(1);
    expect(fromCommit.length).toBeGreaterThan(0);
    // Same tenant, same client, on both sides.
    for (const where of fromCommit) expect(where).toEqual(fromView[0]);
  });

  it('agree on the tier, so the card cannot promise what the write will not do', async () => {
    const view = await getStopResolution('org-1', 'user-1', 'imp-511');
    expect(view!.stops[0].tier).toBe('T1');
    expect(view!.stops[0].why?.via).toBe('EXTERNAL_REF');

    currentRecord = record();
    await ensureStopsCommitted('org-1', 'user-1', currentRecord);

    const written = (currentRecord.resolutionProvenance ?? {}) as {
      stops?: Record<string, { via: string; facilityId: string }>;
    };
    expect(written.stops?.['0'].via).toBe('EXTERNAL_REF');
    expect(written.stops?.['0'].facilityId).toBe(FACILITY.id);

    // T1 resolved it, so there is nothing to backfill — the reference the ladder
    // just used is the reference that already exists.
    expect(fakeDb.facilityExternalReference.upsert).not.toHaveBeenCalled();
  });
});
