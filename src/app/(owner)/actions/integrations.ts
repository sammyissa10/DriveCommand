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

// Provider -> Category mapping for saveIntegrationConfig upsert
const PROVIDER_CATEGORY_MAP: Record<IntegrationProvider, IntegrationCategory> = {
  QUICKBOOKS: 'ACCOUNTING',
  SAMSARA: 'ELD',
  KEEP_TRUCKIN: 'ELD',
  TRIUMPH_FACTORING: 'FACTORING',
  OTR_SOLUTIONS: 'FACTORING',
  SENDGRID: 'EMAIL',
  MAILGUN: 'EMAIL',
};

/**
 * Save integration configuration (e.g., API tokens) for a provider.
 * Requires OWNER role only (not MANAGER — API keys are sensitive).
 * Upserts the TenantIntegration row, sets configJson and enables the integration.
 */
export async function saveIntegrationConfig(
  provider: IntegrationProvider,
  configJson: Record<string, string>
) {
  await requireRole([UserRole.OWNER]);

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();
  const category = PROVIDER_CATEGORY_MAP[provider];

  if (!category) {
    return { error: 'Unknown integration provider.' };
  }

  try {
    await prisma.tenantIntegration.upsert({
      where: {
        tenantId_provider: { tenantId, provider },
      },
      update: {
        configJson,
        enabled: true,
      },
      create: {
        tenantId,
        provider,
        category,
        enabled: true,
        configJson,
      },
    });

    revalidatePath('/settings/integrations');
    return { success: true };
  } catch (error) {
    console.error('Failed to save integration config:', error);
    return { error: 'Failed to save configuration. Please try again.' };
  }
}
