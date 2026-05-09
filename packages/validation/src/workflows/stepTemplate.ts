import { z } from 'zod';
import { stepTypeSchema, assigneeRoleSchema } from './enums';

/**
 * Schema for creating a StepTemplate.
 * defaultConfig is freeform JSON (shape depends on stepType — validated in the service layer, not here).
 */
export const createStepTemplateSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  stepType: stepTypeSchema,
  assigneeRole: assigneeRoleSchema,
  defaultConfig: z.record(z.string(), z.any()).optional().default({}),
});

export const updateStepTemplateSchema = createStepTemplateSchema.partial().extend({
  id: z.string().uuid('Invalid step template id'),
});

export type CreateStepTemplateInput = z.infer<typeof createStepTemplateSchema>;
export type UpdateStepTemplateInput = z.infer<typeof updateStepTemplateSchema>;
