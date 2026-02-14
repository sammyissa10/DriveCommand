/**
 * Zod validation schemas for Truck management
 */

import { z } from 'zod';

/**
 * Document metadata schema for registration and insurance information.
 * Stored as JSONB in the database.
 */
export const documentMetadataSchema = z
  .object({
    registrationNumber: z.string().optional(),
    registrationExpiry: z.string().optional(), // ISO date string
    insuranceNumber: z.string().optional(),
    insuranceExpiry: z.string().optional(), // ISO date string
  })
  .strict();

/**
 * Schema for creating a new truck.
 * Enforces domain rules: VIN format (17 chars, no I/O/Q), odometer whole numbers, permissive license plate.
 */
export const truckCreateSchema = z.object({
  make: z.string().min(1, 'Make is required').max(100, 'Make must be 100 characters or less'),
  model: z.string().min(1, 'Model is required').max(100, 'Model must be 100 characters or less'),
  year: z
    .number()
    .int('Year must be a whole number')
    .min(1900, 'Year must be 1900 or later')
    .max(new Date().getFullYear() + 1, `Year cannot be more than ${new Date().getFullYear() + 1}`),
  vin: z
    .string()
    .length(17, 'VIN must be exactly 17 characters')
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN contains invalid characters (no I, O, or Q allowed)')
    .transform((val) => val.toUpperCase()),
  licensePlate: z
    .string()
    .min(1, 'License plate is required')
    .max(20, 'License plate must be 20 characters or less')
    .regex(/^[A-Z0-9\s\-]+$/i, 'License plate can only contain letters, numbers, spaces, and hyphens'),
  odometer: z
    .number()
    .int('Odometer must be a whole number')
    .min(0, 'Odometer cannot be negative'),
  documentMetadata: documentMetadataSchema.optional(),
});

/**
 * Schema for updating an existing truck.
 * All fields are optional (partial update).
 */
export const truckUpdateSchema = truckCreateSchema.partial();

// Inferred types
export type TruckCreate = z.infer<typeof truckCreateSchema>;
export type TruckUpdate = z.infer<typeof truckUpdateSchema>;
export type DocumentMetadata = z.infer<typeof documentMetadataSchema>;
