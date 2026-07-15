/**
 * Client-safe revenue preview for load forms.
 *
 * `revenue-calculator.ts` is the server-side source of truth, but it imports
 * prisma and so can't be pulled into a client component. This module holds the
 * same arithmetic with no server dependencies, so every client surface (desktop
 * `LoadFinancials`, the mobile-web ds card) shares ONE copy rather than each
 * re-implementing it and drifting apart.
 *
 * If the server calculator changes, change this too — they are intentional twins.
 */

export interface RevenuePreviewInput {
  rateType?: string;
  rateAmount?: number;
  weightLbs?: number;
  pallets?: number;
  otherCharges?: number;
  fuelSurchargeMethod?: string;
  fuelSurchargeRate?: number;
  brokerFlag?: boolean;
  carrierCost?: number;
  plannedMiles?: number;
  deliveryStopCount?: number;
}

export interface RevenuePreview {
  baseRevenue: number;
  /** Why the base is what it is (e.g. "(enter planned miles)"). */
  baseNote: string | null;
  fuelSurcharge: number;
  fscNote: string | null;
  other: number;
  totalRevenue: number;
  /** Broker loads only — null otherwise. */
  grossMargin: number | null;
}

export function calculateRevenuePreview(input: RevenuePreviewInput): RevenuePreview {
  const {
    rateType = 'flat',
    rateAmount = 0,
    weightLbs = 0,
    pallets = 0,
    otherCharges = 0,
    fuelSurchargeMethod = 'none',
    fuelSurchargeRate = 0,
    brokerFlag = false,
    carrierCost = 0,
  } = input;

  const amount = Number(rateAmount) || 0;
  const weight = Number(weightLbs) || 0;
  const pals = Number(pallets) || 0;

  let baseRevenue = 0;
  let baseNote: string | null = null;

  switch (rateType) {
    case 'flat':
      baseRevenue = amount;
      break;
    case 'per_cwt':
      baseRevenue = amount * (weight / 100);
      break;
    case 'per_pallet':
      baseRevenue = amount * pals;
      break;
    case 'hourly':
      baseRevenue = amount * 8; // hardcoded default 8 hours
      baseNote = '(8 hr default)';
      break;
    case 'per_mile': {
      const miles = Number(input.plannedMiles) || 0;
      baseRevenue = amount * miles;
      if (miles === 0) baseNote = '(enter planned miles)';
      break;
    }
    case 'per_stop': {
      const stopCount = Number(input.deliveryStopCount) || 0;
      baseRevenue = amount * stopCount;
      if (stopCount === 0) baseNote = '(add delivery stops)';
      break;
    }
    default:
      baseRevenue = amount;
  }

  let fuelSurcharge = 0;
  let fscNote: string | null = null;
  const fscRate = Number(fuelSurchargeRate) || 0;

  if (fuelSurchargeMethod && fuelSurchargeMethod !== 'none') {
    if (fuelSurchargeMethod === 'percent_of_linehaul') {
      fuelSurcharge = baseRevenue * fscRate;
    } else if (fuelSurchargeMethod === 'per_mile') {
      const miles = Number(input.plannedMiles) || 0;
      fuelSurcharge = miles * fscRate;
      if (miles === 0) fscNote = 'per-mile FSC (enter planned miles)';
    }
  }

  const other = Number(otherCharges) || 0;
  const totalRevenue = baseRevenue + fuelSurcharge + other;

  let grossMargin: number | null = null;
  if (brokerFlag) grossMargin = totalRevenue - (Number(carrierCost) || 0);

  return { baseRevenue, baseNote, fuelSurcharge, fscNote, other, totalRevenue, grossMargin };
}
