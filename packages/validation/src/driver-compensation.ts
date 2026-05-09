import { z } from 'zod';

export const payTypeSchema = z.enum([
  'CPM',
  'HOURLY',
  'FLAT_PER_LOAD',
  'PERCENTAGE',
  'DAILY',
  'SALARY',
]);

export const rateUnitSchema = z.enum([
  'PER_MILE',
  'PER_HOUR',
  'PER_LOAD',
  'PER_DAY',
  'PERCENTAGE',
  'ANNUAL',
]);

export const employmentTypeSchema = z.enum([
  'W2_EMPLOYEE',
  'OWNER_OPERATOR_1099',
  'LEASE_OPERATOR',
]);

export const driverCompensationTemplateCreateSchema = z
  .object({
    employmentType: employmentTypeSchema,
    payType: payTypeSchema,
    baseRate: z
      .string()
      .refine((v) => !isNaN(Number(v)) && Number(v) > 0, 'Base rate must be greater than 0'),
    rateUnit: rateUnitSchema,
    loadedMilesOnly: z.boolean().optional().default(false),
    fuelSurchargeRate: z.string().optional().nullable(),
    perDiemEnabled: z.boolean().optional().default(false),
    perDiemRate: z.string().optional().nullable(),
    overtimeEligible: z.boolean().optional().default(false),
    overtimeThresholdHours: z.string().optional().nullable(),
    overtimeMultiplier: z.string().optional().nullable(),
    dailyOvertimeThreshold: z.string().optional().nullable(),
    weeklyEarningGoal: z.string().optional().nullable(),
    currency: z.string().default('USD'),
    effectiveFrom: z
      .string()
      .refine((v) => !isNaN(Date.parse(v)), 'Invalid date — effectiveFrom must be a valid date string'),
    notes: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    // Percentage cap: base rate must be <= 1 (i.e. 80% = 0.80)
    if (data.payType === 'PERCENTAGE' && Number(data.baseRate) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Percentage rate must be between 0 and 1 (e.g. 0.80 for 80%)',
        path: ['baseRate'],
      });
    }

    // Overtime details required when overtimeEligible is true
    if (data.overtimeEligible === true) {
      if (!data.overtimeThresholdHours || isNaN(Number(data.overtimeThresholdHours))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Overtime threshold hours is required when overtime is enabled',
          path: ['overtimeThresholdHours'],
        });
      }
      if (!data.overtimeMultiplier || isNaN(Number(data.overtimeMultiplier))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Overtime multiplier is required when overtime is enabled',
          path: ['overtimeMultiplier'],
        });
      }
    }

    // Per diem rate required when perDiemEnabled is true
    if (data.perDiemEnabled === true) {
      if (!data.perDiemRate || isNaN(Number(data.perDiemRate))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Per diem rate is required when per diem is enabled',
          path: ['perDiemRate'],
        });
      }
    }
  });

export type DriverCompensationTemplateCreateInput = z.infer<
  typeof driverCompensationTemplateCreateSchema
>;
