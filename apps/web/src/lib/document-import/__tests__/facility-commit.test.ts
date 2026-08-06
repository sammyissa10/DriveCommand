/**
 * The write path: what gets committed, what gets written to
 * `facility_external_references`, and — above all — what does NOT get created.
 *
 * Prisma is faked at the tenant-client boundary rather than mocked per call, so
 * the functions under test are the real ones: the real ladder decides, the real
 * merge builds the provenance object, the real upsert arguments are asserted.
 * What the fake stands in for is the database, and every assertion below is
 * about the SQL this module would have run.
 *
 * The phase's stated drift risk is "auto-creating on T3 — the most damaging
 * failure in the build". The test for it is the first one: a tenant with no
 * facilities and a document full of unmatched stops, put through the committer,
 * and `createFacility` never called.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ImportRecord } from '../persistence';

// ---------------------------------------------------------------------------
// The fake database
// ---------------------------------------------------------------------------

interface FakeFacilityRow {
  id: string;
  name: string;
  facilityType: string;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  isDriverResidence: boolean;
}

const FACILITIES: FakeFacilityRow[] = [
  {
    id: 'fac-russ',
    name: 'Russ Darrow Nissan',
    facilityType: 'customer_site',
    addressLine1: '12000 W Capitol Dr',
    addressLine2: null,
    city: 'Wauwatosa',
    state: 'WI',
    zip: '53222',
    isDriverResidence: false,
  },
];

const upserts: unknown[] = [];
const updates: unknown[] = [];
const created: unknown[] = [];
let facilityRows: FakeFacilityRow[] = [...FACILITIES];
let referenceRows: Array<{ sourceCode: string; facilityId: string }> = [];
let currentRecord: ImportRecord;

const fakeDb = {
  carrierFacility: {
    findMany: vi.fn(async () => facilityRows),
  },
  facilityExternalReference: {
    findMany: vi.fn(async () => referenceRows),
    upsert: vi.fn(async (args: unknown) => {
      upserts.push(args);
      return {};
    }),
  },
  documentImport: {
    updateMany: vi.fn(async (args: { data: { resolutionProvenance?: unknown } }) => {
      updates.push(args);
      // The fake persists, so a second read sees what the first wrote — which is
      // what makes "already committed, do not write again" testable.
      currentRecord = { ...currentRecord, resolutionProvenance: args.data.resolutionProvenance };
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

// `ensureClientCommitted` is Phase 3's and has its own reasoning; here it is the
// identity, so these tests are about stops and only stops.
vi.mock('../resolution', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../resolution')>();
  return { ...actual, ensureClientCommitted: vi.fn(async (_o: string, _u: string, r: ImportRecord) => r) };
});

vi.mock('@/lib/carrier/facilities', () => ({
  createFacility: vi.fn(async (_orgId: string, data: { name: string; facilityType?: string }) => {
    created.push(data);
    const row = {
      id: `fac-new-${created.length}`,
      name: data.name,
      facilityType: data.facilityType ?? 'customer_site',
      addressLine1: null,
      addressLine2: null,
      city: null,
      state: null,
      zip: null,
      isDriverResidence: false,
    };
    facilityRows = [...facilityRows, row];
    return row;
  }),
}));

const { createFacility } = await import('@/lib/carrier/facilities');
const { confirmStopFacility, createStopFacility, ensureStopsCommitted } = await import(
  '../facility-resolution'
);

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

const consignment = (name: string, code: string | null, address: Record<string, string>) => ({
  pageNumbers: [1],
  externalCode: code,
  name,
  address,
  references: [],
  totals: {},
  lineItems: [],
  fieldConfidence: {},
});

const RUSS_ADDRESS = { line1: '12000 W Capitol Dr', city: 'Wauwatosa', state: 'WI', postalCode: '53222' };
const NOWHERE = { line1: '400 N Main St', city: 'Rockford', state: 'IL', postalCode: '61101' };

function record(consignments: unknown[]): ImportRecord {
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
    rawExtraction: { documentType: 'MANIFEST', header: {}, consignments, extractionWarnings: [] },
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
  } as ImportRecord;
}

beforeEach(() => {
  upserts.length = 0;
  updates.length = 0;
  created.length = 0;
  facilityRows = [...FACILITIES];
  referenceRows = [];
  vi.clearAllMocks();
});

/**
 * The live CHECK on `facility_external_references.resolved_via`, restated.
 *
 * ```
 *   CHECK (resolved_via IS NULL OR resolved_via IN ('T1','T2','T3','T4'))
 * ```
 *
 * A faked database accepts anything, so without this assertion the suite would
 * have stayed green while every confirmation in production threw a 23514 — and
 * confirmations are the whole point of the module. Asserted after every write
 * below rather than once, because the value is set in three places.
 */
function assertReferenceTiersAreLegal() {
  for (const args of upserts as Array<{ create?: { resolvedVia?: string }; update?: { resolvedVia?: string } }>) {
    for (const via of [args.create?.resolvedVia, args.update?.resolvedVia]) {
      if (via !== undefined) expect(['T1', 'T2', 'T3', 'T4']).toContain(via);
    }
  }
}

// ---------------------------------------------------------------------------

describe('ensureStopsCommitted', () => {
  it('HARD RULE — never creates a facility, whatever the document says', async () => {
    currentRecord = record([
      consignment('Hall Ford', '51002', NOWHERE),
      consignment('Wilde Honda', '51003', { line1: '1 Nowhere Ln', city: 'Sarasota', state: 'FL', postalCode: '34231' }),
      consignment('Unknown', null, {}),
    ]);

    await ensureStopsCommitted('org-1', 'user-1', currentRecord);

    // Three stops nothing matched. A committer that "helpfully" created them is
    // how a facility table becomes unrecoverable.
    expect(createFacility).not.toHaveBeenCalled();
    expect(created).toEqual([]);
    // Nothing linked, so nothing written at all.
    expect(updates).toEqual([]);
    expect(upserts).toEqual([]);
  });

  it('T2 — commits the silent link and backfills the external reference', async () => {
    currentRecord = record([consignment('Russ Darrow Nissan', '43775', RUSS_ADDRESS)]);

    await ensureStopsCommitted('org-1', 'user-1', currentRecord);

    // The link, under the `stops` key on the existing jsonb column. No new column.
    expect(updates).toHaveLength(1);
    const written = (updates[0] as { data: { resolutionProvenance: { stops: Record<string, unknown> } } })
      .data.resolutionProvenance;
    expect(written.stops['0']).toMatchObject({
      via: 'NORMALISED_ADDRESS',
      facilityId: 'fac-russ',
      score: 1,
      sourceCode: '43775',
    });

    // The backfill: this is what makes tomorrow's import a silent T1.
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      where: { orgId_clientId_sourceCode: { orgId: 'org-1', clientId: 'client-1', sourceCode: '43775' } },
      create: { facilityId: 'fac-russ', resolvedVia: 'T2', sourceName: 'Russ Darrow Nissan' },
    });
    expect(createFacility).not.toHaveBeenCalled();
    assertReferenceTiersAreLegal();
  });

  it('T1 — a stop resolved by a saved code writes the link and no new reference', async () => {
    referenceRows = [{ sourceCode: '43775', facilityId: 'fac-russ' }];
    // A completely different address: the code is what resolves it.
    currentRecord = record([consignment('Russ Darrow Nissan', '43775', NOWHERE)]);

    await ensureStopsCommitted('org-1', 'user-1', currentRecord);

    const written = (updates[0] as { data: { resolutionProvenance: { stops: Record<string, { via: string }> } } })
      .data.resolutionProvenance;
    expect(written.stops['0'].via).toBe('EXTERNAL_REF');
    // The reference already exists. Rewriting it would be a write nobody needs.
    expect(upserts).toEqual([]);
  });

  it('is idempotent — a second run over committed stops writes nothing', async () => {
    currentRecord = record([consignment('Russ Darrow Nissan', '43775', RUSS_ADDRESS)]);

    const first = await ensureStopsCommitted('org-1', 'user-1', currentRecord);
    const updatesAfterFirst = updates.length;

    await ensureStopsCommitted('org-1', 'user-1', first);
    expect(updates).toHaveLength(updatesAfterFirst);
  });

  it('does not write a reference for a stop the document gave no code for', async () => {
    currentRecord = record([consignment('Russ Darrow Nissan', null, RUSS_ADDRESS)]);

    await ensureStopsCommitted('org-1', 'user-1', currentRecord);

    // The link is still made — it is a fact about this import.
    expect(updates).toHaveLength(1);
    // There is no key to write a reference under, and inventing one is worse
    // than not having it.
    expect(upserts).toEqual([]);
  });
});

// ---------------------------------------------------------------------------

describe('confirmStopFacility', () => {
  it('links what a person chose, records the score they saw, writes the reference', async () => {
    currentRecord = record([
      consignment('Russ Darrow Nissan', '43775', { ...RUSS_ADDRESS, postalCode: '53226' }),
    ]);

    await confirmStopFacility('org-1', 'user-1', 'imp-1', 0, 'fac-russ');

    const last = updates[updates.length - 1] as {
      data: { resolutionProvenance: { stops: Record<string, { via: string; score: number }> } };
    };
    expect(last.data.resolutionProvenance.stops['0'].via).toBe('MANUAL');
    // Recomputed server-side from the same scorer, so it is what was on screen
    // and not something a client could have sent.
    expect(last.data.resolutionProvenance.stops['0'].score).toBeGreaterThan(0);
    expect(last.data.resolutionProvenance.stops['0'].score).toBeLessThan(1);

    expect(upserts[upserts.length - 1]).toMatchObject({
      update: { facilityId: 'fac-russ', resolvedVia: 'T3' },
    });
    expect(createFacility).not.toHaveBeenCalled();
    assertReferenceTiersAreLegal();
  });

  it('refuses a facility that is not an available candidate', async () => {
    currentRecord = record([consignment('Russ Darrow Nissan', '43775', RUSS_ADDRESS)]);

    await expect(
      confirmStopFacility('org-1', 'user-1', 'imp-1', 0, 'fac-somebody-elses'),
    ).rejects.toThrow(/not available/i);
  });

  it('refuses a stop index the document does not have', async () => {
    currentRecord = record([consignment('Russ Darrow Nissan', '43775', RUSS_ADDRESS)]);

    await expect(confirmStopFacility('org-1', 'user-1', 'imp-1', 7, 'fac-russ')).rejects.toThrow(
      /does not exist/i,
    );
  });

  it('refuses to touch an import that is already committed', async () => {
    currentRecord = { ...record([consignment('X', null, NOWHERE)]), status: 'COMMITTED' } as ImportRecord;

    await expect(confirmStopFacility('org-1', 'user-1', 'imp-1', 0, 'fac-russ')).rejects.toThrow(
      /no longer be changed/i,
    );
  });
});

// ---------------------------------------------------------------------------

describe('createStopFacility', () => {
  it('creates, links and writes the reference — the day-one path', async () => {
    currentRecord = record([consignment('Hall Ford', '51002', NOWHERE)]);

    await createStopFacility('org-1', 'user-1', 'imp-1', 0, {
      name: 'Hall Ford',
      addressLine1: '400 N Main St',
      city: 'Rockford',
      state: 'IL',
      zip: '61101',
    });

    expect(createFacility).toHaveBeenCalledTimes(1);
    expect(created[0]).toMatchObject({
      name: 'Hall Ford',
      // Not `receiver`: that value was deleted from this database and writing it
      // is a CHECK violation (audit B1 / DEC-1).
      facilityType: 'customer_site',
      createdById: 'user-1',
    });

    const last = updates[updates.length - 1] as {
      data: { resolutionProvenance: { stops: Record<string, { via: string; score: number | null }> } };
    };
    expect(last.data.resolutionProvenance.stops['0'].via).toBe('MANUAL_CREATE');
    // Nothing was matched, so there is no score to show. Not zero — absent.
    expect(last.data.resolutionProvenance.stops['0'].score).toBeNull();

    // Day one writes the reference. Day two, that code is a silent T1.
    expect(upserts[upserts.length - 1]).toMatchObject({
      create: { sourceCode: '51002', resolvedVia: 'T4', sourceName: 'Hall Ford' },
    });
    assertReferenceTiersAreLegal();
  });

  it('refuses a facility type the database does not have', async () => {
    currentRecord = record([consignment('Hall Ford', '51002', NOWHERE)]);

    // The spec's own words, and a Postgres 23514 if it reached the database.
    await expect(
      createStopFacility('org-1', 'user-1', 'imp-1', 0, { name: 'Hall Ford', facilityType: 'receiver' }),
    ).rejects.toThrow(/not a facility type/i);
    expect(createFacility).not.toHaveBeenCalled();
  });

  it('refuses to create a nameless facility', async () => {
    currentRecord = record([consignment('Hall Ford', '51002', NOWHERE)]);

    await expect(
      createStopFacility('org-1', 'user-1', 'imp-1', 0, { name: '   ' }),
    ).rejects.toThrow(/name is required/i);
    expect(createFacility).not.toHaveBeenCalled();
  });
});
