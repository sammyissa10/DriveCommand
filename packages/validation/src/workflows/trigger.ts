import { z } from 'zod';

export const enableRecipeSchema = z.object({
  recipeKey: z.string().min(1),
  playbookId: z.string().uuid(),
});
export type EnableRecipeInput = z.infer<typeof enableRecipeSchema>;

export const disableRecipeSchema = z.object({
  recipeKey: z.string().min(1),
});
export type DisableRecipeInput = z.infer<typeof disableRecipeSchema>;

export const createCustomRuleSchema = z.object({
  playbookId: z.string().uuid(),
  triggerEvent: z.enum([
    'ON_DRIVER_CREATE',
    'ON_VEHICLE_CREATE',
    'ON_DISPATCH_CREATE',
    'ON_DISPATCH_DEPART',
    'ON_DISPATCH_DELIVER',
    'ON_PARTNER_CREATE',
  ]),
  conditions: z.string().optional().default('{}'),
});
export type CreateCustomRuleInput = z.infer<typeof createCustomRuleSchema>;

export const deleteRuleSchema = z.object({
  triggerId: z.string().uuid(),
});
export type DeleteRuleInput = z.infer<typeof deleteRuleSchema>;
