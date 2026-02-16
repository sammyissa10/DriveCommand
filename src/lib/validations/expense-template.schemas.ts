import { z } from 'zod';

const templateItemSchema = z.object({
  categoryId: z.string().uuid('Invalid category'),
  amount: z.coerce
    .number()
    .positive('Amount must be positive')
    .multipleOf(0.01)
    .max(999999.99),
  description: z.string().min(1).max(200),
});

export const templateCreateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(100),
  items: z.array(templateItemSchema).min(1, 'Template must have at least one item'),
});

export const templateUpdateSchema = templateCreateSchema.partial();

export type TemplateCreate = z.infer<typeof templateCreateSchema>;
export type TemplateUpdate = z.infer<typeof templateUpdateSchema>;
