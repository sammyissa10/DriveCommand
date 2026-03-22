import { Prisma } from '@/generated/prisma';

const Decimal = Prisma.Decimal;

interface RouteExpenseData {
  amount: Prisma.Decimal | string;
}

interface RoutePaymentData {
  amount: Prisma.Decimal | string;
  status: string;
}

export interface RouteFinancials {
  totalExpenses: string; // Decimal as string for serialization
  totalRevenue: string; // Sum of all payments (regardless of status)
  totalPaidRevenue: string; // Sum of PAID payments only
  totalPendingRevenue: string; // Sum of PENDING payments only
  profit: string; // totalRevenue - totalExpenses
  marginPercent: number; // (profit / totalRevenue) * 100, or 0 if no revenue
  isLowMargin: boolean; // marginPercent < threshold
}

export function calculateRouteFinancials(
  expenses: RouteExpenseData[],
  payments: RoutePaymentData[],
  profitMarginThreshold: number = 10
): RouteFinancials {
  // Sum expenses using Decimal.add (NEVER use JavaScript number arithmetic)
  const totalExpenses = expenses.reduce(
    (sum, e) => sum.add(new Decimal(e.amount)),
    new Decimal(0)
  );

  // Sum all payments
  const totalRevenue = payments.reduce(
    (sum, p) => sum.add(new Decimal(p.amount)),
    new Decimal(0)
  );

  // Sum by status
  const totalPaidRevenue = payments
    .filter((p) => p.status === 'PAID')
    .reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));

  const totalPendingRevenue = payments
    .filter((p) => p.status === 'PENDING')
    .reduce((sum, p) => sum.add(new Decimal(p.amount)), new Decimal(0));

  // Calculate profit
  const profit = totalRevenue.sub(totalExpenses);

  // Calculate margin percentage (handle zero-division)
  const marginPercent = totalRevenue.isZero()
    ? 0
    : Number(profit.div(totalRevenue).mul(100).toFixed(2));

  const isLowMargin = totalRevenue.isZero()
    ? false
    : marginPercent < profitMarginThreshold;

  return {
    totalExpenses: totalExpenses.toFixed(2),
    totalRevenue: totalRevenue.toFixed(2),
    totalPaidRevenue: totalPaidRevenue.toFixed(2),
    totalPendingRevenue: totalPendingRevenue.toFixed(2),
    profit: profit.toFixed(2),
    marginPercent,
    isLowMargin,
  };
}

/**
 * Calculate cost per mile for a route
 * @param totalExpenses - Total expenses as Decimal or string
 * @param startOdometer - Starting odometer reading (nullable)
 * @param endOdometer - Ending odometer reading (nullable)
 * @returns Object with costPerMile (string, 2 decimal places) and miles, or null values if data unavailable
 */
export function calculateCostPerMile(
  totalExpenses: Prisma.Decimal | string,
  startOdometer: number | null,
  endOdometer: number | null
): { costPerMile: string | null; miles: number | null } {
  // If odometer data is missing, return null
  if (startOdometer === null || endOdometer === null) {
    return { costPerMile: null, miles: null };
  }

  // Calculate miles
  const miles = endOdometer - startOdometer;

  // If miles is zero or negative, return null cost per mile
  if (miles <= 0) {
    return { costPerMile: null, miles: 0 };
  }

  // Calculate cost per mile using Decimal arithmetic
  const expenses = new Decimal(totalExpenses);
  const costPerMile = expenses.div(miles).toDecimalPlaces(2);

  return {
    costPerMile: costPerMile.toFixed(2),
    miles,
  };
}

/**
 * Compare route cost per mile to fleet average
 * @param routeCostPerMile - Route's cost per mile as string (nullable)
 * @param fleetAverage - Fleet average cost per mile as string (nullable)
 * @returns Comparison object with difference and percentage, or 'unknown' if data unavailable
 */
export function compareToFleetAverage(
  routeCostPerMile: string | null,
  fleetAverage: string | null
): {
  comparison: 'above' | 'below' | 'equal' | 'unknown';
  difference: string | null;
  differencePercent: number | null;
} {
  // If either value is null, cannot compare
  if (routeCostPerMile === null || fleetAverage === null) {
    return {
      comparison: 'unknown',
      difference: null,
      differencePercent: null,
    };
  }

  const routeCost = new Decimal(routeCostPerMile);
  const fleetAvg = new Decimal(fleetAverage);

  // Handle zero fleet average (avoid division by zero)
  if (fleetAvg.isZero()) {
    return {
      comparison: 'unknown',
      difference: null,
      differencePercent: null,
    };
  }

  // Calculate difference
  const difference = routeCost.sub(fleetAvg);

  // Calculate percentage difference
  const differencePercent = difference.div(fleetAvg).mul(100).toDecimalPlaces(1);

  // Determine comparison
  let comparison: 'above' | 'below' | 'equal' = 'equal';
  if (routeCost.greaterThan(fleetAvg)) {
    comparison = 'above';
  } else if (routeCost.lessThan(fleetAvg)) {
    comparison = 'below';
  }

  return {
    comparison,
    difference: difference.toFixed(2),
    differencePercent: Number(differencePercent.toFixed(1)),
  };
}
