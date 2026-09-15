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
    return (await this.client()).truck.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find a truck by ID within the current tenant.
   * Returns null if not found or belongs to different tenant (RLS).
   */
  async findById(id: string) {
    return (await this.client()).truck.findUnique({
      where: { id },
    });
  }

  /**
   * Find a truck by VIN within the current tenant.
   * Returns null if not found or belongs to different tenant (RLS).
   */
  async findByVin(vin: string) {
    return (await this.client()).truck.findFirst({
      where: { vin },
    });
  }

  /**
   * Create a new truck for the current tenant.
   */
  async create(data: Prisma.TruckCreateInput) {
    return (await this.client()).truck.create({
      data,
    });
  }

  /**
   * Update a truck by ID within the current tenant.
   * RLS ensures only trucks in the current tenant can be updated.
   */
  async update(id: string, data: Prisma.TruckUpdateInput) {
    return (await this.client()).truck.update({
      where: { id },
      data,
    });
  }

  /**
   * Delete a truck by ID within the current tenant.
   * RLS ensures only trucks in the current tenant can be deleted.
   */
  async delete(id: string) {
    return (await this.client()).truck.delete({
      where: { id },
    });
  }
}
