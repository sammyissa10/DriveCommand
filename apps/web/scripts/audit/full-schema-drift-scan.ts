/**
 * Full Schema Drift Scan
 *
 * READ-ONLY — performs no DDL or DML against the database and does not edit
 * schema.prisma, migration files, or any application source.
 *
 * Purpose:
 *   Compare EVERY Prisma model in schema.prisma against the live production
 *   database columns and emit a consolidated SQL draft for all detected drift.
 *   This is the "full sweep" follow-up to Quick-415/416 (Trip-only drift fix).
 *
 *   Output per drifted model:
 *     MODEL: Trip (table: dispatches)
 *       MISSING IN DB: deleted_at (DateTime? → TIMESTAMPTZ?), deleted_by_id (String? @db.Uuid → UUID?)
 *       EXTRA IN DB: (none)
 *
 *   Also writes a consolidated, NULL-only ADD COLUMN SQL draft to:
 *     apps/web/scripts/audit/417-DRIFT-FIX-DRAFT.sql
 *
 * Run from apps/web:
 *   npx tsx --env-file=.env.local scripts/audit/full-schema-drift-scan.ts
 *
 * Exit code 0 on completion regardless of drift count (diagnostic, not gate).
 * Exit code 1 only on script errors (DB connection failure, schema parse error, file write failure).
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
    '[ERROR] DATABASE_URL is not set. Run with: npx tsx --env-file=.env.local scripts/audit/full-schema-drift-scan.ts',
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
  nativeHint?: string; // e.g. "@db.Uuid", "@db.Text", "@db.Decimal(10,2)", "@db.VarChar(255)"
}

interface ParsedModel {
  modelName: string;
  tableName: string; // @@map value if present, else modelName
  fields: SchemaField[];
}

interface DbColumn {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
}

interface ModelDiff {
  model: ParsedModel;
  tableExists: boolean;
  missingInDb: SchemaField[]; // in schema, not in DB
  extraInDb: string[]; // in DB, not in schema
}

// ---------------------------------------------------------------------------
// SECTION 1 — Parse ALL models from schema.prisma
// ---------------------------------------------------------------------------

const SCALAR_TYPES = new Set([
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

/**
 * Extract the native type hint string from a field line, e.g.:
 *   "id  String  @id @db.Uuid @default(...)"  → "@db.Uuid"
 *   "amount  Decimal  @db.Decimal(10,2)"       → "@db.Decimal(10,2)"
 *   "name  String  @db.VarChar(100)"           → "@db.VarChar(100)"
 */
function extractNativeHint(line: string): string | undefined {
  const match = line.match(/@db\.(\w+(?:\([^)]*\))?)/);
  return match ? match[0] : undefined;
}

/**
 * Map a Prisma scalar type + optional native hint to a Postgres type string.
 * Used only for the SQL draft (ADD COLUMN ... <pgType> NULL).
 */
function prismaTypeToPgType(prismaType: string, nativeHint?: string): string {
  // Strip optional (?) and array ([]) markers to get base type
  const base = prismaType.replace(/[?[\]]/g, '');

  if (nativeHint) {
    const hint = nativeHint.replace('@db.', '');
    if (hint === 'Uuid') return 'UUID';
    if (hint === 'Text') return 'TEXT';
    if (hint.startsWith('VarChar')) return hint.replace('VarChar', 'VARCHAR');
    if (hint.startsWith('Decimal')) return `NUMERIC${hint.slice('Decimal'.length)}`;
    if (hint === 'Timestamptz' || hint.startsWith('Timestamptz')) return 'TIMESTAMPTZ';
    if (hint === 'Jsonb') return 'JSONB';
    if (hint === 'SmallInt') return 'SMALLINT';
    if (hint === 'BigInt') return 'BIGINT';
    if (hint === 'Real') return 'REAL';
    if (hint === 'DoublePrecision') return 'DOUBLE PRECISION';
    if (hint === 'ByteA') return 'BYTEA';
    if (hint === 'Boolean') return 'BOOLEAN';
    if (hint === 'Integer') return 'INTEGER';
  }

  switch (base) {
    case 'String':
      return 'TEXT';
    case 'Int':
      return 'INTEGER';
    case 'BigInt':
      return 'BIGINT';
    case 'Float':
      return 'DOUBLE PRECISION';
    case 'Decimal':
      return 'NUMERIC';
    case 'Boolean':
      return 'BOOLEAN';
    case 'DateTime':
      return 'TIMESTAMPTZ';
    case 'Json':
      return 'JSONB';
    case 'Bytes':
      return 'BYTEA';
    default:
      return 'TEXT';
  }
}

/**
 * Parse every model block from schema.prisma.
 * Returns an array of ParsedModel, one per `model XXX {` block.
 */
function parseAllModels(schemaPath: string): ParsedModel[] {
  const raw = fs.readFileSync(schemaPath, 'utf8');
  const lines = raw.split('\n');
  const models: ParsedModel[] = [];

  let i = 0;
  while (i < lines.length) {
    // Find next `model XXX {` line
    const modelMatch = lines[i].match(/^model\s+(\w+)\s*\{/);
    if (!modelMatch) {
      i++;
      continue;
    }

    const modelName = modelMatch[1];
    const startIdx = i;

    // Scan to closing brace using brace-depth tracking
    let braceDepth = 0;
    let endIdx = -1;
    for (let j = startIdx; j < lines.length; j++) {
      const stripped = lines[j];
      // Count open and close braces
      for (const ch of stripped) {
        if (ch === '{') braceDepth++;
        else if (ch === '}') {
          braceDepth--;
          if (braceDepth <= 0) {
            endIdx = j;
            break;
          }
        }
      }
      if (endIdx !== -1) break;
    }

    if (endIdx === -1) {
      console.warn(`[WARN] Could not find closing brace for model ${modelName} — skipping`);
      i++;
      continue;
    }

    const modelLines = lines.slice(startIdx, endIdx + 1);

    // Detect @@map for physical table name
    let tableName = modelName;
    for (const line of modelLines) {
      const mapMatch = line.match(/@@map\("([^"]+)"\)/);
      if (mapMatch) {
        tableName = mapMatch[1];
        break;
      }
    }

    // Parse scalar fields
    const fields: SchemaField[] = [];

    for (const line of modelLines) {
      const trimmed = line.trim();

      // Skip blank lines, comments, directives, and model declaration
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

      // Strip inline comments
      const noComment = trimmed.replace(/\/\/.*$/, '').trim();
      if (!noComment) continue;

      // Split on whitespace: first token = field name, second = type
      const tokens = noComment.split(/\s+/);
      if (tokens.length < 2) continue;

      const prismaName = tokens[0];
      const prismaTypeFull = tokens[1];
      const prismaTypeBase = prismaTypeFull.replace(/[?[\]]/g, '');

      // Skip relation fields (non-scalar types)
      if (!SCALAR_TYPES.has(prismaTypeBase)) {
        continue;
      }

      // Physical column: @map("xxx") value if present, else prismaName verbatim
      const mapMatch = line.match(/@map\("([^"]+)"\)/);
      const physicalColumn = mapMatch ? mapMatch[1] : prismaName;

      // Native type hint
      const nativeHint = extractNativeHint(line);

      fields.push({
        prismaName,
        prismaType: prismaTypeFull,
        physicalColumn,
        nativeHint,
      });
    }

    models.push({ modelName, tableName, fields });

    // Advance past end of this model block
    i = endIdx + 1;
  }

  return models;
}

// ---------------------------------------------------------------------------
// SECTION 2 — Query live DB columns (one query per unique table name)
// ---------------------------------------------------------------------------

async function queryLiveColumns(tableNames: string[]): Promise<Map<string, DbColumn[]>> {
  const result = new Map<string, DbColumn[]>();

  for (const tableName of tableNames) {
    const rows: DbColumn[] = await prisma.$queryRawUnsafe(
      `SELECT column_name, data_type, udt_name, is_nullable
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1
       ORDER BY ordinal_position`,
      tableName,
    );
    result.set(tableName, rows);
  }

  return result;
}

// ---------------------------------------------------------------------------
// SECTION 3 — Compute per-model diff
// ---------------------------------------------------------------------------

function computeDiffs(
  models: ParsedModel[],
  liveColumnsMap: Map<string, DbColumn[]>,
): ModelDiff[] {
  return models.map((model) => {
    const liveRows = liveColumnsMap.get(model.tableName) ?? [];
    const tableExists = liveRows.length > 0;

    if (!tableExists) {
      return {
        model,
        tableExists: false,
        missingInDb: [],
        extraInDb: [],
      };
    }

    const liveColNames = new Set(liveRows.map((r) => r.column_name));
    const schemaColNames = new Set(model.fields.map((f) => f.physicalColumn));

    const missingInDb = model.fields.filter((f) => !liveColNames.has(f.physicalColumn));
    const extraInDb = Array.from(liveColNames).filter((c) => !schemaColNames.has(c));

    return { model, tableExists, missingInDb, extraInDb };
  });
}

// ---------------------------------------------------------------------------
// SECTION 4 — Generate consolidated SQL draft
// ---------------------------------------------------------------------------

function generateConsolidatedSql(diffs: ModelDiff[], generatedAt: string): string {
  const lines: string[] = [
    '-- CONSOLIDATED FIX MIGRATION (draft — review before applying)',
    '-- Generated by: apps/web/scripts/audit/full-schema-drift-scan.ts',
    `-- Generated at: ${generatedAt}`,
    '-- DO NOT APPLY without reviewing each ALTER TABLE statement.',
    '',
    'BEGIN;',
    '',
  ];

  let hasAnyStatements = false;

  for (const diff of diffs) {
    if (!diff.tableExists || diff.missingInDb.length === 0) continue;

    hasAnyStatements = true;
    lines.push(`-- Model: ${diff.model.modelName} (table: ${diff.model.tableName})`);

    for (const field of diff.missingInDb) {
      const pgType = prismaTypeToPgType(field.prismaType, field.nativeHint);
      lines.push(
        `ALTER TABLE public."${diff.model.tableName}" ADD COLUMN IF NOT EXISTS "${field.physicalColumn}" ${pgType} NULL;`,
      );
    }

    lines.push('');
  }

  if (!hasAnyStatements) {
    lines.push('-- No missing columns detected — no ALTER TABLE statements needed.');
    lines.push('');
  }

  lines.push('COMMIT;');

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const cwd = process.cwd(); // expected to be apps/web
  const schemaPath = path.resolve(cwd, 'prisma/schema.prisma');
  const sqlDraftPath = path.resolve(cwd, 'scripts/audit/417-DRIFT-FIX-DRAFT.sql');
  const generatedAt = new Date().toISOString();

  console.log('');
  console.log('════════════════════════════════════════════════════════════');
  console.log('  Full Schema Drift Scan — all models vs live DB');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Schema:   ${schemaPath}`);
  console.log(`  SQL draft: ${sqlDraftPath}`);
  console.log('');

  // -------------------------------------------------------------------------
  // Parse all models
  // -------------------------------------------------------------------------

  console.log('  Parsing schema.prisma...');
  const models = parseAllModels(schemaPath);
  console.log(`  Found ${models.length} model blocks.`);
  console.log('');

  // -------------------------------------------------------------------------
  // Build unique table name list and query live DB
  // -------------------------------------------------------------------------

  const uniqueTableNames = Array.from(new Set(models.map((m) => m.tableName)));
  console.log(`  Querying live DB for ${uniqueTableNames.length} unique table names...`);

  const liveColumnsMap = await queryLiveColumns(uniqueTableNames);

  const tablesMissing = uniqueTableNames.filter(
    (t) => (liveColumnsMap.get(t) ?? []).length === 0,
  );
  const tablesFound = uniqueTableNames.length - tablesMissing.length;

  console.log(`  Tables found in DB: ${tablesFound}`);
  if (tablesMissing.length > 0) {
    console.log(`  Tables NOT found in DB: ${tablesMissing.length}`);
    for (const t of tablesMissing) {
      const modelNames = models
        .filter((m) => m.tableName === t)
        .map((m) => m.modelName)
        .join(', ');
      console.log(`    • "${t}"  (model: ${modelNames})`);
    }
  }
  console.log('');

  // -------------------------------------------------------------------------
  // Compute diffs and print drift report
  // -------------------------------------------------------------------------

  const diffs = computeDiffs(models, liveColumnsMap);

  const drifted = diffs.filter(
    (d) => d.tableExists && (d.missingInDb.length > 0 || d.extraInDb.length > 0),
  );
  const missingTables = diffs.filter((d) => !d.tableExists);

  if (drifted.length === 0 && missingTables.length === 0) {
    console.log('  All models match the live DB exactly — no drift detected.');
    console.log('');
  } else {
    if (drifted.length > 0) {
      console.log('════════════════════════════════════════════════════════════');
      console.log('  DRIFT REPORT');
      console.log('════════════════════════════════════════════════════════════');
      console.log('');

      for (const diff of drifted) {
        console.log(`  MODEL: ${diff.model.modelName} (table: ${diff.model.tableName})`);

        if (diff.missingInDb.length > 0) {
          const entries = diff.missingInDb.map((f) => {
            const pgType = prismaTypeToPgType(f.prismaType, f.nativeHint);
            const nativeAnnotation = f.nativeHint ? ` ${f.nativeHint}` : '';
            return `${f.physicalColumn} (${f.prismaType}${nativeAnnotation} → ${pgType}?)`;
          });
          console.log(`    MISSING IN DB: ${entries.join(', ')}`);
        } else {
          console.log('    MISSING IN DB: (none)');
        }

        if (diff.extraInDb.length > 0) {
          // Look up DB types for extra columns
          const liveRows = liveColumnsMap.get(diff.model.tableName) ?? [];
          const liveByName = new Map(liveRows.map((r) => [r.column_name, r]));
          const entries = diff.extraInDb.map((col) => {
            const row = liveByName.get(col);
            return row ? `${col} (${row.data_type})` : col;
          });
          console.log(`    EXTRA IN DB:   ${entries.join(', ')}`);
        } else {
          console.log('    EXTRA IN DB:   (none)');
        }

        console.log('');
      }
    }

    if (missingTables.length > 0) {
      console.log('════════════════════════════════════════════════════════════');
      console.log('  MODELS WITH NO TABLE IN DB');
      console.log('════════════════════════════════════════════════════════════');
      console.log('');
      for (const diff of missingTables) {
        console.log(`  MODEL: ${diff.model.modelName} → expected table: "${diff.model.tableName}" — TABLE NOT FOUND`);
      }
      console.log('');
    }
  }

  // -------------------------------------------------------------------------
  // Generate and write consolidated SQL draft
  // -------------------------------------------------------------------------

  const sqlContent = generateConsolidatedSql(diffs, generatedAt);

  try {
    fs.writeFileSync(sqlDraftPath, sqlContent, 'utf8');
  } catch (err) {
    console.error(`[ERROR] Failed to write SQL draft to ${sqlDraftPath}:`, err);
    process.exit(1);
  }

  console.log('════════════════════════════════════════════════════════════');
  console.log('  GENERATED SQL DRAFT');
  console.log('════════════════════════════════════════════════════════════');
  console.log('');
  console.log(sqlContent);

  // -------------------------------------------------------------------------
  // Summary footer
  // -------------------------------------------------------------------------

  const totalMissingColumns = drifted.reduce((sum, d) => sum + d.missingInDb.length, 0);
  const totalExtraColumns = drifted.reduce((sum, d) => sum + d.extraInDb.length, 0);

  console.log('════════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('════════════════════════════════════════════════════════════');
  console.log(`  Models scanned:            ${models.length}`);
  console.log(`  Models with drift:         ${drifted.length}`);
  console.log(`  Models with missing tables:${missingTables.length}`);
  console.log(`  Total columns missing in DB: ${totalMissingColumns}`);
  console.log(`  Total extra columns in DB:   ${totalExtraColumns}`);
  console.log(`  SQL draft written to: apps/web/scripts/audit/417-DRIFT-FIX-DRAFT.sql`);
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
