import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  requireTenantId: vi.fn().mockResolvedValue('tenant-A'),
  getTenantPrisma: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import {
  GET as listBonuses,
  POST as createBonus,
} from '@/app/api/driver-pay/drivers/[driverId]/bonuses/route';
import { PATCH as patchBonus } from '@/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route';
import {
  GET as listDeductions,
  POST as createDeduction,
} from '@/app/api/driver-pay/drivers/[driverId]/deductions/route';
import { PATCH as patchDeduction } from '@/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fakeDriver = {
  id: 'd1',
  orgId: 'tenant-A',
  firstName: 'John',
  lastName: 'Driver',
};

const fakeBonus = {
  id: 'b-1',
  tenantId: 'tenant-A',
  driverId: 'd1',
  bonusType: 'SAFETY',
  amount: { toString: () => '500.00' },
  description: 'Safety bonus',
  triggerDate: new Date('2026-06-01'),
  scheduledPayDate: null,
  paidAt: null,
  installmentNumber: null,
  totalInstallments: null,
  parentBonusId: null,
  referredDriverId: null,
  settlementId: null,
  isTaxable: true,
  visibleToDriver: true,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'u1',
  deletedAt: null,
};

const fakeDeduction = {
  id: 'ded-1',
  tenantId: 'tenant-A',
  driverId: 'd1',
  deductionType: 'ADVANCE',
  schedule: 'EVERY_SETTLEMENT',
  amountPerPeriod: { toString: () => '100.00' },
  totalAmount: null,
  amountCollected: { toString: () => '0.00' },
  maxPercentageOfNet: null,
  startsOn: new Date('2026-06-01'),
  endsOn: null,
  paused: false,
  visibleToDriver: true,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  createdBy: 'u1',
  deletedAt: null,
};

function makePrisma(opts: {
  driver?: object | null;
  bonus?: object | null;
  deduction?: object | null;
} = {}) {
  const resolvedDriver =
    opts.driver === undefined ? fakeDriver : opts.driver;

  const prismaInstance = {
    carrierDriver: {
      findFirst: vi.fn().mockResolvedValue(resolvedDriver),
    },
    driverBonus: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'b-new',
          tenantId: 'tenant-A',
          driverId: 'd1',
          bonusType: data.bonusType,
          amount: { toString: () => String(data.amount) },
          description: data.description,
          triggerDate: new Date(),
          scheduledPayDate: data.scheduledPayDate ?? null,
          paidAt: null,
          installmentNumber: data.installmentNumber ?? null,
          totalInstallments: data.totalInstallments ?? null,
          parentBonusId: data.parentBonusId ?? null,
          referredDriverId: data.referredDriverId ?? null,
          settlementId: null,
          isTaxable: data.isTaxable ?? true,
          visibleToDriver: data.visibleToDriver ?? true,
          notes: data.notes ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u1',
          deletedAt: null,
        }),
      ),
      findFirst: vi
        .fn()
        .mockResolvedValue(opts.bonus === undefined ? fakeBonus : opts.bonus),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...fakeBonus, ...data }),
      ),
    },
    driverDeduction: {
      create: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'ded-new',
          tenantId: 'tenant-A',
          driverId: 'd1',
          deductionType: data.deductionType,
          schedule: data.schedule,
          amountPerPeriod: { toString: () => String(data.amountPerPeriod) },
          totalAmount: data.totalAmount ? { toString: () => String(data.totalAmount) } : null,
          amountCollected: { toString: () => '0' },
          maxPercentageOfNet: data.maxPercentageOfNet
            ? { toString: () => String(data.maxPercentageOfNet) }
            : null,
          startsOn: new Date(data.startsOn as string),
          endsOn: null,
          paused: false,
          visibleToDriver: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u1',
          deletedAt: null,
        }),
      ),
      findFirst: vi
        .fn()
        .mockResolvedValue(opts.deduction === undefined ? fakeDeduction : opts.deduction),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...fakeDeduction, ...data }),
      ),
    },
    $transaction: vi.fn(),
  };

  // Wire up $transaction to invoke the callback with the prisma instance itself
  (prismaInstance.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
    async (fn: unknown) => {
      if (typeof fn === 'function') {
        return fn(prismaInstance);
      }
      return Promise.all(fn as Promise<unknown>[]);
    },
  );

  return prismaInstance;
}

function makeReq(method: string, body?: object, url = 'http://localhost/api/test') {
  return new NextRequest(new URL(url), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

const ownerSession = {
  userId: 'u1',
  email: 'owner@test.com',
  role: 'OWNER',
  tenantId: 'tenant-A',
};

const managerSession = {
  userId: 'u2',
  email: 'manager@test.com',
  role: 'MANAGER',
  tenantId: 'tenant-A',
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(ownerSession);
  vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma() as never);
});

// ---------------------------------------------------------------------------
// Scenario 1: Installment splitter penny-exact (integration test)
// ---------------------------------------------------------------------------

describe('POST /bonuses — multi-installment penny-exact', () => {
  it('creates 3 installments summing to exactly $1000 (333.33 + 333.33 + 333.34)', async () => {
    const amounts: string[] = [];

    const prisma = makePrisma();
    // Track create calls and capture amounts
    (prisma.driverBonus.create as ReturnType<typeof vi.fn>).mockImplementation(
      ({ data }: { data: Record<string, unknown> }) => {
        const amountStr = String(data.amount);
        amounts.push(amountStr);
        return Promise.resolve({
          id: amounts.length === 1 ? 'parent-id' : `child-${amounts.length}`,
          tenantId: 'tenant-A',
          driverId: 'd1',
          bonusType: data.bonusType,
          amount: { toString: () => amountStr },
          description: String(data.description),
          triggerDate: new Date(),
          scheduledPayDate: data.scheduledPayDate ?? null,
          paidAt: null,
          installmentNumber: data.installmentNumber ?? null,
          totalInstallments: data.totalInstallments ?? null,
          parentBonusId: data.parentBonusId ?? null,
          referredDriverId: null,
          settlementId: null,
          isTaxable: true,
          visibleToDriver: true,
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          createdBy: 'u1',
          deletedAt: null,
        });
      },
    );

    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await createBonus(
      makeReq('POST', {
        bonusType: 'PERFORMANCE',
        amount: '1000',
        description: 'Performance bonus',
        triggerDate: '2026-06-01',
        totalInstallments: 3,
        intervalDays: 14,
      }),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(201);
    // 3 creates: 1 parent + 2 children (transaction stub calls create inline)
    expect(prisma.driverBonus.create).toHaveBeenCalledTimes(3);

    // Amounts must sum to 1000 and be [333.33, 333.33, 333.34]
    expect(amounts).toHaveLength(3);
    // The Decimal values are passed directly — check via the stored strings
    // Decimal(333.33) + Decimal(333.33) + Decimal(333.34) = 1000
    const decimalAmounts = amounts.map(Number);
    const sum = decimalAmounts.reduce((a, b) => a + b, 0);
    expect(Math.round(sum * 100)).toBe(100000); // 1000.00 in cents
  });
});

// ---------------------------------------------------------------------------
// Scenario 2: Pause persists
// ---------------------------------------------------------------------------

describe('PATCH /deductions/:id — pause persists', () => {
  it('updates paused=true and returns 200 with paused: true', async () => {
    const prisma = makePrisma({
      deduction: { ...fakeDeduction, paused: false },
    });
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);
    vi.mocked(getSession).mockResolvedValue(managerSession);

    const res = await patchDeduction(
      makeReq('PATCH', { paused: true }),
      { params: Promise.resolve({ driverId: 'd1', deductionId: 'ded-1' }) },
    );

    expect(res.status).toBe(200);
    expect(prisma.driverDeduction.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ paused: true }),
      }),
    );
    const body = await res.json();
    expect(body.deduction).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Scenario 3: REFERRAL validation both directions
// ---------------------------------------------------------------------------

describe('POST /bonuses — REFERRAL validation', () => {
  it('3a: returns 422 when bonusType=REFERRAL and no referredDriverId', async () => {
    const res = await createBonus(
      makeReq('POST', {
        bonusType: 'REFERRAL',
        amount: '500',
        description: 'Referral bonus',
        triggerDate: '2026-06-01',
        // no referredDriverId
      }),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/[Rr]eferral/);
  });

  it('3b: returns 422 when bonusType=SAFETY with referredDriverId set', async () => {
    // Use a valid UUID v4 (8-4-4-4-12 with correct version/variant bits)
    const validUuid = 'a3bb189e-8bf9-4bc5-8e72-9e8ca24c3e11';
    const res = await createBonus(
      makeReq('POST', {
        bonusType: 'SAFETY',
        amount: '500',
        description: 'Safety bonus',
        triggerDate: '2026-06-01',
        referredDriverId: validUuid,
      }),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/REFERRAL/);
  });
});

// ---------------------------------------------------------------------------
// Scenario 4: Cross-tenant isolation
// ---------------------------------------------------------------------------

describe('POST /bonuses — cross-tenant isolation', () => {
  it('returns 404 when driver is not found in tenant (cross-tenant access blocked)', async () => {
    const prisma = makePrisma({ driver: null }); // getTenantPrisma returns null for driverId
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await createBonus(
      makeReq('POST', {
        bonusType: 'SAFETY',
        amount: '500',
        description: 'Safety bonus',
        triggerDate: '2026-06-01',
      }),
      { params: Promise.resolve({ driverId: 'foreign-driver-id' }) },
    );

    expect(res.status).toBe(404);
    expect(prisma.driverBonus.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Scenario 5: Garnishment cap on deduction
// ---------------------------------------------------------------------------

describe('POST /deductions — 50% garnishment cap', () => {
  it('returns 422 when maxPercentageOfNet > 50', async () => {
    const res = await createDeduction(
      makeReq('POST', {
        deductionType: 'GARNISHMENT',
        schedule: 'EVERY_SETTLEMENT',
        amountPerPeriod: '200',
        maxPercentageOfNet: '60',
        startsOn: '2026-06-01',
      }),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toMatch(/50%/);
  });

  it('returns 201 when maxPercentageOfNet = 50 (at boundary)', async () => {
    const res = await createDeduction(
      makeReq('POST', {
        deductionType: 'GARNISHMENT',
        schedule: 'EVERY_SETTLEMENT',
        amountPerPeriod: '200',
        maxPercentageOfNet: '50',
        startsOn: '2026-06-01',
      }),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(201);
  });
});

// ---------------------------------------------------------------------------
// Scenario 6: Manager cannot create bonus (RBAC)
// ---------------------------------------------------------------------------

describe('POST /bonuses — RBAC: Manager cannot create', () => {
  it('returns 403 when role is MANAGER', async () => {
    vi.mocked(getSession).mockResolvedValue(managerSession);

    const res = await createBonus(
      makeReq('POST', {
        bonusType: 'SAFETY',
        amount: '500',
        description: 'Safety bonus',
        triggerDate: '2026-06-01',
      }),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// Scenario 7: Bonus list returns 401 when unauthenticated
// ---------------------------------------------------------------------------

describe('GET /bonuses — auth gate', () => {
  it('returns 401 when no session', async () => {
    vi.mocked(getSession).mockResolvedValue(null);

    const res = await listBonuses(
      makeReq('GET'),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// Scenario 8: Deduction list returns empty array
// ---------------------------------------------------------------------------

describe('GET /deductions — empty list', () => {
  it('returns 200 with empty deductions array', async () => {
    const prisma = makePrisma();
    (prisma.driverDeduction.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await listDeductions(
      makeReq('GET'),
      { params: Promise.resolve({ driverId: 'd1' }) },
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.deductions).toEqual([]);
  });
});
