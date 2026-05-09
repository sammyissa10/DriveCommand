import { Prisma } from '../../../generated/prisma/client';

/**
 * Prisma Client Extension for Multi-Tenant Isolation
 *
 * PRIMARY MECHANISM: Application-layer tenantId injection.
 * Injects `tenantId` directly into all query arguments (where, data) for every
 * Prisma operation on models that have a tenantId field. This ensures tenant
 * isolation at the application layer regardless of database-level RLS status.
 *
 * DEFENSE-IN-DEPTH: set_config still runs.
 * Every query is also wrapped in a sequential transaction that sets the
 * app.current_tenant_id session variable via set_config. This is belt-and-suspenders
 * in case any future DB-level RLS policies are re-enabled.
 *
 * WHY APPLICATION-LAYER INJECTION:
 * The previous approach relied solely on PostgreSQL RLS policies. However, Supabase's
 * postgres role has BYPASSRLS privilege, which means all queries run through the
 * Prisma connection pool (using the postgres role) bypass RLS entirely. This resulted
 * in every tenant being able to see every other tenant's data — a critical P0 breach.
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
  'RouteDriver',
  'SysAdminInvoiceItem',
  'TicketMessage',
  'PushToken',
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
]);

export function withTenantRLS(tenantId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            // Belt-and-suspenders: set_config runs alongside application-layer injection.
            // Uses sequential transaction form to guarantee same DB connection.
            async function runWithSetConfig(q: typeof query, a: typeof args) {
              const [, result] = await client.$transaction([
                client.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
                q(a),
              ]);
              return result;
            }

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
                const result = await runWithSetConfig(query, args);
                if (result && (result as any).tenantId !== tenantId) {
                  return null; // Treat cross-tenant record as not found
                }
                return result;
              }

              case 'findUniqueOrThrow': {
                const result = await runWithSetConfig(query, args);
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

            // Execute with set_config defense-in-depth for all non-early-return paths.
            return runWithSetConfig(query, args);
          },
        },
      },
    })
  );
}
