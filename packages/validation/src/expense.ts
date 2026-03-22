/**
 * Zod validation schemas for expense management
 */

import { z } from 'zod';

/**
 * Schema for creating a new expense.
 * amount is coerced to number and validated for positive value, finite, and max 2 decimal places.
 */
export const expenseCreateSchema = z.object({
  routeId: z.string().uuid('Invalid route ID'),
  categoryId: z.string().uuid('Invalid category'),
  amount: z.coerce
    .number()
    .positive('Amount must be positive')
    .finite('Amount must be finite')
    .multipleOf(0.01, 'Amount must have at most 2 decimal places')
    .max(999999.99, 'Amount cannot exceed $999,999.99'),
  description: z.string().min(1, 'Description is required').max(200),
  notes: z.string().max(1000).optional(),
});

/**
 * Schema for updating an existing expense.
 * All fields except routeId are optional (partial update).
 */
export const expenseUpdateSchema = expenseCreateSchema.omit({ routeId: true }).partial();

// Inferred types
export type ExpenseCreate = z.infer<typeof expenseCreateSchema>;
export type ExpenseUpdate = z.infer<typeof expenseUpdateSchema>;
