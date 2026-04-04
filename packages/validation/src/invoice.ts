import { z } from 'zod';

export const INVOICE_ITEM_TYPES = [
  'LINEHAUL',
  'FUEL_SURCHARGE',
  'DETENTION',
  'STOP_OFF',
  'LAYOVER',
  'TONU',
  'LUMPER',
  'ACCESSORIAL',
  'TAX',
  'OTHER',
] as const;

export const INVOICE_ITEM_UNITS = [
  'FLAT',
  'PER_MILE',
  'PER_CWT',
  'PER_PIECE',
  'PER_HOUR',
  'PERCENT',
] as const;

export type InvoiceItemType = typeof INVOICE_ITEM_TYPES[number];
export type InvoiceItemUnit = typeof INVOICE_ITEM_UNITS[number];

export const ITEM_TYPE_LABELS: Record<InvoiceItemType, string> = {
  LINEHAUL: 'Linehaul',
  FUEL_SURCHARGE: 'Fuel Surcharge',
  DETENTION: 'Detention',
  STOP_OFF: 'Stop-Off',
  LAYOVER: 'Layover',
  TONU: 'TONU',
  LUMPER: 'Lumper',
  ACCESSORIAL: 'Accessorial',
  TAX: 'Tax',
  OTHER: 'Other',
};

export const ITEM_UNIT_LABELS: Record<InvoiceItemUnit, string> = {
  FLAT: 'Flat',
  PER_MILE: 'Per Mile',
  PER_CWT: 'Per CWT',
  PER_PIECE: 'Per Piece',
  PER_HOUR: 'Per Hour',
  PERCENT: 'Percent',
};

export const invoiceItemSchema = z.object({
  description: z.string().min(1, 'Description is required').max(200),
  quantity: z.coerce.number().positive('Quantity must be positive'),
  unitPrice: z.coerce.number().min(0, 'Unit price must be non-negative'),
  itemType: z.enum(INVOICE_ITEM_TYPES).default('OTHER'),
  unitType: z.enum(INVOICE_ITEM_UNITS).default('FLAT'),
});

export const invoiceCreateSchema = z.object({
  customerId: z.string().uuid('Invalid customer').optional().or(z.literal('')),
  routeId: z.string().uuid('Invalid route').optional().or(z.literal('')),
  loadId: z.string().uuid('Invalid load').optional().or(z.literal('')),
  invoiceNumber: z.string().min(1, 'Invoice number is required').max(50),
  tax: z.coerce.number().min(0, 'Tax must be non-negative').default(0),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'OVERDUE', 'CANCELLED']).default('DRAFT'),
  issueDate: z.string().min(1, 'Issue date is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  notes: z.string().max(2000).optional().or(z.literal('')),
  bolNumber: z.string().max(100).optional().or(z.literal('')),
  proNumber: z.string().max(100).optional().or(z.literal('')),
  poNumber: z.string().max(100).optional().or(z.literal('')),
  commodity: z.string().max(200).optional().or(z.literal('')),
  weightLbs: z.coerce.number().int().positive().optional().or(z.literal('')).or(z.literal(0)),
  pieces: z.coerce.number().int().positive().optional().or(z.literal('')).or(z.literal(0)),
  loadedMiles: z.coerce.number().positive().optional().or(z.literal('')).or(z.literal(0)),
  items: z.array(invoiceItemSchema).min(1, 'At least one line item is required'),
});

export const invoiceUpdateSchema = invoiceCreateSchema;

export type InvoiceCreate = z.infer<typeof invoiceCreateSchema>;
export type InvoiceItemInput = z.infer<typeof invoiceItemSchema>;
