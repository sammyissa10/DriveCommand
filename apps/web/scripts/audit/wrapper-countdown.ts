/**
 * quick-602 step 5 — the `withTenantContext` MIGRATION COUNTDOWN.
 *
 *   npm run audit:wrapper-countdown        (writes scripts/audit/wrapper-countdown.json)
 *
 * The runtime tripwire only fires on paths that get exercised. Step 4 measured
 * exactly how many that is (24 entry points invoked), and the gap between that and
 * the 456 units `docs/audits/wrapper-migration-scope.md` enumerates is this
 * instrument's entire justification. §5 of that audit is explicit that neither
 * instrument alone relaxes the cutover.
 *
 * HOW IT RECOGNISES A MIGRATED UNIT WHEN `withTenantContext` DOES NOT EXIST YET
 * ----------------------------------------------------------------------------
 * The classifier is PURELY SYNTACTIC — `ts.createSourceFile` per file, no `Program`,
 * no type checker — so the identifier need not resolve to anything.
 *
 *   - A UNIT is the innermost function-like node (`FunctionDeclaration`,
 *     `FunctionExpression`, `ArrowFunction`, `MethodDeclaration`) containing a call
 *     to `getTenantPrisma` or `getTenantPrismaForOrg`.
 *   - A unit is UNMIGRATED when that acquisition has no ancestor `CallExpression`
 *     whose callee text is `withTenantContext` (bare, or as the tail of a property
 *     access). A fully migrated unit has no acquisition at all and contributes zero;
 *     a transitional unit that has the wrapper AND keeps the inner acquisition also
 *     contributes zero — which is why the artefact records a SECOND number.
 *   - `withTenantContextCallSites` is that second number, and it is the ANTI-VACUITY
 *     COUNTER: without it, "the countdown reached zero" and "somebody deleted the
 *     acquisitions" are indistinguishable.
 *
 * WHY THE COUNTER MUST BE AST-BASED AND NOT A GREP
 * -----------------------------------------------
 * `withTenantContext` already appears in three files — `src/lib/auth/supabase.ts`,
 * `src/lib/email/sender-config.ts`, `src/lib/onboarding/activation-tracker.ts` — and
 * ALL THREE are PROSE INSIDE COMMENTS. A string match reports 3 migrated call sites
 * on a tree that has zero. Only call EXPRESSIONS are counted, so today's answer is 0
 * and the gate asserts that.
 */

import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { resolve, relative, sep } from 'path';

export const ACQUISITION_NAMES = ['getTenantPrisma', 'getTenantPrismaForOrg'] as const;
export const WRAPPER_NAME = 'withTenantContext';

/** Matches `wrapper-migration-scope.md`'s stated exclusions. */
export const EXCLUDED_PATH_FRAGMENTS = [
  `src${sep}generated`,
  `lib${sep}db${sep}extensions${sep}tenant-rls-bound.prototype.ts`,
] as const;

export type UnitRef = { name: string; line: number; callSites: number };

export type FileClassification = {
  unmigrated: UnitRef[];
  unmigratedCallSites: number;
  withTenantContextCalls: number;
};

function calleeText(node: ts.CallExpression): string {
  const e = node.expression;
  if (ts.isIdentifier(e)) return e.text;
  if (ts.isPropertyAccessExpression(e)) return e.name.text;
  return '';
}

function isFunctionLike(node: ts.Node): boolean {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node)
  );
}

function unitName(node: ts.Node, source: ts.SourceFile): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const n = node as any;
  if (n.name && ts.isIdentifier(n.name)) return n.name.text as string;
  const parent = node.parent;
  if (parent && ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (parent && ts.isPropertyAssignment(parent) && ts.isIdentifier(parent.name)) return parent.name.text;
  if (parent && ts.isExportAssignment(parent)) return 'default';
  void source;
  return '(anonymous)';
}

/**
 * PURE. Given a file's text, return its unmigrated units by name and the number of
 * `withTenantContext(` CALL EXPRESSIONS it contains.
 */
export function classifyFile(sourceText: string, fileName: string): FileClassification {
  const normalised = sourceText.replace(/\r\n/g, '\n');
  const source = ts.createSourceFile(fileName, normalised, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const unmigratedByUnit = new Map<string, UnitRef>();
  let withTenantContextCalls = 0;
  let unmigratedCallSites = 0;

  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node)) {
      const callee = calleeText(node);
      if (callee === WRAPPER_NAME) withTenantContextCalls += 1;
      if ((ACQUISITION_NAMES as readonly string[]).includes(callee)) {
        // Walk ancestors: find the innermost function-like node, and decide on the
        // way up whether any ancestor call is the wrapper.
        let wrapped = false;
        let unit: ts.Node | null = null;
        for (let p: ts.Node | undefined = node.parent; p; p = p.parent) {
          if (ts.isCallExpression(p) && calleeText(p) === WRAPPER_NAME) wrapped = true;
          if (!unit && isFunctionLike(p)) unit = p;
        }
        if (!wrapped) {
          const target = unit ?? source;
          const line = source.getLineAndCharacterOfPosition(target.getStart(source)).line + 1;
          const name = unit ? unitName(unit, source) : '(module scope)';
          const key = `${name}:${line}`;
          const existing = unmigratedByUnit.get(key);
          if (existing) existing.callSites += 1;
          else unmigratedByUnit.set(key, { name, line, callSites: 1 });
          unmigratedCallSites += 1;
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return {
    unmigrated: [...unmigratedByUnit.values()].sort((a, b) => a.line - b.line),
    unmigratedCallSites,
    withTenantContextCalls,
  };
}

export function isExcluded(absPath: string): boolean {
  return EXCLUDED_PATH_FRAGMENTS.some((f) => absPath.includes(f));
}

export function walkSourceFiles(root: string): string[] {
  const out: string[] = [];
  const rec = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, entry.name);
      if (isExcluded(p)) continue;
      if (entry.isDirectory()) rec(p);
      else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
    }
  };
  rec(root);
  return out.sort();
}

export type Artefact = {
  generatedAt: string;
  totals: {
    unmigratedUnits: number;
    unmigratedCallSites: number;
    withTenantContextCallSites: number;
    filesScanned: number;
    filesWithUnmigratedUnits: number;
  };
  files: Record<string, { units: number; callSites: number; names: string[] }>;
};

/** PURE over the file list: reads each path, classifies, and assembles the artefact. */
export function buildArtefact(srcRoot: string, generatedAt = new Date().toISOString()): Artefact {
  const files = walkSourceFiles(srcRoot);
  const out: Artefact['files'] = {};
  let units = 0;
  let callSites = 0;
  let wrapperCalls = 0;

  for (const abs of files) {
    const text = readFileSync(abs, 'utf8');
    const c = classifyFile(text, abs);
    wrapperCalls += c.withTenantContextCalls;
    if (c.unmigrated.length === 0) continue;
    const rel = relative(srcRoot, abs).split(sep).join('/');
    out[rel] = {
      units: c.unmigrated.length,
      callSites: c.unmigratedCallSites,
      names: c.unmigrated.map((u) => `${u.name}:${u.line}`),
    };
    units += c.unmigrated.length;
    callSites += c.unmigratedCallSites;
  }

  return {
    generatedAt,
    totals: {
      unmigratedUnits: units,
      unmigratedCallSites: callSites,
      withTenantContextCallSites: wrapperCalls,
      filesScanned: files.length,
      filesWithUnmigratedUnits: Object.keys(out).length,
    },
    files: out,
  };
}

export const SRC_ROOT = resolve(__dirname, '../../src');
export const ARTEFACT_PATH = resolve(__dirname, 'wrapper-countdown.json');

if (require.main === module) {
  const artefact = buildArtefact(SRC_ROOT);
  writeFileSync(ARTEFACT_PATH, JSON.stringify(artefact, null, 2) + '\n', 'utf8');
  const t = artefact.totals;
  console.log('wrapper-countdown');
  console.log(`  files scanned              : ${t.filesScanned}`);
  console.log(`  files with unmigrated units: ${t.filesWithUnmigratedUnits}`);
  console.log(`  UNMIGRATED UNITS           : ${t.unmigratedUnits}`);
  console.log(`  unmigrated call sites      : ${t.unmigratedCallSites}`);
  console.log(`  withTenantContext( calls   : ${t.withTenantContextCallSites}  <- anti-vacuity counter`);
  console.log(`\nWrote ${ARTEFACT_PATH}`);
  void statSync(ARTEFACT_PATH);
}
