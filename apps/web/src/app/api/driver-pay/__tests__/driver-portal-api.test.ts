import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock auth helpers before importing routes
vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/auth/mobile-auth', () => ({
  validateMobileToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  requireTenantId: vi.fn().mockResolvedValue('tenant-A'),
  getTenantPrisma: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {},
  TX_OPTIONS: {},
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { GET as listSettlements } from '@/app/api/driver-pay/me/settlements/route';
import { GET as getSettlement } from '@/app/api/driver-pay/me/settlements/[id]/route';
import { GET as getPdf } from '@/app/api/driver-pay/me/settlements/[id]/pdf/route';
import { POST as postDispute } from '@/app/api/driver-pay/me/settlements/[id]/dispute/route';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const driverSession = {
  userId: 'user-driver-1',
  email: 'driver@test.com',
  role: 'DRIVER',
  tenantId: 'tenant-A',
};

const fakeDriver = {
  id: 'driver-1',
  orgId: 'tenant-A',
  firstName: 'John',
  lastName: 'Driver',
};

const fakeSettlement = {
  id: 'settle-1',
  tenantId: 'tenant-A',
  driverId: 'driver-1',
  status: 'FINALIZED',
  periodStart: new Date('2026-05-05'),
  periodEnd: new Date('2026-05-11'),
  grossTaxable: { toString: () => '1500.00' },
  grossNonTaxable: { toString: () => '200.00' },
  totalDeductions: { toString: () => '100.00' },
  netPay: { toString: () => '1600.00' },
  settlementReference: 'REF-001',
  pdfUrl: 'https://example.com/settlement.pdf',
  finalizedBy: null,
  finalizedAt: null,
  paidAt: null,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'u1',
  deletedAt: null,
  assignments: [],
  bonuses: [],
};

function makePrisma(overrides: {
  driverResult?: object | null;
  settlementResult?: object | null;
  settlementFindManyResult?: object[];
  disputeCreateResult?: object;
  auditLogCreateResult?: object;
} = {}) {
  const driver = 'driverResult' in overrides ? overrides.driverResult : fakeDriver;
  const settlement = 'settlementResult' in overrides ? overrides.settlementResult : fakeSettlement;

  const prismaInstance = {
    carrierDriver: {
      findFirst: vi.fn().mockResolvedValue(driver),
    },
    driverSettlement: {
      findFirst: vi.fn().mockResolvedValue(settlement),
      findMany: vi.fn().mockResolvedValue(overrides.settlementFindManyResult ?? [fakeSettlement]),
      count: vi.fn().mockResolvedValue(1),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverDispute: {
      create: vi.fn().mockResolvedValue(
        overrides.disputeCreateResult ?? {
          id: 'dispute-1',
          status: 'OPEN',
          issueCategory: 'WRONG_AMOUNT',
          driverMessage: 'A'.repeat(60),
          createdAt: new Date(),
        },
      ),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn(),
  };

  // Wire $transaction to call the callback with the prismaInstance
  (prismaInstance.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: unknown) => {
      if (typeof fn === 'function') {
        return fn(prismaInstance);
      }
      // Array of promises (batch transaction)
      return Promise.all(fn as Promise<unknown>[]);
    },
  );

  return prismaInstance;
}

function makeReq(
  method: string,
  body?: object,
  url = 'http://localhost/api/driver-pay/me/settlements',
) {
  return new NextRequest(new URL(url), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function makeSettlementReq(
  settlementId: string,
  method = 'GET',
  body?: object,
) {
  return new NextRequest(
    new URL(`http://localhost/api/driver-pay/me/settlements/${settlementId}`),
    {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  // Default: driver session active
  (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(driverSession);
});

describe('GET /api/driver-pay/me/settlements', () => {
  it('returns only this driver settlements filtered by driverId', async () => {
    const prisma = makePrisma();
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeReq('GET');
    const res = await listSettlements(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toHaveProperty('settlements');

    // Verify prisma was called with driverId guard
    expect(prisma.carrierDriver.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ userId: driverSession.userId }) }),
    );
    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          driverId: fakeDriver.id,
          tenantId: driverSession.tenantId,
        }),
      }),
    );
  });

  it('returns 403 when session role is not DRIVER', async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...driverSession,
      role: 'MANAGER',
    });
    const req = makeReq('GET');
    const res = await listSettlements(req);
    expect(res.status).toBe(403);
  });

  it('returns 401 when no session and no Bearer token', async () => {
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const req = makeReq('GET');
    const res = await listSettlements(req);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/driver-pay/me/settlements/[id]', () => {
  it('returns 404 when settlement belongs to another driver', async () => {
    // Simulate: carrierDriver lookup returns driverA, but settlement.driverId = driverB
    // The route filters settlement by driverId so findFirst returns null
    const prisma = makePrisma({ settlementResult: null });
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('other-driver-settle-id');
    const res = await getSettlement(req, {
      params: Promise.resolve({ id: 'other-driver-settle-id' }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/not found/i);
  });

  it('returns 200 with settlement data when driver owns it', async () => {
    const prisma = makePrisma();
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('settle-1');
    const res = await getSettlement(req, {
      params: Promise.resolve({ id: 'settle-1' }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toHaveProperty('settlement');
  });
});

describe('GET /api/driver-pay/me/settlements/[id]/pdf', () => {
  it('returns 404 when settlement is not owned by this driver', async () => {
    const prisma = makePrisma({ settlementResult: null });
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('settle-other');
    const res = await getPdf(req, {
      params: Promise.resolve({ id: 'settle-other' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 404 when pdfUrl is null', async () => {
    const prisma = makePrisma({
      settlementResult: { ...fakeSettlement, pdfUrl: null },
    });
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('settle-1');
    const res = await getPdf(req, {
      params: Promise.resolve({ id: 'settle-1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.error).toMatch(/PDF not generated/i);
  });

  it('returns PDF url when settlement is owned', async () => {
    const prisma = makePrisma();
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('settle-1');
    const res = await getPdf(req, {
      params: Promise.resolve({ id: 'settle-1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.url).toBe(fakeSettlement.pdfUrl);
  });
});

describe('POST /api/driver-pay/me/settlements/[id]/dispute', () => {
  it('rejects message shorter than 50 chars (400)', async () => {
    const prisma = makePrisma();
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('settle-1', 'POST', {
      issueCategory: 'WRONG_AMOUNT',
      driverMessage: 'too short',
    });
    const res = await postDispute(req, {
      params: Promise.resolve({ id: 'settle-1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/50 characters/i);
  });

  it('rejects dispute on a PAID settlement (400)', async () => {
    const prisma = makePrisma({
      settlementResult: { ...fakeSettlement, status: 'PAID' },
    });
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('settle-1', 'POST', {
      issueCategory: 'MISSING_PAY',
      driverMessage: 'A'.repeat(60),
    });
    const res = await postDispute(req, {
      params: Promise.resolve({ id: 'settle-1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error).toMatch(/FINALIZED/i);
  });

  it('creates DriverDispute + audit log on valid FINALIZED dispute (201)', async () => {
    const prisma = makePrisma(); // default settlement is FINALIZED
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const driverMessage = 'A'.repeat(100);
    const req = makeSettlementReq('settle-1', 'POST', {
      issueCategory: 'WRONG_AMOUNT',
      driverMessage,
    });
    const res = await postDispute(req, {
      params: Promise.resolve({ id: 'settle-1' }),
    });
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json).toHaveProperty('dispute');
    expect(json.dispute.status).toBe('OPEN');
    expect(json.dispute.issueCategory).toBe('WRONG_AMOUNT');

    // Verify driverDispute.create was called with correct fields
    expect(prisma.driverDispute.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          targetType: 'SETTLEMENT',
          issueCategory: 'WRONG_AMOUNT',
          driverMessage,
          createdBy: driverSession.userId,
        }),
      }),
    );

    // Verify audit log was written
    expect(prisma.driverPayAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'DISPUTE_OPENED',
          entityType: 'SETTLEMENT',
        }),
      }),
    );
  });
});

describe('Tenant isolation', () => {
  it('driver in tenant A cannot read tenant B data — all queries pass tenantId from session', async () => {
    const tenantASession = { ...driverSession, tenantId: 'tenant-A' };
    (getSession as ReturnType<typeof vi.fn>).mockResolvedValue(tenantASession);

    const prisma = makePrisma({
      // Settlement findFirst returns null — simulates tenant B row not returned
      // because route filters by tenantId: 'tenant-A'
      settlementResult: null,
    });
    (getTenantPrisma as ReturnType<typeof vi.fn>).mockResolvedValue(prisma);

    const req = makeSettlementReq('tenant-B-settle-id');
    const res = await getSettlement(req, {
      params: Promise.resolve({ id: 'tenant-B-settle-id' }),
    });

    // 404 because findFirst filters by tenantId + driverId — tenant B row won't match
    expect(res.status).toBe(404);

    // Verify tenantId was passed as tenant-A (session's tenantId) in findMany/findFirst
    expect(prisma.driverSettlement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: 'tenant-A' }),
      }),
    );
  });
});
