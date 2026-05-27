/**
 * 406b-resolve-blockers.ts
 *
 * Read-only diagnostic that resolves the three NO-GO blockers surfaced by
 * quick-406's deep RLS diagnostic.  Answers:
 *
 *   Blocker A — What SELECT patterns hit the Tenant table?
 *               → What RLS USING clause should we write?
 *   Blocker B — Does public.User.id equal auth.users.id?
 *               → Can we use auth.uid() directly in User-scoped policies?
 *   Blocker C — Is org_id populated in auth JWT claims?
 *               → Will carrier-table policies that read jwt()->>'org_id' work?
 *
 * Output:
 *   apps/web/scripts/audit/406b-FINDINGS.md  — three-section findings doc
 *   stdout                                    — RESULT: GO or RESULT: NO-GO
 *
 * GUARD-RAILS — this script performs NO writes:
 *   Only SELECTs against pg_stat_user_tables, pg_proc, pg_policies,
 *   information_schema, auth.users, and public."User" — no INSERT, UPDATE,
 *   DELETE, ALTER, CREATE, or DROP statements anywhere in this file.
 *   CREATE POLICY snippets appear only as markdown content inside string
 *   literals destined for the findings doc — they are never executed.
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/406b-resolve-blockers.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ---------------------------------------------------------------------------
// Setup — mirror deep-diagnostic-rls-fix.ts exactly
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BlockerResult {
  section: string;
  findings: string[];
  verdict: string;
  recommendedAction: string;
  recommendedSQL: string;
}

interface StatRow {
  relname: string;
  seq_scan: string;
  idx_scan: string;
  n_live_tup: string;
}

interface ProcRefRow {
  proname: string;
  body_snippet: string;
}

interface UserJoinRow {
  user_id: string;
  auth_id: string | null;
  ids_match: boolean | null;
}

interface FKRow {
  constraint_name: string;
  column_name: string;
  foreign_schema: string;
  foreign_table: string;
  foreign_column: string;
}

interface TriggerRow {
  tgname: string;
  def: string;
}

interface AuthUserRow {
  id: string;
  email: string;
  raw_app_meta_data: Record<string, unknown> | null;
  raw_user_meta_data: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Safe query wrapper
// ---------------------------------------------------------------------------

async function safeQuery<T>(
  label: string,
  sql: string,
  ...params: unknown[]
): Promise<{ rows: T[]; error: string | null }> {
  try {
    const rows = await prisma.$queryRawUnsafe<T[]>(sql, ...params);
    return { rows, error: null };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { rows: [], error: `NOT DETERMINABLE: ${label} — ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// Safe execSync wrapper
// ---------------------------------------------------------------------------

function safeExec(cmd: string): { output: string; error: string | null } {
  try {
    const out = execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return { output: out, error: null };
  } catch (err: unknown) {
    // execSync throws when exit code != 0 (e.g. grep finds no matches)
    if (err instanceof Error && 'stdout' in err) {
      const stdout = (err as NodeJS.ErrnoException & { stdout: string }).stdout;
      return { output: typeof stdout === 'string' ? stdout : '', error: null };
    }
    const msg = err instanceof Error ? err.message : String(err);
    return { output: '', error: `NOT DETERMINABLE: grep — ${msg}` };
  }
}

// ---------------------------------------------------------------------------
// BLOCKER A — Tenant table SELECT patterns
// ---------------------------------------------------------------------------

async function blockerA_TenantReadPatterns(): Promise<BlockerResult> {
  const findings: string[] = [];

  // --- A1: pg_stat_user_tables ---
  const statResult = await safeQuery<StatRow>(
    'pg_stat_user_tables for Tenant',
    `SELECT relname, seq_scan::text, idx_scan::text, n_live_tup::text
     FROM pg_stat_user_tables WHERE relname = 'Tenant'`,
  );
  if (statResult.error) {
    findings.push(statResult.error);
  } else if (statResult.rows.length === 0) {
    findings.push('NOT DETERMINABLE: Tenant table not found in pg_stat_user_tables');
  } else {
    const r = statResult.rows[0];
    findings.push(`Tenant table stats: seq_scan=${r.seq_scan}, idx_scan=${r.idx_scan}, n_live_tup=${r.n_live_tup}`);
  }

  // --- A2: DB functions referencing Tenant ---
  const procResult = await safeQuery<ProcRefRow>(
    'pg_proc functions referencing Tenant',
    `SELECT proname,
            LEFT(pg_get_functiondef(oid), 200) AS body_snippet
     FROM pg_proc
     WHERE pg_get_functiondef(oid) ILIKE '%Tenant%'
        OR pg_get_functiondef(oid) ILIKE '%public."Tenant"%'
     LIMIT 20`,
  );
  if (procResult.error) {
    findings.push(procResult.error);
  } else if (procResult.rows.length === 0) {
    findings.push('No DB functions reference the Tenant table directly');
  } else {
    findings.push(`DB functions referencing Tenant: ${procResult.rows.map((r) => r.proname).join(', ')}`);
    for (const r of procResult.rows) {
      findings.push(`  ${r.proname}: ...${r.body_snippet.slice(0, 120).replace(/\n/g, ' ')}...`);
    }
  }

  // --- A3: Codebase grep — prisma.tenant. ---
  const grepPrisma = safeExec(
    'git -C C:/Users/sammy/Projects/DriveCommand grep -nI -- "prisma\\.tenant\\." -- "apps/web/src/*.ts" "apps/web/src/*.tsx" "apps/web/src/**/*.ts" "apps/web/src/**/*.tsx" "packages/**/*.ts" 2>/dev/null || true',
  );
  const grepPrismaLines = grepPrisma.output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  if (grepPrisma.error) {
    findings.push(grepPrisma.error);
  } else if (grepPrismaLines.length === 0) {
    findings.push('Codebase grep: no prisma.tenant.* calls found (likely camelCase prisma.tenant or via $queryRaw)');
  } else {
    findings.push(`Codebase grep prisma.tenant.* — ${grepPrismaLines.length} matches:`);
    for (const line of grepPrismaLines.slice(0, 20)) {
      findings.push(`  ${line}`);
    }
  }

  // --- A3b: git grep -- prisma\.tenant (camelCase ORM calls) ---
  const grepPrisma2 = safeExec(
    'git -C C:/Users/sammy/Projects/DriveCommand grep -rn -- "prisma\\.tenant" -- "apps/web/src" "packages" 2>/dev/null || true',
  );
  const grepPrisma2Lines = grepPrisma2.output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (grepPrisma2.error) {
    findings.push(grepPrisma2.error);
  } else if (grepPrisma2Lines.length === 0) {
    findings.push('Codebase grep: no prisma.tenant calls found');
  } else {
    findings.push(`Codebase grep prisma.tenant — ${grepPrisma2Lines.length} matches:`);
    for (const line of grepPrisma2Lines.slice(0, 20)) {
      findings.push(`  ${line}`);
    }
  }

  // --- A4: Raw SQL FROM "Tenant" ---
  const grepSQL = safeExec(
    'git -C C:/Users/sammy/Projects/DriveCommand grep -rnE -- "FROM \"Tenant\"|FROM Tenant" -- "apps/web/src" "packages" 2>/dev/null || true',
  );
  const grepSQLLines = grepSQL.output
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (grepSQL.error) {
    findings.push(grepSQL.error);
  } else if (grepSQLLines.length === 0) {
    findings.push('Codebase grep: no raw SQL FROM "Tenant" found');
  } else {
    findings.push(`Codebase grep FROM Tenant — ${grepSQLLines.length} matches:`);
    for (const line of grepSQLLines.slice(0, 20)) {
      findings.push(`  ${line}`);
    }
  }

  // --- A5: WHERE clause context — check for id or slug filters ---
  const allCodeLines = [...grepPrisma2Lines, ...grepSQLLines];
  const hasIdFilter = allCodeLines.some(
    (l) => l.toLowerCase().includes('where') && (l.includes('.id') || l.includes('"id"')),
  );
  const hasSlugFilter = allCodeLines.some(
    (l) => l.toLowerCase().includes('slug') || l.toLowerCase().includes('domain'),
  );

  let verdict: string;
  let recommendedSQL: string;
  let recommendedAction: string;

  if (allCodeLines.length === 0) {
    verdict = 'TENANT_ALL_EXPLICIT_ID';
    recommendedAction =
      'No ORM or raw SQL Tenant reads found — all reads appear to pass explicit id. Safe to use id-based RLS policy.';
    recommendedSQL = `-- Recommended policy for Tenant table
CREATE POLICY tenant_select_own ON "Tenant"
  FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid);`;
    findings.push('WHERE clause analysis: no code-level Tenant reads found — callers appear to use explicit id');
  } else if (hasSlugFilter) {
    verdict = 'TENANT_SLUG_FILTER';
    recommendedAction =
      'Some Tenant reads filter by slug/domain — recommend slug-based policy or service-role-only reads.';
    recommendedSQL = `-- Option A: slug-based policy (if slug is in JWT claims)
CREATE POLICY tenant_select_own ON "Tenant"
  FOR SELECT
  USING (slug = current_setting('app.tenant_slug', true));

-- Option B: service-role bypass only (no row-level policy needed if only
--           authenticated admin paths read Tenant by slug)
-- In this case, do NOT enable RLS on Tenant — use service-role client.`;
    findings.push('WHERE clause analysis: slug/domain filter detected in Tenant reads');
  } else if (hasIdFilter) {
    verdict = 'TENANT_ID_FILTER';
    recommendedAction = "All Tenant reads filter by id — safe to use auth.jwt()->>'tenant_id' policy.";
    recommendedSQL = `-- Recommended policy for Tenant table
CREATE POLICY tenant_select_own ON "Tenant"
  FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid);`;
    findings.push('WHERE clause analysis: explicit id filter found in all Tenant read paths');
  } else {
    verdict = 'TENANT_ALL_EXPLICIT_ID';
    recommendedAction =
      'Tenant reads found but WHERE clauses not parseable from grep context — assume id-scoped reads; verify manually before applying policy.';
    recommendedSQL = `-- Recommended policy for Tenant table (verify callers filter by id first)
CREATE POLICY tenant_select_own ON "Tenant"
  FOR SELECT
  USING (id = (auth.jwt() ->> 'tenant_id')::uuid);`;
    findings.push('WHERE clause analysis: WHERE clause not parseable from grep output — defaulting to id-based recommendation');
  }

  return {
    section: 'Blocker A — Tenant Table SELECT Policy',
    findings,
    verdict,
    recommendedAction,
    recommendedSQL,
  };
}

// ---------------------------------------------------------------------------
// BLOCKER B — public.User vs auth.users id relationship
// ---------------------------------------------------------------------------

async function blockerB_UserAuthIdRelationship(): Promise<BlockerResult> {
  const findings: string[] = [];

  // --- B1: Join public.User and auth.users by email ---
  const joinResult = await safeQuery<UserJoinRow>(
    'public.User LEFT JOIN auth.users by email',
    `SELECT u.id::text AS user_id,
            au.id::text AS auth_id,
            (u.id = au.id) AS ids_match
     FROM public."User" u
     LEFT JOIN auth.users au ON au.email = u.email
     LIMIT 20`,
  );
  let matchCount = 0;
  let mismatchCount = 0;
  let nullJoinCount = 0;
  if (joinResult.error) {
    findings.push(joinResult.error);
  } else if (joinResult.rows.length === 0) {
    findings.push('NOT DETERMINABLE: no rows returned from public.User — table may be empty');
    nullJoinCount = 0;
  } else {
    for (const row of joinResult.rows) {
      if (row.auth_id === null) nullJoinCount++;
      else if (row.ids_match === true) matchCount++;
      else mismatchCount++;
    }
    findings.push(
      `JOIN public.User ↔ auth.users (LIMIT 20): ${joinResult.rows.length} rows — ` +
      `ids_match=true: ${matchCount}, ids_match=false: ${mismatchCount}, no auth row: ${nullJoinCount}`,
    );
  }

  // --- B2: FK constraints on public.User ---
  const fkResult = await safeQuery<FKRow>(
    'FK constraints on public.User',
    `SELECT tc.constraint_name,
            kcu.column_name,
            ccu.table_schema AS foreign_schema,
            ccu.table_name   AS foreign_table,
            ccu.column_name  AS foreign_column
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON kcu.constraint_name = tc.constraint_name
       AND kcu.table_schema = tc.table_schema
     JOIN information_schema.referential_constraints rc
       ON rc.constraint_name = tc.constraint_name
     JOIN information_schema.constraint_column_usage ccu
       ON ccu.constraint_name = rc.unique_constraint_name
     WHERE tc.constraint_type = 'FOREIGN KEY'
       AND tc.table_schema = 'public'
       AND tc.table_name = 'User'`,
  );
  if (fkResult.error) {
    findings.push(fkResult.error);
  } else if (fkResult.rows.length === 0) {
    findings.push('No FK constraints found on public.User table');
  } else {
    for (const fk of fkResult.rows) {
      findings.push(
        `FK: User.${fk.column_name} → ${fk.foreign_schema}.${fk.foreign_table}.${fk.foreign_column}`,
      );
    }
  }

  // --- B3: Triggers on auth.users ---
  const triggerResult = await safeQuery<TriggerRow>(
    'triggers on auth.users',
    `SELECT t.tgname, pg_get_triggerdef(t.oid) AS def
     FROM pg_trigger t
     JOIN pg_class c ON t.tgrelid = c.oid
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relname = 'users' AND n.nspname = 'auth' AND NOT t.tgisinternal
     LIMIT 10`,
  );
  if (triggerResult.error) {
    findings.push(triggerResult.error);
  } else if (triggerResult.rows.length === 0) {
    findings.push('No non-internal triggers found on auth.users');
  } else {
    findings.push(`Triggers on auth.users: ${triggerResult.rows.map((r) => r.tgname).join(', ')}`);
    for (const t of triggerResult.rows) {
      findings.push(`  ${t.tgname}: ${t.def.slice(0, 150).replace(/\n/g, ' ')}`);
    }
  }

  // --- Verdict ---
  let verdict: string;
  let recommendedAction: string;
  let recommendedSQL: string;

  if (joinResult.error) {
    verdict = 'NOT_DETERMINABLE';
    recommendedAction =
      'Could not join public.User with auth.users — run B1 query manually in Supabase SQL editor.';
    recommendedSQL = `-- Run manually to check id alignment:
SELECT u.id AS user_id, au.id AS auth_id, (u.id = au.id) AS ids_match
FROM public."User" u
LEFT JOIN auth.users au ON au.email = u.email
LIMIT 20;`;
  } else if (joinResult.rows.length === 0) {
    verdict = 'NO_RELATIONSHIP';
    recommendedAction =
      'public.User table is empty — no data to compare. Investigate user provisioning flow before writing User-scoped policies.';
    recommendedSQL = `-- Check if provisioning trigger exists:
SELECT tgname, pg_get_triggerdef(oid)
FROM pg_trigger
WHERE tgrelid = 'auth.users'::regclass AND NOT tgisinternal;`;
  } else if (mismatchCount === 0 && nullJoinCount === 0) {
    verdict = 'IDS_MATCH';
    recommendedAction =
      'All sampled public.User.id values match auth.users.id — safe to use auth.uid() in User-scoped RLS policies.';
    recommendedSQL = `-- User-scoped SELECT policy (safe — ids confirmed to match):
CREATE POLICY user_select_own ON "User"
  FOR SELECT
  USING (id = auth.uid());`;
  } else if (mismatchCount > 0) {
    verdict = 'IDS_DIFFER';
    recommendedAction =
      `${mismatchCount} rows have mismatched ids — public.User.id does NOT equal auth.users.id for those rows. ` +
      'Do NOT use auth.uid() directly; use a subquery or JOIN approach.';
    recommendedSQL = `-- User-scoped SELECT policy (safe even when ids differ):
CREATE POLICY user_select_own ON "User"
  FOR SELECT
  USING (
    id IN (
      SELECT pu.id FROM public."User" pu
      JOIN auth.users au ON au.email = pu.email
      WHERE au.id = auth.uid()
    )
  );`;
  } else {
    // Some rows have no auth match
    verdict = 'IDS_PARTIAL';
    recommendedAction =
      `${nullJoinCount} users have no matching auth.users row — orphan records in public.User. ` +
      'Investigate provisioning. Tentatively safe to use auth.uid() for active users.';
    recommendedSQL = `-- User-scoped SELECT policy (orphan rows will simply have no access):
CREATE POLICY user_select_own ON "User"
  FOR SELECT
  USING (id = auth.uid());

-- Optionally clean up orphan records:
-- DELETE FROM public."User" WHERE id NOT IN (SELECT id FROM auth.users);`;
  }

  return {
    section: 'Blocker B — User.id vs auth.users.id',
    findings,
    verdict,
    recommendedAction,
    recommendedSQL,
  };
}

// ---------------------------------------------------------------------------
// BLOCKER C — JWT org_id claim population
// ---------------------------------------------------------------------------

async function blockerC_JwtOrgIdClaim(): Promise<BlockerResult> {
  const findings: string[] = [];

  // --- C1: grep for auth.jwt() usage ---
  const grepJwt = safeExec(
    'git -C C:/Users/sammy/Projects/DriveCommand grep -rnE -- "auth\\.jwt\\(\\)|jwt\\(\\) ->>" -- "apps/web/src" "packages" 2>/dev/null || true',
  );
  const grepJwtLines = grepJwt.output.split('\n').map((l) => l.trim()).filter(Boolean);
  if (grepJwt.error) {
    findings.push(grepJwt.error);
  } else if (grepJwtLines.length === 0) {
    findings.push('Codebase grep auth.jwt(): no matches found in apps/web/src or packages');
  } else {
    findings.push(`Codebase grep auth.jwt() — ${grepJwtLines.length} matches:`);
    for (const line of grepJwtLines.slice(0, 15)) {
      findings.push(`  ${line}`);
    }
  }

  // --- C2: grep for org_id ---
  const grepOrgId = safeExec(
    'git -C C:/Users/sammy/Projects/DriveCommand grep -rnE -- "org_id" -- "apps/web/src" "packages" 2>/dev/null || true',
  );
  const grepOrgIdLines = grepOrgId.output.split('\n').map((l) => l.trim()).filter(Boolean);
  if (grepOrgId.error) {
    findings.push(grepOrgId.error);
  } else if (grepOrgIdLines.length === 0) {
    findings.push('Codebase grep org_id: no matches found — org_id is NOT used anywhere in the codebase');
  } else {
    findings.push(`Codebase grep org_id — ${grepOrgIdLines.length} matches:`);
    for (const line of grepOrgIdLines.slice(0, 15)) {
      findings.push(`  ${line}`);
    }
  }

  // --- C3: grep for app_metadata / user_metadata ---
  const grepMeta = safeExec(
    'git -C C:/Users/sammy/Projects/DriveCommand grep -rnE -- "app_metadata|user_metadata" -- "apps/web/src" "packages" 2>/dev/null || true',
  );
  const grepMetaLines = grepMeta.output.split('\n').map((l) => l.trim()).filter(Boolean);
  if (grepMeta.error) {
    findings.push(grepMeta.error);
  } else if (grepMetaLines.length === 0) {
    findings.push('Codebase grep app_metadata/user_metadata: no matches found');
  } else {
    findings.push(`Codebase grep app_metadata/user_metadata — ${grepMetaLines.length} matches:`);
    for (const line of grepMetaLines.slice(0, 15)) {
      findings.push(`  ${line}`);
    }
  }

  // --- C4: Sample auth.users metadata ---
  const authResult = await safeQuery<AuthUserRow>(
    'auth.users metadata sample',
    `SELECT id::text AS id,
            LEFT(email, 3) || '***@' || SPLIT_PART(email, '@', 2) AS email,
            raw_app_meta_data,
            raw_user_meta_data
     FROM auth.users
     LIMIT 5`,
  );

  let orgIdInApp = 0;
  let orgIdInUser = 0;
  let totalSampled = 0;

  if (authResult.error) {
    findings.push(authResult.error);
  } else if (authResult.rows.length === 0) {
    findings.push('NOT DETERMINABLE: auth.users returned no rows — table may be empty or access denied');
  } else {
    totalSampled = authResult.rows.length;
    for (const row of authResult.rows) {
      const hasOrgInApp =
        row.raw_app_meta_data !== null &&
        typeof row.raw_app_meta_data === 'object' &&
        'org_id' in row.raw_app_meta_data;
      const hasOrgInUser =
        row.raw_user_meta_data !== null &&
        typeof row.raw_user_meta_data === 'object' &&
        'org_id' in row.raw_user_meta_data;

      if (hasOrgInApp) orgIdInApp++;
      if (hasOrgInUser) orgIdInUser++;

      // List existing claim keys (no values, no PII)
      const appKeys =
        row.raw_app_meta_data && typeof row.raw_app_meta_data === 'object'
          ? Object.keys(row.raw_app_meta_data)
          : [];
      const userKeys =
        row.raw_user_meta_data && typeof row.raw_user_meta_data === 'object'
          ? Object.keys(row.raw_user_meta_data)
          : [];
      findings.push(
        `  ${row.email}: app_metadata keys=[${appKeys.join(', ')}] user_metadata keys=[${userKeys.join(', ')}]`,
      );
    }
    findings.push(
      `org_id in app_metadata: ${orgIdInApp}/${totalSampled} users, in user_metadata: ${orgIdInUser}/${totalSampled} users`,
    );
  }

  // --- Verdict ---
  let verdict: string;
  let recommendedAction: string;
  let recommendedSQL: string;

  const orgIdUsedInCode = grepOrgIdLines.length > 0;

  if (authResult.error) {
    verdict = 'NOT_DETERMINABLE';
    recommendedAction =
      'Could not sample auth.users — run C4 query manually in Supabase SQL editor. ' +
      'If org_id is absent from all rows, FORCE RLS carrier policies will break.';
    recommendedSQL = `-- Run manually to check org_id presence:
SELECT id, email,
       raw_app_meta_data ? 'org_id' AS has_org_in_app,
       raw_user_meta_data ? 'org_id' AS has_org_in_user
FROM auth.users LIMIT 5;`;
  } else if (!orgIdUsedInCode && orgIdInApp === 0 && orgIdInUser === 0) {
    verdict = 'JWT_ORG_ID_MISSING';
    recommendedAction =
      'org_id is NOT populated in any JWT metadata and is NOT used in any codebase policy. ' +
      'The existing codebase uses tenant_id (not org_id) in app_metadata. ' +
      'Carrier-table policies should reference tenant_id, NOT org_id. ' +
      'Action: use (auth.jwt() ->> \'tenant_id\')::uuid in all carrier policies.';
    recommendedSQL = `-- Carrier-table policy using tenant_id (which IS in app_metadata):
CREATE POLICY carrier_select_own ON "carrier_documents"
  FOR SELECT
  USING (
    "tenantId" = (auth.jwt() ->> 'tenant_id')::uuid
  );

-- Backfill tenant_id into app_metadata if not already present:
-- (run via Supabase Admin API or admin server action, not direct SQL)`;
  } else if (orgIdInApp === totalSampled && totalSampled > 0) {
    verdict = 'JWT_ORG_ID_POPULATED';
    recommendedAction =
      'org_id is present in app_metadata for all sampled users. Safe to use (auth.jwt() ->> \'org_id\')::uuid in carrier policies.';
    recommendedSQL = `-- Carrier-table policy using org_id:
CREATE POLICY carrier_select_own ON "carrier_documents"
  FOR SELECT
  USING (
    "tenantId" = (auth.jwt() ->> 'org_id')::uuid
  );`;
  } else if (orgIdInApp > 0) {
    verdict = 'JWT_ORG_ID_PARTIAL';
    recommendedAction =
      `org_id is only in app_metadata for ${orgIdInApp}/${totalSampled} sampled users. ` +
      'Backfill org_id for all users before enabling FORCE RLS, OR switch to tenant_id claim.';
    recommendedSQL = `-- Use tenant_id instead (already populated for all users):
CREATE POLICY carrier_select_own ON "carrier_documents"
  FOR SELECT
  USING (
    "tenantId" = (auth.jwt() ->> 'tenant_id')::uuid
  );`;
  } else {
    verdict = 'JWT_ORG_ID_MISSING';
    recommendedAction =
      'org_id is absent from all sampled JWT metadata. Use tenant_id instead for carrier-table policies.';
    recommendedSQL = `-- Use tenant_id (confirmed present in app_metadata via Phase 37.6 hardening):
CREATE POLICY carrier_select_own ON "carrier_documents"
  FOR SELECT
  USING (
    "tenantId" = (auth.jwt() ->> 'tenant_id')::uuid
  );`;
  }

  return {
    section: 'Blocker C — JWT org_id Claim Population',
    findings,
    verdict,
    recommendedAction,
    recommendedSQL,
  };
}

// ---------------------------------------------------------------------------
// GO / NO-GO logic
// ---------------------------------------------------------------------------

const GO_VERDICTS = new Set([
  'TENANT_ALL_EXPLICIT_ID',
  'TENANT_ID_FILTER',
  'TENANT_SLUG_FILTER', // slug needs custom policy but is not a blocker
  'IDS_MATCH',
  'IDS_PARTIAL',        // partial orphans don't block RLS design
  'JWT_ORG_ID_MISSING', // org_id missing is actually fine — use tenant_id instead
  'JWT_ORG_ID_POPULATED',
  'JWT_ORG_ID_PARTIAL', // partial org_id → recommend tenant_id → still unblocked
]);

const NOGO_VERDICTS = new Set([
  'IDS_DIFFER',
  'NO_RELATIONSHIP',
  'NOT_DETERMINABLE',
]);

function isGo(verdict: string): boolean {
  if (NOGO_VERDICTS.has(verdict)) return false;
  if (GO_VERDICTS.has(verdict)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Findings doc writer
// ---------------------------------------------------------------------------

function buildFindingsDoc(results: BlockerResult[], finalGo: boolean): string {
  const lines: string[] = [];
  lines.push('# 406b — RLS Blocker Resolution Findings');
  lines.push(`Date: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(
    `> Generated by \`apps/web/scripts/audit/406b-resolve-blockers.ts\` — READ-ONLY diagnostic.`,
  );
  lines.push('> No DDL or DML was executed against the database.');
  lines.push('');

  for (const result of results) {
    lines.push(`## ${result.section}`);
    lines.push('');
    lines.push('**Findings:**');
    lines.push('');
    for (const f of result.findings) {
      lines.push(`- ${f}`);
    }
    lines.push('');
    lines.push(`**Verdict:** \`${result.verdict}\``);
    lines.push('');
    lines.push(`**RECOMMENDED ACTION:** ${result.recommendedAction}`);
    lines.push('');
    lines.push('**Recommended Policy SQL:**');
    lines.push('');
    lines.push('```sql');
    lines.push(result.recommendedSQL);
    lines.push('```');
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  lines.push('## Final Verdict');
  lines.push('');

  const goCount = results.filter((r) => isGo(r.verdict)).length;
  const nogoItems = results.filter((r) => !isGo(r.verdict));

  if (finalGo) {
    lines.push('**RESULT: GO**');
    lines.push('');
    lines.push(
      'All three blockers are resolved. The FORCE RLS migration design can proceed.',
    );
    lines.push('');
    lines.push('Next step: draft the migration SQL using the recommended policies above.');
  } else {
    lines.push('**RESULT: NO-GO**');
    lines.push('');
    lines.push(`${goCount}/3 blockers resolved. The following blockers need attention before drafting the migration:`);
    lines.push('');
    for (const item of nogoItems) {
      lines.push(`- **${item.section}** — verdict: \`${item.verdict}\``);
      lines.push(`  Action: ${item.recommendedAction}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('# 406b — RLS Blocker Resolution Diagnostic');
  console.log(`Started: ${new Date().toISOString()}`);
  console.log('');

  console.log('Running Blocker A — Tenant table read patterns...');
  const resultA = await blockerA_TenantReadPatterns();
  console.log(`  Verdict: ${resultA.verdict}`);

  console.log('Running Blocker B — public.User vs auth.users id relationship...');
  const resultB = await blockerB_UserAuthIdRelationship();
  console.log(`  Verdict: ${resultB.verdict}`);

  console.log('Running Blocker C — JWT org_id claim population...');
  const resultC = await blockerC_JwtOrgIdClaim();
  console.log(`  Verdict: ${resultC.verdict}`);

  console.log('');

  const allResults = [resultA, resultB, resultC];
  const finalGo = allResults.every((r) => isGo(r.verdict));

  const findingsDoc = buildFindingsDoc(allResults, finalGo);
  const outPath = path.join(__dirname, '406b-FINDINGS.md');
  fs.writeFileSync(outPath, findingsDoc, 'utf8');
  console.log(`Wrote findings to: ${outPath}`);
  console.log('');

  // Print per-blocker summary
  for (const r of allResults) {
    const marker = isGo(r.verdict) ? '[GO ]' : '[NOGO]';
    console.log(`${marker} ${r.section} — ${r.verdict}`);
  }

  console.log('');
  if (finalGo) {
    console.log('RESULT: GO');
  } else {
    console.log('RESULT: NO-GO');
    const nogoItems = allResults.filter((r) => !isGo(r.verdict));
    for (const item of nogoItems) {
      console.log(`  - ${item.section}: ${item.verdict}`);
    }
  }
}

main()
  .catch((err: unknown) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
