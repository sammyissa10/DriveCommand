import pg from 'pg';
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';

const url = process.env.DATABASE_URL;

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
} catch (e) {
  console.error('Migration error:', e.message);
  console.log('Starting app anyway...');
} finally {
  await client.end();
}
