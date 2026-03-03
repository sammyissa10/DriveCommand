import { Prisma } from '../../../generated/prisma/client';

/**
 * Prisma Client Extension for Row-Level Security
 *
 * Wraps every query in a SEQUENTIAL transaction that sets the app.current_tenant_id session
 * variable. This variable is used by PostgreSQL RLS policies to filter queries by tenant.
 *
 * CRITICAL: Uses the sequential transaction form ($transaction([op1, op2])) rather than the
 * interactive form ($transaction(async (tx) => {...})). In the sequential form, Prisma
 * guarantees that ALL operations in the array share the same database connection and
 * transaction. This ensures set_config and query(args) run on the same connection so RLS
 * sees the tenant ID correctly.
 *
 * With the interactive form, query(args) runs on the outer client's connection pool
 * (a different connection than tx), so set_config has no effect on the actual query and
 * RLS sees NULL for current_tenant_id() — returning 0 rows for all tenant-scoped queries.
 *
 * The third parameter to set_config is TRUE (is_local), which scopes the variable
 * to the current transaction only — preventing connection pool contamination.
 */
export function withTenantRLS(tenantId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            // Sequential transaction: both ops share the same connection and transaction.
            // The sequential form ($transaction([...])) ensures set_config and query(args)
            // run on the same DB connection, so RLS sees the tenant ID correctly.
            const [, result] = await client.$transaction([
              // Set transaction-local session variable for RLS.
              // The TRUE parameter makes it local to this transaction only.
              client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
              // Execute the actual query — runs on same connection, so RLS sees tenant ID.
              query(args),
            ]);
            return result;
          },
        },
      },
    })
  );
}
