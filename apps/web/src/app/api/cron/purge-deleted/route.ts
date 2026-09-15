import { NextRequest } from 'next/server';
import { getAdminDb } from '@/lib/db/admin-prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { verifyCronSecret, cronUnauthorizedResponse } from '@/lib/security/cron-auth';
import { logger } from '@/lib/logger';
import { CronFailures, cronStatus } from '@/lib/cron/failure-report';
import { SOFT_DELETE_RETENTION_DAYS } from '@/lib/carrier/soft-delete';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  logger.info('[CRON] purge-deleted: Starting');

  if (!verifyCronSecret(request)) {
    logger.error('[CRON] purge-deleted: Unauthorized request');
    return cronUnauthorizedResponse();
  }

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - SOFT_DELETE_RETENTION_DAYS);

  /**
   * quick-603 — `results` now holds SUCCESSES ONLY.
   *
   * It used to hold `-1` for a failed model, and the total on the old line 50
   * summed `Object.values(results)` through a positives-only filter — which
   * threw the `-1` away, so seven failures produced `totalPurged: 0`, the same
   * number a clean run with nothing to purge produces. Encoding a failure as a
   * number in a collection that later gets summed is what made the erasure
   * possible; keeping failures in a separate structure is what makes it
   * impossible. (The old predicate is deliberately not quoted here — the audit's
   * verification greps for it and must find no match in this file.)
   */
  const results: Record<string, number> = {};
  const failures = new CronFailures();

  /**
   * quick-606 — THE SEVEN `deleteMany`s USED TO RUN ON THE BARE CLIENT, and a
   * DELETE refused by RLS is a SILENT ZERO, not an error
   * (`policy-satisfiability-sweep.md` §4.1 as corrected by quick-599). The route
   * would then report `totalPurged: 0` — the same number a clean run with
   * nothing to purge produces, which is precisely the erasure quick-603 removed
   * from this file once already, arriving by a different door. On staging with
   * the tripwire armed it raised instead: **28** `TC001` in one run
   * (quick-606 `evidence/02-reverify.json` row 8).
   *
   * The shape is the tenant list on the admin connection and the per-tenant work
   * under a client that sets the GUC. Deliberately NOT the other way round:
   * routing the DELETEs themselves to `getAdminDb` would need DELETE grants for
   * `app_admin` on seven tables — the "never `ALL TABLES IN SCHEMA`" widening R5
   * forbids — and would remove seven statements from the tripwire's reach
   * (`unmigrated-path-tripwire.md` §8 item 2).
   *
   * Note for anyone reading the scoping: SIX of these seven models are in
   * `withTenantRLS`'s EXEMPT_MODELS (they carry `orgId`, not `tenantId`), so the
   * Prisma layer injects NOTHING for them and their isolation here is RLS alone,
   * via the GUC. `Route` is the one legacy model with `tenantId`, and it is
   * injected. That asymmetry is why the GUC is not optional on this path.
   */
  const adminDb = await getAdminDb('soft-delete purge tenant sweep');
  const tenants = await adminDb.tenant.findMany({
    where: { isActive: true },
    select: { id: true },
  });
  logger.info(`[CRON] purge-deleted: ${tenants.length} active tenant(s)`);

  const MODEL_NAMES = [
    'CarrierLoad',
    'Trip',
    'CarrierContract',
    'CarrierClient',
    'CarrierDriver',
    'CarrierTruck',
    'Route',
  ] as const;
  const MODEL_ACCESSORS: Record<(typeof MODEL_NAMES)[number], string> = {
    CarrierLoad: 'carrierLoad',
    Trip: 'trip',
    CarrierContract: 'carrierContract',
    CarrierClient: 'carrierClient',
    CarrierDriver: 'carrierDriver',
    CarrierTruck: 'carrierTruck',
    Route: 'route',
  };
  for (const name of MODEL_NAMES) results[name] = 0;

  let tenantsProcessed = 0;
  for (const tenant of tenants) {
    let db;
    try {
      db = await getTenantPrismaForOrg(tenant.id);
    } catch (err) {
      failures.record('[CRON] purge-deleted: could not acquire tenant context', `tenant:${tenant.id}`, err);
      continue;
    }

    for (const name of MODEL_NAMES) {
      // The try STAYS and the loop STILL CONTINUES — one unpurgeable model must
      // not stop the other six, and one unpurgeable tenant must not stop the rest.
      try {
        const result = await (db as any)[MODEL_ACCESSORS[name]].deleteMany({
          where: {
            deletedAt: { not: null, lt: cutoffDate },
          },
        });
        results[name] += result.count;
        if (result.count > 0) {
          logger.info(`[CRON] purge-deleted: Purged ${result.count} ${name} records`, {
            tenantId: tenant.id,
          });
        }
      } catch (err) {
        failures.record(
          `[CRON] purge-deleted: Failed to purge ${name}`,
          `${name}:${tenant.id}`,
          err,
        );
      }
    }
    tenantsProcessed++;
  }

  const totalPurged = Object.values(results).reduce((a, b) => a + b, 0);
  const report = failures.report();
  logger.info('[CRON] purge-deleted: Completed', {
    totalPurged,
    tenantsProcessed,
    tenantsFound: tenants.length,
    results,
    ...report,
  });

  return Response.json(
    {
      success: failures.ok,
      totalPurged,
      // quick-606: named so a partial sweep cannot hide behind `totalPurged: 0`.
      // A run that covered fewer tenants than exist is a different fact from a
      // run that found nothing to purge, and the body has to be able to say so.
      tenantsProcessed,
      tenantsFound: tenants.length,
      results,
      ...report,
    },
    { status: cronStatus(failures) },
  );
}
