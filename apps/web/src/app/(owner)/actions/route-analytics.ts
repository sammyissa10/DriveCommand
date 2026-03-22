'use server';

import { Prisma } from '@/generated/prisma';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import {
  calculateRouteFinancials,
  calculateCostPerMile,
  compareToFleetAverage,
  RouteFinancials,
} from '@/lib/finance/route-calculator';

const Decimal = Prisma.Decimal;

interface RouteFinancialAnalytics {
  financials: RouteFinancials;
  costPerMile: { costPerMile: string | null; miles: number | null };
  fleetAverage: { costPerMile: string | null; routeCount: number };
  comparison: {
    comparison: 'above' | 'below' | 'equal' | 'unknown';
    difference: string | null;
    differencePercent: number | null;
  };
  profitMarginThreshold: number;
}

/**
 * Get complete financial analytics for a route, including cost per mile and fleet comparison
 * @param routeId - Route ID
 * @returns Complete analytics object or null if route not found
 */
export async function getRouteFinancialAnalytics(
  routeId: string
): Promise<RouteFinancialAnalytics | null> {
  // Check permissions: OWNER, MANAGER, or DRIVER can read route financials
  await requireRole([UserRole.OWNER, UserRole.MANAGER, UserRole.DRIVER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Fetch route with odometer data
  const route = await prisma.route.findUnique({
    where: { id: routeId },
    select: {
      id: true,
      startOdometer: true,
      endOdometer: true,
    },
  });

  if (!route) {
    return null;
  }

  // Fetch route expenses (non-deleted)
  const expenses = await prisma.routeExpense.findMany({
    where: {
      routeId,
      deletedAt: null,
    },
    select: {
      amount: true,
    },
  });

  // Fetch route payments (non-deleted)
  const payments = await prisma.routePayment.findMany({
    where: {
      routeId,
      deletedAt: null,
    },
    select: {
      amount: true,
      status: true,
    },
  });

  // Fetch tenant's profit margin threshold
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { profitMarginThreshold: true },
  });

  const profitMarginThreshold = tenant
    ? Number(tenant.profitMarginThreshold)
    : 10;

  // Calculate basic financials
  const financials = calculateRouteFinancials(
    expenses,
    payments,
    profitMarginThreshold
  );

  // Calculate cost per mile for this route
  const costPerMile = calculateCostPerMile(
    financials.totalExpenses,
    route.startOdometer,
    route.endOdometer
  );

  // Get fleet average cost per mile
  const fleetAverage = await getFleetAverageCostPerMile();

  // Compare to fleet average
  const comparison = compareToFleetAverage(
    costPerMile.costPerMile,
    fleetAverage.costPerMile
  );

  return {
    financials,
    costPerMile,
    fleetAverage,
    comparison,
    profitMarginThreshold,
  };
}

/**
 * Calculate fleet average cost per mile from completed routes in last 90 days
 * @returns Fleet average cost per mile and count of routes used in calculation
 */
export async function getFleetAverageCostPerMile(): Promise<{
  costPerMile: string | null;
  routeCount: number;
}> {
  // Check permissions: OWNER or MANAGER can read fleet analytics
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Calculate cutoff date (90 days ago)
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - 90);

  // Fetch completed routes with odometer data from last 90 days
  const routes = await prisma.route.findMany({
    where: {
      status: 'COMPLETED',
      startOdometer: { not: null },
      endOdometer: { not: null },
      completedAt: { gte: cutoffDate },
    },
    select: {
      id: true,
      startOdometer: true,
      endOdometer: true,
      expenses: {
        where: { deletedAt: null },
        select: { amount: true },
      },
    },
  });

  // If no qualifying routes, return null
  if (routes.length === 0) {
    return { costPerMile: null, routeCount: 0 };
  }

  // Calculate cost per mile for each route and collect valid values
  const costPerMileValues: Prisma.Decimal[] = [];

  for (const route of routes) {
    // Calculate total expenses for this route
    const totalExpenses = route.expenses.reduce(
      (sum: Prisma.Decimal, expense: { amount: Prisma.Decimal }) =>
        sum.add(new Decimal(expense.amount)),
      new Decimal(0)
    );

    // Calculate miles (we know startOdometer and endOdometer are not null due to query filter)
    const miles = route.endOdometer! - route.startOdometer!;

    // Skip routes with invalid mileage
    if (miles <= 0) {
      continue;
    }

    // Calculate cost per mile for this route
    const routeCostPerMile = totalExpenses.div(miles);
    costPerMileValues.push(routeCostPerMile);
  }

  // If no valid cost per mile values, return null
  if (costPerMileValues.length === 0) {
    return { costPerMile: null, routeCount: 0 };
  }

  // Calculate average
  const sum = costPerMileValues.reduce(
    (acc, value) => acc.add(value),
    new Decimal(0)
  );
  const average = sum.div(costPerMileValues.length).toDecimalPlaces(2);

  return {
    costPerMile: average.toFixed(2),
    routeCount: costPerMileValues.length,
  };
}
