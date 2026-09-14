import { prisma, TX_OPTIONS } from '../prisma';
import { getAdminDb } from '../admin-prisma';
import { setTransactionTenantId } from '../tenant-guc';
import { randomUUID } from 'crypto';

function generateSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base ? `${base}-${randomUUID().slice(0, 8)}` : randomUUID().slice(0, 16);
}

export class TenantProvisioningRepository {
  /**
   * Create a new tenant with an owner user.
   *
   * ─── UNREFERENCED, AND UPDATED ANYWAY (quick-601) ─────────────────────────
   *
   * This method has ZERO callers — `grep -rn "TenantProvisioningRepository"`
   * returns the class declaration and nothing else. The live sysadmin tenant
   * create is `(admin)/actions/tenants.ts`, on the admin connection.
   *
   * It is updated rather than left alone because quick-601 changed what a bare
   * `"Tenant"` INSERT means: `tenant_bootstrap_insert` now requires
   * `id = current_tenant_id()`, so a no-GUC insert — which is exactly what this
   * was — is refused under `app_user`. Leaving it would have parked a method
   * that is broken the moment anyone calls it, in a file whose two siblings are
   * live. Same shape as `provisionTenant` in `lib/onboarding`: mint the id,
   * declare it, then insert.
   *
   * SCOPE: Creates one Tenant + one User record.
   * SAFETY: Gated by requireAuth() + isSystemAdmin() in whatever caller adopts it.
   */
  async provisionTenant(data: {
    companyName: string;
    timezone?: string;
    ownerId: string;
    ownerEmail: string;
  }) {
    return prisma.$transaction(async (tx) => {
      const tenantId = randomUUID();
      await setTransactionTenantId(tx, tenantId);

      const tenant = await tx.tenant.create({
        data: {
          id: tenantId,
          name: data.companyName,
          slug: generateSlug(data.companyName),
          timezone: data.timezone || 'UTC',
          users: {
            create: {
              id: data.ownerId,
              email: data.ownerEmail,
              role: 'OWNER',
            },
          },
        },
        include: { users: true },
      });

      return tenant;
    }, TX_OPTIONS);
  }

  /**
   * Find tenant by user ID (database UUID).
   *
   * quick-600 (B5) — ROUTE. `lib/db/admin-prisma.ts`, reason:
   * 'tenant lookup by user id'.
   * WHY: Called during onboarding/session bootstrap before tenant context is set.
   *      Also used by the sysadmin portal to look up tenants for any user ID.
   * SCOPE: Reads one User + their Tenant (foreign key join) by primary key.
   * SAFETY: userId comes from the verified session cookie (requireAuth() in callers).
   */
  async findTenantByUserId(userId: string) {
    const adminDb = await getAdminDb('tenant lookup by user id');
    const user = await adminDb.user.findUnique({
      where: { id: userId },
      include: { tenant: true },
    });
    return user?.tenant || null;
  }

  /**
   * List all tenants (system admin operation).
   *
   * quick-600 (B5) — ROUTE. `lib/db/admin-prisma.ts`, reason:
   * 'sysadmin tenant listing'.
   * WHY: System admin needs to see all tenants — this is intentionally cross-tenant.
   * SCOPE: Reads all Tenant rows with no filtering.
   * SAFETY: Gated by isSystemAdmin() check in the sysadmin actions caller.
   */
  async listAllTenants() {
    const adminDb = await getAdminDb('sysadmin tenant listing');
    return adminDb.tenant.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }
}
