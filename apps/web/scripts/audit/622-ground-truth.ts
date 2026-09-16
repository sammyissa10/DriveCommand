/**
 * quick-622 — GROUND TRUTH and RECONCILIATION for the query census.
 *
 *   npx tsx scripts/audit/622-ground-truth.ts --census <head.json> --prefix <prefix-layout.json> [--out <file>]
 *
 * The census's totals are not trusted until it finds, per item, three sets a previous method MISSED:
 *   GT1  (owner)/layout.tsx's 3 statements — invisible to quick-616's flag census (0 of 3). At HEAD they are
 *        scoped (quick-621's fix); against the PRE-FIX file (a census run with
 *        --override "src/app/(owner)/layout.tsx=37e0bb17^") they must be 3 × BARE × SILENT_ZERO_AT_CUTOVER.
 *   GT2  quick-618's 56 findUnique hazards — every site found, and its receiver class agreeing with 618's
 *        (LIVE → tenant client, LATENT → bare, N/A → admin), INCLUDING the three digest payloads whose client
 *        arrives as a PARAMETER (the shape that hid them from quick-617's scan).
 *   GT3  quick-615's Route `_count` site — `(admin)/actions/tenants.ts`, a Tenant read whose table reach must
 *        include Route (and User, Truck) though no `prisma.route.` appears in the file.
 * Every check prints PASS / FAIL with its detail; any FAIL exits 1. Run it against a --break-resolver census
 * to witness it red.
 *
 * RECONCILIATION (never averaged):
 *   R1  the FLAG method (quick-616's walker, replicated: innermost call / tagged template whose own literal
 *       children contain `app.bypass_rls`) at HEAD — the "45 remaining" — against this census's flag column
 *   R2  quick-621's 125 BLIND_RLS units (committed evidence) mapped to census statements
 *   R3  this census's cutover-gating statements that quick-621's inventory did NOT count, and why
 *   R4  quick-616's 177 → today, per file, by the flag method
 */
import * as ts from 'typescript';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { resolve, relative, sep } from 'path';

const WEB = resolve(__dirname, '..', '..');
const REPO = resolve(WEB, '..', '..');
const SRC = resolve(WEB, 'src');
const posix = (p: string) => p.split(sep).join('/');
const arg = (k: string) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : undefined; };
const Q616 = resolve(REPO, '.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.json');
const Q618 = resolve(REPO, '.planning/quick/618-fix-the-withtenantrls-findunique-post-ch/evidence/01-census.json');
const Q621 = resolve(REPO, '.planning/quick/621-sweep-layouts-templates-middleware-provi/evidence/03-bare-client-inventory-after.json');
const Q618_CLOSE = 'd456c08b';

type S = {
  id: string; file: string; line: number; shape: string; model: string | null; op: string; client: string; clientChain: string[];
  verdict: string; tables: string[]; rlsTables: string[]; failure: string; bypassFlag: boolean; isGucPlumbing: boolean; txLine: number | null;
  surface: string; tenantSource: string; armVerdicts: string[]; syntacticTxLine: number | null;
};
const load = (p: string) => JSON.parse(readFileSync(resolve(p), 'utf8')) as { statements: S[] };
const head = load(arg('--census')!);
const prefix = arg('--prefix') ? load(arg('--prefix')!) : null;
const Hq = head.statements.filter((s) => !s.isGucPlumbing);
const GATING = new Set(['SILENT_ZERO_AT_CUTOVER', 'BROKEN_UNDER_APP_USER', 'NO_POLICY_TABLE']);

const checks: { id: string; name: string; pass: boolean; detail: string }[] = [];
const check = (id: string, name: string, pass: boolean, detail: string) => checks.push({ id, name, pass, detail });
const srcs = (s: S) => s.clientChain.map((c) => c.replace(/^TX\((.*)\)$/, '$1'));

// ── anti-vacuity ────────────────────────────────────────────────────────────
check('AV1', 'FLOOR — at least 1500 query statements', Hq.length >= 1500, `${Hq.length}`);
const unresolved = Hq.filter((s) => s.verdict.startsWith('UNCLASSIFIED')).length;
check('AV2', 'RESOLVER ALIVE — fewer than 5% of queries unclassified', unresolved < Hq.length * 0.05, `${unresolved} of ${Hq.length}`);

// ── GT1 ─────────────────────────────────────────────────────────────────────
const LAYOUT = 'src/app/(owner)/layout.tsx';
const want3 = ['ActivationProgress', 'Tenant', 'User'];
const hl = Hq.filter((s) => s.file === LAYOUT);
check('GT1a', `${LAYOUT} at HEAD: exactly 3 statements`, hl.length === 3, hl.map((s) => `${s.line}:${s.shape}`).join(', '));
check('GT1b', `${LAYOUT} at HEAD: all 3 SCOPED (quick-621's fix)`, hl.length === 3 && hl.every((s) => s.verdict === 'SCOPED'), hl.map((s) => `${s.shape}=${s.client}/${s.verdict}`).join(', '));
check('GT1c', `${LAYOUT} at HEAD: reaches Tenant, ActivationProgress, User`, want3.every((t) => hl.some((s) => s.tables.includes(t))), JSON.stringify(hl.map((s) => s.tables)));
if (prefix) {
  const pl = prefix.statements.filter((s) => !s.isGucPlumbing && s.file === LAYOUT);
  check('GT1d', `${LAYOUT} PRE-FIX (37e0bb17^): exactly 3 statements`, pl.length === 3, pl.map((s) => `${s.line}:${s.shape}`).join(', '));
  check('GT1e', `${LAYOUT} PRE-FIX: all 3 BARE and SILENT_ZERO_AT_CUTOVER`, pl.length === 3 && pl.every((s) => s.client === 'BARE' && s.verdict === 'SILENT_ZERO_AT_CUTOVER'), pl.map((s) => `${s.line}=${s.client}/${s.verdict}`).join(', '));
  check('GT1f', `${LAYOUT} PRE-FIX: reaches Tenant, ActivationProgress, User`, want3.every((t) => pl.some((s) => s.tables.includes(t))), JSON.stringify(pl.map((s) => s.tables)));
  check('GT1g', `${LAYOUT} PRE-FIX: all 3 SWALLOWED (the catch {} quick-621 removed)`, pl.length === 3 && pl.every((s) => s.failure === 'SWALLOWED'), pl.map((s) => s.failure).join(', '));
  const pqOther = prefix.statements.filter((s) => !s.isGucPlumbing && s.file !== LAYOUT).length;
  check('GT1h', 'PRE-FIX run differs from HEAD only in the layout', pqOther === Hq.filter((s) => s.file !== LAYOUT).length, `${pqOther} vs ${Hq.filter((s) => s.file !== LAYOUT).length}`);
} else {
  check('GT1d', 'PRE-FIX census supplied (--prefix)', false, 'missing');
}

// ── GT2 ─────────────────────────────────────────────────────────────────────
const q618 = JSON.parse(readFileSync(Q618, 'utf8'));
const sites618 = [
  ...q618.live.map((x: any) => ({ ...x, cls: 'LIVE' })),
  ...q618.latent.map((x: any) => ({ ...x, cls: 'LATENT' })),
  ...q618.notApplicable.map((x: any) => ({ ...x, cls: 'NA' })),
] as { file: string; line: number; op: string; model: string; cls: string; recv: string }[];
check('GT2a', "quick-618's committed list has 56 sites", sites618.length === 56, `${sites618.length}`);
const changedSince618 = new Set(
  execFileSync('git', ['diff', '--name-only', Q618_CLOSE, 'HEAD', '--', 'apps/web/src'], { cwd: REPO, encoding: 'utf8' })
    .split('\n').filter(Boolean).map((f) => f.replace(/^apps\/web\//, '')),
);
const gt2: any[] = [];
const used = new Set<string>();
for (const site of sites618) {
  const cands = Hq.filter((s) => s.file === site.file && s.op === site.op && s.model === site.model && !used.has(s.id));
  let hit: S | undefined;
  let how = '';
  if (!changedSince618.has(site.file)) { hit = cands.find((s) => s.line === site.line); how = 'exact line (file unchanged since 618)'; }
  else {
    hit = cands.sort((a, b) => Math.abs(a.line - site.line) - Math.abs(b.line - site.line))[0];
    how = hit ? `nearest same model+op, ${hit.line - site.line >= 0 ? '+' : ''}${hit.line - site.line} lines (file changed since 618)` : 'no candidate';
  }
  if (hit) used.add(hit.id);
  let classOk = false, classNote = '';
  if (hit) {
    const ss = srcs(hit);
    if (site.cls === 'LIVE') classOk = ss.every((x) => x === 'TENANT_SESSION' || x === 'TENANT_ORG');
    if (site.cls === 'NA') classOk = ss.every((x) => x === 'ADMIN');
    if (site.cls === 'LATENT') {
      classOk = ss.includes('BARE');
      if (!classOk && changedSince618.has(site.file) && ss.every((x) => x.startsWith('TENANT_'))) { classOk = true; classNote = 'routed to a tenant client after 618 (file changed since)'; }
    }
  }
  gt2.push({ ...site, found: !!hit, how, censusId: hit?.id, censusClient: hit?.client, censusVerdict: hit?.verdict, classOk, classNote });
}
const missing = gt2.filter((g) => !g.found);
const mismatched = gt2.filter((g) => g.found && !g.classOk);
check('GT2b', "all 56 of quick-618's findUnique hazards found", missing.length === 0, missing.length ? missing.map((m) => `${m.file}:${m.line}`).join(', ') : '56/56');
check('GT2c', "receiver class agrees with quick-618 on all 56", mismatched.length === 0, mismatched.length ? mismatched.map((m) => `${m.file}:${m.line} 618=${m.cls} census=${m.censusClient}`).join('; ') : `56/56 (${gt2.filter((g) => g.classNote).length} routed since 618)`);
const digests = gt2.filter((g) => /notifications\/digests\//.test(g.file));
check('GT2d', 'the three PARAMETER-passed digest sites resolve to TENANT_ORG', digests.length === 3 && digests.every((d) => d.censusClient === 'TENANT_ORG'), digests.map((d) => `${d.file.split('/').pop()}:${d.line}=${d.censusClient}`).join(', '));

// ── GT3 ─────────────────────────────────────────────────────────────────────
const TEN = 'src/app/(admin)/actions/tenants.ts';
const tenText = readFileSync(resolve(WEB, TEN), 'utf8').replace(/\r\n/g, '\n').split('\n');
const countLine = tenText.findIndex((l) => /_count:\s*\{\s*select:\s*\{\s*users:\s*true,\s*trucks:\s*true,\s*routes:\s*true/.test(l)) + 1;
const routeSite = Hq.filter((s) => s.file === TEN && s.model === 'Tenant' && s.line <= countLine && countLine - s.line < 25).sort((a, b) => b.line - a.line)[0];
check('GT3a', `${TEN}: the _count{users,trucks,routes} read is enumerated`, !!routeSite && countLine > 0, routeSite ? `${routeSite.id} (_count at :${countLine})` : `_count line ${countLine}, no enclosing Tenant statement`);
check('GT3b', 'its table reach includes Route, User and Truck', !!routeSite && ['Route', 'User', 'Truck'].every((t) => routeSite.tables.includes(t)), routeSite ? JSON.stringify(routeSite.tables) : '-');
check('GT3c', 'its client is the admin connection', !!routeSite && srcs(routeSite).every((x) => x === 'ADMIN'), routeSite?.client ?? '-');
const noRouteToken = !/\.route\./.test(tenText.join('\n'));
check('GT3d', 'no `.route.` delegate appears in the file (so a text grep could not see it)', noRouteToken, `${noRouteToken}`);

// ── R1: the flag method replicated at HEAD ──────────────────────────────────
const TEST_PATH = /(^|\/)(__tests__|__mocks__)\/|\.test\.tsx?$|\.spec\.tsx?$/;
function walk(dir: string, out: string[]) {
  for (const n of readdirSync(dir)) {
    const p = resolve(dir, n);
    if (statSync(p).isDirectory()) { if (n !== 'generated' && n !== 'node_modules') walk(p, out); }
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
}
const files: string[] = [];
walk(SRC, files);
type Flag = { file: string; line: number; txLine: number | null };
const flags: Flag[] = [];
for (const abs of files) {
  const file = posix(relative(WEB, abs));
  if (TEST_PATH.test(file)) continue;
  const text = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  if (!text.includes('app.bypass_rls')) continue;
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const ownLiteral = (n: ts.Node) => {
    let hit = false;
    ts.forEachChild(n, (c) => {
      const scan = (x: ts.Node): void => {
        if (hit) return;
        if ((ts.isCallExpression(x) || ts.isTaggedTemplateExpression(x)) && x !== n) return; // a nested call owns its own literals
        if ((ts.isStringLiteralLike(x) || ts.isTemplateHead(x) || ts.isTemplateMiddle(x) || ts.isTemplateTail(x)) && (x as ts.LiteralLikeNode).text.includes('app.bypass_rls')) hit = true;
        ts.forEachChild(x, scan);
      };
      scan(c);
    });
    return hit;
  };
  const v = (n: ts.Node) => {
    if ((ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) && ownLiteral(n)) {
      let tx: ts.Node | undefined = n.parent;
      while (tx && !(ts.isCallExpression(tx) && ts.isPropertyAccessExpression(tx.expression) && tx.expression.name.text === '$transaction')) tx = tx.parent;
      flags.push({ file, line: sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1, txLine: tx ? sf.getLineAndCharacterOfPosition(tx.getStart(sf)).line + 1 : null });
    }
    ts.forEachChild(n, v);
  };
  v(sf);
}
const censusFlagPlumbing = head.statements.filter((s) => s.isGucPlumbing && s.bypassFlag);
const flagKeys = new Set(flags.map((f) => `${f.file}:${f.line}`));
const plumbKeys = new Set(censusFlagPlumbing.map((s) => `${s.file}:${s.line}`));
const flagOnly = flags.filter((f) => !plumbKeys.has(`${f.file}:${f.line}`));
const plumbOnly = censusFlagPlumbing.filter((s) => !flagKeys.has(`${s.file}:${s.line}`));
check('R1a', 'flag-method replica reproduces the published 45 remaining', flags.length === 45, `${flags.length} statements / ${new Set(flags.map((f) => f.file)).size} files`);
// what each flag statement PROTECTS: the census statements on its transaction (or, array form, in its file at that tx)
const protectedBy = flags.map((f) => {
  const qs = Hq.filter((s) => s.file === f.file && f.txLine !== null && s.txLine === f.txLine);
  return { ...f, queries: qs.length, verdicts: [...new Set(qs.map((q) => q.verdict))] };
});

// ── R2: quick-621's 125 ─────────────────────────────────────────────────────
const q621 = JSON.parse(readFileSync(Q621, 'utf8')) as { blindRls: { file: string; line: number; shape: string; tables: string[] }[]; units: { file: string; line: number; shape: string; category: string }[] };
check('R2a', "quick-621's committed BLIND_RLS list has 125 units", q621.blindRls.length === 125, `${q621.blindRls.length}`);
const r2 = q621.blindRls.map((u) => {
  const isTx = u.shape.startsWith('$transaction');
  const qs = Hq.filter((s) => s.file === u.file && (isTx ? s.syntacticTxLine === u.line : s.line === u.line && !s.syntacticTxLine));
  return { ...u, censusStatements: qs.length, censusVerdicts: [...new Set(qs.map((q) => q.verdict))], censusClients: [...new Set(qs.map((q) => q.client))] };
});
const r2unmatched = r2.filter((u) => u.censusStatements === 0);
const r2notGating = r2.filter((u) => u.censusStatements > 0 && !u.censusVerdicts.some((v) => GATING.has(v)));
const r2stmtsGating = r2.reduce((n, u) => n + Hq.filter((s) => s.file === u.file && (u.shape.startsWith('$transaction') ? s.syntacticTxLine === u.line : s.line === u.line && !s.syntacticTxLine) && GATING.has(s.verdict)).length, 0);

// ── R3: gating statements quick-621 did not count ───────────────────────────
const unitAt = new Map<string, { category: string; shape: string }>();
for (const u of q621.units) unitAt.set(`${u.file}:${u.line}`, u);
const gating = Hq.filter((s) => GATING.has(s.verdict));
const r3 = gating
  .filter((s) => !r2.some((u) => u.file === s.file && (u.shape.startsWith('$transaction') ? s.syntacticTxLine === u.line : s.line === u.line && !s.syntacticTxLine)))
  .map((s) => {
    const unit = unitAt.get(`${s.file}:${s.syntacticTxLine ?? s.line}`);
    let why: string;
    if (unit) why = `621 counted the unit but as ${unit.category}${unit.category === 'BLIND_NO_RLS' ? ' (staging RLS state or table-resolution difference)' : unit.category === 'BLIND_UNRESOLVED' ? ' (no table resolved — no relation traversal / dynamic SQL)' : ''}`;
    else why = 'receiver is not the file-locally imported `prisma` identifier (helper-returned, parameter, destructured, or a transaction opened elsewhere) — outside 621\'s method';
    return { id: s.id, client: s.client, verdict: s.verdict, why };
  });

// ── R4: quick-616's 177 by file ─────────────────────────────────────────────
const q616 = JSON.parse(readFileSync(Q616, 'utf8')) as { records: { file: string; line: number }[] };
const per616 = new Map<string, number>();
for (const r of q616.records) per616.set(r.file, (per616.get(r.file) ?? 0) + 1);
const perNow = new Map<string, number>();
for (const f of flags) perNow.set(f.file, (perNow.get(f.file) ?? 0) + 1);
const r4 = [...new Set([...per616.keys(), ...perNow.keys()])].sort().map((f) => ({ file: f, at616: per616.get(f) ?? 0, now: perNow.get(f) ?? 0 }));
const appeared = r4.filter((r) => r.now > r.at616);

const out = {
  generated: new Date().toISOString(),
  checks,
  gt2Sites: gt2,
  r1: {
    flagMethodAtHead: { statements: flags.length, files: new Set(flags.map((f) => f.file)).size },
    censusFlagSetConfigStatements: censusFlagPlumbing.length,
    flagMethodOnly: flagOnly,
    censusOnly: plumbOnly.map((s) => s.id),
    protectedQueriesPerFlag: protectedBy,
    queriesUnderAFlag: Hq.filter((s) => s.bypassFlag).length,
  },
  r2: {
    units: 125,
    unitsWithNoCensusStatement: r2unmatched,
    unitsWhoseStatementsAreNotGating: r2notGating,
    gatingStatementsInsideThe125Units: r2stmtsGating,
    all: r2,
  },
  r3: { gatingStatementsOutside621: r3.length, byReason: r3.reduce((o: Record<string, number>, x) => ((o[x.why] = (o[x.why] ?? 0) + 1), o), {}), statements: r3 },
  r4: { at616: q616.records.length, filesAt616: per616.size, now: flags.length, filesNow: perNow.size, filesWhereFlagsAppeared: appeared, perFile: r4 },
};
const OUT = arg('--out') ?? resolve(REPO, '.planning/quick/622-query-census-keyed-on-queries/evidence/02-ground-truth.json');
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');

for (const c of checks) console.log(`${c.pass ? 'PASS' : 'FAIL'}  ${c.id.padEnd(5)} ${c.name} — ${c.detail}`);
console.log(`R1 flag method at HEAD: ${flags.length} statements / ${new Set(flags.map((f) => f.file)).size} files; census flag set_config: ${censusFlagPlumbing.length}; flag-only ${flagOnly.length}; census-only ${plumbOnly.length}; queries under a flag: ${out.r1.queriesUnderAFlag}`);
console.log(`R2 621's 125: ${r2unmatched.length} unmatched, ${r2notGating.length} matched but not gating, ${r2stmtsGating} gating statements inside them`);
console.log(`R3 gating statements outside 621's 125: ${r3.length}`, JSON.stringify(out.r3.byReason));
console.log(`R4 616: ${q616.records.length} (post-616-routing) / ${per616.size} files → now ${flags.length} / ${perNow.size}; files where flags increased: ${appeared.length}`);
console.log(`wrote ${posix(relative(REPO, OUT))}`);
if (checks.some((c) => !c.pass)) process.exit(1);
