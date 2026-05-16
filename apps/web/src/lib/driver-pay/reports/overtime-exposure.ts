/**
 * overtime-exposure.ts — OVERTIME pay components with driver/load context.
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';
import {
  getPriorPeriodRange,
  computeDeltaPct,
  type PeriodRange,
} from '@/lib/driver-pay/reporting';

export interface OvertimeExposureRow {
  driverId: string;
  driverName: string;
  loadId: string | null;
  referenceNumber: string | null;
  overtimeAmount: string;
  actualHours: string | null;
  assignmentId: string;
}

export interface OvertimeExposureResult {
  bigNumber: string;
  deltaPct: number | null;
  priorTotal: string;
  totalLoadsAffected: number;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: OvertimeExposureRow[];
}

export interface OvertimePagination {
  page: number;
  pageSize: number;
}

export async function computeOvertimeExposure(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  pagination: OvertimePagination,
): Promise<OvertimeExposureResult> {
  const { page, pageSize } = pagination;

  const components = await prisma.loadPayComponent.findMany({
    where: {
      tenantId,
      componentType: 'OVERTIME',
      deletedAt: null,
      createdAt: { gte: range.start, lte: range.end },
    },
    include: {
      load: { select: { id: true, referenceNumber: true } },
      assignment: {
        select: {
          id: true,
          actualHours: true,
          driver: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { grossAmount: 'desc' },
  });

  let bigNumberDecimal = new Decimal(0);
  const loadIds = new Set<string>();

  const allRows: OvertimeExposureRow[] = components.map((c) => {
    const amount = new Decimal(c.grossAmount.toString());
    bigNumberDecimal = bigNumberDecimal.plus(amount);

    if (c.loadId) {
      loadIds.add(c.loadId);
    }

    const firstName = c.assignment?.driver?.firstName ?? '';
    const lastName = c.assignment?.driver?.lastName ?? '';

    return {
      driverId: c.driverId,
      driverName: `${firstName} ${lastName}`.trim(),
      loadId: c.loadId ?? null,
      referenceNumber: c.load?.referenceNumber ?? null,
      overtimeAmount: amount.toFixed(2),
      actualHours: c.assignment?.actualHours != null
        ? new Decimal(c.assignment.actualHours.toString()).toFixed(2)
        : null,
      assignmentId: c.assignmentId,
    };
  });

  const totalCount = allRows.length;
  const totalLoadsAffected = loadIds.size;

  // Paginate
  const skip = (page - 1) * pageSize;
  const rows = allRows.slice(skip, skip + pageSize);

  // Prior period sum
  const priorRange = getPriorPeriodRange(range);
  const priorComponents = await prisma.loadPayComponent.findMany({
    where: {
      tenantId,
      componentType: 'OVERTIME',
      deletedAt: null,
      createdAt: { gte: priorRange.start, lte: priorRange.end },
    },
    select: { grossAmount: true },
  });

  const priorDecimal = priorComponents.reduce(
    (acc, c) => acc.plus(new Decimal(c.grossAmount.toString())),
    new Decimal(0),
  );

  return {
    bigNumber: bigNumberDecimal.toFixed(2),
    deltaPct: computeDeltaPct(bigNumberDecimal, priorDecimal),
    priorTotal: priorDecimal.toFixed(2),
    totalLoadsAffected,
    page,
    pageSize,
    totalCount,
    rows,
  };
}
