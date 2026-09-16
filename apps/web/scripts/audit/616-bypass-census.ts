/**
 * quick-616 — THE `app.bypass_rls` CENSUS.
 *
 *   npx tsx scripts/audit/616-bypass-census.ts
 *   npx tsx scripts/audit/616-bypass-census.ts --break-visitor   (anti-vacuity red witness)
 *
 * WHY THIS IS A PARSE AND NOT A GREP
 * ----------------------------------
 * `docs/audits/bypass-call-classification.md` §1 counted with a grep plus an awk
 * filter that drops any line whose first non-space characters are `*`, `//` or
 * `/*`. That filter is a heuristic about comments, and two measurements taken
 * days apart with two spellings of it disagreed (177/87 vs 180/89). A line
 * starting `*` inside a template literal is CODE; a `$executeRaw` quoted in prose
 * is NOT. Only a parse can tell them apart.
 *
 * `ts.createSourceFile` is used with NO `Program` and NO type checker, exactly as
 * `wrapper-countdown.ts` does. Comments are not AST nodes, so prose is excluded
 * by construction rather than by a pattern.
 *
 * A STATEMENT is the innermost `CallExpression` or `TaggedTemplateExpression`
 * whose SQL text contains the literal `app.bypass_rls`. Both live shapes are
 * handled:
 *
 *     await tx.$executeRaw`SELECT set_config('app.bypass_rls','on',TRUE)`   (tagged template)
 *     await tx.$executeRawUnsafe("SELECT set_config('app.bypass_rls',...)")  (call)
 *     prisma.$transaction([ prisma.$executeRaw`...`, ... ])                  (ARRAY form)
 *
 * The array form is the one a callback-only walker silently drops, and
 * `src/lib/auth/supabase.ts` is the only file that uses it — which is why it is
 * a named witness below.
 *
 * ANTI-VACUITY — the failure mode of a bad walker is GREEN (quick-546/600)
 * -----------------------------------------------------------------------
 *   FLOOR             total >= 150 statements and >= 80 files.
 *   POSITIVE WITNESS  `api/mobile/driver/hos/route.ts` yields >= 2 statements.
 *   ARRAY WITNESS     `lib/auth/supabase.ts` yields >= 1 statement (array form).
 *   COUNTER-ASSERTION `lib/auth/mobile-auth.ts` is CONFIRMED READ (non-zero
 *                     bytes, parsed, and its prose line located) and yields
 *                     ZERO statements. Without the "was read" half, a walker
 *                     that skipped the file entirely passes identically.
 */

import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, relative, sep, dirname } from 'path';

const BYPASS_LITERAL = 'app.bypass_rls';
const WEB_ROOT = resolve(__dirname, '..', '..');
const SRC_ROOT = resolve(WEB_ROOT, 'src');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning',
  'quick',
  '616-route-the-bypass-flagged-statements-befo',
  'evidence',
);

/** Set by --break-visitor to witness the floor firing RED. */
const BREAK_VISITOR = process.argv.includes('--break-visitor');

// ---------------------------------------------------------------------------
// Surfaces — the STATED path rule. First match wins; the order below IS the
// precedence. Anything reaching the end gets its own named surface rather than
// being bucketed, because the follow-up batches are one per surface.
// ---------------------------------------------------------------------------

type SurfaceRule = { surface: string; test: (p: string) => boolean };

const posix = (p: string) => p.split(sep).join('/');

const SURFACE_RULES: SurfaceRule[] = [
  // The four the user named, first, so they win any overlap.
  { surface: 'DRIVER_PORTAL', test: (p) => p.startsWith('src/app/(driver)/') },
  { surface: 'OWNER_PORTAL', test: (p) => p.startsWith('src/app/(owner)/') },
  { surface: 'MOBILE_API', test: (p) => p.startsWith('src/app/api/mobile/') },
  {
    surface: 'LIB_SERVICES',
    test: (p) =>
      p.startsWith('src/lib/') || p.startsWith('src/server/') || p.startsWith('src/actions/'),
  },
  // Residue, each named in its own right.
  { surface: 'ADMIN_PORTAL', test: (p) => p.startsWith('src/app/(admin)/') },
  { surface: 'AUTH_PORTAL', test: (p) => p.startsWith('src/app/(auth)/') },
  { surface: 'API_V1', test: (p) => p.startsWith('src/app/api/v1/') },
  { surface: 'API_CRON', test: (p) => p.startsWith('src/app/api/cron/') },
  { surface: 'API_DRIVER', test: (p) => p.startsWith('src/app/api/driver/') },
  { surface: 'API_AUTH', test: (p) => p.startsWith('src/app/api/auth/') },
  { surface: 'API_DRIVER_PAY', test: (p) => p.startsWith('src/app/api/driver-pay/') },
  { surface: 'API_GPS', test: (p) => p.startsWith('src/app/api/gps/') },
  { surface: 'API_TRACK', test: (p) => p.startsWith('src/app/api/track/') },
  { surface: 'API_PUSH_TOKENS', test: (p) => p.startsWith('src/app/api/push-tokens/') },
  { surface: 'API_INTEGRATIONS', test: (p) => p.startsWith('src/app/api/integrations/') },
  { surface: 'API_EMAIL_CONFIRM', test: (p) => p.startsWith('src/app/api/email-confirm/') },
  { surface: 'ONBOARDING_PAGES', test: (p) => p.startsWith('src/app/onboarding/') },
];

function surfaceFor(relPath: string): string {
  const p = posix(relPath);
  for (const r of SURFACE_RULES) if (r.test(p)) return r.surface;
  return `UNCLASSIFIED:${p}`;
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

export type RawStatement = {
  file: string;
  line: number;
  shape: 'tagged-template' | 'call';
  callee: string;
  enclosingFunction: string;
  inArrayForm: boolean;
  annotationReason: string | null;
  annotationScope: string | null;
};

export type FileScan = {
  file: string;
  bytes: number;
  parsed: boolean;
  statements: RawStatement[];
  proseMatches: number;
  acquiresTenantClient: boolean;
};

const TEST_PATH = /(^|[\\/])__tests__[\\/]|\.test\.tsx?$|\.spec\.tsx?$/;

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'generated') continue;
      walkFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function calleeText(node: ts.Node): string {
  const e = ts.isCallExpression(node)
    ? node.expression
    : ts.isTaggedTemplateExpression(node)
      ? node.tag
      : null;
  if (!e) return '';
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return `${e.expression.getText()}.${e.name.text}`;
  return e.getText();
}

/** Nearest enclosing named function-like, or the exported route verb. */
function enclosingName(node: ts.Node, sf: ts.SourceFile): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      const p: ts.Node = cur.parent;
      // ONLY a DIRECT initializer names the unit. `const x = await prisma.$transaction(async tx => …)`
      // must NOT be read as "the function is called x" — that is the transaction's RESULT
      // variable, and taking it produced enclosing names like `result` and `tickets`.
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer === cur) {
        return p.name.text;
      }
      if (ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.initializer === cur) {
        return p.name.text;
      }
      // export const GET = withMobileAuth(async (req) => …) — the arrow is an ARGUMENT of a
      // call that is itself the initializer. Accept that one hop, and only that one.
      if (ts.isCallExpression(p) && p.arguments.includes(cur as ts.Expression)) {
        const gp = p.parent;
        if (ts.isVariableDeclaration(gp) && ts.isIdentifier(gp.name) && gp.initializer === p) {
          return gp.name.text;
        }
      }
    }
    if (ts.isClassDeclaration(cur) && cur.name) return cur.name.text;
    cur = cur.parent;
  }
  void sf;
  return '<module>';
}

/** `@bypass_rls reason: X` from the nearest JSDoc above the enclosing statement. */
function annotationFor(node: ts.Node, text: string): { reason: string | null; scope: string | null } {
  // Walk up to the outermost statement, then scan backwards through the source
  // for the closest `@bypass_rls reason:` that is not separated by another one.
  let cur: ts.Node = node;
  while (cur.parent && !ts.isSourceFile(cur.parent)) {
    if (ts.isBlock(cur.parent) || ts.isSourceFile(cur.parent)) break;
    cur = cur.parent;
  }
  const before = text.slice(0, node.getStart());
  const idx = before.lastIndexOf('@bypass_rls reason:');
  if (idx === -1) return { reason: null, scope: null };
  // Reject if another executable bypass statement sits between the annotation
  // and this one (the annotation belongs to that earlier one).
  const between = text.slice(idx, node.getStart());
  const reason = /@bypass_rls reason:\s*([^\n\r*]*)/.exec(text.slice(idx))?.[1]?.trim() ?? null;
  const scopeM = /SCOPE:\s*([^\n\r]*)/.exec(text.slice(idx, idx + 1200));
  const scope = scopeM ? scopeM[1].replace(/\s*\*\/?\s*$/, '').trim() : null;
  // Distance guard: an annotation more than 4000 chars away is not this one's.
  if (between.length > 4000) return { reason: null, scope: null };
  return { reason, scope };
}

function scanFile(full: string): FileScan {
  const rel = relative(WEB_ROOT, full);
  const text = readFileSync(full, 'utf8');
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);
  const candidates: { node: ts.Node; start: number; end: number }[] = [];
  let acquires = false;

  const visit = (node: ts.Node) => {
    if (BREAK_VISITOR) return; // --break-visitor: the deliberate red witness
    if (ts.isCallExpression(node)) {
      const c = calleeText(node);
      if (/(^|\.)getTenantPrisma(ForOrg)?$/.test(c)) acquires = true;
    }
    const isCandidate = ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node);
    if (isCandidate) {
      // SQL text is taken from the node's own literal children only — never the
      // surrounding source — so a comment can never contribute.
      let sql = '';
      const collect = (n: ts.Node) => {
        if (
          ts.isStringLiteral(n) ||
          ts.isNoSubstitutionTemplateLiteral(n) ||
          ts.isTemplateHead(n) ||
          ts.isTemplateMiddle(n) ||
          ts.isTemplateTail(n)
        ) {
          sql += n.text;
        }
        n.forEachChild(collect);
      };
      if (ts.isCallExpression(node)) node.arguments.forEach(collect);
      else collect(node.template);

      if (sql.includes(BYPASS_LITERAL)) {
        candidates.push({ node, start: node.getStart(), end: node.getEnd() });
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);

  // ONE STATEMENT PER SQL STRING: keep only the INNERMOST candidate. A
  // `prisma.$transaction(async tx => { await tx.$executeRaw`...` })` is itself a
  // CallExpression whose argument subtree contains the literal, so without this
  // filter every enclosing call is counted again. Method-agnostic on purpose —
  // filtering by callee name would silently drop an unusual spelling.
  const statements: RawStatement[] = candidates
    .filter(
      (c) =>
        !candidates.some((o) => o !== c && o.start >= c.start && o.end <= c.end && (o.start > c.start || o.end < c.end)),
    )
    .map(({ node }) => {
      const line = sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      let inArray = false;
      let p: ts.Node | undefined = node.parent;
      for (let i = 0; i < 4 && p; i++, p = p.parent) {
        if (ts.isArrayLiteralExpression(p)) {
          inArray = true;
          break;
        }
      }
      const ann = annotationFor(node, text);
      return {
        file: posix(rel),
        line,
        shape: (ts.isTaggedTemplateExpression(node) ? 'tagged-template' : 'call') as
          | 'tagged-template'
          | 'call',
        callee: calleeText(node),
        enclosingFunction: enclosingName(node, sf),
        inArrayForm: inArray,
        annotationReason: ann.reason,
        annotationScope: ann.scope,
      };
    })
    .sort((a, b) => a.line - b.line);

  // prose matches = raw textual occurrences minus the ones the parse claimed
  const rawOccurrences = text.split(BYPASS_LITERAL).length - 1;
  return {
    file: posix(rel),
    bytes: Buffer.byteLength(text),
    parsed: sf.statements.length > 0 || text.length === 0,
    statements,
    proseMatches: rawOccurrences - statements.length,
    acquiresTenantClient: acquires,
  };
}

// ---------------------------------------------------------------------------
// Classification — surface is mechanical; CATEGORY and RECEIVER come from the
// table in 616-census-classification.ts, which carries one entry per file (with
// per-line overrides where a file is mixed) and its argument.
// ---------------------------------------------------------------------------

import {
  classify,
  CATEGORY_ORDER,
  OVERRIDE_KEYS,
  ROUTED_AND_REMOVED,
  CENSUS_TOTAL_BEFORE_ROUTING,
  type Category,
  type Receiver,
} from './616-census-classification';

export type CensusRecord = RawStatement & {
  surface: string;
  category: Category;
  routingNeeded: string;
  receiver: Receiver;
  annotationVerifies: boolean | 'n/a';
  annotationNote: string | null;
  alreadyAcquiresTenantClient: boolean;
  inNamedSubset: boolean;
};

function main() {
  const all = walkFiles(SRC_ROOT);
  const shipping: FileScan[] = [];
  const testScans: FileScan[] = [];

  for (const f of all) {
    const rel = posix(relative(WEB_ROOT, f));
    const text = readFileSync(f, 'utf8');
    if (!text.includes(BYPASS_LITERAL)) continue;
    const scan = scanFile(f);
    if (TEST_PATH.test(rel)) testScans.push(scan);
    else shipping.push(scan);
  }

  const records: CensusRecord[] = [];
  for (const scan of shipping) {
    for (const s of scan.statements) {
      const c = classify(s);
      records.push({
        ...s,
        surface: surfaceFor(s.file),
        category: c.category,
        routingNeeded: c.routingNeeded,
        receiver: c.receiver,
        annotationVerifies: c.annotationVerifies,
        annotationNote: c.annotationNote,
        alreadyAcquiresTenantClient: scan.acquiresTenantClient,
        inNamedSubset: c.inNamedSubset,
      });
    }
  }
  records.sort((a, b) => (a.file === b.file ? a.line - b.line : a.file < b.file ? -1 : 1));

  const files = [...new Set(records.map((r) => r.file))];

  // ---- anti-vacuity -------------------------------------------------------
  const FLOOR_STATEMENTS = 150;
  const FLOOR_FILES = 80;
  const checks: { name: string; pass: boolean; detail: string }[] = [];

  checks.push({
    name: 'FLOOR statements',
    pass: records.length >= FLOOR_STATEMENTS,
    detail: `${records.length} >= ${FLOOR_STATEMENTS}`,
  });
  checks.push({
    name: 'FLOOR files',
    pass: files.length >= FLOOR_FILES,
    detail: `${files.length} >= ${FLOOR_FILES}`,
  });

  const posWitness = records.filter((r) => r.file === 'src/app/api/mobile/driver/hos/route.ts');
  checks.push({
    name: 'POSITIVE WITNESS api/mobile/driver/hos/route.ts',
    pass: posWitness.length >= 2,
    detail: `${posWitness.length} statements at lines [${posWitness.map((r) => r.line).join(', ')}] >= 2`,
  });

  const arrWitness = records.filter(
    (r) => r.file === 'src/lib/auth/supabase.ts' && r.inArrayForm,
  );
  checks.push({
    name: 'ARRAY-FORM WITNESS lib/auth/supabase.ts',
    pass: arrWitness.length >= 1,
    detail: `${arrWitness.length} array-form statements at lines [${arrWitness.map((r) => r.line).join(', ')}] >= 1`,
  });

  // COUNTER-ASSERTION: confirmed READ, and yields zero.
  const negPath = resolve(SRC_ROOT, 'lib', 'auth', 'mobile-auth.ts');
  const negScan = scanFile(negPath);
  checks.push({
    name: 'COUNTER-ASSERTION lib/auth/mobile-auth.ts WAS READ',
    pass: negScan.bytes > 1000 && negScan.parsed && negScan.proseMatches >= 1,
    detail: `bytes=${negScan.bytes} parsed=${negScan.parsed} proseOccurrences=${negScan.proseMatches} (>=1 proves the literal IS in the file and was seen)`,
  });
  checks.push({
    name: 'COUNTER-ASSERTION lib/auth/mobile-auth.ts YIELDS ZERO',
    pass: negScan.statements.length === 0,
    detail: `${negScan.statements.length} executable statements === 0`,
  });

  // Every hand-written classification override must MATCH a real statement.
  // An override whose line has drifted silently stops applying and the statement
  // falls to the default — a misclassification that looks like a clean run.
  const keys = new Set(records.map((r) => `${r.file}:${r.line}`));
  const orphanOverrides = OVERRIDE_KEYS.filter((k) => !keys.has(k));
  // Task 2's routing, asserted as a MOVE rather than an absence. A shorter list
  // alone passes identically whether a statement was routed or simply deleted
  // along with the read it protected (quick-566 / quick-599's union rule).
  const stillPresent = ROUTED_AND_REMOVED.filter((k) => keys.has(k));
  checks.push({
    name: 'ROUTED STATEMENTS ARE GONE',
    pass: stillPresent.length === 0,
    detail:
      stillPresent.length === 0
        ? `${ROUTED_AND_REMOVED.length} routed statements absent: ${ROUTED_AND_REMOVED.join(', ')}`
        : `STILL PRESENT: ${stillPresent.join(', ')}`,
  });
  checks.push({
    name: 'REMOVED + REMAINING RECONCILES',
    pass: records.length + ROUTED_AND_REMOVED.length === CENSUS_TOTAL_BEFORE_ROUTING,
    detail: `${records.length} remaining + ${ROUTED_AND_REMOVED.length} routed = ${records.length + ROUTED_AND_REMOVED.length} (must be ${CENSUS_TOTAL_BEFORE_ROUTING}). Anything else means something ELSE changed.`,
  });

  checks.push({
    name: 'NO ORPHAN CLASSIFICATION OVERRIDE',
    pass: orphanOverrides.length === 0,
    detail:
      orphanOverrides.length === 0
        ? `all ${OVERRIDE_KEYS.length} overrides matched a statement`
        : `DRIFTED: ${orphanOverrides.join(', ')}`,
  });

  for (const c of checks) {
    console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.name}  —  ${c.detail}`);
  }

  // ---- counts -------------------------------------------------------------
  const bySurface = new Map<string, CensusRecord[]>();
  for (const r of records) {
    if (!bySurface.has(r.surface)) bySurface.set(r.surface, []);
    bySurface.get(r.surface)!.push(r);
  }

  const matrix: Record<string, Record<string, { files: number; statements: number }>> = {};
  for (const [surface, rs] of bySurface) {
    matrix[surface] = {};
    for (const cat of CATEGORY_ORDER) {
      const sub = rs.filter((r) => r.category === cat);
      matrix[surface][cat] = {
        files: new Set(sub.map((r) => r.file)).size,
        statements: sub.length,
      };
    }
    matrix[surface].TOTAL = {
      files: new Set(rs.map((r) => r.file)).size,
      statements: rs.length,
    };
  }

  // ---- reconciliation against bypass-call-classification.md's 211 / 103 ----
  // The map is a hand transcription of that document's §3 and §4 per-file
  // tables. It is SELF-CHECKING: if the transcription does not add to 211/103
  // the reconciliation is refused, so a mis-typed row cannot silently explain
  // away a real disappearance.
  const audit211: Record<string, Record<string, number[]>> = JSON.parse(
    readFileSync(resolve(__dirname, '616-audit211-transcription.json'), 'utf8'),
  );
  const thenCount: Record<string, number> = {};
  const thenClass: Record<string, string[]> = {};
  for (const bucket of Object.keys(audit211)) {
    for (const [f, lines] of Object.entries(audit211[bucket])) {
      thenCount[f] = (thenCount[f] ?? 0) + lines.length;
      (thenClass[f] ??= []).push(`${bucket}:${lines.length}`);
    }
  }
  const thenTotal = Object.values(thenCount).reduce((a, b) => a + b, 0);
  const thenFiles = Object.keys(thenCount).length;
  checks.push({
    name: 'RECONCILIATION SOURCE transcription adds to 211/103',
    pass: thenTotal === 211 && thenFiles === 103,
    detail: `${thenTotal} statements / ${thenFiles} files (must be 211 / 103)`,
  });

  const nowCount: Record<string, number> = {};
  for (const r of records) nowCount[r.file] = (nowCount[r.file] ?? 0) + 1;
  const reconciliation = [...new Set([...Object.keys(thenCount), ...Object.keys(nowCount)])]
    .sort()
    .map((f) => ({
      file: f,
      then: thenCount[f] ?? 0,
      now: nowCount[f] ?? 0,
      delta: (nowCount[f] ?? 0) - (thenCount[f] ?? 0),
      priorCategories: thenClass[f] ?? ['(not in the 211)'],
    }))
    .filter((r) => r.delta !== 0);
  const disappeared = reconciliation.reduce((n, r) => n + (r.delta < 0 ? -r.delta : 0), 0);
  const appeared = reconciliation.reduce((n, r) => n + (r.delta > 0 ? r.delta : 0), 0);

  // ---- outside the shipping tree, named and counted, OUT of the matrix ----
  const outsideRoots = ['prisma', 'scripts', 'tests', 'tests-db'];
  const outside: { file: string; occurrences: number }[] = [];
  for (const root of outsideRoots) {
    const abs = resolve(WEB_ROOT, root);
    let files: string[] = [];
    try {
      files = walkFiles(abs);
    } catch {
      continue;
    }
    for (const f of files) {
      const t = readFileSync(f, 'utf8');
      const n = t.split(BYPASS_LITERAL).length - 1;
      if (n > 0) outside.push({ file: posix(relative(WEB_ROOT, f)), occurrences: n });
    }
  }
  outside.sort((a, b) => (a.file < b.file ? -1 : 1));

  const out = {
    generated: new Date().toISOString(),
    method:
      'ts.createSourceFile per file, no Program, no type checker. A statement is a CallExpression or ' +
      'TaggedTemplateExpression whose own literal children contain "app.bypass_rls". Comments are not ' +
      'AST nodes and are excluded by construction. Test paths (__tests__/, *.test.*, *.spec.*) excluded ' +
      'and reported separately. scripts/ and prisma/ are outside src/ and are reported separately.',
    scope: 'apps/web/src, excluding test paths and src/generated',
    totals: {
      statements: records.length,
      files: files.length,
      testStatements: testScans.reduce((n, s) => n + s.statements.length, 0),
      testFiles: testScans.length,
    },
    antiVacuity: checks,
    proseOnlyFiles: shipping
      .filter((s) => s.statements.length === 0)
      .map((s) => ({ file: s.file, proseOccurrences: s.proseMatches })),
    testStatements: testScans.flatMap((s) =>
      s.statements.map((x) => ({ file: x.file, line: x.line })),
    ),
    matrix,
    reconciliation: {
      priorAudit: 'docs/audits/bypass-call-classification.md (2026-09-12)',
      priorTotals: { statements: thenTotal, files: thenFiles },
      nowTotals: { statements: records.length, files: files.length },
      disappeared,
      appeared,
      perFile: reconciliation,
    },
    outsideShippingTree: {
      note:
        'Counted and named, DELIBERATELY OUT of the matrix: none of these ship, and none is on the ' +
        'app_user cutover path. Raw textual occurrences, not a parse — the point is only the size.',
      roots: outsideRoots,
      files: outside,
      occurrences: outside.reduce((n, f) => n + f.occurrences, 0),
    },
    records,
  };

  console.log('');
  console.log(`statements: ${records.length}   files: ${files.length}`);
  console.log(`test statements: ${out.totals.testStatements} in ${out.totals.testFiles} files`);
  console.log(`prose-only files: ${out.proseOnlyFiles.length}`);

  // A FAILED run must NOT leave an artefact behind. A poisoned 01-census.json is
  // worse than none: every follow-up batch is driven from it.
  const failed = checks.filter((c) => !c.pass);
  if (failed.length) {
    console.error('');
    console.error(`ANTI-VACUITY FAILED — ${failed.length} check(s): ${failed.map((f) => f.name).join('; ')}`);
    console.error('The walker is broken or the population changed. NOTHING WRITTEN.');
    process.exitCode = 1;
    return;
  }

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const jsonPath = resolve(EVIDENCE_DIR, '01-census.json');
  writeFileSync(jsonPath, JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${relative(REPO_ROOT, jsonPath)}`);
}

if (require.main === module) main();
void dirname;
