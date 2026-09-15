/**
 * quick-610 — the minimal STAGING fixture rows the cold-pool probe needs.
 *
 *   npx tsx scripts/audit/610-staging-fixtures.ts --ensure
 *   npx tsx scripts/audit/610-staging-fixtures.ts --report
 *
 * ─── WHY THIS EXISTS ───────────────────────────────────────────────────────
 *
 * The BEFORE direction does NOT need rows. Measured first, and it is the
 * opposite of what the quick-606 LATENT trap would lead you to expect: with the
 * tripwire armed and no tenant context, `SELECT count(*)` raises `TC001` on an
 * EMPTY table exactly as it does on a populated one, because the policy
 * expression is evaluated at scan setup and not per row.
 *
 * The AFTER direction is where rows are load-bearing. "The legitimate read
 * succeeds" over a table holding zero rows is the vacuous pass that
 * `app-user-failure-remediation.md` §8 item 7 names — five of that task's rows
 * ended LATENT for precisely this reason. And the cross-tenant direction is
 * worse than vacuous without rows: "tenant B's rows are not visible" is trivially
 * true when tenant B has none, so the refusal proves nothing at all.
 *
 * So: every table a probe reads must hold at least one row for BOTH staging
 * tenants. `User` already does (6 / 4). `Truck`, `Document` and
 * `NotificationSendLog` do not — `NotificationSendLog` holds 14 rows whose
 * `tenantId` matches NEITHER tenant in `"Tenant"` (they are orphans from an
 * earlier task; this script does not touch them).
 *
 * ─── STAGING ONLY ──────────────────────────────────────────────────────────
 *
 * MUST NEVER IMPORT `scripts/_bootstrap-env`. It loads `apps/web/.env.staging`
 * explicitly and refuses POSITIVELY on anything that is not the staging ref —
 * the tripwire-arm rule: a positive match fails closed against a database that
 * does not exist yet, a mistyped ref, or a restored snapshot under a new id.
 *
 * Idempotent: every row carries a deterministic id, and every insert is
 * `ON CONFLICT (id) DO NOTHING`. Re-running writes nothing. Runs as `postgres`
 * because seeding two tenants from one connection is precisely the cross-tenant
 * write RLS exists to refuse.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'path';
import { mkdirSync, writeFileSync } from 'fs';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/610-close-the-five-latent-createtenantclient/evidence',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`610-staging-fixtures: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

/** The two staging tenants, by name. Ids are read, never hardcoded. */
const TENANT_NAMES = ['Staging Alpha Carriers', 'Staging Beta Logistics'] as const;

/** Deterministic fixture ids, so --ensure is a no-op on the second run. */
const FIXTURE_IDS = {
  truck: ['610a0000-0000-4610-8000-000000000001', '610a0000-0000-4610-8000-000000000002'],
  document: ['610d0000-0000-4610-8000-000000000001', '610d0000-0000-4610-8000-000000000002'],
  sendLog: ['610e0000-0000-4610-8000-000000000001', '610e0000-0000-4610-8000-000000000002'],
} as const;

async function main() {
  const mode = process.argv.includes('--ensure') ? 'ensure' : 'report';
  const client = new Client({ connectionString: staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL') });
  await client.connect();

  const who = await client.query('select current_user, current_setting($1, true) as ref', ['server_version']);
  console.error(`[610-fixtures] role=${who.rows[0].current_user} project=${STAGING_REF} mode=${mode}`);

  const tenants = await client.query(
    'select id, name from "Tenant" where name = any($1) order by name',
    [TENANT_NAMES as unknown as string[]],
  );
  if (tenants.rows.length !== 2) {
    refuse(`expected both staging tenants by name, found ${tenants.rows.length}`);
  }
  const tenantIds: string[] = tenants.rows.map((r) => r.id);

  // One real user per tenant — Document.uploadedBy is NOT NULL and is a real FK.
  const uploaders: string[] = [];
  for (const t of tenantIds) {
    const u = await client.query('select id from "User" where "tenantId" = $1 order by "createdAt" limit 1', [t]);
    if (!u.rows.length) refuse(`tenant ${t} has no User row to own a fixture Document`);
    uploaders.push(u.rows[0].id);
  }

  if (mode === 'ensure') {
    for (let i = 0; i < 2; i++) {
      const tenantId = tenantIds[i];
      const tag = i === 0 ? 'ALPHA' : 'BETA';

      await client.query(
        `insert into "Truck" (id, "tenantId", make, model, year, vin, "licensePlate", odometer, "updatedAt")
         values ($1,$2,'Fixture','Q610',2020,$3,$4,0, now())
         on conflict (id) do nothing`,
        [FIXTURE_IDS.truck[i], tenantId, `QUICK610FIXTUREVIN${i}`, `Q610-${tag}`],
      );

      await client.query(
        `insert into "Document" (id, "tenantId", "fileName", "s3Key", "contentType", "sizeBytes", "uploadedBy", "truckId", "updatedAt")
         values ($1,$2,$3,$4,'application/pdf',1,$5,$6, now())
         on conflict (id) do nothing`,
        [
          FIXTURE_IDS.document[i],
          tenantId,
          `quick610-${tag}.pdf`,
          `tenant-${tenantId}/quick610-${tag}.pdf`,
          uploaders[i],
          FIXTURE_IDS.truck[i],
        ],
      );

      await client.query(
        `insert into "NotificationSendLog" (id, "tenantId", "triggerKey", channel, status, "idempotencyKey", "updatedAt")
         values ($1,$2,'quick610.fixture','IN_APP'::"NotificationChannel",'SENT'::"NotificationSendStatus",$3, now())
         on conflict (id) do nothing`,
        [FIXTURE_IDS.sendLog[i], tenantId, `quick610-fixture-${tag}`],
      );
    }
  }

  // Report — per tenant, per table, so a vacuous AFTER pass is impossible to miss.
  const report: Record<string, unknown> = { at: new Date().toISOString(), mode, project: STAGING_REF, tenants: {} };
  for (let i = 0; i < 2; i++) {
    const tenantId = tenantIds[i];
    const counts: Record<string, number> = {};
    for (const tbl of ['User', 'Truck', 'Document', 'NotificationSendLog']) {
      const r = await client.query(`select count(*)::int n from "${tbl}" where "tenantId" = $1`, [tenantId]);
      counts[tbl] = r.rows[0].n;
    }
    (report.tenants as Record<string, unknown>)[tenants.rows[i].name] = { id: tenantId, counts };
    console.log(
      `${tenants.rows[i].name} (${tenantId}) — ` +
        Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' '),
    );
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '01-fixtures.json'), JSON.stringify(report, null, 2));
  await client.end();
}

main().catch((e) => {
  console.error('610-staging-fixtures FAILED:', e);
  process.exit(1);
});
