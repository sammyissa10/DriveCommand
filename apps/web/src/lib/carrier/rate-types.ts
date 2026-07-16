/**
 * Single source of truth for carrier load/contract rate types.
 *
 * Every layer that validates a rateType must read from this tuple — the PATCH
 * `loads/[id]/route.ts` schema drifted to 6 values while POST `loads/route.ts`
 * and `contracts/route.ts` carried all 8, which made `per_load` / `per_hour`
 * loads unsaveable on edit. One shared const closes that gap for good.
 *
 * Order matches the existing POST/contracts lists so this reads as additive,
 * not a reorder.
 */
export const RATE_TYPES = [
  'per_mile',
  'per_load',
  'per_hour',
  'per_stop',
  'flat',
  'per_cwt',
  'per_pallet',
  'hourly',
] as const;

export type RateType = (typeof RATE_TYPES)[number];
