// quick-625 step 5: size both options against the quick-622/623 query census.
//   node census-sizing.cjs <census.json> <out.json>     (run from the repo root)
// Exposed set = quick-624's exposure.cjs rule, verbatim: SCOPED, not tenantGucInTx, not bypass-on-every-arm, tenant arm.
// "Unit" = the innermost NAMED enclosing function (declaration, method, or variable-bound arrow/function expression),
// resolved with the TypeScript parser (no type checker). A route handler `export async function GET` is a unit.
const fs = require('fs');
const path = require('path');
const ts = require(path.resolve('node_modules/typescript'));
const [, , censusPath, outPath] = process.argv;
const j = JSON.parse(fs.readFileSync(censusPath, 'utf8'));
const APP = path.resolve('apps/web');

const tenantArm = (c) => /TENANT_(SESSION|ORG)|WITH_TENANT_RLS|CREATE_TENANT_CLIENT/.test(c);
const exposed = j.statements.filter(
  (r) => r.verdict === 'SCOPED' && !r.tenantGucInTx && !(r.bypassFlag && r.bypassFlagOnEveryArm) && tenantArm(r.client),
);
const gating = j.statements.filter((r) => r.verdict === "SILENT_ZERO_AT_CUTOVER");
const bypassDrop = j.statements.filter((r) => r.verdict === "SILENT_ZERO_AT_BYPASS_DROP");
const immune = j.statements.filter((r) => r.verdict === 'SCOPED' && r.tenantGucInTx);

const sfCache = new Map();
function unitOf(file, line) {
  let sf = sfCache.get(file);
  if (!sf) {
    const text = fs.readFileSync(path.join(APP, file), 'utf8').replace(/\r\n/g, '\n');
    sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    sfCache.set(file, sf);
  }
  const pos = sf.getPositionOfLineAndCharacter(Math.max(0, line - 1), 0);
  let best = null;
  const visit = (n) => {
    if (pos < n.getFullStart() || pos > n.getEnd()) return;
    let name = null;
    if ((ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)) && n.name) name = n.name.getText(sf);
    else if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent && ts.isVariableDeclaration(n.parent)) name = n.parent.name.getText(sf);
    else if ((ts.isArrowFunction(n) || ts.isFunctionExpression(n)) && n.parent && ts.isPropertyAssignment(n.parent)) name = n.parent.name.getText(sf);
    else if (ts.isFunctionDeclaration(n) && !n.name) name = 'default';
    if (name) best = `${file}#${name}`;
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return best ?? `${file}#<module>`;
}

const tally = (rows, key) => rows.reduce((m, r) => ((m[key(r)] = (m[key(r)] || 0) + 1), m), {});
const units = (rows) => new Set(rows.map((r) => unitOf(r.file, r.line)));

const isFindUnique = (r) => /^findUnique(OrThrow)?$/.test(r.op);
const inTx = (r) => /TX\(/.test(r.client);
const raw = (r) => r.typed === false;

// Checkout re-assertion coverage classes for the exposed set.
const cls = (r) => {
  if (isFindUnique(r) && !inTx(r)) return 'covered only with unbatchFindUnique (same-tick DataLoader batching)';
  if (inTx(r)) return 'covered via the $transaction context wrapper (checkout at BEGIN)';
  if (raw(r)) return 'covered via top-level $allOperations (raw)';
  return 'covered directly (autocommit model op, own checkout)';
};

const exposedUnits = units(exposed);
const gatingUnits = units(gating);
const immuneUnits = units(immune);
const allTenantUnits = new Set([...exposedUnits, ...gatingUnits]);

const out = {
  census: censusPath,
  exposed: {
    rows: exposed.length,
    files: new Set(exposed.map((r) => r.file)).size,
    units: exposedUnits.size,
    byCheckoutCoverage: tally(exposed, cls),
    byClient: tally(exposed, (r) => r.client),
    findUniqueOutsideTx: exposed.filter((r) => isFindUnique(r) && !inTx(r)).length,
  },
  gating: {
    rows: gating.length,
    files: new Set(gating.map((r) => r.file)).size,
    units: gatingUnits.size,
    byClient: tally(gating, (r) => r.client),
    note: 'SILENT_ZERO_AT_CUTOVER as scanned (155); quick-623 corrects to 144 by excluding 11 driver-pay rows',
    driverPayRows: gating.filter((r) => /driver-pay/.test(r.file)).length,
  },
  bypassDrop: { rows: bypassDrop.length, units: units(bypassDrop).size, byClient: tally(bypassDrop, (r) => r.client),
  },
  immuneTxSetsOwnGuc: { rows: immune.length, units: immuneUnits.size },
  perUnitBinding: {
    unitsToWrap_exposedPlusGating: allTenantUnits.size,
    files_exposedPlusGating: new Set([...exposed, ...gating].map((r) => r.file)).size,
    unitsWithAtLeastOneTxRow: units(exposed.filter(inTx)).size,
    unitsWithFindUniqueOutsideTx: units(exposed.filter((r) => isFindUnique(r) && !inTx(r))).size,
  },
};
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
