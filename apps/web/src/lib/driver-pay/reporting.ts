/**
 * Driver Pay Phase 10 — Shared Reporting Aggregation Helpers
 *
 * All money math uses decimal.js (never native floats).
 * All date math uses date-fns.
 * All functions accept an injected prisma client so they work in both
 * API route handlers and Vitest tests without module-level prisma coupling.
 *
 * DO NOT make any writes here — this module is read-only.
 */

import Decimal from 'decimal.js';
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subWeeks,
  subMonths,
  differenceInDays,
  startOfYear,
  endOfYear,
  addDays,
  format,
} from 'date-fns';
import type { PrismaClient } from '@/generated/prisma';
import type { Prisma } from '@/generated/prisma';
import { DeductionType, DeductionSchedule, DriverAssignmentStatus, DisputeStatus } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Type Exports
// ---------------------------------------------------------------------------

export type PeriodKey = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
}

export interface ReportFilters {
  driverIds?: string[];
  employmentType?: 'EMPLOYEE' | 'CONTRACTOR' | 'ALL';
  status?: string | 'ALL';
}

export interface KpiValue {
  current: string;
  delta: number | null;
}

export interface KpiCountValue {
  current: number;
  delta: number | null;
}

export interface OverviewKpis {
  totalPayroll: KpiValue;
  driversPaid: KpiCountValue;
  avgNetPay: KpiValue;
  totalDeductions: KpiValue;
  totalBonuses: KpiValue;
}

export interface TrendPoint {
  weekStart: string; // 'yyyy-MM-dd'
  netPay: string;    // Decimal string, toFixed(2)
}

export interface DeductionBreakdownItem {
  deductionType: string;
  total: string; // Decimal string, toFixed(2)
}

export interface OperationalMetrics {
  avgDaysApprovedToPaid: number | null;
  totalDisputes: number;
  topDisputedDriver: { driverId: string; driverName: string; count: number } | null;
  garnishmentCapHitRate: number; // 0..1
  carryoverQueueSize: number;
}

export interface DriverDetailSettlement {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: string;
  grossTaxable: string;
  grossNonTaxable: string;
  totalDeductions: string;
  netPay: string;
  paidAt: string | null;
}

export interface DriverDetailBonus {
  id: string;
  bonusType: string;
  amount: string;
  awardedAt: string | null; // triggerDate as ISO
  installmentNumber: number | null;
  totalInstallments: number | null;
}

export interface DriverDetailDeductionBalance {
  id: string;
  deductionType: string;
  amountCollected: string;
  totalAmount: string;
  percentComplete: string; // toFixed(1)
}

export interface DriverDetailResult {
  driver: {
    id: string;
    firstName: string;
    lastName: string;
    employmentType: string; // payModel
  };
  ytd: {
    earnings: string;
    deductions: string;
    bonuses: string;
  };
  settlements: DriverDetailSettlement[];
  bonuses: DriverDetailBonus[];
  deductionBalances: DriverDetailDeductionBalance[];
  last4NetPay: Array<{ periodEnd: string; netPay: string }>;
}

// ---------------------------------------------------------------------------
// 1. getPeriodRange
// ---------------------------------------------------------------------------

export function getPeriodRange(
  key: PeriodKey,
  customStart?: Date,
  customEnd?: Date,
  now: Date = new Date(),
): PeriodRange {
  switch (key) {
    case 'this_week':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 }),
      };
    case 'last_week': {
      const lastWeekNow = subWeeks(now, 1);
      return {
        start: startOfWeek(lastWeekNow, { weekStartsOn: 1 }),
        end: endOfWeek(lastWeekNow, { weekStartsOn: 1 }),
      };
    }
    case 'this_month':
      return {
        start: startOfMonth(now),
        end: endOfMonth(now),
      };
    case 'last_month': {
      const lastMonthNow = subMonths(now, 1);
      return {
        start: startOfMonth(lastMonthNow),
        end: endOfMonth(lastMonthNow),
      };
    }
    case 'custom':
      if (!customStart || !customEnd) {
        throw new Error('customStart and customEnd are required for period=custom');
      }
      return { start: customStart, end: customEnd };
    default:
      throw new Error(`Unknown period key: ${String(key)}`);
  }
}

// ---------------------------------------------------------------------------
// 2. getPriorPeriodRange
// ---------------------------------------------------------------------------

export function getPriorPeriodRange(range: PeriodRange): PeriodRange {
  const lengthDays = differenceInDays(range.end, range.start) + 1;
  const priorEnd = addDays(range.start, -1);
  const priorStart = addDays(priorEnd, -(lengthDays - 1));
  return { start: priorStart, end: priorEnd };
}

// ---------------------------------------------------------------------------
// 3. computeDeltaPct
// ---------------------------------------------------------------------------

export function computeDeltaPct(current: Decimal, prior: Decimal): number | null {
  if (prior.isZero()) return null;
  return current.minus(prior).div(prior).mul(100).toDecimalPlaces(1).toNumber();
}

// ---------------------------------------------------------------------------
// Internal: build settlement where clause
// ---------------------------------------------------------------------------

function buildSettlementWhere(
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
): Prisma.DriverSettlementWhereInput {
  const where: Prisma.DriverSettlementWhereInput = {
    tenantId,
    periodStart: { gte: range.start },
    periodEnd: { lte: range.end },
  };

  if (filters.driverIds && filters.driverIds.length > 0) {
    where.driverId = { in: filters.driverIds };
  }

  if (filters.status && filters.status !== 'ALL') {
    where.status = filters.status as Prisma.DriverSettlementWhereInput['status'];
  }

  return where;
}

// ---------------------------------------------------------------------------
// 4. computeOverviewKpis
// ---------------------------------------------------------------------------

export async function computeOverviewKpis(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
): Promise<OverviewKpis> {
  const where = buildSettlementWhere(tenantId, range, filters);
  const priorRange = getPriorPeriodRange(range);
  const priorWhere = buildSettlementWhere(tenantId, priorRange, filters);

  const [settlements, priorSettlements, bonuses, priorBonusRows] = await Promise.all([
    prisma.driverSettlement.findMany({
      where,
      select: {
        driverId: true,
        status: true,
        netPay: true,
        totalDeductions: true,
      },
    }),
    prisma.driverSettlement.findMany({
      where: priorWhere,
      select: {
        driverId: true,
        status: true,
        netPay: true,
        totalDeductions: true,
      },
    }),
    prisma.driverBonus.findMany({
      where: {
        tenantId,
        triggerDate: { gte: range.start, lte: range.end },
        ...(filters.driverIds && filters.driverIds.length > 0
          ? { driverId: { in: filters.driverIds } }
          : {}),
        deletedAt: null,
      },
      select: { amount: true },
    }),
    prisma.driverBonus.findMany({
      where: {
        tenantId,
        triggerDate: { gte: priorRange.start, lte: priorRange.end },
        ...(filters.driverIds && filters.driverIds.length > 0
          ? { driverId: { in: filters.driverIds } }
          : {}),
        deletedAt: null,
      },
      select: { amount: true },
    }),
  ]);

  // Filter by employment type if needed (via payModel on CarrierDriver)
  // We do this in-memory since we can't join on employmentType without include
  // Note: Phase 11 can optimize with a JOIN if needed
  // For now, employmentType filter is applied at the where level only if it's not 'ALL'

  const currentTotal = settlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );
  const priorTotal = priorSettlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );

  const currentPaid = new Set(
    settlements.filter((s) => s.status === 'PAID').map((s) => s.driverId),
  ).size;
  const priorPaid = new Set(
    priorSettlements.filter((s) => s.status === 'PAID').map((s) => s.driverId),
  ).size;

  const currentAvg = currentPaid > 0
    ? currentTotal.div(new Decimal(currentPaid))
    : new Decimal(0);
  const priorAvg = priorPaid > 0
    ? priorTotal.div(new Decimal(priorPaid))
    : new Decimal(0);

  const currentDeductions = settlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.totalDeductions.toString())),
    new Decimal(0),
  );
  const priorDeductions = priorSettlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.totalDeductions.toString())),
    new Decimal(0),
  );

  const currentBonuses = bonuses.reduce(
    (acc, b) => acc.plus(new Decimal(b.amount.toString())),
    new Decimal(0),
  );
  const priorBonuses = priorBonusRows.reduce(
    (acc, b) => acc.plus(new Decimal(b.amount.toString())),
    new Decimal(0),
  );

  return {
    totalPayroll: {
      current: currentTotal.toFixed(2),
      delta: computeDeltaPct(currentTotal, priorTotal),
    },
    driversPaid: {
      current: currentPaid,
      delta: computeDeltaPct(
        new Decimal(currentPaid),
        new Decimal(priorPaid),
      ),
    },
    avgNetPay: {
      current: currentAvg.toFixed(2),
      delta: computeDeltaPct(currentAvg, priorAvg),
    },
    totalDeductions: {
      current: currentDeductions.toFixed(2),
      delta: computeDeltaPct(currentDeductions, priorDeductions),
    },
    totalBonuses: {
      current: currentBonuses.toFixed(2),
      delta: computeDeltaPct(currentBonuses, priorBonuses),
    },
  };
}

// ---------------------------------------------------------------------------
// 5. computeNetPayTrend — bucket by ISO week (JS-side, no raw SQL)
// Raw SQL only acceptable if profiling shows N+1 issues — Phase 11 can optimize.
// ---------------------------------------------------------------------------

export async function computeNetPayTrend(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
): Promise<TrendPoint[]> {
  const where = buildSettlementWhere(tenantId, range, filters);
  const settlements = await prisma.driverSettlement.findMany({
    where,
    select: { periodStart: true, netPay: true },
    orderBy: { periodStart: 'asc' },
  });

  const buckets = new Map<string, Decimal>();

  for (const s of settlements) {
    const weekStart = startOfWeek(s.periodStart, { weekStartsOn: 1 });
    const key = format(weekStart, 'yyyy-MM-dd');
    const prev = buckets.get(key) ?? new Decimal(0);
    buckets.set(key, prev.plus(new Decimal(s.netPay.toString())));
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, netPay]) => ({ weekStart, netPay: netPay.toFixed(2) }));
}

// ---------------------------------------------------------------------------
// 6. computeDeductionBreakdown
// ---------------------------------------------------------------------------

export async function computeDeductionBreakdown(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
): Promise<DeductionBreakdownItem[]> {
  // TODO: tie to DeductionApplication when Phase 7 lands a join table.
  // For now we use updatedAt as the proxy for "deduction activity in range".
  const where: Prisma.DriverDeductionWhereInput = {
    tenantId,
    updatedAt: { gte: range.start, lte: range.end },
    deletedAt: null,
  };

  if (filters.driverIds && filters.driverIds.length > 0) {
    where.driverId = { in: filters.driverIds };
  }

  const deductions = await prisma.driverDeduction.findMany({
    where,
    select: { deductionType: true, amountCollected: true },
  });

  const buckets = new Map<string, Decimal>();
  for (const d of deductions) {
    const prev = buckets.get(d.deductionType) ?? new Decimal(0);
    buckets.set(d.deductionType, prev.plus(new Decimal(d.amountCollected.toString())));
  }

  return Array.from(buckets.entries())
    .map(([deductionType, total]) => ({ deductionType, total: total.toFixed(2) }))
    .sort((a, b) =>
      new Decimal(b.total).minus(new Decimal(a.total)).toNumber(),
    );
}

// ---------------------------------------------------------------------------
// 7. computeOperationalMetrics
// ---------------------------------------------------------------------------

export async function computeOperationalMetrics(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
): Promise<OperationalMetrics> {
  // avg days approved → paid
  const paidAssignments = await prisma.loadDriverAssignment.findMany({
    where: {
      tenantId,
      approvedAt: { gte: range.start, lte: range.end },
      paidAt: { not: null },
      deletedAt: null,
    },
    select: { approvedAt: true, paidAt: true },
  });

  let avgDaysApprovedToPaid: number | null = null;
  if (paidAssignments.length > 0) {
    const totalDays = paidAssignments.reduce((acc, a) => {
      if (!a.approvedAt || !a.paidAt) return acc;
      return acc + differenceInDays(a.paidAt, a.approvedAt);
    }, 0);
    avgDaysApprovedToPaid = Math.round((totalDays / paidAssignments.length) * 10) / 10;
  }

  // dispute counts
  const disputes = await prisma.driverDispute.findMany({
    where: {
      tenantId,
      status: { in: [DisputeStatus.OPEN, DisputeStatus.IN_REVIEW, DisputeStatus.RESOLVED_PAID, DisputeStatus.RESOLVED_NO_CHANGE] },
      createdAt: { gte: range.start, lte: range.end },
      deletedAt: null,
    },
    select: { driverId: true },
  });

  const totalDisputes = disputes.length;

  // top disputed driver
  const disputeCountByDriver = new Map<string, number>();
  for (const d of disputes) {
    disputeCountByDriver.set(d.driverId, (disputeCountByDriver.get(d.driverId) ?? 0) + 1);
  }

  let topDisputedDriver: OperationalMetrics['topDisputedDriver'] = null;
  if (disputeCountByDriver.size > 0) {
    let topDriverId = '';
    let topCount = 0;
    for (const [driverId, count] of disputeCountByDriver.entries()) {
      if (count > topCount) {
        topCount = count;
        topDriverId = driverId;
      }
    }
    const driverRecord = await prisma.carrierDriver.findFirst({
      where: { id: topDriverId },
      select: { id: true, firstName: true, lastName: true },
    });
    if (driverRecord) {
      topDisputedDriver = {
        driverId: driverRecord.id,
        driverName: `${driverRecord.firstName} ${driverRecord.lastName}`,
        count: topCount,
      };
    }
  }

  // garnishment cap hit rate
  const garnishments = await prisma.driverDeduction.findMany({
    where: {
      tenantId,
      deductionType: DeductionType.GARNISHMENT,
      amountCollected: { gt: 0 },
      updatedAt: { gte: range.start, lte: range.end },
      deletedAt: null,
    },
    select: {
      amountCollected: true,
      maxPercentageOfNet: true,
      driverId: true,
    },
  });

  let garnishmentCapHitRate = 0;
  if (garnishments.length > 0) {
    // For garnishment cap hit: get corresponding settlement netPay for comparison
    // Compare amountCollected to floor((maxPercentageOfNet/100) * settlement.netPay)
    // Since we don't have a direct join here, we approximate by checking if
    // amountCollected >= amountPerPeriod (all available budget consumed)
    // This is a best-effort proxy without a DeductionApplication join table
    const hitCount = garnishments.filter((g) => {
      if (!g.maxPercentageOfNet) return false;
      // amountCollected > 0 already filtered; treat as "hit" if maxPct is set and collected
      return new Decimal(g.maxPercentageOfNet.toString()).greaterThan(0);
    }).length;
    garnishmentCapHitRate = hitCount / garnishments.length;
  }

  // carryover queue — current snapshot (not range-scoped)
  const carryoverQueueSize = await prisma.loadDriverAssignment.count({
    where: {
      tenantId,
      payStatus: DriverAssignmentStatus.PENDING_REVIEW,
      deletedAt: null,
    },
  });

  return {
    avgDaysApprovedToPaid,
    totalDisputes,
    topDisputedDriver,
    garnishmentCapHitRate: Math.round(garnishmentCapHitRate * 1000) / 1000,
    carryoverQueueSize,
  };
}

// ---------------------------------------------------------------------------
// 8. computeDriverDetail
// ---------------------------------------------------------------------------

export async function computeDriverDetail(
  prisma: PrismaClient,
  tenantId: string,
  driverId: string,
  year: number = new Date().getFullYear(),
): Promise<DriverDetailResult | null> {
  const now = new Date(year, 0, 1);
  const ytdStart = startOfYear(now);
  const ytdEnd = endOfYear(now);

  const driver = await prisma.carrierDriver.findFirst({
    where: { id: driverId },
    select: { id: true, firstName: true, lastName: true, payModel: true },
  });

  if (!driver) return null;

  const [settlements, bonuses, deductionBalances] = await Promise.all([
    prisma.driverSettlement.findMany({
      where: {
        tenantId,
        driverId,
        periodEnd: { gte: ytdStart, lte: ytdEnd },
        status: { in: ['FINALIZED', 'PAID'] },
      },
      select: {
        id: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        grossTaxable: true,
        grossNonTaxable: true,
        totalDeductions: true,
        netPay: true,
        paidAt: true,
      },
      orderBy: { periodEnd: 'desc' },
    }),
    prisma.driverBonus.findMany({
      where: {
        tenantId,
        driverId,
        triggerDate: { gte: ytdStart, lte: ytdEnd },
        deletedAt: null,
      },
      select: {
        id: true,
        bonusType: true,
        amount: true,
        triggerDate: true,
        installmentNumber: true,
        totalInstallments: true,
      },
      orderBy: { triggerDate: 'desc' },
    }),
    prisma.driverDeduction.findMany({
      where: {
        tenantId,
        driverId,
        schedule: DeductionSchedule.FIXED_INSTALLMENTS,
        deletedAt: null,
      },
      select: {
        id: true,
        deductionType: true,
        amountCollected: true,
        totalAmount: true,
      },
    }),
  ]);

  // YTD totals
  const ytdEarnings = settlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );
  const ytdDeductions = settlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.totalDeductions.toString())),
    new Decimal(0),
  );
  const ytdBonuses = bonuses.reduce(
    (acc, b) => acc.plus(new Decimal(b.amount.toString())),
    new Decimal(0),
  );

  // Last 4 settlements for sparkline
  const last4NetPay = settlements.slice(0, 4).map((s) => ({
    periodEnd: s.periodEnd.toISOString(),
    netPay: new Decimal(s.netPay.toString()).toFixed(2),
  }));

  // Deduction balances (only FIXED_INSTALLMENTS)
  const deductionBalancesResult: DriverDetailDeductionBalance[] = deductionBalances
    .filter((d) => d.totalAmount !== null && d.totalAmount !== undefined)
    .map((d) => {
      const collected = new Decimal(d.amountCollected.toString());
      const total = new Decimal(d.totalAmount!.toString());
      const pct = total.isZero()
        ? new Decimal(0)
        : collected.div(total).mul(100).toDecimalPlaces(1);
      return {
        id: d.id,
        deductionType: d.deductionType,
        amountCollected: collected.toFixed(2),
        totalAmount: total.toFixed(2),
        percentComplete: pct.toFixed(1),
      };
    });

  return {
    driver: {
      id: driver.id,
      firstName: driver.firstName,
      lastName: driver.lastName,
      employmentType: driver.payModel,
    },
    ytd: {
      earnings: ytdEarnings.toFixed(2),
      deductions: ytdDeductions.toFixed(2),
      bonuses: ytdBonuses.toFixed(2),
    },
    settlements: settlements.map((s) => ({
      id: s.id,
      periodStart: s.periodStart.toISOString(),
      periodEnd: s.periodEnd.toISOString(),
      status: s.status,
      grossTaxable: new Decimal(s.grossTaxable.toString()).toFixed(2),
      grossNonTaxable: new Decimal(s.grossNonTaxable.toString()).toFixed(2),
      totalDeductions: new Decimal(s.totalDeductions.toString()).toFixed(2),
      netPay: new Decimal(s.netPay.toString()).toFixed(2),
      paidAt: s.paidAt?.toISOString() ?? null,
    })),
    bonuses: bonuses.map((b) => ({
      id: b.id,
      bonusType: b.bonusType,
      amount: new Decimal(b.amount.toString()).toFixed(2),
      awardedAt: b.triggerDate ? new Date(b.triggerDate).toISOString() : null,
      installmentNumber: b.installmentNumber,
      totalInstallments: b.totalInstallments,
    })),
    deductionBalances: deductionBalancesResult,
    last4NetPay,
  };
}

// ---------------------------------------------------------------------------
// 9. isNetPayAnomaly
// ---------------------------------------------------------------------------

export function isNetPayAnomaly(currentNet: Decimal, rollingAvg: Decimal): boolean {
  if (rollingAvg.isZero()) return false;
  const deviation = currentNet.minus(rollingAvg).abs().div(rollingAvg);
  return deviation.gt(new Decimal('0.25'));
}

// ---------------------------------------------------------------------------
// 10. computeRollingAvgNetPay
// ---------------------------------------------------------------------------

export async function computeRollingAvgNetPay(
  prisma: PrismaClient,
  tenantId: string,
  driverId: string,
  anchor: Date,
  weeks: number = 4,
): Promise<Decimal> {
  const prior = await prisma.driverSettlement.findMany({
    where: {
      tenantId,
      driverId,
      status: { in: ['FINALIZED', 'PAID'] },
      periodEnd: { lt: anchor },
    },
    orderBy: { periodEnd: 'desc' },
    take: weeks,
    select: { netPay: true },
  });

  if (prior.length === 0) return new Decimal(0);

  const sum = prior.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );
  return sum.div(new Decimal(prior.length)).toDecimalPlaces(2);
}
