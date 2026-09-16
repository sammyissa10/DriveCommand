/**
 * quick-618 — locate PRE-EXISTING rows in two tenants for the probe.
 *
 * Read-only. Prefers rows that already exist over fixtures it would have to
 * create: quick-617 proved cross-tenant on `Truck` and `User` with real rows,
 * and a probe that manufactures both sides proves less than one that reads what
 * the application actually stores.
 *
 *   npx tsx scripts/audit/618-fixtures.ts
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8';
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045';

const APP_ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function staging(raw: string | undefined, name: string): string {
  if (!raw) throw new Error(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) throw new Error(`${name} names PRODUCTION`);
  if (!raw.includes(STAGING_REF)) throw new Error(`${name} does not name staging`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

async function main() {
  const url = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');
  const u = new URL(url);
  console.error(
    `[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  (credential MASKED)`,
  );
  const c = new Client({ connectionString: url });
  await c.connect();

  for (const [table, idcol] of [
    ['Truck', 'id'],
    ['User', 'id'],
    ['Route', 'id'],
    ['Load', 'id'],
  ] as const) {
    const r = await c.query(
      `SELECT "tenantId", count(*)::int AS n, min("${idcol}"::text) AS sample
         FROM "${table}" WHERE "tenantId" = ANY($1) GROUP BY "tenantId" ORDER BY "tenantId"`,
      [[TENANT_A, TENANT_B]],
    );
    console.log(`\n${table}:`);
    for (const row of r.rows) {
      const which = row.tenantId === TENANT_A ? 'A' : row.tenantId === TENANT_B ? 'B' : '?';
      console.log(`  tenant ${which}  n=${row.n}  sample=${row.sample}`);
    }
    if (r.rows.length < 2) console.log('  <- NOT usable: needs a row in BOTH tenants');
  }

  await c.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
