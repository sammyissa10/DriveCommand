/**
 * Zod enums mirroring the Prisma enums for the Workflow Engine.
 * Values MUST match the Prisma enum values exactly.
 */
import { z } from 'zod';

export const stepTypeSchema = z.enum([
  'DOCUMENT_UPLOAD',
  'FORM_FILL',
  'INSPECTION_ITEM',
  'SIGNATURE',
  'TRAINING_ACK',
  'APPROVAL',
  'THIRD_PARTY',
  'CUSTOM_NOTE',
]);
export type StepType = z.infer<typeof stepTypeSchema>;

export const assigneeRoleSchema = z.enum([
  'DRIVER',
  'DISPATCHER',
  'MECHANIC',
  'SAFETY_MANAGER',
  'THIRD_PARTY',
]);
export type AssigneeRole = z.infer<typeof assigneeRoleSchema>;

export const playbookEntityTypeSchema = z.enum([
  'DRIVER',
  'VEHICLE',
  'PARTNER',
  'DISPATCH',
  'OTHER',
]);
export type PlaybookEntityType = z.infer<typeof playbookEntityTypeSchema>;

export const playbookCategorySchema = z.enum([
  'ONBOARDING',
  'SAFETY',
  'OPERATIONS',
  'COMPLIANCE',
  'PARTNER',
  'CUSTOM',
  'VEHICLE_INSPECTION',
]);
export type PlaybookCategory = z.infer<typeof playbookCategorySchema>;

export const phaseTypeSchema = z.enum([
  'PRE_START',
  'DAY_1',
  'WEEK_1',
  'ONGOING',
  'NONE',
]);
export type PhaseType = z.infer<typeof phaseTypeSchema>;

export const overdueRecipientSchema = z.enum(['DRIVER', 'OWNER', 'BOTH']);
export type OverdueRecipient = z.infer<typeof overdueRecipientSchema>;
