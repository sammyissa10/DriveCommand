import { Prisma } from '../../../generated/prisma/client';

/**
 * PROTOTYPE — NOT WIRED TO ANYTHING. Evaluated in docs/audits/guc-binding-fix.md.
 *
 * Nothing imports this file. It exists so the binding mechanism can be measured
 * against staging without touching the shipped `tenant-rls.ts` or any call site.
 * Do not import it from feature code without reading the audit's blast-radius
 * section first — §1 of that document explains why the `__internalParams` access
 * below is a real liability and what has to be true before it ships.
 *
 * WHAT IT FIXES
 * `getTenantPrisma()` sets `app.current_tenant_id` session-scoped on the bare
 * client and then returns an extended client. docs/audits/guc-binding.md measured
 * that this does not bind: at `max: 1` with two tenants interleaved, the pooled
 * connection was identical 24/24 and 12/24 operations still read the other
 * tenant's id, because every non-transactional Prisma statement is its own
 * pool checkout and the GUC is a last-writer-wins slot.
 *
 * HOW IT BINDS WITHOUT NESTING
 * The shipped extension's header forbids `client.$transaction([set_config, query])`
 * because that deadlocked (P2028) when feature code had already opened an outer
 * `prisma.$transaction`. The deadlock is caused by NESTING, not by the batch —
 * so this prototype only opens a transaction when it can see that it is not
 * already inside one:
 *
 *   no transaction   -> client.$transaction([ set_config(TRUE), operation ])
 *   inside an itx    -> issue set_config(TRUE) ON that same itx, open nothing
 *   inside a batch   -> see BATCH LIMITATION below
 *
 * In-transaction state is observable on the query-extension callback argument as
 * `__internalParams.transaction`: `undefined` outside, `{kind:'itx', id:<uuid>}`
 * inside an interactive transaction, `{kind:'batch', id:<number>}` inside an
 * array transaction. It is passed BY REFERENCE (the runtime hands the extension
 * its live params object), and it is private API.
 *
 * BATCH LIMITATION
 * Inside a `$transaction([...])` the operation is already in a transaction, so
 * opening another would deadlock, and injecting an extra request into a batch
 * mid-flight changes the result arity the caller is destructuring. This prototype
 * therefore passes batch operations through unbound — they keep exactly today's
 * behaviour, no better and no worse. Measured and reported in the audit.
 */

/** Kept byte-identical to the shipped extension so injection is not the variable. */
const EXEMPT_MODELS = new Set([
  'Tenant',
  'TicketMessage',
  'CarrierClient',
  'CarrierContract',
  'CarrierFacility',
  'CarrierDriver',
  'CarrierTruck',
  'RouteTemplate',
  'RouteTemplateStop',
  'CarrierLoad',
  'CarrierStop',
  'CarrierDocument',
  'CarrierExpense',
  'DriverPayRecord',
  'InAppNotification',
  'CarrierDocumentType',
  'CarrierCatalogMeta',
  'Trip',
  'CarrierClientContact',
  'DocumentImport',
  'DocumentImportPage',
  'FacilityExternalReference',
  'DocumentProfile',
  'RouteMatrixCache',
  'CarrierTruckDefect',
  'GridView',
  'GridPreference',
]);

const GUC_SQL = "SELECT set_config('app.current_tenant_id', $1, true)";

/**
 * Transaction descriptor as the runtime hands it to a query extension.
 * Private API: `__internalParams` carries the live params object.
 */
type TxDescriptor = { kind: 'itx'; id: string } | { kind: 'batch'; id: number };

/**
 * itx ids that already carry this tenant's GUC, so a transaction running ten
 * operations issues one set_config rather than ten. Keyed by `${itxId}:${tenantId}`
 * — never by itx id alone, so a descriptor could not inherit another tenant's
 * binding even if an id were reused.
 *
 * Bounded rather than unbounded: an itx id is never revisited after commit, so an
 * uncapped Set is a slow leak in a long-lived worker.
 */
const BOUND_ITX = new Set<string>();
const BOUND_ITX_CAP = 512;

function rememberItx(key: string): void {
  if (BOUND_ITX.size >= BOUND_ITX_CAP) {
    // drop the oldest insertion; Set preserves insertion order
    const oldest = BOUND_ITX.values().next().value;
    if (oldest !== undefined) BOUND_ITX.delete(oldest);
  }
  BOUND_ITX.add(key);
}

/**
 * Issue `set_config(..., TRUE)` INSIDE an interactive transaction that somebody
 * else opened.
 *
 * This is the private-API part of the prototype. `client._request` is the only
 * way to attach a raw statement to an existing transaction descriptor: the public
 * `$executeRawUnsafe` binds to whichever transaction its *client object* carries,
 * and a query extension is handed no client object (its `this` is not a client).
 *
 * Awaiting a public `$executeRawUnsafe` here instead would run the statement
 * outside the caller's transaction — a second connection — which at `max: 1` is
 * precisely the P2028 deadlock this design exists to avoid.
 */
async function setGucOnExistingItx(
  client: unknown,
  tenantId: string,
  tx: TxDescriptor,
): Promise<void> {
  const key = `${tx.id}:${tenantId}`;
  if (BOUND_ITX.has(key)) return;
  await (client as { _request: (p: unknown) => Promise<unknown> })._request({
    action: 'executeRaw',
    clientMethod: '$executeRawUnsafe',
    dataPath: [],
    transaction: tx,
    args: {
      query: GUC_SQL,
      parameters: { values: JSON.stringify([tenantId]), __prismaRawParameters__: true },
    },
  });
  rememberItx(key);
}

export function withTenantRLSBound(tenantId: string) {
  return Prisma.defineExtension((client) =>
    client.$extends({
      query: {
        $allModels: {
          async $allOperations({ operation, model, args, query, ...rest }) {
            const tx = (rest as { __internalParams?: { transaction?: TxDescriptor } })
              .__internalParams?.transaction;

            /**
             * Run `fn` with the GUC bound to the same transaction as the operation.
             *
             * Exempt models go through this too. They are exempt from tenantId
             * INJECTION because they have no such column — they are not exempt
             * from RLS, whose policies on those tables read the same GUC via
             * `orgId = current_tenant_id()`. Binding only the injected models
             * would leave every carrier table unprotected at cutover.
             */
            const bind = async (fn: () => unknown): Promise<unknown> => {
              if (!tx) {
                // Not in a transaction: one batch holds set_config and the operation.
                // Nothing is nested, so the P2028 shape cannot arise here.
                const results = (await (
                  client as unknown as { $transaction: (p: unknown[]) => Promise<unknown[]> }
                ).$transaction([
                  (client as unknown as {
                    $executeRawUnsafe: (sql: string, ...v: unknown[]) => unknown;
                  }).$executeRawUnsafe(GUC_SQL, tenantId),
                  fn(),
                ])) as unknown[];
                return results[1];
              }
              if (tx.kind === 'itx') {
                await setGucOnExistingItx(client, tenantId, tx);
                return fn();
              }
              // kind === 'batch' — see BATCH LIMITATION in the header.
              return fn();
            };

            if (EXEMPT_MODELS.has(model ?? '')) {
              return bind(() => query(args));
            }

            const a = args as Record<string, unknown>;

            switch (operation) {
              case 'findMany':
              case 'findFirst':
              case 'findFirstOrThrow':
              case 'count':
              case 'aggregate':
              case 'groupBy':
                a.where = a.where ? { AND: [{ tenantId }, a.where] } : { tenantId };
                break;

              /**
               * quick-618 — kept byte-for-byte in step with the shipped
               * extension's `findUnique` case, for the same reason EXEMPT_MODELS
               * is: this prototype exists so the BINDING mechanism can be
               * measured, and a second, stale isolation rule would make the
               * measurement about the wrong difference. Read the long note in
               * `tenant-rls.ts` for why the predicate moved into the `where`;
               * in short, `extendedWhereUnique` has been GA since Prisma 5 and
               * the post-check discarded a row for its OWN tenant whenever the
               * caller's top-level `select` omitted `tenantId`.
               *
               * If this prototype ever ships, it must not reintroduce the defect
               * the shipped file just had removed.
               */
              case 'findUnique':
              case 'findUniqueOrThrow': {
                a.where = { ...(a.where as object), tenantId };
                const result = await bind(() => query(args));
                const resultTenantId = (result as { tenantId?: string } | null)?.tenantId;
                if (result && resultTenantId !== undefined && resultTenantId !== tenantId) {
                  if (operation === 'findUniqueOrThrow') {
                    throw new Error(
                      `Tenant isolation violation: record belongs to another tenant`,
                    );
                  }
                  return null;
                }
                return result;
              }

              case 'create':
                a.data = { ...(a.data as object), tenantId };
                break;

              case 'createMany':
              case 'createManyAndReturn':
                if (Array.isArray(a.data)) {
                  a.data = a.data.map((item: object) => ({ ...item, tenantId }));
                } else {
                  a.data = { ...(a.data as object), tenantId };
                }
                break;

              case 'update':
                a.where = { ...(a.where as object), tenantId };
                break;

              case 'updateMany':
                a.where = a.where ? { AND: [{ tenantId }, a.where] } : { tenantId };
                break;

              case 'upsert':
                a.where = { ...(a.where as object), tenantId };
                a.create = { ...(a.create as object), tenantId };
                break;

              case 'delete':
                a.where = { ...(a.where as object), tenantId };
                break;

              case 'deleteMany':
                a.where = a.where ? { AND: [{ tenantId }, a.where] } : { tenantId };
                break;

              default:
                return bind(() => query(args));
            }

            return bind(() => query(args));
          },
        },
      },
    }),
  );
}
