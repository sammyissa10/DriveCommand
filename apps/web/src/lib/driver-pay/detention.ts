import Decimal from 'decimal.js';

export type DetentionInput = {
  arrivedAt: Date;
  departedAt: Date;
  freeTimeMinutes: number;  // default 120
  detentionRate: Decimal;   // from driver template or org default $25/hr
};

export type DetentionSuggestion = {
  detentionHours: Decimal;  // rounded to 2 decimal places
  detentionRate: Decimal;
  grossAmount: Decimal;     // detentionHours × detentionRate
} | null;

/**
 * Returns a DetentionSuggestion when the stop has earned billable detention,
 * or null when elapsed time is within the free-time window.
 *
 * Note: does NOT delegate to calcDetention so it can return null cleanly —
 * this avoids the ambiguity between "no detention" and "$0.00 detention at
 * zero rate" that a Decimal result cannot express.
 */
export function suggestDetention(input: DetentionInput): DetentionSuggestion {
  const elapsedHours = new Decimal(
    input.departedAt.getTime() - input.arrivedAt.getTime(),
  ).div(new Decimal(3600000));

  const freeHours = new Decimal(input.freeTimeMinutes).div(new Decimal(60));

  const billableHours = Decimal.max(
    new Decimal(0),
    elapsedHours.minus(freeHours),
  ).toDecimalPlaces(2);

  if (billableHours.lte(new Decimal(0))) {
    return null;
  }

  const grossAmount = billableHours.mul(input.detentionRate);

  return {
    detentionHours: billableHours,
    detentionRate: input.detentionRate,
    grossAmount,
  };
}
