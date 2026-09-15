/**
 * quick-606 — which ROLE is denied on `PlaybookNotification`, and is it the only
 * table the two workflow sweeps lack?
 *
 *   npx tsx scripts/audit/606-grant-audit.ts
 *
 * The classification said `MISSING_GRANT ×2`, but the two are not the same
 * shape: `carrier-compliance-alerts` is `42501 permission denied for SCHEMA
 * public` — a DDL right, not a table grant. So the real grant work is ONE, and
 * the first question is which role it belongs to. `route.ts:145` is
 * `getAdminDb(...)`, so the statement runs as **`app_admin`**, not `app_user` —
 * asserted here against `information_schema.role_table_grants` rather than
 * assumed.
 *
 * Every table both sweeps touch is walked, for both roles, on BOTH databases.
 * Production is read READ-ONLY, one SELECT.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
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

/**
 * Every table reachable from the two workflow sweeps and from the four tenant
 * sweeps this task routes. Read off the `select` / `include` / nested-filter
 * trees in the route files, not guessed.
 */
const TABLES = [
  'StepInstance', // sweep 1 subject
  'PlaybookInstance', // sweep 2 subject, and sweep 1's nested relation
  'PlaybookNotification', // sweep 2's nested `notifications: { none: … }` filter
  'Tenant', // the four tenant sweeps
  'carrier_compliance_alert_log', // carrier-compliance-alerts' own log table
];
const ROLES = ['app_user', 'app_admin'];

const SQL = `
  SELECT grantee, table_name, privilege_type
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public'
     AND grantee = ANY($1::text[])
     AND table_name = ANY($2::text[])
   ORDER BY grantee, table_name, privilege_type`;

const TABLE_EXISTS = `
  SELECT table_name FROM information_schema.tables
   WHERE table_schema='public' AND table_name = ANY($1::text[]) ORDER BY table_name`;

const ROLE_EXISTS = `SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = ANY($1::text[]) ORDER BY rolname`;

async function survey(url: string) {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const grants = (await c.query<{ grantee: string; table_name: string; privilege_type: string }>(SQL, [ROLES, TABLES]))
      .rows;
    const tables = (await c.query<{ table_name: string }>(TABLE_EXISTS, [TABLES])).rows.map((r) => r.table_name);
    const roles = (await c.query<{ rolname: string; rolbypassrls: boolean }>(ROLE_EXISTS, [ROLES])).rows;
    const byRole: Record<string, Record<string, string[]>> = {};
    for (const r of ROLES) {
      byRole[r] = {};
      for (const t of TABLES) byRole[r][t] = [];
    }
    for (const g of grants) byRole[g.grantee][g.table_name].push(g.privilege_type);
    return { tablesPresent: tables, tablesAbsent: TABLES.filter((t) => !tables.includes(t)), roles, byRole };
  } finally {
    await c.end();
  }
}

(async () => {
  const text = readFileSync(resolve(REPO_ROOT, '.env'), 'utf8').replace(/\r\n/g, '\n');
  const prodUrl = text.match(/^DIRECT_URL\s*=\s*"?([^"\n]+)"?\s*$/m)![1];
  if (!prodUrl.includes(PRODUCTION_REF)) throw new Error('repo-root DIRECT_URL does not name production');
  const stgUrl = process.env.STAGING_DIRECT_URL!;
  if (stgUrl.includes(PRODUCTION_REF) || !stgUrl.includes(STAGING_REF)) throw new Error('bad staging url');

  const production = await survey(prodUrl);
  const staging = await survey(stgUrl.replace(':6543/', ':5432/').replace('?pgbouncer=true', ''));

  const record = { task: 'quick-606', at: new Date().toISOString(), tables: TABLES, roles: ROLES, production, staging };
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '07-grants.json'), JSON.stringify(record, null, 2) + '\n');

  for (const [label, s] of [
    ['PRODUCTION', production],
    ['STAGING', staging],
  ] as const) {
    console.log(`=== ${label}`);
    console.log(`  roles: ${s.roles.map((r) => `${r.rolname}(bypassrls=${r.rolbypassrls})`).join(', ') || '(none)'}`);
    if (s.tablesAbsent.length) console.log(`  TABLES ABSENT: ${s.tablesAbsent.join(', ')}`);
    for (const role of ROLES) {
      for (const t of TABLES) {
        const p = s.byRole[role][t];
        console.log(`  ${role.padEnd(10)} ${t.padEnd(30)} ${p.length ? p.sort().join(',') : '— NO GRANT —'}`);
      }
    }
  }
})();
