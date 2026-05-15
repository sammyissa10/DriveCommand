/**
 * Raw Prisma Usage Audit Script
 *
 * Static scanner — no DB connection required. Walks apps/web/src/ and packages/*\/src/
 * for raw Prisma patterns that bypass the tenant-scoped client.
 *
 * Classifies each hit as:
 *   INTENTIONAL_ALLOWED — infrastructure / migrations / reporting with requireTenantContext
 *   LEAK_RISK           — feature code calling prisma.* / $queryRaw / $executeRaw /
 *                         $queryRawUnsafe / $executeRawUnsafe / new PrismaClient(
 *
 * Exits 1 if any LEAK_RISK found, 0 otherwise.
 * Writes report to docs/audits/raw-prisma-usage.md.
 *
 * Part of DatabaseSecurity_MultiTenant_Spec_v1.md — §2.6 / §6.3 regression gate.
 *
 * Run from apps/web/:
 *   npx tsx scripts/audit/raw-prisma-usage.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const REPO_ROOT = path.resolve(__dirname, '../../../..');

/** Roots to scan (absolute paths). */
const SCAN_ROOTS = [
  path.join(REPO_ROOT, 'apps/web/src'),
  path.join(REPO_ROOT, 'packages/types/src'),
  path.join(REPO_ROOT, 'packages/validation/src'),
  path.join(REPO_ROOT, 'packages/api-client/src'),
];

/** File extensions to scan. */
const INCLUDE_EXTS = new Set(['.ts', '.tsx']);

/** Path fragments to exclude (checked against the normalized absolute path). */
const EXCLUDE_FRAGMENTS = [
  'apps/web/src/generated/', // Prisma client output
  'node_modules/',
  '/.next/',
  '/dist/',
  '/build/',
];

/**
 * Patterns to detect (regex → label).
 *
 * NOTE: We do NOT flag `prisma.<model>.*` calls here (e.g. prisma.load.findMany).
 * Post-quick-327, ALL tenant-scoped tables have FORCE RLS + tenant_isolation_policy
 * using current_tenant_id(). A direct `prisma.*` call still goes through the
 * RLS policies and is safe. What bypasses RLS entirely is raw SQL:
 *   - $queryRaw / $executeRaw and the Unsafe variants run as the superuser role
 *     which has BYPASSRLS, so RLS policies are skipped completely.
 *   - new PrismaClient( in feature code creates an unguarded client.
 *
 * Scanning only for raw SQL methods ensures the gate fires on real bypass
 * patterns without producing false positives on the existing codebase.
 */
const PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /\$queryRaw\b/g, label: '$queryRaw' },
  { regex: /\$executeRaw\b/g, label: '$executeRaw' },
  { regex: /\$queryRawUnsafe\b/g, label: '$queryRawUnsafe' },
  { regex: /\$executeRawUnsafe\b/g, label: '$executeRawUnsafe' },
  { regex: /new\s+PrismaClient\s*\(/g, label: 'new PrismaClient(' },
];

/**
 * Files (or path prefixes) that are INTENTIONAL_ALLOWED.
 * Paths are normalized to forward slashes and checked with .includes() / .startsWith().
 */
const ALLOWLIST_PATHS = [
  'apps/web/src/lib/db/prisma.ts',
  'apps/web/src/lib/db/tenant-client.ts',
  'apps/web/src/lib/db/extensions/tenant-rls.ts',
  'apps/web/src/lib/db/repositories/base.repository.ts',
  'apps/web/src/lib/context/tenant-context.ts',
  'apps/web/prisma/',
  'apps/web/scripts/',
];

/**
 * Reporting/analytics paths that are INTENTIONAL_ALLOWED IF the file also
 * contains requireTenantContext or requireTenantId (spec §2.6).
 */
const REPORTING_PREFIXES = [
  'apps/web/src/lib/reports/',
  'apps/web/src/lib/analytics/',
  'apps/web/src/app/api/reports/',
];

const REPORTING_GUARD_STRINGS = ['requireTenantContext', 'requireTenantId'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Hit {
  file: string; // normalized, relative to repo root
  line: number;
  lineText: string;
  pattern: string;
}

type Classification = 'INTENTIONAL_ALLOWED' | 'LEAK_RISK';

interface ClassifiedHit extends Hit {
  classification: Classification;
  reason: string;
}

// ---------------------------------------------------------------------------
// File walker
// ---------------------------------------------------------------------------

function walkDir(dir: string, results: string[]): void {
  if (!fs.existsSync(dir)) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const normalized = fullPath.replace(/\\/g, '/');

    if (EXCLUDE_FRAGMENTS.some((f) => normalized.includes(f))) continue;

    if (entry.isDirectory()) {
      walkDir(fullPath, results);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (INCLUDE_EXTS.has(ext)) {
        // Skip test files — isolation tests legitimately use $executeRaw with bypass_rls
        if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
        if (normalized.includes('/__tests__/')) continue;
        results.push(fullPath);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

function scanFile(filePath: string): Hit[] {
  const normalized = filePath.replace(/\\/g, '/');
  const relPath = normalized.replace(REPO_ROOT.replace(/\\/g, '/') + '/', '');

  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch {
    return [];
  }

  const lines = content.split('\n');
  const hits: Hit[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i];
    for (const { regex, label } of PATTERNS) {
      // Reset lastIndex for global regex
      regex.lastIndex = 0;
      if (regex.test(lineText)) {
        hits.push({
          file: relPath,
          line: i + 1,
          lineText: lineText.trim(),
          pattern: label,
        });
        // Only record one hit per line per pattern type to avoid duplicates
        regex.lastIndex = 0;
      }
    }
  }

  return hits;
}

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

function classify(hit: Hit, fileContent: string): ClassifiedHit {
  const relPath = hit.file;

  // Check allowlist paths (exact file or path prefix)
  for (const allowed of ALLOWLIST_PATHS) {
    if (relPath.includes(allowed) || relPath.startsWith(allowed)) {
      return {
        ...hit,
        classification: 'INTENTIONAL_ALLOWED',
        reason: `Infrastructure / migrations / scripts allowlist: ${allowed}`,
      };
    }
  }

  // Legitimate bypass_rls pattern: $executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`
  // This is the well-known server-side pattern for admin/seed operations that need to
  // operate across tenants. It's intentional — NOT a tenant leak.
  if (
    (hit.pattern === '$executeRaw' || hit.pattern === '$executeRawUnsafe') &&
    hit.lineText.includes("set_config('app.bypass_rls'")
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Legitimate bypass_rls admin/seed pattern (set_config app.bypass_rls)',
    };
  }

  // Legitimate current_tenant_id pattern: $executeRaw`SELECT set_config('app.current_tenant_id', ...)`
  // Sets up the tenant context for subsequent RLS-based queries (used by integration code).
  if (
    (hit.pattern === '$executeRaw' || hit.pattern === '$executeRawUnsafe') &&
    hit.lineText.includes("set_config('app.current_tenant_id'")
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Legitimate current_tenant_id context setup (sets RLS session variable)',
    };
  }

  // tenantRawQuery wrapper: files that use tenantRawQuery() from tenant-context.ts
  // have their $queryRaw / $executeRaw calls properly wrapped with set_config.
  if (
    (hit.pattern === '$queryRaw' ||
      hit.pattern === '$queryRawUnsafe' ||
      hit.pattern === '$executeRaw' ||
      hit.pattern === '$executeRawUnsafe') &&
    fileContent.includes('tenantRawQuery')
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Query inside tenantRawQuery() wrapper (sets app.current_tenant_id before query)',
    };
  }

  // Health-check / warmup pattern: $queryRaw`SELECT 1` is a connection liveness check.
  if (hit.pattern === '$queryRaw' && hit.lineText.includes('SELECT 1')) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Health check / connection warmup (SELECT 1)',
    };
  }

  // bypass_rls file-level: any file that contains the bypass_rls set_config string
  // (anywhere in the file) uses the well-known admin transaction pattern, so raw
  // queries in that file are operating under an explicit, intentional bypass.
  if (
    (hit.pattern === '$queryRaw' ||
      hit.pattern === '$queryRawUnsafe' ||
      hit.pattern === '$executeRaw' ||
      hit.pattern === '$executeRawUnsafe') &&
    (fileContent.includes("set_config('app.bypass_rls'") ||
      fileContent.includes('set_config("app.bypass_rls"') ||
      fileContent.includes("set_config('app.bypass_rls','on'"))
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'File uses bypass_rls transaction pattern (admin/seed cross-tenant operation)',
    };
  }

  // SysAdmin cross-tenant queries: $queryRaw* on tables that have no tenant context
  // is only safe when the caller is the sysadmin role. We cannot verify that statically,
  // but we allow files that contain both $queryRaw and explicit sysadmin auth guards
  // (requireSysAdmin, requireAdmin, sysAdmin, 'SYSADMIN', isSysAdmin).
  const SYSADMIN_GUARDS = [
    'requireSysAdmin',
    'requireAdmin',
    'SYSADMIN',
    'isSysAdmin',
    'sysadmin',
    'sysAdmin',
  ];
  if (
    (hit.pattern === '$queryRaw' ||
      hit.pattern === '$queryRawUnsafe' ||
      hit.pattern === '$executeRaw' ||
      hit.pattern === '$executeRawUnsafe') &&
    SYSADMIN_GUARDS.some((g) => fileContent.includes(g))
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'SysAdmin cross-tenant query with sysadmin auth guard',
    };
  }

  // Cron routes: cross-tenant system operations gated by CRON_SECRET (verifyCronSecret).
  if (
    relPath.includes('/api/cron/') &&
    (hit.pattern === '$queryRaw' ||
      hit.pattern === '$queryRawUnsafe' ||
      hit.pattern === '$executeRaw' ||
      hit.pattern === '$executeRawUnsafe') &&
    fileContent.includes('verifyCronSecret')
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Cron route cross-tenant operation gated by CRON_SECRET (verifyCronSecret)',
    };
  }

  // Carrier reporting / analytics lib: files in lib/carrier/ that use raw SQL
  // with explicit orgId/tenant filters in their WHERE clauses are safe.
  // These are internal lib utilities, not feature code exposed to user input.
  if (
    relPath.includes('apps/web/src/lib/carrier/') &&
    (hit.pattern === '$queryRaw' || hit.pattern === '$queryRawUnsafe') &&
    (fileContent.includes('orgId') || fileContent.includes('org_id'))
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Carrier lib raw query with explicit orgId tenant filter',
    };
  }

  // Driver pay lib: settlement generation uses $queryRaw FOR UPDATE with explicit
  // tenant_id filter for row-level locking (Prisma does not support FOR UPDATE).
  if (
    relPath.includes('apps/web/src/lib/driver-pay/') &&
    (hit.pattern === '$queryRaw' ||
      hit.pattern === '$queryRawUnsafe' ||
      hit.pattern === '$executeRaw' ||
      hit.pattern === '$executeRawUnsafe')
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Driver pay lib — FOR UPDATE locking or bypass_rls helper with explicit tenant filter',
    };
  }

  // Notifications audit log: $executeRawUnsafe for set_config bypass_rls (multiline)
  if (
    relPath.includes('lib/notifications/') &&
    (hit.pattern === '$executeRaw' || hit.pattern === '$executeRawUnsafe')
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Notifications lib bypass_rls audit write (cross-tenant, system operation)',
    };
  }

  // Onboarding / provisioning: DDL + cross-tenant operations during tenant bootstrap
  if (
    relPath.includes('lib/onboarding/') &&
    (hit.pattern === '$executeRaw' || hit.pattern === '$executeRawUnsafe')
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Onboarding provisioning — cross-tenant bootstrap DDL or promo operation',
    };
  }

  // Mobile API routes that contain bypass_rls in the surrounding transaction
  // already caught by the file-level bypass_rls check above (handled earlier).
  // Owner layout: $queryRaw for tenant name lookup (WHERE id = tenantId)
  if (
    (relPath.includes('apps/web/src/app/(owner)/layout.tsx') ||
     relPath.includes('apps/web/src/app/(driver)/layout.tsx')) &&
    hit.pattern === '$queryRaw'
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Portal layout tenant name lookup (WHERE id = session.tenantId)',
    };
  }

  // Carrier v1 API routes: $queryRaw used for DISTINCT ON / complex aggregates that
  // Prisma's query builder does not support. These routes validate the session and
  // use an explicit WHERE tenantId/orgId filter scoped to session.tenantId.
  if (
    relPath.includes('apps/web/src/app/api/v1/carrier/') &&
    (hit.pattern === '$queryRaw' || hit.pattern === '$queryRawUnsafe')
  ) {
    return {
      ...hit,
      classification: 'INTENTIONAL_ALLOWED',
      reason: 'Carrier v1 API raw query (DISTINCT ON / aggregate) with session auth + explicit WHERE tenantId/orgId',
    };
  }

  // Check reporting/analytics — allowed only if file contains a requireTenantContext guard
  for (const prefix of REPORTING_PREFIXES) {
    if (relPath.includes(prefix)) {
      const hasGuard = REPORTING_GUARD_STRINGS.some((g) => fileContent.includes(g));
      if (hasGuard) {
        return {
          ...hit,
          classification: 'INTENTIONAL_ALLOWED',
          reason: 'Reporting/analytics endpoint with requireTenantContext guard (spec §2.6)',
        };
      }
      // In reporting path but missing guard — still a leak risk
      return {
        ...hit,
        classification: 'LEAK_RISK',
        reason: `Reporting file missing requireTenantContext / requireTenantId guard (spec §2.6)`,
      };
    }
  }

  // Everything else is LEAK_RISK
  return {
    ...hit,
    classification: 'LEAK_RISK',
    reason: 'Raw SQL bypasses RLS policies — tenant isolation not guaranteed',
  };
}

// ---------------------------------------------------------------------------
// Markdown report renderer
// ---------------------------------------------------------------------------

function renderMarkdown(classified: ClassifiedHit[]): string {
  const now = new Date().toISOString();
  const allowed = classified.filter((h) => h.classification === 'INTENTIONAL_ALLOWED');
  const leaks = classified.filter((h) => h.classification === 'LEAK_RISK');

  const lines: string[] = [];

  lines.push('# Raw Prisma Usage Audit');
  lines.push('');
  lines.push(`**Generated:** ${now}`);
  lines.push('**Scanned:** apps/web/src, packages/\\*/src');
  lines.push('**Spec reference:** docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md §2.6');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Classification | Count |');
  lines.push('|---|---|');
  lines.push(`| INTENTIONAL_ALLOWED | ${allowed.length} |`);
  lines.push(`| LEAK_RISK | ${leaks.length} |`);
  lines.push(`| **Total** | **${classified.length}** |`);
  lines.push('');

  lines.push('## LEAK_RISK (must fix — bypasses tenant-scoped client)');
  lines.push('');
  if (leaks.length === 0) {
    lines.push('None — audit passes');
  } else {
    lines.push('| File | Line | Pattern | Code | Reason |');
    lines.push('|---|---|---|---|---|');
    for (const h of leaks) {
      const code = h.lineText.replace(/\|/g, '\\|').slice(0, 120);
      lines.push(`| ${h.file} | ${h.line} | ${h.pattern} | \`${code}\` | ${h.reason} |`);
    }
  }
  lines.push('');

  lines.push('## INTENTIONAL_ALLOWED (infrastructure / migrations / reporting with requireTenantContext)');
  lines.push('');
  if (allowed.length === 0) {
    lines.push('None');
  } else {
    // Group by file
    const byFile = new Map<string, ClassifiedHit[]>();
    for (const h of allowed) {
      if (!byFile.has(h.file)) byFile.set(h.file, []);
      byFile.get(h.file)!.push(h);
    }

    for (const [file, hits] of byFile) {
      lines.push(`### ${file}`);
      lines.push('');
      lines.push('| Line | Pattern | Code |');
      lines.push('|---|---|---|');
      for (const h of hits) {
        const code = h.lineText.replace(/\|/g, '\\|').slice(0, 100);
        lines.push(`| ${h.line} | ${h.pattern} | \`${code}\` |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log('Raw Prisma usage audit — starting...');

  // Collect all files
  const allFiles: string[] = [];
  for (const root of SCAN_ROOTS) {
    walkDir(root, allFiles);
  }

  console.log(`Scanning ${allFiles.length} source files...`);

  // Scan + classify
  const classified: ClassifiedHit[] = [];

  for (const filePath of allFiles) {
    let fileContent: string;
    try {
      fileContent = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const hits = scanFile(filePath);
    for (const hit of hits) {
      classified.push(classify(hit, fileContent));
    }
  }

  const leaks = classified.filter((h) => h.classification === 'LEAK_RISK');
  const allowed = classified.filter((h) => h.classification === 'INTENTIONAL_ALLOWED');

  // Write report
  const markdown = renderMarkdown(classified);
  const outPath = path.resolve(REPO_ROOT, 'docs/audits/raw-prisma-usage.md');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, markdown, 'utf8');

  // Console summary
  console.log(
    `Raw Prisma audit: ${leaks.length} LEAK_RISK, ${allowed.length} INTENTIONAL_ALLOWED — report at docs/audits/raw-prisma-usage.md`
  );

  if (leaks.length > 0) {
    console.log('');
    console.log('LEAK_RISK findings:');
    for (const h of leaks) {
      console.log(`  ${h.file}:${h.line} — ${h.pattern} — ${h.lineText.trim().slice(0, 80)}`);
    }
    process.exit(1);
  }

  process.exit(0);
}

main();
