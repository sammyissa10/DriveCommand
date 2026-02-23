import { Prisma } from '../../../generated/prisma/client';
import { TX_OPTIONS } from '../prisma';

/**
 * Prisma Client Extension for Row-Level Security
 *
 * Wraps every query in a transaction that sets the app.current_tenant_id session variable.
 * This variable is used by PostgreSQL RLS policies to filter queries by tenant.
 *
 * CRITICAL: The third parameter to set_config is TRUE (is_local), which scopes the variable
 * to the current transaction only. This prevents connection pool contamination where one
 * tenant's context could leak to another tenant's queries.
 */
export function withTenantRLS(tenantId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            // Wrap the operation in a transaction that sets the tenant context.
            // maxWait/timeout raised to handle bursts of concurrent queries (e.g. parallel tests,
            // dashboard pages loading 6+ queries simultaneously).
            return client.$transaction(async (tx) => {
              // Set transaction-local session variable for RLS
              // The TRUE parameter makes it local to this transaction only
              await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

              // Execute the actual query with tenant context set
              return query(args);
            }, TX_OPTIONS);
          },
        },
      },
    })
  );
}
