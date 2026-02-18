'use server';

/**
 * Server actions for tenant integration management.
 * All actions enforce OWNER/MANAGER role authorization before any data access.
 */

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { IntegrationProvider, IntegrationCategory } from '@/generated/prisma';
import { revalidatePath } from 'next/cache';

/**
 * List all TenantIntegration rows for the tenant.
 * Requires OWNER or MANAGER role.
 * Returns rows ordered by category then provider.
 */
export async function listIntegrations() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const prisma = await getTenantPrisma();
  return prisma.tenantIntegration.findMany({
    orderBy: [
      { category: 'asc' },
      { provider: 'asc' },
    ],
  });
}

/**
 * Toggle (upsert) a TenantIntegration row for the given provider.
 * Requires OWNER or MANAGER role.
 * Uses upsert to create or update the row for the tenant+provider combination.
 */
export async function toggleIntegration(
  provider: IntegrationProvider,
  category: IntegrationCategory,
  enabled: boolean
) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  try {
    await prisma.tenantIntegration.upsert({
      where: {
        tenantId_provider: { tenantId, provider },
      },
      update: { enabled },
      create: {
        tenantId,
        provider,
        category,
        enabled,
        configJson: {},
      },
    });

    revalidatePath('/settings/integrations');
    return { success: true };
  } catch (error) {
    console.error('Failed to toggle integration:', error);
    return { error: 'Failed to update integration. Please try again.' };
  }
}
