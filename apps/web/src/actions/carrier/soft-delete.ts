'use server';

import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
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

  // Use dynamic model access with type-safe mapping
  const modelMap = {
    CarrierClient: prisma.carrierClient,
    CarrierContract: prisma.carrierContract,
    CarrierDriver: prisma.carrierDriver,
    CarrierTruck: prisma.carrierTruck,
    Route: prisma.route,
    Trip: prisma.trip,
    CarrierLoad: prisma.carrierLoad,
  } as const;

  const orgField = entityType === 'Route' ? 'tenantId' : 'orgId';

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

  const modelMap = {
    CarrierClient: prisma.carrierClient,
    CarrierContract: prisma.carrierContract,
    CarrierDriver: prisma.carrierDriver,
    CarrierTruck: prisma.carrierTruck,
    Route: prisma.route,
    Trip: prisma.trip,
    CarrierLoad: prisma.carrierLoad,
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

  const modelMap = {
    CarrierClient: prisma.carrierClient,
    CarrierContract: prisma.carrierContract,
    CarrierDriver: prisma.carrierDriver,
    CarrierTruck: prisma.carrierTruck,
    Route: prisma.route,
    Trip: prisma.trip,
    CarrierLoad: prisma.carrierLoad,
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
