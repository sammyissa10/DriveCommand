import { z } from 'zod';

export const customerCreateSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(200),
  contactName: z.string().max(100).optional().or(z.literal('')),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().max(20).optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
  city: z.string().max(100).optional().or(z.literal('')),
  state: z.string().max(50).optional().or(z.literal('')),
  zipCode: z.string().max(20).optional().or(z.literal('')),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VIP']).default('MEDIUM'),
  status: z.enum(['ACTIVE', 'INACTIVE', 'PROSPECT']).default('ACTIVE'),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const interactionCreateSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  type: z.enum(['EMAIL', 'PHONE', 'MEETING', 'NOTE', 'LOAD_UPDATE', 'ETA_NOTIFICATION']),
  subject: z.string().min(1, 'Subject is required').max(200),
  description: z.string().max(5000).optional().or(z.literal('')),
});

export type CustomerCreate = z.infer<typeof customerCreateSchema>;
export type CustomerUpdate = z.infer<typeof customerUpdateSchema>;
export type InteractionCreate = z.infer<typeof interactionCreateSchema>;
