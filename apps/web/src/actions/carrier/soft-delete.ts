'use server';

import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';
import type { SoftDeletableEntity } from '@/lib/carrier/soft-delete';

interface SoftDeleteResult {
  success: boolean;
  error?: string;
  deletedCount?: number;
}

// Generic soft delete - sets deletedAt and deletedById
export async function softDeleteRecords(
  entityType: SoftDeletableEntity,
  ids: string[]
): Promise<SoftDeleteResult> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const orgId = session.tenantId;
  const userId = session.userId;
  if (!orgId || !userId) return { success: false, error: 'Invalid session' };

  const now = new Date();
  const tenantPrisma = await getTenantPrisma();

  // Use dynamic model access with type-safe mapping
  const modelMap = {
    CarrierClient: tenantPrisma.carrierClient,
    CarrierContract: tenantPrisma.carrierContract,
    CarrierDriver: tenantPrisma.carrierDriver,
    CarrierTruck: tenantPrisma.carrierTruck,
    Route: tenantPrisma.route,
    Trip: tenantPrisma.trip,
    CarrierLoad: tenantPrisma.carrierLoad,
  } as const;

  const orgField = entityType === 'Route' ? 'tenantId' : 'orgId';

  // CarrierDriver soft-delete: also deactivate linked Users in the same transaction.
  // Guard: a User is only deactivated if no OTHER non-deleted CarrierDriver in this org
  // still references it — mirrors the otherDriverLinks check in the hard-delete path.
  // NOTE: restoreRecords (un-delete) must also flip isActive back to true for symmetry.
  if (entityType === 'CarrierDriver') {
    const driversToDelete = await tenantPrisma.carrierDriver.findMany({
      where: { id: { in: ids }, orgId, deletedAt: null },
      select: { userId: true },
    });

    const candidateUserIds = driversToDelete
      .map((d) => d.userId)
      .filter((uid): uid is string => uid !== null);

    const txResult = await tenantPrisma.$transaction(async (tx) => {
      const updated = await (tx as any).carrierDriver.updateMany({
        where: { id: { in: ids }, orgId, deletedAt: null },
        data: { deletedAt: now, deletedById: userId },
      });

      for (const uid of candidateUserIds) {
        const otherDriverLinks = await (tx as any).carrierDriver.count({
          where: { userId: uid, orgId, deletedAt: null },
        });
        if (otherDriverLinks === 0) {
          await (tx as any).user.updateMany({
            where: { id: uid, tenantId: orgId, isActive: true },
            data: { isActive: false },
          });
        }
      }

      return updated;
    });

    revalidatePath('/', 'layout');
    return { success: true, deletedCount: txResult.count };
  }

  const model = modelMap[entityType];
  const result = await (model as any).updateMany({
    where: {
      id: { in: ids },
      [orgField]: orgId,
      deletedAt: null, // Only delete non-deleted records
    },
    data: {
      deletedAt: now,
      deletedById: userId,
    },
  });

  revalidatePath('/', 'layout');
  return { success: true, deletedCount: result.count };
}

// Generic restore - clears deletedAt and deletedById
export async function restoreRecords(
  entityType: SoftDeletableEntity,
  ids: string[]
): Promise<SoftDeleteResult> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const orgId = session.tenantId;
  if (!orgId) return { success: false, error: 'Invalid session' };

  const tenantPrisma = await getTenantPrisma();

  const modelMap = {
    CarrierClient: tenantPrisma.carrierClient,
    CarrierContract: tenantPrisma.carrierContract,
    CarrierDriver: tenantPrisma.carrierDriver,
    CarrierTruck: tenantPrisma.carrierTruck,
    Route: tenantPrisma.route,
    Trip: tenantPrisma.trip,
    CarrierLoad: tenantPrisma.carrierLoad,
  } as const;

  const orgField = entityType === 'Route' ? 'tenantId' : 'orgId';

  const model = modelMap[entityType];
  const result = await (model as any).updateMany({
    where: {
      id: { in: ids },
      [orgField]: orgId,
      deletedAt: { not: null },
    },
    data: {
      deletedAt: null,
      deletedById: null,
    },
  });

  revalidatePath('/', 'layout');
  return { success: true, deletedCount: result.count };
}

// Permanent delete - actually removes from database
export async function permanentlyDeleteRecords(
  entityType: SoftDeletableEntity,
  ids: string[]
): Promise<SoftDeleteResult> {
  const session = await getSession();
  if (!session) return { success: false, error: 'Unauthorized' };

  const orgId = session.tenantId;
  if (!orgId) return { success: false, error: 'Invalid session' };

  const tenantPrisma = await getTenantPrisma();

  const modelMap = {
    CarrierClient: tenantPrisma.carrierClient,
    CarrierContract: tenantPrisma.carrierContract,
    CarrierDriver: tenantPrisma.carrierDriver,
    CarrierTruck: tenantPrisma.carrierTruck,
    Route: tenantPrisma.route,
    Trip: tenantPrisma.trip,
    CarrierLoad: tenantPrisma.carrierLoad,
  } as const;

  const orgField = entityType === 'Route' ? 'tenantId' : 'orgId';

  const model = modelMap[entityType];
  const result = await (model as any).deleteMany({
    where: {
      id: { in: ids },
      [orgField]: orgId,
      deletedAt: { not: null }, // Only permanently delete already soft-deleted
    },
  });

  revalidatePath('/', 'layout');
  return { success: true, deletedCount: result.count };
}
