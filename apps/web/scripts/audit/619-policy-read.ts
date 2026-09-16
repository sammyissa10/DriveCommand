/**
 * quick-619 — READ-ONLY: the live policies on every table the LIB_SERVICES
 * bypass statements reach, on staging AND production.
 *
 *   npx tsx scripts/audit/619-policy-read.ts
 *
 * Why before routing: three files carry comments asserting that their bypass is
 * load-bearing because a policy can never admit the read (`send-push.ts` on
 * PushToken, `security/audit-log.ts` on audit_log, and quick-616's census on
 * SupportTicket). A comment about a policy is not the policy (quick-610's
 * NotificationSendLog finding), so each claim is checked against `pg_policies`
 * here, and the routing decision follows the measurement rather than the prose.
 *
 * Production is opened for `pg_policies` / `pg_class` SELECTs only.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });
const stagingUrl = process.env.STAGING_DIRECT_URL;
loadEnv({ path: resolve(APP_ROOT, '.env.local'), quiet: true });
const prodUrl = process.env.DIRECT_URL;

const TABLES = [
  // routed candidates
  'DocFeedback', 'AutomationRun', 'User', 'Load', 'Route', 'RouteStop', 'ActivationProgress',
  'AppEvent', 'PlaybookInstance', 'Playbook', 'StepInstance', 'StepTemplate',
  'PlaybookNotification', 'Tenant', 'Truck',
  // stop candidates
  'PushToken', 'audit_log', 'SupportTicket', 'NotificationSendLog', 'carrier_drivers',
];

async function dump(url: string, label: string) {
  const norm = url.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
  const u = new URL(norm);
  console.error(`[db-target] ${label}  host : ${u.host}  role : ${u.username}  (READ-ONLY, credential MASKED)`);
  const c = new Client({ connectionString: norm });
  await c.connect();
  try {
    const out: Record<string, unknown> = {};
    for (const t of TABLES) {
      const rel = await c.query(
        `SELECT relrowsecurity, relforcerowsecurity FROM pg_class
          WHERE relname = $1 AND relnamespace = 'public'::regnamespace`,
        [t],
      );
      const pol = await c.query(
        `SELECT policyname, cmd, qual, with_check FROM pg_policies
          WHERE schemaname = 'public' AND tablename = $1 ORDER BY policyname`,
        [t],
      );
      out[t] = { rls: rel.rows[0] ?? null, policies: pol.rows };
    }
    return out;
  } finally {
    await c.end();
  }
}

async function main() {
  if (!stagingUrl?.includes(STAGING_REF)) throw new Error('STAGING_DIRECT_URL does not name staging');
  if (!prodUrl?.includes(PRODUCTION_REF)) throw new Error('DIRECT_URL does not name production');
  const s = await dump(stagingUrl, `${STAGING_REF} (staging)`);
  const p = await dump(prodUrl, 'PRODUCTION');
  for (const t of TABLES) {
    const sv = s[t] as { rls: unknown; policies: { policyname: string; cmd: string; qual: string; with_check: string }[] };
    const pv = p[t] as typeof sv;
    const same = JSON.stringify(sv) === JSON.stringify(pv);
    console.log(`\n### ${t}   rls=${JSON.stringify(sv.rls)}   staging==production: ${same}`);
    for (const r of sv.policies) {
      if (r.policyname === 'bypass_rls_policy') continue;
      console.log(`  [staging] ${r.policyname} ${r.cmd}  USING ${r.qual ?? '-'}  CHECK ${r.with_check ?? '-'}`);
    }
    if (!same) {
      for (const r of pv.policies) {
        if (r.policyname === 'bypass_rls_policy') continue;
        console.log(`  [prod]    ${r.policyname} ${r.cmd}  USING ${r.qual ?? '-'}  CHECK ${r.with_check ?? '-'}`);
      }
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
