/**
 * deep-diagnostic-rls-fix.ts
 *
 * Read-only deep diagnostic that answers four specific dependency questions
 * before designing the Supabase advisor RLS fix migration.
 *
 * Output sections:
 *   Section 1 — current_tenant_id() function definition (prosrc, provolatile, prosecdef, owner)
 *   Section 2 — Tenant table existing policies (full SQL) + pg_roles verification
 *   Section 3 — Existing policies on Tier 4 tables (carrier_documents, route_template_stops,
 *               stops, TicketMessage) with function-call extraction
 *   Section 4 — userId FK resolution for grid_preference and grid_view
 *   Section 5 — NotificationEmailConfig full column inventory + tenant/user column detection
 *
 * Final section:
 *   GO / NO-GO SUMMARY — re-prints all verdict lines and emits a final recommendation
 *
 * GUARD-RAILS — this script performs NO writes:
 *   Only SELECTs against pg_proc, pg_namespace, pg_roles, pg_policies,
 *   and information_schema — no INSERT, UPDATE, DELETE, ALTER, CREATE,
 *   or DROP statements anywhere in this file.
 *
 * Run from apps/web/:
 *   npx tsx --env-file=.env.local scripts/audit/deep-diagnostic-rls-fix.ts
 */

import { PrismaClient } from '../../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Setup — identical to inspect-rls-fix-targets.ts
// ---------------------------------------------------------------------------

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Verdict tracker (module-level so all section functions can push into it)
// ---------------------------------------------------------------------------

const verdicts: string[] = [];

// ---------------------------------------------------------------------------
// Row-shape interfaces (no `any` anywhere in DB data shapes)
// ---------------------------------------------------------------------------

interface ProcRow {
  proname: string;
  prosrc: string;
  provolatile: string;
  prosecdef: boolean;
  owner: string;
}

interface TenantRefRow {
  proname: string;
  prosrc: string;
}

interface PolicyRow {
  policyname: string;
  roles: string[];
  cmd: string;
  permissive: string;
  qual: string | null;
  with_check: string | null;
}

interface RoleRow {
  rolname: string;
}

interface ColumnRow {
  column_name: string;
  data_type: string;
  udt_name: string;
  is_nullable: string;
  column_default: string | null;
}

interface FKRow {
  column_name: string;
  foreign_schema: string;
  foreign_table: string;
  foreign_column: string;
}

interface ColBasicRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
}

// ---------------------------------------------------------------------------
// Dual-output helpers
// ---------------------------------------------------------------------------

function emit(line: string, buf: string[]): void {
  console.log(line);
  buf.push(line);
}

function recordVerdict(line: string, buf: string[]): void {
  emit(line, buf);
  verdicts.push(line);
}

// ---------------------------------------------------------------------------
// Safe query wrapper — catches errors and emits NOT FOUND instead of crashing
// ---------------------------------------------------------------------------

async function safeQuery<T>(
  label: string,
  sql: string,
  buf: string[],
  ...params: unknown[]
): Promise<T[]> {
  try {
    return await prisma.$queryRawUnsafe<T[]>(sql, ...params);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    emit(`NOT FOUND: ${label} — ${msg}`, buf);
    return [];
  }
}

// ---------------------------------------------------------------------------
// SQL keywords to filter out of the function-call regex matches (Section 3)
// ---------------------------------------------------------------------------

const SQL_KEYWORDS: ReadonlySet<string> = new Set([
  'IN', 'AND', 'OR', 'NOT', 'EXISTS', 'ANY', 'ALL',
  'SELECT', 'WHERE', 'FROM', 'JOIN', 'ON', 'IS', 'NULL',
  'TRUE', 'FALSE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END',
  'COALESCE', 'CAST',
]);

// ---------------------------------------------------------------------------
// Section 1 — current_tenant_id() function definition
// ---------------------------------------------------------------------------

async function section1(buf: string[]): Promise<void> {
  emit('', buf);
  emit('## Section 1 — current_tenant_id() function definition', buf);
  emit('', buf);

  const funcSql = `
    SELECT p.proname,
           p.prosrc,
           p.provolatile::text AS provolatile,
           p.prosecdef,
           r.rolname AS owner
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'public' AND p.proname = 'current_tenant_id'
  `;
  const rows = await safeQuery<ProcRow>(
    'current_tenant_id() definition',
    funcSql,
    buf,
  );

  if (rows.length === 0) {
    emit('NOT FOUND: current_tenant_id() does not exist in public schema', buf);
    recordVerdict('**RISKY — VERIFY POLICIES**', buf);
  } else {
    const row = rows[0];
    const secLabel = row.prosecdef ? 'SECURITY DEFINER' : 'SECURITY INVOKER';
    const volLabel =
      row.provolatile === 'i' ? 'IMMUTABLE'
      : row.provolatile === 's' ? 'STABLE'
      : 'VOLATILE';

    emit('### Function: current_tenant_id()', buf);
    emit('', buf);
    emit('| Property | Value |', buf);
    emit('|---|---|', buf);
    emit(`| provolatile | ${volLabel} |`, buf);
    emit(`| prosecdef | ${row.prosecdef} (${secLabel}) |`, buf);
    emit(`| owner | ${row.owner} |`, buf);
    emit('', buf);
    emit('**Function body:**', buf);
    emit('```sql', buf);
    const bodyLines = row.prosrc.split('\n');
    const truncated = bodyLines.length > 15
      ? bodyLines.slice(0, 15).join('\n') + '\n… [truncated]'
      : row.prosrc;
    emit(truncated, buf);
    emit('```', buf);
    emit('', buf);

    if (row.prosecdef) {
      recordVerdict('**SAFE TO FORCE RLS ON TENANT**', buf);
    } else {
      recordVerdict('**RISKY — VERIFY POLICIES**', buf);
    }
  }

  emit('', buf);
  emit('### Other public-schema functions referencing tenant_id', buf);
  emit('', buf);

  const otherFuncSql = `
    SELECT p.proname, p.prosrc
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosrc ILIKE '%tenant_id%'
      AND p.proname != 'current_tenant_id'
    ORDER BY p.proname
  `;
  const otherRows = await safeQuery<TenantRefRow>(
    'tenant_id function references',
    otherFuncSql,
    buf,
  );

  if (otherRows.length === 0) {
    emit('(none found)', buf);
  } else {
    emit('| Function Name |', buf);
    emit('|---|', buf);
    for (const r of otherRows) {
      emit(`| ${r.proname} |`, buf);
    }
    emit('', buf);
    for (const r of otherRows) {
      emit(`**${r.proname} body:**`, buf);
      emit('```sql', buf);
      const lines = r.prosrc.split('\n');
      const body = lines.length > 15
        ? lines.slice(0, 15).join('\n') + '\n… [truncated]'
        : r.prosrc;
      emit(body, buf);
      emit('```', buf);
      emit('', buf);
    }
  }
}

// ---------------------------------------------------------------------------
// Section 2 — Tenant table existing policies
// ---------------------------------------------------------------------------

async function section2(buf: string[]): Promise<void> {
  emit('', buf);
  emit('## Section 2 — Tenant table existing policies', buf);
  emit('', buf);

  const policySql = `
    SELECT policyname, roles::text[] AS roles, cmd, permissive, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Tenant'
    ORDER BY policyname
  `;
  const policies = await safeQuery<PolicyRow>(
    'Tenant policies',
    policySql,
    buf,
  );

  if (policies.length === 0) {
    emit('(no policies found on Tenant)', buf);
    recordVerdict('**TENANT FORCE RLS UNSAFE — no policies on Tenant**', buf);
    return;
  }

  for (const p of policies) {
    emit(`### Policy: ${p.policyname}`, buf);
    emit('', buf);
    emit('| Property | Value |', buf);
    emit('|---|---|', buf);
    emit(`| roles | ${Array.isArray(p.roles) ? p.roles.join(', ') : String(p.roles)} |`, buf);
    emit(`| cmd | ${p.cmd} |`, buf);
    emit(`| permissive | ${p.permissive} |`, buf);
    emit('', buf);
    emit('**USING (qual):**', buf);
    emit('```sql', buf);
    emit(p.qual ?? '(none)', buf);
    emit('```', buf);
    emit('', buf);
    emit('**WITH CHECK:**', buf);
    emit('```sql', buf);
    emit(p.with_check ?? '(none)', buf);
    emit('```', buf);
    emit('', buf);
  }

  // Collect unique roles across all policies
  const allRoles = policies.flatMap((p) =>
    Array.isArray(p.roles) ? p.roles : [String(p.roles)],
  );
  const uniqueRoles = Array.from(new Set(allRoles)).filter(
    (r) => r !== '' && r !== 'public',
  );

  if (uniqueRoles.length > 0) {
    const roleSql = `SELECT rolname FROM pg_roles WHERE rolname = ANY($1)`;
    const roleRows = await safeQuery<RoleRow>(
      'pg_roles lookup',
      roleSql,
      buf,
      uniqueRoles,
    );
    emit('### Postgres roles matching policy roles', buf);
    emit('', buf);
    if (roleRows.length === 0) {
      emit('(none of the policy roles exist as Postgres roles)', buf);
    } else {
      emit('| Role Name |', buf);
      emit('|---|', buf);
      for (const r of roleRows) {
        emit(`| ${r.rolname} |`, buf);
      }
    }
    emit('', buf);
  }

  // Verdict: check if any policy text references current_tenant_id()
  const allPolicyText = policies
    .map((p) => `${p.qual ?? ''} ${p.with_check ?? ''}`)
    .join(' ')
    .toLowerCase();

  if (allPolicyText.includes('current_tenant_id()')) {
    recordVerdict('**TENANT FORCE RLS SAFE**', buf);
  } else {
    recordVerdict('**TENANT FORCE RLS UNSAFE**', buf);
  }
}

// ---------------------------------------------------------------------------
// Section 3 — Policies on Tier 4 tables
// ---------------------------------------------------------------------------

const TIER4_TABLES = [
  'carrier_documents',
  'route_template_stops',
  'stops',
  'TicketMessage',
] as const;

async function section3(buf: string[]): Promise<void> {
  emit('', buf);
  emit(
    '## Section 3 — Tier 4 table policies (carrier_documents, route_template_stops, stops, TicketMessage)',
    buf,
  );
  emit('', buf);

  for (const tableName of TIER4_TABLES) {
    emit(`### Table: ${tableName}`, buf);
    emit('', buf);

    const policySql = `
      SELECT policyname, roles::text[] AS roles, cmd, permissive, qual, with_check
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = $1
      ORDER BY policyname
    `;
    const policies = await safeQuery<PolicyRow>(
      `${tableName} policies`,
      policySql,
      buf,
      tableName,
    );

    if (policies.length === 0) {
      emit('(no policies found)', buf);
      recordVerdict(
        `**${tableName}: FORCE RLS NEEDS REVIEW — no policies on table**`,
        buf,
      );
      emit('', buf);
      continue;
    }

    for (const p of policies) {
      emit(`#### Policy: ${p.policyname}`, buf);
      emit('', buf);
      emit('| Property | Value |', buf);
      emit('|---|---|', buf);
      emit(`| roles | ${Array.isArray(p.roles) ? p.roles.join(', ') : String(p.roles)} |`, buf);
      emit(`| cmd | ${p.cmd} |`, buf);
      emit(`| permissive | ${p.permissive} |`, buf);
      emit('', buf);
      emit('**USING (qual):**', buf);
      emit('```sql', buf);
      emit(p.qual ?? '(none)', buf);
      emit('```', buf);
      emit('', buf);
      emit('**WITH CHECK:**', buf);
      emit('```sql', buf);
      emit(p.with_check ?? '(none)', buf);
      emit('```', buf);
      emit('', buf);
    }

    // Extract function calls from all qual + with_check expressions
    const combined = policies
      .map((p) => `${p.qual ?? ''} ${p.with_check ?? ''}`)
      .join(' ');

    const funcRegex = /([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
    const funcNames = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = funcRegex.exec(combined)) !== null) {
      const name = match[1];
      if (!SQL_KEYWORDS.has(name.toUpperCase())) {
        funcNames.add(name.toLowerCase());
      }
    }

    emit('**Functions called in policy expressions:**', buf);
    const funcNamesArr = Array.from(funcNames);
    if (funcNamesArr.length === 0) {
      emit('- (none)', buf);
    } else {
      for (const fn of funcNamesArr) {
        emit(`- ${fn}`, buf);
      }
    }
    emit('', buf);

    // Verdict
    const nonStandardFuncs = funcNamesArr.filter(
      (fn) => fn !== 'current_tenant_id',
    );

    if (nonStandardFuncs.length === 0) {
      recordVerdict(
        `**${tableName}: FORCE RLS LIKELY SAFE — POLICY USES STANDARD PATTERN**`,
        buf,
      );
    } else {
      recordVerdict(
        `**${tableName}: FORCE RLS NEEDS REVIEW — POLICY CALLS ${nonStandardFuncs.join(', ')}**`,
        buf,
      );
    }
    emit('', buf);
  }
}

// ---------------------------------------------------------------------------
// Section 4 — userId FK resolution for grid_preference and grid_view
// ---------------------------------------------------------------------------

const USER_ID_TABLES = ['grid_preference', 'grid_view'] as const;

async function section4(buf: string[]): Promise<void> {
  emit('', buf);
  emit('## Section 4 — userId FK resolution for grid_preference and grid_view', buf);
  emit('', buf);

  for (const tableName of USER_ID_TABLES) {
    emit(`### Table: ${tableName}`, buf);
    emit('', buf);

    // Column shape
    const colSql = `
      SELECT column_name, data_type, udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'userId'
    `;
    const colRows = await safeQuery<ColumnRow>(
      `${tableName}.userId column`,
      colSql,
      buf,
      tableName,
    );

    if (colRows.length === 0) {
      emit('userId column not found in this table.', buf);
    } else {
      const col = colRows[0];
      emit('| Property | Value |', buf);
      emit('|---|---|', buf);
      emit(`| data_type | ${col.data_type} |`, buf);
      emit(`| udt_name | ${col.udt_name} |`, buf);
      emit(`| is_nullable | ${col.is_nullable} |`, buf);
      emit(`| column_default | ${col.column_default ?? 'NULL'} |`, buf);
      emit('', buf);
    }

    // FK target
    const fkSql = `
      SELECT
        kcu.column_name,
        ccu.table_schema AS foreign_schema,
        ccu.table_name   AS foreign_table,
        ccu.column_name  AS foreign_column
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
      JOIN information_schema.constraint_column_usage ccu
        ON rc.unique_constraint_name = ccu.constraint_name
        AND rc.unique_constraint_schema = ccu.constraint_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
        AND tc.table_name = $1
        AND kcu.column_name = 'userId'
    `;
    const fkRows = await safeQuery<FKRow>(
      `${tableName}.userId FK`,
      fkSql,
      buf,
      tableName,
    );

    if (fkRows.length === 0) {
      emit(
        `\`${tableName}.userId\` references **(no FK constraint)**`,
        buf,
      );
      emit('', buf);
      recordVerdict(
        `**${tableName}: MANUAL VERIFICATION NEEDED — userId has no FK**`,
        buf,
      );
    } else {
      const fk = fkRows[0];
      emit(
        `\`${tableName}.userId\` references \`${fk.foreign_schema}.${fk.foreign_table}.${fk.foreign_column}\``,
        buf,
      );
      emit('', buf);
      if (
        fk.foreign_schema === 'auth' &&
        fk.foreign_table === 'users' &&
        fk.foreign_column === 'id'
      ) {
        recordVerdict(`**${tableName}: AUTH.UID() POLICY WILL WORK**`, buf);
      } else {
        recordVerdict(
          `**${tableName}: AUTH.UID() POLICY WILL FAIL — userId references ${fk.foreign_schema}.${fk.foreign_table}.${fk.foreign_column}**`,
          buf,
        );
      }
    }
    emit('', buf);
  }
}

// ---------------------------------------------------------------------------
// Section 5 — NotificationEmailConfig column inventory
// ---------------------------------------------------------------------------

const FLAG_TOKENS = [
  'tenant',
  'org',
  'user',
  'owner',
  'account',
  'company',
  'customer',
] as const;

async function section5(buf: string[]): Promise<void> {
  emit('', buf);
  emit('## Section 5 — NotificationEmailConfig column inventory', buf);
  emit('', buf);

  const colSql = `
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'NotificationEmailConfig'
    ORDER BY ordinal_position
  `;
  const rows = await safeQuery<ColBasicRow>(
    'NotificationEmailConfig columns',
    colSql,
    buf,
  );

  if (rows.length === 0) {
    emit('NOT FOUND — NotificationEmailConfig table missing', buf);
    recordVerdict('**NOT FOUND — NotificationEmailConfig table missing**', buf);
    return;
  }

  emit('| Name | Data Type | Nullable | Default | Flagged |', buf);
  emit('|---|---|---|---|---|', buf);

  const flaggedCols: string[] = [];

  for (const row of rows) {
    const lower = row.column_name.toLowerCase();
    const matchedTokens = FLAG_TOKENS.filter((token) => lower.includes(token));
    let flaggedCell: string;
    if (matchedTokens.length > 0) {
      flaggedCols.push(row.column_name);
      flaggedCell = `YES (matches: ${matchedTokens.join(', ')})`;
    } else {
      flaggedCell = '-';
    }
    const defaultVal = row.column_default !== null ? row.column_default : 'NULL';
    emit(
      `| ${row.column_name} | ${row.data_type} | ${row.is_nullable} | ${defaultVal} | ${flaggedCell} |`,
      buf,
    );
  }

  emit('', buf);

  if (flaggedCols.length === 0) {
    recordVerdict('**SAFE TO TREAT AS GLOBAL_LOOKUP**', buf);
  } else {
    recordVerdict(
      `**RECLASSIFY — FLAGGED COLUMNS: ${flaggedCols.join(', ')}**`,
      buf,
    );
  }
}

// ---------------------------------------------------------------------------
// GO / NO-GO SUMMARY
// ---------------------------------------------------------------------------

const SAFE_PATTERNS: ReadonlyArray<string> = [
  'SAFE TO FORCE RLS ON TENANT',
  'TENANT FORCE RLS SAFE',
  'FORCE RLS LIKELY SAFE',
  'AUTH.UID() POLICY WILL WORK',
  'SAFE TO TREAT AS GLOBAL_LOOKUP',
];

const BAD_PATTERNS: ReadonlyArray<string> = [
  'UNSAFE',
  'RISKY',
  'WILL FAIL',
  'NEEDS REVIEW',
  'RECLASSIFY',
  'MANUAL VERIFICATION',
  'NOT FOUND',
];

async function summary(buf: string[]): Promise<void> {
  emit('', buf);
  emit('## GO / NO-GO SUMMARY', buf);
  emit('', buf);

  for (let i = 0; i < verdicts.length; i++) {
    emit(`${i + 1}. ${verdicts[i]}`, buf);
  }

  emit('', buf);

  const hasAllSafe = verdicts.every((v) =>
    SAFE_PATTERNS.some((p) => v.toUpperCase().includes(p)),
  );
  const hasBadVerdict = verdicts.some((v) =>
    BAD_PATTERNS.some((p) => v.toUpperCase().includes(p)),
  );

  if (hasAllSafe && !hasBadVerdict && verdicts.length > 0) {
    emit(
      '**FINAL RECOMMENDATION: GO — proceed with advisor fix migration as designed**',
      buf,
    );
  } else {
    emit(
      '**FINAL RECOMMENDATION: NO-GO — address flagged items before writing migration**',
      buf,
    );
    emit('', buf);
    emit('Items requiring attention:', buf);
    const flaggedVerdicts = verdicts.filter((v) =>
      BAD_PATTERNS.some((p) => v.toUpperCase().includes(p)),
    );
    for (const v of flaggedVerdicts) {
      emit(`- ${v}`, buf);
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const buf: string[] = [];

  emit('# Deep Diagnostic — RLS Fix Migration Prerequisites', buf);
  emit(`Generated: ${new Date().toISOString()}`, buf);
  emit('', buf);

  await section1(buf);
  await section2(buf);
  await section3(buf);
  await section4(buf);
  await section5(buf);
  await summary(buf);

  const outPath = path.join(__dirname, '405c-DEEP-DIAGNOSTIC.md');
  fs.writeFileSync(outPath, buf.join('\n') + '\n', 'utf8');
  emit('', buf);
  console.log(`Wrote markdown report to: ${outPath}`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
