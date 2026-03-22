/**
 * Zod validation schemas for document operations.
 */

import { z } from 'zod';
import { ALLOWED_TYPES } from '../storage/validate';

export type DocumentCategory = 'trucks' | 'routes' | 'drivers';

/**
 * Document type enum for driver documents.
 */
export const documentTypeEnum = z.enum(['DRIVER_LICENSE', 'DRIVER_APPLICATION', 'GENERAL', 'RATE_CONFIRMATION']);

/**
 * Schema for creating a new document record.
 *
 * Business rules:
 * - A document must be associated with exactly one entity (truck OR route OR driver)
 * - If driverId is set, documentType is required
 * - Either s3Key or externalUrl must be provided
 */
export const documentCreateSchema = z
  .object({
    fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
    s3Key: z.string().optional().default(''),
    contentType: z
      .string()
      .optional()
      .default('')
      .refine(
        (type) => type === '' || Object.keys(ALLOWED_TYPES).includes(type),
        'Content type must be PDF, JPEG, or PNG'
      ),
    sizeBytes: z
      .number()
      .nonnegative()
      .optional()
      .default(0),
    truckId: z.string().uuid('Invalid truck ID').optional(),
    routeId: z.string().uuid('Invalid route ID').optional(),
    driverId: z.string().uuid('Invalid driver ID').optional(),
    loadId: z.string().uuid('Invalid load ID').optional(),
    documentType: documentTypeEnum.optional(),
    expiryDate: z.coerce.date().optional(),
    notes: z.string().max(500, 'Notes cannot exceed 500 characters').optional(),
    description: z.string().max(1000, 'Description cannot exceed 1000 characters').optional(),
    externalUrl: z.string().url('Must be a valid URL').optional(),
    documentName: z.string().min(1).max(255).optional(),
  })
  .refine(
    (data) => {
      const entityCount = [data.truckId, data.routeId, data.driverId, data.loadId].filter(Boolean).length;
      return entityCount === 1;
    },
    {
      message: 'Document must be associated with exactly one entity (truck, route, driver, or load)',
      path: ['truckId'],
    }
  )
  .refine(
    (data) => {
      // If driverId is set (and not a load doc), documentType is required
      if (data.driverId && !data.loadId && !data.documentType) {
        return false;
      }
      return true;
    },
    {
      message: 'Document type is required for driver documents',
      path: ['documentType'],
    }
  )
  .refine(
    (data) => data.s3Key || data.externalUrl,
    { message: 'Either a file or a link is required', path: ['s3Key'] }
  );

export type DocumentCreateInput = z.infer<typeof documentCreateSchema>;
