/**
 * The zero-contract client: the step must offer a way out, and taking it must
 * finish the step.
 *
 * This is the common path, not an edge case — a client created inline during
 * the import has no contracts by definition, so every new client lands here.
 * Before `createOffer` existed the screen stated the situation and offered no
 * action, and the wizard could not proceed.
 *
 * The database is a fake: what is under test is which of the three affordances
 * the view exposes (pick / one-time / create) and whether creating one advances
 * `resolved`, none of which is a question about SQL.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Fake tables. Hoisted because the module mocks below close over them.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  clients: [] as Array<{ id: string; name: string; dbaName: string | null; city: string | null; state: string | null; contracts: Array<{ id: string; expirationDate: Date | null }> }>,
  contracts: [] as Array<Record<string, unknown>>,
  imports: [] as Array<Record<string, unknown>>,
  created: [] as Array<{ clientId: string; data: Record<string, unknown> }>,
  pinned: [] as Array<Record<string, unknown>>,
  nextContractId: 1,
}));

const db = vi.hoisted(() => ({
  carrierClient: {
    findMany: async () => state.clients,
    findFirst: async ({ where }: { where: { id: string } }) =>
      state.clients.find((c) => c.id === where.id) ?? null,
  },
  carrierContract: {
    findMany: async ({ where }: { where: { clientId: string } }) =>
      state.contracts.filter((c) => c.clientId === where.clientId),
    findFirst: async ({ where }: { where: { id: string; clientId?: string } }) =>
      state.contracts.find(
        (c) => c.id === where.id && (!where.clientId || c.clientId === where.clientId),
      ) ?? null,
  },
  // Read by the Phase 4 stop-count line on the resolution view. Empty is the
  // honest fixture here — this suite is about the contract step, and a tenant
  // with no facilities simply puts every stop on T4.
  carrierFacility: { findMany: async () => [] },
  facilityExternalReference: { findMany: async () => [] },
  // Read by the Phase 6 template row on the resolution view, once the client
  // and the contract are both resolved. Empty for the same reason as the two
  // above: this suite is about the contract step, and a tenant with no saved
  // routes gets the "nothing looks like today's run" band, which is correct and
  // is not what these tests assert on.
  routeTemplate: { findMany: async () => [] },
  documentImport: {
    updateMany: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const row = state.imports.find((i) => i.id === where.id);
      if (row) Object.assign(row, data);
      return { count: row ? 1 : 0 };
    },
  },
  carrierDocument: { create: async () => ({}) },
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrismaForOrg: async () => db,
  getTenantPrisma: async () => db,
}));

vi.mock('../persistence', () => ({
  getImportRecord: async (_orgId: string, importId: string) =>
    state.imports.find((i) => i.id === importId) ?? null,
}));

vi.mock('../profiles', () => ({
  UNKNOWN_DOCUMENT_TYPE: 'UNKNOWN',
  listProfilesForType: async () => [],
  getProfile: async () => null,
  findProfileByAlias: () => null,
  recordClientConfirmation: async () => ({ id: 'profile-1' }),
  pinContract: async (_db: unknown, _orgId: string, _userId: string, args: Record<string, unknown>) => {
    state.pinned.push(args);
  },
}));

vi.mock('@/lib/carrier/contracts', () => ({
  createContract: async (_orgId: string, clientId: string, data: Record<string, unknown>) => {
    state.created.push({ clientId, data });
    const row = {
      id: `contract-${state.nextContractId++}`,
      clientId,
      contractNumber: 'CN-2026-00001',
      contractName: (data.contractName as string | undefined) ?? null,
      contractType: data.contractType,
      rateType: data.rateType,
      baseRate: null,
      effectiveDate: data.effectiveDate ? new Date(String(data.effectiveDate)) : null,
      expirationDate: data.expirationDate ? new Date(String(data.expirationDate)) : null,
    };
    state.contracts.push(row);
    return row;
  },
}));

import { createAndAssignContract, resolveImportById } from '../resolution';

// ---------------------------------------------------------------------------

const ORG = 'org-1';
const USER = 'user-1';
const IMPORT = 'import-1';

/** A manifest whose client is already settled and whose client has nothing. */
function seed(documentType = 'MANIFEST') {
  state.clients = [
    {
      id: 'client-1',
      name: 'DEALER TIRE - CHICAGO WHSE',
      dbaName: null,
      city: 'Chicago',
      state: 'IL',
      contracts: [],
    },
  ];
  state.contracts = [];
  state.created = [];
  state.pinned = [];
  state.nextContractId = 1;
  state.imports = [
    {
      id: IMPORT,
      orgId: ORG,
      status: 'NEEDS_REVIEW',
      documentType,
      documentNumber: 'M-1234',
      documentDate: new Date('2026-07-27T00:00:00.000Z'),
      clientId: 'client-1',
      contractId: null,
      originalName: 'manifest.pdf',
      sourceFileKeys: ['keys/manifest.pdf'],
      rawExtraction: {
        header: { originName: 'DEALER TIRE - CHICAGO WHSE' },
        consignments: [{}, {}],
      },
      reviewedExtraction: null,
    },
  ];
}

beforeEach(() => seed());

describe('a client with zero active contracts', () => {
  it('offers a create action rather than a dead end', async () => {
    const view = await resolveImportById(ORG, USER, IMPORT);

    expect(view?.contract.state).toBe('UNRESOLVED');
    expect(view?.contract.candidates).toHaveLength(0);
    // The three affordances are mutually exclusive, and exactly one is live.
    expect(view?.contract.spotOffer).toBeNull();
    expect(view?.contract.createOffer).not.toBeNull();
    expect(view?.contract.createOffer?.clientName).toBe('DEALER TIRE - CHICAGO WHSE');
    // The old dead end: a reason with no way to act on it.
    expect(view?.contract.blockedReason).toBeNull();
  });

  it('does not restate the step’s own sentence', async () => {
    const view = await resolveImportById(ORG, USER, IMPORT);
    // "…has no active contract" is said once, by the step heading. The offer is
    // about what to do, and repeating the situation was half the defect.
    expect(view?.contract.createOffer?.detail).not.toMatch(/no active contract/i);
    expect(view?.contract.createOffer?.detail).toMatch(/create one here/i);
  });

  it('advances resolution when the create action is completed', async () => {
    const before = await resolveImportById(ORG, USER, IMPORT);
    expect(before?.resolved).toBe(false);

    const after = await createAndAssignContract(ORG, USER, IMPORT, {
      spot: false,
      contractName: 'Standard freight',
    });

    expect(after.contract.state).toBe('RESOLVED');
    expect(after.contract.value?.contractName).toBe('Standard freight');
    expect(after.contract.createOffer).toBeNull();
    // Client was already settled, so the whole phase is now settled — this is
    // the wizard moving on, which is what the dead end prevented.
    expect(after.resolved).toBe(true);
  });

  it('creates a standing contract, not a one-time one', async () => {
    await createAndAssignContract(ORG, USER, IMPORT, { spot: false });

    expect(state.created).toHaveLength(1);
    const { clientId, data } = state.created[0];
    expect(clientId).toBe('client-1');
    expect(data.contractType).toBe('contract');
    expect(data.status).toBe('active');
    // Nothing invented: no rate, no term. The document states neither.
    expect(data.baseRate).toBeUndefined();
    expect(data.effectiveDate).toBeUndefined();
    expect(data.expirationDate).toBeUndefined();
    expect(data.rateType).toBe('per_mile');
  });

  it('survives the create the way the client create does — the id is on the row', async () => {
    await createAndAssignContract(ORG, USER, IMPORT, { spot: false });

    // Nothing about where the user is lives client-side: a fresh read of the
    // import lands on the same screen state the write returned.
    expect(state.imports[0].contractId).toBe('contract-1');
    const reread = await resolveImportById(ORG, USER, IMPORT);
    expect(reread?.contract.state).toBe('RESOLVED');
    expect(reread?.resolved).toBe(true);
    // And the next document of this type from this client skips the question.
    expect(state.pinned).toHaveLength(1);
  });

  it('rejects a rate type the contracts table would refuse', async () => {
    await expect(
      createAndAssignContract(ORG, USER, IMPORT, { spot: false, rateType: 'per_furlong' }),
    ).rejects.toThrow(/not a rate type/i);
    expect(state.created).toHaveLength(0);
  });
});

describe('a rate confirmation with zero contracts', () => {
  it('keeps the one-time offer and does not also offer a standing contract', async () => {
    seed('RATE_CONFIRMATION');
    const view = await resolveImportById(ORG, USER, IMPORT);

    expect(view?.contract.spotOffer).not.toBeNull();
    expect(view?.contract.createOffer).toBeNull();
  });
});

describe('a client that does have contracts', () => {
  it('offers the picker AND a create path — none of them may be the right one', async () => {
    state.contracts = [
      {
        id: 'contract-a',
        clientId: 'client-1',
        contractNumber: 'CN-2026-00001',
        contractName: 'Chicago lane',
        contractType: 'contract',
        rateType: 'per_mile',
        baseRate: null,
        effectiveDate: null,
        expirationDate: null,
      },
      {
        id: 'contract-b',
        clientId: 'client-1',
        contractNumber: 'CN-2026-00002',
        contractName: 'Detroit lane',
        contractType: 'contract',
        rateType: 'per_mile',
        baseRate: null,
        effectiveDate: null,
        expirationDate: null,
      },
    ];

    const view = await resolveImportById(ORG, USER, IMPORT);
    expect(view?.contract.candidates).toHaveLength(2);
    expect(view?.contract.createOffer).not.toBeNull();
    // The wording turns on whether there is anything to reject.
    expect(view?.contract.createOffer?.detail).toMatch(/none of these/i);
  });

  it('still gives a rate confirmation the one-time offer and only that', async () => {
    seed('RATE_CONFIRMATION');
    state.contracts = [
      {
        id: 'contract-a',
        clientId: 'client-1',
        contractNumber: 'CN-2026-00001',
        contractName: 'Chicago lane',
        contractType: 'contract',
        rateType: 'per_mile',
        baseRate: null,
        effectiveDate: null,
        expirationDate: null,
      },
      {
        id: 'contract-b',
        clientId: 'client-1',
        contractNumber: 'CN-2026-00002',
        contractName: 'Detroit lane',
        contractType: 'contract',
        rateType: 'per_mile',
        baseRate: null,
        effectiveDate: null,
        expirationDate: null,
      },
    ];

    const view = await resolveImportById(ORG, USER, IMPORT);
    expect(view?.contract.spotOffer).not.toBeNull();
    expect(view?.contract.createOffer).toBeNull();
  });
});
