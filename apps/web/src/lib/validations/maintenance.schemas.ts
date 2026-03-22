/**
 * Zod validation schemas for Maintenance management
 */

import { z } from 'zod';

/**
 * Schema for creating a new maintenance event (immutable history log).
 * Enforces proper types and validates odometer, cost, and date fields.
 */
export const maintenanceEventCreateSchema = z.object({
  serviceType: z.string().min(1, 'Service type is required').max(100),
  serviceDate: z
    .string()
    .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
    .transform((val) => new Date(val)),
  odometerAtService: z.coerce
    .number()
    .int('Must be whole number')
    .min(0, 'Cannot be negative'),
  cost: z.coerce.number().min(0, 'Cannot be negative').nullable(),
  provider: z.string().max(200).nullable(),
  notes: z.string().max(1000).nullable(),
});

/**
 * Schema for creating a scheduled service (mutable future plans).
 * Enforces dual-trigger validation: at least one of intervalDays or intervalMiles must be set.
 */
export const scheduledServiceCreateSchema = z
  .object({
    serviceType: z.string().min(1, 'Service type is required').max(100),
    intervalDays: z.coerce.number().int().min(1, 'Must be at least 1 day').nullable(),
    intervalMiles: z.coerce.number().int().min(1, 'Must be at least 1 mile').nullable(),
    baselineDate: z
      .string()
      .refine((val) => !isNaN(Date.parse(val)), 'Invalid date')
      .transform((val) => new Date(val)),
    baselineOdometer: z.coerce.number().int().min(0),
    notes: z.string().max(1000).nullable(),
  })
  .refine((data) => data.intervalDays !== null || data.intervalMiles !== null, {
    message: 'At least one interval (days or miles) is required',
    path: ['intervalDays'], // Show error on intervalDays field
  });

// Inferred types
export type MaintenanceEventCreate = z.infer<typeof maintenanceEventCreateSchema>;
export type ScheduledServiceCreate = z.infer<typeof scheduledServiceCreateSchema>;
