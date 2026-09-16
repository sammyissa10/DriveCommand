/**
 * quick-621 — THE BARE-CLIENT INVENTORY: the class the quick-616 census cannot see.
 *
 *   npx tsx scripts/audit/621-bare-client-inventory.ts [--label before|after] [--break-visitor]
 *
 * quick-616's census walks for the LITERAL `app.bypass_rls` ("INNERMOST CallExpression /
 * TaggedTemplateExpression whose own literal children contain app.bypass_rls"). Its unit of
 * account is the FLAG, not the query. A query on the bare `prisma` client that never set the
 * flag produces no literal, so it is invisible to that walker in EVERY file kind — route
 * handler, page, layout, component or library. quick-620's `(owner)/layout.tsx` finding is one
 * instance: three unflagged bare `$queryRaw` reads, zero census rows.
 *
 * This walker counts the QUERY instead. A UNIT is one of:
 *   - `prisma.<model>.<op>(…)`                         (outside any prisma.$transaction)
 *   - `prisma.$queryRaw\`…\`` / `$executeRaw\`…\`` / `…Unsafe(…)`   (outside any prisma.$transaction)
 *   - `prisma.$transaction(…)` — one unit, callback or array form, covering everything inside
 * where `prisma` is the identifier bound by a named import of `prisma` (aliases followed) from a
 * module specifier ending in `db/prisma`.
 *
 * Each unit is classified by the tables it reaches (Prisma model -> @@map, or table names parsed
 * out of raw SQL) against staging's measured RLS state (evidence/03-staging-rls-tables.json):
 *   CENSUS_VISIBLE   the unit contains the app.bypass_rls literal — what quick-616 counted
 *   GUC_SCOPED       no flag, but the unit itself sets app.current_tenant_id (tenantRawQuery's shape)
 *   BLIND_RLS        no flag, reaches >= 1 RLS-forced table — raises TC001 / reads 0 rows as app_user
 *   BLIND_NO_RLS     no flag, reaches only tables with RLS off — harmless to the cutover
 *   BLIND_UNRESOLVED no flag, no table could be resolved (GUC plumbing, dynamic SQL) — listed, not guessed
 *
 * LIMITS, stated: a client obtained through a helper that RETURNS the bare client, or passed as a
 * parameter, is not followed (quick-618's parameter blind spot); a `tx` whose transaction was
 * opened on the bare client in another function is not followed. Both make the BLIND_RLS count a
 * FLOOR, not a ceiling. Tenant-in-scope is NOT inferred by this walker — step 2 of quick-621
 * establishes it by hand for the request-time special files.
 *
 * Anti-vacuity: floor on units; POSITIVE WITNESS `(owner)/layout.tsx` must yield exactly its
 * three BLIND_RLS raw reads before the fix (--label before) and zero after; COUNTER-ASSERTION
 * `lib/context/tenant-context.ts` was read. `--break-visitor` must turn it red.
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, relative, sep } from 'path';

const WEB = resolve(__dirname, '..', '..');
const SRC = resolve(WEB, 'src');
const EV = resolve(WEB, '../../.planning/quick/621-sweep-layouts-templates-middleware-provi/evidence');
const posix = (p: string) => p.split(sep).join('/');
const TEST_PATH = /(^|\/)__tests__\/|\.test\.tsx?$|\.spec\.tsx?$/;
const LABEL = (() => {
  const i = process.argv.indexOf('--label');
  return i >= 0 ? process.argv[i + 1] : 'before';
})();
const BREAK = process.argv.includes('--break-visitor');

// ── model -> table map from schema.prisma ──
const schema = readFileSync(resolve(WEB, 'prisma/schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
const modelTable = new Map<string, string>();
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const map = /@@map\("([^"]+)"\)/.exec(m[2]);
  modelTable.set(m[1].charAt(0).toLowerCase() + m[1].slice(1), map ? map[1] : m[1]);
}
const rls = JSON.parse(readFileSync(resolve(EV, '03-staging-rls-tables.json'), 'utf8')) as {
  rlsForcedWithPolicies: string[];
  noRls: string[];
  rlsNoPolicy: string[];
};
const RLS = new Set([...rls.rlsForcedWithPolicies, ...rls.rlsNoPolicy]);
const NO_RLS = new Set(rls.noRls);
const ALL_TABLES = new Set([...RLS, ...NO_RLS]);

function tablesInSql(sql: string): string[] {
  const out = new Set<string>();
  for (const m of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) {
    if (ALL_TABLES.has(m[1])) out.add(m[1]);
  }
  return [...out];
}

function fileKind(p: string): string {
  if (p === 'src/middleware.ts' || p === 'src/proxy.ts') return 'MIDDLEWARE';
  if (/^src\/instrumentation/.test(p)) return 'INSTRUMENTATION';
  if (/\/route\.tsx?$/.test(p)) return 'ROUTE_HANDLER';
  if (/\/(layout|template)\.tsx?$/.test(p)) return 'LAYOUT_OR_TEMPLATE';
  if (/\/(loading|error|global-error|not-found|default)\.tsx?$/.test(p)) return 'BOUNDARY';
  if (/\/page\.tsx?$/.test(p)) return 'PAGE';
  if (p.startsWith('src/app/') && /\/actions?(\/|\.tsx?$)/.test(p)) return 'SERVER_ACTION';
  if (p.startsWith('src/app/')) return 'APP_OTHER';
  if (p.startsWith('src/components/')) return 'COMPONENT';
  if (p.startsWith('src/actions/')) return 'SERVER_ACTION';
  if (p.startsWith('src/lib/') || p.startsWith('src/server/')) return 'LIBRARY';
  return 'OTHER';
}

type Unit = {
  file: string;
  line: number;
  kind: string;
  shape: string;
  tables: string[];
  category: 'CENSUS_VISIBLE' | 'GUC_SCOPED' | 'BLIND_RLS' | 'BLIND_NO_RLS' | 'BLIND_UNRESOLVED';
};

function walk(dir: string, out: string[]) {
  for (const n of readdirSync(dir)) {
    const p = resolve(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(n)) out.push(p);
  }
}

function literalText(node: ts.Node): string {
  let s = '';
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      s += ' ' + (n as ts.LiteralLikeNode).text;
    }
    ts.forEachChild(n, visit);
  };
  visit(node);
  return s;
}

function scanFile(abs: string): { units: Unit[]; bytes: number; parsed: boolean } {
  const text = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  const file = posix(relative(WEB, abs));
  const sf = ts.createSourceFile(abs, text, ts.ScriptTarget.Latest, true, abs.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const names = new Set<string>();
  for (const st of sf.statements) {
    if (!ts.isImportDeclaration(st) || !ts.isStringLiteral(st.moduleSpecifier)) continue;
    if (!/(^|\/)db\/prisma$/.test(st.moduleSpecifier.text)) continue;
    const nb = st.importClause?.namedBindings;
    if (nb && ts.isNamedImports(nb)) {
      for (const el of nb.elements) if ((el.propertyName ?? el.name).text === 'prisma') names.add(el.name.text);
    }
  }
  const units: Unit[] = [];
  if (names.size === 0 || BREAK) return { units, bytes: text.length, parsed: true };

  const rootIsPrisma = (e: ts.Expression): boolean => {
    let cur: ts.Expression = e;
    while (ts.isPropertyAccessExpression(cur) || ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = (cur as ts.PropertyAccessExpression | ts.NonNullExpression | ts.ParenthesizedExpression).expression;
    }
    return ts.isIdentifier(cur) && names.has(cur.text);
  };
  const isPrismaTx = (n: ts.Node): n is ts.CallExpression =>
    ts.isCallExpression(n) &&
    ts.isPropertyAccessExpression(n.expression) &&
    n.expression.name.text === '$transaction' &&
    rootIsPrisma(n.expression.expression);

  const add = (node: ts.Node, shape: string, tables: string[]) => {
    const lit = literalText(node);
    const flagged = lit.includes('app.bypass_rls');
    // A bare transaction that sets the tenant GUC itself (tenantRawQuery's shape) is scoped, not blind.
    const gucScoped = !flagged && lit.includes('app.current_tenant_id');
    const uniq = [...new Set(tables)];
    const category: Unit['category'] = flagged
      ? 'CENSUS_VISIBLE'
      : gucScoped
        ? 'GUC_SCOPED'
        : uniq.some((t) => RLS.has(t))
        ? 'BLIND_RLS'
        : uniq.length > 0
          ? 'BLIND_NO_RLS'
          : 'BLIND_UNRESOLVED';
    units.push({
      file,
      line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
      kind: fileKind(file),
      shape,
      tables: uniq,
      category,
    });
  };

  const modelsAndSqlIn = (node: ts.Node): string[] => {
    const t: string[] = [];
    const v = (n: ts.Node) => {
      if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) === false && ts.isPropertyAccessExpression(n.expression) === false) {
        /* fallthrough */
      }
      if (ts.isPropertyAccessExpression(n)) {
        const tbl = modelTable.get(n.name.text);
        // tx.<model>.<op> or prisma.<model>.<op>: the model is the middle name of a 3-part chain
        if (tbl && ts.isPropertyAccessExpression(n.parent) && ts.isCallExpression(n.parent.parent)) t.push(tbl);
      }
      if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) t.push(...tablesInSql(literalText(n)));
      ts.forEachChild(n, v);
    };
    v(node);
    return t;
  };

  const visit = (n: ts.Node, insideTx: boolean) => {
    if (isPrismaTx(n)) {
      add(n, n.arguments[0] && ts.isArrayLiteralExpression(n.arguments[0]) ? '$transaction([…])' : '$transaction(cb)', modelsAndSqlIn(n));
      ts.forEachChild(n, (c) => visit(c, true));
      return;
    }
    if (!insideTx) {
      if (ts.isTaggedTemplateExpression(n) && ts.isPropertyAccessExpression(n.tag) && rootIsPrisma(n.tag) && /^\$(query|execute)Raw$/.test(n.tag.name.text)) {
        add(n, n.tag.name.text + '``', tablesInSql(literalText(n.template)));
      } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && rootIsPrisma(n.expression)) {
        const op = n.expression.name.text;
        const inner = n.expression.expression;
        if (/^\$(query|execute)Raw(Unsafe)?$/.test(op)) {
          add(n, op + '()', tablesInSql(literalText(n)));
        } else if (ts.isPropertyAccessExpression(inner) && ts.isIdentifier(inner.expression) && names.has(inner.expression.text)) {
          const tbl = modelTable.get(inner.name.text);
          if (tbl) add(n, `${inner.name.text}.${op}`, [tbl]);
        }
      }
    }
    ts.forEachChild(n, (c) => visit(c, insideTx));
  };
  visit(sf, false);
  return { units, bytes: text.length, parsed: true };
}

function main() {
  const files: string[] = [];
  walk(SRC, files);
  const shipping = files.filter((f) => !TEST_PATH.test(posix(relative(WEB, f))));
  const all: Unit[] = [];
  for (const f of shipping) all.push(...scanFile(f).units);

  const byCat: Record<string, number> = {};
  const byKindCat: Record<string, Record<string, number>> = {};
  const filesByKindCat: Record<string, Record<string, Set<string>>> = {};
  for (const u of all) {
    byCat[u.category] = (byCat[u.category] ?? 0) + 1;
    byKindCat[u.kind] ??= {};
    byKindCat[u.kind][u.category] = (byKindCat[u.kind][u.category] ?? 0) + 1;
    filesByKindCat[u.kind] ??= {};
    (filesByKindCat[u.kind][u.category] ??= new Set()).add(u.file);
  }

  const checks: { name: string; pass: boolean; detail: string }[] = [];
  checks.push({ name: 'FLOOR — at least 100 bare-client units', pass: all.length >= 100, detail: `${all.length}` });
  const layout = all.filter((u) => u.file === 'src/app/(owner)/layout.tsx' && u.category === 'BLIND_RLS');
  const expectLayout = LABEL === 'before' ? 3 : 0;
  checks.push({
    name: `POSITIVE WITNESS (owner)/layout.tsx BLIND_RLS === ${expectLayout} (${LABEL})`,
    pass: layout.length === expectLayout,
    detail: `${layout.length} at lines [${layout.map((u) => u.line).join(', ')}] tables ${JSON.stringify(layout.map((u) => u.tables))}`,
  });
  const cPath = resolve(SRC, 'lib/context/tenant-context.ts');
  const c = scanFile(cPath);
  checks.push({ name: 'COUNTER-ASSERTION lib/context/tenant-context.ts WAS READ', pass: c.bytes > 1000 && c.parsed, detail: `bytes=${c.bytes}` });
  const flagVisible = all.filter((u) => u.category === 'CENSUS_VISIBLE').length;
  checks.push({ name: 'CENSUS_VISIBLE > 0 (the walker sees flagged units at all)', pass: flagVisible > 0, detail: `${flagVisible}` });

  const out = {
    generated: new Date().toISOString(),
    label: LABEL,
    method: 'see header — ts.createSourceFile per file, no Program; units rooted at the imported `prisma` identifier; tables via schema @@map + raw-SQL FROM/JOIN/INTO/UPDATE; RLS state measured on staging',
    totals: { units: all.length, filesScanned: shipping.length, byCategory: byCat },
    byFileKind: Object.fromEntries(
      Object.entries(byKindCat).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v).map(([cat, n]) => [cat, { units: n, files: filesByKindCat[k][cat].size }])),
      ]),
    ),
    antiVacuity: checks,
    blindRls: all.filter((u) => u.category === 'BLIND_RLS'),
    blindUnresolved: all.filter((u) => u.category === 'BLIND_UNRESOLVED'),
    units: all,
  };
  if (!BREAK) {
    mkdirSync(EV, { recursive: true });
    writeFileSync(resolve(EV, `03-bare-client-inventory-${LABEL}.json`), JSON.stringify(out, null, 2) + '\n');
  }
  console.log(`bare-client units: ${all.length} in ${shipping.length} files scanned`);
  console.log('by category:', JSON.stringify(byCat));
  console.log('by file kind (units / files):');
  for (const [k, v] of Object.entries(out.byFileKind).sort()) {
    console.log(`  ${k.padEnd(20)} ${Object.entries(v).map(([cat, x]) => `${cat} ${x.units}u/${x.files}f`).join(' · ')}`);
  }
  for (const ch of checks) console.log(`  ${ch.pass ? 'PASS' : 'FAIL'}  ${ch.name} — ${ch.detail}`);
  if (checks.some((ch) => !ch.pass)) process.exit(1);
}

main();
