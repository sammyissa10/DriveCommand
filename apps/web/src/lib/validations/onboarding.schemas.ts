import { z } from 'zod';

export const FleetSizeBucketEnum = z.enum(['OWNER_OPERATOR', 'SMALL', 'MEDIUM', 'LARGE']);
export type FleetSizeBucket = z.infer<typeof FleetSizeBucketEnum>;

export const signUpSchema = z.object({
  firstName:       z.string().min(1, 'First name is required').max(50),
  lastName:        z.string().min(1, 'Last name is required').max(50),
  email:           z.string().email('Invalid email address'),
  password:        z.string().min(8, 'Password must be at least 8 characters').max(128),
  companyName:     z.string().min(2, 'Company name is required').max(100),
  fleetSizeBucket: FleetSizeBucketEnum,
  promoCode:       z.string().optional(),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
