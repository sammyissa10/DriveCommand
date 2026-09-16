/**
 * quick-617 scratch — is the findUnique+top-level-select hazard MOBILE_API's, or
 * the programme's? RECEIVER-AWARE: the receiver identifier of each
 * `<recv>.<model>.findUnique(...)` is resolved against the file's own
 * `const <recv> = await getTenantPrisma*(...)` declarations, and against
 * `$transaction` callback parameters whose transaction runs on such a client.
 *
 * The file-level version of this scan reported 28 "live" sites and was WRONG:
 * `(owner)/actions/loads.ts:273` is on the BARE prisma client in a file that
 * also acquires a tenant client elsewhere. quick-602's rule, in a new instrument.
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync } from 'fs';
import { resolve, relative, sep } from 'path';
const WEB = resolve(process.cwd());
const SRC = resolve(WEB, 'src');
const posix = (p: string) => p.split(sep).join('/');
const rlsSrc = readFileSync(resolve(SRC, 'lib/db/extensions/tenant-rls.ts'), 'utf8').replace(/\r\n/g, '\n');
const st = rlsSrc.indexOf('const EXEMPT_MODELS = new Set([');
const EXEMPT = new Set([...rlsSrc.slice(st, rlsSrc.indexOf(']);', st)).matchAll(/'([^']+)'/g)].map((m) => m[1]));
if (EXEMPT.size === 0) throw new Error('EXEMPT lift failed');

const files: string[] = [];
(function walk(d: string) {
  for (const e of readdirSync(d)) {
    const f = resolve(d, e);
    if (statSync(f).isDirectory()) { if (e !== 'node_modules' && e !== 'generated') walk(f); }
    else if (/\.tsx?$/.test(e) && !/\.test\.|\.spec\.|__tests__/.test(posix(f))) files.push(f);
  }
})(SRC);

type Hit = { file: string; line: number; model: string; recv: string; onTenantClient: boolean };
const hits: Hit[] = [];
for (const full of files) {
  const text = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  if (!text.includes('findUnique')) continue;
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);

  // names bound to a tenant client, directly or as a $transaction callback param
  const tenantNames = new Set<string>();
  const seed = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      if (/getTenantPrisma(ForOrg)?\s*\(/.test(n.initializer.getText())) tenantNames.add(n.name.text);
    }
    n.forEachChild(seed);
  };
  seed(sf);
  const seedTx = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === '$transaction') {
      const recv = n.expression.expression.getText();
      const cb = n.arguments[0];
      if (tenantNames.has(recv) && cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))) {
        const p0 = cb.parameters[0];
        if (p0 && ts.isIdentifier(p0.name)) tenantNames.add(p0.name.text);
      }
    }
    n.forEachChild(seedTx);
  };
  seedTx(sf); seedTx(sf); // twice: a param can be seeded by a name seeded in pass 1

  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const op = n.expression.name.text;
      if (/^findUnique(OrThrow)?$/.test(op) && ts.isPropertyAccessExpression(n.expression.expression)) {
        const model = n.expression.expression.name.text;
        const recv = n.expression.expression.expression.getText();
        const P = model.charAt(0).toUpperCase() + model.slice(1);
        if (!EXEMPT.has(P)) {
          const arg = n.arguments[0];
          if (arg && ts.isObjectLiteralExpression(arg)) {
            const sel = arg.properties.find((p) => (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && ts.isIdentifier(p.name) && p.name.text === 'select');
            if (sel) {
              const t = ts.isPropertyAssignment(sel) ? sel.initializer.getText() : 'select';
              if (!/\btenantId\b/.test(t)) hits.push({ file: posix(relative(WEB, full)), line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1, model: P, recv, onTenantClient: tenantNames.has(recv) });
            }
          }
        }
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
}
const live = hits.filter((h) => h.onTenantClient);
const mobile = hits.filter((h) => h.file.startsWith('src/app/api/mobile/'));
console.log(`files scanned: ${files.length}  EXEMPT_MODELS lifted: ${EXEMPT.size}`);
console.log(`TOTAL findUnique + top-level select omitting tenantId, non-exempt model: ${hits.length}`);
console.log(`  LIVE TODAY (receiver resolves to a tenant client): ${live.length}`);
console.log(`  under api/mobile/ (POSITIVE CONTROL, expect >= 10): ${mobile.length}`);
console.log('--- LIVE TODAY ---');
for (const h of live) console.log(`  ${h.file}:${h.line}  ${h.model}  recv=${h.recv}`);

/*
 * ── WHY THIS SCRIPT EXISTS, AND WHAT IT MEASURED (quick-617) ────────────────
 *
 * MEASURED ON STAGING as app_user, tripwire armed, via
 * `617-routing-verify.ts --guc-probe`, on TWO independent models — a fixture row
 * on `DriverIncident` and a PRE-EXISTING row on `Truck`:
 *
 *     findUnique({ where: { id }, select: { id: true } })               -> null
 *     findUnique({ where: { id }, select: { id: true, tenantId: true }}) -> the row
 *     findUnique({ where: { id } })                                      -> the row
 *
 * ...for the row's OWN tenant. `withTenantRLS` cannot add `tenantId` to a
 * findUnique `where`, so it post-checks `result.tenantId !== tenantId`; a select
 * that omits the column makes that `undefined !== tenantId`, which is TRUE.
 *
 * The 10 hits under `api/mobile/**` are why quick-617 STOPPED AND REPORTED 8 of
 * its 47 files rather than routing them onto a client that would have made them
 * return "not found" for every request.
 *
 * The `LIVE TODAY` list is a SEPARATE and larger finding, reported and NOT fixed
 * by quick-617: those receivers already resolve to tenant clients. Note that a
 * FILE-level "does this file acquire a tenant client" flag is NOT good enough —
 * it reported 28 and was wrong, because `(owner)/actions/loads.ts` uses the bare
 * client in some functions and shadows the name with `const prisma = await
 * getTenantPrisma()` in others. quick-602's rule, in a new instrument.
 */
