/**
 * quick-619 — READ-ONLY. `sendPushToOrg` filters PushToken by `user.tenantId`;
 * routing it adds `PushToken.tenantId = orgId` via withTenantRLS. The two agree
 * only if every token's own tenantId equals its user's. A disagreement would mean
 * routing silently drops pushes — a change on SUCCESS — so it is measured on
 * both databases before the edit. Production: one SELECT count.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'path';
const APP_ROOT = resolve(__dirname, '../..');
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const s = process.env.STAGING_DIRECT_URL!;
loadEnv({ path: resolve(APP_ROOT, '.env.local'), quiet: true });
const p = process.env.DIRECT_URL!;
async function run(url: string, label: string, must: string) {
  if (!url.includes(must)) throw new Error(`${label} url does not name ${must}`);
  const c = new Client({ connectionString: url.replace(':6543/', ':5432/').replace('?pgbouncer=true', '') });
  await c.connect();
  const r = await c.query(
    `SELECT count(*)::int AS tokens,
            count(*) FILTER (WHERE pt."tenantId" IS DISTINCT FROM u."tenantId")::int AS disagree
       FROM "PushToken" pt JOIN "User" u ON u.id = pt."userId"`,
  );
  console.log(`${label.padEnd(10)} PushToken tokens=${r.rows[0].tokens} tenant_disagrees_with_user=${r.rows[0].disagree}`);
  await c.end();
}
(async () => {
  await run(s, 'staging', 'wyixpgunnjmzguhggocz');
  await run(p, 'production', 'oqdhberkghtnszrkdvfm');
})().catch((e) => { console.error(e); process.exit(1); });
