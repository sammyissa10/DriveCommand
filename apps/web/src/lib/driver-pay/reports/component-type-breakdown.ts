/**
 * component-type-breakdown.ts — Pay component type breakdown with % of total.
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';
import {
  getPriorPeriodRange,
  computeDeltaPct,
  type PeriodRange,
  type ReportFilters,
} from '@/lib/driver-pay/reporting';

export interface ComponentTypeRow {
  componentType: string;
  totalAmount: string;
  count: number;
  pct: number;
}

export interface ComponentTypeBreakdownResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  rows: ComponentTypeRow[];
}

export async function computeComponentTypeBreakdown(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters?: ReportFilters,
): Promise<ComponentTypeBreakdownResult> {
  const driverFilter = filters?.driverIds?.length
    ? { driverId: { in: filters.driverIds } }
    : {};

  const groups = await prisma.loadPayComponent.groupBy({
    by: ['componentType'],
    where: {
      tenantId,
      deletedAt: null,
      createdAt: { gte: range.start, lte: range.end },
      ...driverFilter,
    },
    _sum: { grossAmount: true },
    _count: { _all: true },
  });

  let bigNumberDecimal = new Decimal(0);
  const interim = groups.map((g) => {
    const total = new Decimal(g._sum.grossAmount?.toString() ?? '0');
    bigNumberDecimal = bigNumberDecimal.plus(total);
    return { componentType: g.componentType, total, count: g._count._all };
  });

  // Sort descending by totalAmount
  interim.sort((a, b) => b.total.minus(a.total).toNumber());

  const rows: ComponentTypeRow[] = interim.map((r) => ({
    componentType: r.componentType,
    totalAmount: r.total.toFixed(2),
    count: r.count,
    pct: bigNumberDecimal.isZero()
      ? 0
      : r.total.div(bigNumberDecimal).mul(100).toDecimalPlaces(1).toNumber(),
  }));

  // Prior period
  const priorRange = getPriorPeriodRange(range);
  const priorGroups = await prisma.loadPayComponent.groupBy({
    by: ['componentType'],
    where: {
      tenantId,
      deletedAt: null,
      createdAt: { gte: priorRange.start, lte: priorRange.end },
      ...driverFilter,
    },
    _sum: { grossAmount: true },
  });

  const priorDecimal = priorGroups.reduce(
    (acc, g) => acc.plus(new Decimal(g._sum.grossAmount?.toString() ?? '0')),
    new Decimal(0),
  );

  return {
    bigNumber: bigNumberDecimal.toFixed(2),
    deltaPct: computeDeltaPct(bigNumberDecimal, priorDecimal),
    priorTotal: priorDecimal.toFixed(2),
    rows,
  };
}
