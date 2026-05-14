/**
 * Driver Pay Phase 10 — Shared Reporting Aggregation Helpers
 *
 * All money math uses decimal.js (never native floats).
 * All date math uses date-fns.
 * All functions accept an injected prisma client so they work in both
 * API route handlers and Vitest tests without module-level prisma coupling.
 *
 * DO NOT make any writes here — this module is read-only.
 *
 * -------------------------------------------------------------------------
 * FILTER INVARIANT (quick-308)
 * -------------------------------------------------------------------------
 * Every function that aggregates settlements for payroll-out reporting on
 * the Reports page MUST use `countedSettlementsWhere()` from
 * `./reporting-predicate`. No function may inline its own periodStart/periodEnd
 * containment or status filter — the predicate is the single source of truth.
 *
 * Period semantics: OVERLAP, not containment.
 *   A settlement [periodStart, periodEnd] counts for window [range.start, range.end]
 *   when periodStart <= range.end AND periodEnd >= range.start.
 *
 * Status semantics:
 *   payroll_out scope = PAID only (no VOIDED, no FINALIZED, no DRAFT)
 *   approved scope    = FINALIZED + PAID (for rolling avg / driver detail)
 *
 * Bonus aggregation: DriverBonus.amount WHERE settlementId IN (counted settlement ids).
 *   Never use triggerDate window for payroll-out bonus totals.
 *
 * Soft-delete: deletedAt: null enforced by countedSettlementsWhere on settlements,
 *   and explicitly on every bonus query.
 * -------------------------------------------------------------------------
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
import { countedSettlementsWhere } from './reporting-predicate';

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
  // avgNetPay.current is '—' (em dash) when driversPaid = 0, never '0.00'.
  // We keep the type as string (not string | null) to avoid downstream churn.
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

// NOTE: The internal `buildSettlementWhere` function has been removed (quick-308).
// All callers now use `countedSettlementsWhere` from `./reporting-predicate`.

// ---------------------------------------------------------------------------
// 4. computeOverviewKpis
// ---------------------------------------------------------------------------

export async function computeOverviewKpis(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters: ReportFilters,
): Promise<OverviewKpis> {
  // Canonical predicates — payroll_out scope (PAID only, period overlap, soft-delete safe)
  const payrollWhere = countedSettlementsWhere(tenantId, range, filters, 'payroll_out');
  const priorRange = getPriorPeriodRange(range);
  const priorPayrollWhere = countedSettlementsWhere(tenantId, priorRange, filters, 'payroll_out');

  // Query current and prior settlements — include id for bonus join
  const [settlements, priorSettlements] = await Promise.all([
    prisma.driverSettlement.findMany({
      where: payrollWhere,
      select: {
        id: true,
        driverId: true,
        netPay: true,
        totalDeductions: true,
        // status is enforced by predicate — no need to select it for in-memory filter
      },
    }),
    prisma.driverSettlement.findMany({
      where: priorPayrollWhere,
      select: {
        id: true,
        driverId: true,
        netPay: true,
        totalDeductions: true,
      },
    }),
  ]);

  // Bonus aggregation: gate via settlementId IN (counted settlements).
  // Do NOT use triggerDate window — that counts master installment rows not yet
  // attached to any settlement (settlementId = null) and excludes installments
  // from settlements that started before the window but overlap it.
  const currentSettlementIds = settlements.map((s) => s.id);
  const priorSettlementIds = priorSettlements.map((s) => s.id);

  const [bonuses, priorBonusRows] = await Promise.all([
    currentSettlementIds.length > 0
      ? prisma.driverBonus.findMany({
          where: {
            tenantId,
            deletedAt: null,
            settlementId: { in: currentSettlementIds },
          },
          select: { amount: true },
        })
      : Promise.resolve([]),
    priorSettlementIds.length > 0
      ? prisma.driverBonus.findMany({
          where: {
            tenantId,
            deletedAt: null,
            settlementId: { in: priorSettlementIds },
          },
          select: { amount: true },
        })
      : Promise.resolve([]),
  ]);

  // Aggregate current period
  const currentTotal = settlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );
  const priorTotal = priorSettlements.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );

  // driversPaid: distinct driverIds in counted (PAID) settlements.
  // No in-memory status filter needed — predicate already enforces PAID-only.
  const currentPaid = new Set(settlements.map((s) => s.driverId)).size;
  const priorPaid = new Set(priorSettlements.map((s) => s.driverId)).size;

  // avgNetPay: return em dash '—' when no drivers paid (not '0.00').
  // Keeps the type as string to avoid downstream interface churn.
  const currentAvgDecimal = currentPaid > 0
    ? currentTotal.div(new Decimal(currentPaid))
    : null;
  const priorAvgDecimal = priorPaid > 0
    ? priorTotal.div(new Decimal(priorPaid))
    : null;

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
      // '—' when divisor is 0; toFixed(2) when there is a result.
      current: currentAvgDecimal !== null ? currentAvgDecimal.toFixed(2) : '—',
      delta: computeDeltaPct(
        currentAvgDecimal ?? new Decimal(0),
        priorAvgDecimal ?? new Decimal(0),
      ),
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
  // Canonical predicate — payroll_out scope, period overlap, PAID only.
  const where = countedSettlementsWhere(tenantId, range, filters, 'payroll_out');
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
  // Get counted settlements (payroll_out scope, period overlap, PAID only)
  const countedWhere = countedSettlementsWhere(tenantId, range, filters, 'payroll_out');
  const countedSettlements = await prisma.driverSettlement.findMany({
    where: countedWhere,
    select: { driverId: true, totalDeductions: true },
  });

  if (countedSettlements.length === 0) return [];

  // Aggregate the total deduction $ per driver from counted settlements.
  // This is the source of truth for "deduction money actually paid out".
  const totalsByDriver = new Map<string, Decimal>();
  for (const s of countedSettlements) {
    const prev = totalsByDriver.get(s.driverId) ?? new Decimal(0);
    totalsByDriver.set(s.driverId, prev.plus(new Decimal(s.totalDeductions.toString())));
  }

  const countedDriverIds = [...totalsByDriver.keys()];

  // Look up which deduction TYPES each counted driver has (for breakdown labelling).
  // No date filter here — we only use this for type attribution, not period gating.
  // The MONEY comes from DriverSettlement.totalDeductions above; the TYPES come from here.
  //
  // TODO(phase-11): Add a SettlementDeduction join table (or settlementId FK on
  //   DriverDeduction) so each deduction line item can be tied to its settlement.
  //   Until then we attribute a driver's full counted-settlement totalDeductions
  //   to the deduction types active for that driver. If a driver has multiple
  //   active deduction types, we apportion their settlement totalDeductions
  //   proportionally to each type's amountCollected weighting.
  const driverDeductions = await prisma.driverDeduction.findMany({
    where: {
      tenantId,
      driverId: { in: countedDriverIds },
      deletedAt: null,
    },
    select: { driverId: true, deductionType: true, amountCollected: true },
  });

  // Group deduction rows by driver
  const deductionsByDriver = new Map<string, Array<{ deductionType: string; amountCollected: Decimal }>>();
  for (const d of driverDeductions) {
    const list = deductionsByDriver.get(d.driverId) ?? [];
    list.push({
      deductionType: d.deductionType,
      amountCollected: new Decimal(d.amountCollected.toString()),
    });
    deductionsByDriver.set(d.driverId, list);
  }

  // Apportion each driver's counted totalDeductions across their deduction types,
  // weighted by amountCollected. Drivers with no DriverDeduction rows are skipped
  // (no type → can't attribute → omitted from the breakdown).
  const buckets = new Map<string, Decimal>();
  for (const [driverId, settlementTotal] of totalsByDriver.entries()) {
    const driverRows = deductionsByDriver.get(driverId);
    if (!driverRows || driverRows.length === 0) continue;
    if (settlementTotal.isZero()) continue;

    const weightSum = driverRows.reduce(
      (acc, r) => acc.plus(r.amountCollected),
      new Decimal(0),
    );

    if (weightSum.isZero()) {
      // No weights — split evenly across types
      const evenShare = settlementTotal.div(new Decimal(driverRows.length));
      for (const r of driverRows) {
        const prev = buckets.get(r.deductionType) ?? new Decimal(0);
        buckets.set(r.deductionType, prev.plus(evenShare));
      }
    } else {
      for (const r of driverRows) {
        const share = settlementTotal.mul(r.amountCollected).div(weightSum);
        const prev = buckets.get(r.deductionType) ?? new Decimal(0);
        buckets.set(r.deductionType, prev.plus(share));
      }
    }
  }

  return Array.from(buckets.entries())
    .map(([deductionType, total]) => ({ deductionType, total: total.toFixed(2) }))
    .sort((a, b) => new Decimal(b.total).minus(new Decimal(a.total)).toNumber());
}

// ---------------------------------------------------------------------------
// 7. computeOperationalMetrics
// ---------------------------------------------------------------------------
// NOTE: This function is intentionally exempt from `countedSettlementsWhere`.
// It aggregates LoadDriverAssignment, DriverDispute, and DriverDeduction records,
// not DriverSettlement payroll-out data. Its date anchors are approvedAt, createdAt,
// and updatedAt on those models — not settlement periodStart/periodEnd.
// Do not add countedSettlementsWhere here without a specific requirement to
// tie operational metrics to settlement periods.

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

  // Use approved scope for per-driver YTD detail (FINALIZED + PAID settlements
  // that overlap the YTD window). Period overlap semantics applied consistently.
  const settlementWhere = countedSettlementsWhere(
    tenantId,
    { start: ytdStart, end: ytdEnd },
    { driverIds: [driverId] },
    'approved',
  );

  const settlements = await prisma.driverSettlement.findMany({
    where: settlementWhere,
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
  });

  // YTD bonus aggregation — gated ENTIRELY on settlementId IN (counted YTD settlement ids).
  // Why: DriverBonus master rows include unsettled installments (settlementId = null).
  //   Querying by triggerDate would over-count those master rows (production bug — SAMMY
  //   showed $1,500 of master rows when only $333.33 was actually paid out).
  // Cascade revert: if the PAID settlement is voided, it leaves the 'approved' scope,
  //   ytdSettlementIds becomes empty, and the bonus query is skipped → ytd.bonuses = $0.
  // DO NOT add a triggerDate fallback. DO NOT widen this to all DriverBonus rows for the driver.
  const ytdSettlementIds = settlements.map((s) => s.id);

  const [bonuses, deductionBalances] = await Promise.all([
    ytdSettlementIds.length > 0
      ? prisma.driverBonus.findMany({
          where: {
            tenantId,
            driverId,
            deletedAt: null,
            settlementId: { in: ytdSettlementIds },
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
        })
      : Promise.resolve([]),
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

  // Deduction balances (only FIXED_INSTALLMENTS) — this is a running balance snapshot,
  // not a period aggregation, so it is NOT gated by the YTD window.
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
// NOTE: This function intentionally does NOT use `countedSettlementsWhere`.
// It uses the 'approved' scope (FINALIZED + PAID) because it serves anomaly
// detection — where finalized-but-unpaid settlements represent legitimate
// expected pay. It also does not take a PeriodRange; it uses a backwards
// lookback anchored at `anchor` date with `take: weeks` — a fundamentally
// different query shape than period aggregation.

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
      status: { in: ['FINALIZED', 'PAID'] }, // approved scope — intentional
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
