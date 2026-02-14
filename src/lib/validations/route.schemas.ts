/**
 * Zod validation schemas for Route management
 */

import { z } from 'zod';

/**
 * Schema for creating a new route.
 * scheduledDate is validated as a non-empty string because HTML datetime-local
 * sends "YYYY-MM-DDTHH:mm" format without timezone offset (not full ISO 8601).
 * Conversion to Date happens in the server action.
 */
export const routeCreateSchema = z.object({
  origin: z.string().min(1, 'Origin is required').max(200),
  destination: z.string().min(1, 'Destination is required').max(200),
  scheduledDate: z.string().min(1, 'Scheduled date is required'),
  driverId: z.string().uuid('Invalid driver ID'),
  truckId: z.string().uuid('Invalid truck ID'),
  notes: z.string().max(1000).optional(),
});

/**
 * Schema for updating an existing route.
 * All fields are optional (partial update).
 */
export const routeUpdateSchema = routeCreateSchema.partial();

// Inferred types
export type RouteCreate = z.infer<typeof routeCreateSchema>;
export type RouteUpdate = z.infer<typeof routeUpdateSchema>;
