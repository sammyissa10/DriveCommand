import { z } from 'zod';

export const paymentCreateSchema = z.object({
  routeId: z.string().uuid('Invalid route ID'),
  amount: z.coerce
    .number()
    .positive('Payment must be positive')
    .finite('Payment must be finite')
    .multipleOf(0.01, 'Payment must have at most 2 decimal places')
    .max(9999999.99, 'Payment cannot exceed $9,999,999.99'),
  status: z.enum(['PENDING', 'PAID']),
  paidAt: z.string().min(1).optional(), // ISO datetime string from input
  notes: z.string().max(1000).optional(),
});

export const paymentUpdateSchema = paymentCreateSchema
  .omit({ routeId: true })
  .partial();

export type PaymentCreate = z.infer<typeof paymentCreateSchema>;
export type PaymentUpdate = z.infer<typeof paymentUpdateSchema>;
