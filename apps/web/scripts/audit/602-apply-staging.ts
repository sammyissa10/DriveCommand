/**
 * quick-602 — apply 20260914180000_tenant_context_tripwire to STAGING ONLY, then
 * hand-write and READ BACK the `_prisma_migrations` resolved-not-run row (DEC-17).
 *
 * Never imports `scripts/_bootstrap-env`. Refuses on the production ref.
 * One-shot operational script, committed so the apply + hand-written ledger row is
 * reproducible rather than a transcript.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { createHash, randomUUID } from 'crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';
const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(REPO_ROOT, '.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence');
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

const NAME = '20260914180000_tenant_context_tripwire';
const SQL_PATH = resolve(APP_ROOT, 'prisma/migrations', NAME, 'migration.sql');

const url = process.env.STAGING_DIRECT_URL;
if (!url || url.includes(PRODUCTION_REF) || !url.includes(STAGING_REF)) {
  console.error('REFUSING: STAGING_DIRECT_URL is missing or does not name staging');
  process.exit(1);
}

// The working tree is CRLF (core.autocrlf=true, no .gitattributes). The repo's
// resolved-row convention is a real SHA-256 over LF bytes.
const raw = readFileSync(SQL_PATH, 'utf8');
const lf = raw.replace(/\r\n/g, '\n');
const checksum = createHash('sha256').update(lf, 'utf8').digest('hex');

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  const lines: string[] = [];
  const say = (s: string) => {
    lines.push(s);
    console.log(s);
  };

  say(`migration: ${NAME}`);
  say(`sha256 (LF bytes): ${checksum}`);

  // --- ACL and bodies BEFORE ------------------------------------------------
  const aclBefore = await c.query(
    `SELECT coalesce(array_to_string(proacl::text[], ' '), '(default)') AS acl
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname='public'
      WHERE proname = 'current_tenant_id'`,
  );
  say(`current_tenant_id() proacl BEFORE: ${aclBefore.rows[0]?.acl}`);

  const policiesBefore = await c.query(
    `SELECT c.relname, pg_get_expr(p.polqual, p.polrelid) AS using
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname IN ('Tag','TagAssignment') AND p.polname='tenant_isolation_policy'
      ORDER BY 1`,
  );
  for (const r of policiesBefore.rows) say(`policy BEFORE  ${r.relname}.tenant_isolation_policy USING ${r.using}`);

  // --- apply ----------------------------------------------------------------
  await c.query('BEGIN');
  await c.query(lf);
  await c.query('COMMIT');
  say('migration applied to staging (single transaction, committed)');

  // --- ACL and bodies AFTER -------------------------------------------------
  const aclAfter = await c.query(
    `SELECT coalesce(array_to_string(proacl::text[], ' '), '(default)') AS acl
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname='public'
      WHERE proname = 'current_tenant_id'`,
  );
  say(`current_tenant_id() proacl AFTER:  ${aclAfter.rows[0]?.acl}`);

  const policiesAfter = await c.query(
    `SELECT c.relname, pg_get_expr(p.polqual, p.polrelid) AS using, p.polcmd::text AS cmd,
            p.polpermissive AS permissive, pg_get_expr(p.polwithcheck, p.polrelid) AS wc
       FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
      WHERE c.relname IN ('Tag','TagAssignment') AND p.polname='tenant_isolation_policy'
      ORDER BY 1`,
  );
  for (const r of policiesAfter.rows)
    say(`policy AFTER   ${r.relname}.tenant_isolation_policy cmd=${r.cmd} permissive=${r.permissive} USING ${r.using} WITH CHECK ${r.wc ?? '(derived)'}`);

  const privs = await c.query(
    `SELECT rolname,
            has_function_privilege(rolname, 'public.tenant_context_required(text)', 'EXECUTE') AS can_exec
       FROM pg_roles WHERE rolname IN ('app_user','anon','authenticated','service_role','postgres')
      ORDER BY rolname`,
  );
  for (const r of privs.rows) say(`EXECUTE on tenant_context_required(text): ${r.rolname} = ${r.can_exec}`);

  const fnDef = await c.query(
    `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p
       JOIN pg_namespace n ON n.oid=p.pronamespace AND n.nspname='public'
      WHERE p.proname='current_tenant_id'`,
  );
  say('current_tenant_id() AFTER:\n' + (fnDef.rows[0].def as string));

  // --- DEC-17: the ledger row, hand-written, then READ BACK behind a sentinel -
  const sentinelName = '20260914170000_activation_progress_congrats_shown_at';
  const sentinel = await c.query(`SELECT migration_name, checksum, applied_steps_count FROM _prisma_migrations WHERE migration_name = $1`, [sentinelName]);
  say(`SENTINEL visible before writing: ${sentinel.rowCount === 1 ? 'YES — ' + sentinel.rows[0].migration_name : 'NO — an empty read here means NOTHING about absence'}`);
  if (sentinel.rowCount !== 1) {
    console.error('ABORT: the sentinel row is not visible, so an empty read-back cannot be trusted.');
    process.exit(1);
  }

  const already = await c.query(`SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1`, [NAME]);
  if (already.rowCount === 0) {
    await c.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       SELECT $1::uuid, $2::varchar, now(), $3::varchar, '', NULL, now(), 0
        WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = $3::varchar)`,
      [randomUUID(), checksum, NAME],
    );
    say('ledger row INSERTed by hand (apply_migration/DDL does NOT write this — DEC-17)');
  } else {
    // The row exists. If the FILE has changed since it was written (a correction to
    // the header, as happened when the ALTER ROLE lever turned out to be refused),
    // the stored checksum is stale — refresh it in place rather than leaving a row
    // that claims to describe SQL it no longer matches. `scripts/migrate.mjs` skips
    // by migration_name and never validates a checksum, so this is a bookkeeping
    // correction and not a re-apply.
    const upd = await c.query(
      `UPDATE _prisma_migrations SET checksum = $1::varchar
        WHERE migration_name = $2::varchar AND checksum <> $1::varchar`,
      [checksum, NAME],
    );
    say(`ledger row already present — checksum ${upd.rowCount ? 'REFRESHED (file changed)' : 'unchanged'}`);
  }

  const back = await c.query(
    `SELECT migration_name, checksum, applied_steps_count, logs, (started_at = finished_at) AS same_ts
       FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 3`,
  );
  say('READ BACK — newest 3 ledger rows:');
  for (const r of back.rows)
    say(`  ${r.migration_name} | steps=${r.applied_steps_count} | logs=${JSON.stringify(r.logs)} | started=finished:${r.same_ts} | checksum=${r.checksum}`);
  const head = back.rows[0];
  say(`HEAD IS OURS: ${head.migration_name === NAME} (expected ${NAME})`);
  say(`checksum is a real SHA-256, not 'manual': ${head.checksum === checksum}`);

  const total = await c.query(
    `SELECT count(*)::int AS n FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
       JOIN pg_namespace n ON n.oid=c.relnamespace AND n.nspname='public'`,
  );
  say(`policies in public AFTER: ${total.rows[0].n}`);

  await c.end();
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '04-ledger-readback.txt'), lines.join('\n') + '\n', 'utf8');
  console.log('\nWrote evidence/04-ledger-readback.txt');
})().catch((e) => {
  console.error('APPLY FAILED', e);
  process.exit(1);
});
