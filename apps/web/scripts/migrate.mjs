import { setDefaultResultOrder } from 'dns';
setDefaultResultOrder('ipv4first');

import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

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

  // Seed starter playbooks for all existing active tenants (idempotent)
  try {
    const { spawnSync } = await import('child_process');
    const scriptPath = join(process.cwd(), 'scripts', 'seed-starter-playbooks.ts');
    const result = spawnSync('npx', ['tsx', scriptPath], {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });
    if (result.status !== 0) {
      console.warn('Starter playbook seeding returned non-zero exit code — continuing.');
    }
  } catch (e) {
    console.warn('Starter playbook seeding skipped:', e.message);
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
