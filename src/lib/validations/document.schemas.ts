/**
 * Zod validation schemas for document operations.
 */

import { z } from 'zod';
import { ALLOWED_TYPES, MAX_FILE_SIZE } from '../storage/validate';

export type DocumentCategory = 'trucks' | 'routes' | 'drivers';

/**
 * Document type enum for driver documents.
 */
export const documentTypeEnum = z.enum(['DRIVER_LICENSE', 'DRIVER_APPLICATION', 'GENERAL']);

/**
 * Schema for creating a new document record.
 *
 * Business rules:
 * - A document must be associated with exactly one entity (truck OR route OR driver)
 * - If driverId is set, documentType is required
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
    driverId: z.string().uuid('Invalid driver ID').optional(),
    documentType: documentTypeEnum.optional(),
    expiryDate: z.coerce.date().optional(),
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
  })
  .refine(
    (data) => {
      const entityCount = [data.truckId, data.routeId, data.driverId].filter(Boolean).length;
      return entityCount === 1;
    },
    {
      message: 'Document must be associated with exactly one entity (truck, route, or driver)',
      path: ['truckId'],
    }
  )
  .refine(
    (data) => {
      // If driverId is set, documentType is required
      if (data.driverId && !data.documentType) {
        return false;
      }
      return true;
    },
    {
      message: 'Document type is required for driver documents',
      path: ['documentType'],
    }
  );

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;
