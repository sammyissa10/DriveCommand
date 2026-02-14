/**
 * DocumentRepository provides tenant-scoped CRUD operations for documents.
 * All queries are automatically filtered by RLS to the current tenant.
 */

import { TenantRepository } from './base.repository';
import type { Prisma } from '@/generated/prisma/client';

export class DocumentRepository extends TenantRepository {
  /**
   * Find all documents for a truck within the current tenant.
   * Returns documents ordered by creation date (newest first).
   */
  async findByTruckId(truckId: string) {
    // @ts-ignore - Extended Prisma client type inference issue
    return this.db.document.findMany({
      where: { truckId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find all documents for a route within the current tenant.
   * Returns documents ordered by creation date (newest first).
   */
  async findByRouteId(routeId: string) {
    // @ts-ignore - Extended Prisma client type inference issue
    return this.db.document.findMany({
      where: { routeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find a document by ID within the current tenant.
   * Returns null if not found or belongs to different tenant (RLS).
   */
  async findById(id: string) {
    // @ts-ignore - Extended Prisma client type inference issue
    return this.db.document.findUnique({
      where: { id },
    });
  }

  /**
   * Create a new document for the current tenant.
   */
  async create(data: Prisma.DocumentCreateInput) {
    // @ts-ignore - Extended Prisma client type inference issue
    return this.db.document.create({
      data,
    });
  }

  /**
   * Delete a document by ID within the current tenant.
   * RLS ensures only documents in the current tenant can be deleted.
   * Returns the deleted document record (so caller can get s3Key for S3 cleanup).
   */
  async delete(id: string) {
    // @ts-ignore - Extended Prisma client type inference issue
    return this.db.document.delete({
      where: { id },
    });
  }
}
