/**
 * payroll-export-audit.test.ts
 *
 * Tests that POST /api/reports/payroll-export writes exactly one audit log
 * on success, and zero audit logs when a 422 error is returned.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
}));

import { NextRequest } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { POST } from '@/app/api/reports/payroll-export/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ownerSession = {
  userId: 'user-audit-test',
  email: 'owner@test.invalid',
  role: 'OWNER',
  tenantId: 'tenant-audit-test',
};

function makeSettlement(opts: { status?: string; id?: string; employmentTypeSnapshot?: string } = {}) {
  return {
    id: opts.id ?? TEST_SETTLEMENT_ID,
    tenantId: 'tenant-audit-test',
    driverId: 'driver-audit-test',
    status: opts.status ?? 'FINALIZED',
    employmentTypeSnapshot: opts.employmentTypeSnapshot ?? 'W2_EMPLOYEE',
    settlementReference: 'SET-AUDIT-001',
    grossTaxable: { toString: () => '1000.00' },
    grossNonTaxable: { toString: () => '0.00' },
    totalDeductions: { toString: () => '0.00' },
    netPay: { toString: () => '1000.00' },
    finalizedAt: new Date('2026-04-08T12:00:00Z'),
    finalizedBy: 'user-audit-test',
    paidAt: null,
    pdfUrl: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-audit-test',
    deletedAt: null,
    driver: {
      id: 'driver-audit-test',
      firstName: 'AUDIT',
      lastName: 'DRIVER',
      email: 'audit.driver@test.invalid',
      phone: null,
    },
  };
}

function makePrisma(opts: { settlements?: object[]; draftSettlement?: boolean } = {}) {
  const auditCreate = vi.fn().mockResolvedValue({});

  return {
    prisma: {
      driverSettlement: {
        findMany: vi.fn().mockResolvedValue(
          opts.draftSettlement
            ? [makeSettlement({ status: 'DRAFT' })]
            : (opts.settlements ?? [makeSettlement()]),
        ),
      },
      loadDriverAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      loadPayComponent: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      driverBonus: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      driverPayAuditLog: {
        create: auditCreate,
      },
    },
    auditCreate,
  };
}

// Valid RFC 4122 UUID for test (variant bits = 8xxx in group 4)
const TEST_SETTLEMENT_ID = 'ce8f9e8f-3571-4c9e-8ad0-dc62da71fb69';

function makeReq(body?: object) {
  return new NextRequest(new URL('http://localhost/api/reports/payroll-export'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(
      body ?? {
        format: 'generic_csv',
        employmentType: 'W2_EMPLOYEE',
        settlementIds: [TEST_SETTLEMENT_ID],
      },
    ),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/reports/payroll-export — audit log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getSession).mockResolvedValue(ownerSession);
  });

  it('writes exactly one audit log on successful export', async () => {
    const { prisma, auditCreate } = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await POST(makeReq());
    // Should succeed (200) or be a valid streaming response
    expect(res.status).toBe(200);
    expect(auditCreate).toHaveBeenCalledTimes(1);
  });

  it('audit log contains required fields: entityType, action, format, employmentType, settlementIds', async () => {
    const { prisma, auditCreate } = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await POST(makeReq());

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: 'PayrollExport',
          action: 'payroll:exported',
          actorId: ownerSession.userId,
          newValue: expect.objectContaining({
            format: 'generic_csv',
            employmentType: 'W2_EMPLOYEE',
            settlementIds: expect.arrayContaining([TEST_SETTLEMENT_ID]),
          }),
        }),
      }),
    );
  });

  it('audit log contains settlementCount, w2Count, c1099Count', async () => {
    const { prisma, auditCreate } = makePrisma();
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    await POST(makeReq());

    expect(auditCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          newValue: expect.objectContaining({
            settlementCount: 1,
            w2Count: 1,
            c1099Count: 0,
          }),
        }),
      }),
    );
  });

  it('writes ZERO audit logs when 422 is returned (DRAFT settlement)', async () => {
    const { prisma, auditCreate } = makePrisma({ draftSettlement: true });
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(422);
    expect(auditCreate).toHaveBeenCalledTimes(0);
  });

  it('422 response body includes draftIds array', async () => {
    const { prisma } = makePrisma({ draftSettlement: true });
    vi.mocked(getTenantPrisma).mockResolvedValue(prisma as never);

    const res = await POST(makeReq());
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.draftIds).toBeDefined();
    expect(Array.isArray(body.draftIds)).toBe(true);
    expect(body.draftIds.length).toBeGreaterThan(0);
  });
});
