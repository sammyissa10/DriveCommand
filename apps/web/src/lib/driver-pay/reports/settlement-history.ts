/**
 * settlement-history.ts — Full all-status paginated settlement history with anomaly flag.
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';
import {
  getPriorPeriodRange,
  computeDeltaPct,
  isNetPayAnomaly,
  computeRollingAvgNetPay,
  type PeriodRange,
  type ReportFilters,
} from '@/lib/driver-pay/reporting';

export interface SettlementHistoryRow {
  id: string;
  driverId: string;
  driverName: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  paidAt: string | null;
  isAnomaly: boolean;
}

export interface SettlementHistoryResult {
  bigNumber: string;          // sum of netPay for PAID settlements in period
  deltaPct: number | null;
  priorTotal: string;
  statusCounts: Record<string, number>;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: SettlementHistoryRow[];
}

export interface SettlementHistoryPagination {
  page: number;
  pageSize: number;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

type SortableField = 'periodEnd' | 'netPay' | 'status' | 'driverName';

import type { Prisma } from '@/generated/prisma';

function buildOrderBy(
  sortBy: string | undefined,
  sortDir: 'asc' | 'desc',
): Prisma.DriverSettlementOrderByWithRelationInput[] {
  const dir = sortDir;
  switch (sortBy as SortableField) {
    case 'netPay':
      return [{ netPay: dir }];
    case 'status':
      return [{ status: dir }];
    case 'driverName':
      return [{ driver: { firstName: dir } }, { driver: { lastName: dir } }];
    case 'periodEnd':
    default:
      return [{ periodEnd: dir }];
  }
}

export async function computeSettlementHistory(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters | undefined,
  pagination: SettlementHistoryPagination,
): Promise<SettlementHistoryResult> {
  const { page, pageSize, sortBy, sortDir = 'desc' } = pagination;

  const driverFilter = filters?.driverIds?.length
    ? { driverId: { in: filters.driverIds } }
    : {};

  const where = {
    tenantId,
    deletedAt: null,
    periodEnd: { gte: range.start },
    periodStart: { lte: range.end },
    ...driverFilter,
  };

  const skip = (page - 1) * pageSize;

  const [rows, totalCount] = await Promise.all([
    prisma.driverSettlement.findMany({
      where,
      include: {
        driver: { select: { firstName: true, lastName: true } },
      },
      orderBy: buildOrderBy(sortBy, sortDir),
      skip,
      take: pageSize,
    }),
    prisma.driverSettlement.count({ where }),
  ]);

  // Compute anomaly flag per row and build result rows
  const resultRows: SettlementHistoryRow[] = await Promise.all(
    rows.map(async (s) => {
      const netPayDecimal = new Decimal(s.netPay.toString());
      let anomaly = false;
      try {
        const rollingAvg = await computeRollingAvgNetPay(
          prisma,
          tenantId,
          s.driverId,
          s.periodEnd,
        );
        anomaly = isNetPayAnomaly(netPayDecimal, rollingAvg);
      } catch {
        anomaly = false;
      }

      return {
        id: s.id,
        driverId: s.driverId,
        driverName: s.driver ? `${s.driver.firstName} ${s.driver.lastName}` : 'Unknown Driver',
        periodStart: s.periodStart.toISOString(),
        periodEnd: s.periodEnd.toISOString(),
        status: s.status,
        grossTaxable: new Decimal(s.grossTaxable.toString()).toFixed(2),
        grossNonTaxable: new Decimal(s.grossNonTaxable.toString()).toFixed(2),
        totalDeductions: new Decimal(s.totalDeductions.toString()).toFixed(2),
        netPay: netPayDecimal.toFixed(2),
        paidAt: s.paidAt?.toISOString() ?? null,
        isAnomaly: anomaly,
      };
    }),
  );

  // Compute bigNumber = sum of PAID settlements in period (across all pages)
  const allSettlementsForBigNumber = await prisma.driverSettlement.findMany({
    where: { ...where, status: 'PAID' },
    select: { netPay: true, status: true },
  });

  const bigNumberDecimal = allSettlementsForBigNumber.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );

  // statusCounts
  const allSettlementsForCounts = await prisma.driverSettlement.findMany({
    where,
    select: { status: true },
  });
  const statusCounts: Record<string, number> = {};
  for (const s of allSettlementsForCounts) {
    statusCounts[s.status] = (statusCounts[s.status] ?? 0) + 1;
  }

  // Prior period PAID sum
  const priorRange = getPriorPeriodRange(range);
  const priorSettlements = await prisma.driverSettlement.findMany({
    where: {
      tenantId,
      deletedAt: null,
      status: 'PAID',
      periodEnd: { gte: priorRange.start },
      periodStart: { lte: priorRange.end },
      ...driverFilter,
    },
    select: { netPay: true },
  });

  const priorDecimal = priorSettlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );

  return {
    bigNumber: bigNumberDecimal.toFixed(2),
    deltaPct: computeDeltaPct(bigNumberDecimal, priorDecimal),
    priorTotal: priorDecimal.toFixed(2),
    statusCounts,
    page,
    pageSize,
    totalCount,
    rows: resultRows,
  };
}
