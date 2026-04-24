import { z } from 'zod';

// Result payload — type-specific fields, all optional at schema level;
// service layer enforces type-specific requirements (see completeStep.ts)
export const stepResultSchema = z.object({
  // DOCUMENT_UPLOAD
  fileUrls: z.array(z.string()).optional(),
  // SIGNATURE
  signatureUrl: z.string().optional(),
  // FORM_FILL
  formData: z.record(z.string(), z.unknown()).optional(),
  // INSPECTION_ITEM
  passOrFail: z.enum(['pass', 'fail']).optional(),
  // TRAINING_ACK
  acknowledged: z.boolean().optional(),
  // CUSTOM_NOTE / THIRD_PARTY
  note: z.string().optional(),
  // Shared optional fields
  photoUrls: z.array(z.string()).optional(),
});

// Schema for stepInstance.complete
export const completeStepSchema = z.object({
  stepInstanceId: z.string().uuid(),
  result: stepResultSchema,
});

// Schema for stepInstance.skip
export const skipStepSchema = z.object({
  stepInstanceId: z.string().uuid(),
  reason: z.string().min(1, 'Skip reason is required'),
});

// Schema for stepInstance.getForDriver (mobile My Tasks feed)
export const getForDriverSchema = z.object({
  cursor: z.string().uuid().optional(),
  take: z.number().int().min(1).max(50).default(20),
});

export type StepResult = z.infer<typeof stepResultSchema>;
export type CompleteStepInput = z.infer<typeof completeStepSchema>;
export type SkipStepInput = z.infer<typeof skipStepSchema>;
export type GetForDriverInput = z.infer<typeof getForDriverSchema>;
