/**
 * quick-606 — prove `/api/cron/carrier-compliance-alerts` actually INSERTS.
 *
 *   npx tsx scripts/audit/606-compliance-insert-probe.ts
 *
 * R2 again, and the reason it is needed is the same: the route answered
 * `200 {"orgs_processed":2,"total_alerts_found":0}` after the fix, and with ZERO
 * alerts found the `INSERT INTO carrier_compliance_alert_log` never ran. A pass
 * over a path that did not execute is not evidence about that path.
 *
 * `carrier_compliance_alert_log` carries a live `tenant_isolation_policy` on
 * `org_id` and the INSERT is RAW — not intercepted by the Prisma extension — so
 * the only thing that can satisfy the policy is `app.current_tenant_id` on the
 * connection. An INSERT refused by a policy is `42501`, not a silent zero; an
 * INSERT that finds nothing to write is a silent zero. Both must be excluded.
 *
 *   1. seed ONE disposable `carrier_drivers` row per tenant with a CDL expiring
 *      inside the 60-day window the route alerts on;
 *   2. note the alert-log high-water mark per tenant;
 *   3. run the cron;
 *   4. COUNTER-READ on the privileged connection that NEW rows exist for BOTH
 *      tenants, and that each row's `org_id` is the tenant it belongs to;
 *   5. delete the probe drivers AND the probe log rows, and assert zero survive.
 *
 * STAGING ONLY. Never imports `scripts/_bootstrap-env`.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence',
);
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

const BASE = process.env.CLICK_THROUGH_BASE ?? 'http://localhost:3000';
const CRON_SECRET = process.env.CRON_SECRET ?? '';

function refuse(reason: string): never {
  console.error(`606-compliance-insert-probe: REFUSING — ${reason}`);
  process.exit(1);
}

const url = process.env.STAGING_DIRECT_URL;
if (!url) refuse('STAGING_DIRECT_URL unset');
if (url.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
if (!url.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');
if (!CRON_SECRET) refuse('CRON_SECRET unset');

async function priv<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const who = (await c.query<{ cu: string }>('SELECT current_user AS cu')).rows[0].cu;
    if (who === 'app_user') refuse('the counter-read connection is app_user');
    return await fn(c);
  } finally {
    await c.end();
  }
}

(async () => {
  const tenants = await priv(async (c) =>
    (await c.query<{ id: string; slug: string }>(`SELECT id, slug FROM public."Tenant" WHERE "isActive" = true ORDER BY slug`))
      .rows,
  );
  if (tenants.length < 2) refuse(`expected 2 active tenants, found ${tenants.length}`);

  const probeDrivers: { id: string; tenantId: string; slug: string }[] = [];
  const before: Record<string, number> = {};

  await priv(async (c) => {
    for (const t of tenants) {
      before[t.id] = Number(
        (
          await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM public.carrier_compliance_alert_log WHERE org_id = $1::uuid',
            [t.id],
          )
        ).rows[0].n,
      );
      const id = randomUUID();
      // `cdl_expiry` is @db.Date (quick-541) — a calendar date, written as one.
      // `status` must be 'active' or getComplianceAlerts skips the row.
      await c.query(
        `INSERT INTO public.carrier_drivers
           (id, org_id, first_name, last_name, status, cdl_expiry, created_at, updated_at)
         VALUES ($1::uuid, $2::uuid, '606Probe', $3, 'active', (now() + interval '20 days')::date, now(), now())`,
        [id, t.id, `Cdl-${id.slice(0, 8)}`],
      );
      probeDrivers.push({ id, tenantId: t.id, slug: t.slug });
    }
  });
  console.log(`seeded ${probeDrivers.length} disposable carrier_drivers with a CDL expiring in 20 days`);

  const res = await fetch(`${BASE}/api/cron/carrier-compliance-alerts`, {
    headers: { Authorization: `Bearer ${CRON_SECRET}` },
  });
  const bodyText = await res.text();
  let body: any = null;
  try {
    body = JSON.parse(bodyText);
  } catch {
    /* raw below */
  }
  console.log(`cron: HTTP ${res.status}  ${bodyText.slice(0, 300)}`);

  const after: Record<string, number> = {};
  const misScoped: string[] = [];
  await priv(async (c) => {
    for (const t of tenants) {
      after[t.id] = Number(
        (
          await c.query<{ n: number }>(
            'SELECT count(*)::int AS n FROM public.carrier_compliance_alert_log WHERE org_id = $1::uuid',
            [t.id],
          )
        ).rows[0].n,
      );
    }
    // Every row written for a probe driver must carry ITS tenant's org_id.
    for (const d of probeDrivers) {
      const r = await c.query<{ org_id: string }>(
        'SELECT org_id FROM public.carrier_compliance_alert_log WHERE entity_id = $1',
        [d.id],
      );
      for (const row of r.rows) if (row.org_id !== d.tenantId) misScoped.push(`${d.id} -> ${row.org_id}`);
    }
  });

  const inserted = tenants.map((t) => ({ slug: t.slug, before: before[t.id], after: after[t.id] }));
  const everyTenantGrew = tenants.every((t) => after[t.id] > before[t.id]);

  // --- cleanup, both tables, with a counter-read --------------------------
  const cleanup = await priv(async (c) => {
    const logs = await c.query(
      `DELETE FROM public.carrier_compliance_alert_log WHERE entity_id = ANY($1::text[])`,
      [probeDrivers.map((d) => d.id)],
    );
    const drv = await c.query(`DELETE FROM public.carrier_drivers WHERE first_name = '606Probe'`);
    const leftDrivers = Number(
      (await c.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.carrier_drivers WHERE first_name = '606Probe'`))
        .rows[0].n,
    );
    const leftLogs = Number(
      (
        await c.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM public.carrier_compliance_alert_log WHERE entity_id = ANY($1::text[])`,
          [probeDrivers.map((d) => d.id)],
        )
      ).rows[0].n,
    );
    return { logsDeleted: logs.rowCount, driversDeleted: drv.rowCount, leftDrivers, leftLogs };
  });

  const verdict =
    everyTenantGrew && misScoped.length === 0
      ? 'INSERTED — the alert-log row count grew for BOTH tenants, and every probe row carries its own tenant org_id'
      : 'NOT PROVEN';

  const record = {
    task: 'quick-606',
    at: new Date().toISOString(),
    probeDrivers,
    cron: { status: res.status, body: body ?? bodyText.slice(0, 2000) },
    alertLogCounts: inserted,
    everyTenantGrew,
    misScopedRows: misScoped,
    cleanup,
    verdict,
  };
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '07-compliance-insert-probe.json'), JSON.stringify(record, null, 2) + '\n');

  for (const i of inserted) console.log(`  ${i.slug}: alert log ${i.before} -> ${i.after}`);
  console.log(`mis-scoped rows: ${misScoped.length}`);
  console.log(`cleanup: ${JSON.stringify(cleanup)}`);
  console.log(`VERDICT: ${verdict}`);

  if (cleanup.leftDrivers !== 0 || cleanup.leftLogs !== 0) {
    console.error('PROBE ROWS SURVIVED CLEANUP.');
    process.exit(1);
  }
  process.exit(verdict.startsWith('INSERTED') ? 0 : 2);
})();
