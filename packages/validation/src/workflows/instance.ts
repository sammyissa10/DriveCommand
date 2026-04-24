import { z } from 'zod';
import { playbookEntityTypeSchema } from './enums';

// Schema for instance.generate — creates a new Active Checklist from a Playbook
export const generateInstanceSchema = z.object({
  playbookId: z.string().uuid(),
  entityType: playbookEntityTypeSchema,
  entityId: z.string().uuid(),
});

// Schema for instance.list — paginated list with optional filters
export const listInstancesSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).optional(),
  entityType: playbookEntityTypeSchema.optional(),
  entityId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  take: z.number().int().min(1).max(100).default(20),
});

// Schema for instance.get — single instance by ID
export const getInstanceSchema = z.object({
  id: z.string().uuid(),
});

// Schema for instance.getForEntity — all instances for one entity
export const getForEntitySchema = z.object({
  entityType: playbookEntityTypeSchema,
  entityId: z.string().uuid(),
});

// Schema for instance.computeReadiness — recompute dispatch readiness for an instance
export const computeReadinessSchema = z.object({
  instanceId: z.string().uuid(),
});

export type GenerateInstanceInput = z.infer<typeof generateInstanceSchema>;
export type ListInstancesInput = z.infer<typeof listInstancesSchema>;
export type GetInstanceInput = z.infer<typeof getInstanceSchema>;
export type GetForEntityInput = z.infer<typeof getForEntitySchema>;
export type ComputeReadinessInput = z.infer<typeof computeReadinessSchema>;
