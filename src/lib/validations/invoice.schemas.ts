import { z } from 'zod';

export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(200),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be non-negative'),
});

export const invoiceCreateSchema = z.object({
  customerId: z.string().uuid('Invalid customer').optional().or(z.literal('')),
  routeId: z.string().uuid('Invalid route').optional().or(z.literal('')),
  invoiceNumber: z.string().min(1, 'Invoice number is required').max(50),
  tax: z.coerce.number().min(0, 'Tax must be non-negative').default(0),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).default('DRAFT'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().max(2000).optional().or(z.literal('')),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item is required'),
});

export const invoiceUpdateSchema = invoiceCreateSchema;

export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
