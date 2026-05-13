/**
 * settlements-finalize.test.ts
 *
 * Tests the POST /api/driver-pay/settlements/[settlementId]/finalize route:
 * - sets status, finalizedBy, finalizedAt, pdfUrl on success
 * - generates a PDF buffer (non-empty)
 * - returns 409 when settlement is already FINALIZED
 * - returns 403 for non-OWNER role
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Mock R2 upload — avoid real network calls
vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: vi.fn().mockImplementation((input) => input),
}));

vi.mock('@/lib/storage/s3-client', () => ({
  s3Client: { send: vi.fn().mockResolvedValue({}) },
  getBucketName: vi.fn().mockReturnValue('test-bucket'),
}));

// Mock PDF generation — return a recognizable Buffer
vi.mock('@/lib/driver-pay/settlement-pdf', () => ({
  generateSettlementPdf: vi.fn().mockResolvedValue(Buffer.from('PDF_CONTENT_MOCK')),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST as finalizeSettlement } from '@/app/api/driver-pay/settlements/[settlementId]/finalize/route';
import { generateSettlementPdf } from '@/lib/driver-pay/settlement-pdf';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeDraftSettlement(opts: { status?: string } = {}) {
  return {
    id: 'settlement-1',
    tenantId: 'tenant-A',
    driverId: 'driver-1',
    status: opts.status ?? 'DRAFT',
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
      firstName: 'John',
      lastName: 'Driver',
      payModel: 'per_mile',
    },
    assignments: [],
    bonuses: [],
  };
}

function makePrisma(opts: { settlement?: object | null } = {}) {
  const settlement = opts.settlement !== undefined ? opts.settlement : makeDraftSettlement();

  return {
    driverSettlement: {
      findFirst: vi.fn().mockResolvedValue(settlement),
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

describe('POST /settlements/[settlementId]/finalize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(ownerSession);
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma() as never);
  });

  it('returns 403 for MANAGER role', async () => {
    vi.mocked(getSession).mockResolvedValue(managerSession);

    const res = await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(403);
  });

  it('returns 404 when settlement not found', async () => {
    vi.mocked(getTenantPrisma).mockResolvedValue(makePrisma({ settlement: null }) as never);

    const res = await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'nonexistent' }),
    });

    expect(res.status).toBe(404);
  });

  it('returns 409 when settlement is already FINALIZED', async () => {
    vi.mocked(getTenantPrisma).mockResolvedValue(
      makePrisma({ settlement: makeDraftSettlement({ status: 'FINALIZED' }) }) as never,
    );

    const res = await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toMatch(/DRAFT/i);
  });

  it('finalizes settlement: calls generateSettlementPdf and returns 200 with updated status', async () => {
    const prisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(res.status).toBe(200);

    // PDF was generated
    expect(generateSettlementPdf).toHaveBeenCalledTimes(1);

    // Settlement was updated
    expect(prisma.driverSettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FINALIZED',
          finalizedBy: 'u1',
          finalizedAt: expect.any(Date),
          pdfUrl: expect.stringContaining('settlements/'),
        }),
      }),
    );

    const body = await res.json();
    expect(body.settlement.status).toBe('FINALIZED');
  });

  it('generateSettlementPdf returns non-empty buffer', async () => {
    const buffer = await vi.mocked(generateSettlementPdf)({
      settlement: makeDraftSettlement() as never,
      tenant: { name: 'Acme' },
      driver: { firstName: 'John', lastName: 'Driver' },
      assignments: [],
      bonuses: [],
      deductionsApplied: [],
    });

    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);
    // Buffer contains expected mock content
    expect(buffer.toString()).toBe('PDF_CONTENT_MOCK');
  });

  it('audit log is written on finalize', async () => {
    const prisma = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await finalizeSettlement(makeReq(), {
      params: Promise.resolve({ settlementId: 'settlement-1' }),
    });

    expect(prisma.driverPayAuditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'settlement:finalized',
          actorId: 'u1',
        }),
      }),
    );
  });
});
