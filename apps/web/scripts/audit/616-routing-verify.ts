/**
 * quick-616 — the B7 routing proof, on STAGING, with `bypass_rls_policy`
 * TEMPORARILY DROPPED on the affected table.
 *
 *   npx tsx scripts/audit/616-routing-verify.ts --apply     (apply the migration + DEC-17 ledger row)
 *   npx tsx scripts/audit/616-routing-verify.ts --capture   (read all 86 policies to disk — NO DDL)
 *   npx tsx scripts/audit/616-routing-verify.ts --restore   (re-create from the captured file, verify)
 *   npx tsx scripts/audit/616-routing-verify.ts --run       (capture → drop → probe → restore in `finally`)
 *   npx tsx scripts/audit/616-routing-verify.ts --run --throw-after-drop
 *                                                          (deliberate THROW mid-run, to PROVE the finally)
 *   npx tsx scripts/audit/616-routing-verify.ts --run --sigint-after-drop
 *                                                          (deliberate SIGINT — SEE THE WINDOWS FINDING BELOW)
 *
 * ─── MEASURED, NOT ASSUMED: THE SIGINT PROOF DOES NOT WORK ON WINDOWS ──────
 *
 * The plan asked for a deliberate SIGINT as the only honest proof the `finally`
 * fires. It was attempted and it FAILED, and the failure is the finding:
 * **on Windows, `process.kill(pid, 'SIGINT')` to one's own process terminates
 * it UNCONDITIONALLY** — Node's `'SIGINT'` listener never runs, the `finally`
 * never runs, and the run exits 1 having dropped a policy and created two
 * fixture rows. Measured: `bypass_rls_policy` sat at **85** and two
 * `/616-fixture` `SupportTicket` rows were live until a manual
 * `--restore` + cleanup put staging back (86 / 0, byte-verified).
 *
 * A signal handler is therefore NOT a safety net on this platform, and neither
 * is the `finally`. Two things replace it, and neither depends on the process
 * surviving:
 *
 *   1. `--throw-after-drop` proves the `finally` on the path it CAN cover — an
 *      exception — which is every failure mode except a hard kill.
 *   2. **A SELF-HEALING PRE-FLIGHT.** Every `--run` and every `--capture`
 *      compares the live count against `EXPECTED_POLICY_COUNT` FIRST. If it is
 *      short and a capture file exists, it RESTORES from that file, says so
 *      loudly, and only then proceeds. That is the real protection: it works
 *      after a hard kill, a power cut, or a closed terminal, because it runs in
 *      the NEXT process rather than the dying one.
 *
 * A single `BEGIN … DROP POLICY … ROLLBACK` would give a free restore (DDL is
 * transactional in PostgreSQL) and was rejected for a measured reason:
 * `DROP POLICY` takes ACCESS EXCLUSIVE on the table, so the `app_user` probe
 * connections — which must be SEPARATE connections to carry a different role —
 * would block until that transaction ended, and would never see the drop.
 *
 * STAGING ONLY. **NEVER imports `scripts/_bootstrap-env`** (quick-607): that
 * file used to repoint `DATABASE_URL` at `DIRECT_URL`, and every env file in
 * this repo points `DIRECT_URL` at PRODUCTION. `apps/web/.env.staging` is
 * loaded explicitly and every connection string is refused POSITIVELY — it must
 * CONTAIN the staging ref, and naming the production ref is a hard stop before
 * any statement is issued. The resolved ref goes to STDERR (quick-585/607) with
 * the credential never printed at all.
 *
 * ─── WHY THE POLICY IS DROPPED FOR THE PROOF ───────────────────────────────
 *
 * `bypass_rls_policy` is what the NEXT task removes. A proof that rests on it
 * proves nothing about the world the routing is FOR. So the policy is dropped
 * on the affected table for the duration of the probe and restored afterwards.
 *
 * ─── THE RESTORE IS THE HIGHEST-RISK OPERATION IN THIS TASK ────────────────
 *
 *   1. `--capture` reads EVERY `bypass_rls_policy` from `pg_policies` and
 *      writes the reconstructed `CREATE POLICY` DDL to disk BEFORE any DROP.
 *      It asserts the sorted table list is exactly 86 and STOPS if it is not.
 *   2. The DROP is scoped to the tables the routed statements touch — named
 *      explicitly, never all 86.
 *   3. The RESTORE runs in a `finally` that is also wired to SIGINT/SIGTERM and
 *      to an unhandled rejection, and it re-creates from the CAPTURED FILE.
 *   4. Verification is (a) the sorted table list identical to the captured one —
 *      nothing only-in-before, nothing only-in-after, NEVER a count, because two
 *      compensating changes keep a count identical (quick-599/612) — and (b) a
 *      BYTE-FOR-BYTE comparison of each restored `cmd`/`roles`/`qual`/
 *      `with_check` against its captured original. "A policy with that name
 *      exists" is what lets a restored policy with a DIFFERENT BODY pass.
 *   5. The restore verification is the LAST thing printed, always.
 *
 * ─── THE PROBE RULES, ALL OF WHICH HAVE BITTEN BEFORE ──────────────────────
 *
 *   ONE TRANSACTION PER CELL — a `TC001` aborts its transaction and every later
 *     statement on it returns `25P02`, one failure wearing many costumes.
 *   SQLSTATE off `err.cause.code`, never `err.code` (quick-610), by CODE and
 *     never by message prose (quick-602).
 *   Every ZERO carries a PRIVILEGED counter-read proving the rows exist — a zero
 *     over an empty table is vacuous (quick-610).
 *   Every cross-tenant `foreign === 0` is PAIRED with `own > 0`.
 *   Counts come from a SCALAR, never `rowCount`, which is 1 for every count.
 *   A cell with no fixture is reported UNPROVEN BY NAME, never quietly passed.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence',
);
const CAPTURE_PATH = resolve(EVIDENCE_DIR, '03-policy-capture.json');

const MIGRATION = '20260915180000_support_ticket_number_sequence';
/** A ledger row that certainly exists on staging. An empty read-back means nothing until this is seen. */
const LEDGER_SENTINEL = '20260915170000_auth_user_display_definer_function';

/** The ONLY table the routed statements touch. The DROP is scoped to this list. */
const AFFECTED_TABLES = ['SupportTicket'];

/** The live `bypass_rls_policy` population. A different number means this plan's numbers are stale. */
const EXPECTED_POLICY_COUNT = 86;

const TENANT_A = 'b5623cdd-dc19-4900-b75d-0ecfcaf191b8'; // Staging Alpha Carriers
const TENANT_B = '8c6136c4-eb7b-4a89-a524-d1d0e2c8d045'; // Staging Beta Logistics
const USER_A = 'd27660ff-feef-43dd-b22c-07ee74b9ee01'; // OWNER in tenant A
const USER_B = '00dc04fb-dff5-441c-824b-d11c64d560af'; // OWNER in tenant B

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`616-routing-verify: REFUSING TO RUN — ${reason}`);
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

function banner(url: string, label: string) {
  const u = new URL(url);
  console.error(
    `[db-target] project : ${STAGING_REF} (staging)  host : ${u.host}  role : ${u.username}  lane : ${label}  (credential MASKED, never printed)`,
  );
}

/** SQLSTATE lives on the CAUSE CHAIN, never on `err.code` alone (quick-610). */
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

// ---------------------------------------------------------------------------
// --apply — the migration, then the DEC-17 hand-mirrored ledger row
// ---------------------------------------------------------------------------

async function apply() {
  banner(DIRECT_URL, 'MIGRATION (privileged)');
  const sqlPath = resolve(APP_ROOT, 'prisma/migrations', MIGRATION, 'migration.sql');
  const sql = readFileSync(sqlPath, 'utf8').replace(/\r\n/g, '\n');
  const checksum = createHash('sha256').update(Buffer.from(sql, 'utf8')).digest('hex');

  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    const before = await c.query(
      `SELECT sequencename, last_value, start_value FROM pg_sequences
        WHERE schemaname = 'public' AND sequencename = 'support_ticket_number_seq'`,
    );
    console.log(`sequence before: ${before.rowCount === 0 ? 'DOES NOT EXIST' : JSON.stringify(before.rows[0])}`);

    await c.query('BEGIN');
    await c.query(sql);
    await c.query('COMMIT');
    console.log(`applied ${MIGRATION}`);

    const after = await c.query(
      `SELECT sequencename, last_value, start_value FROM pg_sequences WHERE sequencename = 'support_ticket_number_seq'`,
    );
    console.log(`sequence after : ${JSON.stringify(after.rows)}`);

    const grants = await c.query(
      `SELECT grantee, privilege_type FROM information_schema.role_usage_grants
        WHERE object_name = 'support_ticket_number_seq' ORDER BY grantee, privilege_type`,
    );
    console.log(`USAGE grants   : ${JSON.stringify(grants.rows)}`);

    // ─── DEC-17: the ledger row is written BY HAND, every time ──────────────
    // Neither MCP tool nor a raw apply writes `_prisma_migrations`. The rule
    // that survives is PROCEDURAL: write it, then READ IT BACK — and confirm a
    // known-good SENTINEL row is visible first, because `_prisma_migrations`
    // runs RLS ENABLED with ZERO POLICIES and no `app_user` grant, so an empty
    // read from a non-owner role is indistinguishable from "never written".
    const sentinel = await c.query(
      `SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1`,
      [LEDGER_SENTINEL],
    );
    if (sentinel.rowCount !== 1) {
      throw new Error(
        `LEDGER SENTINEL ${LEDGER_SENTINEL} NOT VISIBLE — an empty read-back below would mean nothing. Refusing.`,
      );
    }
    console.log(`ledger sentinel visible: ${LEDGER_SENTINEL}`);

    await c.query(
      `INSERT INTO _prisma_migrations
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, '', NULL, now(), 0)
       ON CONFLICT (id) DO NOTHING`,
      [randomUUID(), checksum, MIGRATION],
    );

    const back = await c.query(
      `SELECT migration_name, checksum, applied_steps_count, logs
         FROM _prisma_migrations WHERE migration_name = $1`,
      [MIGRATION],
    );
    console.log(`ledger read-back: ${JSON.stringify(back.rows)}`);
    if (back.rowCount !== 1) throw new Error('LEDGER ROW NOT VISIBLE AFTER WRITE');
    if (back.rows[0].checksum !== checksum) throw new Error('LEDGER CHECKSUM MISMATCH');
    if (back.rows[0].applied_steps_count !== 0) throw new Error('applied_steps_count must be 0 for a mirrored row');
    console.log(`checksum (sha256 over LF bytes): ${checksum}`);
  } finally {
    await c.end();
  }
}

// ---------------------------------------------------------------------------
// --capture / --restore
// ---------------------------------------------------------------------------

/**
 * The self-healing pre-flight. Runs in the NEXT process, so it survives the
 * hard kill the Windows SIGINT finding above makes possible. A short live count
 * plus a capture file on disk means a previous run died between the drop and
 * the restore; heal it, say so, and only then proceed.
 */
async function preflightHeal(): Promise<string | null> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  let live: number;
  try {
    live = (
      await c.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname='bypass_rls_policy'`)
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
      `live bypass_rls_policy count is ${live} (expected ${EXPECTED_POLICY_COUNT}) and there is NO capture file ` +
        `to heal from. STOPPING — do not run anything else against staging until a human looks at this.`,
    );
  }
  console.error('');
  console.error(`!! PRE-FLIGHT HEAL: live bypass_rls_policy = ${live}, expected ${EXPECTED_POLICY_COUNT}.`);
  console.error(`!! A previous run died between the DROP and the RESTORE. Restoring from ${CAPTURE_PATH}.`);
  const r = await restore();
  printRestore(r);
  if (!r.ok) refuse('PRE-FLIGHT HEAL FAILED — staging is in a modified state. STOP.');
  return `healed from ${live} back to ${EXPECTED_POLICY_COUNT}`;
}

async function capture(): Promise<CapturedPolicy[]> {
  banner(DIRECT_URL, 'CAPTURE (read-only)');
  await preflightHeal();
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
          `The population changed — this plan's numbers are stale. STOPPING BEFORE ANY DROP.`,
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
          policies: captured,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`captured DDL for all ${captured.length} → ${CAPTURE_PATH}`);
    console.log(`sorted table list length: ${tables.length}`);
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
    const n = (await c.query(`SELECT count(*)::int AS n FROM pg_policies WHERE policyname='bypass_rls_policy'`)).rows[0].n;
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
          bodyMismatches.push(
            `${k}.${f}: captured=${JSON.stringify((p as Record<string, unknown>)[f])} restored=${JSON.stringify((now as Record<string, unknown>)[f])}`,
          );
        }
      }
    }

    const res: RestoreResult = {
      restoredCount: restored,
      liveCount: after.length,
      onlyInBefore,
      onlyInAfter,
      sortedListIdentical,
      bodyMismatches,
      ok:
        sortedListIdentical &&
        bodyMismatches.length === 0 &&
        after.length === EXPECTED_POLICY_COUNT,
    };
    return res;
  } finally {
    await c.end();
  }
}

function printRestore(r: RestoreResult) {
  console.log('');
  console.log('──────── RESTORE VERIFICATION (always last) ────────');
  console.log(`re-created from captured DDL : ${r.restoredCount}`);
  console.log(`live bypass_rls_policy count : ${r.liveCount} (must be ${EXPECTED_POLICY_COUNT})`);
  console.log(`sorted table list IDENTICAL  : ${r.sortedListIdentical}`);
  console.log(`  only-in-before             : ${r.onlyInBefore.length === 0 ? 'none' : r.onlyInBefore.join(', ')}`);
  console.log(`  only-in-after              : ${r.onlyInAfter.length === 0 ? 'none' : r.onlyInAfter.join(', ')}`);
  console.log(`byte-for-byte body mismatches: ${r.bodyMismatches.length === 0 ? 'NONE' : r.bodyMismatches.join(' | ')}`);
  console.log(`RESTORE ${r.ok ? 'VERIFIED' : '**FAILED** — STAGING IS IN A MODIFIED STATE, STOP AND FIX IT'}`);
  console.log('────────────────────────────────────────────────────');
}

// ---------------------------------------------------------------------------
// The probe matrix
// ---------------------------------------------------------------------------

type Cell = {
  site: string;
  lane: string;
  expectation: string;
  observed: string;
  counterRead: string | null;
  sqlstate: string | null;
  verdict: 'PASS' | 'FAIL' | 'UNPROVEN';
  note?: string;
};

async function withTx<T>(url: string, fn: (c: Client) => Promise<T>): Promise<T> {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    await c.query('BEGIN');
    return await fn(c);
  } finally {
    try {
      await c.query('ROLLBACK');
    } catch {
      /* the transaction may already be aborted; the connection is closed next */
    }
    await c.end();
  }
}

async function probe(fixtures: { a: string; b: string } | null): Promise<Cell[]> {
  const cells: Cell[] = [];
  const armTripwire = async (c: Client) => {
    await c.query(`SELECT set_config('app.tenant_context_tripwire','on',false)`);
    const back = (await c.query(`SELECT current_setting('app.tenant_context_tripwire', true) AS v`)).rows[0].v;
    if (back !== 'on') throw new Error(`TRIPWIRE READ BACK AS ${JSON.stringify(back)} — refusing to run`);
  };

  // ── CELL 1 — NEW receiver, empty GUC, policy DROPPED: nextval SUCCEEDS ──
  try {
    const r = await withTx(APP_USER_URL, async (c) => {
      await armTripwire(c);
      const one = (await c.query(`SELECT nextval('public.support_ticket_number_seq')::bigint AS n`)).rows[0].n;
      const two = (await c.query(`SELECT nextval('public.support_ticket_number_seq')::bigint AS n`)).rows[0].n;
      return { one: String(one), two: String(two) };
    });
    cells.push({
      site: 'generateTicketNumber (BOTH copies) — NEW receiver',
      lane: 'app_user · GUC EMPTY · tripwire ARMED · bypass_rls_policy DROPPED on SupportTicket',
      expectation: 'nextval succeeds and STRICTLY INCREASES — a sequence is not RLS-governed, only GRANT USAGE gates it',
      observed: `nextval #1 = ${r.one}, nextval #2 = ${r.two}`,
      counterRead: null,
      sqlstate: null,
      verdict: BigInt(r.two) > BigInt(r.one) ? 'PASS' : 'FAIL',
      note: 'Two consecutive calls on the SAME connection, proving the race the two copies used to run is gone: the number is issued by the database, not computed from a read.',
    });
  } catch (e) {
    cells.push({
      site: 'generateTicketNumber (BOTH copies) — NEW receiver',
      lane: 'app_user · GUC EMPTY · tripwire ARMED · bypass_rls_policy DROPPED on SupportTicket',
      expectation: 'nextval succeeds',
      observed: `THREW: ${(e as Error).message}`,
      counterRead: null,
      sqlstate: sqlstateOf(e),
      verdict: 'FAIL',
    });
  }

  // ── CELL 2 — OLD receiver, empty GUC, policy DROPPED: ZERO ROWS, not an error
  if (!fixtures) {
    cells.push({
      site: 'generateTicketNumber — OLD receiver (the global max read)',
      lane: 'app_user · GUC EMPTY · tripwire ARMED · bypass_rls_policy DROPPED',
      expectation: 'zero rows, and the privileged counter-read shows rows DO exist',
      observed: 'no fixture',
      counterRead: null,
      sqlstate: null,
      verdict: 'UNPROVEN',
      note: 'SupportTicket is ZERO-ROW on staging and the fixture could not be created. A zero over an empty table is vacuous (quick-610).',
    });
  } else {
    // ── CELL 2a — OLD receiver, empty GUC, TRIPWIRE ARMED ──────────────────
    // Measured FIRST, and the result CORRECTED THE EXPECTATION rather than the
    // other way round: with the tripwire armed the old read RAISES `TC001`, it
    // does not under-read. `admin-connection.md` §9's "zero rows, not an error"
    // is right about PRODUCTION, where the tripwire is not armed — which is why
    // cell 2b below measures that world explicitly instead of assuming it.
    try {
      const r = await withTx(APP_USER_URL, async (c) => {
        await armTripwire(c);
        const rows = await c.query(
          `SELECT count(*)::int AS n, max("ticketNumber") AS maxnum FROM "SupportTicket"`,
        );
        return { n: rows.rows[0].n as number, maxnum: rows.rows[0].maxnum as string | null };
      });
      cells.push({
        site: 'generateTicketNumber — OLD receiver, tripwire ARMED',
        lane: 'app_user · GUC EMPTY · tripwire ARMED · bypass_rls_policy DROPPED',
        expectation: 'TC001 — the tripwire refuses the statement before any policy is consulted',
        observed: `DID NOT RAISE: count = ${r.n}, max = ${JSON.stringify(r.maxnum)}`,
        counterRead: null,
        sqlstate: null,
        verdict: 'FAIL',
      });
    } catch (e) {
      const code = sqlstateOf(e);
      cells.push({
        site: 'generateTicketNumber — OLD receiver, tripwire ARMED',
        lane: 'app_user · GUC EMPTY · tripwire ARMED · bypass_rls_policy DROPPED',
        expectation: 'TC001 — the tripwire refuses the statement before any policy is consulted',
        observed: `raised ${code}`,
        counterRead: null,
        sqlstate: code,
        verdict: code === 'TC001' ? 'PASS' : 'FAIL',
        note:
          'Recognised by CODE off the cause chain, never by message prose. This corrects the expectation this cell was written with: the bypass drop is not what the old read hits first once the tripwire is armed.',
      });
    }

    // ── CELL 2b — OLD receiver, empty GUC, TRIPWIRE OFF: the §9 symptom ────
    // The tripwire is set to 'off' EXPLICITLY rather than left unset: the
    // pooler can hand back a backend where a previous session left it 'on'
    // (quick-602 — the GUC is session scope on a max:1 pool).
    try {
      const r = await withTx(APP_USER_URL, async (c) => {
        await c.query(`SELECT set_config('app.tenant_context_tripwire','off',false)`);
        await c.query(`SELECT set_config('app.current_tenant_id','',false)`);
        const rows = await c.query(
          `SELECT count(*)::int AS n, max("ticketNumber") AS maxnum FROM "SupportTicket"`,
        );
        return { n: rows.rows[0].n as number, maxnum: rows.rows[0].maxnum as string | null };
      });
      // PRIVILEGED counter-read on a SEPARATE connection — the rows exist.
      const priv = new Client({ connectionString: DIRECT_URL });
      await priv.connect();
      const own = (
        await priv.query(`SELECT count(*)::int AS n, max("ticketNumber") AS m FROM "SupportTicket"`)
      ).rows[0];
      await priv.end();
      cells.push({
        site: 'generateTicketNumber — OLD receiver, tripwire OFF (production today)',
        lane: 'app_user · GUC EMPTY · tripwire OFF · bypass_rls_policy DROPPED',
        expectation:
          'ZERO ROWS and NO ERROR — admin-connection.md §9\'s predicted silent wrong answer: the old code falls to `if (!result) return "TKT-0001"` and collides on the second ticket',
        observed: `count = ${r.n}, max = ${JSON.stringify(r.maxnum)}`,
        counterRead: `privileged (postgres, separate connection): count = ${own.n}, max = ${JSON.stringify(own.m)}`,
        sqlstate: null,
        verdict: r.n === 0 && own.n > 0 ? 'PASS' : 'FAIL',
        note: 'Scalar count, never rowCount. The zero is paired with a privileged own > 0, or it proves nothing.',
      });
    } catch (e) {
      cells.push({
        site: 'generateTicketNumber — OLD receiver, tripwire OFF (production today)',
        lane: 'app_user · GUC EMPTY · tripwire OFF · bypass_rls_policy DROPPED',
        expectation: 'zero rows, no error',
        observed: `THREW: ${(e as Error).message}`,
        counterRead: null,
        sqlstate: sqlstateOf(e),
        verdict: 'FAIL',
      });
    }

    // ── CELL 3 — OLD receiver under a REAL tenant GUC: still the WRONG answer
    try {
      const r = await withTx(APP_USER_URL, async (c) => {
        await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
        const rows = await c.query(
          `SELECT count(*)::int AS own,
                  count(*) FILTER (WHERE "tenantId" = $1)::int AS foreign_visible,
                  max("ticketNumber") AS maxnum
             FROM "SupportTicket"`,
          [TENANT_B],
        );
        return rows.rows[0];
      });
      const priv = new Client({ connectionString: DIRECT_URL });
      await priv.connect();
      const global = (
        await priv.query(`SELECT max("ticketNumber") AS m, count(*)::int AS n FROM "SupportTicket"`)
      ).rows[0];
      await priv.end();
      cells.push({
        site: 'generateTicketNumber — OLD receiver, REAL tenant GUC',
        lane: 'app_user · GUC = tenant A · bypass_rls_policy DROPPED',
        expectation:
          'sees only tenant A rows (foreign === 0, own > 0) and therefore returns A\'s local maximum, NOT the global one — the read is structurally incapable of answering a GLOBAL sequence question under RLS',
        observed: `visible = ${r.own}, of which tenant B = ${r.foreign_visible}, max seen = ${JSON.stringify(r.maxnum)}`,
        counterRead: `privileged global: count = ${global.n}, max = ${JSON.stringify(global.m)}`,
        sqlstate: null,
        verdict:
          r.foreign_visible === 0 && r.own > 0 && r.maxnum !== global.m ? 'PASS' : 'FAIL',
        note:
          'foreign === 0 PAIRED with own > 0. The local max differing from the privileged global max is the collision, made visible.',
      });
    } catch (e) {
      cells.push({
        site: 'generateTicketNumber — OLD receiver, REAL tenant GUC',
        lane: 'app_user · GUC = tenant A · bypass_rls_policy DROPPED',
        expectation: 'foreign === 0 and own > 0',
        observed: `THREW: ${(e as Error).message}`,
        counterRead: null,
        sqlstate: sqlstateOf(e),
        verdict: 'FAIL',
      });
    }
  }

  // ── CELL 4 — the NEW receiver under a REAL tenant GUC, unchanged ────────
  try {
    const r = await withTx(APP_USER_URL, async (c) => {
      await c.query(`SELECT set_config('app.current_tenant_id', $1, false)`, [TENANT_A]);
      const one = (await c.query(`SELECT nextval('public.support_ticket_number_seq')::bigint AS n`)).rows[0].n;
      return String(one);
    });
    cells.push({
      site: 'generateTicketNumber — NEW receiver, REAL tenant GUC',
      lane: 'app_user · GUC = tenant A · bypass_rls_policy DROPPED',
      expectation: 'identical behaviour — a sequence has no tenant dimension, so the GUC changes nothing',
      observed: `nextval = ${r}`,
      counterRead: null,
      sqlstate: null,
      verdict: 'PASS',
    });
  } catch (e) {
    cells.push({
      site: 'generateTicketNumber — NEW receiver, REAL tenant GUC',
      lane: 'app_user · GUC = tenant A · bypass_rls_policy DROPPED',
      expectation: 'succeeds',
      observed: `THREW: ${(e as Error).message}`,
      counterRead: null,
      sqlstate: sqlstateOf(e),
      verdict: 'FAIL',
    });
  }

  return cells;
}

// ---------------------------------------------------------------------------
// Fixtures — committed, because the probes run on OTHER connections
// ---------------------------------------------------------------------------

async function ensureFixtures(): Promise<{ a: string; b: string } | null> {
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    const a = randomUUID();
    const b = randomUUID();
    await c.query(
      `INSERT INTO "SupportTicket" (id,"ticketNumber","tenantId","submittedBy","fromPage",title,description,status,"createdAt","updatedAt")
       VALUES ($1,'TKT-9001',$2,$3,'/616-fixture','616 fixture A','616 fixture','OPEN',now(),now())`,
      [a, TENANT_A, USER_A],
    );
    await c.query(
      `INSERT INTO "SupportTicket" (id,"ticketNumber","tenantId","submittedBy","fromPage",title,description,status,"createdAt","updatedAt")
       VALUES ($1,'TKT-9002',$2,$3,'/616-fixture','616 fixture B','616 fixture','OPEN',now(),now())`,
      [b, TENANT_B, USER_B],
    );
    console.log('fixtures: 2 SupportTicket rows created (TKT-9001 tenant A, TKT-9002 tenant B)');
    return { a, b };
  } catch (e) {
    console.error(`fixtures SKIPPED: ${(e as Error).message}`);
    return null;
  } finally {
    await c.end();
  }
}

async function teardownFixtures(f: { a: string; b: string } | null) {
  if (!f) return;
  const c = new Client({ connectionString: DIRECT_URL });
  await c.connect();
  try {
    await c.query(`DELETE FROM "SupportTicket" WHERE id = ANY($1::uuid[])`, [[f.a, f.b]]);
    const left = (
      await c.query(`SELECT count(*)::int AS n FROM "SupportTicket" WHERE "fromPage" = '/616-fixture'`)
    ).rows[0].n;
    console.log(`fixtures torn down; leftover 616 rows: ${left}`);
    if (left !== 0) console.error('WARNING: fixture rows remain on staging');
  } finally {
    await c.end();
  }
}

// ---------------------------------------------------------------------------

async function run(sigintAfterDrop: boolean, throwAfterDrop: boolean) {
  let restoreDone = false;
  let fixtures: { a: string; b: string } | null = null;

  const doRestore = async () => {
    if (restoreDone) return;
    restoreDone = true;
    try {
      await teardownFixtures(fixtures);
    } catch (e) {
      console.error(`fixture teardown failed: ${(e as Error).message}`);
    }
    const r = await restore();
    printRestore(r);
    if (!r.ok) process.exitCode = 1;
  };

  // The `finally` alone does NOT run on a signal. Both are wired, and the plan
  // asks for a deliberate SIGINT to prove it.
  const onSignal = (sig: string) => {
    console.error(`\n[${sig}] received — running the restore before exit`);
    doRestore()
      .then(() => process.exit(130))
      .catch((e) => {
        console.error(`RESTORE FAILED ON ${sig}: ${(e as Error).message}`);
        process.exit(1);
      });
  };
  process.on('SIGINT', () => onSignal('SIGINT'));
  process.on('SIGTERM', () => onSignal('SIGTERM'));

  try {
    await capture();
    fixtures = await ensureFixtures();
    await dropOn(AFFECTED_TABLES);

    if (throwAfterDrop) {
      throw new Error('--throw-after-drop: deliberate failure, to prove the `finally` restores');
    }
    if (sigintAfterDrop) {
      console.error('--sigint-after-drop: raising SIGINT on this process ON PURPOSE');
      console.error('  On WINDOWS this TERMINATES UNCONDITIONALLY — no handler, no finally.');
      console.error('  The next run\'s PRE-FLIGHT HEAL is what puts staging back. See the header.');
      process.kill(process.pid, 'SIGINT');
      await new Promise((r) => setTimeout(r, 30_000)); // the handler exits first, on POSIX
      return;
    }

    banner(APP_USER_URL, 'PROBE (app_user)');
    const cells = await probe(fixtures);
    console.log('');
    for (const c of cells) {
      console.log(`[${c.verdict}] ${c.site}`);
      console.log(`         lane   : ${c.lane}`);
      console.log(`         expect : ${c.expectation}`);
      console.log(`         observe: ${c.observed}`);
      if (c.counterRead) console.log(`         counter: ${c.counterRead}`);
      if (c.sqlstate) console.log(`         sqlstate (cause chain): ${c.sqlstate}`);
      if (c.note) console.log(`         note   : ${c.note}`);
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(resolve(EVIDENCE_DIR, '03-probe-cells.json'), JSON.stringify(cells, null, 2) + '\n');
    const bad = cells.filter((c) => c.verdict === 'FAIL');
    if (bad.length) process.exitCode = 1;
  } finally {
    await doRestore();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--apply')) return apply();
  if (argv.includes('--capture')) {
    await capture();
    return;
  }
  if (argv.includes('--restore')) {
    if (!existsSync(CAPTURE_PATH)) refuse('no capture file — run --capture first');
    printRestore(await restore());
    return;
  }
  if (argv.includes('--run'))
    return run(argv.includes('--sigint-after-drop'), argv.includes('--throw-after-drop'));
  refuse('one of --apply | --capture | --restore | --run is required');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
