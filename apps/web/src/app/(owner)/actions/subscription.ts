'use server';

import { getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';

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
 *
 * quick-600 (B5) — CORRECT, not ROUTE. `session.tenantId` is already in hand
 * from `requireOwnerOrManager()` before this query runs. `SysAdminInvoice`
 * carries a live `tenant_isolation_policy` (`tenantId = current_tenant_id()`)
 * alongside the two `sysadmin_invoices_deny_*` permissive policies (design
 * §2.6) — a tenant-scoped GUC is admitted by the isolation policy regardless
 * of what the deny policies say (permissive policies OR together). This never
 * needed an admin connection; it needed the tenant GUC actually set, which
 * `getTenantPrismaForOrg` now does.
 */
export async function getMySubscriptionInvoices() {
  const { tenantId } = await requireOwnerOrManager();
  // Subscription page is owner-only — enforced via middleware + sidebar (OWNER_ONLY_PATHS)

  const tenantDb = await getTenantPrismaForOrg(tenantId);
  return tenantDb.sysAdminInvoice.findMany({
    where: { tenantId, archivedAt: null },
    include: { items: true },
    orderBy: { createdAt: 'desc' },
  });
}
