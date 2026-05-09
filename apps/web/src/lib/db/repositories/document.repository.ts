/**
 * Document Repository
 * Tenant-scoped CRUD operations for document metadata (RLS-enforced).
 */

import { DocumentType } from '@/generated/prisma';
import { TenantRepository } from './base.repository';

export interface DocumentCreateInput {
  tenantId: string;
  truckId?: string;
  routeId?: string;
  driverId?: string;
  loadId?: string;
  fileName: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  documentType?: DocumentType;
  expiryDate?: Date;
  notes?: string;
  description?: string;
  externalUrl?: string;
}

export class DocumentRepository extends TenantRepository {
  /**
   * Find all documents for a specific truck
   */
  async findByTruckId(truckId: string) {
    return this.db.document.findMany({
      where: { truckId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Find all documents for a specific route
   */
  async findByRouteId(routeId: string) {
    return this.db.document.findMany({
      where: { routeId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Find a single document by ID
   * Returns null if not found or wrong tenant (RLS)
   */
  async findById(id: string) {
    return this.db.document.findUnique({
      where: { id },
      include: {
        uploader: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Create a new document record
   */
  async create(data: DocumentCreateInput) {
    return this.db.document.create({
      data,
    });
  }

  /**
   * Find all documents for a specific driver
   */
  async findByDriverId(driverId: string) {
    return this.db.document.findMany({
      where: { driverId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Find all documents for a specific load
   */
  async findByLoadId(loadId: string) {
    return this.db.document.findMany({
      where: { loadId },
      orderBy: { createdAt: 'desc' },
      include: {
        uploader: {
          select: {
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Update document metadata (expiry date, notes, document type)
   */
  async update(id: string, data: { expiryDate?: Date; notes?: string; documentType?: DocumentType }) {
    return this.db.document.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a document record
   * Returns the deleted record (so caller can get s3Key for S3 cleanup)
   */
  async delete(id: string) {
    return this.db.document.delete({
      where: { id },
    });
  }
}
