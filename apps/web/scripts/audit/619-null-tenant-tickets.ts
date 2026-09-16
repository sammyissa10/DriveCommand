/**
 * quick-619 — READ-ONLY count behind the SupportTicket stop-and-report.
 * `SupportTicket.tenantId` is nullable and its only policy is
 * USING ("tenantId" = current_tenant_id()), so a null-tenant row can never be
 * admitted by any tenant GUC. Counts only; production opened for SELECT count(*).
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'path';
const APP_ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const s = process.env.STAGING_DIRECT_URL!;
loadEnv({ path: resolve(APP_ROOT, '.env.local'), quiet: true });
const p = process.env.DIRECT_URL!;
async function count(url: string, label: string, must: string) {
  if (!url.includes(must)) throw new Error(`${label} url does not name ${must}`);
  const c = new Client({ connectionString: url.replace(':6543/', ':5432/').replace('?pgbouncer=true', '') });
  await c.connect();
  const r = await c.query(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE "tenantId" IS NULL)::int AS null_tenant FROM "SupportTicket"`,
  );
  console.log(`${label.padEnd(10)} SupportTicket total=${r.rows[0].total} null_tenant=${r.rows[0].null_tenant}`);
  await c.end();
}
(async () => {
  await count(s, 'staging', 'wyixpgunnjmzguhggocz');
  await count(p, 'production', 'oqdhberkghtnszrkdvfm');
})().catch((e) => { console.error(e); process.exit(1); });
