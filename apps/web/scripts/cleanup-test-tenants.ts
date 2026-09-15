/**
 * Delete disposable TEST tenants and everything under them.
 *
 *   npx tsx scripts/cleanup-test-tenants.ts                       # DRY RUN (default)
 *   npx tsx scripts/cleanup-test-tenants.ts --delete-for-real --expect=3
 *   DATABASE_URL="<staging>" npx tsx scripts/cleanup-test-tenants.ts --delete-for-real --expect=1
 *
 * WHAT THIS USED TO BE — quick-609, from docs/audits/production-test-writes.md.
 *
 * This script deleted tenants on whatever `DATABASE_URL` named, with NO project-ref
 * check of any kind, guarded only by `ALLOWED_PREFIXES = ['FI-Test-','MT-Test-']`
 * and `name.startsWith(prefix)`. That is a check on the NAME OF THE RECORD being
 * deleted, not on WHICH DATABASE it lives in — the same shape quick-608 removed
 * from the test suites, except those created rows and this one destroys them.
 *
 * It was also the script somebody would reach for to clear the nine orphan
 * `ZZ-THROWAWAY-…` tenants sitting in production, and its prefix list does not
 * match `ZZ-` at all. The obvious next action was an unguarded delete script
 * pointed at production with a list that matched nothing it needed to match.
 *
 * FOUR THINGS CHANGED, and nothing else:
 *   1. A project-ref guard. Production is refused unless --allow-production.
 *   2. Dry run is the DEFAULT. Deleting takes --delete-for-real AND --expect=<N>.
 *   3. The name test requires the generators' 13-digit `Date.now()` suffix, so a
 *      real tenant called "FI-Test-Logistics" can no longer match.
 *   4. The delete order is derived from `pg_constraint` at runtime and runs in ONE
 *      transaction.
 *
 * WHY ONE TRANSACTION HERE, WHEN quick-608'S TEARDOWN DELIBERATELY AVOIDS ONE.
 * They look contradictory and are not. That teardown runs at the end of a test
 * whose pool is already exhausted; a transaction could not start, and a partial
 * delete that shrinks the orphan beats rolling back to nothing. This script runs
 * on a quiet connection an operator just opened, and its failure mode is the
 * opposite: a half-deleted tenant — children gone, tenant row surviving, an
 * operator told "processed: 1" — is worse than not starting. Different failure
 * mode, different answer.
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Pool, type PoolClient } from 'pg';

import {
  describeRef,
  maskConnectionString,
  PRODUCTION_REF,
  projectRefOf,
  roleOf,
  hostOf,
} from './_db-target';

// ---------------------------------------------------------------------------
// Flags
// ---------------------------------------------------------------------------

const ARGV = process.argv.slice(2);

/**
 * The destructive flag is a PHRASE, not `--force` or a bare `-f`. It has to be
 * typed deliberately and it reads as what it does in a shell history.
 */
const DELETE_FOR_REAL = ARGV.includes('--delete-for-real');
const ALLOW_PRODUCTION = ARGV.includes('--allow-production');

/**
 * `--expect=<N>` is REQUIRED alongside --delete-for-real, and must equal the
 * number of tenants matched. It is the control that catches a pattern matching
 * more than the operator had in mind: you state the number first, and a
 * disagreement aborts before anything is deleted. A confirmation prompt cannot
 * do this — "yes" is the same keystroke whether the list holds 1 tenant or 40.
 */
const EXPECT = (() => {
  const raw = ARGV.find((a) => a.startsWith('--expect='));
  if (!raw) return null;
  const n = Number(raw.slice('--expect='.length));
  return Number.isInteger(n) && n >= 0 ? n : NaN;
})();

// ---------------------------------------------------------------------------
// Which tenants are disposable
// ---------------------------------------------------------------------------

/**
 * A PATTERN, not a prefix, and the difference is the whole point.
 *
 * The old list was `['FI-Test-', 'MT-Test-']` matched with `startsWith`. A real
 * customer called **"FI-Test-Logistics"** would have been deleted with all of its
 * data. A prefix is a namespace claim that nothing enforces — no constraint stops
 * a human typing that name into the sign-up form.
 *
 * Every disposable tenant in this repo is generated with a `Date.now()` suffix:
 *
 *   `ZZ-THROWAWAY-PHASE8-ROLLBACK-${Date.now()}`   (7 suites, quick-608 census)
 *   `FI-Test-Tenant-${Date.now()}`                 (financial-integrity)
 *   `MT-Test-OrgA-${Date.now()}` / `MT-Test-OrgB-` (multi-tenancy)
 *
 * So the test is: a known generator prefix AND a terminal 13-digit epoch. That
 * suffix is not something a human types into a company name, which makes it a far
 * better discriminator than the prefix it follows.
 *
 * DELIBERATELY NOT MATCHED, and each is a decision rather than an oversight:
 *   - `ZZ-TEST-B3-0914` — quick-601's hand-made provisioning fixture. No stamp, so
 *     it does not match, and it should not: nothing generated it and nothing knows
 *     it is finished with.
 *   - Bare `ZZ-` — would match the above, and would make the pattern a prefix test
 *     again.
 *   - `QA Test Org`, `Nadeem's Testing`, `Postscript Test Co`, `Test` — real rows
 *     in production that read like test data. They are NOT matched and must not be;
 *     deciding they are disposable is a human's call, not a regex's.
 */
const DISPOSABLE_PREFIXES = ['ZZ-THROWAWAY-', 'FI-Test-Tenant-', 'MT-Test-Org'] as const;

/** 13 digits is `Date.now()` from 2001-09-09 until 2286-11-20. */
const EPOCH_STAMP = /-\d{13}$/;

export function isDisposableTenantName(name: string): boolean {
  if (!EPOCH_STAMP.test(name)) return false;
  return DISPOSABLE_PREFIXES.some((p) => name.startsWith(p));
}

// ---------------------------------------------------------------------------
// Connection + guard
// ---------------------------------------------------------------------------

const CONNECTION_STRING = process.env.DATABASE_URL;

function fail(message: string): never {
  console.error(`\ncleanup-test-tenants REFUSING TO RUN — ${message}\n`);
  process.exit(1);
}

if (!CONNECTION_STRING) fail('DATABASE_URL is not set.');

const REF = projectRefOf(CONNECTION_STRING);
const { host, port } = hostOf(CONNECTION_STRING);

// The banner comes BEFORE anything else, including the tenant listing. An
// operator must never have to infer which database a delete script opened.
console.error(
  [
    `[cleanup-test-tenants] project  : ${describeRef(REF)}`,
    `[cleanup-test-tenants] host     : ${host}:${port}`,
    `[cleanup-test-tenants] role     : ${roleOf(CONNECTION_STRING)}`,
    `[cleanup-test-tenants] url      : ${maskConnectionString(CONNECTION_STRING)}`,
    `[cleanup-test-tenants] mode     : ${DELETE_FOR_REAL ? 'DELETE FOR REAL' : 'DRY RUN (default)'}`,
  ].join('\n')
);

if (REF === PRODUCTION_REF && !ALLOW_PRODUCTION) {
  fail(
    `DATABASE_URL names the PRODUCTION project (${PRODUCTION_REF}).\n` +
      `  This script DELETES tenants and every row beneath them, and it cascades into\n` +
      `  Supabase Auth users and object storage.\n\n` +
      `  connection : ${maskConnectionString(CONNECTION_STRING)}\n\n` +
      `  Point DATABASE_URL at a disposable database, or pass --allow-production if you\n` +
      `  genuinely mean production. Read docs/audits/production-test-writes.md first.`
  );
}

if (DELETE_FOR_REAL && EXPECT === null) {
  fail('--delete-for-real requires --expect=<N>, the number of tenants you expect to delete.');
}
if (DELETE_FOR_REAL && Number.isNaN(EXPECT)) {
  fail('--expect=<N> must be a non-negative integer.');
}

const pool = new Pool({ connectionString: CONNECTION_STRING });

const supabaseAdmin =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

// ---------------------------------------------------------------------------
// Delete order, derived from the catalogue at RUNTIME
// ---------------------------------------------------------------------------

/**
 * Ask the database which tables block a `DELETE FROM "Tenant"`, and in what order
 * they must be emptied.
 *
 * DERIVED, NEVER HARDCODED. The old script carried a hand-written list of 15
 * steps. Production has **81** inbound foreign keys on `Tenant` — 17 CASCADE and
 * 64 RESTRICT — and that list emptied **11 of the 64**. Six of the missing ones
 * (`document_imports`, `document_import_pages`, `facility_external_references`,
 * `in_app_notifications`, `NotificationLog`, `StepInstance`) hold rows for the
 * very tenants this script would next be pointed at, so it could not have
 * succeeded. A hardcoded list is a list that goes stale every time the schema
 * grows a table, which is precisely how it came to cover a sixth of what it needed.
 *
 * Only RESTRICT / NO ACTION edges are collected. CASCADE children delete
 * themselves when their parent goes, so they neither need a statement nor
 * constrain the order.
 */
async function deriveDeleteOrder(
  client: PoolClient
): Promise<{ table: string; column: string }[]> {
  const kids = await client.query<{ tbl: string; col: string }>(`
    SELECT DISTINCT con.conrelid::regclass::text AS tbl, att.attname AS col
    FROM pg_constraint con
    JOIN unnest(con.conkey) WITH ORDINALITY AS k(attnum, ord) ON TRUE
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = k.attnum
    WHERE con.contype = 'f'
      AND con.confrelid = '"Tenant"'::regclass
      AND con.confdeltype IN ('r', 'a')
  `);

  const columnOf = new Map(kids.rows.map((r) => [r.tbl, r.col]));

  const edges = await client.query<{ child: string; parent: string }>(`
    SELECT con.conrelid::regclass::text AS child, con.confrelid::regclass::text AS parent
    FROM pg_constraint con
    WHERE con.contype = 'f'
      AND con.confdeltype IN ('r', 'a')
      AND con.conrelid <> con.confrelid
  `);

  // parent -> tables that must be deleted BEFORE it
  const dependents = new Map<string, string[]>();
  for (const t of columnOf.keys()) dependents.set(t, []);
  for (const e of edges.rows) {
    if (columnOf.has(e.child) && columnOf.has(e.parent)) {
      dependents.get(e.parent)!.push(e.child);
    }
  }

  const order: string[] = [];
  const done = new Set<string>();
  const onStack = new Set<string>();

  const visit = (t: string): void => {
    if (done.has(t)) return;
    // A cycle between two blocking FKs cannot be ordered. Emit and let the
    // transaction surface it rather than pretending the order is valid.
    if (onStack.has(t)) return;
    onStack.add(t);
    for (const d of dependents.get(t) ?? []) visit(d);
    onStack.delete(t);
    done.add(t);
    order.push(t);
  };

  [...columnOf.keys()].sort().forEach(visit);

  return order.map((t) => ({ table: t, column: columnOf.get(t)! }));
}

// ---------------------------------------------------------------------------
// Work
// ---------------------------------------------------------------------------

type Tenant = { id: string; name: string };

async function countRows(
  client: PoolClient,
  order: { table: string; column: string }[],
  tenantId: string
): Promise<{ table: string; n: number }[]> {
  const out: { table: string; n: number }[] = [];
  for (const { table, column } of order) {
    const r = await client.query<{ n: string }>(
      `SELECT count(*)::int AS n FROM ${table} WHERE "${column}" = $1`,
      [tenantId]
    );
    const n = Number(r.rows[0].n);
    if (n > 0) out.push({ table, n });
  }
  return out;
}

/** All deletes plus the tenant row, in ONE transaction. Any failure rolls back. */
async function deleteTenant(
  client: PoolClient,
  order: { table: string; column: string }[],
  tenant: Tenant
): Promise<{ table: string; n: number }[]> {
  const deleted: { table: string; n: number }[] = [];
  await client.query('BEGIN');
  try {
    for (const { table, column } of order) {
      const r = await client.query(`DELETE FROM ${table} WHERE "${column}" = $1`, [tenant.id]);
      if (r.rowCount) deleted.push({ table, n: r.rowCount });
    }
    const t = await client.query(`DELETE FROM "Tenant" WHERE id = $1`, [tenant.id]);
    if (t.rowCount !== 1) {
      throw new Error(`expected to delete exactly 1 Tenant row, deleted ${t.rowCount}`);
    }
    await client.query('COMMIT');
    return deleted;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  }
}

async function main(): Promise<number> {
  const client = await pool.connect();
  try {
    const order = await deriveDeleteOrder(client);
    console.log(`\nBlocking child tables derived from pg_constraint: ${order.length}`);

    const all = await client.query<Tenant>(`SELECT id, name FROM "Tenant" ORDER BY name ASC`);
    const matched = all.rows.filter((t) => isDisposableTenantName(t.name));
    const unmatched = all.rows.filter((t) => !isDisposableTenantName(t.name));

    console.log(`Tenants on this database: ${all.rows.length}`);
    console.log(`Matched as disposable   : ${matched.length}`);
    console.log(`Left alone              : ${unmatched.length}\n`);

    if (matched.length === 0) {
      console.log('No disposable tenants matched. Nothing to do.');
      return 0;
    }

    for (const t of matched) {
      const rows = await countRows(client, order, t.id);
      const total = rows.reduce((a, b) => a + b.n, 0);
      console.log(`  "${t.name}" (${t.id})`);
      console.log(`     ${total} child row(s) across ${rows.length} table(s)`);
      for (const r of rows) console.log(`       ${r.table}: ${r.n}`);
    }

    if (!DELETE_FOR_REAL) {
      console.log(
        `\nDRY RUN — nothing was deleted.\n` +
          `To delete these ${matched.length} tenant(s):\n` +
          `  npx tsx scripts/cleanup-test-tenants.ts --delete-for-real --expect=${matched.length}`
      );
      return 0;
    }

    if (EXPECT !== matched.length) {
      console.error(
        `\ncleanup-test-tenants REFUSING TO DELETE — --expect=${EXPECT} but ${matched.length} ` +
          `tenant(s) matched.\n  Re-run the dry run and check the list before changing the number.\n`
      );
      return 1;
    }

    let deleted = 0;
    let failed = 0;
    for (const t of matched) {
      // Collected BEFORE the transaction, because after the commit the rows that
      // name these logins are gone and there is nothing left to look them up from.
      const authUsers = await client.query<{ id: string; email: string }>(
        `SELECT id, email FROM "User" WHERE "tenantId" = $1`,
        [t.id]
      );

      try {
        const rows = await deleteTenant(client, order, t);
        const total = rows.reduce((a, b) => a + b.n, 0);
        console.log(`\nDELETED "${t.name}" (${t.id}) — ${total} child row(s) + the tenant row`);
        deleted++;
      } catch (err) {
        failed++;
        console.error(`\nFAILED "${t.name}" (${t.id}) — ROLLED BACK, nothing deleted for it`);
        console.error(`  ${(err as Error).message}`);
        continue;
      }

      /**
       * Supabase Auth lives outside Postgres and cannot join the transaction, so
       * it is done AFTER the commit — a rolled-back tenant must never lose its
       * logins. The reverse leak (Auth rows outliving a committed delete) is the
       * survivable direction and is REPORTED rather than silently swallowed.
       *
       * Reported honestly: an earlier draft of this rewrite dropped the Auth
       * deletion entirely and printed a line claiming it had happened. That is the
       * exact class of false claim docs/audits/production-test-writes.md was
       * written about, introduced while fixing it.
       */
      if (!supabaseAdmin) {
        console.warn(
          `  Supabase Auth NOT touched — NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY ` +
            `are not set. ${authUsers.rowCount} login(s) for this tenant still exist.`
        );
        continue;
      }

      let authDeleted = 0;
      const authSkipped: string[] = [];
      for (const u of authUsers.rows) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
        // A user invited but never confirmed has no Auth row; that is not a failure.
        if (error) authSkipped.push(`${u.email} (${error.message})`);
        else authDeleted++;
      }
      console.log(`  Supabase Auth: ${authDeleted} removed, ${authSkipped.length} skipped`);
      for (const s of authSkipped) console.log(`    skipped: ${s}`);
    }

    console.log(`\n=== Summary ===\n  deleted: ${deleted}\n  failed:  ${failed}`);
    return failed > 0 ? 1 : 0;
  } finally {
    client.release();
  }
}

main()
  .then((code) => pool.end().then(() => process.exit(code)))
  .catch(async (err) => {
    console.error('\ncleanup-test-tenants: unexpected error');
    console.error(err);
    await pool.end().catch(() => {});
    process.exit(1);
  });
