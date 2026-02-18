'use server';

import { Prisma } from '@/generated/prisma';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getLaneAnalytics } from '@/app/(owner)/actions/lane-analytics';
import { getFleetAverageCostPerMile } from '@/app/(owner)/actions/route-analytics';

const Decimal = Prisma.Decimal;

export interface PredictionInput {
  origin: string;          // User-entered origin (normalized internally)
  destination: string;     // User-entered destination (normalized internally)
  distanceMiles: number;   // Miles for this load
  offeredRate: number;     // Payment offered (dollars)
}

export interface PredictionResult {
  predictedExpenses: string;          // Decimal string, 2dp
  predictedProfit: string;            // Decimal string, 2dp (offeredRate - predictedExpenses)
  predictedMarginPercent: number;     // (profit / offeredRate) * 100, 0 if rate=0
  costPerMileUsed: string;            // Decimal string, 2dp
  dataSource: 'lane' | 'fleet' | 'none';  // Where cost-per-mile came from
  laneRouteCount: number | null;      // How many historical routes for matched lane
  offeredRate: string;                // Echo back for display
  distanceMiles: number;              // Echo back for display
  recommendation: 'accept' | 'caution' | 'reject';  // accept: margin>=15%, caution: 0-14.9%, reject: <0%
}

/**
 * Predict the profitability of a load before accepting it.
 * Uses lane-specific cost-per-mile if historical data exists for the origin-destination pair,
 * falls back to fleet average cost-per-mile if no lane history is available.
 *
 * @param input - Origin, destination, distance, and offered rate
 * @returns PredictionResult with predicted expenses, profit, margin, and recommendation
 */
export async function predictLoadProfitability(
  input: PredictionInput
): Promise<PredictionResult> {
  // OWNER/MANAGER only — drivers cannot see fleet-wide financial prediction data
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Normalize origin and destination for consistent lane matching
  const normalizedOrigin = input.origin.trim().toUpperCase();
  const normalizedDestination = input.destination.trim().toUpperCase();

  let costPerMileUsed: string = '0.00';
  let dataSource: 'lane' | 'fleet' | 'none' = 'none';
  let laneRouteCount: number | null = null;

  // Step 1: Try to find a matching lane in 1-year historical data
  const laneAnalytics = await getLaneAnalytics(365);
  const matchedLane = laneAnalytics.lanes.find(
    (lane) =>
      lane.origin === normalizedOrigin &&
      lane.destination === normalizedDestination
  );

  if (matchedLane && matchedLane.totalMiles !== null && matchedLane.totalMiles > 0) {
    // Compute cost-per-mile for this lane: totalExpenses / totalMiles
    const laneCostPerMile = new Decimal(matchedLane.totalExpenses)
      .div(new Decimal(matchedLane.totalMiles))
      .toDecimalPlaces(2);

    costPerMileUsed = laneCostPerMile.toFixed(2);
    dataSource = 'lane';
    laneRouteCount = matchedLane.routeCount;
  } else {
    // Step 2: Fall back to fleet average cost per mile
    const fleetAverage = await getFleetAverageCostPerMile();

    if (fleetAverage.costPerMile !== null) {
      costPerMileUsed = fleetAverage.costPerMile;
      dataSource = 'fleet';
      laneRouteCount = null;
    } else {
      // Step 3: No historical data at all
      dataSource = 'none';
      costPerMileUsed = '0.00';
    }
  }

  // Step 4: Compute predicted expenses using Decimal.js (NEVER use JS number arithmetic for money)
  const costPerMile = new Decimal(costPerMileUsed);
  const predictedExpenses = costPerMile
    .mul(new Decimal(input.distanceMiles))
    .toDecimalPlaces(2);
  const rate = new Decimal(input.offeredRate);
  const predictedProfit = rate.sub(predictedExpenses).toDecimalPlaces(2);
  const predictedMarginPercent = rate.isZero()
    ? 0
    : predictedProfit.div(rate).mul(100).toDecimalPlaces(1).toNumber();

  // Step 5: Determine recommendation based on margin thresholds
  let recommendation: 'accept' | 'caution' | 'reject';
  if (dataSource === 'none') {
    // No cost data — cannot make reliable recommendation
    recommendation = 'caution';
  } else if (predictedMarginPercent >= 15) {
    recommendation = 'accept';
  } else if (predictedMarginPercent >= 0) {
    recommendation = 'caution';
  } else {
    recommendation = 'reject';
  }

  return {
    predictedExpenses: predictedExpenses.toFixed(2),
    predictedProfit: predictedProfit.toFixed(2),
    predictedMarginPercent,
    costPerMileUsed,
    dataSource,
    laneRouteCount,
    offeredRate: rate.toFixed(2),
    distanceMiles: input.distanceMiles,
    recommendation,
  };
}
