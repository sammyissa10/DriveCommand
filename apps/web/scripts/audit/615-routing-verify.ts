/**
 * quick-615 — the 47 routed statements, measured per FILE, in BOTH directions,
 * on STAGING.
 *
 *   npx tsx scripts/audit/615-routing-verify.ts --grants   (read-only: the delta)
 *   npx tsx scripts/audit/615-routing-verify.ts --before
 *   npx tsx scripts/audit/615-routing-verify.ts --apply
 *   npx tsx scripts/audit/615-routing-verify.ts --after
 *
 * Modelled closely on `613-routing-verify.ts`. STAGING ONLY. MUST NEVER IMPORT
 * `scripts/_bootstrap-env` (quick-607) — that file used to repoint
 * `DATABASE_URL` at `DIRECT_URL`, and every env file in this repo points
 * `DIRECT_URL` at PRODUCTION. `apps/web/.env.staging` is loaded explicitly and
 * every connection string is refused POSITIVELY: it must contain the staging
 * ref, and naming the production ref is a hard stop before any statement is
 * issued. The resolved project ref goes to STDERR (quick-585/607), never
 * stdout, with the credential never printed at all.
 *
 * ─── WHAT IS BEING MEASURED ────────────────────────────────────────────────
 *
 * quick-615 moved 44 statements onto `getAdminDb` (`app_admin`, BYPASSRLS) and
 * 3 onto `getTenantPrismaForOrg` (`app_user` under a REAL tenant GUC), and
 * fixed one with a GRANT. Three lanes, batched per FILE:
 *
 *   ADMIN          `app_admin`, no tenant GUC. Policies do not apply, so GRANTs
 *                  are the only control — which is exactly what `--before` vs
 *                  `--after` measures.
 *   TENANT (real)  `app_user` under tenant A's GUC. Used as the must-SUCCEED
 *                  lane for the TENANT class, and as the cross-tenant lane
 *                  (GUC = B, reading A's rows) everywhere else.
 *   TENANT (∅)     `app_user` with the EMPTY GUC a sysadmin request actually
 *                  carries, tripwire ARMED. Expect `TC001`.
 *
 * ─── D3 AND ITS INVERSE ────────────────────────────────────────────────────
 *
 * An RLS-refused UPDATE/DELETE is a SILENT 0 ROWS, not a 42501 (quick-599 D3),
 * so every refusal probe takes a PRIVILEGED counter-read on a SEPARATE
 * connection while the probe's transaction is still open. And quick-610's
 * inverse: every cross-tenant `foreign === 0` is paired with an `own > 0` on
 * the SAME connection in the SAME transaction, or the assertion is vacuous.
 *
 * For a `count(*)` probe the SCALAR is the answer, never `rowCount` — which is
 * 1 for every count query.
 *
 * ─── ONE TRANSACTION PER CELL ──────────────────────────────────────────────
 *
 * A `TC001` aborts its transaction and turns every later statement on it into
 * `25P02`, silently corrupting the rest of the matrix. Every cell is its own
 * `BEGIN … ROLLBACK`.
 *
 * ─── FIXTURES ──────────────────────────────────────────────────────────────
 *
 * Staging is sparse: `AutomationRun`, `DriverInvitation`, `Route`,
 * `Subscription`, `SupportTicket`, `TicketMessage`, `Load` and `Customer` are
 * all ZERO-row, and `ActivationProgress`/`AppEvent` hold one row each, both for
 * tenant A. A must-SUCCEED half over an empty set is vacuous (quick-610), so
 * fixtures are created COMMITTED on the privileged connection (the probes run
 * on OTHER connections, so an uncommitted fixture is invisible to them), probed
 * inside `BEGIN … ROLLBACK`, and torn down in a `finally` with an asserted
 * `left === 0`.
 *
 * Each fixture is attempted in its own try and records `created` or
 * `skipped: <reason>`. A probe whose fixture was skipped is reported UNPROVEN
 * rather than silently passing over an empty set. NO `auth.users` ROW IS EVER
 * CREATED — fabricating an identity to make a cell green is not evidence.
 *
 * Invariants asserted at entry AND exit: the staging tenant count (2) and the
 * SYSTEM `AutomationRule` count (6). This task must never destroy either.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence',
);

const MIGRATIONS = [
  '20260915160000_grant_cutover_routing_tables_to_app_admin',
  '20260915170000_auth_user_display_definer_function',
];

/**
 * Migration names this task WROTE, APPLIED TO STAGING, and then RETIRED. Their
 * staging ledger rows are deleted here, with a printed before/after, because a
 * `_prisma_migrations` row naming a directory that does not exist in the repo
 * is exactly the drift this repo refuses to carry.
 *
 * `20260915170000_grant_auth_user_display_columns` granted
 * `USAGE ON SCHEMA auth` + a three-column SELECT on `auth.users` to
 * `app_admin`. The column half landed; the schema half emitted
 * `WARNING: no privileges were granted for "auth"` and did nothing, because
 * `postgres` holds `U` on that schema WITHOUT GRANT OPTION. Its replacement,
 * `20260915170000_auth_user_display_definer_function`, revokes the orphaned
 * column grant so staging converges with production, which never received it.
 */
const RETIRED_MIGRATIONS = ['20260915170000_grant_auth_user_display_columns'];

/** A ledger row that certainly exists on staging. An empty read-back means nothing until this is seen. */
const LEDGER_SENTINEL = '20260915150000_grant_automation_rule_to_app_admin';

/** Every table a routed statement touches, mapped through schema.prisma (none carries an @@map). */
const ROUTED_TABLES = [
  'ActivationProgress', 'AppEvent', 'AutomationRule', 'AutomationRun', 'DriverInvitation',
  'Load', 'NotificationSendLog', 'Route', 'Subscription', 'SupportTicket', 'Tenant',
  'TicketMessage', 'Truck', 'User',
];

/** table -> operations the routed statements need. The AUTHORITY is this list plus the live catalog. */
const REQUIRED: Record<string, string[]> = {
  ActivationProgress: ['SELECT'],
  AppEvent: ['SELECT'],
  AutomationRule: ['SELECT'],
  AutomationRun: ['SELECT'],
  DriverInvitation: ['SELECT', 'INSERT', 'UPDATE'],
  Load: ['SELECT'],
  NotificationSendLog: ['SELECT'],
  Route: ['SELECT'],
  Subscription: ['SELECT'],
  SupportTicket: ['SELECT'],
  Tenant: ['SELECT'],
  TicketMessage: ['SELECT'],
  Truck: ['SELECT'],
  User: ['SELECT', 'UPDATE'],
};

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`615-routing-verify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

/** Positive refusal: the string must NAME staging, and naming production is a hard stop. */
function staging(raw: string | undefined, name: string): string {
  if (!raw) refuse(`${name} is not set`);
  if (raw.includes(PRODUCTION_REF)) refuse(`${name} names PRODUCTION (${PRODUCTION_REF})`);
  if (!raw.includes(STAGING_REF)) refuse(`${name} does not name staging (${STAGING_REF})`);
  return raw.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

const ADMIN_URL = staging(process.env.STAGING_DATABASE_URL_ADMIN, 'STAGING_DATABASE_URL_ADMIN');
const APP_USER_URL = staging(process.env.STAGING_DATABASE_URL_APP_USER, 'STAGING_DATABASE_URL_APP_USER');
const DIRECT_URL = staging(process.env.STAGING_DIRECT_URL, 'STAGING_DIRECT_URL');

/**
 * SQLSTATE lives on the CAUSE CHAIN, never on `err.code` alone (quick-610).
 * Prisma surfaces a `DriverAdapterError` whose own `code`, `errorCode` and
 * `meta` are all `undefined`; a raw `pg` error carries `code` at the top level.
 * One walker serves both. Recognition is by CODE, never by message prose.
 */
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

type Lane = 'ADMIN' | 'TENANT_REAL' | 'TENANT_EMPTY';

const LANE_LABEL: Record<Lane, string> = {
  ADMIN: 'ADMIN — app_admin, no GUC',
  TENANT_REAL: 'TENANT — app_user, REAL tenant GUC',
  TENANT_EMPTY: 'TENANT — app_user, GUC EMPTY (what a sysadmin/cron request carries)',
};

interface Probe {
  file: string;
  site: string;
  lane: Lane;
  expectation: string;
  label: string;
  rows: number | null;
  values: Record<string, string | number | null> | null;
  error: { sqlstate: string; message: string } | null;
  gucSeen: string | null;
  unproven?: string;
  counterRead?: { label: string; value: number };
  pairedOwn?: { label: string; value: number | null; error: string | null };
}

interface OwnPair { label: string; sql: string; params?: unknown[] }

async function main() {
  const mode = process.argv.includes('--apply')
    ? 'apply'
    : process.argv.includes('--after')
      ? 'after'
      : process.argv.includes('--grants')
        ? 'grants'
        : 'before';

  console.error('[db-target] script   : 615-routing-verify.ts');
  console.error(`[db-target] project  : ${STAGING_REF} (staging)`);
  console.error('[db-target] roles    : app_admin (routed lane) + app_user (tenant lane) + postgres (fixtures, counter-reads, DDL)');
  console.error(`[db-target] mode     : ${mode}`);
  console.error(
    `[db-target] intent   : ${
      mode === 'apply'
        ? 'writes (staging DDL + ledger rows)'
        : mode === 'grants'
          ? 'READ ONLY'
          : 'probes inside BEGIN…ROLLBACK; fixtures committed then torn down'
    }`,
  );

  const priv = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await priv.connect();
  const privWho = (await priv.query<{ cu: string; db: string }>('select current_user as cu, current_database() as db')).rows[0];
  if (privWho.cu === 'app_user') refuse('the privileged connection resolved as app_user — it cannot read _prisma_migrations at all');
  console.error(`[db-target] priv     : ${privWho.cu}@${privWho.db}`);

  /** The LIVE catalog is the authority, never admin-connection.md §2's prose list. */
  const heldGrants = async (): Promise<Record<string, string[]>> => {
    const rows = (
      await priv.query<{ table_name: string; privilege_type: string }>(
        `select table_name, privilege_type from information_schema.role_table_grants
          where table_schema='public' and grantee='app_admin' and table_name = ANY($1)
          order by table_name, privilege_type`,
        [ROUTED_TABLES],
      )
    ).rows;
    const out: Record<string, string[]> = {};
    for (const t of ROUTED_TABLES) out[t] = [];
    for (const r of rows) out[r.table_name].push(r.privilege_type);
    return out;
  };

  const grantDelta = async () => {
    const held = await heldGrants();
    return ROUTED_TABLES.map((t) => {
      const need = REQUIRED[t];
      const have = held[t].slice().sort();
      const missing = need.filter((op) => !have.includes(op));
      return { table: t, needed: need, held: have, missing };
    });
  };

  const authState = async () => ({
    app_admin_auth_usage: (await priv.query(`select has_schema_privilege('app_admin','auth','USAGE') as v`)).rows[0].v,
    app_user_auth_usage: (await priv.query(`select has_schema_privilege('app_user','auth','USAGE') as v`)).rows[0].v,
    columnGrants: (
      await priv.query(
        `select grantee, table_name, column_name, privilege_type from information_schema.column_privileges
          where table_schema='auth' and grantee in ('app_user','app_admin') order by 1,2,3,4`,
      )
    ).rows,
  });

  const bypassTableList = async (): Promise<string[]> =>
    (
      await priv.query<{ relname: string }>(
        "select c.relname from pg_policy p join pg_class c on c.oid=p.polrelid where p.polname='bypass_rls_policy' order by 1",
      )
    ).rows.map((r) => r.relname);

  // ── GRANTS (read-only) ───────────────────────────────────────────────────
  if (mode === 'grants') {
    const delta = await grantDelta();
    const auth = await authState();
    const bypass = await bypassTableList();
    console.log(JSON.stringify({ project: STAGING_REF, delta, auth, bypassCount: bypass.length, bypassTables: bypass }, null, 2));
    await priv.end();
    return;
  }

  // ── APPLY ────────────────────────────────────────────────────────────────
  if (mode === 'apply') {
    const grantsBefore = await grantDelta();
    const authBefore = await authState();
    const bypassBefore = await bypassTableList();

    const out: string[] = [];
    const say = (s: string) => { out.push(s); console.log(s); };

    say('# quick-615 — DEC-17 ledger read-back');
    say('');
    say(`database  : ${STAGING_REF} (staging), connected as ${privWho.cu}`);
    say('');
    say('## grants on the routed tables BEFORE');
    say('');
    say('| table | needed | held by app_admin | missing |');
    say('|---|---|---|---|');
    for (const d of grantsBefore) {
      say(`| \`${d.table}\` | ${d.needed.join(', ')} | ${d.held.join(', ') || '*(none)*'} | ${d.missing.join(', ') || '—'} |`);
    }
    say('');
    say(`\`has_schema_privilege('app_admin','auth','USAGE')\` BEFORE = **${authBefore.app_admin_auth_usage}**`);
    say(`\`has_schema_privilege('app_user','auth','USAGE')\`  BEFORE = **${authBefore.app_user_auth_usage}**`);
    say(`auth column grants to app_user/app_admin BEFORE: **${authBefore.columnGrants.length}**`);
    say(`\`bypass_rls_policy\` tables BEFORE: **${bypassBefore.length}**`);
    say('');

    for (const name of MIGRATIONS) {
      const file = resolve(APP_ROOT, 'prisma/migrations', name, 'migration.sql');
      if (!existsSync(file)) refuse(`migration file missing: ${name}`);
      const raw = readFileSync(file, 'utf8');

      /**
       * STRIP `--` COMMENTS BEFORE EVERY CHECK. Load-bearing, not
       * belt-and-braces: these headers explain WHY `GRANT ALL`, INSERT and
       * DELETE are excluded, and quote `role_table_grants` rows that read
       * "DELETE, INSERT, SELECT, UPDATE". A raw-text guard would refuse the
       * migration on the prose describing the invariant it exists to protect —
       * quick-612 (`AS RESTRICTIVE`) and quick-600 (`pool.on('connect'`) both
       * hit exactly this. The CODE is what must be checked.
       */
      const stripped = raw.replace(/^\s*--.*$/gm, '');

      /**
       * AND BLANK STRING LITERALS TOO — quick-615 hit this within the hour.
       * `COMMENT ON FUNCTION … IS '…'` in the auth migration explains, in
       * prose, that the migrating role "holds U without GRANT OPTION". That is
       * a SQL STRING, not a comment, so the `--` stripper leaves it, and the
       * per-statement GRANT parser below then read `GRANT` from inside an
       * English sentence and refused the file. Exactly quick-612's
       * `AS RESTRICTIVE` and quick-600's `pool.on('connect'` — a guard
       * false-positiving on the prose that describes the invariant it protects
       * — arriving through a THIRD door. Single-quoted literals and
       * dollar-quoted bodies are blanked, preserving length so nothing else
       * shifts.
       *
       * The dollar-quote rule is narrow ON PURPOSE: only a FUNCTION BODY —
       * a dollar-quoted block introduced by `AS` — is blanked. A `DO $$ … $$`
       * block is NOT, because that is where this repo's migrations put their
       * actual `GRANT` statements, and blanking it would disarm every check
       * below while still passing.
       */
      const blank = (m: string) => ' '.repeat(m.length);
      const code = stripped
        .replace(/\bAS\s+\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/gi, (m) => 'AS' + blank(m.slice(2)))
        .replace(/'(?:[^']|'')*'/g, blank);

      if (/\b(CREATE|DROP|ALTER)\s+POLICY\b/i.test(code)) refuse(`${name}: contains policy DDL — this is a GRANT migration`);
      if (/GRANT\s+ALL\b/i.test(code)) refuse(`${name}: contains GRANT ALL`);
      if (/ALL\s+TABLES\s+IN\s+SCHEMA/i.test(code)) refuse(`${name}: contains ALL TABLES IN SCHEMA`);
      if (/ALTER\s+DEFAULT\s+PRIVILEGES/i.test(code)) refuse(`${name}: contains ALTER DEFAULT PRIVILEGES`);
      if (/bypass_rls_policy/i.test(code)) refuse(`${name}: touches bypass_rls_policy`);
      if (/\bGRANT\b[^;]*\bTO\s+(app_user|authenticated|anon)\b/i.test(code)) {
        refuse(`${name}: GRANTs to a role other than app_admin — the narrowest role that needs it is the only one that gets it`);
      }
      if (/\bGRANT\b[^;]*\bTO\s+PUBLIC\b/i.test(code)) {
        refuse(`${name}: GRANTs to PUBLIC`);
      }
      /**
       * EARNED GUARD, quick-615. `GRANT … ON SCHEMA auth` from the role every
       * migration runs as (`postgres`) is a SILENT NO-OP: `pg_namespace.nspacl`
       * gives it `U` WITHOUT GRANT OPTION, so PostgreSQL emits
       * `WARNING: no privileges were granted for "auth"` — a WARNING, not an
       * error — the transaction commits, and the migration "succeeds" having
       * changed nothing. This task shipped exactly that file and only the
       * both-directions matrix caught it. Refuse the shape.
       */
      if (/\bGRANT\b[^;]*\bON\s+SCHEMA\s+auth\b/i.test(code)) {
        refuse(`${name}: GRANT ... ON SCHEMA auth — measured to be a silent no-op from the migrating role (WARNING: no privileges were granted for "auth"). Use a SECURITY DEFINER function in public instead.`);
      }
      /** A SECURITY DEFINER function that does not revoke PUBLIC is open to every role. */
      if (/SECURITY\s+DEFINER/i.test(code) && !/REVOKE\s+ALL\s+ON\s+FUNCTION[^;]*FROM\s+PUBLIC/i.test(code)) {
        refuse(`${name}: declares SECURITY DEFINER without REVOKE ALL ON FUNCTION ... FROM PUBLIC — PostgreSQL grants EXECUTE to PUBLIC by default`);
      }
      /** A SECURITY DEFINER function without a pinned search_path is an escalation primitive. */
      if (/SECURITY\s+DEFINER/i.test(code) && !/SET\s+search_path\s*=/i.test(code)) {
        refuse(`${name}: declares SECURITY DEFINER without a pinned SET search_path`);
      }

      /** Every GRANT must name an operation the measured delta actually requires. */
      for (const stmt of code.split(';')) {
        const gi = stmt.search(/\bGRANT\b/i);
        if (gi < 0) continue;
        // `ON` must be found AFTER the GRANT, never anywhere in the fragment —
        // a backwards slice produces an empty verb list, which then satisfies
        // or violates the checks below for reasons that have nothing to do with
        // the statement.
        const rel = stmt.slice(gi).search(/\bON\b/i);
        if (rel < 0) continue;
        const oi = gi + rel;
        const verbs = stmt.slice(gi + 5, oi);
        const target = stmt.slice(oi);
        // The schema-USAGE grant carries no table.
        if (/\bSCHEMA\b/i.test(target)) {
          if (!/\bUSAGE\b/i.test(verbs)) refuse(`${name}: a SCHEMA grant naming something other than USAGE`);
          continue;
        }
        if (/auth\.users/i.test(target)) {
          if (!/\bSELECT\s*\(/i.test(stmt)) refuse(`${name}: an UNQUALIFIED grant on auth.users — column-level or not at all`);
          if (/encrypted_password|confirmation_token|recovery_token|reauthentication_token|phone_change_token|email_change_token/i.test(stmt)) {
            refuse(`${name}: the auth.users grant names a secret column`);
          }
          continue;
        }
        const m = /"([A-Za-z]+)"/.exec(target);
        if (!m) continue;
        const table = m[1];
        const need = REQUIRED[table];
        if (!need) refuse(`${name}: grants on "${table}", which no routed statement touches`);
        for (const verb of ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) {
          if (new RegExp(`\\b${verb}\\b`, 'i').test(verbs) && !need.includes(verb)) {
            refuse(`${name}: grants ${verb} on "${table}", which is NOT in the measured delta (${need.join(', ')})`);
          }
        }
      }

      console.error(`[615] ${name}: apply guards passed (checked against comment-stripped SQL)`);

      const lf = raw.replace(/\r\n/g, '\n');
      await priv.query('BEGIN');
      await priv.query(lf);
      await priv.query('COMMIT');
      say(`## ${name}`);
      say('');
      say('APPLIED to staging (single transaction, committed)');

      // ── DEC-17: the ledger row, by hand, behind a sentinel ───────────────
      //
      // Neither MCP tool writes Prisma's `_prisma_migrations` ledger:
      // `apply_migration` records into SUPABASE's own, DIFFERENT ledger
      // (quick-581 disproved "it does both" directly). The row is written by
      // hand and READ BACK — and the read-back is only meaningful behind a
      // sentinel, because `_prisma_migrations` has RLS enabled with ZERO
      // policies and no `app_user` grant, so an empty read from a non-owner
      // role is indistinguishable from absence and the natural response to
      // that is a DUPLICATE WRITE.
      const checksum = createHash('sha256').update(lf, 'utf8').digest('hex');
      say(`sha256 over LF bytes : \`${checksum}\``);

      const sentinel = await priv.query('select migration_name from _prisma_migrations where migration_name = $1', [LEDGER_SENTINEL]);
      say(`SENTINEL \`${LEDGER_SENTINEL}\` visible: **${sentinel.rowCount === 1 ? 'YES' : 'NO — an empty read here means NOTHING about absence'}**`);
      if (sentinel.rowCount !== 1) { console.error('ABORT: sentinel not visible.'); process.exit(1); }

      const already = await priv.query('select migration_name from _prisma_migrations where migration_name = $1', [name]);
      if (already.rowCount === 0) {
        await priv.query(
          `insert into _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
           select $1::uuid, $2::varchar, now(), $3::varchar, '', NULL, now(), 0
            where not exists (select 1 from _prisma_migrations where migration_name = $3::varchar)`,
          [randomUUID(), checksum, name],
        );
        say('ledger row INSERTed BY HAND — no MCP tool and no DDL writes this (DEC-17)');
      } else {
        const upd = await priv.query(
          `update _prisma_migrations set checksum = $1::varchar where migration_name = $2::varchar and checksum <> $1::varchar`,
          [checksum, name],
        );
        say(`ledger row already present — checksum ${upd.rowCount ? 'REFRESHED (file changed)' : 'unchanged'}`);
      }

      const back = await priv.query<{ migration_name: string; checksum: string; applied_steps_count: number; logs: string; same_ts: boolean }>(
        `select migration_name, checksum, applied_steps_count, logs, (started_at = finished_at) as same_ts
           from _prisma_migrations where migration_name = $1`, [name],
      );
      const row = back.rows[0];
      say('');
      say('READ BACK:');
      say(`  \`${row.migration_name}\` | steps=${row.applied_steps_count} | logs=${JSON.stringify(row.logs)} | started=finished:${row.same_ts} | checksum=\`${row.checksum}\``);
      say(`  checksum is a real SHA-256, not 'manual': **${row.checksum === checksum}**`);
      say(`  applied_steps_count is 0 (mirrored, not executed by migrate.mjs): **${row.applied_steps_count === 0}**`);
      say(`  logs = '' : **${row.logs === ''}**`);
      say(`  started_at = finished_at : **${row.same_ts === true}**`);
      say('');
      if (row.checksum !== checksum || row.applied_steps_count !== 0 || row.logs !== '' || row.same_ts !== true) {
        console.error('READ-BACK DISAGREES WITH WHAT WAS WRITTEN.');
        process.exit(1);
      }
    }

    // ── retire the ledger rows of migrations this task withdrew ───────────
    for (const name of RETIRED_MIGRATIONS) {
      const before = await priv.query('select migration_name, applied_steps_count from _prisma_migrations where migration_name = $1', [name]);
      say(`## RETIRED — \`${name}\``);
      say('');
      say(`staging ledger row present BEFORE cleanup: **${before.rowCount === 1}**${before.rowCount === 1 ? ` (applied_steps_count=${before.rows[0].applied_steps_count})` : ''}`);
      if (existsSync(resolve(APP_ROOT, 'prisma/migrations', name, 'migration.sql'))) {
        refuse(`${name} is listed as RETIRED but its directory still exists — one of the two is wrong`);
      }
      const del = await priv.query('delete from _prisma_migrations where migration_name = $1', [name]);
      const after = await priv.query('select 1 from _prisma_migrations where migration_name = $1', [name]);
      say(`rows deleted: **${del.rowCount}** · present AFTER: **${after.rowCount === 1}** (expected false)`);
      say('');
      if (after.rowCount !== 0) { console.error('RETIRED LEDGER ROW SURVIVED ITS DELETE.'); process.exit(1); }
    }

    const newest = await priv.query<{ migration_name: string }>(
      `select migration_name from _prisma_migrations order by finished_at desc nulls last limit 3`);
    say('## newest 3 ledger rows AFTER both writes');
    say('');
    for (const r of newest.rows) say(`- \`${r.migration_name}\``);
    say('');
    say(`HEAD IS OURS: **${MIGRATIONS.includes(newest.rows[0].migration_name)}**`);
    const total = (await priv.query('select count(*)::int as n from _prisma_migrations')).rows[0].n;
    say(`staging \`_prisma_migrations\` rows AFTER: **${total}**`);
    say('');

    const grantsAfter = await grantDelta();
    const authAfter = await authState();
    const bypassAfter = await bypassTableList();
    say('## grants on the routed tables AFTER');
    say('');
    say('| table | needed | held by app_admin | still missing |');
    say('|---|---|---|---|');
    for (const d of grantsAfter) {
      say(`| \`${d.table}\` | ${d.needed.join(', ')} | ${d.held.join(', ') || '*(none)*'} | ${d.missing.join(', ') || '**none**'} |`);
    }
    say('');
    say(`\`has_schema_privilege('app_admin','auth','USAGE')\` AFTER = **${authAfter.app_admin_auth_usage}**`);
    say(`\`has_schema_privilege('app_user','auth','USAGE')\`  AFTER = **${authAfter.app_user_auth_usage}** (unchanged — app_user gets nothing)`);
    say('');
    say('auth column grants AFTER:');
    for (const g of authAfter.columnGrants) say(`- \`${g.grantee}\` → \`auth.${g.table_name}.${g.column_name}\` : ${g.privilege_type}`);
    say('');
    say(`\`bypass_rls_policy\` tables: **${bypassBefore.length}** before, **${bypassAfter.length}** after — sorted list identical: **${JSON.stringify(bypassBefore) === JSON.stringify(bypassAfter)}**`);

    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, '04-ledger-readback.md'), out.join('\n') + '\n', 'utf8');
    await priv.end();
    return;
  }

  // ── BEFORE / AFTER — the per-FILE matrix ─────────────────────────────────
  const tenants = (await priv.query<{ id: string; name: string }>('select id, name from "Tenant" order by "createdAt"')).rows;
  if (tenants.length !== 2) refuse(`expected exactly 2 staging tenants, found ${tenants.length}`);
  const A = tenants[0].id;
  const B = tenants[1].id;
  console.error(`[db-target] tenantA  : ${A} (${tenants[0].name})`);
  console.error(`[db-target] tenantB  : ${B} (${tenants[1].name})`);

  const systemAtEntry = (await priv.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)).rows[0].n;
  if (systemAtEntry !== 6) refuse(`expected 6 SYSTEM platform rules at entry, found ${systemAtEntry}`);
  const systemRule = (
    await priv.query<{ id: string; key: string }>(`select id, key from "AutomationRule" where scope='SYSTEM' order by key limit 1`)
  ).rows[0];

  const userOf = async (tenantId: string) =>
    (await priv.query<{ id: string }>(`select id from "User" where "tenantId"=$1 order by id limit 1`, [tenantId])).rows[0].id;
  const truckOf = async (tenantId: string) =>
    (await priv.query<{ id: string }>(`select id from "Truck" where "tenantId"=$1 order by id limit 1`, [tenantId])).rows[0]?.id ?? null;
  const userA = await userOf(A);
  const userB = await userOf(B);
  const truckA = await truckOf(A);
  const truckB = await truckOf(B);
  const planId = (await priv.query<{ id: string }>(`select id from "Plan" order by id limit 1`)).rows[0]?.id ?? null;

  const delta = await grantDelta();
  const authNow = await authState();
  const bypassNow = await bypassTableList();
  console.error(`[615] grant gaps : ${delta.filter((d) => d.missing.length).map((d) => `${d.table}(${d.missing.join('/')})`).join(' · ') || '(none)'}`);
  console.error(`[615] auth USAGE : app_admin=${authNow.app_admin_auth_usage} app_user=${authNow.app_user_auth_usage}`);

  // ── fixtures ─────────────────────────────────────────────────────────────
  const TAG = 'quick615';
  const fixtures: { name: string; status: 'created' | 'skipped'; detail: string }[] = [];
  const ids: Record<string, string> = {};

  const fixture = async (name: string, fn: () => Promise<string>) => {
    try {
      const detail = await fn();
      fixtures.push({ name, status: 'created', detail });
    } catch (e) {
      fixtures.push({ name, status: 'skipped', detail: `${sqlstateOf(e)} ${String((e as Error).message).split('\n')[0]}` });
    }
  };

  await fixture('ActivationProgress(B)', async () => {
    await priv.query(`insert into "ActivationProgress" ("tenantId","completionPct") values ($1, 20)
      on conflict ("tenantId") do nothing`, [B]);
    return `tenant B (tenant A already carries the single pre-existing row)`;
  });
  await fixture('AppEvent(B)', async () => {
    ids.appEventB = randomUUID();
    await priv.query(`insert into "AppEvent" (id,"tenantId","eventType") values ($1,$2,$3)`, [ids.appEventB, B, `${TAG}.fixture`]);
    return `1 row, eventType='${TAG}.fixture'`;
  });
  for (const [tag, t] of [['A', A], ['B', B]] as const) {
    await fixture(`AutomationRun(${tag})`, async () => {
      ids[`run${tag}`] = randomUUID();
      await priv.query(
        `insert into "AutomationRun" (id,"ruleId","tenantId","triggeredBy",status,"firedAt")
         values ($1,$2,$3,$4,'FIRED'::"AutomationRunStatus",now())`,
        [ids[`run${tag}`], systemRule.id, t, `${TAG}:fixture`]);
      return `1 row on SYSTEM rule ${systemRule.key}`;
    });
    await fixture(`DriverInvitation(${tag})`, async () => {
      ids[`inv${tag}`] = randomUUID();
      await priv.query(
        `insert into "DriverInvitation" (id,"tenantId",email,"firstName","lastName","expiresAt","updatedAt")
         values ($1,$2,$3,'Quick','Fixture', now() + interval '7 days', now())`,
        [ids[`inv${tag}`], t, `${TAG}+${tag}@example.invalid`]);
      return '1 PENDING row';
    });
    await fixture(`NotificationSendLog(${tag})`, async () => {
      ids[`nsl${tag}`] = randomUUID();
      await priv.query(
        `insert into "NotificationSendLog" (id,"tenantId","triggerKey",channel,status,"idempotencyKey","updatedAt")
         values ($1,$2,$3,'EMAIL'::"NotificationChannel",'SENT'::"NotificationSendStatus",$4, now())`,
        [ids[`nsl${tag}`], t, `${TAG}.fixture`, `${TAG}:${tag}:${ids[`nsl${tag}`]}`]);
      return '1 SENT row';
    });
    await fixture(`SupportTicket(${tag})`, async () => {
      ids[`tkt${tag}`] = randomUUID();
      await priv.query(
        `insert into "SupportTicket" (id,"tenantId","ticketNumber","submittedBy","fromPage",title,description,"updatedAt")
         values ($1,$2,$3,$4,'/quick615','${TAG} fixture','disposable', now())`,
        [ids[`tkt${tag}`], t, `${TAG}-${tag}-${ids[`tkt${tag}`].slice(0, 8)}`, tag === 'A' ? userA : userB]);
      return '1 OPEN ticket';
    });
    await fixture(`TicketMessage(${tag})`, async () => {
      if (!ids[`tkt${tag}`]) throw new Error('its SupportTicket fixture was skipped');
      ids[`msg${tag}`] = randomUUID();
      await priv.query(
        `insert into "TicketMessage" (id,"ticketId","senderType","senderLabel",body)
         values ($1,$2,'OWNER'::"TicketMessageSenderType",'${TAG}','disposable')`,
        [ids[`msg${tag}`], ids[`tkt${tag}`]]);
      return '1 OWNER message';
    });
    await fixture(`Route(${tag})`, async () => {
      ids[`rt${tag}`] = randomUUID();
      await priv.query(
        `insert into "Route" (id,"tenantId","driverId",origin,destination,"scheduledDate","updatedAt","truckId")
         values ($1,$2,$3,'${TAG}-origin','${TAG}-dest', now(), now(), $4)`,
        [ids[`rt${tag}`], t, tag === 'A' ? userA : userB, tag === 'A' ? truckA : truckB]);
      return '1 route';
    });
    await fixture(`Subscription(${tag})`, async () => {
      if (!planId) throw new Error('no Plan row exists on staging to satisfy Subscription_planId_fkey');
      ids[`sub${tag}`] = randomUUID();
      await priv.query(
        `insert into "Subscription" (id,"tenantId","planId","trialEndsAt","updatedAt")
         values ($1,$2,$3, now() + interval '4 days', now())
         on conflict ("tenantId") do nothing`,
        [ids[`sub${tag}`], t, planId]);
      return '1 TRIALING-window row';
    });
  }
  // `Load` is deliberately NOT fixtured: `Load_customerId_fkey` requires a
  // `Customer`, and `Customer` is zero-row on staging. Creating a customer to
  // create a load to prove a grant that is ALREADY HELD is a chain of
  // fabrication for no evidence. The Load cell is reported UNPROVEN-on-rows and
  // says so.
  fixtures.push({ name: 'Load(A,B)', status: 'skipped', detail: 'Load_customerId_fkey needs a Customer and Customer is zero-row on staging; reported UNPROVEN rather than fabricated' });
  fixtures.push({ name: 'auth.users', status: 'skipped', detail: 'DELIBERATE — no identity is ever fabricated. Staging already holds 9 real rows, so the cell is not vacuous.' });

  const fx = (n: string) => fixtures.find((f) => f.name === n)?.status === 'created';
  console.error(`[615] fixtures   : ${fixtures.filter((f) => f.status === 'created').length} created, ${fixtures.filter((f) => f.status === 'skipped').length} skipped`);
  for (const f of fixtures.filter((f) => f.status === 'skipped')) console.error(`[615]   skipped  : ${f.name} — ${f.detail}`);

  const adminC = new Client({ connectionString: ADMIN_URL, connectionTimeoutMillis: 30000 });
  await adminC.connect();
  const adminWho = (await adminC.query<{ cu: string }>('select current_user as cu')).rows[0].cu;
  if (adminWho !== 'app_admin') refuse(`the ADMIN lane resolved as ${adminWho}, not app_admin`);

  const appC = new Client({ connectionString: APP_USER_URL, connectionTimeoutMillis: 30000 });
  await appC.connect();
  const appWho = (await appC.query<{ cu: string }>('select current_user as cu')).rows[0].cu;
  if (appWho !== 'app_user') refuse(`the TENANT lane resolved as ${appWho}, not app_user`);
  // A session-level SET is the ONLY arming mechanism there is (quick-602).
  await appC.query(`select set_config('app.tenant_context_tripwire','on',false)`);
  const tripwire = (await appC.query<{ v: string | null }>(`select current_setting('app.tenant_context_tripwire', true) as v`)).rows[0].v;
  if (tripwire !== 'on') refuse(`the tripwire read back as ${JSON.stringify(tripwire)}, not 'on' — this run would measure nothing`);
  console.error(`[615] lanes      : app_admin=${adminWho} · app_user=${appWho} · tripwire=${tripwire}`);

  const probes: Probe[] = [];

  const run = async (
    file: string,
    site: string,
    lane: Lane,
    expectation: string,
    label: string,
    sql: string,
    params: unknown[] = [],
    opts: { guc?: string; counter?: { label: string; sql: string }; own?: OwnPair; unproven?: string } = {},
  ) => {
    const c = lane === 'ADMIN' ? adminC : appC;
    const p: Probe = { file, site, lane, expectation, label, rows: null, values: null, error: null, gucSeen: null };
    if (opts.unproven) p.unproven = opts.unproven;
    await c.query('BEGIN');
    try {
      if (lane === 'TENANT_REAL') await c.query(`select set_config('app.current_tenant_id',$1,true)`, [opts.guc ?? A]);
      // Read the GUC BEFORE the probe: if the probe raises, the transaction is
      // aborted and nothing else can be asked of it.
      if (lane !== 'ADMIN') {
        p.gucSeen = (await c.query<{ v: string | null }>(`select current_setting('app.current_tenant_id', true) as v`)).rows[0].v;
      }
      const r = await c.query(sql, params as never[]);
      p.rows = r.rowCount;
      if (r.rows.length) {
        p.values = {};
        for (const [k, v] of Object.entries(r.rows[0] as Record<string, unknown>)) {
          p.values[k] = typeof v === 'number' || typeof v === 'string' ? v : v === null ? null : String(v);
        }
      }
      if (opts.own) {
        try {
          const o = await c.query(opts.own.sql, (opts.own.params ?? []) as never[]);
          p.pairedOwn = { label: opts.own.label, value: Number((o.rows[0] as { n: number }).n), error: null };
        } catch (e) {
          p.pairedOwn = { label: opts.own.label, value: null, error: sqlstateOf(e) };
        }
      }
    } catch (e) {
      p.error = { sqlstate: sqlstateOf(e), message: String((e as Error).message ?? e).split('\n')[0] };
      if (opts.own) {
        // The probe's transaction is aborted; the own-read needs a fresh one or
        // it returns 25P02 and says nothing.
        await c.query('ROLLBACK');
        await c.query('BEGIN');
        if (lane === 'TENANT_REAL') await c.query(`select set_config('app.current_tenant_id',$1,true)`, [opts.guc ?? A]);
        try {
          const o = await c.query(opts.own.sql, (opts.own.params ?? []) as never[]);
          p.pairedOwn = { label: opts.own.label, value: Number((o.rows[0] as { n: number }).n), error: null };
        } catch (e2) {
          p.pairedOwn = { label: opts.own.label, value: null, error: sqlstateOf(e2) };
        }
      }
    } finally {
      // The counter-read runs on the PRIVILEGED connection while the probe's
      // transaction is still open, so it sees COMMITTED state and cannot be
      // fooled by the probe's own uncommitted work.
      if (opts.counter) {
        const cr = await priv.query(opts.counter.sql);
        p.counterRead = { label: opts.counter.label, value: Number((cr.rows[0] as { n: number }).n) };
      }
      await c.query('ROLLBACK');
    }
    probes.push(p);
  };

  /** ADMIN must-succeed + TENANT(∅) must-TC001 + optional cross-tenant pairing. */
  const triple = async (
    file: string, site: string, sql: string, params: unknown[] = [],
    cross?: { foreignSql: string; foreignParams?: unknown[]; own: OwnPair },
    opts: { adminExpectation?: string; unproven?: string; counter?: { label: string; sql: string } } = {},
  ) => {
    await run(file, site, 'ADMIN', opts.adminExpectation ?? 'must SUCCEED', 'the routed statement on its new receiver', sql, params,
      { counter: opts.counter, unproven: opts.unproven });
    await run(file, site, 'TENANT_EMPTY', 'must be TC001', 'the OLD receiver, with the GUC a sysadmin/cron request actually carries', sql, params,
      { counter: opts.counter });
    if (cross) {
      await run(file, site, 'TENANT_REAL', 'foreign must be 0, PAIRED with own > 0',
        "the old receiver under ANOTHER tenant's GUC — cross-tenant refusal", cross.foreignSql, cross.foreignParams ?? [],
        { guc: B, own: cross.own });
    }
  };

  const ownPair = (table: string, col = '"tenantId"'): OwnPair => ({
    label: `own (tenant B) rows readable on the SAME connection`,
    sql: `select count(*)::int as n from "${table}" where ${col} = $1`,
    params: [B],
  });

  try {
    // ══ FILE — (admin)/actions/notifications.ts ═════════════════════════════
    await triple(
      'app/(admin)/actions/notifications.ts',
      'listNotificationSendLog + getDeliveryStatistics — NotificationSendLog',
      `select count(*)::int as send_log_rows from "NotificationSendLog"`,
      [],
      {
        foreignSql: `select count(*)::int as n from "NotificationSendLog" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('NotificationSendLog'),
      },
      { adminExpectation: mode === 'before' ? 'must be 42501 — NO GRANT YET' : 'must SUCCEED — the grant is live' },
    );

    // ══ FILE — (admin)/actions/sysadmin-invoices.ts ═════════════════════════
    // NOT ROUTED and NOT A BLOCKER. The file appears in the matrix with a
    // verdict and no probe, because "every file must appear" includes the one
    // that dropped off the list.
    probes.push({
      file: 'app/(admin)/actions/sysadmin-invoices.ts',
      site: ':83 — Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>>',
      lane: 'ADMIN',
      expectation: 'NO PROBE — NOT A RUNTIME STATEMENT',
      label: 'a type query in a return-type annotation; erased by the compiler, issues no SQL',
      rows: null, values: null, error: null, gucSeen: null,
      unproven: 'nothing to probe — 614 §2.1 B-2 is a type, not a statement. The file holds ZERO runtime bare statements and 10 getAdminDb calls.',
    });

    // ══ FILE — (admin)/actions/tenants.ts ══════════════════════════════════
    await triple(
      'app/(admin)/actions/tenants.ts',
      'getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route)',
      `select (select count(*) from "Tenant")::int as tenants,
              (select count(*) from "User")::int as users,
              (select count(*) from "Truck")::int as trucks,
              (select count(*) from "Route")::int as routes`,
      [],
      {
        foreignSql: `select count(*)::int as n from "Tenant" where id = $1`,
        foreignParams: [A],
        own: { label: 'own tenant (B) still readable on the SAME connection', sql: `select count(*)::int as n from "Tenant" where id = $1`, params: [B] },
      },
      { adminExpectation: mode === 'before' ? 'must be 42501 — Route is UNGRANTED' : 'must SUCCEED — the grant is live' },
    );
    await triple(
      'app/(admin)/actions/tenants.ts',
      'getSystemMetrics — Load + SupportTicket platform counts',
      `select (select count(*) from "Load")::int as loads,
              (select count(*) from "SupportTicket")::int as open_tickets`,
      [],
      {
        foreignSql: `select count(*)::int as n from "SupportTicket" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('SupportTicket'),
      },
      { unproven: fx('SupportTicket(A)') ? undefined : 'SupportTicket fixture was skipped' },
    );
    await triple(
      'app/(admin)/actions/tenants.ts',
      'createTenant :123 — DriverInvitation INSERT (receiver swap onto adminDb)',
      `insert into "DriverInvitation" (id,"tenantId",email,"firstName","lastName","expiresAt","updatedAt")
       values (gen_random_uuid(), $1, 'quick615-probe@example.invalid','Probe','Row', now() + interval '7 days', now())`,
      [A],
      undefined,
      {
        adminExpectation: mode === 'before' ? 'must be 42501 — NO INSERT GRANT YET' : 'must SUCCEED — the grant is live',
        counter: { label: 'DriverInvitation rows on staging (unchanged — every probe is rolled back)', sql: `select count(*)::int n from "DriverInvitation"` },
      },
    );
    await triple(
      'app/(admin)/actions/tenants.ts',
      'resendOwnerInvitation :376 — DriverInvitation UPDATE',
      `update "DriverInvitation" set status = 'PENDING' where "tenantId" = $1`,
      [A],
      undefined,
      {
        adminExpectation: mode === 'before' ? 'must be 42501 — NO UPDATE GRANT YET' : 'must SUCCEED — the grant is live',
        counter: { label: "tenant A's invitations still present", sql: `select count(*)::int n from "DriverInvitation" where "tenantId" = '${A}'` },
        unproven: fx('DriverInvitation(A)') ? undefined : 'DriverInvitation fixture was skipped',
      },
    );
    await triple(
      'app/(admin)/actions/tenants.ts',
      'updateOwnerEmail :472/:480 — User SELECT then UPDATE',
      `update "User" set "updatedAt" = now() where id = $1`,
      [userA],
      undefined,
      {
        adminExpectation: mode === 'before' ? 'must be 42501 — NO UPDATE GRANT YET' : 'must SUCCEED — the grant is live',
        counter: { label: 'the user row still exists', sql: `select count(*)::int n from "User" where id = '${userA}'` },
      },
    );

    // ══ FILE — (admin)/actions/users.ts ════════════════════════════════════
    await triple(
      'app/(admin)/actions/users.ts',
      'getAllUsers — User across every tenant, joined to Tenant.name',
      `select count(u.id)::int as users_visible, count(t.name)::int as tenant_names_visible
         from "User" u left join "Tenant" t on t.id = u."tenantId"`,
      [],
      {
        foreignSql: `select count(*)::int as n from "User" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('User'),
      },
    );
    await triple(
      'app/(admin)/actions/users.ts',
      'updateUserProfile :115/:130 — User UPDATE (and its compensating rollback)',
      `update "User" set "updatedAt" = now() where id = $1`,
      [userB],
      undefined,
      {
        adminExpectation: mode === 'before' ? 'must be 42501 — NO UPDATE GRANT YET' : 'must SUCCEED — the grant is live',
        counter: { label: 'the user row still exists', sql: `select count(*)::int n from "User" where id = '${userB}'` },
      },
    );

    // ══ FILE — (admin)/admin-support/page.tsx ══════════════════════════════
    await triple(
      'app/(admin)/admin-support/page.tsx',
      ':24 — the ticket filter tenant dropdown',
      `select count(*)::int as tenants from "Tenant"`,
      [],
      {
        foreignSql: `select count(*)::int as n from "Tenant" where id = $1`,
        foreignParams: [A],
        own: { label: 'own tenant (B) still readable on the SAME connection', sql: `select count(*)::int as n from "Tenant" where id = $1`, params: [B] },
      },
    );

    // ══ FILE — (admin)/tenants/[id]/activation-progress-section.tsx ════════
    await triple(
      'app/(admin)/tenants/[id]/activation-progress-section.tsx',
      ':20 — ActivationProgress for an ARBITRARY tenant',
      `select count(*)::int as n from "ActivationProgress" where "tenantId" = $1`,
      [A],
      {
        foreignSql: `select count(*)::int as n from "ActivationProgress" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('ActivationProgress'),
      },
      {
        adminExpectation: mode === 'before' ? 'must be 42501 — NO GRANT YET' : 'must SUCCEED — the grant is live',
        unproven: fx('ActivationProgress(B)') ? undefined : 'the tenant-B ActivationProgress fixture was skipped',
      },
    );

    // ══ FILE — (admin)/tenants/[id]/automation-runs-section.tsx ════════════
    await triple(
      'app/(admin)/tenants/[id]/automation-runs-section.tsx',
      ':10 — AutomationRun joined to AutomationRule, for an ARBITRARY tenant',
      `select count(ar.id)::int as runs_visible, count(r.key)::int as rule_keys_visible
         from "AutomationRun" ar left join "AutomationRule" r on r.id = ar."ruleId"
        where ar."tenantId" = $1`,
      [A],
      {
        foreignSql: `select count(*)::int as n from "AutomationRun" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('AutomationRun'),
      },
      { unproven: fx('AutomationRun(A)') && fx('AutomationRun(B)') ? undefined : 'an AutomationRun fixture was skipped' },
    );

    // ══ FILE — (admin)/tenants/[id]/page.tsx ═══════════════════════════════
    await triple(
      'app/(admin)/tenants/[id]/page.tsx',
      ':56 — Subscription.trialEndsAt for an ARBITRARY tenant',
      `select count(*)::int as n from "Subscription" where "tenantId" = $1`,
      [A],
      {
        foreignSql: `select count(*)::int as n from "Subscription" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('Subscription'),
      },
      { unproven: fx('Subscription(A)') && fx('Subscription(B)') ? undefined : 'a Subscription fixture was skipped' },
    );

    // ══ FILE — actions/support-tickets.ts ══════════════════════════════════
    await triple(
      'actions/support-tickets.ts',
      'getAllTickets :271/:286/:290 — SupportTicket scan + User and Tenant joins',
      `select (select count(*) from "SupportTicket")::int as tickets,
              (select count(*) from "User")::int as users,
              (select count(*) from "Tenant")::int as tenants`,
      [],
      {
        foreignSql: `select count(*)::int as n from "SupportTicket" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('SupportTicket'),
      },
      { unproven: fx('SupportTicket(A)') ? undefined : 'SupportTicket fixture was skipped' },
    );
    // The GRANT class. The ORIGINAL statement, direct against `auth.users`,
    // must stay refused on BOTH connections in BOTH lanes — that is the
    // measurement that says the remedy did not widen anything.
    await run('actions/support-tickets.ts', ':292 (ORIGINAL TEXT) — direct read of auth.users', 'ADMIN',
      'must be 42501 BEFORE **and** AFTER — no auth privilege is ever granted to app_admin',
      'SELECT id, email, raw_user_meta_data FROM auth.users',
      `select count(*)::int as n from (select id, email, raw_user_meta_data from auth.users limit 100) s`);
    await run('actions/support-tickets.ts', ':292 (ORIGINAL TEXT) — direct read of auth.users', 'TENANT_EMPTY',
      'must be 42501, NOT TC001 — a privilege problem, which the tripwire can never signal',
      'the same three columns on the tenant connection',
      `select count(*)::int as n from (select id, email, raw_user_meta_data from auth.users limit 100) s`);
    // The SHIPPED statement, through the definer function.
    /**
     * The id array is resolved on the PRIVILEGED connection and passed as a
     * PARAMETER. An earlier version of this probe wrote
     * `auth_user_display((select array_agg(id) from auth.users)…)`, which put a
     * direct `auth.users` read inside the argument — evaluated as `app_admin`,
     * which has no `auth` privilege by design — and reported `42501` for the
     * PROBE's own mistake while looking exactly like the function being broken.
     * The whole point of the definer function is that the caller never names
     * `auth.users`, so neither may the probe.
     */
    const realAuthIds = (await priv.query<{ ids: string[] }>(
      `select coalesce(array_agg(id), '{}') as ids from (select id from auth.users limit 100) x`)).rows[0].ids;
    await run('actions/support-tickets.ts', ':292 (SHIPPED) — public.auth_user_display(uuid[])', 'ADMIN',
      mode === 'before' ? 'must be 42883 — the function does not exist yet' : `must SUCCEED, rows > 0 — EXECUTE is live (${realAuthIds.length} real auth.users ids, resolved privileged and passed as a parameter)`,
      'SELECT id, email, raw_user_meta_data FROM public.auth_user_display($1::uuid[])',
      `select count(*)::int as n, count(email)::int as emails, count(raw_user_meta_data)::int as metas
         from public.auth_user_display($1::uuid[])`, [realAuthIds]);
    await run('actions/support-tickets.ts', ':292 (SHIPPED) — public.auth_user_display(uuid[])', 'TENANT_EMPTY',
      'must be REFUSED — EXECUTE was revoked from PUBLIC and granted to app_admin alone',
      'the tenant role calling the definer function',
      `select count(*)::int as n from public.auth_user_display('{}'::uuid[])`);
    await run('actions/support-tickets.ts', 'auth.users — THE COUNTER-ASSERTION', 'ADMIN',
      'must be 42501 BEFORE **and** AFTER — the remedy exposes three columns and no more',
      'encrypted_password is REFUSED on the very connection that reads the display columns',
      `select count(*)::int as n from (select encrypted_password from auth.users limit 1) s`);
    await run('actions/support-tickets.ts', 'schema auth — THE SECOND COUNTER-ASSERTION', 'ADMIN',
      'must be FALSE BEFORE **and** AFTER — app_admin never gains USAGE on schema auth',
      "has_schema_privilege('app_admin','auth','USAGE')",
      `select has_schema_privilege('app_admin','auth','USAGE')::text as auth_usage`);

    // ══ FILE — api/cron/auto-close-tickets/route.ts ════════════════════════
    await triple(
      'app/api/cron/auto-close-tickets/route.ts',
      ':25 — the real stale-ticket scan (SupportTicket + a TicketMessage NOT EXISTS)',
      `select count(*)::int as n from "SupportTicket" st
        where st.status = 'RESOLVED'
          and st."updatedAt" < now() - interval '7 days'
          and not exists (select 1 from "TicketMessage" tm
                           where tm."ticketId" = st.id and tm."senderType" = 'OWNER'
                             and tm."createdAt" > now() - interval '7 days')`,
      [],
      {
        foreignSql: `select count(*)::int as n from "TicketMessage" tm join "SupportTicket" st on st.id = tm."ticketId" where st."tenantId" = $1`,
        foreignParams: [A],
        own: {
          label: "own (tenant B) ticket messages readable on the SAME connection",
          sql: `select count(*)::int as n from "TicketMessage" tm join "SupportTicket" st on st.id = tm."ticketId" where st."tenantId" = $1`,
          params: [B],
        },
      },
      { unproven: fx('TicketMessage(A)') && fx('TicketMessage(B)') ? undefined : 'a TicketMessage fixture was skipped' },
    );

    // ══ FILE — api/cron/automations/route.ts ═══════════════════════════════
    await triple(
      'app/api/cron/automations/route.ts',
      'the four candidateQuery sweeps — ActivationProgress + Subscription (ADMIN class)',
      `select (select count(*) from "ActivationProgress")::int as activation_rows,
              (select count(*) from "Subscription")::int as subscription_rows`,
      [],
      undefined,
      { adminExpectation: mode === 'before' ? 'must be 42501 — ActivationProgress is UNGRANTED' : 'must SUCCEED — the grant is live' },
    );
    await triple(
      'app/api/cron/automations/route.ts',
      ':170 — the platform-scope AutomationRule lookup (ADMIN class)',
      `select count(*)::int as n from "AutomationRule" where key = $1`,
      [systemRule.key],
    );
    await run('app/api/cron/automations/route.ts', ':187/:198 — the per-candidate dedup reads (TENANT class)', 'TENANT_REAL',
      'must SUCCEED on the NEW receiver — a tenant client serves it',
      `getTenantPrismaForOrg(tenantId) with the loop variable's own GUC`,
      `select count(*)::int as n from "AutomationRun" where "ruleId" = $1 and "tenantId" = $2`,
      [systemRule.id, A], { guc: A });
    await run('app/api/cron/automations/route.ts', ':187/:198 — the per-candidate dedup reads (TENANT class)', 'TENANT_EMPTY',
      'must be TC001 — the OLD receiver, which is what a cron process carries',
      'the bare client, no GUC',
      `select count(*)::int as n from "AutomationRun" where "ruleId" = $1 and "tenantId" = $2`,
      [systemRule.id, A]);

    // ══ FILE — lib/automations/evaluator.ts ════════════════════════════════
    await triple(
      'lib/automations/evaluator.ts',
      ':64/:73/:131 — AppEvent scan, rule lookup, due-run queue (ADMIN class)',
      `select (select count(*) from "AppEvent")::int as events,
              (select count(*) from "AutomationRule")::int as rules,
              (select count(*) from "AutomationRun")::int as runs`,
      [],
      {
        foreignSql: `select count(*)::int as n from "AppEvent" where "tenantId" = $1`,
        foreignParams: [A],
        own: ownPair('AppEvent'),
      },
      { unproven: fx('AppEvent(B)') ? undefined : 'the tenant-B AppEvent fixture was skipped' },
    );
    await run('lib/automations/evaluator.ts', ':80 — the per-event dedup read (TENANT class)', 'TENANT_REAL',
      'must SUCCEED on the NEW receiver — a tenant client serves it',
      'getTenantPrismaForOrg(event.tenantId)',
      `select count(*)::int as n from "AutomationRun" where "ruleId" = $1 and "tenantId" = $2`,
      [systemRule.id, A], { guc: A });
    await run('lib/automations/evaluator.ts', ':80 — the per-event dedup read (TENANT class)', 'TENANT_EMPTY',
      'must be TC001 — the OLD receiver',
      'the bare client, no GUC',
      `select count(*)::int as n from "AutomationRun" where "ruleId" = $1 and "tenantId" = $2`,
      [systemRule.id, A]);

    // ── report ────────────────────────────────────────────────────────────
    const systemAtExit = (await priv.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)).rows[0].n;
    const tenantsAtExit = (await priv.query(`select count(*)::int n from "Tenant"`)).rows[0].n;

    const fmt = (p: Probe) => {
      if (p.expectation.startsWith('NO PROBE')) return '—';
      if (p.error) return `**ERROR [${p.error.sqlstate}]** ${p.error.message}`;
      if (p.values && Object.keys(p.values).length) {
        return Object.entries(p.values).map(([k, v]) => `${k} = **${v}**`).join(' · ');
      }
      return `**${p.rows}** row(s) affected`;
    };

    const files = [...new Set(probes.map((p) => p.file))];
    const lines: string[] = [];
    lines.push(`# quick-615 — every routed FILE, both directions (${mode.toUpperCase()})`);
    lines.push('');
    lines.push(`project \`${STAGING_REF}\` (staging) · ADMIN lane \`${adminWho}\` · TENANT lane \`${appWho}\` · **tripwire \`${tripwire}\`** · counter-reads as \`${privWho.cu}\``);
    lines.push('');
    lines.push('Every probe cell runs in its OWN `BEGIN … ROLLBACK`, so a `TC001` cannot abort the matrix into a run of `25P02`s. SQLSTATE is read off the cause chain and `TC001` is recognised by CODE, never by message prose.');
    lines.push('');
    lines.push(`tenant A = \`${A}\` (${tenants[0].name}) · tenant B = \`${B}\` (${tenants[1].name})`);
    lines.push(`\`Tenant\` rows: **${tenants.length}** at entry, **${tenantsAtExit}** at close · SYSTEM \`AutomationRule\` rows: **${systemAtEntry}** at entry, **${systemAtExit}** at close`);
    lines.push(`\`bypass_rls_policy\` tables: **${bypassNow.length}**`);
    lines.push('');
    lines.push('## the app_admin grant delta, measured against the LIVE catalog');
    lines.push('');
    lines.push('| table | needed by a routed statement | held by `app_admin` | missing |');
    lines.push('|---|---|---|---|');
    for (const d of delta) {
      lines.push(`| \`${d.table}\` | ${d.needed.join(', ')} | ${d.held.join(', ') || '*(none)*'} | ${d.missing.join(', ') || '—'} |`);
    }
    lines.push('');
    lines.push(`\`has_schema_privilege('app_admin','auth','USAGE')\` = **${authNow.app_admin_auth_usage}** · \`app_user\` = **${authNow.app_user_auth_usage}**`);
    lines.push(`auth column grants to app_user/app_admin: **${authNow.columnGrants.length}**${authNow.columnGrants.length ? ' — ' + authNow.columnGrants.map((g: { grantee: string; table_name: string; column_name: string }) => `\`${g.grantee}:auth.${g.table_name}.${g.column_name}\``).join(', ') : ''}`);
    lines.push('');
    lines.push('## fixtures');
    lines.push('');
    lines.push('| fixture | status | detail |');
    lines.push('|---|---|---|');
    for (const f of fixtures) lines.push(`| \`${f.name}\` | ${f.status === 'created' ? 'CREATED' : '**SKIPPED**'} | ${f.detail} |`);
    lines.push('');
    lines.push('## the matrix, per FILE');
    lines.push('');
    for (const f of files) {
      lines.push(`### \`${f}\``);
      lines.push('');
      lines.push('| site | lane | expectation | probe | result | counter-read | paired own-read |');
      lines.push('|---|---|---|---|---|---|---|');
      for (const p of probes.filter((x) => x.file === f)) {
        const cr = p.counterRead ? `${p.counterRead.label} = **${p.counterRead.value}**` : '—';
        const own = p.pairedOwn
          ? p.pairedOwn.error
            ? `${p.pairedOwn.label} → ERROR [${p.pairedOwn.error}]`
            : `${p.pairedOwn.label} = **${p.pairedOwn.value}**`
          : '—';
        const note = p.unproven ? ` <br>**UNPROVEN:** ${p.unproven}` : '';
        lines.push(`| ${p.site} | ${LANE_LABEL[p.lane]} | ${p.expectation} | ${p.label}${note} | ${fmt(p)} | ${cr} | ${own} |`);
      }
      lines.push('');
    }
    const md = lines.join('\n') + '\n';

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const stem = mode === 'before' ? '02-before' : '05-after';
    writeFileSync(resolve(EVIDENCE_DIR, `${stem}.md`), md);
    writeFileSync(
      resolve(EVIDENCE_DIR, `${stem}.json`),
      JSON.stringify(
        {
          at: new Date().toISOString(), project: STAGING_REF, mode,
          roles: { admin: adminWho, tenant: appWho, privileged: privWho.cu },
          tripwire, grantDelta: delta, auth: authNow,
          bypassCount: bypassNow.length, bypassTables: bypassNow,
          tenants, tenantA: A, tenantB: B, systemRule, systemAtEntry, systemAtExit,
          fixtures, files, probes,
        },
        null, 2,
      ),
    );
    console.log(md);
  } finally {
    const teardown: { what: string; deleted: number | null; left: number }[] = [];
    const del = async (what: string, delSql: string, leftSql: string) => {
      let deleted: number | null = null;
      try { deleted = (await priv.query(delSql)).rowCount; } catch { /* reported by `left` */ }
      const left = (await priv.query(leftSql)).rows[0].n;
      teardown.push({ what, deleted, left });
    };
    await del('TicketMessage', `delete from "TicketMessage" where "senderLabel" = '${TAG}'`, `select count(*)::int n from "TicketMessage" where "senderLabel" = '${TAG}'`);
    await del('SupportTicket', `delete from "SupportTicket" where "ticketNumber" like '${TAG}-%'`, `select count(*)::int n from "SupportTicket" where "ticketNumber" like '${TAG}-%'`);
    await del('AutomationRun', `delete from "AutomationRun" where "triggeredBy" = '${TAG}:fixture'`, `select count(*)::int n from "AutomationRun" where "triggeredBy" = '${TAG}:fixture'`);
    await del('DriverInvitation', `delete from "DriverInvitation" where email like '${TAG}+%'`, `select count(*)::int n from "DriverInvitation" where email like '${TAG}+%'`);
    await del('NotificationSendLog', `delete from "NotificationSendLog" where "triggerKey" = '${TAG}.fixture'`, `select count(*)::int n from "NotificationSendLog" where "triggerKey" = '${TAG}.fixture'`);
    await del('Route', `delete from "Route" where origin = '${TAG}-origin'`, `select count(*)::int n from "Route" where origin = '${TAG}-origin'`);
    await del('AppEvent', `delete from "AppEvent" where "eventType" = '${TAG}.fixture'`, `select count(*)::int n from "AppEvent" where "eventType" = '${TAG}.fixture'`);
    await del('Subscription', `delete from "Subscription" where id = any($$${'{' + [ids.subA, ids.subB].filter(Boolean).join(',') + '}'}$$::uuid[])`, `select count(*)::int n from "Subscription" where id = any($$${'{' + [ids.subA, ids.subB].filter(Boolean).join(',') + '}'}$$::uuid[])`);
    await del('ActivationProgress(B)', `delete from "ActivationProgress" where "tenantId" = '${B}'`, `select count(*)::int n from "ActivationProgress" where "tenantId" = '${B}'`);

    let bad = false;
    for (const t of teardown) {
      console.error(`[615] teardown : ${t.what} deleted=${t.deleted} left=${t.left}`);
      if (t.left !== 0) bad = true;
    }
    if (bad) { console.error('[615] *** TEARDOWN DID NOT LAND — fixture rows remain on staging. ***'); process.exitCode = 1; }

    const sysFinal = (await priv.query(`select count(*)::int n from "AutomationRule" where scope='SYSTEM'`)).rows[0].n;
    const tenFinal = (await priv.query(`select count(*)::int n from "Tenant"`)).rows[0].n;
    console.error(`[615] invariants at exit: SYSTEM rules=${sysFinal} (expect 6) · Tenant rows=${tenFinal} (expect 2)`);
    if (sysFinal !== 6 || tenFinal !== 2) {
      console.error('[615] *** AN INVARIANT MOVED — this task must never destroy a platform rule or a tenant. ***');
      process.exitCode = 1;
    }
    await appC.end();
    await adminC.end();
    await priv.end();
  }
}

main().catch((e) => {
  console.error('615-routing-verify FAILED:', e);
  process.exit(1);
});
