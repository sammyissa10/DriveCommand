import { z } from 'zod';

export const FleetSizeBucketEnum = z.enum(['OWNER_OPERATOR', 'SMALL', 'MEDIUM', 'LARGE']);
export type FleetSizeBucket = z.infer<typeof FleetSizeBucketEnum>;

/**
 * Map an exact truck count to the existing segmentation band. Boundaries match
 * the original banded dropdown (1–3 / 4–15 / 16–50 / 50+), inclusive of the
 * upper bound (e.g. 50 → MEDIUM, 51 → LARGE). Server-side source of truth so the
 * stored `fleetSizeBucket` stays consistent with everything that reads it.
 */
export function deriveFleetSizeBucket(truckCount: number): FleetSizeBucket {
  if (truckCount <= 3) return 'OWNER_OPERATOR';
  if (truckCount <= 15) return 'SMALL';
  if (truckCount <= 50) return 'MEDIUM';
  return 'LARGE';
}

export const signUpSchema = z.object({
  firstName:       z.string().min(1, 'First name is required').max(50),
  lastName:        z.string().min(1, 'Last name is required').max(50),
  email:           z.string().email('Invalid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters').max(128),
  companyName:     z.string().min(2, 'Company name is required').max(100),
  // Exact number of trucks entered at signup (coerced from the form string).
  truckCount:      z.coerce
                     .number()
                     .int('Enter a whole number')
                     .min(1, 'Enter at least 1 truck')
                     .max(100000, 'That seems too high — please check the number'),
  // Derived server-side from truckCount before validation; kept so downstream
  // consumers (Tenant.fleetSizeBucket, admin, hydrate/seed) are unchanged.
  fleetSizeBucket: FleetSizeBucketEnum,
  promoCode:       z.string().optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
