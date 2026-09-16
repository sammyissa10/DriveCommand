import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

// ---------------------------------------------------------------------------
// THE SPLIT-TARGET HAZARD (quick-595)
//
// This script has TWO database consumers that resolve DIFFERENT environment
// variables:
//
//   1. The applier below uses `DIRECT_URL || DATABASE_URL`.
//   2. The starter-playbook seeder it spawns at the end
//      (`scripts/seed-starter-playbooks.ts`) resolves a BARE
//      `process.env.DATABASE_URL`, with no dotenv load of its own.
//
// So pinning only DIRECT_URL applies DDL to one project and WRITES STARTER
// PLAYBOOKS INTO ANOTHER. During the Phase 0 staging work that "another" is
// production. Both variables must name the same Supabase project, and
// `assertSameProjectRef()` below refuses to spawn the seeder when they do not.
//
// Fail-safe in BOTH directions: never seed the wrong database, and never
// break a deploy over a connection-string shape the guard cannot parse.
// Shape borrowed from `scripts/seed-staging.ts`.
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';

/** Mask the password segment of a connection string for printing. */
function maskUrl(u) {
  if (!u) return '(unset)';
  return u.replace(/:\/\/([^:/@]*):[^@]*@/, '://$1:****@');
}

/**
 * Derive the Supabase project ref from a connection string.
 *
 * Supavisor pooler strings carry it in the username as `postgres.<ref>`;
 * direct-connection strings carry it in the host as `db.<ref>.supabase.co`.
 * Returns undefined when neither shape matches — the caller treats that as
 * "cannot verify", not as "match".
 */
function projectRefFrom(u) {
  if (!u) return undefined;
  let parsed;
  try {
    parsed = new URL(u);
  } catch {
    return undefined;
  }
  const username = decodeURIComponent(parsed.username || '');
  const dot = username.indexOf('.');
  if (dot !== -1 && dot + 1 < username.length) {
    return username.slice(dot + 1);
  }
  const host = parsed.hostname || '';
  const hostMatch = host.match(/^db\.([^.]+)\.supabase\.co$/);
  if (hostMatch) return hostMatch[1];
  return undefined;
}

/**
 * @returns {boolean} true when it is safe to spawn the seeder.
 */
function seederTargetIsSafe() {
  const directUrl = process.env.DIRECT_URL;
  const databaseUrl = process.env.DATABASE_URL;

  // No DIRECT_URL means both halves already resolve DATABASE_URL. No split
  // target is possible.
  if (!directUrl) return true;

  const directRef = projectRefFrom(directUrl);
  const databaseRef = projectRefFrom(databaseUrl);

  if (!directRef || !databaseRef) {
    console.warn('');
    console.warn('  !! Could not derive a Supabase project ref from one or both connection strings.');
    console.warn(`     DIRECT_URL  : ${maskUrl(directUrl)}  -> ref ${directRef ?? '(underivable)'}`);
    console.warn(`     DATABASE_URL: ${maskUrl(databaseUrl)}  -> ref ${databaseRef ?? '(underivable)'}`);
    console.warn('     The applier uses DIRECT_URL; the spawned starter-playbook seeder resolves');
    console.warn('     DATABASE_URL. Because they cannot be compared, the seeder is SKIPPED rather');
    console.warn('     than run against a database this script cannot identify.');
    console.warn('     Migrations themselves already applied successfully. Exiting 0.');
    console.warn('');
    return false;
  }

  if (directRef !== databaseRef) {
    console.error('');
    console.error('  !! REFUSING TO SEED — DIRECT_URL and DATABASE_URL name DIFFERENT Supabase projects.');
    console.error(`     DIRECT_URL  : ${maskUrl(directUrl)}  -> ref ${directRef}`);
    console.error(`     DATABASE_URL: ${maskUrl(databaseUrl)}  -> ref ${databaseRef}`);
    console.error('     The applier uses DIRECT_URL; the spawned starter-playbook seeder resolves');
    console.error('     DATABASE_URL. Running on would apply DDL to one project and write starter');
    console.error(`     playbooks into the other.${databaseRef === PRODUCTION_REF ? ' DATABASE_URL is PRODUCTION.' : ''}`);
    console.error('     Set BOTH variables inline to the same connection string and re-run.');
    console.error('');
    process.exit(1);
  }

  return true;
}

// Prefer direct connection for migrations (bypasses pooler limitations)
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

if (!url) {
  console.log('No DATABASE_URL set, skipping migrations');
  process.exit(0);
}

console.log('Running database migrations...');

const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  // Create migrations tracking table if it doesn't exist
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL PRIMARY KEY,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0
    );
  `);

  // Get already-applied migrations
  const applied = await client.query('SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL');
  const appliedNames = new Set(applied.rows.map(r => r.migration_name));

  // Read migration directories in order
  const migrationsDir = join(process.cwd(), 'prisma', 'migrations');
  const dirs = readdirSync(migrationsDir)
    .filter(d => existsSync(join(migrationsDir, d, 'migration.sql')))
    .sort();

  // Clean up any previously failed migrations so they can be retried
  await client.query('DELETE FROM "_prisma_migrations" WHERE "finished_at" IS NULL');

  let ranCount = 0;

  for (const dir of dirs) {
    if (appliedNames.has(dir)) {
      continue;
    }

    console.log(`Applying migration: ${dir}`);
    const sql = readFileSync(join(migrationsDir, dir, 'migration.sql'), 'utf8');

    const id = crypto.randomUUID();
    const startedAt = new Date();

    try {
      // Wrap in transaction so migration is atomic (all or nothing)
      await client.query('BEGIN');
      await client.query(sql);
      await client.query(
        `INSERT INTO "_prisma_migrations" ("id", "checksum", "migration_name", "finished_at", "started_at", "applied_steps_count")
         VALUES ($1, $2, $3, $4, $5, 1)`,
        [id, 'manual', dir, new Date(), startedAt]
      );
      await client.query('COMMIT');
      ranCount++;
      console.log(`  Applied: ${dir}`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error(`  Failed: ${dir}:`, e.message);
      throw e;
    }
  }

  console.log(ranCount > 0 ? `Migrations complete (${ranCount} applied)` : 'Database up to date');

  // Seed starter playbooks for all existing active tenants (idempotent).
  //
  // GUARD FIRST (quick-595). The seeder resolves a BARE DATABASE_URL while the
  // applier above used DIRECT_URL — see the header. Three outcomes: true
  // (refs match, seed), false (a ref is underivable — skip the seeder, finish
  // normally with exit 0), or the function exits 1 (refs differ — refuse).
  if (seederTargetIsSafe()) {
    try {
      const { spawnSync } = await import('child_process');
      const scriptPath = join(process.cwd(), 'scripts', 'seed-starter-playbooks.ts');
      const result = spawnSync('npx', ['tsx', scriptPath], {
        stdio: 'inherit',
        shell: true,
        env: process.env,
      });
      // quick-623: the seeder now exits 1 when ANY tenant fails (it used to exit 0
      // regardless). This deliberately does NOT fail the migration: the DDL above
      // is already committed, so exiting non-zero here would block a deploy whose
      // schema has already moved (build) or refuse to start the app for every
      // tenant over one tenant's playbooks (`npm start`). It is reported as an
      // ERROR naming the consequence, not a "continuing" warning.
      if (result.status !== 0) {
        console.error(
          `ERROR: starter playbook seeding FAILED (exit ${result.status}). One or more tenants have ` +
            'NO starter playbooks — see the ✗ lines above. Migrations are applied; re-run ' +
            '`npx tsx scripts/seed-starter-playbooks.ts` once the cause is fixed.',
        );
      }
    } catch (e) {
      console.warn('Starter playbook seeding skipped:', e.message);
    }
  }
} catch (e) {
  const isConnectError = e.code === 'ENETUNREACH' || e.code === 'ECONNREFUSED' || e.code === 'ETIMEDOUT' || e.message?.includes('connect');
  if (isConnectError) {
    console.warn('Migration skipped: could not reach database at build time. Assuming migrations are already applied.');
    process.exit(0);
  }
  console.error('Migration error:', e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
