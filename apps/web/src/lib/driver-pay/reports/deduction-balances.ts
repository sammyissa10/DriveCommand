/**
 * deduction-balances.ts — FIXED_INSTALLMENTS deductions with remaining balance.
 * NOT period-scoped (point-in-time balance snapshot).
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';

export interface DeductionBalanceRow {
  driverId: string;
  driverName: string;
  deductionId: string;
  deductionType: string;
  totalAmount: string;
  amountCollected: string;
  remaining: string;
  percentComplete: number;
  schedule: string;
}

export interface DeductionBalancesResult {
  bigNumber: string;          // total outstanding balance
  driversWithBalanceCount: number;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: DeductionBalanceRow[];
}

export interface DeductionBalancesPagination {
  page: number;
  pageSize: number;
}

export async function computeDeductionBalances(
  prisma: PrismaClient,
  tenantId: string,
  pagination: DeductionBalancesPagination,
  driverIds?: string[],
): Promise<DeductionBalancesResult> {
  const { page, pageSize } = pagination;

  const deductions = await prisma.driverDeduction.findMany({
    where: {
      tenantId,
      deletedAt: null,
      schedule: 'FIXED_INSTALLMENTS',
      ...(driverIds?.length ? { driverId: { in: driverIds } } : {}),
    },
    include: {
      driver: { select: { firstName: true, lastName: true } },
    },
  });

  // Filter in JS for rows with remaining > 0
  const withBalance: Array<{
    driverId: string;
    driverName: string;
    deductionId: string;
    deductionType: string;
    totalAmount: Decimal;
    amountCollected: Decimal;
    remaining: Decimal;
    percentComplete: number;
    schedule: string;
  }> = [];

  for (const d of deductions) {
    if (d.totalAmount === null) continue;

    const total = new Decimal(d.totalAmount.toString());
    const collected = new Decimal(d.amountCollected.toString());
    const remaining = total.minus(collected);

    if (!remaining.greaterThan(0)) continue;

    const percentComplete = total.isZero()
      ? 0
      : collected.div(total).mul(100).toDecimalPlaces(1).toNumber();

    withBalance.push({
      driverId: d.driverId,
      driverName: `${d.driver?.firstName ?? ''} ${d.driver?.lastName ?? ''}`.trim(),
      deductionId: d.id,
      deductionType: d.deductionType,
      totalAmount: total,
      amountCollected: collected,
      remaining,
      percentComplete,
      schedule: d.schedule,
    });
  }

  // Sort by remaining desc
  withBalance.sort((a, b) => b.remaining.minus(a.remaining).toNumber());

  // Compute totals
  let bigNumberDecimal = new Decimal(0);
  const driverSet = new Set<string>();
  for (const b of withBalance) {
    bigNumberDecimal = bigNumberDecimal.plus(b.remaining);
    driverSet.add(b.driverId);
  }

  const totalCount = withBalance.length;
  const skip = (page - 1) * pageSize;
  const sliced = withBalance.slice(skip, skip + pageSize);

  const rows: DeductionBalanceRow[] = sliced.map((b) => ({
    driverId: b.driverId,
    driverName: b.driverName,
    deductionId: b.deductionId,
    deductionType: b.deductionType,
    totalAmount: b.totalAmount.toFixed(2),
    amountCollected: b.amountCollected.toFixed(2),
    remaining: b.remaining.toFixed(2),
    percentComplete: b.percentComplete,
    schedule: b.schedule,
  }));

  return {
    bigNumber: bigNumberDecimal.toFixed(2),
    driversWithBalanceCount: driverSet.size,
    page,
    pageSize,
    totalCount,
    rows,
  };
}
