/**
 * quick-612 — the `AutomationRule` per-command split, measured on STAGING.
 *
 *   npx tsx scripts/audit/612-policy-verify.ts --before
 *   npx tsx scripts/audit/612-policy-verify.ts --apply
 *   npx tsx scripts/audit/612-policy-verify.ts --after
 *
 * STAGING ONLY. MUST NEVER IMPORT `scripts/_bootstrap-env` — that file used to
 * repoint `DATABASE_URL` at `DIRECT_URL`, and every env file points `DIRECT_URL`
 * at PRODUCTION. This loads `apps/web/.env.staging` explicitly and refuses
 * POSITIVELY on anything that is not the staging ref. The resolved project ref
 * is printed to STDERR (quick-607), never stdout.
 *
 * ─── D3: EVERY ZERO-ROW PROBE NEEDS A COUNTER-READ ─────────────────────────
 *
 * An RLS-refused UPDATE or DELETE is a SILENT 0 ROWS, not a 42501 — only a
 * failed `WITH CHECK` raises (quick-599 D3). So "0 rows" on its own cannot
 * distinguish REFUSED from ALREADY GONE, and on a DELETE probe those are the
 * two outcomes that matter most. Every destructive probe therefore runs inside
 * `BEGIN … ROLLBACK` and takes a PRIVILEGED counter-read, on a separate
 * `postgres` connection, of the rows it tried to destroy — both before and
 * after — so the report can state that the 6 SYSTEM rows are still there.
 *
 * The `BEGIN … ROLLBACK` is also what makes it safe to aim a
 * `DELETE … WHERE scope='SYSTEM'` at real platform rows at all: even in the
 * failure case where the policy admits the delete, the transaction is discarded.
 * The counter-read runs on the OTHER connection, so it sees committed state and
 * cannot be fooled by the probe's own uncommitted work.
 *
 * ─── BOTH DIRECTIONS PER COMMAND ───────────────────────────────────────────
 *
 * Every command is probed in the direction that must SUCCEED and the direction
 * that must be REFUSED. A one-directional matrix is satisfied by a policy that
 * denies everything, which is why quick-600's rule 3 requires both.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { mkdirSync, writeFileSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { randomUUID } from 'crypto';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/612-close-the-automationrule-delete-gap-with/evidence',
);
const MIGRATION = resolve(
  APP_ROOT,
  'prisma/migrations/20260915140000_automation_rule_per_command_policy_split/migration.sql',
);

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`612-policy-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

const APP_USER_URL = staging(process.env.STAGING_DATABASE_URL_APP_USER, 'STAGING_DATABASE_URL_APP_USER');
const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');

interface Probe {
  id: string;
  cmd: 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  direction: 'must SUCCEED' | 'must be REFUSED';
  label: string;
  rows: number | null;
  /**
   * For a SELECT probe, the scalar the query returned.
   *
   * `rowCount` is the WRONG number for `select count(*)`: it is always 1,
   * whatever the count is, so a refused cross-tenant read reports "1 row(s)"
   * and reads exactly like a successful one. The scalar is the answer; the
   * row count is an artefact of the query shape.
   */
  value: number | null;
  error: { code: string; message: string } | null;
  counterRead?: { label: string; value: number };
}

async function main() {
  const mode = process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--after')
      ? 'after'
      : 'before';

  console.error(`[db-target] script   : 612-policy-verify.ts`);
  console.error(`[db-target] project  : ${STAGING_REF} (staging)`);
  console.error(`[db-target] role     : app_user (probes) + postgres (counter-reads, DDL)`);
  console.error(`[db-target] mode     : ${mode}`);

  const admin = new Client({ connectionString: DIRECT_URL });
  await admin.connect();

  // ── APPLY ────────────────────────────────────────────────────────────────
  if (mode === 'apply') {
    const sql = readFileSync(MIGRATION, 'utf8');

    // Strip `--` comments BEFORE every check. The first run of this guard
    // refused its own migration on `AS RESTRICTIVE` — matched inside the header
    // comment that says "No AS RESTRICTIVE anywhere". Same trap quick-600 hit:
    // a bare substring check false-positives on the prose describing the
    // invariant it exists to protect. The CODE is what must be checked.
    const code = sql.replace(/^\s*--.*$/gm, '');
    if (/AS\s+RESTRICTIVE/i.test(code)) refuse('migration contains AS RESTRICTIVE');
    if (/\bDO\s*\$\$/i.test(code)) refuse('migration contains a DO block');
    if (/bypass_rls_policy/i.test(code)) refuse('migration touches bypass_rls_policy');
    // Policy DDL must start at column zero — rls-policy-replay.test.ts's parser
    // is line-anchored and silently skips an indented statement.
    const indented = code.split('\n').filter((l) => /^\s+(CREATE|DROP)\s+POLICY/i.test(l));
    if (indented.length) refuse(`policy DDL is indented, not at column zero: ${indented[0].trim()}`);
    await admin.query('BEGIN');
    await admin.query(sql);
    await admin.query('COMMIT');
    console.log('migration applied to staging');
    await admin.end();
    return;
  }

  // ── fixtures ─────────────────────────────────────────────────────────────
  const t = await admin.query('select id, name from "Tenant" order by "createdAt"');
  if (t.rows.length < 2) refuse('need two staging tenants');
  const A = t.rows[0].id as string;
  const B = t.rows[1].id as string;

  const policyCount = (await admin.query('select count(*)::int n from pg_policy')).rows[0].n;
  const bypassCount = (
    await admin.query("select count(*)::int n from pg_policy where polname='bypass_rls_policy'")
  ).rows[0].n;
  const bypassTables = (
    await admin.query(
      "select c.relname from pg_policy p join pg_class c on c.oid=p.polrelid where p.polname='bypass_rls_policy' order by 1",
    )
  ).rows.map((r) => r.relname);

  const livePolicies = (
    await admin.query(`select p.polname,
        case p.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT' when 'w' then 'UPDATE' when 'd' then 'DELETE' when '*' then 'ALL' end cmd,
        pg_get_expr(p.polqual,p.polrelid) qual,
        pg_get_expr(p.polwithcheck,p.polrelid) with_check,
        p.polpermissive
      from pg_policy p where p.polrelid='"AutomationRule"'::regclass order by cmd, polname`)
  ).rows;

  const systemBefore = (
    await admin.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)
  ).rows[0].n;

  console.error(`[db-target] tenantA  : ${A}`);
  console.error(`[db-target] tenantB  : ${B}`);

  // A disposable TENANT-scoped rule for tenant A, so the own-tenant halves are
  // not vacuous. Created privileged, removed in the finally.
  const OWN_ID = randomUUID();
  const OWN_KEY = `quick612_${OWN_ID.slice(0, 8)}`;
  await admin.query(
    `insert into "AutomationRule" (id, key, name, description, "triggerEvent", "isActive", scope, "tenantId", "actionsJson", "updatedAt")
     values ($1,$2,$3,'quick-612 disposable fixture','TENANT_CREATED', true, 'TENANT'::"AutomationScope", $4, '[]'::jsonb, now())`,
    [OWN_ID, OWN_KEY, `quick-612 ${OWN_KEY}`, A],
  );

  const app = new Client({ connectionString: APP_USER_URL });
  await app.connect();

  const probes: Probe[] = [];

  /** Run one probe inside BEGIN..ROLLBACK under tenant A's GUC. */
  const probe = async (
    id: string,
    cmd: Probe['cmd'],
    direction: Probe['direction'],
    label: string,
    sql: string,
    params: unknown[] = [],
    counter?: { label: string; sql: string },
  ) => {
    const p: Probe = { id, cmd, direction, label, rows: null, value: null, error: null };
    await app.query('BEGIN');
    try {
      await app.query(`select set_config('app.current_tenant_id',$1,true)`, [A]);
      const r = await app.query(sql, params as never[]);
      p.rows = r.rowCount;
      // For a count query the SCALAR is the answer, not the row count.
      if (cmd === 'SELECT' && r.rows.length && r.rows[0].n !== undefined) p.value = Number(r.rows[0].n);
    } catch (e) {
      const err = e as { code?: string; message?: string };
      p.error = { code: err.code ?? 'UNKNOWN', message: String(err.message ?? e).split('\n')[0] };
    } finally {
      // The counter-read happens on the PRIVILEGED connection while the probe's
      // transaction is still open, then the probe is rolled back. It sees
      // committed state, so the probe's own uncommitted work cannot fool it.
      if (counter) {
        const c = await admin.query(counter.sql);
        p.counterRead = { label: counter.label, value: Number(c.rows[0].n) };
      }
      await app.query('ROLLBACK');
    }
    probes.push(p);
  };

  try {
    // ── SELECT — both directions ──────────────────────────────────────────
    await probe('S1', 'SELECT', 'must SUCCEED', 'tenant reads the 6 SYSTEM platform rules',
      `select count(*)::int as n from "AutomationRule" where scope='SYSTEM'`);
    await probe('S2', 'SELECT', 'must SUCCEED', 'tenant reads its OWN rule',
      `select count(*)::int as n from "AutomationRule" where "tenantId" = $1`, [A]);
    await probe('S3', 'SELECT', 'must be REFUSED', "tenant B's rules are invisible to tenant A",
      `select count(*)::int as n from "AutomationRule" where "tenantId" = $1`, [B]);

    // ── INSERT — both directions ──────────────────────────────────────────
    await probe('I1', 'INSERT', 'must SUCCEED', 'INSERT naming OWN tenant',
      `insert into "AutomationRule" (id,key,name,"triggerEvent","isActive",scope,"tenantId","actionsJson","updatedAt")
       values (gen_random_uuid(),$1,'q612 own','TENANT_CREATED',true,'TENANT'::"AutomationScope",$2,'[]'::jsonb,now())`,
      [`quick612_own_${randomUUID().slice(0, 8)}`, A]);
    await probe('I2', 'INSERT', 'must be REFUSED', 'INSERT naming ANOTHER tenant (cross-tenant)',
      `insert into "AutomationRule" (id,key,name,"triggerEvent","isActive",scope,"tenantId","actionsJson","updatedAt")
       values (gen_random_uuid(),$1,'q612 cross','TENANT_CREATED',true,'TENANT'::"AutomationScope",$2,'[]'::jsonb,now())`,
      [`quick612_cross_${randomUUID().slice(0, 8)}`, B]);
    await probe('I3', 'INSERT', 'must be REFUSED', "INSERT a new SYSTEM rule (tenantId NULL)",
      `insert into "AutomationRule" (id,key,name,"triggerEvent","isActive",scope,"tenantId","actionsJson","updatedAt")
       values (gen_random_uuid(),$1,'q612 sys','TENANT_CREATED',true,'SYSTEM'::"AutomationScope",NULL,'[]'::jsonb,now())`,
      [`quick612_sys_${randomUUID().slice(0, 8)}`]);

    // ── UPDATE — both directions, INCLUDING THE CAPTURE ───────────────────
    await probe('U1', 'UPDATE', 'must SUCCEED', 'UPDATE own rule',
      `update "AutomationRule" set "isActive" = not "isActive" where id = $1`, [OWN_ID]);
    await probe('U2', 'UPDATE', 'must be REFUSED', 'UPDATE a SYSTEM rule (touch a non-tenantId column)',
      `update "AutomationRule" set "isActive" = not "isActive" where scope='SYSTEM'`,
      [],
      { label: 'SYSTEM rows still present', sql: `select count(*)::int n from "AutomationRule" where scope='SYSTEM'` });
    await probe('U3', 'UPDATE', 'must be REFUSED', 'CAPTURE: UPDATE SYSTEM rules SET tenantId = own',
      `update "AutomationRule" set "tenantId" = $1 where scope='SYSTEM'`,
      [A],
      { label: 'SYSTEM rows STILL scope=SYSTEM with tenantId NULL', sql: `select count(*)::int n from "AutomationRule" where scope='SYSTEM' and "tenantId" is null` });
    await probe('U4', 'UPDATE', 'must be REFUSED', "UPDATE another tenant's rule",
      `update "AutomationRule" set "isActive" = not "isActive" where "tenantId" = $1`, [B]);

    // ── DELETE — both directions, WITH THE COUNTER-READ ───────────────────
    await probe('D1', 'DELETE', 'must SUCCEED', 'DELETE own rule',
      `delete from "AutomationRule" where id = $1`, [OWN_ID],
      { label: 'own rule still present (probe was rolled back)', sql: `select count(*)::int n from "AutomationRule" where id = '${OWN_ID}'` });
    await probe('D2', 'DELETE', 'must be REFUSED', 'DELETE the 6 SYSTEM platform rules',
      `delete from "AutomationRule" where scope='SYSTEM'`, [],
      { label: 'SYSTEM rows still present', sql: `select count(*)::int n from "AutomationRule" where scope='SYSTEM'` });
    await probe('D3', 'DELETE', 'must be REFUSED', "DELETE another tenant's rules",
      `delete from "AutomationRule" where "tenantId" = $1`, [B]);

    // ── report ────────────────────────────────────────────────────────────
    const systemAfter = (
      await admin.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)
    ).rows[0].n;

    const lines: string[] = [];
    lines.push(`# quick-612 — AutomationRule policy matrix (${mode.toUpperCase()})`);
    lines.push('');
    lines.push(`project \`${STAGING_REF}\` · probes as \`app_user\` · GUC = tenant A · every probe inside BEGIN…ROLLBACK`);
    lines.push('');
    lines.push(`pg_policy total = **${policyCount}** · bypass_rls_policy = **${bypassCount}**`);
    lines.push(`SYSTEM rows: ${systemBefore} at open, ${systemAfter} at close`);
    lines.push('');
    lines.push('## live policies on "AutomationRule"');
    lines.push('');
    for (const p of livePolicies) {
      lines.push(`- **[${p.cmd}] ${p.polname}** (${p.polpermissive ? 'PERMISSIVE' : 'RESTRICTIVE'})`);
      lines.push(`  - USING      : \`${p.qual ?? '(none)'}\``);
      lines.push(`  - WITH CHECK : \`${p.with_check ?? '(none)'}\``);
    }
    lines.push('');
    lines.push('## the matrix');
    lines.push('');
    lines.push('| # | cmd | direction | probe | result | counter-read |');
    lines.push('|---|---|---|---|---|---|');
    for (const p of probes) {
      const result = p.error
        ? `ERROR [${p.error.code}] ${p.error.message}`
        : p.value !== null
          ? `**${p.value}** row(s) visible`
          : `${p.rows} row(s) affected`;
      const cr = p.counterRead ? `${p.counterRead.label} = **${p.counterRead.value}**` : '—';
      lines.push(`| ${p.id} | ${p.cmd} | ${p.direction} | ${p.label} | ${result} | ${cr} |`);
    }
    const md = lines.join('\n') + '\n';

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const stem = mode === 'before' ? '01-before' : '03-after';
    writeFileSync(resolve(EVIDENCE_DIR, `${stem}.md`), md);
    writeFileSync(
      resolve(EVIDENCE_DIR, `${stem}.json`),
      JSON.stringify(
        { at: new Date().toISOString(), project: STAGING_REF, mode, policyCount, bypassCount, bypassTables, livePolicies, systemBefore, systemAfter, tenantA: A, tenantB: B, probes },
        null,
        2,
      ),
    );
    console.log(md);
  } finally {
    const del = await admin.query(`delete from "AutomationRule" where key like 'quick612_%'`);
    const left = (
      await admin.query(`select count(*)::int n from "AutomationRule" where key like 'quick612_%'`)
    ).rows[0].n;
    console.error(`[612] teardown : deleted ${del.rowCount}, left ${left}`);
    if (left !== 0) {
      console.error('[612] *** TEARDOWN DID NOT LAND — fixture rows remain on staging. ***');
      process.exitCode = 1;
    }
    const sysFinal = (
      await admin.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)
    ).rows[0].n;
    console.error(`[612] SYSTEM rows at exit: ${sysFinal}`);
    if (sysFinal !== 6) {
      console.error('[612] *** SYSTEM ROW COUNT CHANGED — this task must never destroy a platform rule. ***');
      process.exitCode = 1;
    }
    await app.end();
    await admin.end();
  }
}

main().catch((e) => {
  console.error('612-policy-verify FAILED:', e);
  process.exit(1);
});
