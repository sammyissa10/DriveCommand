/**
 * quick-598 - canonicalise the migration corpus's RLS policy bodies, on STAGING.
 *
 *   npm run audit:rls-canonicalise
 *
 * Writes `scripts/audit/rls-policy-canonical.json`, which is COMMITTED. That
 * artefact is what lets `rls-policy-drift.ts` compare PRODUCTION's policy
 * bodies with a pure `SELECT` - no transaction, no DDL, nothing that could
 * write to the production database.
 *
 * WHY POSTGRES DOES THE CANONICALISATION AND A REGEX DOES NOT
 * ----------------------------------------------------------
 * A migration writes:
 *     current_setting('app.bypass_rls', TRUE) = 'on'
 * and `pg_get_expr` renders the stored parse tree as:
 *     (current_setting('app.bypass_rls'::text, true) = 'on'::text)
 * Same expression, five textual differences. A string comparator reports that
 * as drift on every one of the 20-odd bypass policies - a gate that cries wolf
 * protects nothing. Measured on staging at plan time: the hand-written form
 * above round-trips BYTE-IDENTICAL to the live expression through this script.
 *
 * SO: each migration-declared body is CREATEd under a probe name inside
 * `BEGIN ... ROLLBACK`, read back with `pg_get_expr`, and the deparsed result
 * is what gets committed as "expected".
 *
 * STAGING ONLY. THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`.
 * ------------------------------------------------------------------
 * `_bootstrap-env.ts:53-55` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
 * UNCONDITIONALLY, and `.env`, `.env.local` and `apps/web/.env.local` ALL point
 * `DIRECT_URL` at PRODUCTION. This file loads `apps/web/.env.staging`
 * explicitly and refuses on the production project ref. It is the ONLY file in
 * quick-598 that issues DDL, and every statement it issues is discarded by the
 * ROLLBACK.
 *
 * THIS FILE ISSUES NO SQL `COMMIT`. The check is
 *     grep -nE "query\(\s*'COMMIT" scripts/audit/598-canonicalise-policies.ts
 * which returns nothing. A bare `grep -c COMMIT` returns 3 and is the WRONG
 * check: all three hits are prose about committing the artefact to git, and a
 * guard that cannot distinguish those from a transaction commit is a guard
 * somebody will "fix" by deleting the sentence rather than by reading the code.
 * The real proof is not textual at all - the probe-cleanup assertion below
 * re-reads `pg_policy` AFTER the rollback and fails the run if a single probe
 * policy survived.
 *
 * CAUTION, measured while probing: `polname LIKE '__p%'` matched 86 REAL
 * policies, because `_` is a LIKE wildcard and `bypass_rls_policy` matches.
 * The cleanup oracle is an EXACT name array (`polname = ANY($1)`), never a
 * prefix LIKE.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { resolve, join } from 'path';

import {
  replayPolicyDefinitions,
  computeDefinitionCorpusHash,
  canonicalPolicyShape,
  assertDefinitionCorpusIntegrity,
  POLICY_CMD_BY_CATALOGUE_CHAR,
  PUBLIC_ROLE_OID,
  type CanonicalArtefact,
  type CanonicalPolicyShape,
  type NotCanonicalisedEntry,
  type PolicyDefinition,
} from './rls-policy-definitions';
import { policyKey, type MigrationFile, type PolicyKey } from './rls-policy-replay';

// ---------------------------------------------------------------------------
// Environment - explicit, staging-only, production-ref guarded
// ---------------------------------------------------------------------------

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const ARTEFACT_PATH = resolve(__dirname, 'rls-policy-canonical.json');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`598-canonicalise-policies: REFUSING TO RUN - ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;

if (!DIRECT_URL) refuse('STAGING_DIRECT_URL is not set in apps/web/.env.staging');
if (DIRECT_URL.includes(PRODUCTION_REF)) {
  refuse(`STAGING_DIRECT_URL names the PRODUCTION project (${PRODUCTION_REF})`);
}
if (!DIRECT_URL.includes(STAGING_REF)) {
  refuse(`STAGING_DIRECT_URL does not name the staging project (${STAGING_REF})`);
}

// Never print a connection string or a password. Anywhere.
process.env.PG_CONNECT_TIMEOUT_MS ??= '30000';

// ---------------------------------------------------------------------------
// Migration corpus (disk read - resolved relative to this file, not cwd)
// ---------------------------------------------------------------------------

function loadMigrationCorpus(): MigrationFile[] {
  const migrationsDir = join(__dirname, '../../prisma/migrations');
  const dirNames = readdirSync(migrationsDir);

  const migrationDirs = dirNames.filter((name) => {
    const full = join(migrationsDir, name);
    try {
      if (!statSync(full).isDirectory()) return false;
      statSync(join(full, 'migration.sql'));
      return true;
    } catch {
      return false;
    }
  });

  migrationDirs.sort();

  return migrationDirs.map((migration) => ({
    migration,
    sql: readFileSync(join(migrationsDir, migration, 'migration.sql'), 'utf8'),
  }));
}

// ---------------------------------------------------------------------------
// Probe names - deterministic, collision-proof, and the cleanup oracle
// ---------------------------------------------------------------------------

/**
 * A fixed prefix plus a zero-padded index. Deterministic so a re-run produces
 * the same names, and recorded in a Set as the EXACT cleanup oracle.
 * Identifier length stays well inside Postgres's 63-byte limit.
 */
function probeNameFor(index: number): string {
  return `q598canon${String(index).padStart(4, '0')}`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

/** Rebuilds the migration-declared statement under a probe name. */
function renderProbeStatement(def: PolicyDefinition, probeName: string): string {
  const parts = [
    `CREATE POLICY ${quoteIdent(probeName)} ON public.${quoteIdent(def.table)}`,
    `AS ${def.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`,
    `FOR ${def.cmd}`,
    `TO ${def.roles.map((r) => (r === 'public' ? 'public' : quoteIdent(r))).join(', ')}`,
  ];
  if (def.using !== null) parts.push(`USING (${def.using})`);
  if (def.withCheck !== null) parts.push(`WITH CHECK (${def.withCheck})`);
  return parts.join('\n  ');
}

// ---------------------------------------------------------------------------
// Read-back
// ---------------------------------------------------------------------------

interface ProbeReadback {
  permissive: boolean;
  cmd: string;
  roles: string[];
  using: string | null;
  with_check: string | null;
}

const READBACK_SQL = `
  SELECT
    p.polpermissive AS permissive,
    p.polcmd::text  AS cmd,
    COALESCE(
      (
        SELECT array_agg(x ORDER BY x)
          FROM (
            SELECT CASE
                     WHEN ro = ${PUBLIC_ROLE_OID} THEN 'public'
                     ELSE COALESCE(pr.rolname::text, ro::text)
                   END AS x
              FROM unnest(p.polroles) AS ro
              LEFT JOIN pg_roles pr ON pr.oid = ro
          ) s
      ),
      ARRAY[]::text[]
    ) AS roles,
    -- "using" is a reserved word; the alias MUST be quoted or this is a syntax error.
    pg_get_expr(p.polqual, p.polrelid)      AS "using",
    pg_get_expr(p.polwithcheck, p.polrelid) AS with_check
  FROM pg_policy p
  WHERE p.polname = $1
`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const files = loadMigrationCorpus();
  const { definitions, expected } = replayPolicyDefinitions(files);

  assertDefinitionCorpusIntegrity({
    definitionsParsed: definitions.length,
    expectedDefinitions: expected.size,
  });

  const corpusHash = computeDefinitionCorpusHash(expected);

  console.log('RLS Policy Canonicalisation - deparse round-trip against STAGING');
  console.log('='.repeat(72));
  console.log('');
  console.log(`  Migration files read      : ${files.length}`);
  console.log(`  CREATE POLICY definitions : ${definitions.length}`);
  console.log(`  Expected (net) definitions: ${expected.size}`);
  console.log(`  Corpus hash               : ${corpusHash}`);
  console.log('');

  const client = new Client({ connectionString: DIRECT_URL });
  await client.connect();

  const who = await client.query<{ u: string; db: string }>(
    'SELECT current_user AS u, current_database() AS db'
  );
  console.log(`Connected to staging (${STAGING_REF}) as role "${who.rows[0].u}".`);
  console.log('');

  const policies: Record<PolicyKey, CanonicalPolicyShape> = {};
  const notCanonicalised: NotCanonicalisedEntry[] = [];
  const probeNames: string[] = [];

  try {
    await client.query('BEGIN');

    let index = 0;
    for (const [key, def] of [...expected.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const probeName = probeNameFor(index++);
      probeNames.push(probeName);

      // SAVEPOINT per probe: a body that no longer type-checks against the live
      // schema (a dropped column, a renamed function) is recorded BY NAME as
      // notCanonicalised rather than aborting the whole run and leaving the
      // artefact unwritten. An unwritten artefact makes the detector print
      // DID NOT RUN, which is honest but tells nobody which policy caused it.
      await client.query('SAVEPOINT probe598');
      try {
        await client.query(renderProbeStatement(def, probeName));
        const read = await client.query<ProbeReadback>(READBACK_SQL, [probeName]);
        if (read.rowCount !== 1) {
          throw new Error(`read-back returned ${read.rowCount} rows for probe ${probeName}`);
        }
        const row = read.rows[0];
        const cmd = POLICY_CMD_BY_CATALOGUE_CHAR[row.cmd];
        if (!cmd) throw new Error(`unknown polcmd ${JSON.stringify(row.cmd)}`);

        policies[key] = canonicalPolicyShape({
          cmd,
          permissive: row.permissive,
          roles: row.roles,
          using: row.using,
          withCheck: row.with_check,
        });
        await client.query('RELEASE SAVEPOINT probe598');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT probe598').catch(() => {});
        const err = e as { code?: string; message?: string };
        notCanonicalised.push({
          key,
          sqlstate: err.code ?? 'UNKNOWN',
          message: err.message ?? String(e),
        });
      }
    }

    await client.query('ROLLBACK');
    console.log('Transaction ROLLED BACK - every probe policy created above is discarded.');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    await client.end().catch(() => {});
    throw e;
  }

  // -------------------------------------------------------------------------
  // Probe-cleanup oracle. EXACT names, in a fresh statement after the rollback.
  // `LIKE 'q598%'` would be a weaker check and a prefix LIKE with an underscore
  // would be an actively wrong one (86 real policies matched '__p%' while this
  // was being designed).
  // -------------------------------------------------------------------------
  const leftover = await client.query<{ n: string; names: string[] | null }>(
    `SELECT count(*)::text AS n,
            COALESCE(array_agg(polname ORDER BY polname), ARRAY[]::name[]) AS names
       FROM pg_policy WHERE polname = ANY($1::text[])`,
    [probeNames]
  );
  const leftoverCount = Number(leftover.rows[0].n);
  console.log(`Probe policies remaining (exact-name count over ${probeNames.length} names): ${leftoverCount}`);

  await client.end().catch(() => {});

  if (leftoverCount !== 0) {
    console.error('');
    console.error('='.repeat(72));
    console.error('PROBE CLEANUP FAILED - probe policies survived the ROLLBACK.');
    console.error(`Leftover: ${(leftover.rows[0].names ?? []).join(', ')}`);
    console.error('Drop them by name before doing anything else.');
    return 2;
  }

  // -------------------------------------------------------------------------
  // Floors, then write
  // -------------------------------------------------------------------------
  const canonicalisedCount = Object.keys(policies).length;

  console.log('');
  console.log(`  Canonicalised             : ${canonicalisedCount}`);
  console.log(`  Not canonicalised         : ${notCanonicalised.length}`);
  for (const entry of notCanonicalised) {
    console.log(`    - ${entry.key}  [${entry.sqlstate}] ${entry.message}`);
  }

  assertDefinitionCorpusIntegrity({
    definitionsParsed: definitions.length,
    expectedDefinitions: expected.size,
    canonicalised: canonicalisedCount,
  });

  const artefact: CanonicalArtefact = {
    generatedAt: new Date().toISOString(),
    projectRef: STAGING_REF,
    corpusHash,
    definitionCount: expected.size,
    canonicalisedCount,
    notCanonicalised,
    policies,
  };

  writeFileSync(ARTEFACT_PATH, JSON.stringify(artefact, null, 2) + '\n', 'utf8');

  console.log('');
  console.log(`Wrote ${ARTEFACT_PATH}`);
  console.log('');
  console.log('='.repeat(72));
  console.log('RESULT: canonical artefact written. COMMIT IT.');
  console.log('  A migration that changes a policy BODY changes the corpus hash, which');
  console.log('  makes this artefact stale. `npm run audit:rls-policy-drift` then prints');
  console.log('  DEFINITION LAYER DID NOT RUN and exits 3 - re-run this script.');

  // Referenced so the key helper cannot be dropped by a later edit without a
  // type error: probe keys and artefact keys must be the same vocabulary.
  void policyKey;

  return 0;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    console.error('');
    console.error('='.repeat(72));
    console.error('598-canonicalise-policies FAILED - the artefact was NOT written.');
    console.error(err);
    process.exitCode = 2;
  });
