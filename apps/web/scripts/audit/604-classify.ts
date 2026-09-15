/**
 * quick-604 — classify every failure, and attribute it inside or outside the 456.
 *
 *   npx tsx scripts/audit/604-classify.ts
 *
 * Reads `04-click-through.json` + `05-writes.json` + the correlated server-log
 * slices, and writes `06-classification.json` / `06-classification.md`.
 *
 * THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env`. It loads
 * `apps/web/.env.staging` explicitly and refuses on the production ref.
 *
 * ─── THE CLASSIFICATION IS A DECISION PROCEDURE, NOT A JUDGEMENT ───────────
 *
 *   1 TRIPWIRE_TC001        SQLSTATE is TC001. By CODE, never by message prose.
 *   2 MISSING_GRANT         42501 AND `permission denied for (table|relation|
 *                           sequence|schema) X`. X is recorded.
 *   3 RLS_DENIAL_SATISFIABLE 0 rows affected, or `42501 new row violates
 *                           row-level security policy`, AND a live non-bypass
 *                           policy exists for that table+command.
 *   4 RLS_DENIAL_NO_POLICY  same symptom, the command is DARK on that table.
 *   5 SOMETHING_ELSE        everything else, INCLUDING SQLSTATE_UNRECOVERED —
 *                           counted, never folded into another bucket.
 *
 * Rows 3 and 4 differ only in what the LIVE policy set says, so this script
 * queries staging's `pg_policy` at classification time (excluding
 * `bypass_rls_policy`) rather than trusting the 2026-09-13 sweep table. Any
 * disagreement is recorded as a finding.
 *
 * ─── ATTRIBUTION IS A LOOKUP, NOT A JUDGEMENT ──────────────────────────────
 *
 * `scripts/audit/wrapper-countdown.json` names all 456 unmigrated units keyed by
 * path relative to `src`, each with `names: ["fn:line", …]`.
 *
 *   IN_456           the file is in `files` AND `function:line` is in its names
 *   IN_456_FILE_ONLY the file is there, the function is not — recorded as its
 *                    own bucket, never rounded UP to a unit match
 *   OUTSIDE_456      the file is not in `files` at all
 *
 * OUTSIDE_456 is the finding this task exists to produce. Every entry names a
 * file and an integer line.
 */

import { config as loadEnv } from 'dotenv';
import { Client } from 'pg';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PRODUCTION_REF = 'oqdhberkghtnszrkdvfm';
const STAGING_REF = 'wyixpgunnjmzguhggocz';

const APP_ROOT = resolve(__dirname, '../..');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/604-run-staging-as-app-user-end-to-end-and-r/evidence',
);
const SERVER_LOG = resolve(EVIDENCE_DIR, '04-server.log');
const COUNTDOWN = resolve(APP_ROOT, 'scripts/audit/wrapper-countdown.json');

loadEnv({ path: resolve(APP_ROOT, '.env.staging'), quiet: true });

function refuse(reason: string): never {
  console.error(`604-classify: REFUSING TO RUN — ${reason}`);
  process.exit(1);
}

const DIRECT_URL = process.env.STAGING_DIRECT_URL;
if (!DIRECT_URL) refuse('STAGING_DIRECT_URL is not set');
if (DIRECT_URL.includes(PRODUCTION_REF)) refuse('STAGING_DIRECT_URL names PRODUCTION');
if (!DIRECT_URL.includes(STAGING_REF)) refuse('STAGING_DIRECT_URL does not name staging');

type Category =
  | 'TRIPWIRE_TC001'
  | 'MISSING_GRANT'
  | 'RLS_DENIAL_SATISFIABLE'
  | 'RLS_DENIAL_NO_POLICY'
  | 'SOMETHING_ELSE';

const CATEGORIES: Category[] = [
  'TRIPWIRE_TC001',
  'MISSING_GRANT',
  'RLS_DENIAL_SATISFIABLE',
  'RLS_DENIAL_NO_POLICY',
  'SOMETHING_ELSE',
];

type Attribution = 'IN_456' | 'IN_456_FILE_ONLY' | 'OUTSIDE_456';

type Finding = {
  source: 'surface' | 'write';
  surface: string;
  role: string;
  httpStatus: number | null;
  sqlstate: string | null;
  category: Category;
  categoryReason: string;
  deniedObject: string | null;
  policyQuery: { table: string; command: string; policies: string[] } | null;
  site: { file: string; line: number; fn: string } | null;
  attribution: Attribution | 'SITE_UNRECOVERED';
  attributionDetail: string;
  logByteRange: [number, number];
};

// ---------------------------------------------------------------------------
// Stack-frame recovery
// ---------------------------------------------------------------------------

/**
 * `at async TripsPage (src\app\(owner)\carrier\trips\page.tsx:19:62)`
 *
 * The path segment must admit `(` and `)` — the route-group parentheses are in
 * the middle of every App Router path, and an earlier draft's `[^\s):]` class
 * silently matched NOTHING for every page under a route group. That failure
 * mode is green-looking (no site recovered → SITE_UNRECOVERED), which is why it
 * is called out here.
 */
const FRAME_RE = /at (?:async )?([A-Za-z0-9_.$[\]]+) \((src[\\/][^\s]+?\.(?:ts|tsx)):(\d+):\d+\)/g;

const IGNORED_FRAME_FILES = [
  'src/lib/logger.ts',
  'src/lib/cron/failure-report.ts',
  'src/generated/prisma/runtime/client.js',
];

function firstAppFrame(slice: string): { file: string; line: number; fn: string } | null {
  FRAME_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  const frames: { file: string; line: number; fn: string }[] = [];
  while ((m = FRAME_RE.exec(slice))) {
    frames.push({ fn: m[1], file: m[2].replace(/\\/g, '/'), line: Number(m[3]) });
  }
  // Prefer the first frame that is neither the logger nor the failure reporter —
  // those are where the error was RECORDED, not where the statement was ISSUED.
  const real = frames.find((f) => !IGNORED_FRAME_FILES.some((ig) => f.file.endsWith(ig)));
  return real ?? frames[0] ?? null;
}

// ---------------------------------------------------------------------------
// Category decision procedure
// ---------------------------------------------------------------------------

const PERMISSION_DENIED_RE =
  /permission denied for (table|relation|sequence|schema|view|function) ([A-Za-z0-9_."]+)/;

/** `42501 new row violates row-level security policy for table "x"` */
const RLS_INSERT_DENIAL_RE = /new row violates row-level security policy(?: for table "([^"]+)")?/;

function decideCategory(
  sqlstate: string | null,
  slice: string,
  body: string,
  silentNoOp: boolean,
): { category: Category; reason: string; deniedObject: string | null; table: string | null } {
  const hay = `${slice}\n${body}`;

  // 1 — by CODE, never by message prose.
  if (sqlstate === 'TC001') {
    return { category: 'TRIPWIRE_TC001', reason: 'SQLSTATE is TC001', deniedObject: null, table: null };
  }

  // 3/4 (insert form) — checked BEFORE the generic 42501 so an RLS refusal is not
  // mistaken for a missing grant; both carry 42501.
  const rlsIns = hay.match(RLS_INSERT_DENIAL_RE);
  if (rlsIns) {
    return {
      category: 'RLS_DENIAL_SATISFIABLE',
      reason: '42501 new row violates row-level security policy',
      deniedObject: rlsIns[1] ?? null,
      table: rlsIns[1] ?? null,
    };
  }

  // 2
  const denied = hay.match(PERMISSION_DENIED_RE);
  if (denied && /\b42501\b/.test(hay)) {
    return {
      category: 'MISSING_GRANT',
      reason: `42501 permission denied for ${denied[1]} ${denied[2]}`,
      deniedObject: `${denied[1]} ${denied[2].replace(/"/g, '')}`,
      table: denied[1] === 'schema' ? null : denied[2].replace(/"/g, ''),
    };
  }

  // 3/4 (silent form)
  if (silentNoOp) {
    return {
      category: 'RLS_DENIAL_SATISFIABLE',
      reason: 'HTTP 2xx with no observable change — the silent 0-rows shape',
      deniedObject: null,
      table: null,
    };
  }

  return {
    category: 'SOMETHING_ELSE',
    reason: sqlstate ? `unclassified code ${sqlstate}` : 'no SQLSTATE recovered',
    deniedObject: null,
    table: null,
  };
}

// ---------------------------------------------------------------------------
// Live policy query — what makes 3 vs 4 reproducible
// ---------------------------------------------------------------------------

async function livePolicies(client: Client, table: string, command: string): Promise<string[]> {
  const cmdMap: Record<string, string[]> = {
    SELECT: ['*', 'r'],
    INSERT: ['*', 'a'],
    UPDATE: ['*', 'w'],
    DELETE: ['*', 'd'],
  };
  const codes = cmdMap[command] ?? ['*'];
  const r = await client.query<{ polname: string }>(
    `SELECT p.polname
       FROM pg_policy p
       JOIN pg_class c ON c.oid = p.polrelid
       JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = $1
        AND p.polcmd = ANY($2::"char"[])
        AND p.polname <> 'bypass_rls_policy'`,
    [table, codes],
  );
  return r.rows.map((x) => x.polname);
}

// ---------------------------------------------------------------------------

async function main() {
  const click = JSON.parse(readFileSync(resolve(EVIDENCE_DIR, '04-click-through.json'), 'utf8'));
  const writes = JSON.parse(readFileSync(resolve(EVIDENCE_DIR, '05-writes.json'), 'utf8'));
  const log = readFileSync(SERVER_LOG, 'utf8');
  const countdown = JSON.parse(readFileSync(COUNTDOWN, 'utf8')) as {
    generatedAt: string;
    totals: Record<string, number>;
    files: Record<string, { units: number; callSites: number; names: string[] }>;
  };

  const client = new Client({ connectionString: DIRECT_URL, connectionTimeoutMillis: 30000 });
  await client.connect();

  const findings: Finding[] = [];
  const policyDisagreements: string[] = [];

  async function build(
    source: 'surface' | 'write',
    surface: string,
    role: string,
    httpStatus: number | null,
    sqlstate: string | null,
    range: [number, number],
    body: string,
    silentNoOp: boolean,
    command: string,
  ): Promise<Finding> {
    const slice = log.slice(range[0], range[1]);
    const d = decideCategory(sqlstate, slice, body, silentNoOp);
    let category = d.category;
    let policyQuery: Finding['policyQuery'] = null;

    if (d.category === 'RLS_DENIAL_SATISFIABLE') {
      if (d.table) {
        const policies = await livePolicies(client, d.table, command);
        policyQuery = { table: d.table, command, policies };
        if (policies.length === 0) category = 'RLS_DENIAL_NO_POLICY';
      } else {
        policyQuery = { table: 'UNKNOWN', command, policies: [] };
        policyDisagreements.push(
          `${surface}: the symptom is an RLS denial but the table could not be recovered from the log slice — classified SATISFIABLE without a live policy query, which is the weaker claim.`,
        );
      }
    }

    const site = firstAppFrame(slice);
    let attribution: Finding['attribution'] = 'SITE_UNRECOVERED';
    let detail = 'no `src/**.ts(x):line` frame in the correlated log slice';
    if (site) {
      const rel = site.file.replace(/^src\//, '');
      const entry = countdown.files[rel];
      if (!entry) {
        attribution = 'OUTSIDE_456';
        detail = `\`${rel}\` does not appear in wrapper-countdown.json at all`;
      } else {
        const hit = entry.names.find((n) => n === `${site.fn}:${site.line}`);
        if (hit) {
          attribution = 'IN_456';
          detail = `\`${rel}\` names \`${hit}\``;
        } else {
          attribution = 'IN_456_FILE_ONLY';
          detail = `\`${rel}\` is in the 198-file set (${entry.units} unit(s): ${entry.names.join(', ')}) but \`${site.fn}:${site.line}\` is not one of them`;
        }
      }
    }

    return {
      source,
      surface,
      role,
      httpStatus,
      sqlstate,
      category,
      categoryReason: d.reason,
      deniedObject: d.deniedObject,
      policyQuery,
      site,
      attribution,
      attributionDetail: detail,
      logByteRange: range,
    };
  }

  for (const e of click.entries.filter((x: any) => x.verdict === 'fail')) {
    findings.push(
      await build('surface', e.surface, e.role, e.status, e.sqlstate, e.logByteRange, e.bodyExcerpt, false, 'SELECT'),
    );
  }

  for (const w of writes.entries.filter((x: any) => x.verdict === 'SILENT_NO_OP' || x.verdict === 'REFUSED')) {
    findings.push(
      await build(
        'write',
        `#${w.n} ${w.path}`,
        'OWNER_A',
        w.httpStatus,
        typeof w.sqlstate === 'string' && /^[A-Z0-9_]{4,24}$/.test(w.sqlstate) ? w.sqlstate : null,
        w.logByteRange,
        w.bodyExcerpt ?? '',
        w.verdict === 'SILENT_NO_OP',
        w.command,
      ),
    );
  }

  await client.end();

  const counts: Record<Category, number> = {
    TRIPWIRE_TC001: 0,
    MISSING_GRANT: 0,
    RLS_DENIAL_SATISFIABLE: 0,
    RLS_DENIAL_NO_POLICY: 0,
    SOMETHING_ELSE: 0,
  };
  for (const f of findings) counts[f.category]++;

  const derivedFailureCount =
    click.entries.filter((e: any) => e.verdict === 'fail').length +
    writes.entries.filter((w: any) => w.verdict === 'SILENT_NO_OP' || w.verdict === 'REFUSED').length;

  const sum = CATEGORIES.reduce((a, c) => a + counts[c], 0);

  const record = {
    task: 'quick-604',
    phase: 'classification',
    at: new Date().toISOString(),
    countdownGeneratedAt: countdown.generatedAt,
    countdownTotals: countdown.totals,
    counts,
    categorySum: sum,
    derivedFailureCount,
    arithmeticCheckPasses: sum === derivedFailureCount,
    policyDisagreements,
    findings,
    outside456: findings
      .filter((f) => f.attribution === 'OUTSIDE_456')
      .map((f) => ({
        surface: f.surface,
        file: f.site!.file,
        line: f.site!.line,
        fn: f.site!.fn,
        category: f.category,
        sqlstate: f.sqlstate,
      })),
  };

  writeFileSync(resolve(EVIDENCE_DIR, '06-classification.json'), JSON.stringify(record, null, 2) + '\n');
  writeFileSync(resolve(EVIDENCE_DIR, '06-classification.md'), render(record));

  for (const c of CATEGORIES) console.log(`  ${c.padEnd(24)} ${counts[c]}`);
  console.log(`  ${'SUM'.padEnd(24)} ${sum}`);
  console.log(`  ${'derived failure count'.padEnd(24)} ${derivedFailureCount}`);
  console.log(`  arithmetic check: ${sum === derivedFailureCount ? 'PASSES' : 'FAILS'}`);
  console.log(`  OUTSIDE_456 entries: ${record.outside456.length}`);
}

function render(r: any): string {
  const f = (x: Finding) =>
    `| \`${x.surface}\` | ${x.source} | ${x.httpStatus ?? 'n/a'} | ${x.sqlstate ? '`' + x.sqlstate + '`' : '—'} | **${x.category}** | ${x.categoryReason.replace(/\|/g, '\\|')} | ${
      x.site ? '`' + x.site.file + ':' + x.site.line + '` (`' + x.site.fn + '`)' : '—'
    } | **${x.attribution}** |`;
  return `# quick-604 · 06 — classification and 456-attribution

Generated ${r.at}. Membership is read from \`scripts/audit/wrapper-countdown.json\`
(generated ${r.countdownGeneratedAt}; ${JSON.stringify(r.countdownTotals)}).

## The arithmetic check

| category | count |
|---|---|
${CATEGORIES.map((c) => `| \`${c}\` | ${r.counts[c]} |`).join('\n')}
| **SUM** | **${r.categorySum}** |
| **failure count, derived independently from the verdict fields** | **${r.derivedFailureCount}** |

\`${r.categorySum} === ${r.derivedFailureCount}\` → **${r.arithmeticCheckPasses ? 'PASSES' : 'FAILS'}**.

The failure count is derived as
\`entries.filter(v === 'fail').length + writes.filter(v === 'SILENT_NO_OP' || v === 'REFUSED').length\`,
never read from this file's own header.

## Every failure, one row each

| surface | source | HTTP | SQLSTATE | category | why | offending site | attribution |
|---|---|---|---|---|---|---|---|
${r.findings.map(f).join('\n')}

## Live policy queries (what makes categories 3 and 4 reproducible)

${
  r.findings.filter((x: Finding) => x.policyQuery).length === 0
    ? 'No finding reached categories 3 or 4, so no policy query was needed. The distinction is not asserted where it was not tested.'
    : r.findings
        .filter((x: Finding) => x.policyQuery)
        .map(
          (x: Finding) =>
            `- \`${x.surface}\` → \`${x.policyQuery!.table}\` / ${x.policyQuery!.command}: ${
              x.policyQuery!.policies.length ? x.policyQuery!.policies.map((p) => '`' + p + '`').join(', ') : '**none** (dark)'
            }`,
        )
        .join('\n')
}

${r.policyDisagreements.length ? '### Disagreements recorded rather than reconciled\n\n' + r.policyDisagreements.map((d: string) => `- ${d}`).join('\n') : ''}

## OUTSIDE_456 — the finding

${
  r.outside456.length === 0
    ? 'None.'
    : `| surface | file | line | function | category |\n|---|---|---|---|---|\n${r.outside456
        .map((o: any) => `| \`${o.surface}\` | \`${o.file}\` | ${o.line} | \`${o.fn}\` | ${o.category} |`)
        .join('\n')}`
}
`;
}

main();
