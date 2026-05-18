import { Prisma } from '../../../generated/prisma/client';

/**
 * Prisma Client Extension — Audit Column Injection (TKT-0015 Prompts 2b & 3)
 *
 * Auto-injects audit user FKs onto every write operation on tenant-scoped models
 * that carry these fields. Supports two Prisma field naming conventions:
 *   - Modern standard: `createdById` / `updatedById` (37 models, adopted post-Wave 1)
 *   - Older convention: `createdBy` / `updatedBy` (10 models — 8 Driver Pay + PlaybookStep + StepInstance)
 *
 * The extension detects which convention each model uses via a precomputed registry
 * built once at factory invocation by walking `Prisma.dmmf.datamodel.models`.
 * This costs O(|models|) once at startup and O(1) per query lookup thereafter,
 * fully typed with no `as any` escape hatches.
 *
 * COMPOSITION ORDER:
 *   client.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId))
 * RLS first (injects tenantId), audit second (injects user FKs). This order keeps
 * tenant isolation as the outer-most guarantee.
 *
 * BEHAVIOUR:
 *   - create / createMany / createManyAndReturn:
 *       if the model's create-field is missing AND userId is non-null → inject it.
 *       same rule for the update-field (initial value on create).
 *   - update / updateMany:
 *       if the model's update-field is missing AND userId is non-null → inject it.
 *       NEVER touch the create-field on update.
 *   - upsert:
 *       on create branch: inject both create-field and update-field (same rule as create).
 *       on update branch: inject update-field only.
 *   - read / delete operations: pass through untouched.
 *
 * NAMING-CONVENTION DETECTION:
 *   `buildAuditFieldRegistry()` walks `Prisma.dmmf.datamodel.models` once and records,
 *   for each model, whether its create-side field is `createdById` or `createdBy` (or null
 *   if neither exists), and similarly for the update side. Per-query injection then does a
 *   single Map.get() to resolve field names — no per-query DMMF walk, no string guessing.
 *   The registry is lazily memoized at module scope (populated on first `withAuditColumns`
 *   call) to avoid module-load side-effects.
 *
 * USERID NULL HANDLING:
 *   - When userId is null (e.g. system cron jobs, anonymous flows, seeding):
 *       extension performs NO injection. Caller may pass explicit value in args.data.
 *   - Caller-supplied value (args.data already has the field) is always preserved.
 *
 * CREATE-ONLY MODELS:
 *   Models in CREATE_ONLY_AUDIT_MODELS skip update-field injection entirely
 *   (immutable records: FleetMessage messages are never updated).
 *
 * EXEMPT MODELS:
 *   Models in EXEMPT_AUDIT_MODELS carry NO audit FK fields of either convention
 *   and are passed through without any injection attempt.
 *   These are legitimately system-generated, audit-log tables, or junction tables
 *   with no meaningful user actor. No naming-workaround models remain here
 *   after Prompt 3 (quick-366).
 */

// ── Audit field naming types ──────────────────────────────────────────────────

type CreateFieldName = 'createdById' | 'createdBy';
type UpdateFieldName = 'updatedById' | 'updatedBy';

type AuditFieldNames = {
  createField: CreateFieldName | null;
  updateField: UpdateFieldName | null;
};

// ── Lazy-memoized registry ────────────────────────────────────────────────────

let auditFieldRegistry: Map<string, AuditFieldNames> | null = null;

/**
 * Build a precomputed registry of audit field names per model.
 *
 * Walks `Prisma.dmmf.datamodel.models` exactly once. For each model it checks
 * the field list for `createdById` (modern) then `createdBy` (older convention);
 * same for the update side. The result is a Map<modelName, { createField, updateField }>
 * enabling O(1) per-query lookup with zero per-query DMMF traversal cost.
 *
 * Called lazily on the first `withAuditColumns` invocation; cached for the
 * lifetime of the process (DMMF is static at runtime).
 */
function buildAuditFieldRegistry(): Map<string, AuditFieldNames> {
  const registry = new Map<string, AuditFieldNames>();
  for (const model of Prisma.dmmf.datamodel.models) {
    const fieldNames = new Set(model.fields.map((f) => f.name));

    const createField: CreateFieldName | null = fieldNames.has('createdById')
      ? 'createdById'
      : fieldNames.has('createdBy')
        ? 'createdBy'
        : null;

    const updateField: UpdateFieldName | null = fieldNames.has('updatedById')
      ? 'updatedById'
      : fieldNames.has('updatedBy')
        ? 'updatedBy'
        : null;

    registry.set(model.name, { createField, updateField });
  }
  return registry;
}

function getAuditFieldRegistry(): Map<string, AuditFieldNames> {
  if (!auditFieldRegistry) {
    auditFieldRegistry = buildAuditFieldRegistry();
  }
  return auditFieldRegistry;
}

// ── Models that participate in audit-column injection but only receive the ────
// ── create-side field (no update-side injection — immutable/append-only). ────
const CREATE_ONLY_AUDIT_MODELS = new Set([
  'FleetMessage',
  'FuelRecord', // append-only fuel logs — no updatedById / updatedBy column exists
  'RouteTemplateStop', // template stops have no updatedAt column — create-only
]);

// ── Models that do NOT carry audit FK fields of either convention. ────────────
// ── The extension passes these through without attempting injection. ───────────
// ── These are legitimately system-generated, audit-log tables, or junction ────
// ── tables. No naming-workaround models remain here after quick-366 (Prompt 3). ──
const EXEMPT_AUDIT_MODELS = new Set([
  'Tenant',
  'TicketMessage',
  'AuditLog',
  'DriverPayAuditLog',
  'DispatchOverrideAudit',
  'NotificationLog',
  'NotificationSendLog',
  'AutomationRun',
  'AppEvent',
  'PlaybookNotification',
  'GPSLocation',
  'GpsReport',
  'SafetyEvent',
  'ActivationProgress',
  'TenantHealthScore',
  'TenantMetricsDaily',
  'Subscription',
  'TagAssignment',
  'DriverRouteJoin',
]);

export function withAuditColumns(userId: string | null) {
  const registry = getAuditFieldRegistry();

  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query }) {
            // No session user → never inject (caller supplies explicitly if needed).
            if (userId == null) {
              return query(args);
            }

            if (EXEMPT_AUDIT_MODELS.has(model ?? '')) {
              return query(args);
            }

            const reg = registry.get(model ?? '');
            if (!reg) {
              // Model not found in DMMF registry — pass through safely.
              return query(args);
            }

            // If the model has neither convention on either side, nothing to inject.
            if (!reg.createField && !reg.updateField) {
              return query(args);
            }

            const a = args as Record<string, unknown>;
            const createOnly = CREATE_ONLY_AUDIT_MODELS.has(model ?? '');

            const injectOnData = (
              data: Record<string, unknown>,
              fields: string[],
            ): Record<string, unknown> => {
              const next: Record<string, unknown> = { ...data };
              for (const f of fields) {
                if (next[f] === undefined) {
                  next[f] = userId;
                }
              }
              return next;
            };

            // Resolve field names for create-side and update-side operations.
            const createFields: string[] = [];
            if (reg.createField) createFields.push(reg.createField);
            if (!createOnly && reg.updateField) createFields.push(reg.updateField);

            const updateFields: string[] = [];
            if (!createOnly && reg.updateField) updateFields.push(reg.updateField);

            switch (operation) {
              case 'create': {
                const data = (a.data ?? {}) as Record<string, unknown>;
                a.data = injectOnData(data, createFields);
                break;
              }

              case 'createMany':
              case 'createManyAndReturn': {
                const data = a.data;
                if (Array.isArray(data)) {
                  a.data = data.map((item) =>
                    injectOnData(item as Record<string, unknown>, createFields),
                  );
                } else if (data && typeof data === 'object') {
                  a.data = injectOnData(data as Record<string, unknown>, createFields);
                }
                break;
              }

              case 'update': {
                if (createOnly) break;
                const data = (a.data ?? {}) as Record<string, unknown>;
                a.data = injectOnData(data, updateFields);
                break;
              }

              case 'updateMany': {
                if (createOnly) break;
                const data = (a.data ?? {}) as Record<string, unknown>;
                a.data = injectOnData(data, updateFields);
                break;
              }

              case 'upsert': {
                const createData = (a.create ?? {}) as Record<string, unknown>;
                const updateData = (a.update ?? {}) as Record<string, unknown>;
                a.create = injectOnData(createData, createFields);
                if (!createOnly) {
                  a.update = injectOnData(updateData, updateFields);
                }
                break;
              }

              default:
                // findMany / findUnique / delete / aggregate / etc. — pass through.
                return query(args);
            }

            return query(args);
          },
        },
      },
    }),
  );
}
