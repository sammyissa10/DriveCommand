import { Prisma } from '../../../generated/prisma/client';

/**
 * Prisma Client Extension — Audit Column Injection (TKT-0015 Prompt 2b)
 *
 * Auto-injects createdById / updatedById onto every write operation on
 * tenant-scoped models that carry these fields.
 *
 * COMPOSITION ORDER:
 *   client.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId))
 * RLS first (injects tenantId), audit second (injects user FKs). This order keeps
 * tenant isolation as the outer-most guarantee.
 *
 * BEHAVIOUR:
 *   - create / createMany / createManyAndReturn:
 *       if args.data.createdById is missing AND userId is non-null → inject it.
 *       same rule for updatedById (initial value on create).
 *   - update / updateMany:
 *       if args.data.updatedById is missing AND userId is non-null → inject it.
 *       NEVER touch createdById on update.
 *   - upsert:
 *       on create branch: inject both createdById and updatedById (same rule as create).
 *       on update branch: inject updatedById only.
 *   - read / delete operations: pass through untouched.
 *
 * USERID NULL HANDLING:
 *   - When userId is null (e.g. system cron jobs, anonymous flows, seeding):
 *       extension performs NO injection. Caller may pass explicit value in args.data.
 *   - Caller-supplied value (args.data already has the field) is always preserved.
 *
 * CREATE-ONLY MODELS:
 *   Models in CREATE_ONLY_AUDIT_MODELS skip updatedById injection entirely
 *   (immutable records: FleetMessage messages are never updated).
 *
 * EXEMPT MODELS:
 *   Models in EXEMPT_AUDIT_MODELS do not carry audit FK fields and are passed
 *   through without any injection attempt.
 */

// Models that participate in audit-column injection but only receive createdById
// (no updatedById injection ever — immutable/append-only records).
const CREATE_ONLY_AUDIT_MODELS = new Set([
  'FleetMessage',
  'FuelRecord', // append-only fuel logs — no updatedById column exists
  'RouteTemplateStop', // template stops have no updatedAt column — create-only
]);

// Models that do NOT have createdById / updatedById fields.
// The extension passes these through without attempting injection.
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
  // Driver Pay models use createdBy/updatedBy (not createdById/updatedById).
  // They predate the rollout and use explicit writes in their API routes.
  'DriverCompensationTemplate',
  'LoadDriverAssignment',
  'LoadPayComponent',
  'PayComponentAttachment',
  'DriverBonus',
  'DriverDeduction',
  'DriverSettlement',
  'DriverDispute',
  // Workflow models with pre-existing createdBy/updatedBy fields (from quick-327).
  // They also use explicit writes and do not carry createdById/updatedById.
  'PlaybookStep',
  'StepInstance',
]);

export function withAuditColumns(userId: string | null) {
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

            const a = args as Record<string, unknown>;
            const createOnly = CREATE_ONLY_AUDIT_MODELS.has(model ?? '');

            const injectOnData = (
              data: Record<string, unknown>,
              fields: Array<'createdById' | 'updatedById'>,
            ): Record<string, unknown> => {
              const next: Record<string, unknown> = { ...data };
              for (const f of fields) {
                if (next[f] === undefined) {
                  next[f] = userId;
                }
              }
              return next;
            };

            switch (operation) {
              case 'create': {
                const data = (a.data ?? {}) as Record<string, unknown>;
                const fields: Array<'createdById' | 'updatedById'> = createOnly
                  ? ['createdById']
                  : ['createdById', 'updatedById'];
                a.data = injectOnData(data, fields);
                break;
              }

              case 'createMany':
              case 'createManyAndReturn': {
                const data = a.data;
                const fields: Array<'createdById' | 'updatedById'> = createOnly
                  ? ['createdById']
                  : ['createdById', 'updatedById'];
                if (Array.isArray(data)) {
                  a.data = data.map((item) =>
                    injectOnData(item as Record<string, unknown>, fields),
                  );
                } else if (data && typeof data === 'object') {
                  a.data = injectOnData(data as Record<string, unknown>, fields);
                }
                break;
              }

              case 'update': {
                if (createOnly) break;
                const data = (a.data ?? {}) as Record<string, unknown>;
                a.data = injectOnData(data, ['updatedById']);
                break;
              }

              case 'updateMany': {
                if (createOnly) break;
                const data = (a.data ?? {}) as Record<string, unknown>;
                a.data = injectOnData(data, ['updatedById']);
                break;
              }

              case 'upsert': {
                const createData = (a.create ?? {}) as Record<string, unknown>;
                const updateData = (a.update ?? {}) as Record<string, unknown>;
                const createFields: Array<'createdById' | 'updatedById'> = createOnly
                  ? ['createdById']
                  : ['createdById', 'updatedById'];
                a.create = injectOnData(createData, createFields);
                if (!createOnly) {
                  a.update = injectOnData(updateData, ['updatedById']);
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
