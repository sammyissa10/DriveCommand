/**
 * quick-618 — THE REPO-WIDE `app.bypass_rls` REMAINDER, MEASURED.
 *
 *   npx tsx scripts/audit/618-repo-remainder.ts
 *
 * WHY NOT JUST RE-RUN `616-bypass-census.ts` OR `617-repo-remainder.ts`
 * ---------------------------------------------------------------------
 * Each writes into ITS OWN task's evidence directory — `616` into quick-616's
 * `01-census.json`, `617` into quick-617's `06-repo-remainder.json`. Re-running
 * either would overwrite a closed task's artefact, byte-for-byte the destruction
 * quick-610 documented for `604-click-through.ts`'s passes 1 and 2. This file is
 * a copy of `617-repo-remainder.ts` with the evidence path, the counter-assertion
 * target and the arithmetic changed, and NOTHING ELSE: the METHOD is deliberately
 * identical so the two numbers are comparable rather than merely similar.
 *
 * The counter-assertion target moves to a file THIS task routed —
 * `owner/trucks/[id]/scheduled-service/route.ts`, which carried 3 of the 16 —
 * because quick-617's target has been zero since that task and would no longer
 * be evidence that this one did anything.
 *
 * METHOD — identical to `616-bypass-census.ts`: `ts.createSourceFile`, no
 * `Program`, no type checker; a STATEMENT is the INNERMOST `CallExpression` /
 * `TaggedTemplateExpression` whose own literal children contain
 * `app.bypass_rls`. Comments are not AST nodes. Test paths excluded and reported
 * separately, matching the census's scope exactly.
 *
 * ANTI-VACUITY — a "zero" with no paired non-zero is not a measurement (H-bis)
 * ---------------------------------------------------------------------------
 *   FLOOR           total >= 50 statements (the expected answer is 92; a floor
 *                   well below it catches a broken walker without pinning it).
 *   POSITIVE CTRL   `lib/auth/supabase.ts` still yields its ARRAY-FORM statement
 *                   — the shape a callback-only walker silently drops.
 *   COUNTER-ASRT    `api/mobile/driver/incidents/route.ts` — routed by this task
 *                   — is CONFIRMED READ (bytes > 0, parsed, acquires a tenant
 *                   client) and yields EXACTLY ZERO. Both halves, or the guard
 *                   is decorative.
 *   ARITHMETIC      the census's 175 at task start, minus this task's 67, must
 *                   equal the measured remainder. Published measured-vs-expected
 *                   EITHER WAY — a difference is a finding, not an error.
 */

import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, relative, sep } from 'path';

const BYPASS_LITERAL = 'app.bypass_rls';
const WEB_ROOT = resolve(__dirname, '..', '..');
const SRC_ROOT = resolve(WEB_ROOT, 'src');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning/quick/618-fix-the-withtenantrls-findunique-post-ch/evidence',
);
const posix = (p: string) => p.split(sep).join('/');
const TEST_PATH = /(^|[\\/])__tests__[\\/]|\.test\.tsx?$|\.spec\.tsx?$/;

const SURFACE_RULES: { surface: string; test: (p: string) => boolean }[] = [
  { surface: 'DRIVER_PORTAL', test: (p) => p.startsWith('src/app/(driver)/') },
  { surface: 'OWNER_PORTAL', test: (p) => p.startsWith('src/app/(owner)/') },
  { surface: 'MOBILE_API', test: (p) => p.startsWith('src/app/api/mobile/') },
  {
    surface: 'LIB_SERVICES',
    test: (p) => p.startsWith('src/lib/') || p.startsWith('src/server/') || p.startsWith('src/actions/'),
  },
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
const surfaceFor = (rel: string) =>
  SURFACE_RULES.find((r) => r.test(posix(rel)))?.surface ?? `UNCLASSIFIED:${posix(rel)}`;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = resolve(dir, e);
    if (statSync(f).isDirectory()) {
      if (e !== 'node_modules' && e !== 'generated') walk(f, out);
    } else if (/\.tsx?$/.test(e)) out.push(f);
  }
  return out;
}

type Stmt = { file: string; line: number; surface: string; inArrayForm: boolean };

function scan(full: string): { stmts: Stmt[]; bytes: number; parsed: boolean; prose: number } {
  const rel = posix(relative(WEB_ROOT, full));
  const text = readFileSync(full, 'utf8').replace(/\r\n/g, '\n'); // CRLF first (quick-546)
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);
  const cands: { node: ts.Node; start: number; end: number }[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) || ts.isTaggedTemplateExpression(n)) {
      let sql = '';
      const collect = (x: ts.Node) => {
        if (
          ts.isStringLiteral(x) ||
          ts.isNoSubstitutionTemplateLiteral(x) ||
          ts.isTemplateHead(x) ||
          ts.isTemplateMiddle(x) ||
          ts.isTemplateTail(x)
        )
          sql += x.text;
        x.forEachChild(collect);
      };
      if (ts.isCallExpression(n)) n.arguments.forEach(collect);
      else collect((n as ts.TaggedTemplateExpression).template);
      if (sql.includes(BYPASS_LITERAL)) cands.push({ node: n, start: n.getStart(), end: n.getEnd() });
    }
    n.forEachChild(visit);
  };
  visit(sf);
  const stmts = cands
    .filter(
      (c) =>
        !cands.some(
          (o) => o !== c && o.start >= c.start && o.end <= c.end && (o.start > c.start || o.end < c.end),
        ),
    )
    .map(({ node }) => {
      let inArray = false;
      let p: ts.Node | undefined = node.parent;
      for (let i = 0; i < 4 && p; i++, p = p.parent) if (ts.isArrayLiteralExpression(p)) { inArray = true; break; }
      return {
        file: rel,
        line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        surface: surfaceFor(rel),
        inArrayForm: inArray,
      };
    })
    .sort((a, b) => a.line - b.line);
  return {
    stmts,
    bytes: Buffer.byteLength(text),
    parsed: sf.statements.length > 0,
    prose: text.split(BYPASS_LITERAL).length - 1 - stmts.length,
  };
}

function main() {
  const shipping: Stmt[] = [];
  const tests: Stmt[] = [];
  for (const f of walk(SRC_ROOT)) {
    const rel = posix(relative(WEB_ROOT, f));
    const text = readFileSync(f, 'utf8');
    if (!text.includes(BYPASS_LITERAL)) continue;
    const s = scan(f);
    (TEST_PATH.test(rel) ? tests : shipping).push(...s.stmts);
  }

  const files = [...new Set(shipping.map((s) => s.file))];
  const bySurface: Record<string, { files: number; statements: number }> = {};
  for (const s of shipping) {
    bySurface[s.surface] ??= { files: 0, statements: 0 };
    bySurface[s.surface].statements += 1;
  }
  for (const surf of Object.keys(bySurface)) {
    bySurface[surf].files = new Set(shipping.filter((s) => s.surface === surf).map((s) => s.file)).size;
  }

  // ---- anti-vacuity -------------------------------------------------------
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  checks.push({
    name: 'FLOOR — total statements >= 50',
    pass: shipping.length >= 50,
    detail: `${shipping.length} >= 50`,
  });
  const arr = shipping.filter((s) => s.file === 'src/lib/auth/supabase.ts' && s.inArrayForm);
  checks.push({
    name: 'POSITIVE CONTROL — lib/auth/supabase.ts still yields its ARRAY-FORM statement',
    pass: arr.length >= 1,
    detail: `${arr.length} array-form at lines [${arr.map((s) => s.line).join(', ')}] >= 1`,
  });
  const cPath = 'src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts';
  const cScan = scan(resolve(WEB_ROOT, cPath));
  const cText = readFileSync(resolve(WEB_ROOT, cPath), 'utf8');
  checks.push({
    name: `COUNTER-ASSERTION ${cPath} WAS READ`,
    pass: cScan.bytes > 0 && cScan.parsed && /getTenantPrismaForOrg\(/.test(cText),
    detail: `bytes=${cScan.bytes} parsed=${cScan.parsed} acquiresTenantClient=${/getTenantPrismaForOrg\(/.test(cText)}`,
  });
  checks.push({
    name: `COUNTER-ASSERTION ${cPath} YIELDS ZERO`,
    pass: cScan.stmts.length === 0,
    detail: `${cScan.stmts.length} === 0`,
  });

  const EXPECTED = 108 - 16;
  checks.push({
    name: 'ARITHMETIC — 108 at quick-618 start − 16 (the 8 stopped MOBILE_API files) = 92',
    pass: shipping.length === EXPECTED,
    detail: `measured ${shipping.length} vs expected ${EXPECTED}${shipping.length === EXPECTED ? '' : ' — A DIFFERENCE IS A FINDING, NOT AN ERROR'}`,
  });

  const out = {
    generated: new Date().toISOString(),
    method:
      'ts.createSourceFile per file, no Program, no type checker; INNERMOST CallExpression/TaggedTemplateExpression whose own literal children contain "app.bypass_rls". CRLF normalised. Test paths excluded and reported separately. Identical to 616-bypass-census.ts.',
    totals: { statements: shipping.length, files: files.length, testStatements: tests.length },
    arithmetic: {
      censusLivePopulationAt616: 177,
      routedBy616: 2,
      liveAt617Start: 175,
      routedBy617: 67, liveAt618Start: 108, routedBy618: 16,
      expectedRemaining: EXPECTED,
      measuredRemaining: shipping.length,
    },
    bySurface,
    antiVacuity: checks,
    statements: shipping,
  };
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(resolve(EVIDENCE_DIR, '04-repo-remainder.json'), JSON.stringify(out, null, 2) + '\n');

  console.log(`repo-wide remainder: ${shipping.length} statements in ${files.length} files (tests: ${tests.length}, excluded)`);
  console.log('by surface:');
  for (const [k, v] of Object.entries(bySurface).sort((a, b) => b[1].statements - a[1].statements)) {
    console.log(`  ${k.padEnd(20)} ${String(v.files).padStart(3)} files  ${String(v.statements).padStart(3)} statements`);
  }
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
  if (checks.filter((c) => !c.name.startsWith('ARITHMETIC')).some((c) => !c.pass)) process.exit(1);
}

main();
