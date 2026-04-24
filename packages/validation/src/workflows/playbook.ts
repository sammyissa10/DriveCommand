import { z } from 'zod';
import { playbookEntityTypeSchema, playbookCategorySchema, phaseTypeSchema } from './enums';

export const createPlaybookSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  description: z.string().max(2000).optional().nullable(),
  entityType: playbookEntityTypeSchema,
  category: playbookCategorySchema,
  playbookPhase: phaseTypeSchema.optional().default('NONE'),
});

export const updatePlaybookSchema = createPlaybookSchema.partial().extend({
  id: z.string().uuid('Invalid playbook id'),
});

/**
 * Add a single StepTemplate to a Playbook.
 * Sequence is optional — service computes "last sequence + 1" when omitted.
 */
export const addStepSchema = z.object({
  playbookId: z.string().uuid(),
  stepTemplateId: z.string().uuid(),
  playbookPhase: phaseTypeSchema.optional().default('NONE'),
  sequence: z.number().int().nonnegative().optional(),
  overrideConfig: z.record(z.string(), z.any()).optional().default({}),
});

export const removeStepSchema = z.object({
  playbookId: z.string().uuid(),
  stepId: z.string().uuid(),
});

/**
 * Update a single PlaybookStep's configuration (overrideConfig) and/or its phase assignment.
 * Consumed by the workflows.playbook.updateStep tRPC procedure (see Plan 04) — the builder's
 * StepDetailEditor (Plan 06) sends this payload when the user clicks Save.
 *
 * overrideConfig is freeform JSON (shape depends on the underlying StepTemplate.stepType —
 * validated at the editor component level, not at the Zod boundary).
 *
 * playbookPhase is optional — only sent if the step's phase is being changed via the editor.
 * Sequence changes go through reorderStepsSchema, NOT this one.
 */
export const updatePlaybookStepSchema = z.object({
  playbookId: z.string().uuid(),
  stepId: z.string().uuid(),
  overrideConfig: z.record(z.string(), z.any()),
  playbookPhase: phaseTypeSchema.optional(),
});

/**
 * Reorder all steps in a Playbook. Client sends the complete, final ordered list.
 * Each entry includes which phase section it belongs to and its new sequence within the playbook.
 */
export const reorderStepsSchema = z.object({
  playbookId: z.string().uuid(),
  steps: z.array(z.object({
    stepId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    playbookPhase: phaseTypeSchema,
  })).min(1, 'At least one step required'),
});

export type CreatePlaybookInput = z.infer<typeof createPlaybookSchema>;
export type UpdatePlaybookInput = z.infer<typeof updatePlaybookSchema>;
export type AddStepInput = z.infer<typeof addStepSchema>;
export type RemoveStepInput = z.infer<typeof removeStepSchema>;
export type UpdatePlaybookStepInput = z.infer<typeof updatePlaybookStepSchema>;
export type ReorderStepsInput = z.infer<typeof reorderStepsSchema>;
