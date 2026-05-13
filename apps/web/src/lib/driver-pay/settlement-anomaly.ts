/**
 * Settlement Anomaly Detection
 *
 * Computes a 4-week rolling average of a driver's net pay and flags
 * settlements that deviate >25% from that average.
 *
 * All arithmetic uses decimal.js — never native floats.
 */

import Decimal from 'decimal.js';
import type { PrismaClient } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AnomalyResult {
  isAnomaly: boolean;
  fourWeekAverage: Decimal | null;
  currentNet: Decimal;
  deviationPct: Decimal | null; // e.g. 32.5 = +32.5%, -30.0 = -30.0%
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Threshold
// ---------------------------------------------------------------------------

const ANOMALY_THRESHOLD_PCT = new Decimal(25);

// ---------------------------------------------------------------------------
// computeFourWeekAverage
// ---------------------------------------------------------------------------

/**
 * Query the last 4 FINALIZED or PAID settlements for the given driver
 * that ended before `asOfDate`. Returns null if fewer than 2 settlements
 * found (insufficient data for a meaningful average).
 */
export async function computeFourWeekAverage(
  prisma: PrismaClient,
  tenantId: string,
  driverId: string,
  asOfDate: Date,
): Promise<Decimal | null> {
  const prior = await prisma.driverSettlement.findMany({
    where: {
      tenantId,
      driverId,
      status: { in: ['FINALIZED', 'PAID'] },
      periodEnd: { lt: asOfDate },
    },
    orderBy: { periodEnd: 'desc' },
    take: 4,
    select: { netPay: true },
  });

  if (prior.length < 2) {
    return null;
  }

  const sum = prior.reduce(
    (acc, s) => acc.plus(new Decimal(s.netPay.toString())),
    new Decimal(0),
  );

  return sum.div(new Decimal(prior.length)).toDecimalPlaces(2);
}

// ---------------------------------------------------------------------------
// detectSettlementAnomaly
// ---------------------------------------------------------------------------

/**
 * Compares `currentNet` against `fourWeekAverage`.
 * Returns isAnomaly=true when the absolute deviation exceeds 25%.
 *
 * If `fourWeekAverage` is null (insufficient history), returns isAnomaly=false.
 */
export function detectSettlementAnomaly(
  currentNet: Decimal,
  fourWeekAverage: Decimal | null,
): AnomalyResult {
  if (fourWeekAverage === null || fourWeekAverage.isZero()) {
    return {
      isAnomaly: false,
      fourWeekAverage: null,
      currentNet,
      deviationPct: null,
      reason: null,
    };
  }

  // deviationPct = ((current - avg) / avg) * 100
  const deviationPct = currentNet
    .minus(fourWeekAverage)
    .div(fourWeekAverage)
    .mul(100)
    .toDecimalPlaces(1);

  const absDeviation = deviationPct.abs();
  const isAnomaly = absDeviation.gt(ANOMALY_THRESHOLD_PCT);

  let reason: string | null = null;
  if (isAnomaly) {
    const direction = currentNet.gt(fourWeekAverage) ? 'higher' : 'lower';
    reason = `Net pay ${formatMoney(currentNet)} is ${absDeviation.toFixed(1)}% ${direction} than 4-week average ${formatMoney(fourWeekAverage)}`;
  }

  return {
    isAnomaly,
    fourWeekAverage,
    currentNet,
    deviationPct,
    reason,
  };
}

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function formatMoney(d: Decimal): string {
  return `$${d.toFixed(2)}`;
}
