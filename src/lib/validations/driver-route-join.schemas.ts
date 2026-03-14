import { z } from 'zod';

export const driverRouteJoinCreateSchema = z
  .object({
    routeId: z.string().uuid(),
    driverId: z.string().uuid(),
    isMainDriver: z.boolean().default(false),
    paymentMethod: z.enum(['FIXED_AMOUNT', 'HOURLY', 'PER_MILE']),
    fixedAmount: z.string().optional(),
    hourlyRate: z.string().optional(),
    numberOfHours: z.string().optional(),
    perMileRate: z.string().optional(),
    numberOfMiles: z.string().optional(),
  })
  .superRefine((val, ctx) => {
    if (val.paymentMethod === 'FIXED_AMOUNT' && !val.fixedAmount) {
      ctx.addIssue({
        code: 'custom',
        path: ['fixedAmount'],
        message: 'Fixed amount is required',
      });
    }
    if (val.paymentMethod === 'HOURLY' && (!val.hourlyRate || !val.numberOfHours)) {
      ctx.addIssue({
        code: 'custom',
        path: ['hourlyRate'],
        message: 'Hourly rate and number of hours are required',
      });
    }
    if (val.paymentMethod === 'PER_MILE' && (!val.perMileRate || !val.numberOfMiles)) {
      ctx.addIssue({
        code: 'custom',
        path: ['perMileRate'],
        message: 'Per-mile rate and number of miles are required',
      });
    }
  });

export const driverRouteJoinUpdateSchema = driverRouteJoinCreateSchema
  .partial()
  .omit({ routeId: true, driverId: true });

export type DriverRouteJoinCreate = z.infer<typeof driverRouteJoinCreateSchema>;
export type DriverRouteJoinUpdate = z.infer<typeof driverRouteJoinUpdateSchema>;
