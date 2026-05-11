import { z } from 'zod';

export const loadDriverAssignmentCreateSchema = z.object({
  driverId: z.string().uuid(),
  driverRole: z.enum(['MAIN_DRIVER', 'CO_DRIVER']),
});

export const loadDriverAssignmentUpdateSchema = z.object({
  payType: z
    .enum(['CPM', 'HOURLY', 'FLAT_PER_LOAD', 'PERCENTAGE', 'DAILY', 'SALARY'])
    .optional(),
  baseRate: z
    .string()
    .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Must be >= 0')
    .optional(),
  rateUnit: z
    .enum(['PER_MILE', 'PER_HOUR', 'PER_LOAD', 'PERCENTAGE', 'PER_DAY', 'ANNUAL'])
    .optional(),
  loadedMilesOnly: z.boolean().optional(),
  fuelSurchargeRate: z.string().nullable().optional(),
  perDiemEnabled: z.boolean().optional(),
  perDiemRate: z.string().nullable().optional(),
  estimatedMiles: z.string().nullable().optional(),
  overrideReason: z.string().optional(),
});

export type LoadDriverAssignmentCreateInput = z.infer<typeof loadDriverAssignmentCreateSchema>;
export type LoadDriverAssignmentUpdateInput = z.infer<typeof loadDriverAssignmentUpdateSchema>;
