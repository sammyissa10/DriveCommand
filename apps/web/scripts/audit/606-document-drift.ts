/**
 * quick-606 — the `Document` column drift, read off BOTH databases before a
 * migration is written.
 *
 *   npx tsx scripts/audit/606-document-drift.ts
 *
 * R1: production is read READ-ONLY. The only statement issued against it is the
 * `information_schema.columns` SELECT below, and a runtime assertion refuses
 * anything that is not a SELECT.
 *
 * R13 / DEC-14: "it is in a migration", "it is in `schema.prisma`" and "it is in
 * the database" are three different claims. This file answers only the third,
 * for both databases, column by column, with type, nullability and default — the
 * plan's condition is that an `ADD COLUMN` may only be written when production's
 * answer is unambiguous for EVERY column.
 *
 * THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env` — it assigns
 * `DATABASE_URL = DIRECT_URL`, and `DIRECT_URL` is PRODUCTION in every env file.
 */
import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
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

function refuse(reason: string): never {
  console.error(`606-document-drift: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const COLUMNS_SELECT = `
  SELECT column_name, data_type, udt_name, is_nullable, column_default,
         character_maximum_length, numeric_precision, numeric_scale, datetime_precision
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'Document'
   ORDER BY column_name`;

if (!/^\s*SELECT\b/i.test(COLUMNS_SELECT)) refuse('the only statement is not a SELECT');

function productionUrl(): string {
  const text = readFileSync(resolve(REPO_ROOT, '.env'), 'utf8').replace(/\r\n/g, '\n');
  const m = text.match(/^DIRECT_URL\s*=\s*"?([^"\n]+)"?\s*$/m);
  if (!m) refuse('DIRECT_URL not found in repo-root .env');
  if (!m[1].includes(PRODUCTION_REF)) refuse('repo-root DIRECT_URL does not name production');
  return m[1];
}

function stagingUrl(): string {
  const u = process.env.STAGING_DIRECT_URL;
  if (!u) refuse('STAGING_DIRECT_URL unset');
  if (u.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
  if (!u.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');
  return u.replace(':6543/', ':5432/').replace('?pgbouncer=true', '');
}

type Col = Record<string, unknown>;

async function columns(url: string): Promise<Record<string, Col>> {
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 30000 });
  await c.connect();
  try {
    const r = await c.query<Col>(COLUMNS_SELECT);
    return Object.fromEntries(r.rows.map((row) => [String(row.column_name), row]));
  } finally {
    await c.end();
  }
}

(async () => {
  const prod = await columns(productionUrl());
  const stg = await columns(stagingUrl());

  const prodNames = Object.keys(prod).sort();
  const stgNames = Object.keys(stg).sort();
  const missingOnStaging = prodNames.filter((n) => !stgNames.includes(n));
  const extraOnStaging = stgNames.filter((n) => !prodNames.includes(n));

  const detail = missingOnStaging.map((n) => {
    const c = prod[n];
    const ambiguous: string[] = [];
    if (!c.data_type) ambiguous.push('data_type is null');
    if (c.data_type === 'USER-DEFINED' && !c.udt_name) ambiguous.push('USER-DEFINED with no udt_name');
    return {
      column: n,
      data_type: c.data_type,
      udt_name: c.udt_name,
      is_nullable: c.is_nullable,
      column_default: c.column_default,
      character_maximum_length: c.character_maximum_length,
      numeric_precision: c.numeric_precision,
      numeric_scale: c.numeric_scale,
      datetime_precision: c.datetime_precision,
      ambiguous,
    };
  });

  const anyAmbiguous = detail.some((d) => d.ambiguous.length > 0 || d.is_nullable === 'NO');

  const record = {
    task: 'quick-606',
    at: new Date().toISOString(),
    productionColumnCount: prodNames.length,
    stagingColumnCount: stgNames.length,
    missingOnStaging,
    extraOnStaging,
    detail,
    /**
     * The plan's condition: write NO migration if any column is ambiguous in
     * type, nullability or default. A NOT NULL column with no default cannot be
     * added by `ADD COLUMN IF NOT EXISTS` to a populated table at all, so it is
     * treated as ambiguous here rather than guessed at.
     */
    safeToWriteMigration: missingOnStaging.length > 0 && !anyAmbiguous,
  };

  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '06-document-drift.json'), JSON.stringify(record, null, 2) + '\n');

  console.log(`production "Document": ${prodNames.length} columns`);
  console.log(`staging    "Document": ${stgNames.length} columns`);
  console.log(`missing on staging  : ${missingOnStaging.join(', ') || '(none)'}`);
  console.log(`extra on staging    : ${extraOnStaging.join(', ') || '(none)'}`);
  for (const d of detail) {
    console.log(
      `  ${d.column.padEnd(14)} ${String(d.data_type).padEnd(26)} nullable=${d.is_nullable} default=${
        d.column_default ?? 'NULL'
      }${d.ambiguous.length ? '  AMBIGUOUS: ' + d.ambiguous.join('; ') : ''}`,
    );
  }
  console.log(`safeToWriteMigration: ${record.safeToWriteMigration}`);
})();
