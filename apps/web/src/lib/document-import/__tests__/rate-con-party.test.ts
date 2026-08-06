/**
 * Who the client is on a rate confirmation, and what the card is called.
 *
 * WHAT WAS BROKEN. Client resolution read `header.originName` for every
 * document type. On a manifest that is the shipper, who is also the customer.
 * On a rate confirmation it is the PICKUP FACILITY — the live import stored
 * `originName = "MIDWEST DISTRIBUTION CENTER"`, a warehouse — while the company
 * hiring the carrier was the broker printed on the letterhead. The broker was
 * never offered as a candidate, and the profile alias would have been learned
 * against the warehouse, so the next rate confirmation would have collapsed
 * onto the wrong client without asking.
 *
 * The fake database is the same one `contract-create.test.ts` uses: what is
 * under test is which string the view matches on, which is not a question
 * about SQL.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  clients: [] as Array<{ id: string; name: string; dbaName: string | null; city: string | null; state: string | null; contracts: Array<{ id: string; expirationDate: Date | null }> }>,
  imports: [] as Array<Record<string, unknown>>,
  confirmations: [] as Array<Record<string, unknown>>,
}));

const db = vi.hoisted(() => ({
  carrierClient: {
    findMany: async () => state.clients,
    findFirst: async ({ where }: { where: { id: string } }) =>
      state.clients.find((c) => c.id === where.id) ?? null,
  },
  carrierContract: { findMany: async () => [], findFirst: async () => null },
  // The resolution view computes the "11 matched · 1 new" stop line from the
  // facility ladder (Phase 4), so it now reads these two. Empty is the honest
  // fixture for a suite that is about which client string gets matched: a tenant
  // with no facilities puts every stop on T4, which is correct and is not what
  // these tests assert on.
  carrierFacility: { findMany: async () => [] },
  facilityExternalReference: { findMany: async () => [] },
  documentImport: {
    updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.imports.find((i) => i.id === where.id);
      if (row) Object.assign(row, data);
      return { count: 1 };
    },
  },
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrismaForOrg: async () => db,
  getTenantPrisma: async () => db,
}));

vi.mock('../persistence', async (importOriginal) => {
  // parseDocumentDate is real — the date fallback under test depends on it.
  const actual = await importOriginal<typeof import('../persistence')>();
  return {
    ...actual,
    getImportRecord: async (_orgId: string, importId: string) =>
      state.imports.find((i) => i.id === importId) ?? null,
  };
});

vi.mock('../profiles', () => ({
  UNKNOWN_DOCUMENT_TYPE: 'UNKNOWN',
  listProfilesForType: async () => [],
  getProfile: async () => null,
  findProfileByAlias: () => null,
  recordClientConfirmation: async (
    _db: unknown,
    _orgId: string,
    _userId: string,
    args: Record<string, unknown>,
  ) => {
    state.confirmations.push(args);
    return { id: 'profile-1' };
  },
  pinContract: async () => {},
}));

import { assignClient, resolveImportById } from '../resolution';
import { buildSummary, toListItem } from '../intake';

const ORG = 'org-1';
const USER = 'user-1';
const IMPORT = 'import-1';

const ISSUER = 'APEX FREIGHT BROKERAGE LLC';
const PICKUP = 'MIDWEST DISTRIBUTION CENTER';

/** The live rate confirmation, shaped as extraction now returns it. */
function rateConfirmation() {
  return {
    documentType: 'RATE_CONFIRMATION',
    header: {
      documentNumber: 'AFB-2026-11482',
      documentDate: '2026-08-03',
      originName: PICKUP,
      originAddress: { line1: '4400 W Industrial Dr', city: 'Chicago', state: 'IL', postalCode: '60638' },
      issuerName: ISSUER,
      issuerAddress: { line1: '900 Commerce Pkwy', city: 'Dallas', state: 'TX', postalCode: '75201' },
      issuerContact: { name: 'Dana Ruiz', phone: '214-555-0182', email: 'dana@apexfb.com' },
      totalRate: '1850.00',
      currency: 'USD',
    },
    consignments: [{ name: 'WILDE HONDA' }],
    extractionWarnings: [],
  };
}

function seed(extraction: unknown, documentType: string) {
  state.clients = [
    { id: 'client-apex', name: ISSUER, dbaName: null, city: 'Dallas', state: 'TX', contracts: [] },
    { id: 'client-mdc', name: PICKUP, dbaName: null, city: 'Chicago', state: 'IL', contracts: [] },
  ];
  state.confirmations = [];
  state.imports = [
    {
      id: IMPORT,
      orgId: ORG,
      status: 'NEEDS_REVIEW',
      documentType,
      documentNumber: 'AFB-2026-11482',
      // The column the broken parser never filled.
      documentDate: null,
      clientId: null,
      contractId: null,
      originalName: 'rate-confirmation.pdf',
      sourceFileKeys: ['keys/rate-confirmation.pdf'],
      sourceMimeType: 'application/pdf',
      rawExtraction: extraction,
      reviewedExtraction: null,
      extractionWarnings: [],
      createdTripId: null,
      failureCode: null,
      failureMessage: null,
      createdAt: new Date('2026-08-04T21:01:14.526Z'),
      updatedAt: new Date('2026-08-04T21:01:14.526Z'),
    },
  ];
}

beforeEach(() => seed(rateConfirmation(), 'RATE_CONFIRMATION'));

describe('client resolution on a rate confirmation', () => {
  it('matches on the issuing broker, not the pickup facility', async () => {
    const view = await resolveImportById(ORG, USER, IMPORT);

    // The name the picker pre-types and everything scores against.
    expect(view?.client.documentText).toBe(ISSUER);
    expect(view?.client.documentText).not.toBe(PICKUP);
  });

  it('offers the broker as the candidate, and collapses onto it', async () => {
    const view = await resolveImportById(ORG, USER, IMPORT);

    // Exactly one active client matches the issuer exactly, so it collapses.
    expect(view?.client.state).toBe('RESOLVED');
    expect(view?.client.value?.name).toBe(ISSUER);
    expect(view?.client.why?.via).toBe('EXACT_MATCH');
    expect(view?.client.why?.matchedText).toBe(ISSUER);
  });

  it('pre-fills Create new client from the broker, address and all', async () => {
    // Creating "APEX FREIGHT BROKERAGE LLC" with the warehouse's street
    // address would be a wrong record that outlives the import.
    const view = await resolveImportById(ORG, USER, IMPORT);

    expect(view?.client.createPrefill.name).toBe(ISSUER);
    expect(view?.client.createPrefill.city).toBe('Dallas');
    expect(view?.client.createPrefill.primaryContact).toBe('Dana Ruiz');
    expect(view?.client.createPrefill.email).toBe('dana@apexfb.com');
  });

  it('teaches the profile the issuer, so the next one collapses on the right name', async () => {
    await assignClient(ORG, USER, IMPORT, 'client-apex', { via: 'MANUAL' });

    expect(state.confirmations).toHaveLength(1);
    expect(state.confirmations[0].originName).toBe(ISSUER);
  });

  it('falls back to the origin when no issuer was printed', async () => {
    const noIssuer = rateConfirmation();
    noIssuer.header.issuerName = null as unknown as string;
    seed(noIssuer, 'RATE_CONFIRMATION');

    // A candidate list built from the wrong name still beats a blank screen.
    const view = await resolveImportById(ORG, USER, IMPORT);
    expect(view?.client.documentText).toBe(PICKUP);
  });
});

describe('client resolution on a manifest', () => {
  it('still matches on the origin — there the shipper IS the customer', async () => {
    seed(
      {
        documentType: 'MANIFEST',
        header: {
          originName: 'DEALER TIRE - CHICAGO WHSE',
          // A manifest carrying a stray issuer must not be hijacked by it.
          issuerName: 'SOMEBODY ELSE',
          documentDate: '07/27/26',
        },
        consignments: [{ name: 'RUSS DARROW NISSAN' }],
        extractionWarnings: [],
      },
      'MANIFEST',
    );

    const view = await resolveImportById(ORG, USER, IMPORT);
    expect(view?.client.documentText).toBe('DEALER TIRE - CHICAGO WHSE');
  });
});

describe('the date on the card', () => {
  it('shows the extraction date when the column never got one', async () => {
    // Exactly the state of every import taken before the parser was fixed.
    const view = await resolveImportById(ORG, USER, IMPORT);
    expect(view?.documentDate).toBe('2026-08-03');
  });

  it('reads a date the model returned as printed', async () => {
    const printed = rateConfirmation();
    printed.header.documentDate = '08/03/26';
    seed(printed, 'RATE_CONFIRMATION');

    const view = await resolveImportById(ORG, USER, IMPORT);
    expect(view?.documentDate).toBe('2026-08-03');
  });

  it('prefers the stored column when it has one', async () => {
    state.imports[0].documentDate = new Date('2026-08-01T00:00:00.000Z');
    const view = await resolveImportById(ORG, USER, IMPORT);
    expect(view?.documentDate).toBe('2026-08-01');
  });
});

describe('what the import is called', () => {
  const record = () => state.imports[0] as never;

  it('titles a rate confirmation from the issuer, not the filename', () => {
    // "rate-confirmation.pdf" is what the phone called the file; it tells a
    // dispatcher with three imports open nothing about which one this is.
    expect(buildSummary(record())?.title).toBe('Apex Freight Brokerage LLC rate confirmation');
  });

  it('names the party actually matched, and the pickup separately', () => {
    const summary = buildSummary(record());
    expect(summary?.clientNameOnDocument).toBe(ISSUER);
    expect(summary?.originName).toBe(PICKUP);
  });

  it('titles a manifest from the shipper', () => {
    seed(
      {
        documentType: 'MANIFEST',
        header: { originName: 'DEALER TIRE - CHICAGO WHSE', documentDate: '07/27/26' },
        consignments: [{ name: 'RUSS DARROW NISSAN' }],
        extractionWarnings: [],
      },
      'MANIFEST',
    );
    state.imports[0].originalName = 'page-2.jpg';

    // Shouted names are title-cased for display; the trade abbreviation is not.
    expect(buildSummary(record())?.title).toBe('Dealer Tire - Chicago WHSE manifest');
  });

  it('carries the same title into the recent list', () => {
    expect(toListItem(record()).title).toBe('Apex Freight Brokerage LLC rate confirmation');
  });

  it('carries the date through the summary too', () => {
    expect(buildSummary(record())?.documentDate).toBe('2026-08-03');
  });

  it('has nothing to title before extraction, and says so', () => {
    seed(null, 'UNKNOWN');
    // The caller falls back to the filename — the only honest thing left.
    expect(buildSummary(record())).toBeNull();
    expect(toListItem(record()).title).toBeNull();
  });
});
