/**
 * reports-tenant-isolation.test.ts — Asserts tenantId filter is present in every
 * Prisma call for all 7 aggregation helpers.
 *
 * For computeLoadProfitability: CarrierLoad uses `orgId` (not `tenantId`).
 * All other helpers: `tenantId`.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeAccessorialSpend,
  computeLoadProfitability,
  computeComponentTypeBreakdown,
  computeOvertimeExposure,
  computeOverrideAudit,
  computeDeductionBalances,
  computeSettlementHistory,
} from '../reports';
import type { PeriodRange } from '../reporting';

const TENANT = 'tenant-A';
const range: PeriodRange = { start: new Date('2026-05-01'), end: new Date('2026-05-31') };

describe('Tenant isolation — computeAccessorialSpend', () => {
  it('passes tenantId in all Prisma calls', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { loadPayComponent: { findMany } };

    await computeAccessorialSpend(prisma as never, TENANT, range);

    // Both current and prior period calls must include tenantId
    findMany.mock.calls.forEach((call) => {
      expect(call[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
    });
  });
});

describe('Tenant isolation — computeLoadProfitability', () => {
  it('passes orgId (not tenantId) in CarrierLoad queries', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { carrierLoad: { findMany } };

    await computeLoadProfitability(prisma as never, TENANT, range, { page: 1, pageSize: 25 });

    // CarrierLoad uses orgId as tenant FK
    findMany.mock.calls.forEach((call) => {
      expect(call[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ orgId: TENANT }) }),
      );
      // Should NOT use tenantId for carrierLoad
      expect((call[0] as { where: Record<string, unknown> }).where).not.toHaveProperty('tenantId');
    });
  });
});

describe('Tenant isolation — computeComponentTypeBreakdown', () => {
  it('passes tenantId in all Prisma groupBy calls', async () => {
    const groupBy = vi.fn().mockResolvedValue([]);
    const prisma = { loadPayComponent: { groupBy } };

    await computeComponentTypeBreakdown(prisma as never, TENANT, range);

    groupBy.mock.calls.forEach((call) => {
      expect(call[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
    });
  });
});

describe('Tenant isolation — computeOvertimeExposure', () => {
  it('passes tenantId in all Prisma calls', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { loadPayComponent: { findMany } };

    await computeOvertimeExposure(prisma as never, TENANT, range, { page: 1, pageSize: 25 });

    findMany.mock.calls.forEach((call) => {
      expect(call[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
    });
  });
});

describe('Tenant isolation — computeOverrideAudit', () => {
  it('passes tenantId in all Prisma calls', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { loadDriverAssignment: { findMany } };

    await computeOverrideAudit(prisma as never, TENANT, range, { page: 1, pageSize: 25 });

    findMany.mock.calls.forEach((call) => {
      expect(call[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
    });
  });
});

describe('Tenant isolation — computeDeductionBalances', () => {
  it('passes tenantId in Prisma call', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = { driverDeduction: { findMany } };

    await computeDeductionBalances(prisma as never, TENANT, { page: 1, pageSize: 25 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
    );
  });
});

describe('Tenant isolation — computeSettlementHistory', () => {
  it('passes tenantId in all Prisma calls', async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const prisma = { driverSettlement: { findMany, count } };

    await computeSettlementHistory(prisma as never, TENANT, range, {}, { page: 1, pageSize: 25 });

    // All findMany and count calls must include tenantId
    [...findMany.mock.calls, ...count.mock.calls].forEach((call) => {
      expect(call[0]).toEqual(
        expect.objectContaining({ where: expect.objectContaining({ tenantId: TENANT }) }),
      );
    });
  });
});
