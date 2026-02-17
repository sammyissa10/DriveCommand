/**
 * Document Repository
 * Tenant-scoped CRUD operations for document metadata (RLS-enforced).
 */

import { TenantRepository } from './base.repository';

export interface DocumentCreateInput {
  tenantId: string;
  truckId?: string;
  routeId?: string;
  driverId?: string;
  fileName: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  documentType?: string;
  expiryDate?: Date;
  notes?: string;
}

export class DocumentRepository extends TenantRepository {
  /**
   * Find all documents for a specific truck
   */
  async findByTruckId(truckId: string) {
    // @ts-ignore - Extended Prisma client type inference issue
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
    // @ts-ignore - Extended Prisma client type inference issue
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
    // @ts-ignore - Extended Prisma client type inference issue
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
    // @ts-ignore - Extended Prisma client type inference issue
    return this.db.document.create({
      data,
    });
  }

  /**
   * Find all documents for a specific driver
   */
  async findByDriverId(driverId: string) {
    // @ts-ignore - Extended Prisma client type inference issue
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
   * Update document metadata (expiry date, notes, document type)
   */
  async update(id: string, data: { expiryDate?: Date; notes?: string; documentType?: string }) {
    // @ts-ignore - Extended Prisma client type inference issue
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
    // @ts-ignore - Extended Prisma client type inference issue
    return this.db.document.delete({
      where: { id },
    });
  }
}
