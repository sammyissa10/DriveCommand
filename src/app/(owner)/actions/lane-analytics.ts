'use server';

import { Prisma } from '@/generated/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';

const Decimal = Prisma.Decimal;

export interface LaneData {
  lane: string;           // "CHICAGO, IL -> DALLAS, TX"
  origin: string;         // Normalized origin
  destination: string;    // Normalized destination
  routeCount: number;
  totalRevenue: string;
  totalExpenses: string;
  profit: string;
  marginPercent: number;
  avgProfitPerRoute: string;
  totalMiles: number | null;
  profitPerMile: string | null;
}

export interface LaneAnalytics {
  lanes: LaneData[];          // Sorted by profit descending
  totalLanes: number;
  totalRoutes: number;
  overallRevenue: string;
  overallExpenses: string;
  overallProfit: string;
  overallMargin: number;
  timeframeDays: number;
}

/**
 * Get lane-level profitability analytics aggregated from completed routes.
 * Groups routes by origin-destination pair (lane) and computes financial metrics.
 * @param timeframeDays - Number of days to look back (default 90)
 * @returns LaneAnalytics object with per-lane data and fleet totals
 */
export async function getLaneAnalytics(
  timeframeDays: number = 90
): Promise<LaneAnalytics> {
  // OWNER/MANAGER only — drivers cannot see fleet-wide financial data
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();

  // Calculate cutoff date
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

  // Fetch all COMPLETED routes within the timeframe with their financial data
  const routes = await prisma.route.findMany({
    where: {
      status: 'COMPLETED',
      completedAt: { gte: cutoffDate },
    },
    select: {
      id: true,
      origin: true,
      destination: true,
      startOdometer: true,
      endOdometer: true,
      completedAt: true,
      expenses: {
        where: { deletedAt: null },
        select: { amount: true },
      },
      payments: {
        where: { deletedAt: null },
        select: { amount: true, status: true },
      },
    },
  });

  // Aggregate by lane key
  const laneMap = new Map<string, {
    origin: string;
    destination: string;
    routeCount: number;
    totalRevenue: Prisma.Decimal;
    totalExpenses: Prisma.Decimal;
    totalMiles: number;
    hasMileage: boolean;
  }>();

  for (const route of routes) {
    // Normalize: trim and uppercase for consistent grouping
    const normalizedOrigin = route.origin.trim().toUpperCase();
    const normalizedDestination = route.destination.trim().toUpperCase();
    const laneKey = `${normalizedOrigin} -> ${normalizedDestination}`;

    // Sum expenses for this route
    const routeExpenses = route.expenses.reduce(
      (sum: Prisma.Decimal, e: { amount: Prisma.Decimal }) =>
        sum.add(new Decimal(e.amount)),
      new Decimal(0)
    );

    // Sum payments for this route
    const routeRevenue = route.payments.reduce(
      (sum: Prisma.Decimal, p: { amount: Prisma.Decimal; status: string }) =>
        sum.add(new Decimal(p.amount)),
      new Decimal(0)
    );

    // Calculate miles for this route if odometer data is available
    const hasMileage =
      route.startOdometer !== null &&
      route.endOdometer !== null &&
      route.endOdometer > route.startOdometer;
    const routeMiles = hasMileage
      ? (route.endOdometer! - route.startOdometer!)
      : 0;

    const existing = laneMap.get(laneKey);
    if (existing) {
      existing.routeCount += 1;
      existing.totalRevenue = existing.totalRevenue.add(routeRevenue);
      existing.totalExpenses = existing.totalExpenses.add(routeExpenses);
      if (hasMileage) {
        existing.totalMiles += routeMiles;
        existing.hasMileage = true;
      }
    } else {
      laneMap.set(laneKey, {
        origin: normalizedOrigin,
        destination: normalizedDestination,
        routeCount: 1,
        totalRevenue: routeRevenue,
        totalExpenses: routeExpenses,
        totalMiles: hasMileage ? routeMiles : 0,
        hasMileage,
      });
    }
  }

  // Convert map to LaneData array with computed fields
  const laneDataList: LaneData[] = [];

  for (const [laneKey, data] of laneMap.entries()) {
    const profit = data.totalRevenue.sub(data.totalExpenses);

    // Margin: (profit / totalRevenue) * 100, or 0 if no revenue
    const marginPercent = data.totalRevenue.isZero()
      ? 0
      : profit.div(data.totalRevenue).mul(100).toDecimalPlaces(2).toNumber();

    // Average profit per route
    const avgProfitPerRoute = profit
      .div(new Decimal(data.routeCount))
      .toDecimalPlaces(2);

    // Profit per mile (only if we have mileage data)
    let profitPerMile: string | null = null;
    if (data.hasMileage && data.totalMiles > 0) {
      profitPerMile = profit
        .div(new Decimal(data.totalMiles))
        .toDecimalPlaces(2)
        .toFixed(2);
    }

    laneDataList.push({
      lane: laneKey,
      origin: data.origin,
      destination: data.destination,
      routeCount: data.routeCount,
      totalRevenue: data.totalRevenue.toFixed(2),
      totalExpenses: data.totalExpenses.toFixed(2),
      profit: profit.toFixed(2),
      marginPercent,
      avgProfitPerRoute: avgProfitPerRoute.toFixed(2),
      totalMiles: data.hasMileage ? data.totalMiles : null,
      profitPerMile,
    });
  }

  // Sort by profit descending using Decimal comparison
  laneDataList.sort((a, b) => {
    const profitA = new Decimal(a.profit);
    const profitB = new Decimal(b.profit);
    return profitB.comparedTo(profitA);
  });

  // Calculate fleet-wide totals
  let overallRevenue = new Decimal(0);
  let overallExpenses = new Decimal(0);

  for (const lane of laneDataList) {
    overallRevenue = overallRevenue.add(new Decimal(lane.totalRevenue));
    overallExpenses = overallExpenses.add(new Decimal(lane.totalExpenses));
  }

  const overallProfit = overallRevenue.sub(overallExpenses);
  const overallMargin = overallRevenue.isZero()
    ? 0
    : overallProfit.div(overallRevenue).mul(100).toDecimalPlaces(2).toNumber();

  return {
    lanes: laneDataList,
    totalLanes: laneDataList.length,
    totalRoutes: routes.length,
    overallRevenue: overallRevenue.toFixed(2),
    overallExpenses: overallExpenses.toFixed(2),
    overallProfit: overallProfit.toFixed(2),
    overallMargin,
    timeframeDays,
  };
}
