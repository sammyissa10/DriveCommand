import { prisma } from '../prisma';
import { withTenantRLS } from '../extensions/tenant-rls';

export class TenantRepository {
  protected db: ReturnType<typeof prisma.$extends>;

  constructor(tenantId: string) {
    // Every query through this.db is automatically scoped to this tenant
    // via PostgreSQL RLS policies + transaction-local set_config()
    this.db = prisma.$extends(withTenantRLS(tenantId));
  }
}
