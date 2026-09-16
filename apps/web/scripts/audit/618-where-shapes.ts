/**
 * quick-618 — what SHAPE of `where` do the hazard sites actually use?
 *
 *   npx tsx scripts/audit/618-where-shapes.ts
 *
 * The staging probe exercised `where: { id }`, the simplest form. The fix spreads
 * `tenantId` into whatever the caller passed, and Prisma's extendedWhereUnique
 * requires the where to still carry at least one UNIQUE identifier. A COMPOUND
 * unique (`where: { tenantId_slug: { … } }`) is a different shape from a single
 * `id`, and if any hazard site used one it would be a shape the probe never
 * tested — so it is worth measuring rather than assuming, before claiming the
 * extension fix closes every site.
 *
 * Reported by shape, with the compound-key sites named individually.
 */
import * as ts from 'typescript';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, relative, sep } from 'path';

const WEB = resolve(process.cwd());
const SRC = resolve(WEB, 'src');
const posix = (p: string) => p.split(sep).join('/');
const TEST_RE = /\.test\.|\.spec\.|__tests__|__mocks__/;

const rlsSrc = readFileSync(resolve(SRC, 'lib/db/extensions/tenant-rls.ts'), 'utf8').replace(
  /\r\n/g,
  '\n',
);
const st = rlsSrc.indexOf('const EXEMPT_MODELS = new Set([');
const EXEMPT = new Set(
  [...rlsSrc.slice(st, rlsSrc.indexOf(']);', st)).matchAll(/'([^']+)'/g)].map((m) => m[1]),
);

function walk(d: string, out: string[] = []): string[] {
  for (const e of readdirSync(d)) {
    const f = resolve(d, e);
    if (statSync(f).isDirectory()) {
      if (e !== 'node_modules' && e !== 'generated' && e !== '.next') walk(f, out);
    } else if (/\.tsx?$/.test(e)) out.push(f);
  }
  return out;
}

/** Prisma's compound-unique shorthand is a key whose value is an OBJECT literal. */
type Shape = 'SINGLE_SCALAR' | 'MULTI_SCALAR' | 'COMPOUND_UNIQUE' | 'NON_LITERAL';

const byShape: Record<Shape, { file: string; line: number; keys: string[] }[]> = {
  SINGLE_SCALAR: [],
  MULTI_SCALAR: [],
  COMPOUND_UNIQUE: [],
  NON_LITERAL: [],
};

for (const full of walk(SRC)) {
  const rel = posix(relative(WEB, full));
  if (TEST_RE.test(rel)) continue;
  const text = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  if (!text.includes('findUnique')) continue;
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);

  const visit = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      /^findUnique(OrThrow)?$/.test(n.expression.name.text) &&
      ts.isPropertyAccessExpression(n.expression.expression)
    ) {
      const model = n.expression.expression.name.text;
      const P = model.charAt(0).toUpperCase() + model.slice(1);
      const arg = n.arguments[0];
      if (!EXEMPT.has(P) && arg && ts.isObjectLiteralExpression(arg)) {
        const whereProp = arg.properties.find(
          (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === 'where',
        ) as ts.PropertyAssignment | undefined;
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        if (!whereProp || !ts.isObjectLiteralExpression(whereProp.initializer)) {
          byShape.NON_LITERAL.push({ file: rel, line, keys: [] });
        } else {
          const props = whereProp.initializer.properties;
          const keys = props
            .map((p) =>
              ts.isShorthandPropertyAssignment(p)
                ? p.name.text
                : ts.isPropertyAssignment(p) && ts.isIdentifier(p.name)
                  ? p.name.text
                  : '?',
            )
            .filter(Boolean);
          const compound = props.some(
            (p) => ts.isPropertyAssignment(p) && ts.isObjectLiteralExpression(p.initializer),
          );
          const shape: Shape = compound
            ? 'COMPOUND_UNIQUE'
            : keys.length === 1
              ? 'SINGLE_SCALAR'
              : 'MULTI_SCALAR';
          byShape[shape].push({ file: rel, line, keys });
        }
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
}

const total = Object.values(byShape).reduce((a, b) => a + b.length, 0);
if (total < 20) throw new Error(`floor: only ${total} sites found — walker is broken`);

console.log(`findUnique/findUniqueOrThrow on non-exempt models: ${total}`);
for (const [shape, rows] of Object.entries(byShape)) {
  console.log(`  ${shape.padEnd(16)} ${rows.length}`);
}
console.log('\nCOMPOUND_UNIQUE sites (the shape the staging probe did NOT exercise):');
if (byShape.COMPOUND_UNIQUE.length === 0) console.log('  (none)');
for (const r of byShape.COMPOUND_UNIQUE) console.log(`  ${r.file}:${r.line}  keys=${r.keys.join(',')}`);
console.log('\nNON_LITERAL sites (where built elsewhere — cannot be classified statically):');
if (byShape.NON_LITERAL.length === 0) console.log('  (none)');
for (const r of byShape.NON_LITERAL) console.log(`  ${r.file}:${r.line}`);
