import { z } from 'zod';

export const loadCreateSchema = z.object({
  customerId: z.string().uuid('Select a customer'),
  origin: z.string().min(1, 'Origin is required').max(200),
  destination: z.string().min(1, 'Destination is required').max(200),
  pickupDate: z.string().min(1, 'Pickup date is required'),
  deliveryDate: z.string().optional().or(z.literal('')),
  weight: z.coerce.number().int().positive().optional().or(z.literal(0)),
  commodity: z.string().max(100).optional().or(z.literal('')),
  rate: z.coerce.number().positive('Rate must be positive'),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const loadUpdateSchema = loadCreateSchema;

export const dispatchLoadSchema = z.object({
  driverId: z.string().uuid('Select a driver'),
  truckId: z.string().uuid('Select a truck'),
});

export type LoadCreate = z.infer<typeof loadCreateSchema>;
export type LoadUpdate = z.infer<typeof loadUpdateSchema>;
export type DispatchLoad = z.infer<typeof dispatchLoadSchema>;
