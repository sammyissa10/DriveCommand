/**
 * quick-606 — apply a migration to STAGING ONLY, then hand-write and READ BACK
 * the `_prisma_migrations` resolved-not-run row (DEC-17).
 *
 *   npx tsx scripts/audit/606-apply-staging-migration.ts <migration_dir_name>
 *
 * Modelled on `scripts/audit/602-apply-staging.ts`, generalised over the
 * migration name because this task ships two. Never imports
 * `scripts/_bootstrap-env`; refuses on the production ref before connecting.
 *
 * ─── DEC-17, AND WHY THE READ-BACK IS BEHIND A SENTINEL ────────────────────
 *
 * Neither Supabase MCP tool writes the `_prisma_migrations` row — `apply_migration`
 * records into SUPABASE's own ledger, a DIFFERENT table. quick-581 disproved the
 * claim that it "does both" directly. So the row is written by hand, every time,
 * and then READ BACK.
 *
 * `_prisma_migrations` has RLS ENABLED, ZERO POLICIES, NOT FORCED, and no
 * `app_user` grant, so from a non-owner role a read returns **zero rows with no
 * error** — indistinguishable from "the row was never written", and the natural
 * response to that is a duplicate write. A known-good sentinel row is therefore
 * confirmed visible BEFORE an empty result is treated as absence.
 *
 * Convention, matching the 19 other count-0 rows in this table: a real SHA-256 of
 * `migration.sql` over LF bytes, `logs=''`, `started_at = finished_at`,
 * `applied_steps_count = 0`. The 0 is the signature that distinguishes a mirrored
 * row from one `migrate.mjs` actually executed, which writes 1 with the literal
 * checksum 'manual'.
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
  '.planning/quick/606-fix-the-eleven-measured-app-user-failure/evidence',
);
loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

/** A row that certainly exists on staging. An empty read-back means nothing until this is seen. */
const SENTINEL = '20260914170000_activation_progress_congrats_shown_at';

const NAME = process.argv[2];
if (!NAME) {
  console.error('usage: npx tsx scripts/audit/606-apply-staging-migration.ts <migration_dir_name>');
  process.exit(1);
}
const SQL_PATH = resolve(APP_ROOT, 'prisma/migrations', NAME, 'migration.sql');
if (!existsSync(SQL_PATH)) {
  console.error(`REFUSING: ${SQL_PATH} does not exist`);
  process.exit(1);
}

const url = process.env.STAGING_DIRECT_URL;
if (!url || url.includes(PRODUCTION_REF) || !url.includes(STAGING_REF)) {
  console.error('REFUSING: STAGING_DIRECT_URL is missing or does not name staging');
  process.exit(1);
}

const lf = readFileSync(SQL_PATH, 'utf8').replace(/\r\n/g, '\n');
const checksum = createHash('sha256').update(lf, 'utf8').digest('hex');

(async () => {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
  await c.connect();
  const lines: string[] = [];
  const say = (s: string) => {
    lines.push(s);
    console.log(s);
  };

  const who = (await c.query<{ cu: string; db: string }>('SELECT current_user AS cu, current_database() AS db')).rows[0];
  if (who.cu === 'app_user') {
    console.error('REFUSING: connected as app_user — it cannot read _prisma_migrations at all (42501)');
    process.exit(1);
  }
  say(`migration : ${NAME}`);
  say(`connection: ${who.cu}@${who.db} (staging ${STAGING_REF})`);
  say(`sha256 (LF bytes): ${checksum}`);

  // --- apply ---------------------------------------------------------------
  await c.query('BEGIN');
  await c.query(lf);
  await c.query('COMMIT');
  say('APPLIED to staging (single transaction, committed)');

  // --- DEC-17: sentinel first, then the row --------------------------------
  const sentinel = await c.query(
    'SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1',
    [SENTINEL],
  );
  say(
    `SENTINEL ${SENTINEL} visible: ${sentinel.rowCount === 1 ? 'YES' : 'NO — an empty read here means NOTHING about absence'}`,
  );
  if (sentinel.rowCount !== 1) {
    console.error('ABORT: sentinel not visible, so an empty read-back cannot be trusted.');
    process.exit(1);
  }

  const already = await c.query('SELECT migration_name FROM _prisma_migrations WHERE migration_name = $1', [NAME]);
  if (already.rowCount === 0) {
    await c.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       SELECT $1::uuid, $2::varchar, now(), $3::varchar, '', NULL, now(), 0
        WHERE NOT EXISTS (SELECT 1 FROM _prisma_migrations WHERE migration_name = $3::varchar)`,
      [randomUUID(), checksum, NAME],
    );
    say('ledger row INSERTed BY HAND — no MCP tool and no DDL writes this (DEC-17)');
  } else {
    const upd = await c.query(
      `UPDATE _prisma_migrations SET checksum = $1::varchar
        WHERE migration_name = $2::varchar AND checksum <> $1::varchar`,
      [checksum, NAME],
    );
    say(`ledger row already present — checksum ${upd.rowCount ? 'REFRESHED (file changed)' : 'unchanged'}`);
  }

  // --- read back -----------------------------------------------------------
  const back = await c.query(
    `SELECT migration_name, checksum, applied_steps_count, logs, (started_at = finished_at) AS same_ts
       FROM _prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 3`,
  );
  say('READ BACK — newest 3 ledger rows:');
  for (const r of back.rows) {
    say(
      `  ${r.migration_name} | steps=${r.applied_steps_count} | logs=${JSON.stringify(r.logs)} | started=finished:${r.same_ts} | checksum=${r.checksum}`,
    );
  }
  const head = back.rows[0];
  say(`HEAD IS OURS: ${head.migration_name === NAME} (expected ${NAME})`);
  say(`checksum is a real SHA-256, not 'manual': ${head.checksum === checksum}`);
  say(`applied_steps_count is 0 (mirrored, not executed by migrate.mjs): ${head.applied_steps_count === 0}`);
  const total = (await c.query('SELECT count(*)::int AS n FROM _prisma_migrations')).rows[0].n;
  say(`staging _prisma_migrations rows AFTER: ${total}`);

  await c.end();
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, `06-ledger-${NAME}.txt`), lines.join('\n') + '\n', 'utf8');
  console.log(`\nWrote evidence/06-ledger-${NAME}.txt`);

  if (head.migration_name !== NAME || head.checksum !== checksum || head.applied_steps_count !== 0) {
    console.error('READ-BACK DISAGREES WITH WHAT WAS WRITTEN.');
    process.exit(1);
  }
})().catch((e) => {
  console.error('APPLY FAILED', e);
  process.exit(1);
});
