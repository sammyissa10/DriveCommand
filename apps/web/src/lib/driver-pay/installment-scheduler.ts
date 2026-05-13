import Decimal from 'decimal.js';
import type { BonusType } from '@/generated/prisma';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InstallmentBaseInput {
  tenantId: string;
  driverId: string;
  bonusType: BonusType;
  description: string;
  triggerDate: Date;
  referredDriverId?: string | null;
  isTaxable: boolean;
  visibleToDriver: boolean;
  notes?: string | null;
  createdBy: string;
}

export interface ScheduledInstallment {
  amount: Decimal;
  scheduledPayDate: Date;
  installmentNumber: number;
  totalInstallments: number;
  /** true for the first installment (parent); false for 2..N (children) */
  isParent: boolean;
}

// ---------------------------------------------------------------------------
// Pure function — no I/O, no Prisma imports
// ---------------------------------------------------------------------------

/**
 * Splits `totalAmount` evenly across `count` installments, using
 * Decimal.js ROUND_DOWN so each base slice is floor-to-2-decimals.
 * The last installment absorbs any rounding remainder, making the sum
 * penny-exact to `totalAmount`.
 *
 * @param params.totalAmount  The full bonus amount (Decimal.js instance)
 * @param params.count        Number of installments — must be >= 2
 * @param params.startDate    Pay date of the first installment
 * @param params.intervalDays Days between successive installments (7, 14, or 30)
 */
export function scheduleInstallments(params: {
  totalAmount: Decimal;
  count: number;
  startDate: Date;
  intervalDays: number;
}): ScheduledInstallment[] {
  if (params.count < 2) {
    throw new Error('scheduleInstallments requires count >= 2');
  }

  // Floor each base slice to 2 decimal places so we never exceed totalAmount.
  // ROUND_DOWN = Decimal.js mode 1.
  const base = params.totalAmount
    .div(params.count)
    .toDecimalPlaces(2, Decimal.ROUND_DOWN);

  const installments: ScheduledInstallment[] = [];
  let runningSum = new Decimal(0);

  for (let i = 0; i < params.count; i++) {
    const isLast = i === params.count - 1;
    // Last installment absorbs remainder (totalAmount - sum of previous slices).
    const amount = isLast ? params.totalAmount.minus(runningSum) : base;
    runningSum = runningSum.plus(amount);

    // Offset pay date by (i * intervalDays) from startDate.
    const scheduledPayDate = new Date(params.startDate);
    scheduledPayDate.setDate(scheduledPayDate.getDate() + i * params.intervalDays);

    installments.push({
      amount,
      scheduledPayDate,
      installmentNumber: i + 1,
      totalInstallments: params.count,
      isParent: i === 0,
    });
  }

  return installments;
}
