import { PrismaClient } from '../../../generated/prisma/client';
import { createTenantClient } from '../tenant-client';

export class TenantRepository {
  protected db: PrismaClient;

  constructor(tenantId: string) {
    // Every query through this.db is automatically scoped to this tenant
    // via PostgreSQL RLS policies + transaction-local set_config()
    // See: apps/web/src/lib/db/tenant-client.ts for type safety rationale
    this.db = createTenantClient(tenantId);
  }
}
