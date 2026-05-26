import { Prisma } from '../../../generated/prisma/client';

/**
 * Prisma Client Extension for Multi-Tenant Isolation
 *
 * PRIMARY MECHANISM: Application-layer tenantId injection.
 * Injects `tenantId` directly into all query arguments (where, data) for every
 * Prisma operation on models that have a tenantId field. This ensures tenant
 * isolation at the application layer regardless of database-level RLS status.
 *
 * WHY APPLICATION-LAYER INJECTION:
 * The previous approach relied solely on PostgreSQL RLS policies. However, Supabase's
 * postgres role has BYPASSRLS privilege, which means all queries run through the
 * Prisma connection pool (using the postgres role) bypass RLS entirely. This resulted
 * in every tenant being able to see every other tenant's data — a critical P0 breach.
 *
 * WHY set_config WAS REMOVED:
 * The previous defense-in-depth layer wrapped every query in a sequential
 * client.$transaction([set_config(...), query(...)]) call. This is incompatible
 * with Prisma's driver-adapter mode (pg.Pool) on limited-connection deployments
 * (e.g. Supabase Session Pooler, max:1 pool). When a server action opens an outer
 * $transaction(async (tx) => { ... }), the inner extension tries to open a new
 * top-level transaction on the bare client, which can't acquire a connection because
 * the outer transaction already holds the only one — causing P2028 deadlocks.
 * Application-layer injection alone provides full tenant isolation; set_config was
 * never load-bearing for isolation, only for hypothetical future RLS policies.
 *
 * IF RLS POLICIES ARE RE-ADDED IN FUTURE:
 * Do not re-introduce per-query $transaction wrapping here. Instead, set
 * app.current_tenant_id at connection checkout time (e.g. via a pg.Pool
 * 'connect' event handler or a Prisma middleware that runs SET LOCAL outside
 * of query-level transactions), so it is nested-transaction-safe.
 *
 * EXEMPT MODELS:
 * Models without a tenantId field are skipped — queries run normally without injection.
 * See EXEMPT_MODELS set below.
 */

/**
 * Models that do NOT have a tenantId field and must be exempt from injection.
 * Names must match Prisma model names exactly (PascalCase).
 */
const EXEMPT_MODELS = new Set([
  'Tenant',
  // RouteDriver — removed: now has tenantId (quick-327)
  // SysAdminInvoiceItem — removed: now has tenantId (quick-327)
  'TicketMessage',
  // PushToken — removed: now has tenantId (quick-327)
  'CarrierClient',
  'CarrierContract',
  'CarrierFacility',
  'CarrierDriver',
  'CarrierTruck',
  'RouteTemplate',
  'RouteTemplateStop',
  'CarrierDispatch',
  'CarrierLoad',
  'CarrierStop',
  'CarrierDocument',
  'CarrierExpense',
  'DriverPayRecord',
  'CarrierCatalogMeta',
  'Trip', // Uses orgId, not tenantId — code in trips.ts handles isolation manually
]);

export function withTenantRLS(tenantId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            // Exempt models: no tenantId field, pass through without injection.
            if (EXEMPT_MODELS.has(model ?? '')) {
              return query(args);
            }

            // Non-exempt models: inject tenantId based on operation type.
            const a = args as any;

            switch (operation) {
              // ── READ operations ──────────────────────────────────────────────

              case 'findMany':
              case 'findFirst':
              case 'findFirstOrThrow':
              case 'count':
              case 'aggregate':
              case 'groupBy':
                a.where = a.where
                  ? { AND: [{ tenantId }, a.where] }
                  : { tenantId };
                break;

              // findUnique/findUniqueOrThrow require unique-field-only where clauses,
              // so we cannot add tenantId directly. Instead, run the query then verify
              // the result belongs to this tenant.
              case 'findUnique': {
                const result = await query(args);
                if (result && (result as any).tenantId !== tenantId) {
                  return null; // Treat cross-tenant record as not found
                }
                return result;
              }

              case 'findUniqueOrThrow': {
                const result = await query(args);
                if (result && (result as any).tenantId !== tenantId) {
                  throw new Error(
                    `Tenant isolation violation: record belongs to another tenant`
                  );
                }
                return result;
              }

              // ── WRITE operations ─────────────────────────────────────────────

              case 'create':
                a.data = { ...a.data, tenantId };
                break;

              case 'createMany':
              case 'createManyAndReturn':
                if (Array.isArray(a.data)) {
                  a.data = a.data.map((item: any) => ({ ...item, tenantId }));
                } else {
                  a.data = { ...a.data, tenantId };
                }
                break;

              case 'update':
                a.where = { ...a.where, tenantId };
                break;

              case 'updateMany':
                a.where = a.where
                  ? { AND: [{ tenantId }, a.where] }
                  : { tenantId };
                break;

              case 'upsert':
                a.where = { ...a.where, tenantId };
                a.create = { ...a.create, tenantId };
                break;

              case 'delete':
                a.where = { ...a.where, tenantId };
                break;

              case 'deleteMany':
                a.where = a.where
                  ? { AND: [{ tenantId }, a.where] }
                  : { tenantId };
                break;

              default:
                // Unknown operation — pass through safely without injection.
                return query(args);
            }

            return query(args);
          },
        },
      },
    })
  );
}
