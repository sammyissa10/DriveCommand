/**
 * quick-611 — is each of the 17 `25P02` sites inside a transaction TODAY?
 *
 *   npx tsx scripts/audit/611-transaction-scope.ts
 *
 * ─── THE QUESTION, STATED PRECISELY ────────────────────────────────────────
 *
 * `25P02` requires the swallowed statement to run **between a BEGIN and its
 * COMMIT on the same connection**. That is a question about lexical and dynamic
 * scope at the moment the statement executes — NOT about whether a transaction
 * exists somewhere in the call graph. Getting it backwards classifies nearly
 * everything as live and produces a large, wrong, destabilising diff.
 *
 * Two false positives this analyser is built to exclude, both of which a grep
 * for `$transaction` in the file would fall straight into:
 *
 *   (A) THE CATCH WRAPS THE TRANSACTION rather than sitting inside it:
 *
 *         try   { await prisma.$transaction(async (tx) => { ...fails... }) }
 *         catch { /* swallowed *\/ }
 *         await somethingElse()          // <- NEW connection, autocommit
 *
 *       The transaction has already ROLLED BACK by the time the catch runs, so
 *       there is no aborted transaction left to cascade into. `somethingElse`
 *       is unaffected. This is `api/driver/gps-ping/route.ts` exactly, which
 *       `wrapper-migration-scope.md` lists as one of the 17 — the file DOES
 *       contain a `$transaction` and the site is NOT a cascade risk.
 *
 *   (B) A HELPER THAT OPENS AND CLOSES ITS OWN TRANSACTION and returns
 *       (`getCurrentUser()` doing `prisma.$transaction([...])`, and the other
 *       15 resolvers in that audit's §1b table). Calling one does not put the
 *       CALLER inside a transaction — it committed before control returned.
 *
 * So the test is: **is the swallowed statement lexically inside a function
 * expression passed as an argument to a `$transaction(...)` call** (its own
 * file), or is the enclosing function called from inside one (a caller's)?
 *
 * ─── METHOD ────────────────────────────────────────────────────────────────
 *
 * AST, via the TypeScript compiler API with no Program and no type checker —
 * the same shape `wrapper-countdown.ts` uses, and for the same reason: a
 * regex cannot answer a nesting question, and `withTenantContext` already
 * proved (quick-602) that a substring match reports prose in comments as code.
 *
 * Per site: locate the enclosing `TryStatement` at//around the recorded line,
 * then walk its ANCESTOR chain. If any ancestor is a function expression or
 * arrow function that is an ARGUMENT to a call whose callee ends in
 * `.$transaction`, the site is inside its own transaction. Otherwise resolve
 * the enclosing top-level function and search every caller, applying the same
 * ancestor test at each call site.
 *
 * Read-only. Touches no database and no network. Prints a table and writes JSON.
 */

import * as ts from 'typescript';
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, join, relative } from 'path';

const APP_ROOT = resolve(__dirname, '../..');
const SRC = resolve(APP_ROOT, 'src');
const REPO_ROOT = resolve(APP_ROOT, '../..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence',
);

// ---------------------------------------------------------------------------
// The 17, transcribed from docs/audits/wrapper-migration-scope.md.
// `line` is the AUDIT's line and is treated as a HINT only — it has drifted,
// and one path is wrong outright (team-permissions is under app/(owner)/actions,
// not lib/carrier). `anchor` is what is actually searched for.
// ---------------------------------------------------------------------------

export interface SiteSpec {
  id: string;
  kind: 'WRITE' | 'READ';
  /** Path as the audit wrote it — kept so the correction is visible. */
  auditPath: string;
  /** Path as it actually is today. */
  path: string;
  auditLine: number;
  fn: string;
  note: string;
}

export const SITES: SiteSpec[] = [
  { id: 'W1', kind: 'WRITE', auditPath: 'src/lib/carrier/fleet-drivers.ts', path: 'lib/carrier/fleet-drivers.ts', auditLine: 276, fn: 'createCarrierDriver', note: 'swallows carrierDriver.update, then 3 more db ops' },
  { id: 'W2', kind: 'WRITE', auditPath: 'src/lib/carrier/inspection-service.ts', path: 'lib/carrier/inspection-service.ts', auditLine: 703, fn: 'overrideInspection', note: 'swallows trip.update + dispatchOverrideAudit.create, then 3 more' },
  { id: 'W3', kind: 'WRITE', auditPath: 'src/lib/carrier/trips.ts', path: 'lib/carrier/trips.ts', auditLine: 786, fn: 'transitionTripStatus', note: 'swallows trip.create + carrierStop.create, then 3 more' },

  { id: 'R1', kind: 'READ', auditPath: 'src/lib/carrier/team-permissions.ts', path: 'app/(owner)/actions/team-permissions.ts', auditLine: 152, fn: '', note: 'audit path was wrong — file is under app/(owner)/actions' },
  { id: 'R2', kind: 'READ', auditPath: 'src/app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx', path: 'app/(owner)/carrier/fleet/drivers/[id]/compensation/page.tsx', auditLine: 21, fn: '', note: '' },
  { id: 'R3', kind: 'READ', auditPath: 'src/app/(owner)/crm/[id]/page.tsx', path: 'app/(owner)/crm/[id]/page.tsx', auditLine: 39, fn: '', note: '' },
  { id: 'R4', kind: 'READ', auditPath: 'src/app/(owner)/crm/page.tsx', path: 'app/(owner)/crm/page.tsx', auditLine: 19, fn: '', note: '' },
  { id: 'R5', kind: 'READ', auditPath: 'src/app/(owner)/invoices/[id]/edit/page.tsx', path: 'app/(owner)/invoices/[id]/edit/page.tsx', auditLine: 18, fn: '', note: '' },
  { id: 'R6', kind: 'READ', auditPath: 'src/app/(owner)/invoices/[id]/page.tsx', path: 'app/(owner)/invoices/[id]/page.tsx', auditLine: 52, fn: '', note: '' },
  { id: 'R7', kind: 'READ', auditPath: 'src/app/(owner)/invoices/new/page.tsx', path: 'app/(owner)/invoices/new/page.tsx', auditLine: 20, fn: '', note: '' },
  { id: 'R8', kind: 'READ', auditPath: 'src/app/(owner)/loads/[id]/page.tsx', path: 'app/(owner)/loads/[id]/page.tsx', auditLine: 44, fn: '', note: '' },
  { id: 'R9', kind: 'READ', auditPath: 'src/app/(owner)/loads/page.tsx', path: 'app/(owner)/loads/page.tsx', auditLine: 18, fn: '', note: '' },
  { id: 'R10', kind: 'READ', auditPath: 'src/app/(owner)/payroll/[id]/edit/page.tsx', path: 'app/(owner)/payroll/[id]/edit/page.tsx', auditLine: 18, fn: '', note: '' },
  { id: 'R11', kind: 'READ', auditPath: 'src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts', path: 'app/api/driver-pay/settlements/[settlementId]/finalize/route.ts', auditLine: 74, fn: '', note: '' },
  { id: 'R12', kind: 'READ', auditPath: 'src/app/api/driver/gps-ping/route.ts', path: 'app/api/driver/gps-ping/route.ts', auditLine: 67, fn: 'POST', note: 'the try WRAPS the $transaction — catch is outside it' },
  { id: 'R13', kind: 'READ', auditPath: 'src/lib/carrier/documents.ts', path: 'lib/carrier/documents.ts', auditLine: 101, fn: '', note: '' },
  { id: 'R14', kind: 'READ', auditPath: 'src/lib/carrier/trips.ts', path: 'lib/carrier/trips.ts', auditLine: 720, fn: 'transitionTripStatus', note: '' },
];

// ---------------------------------------------------------------------------
// Source index
// ---------------------------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'generated') continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

export const FILES = walk(SRC);
const SOURCE_CACHE = new Map<string, ts.SourceFile>();

function parse(abs: string): ts.SourceFile {
  let sf = SOURCE_CACHE.get(abs);
  if (!sf) {
    sf = ts.createSourceFile(abs, readFileSync(abs, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    SOURCE_CACHE.set(abs, sf);
  }
  return sf;
}

const rel = (abs: string) => relative(SRC, abs).split('\\').join('/');

// ---------------------------------------------------------------------------
// The core predicate
// ---------------------------------------------------------------------------

/** `x.$transaction(...)` / `tx.$transaction(...)` — matched on the property name. */
export function isTransactionCall(node: ts.Node): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) return false;
  const e = node.expression;
  return ts.isPropertyAccessExpression(e) && e.name.text === '$transaction';
}

/**
 * Is `node` lexically inside a callback passed to `$transaction(...)`?
 *
 * The ancestor must be a function/arrow that is an ARGUMENT of the transaction
 * call — not merely nested somewhere under it. That distinction is exactly
 * false-positive (A): in `try { await p.$transaction(cb) } catch {}` the CATCH
 * BLOCK is a descendant of the try, and the try is a sibling-ancestor of the
 * call, so a naive "is under a $transaction call" test would wrongly include it.
 */
export function enclosingTransactionCallback(node: ts.Node): ts.CallExpression | null {
  let child: ts.Node = node;
  let parent = node.parent;
  while (parent) {
    if (
      (ts.isArrowFunction(child) || ts.isFunctionExpression(child)) &&
      isTransactionCall(parent) &&
      (parent as ts.CallExpression).arguments.some((a) => a === child)
    ) {
      return parent as ts.CallExpression;
    }
    child = parent;
    parent = parent.parent;
  }
  return null;
}

/** Nearest enclosing named function/method declaration, for reporting and caller search. */
function enclosingFunctionName(node: ts.Node): string {
  let n: ts.Node | undefined = node;
  while (n) {
    if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
    if (ts.isMethodDeclaration(n) && ts.isIdentifier(n.name)) return n.name.text;
    if (
      (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
      n.parent &&
      ts.isVariableDeclaration(n.parent) &&
      ts.isIdentifier(n.parent.name)
    ) {
      return n.parent.name.text;
    }
    n = n.parent;
  }
  return '(top level)';
}

/** Every try statement in a file that has a catch clause containing no `throw`. */
export function swallowingTries(sf: ts.SourceFile): ts.TryStatement[] {
  const out: ts.TryStatement[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isTryStatement(n) && n.catchClause) {
      let rethrows = false;
      const scan = (m: ts.Node) => {
        if (ts.isThrowStatement(m)) rethrows = true;
        ts.forEachChild(m, scan);
      };
      scan(n.catchClause);
      if (!rethrows) out.push(n);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

/** Does the try BLOCK itself contain a `$transaction` call? (false positive A) */
export function tryBlockContainsTransactionCall(t: ts.TryStatement): boolean {
  let found = false;
  const scan = (n: ts.Node) => {
    if (isTransactionCall(n)) found = true;
    ts.forEachChild(n, scan);
  };
  scan(t.tryBlock);
  return found;
}

// ---------------------------------------------------------------------------
// Caller search
// ---------------------------------------------------------------------------

interface CallerHit {
  file: string;
  line: number;
  inTransaction: boolean;
  enclosingFn: string;
}

function findCallers(fnName: string): CallerHit[] {
  const hits: CallerHit[] = [];
  if (!fnName || fnName === '(top level)') return hits;
  for (const abs of FILES) {
    const text = readFileSync(abs, 'utf8');
    if (!text.includes(fnName)) continue;
    const sf = parse(abs);
    const visit = (n: ts.Node) => {
      if (ts.isCallExpression(n)) {
        const callee = n.expression;
        const name = ts.isIdentifier(callee)
          ? callee.text
          : ts.isPropertyAccessExpression(callee)
            ? callee.name.text
            : null;
        if (name === fnName) {
          // Skip the declaration's own file self-reference only if it IS the declaration.
          const { line } = sf.getLineAndCharacterOfPosition(n.getStart(sf));
          hits.push({
            file: rel(abs),
            line: line + 1,
            inTransaction: enclosingTransactionCallback(n) !== null,
            enclosingFn: enclosingFunctionName(n),
          });
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(sf);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Resolve each site
// ---------------------------------------------------------------------------

export type Verdict = 'LIVE' | 'DORMANT' | 'IMPOSSIBLE' | 'UNRESOLVED';

export interface SiteResult extends SiteSpec {
  resolvedPath: string | null;
  resolvedLine: number | null;
  enclosingFn: string;
  ownTransaction: boolean;
  catchWrapsTransaction: boolean;
  callers: CallerHit[];
  callersInTransaction: CallerHit[];
  verdict: Verdict;
  reason: string;
}

export function resolveSite(spec: SiteSpec): SiteResult {
  const abs = resolve(SRC, spec.path);
  let sf: ts.SourceFile;
  try {
    sf = parse(abs);
  } catch {
    return {
      ...spec, resolvedPath: null, resolvedLine: null, enclosingFn: '', ownTransaction: false,
      catchWrapsTransaction: false, callers: [], callersInTransaction: [],
      verdict: 'UNRESOLVED', reason: `file not found at ${spec.path}`,
    };
  }

  const tries = swallowingTries(sf);
  if (tries.length === 0) {
    return {
      ...spec, resolvedPath: spec.path, resolvedLine: null, enclosingFn: '', ownTransaction: false,
      catchWrapsTransaction: false, callers: [], callersInTransaction: [],
      verdict: 'UNRESOLVED', reason: 'no swallowing try/catch found in this file',
    };
  }

  // Nearest swallowing try to the audit's line hint.
  let best = tries[0];
  let bestDist = Infinity;
  for (const t of tries) {
    const { line } = sf.getLineAndCharacterOfPosition(t.getStart(sf));
    const d = Math.abs(line + 1 - spec.auditLine);
    if (d < bestDist) { bestDist = d; best = t; }
  }

  const { line: startLine } = sf.getLineAndCharacterOfPosition(best.getStart(sf));
  const resolvedLine = startLine + 1;
  const enclosingFn = spec.fn || enclosingFunctionName(best);
  const ownTx = enclosingTransactionCallback(best) !== null;
  const wraps = tryBlockContainsTransactionCall(best);

  const callers = findCallers(enclosingFn).filter(
    (c) => !(c.file === spec.path && Math.abs(c.line - resolvedLine) < 3),
  );
  const callersInTx = callers.filter((c) => c.inTransaction);

  let verdict: Verdict;
  let reason: string;
  if (ownTx) {
    verdict = 'LIVE';
    reason = 'the swallowing try/catch is lexically INSIDE a $transaction callback in its own file';
  } else if (wraps) {
    verdict = 'IMPOSSIBLE';
    reason =
      'the try BLOCK contains the $transaction call — the catch is OUTSIDE the transaction, which has ' +
      'already rolled back by the time the catch runs, so there is no aborted transaction to cascade into';
  } else if (callersInTx.length > 0) {
    verdict = 'LIVE';
    reason = `called from inside a $transaction callback at ${callersInTx.map((c) => `${c.file}:${c.line}`).join(', ')}`;
  } else {
    verdict = 'DORMANT';
    reason =
      callers.length === 0
        ? 'no enclosing transaction in its own file, and no caller found — autocommit today'
        : `no enclosing transaction in its own file; all ${callers.length} caller(s) are outside a transaction`;
  }

  return {
    ...spec, resolvedPath: spec.path, resolvedLine, enclosingFn,
    ownTransaction: ownTx, catchWrapsTransaction: wraps,
    callers, callersInTransaction: callersInTx, verdict, reason,
  };
}

// ---------------------------------------------------------------------------

/**
 * ─── THE POSITIVE CONTROL, AND A SEARCH THE ORIGINAL AUDIT DID NOT DO ──────
 *
 * Sweep EVERY swallowing try/catch in `src` and report the ones that ARE
 * lexically inside a `$transaction` callback and DO further DB work after the
 * catch. Two jobs, and both are load-bearing:
 *
 *   1. ANTI-VACUITY. "0 live sites" is precisely what a broken ancestor-walk
 *      also prints. Counting `$transaction` callbacks proves the tree parsed;
 *      it does NOT prove `enclosingTransactionCallback` can ever return
 *      non-null. Only a hit does that. If this sweep returns zero too, the
 *      predicate is exercised against the whole tree and the result is
 *      reported as UNVERIFIED rather than as a clean bill of health.
 *
 *   2. COVERAGE. The original 17 came from a list built for a different
 *      question. A site that is live TODAY and was never on that list would be
 *      invisible to a re-verification that only re-checks the 17.
 */
export function sweepTransactionEnclosedCatches() {
  const hits: Array<{ file: string; line: number; fn: string; dbOpsAfter: number }> = [];
  for (const abs of FILES) {
    const sf = parse(abs);
    for (const t of swallowingTries(sf)) {
      if (!enclosingTransactionCallback(t)) continue;
      // Does DB work follow the try inside the same transaction callback?
      const cb = enclosingTransactionCallback(t)!;
      const cbFn = cb.arguments.find((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a))!;
      const tryEnd = t.getEnd();
      let after = 0;
      const scan = (n: ts.Node) => {
        if (n.getStart(sf) >= tryEnd && ts.isCallExpression(n)) {
          const e = n.expression;
          if (ts.isPropertyAccessExpression(e) && /^(create|createMany|update|updateMany|upsert|delete|deleteMany|findFirst|findUnique|findMany|count|aggregate|groupBy)$/.test(e.name.text)) {
            after++;
          }
        }
        ts.forEachChild(n, scan);
      };
      scan(cbFn);
      const { line } = sf.getLineAndCharacterOfPosition(t.getStart(sf));
      hits.push({ file: rel(abs), line: line + 1, fn: enclosingFunctionName(t), dbOpsAfter: after });
    }
  }
  return hits;
}

/**
 * ─── SYNTHETIC POSITIVE CONTROL ────────────────────────────────────────────
 *
 * The repo-wide sweep returns ZERO, which is the finding — and it is also
 * exactly what a broken ancestor-walk returns. With no real hit anywhere on
 * the tree, nothing has demonstrated that `enclosingTransactionCallback` is
 * even capable of returning non-null, so "0 live" would rest on an unexercised
 * predicate. quick-546's rule: the failure mode of a bad source scan is GREEN.
 *
 * So the predicate is driven against two hand-written fixtures parsed from
 * strings — no disk, no fixture file to drift:
 *
 *   POSITIVE — a swallowing catch INSIDE a $transaction callback. Must be
 *              detected, or the "0 live" result is void.
 *   NEGATIVE — the `try { await p.$transaction(...) } catch {}` shape, i.e.
 *              false positive (A) and the real `gps-ping` structure. Must NOT
 *              be detected, or every wrapped transaction in the app would be
 *              misreported as live and the fix would be a large wrong diff.
 *
 * BOTH halves are required. The positive alone is satisfied by a predicate
 * that returns true for everything; the negative alone by one that returns
 * false for everything.
 */
export function selfTest(): { positiveDetected: boolean; negativeRejected: boolean } {
  const POSITIVE = `
    async function f(prisma: any) {
      await prisma.$transaction(async (tx: any) => {
        await tx.a.create({ data: {} });
        try { await tx.b.update({ where: {}, data: {} }); } catch { /* swallowed */ }
        await tx.c.create({ data: {} });
      });
    }
  `;
  const NEGATIVE = `
    async function g(prisma: any) {
      try {
        await prisma.$transaction(async (tx: any) => { await tx.b.update({ where: {}, data: {} }); });
      } catch { /* swallowed */ }
      await prisma.c.create({ data: {} });
    }
  `;
  const check = (src: string) => {
    const sf = ts.createSourceFile('fixture.ts', src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    const tries = swallowingTries(sf);
    if (tries.length !== 1) throw new Error(`fixture should hold exactly 1 swallowing try, found ${tries.length}`);
    return {
      inside: enclosingTransactionCallback(tries[0]) !== null,
      wraps: tryBlockContainsTransactionCall(tries[0]),
    };
  };
  const pos = check(POSITIVE);
  const neg = check(NEGATIVE);
  return {
    positiveDetected: pos.inside === true && pos.wraps === false,
    negativeRejected: neg.inside === false && neg.wraps === true,
  };
}

function main() {
  const self = selfTest();
  console.log(
    `SELF-TEST  positive detected: ${self.positiveDetected}   negative rejected: ${self.negativeRejected}`,
  );
  if (!self.positiveDetected || !self.negativeRejected) {
    console.error('611-transaction-scope: SELF-TEST FAILED — the predicate is unsound; every verdict below would be meaningless.');
    process.exit(1);
  }
  console.log('');

  const results = SITES.map(resolveSite);
  const sweep = sweepTransactionEnclosedCatches();

  // Anti-vacuity: the analyser must have actually parsed a real tree, and the
  // predicate must be able to answer YES somewhere — otherwise "0 live" is
  // indistinguishable from a broken walker (quick-546's rule).
  const totalTxCallbacks = FILES.reduce((acc, abs) => {
    const sf = parse(abs);
    let n = 0;
    const visit = (node: ts.Node) => {
      if (isTransactionCall(node)) n += node.arguments.filter((a) => ts.isArrowFunction(a) || ts.isFunctionExpression(a)).length;
      ts.forEachChild(node, visit);
    };
    visit(sf);
    return acc + n;
  }, 0);

  console.log(`files scanned            : ${FILES.length}`);
  console.log(`$transaction callbacks   : ${totalTxCallbacks}   <- anti-vacuity counter`);
  console.log('');
  console.log('| id | kind | site | enclosing fn | own tx? | try wraps tx? | callers in tx | VERDICT |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.id} | ${r.kind} | \`${r.resolvedPath ?? r.path}:${r.resolvedLine ?? '?'}\` | \`${r.enclosingFn}\` | ` +
        `${r.ownTransaction ? 'YES' : 'no'} | ${r.catchWrapsTransaction ? 'YES' : 'no'} | ` +
        `${r.callersInTransaction.length}/${r.callers.length} | **${r.verdict}** |`,
    );
  }
  console.log('');
  for (const v of ['LIVE', 'DORMANT', 'IMPOSSIBLE', 'UNRESOLVED'] as Verdict[]) {
    const n = results.filter((r) => r.verdict === v).length;
    console.log(`${v.padEnd(11)}: ${n}`);
  }

  console.log('');
  console.log(`REPO-WIDE SWEEP — swallowing try/catch INSIDE a $transaction callback: ${sweep.length}`);
  for (const h of sweep) {
    console.log(`  ${h.file}:${h.line}  ${h.fn}  (db ops after the catch, inside the same tx: ${h.dbOpsAfter})`);
  }
  console.log('');
  console.log(
    sweep.length > 0
      ? 'PREDICATE VERIFIED BY A REAL HIT on this tree, as well as by the self-test.'
      : 'NO REAL HIT ANYWHERE ON THIS TREE — which is the finding, and is why the SELF-TEST above is load-bearing: ' +
        'it is the only thing that exercises the predicate in the positive direction, so "0 live" is a measurement ' +
        'rather than an unexercised walker returning false for everything.',
  );

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    resolve(EVIDENCE_DIR, '01-site-scope.json'),
    JSON.stringify(
      { at: new Date().toISOString(), filesScanned: FILES.length, totalTxCallbacks, selfTest: self, realHits: sweep.length, results, sweep },
      null,
      2,
    ),
  );
  console.log(`\nwrote 01-site-scope.json`);
}

if (require.main === module) main();
