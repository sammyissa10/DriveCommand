import Decimal from 'decimal.js';

export type ComputeInput = {
  componentType: string;       // PayComponentType enum value as string
  quantity: Decimal;           // e.g. miles, hours, days, stops
  rate: Decimal;               // base rate per unit
  multiplier: Decimal;         // default 1.0
  loadedMilesOnly?: boolean;   // for CPM: use loaded_miles (quantity) when true
  loadRevenue?: Decimal;       // for PERCENTAGE
  splitTotal?: Decimal;        // for SPLIT: total load pay pool
  splitPct?: Decimal;          // for SPLIT: percentage (0-100 scale)
  arrivedAt?: Date;            // for DETENTION
  departedAt?: Date;           // for DETENTION
  freeTimeMinutes?: number;    // for DETENTION, default 120
  weeklyHours?: Decimal;       // for FEDERAL_OT (alias OVERTIME)
  dailyHours?: Decimal;        // for STATE_DAILY_OT
  dailyThreshold?: Decimal;    // for STATE_DAILY_OT, default 8
  otMultiplier?: Decimal;      // for OT calculations
};

/**
 * CPM: miles × rate × multiplier
 * When loadedMilesOnly is true the CALLER passes loaded miles as `miles`.
 */
export function calcCpm(miles: Decimal, rate: Decimal, multiplier: Decimal): Decimal {
  return miles.mul(rate).mul(multiplier);
}

/**
 * Fuel Surcharge: miles × fscRate
 */
export function calcFuelSurcharge(miles: Decimal, fscRate: Decimal): Decimal {
  return miles.mul(fscRate);
}

/**
 * Hourly: hours × rate × multiplier
 */
export function calcHourly(hours: Decimal, rate: Decimal, multiplier: Decimal): Decimal {
  return hours.mul(rate).mul(multiplier);
}

/**
 * Flat: rate × multiplier
 */
export function calcFlat(rate: Decimal, multiplier: Decimal): Decimal {
  return rate.mul(multiplier);
}

/**
 * Percentage of revenue: revenue × rate (rate is a decimal fraction, e.g. 0.80 = 80%)
 */
export function calcPercentage(revenue: Decimal, rate: Decimal): Decimal {
  return revenue.mul(rate);
}

/**
 * Daily: days × rate
 */
export function calcDaily(days: Decimal, rate: Decimal): Decimal {
  return days.mul(rate);
}

/**
 * Split: totalLoadPay × splitPct / 100
 */
export function calcSplit(totalLoadPay: Decimal, splitPct: Decimal): Decimal {
  return totalLoadPay.mul(splitPct).div(new Decimal(100));
}

/**
 * Detention: billable hours (elapsed minus free time, floored at 0) × detentionRate
 * Always returns a Decimal >= 0.
 */
export function calcDetention(
  arrivedAt: Date,
  departedAt: Date,
  freeTimeMinutes: number,
  detentionRate: Decimal,
): Decimal {
  const elapsedHours = new Decimal(departedAt.getTime() - arrivedAt.getTime()).div(
    new Decimal(3600000),
  );
  const freeHours = new Decimal(freeTimeMinutes).div(new Decimal(60));
  const billableHours = Decimal.max(new Decimal(0), elapsedHours.minus(freeHours)).toDecimalPlaces(
    2,
  );
  return billableHours.mul(detentionRate);
}

/**
 * Federal OT: hours beyond 40 in a week × baseRate × otMultiplier
 */
export function calcFederalOT(
  weeklyHours: Decimal,
  baseRate: Decimal,
  otMultiplier: Decimal,
): Decimal {
  const otHours = Decimal.max(new Decimal(0), weeklyHours.minus(new Decimal(40)));
  return otHours.mul(baseRate).mul(otMultiplier);
}

/**
 * State Daily OT: hours beyond dailyThreshold × baseRate × otMultiplier
 */
export function calcStateDailyOT(
  dailyHours: Decimal,
  dailyThreshold: Decimal,
  baseRate: Decimal,
  otMultiplier: Decimal,
): Decimal {
  const otHours = Decimal.max(new Decimal(0), dailyHours.minus(dailyThreshold));
  return otHours.mul(baseRate).mul(otMultiplier);
}

/**
 * Dispatcher — routes every PayComponentType to the correct formula.
 * Handles all 30 PayComponentType enum values from schema.prisma.
 * Returns new Decimal(0) for unknown types — callers handle zero gracefully.
 */
export function computeGrossAmount(input: ComputeInput): Decimal {
  switch (input.componentType) {
    // ── CPM base pay ─────────────────────────────────────────────────────────
    case 'BASE_PAY_MILEAGE':
      return calcCpm(input.quantity, input.rate, input.multiplier);

    // ── Fuel surcharge ────────────────────────────────────────────────────────
    case 'FUEL_SURCHARGE':
      return calcFuelSurcharge(input.quantity, input.rate);

    // ── Hourly base pay + federal overtime ───────────────────────────────────
    case 'BASE_PAY_HOURLY':
    case 'OVERTIME':
      return calcHourly(input.quantity, input.rate, input.multiplier);

    // ── Flat-rate earnings / accessorials / bonuses ───────────────────────────
    case 'BASE_PAY_FLAT':
    case 'LOAD_COMPLETION_BONUS':
    case 'FUEL_EFFICIENCY_BONUS':
    case 'HAZMAT_PREMIUM':
    case 'HOLIDAY_PREMIUM':
    case 'LAYOVER':
    case 'TONU':
    case 'STOP_OFF':
    case 'TARP':
    case 'BREAKDOWN':
    case 'ADJUSTMENT_POSITIVE':
    case 'ADJUSTMENT_NEGATIVE':
      return calcFlat(input.rate, input.multiplier);

    // ── Percentage of load revenue ────────────────────────────────────────────
    case 'BASE_PAY_PERCENTAGE':
      return calcPercentage(input.loadRevenue ?? new Decimal(0), input.rate);

    // ── Daily base pay + per diem ─────────────────────────────────────────────
    case 'BASE_PAY_DAILY':
    case 'PER_DIEM':
      return calcDaily(input.quantity, input.rate);

    // ── Detention ─────────────────────────────────────────────────────────────
    case 'DETENTION':
      if (input.arrivedAt && input.departedAt) {
        return calcDetention(
          input.arrivedAt,
          input.departedAt,
          input.freeTimeMinutes ?? 120,
          input.rate,
        );
      }
      return new Decimal(0);

    // ── Reimbursements (flat amounts) ─────────────────────────────────────────
    case 'LUMPER_REIMBURSEMENT':
    case 'SCALE_REIMBURSEMENT':
    case 'FUEL_REIMBURSEMENT':
      return calcFlat(input.rate, input.multiplier);

    // ── Deductions (category enforcement in the API will negate the result) ───
    case 'ADVANCE_REPAYMENT':
    case 'ESCROW_CONTRIBUTION':
    case 'FUEL_CARD_DEBT':
    case 'CARGO_CLAIM':
    case 'EQUIPMENT_DAMAGE':
    case 'GARNISHMENT':
    case 'CHILD_SUPPORT':
      return calcFlat(input.rate, input.multiplier);

    // ── Unknown / future types ────────────────────────────────────────────────
    default:
      return new Decimal(0);
  }
}
