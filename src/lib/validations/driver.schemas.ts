/**
 * Zod validation schemas for Driver management
 */

import { z } from 'zod';

/**
 * Schema for inviting a new driver.
 * Permissive license number validation as different states have different formats.
 */
export const driverInviteSchema = z.object({
  email: z.string().email('Invalid email address'),
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be 50 characters or less'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be 50 characters or less'),
  licenseNumber: z
    .string()
    .min(5, 'License number too short')
    .max(20, 'License number too long')
    .regex(/^[A-Z0-9\s\-]+$/i, 'License number contains invalid characters')
    .optional()
    .or(z.literal('')),
});

/**
 * Schema for updating an existing driver.
 */
export const driverUpdateSchema = z.object({
  firstName: z
    .string()
    .min(1, 'First name is required')
    .max(50, 'First name must be 50 characters or less'),
  lastName: z
    .string()
    .min(1, 'Last name is required')
    .max(50, 'Last name must be 50 characters or less'),
  licenseNumber: z
    .string()
    .min(5, 'License number too short')
    .max(20, 'License number too long')
    .regex(/^[A-Z0-9\s\-]+$/i, 'License number contains invalid characters')
    .optional()
    .or(z.literal('')),
});

// Inferred types
export type DriverInvite = z.infer<typeof driverInviteSchema>;
export type DriverUpdate = z.infer<typeof driverUpdateSchema>;
