/**
 * Zod validation schemas for document operations.
 */

import { z } from 'zod';
import { ALLOWED_TYPES, MAX_FILE_SIZE } from '../storage/validate';

export type DocumentCategory = 'trucks' | 'routes';

/**
 * Schema for creating a new document record.
 *
 * Business rule: A document must be associated with exactly one entity (truck OR route).
 */
export const documentCreateSchema = z
  .object({
    fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
    s3Key: z.string().min(1, 'S3 key is required'),
    contentType: z
      .string()
      .refine(
        (type) => Object.keys(ALLOWED_TYPES).includes(type),
        'Content type must be PDF, JPEG, or PNG'
      ),
    sizeBytes: z
      .number()
      .positive('File size must be positive')
      .max(MAX_FILE_SIZE, `File size cannot exceed ${MAX_FILE_SIZE / (1024 * 1024)}MB`),
    truckId: z.string().uuid('Invalid truck ID').optional(),
    routeId: z.string().uuid('Invalid route ID').optional(),
  })
  .refine((data) => Boolean(data.truckId) !== Boolean(data.routeId), {
    message: 'Document must be associated with exactly one entity (truck or route)',
    path: ['truckId'],
  });

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;
