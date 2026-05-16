/**
 * override-audit.ts — LoadDriverAssignment rows with overrideReason set.
 * createdBy is the dispatcher UUID (the "override author").
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';
import {
  getPriorPeriodRange,
  computeDeltaPct,
  type PeriodRange,
} from '@/lib/driver-pay/reporting';

export interface OverrideAuditRow {
  assignmentId: string;
  loadId: string;
  referenceNumber: string | null;
  driverId: string;
  driverName: string;
  overrideReason: string;
  createdBy: string | null;
  createdAt: string;
  payType: string | null;
  baseRate: string | null;
  rateUnit: string | null;
}

export interface OverrideAuditResult {
  bigNumber: number;          // count of overrides in period
  deltaPct: number | null;
  priorCount: number;
  byDispatcher: Array<{ createdBy: string | null; count: number }>;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: OverrideAuditRow[];
}

export interface OverridePagination {
  page: number;
  pageSize: number;
}

export async function computeOverrideAudit(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  pagination: OverridePagination,
): Promise<OverrideAuditResult> {
  const { page, pageSize } = pagination;

  const assignments = await prisma.loadDriverAssignment.findMany({
    where: {
      tenantId,
      deletedAt: null,
      overrideReason: { not: null },
      createdAt: { gte: range.start, lte: range.end },
    },
    include: {
      load: { select: { id: true, referenceNumber: true } },
      driver: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Group by createdBy for dispatcher summary
  const dispatcherMap = new Map<string | null, number>();
  for (const a of assignments) {
    const key = a.createdBy ?? null;
    dispatcherMap.set(key, (dispatcherMap.get(key) ?? 0) + 1);
  }

  const byDispatcher = Array.from(dispatcherMap.entries())
    .map(([createdBy, count]) => ({ createdBy, count }))
    .sort((a, b) => b.count - a.count);

  const totalCount = assignments.length;

  // Paginate
  const skip = (page - 1) * pageSize;
  const sliced = assignments.slice(skip, skip + pageSize);

  const rows: OverrideAuditRow[] = sliced.map((a) => ({
    assignmentId: a.id,
    loadId: a.loadId,
    referenceNumber: a.load?.referenceNumber ?? null,
    driverId: a.driverId,
    driverName: `${a.driver?.firstName ?? ''} ${a.driver?.lastName ?? ''}`.trim(),
    overrideReason: a.overrideReason ?? '',
    createdBy: a.createdBy ?? null,
    createdAt: a.createdAt.toISOString(),
    payType: a.payType ?? null,
    baseRate: a.baseRate != null ? a.baseRate.toString() : null,
    rateUnit: a.rateUnit ?? null,
  }));

  // Prior period count
  const priorRange = getPriorPeriodRange(range);
  const priorAssignments = await prisma.loadDriverAssignment.findMany({
    where: {
      tenantId,
      deletedAt: null,
      overrideReason: { not: null },
      createdAt: { gte: priorRange.start, lte: priorRange.end },
    },
    select: { id: true },
  });

  const priorCount = priorAssignments.length;
  const deltaPct = computeDeltaPct(
    new Decimal(totalCount),
    new Decimal(priorCount),
  );

  return {
    bigNumber: totalCount,
    deltaPct,
    priorCount,
    byDispatcher,
    page,
    pageSize,
    totalCount,
    rows,
  };
}
