/**
 * load-profitability.ts — Per-load revenue minus driver pay, paginated.
 * CarrierLoad uses orgId (not tenantId) as its tenant FK.
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';
import {
  getPriorPeriodRange,
  computeDeltaPct,
  type PeriodRange,
} from '@/lib/driver-pay/reporting';

export interface LoadProfitabilityRow {
  loadId: string;
  referenceNumber: string | null;
  clientName: string | null;
  revenue: string;            // loadRevenue if assignment has it, else CarrierLoad.totalRevenue
  totalDriverPay: string;     // sum LoadPayComponent.grossAmount for this load
  profit: string;
  profitMarginPct: number | null;
  driverCount: number;
  createdAt: string;          // ISO
}

export interface LoadProfitabilityResult {
  bigNumber: string;          // sum(profit) across all matching loads in period
  deltaPct: number | null;
  priorTotal: string;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: LoadProfitabilityRow[];
}

export interface LoadProfitabilityPagination {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

type ComputedLoad = {
  loadId: string;
  referenceNumber: string | null;
  clientName: string | null;
  revenue: Decimal;
  totalDriverPay: Decimal;
  profit: Decimal;
  profitMarginPct: number | null;
  driverCount: number;
  createdAt: Date;
};

function computeLoads(
  loads: Array<{
    id: string;
    referenceNumber: string | null;
    totalRevenue: { toString(): string } | null;
    createdAt: Date;
    client: { name: string } | null;
    driverAssignments: Array<{ loadRevenue: { toString(): string } | null; driverId: string }>;
    payComponents: Array<{ grossAmount: { toString(): string } }>;
  }>,
): ComputedLoad[] {
  return loads.map((load) => {
    // Revenue: first non-null assignment.loadRevenue else CarrierLoad.totalRevenue
    let revenueDecimal = new Decimal(0);
    for (const assignment of load.driverAssignments) {
      if (assignment.loadRevenue !== null) {
        revenueDecimal = new Decimal(assignment.loadRevenue.toString());
        break;
      }
    }
    if (revenueDecimal.isZero() && load.totalRevenue !== null) {
      revenueDecimal = new Decimal(load.totalRevenue.toString());
    }

    const totalDriverPay = load.payComponents.reduce(
      (acc, c) => acc.plus(new Decimal(c.grossAmount.toString())),
      new Decimal(0),
    );

    const profit = revenueDecimal.minus(totalDriverPay);
    const profitMarginPct = revenueDecimal.isZero()
      ? null
      : profit.div(revenueDecimal).mul(100).toDecimalPlaces(1).toNumber();

    const driverCount = new Set(load.driverAssignments.map((a) => a.driverId)).size;

    return {
      loadId: load.id,
      referenceNumber: load.referenceNumber,
      clientName: load.client?.name ?? null,
      revenue: revenueDecimal,
      totalDriverPay,
      profit,
      profitMarginPct,
      driverCount,
      createdAt: load.createdAt,
    };
  });
}

export async function computeLoadProfitability(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  pagination: LoadProfitabilityPagination,
): Promise<LoadProfitabilityResult> {
  const { page, pageSize, sortBy = 'createdAt', sortDir = 'desc' } = pagination;

  // NOTE: CarrierLoad uses orgId (not tenantId) as its tenant FK
  const loads = await prisma.carrierLoad.findMany({
    where: {
      orgId: tenantId,
      createdAt: { gte: range.start, lte: range.end },
    },
    select: {
      id: true,
      referenceNumber: true,
      totalRevenue: true,
      createdAt: true,
      client: { select: { name: true } },
      driverAssignments: {
        where: { deletedAt: null },
        select: { loadRevenue: true, driverId: true },
      },
      payComponents: {
        where: { deletedAt: null },
        select: { grossAmount: true },
      },
    },
  });

  const computed = computeLoads(loads);

  // Sort
  const allowedSortKeys = new Set(['profit', 'profitMarginPct', 'revenue', 'totalDriverPay', 'createdAt']);
  const sortKey = allowedSortKeys.has(sortBy) ? sortBy : 'createdAt';

  computed.sort((a, b) => {
    let cmp = 0;
    if (sortKey === 'profit') {
      cmp = a.profit.minus(b.profit).toNumber();
    } else if (sortKey === 'profitMarginPct') {
      cmp = (a.profitMarginPct ?? 0) - (b.profitMarginPct ?? 0);
    } else if (sortKey === 'revenue') {
      cmp = a.revenue.minus(b.revenue).toNumber();
    } else if (sortKey === 'totalDriverPay') {
      cmp = a.totalDriverPay.minus(b.totalDriverPay).toNumber();
    } else {
      cmp = a.createdAt.getTime() - b.createdAt.getTime();
    }
    return sortDir === 'desc' ? -cmp : cmp;
  });

  // bigNumber = sum of ALL profits (not just the page)
  const bigNumberDecimal = computed.reduce(
    (acc, c) => acc.plus(c.profit),
    new Decimal(0),
  );

  // Paginate
  const totalCount = computed.length;
  const skip = (page - 1) * pageSize;
  const sliced = computed.slice(skip, skip + pageSize);

  const rows: LoadProfitabilityRow[] = sliced.map((c) => ({
    loadId: c.loadId,
    referenceNumber: c.referenceNumber,
    clientName: c.clientName,
    revenue: c.revenue.toFixed(2),
    totalDriverPay: c.totalDriverPay.toFixed(2),
    profit: c.profit.toFixed(2),
    profitMarginPct: c.profitMarginPct,
    driverCount: c.driverCount,
    createdAt: c.createdAt.toISOString(),
  }));

  // Prior period
  const priorRange = getPriorPeriodRange(range);
  const priorLoads = await prisma.carrierLoad.findMany({
    where: {
      orgId: tenantId,
      createdAt: { gte: priorRange.start, lte: priorRange.end },
    },
    select: {
      id: true,
      referenceNumber: true,
      totalRevenue: true,
      createdAt: true,
      client: { select: { name: true } },
      driverAssignments: {
        where: { deletedAt: null },
        select: { loadRevenue: true, driverId: true },
      },
      payComponents: {
        where: { deletedAt: null },
        select: { grossAmount: true },
      },
    },
  });

  const priorComputed = computeLoads(priorLoads);
  const priorDecimal = priorComputed.reduce(
    (acc, c) => acc.plus(c.profit),
    new Decimal(0),
  );

  return {
    bigNumber: bigNumberDecimal.toFixed(2),
    deltaPct: computeDeltaPct(bigNumberDecimal, priorDecimal),
    priorTotal: priorDecimal.toFixed(2),
    page,
    pageSize,
    totalCount,
    rows,
  };
}
