/**
 * state-machine.finalize.snapshot.test.ts
 *
 * Tests that the finalize route stamps employmentTypeSnapshot from the active
 * DriverCompensationTemplate at FINALIZED transition time.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn().mockImplementation((input) => input),
}));

vi.mock('@/lib/storage/s3-client', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
  getBucketName: vi.fn().mockReturnValue('test-bucket'),
}));

vi.mock('@/lib/driver-pay/settlement-pdf', () => ({
  generateSettlementPdf: vi.fn().mockResolvedValue(Buffer.from('PDF_CONTENT_MOCK')),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST as finalizeSettlement } from '@/app/api/driver-pay/settlements/[settlementId]/finalize/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ownerSession = {
  userId: 'u1',
  email: 'owner@test.com',
  role: 'OWNER',
  tenantId: 'tenant-A',
};

function makeDraftSettlement() {
  return {
    id: 'settlement-1',
    tenantId: 'tenant-A',
    driverId: 'driver-1',
    status: 'DRAFT',
    periodStart: new Date('2026-04-08'),
    periodEnd: new Date('2026-04-14'),
    grossTaxable: { toString: () => '1000.00' },
    grossNonTaxable: { toString: () => '50.00' },
    totalDeductions: { toString: () => '100.00' },
    netPay: { toString: () => '950.00' },
    settlementReference: 'SET-20260408-DRV-ABC',
    pdfUrl: null,
    finalizedBy: null,
    finalizedAt: null,
    paidAt: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    deletedAt: null,
    driver: {
      id: 'driver-1',
      firstName: 'Test',
      lastName: 'Driver',
      payModel: 'per_mile',
    },
    assignments: [],
    bonuses: [],
  };
}

function makeTemplate(employmentType: 'W2_EMPLOYEE' | 'OWNER_OPERATOR_1099') {
  return {
    id: 'template-1',
    tenantId: 'tenant-A',
    driverId: 'driver-1',
    employmentType,
    payType: 'FLAT_PER_LOAD',
    baseRate: { toString: () => '500.00' },
    rateUnit: 'FLAT',
    loadedMilesOnly: false,
    fuelSurchargeRate: null,
    perDiemEnabled: false,
    perDiemRate: null,
    overtimeEligible: false,
    overtimeThresholdHours: null,
    overtimeMultiplier: null,
    dailyOvertimeThreshold: null,
    weeklyEarningGoal: null,
    currency: 'USD',
    effectiveFrom: new Date('2026-01-01'),
    effectiveTo: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'u1',
    deletedAt: null,
  };
}

function makePrisma(employmentType: 'W2_EMPLOYEE' | 'OWNER_OPERATOR_1099') {
  return {
    driverSettlement: {
      findFirst: vi.fn().mockResolvedValue(makeDraftSettlement()),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          ...makeDraftSettlement(),
          ...data,
          updatedAt: new Date(),
        }),
      ),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverPayAuditLog: {
      create: vi.fn().mockResolvedValue({}),
    },
    driverCompensationTemplate: {
      findFirst: vi.fn().mockResolvedValue(makeTemplate(employmentType)),
    },
    tenant: {
      findFirst: vi.fn().mockResolvedValue({ id: 'tenant-A', name: 'Acme Carrier' }),
    },
  };
}

function makeReq(url = 'http://localhost/api/test') {
  return new NextRequest(new URL(url), { method: 'POST' });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('finalize route — employmentTypeSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(ownerSession);
  });

  it('stamps employmentTypeSnapshot=W2_EMPLOYEE when active template is W2_EMPLOYEE', async () => {
    const prisma = makePrisma('W2_EMPLOYEE');
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(200);
    expect(prisma.driverSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FINALIZED',
          employmentTypeSnapshot: 'W2_EMPLOYEE',
        }),
      }),
    );
  });

  it('stamps employmentTypeSnapshot=OWNER_OPERATOR_1099 when active template is OWNER_OPERATOR_1099', async () => {
    const prisma = makePrisma('OWNER_OPERATOR_1099');
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(200);
    expect(prisma.driverSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FINALIZED',
          employmentTypeSnapshot: 'OWNER_OPERATOR_1099',
        }),
      }),
    );
  });

  it('returns 409 when no active compensation template is found', async () => {
    const prisma = {
      driverSettlement: {
        findFirst: vi.fn().mockResolvedValue(makeDraftSettlement()),
        update: vi.fn(),
      },
      driverDeduction: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      driverPayAuditLog: {
        create: vi.fn().mockResolvedValue({}),
      },
      driverCompensationTemplate: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      tenant: {
        findFirst: vi.fn().mockResolvedValue({ id: 'tenant-A', name: 'Acme Carrier' }),
      },
    };
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/no active compensation template/i);
  });

  it('includes employmentTypeSnapshot in audit log newValue', async () => {
    const prisma = makePrisma('W2_EMPLOYEE');
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(prisma.driverPayAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'settlement:finalized',
          newValue: expect.objectContaining({
            employmentTypeSnapshot: 'W2_EMPLOYEE',
          }),
        }),
      }),
    );
  });
});
