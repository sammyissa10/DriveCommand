'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) {
    throw new Error('Unauthorized: Admin access required');
  }
}

/**
 * Explicit shape of a user row returned to the sysadmin client.
 * Only whitelisted fields — no passwordHash, licenseNumber, permissions,
 * isDispatchReady, isSample, or isSystemAdmin.
 */
export type AdminUserRow = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  tenantId: string;
  tenant: { name: string } | null;
};

/**
 * Get all non-sample, non-sysadmin users across every tenant.
 * Uses bare Prisma client (NOT getTenantPrisma) — intentional cross-tenant
 * read for sysadmin. Matches the pattern in actions/tenants.ts.
 */
export async function getAllUsers(): Promise<AdminUserRow[]> {
  await requireAdminAccess();

  return prisma.user.findMany({
    where: { isSample: false, isSystemAdmin: false },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      tenantId: true,
      tenant: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}
