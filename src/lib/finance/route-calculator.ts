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
