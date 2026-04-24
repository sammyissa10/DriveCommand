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
