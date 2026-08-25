import { z } from 'zod';

// Result payload — type-specific fields, all optional at schema level;
// service layer enforces type-specific requirements (see completeStep.ts)
export const stepResultSchema = z.object({
  // DOCUMENT_UPLOAD
  fileUrls: z.array(z.string()).optional(),
  // SIGNATURE
  signatureUrl: z.string().optional(),
  // SIGNATURE — who signed and when.
  //
  // Added in Phase 9-web. Mobile's TripInspectionScreen has posted both since
  // Phase 9 (`signedByName`, `signedAt`), but they were absent from this schema,
  // so they travelled as untyped extras that `z.object` would have stripped had
  // anything parsed the payload. Section 12 requires the driver's name and a
  // timestamp beneath the signature, which makes them part of the record rather
  // than decoration — a DVIR without them is not one.
  //
  // `signedAt` is an ISO 8601 instant, not a date-only value: it is the moment
  // the driver signed, so `toLocaleDateString`-family rendering is correct here
  // and the quick-541 date-only helpers would be the inverse bug.
  signedByName: z.string().optional(),
  signedAt: z.string().optional(),
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

// Schema for stepInstance.fail (inspection fail capture)
export const failInspectionItemSchema = z.object({
  stepInstanceId: z.string().uuid(),
  result: z.object({
    photoUrls: z.array(z.string()).default([]),
    note: z.string().max(1000).optional(),
  }),
});

export type FailInspectionItemInput = z.infer<typeof failInspectionItemSchema>;

// Schema for stepInstance.approve (mechanic sign-off)
export const approveStepSchema = z.object({
  stepInstanceId: z.string().uuid(),
  note: z.string().max(1000).optional(),
});

export type ApproveStepInput = z.infer<typeof approveStepSchema>;
