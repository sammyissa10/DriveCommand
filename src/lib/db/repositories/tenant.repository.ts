import { prisma, TX_OPTIONS } from '../prisma';

export class TenantProvisioningRepository {
  /**
   * Create a new tenant with an owner user.
   * Used during administrative provisioning.
   * NOT scoped by RLS — this creates the tenant itself.
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
