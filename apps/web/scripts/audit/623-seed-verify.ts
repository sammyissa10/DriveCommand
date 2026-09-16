/**
 * quick-623 — THE STARTER-PLAYBOOK SEEDER PROOF.
 *
 *   npx tsx scripts/audit/623-seed-verify.ts --run [--throw-after-drop]
 *   npx tsx scripts/audit/623-seed-verify.ts --hashes
 *   npx tsx scripts/audit/623-seed-verify.ts --cell <name>     (internal, one COLD cell)
 *
 * Capture / drop / restore / self-heal / sorted-list hashes are COPIED VERBATIM from
 * `621-layout-verify.ts` (itself 620/619/617), evidence path changed.
 *
 * `bypass_rls_policy` is DROPPED on the four tables the seeder writes — "Playbook",
 * "StepTemplate", "PlaybookStep", "PlaybookTrigger" — and then, each cell in a COLD child
 * process as app_user with the tripwire armed and the dual-form driver hook installed:
 *
 *   control:pre-fix-seeder    the seeder as it was at ad1b26d6^ against a fresh tenant:
 *                             it must REJECT and leave 0 rows. That is the defect.
 *   fn:seed-fresh-tenant      the REAL fixed seeder against a fresh tenant: rows COUNTED on
 *                             the privileged connection (3 playbooks by name, 27 steps, 27
 *                             step templates, 1 trigger), every row carrying the tenant's id,
 *                             other tenants' counts unchanged, 0 TC001; a second call adds 0.
 *   fn:create-tenant          the REAL sysadmin `createTenant` action (auth, email and
 *                             revalidatePath stubbed; the admin connection and the seeder are
 *                             real): tenant created, playbooks counted, no seedWarning.
 *   fn:forced-failure-*       with INSERT on "PlaybookTrigger" REVOKED from app_user — the
 *                             seeder's LAST write, so 23 statements have already landed — the
 *                             seeder REJECTS with 42501 and rolls back to 0 rows, and
 *                             `createTenant` returns success WITH a seedWarning.
 *   caller:script-*           the real `scripts/seed-starter-playbooks.ts` as app_user, armed
 *                             and disarmed: exit 1 either way. The pre-fix script, disarmed,
 *                             is the witness: exit 0 over "0 tenant(s)".
 *
 * The REVOKE is restored in a `finally` and self-heals on the next run from a marker file,
 * exactly like the policy drop. Fixture tenants carry slug prefix `q623-` and are torn down
 * with a per-table leftover count of 0.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { pathToFileURL } from 'url';
import { execFileSync, spawnSync } from 'child_process';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/623-fix-seedstarterplaybooks-tenant-scoping-/evidence',
);
const CAPTURE_PATH = resolve(EVIDENCE_DIR, '05-policy-capture.json');
const REVOKE_MARKER = resolve(EVIDENCE_DIR, '05-revoke-in-effect.marker');

const EXPECTED_POLICY_COUNT = 86;

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`623-seed-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION (${PRODUCTION_REF})`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging (${STAGING_REF})`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');
const APP_USER_URL = staging(
  process.env.STAGING_DATABASE_URL_APP_USER,
  'STAGING_DATABASE_URL_APP_USER',
);
const ADMIN_URL = staging(process.env.STAGING_DATABASE_URL_ADMIN, 'STAGING_DATABASE_URL_ADMIN');

function banner(url: string, label: string) {
  const u = new URL(url);
  console.error(
    `[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  lane : ${label}  (credential MASKED, never printed)`,
  );
}

// ─── BEGIN: copied verbatim from 621-layout-verify.ts lines 80-384 (evidence filename changed) ───
function sqlstateOf(e: unknown): string {
  const seen = new Set<unknown>();
  let cur: unknown = e;
  while (cur && typeof cur === 'object' && !seen.has(cur)) {
    seen.add(cur);
    const code = (cur as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    cur = (cur as { cause?: unknown }).cause;
  }
  return 'UNKNOWN';
}

// ---------------------------------------------------------------------------
// pg_policies capture / drop / restore
// ---------------------------------------------------------------------------

type CapturedPolicy = {
  schemaname: string;
  tablename: string;
  policyname: string;
  permissive: string;
  roles: string;
  cmd: string;
  qual: string | null;
  with_check: string | null;
  ddl: string;
};

function ddlFor(p: Omit<CapturedPolicy, 'ddl'>): string {
  const roles = p.roles.replace(/^\{|\}$/g, '');
  const parts = [
    `CREATE POLICY "${p.policyname}" ON "${p.schemaname}"."${p.tablename}"`,
    `  AS ${p.permissive === 'PERMISSIVE' ? 'PERMISSIVE' : 'RESTRICTIVE'}`,
    `  FOR ${p.cmd}`,
    `  TO ${roles}`,
  ];
  if (p.qual !== null) parts.push(`  USING (${p.qual})`);
  if (p.with_check !== null) parts.push(`  WITH CHECK (${p.with_check})`);
  return parts.join('\n') + ';';
}

const POLICY_QUERY = `
  SELECT schemaname, tablename, policyname, permissive,
         roles::text AS roles, cmd, qual, with_check
    FROM pg_policies
   WHERE policyname = 'bypass_rls_policy'
   ORDER BY schemaname, tablename`;

async function readPolicies(c: Client): Promise<Omit<CapturedPolicy, 'ddl'>[]> {
  return (await c.query(POLICY_QUERY)).rows;
}

/**
 * The self-healing pre-flight. Runs in the NEXT process, so it survives what a
 * `finally` cannot — including a hard kill. A short live count plus a capture
 * file on disk means a previous run died between the drop and the restore.
 */
async function preflightHeal(): Promise<string | null> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  let live: number;
  try {
    live = (
      await c.query(
        `SELECT count(*)::int AS n FROM pg_policies WHERE policyname='bypass_rls_policy'`,
      )
    ).rows[0].n;
  } finally {
    await c.end();
  }
  if (live === EXPECTED_POLICY_COUNT) return null;
  if (live > EXPECTED_POLICY_COUNT) {
    refuse(
      `live bypass_rls_policy count is ${live}, MORE than the expected ${EXPECTED_POLICY_COUNT}. ` +
        `That is not an interrupted run — the population grew. STOPPING.`,
    );
  }
  if (!existsSync(CAPTURE_PATH)) {
    refuse(
      `live bypass_rls_policy count is ${live} (expected ${EXPECTED_POLICY_COUNT}) and there is NO capture ` +
        `file to heal from. STOPPING — do not run anything else against staging until a human looks at this.`,
    );
  }
  console.error('');
  console.error(
    `!! PRE-FLIGHT HEAL: live bypass_rls_policy = ${live}, expected ${EXPECTED_POLICY_COUNT}.`,
  );
  console.error(`!! A previous run died between the DROP and the RESTORE. Restoring from ${CAPTURE_PATH}.`);
  const r = await restore();
  printRestore(r);
  if (!r.ok) refuse('PRE-FLIGHT HEAL FAILED — staging is in a modified state. STOP.');
  return `healed from ${live} back to ${EXPECTED_POLICY_COUNT}`;
}

async function capture(): Promise<CapturedPolicy[]> {
  banner(DIRECT_URL, 'CAPTURE (read-only)');
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    const rows = await readPolicies(c);
    const captured: CapturedPolicy[] = rows.map((r) => ({ ...r, ddl: ddlFor(r) }));
    const tables = captured.map((p) => `${p.schemaname}.${p.tablename}`).sort();
    console.log(`bypass_rls_policy: ${captured.length} policies on ${new Set(tables).size} tables`);
    if (captured.length !== EXPECTED_POLICY_COUNT) {
      throw new Error(
        `EXPECTED ${EXPECTED_POLICY_COUNT} bypass_rls_policy rows, FOUND ${captured.length}. ` +
          `The population changed. STOPPING BEFORE ANY DROP.`,
      );
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      CAPTURE_PATH,
      JSON.stringify(
        {
          capturedAt: new Date().toISOString(),
          database: `${STAGING_REF} (staging)`,
          count: captured.length,
          sortedTableList: tables,
          sortedTableListSha256: createHash('sha256').update(tables.join('\n')).digest('hex'),
          sortedTableListMd5: createHash('md5').update(tables.join('\n')).digest('hex'),
          policies: captured,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`captured DDL for all ${captured.length} → ${CAPTURE_PATH}`);
    return captured;
  } finally {
    await c.end();
  }
}

async function dropOn(tables: string[]) {
  banner(DIRECT_URL, 'DROP (scoped)');
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    for (const t of tables) {
      await c.query(`DROP POLICY IF EXISTS "bypass_rls_policy" ON public."${t}"`);
      console.log(`DROPPED bypass_rls_policy ON public."${t}"`);
    }
    const n = (
      await c.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname='bypass_rls_policy'`)
    ).rows[0].n;
    console.log(`bypass_rls_policy now: ${n} (was ${EXPECTED_POLICY_COUNT})`);
  } finally {
    await c.end();
  }
}

type RestoreResult = {
  restoredCount: number;
  liveCount: number;
  onlyInBefore: string[];
  onlyInAfter: string[];
  sortedListIdentical: boolean;
  bodyMismatches: string[];
  ok: boolean;
};

async function restore(): Promise<RestoreResult> {
  const cap = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as {
    sortedTableList: string[];
    policies: CapturedPolicy[];
  };
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  let restored = 0;
  try {
    const live = await readPolicies(c);
    const liveKeys = new Set(live.map((p) => `${p.schemaname}.${p.tablename}`));
    for (const p of cap.policies) {
      if (liveKeys.has(`${p.schemaname}.${p.tablename}`)) continue;
      await c.query(p.ddl);
      restored++;
    }

    const after = await readPolicies(c);
    const afterTables = after.map((p) => `${p.schemaname}.${p.tablename}`).sort();
    const beforeTables = [...cap.sortedTableList].sort();
    const onlyInBefore = beforeTables.filter((t) => !afterTables.includes(t));
    const onlyInAfter = afterTables.filter((t) => !beforeTables.includes(t));
    const sortedListIdentical =
      onlyInBefore.length === 0 &&
      onlyInAfter.length === 0 &&
      beforeTables.length === afterTables.length &&
      beforeTables.every((t, i) => t === afterTables[i]);

    // BYTE-FOR-BYTE. "A policy of that name exists" is what lets a restored
    // policy with a DIFFERENT BODY pass.
    const byKey = new Map(after.map((p) => [`${p.schemaname}.${p.tablename}`, p]));
    const bodyMismatches: string[] = [];
    for (const p of cap.policies) {
      const k = `${p.schemaname}.${p.tablename}`;
      const now = byKey.get(k);
      if (!now) {
        bodyMismatches.push(`${k}: MISSING`);
        continue;
      }
      for (const f of ['permissive', 'roles', 'cmd', 'qual', 'with_check'] as const) {
        if ((now as Record<string, unknown>)[f] !== (p as Record<string, unknown>)[f]) {
          bodyMismatches.push(`${k}.${f}`);
        }
      }
    }

    return {
      restoredCount: restored,
      liveCount: after.length,
      onlyInBefore,
      onlyInAfter,
      sortedListIdentical,
      bodyMismatches,
      ok: sortedListIdentical && bodyMismatches.length === 0 && after.length === EXPECTED_POLICY_COUNT,
    };
  } finally {
    await c.end();
  }
}

function printRestore(r: RestoreResult) {
  console.log(`RESTORE: re-created ${r.restoredCount}; live now ${r.liveCount}`);
  console.log(`  sorted list identical : ${r.sortedListIdentical}`);
  console.log(`  only in before        : ${JSON.stringify(r.onlyInBefore)}`);
  console.log(`  only in after         : ${JSON.stringify(r.onlyInAfter)}`);
  console.log(`  body mismatches       : ${JSON.stringify(r.bodyMismatches)}`);
  console.log(`  VERDICT               : ${r.ok ? 'PASS' : 'FAIL'}`);
}

// ---------------------------------------------------------------------------
// --hashes — BOTH algorithms, BOTH databases (fact H)
// ---------------------------------------------------------------------------

async function sortedListFor(url: string, label: string) {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const rows = await readPolicies(c);
    const tables = rows.map((p) => `${p.schemaname}.${p.tablename}`).sort();
    const joined = tables.join('\n');
    return {
      label,
      count: rows.length,
      tables,
      // TWO recorded figures, TWO algorithms, TWO spellings of "the list" —
      // and they are NOT in conflict (fact H). Both are reproduced here by name
      // so a future reader never has to search for the normalisation:
      //
      //   sha256 over "public.X\npublic.Y…"  reproduces quick-616's
      //     0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
      //   md5 over "X,Y,…" (BARE names, comma-joined) reproduces the
      //     orchestrator's .planning/STATE.md:966 figure
      //     29498ef6e52f51dcc02461a1abbb84b0
      //
      // The bare/comma spelling was FOUND by trying fourteen normalisations,
      // not assumed. An algorithm mismatch is not drift, and neither is a
      // joiner mismatch — but only one of the fourteen matched, so this is a
      // reproduction and not a coincidence.
      sha256: createHash('sha256').update(joined).digest('hex'),
      md5: createHash('md5').update(joined).digest('hex'),
      sha256BareComma: createHash('sha256')
        .update(tables.map((t) => t.replace(/^public\./, '')).join(','))
        .digest('hex'),
      md5BareComma: createHash('md5')
        .update(tables.map((t) => t.replace(/^public\./, '')).join(','))
        .digest('hex'),
    };
  } finally {
    await c.end();
  }
}

async function hashes() {
  banner(DIRECT_URL, 'HASHES staging (read-only)');
  const stg = await sortedListFor(DIRECT_URL, 'staging');
  // PRODUCTION, READ-ONLY. This harness never writes to production; the only
  // statement it issues there is the pg_policies SELECT above.
  // The production reference is loaded EXPLICITLY and used for exactly ONE
  // statement — the `pg_policies` SELECT above. `.env.local` is read here and
  // nowhere else in this file, and never assigned to DATABASE_URL: quick-607's
  // rule is that a script must never do `DATABASE_URL = DIRECT_URL`.
  loadEnv({ path: resolve(APP_ROOT, '.env.local'), quiet: true });
  const prodRaw = process.env.PRODUCTION_DIRECT_URL_READONLY ?? process.env.DIRECT_URL;
  let prod: Awaited<ReturnType<typeof sortedListFor>> | { label: string; error: string };
  if (!prodRaw || !prodRaw.includes(PRODUCTION_REF)) {
    prod = { label: 'production', error: 'no production connection string available to this process' };
  } else {
    const u = new URL(prodRaw.replace(':6543/', ':5432/').replace('?pgbouncer=true', ''));
    console.error(
      `[db-target] project : ${PRODUCTION_REF} (PRODUCTION, READ-ONLY pg_policies SELECT)  host : ${u.host}  role : ${u.username}  (credential MASKED)`,
    );
    prod = await sortedListFor(u.toString(), 'production');
  }
  const out = { generated: new Date().toISOString(), staging: stg, production: prod };
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '05-sorted-list-hashes.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify({ staging: { ...stg, tables: `${stg.tables.length} tables` }, production: 'tables' in prod ? { ...prod, tables: `${prod.tables.length} tables` } : prod }, null, 2));
  return out;
}

// ---------------------------------------------------------------------------
// Fixtures — created on the PRIVILEGED connection, torn down with `left 0`
// (end of the section 619 copied from 617)
// ─── END: copied from 621-layout-verify.ts ───

type CellResult = { cell: string; ok: boolean; detail: Record<string, unknown> };

/** The tables the seeder WRITES. The sentinel read is on "Playbook". */
const SEED_TABLES = ['Playbook', 'StepTemplate', 'PlaybookStep', 'PlaybookTrigger'];
const EXPECTED_STEPS = 27;
const EXPECTED_PLAYBOOK_COUNT = 3;
const FIX_COMMIT = 'ad1b26d6';
const SLUG_PREFIX = 'q623-';

// ── 619/620/621's fixed dual-form driver hook ──
const tc001: { sql: string }[] = [];
const driverErrors: string[] = [];
function installHooks() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg');
  const orig = pg.Client.prototype.query;
  const note = (e: unknown, q: unknown) => {
    const code = sqlstateOf(e);
    const sql = typeof q === 'string' ? q : (q as { text?: string })?.text ?? '';
    if (code === 'TC001') tc001.push({ sql: sql.slice(0, 160) });
    else driverErrors.push(`${code}: ${(e as Error)?.message?.slice(0, 120)}`);
  };
  pg.Client.prototype.query = function (...args: unknown[]) {
    const last = args[args.length - 1];
    if (typeof last === 'function') {
      args[args.length - 1] = function (this: unknown, err: unknown, ...rest: unknown[]) {
        if (err) note(err, args[0]);
        return (last as (...a: unknown[]) => unknown).call(this, err, ...rest);
      };
    }
    const r = orig.apply(this, args);
    if (r && typeof (r as Promise<unknown>).then === 'function') {
      (r as Promise<unknown>).then(undefined, (e: unknown) => note(e, args[0]));
    }
    return r;
  };
}

/** Child env: app_user, tripwire as given, admin URL for createTenant, and NO production string anywhere. */
function childEnv(tripwire: 'on' | 'off'): NodeJS.ProcessEnv {
  const env = {} as NodeJS.ProcessEnv;
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v.includes(PRODUCTION_REF)) continue;
    env[k] = v;
  }
  env.DATABASE_URL = APP_USER_URL;
  env.DIRECT_URL = APP_USER_URL;
  env.DATABASE_URL_ADMIN = ADMIN_URL;
  env.TENANT_CONTEXT_TRIPWIRE = tripwire;
  return env;
}

async function privileged<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    await c.end();
  }
}

const settle = () => new Promise((r) => setTimeout(r, 300));

type Counts = {
  playbooks: string[];
  steps: number;
  stepTemplates: number;
  triggers: number;
  foreignTotals: Record<string, number>;
};

/** Rows COUNTED on the privileged connection — never inferred from the absence of an error. */
async function countsFor(tenantId: string): Promise<Counts> {
  return privileged(async (c) => {
    const playbooks = (
      await c.query(`SELECT name FROM "Playbook" WHERE "tenantId"=$1 ORDER BY name`, [tenantId])
    ).rows.map((r) => r.name as string);
    const n = async (t: string) =>
      Number((await c.query(`SELECT count(*)::int n FROM "${t}" WHERE "tenantId"=$1`, [tenantId])).rows[0].n);
    const foreignTotals: Record<string, number> = {};
    for (const t of SEED_TABLES) {
      foreignTotals[t] = Number(
        (await c.query(`SELECT count(*)::int n FROM "${t}" WHERE "tenantId"<>$1`, [tenantId])).rows[0].n,
      );
    }
    return {
      playbooks,
      steps: await n('PlaybookStep'),
      stepTemplates: await n('StepTemplate'),
      triggers: await n('PlaybookTrigger'),
      foreignTotals,
    };
  });
}

async function createFixtureTenant(label: string): Promise<string> {
  const id = randomUUID();
  await privileged((c) =>
    c.query(
      `INSERT INTO "Tenant"(id, name, slug, "isActive", "updatedAt") VALUES ($1, $2, $3, false, now())`,
      [id, `q623 fixture ${label}`, `${SLUG_PREFIX}${label}-${id.slice(0, 8)}`],
    ),
  );
  return id;
}

/** Deletes every q623- tenant and its children; returns leftover rows per referencing table (all must be 0). */
async function teardownFixtures(): Promise<{ tenantsDeleted: number; leftovers: Record<string, number> }> {
  return privileged(async (c) => {
    const ids = (await c.query(`SELECT id FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG_PREFIX}%`])).rows.map(
      (r) => r.id as string,
    );
    const refs = (
      await c.query(
        `SELECT conrelid::regclass::text AS tbl, a.attname AS col
           FROM pg_constraint k JOIN pg_attribute a ON a.attrelid = k.conrelid AND a.attnum = k.conkey[1]
          WHERE k.confrelid = 'public."Tenant"'::regclass AND k.contype = 'f'`,
      )
    ).rows as { tbl: string; col: string }[];
    if (ids.length) {
      await c.query('BEGIN');
      try {
        for (const t of ['"PlaybookStep"', '"StepInstance"', '"DriverInvitation"', '"PlaybookTrigger"', '"Playbook"', '"StepTemplate"']) {
          await c.query(`DELETE FROM ${t} WHERE "tenantId"::text = ANY($1::text[])`, [ids]);
        }
        await c.query(`DELETE FROM "Tenant" WHERE id::text = ANY($1::text[])`, [ids]);
        await c.query('COMMIT');
      } catch (e) {
        await c.query('ROLLBACK').catch(() => {});
        throw e;
      }
    }
    const leftovers: Record<string, number> = {};
    const probeIds = ids.length ? ids : ['00000000-0000-0000-0000-000000000000'];
    for (const r of refs) {
      leftovers[r.tbl] = Number(
        (await c.query(`SELECT count(*)::int n FROM ${r.tbl} WHERE "${r.col}"::text = ANY($1::text[])`, [probeIds])).rows[0].n,
      );
    }
    leftovers['"Tenant"'] = Number(
      (await c.query(`SELECT count(*)::int n FROM "Tenant" WHERE slug LIKE $1`, [`${SLUG_PREFIX}%`])).rows[0].n,
    );
    return { tenantsDeleted: ids.length, leftovers };
  });
}

// ── the REVOKE used to force a REAL mid-seed failure (the seeder's LAST write) ──
const EXPECTED_TRIGGER_PRIVS = ['DELETE', 'INSERT', 'SELECT', 'UPDATE'];

async function insertGrantOnTrigger(): Promise<boolean> {
  return privileged(async (c) =>
    Boolean(
      (await c.query(`SELECT has_table_privilege('app_user', 'public."PlaybookTrigger"', 'INSERT') AS g`)).rows[0].g,
    ),
  );
}
async function revokeTriggerInsert() {
  writeFileSync(REVOKE_MARKER, new Date().toISOString() + '\n');
  await privileged((c) => c.query(`REVOKE INSERT ON public."PlaybookTrigger" FROM app_user`));
  console.log(`REVOKED INSERT ON public."PlaybookTrigger" FROM app_user (has_table_privilege now: ${await insertGrantOnTrigger()})`);
}
async function restoreTriggerInsert() {
  await privileged((c) => c.query(`GRANT INSERT ON public."PlaybookTrigger" TO app_user`));
  const insert = await insertGrantOnTrigger();
  const privileges = await privileged(async (c) =>
    (
      await c.query(
        `SELECT privilege_type FROM information_schema.role_table_grants
          WHERE table_schema='public' AND table_name='PlaybookTrigger' AND grantee='app_user' ORDER BY 1`,
      )
    ).rows.map((r) => r.privilege_type as string),
  );
  const ok = insert && JSON.stringify(privileges) === JSON.stringify(EXPECTED_TRIGGER_PRIVS);
  console.log(`GRANT INSERT restored: has_table_privilege=${insert}; app_user privileges ${JSON.stringify(privileges)}; ${ok ? 'PASS' : 'FAIL'}`);
  if (ok && existsSync(REVOKE_MARKER)) unlinkSync(REVOKE_MARKER);
  return { insert, privileges, ok };
}

// ── stubs for the REAL createTenant action: auth guard, owner email, revalidatePath ONLY ──
function stubAdminCaller(sent: unknown[]) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Module = require('module');
  const origLoad = Module._load;
  Module._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === '@/lib/auth/supabase') {
      const real = origLoad.apply(this, [request, parent, isMain]);
      return {
        ...real,
        requireAuth: async () => ({ userId: 'q623-sysadmin', tenantId: '', role: 'SYSADMIN' }),
        isSystemAdmin: async () => true,
      };
    }
    if (request === '@/lib/email/send-owner-invitation') {
      return { sendOwnerInvitation: async (...a: unknown[]) => void sent.push(a[0]) };
    }
    /*
     * STAGING SCHEMA DRIFT ACCOMMODATION, and nothing else. "DriverInvitation"."middleName" exists on
     * PRODUCTION and in schema.prisma but NO migration creates it, so staging (built from migrations)
     * lacks it and the invitation INSERT's RETURNING raises 42703 — AFTER the seed has run. createTenant
     * reads only `invitation.id`, so the returned columns are narrowed to { id }. The tenant create, the
     * seeder and the invitation INSERT itself are all real.
     */
    if (request === '@/lib/db/admin-prisma') {
      const real = origLoad.apply(this, [request, parent, isMain]);
      return {
        ...real,
        getAdminDb: async (reason: string) => {
          const db = await real.getAdminDb(reason);
          return new Proxy(db, {
            get(target, prop, recv) {
              if (prop === 'driverInvitation') {
                const d = Reflect.get(target, prop, recv);
                return new Proxy(d, {
                  get(t2, p2, r2) {
                    if (p2 === 'create') return (args: Record<string, unknown>) => d.create({ ...args, select: { id: true } });
                    return Reflect.get(t2, p2, r2);
                  },
                });
              }
              return Reflect.get(target, prop, recv);
            },
          });
        },
      };
    }
    if (request === 'next/cache') {
      const real = origLoad.apply(this, [request, parent, isMain]);
      return { ...real, revalidatePath: () => {}, revalidateTag: () => {} };
    }
    return origLoad.apply(this, [request, parent, isMain]);
  };
}

async function callCreateTenant(label: string) {
  const sent: unknown[] = [];
  stubAdminCaller(sent);
  const mod = await import('../../src/app/(admin)/actions/tenants');
  const suffix = randomUUID().slice(0, 8);
  const slug = `${SLUG_PREFIX}ct-${label}-${suffix}`;
  const fd = new FormData();
  fd.set('name', `q623 createTenant ${label} ${suffix}`);
  fd.set('slug', slug);
  fd.set('ownerFirstName', 'Q');
  fd.set('ownerLastName', 'Sixtwothree');
  fd.set('ownerEmail', `q623-${suffix}@staging.test`);
  const result = (await mod.createTenant(fd)) as Record<string, unknown>;
  const tenantId = await privileged(
    async (c) => (await c.query(`SELECT id FROM "Tenant" WHERE slug = $1`, [slug])).rows[0]?.id as string | undefined,
  );
  return { result, tenantId, invitationEmailsStubbed: sent.length };
}

const seedCountsOk = (c: Counts) =>
  c.playbooks.length === EXPECTED_PLAYBOOK_COUNT &&
  c.playbooks.includes('CDL Driver Onboarding') &&
  c.steps === EXPECTED_STEPS &&
  c.stepTemplates === EXPECTED_STEPS &&
  c.triggers === 1;
const zero = (c: Counts) => c.playbooks.length === 0 && c.steps === 0 && c.stepTemplates === 0 && c.triggers === 0;

const PREFIX_SEEDER = resolve(APP_ROOT, 'scripts/audit/.q623-prefix-seeder.ts');
const PREFIX_SCRIPT = resolve(APP_ROOT, 'scripts/audit/.q623-prefix-seed-script.ts');

const CELLS: Record<string, (arg: string | undefined) => Promise<CellResult>> = {
  'hook-control': async () => {
    const { prisma } = await import('../../src/lib/db/prisma');
    let caught = 'none';
    try {
      await (prisma as any).playbook.count();
    } catch (e) {
      caught = sqlstateOf(e);
    }
    await settle();
    return { cell: 'hook-control', ok: caught === 'TC001' && tc001.length >= 1, detail: { callerSaw: caught, hookRecorded: tc001.length } };
  },

  /** The seeder as it was before the fix. It must REJECT and write nothing — the defect. */
  'control:pre-fix-seeder': async (tenantId) => {
    const mod = await import(pathToFileURL(PREFIX_SEEDER).href);
    let rejected: string | null = null;
    try {
      await mod.seedStarterPlaybooks(tenantId!);
    } catch (e) {
      rejected = `${sqlstateOf(e)}: ${(e as Error).message?.replace(/\s+/g, ' ').slice(0, 160)}`;
    }
    await settle();
    const after = await countsFor(tenantId!);
    return {
      cell: 'control:pre-fix-seeder',
      ok: rejected !== null && zero(after) && tc001.length >= 1,
      detail: { rejected, rowsAfter: after, tc001Observed: tc001.length, tc001Sql: tc001.map((t) => t.sql), meaning: 'every caller logged this and reported success' },
    };
  },

  'fn:seed-fresh-tenant': async (tenantId) => {
    const before = await countsFor(tenantId!);
    const { seedStarterPlaybooks } = await import('../../src/server/services/workflows/seedStarterPlaybooks');
    await seedStarterPlaybooks(tenantId!);
    await settle();
    const after = await countsFor(tenantId!);
    const tc001AfterFirst = tc001.length;
    await seedStarterPlaybooks(tenantId!); // idempotent: the scoped sentinel must now SEE the row
    await settle();
    const again = await countsFor(tenantId!);
    const othersUnchanged = SEED_TABLES.every(
      (t) => before.foreignTotals[t] === after.foreignTotals[t] && after.foreignTotals[t] === again.foreignTotals[t],
    );
    // Without rows belonging to OTHER tenants, "unchanged" is vacuous (staging holds none of its own).
    const othersNonZero = SEED_TABLES.every((t) => before.foreignTotals[t] > 0);
    return {
      cell: 'fn:seed-fresh-tenant',
      ok: zero(before) && seedCountsOk(after) && JSON.stringify(after) === JSON.stringify(again) && othersUnchanged && othersNonZero && tc001.length === 0,
      detail: { before, after, secondCall: again, othersUnchanged, othersNonZero, tc001AfterFirst, tc001Observed: tc001.length, driverErrors },
    };
  },

  'fn:create-tenant': async () => {
    const { result, tenantId, invitationEmailsStubbed } = await callCreateTenant('ok');
    await settle();
    const counts = tenantId ? await countsFor(tenantId) : null;
    return {
      cell: 'fn:create-tenant',
      ok: result.success === true && !result.seedWarning && !!tenantId && !!counts && seedCountsOk(counts) && tc001.length === 0,
      detail: {
        success: result.success,
        seedWarning: result.seedWarning ?? null,
        emailWarning: result.emailWarning ?? null,
        error: result.error ?? null,
        tenantId,
        counts,
        invitationEmailsStubbed,
        tc001Observed: tc001.length,
        driverErrors,
      },
    };
  },

  /** REVOKE in effect (set by the parent): a real 42501 on the seeder's LAST write. */
  'fn:forced-failure-seeder': async (tenantId) => {
    const { seedStarterPlaybooks } = await import('../../src/server/services/workflows/seedStarterPlaybooks');
    let rejected: { sqlstate: string; message: string } | null = null;
    try {
      await seedStarterPlaybooks(tenantId!);
    } catch (e) {
      rejected = { sqlstate: sqlstateOf(e), message: (e as Error).message?.replace(/\s+/g, ' ').slice(0, 200) };
    }
    await settle();
    const after = await countsFor(tenantId!);
    return {
      cell: 'fn:forced-failure-seeder',
      ok: rejected !== null && /42501|permission denied/i.test(`${rejected.sqlstate} ${rejected.message}`) && zero(after) && tc001.length === 0,
      detail: { rejected, rowsAfterRollback: after, tc001Observed: tc001.length, driverErrors },
    };
  },

  'fn:forced-failure-create-tenant': async () => {
    const { result, tenantId } = await callCreateTenant('forced');
    await settle();
    const counts = tenantId ? await countsFor(tenantId) : null;
    return {
      cell: 'fn:forced-failure-create-tenant',
      ok: result.success === true && typeof result.seedWarning === 'string' && !!tenantId && !!counts && zero(counts),
      detail: { success: result.success, seedWarning: result.seedWarning ?? null, tenantId, counts, meaning: 'pre-fix this returned { success: true, tenant } with no warning' },
    };
  },
};

async function runCell(name: string, arg: string | undefined) {
  installHooks();
  let r: CellResult;
  try {
    const fn = CELLS[name];
    if (!fn) refuse(`unknown cell "${name}"`);
    r = await fn(arg);
  } catch (e) {
    r = { cell: name, ok: false, detail: { threw: true, sqlstate: sqlstateOf(e), message: (e as Error).message?.slice(0, 400), tc001Observed: tc001.length } };
  }
  process.stdout.write('\n__CELL__' + JSON.stringify(r) + '\n');
  process.exit(0);
}

function spawnCell(name: string, arg?: string): CellResult {
  const out = execFileSync(
    process.execPath,
    [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), __filename, '--cell', name, ...(arg ? ['--arg', arg] : [])],
    { cwd: APP_ROOT, env: childEnv('on'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 240_000, maxBuffer: 32 * 1024 * 1024 },
  );
  const m = /__CELL__(.*)/.exec(out);
  if (!m) return { cell: name, ok: false, detail: { error: 'no cell payload', raw: out.slice(-400) } };
  return JSON.parse(m[1]) as CellResult;
}

/** The real post-deploy caller, run as its own process — what migrate.mjs spawns. */
function scriptCell(name: string, scriptPath: string, tripwire: 'on' | 'off', expectExit: number): CellResult {
  const r = spawnSync(process.execPath, [resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs'), scriptPath], {
    cwd: APP_ROOT,
    env: childEnv(tripwire),
    encoding: 'utf8',
    timeout: 240_000,
  });
  const tail = (s: string) =>
    s.split('\n').filter((l) => l.trim() && !l.includes('npm warn')).slice(-6).map((l) => l.slice(0, 220));
  return {
    cell: name,
    ok: r.status === expectExit,
    detail: { exit: r.status, expectedExit: expectExit, tripwire, stdout: tail(r.stdout ?? ''), stderr: tail(r.stderr ?? '') },
  };
}

function writePrefixFiles() {
  const seeder = execFileSync('git', ['show', `${FIX_COMMIT}^:apps/web/src/server/services/workflows/seedStarterPlaybooks.ts`], { cwd: REPO_ROOT, encoding: 'utf8' });
  writeFileSync(PREFIX_SEEDER, seeder);
  const script = execFileSync('git', ['show', `${FIX_COMMIT}^:apps/web/scripts/seed-starter-playbooks.ts`], { cwd: REPO_ROOT, encoding: 'utf8' })
    .replace(/'\.\.\/src\//g, "'../../src/");
  writeFileSync(PREFIX_SCRIPT, script);
}
function removePrefixFiles() {
  for (const f of [PREFIX_SEEDER, PREFIX_SCRIPT]) if (existsSync(f)) unlinkSync(f);
}

async function run(opts: { throwAfterDrop: boolean }) {
  banner(DIRECT_URL, 'RUN');
  const healed = await preflightHeal();
  if (healed) console.log(`pre-flight: ${healed}`);
  if (existsSync(REVOKE_MARKER) || !(await insertGrantOnTrigger())) {
    console.error('!! PRE-FLIGHT HEAL: a previous run left INSERT on "PlaybookTrigger" revoked. Restoring.');
    const g = await restoreTriggerInsert();
    if (!g.ok) refuse('GRANT HEAL FAILED — staging is in a modified state. STOP.');
  }
  const pre = await teardownFixtures();
  console.log(`pre-flight fixture sweep: deleted ${pre.tenantsDeleted} leftover q623 tenant(s)`);

  await capture();
  const cap = JSON.parse(readFileSync(CAPTURE_PATH, 'utf8')) as { policies: CapturedPolicy[] };
  const have = new Set(cap.policies.map((p) => p.tablename));
  const toDrop = SEED_TABLES.filter((t) => have.has(t));
  console.log(`tables the seeder writes: ${SEED_TABLES.length}; carrying bypass_rls_policy: ${toDrop.length}`);

  const results: CellResult[] = [];
  const push = (r: CellResult) => {
    results.push(r);
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.cell}  ${JSON.stringify(r.detail)}`);
  };
  let threw: string | null = null;
  let grant: Awaited<ReturnType<typeof restoreTriggerInsert>> | null = null;
  let teardown: Awaited<ReturnType<typeof teardownFixtures>> | null = null;
  let r: RestoreResult | null = null;
  try {
    writePrefixFiles();
    await dropOn(toDrop);
    if (opts.throwAfterDrop) throw new Error('--throw-after-drop: deliberate throw between the DROP and the probes, to prove the finally restores.');

    push(spawnCell('hook-control'));
    push(spawnCell('control:pre-fix-seeder', await createFixtureTenant('prefix')));
    // createTenant FIRST, so the fresh-tenant cell's "other tenants unchanged" runs over non-zero rows.
    push(spawnCell('fn:create-tenant'));
    push(spawnCell('fn:seed-fresh-tenant', await createFixtureTenant('fresh')));

    push(scriptCell('caller:script-fixed-armed', resolve(APP_ROOT, 'scripts/seed-starter-playbooks.ts'), 'on', 1));
    push(scriptCell('caller:script-fixed-disarmed', resolve(APP_ROOT, 'scripts/seed-starter-playbooks.ts'), 'off', 1));
    push(scriptCell('witness:script-pre-fix-disarmed', PREFIX_SCRIPT, 'off', 0));

    const forcedTenant = await createFixtureTenant('forced');
    try {
      await revokeTriggerInsert();
      push(spawnCell('fn:forced-failure-seeder', forcedTenant));
      push(spawnCell('fn:forced-failure-create-tenant'));
    } finally {
      grant = await restoreTriggerInsert();
    }
    if (!grant.ok) throw new Error('GRANT restore did not return app_user to DELETE/INSERT/SELECT/UPDATE on PlaybookTrigger');
  } catch (e) {
    threw = (e as Error).message;
    console.error(`\n!! ${threw}`);
  } finally {
    removePrefixFiles();
    if (!grant && existsSync(REVOKE_MARKER)) grant = await restoreTriggerInsert();
    r = await restore();
    printRestore(r);
    try {
      teardown = await teardownFixtures();
      console.log(
        `TEARDOWN: deleted ${teardown.tenantsDeleted} q623 tenant(s); leftover rows total ${Object.values(teardown.leftovers).reduce((a, b) => a + b, 0)}`,
      );
    } catch (e) {
      console.error(`TEARDOWN FAILED: ${(e as Error).message}`);
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      resolve(EVIDENCE_DIR, opts.throwAfterDrop ? '05-throw-after-drop.json' : '05-probe-cells.json'),
      JSON.stringify(
        { generated: new Date().toISOString(), database: `${STAGING_REF} (staging)`, role: 'app_user', tripwire: 'on', droppedPolicyTables: toDrop, threw, results, grant, restore: r, teardown },
        null,
        2,
      ) + '\n',
    );
    if (!r.ok) refuse('RESTORE FAILED — staging is in a modified state. STOP.');
    if (grant && !grant.ok) refuse('GRANT RESTORE FAILED — staging is in a modified state. STOP.');
  }
  if (threw) process.exit(3);
  const bad = results.filter((x) => !x.ok);
  const left = teardown ? Object.values(teardown.leftovers).reduce((a, b) => a + b, 0) : -1;
  if (left !== 0) console.error(`TEARDOWN LEFT ${left} ROWS`);
  if (bad.length || left !== 0) {
    console.error(`FAILED CELLS: ${bad.map((b) => b.cell).join(', ')}`);
    process.exit(2);
  }
  console.log('\nALL CELLS PASS');
}

async function main() {
  const a = process.argv.slice(2);
  const cellIdx = a.indexOf('--cell');
  const argIdx = a.indexOf('--arg');
  if (cellIdx !== -1) return runCell(a[cellIdx + 1], argIdx !== -1 ? a[argIdx + 1] : undefined);
  if (a.includes('--hashes')) return void (await hashes());
  if (a.includes('--run')) return run({ throwAfterDrop: a.includes('--throw-after-drop') });
  console.error('usage: 623-seed-verify.ts [--run [--throw-after-drop] | --hashes]');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
