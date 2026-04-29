import { prisma, TX_OPTIONS } from '../prisma';
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
   * Used during administrative provisioning.
   * NOT scoped by RLS — this creates the tenant itself.
   *
   * @bypass_rls reason: cross-tenant
   * WHY: Tenant provisioning is a system-admin operation that creates a new Tenant
   *      record and its first Owner User. No tenant context exists yet to scope RLS to.
   * SCOPE: Creates one Tenant + one User record.
   * SAFETY: Gated by requireAuth() + isSystemAdmin() in the caller (tenants action).
   */
  async provisionTenant(data: {
    companyName: string;
    timezone?: string;
    ownerId: string;
    ownerEmail: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // Set bypass flag for this transaction
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const tenant = await tx.tenant.create({
        data: {
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
   * @bypass_rls reason: pre-auth
   * WHY: Called during onboarding/session bootstrap before tenant context is set.
   *      Also used by the sysadmin portal to look up tenants for any user ID.
   * SCOPE: Reads one User + their Tenant (foreign key join) by primary key.
   * SAFETY: userId comes from the verified session cookie (requireAuth() in callers).
   */
  async findTenantByUserId(userId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const user = await tx.user.findUnique({
        where: { id: userId },
        include: { tenant: true },
      });

      return user?.tenant || null;
    }, TX_OPTIONS);
  }

  /**
   * List all tenants (system admin operation).
   *
   * @bypass_rls reason: cross-tenant
   * WHY: System admin needs to see all tenants — this is intentionally cross-tenant.
   * SCOPE: Reads all Tenant rows with no filtering.
   * SAFETY: Gated by isSystemAdmin() check in the sysadmin actions caller.
   */
  async listAllTenants() {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.tenant.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }, TX_OPTIONS);
  }
}
