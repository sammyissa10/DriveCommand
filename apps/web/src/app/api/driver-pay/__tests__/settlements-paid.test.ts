/**
 * settlements-paid.test.ts
 *
 * Tests the mark-paid and void routes:
 * - mark-paid flips settlement to PAID and all child assignments to PAID
 * - mark-paid updates DriverBonus.paidAt
 * - mark-paid on non-FINALIZED returns 409
 * - PAID settlement cannot be voided (409)
 * - void on DRAFT releases assignments (settlementId=null)
 * - void on FINALIZED also releases assignments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST as markPaid } from '@/app/api/driver-pay/settlements/[settlementId]/mark-paid/route';
import { POST as voidSettlement } from '@/app/api/driver-pay/settlements/[settlementId]/void/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ownerSession = {
  userId: 'u1',
  email: 'owner@test.com',
  role: 'OWNER',
  tenantId: 'tenant-A',
};

function makeSettlement(status: string) {
  return {
    id: 'settlement-1',
    tenantId: 'tenant-A',
    driverId: 'driver-1',
    status,
    periodStart: new Date('2026-04-08'),
    periodEnd: new Date('2026-04-14'),
    netPay: { toString: () => '950.00' },
    settlementReference: 'SET-REF',
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    deletedAt: null,
  };
}

function makePrismaForMarkPaid(status: string) {
  const settlement = makeSettlement(status);

  const updatedSettlement = {
    ...settlement,
    status: 'PAID',
    paidAt: new Date(),
    updatedAt: new Date(),
  };

  return {
    driverSettlement: {
      findFirst: vi.fn().mockResolvedValue(settlement),
      update: vi.fn().mockResolvedValue(updatedSettlement),
    },
    loadDriverAssignment: {
      updateMany: vi.fn().mockResolvedValue({ count: 3 }),
    },
    driverBonus: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => {
      return Promise.all(ops);
    }),
  };
}

function makePrismaForVoid(status: string, notes: string | null = null) {
  const settlement = { ...makeSettlement(status), notes };

  return {
    driverSettlement: {
      findFirst: vi.fn().mockResolvedValue(settlement),
      update: vi.fn().mockResolvedValue({ ...settlement, status: 'VOIDED', updatedAt: new Date() }),
    },
    loadDriverAssignment: {
      updateMany: vi.fn().mockResolvedValue({ count: 2 }),
    },
    driverBonus: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    driverDeduction: {
      update: vi.fn().mockResolvedValue({}),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation(async (ops: unknown[]) => {
      return Promise.all(ops);
    }),
  };
}

function makeReq(method: string, body?: object, url = 'http://localhost/api/test') {
  return new NextRequest(new URL(url), {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ---------------------------------------------------------------------------
// Tests — mark-paid
// ---------------------------------------------------------------------------

describe('POST /settlements/[settlementId]/mark-paid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(ownerSession);
  });

  it('returns 200 and flips status to PAID', async () => {
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrismaForMarkPaid('FINALIZED') as never);

    const res = await markPaid(makeReq('POST', {}), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.settlement.status).toBe('PAID');
  });

  it('updates all child LoadDriverAssignment to PAID', async () => {
    const prisma = makePrismaForMarkPaid('FINALIZED');
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await markPaid(makeReq('POST', {}), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(prisma.loadDriverAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settlementId: 'settlement-1' },
        data: expect.objectContaining({ payStatus: 'PAID' }),
      }),
    );
  });

  it('updates DriverBonus.paidAt for linked bonuses', async () => {
    const prisma = makePrismaForMarkPaid('FINALIZED');
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await markPaid(makeReq('POST', {}), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(prisma.driverBonus.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settlementId: 'settlement-1' },
        data: expect.objectContaining({ paidAt: expect.any(Date) }),
      }),
    );
  });

  it('returns 409 when settlement is DRAFT (not FINALIZED)', async () => {
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrismaForMarkPaid('DRAFT') as never);

    const res = await markPaid(makeReq('POST', {}), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/FINALIZED/i);
  });
});

// ---------------------------------------------------------------------------
// Tests — void
// ---------------------------------------------------------------------------

describe('POST /settlements/[settlementId]/void', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(ownerSession);
  });

  it('returns 409 when settlement is PAID', async () => {
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrismaForVoid('PAID') as never);

    const res = await voidSettlement(makeReq('POST', { reason: 'Trying to void paid' }), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/PAID/i);
  });

  it('void on DRAFT: releases assignments back (settlementId=null)', async () => {
    const prisma = makePrismaForVoid('DRAFT');
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await voidSettlement(
      makeReq('POST', { reason: 'Generated in error, driver period incorrect' }),
      { params: Promise.resolve({ settlementId: 'settlement-1' }) },
    );

    expect(res.status).toBe(200);
    expect(prisma.loadDriverAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settlementId: 'settlement-1' },
        data: { settlementId: null },
      }),
    );
  });

  it('void on FINALIZED: releases assignments', async () => {
    const prisma = makePrismaForVoid('FINALIZED');
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await voidSettlement(
      makeReq('POST', { reason: 'Finalized incorrectly, need to regenerate' }),
      { params: Promise.resolve({ settlementId: 'settlement-1' }) },
    );

    expect(res.status).toBe(200);
    expect(prisma.loadDriverAssignment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { settlementId: 'settlement-1' },
        data: { settlementId: null },
      }),
    );
  });

  it('returns 400 when reason is too short', async () => {
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrismaForVoid('DRAFT') as never);

    const res = await voidSettlement(makeReq('POST', { reason: 'bad' }), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(400);
  });
});
