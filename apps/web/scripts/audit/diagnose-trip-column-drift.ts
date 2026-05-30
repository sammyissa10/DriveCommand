/**
 * Trip Column Drift Diagnostic Script
 *
 * READ-ONLY — performs no DDL or DML against the database and does not edit
 * schema.prisma, migration files, or any application source.
 *
 * Purpose:
 *   Compare the fields declared on the `Trip` model in schema.prisma against
 *   the columns that actually exist in the production database, then cross-
 *   reference every missing column against the migrations history to identify
 *   whether a migration was authored but not applied, or whether no migration
 *   was ever created (schema drift without source control).
 *
 *   Output is a five-section console report:
 *     1. Schema fields parsed from schema.prisma
 *     2. Live DB columns from information_schema.columns
 *     3. Diff (MISSING_IN_DB + EXTRA_IN_DB)
 *     4. Migration scan — which migration files reference each missing column
 *     5. Remediation recommendation
 *
 * Run from apps/web:
 *   npx tsx --env-file=.env.local scripts/audit/diagnose-trip-column-drift.ts
 *
 * Exit code 0 on success (even if drift is found — this is a diagnostic, not a CI gate).
 * Exit code 1 only on script errors (failed query, file read failure, etc.).
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Setup — same pg Pool + PrismaPg adapter pattern as db-tenant-audit.ts
// ---------------------------------------------------------------------------

if (!process.env.DATABASE_URL) {
  console.error(
    '[ERROR] DATABASE_URL is not set. Run with: npx tsx --env-file=.env.local scripts/audit/diagnose-trip-column-drift.ts',
  );
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SchemaField {
  prismaName: string;
  prismaType: string;
  physicalColumn: string;
}

interface DbColumn {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
}

interface MigrationHit {
  migrationDir: string;
  lineNumber: number;
  lineContent: string;
}

// ---------------------------------------------------------------------------
// SECTION 1 — Parse the Trip model from schema.prisma
// ---------------------------------------------------------------------------

function parseSchemaFile(schemaPath: string): {
  tableName: string;
  fields: SchemaField[];
} {
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const lines = raw.split('\n');

  // Find the start of `model Trip {`
  const startIdx = lines.findIndex((l) => /^model Trip \s*\{/.test(l));
  if (startIdx === -1) {
    throw new Error(`model Trip { not found in ${schemaPath}`);
  }

  // Scan forward to the closing `}` at the start of a line (end of model block)
  let endIdx = -1;
  let braceDepth = 0;
  for (let i = startIdx; i < lines.length; i++) {
    const stripped = lines[i].trim();
    if (stripped === '{' || lines[i].includes('{')) braceDepth++;
    if (stripped === '}' || lines[i].includes('}')) {
      braceDepth--;
      if (braceDepth <= 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) {
    throw new Error('Could not find closing brace for model Trip');
  }

  const modelLines = lines.slice(startIdx, endIdx + 1);

  // Detect @@map for physical table name
  let tableName = 'Trip'; // Prisma default if no @@map
  for (const line of modelLines) {
    const mapMatch = line.match(/@@map\("([^"]+)"\)/);
    if (mapMatch) {
      tableName = mapMatch[1];
    }
  }

  // Known Prisma model names (relation targets) — used to skip relation fields.
  // A field is a relation if its type is a model name (PascalCase, no scalar).
  // Scalars: String, Int, Float, Boolean, DateTime, Decimal, Json, Bytes, BigInt.
  const scalarTypes = new Set([
    'String',
    'Int',
    'Float',
    'Boolean',
    'DateTime',
    'Decimal',
    'Json',
    'Bytes',
    'BigInt',
  ]);

  const fields: SchemaField[] = [];

  for (const line of modelLines) {
    const trimmed = line.trim();

    // Skip blank lines, comments, directives, and the model declaration itself
    if (
      trimmed === '' ||
      trimmed.startsWith('//') ||
      trimmed.startsWith('@@') ||
      trimmed.startsWith('model ') ||
      trimmed === '{' ||
      trimmed === '}'
    ) {
      continue;
    }

    // Field line format: `fieldName  Type  @directive ...`
    // Split on whitespace — first token = field name, second = type
    const tokens = trimmed.replace(/\/\/.*$/, '').trim().split(/\s+/);
    if (tokens.length < 2) continue;

    const prismaName = tokens[0];
    // Type may have `?` or `[]` suffix — strip those for the base type
    const prismaTypeFull = tokens[1];
    const prismaTypeBase = prismaTypeFull.replace(/[?[\]]/g, '');

    // Skip relation fields (PascalCase type that is not a scalar)
    if (!scalarTypes.has(prismaTypeBase)) {
      continue;
    }

    // Physical column: check for @map("xxx")
    const mapMatch = line.match(/@map\("([^"]+)"\)/);
    const physicalColumn = mapMatch ? mapMatch[1] : prismaName;

    fields.push({
      prismaName,
      prismaType: prismaTypeFull,
      physicalColumn,
    });
  }

  return { tableName, fields };
}

// ---------------------------------------------------------------------------
// SECTION 2 — Query live DB columns
// ---------------------------------------------------------------------------

async function queryLiveColumns(candidateNames: string[]): Promise<{
  matched: { tableName: string; columns: DbColumn[] }[];
}> {
  const matched: { tableName: string; columns: DbColumn[] }[] = [];

  for (const candidate of candidateNames) {
    const rows: DbColumn[] = await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      candidate,
    );
    if (rows.length > 0) {
      matched.push({ tableName: candidate, columns: rows });
    }
  }

  return { matched };
}

// ---------------------------------------------------------------------------
// SECTION 4 — Scan migration files
// ---------------------------------------------------------------------------

function scanMigrations(
  migrationsDir: string,
  missingColumns: string[],
  tableName: string,
): Map<string, MigrationHit[]> {
  const results = new Map<string, MigrationHit[]>();
  for (const col of missingColumns) {
    results.set(col, []);
  }

  if (!fs.existsSync(migrationsDir)) {
    console.warn(`[WARN] Migrations directory not found: ${migrationsDir}`);
    return results;
  }

  const subDirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // chronological order

  for (const subDir of subDirs) {
    const migrationFile = path.join(migrationsDir, subDir, 'migration.sql');
    if (!fs.existsSync(migrationFile)) continue;

    const content = fs.readFileSync(migrationFile, 'utf8');
    const lines = content.split('\n');

    // Does this migration mention the Trip table (by any known table name variant)?
    const tablePatterns = [
      new RegExp(tableName, 'i'),
      /dispatches/i, // known @@map alias for Trip
      /Trip/i,
    ];

    for (const col of missingColumns) {
      const colPattern = new RegExp(col, 'i');

      for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
        const lineContent = lines[lineIdx];
        // Match if the line mentions the column AND references the table (or
        // if it's an ADD COLUMN / CREATE TABLE that mentions the column at all,
        // as the table context is usually nearby)
        const mentionsCol = colPattern.test(lineContent);
        const mentionsTable = tablePatterns.some((p) => p.test(lineContent));
        const isStructural =
          /ALTER TABLE|CREATE TABLE|ADD COLUMN|CREATE INDEX/i.test(lineContent);

        if (mentionsCol && (mentionsTable || isStructural)) {
          results.get(col)!.push({
            migrationDir: subDir,
            lineNumber: lineIdx + 1,
            lineContent: lineContent.trim(),
          });
        }
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cwd = process.cwd(); // expected to be apps/web
  const schemaPath = path.resolve(cwd, 'prisma/schema.prisma');
  const migrationsDir = path.resolve(cwd, 'prisma/migrations');

  // -------------------------------------------------------------------------
  // SECTION 1 — Schema parse
  // -------------------------------------------------------------------------

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  SECTION 1 — Schema fields (model Trip in schema.prisma)');
  console.log('════════════════════════════════════════════════════════════');

  const { tableName: detectedTableName, fields: schemaFields } = parseSchemaFile(schemaPath);
  const schemaPhysicalColumns = schemaFields.map((f) => f.physicalColumn);

  console.log(`  Detected physical table name (via @@map): "${detectedTableName}"`);
  console.log(`  Total scalar fields in schema: ${schemaFields.length}`);
  console.log('');
  console.log('  Physical column name  │  Prisma field name  │  Prisma type');
  console.log('  ────────────────────────────────────────────────────────────');
  for (const f of schemaFields) {
    console.log(
      `  ${f.physicalColumn.padEnd(22)}│  ${f.prismaName.padEnd(20)}│  ${f.prismaType}`,
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 2 — Live DB columns
  // -------------------------------------------------------------------------

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  SECTION 2 — Live DB columns (information_schema.columns)');
  console.log('════════════════════════════════════════════════════════════');

  // Try all candidate names (@@map value + PascalCase + lowercase)
  const candidates = Array.from(
    new Set([detectedTableName, 'Trip', 'trip', detectedTableName.toLowerCase()]),
  );
  console.log(`  Querying candidates: ${candidates.map((c) => `"${c}"`).join(', ')}`);

  const { matched } = await queryLiveColumns(candidates);

  if (matched.length === 0) {
    console.log('');
    console.log(
      '  [ERROR] No table found for any candidate name. Trip table may not exist in production.',
    );
    console.log('  This is a critical schema drift — the table itself is missing.');
    process.exit(0);
  }

  let liveColumns: DbColumn[] = [];
  let liveTableName = '';

  for (const m of matched) {
    console.log(`  Matched table: "${m.tableName}" — ${m.columns.length} columns`);
    if (liveColumns.length === 0) {
      liveColumns = m.columns;
      liveTableName = m.tableName;
    }
  }

  if (matched.length > 1) {
    console.log(
      '  [WARN] Multiple table name candidates returned rows — this indicates severe naming drift.',
    );
  }

  console.log('');
  console.log(`  Columns in DB table "${liveTableName}":`);
  console.log('  Column name              │  data_type               │  nullable');
  console.log('  ────────────────────────────────────────────────────────────────');
  for (const col of liveColumns) {
    const dt = col.udt_name !== col.data_type ? `${col.data_type} (${col.udt_name})` : col.data_type;
    console.log(
      `  ${col.column_name.padEnd(24)}│  ${dt.padEnd(24)}│  ${col.is_nullable}`,
    );
  }

  // -------------------------------------------------------------------------
  // SECTION 3 — Diff
  // -------------------------------------------------------------------------

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  SECTION 3 — Diff (schema vs live DB)');
  console.log('════════════════════════════════════════════════════════════');

  const liveColumnNames = new Set(liveColumns.map((c) => c.column_name));
  const schemaColumnSet = new Set(schemaPhysicalColumns);

  // Build a lookup: physicalColumn → SchemaField for richer output
  const schemaFieldByColumn = new Map<string, SchemaField>();
  for (const f of schemaFields) {
    schemaFieldByColumn.set(f.physicalColumn, f);
  }

  // Build lookup: column_name → DbColumn for richer output
  const dbColByName = new Map<string, DbColumn>();
  for (const c of liveColumns) {
    dbColByName.set(c.column_name, c);
  }

  const missingInDb: string[] = schemaPhysicalColumns.filter((c) => !liveColumnNames.has(c));
  const extraInDb: string[] = Array.from(liveColumnNames).filter((c) => !schemaColumnSet.has(c));

  if (missingInDb.length === 0 && extraInDb.length === 0) {
    console.log('');
    console.log('  NO DRIFT — schema matches DB exactly.');
  } else {
    if (missingInDb.length > 0) {
      console.log('');
      console.log(`  MISSING_IN_DB (${missingInDb.length} columns — these cause P2022):`);
      for (const col of missingInDb) {
        const f = schemaFieldByColumn.get(col);
        console.log(`    • ${col}  (Prisma field: ${f?.prismaName ?? '?'}, type: ${f?.prismaType ?? '?'})`);
      }
    } else {
      console.log('');
      console.log('  MISSING_IN_DB: none — all schema columns are present in DB.');
    }

    if (extraInDb.length > 0) {
      console.log('');
      console.log(`  EXTRA_IN_DB (${extraInDb.length} columns — in DB but not in schema):`);
      for (const col of extraInDb) {
        const c = dbColByName.get(col);
        console.log(`    • ${col}  (DB type: ${c?.data_type ?? '?'})`);
      }
    } else {
      console.log('');
      console.log('  EXTRA_IN_DB: none — no orphan columns.');
    }
  }

  // -------------------------------------------------------------------------
  // SECTION 4 — Migration scan
  // -------------------------------------------------------------------------

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  SECTION 4 — Migration scan');
  console.log('════════════════════════════════════════════════════════════');

  if (missingInDb.length === 0) {
    console.log('  No missing columns — migration scan skipped.');
  } else {
    console.log(`  Scanning prisma/migrations/ for references to ${missingInDb.length} missing column(s)...`);
    console.log(`  Table name patterns searched: "${detectedTableName}", "dispatches", "Trip"`);
    console.log('');

    const migrationHits = scanMigrations(migrationsDir, missingInDb, detectedTableName);

    const columnsWithMigration: string[] = [];
    const columnsWithoutMigration: string[] = [];

    for (const col of missingInDb) {
      const hits = migrationHits.get(col) ?? [];
      if (hits.length > 0) {
        columnsWithMigration.push(col);
        console.log(`  ${col}: ${hits.length} migration hit(s)`);
        for (const hit of hits) {
          console.log(`    ↳ ${hit.migrationDir} line ${hit.lineNumber}: ${hit.lineContent}`);
        }
      } else {
        columnsWithoutMigration.push(col);
        console.log(`  ${col}: NO MIGRATION FOUND`);
      }
    }

    // -------------------------------------------------------------------------
    // SECTION 5 — Recommendation
    // -------------------------------------------------------------------------

    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  SECTION 5 — Remediation recommendation');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');

    if (missingInDb.length === 0) {
      // Already handled above — this branch won't be reached
      console.log(
        '  No drift detected. The P2022 may originate from a stale @prisma/client build',
      );
      console.log('  in production — run `prisma generate` and redeploy.');
    } else if (columnsWithoutMigration.length > 0) {
      console.log('  RECOMMENDATION: Schema drift WITHOUT source-controlled migration.');
      console.log('');
      console.log(
        '  The following column(s) are declared in schema.prisma but have NO corresponding',
      );
      console.log('  migration.sql entry. This means they were added to the schema without ever');
      console.log('  authoring a migration — so the production database was never updated.');
      console.log('');
      console.log('  Columns needing a new migration:');
      for (const col of columnsWithoutMigration) {
        const f = schemaFieldByColumn.get(col);
        console.log(`    • ${col}  (Prisma: ${f?.prismaName ?? col}, type: ${f?.prismaType ?? '?'})`);
      }
      console.log('');
      console.log('  Safe remediation steps (run from apps/web):');
      const colNames = columnsWithoutMigration.join('_');
      console.log(
        `    1. npx prisma migrate dev --name add_trip_${colNames} --create-only`,
      );
      console.log('       (Review the generated SQL before proceeding)');
      console.log('    2. npx prisma migrate deploy');
      console.log('       (Applies the migration to production DATABASE_URL)');
      console.log('    3. vercel --prod');
      console.log('       (Redeploy so the updated @prisma/client is live)');

      if (columnsWithMigration.length > 0) {
        console.log('');
        console.log(
          '  NOTE: The following column(s) DO have migration references but are still missing from DB:',
        );
        for (const col of columnsWithMigration) {
          const hits = migrationHits.get(col) ?? [];
          const dirs = Array.from(new Set(hits.map((h) => h.migrationDir))).join(', ');
          console.log(`    • ${col}  (found in: ${dirs})`);
        }
        console.log(
          '  These migrations may exist but were not applied. Also run `npx prisma migrate deploy`.',
        );
      }
    } else {
      // All missing columns have migration hits
      const allDirs = Array.from(
        new Set(
          columnsWithMigration.flatMap((col) =>
            (migrationHits.get(col) ?? []).map((h) => h.migrationDir),
          ),
        ),
      ).sort();
      console.log('  RECOMMENDATION: Pending migrations exist but were NOT applied to production.');
      console.log('');
      console.log('  All missing column(s) have corresponding migration files. The migrations');
      console.log('  were authored but never deployed to the production database.');
      console.log('');
      console.log('  Migration file(s) involved:');
      for (const dir of allDirs) {
        console.log(`    • ${dir}`);
      }
      console.log('');
      console.log('  Safe remediation steps (run from apps/web):');
      console.log('    1. npx prisma migrate deploy');
      console.log('       (Applies all pending migrations to production DATABASE_URL)');
      console.log('    2. vercel --prod');
      console.log('       (Redeploy to pick up any generated client changes)');
    }

    if (extraInDb.length > 0) {
      console.log('');
      console.log(
        '  [WARN] DB has columns not in schema — investigate before any destructive remediation.',
      );
      console.log('  Extra columns: ' + extraInDb.join(', '));
    }
  }

  // If no missing columns, still print section 5
  if (missingInDb.length === 0) {
    console.log('');
    console.log('════════════════════════════════════════════════════════════');
    console.log('  SECTION 5 — Remediation recommendation');
    console.log('════════════════════════════════════════════════════════════');
    console.log('');
    console.log(
      '  No drift detected. The P2022 may originate from a stale @prisma/client build',
    );
    console.log('  in production — run `prisma generate` and redeploy.');

    if (extraInDb.length > 0) {
      console.log('');
      console.log(
        '  [WARN] DB has columns not in schema — investigate before any destructive remediation.',
      );
      console.log('  Extra columns: ' + extraInDb.join(', '));
    }
  }

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Diagnostic complete.');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error('[FATAL ERROR]', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
