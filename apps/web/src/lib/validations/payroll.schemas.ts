import { z } from 'zod';

export const payrollCreateSchema = z.object({
  driverId: z.string().uuid('Driver is required'),
  periodStart: z.string().min(1, 'Period start is required'),
  periodEnd: z.string().min(1, 'Period end is required'),
  basePay: z.coerce.number().min(0, 'Base pay must be non-negative'),
  bonuses: z.coerce.number().min(0).default(0),
  deductions: z.coerce.number().min(0).default(0),
  milesLogged: z.coerce.number().int().min(0).default(0),
  loadsCompleted: z.coerce.number().int().min(0).default(0),
  status: z.enum(['DRAFT', 'APPROVED', 'PAID']).default('DRAFT'),
  notes: z.string().max(2000).optional().or(z.literal('')),
});

export const payrollUpdateSchema = payrollCreateSchema;

export type PayrollCreate = z.infer<typeof payrollCreateSchema>;
