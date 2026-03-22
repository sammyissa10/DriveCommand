import { z } from 'zod';

export const categoryCreateSchema = z.object({
  name: z.string().min(1, 'Category name is required').max(50, 'Category name too long'),
});

export type CategoryCreate = z.infer<typeof categoryCreateSchema>;
