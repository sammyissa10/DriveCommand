import { Prisma } from '../../../generated/prisma/client';

/**
 * Prisma Client Extension for Multi-Tenant Isolation
 *
 * PRIMARY MECHANISM: Application-layer tenantId injection.
 * Injects `tenantId` into all query arguments (where, data) for every Prisma
 * operation on models that have a tenantId field. Provides defence-in-depth
 * regardless of database-level RLS status.
 *
 * SECONDARY MECHANISM (wired in quick-411): PostgreSQL Row Level Security.
 * `getTenantPrisma()` in src/lib/context/tenant-context.ts fires
 *   SELECT set_config('app.current_tenant_id', <tenantId>, false)
 * on the bare Prisma client BEFORE returning the extended client. RLS
 * policies that call `current_tenant_id()` read this GUC and filter rows
 * accordingly. Session-scope (FALSE) is used because Supabase Session
 * Pooler (port 6543) + max:1 pg.Pool + single-threaded Vercel workers
 * guarantee no concurrent tenant overlap on a given physical connection,
 * and the spec-recommended TRUE-scope per-transaction approach was
 * incompatible with the existing nested-transaction patterns in feature
 * code (caused P2028 deadlocks). The pool 'connect' handler in prisma.ts
 * resets the GUC to '' on every new physical connection so stale values
 * from prior worker lifetimes cannot leak into the first query.
 *
 * THE OLD set_config DEADLOCK (do not reintroduce):
 * Wrapping every model operation in
 *   client.$transaction([raw_set_config, query])
 * inside this extension caused P2028 when feature code opened an outer
 *   prisma.$transaction(async tx => { ... })
 * — the inner array-transaction blocked waiting for the only connection
 * already held by the outer tx. The new mechanism sets the GUC once per
 * request OUTSIDE the extension, so this extension stays free of any
 * transaction wrapping.
 *
 * EXEMPT MODELS:
 * Only models that genuinely have no `tenantId` column on their Prisma
 * schema entry are exempt. Tables that DO carry tenantId (even if added
 * recently) must NOT be exempted — the injection layer is needed in
 * addition to RLS because RLS only fires when the GUC is set, and some
 * code paths (background jobs, scripts) may not call getTenantPrisma().
 */

// Schema audit (quick-411): the following models were confirmed to have NO
// tenantId column in apps/web/prisma/schema.prisma:
//   Tenant         — the tenants table itself; queried by id, no tenantId column
//   TicketMessage  — has ticketId only; scoped via parent SupportTicket
//   CarrierClient  — uses orgId (maps to Tenant.id); no tenantId column
//   CarrierContract — uses orgId; no tenantId column
//   CarrierFacility — uses orgId; no tenantId column
//   CarrierDriver  — uses orgId; no tenantId column
//   CarrierTruck   — uses orgId; no tenantId column
//   RouteTemplate  — uses orgId; no tenantId column
//   RouteTemplateStop — no orgId or tenantId; scoped via parent RouteTemplate
//   CarrierLoad    — uses orgId; no tenantId column
//   CarrierStop    — no tenantId; scoped via dispatchId (Trip)
//   CarrierDocument — no tenantId; scoped via parentId/parentType
//   CarrierExpense — uses orgId; no tenantId column
//   DriverPayRecord — uses orgId; no tenantId column
//   InAppNotification — uses orgId; no tenantId column (carrier notifications)
//   CarrierDocumentType — uses orgId; no tenantId column
//   CarrierCatalogMeta — global lookup table; no orgId or tenantId column
//   Trip           — uses orgId; no tenantId column; code in trips.ts handles isolation
// Note: CarrierDispatch was listed in a previous version of this set but that model
// does not exist — it is called Trip in schema.prisma (@@map("dispatches")).
// If any model above gains a tenantId column in the future, remove it from this set.

/**
 * Models that do NOT have a tenantId field and must be exempt from injection.
 * Names must match Prisma model names exactly (PascalCase).
 */
const EXEMPT_MODELS = new Set([
  'Tenant', // the tenants table itself — queried by id, no tenantId column
  'TicketMessage', // no tenantId column; scoped via ticketId → SupportTicket
  'CarrierClient', // uses orgId instead of tenantId
  'CarrierContract', // uses orgId instead of tenantId
  'CarrierFacility', // uses orgId instead of tenantId
  'CarrierDriver', // uses orgId instead of tenantId
  'CarrierTruck', // uses orgId instead of tenantId
  'RouteTemplate', // uses orgId instead of tenantId
  'RouteTemplateStop', // no tenantId; scoped via routeTemplateId
  'CarrierLoad', // uses orgId instead of tenantId
  'CarrierStop', // no tenantId; scoped via dispatchId (Trip)
  'CarrierDocument', // no tenantId; scoped via parentId/parentType
  'CarrierExpense', // uses orgId instead of tenantId
  'DriverPayRecord', // uses orgId instead of tenantId
  'InAppNotification', // uses orgId instead of tenantId — carrier notifications
  'CarrierDocumentType', // uses orgId instead of tenantId
  'CarrierCatalogMeta', // global lookup table — no org/tenant scoping
  'Trip', // uses orgId, not tenantId — code in trips.ts handles isolation manually
  'CarrierClientContact', // uses orgId instead of tenantId (quick-492)
  // Document Import (Phase 1) — all four use orgId, matching their carrier
  // siblings above. They were added to the schema without being added here, so
  // every query against them had `{ tenantId }` injected into a model that has
  // no such column, which Prisma rejects outright. Isolation for these is the
  // explicit `orgId` filter that persistence.ts / cache.ts apply on every
  // query, plus the table's RLS policy once DATABASE_URL moves to app_user.
  'DocumentImport', // uses orgId instead of tenantId
  'DocumentImportPage', // uses orgId instead of tenantId
  'FacilityExternalReference', // uses orgId instead of tenantId
  'DocumentProfile', // uses orgId instead of tenantId
  //
  // SECOND OCCURRENCE OF THE SAME CLASS (quick-520 introduced it, quick-528
  // diagnosed it). `RouteMatrixCache` was added to schema.prisma by quick-520
  // — which regenerated the Prisma client in the same commit but never touched
  // this file — so every operation on it threw PrismaClientValidationError
  // client-side, before any SQL was emitted. The read lost `where`; the upsert
  // lost `where` AND `create`. The table sat at zero rows from creation, and
  // the failure was invisible because both call sites swallow into a warn.
  //
  // The paragraph directly above predicted this exactly and was four lines
  // away. **A model added to schema.prisma without a tenantId column must be
  // added here in the same commit** — the schema edit and this list are one
  // change wearing two files, and a Prisma regeneration will not tell you.
  //
  // Isolation is unaffected: `optimisation-matrix.ts` passes `orgId` explicitly
  // in the read's `where`, and in the upsert's `where` (via the
  // `(org_id, facility_key)` compound unique) and `create`. It was never the
  // injection that scoped this table — the injection only ever broke it.
  'RouteMatrixCache', // uses orgId instead of tenantId
  //
  // THIRD MODEL OF THE SAME CLASS, added here in the same commit that adds it to
  // schema.prisma — which is what the paragraph above asks for. Phase 9's
  // `CarrierTruckDefect` scopes by `orgId` like every carrier sibling, and its
  // isolation is the explicit `orgId` filter in `inspection-service.ts` plus the
  // `tenant_isolation_policy` written in its own migration, not this list.
  'CarrierTruckDefect', // uses orgId instead of tenantId
  // RouteDriver — removed: now has tenantId (quick-327)
  // SysAdminInvoiceItem — removed: now has tenantId (quick-327)
  // PushToken — removed: now has tenantId (quick-327)
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
