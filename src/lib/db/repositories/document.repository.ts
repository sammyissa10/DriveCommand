/**
 * Document Repository
 * Tenant-scoped CRUD operations for document metadata (RLS-enforced).
 */

import { TenantRepository } from './base.repository';
import { prisma } from '../prisma';

export interface DocumentCreateInput {
  tenantId: string;
  truckId?: string;
  routeId?: string;
  fileName: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
}

export class DocumentRepository extends TenantRepository {
  /**
   * Find all documents for a specific truck
   */
  async findByTruckId(truckId: string) {
    // @ts-ignore - Prisma 7 withTenantRLS extension type issue
    return prisma.document.withTenantRLS(this.tenantId).findMany({
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
    // @ts-ignore - Prisma 7 withTenantRLS extension type issue
    return prisma.document.withTenantRLS(this.tenantId).findMany({
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
    // @ts-ignore - Prisma 7 withTenantRLS extension type issue
    return prisma.document.withTenantRLS(this.tenantId).findUnique({
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
    // @ts-ignore - Prisma 7 withTenantRLS extension type issue
    return prisma.document.withTenantRLS(this.tenantId).create({
      data,
    });
  }

  /**
   * Delete a document record
   * Returns the deleted record (so caller can get s3Key for S3 cleanup)
   */
  async delete(id: string) {
    // @ts-ignore - Prisma 7 withTenantRLS extension type issue
    return prisma.document.withTenantRLS(this.tenantId).delete({
      where: { id },
    });
  }
}
