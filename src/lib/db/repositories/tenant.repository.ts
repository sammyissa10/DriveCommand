import { prisma } from '../prisma';

export class TenantProvisioningRepository {
  /**
   * Create a new tenant with an owner user.
   * Used during signup provisioning (Clerk webhook).
   * NOT scoped by RLS — this creates the tenant itself.
   */
  async provisionTenant(data: {
    companyName: string;
    timezone?: string;
    ownerClerkUserId: string;
    ownerEmail: string;
  }) {
    return prisma.$transaction(async (tx) => {
      // Set bypass flag for this transaction
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const tenant = await tx.tenant.create({
        data: {
          name: data.companyName,
          timezone: data.timezone || 'UTC',
          users: {
            create: {
              clerkUserId: data.ownerClerkUserId,
              email: data.ownerEmail,
              role: 'OWNER',
            },
          },
        },
        include: { users: true },
      });

      return tenant;
    });
  }

  /**
   * Find tenant by owner's Clerk user ID.
   * Used for idempotent webhook handling and proxy.ts fallback.
   */
  async findTenantByClerkUserId(clerkUserId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const user = await tx.user.findUnique({
        where: { clerkUserId },
        include: { tenant: true },
      });

      return user?.tenant || null;
    });
  }

  /**
   * List all tenants (system admin operation).
   */
  async listAllTenants() {
    return prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.tenant.findMany({
        orderBy: { createdAt: 'desc' },
      });
    });
  }
}
