import { z } from 'zod';

export const loadDriverAssignmentCreateSchema = z.object({
  driverId: z.string().uuid(),
  driverRole: z.enum(['MAIN_DRIVER', 'CO_DRIVER']),
});

export const loadDriverAssignmentUpdateSchema = z
  .object({
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
    actualMiles: z
      .string()
      .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Must be >= 0')
      .refine((v) => {
        const parts = v.split('.');
        return !parts[1] || parts[1].length <= 4;
      }, 'Maximum 4 decimal places')
      .nullable()
      .optional(),
    mileageSource: z
      .enum(['PCMILER', 'GOOGLE', 'ELD', 'MANUAL', 'RAND_MCNALLY'])
      .nullable()
      .optional(),
    overrideReason: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    const hasActual = data.actualMiles != null && data.actualMiles !== '';
    const hasSource = data.mileageSource != null;
    if (hasActual && !hasSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['mileageSource'],
        message: 'Mileage source is required when actual miles is set.',
      });
    }
    if (hasSource && !hasActual) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['actualMiles'],
        message: 'Actual miles is required when mileage source is set.',
      });
    }
  });

export type LoadDriverAssignmentCreateInput = z.infer<typeof loadDriverAssignmentCreateSchema>;
export type LoadDriverAssignmentUpdateInput = z.infer<typeof loadDriverAssignmentUpdateSchema>;
