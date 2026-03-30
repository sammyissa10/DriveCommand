/**
 * TruckRepository provides tenant-scoped CRUD operations for trucks.
 * All queries are automatically filtered by RLS to the current tenant.
 */

import { TenantRepository } from './base.repository';
import type { Prisma } from '@/generated/prisma/client';

export class TruckRepository extends TenantRepository {
  /**
   * Find all trucks for the current tenant, ordered by creation date (newest first).
   */
  async findAll() {
    return this.db.truck.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find a truck by ID within the current tenant.
   * Returns null if not found or belongs to different tenant (RLS).
   */
  async findById(id: string) {
    return this.db.truck.findUnique({
      where: { id },
    });
  }

  /**
   * Find a truck by VIN within the current tenant.
   * Returns null if not found or belongs to different tenant (RLS).
   */
  async findByVin(vin: string) {
    return this.db.truck.findFirst({
      where: { vin },
    });
  }

  /**
   * Create a new truck for the current tenant.
   */
  async create(data: Prisma.TruckCreateInput) {
    return this.db.truck.create({
      data,
    });
  }

  /**
   * Update a truck by ID within the current tenant.
   * RLS ensures only trucks in the current tenant can be updated.
   */
  async update(id: string, data: Prisma.TruckUpdateInput) {
    return this.db.truck.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a truck by ID within the current tenant.
   * RLS ensures only trucks in the current tenant can be deleted.
   */
  async delete(id: string) {
    return this.db.truck.delete({
      where: { id },
    });
  }
}
