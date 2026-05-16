/**
 * reports-rbac.test.ts — DRIVER→403, OWNER/MANAGER/SYSTEM_ADMIN→200 for all 7 new routes.
 *
 * Uses parametrized describe.each for compact coverage.
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';

// ─── Module mocks — must be before imports ───────────────────────────────────

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
  requireTenantId: vi.fn().mockResolvedValue('tenant-A'),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// ─── After mocks, import route handlers ───────────────────────────────────────

import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';

import { GET as accessorialGET } from '@/app/api/driver-pay/reports/accessorial-spend/route';
import { GET as profitabilityGET } from '@/app/api/driver-pay/reports/load-profitability/route';
import { GET as componentGET } from '@/app/api/driver-pay/reports/component-type/route';
import { GET as overtimeGET } from '@/app/api/driver-pay/reports/overtime-exposure/route';
import { GET as overrideGET } from '@/app/api/driver-pay/reports/override-audit/route';
import { GET as deductionGET } from '@/app/api/driver-pay/reports/deduction-balances/route';
import { GET as settlementHistoryGET } from '@/app/api/driver-pay/reports/settlement-history/route';

// ─── Session fixtures ────────────────────────────────────────────────────────

const ownerSession   = { userId: 'u1', tenantId: 'tenant-A', role: 'OWNER' };
const managerSession = { userId: 'u2', tenantId: 'tenant-A', role: 'MANAGER' };
const sysadminSession = { userId: 'u3', tenantId: 'tenant-A', role: 'SYSTEM_ADMIN' };
const driverSession  = { userId: 'u4', tenantId: 'tenant-A', role: 'DRIVER' };

// ─── Mock Prisma client returning empty data ─────────────────────────────────

function makeEmptyPrisma() {
  return {
    loadPayComponent: {
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    carrierLoad: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    loadDriverAssignment: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverDeduction: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    driverSettlement: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
  };
}

// ─── Route test table ────────────────────────────────────────────────────────

const ROUTES = [
  { name: 'accessorial-spend',    handler: accessorialGET,       url: 'http://localhost/api/driver-pay/reports/accessorial-spend' },
  { name: 'load-profitability',   handler: profitabilityGET,     url: 'http://localhost/api/driver-pay/reports/load-profitability' },
  { name: 'component-type',       handler: componentGET,         url: 'http://localhost/api/driver-pay/reports/component-type' },
  { name: 'overtime-exposure',    handler: overtimeGET,          url: 'http://localhost/api/driver-pay/reports/overtime-exposure' },
  { name: 'override-audit',       handler: overrideGET,          url: 'http://localhost/api/driver-pay/reports/override-audit' },
  { name: 'deduction-balances',   handler: deductionGET,         url: 'http://localhost/api/driver-pay/reports/deduction-balances' },
  { name: 'settlement-history',   handler: settlementHistoryGET, url: 'http://localhost/api/driver-pay/reports/settlement-history' },
] as const;

// ─── Tests ───────────────────────────────────────────────────────────────────

describe.each(ROUTES)('$name RBAC', ({ handler, url }) => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getTenantPrisma as Mock).mockResolvedValue(makeEmptyPrisma());
  });

  it('returns 401 for no session', async () => {
    (getSession as Mock).mockResolvedValue(null);
    const req = new NextRequest(url);
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  it('returns 403 for DRIVER role', async () => {
    (getSession as Mock).mockResolvedValue(driverSession);
    const req = new NextRequest(url);
    const res = await handler(req);
    expect(res.status).toBe(403);
  });

  it('returns 200 for OWNER role', async () => {
    (getSession as Mock).mockResolvedValue(ownerSession);
    const req = new NextRequest(url);
    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 for MANAGER role', async () => {
    (getSession as Mock).mockResolvedValue(managerSession);
    const req = new NextRequest(url);
    const res = await handler(req);
    expect(res.status).toBe(200);
  });

  it('returns 200 for SYSTEM_ADMIN role', async () => {
    (getSession as Mock).mockResolvedValue(sysadminSession);
    const req = new NextRequest(url);
    const res = await handler(req);
    expect(res.status).toBe(200);
  });
});
