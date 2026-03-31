'use server';

import { getSession, requirePermission } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';

async function requireOwnerOrManager(): Promise<{ tenantId: string }> {
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');
  const role = session.role as UserRole;
  if (role !== UserRole.OWNER && role !== UserRole.MANAGER) {
    throw new Error('Unauthorized');
  }
  if (!session.tenantId) throw new Error('Tenant context required');
  return { tenantId: session.tenantId };
}

/**
 * Fetch this tenant's SysAdmin invoices (read-only, OWNER/MANAGER only).
 * Uses base prisma client — SysAdminInvoice rows are denied under tenant RLS context
 * so we must bypass by using the global client and filtering by tenantId manually.
 */
export async function getMySubscriptionInvoices() {
  const { tenantId } = await requireOwnerOrManager();
  await requirePermission('canViewBilling');

  return prisma.sysAdminInvoice.findMany({
    where: { tenantId, archivedAt: null },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}
