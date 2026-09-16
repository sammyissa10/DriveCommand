/**
 * quick-617 — THE MOBILE_API INVENTORY.
 *
 *   npx tsx scripts/audit/617-mobile-inventory.ts            (BEFORE run — expects the population)
 *   npx tsx scripts/audit/617-mobile-inventory.ts --after     (AFTER run  — expects ZERO, with the
 *                                                              counter-assertion still active)
 *   npx tsx scripts/audit/617-mobile-inventory.ts --break-visitor   (red witness for the floor)
 *
 * METHOD — a parse, never a grep.
 * ------------------------------
 * `ts.createSourceFile`, no `Program`, no type checker — the same instrument as
 * `616-bypass-census.ts`, reused rather than re-derived. A STATEMENT is the
 * INNERMOST `CallExpression` / `TaggedTemplateExpression` whose OWN literal
 * children contain `app.bypass_rls`. Comments are not AST nodes, so prose is
 * excluded by construction. quick-616 measured that a naive grep over this
 * surface returns 369, because every enclosing `$transaction` counts again.
 *
 * WHAT THIS ADDS OVER THE CENSUS
 * ------------------------------
 * For each statement it also walks the ENCLOSING `$transaction` callback and
 * records every `tx.<model>.<operation>()` inside it, with `isWrite`, and — for
 * every write — the audit-columns verdict:
 *
 *     createField / updateField   read from prisma/schema.prisma using the
 *                                 registry's OWN detection rule
 *                                 (createdById else createdBy else null)
 *     exempt / createOnly         read out of audit-columns.ts's own literals,
 *                                 so the two cannot drift
 *     suppliesCreateField         does the call site already pass it in `data`?
 *     userIdWouldChangeBehaviour  the join of the three
 *
 * and the tenant-rls verdict (is the model in `withTenantRLS`'s EXEMPT_MODELS,
 * does the `where` already carry a tenant predicate).
 *
 * ANTI-VACUITY — the failure mode of a bad walker is GREEN (quick-546/600/616)
 * ---------------------------------------------------------------------------
 *   FLOOR             >= 80 statements and >= 45 files (BEFORE mode only).
 *   POSITIVE WITNESS  `api/mobile/driver/hos/route.ts` yields >= 2 statements
 *                     (BEFORE) / the file is still READ (AFTER).
 *   COUNTER-ASSERTION `api/mobile/carrier/driver/dispatches/route.ts` — a mobile
 *                     file quick-588 already routed — is (i) CONFIRMED READ
 *                     (bytes > 0, parsed) and (ii) yields EXACTLY ZERO. Half (i)
 *                     alone proves nothing; half (ii) alone is satisfied by a
 *                     walker that reads nothing. Both, or the guard is decorative.
 *   SCHEMA CONTROL    the schema registry must resolve a KNOWN-CARRYING model
 *                     (DriverIncident -> createdById/updatedById) and a KNOWN-
 *                     ABSENT one (CarrierDocument -> null/null). A registry that
 *                     answered null for everything would otherwise report
 *                     "no behaviour change" for all 83.
 *   AUDIT-SET CONTROL the two sets lifted out of audit-columns.ts must be
 *                     non-empty and must contain a known member.
 *   CRLF              `\r\n` -> `\n` before any offset arithmetic. This repo is
 *                     core.autocrlf=true with no .gitattributes; quick-546 lost
 *                     an assertion to exactly this and the failure mode was green.
 */

import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, relative, sep } from 'path';

const BYPASS_LITERAL = 'app.bypass_rls';
const WEB_ROOT = resolve(__dirname, '..', '..');
const MOBILE_ROOT = resolve(WEB_ROOT, 'src', 'app', 'api', 'mobile');
const REPO_ROOT = resolve(WEB_ROOT, '..', '..');
const EVIDENCE_DIR = resolve(
  REPO_ROOT,
  '.planning',
  'quick',
  '617-route-the-mobile-api-surface-to-gettenan',
  'evidence',
);

const AFTER = process.argv.includes('--after');
const BREAK_VISITOR = process.argv.includes('--break-visitor');

const posix = (p: string) => p.split(sep).join('/');
const TEST_PATH = /(^|[\\/])__tests__[\\/]|\.test\.tsx?$|\.spec\.tsx?$/;

/** CRLF -> LF before ANY offset arithmetic (quick-546). */
function readNormalised(full: string): string {
  return readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
}

// ---------------------------------------------------------------------------
// The schema registry — the audit-columns registry's OWN detection rule,
// replayed over prisma/schema.prisma rather than the DMMF (no client import).
// ---------------------------------------------------------------------------

type AuditFields = { createField: string | null; updateField: string | null };

function buildSchemaRegistry(): Map<string, AuditFields> {
  const text = readNormalised(resolve(WEB_ROOT, 'prisma', 'schema.prisma'));
  const reg = new Map<string, AuditFields>();
  const lines = text.split('\n');
  let model: string | null = null;
  let fields: Set<string> = new Set();
  for (const raw of lines) {
    const line = raw.trim();
    const m = /^model\s+(\w+)\s*\{/.exec(line);
    if (m) {
      model = m[1];
      fields = new Set();
      continue;
    }
    if (model && line === '}') {
      reg.set(model, {
        // EXACTLY the extension's rule: createdById first, then createdBy.
        createField: fields.has('createdById')
          ? 'createdById'
          : fields.has('createdBy')
            ? 'createdBy'
            : null,
        updateField: fields.has('updatedById')
          ? 'updatedById'
          : fields.has('updatedBy')
            ? 'updatedBy'
            : null,
      });
      model = null;
      continue;
    }
    if (model) {
      const f = /^(\w+)\s+\S/.exec(line);
      if (f) fields.add(f[1]);
    }
  }
  return reg;
}

/** Lift a `new Set([...])` literal out of a source file so the two cannot drift. */
function liftSet(file: string, constName: string): string[] {
  const text = readNormalised(file);
  const start = text.indexOf(`const ${constName} = new Set([`);
  if (start === -1) throw new Error(`liftSet: ${constName} not found in ${file}`);
  const open = text.indexOf('[', start);
  const close = text.indexOf(']);', open);
  if (close === -1) throw new Error(`liftSet: ${constName} unterminated in ${file}`);
  const body = text.slice(open + 1, close);
  return [...body.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

// ---------------------------------------------------------------------------
// Enumeration
// ---------------------------------------------------------------------------

const WRITE_OPS = new Set([
  'create',
  'createMany',
  'createManyAndReturn',
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

type Operation = {
  model: string;
  modelPascal: string;
  operation: string;
  isWrite: boolean;
  line: number;
  whereHasTenantPredicate: boolean;
  dataSuppliesCreateField: boolean;
  dataSuppliesUpdateField: boolean;
  dataHasTenantScalar: boolean;
  dataHasTenantRelationConnect: boolean;
  hasSelect: boolean;
  selectNamesTenantId: boolean;
};

type StatementRecord = {
  file: string;
  line: number;
  shape: string;
  callee: string;
  enclosingFunction: string;
  subSurface: string;
  transactionReceiver: string | null;
  transactionLine: number | null;
  operations: Operation[];
};

type FileScan = {
  file: string;
  bytes: number;
  parsed: boolean;
  proseOccurrences: number;
  statements: StatementRecord[];
};

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

function enclosingName(node: ts.Node): string {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isFunctionDeclaration(cur) && cur.name) return cur.name.text;
    if (ts.isMethodDeclaration(cur) && ts.isIdentifier(cur.name)) return cur.name.text;
    if (ts.isArrowFunction(cur) || ts.isFunctionExpression(cur)) {
      const p: ts.Node = cur.parent;
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && p.initializer === cur) {
        return p.name.text;
      }
      if (ts.isCallExpression(p) && p.arguments.includes(cur as ts.Expression)) {
        const gp = p.parent;
        if (ts.isVariableDeclaration(gp) && ts.isIdentifier(gp.name) && gp.initializer === p) {
          return gp.name.text;
        }
      }
    }
    cur = cur.parent;
  }
  return '<module>';
}

function subSurfaceFor(rel: string): string {
  const m = /src\/app\/api\/mobile\/([a-zA-Z-]+)\//.exec(rel);
  return m ? m[1] : '<root>';
}

const pascal = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The nearest enclosing `X.$transaction(...)` CallExpression, if any. */
function enclosingTransaction(node: ts.Node): ts.CallExpression | null {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (ts.isCallExpression(cur) && /\.\$transaction$/.test(calleeText(cur))) return cur;
    cur = cur.parent;
  }
  return null;
}

/** The first argument's own text, or '' when there is none. */
function argText(node: ts.CallExpression): string {
  const a = node.arguments[0];
  return a ? a.getText() : '';
}

/** Is `key` a TOP-LEVEL property of the call's first (object) argument? */
function objectArgHasKey(node: ts.CallExpression, key: string): boolean {
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  return arg.properties.some(
    (p) =>
      (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
      ts.isIdentifier(p.name) &&
      p.name.text === key,
  );
}

/**
 * Does this call's `where` / `data` argument name one of `names`?
 *
 * THREE spellings have to be handled or the answer is wrong in the safe-looking
 * direction — and the first draft of this function got all three wrong:
 *
 *   { where: { tenantId, … } }   inline literal        — read the initialiser
 *   { where }                     SHORTHAND             — `count({ where })` is
 *                                 the single commonest shape on this surface
 *   const where = { tenantId };   HOISTED LOCAL         — resolve the identifier
 *                                 against the enclosing callback's consts
 *
 * Missing the last two reported `driver/loads/route.ts`'s `findMany`+`count`
 * pair — whose hoisted `where` carries BOTH `driverId` and `tenantId` — as
 * unscoped, which would have made 26 files look like stop-and-reports.
 */
function objectArgHas(
  node: ts.CallExpression,
  key: string,
  names: string[],
  locals: Map<string, string>,
): boolean {
  const arg = node.arguments[0];
  if (!arg || !ts.isObjectLiteralExpression(arg)) return false;
  const hit = (t: string) => names.some((nm) => new RegExp(`\\b${nm}\\b`).test(t));
  for (const p of arg.properties) {
    if (ts.isShorthandPropertyAssignment(p) && p.name.text === key) {
      // `{ where }` — the value is the local of the same name.
      return hit(locals.get(key) ?? key);
    }
    if (!ts.isPropertyAssignment(p)) continue;
    const n = ts.isIdentifier(p.name) ? p.name.text : null;
    if (n !== key) continue;
    const init = p.initializer;
    if (ts.isIdentifier(init)) return hit(locals.get(init.text) ?? init.text);
    // Spread of a local (`{ ...where, x }`) counts too.
    let t = init.getText();
    if (ts.isObjectLiteralExpression(init)) {
      for (const q of init.properties) {
        if (ts.isSpreadAssignment(q) && ts.isIdentifier(q.expression)) {
          t += '\n' + (locals.get(q.expression.text) ?? '');
        }
      }
    }
    return hit(t);
  }
  return false;
}

function collectOperations(txCall: ts.CallExpression, sf: ts.SourceFile): Operation[] {
  const ops: Operation[] = [];
  const cb = txCall.arguments[0];
  if (!cb) return ops;

  // The callback's own parameter name — `async (tx) => …`. Anchoring on it is
  // what keeps `stop.appointmentStart.toISOString()` and `x.y.trim()` out: a
  // bare "PropertyAccess.PropertyAccess(" shape matches any two-hop method call
  // in the file, and the first run of this script reported 27 `toISOString`
  // "model operations" for exactly that reason.
  let param: string | null = null;
  if (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) {
    const p0 = cb.parameters[0];
    if (p0 && ts.isIdentifier(p0.name)) param = p0.name.text;
  }
  if (!param) return ops;

  // Local `const x = …` declarations anywhere inside the callback, so a hoisted
  // `where` object can be resolved by name. Scope is deliberately the whole
  // callback rather than the exact block — over-reaching here can only ever
  // report a predicate as PRESENT, and every such claim is spot-checked by hand
  // in 01-inventory.md.
  const locals = new Map<string, string>();
  const collectLocals = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      locals.set(n.name.text, n.initializer.getText());
    }
    n.forEachChild(collectLocals);
  };
  collectLocals(cb);

  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      if (ts.isPropertyAccessExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
        const op = e.name.text;
        const model = e.expression.name.text;
        const root = e.expression.expression;
        const rootIsTx = ts.isIdentifier(root) && root.text === param;
        // `tx.<model>.<op>(` — anchored on the callback's parameter.
        if (rootIsTx && /^[a-z]/.test(model) && /^[a-z]/.test(op)) {
          ops.push({
            model,
            modelPascal: pascal(model),
            operation: op,
            isWrite: WRITE_OPS.has(op),
            line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            whereHasTenantPredicate: objectArgHas(n, 'where', ['tenantId', 'orgId'], locals),
            dataSuppliesCreateField: objectArgHas(n, 'data', ['createdById', 'createdBy'], locals),
            dataSuppliesUpdateField: objectArgHas(n, 'data', ['updatedById', 'updatedBy'], locals),
            dataHasTenantScalar: objectArgHas(n, 'data', ['tenantId', 'orgId'], locals),
            // A relation-form tenant write (`data: { tenant: { connect: … } }`)
            // COLLIDES with withTenantRLS's scalar spread — Prisma rejects both
            // spellings of the same relation in one payload. Hunted for
            // explicitly rather than assumed absent.
            dataHasTenantRelationConnect:
              objectArgHas(n, 'data', ['tenant'], locals) &&
              /\btenant\s*:\s*\{[^}]*connect/.test(n.getText()),
            // TOP-LEVEL `select` only. A regex over the whole argument text also
            // matches `include: { customer: { select: … } }`, and the first run
            // of this check reported 13 hazards of which 7 were exactly that —
            // a nested select on a relation says nothing about which scalars of
            // the ROOT row come back.
            hasSelect: objectArgHasKey(n, 'select'),
            selectNamesTenantId: objectArgHas(n, 'select', ['tenantId'], locals),
          });
        }
      }
    }
    n.forEachChild(visit);
  };
  visit(cb);
  return ops;
}

function scanFile(full: string): FileScan {
  const rel = posix(relative(WEB_ROOT, full));
  const text = readNormalised(full);
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);
  const candidates: { node: ts.Node; start: number; end: number }[] = [];

  const visit = (node: ts.Node) => {
    if (BREAK_VISITOR) return;
    const isCandidate = ts.isCallExpression(node) || ts.isTaggedTemplateExpression(node);
    if (isCandidate) {
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
      else collect((node as ts.TaggedTemplateExpression).template);
      if (sql.includes(BYPASS_LITERAL)) {
        candidates.push({ node, start: node.getStart(), end: node.getEnd() });
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);

  // INNERMOST only — an enclosing $transaction is itself a CallExpression whose
  // subtree contains the literal.
  const statements: StatementRecord[] = candidates
    .filter(
      (c) =>
        !candidates.some(
          (o) =>
            o !== c && o.start >= c.start && o.end <= c.end && (o.start > c.start || o.end < c.end),
        ),
    )
    .map(({ node }) => {
      const tx = enclosingTransaction(node);
      return {
        file: rel,
        line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
        shape: ts.isTaggedTemplateExpression(node) ? 'tagged-template' : 'call',
        callee: calleeText(node),
        enclosingFunction: enclosingName(node),
        subSurface: subSurfaceFor(rel),
        transactionReceiver: tx ? calleeText(tx).replace(/\.\$transaction$/, '') : null,
        transactionLine: tx ? sf.getLineAndCharacterOfPosition(tx.getStart()).line + 1 : null,
        operations: tx ? collectOperations(tx, sf) : [],
      };
    })
    .sort((a, b) => a.line - b.line);

  const rawOccurrences = text.split(BYPASS_LITERAL).length - 1;
  return {
    file: rel,
    bytes: Buffer.byteLength(text),
    parsed: sf.statements.length > 0,
    proseOccurrences: rawOccurrences - statements.length,
    statements,
  };
}

// ---------------------------------------------------------------------------

function main() {
  const schemaReg = buildSchemaRegistry();
  const auditFile = resolve(WEB_ROOT, 'src', 'lib', 'db', 'extensions', 'audit-columns.ts');
  const rlsFile = resolve(WEB_ROOT, 'src', 'lib', 'db', 'extensions', 'tenant-rls.ts');
  const EXEMPT_AUDIT = new Set(liftSet(auditFile, 'EXEMPT_AUDIT_MODELS'));
  const CREATE_ONLY_AUDIT = new Set(liftSet(auditFile, 'CREATE_ONLY_AUDIT_MODELS'));
  const EXEMPT_RLS = new Set(liftSet(rlsFile, 'EXEMPT_MODELS'));

  const all = walkFiles(MOBILE_ROOT).filter((f) => !TEST_PATH.test(posix(relative(WEB_ROOT, f))));
  const scans: FileScan[] = [];
  for (const f of all) {
    const text = readNormalised(f);
    if (!text.includes(BYPASS_LITERAL)) continue;
    scans.push(scanFile(f));
  }

  const statements = scans.flatMap((s) => s.statements);
  const files = [...new Set(statements.map((s) => s.file))];

  // ---- per-write audit verdicts ------------------------------------------
  type WriteVerdict = {
    file: string;
    statementLine: number;
    opLine: number;
    model: string;
    operation: string;
    createField: string | null;
    updateField: string | null;
    exemptAudit: boolean;
    createOnlyAudit: boolean;
    exemptRls: boolean;
    dataSuppliesCreateField: boolean;
    dataSuppliesUpdateField: boolean;
    userIdWouldChangeBehaviour: boolean;
    reason: string;
  };
  const writeVerdicts: WriteVerdict[] = [];
  const rlsInjectionNarrows: {
    file: string;
    opLine: number;
    model: string;
    operation: string;
    injectionClass: string;
    successPathChanges: boolean;
  }[] = [];

  /**
   * What `withTenantRLS` does to an operation whose `where`/`data` does not
   * already name the tenant — read straight out of the extension's switch.
   *
   * `successPathChanges` is the question this task's limits actually ask: does
   * the OWN-TENANT result change? For every class below it does not — the
   * injection only ever excludes rows belonging to ANOTHER tenant, which is the
   * isolation being added. A cross-tenant id that used to succeed now returns
   * null / P2025; that is the point of the change, not a regression in it.
   */
  /**
   * WHICH key the tenant predicate has to be in depends on the operation.
   * Asking `where` of a `create` is the wrong question and reports every create
   * as unscoped — the first run of this script flagged all 19 for exactly that.
   */
  const alreadyNamesTenant = (o: Operation): boolean =>
    /^(create|createMany|createManyAndReturn)$/.test(o.operation)
      ? o.dataHasTenantScalar
      : o.whereHasTenantPredicate;

  const injectionClassFor = (op: string): { cls: string; successPathChanges: boolean } => {
    if (/^(findMany|findFirst|findFirstOrThrow|count|aggregate|groupBy)$/.test(op))
      return { cls: 'AND-INJECT-WHERE', successPathChanges: false };
    if (/^findUnique(OrThrow)?$/.test(op))
      return { cls: 'POST-HOC-CHECK (no where change)', successPathChanges: false };
    if (/^(update|delete|upsert)$/.test(op))
      return { cls: 'MERGE-WHERE', successPathChanges: false };
    if (/^(updateMany|deleteMany)$/.test(op))
      return { cls: 'AND-INJECT-WHERE', successPathChanges: false };
    if (/^(create|createMany|createManyAndReturn)$/.test(op))
      return { cls: 'SPREAD-TENANTID-INTO-DATA', successPathChanges: false };
    return { cls: 'PASS-THROUGH (unknown operation)', successPathChanges: false };
  };

  /**
   * THE `findUnique` + `select` HAZARD — found by reading the extension, not by
   * running anything, and it is the one shape on this surface that genuinely
   * BREAKS THE SUCCESS PATH.
   *
   * `withTenantRLS` cannot add `tenantId` to a `findUnique` where (it must be
   * unique-only), so it runs the query and then checks the RESULT:
   *
   *     const result = await query(args);
   *     if (result && (result as any).tenantId !== tenantId) return null;
   *
   * If the call carries a `select` that does NOT include `tenantId`, the field
   * is absent from `result`, `undefined !== tenantId` is TRUE, and the row is
   * discarded — for the row's OWN tenant. Every such call returns null forever.
   *
   * This is a stop-and-report by construction: it is not "narrower", it is wrong.
   */
  const findUniqueSelectHazards: {
    file: string;
    opLine: number;
    model: string;
    operation: string;
  }[] = [];
  for (const s of statements) {
    for (const op of s.operations) {
      if (!/^findUnique(OrThrow)?$/.test(op.operation)) continue;
      if (EXEMPT_RLS.has(op.modelPascal)) continue;
      if (op.hasSelect && !op.selectNamesTenantId) {
        findUniqueSelectHazards.push({
          file: s.file,
          opLine: op.line,
          model: op.modelPascal,
          operation: op.operation,
        });
      }
    }
  }

  for (const s of statements) {
    for (const op of s.operations) {
      const reg = schemaReg.get(op.modelPascal) ?? { createField: null, updateField: null };
      const exemptAudit = EXEMPT_AUDIT.has(op.modelPascal);
      const createOnly = CREATE_ONLY_AUDIT.has(op.modelPascal);
      const exemptRls = EXEMPT_RLS.has(op.modelPascal);

      if (!op.isWrite) {
        // The inverse stop-and-report check: a READ on a NON-exempt model whose
        // where does not already carry a tenant predicate. withTenantRLS will
        // now inject one, which NARROWS the result set — a change to what the
        // statement returns on success, which this task's limits forbid.
        if (!exemptRls && !alreadyNamesTenant(op)) {
          const ic = injectionClassFor(op.operation);
          rlsInjectionNarrows.push({
            file: s.file,
            opLine: op.line,
            model: op.modelPascal,
            operation: op.operation,
            injectionClass: ic.cls,
            successPathChanges: ic.successPathChanges,
          });
        }
        continue;
      }
      if (!exemptRls && !alreadyNamesTenant(op)) {
        const ic = injectionClassFor(op.operation);
        rlsInjectionNarrows.push({
          file: s.file,
          opLine: op.line,
          model: op.modelPascal,
          operation: op.operation,
          injectionClass: ic.cls,
          successPathChanges: ic.successPathChanges,
        });
      }

      const isCreateSide = /^(create|createMany|createManyAndReturn|upsert)$/.test(op.operation);
      const isUpdateSide = /^(update|updateMany|upsert)$/.test(op.operation);
      const isDelete = /^(delete|deleteMany)$/.test(op.operation);

      let would = false;
      let reason = '';
      if (isDelete) {
        reason = 'delete — the extension passes deletes through untouched';
      } else if (exemptAudit) {
        reason = `${op.modelPascal} is in EXEMPT_AUDIT_MODELS — no injection`;
      } else if (!reg.createField && !reg.updateField) {
        reason = `${op.modelPascal} carries neither audit convention — no injection`;
      } else {
        const createWould =
          isCreateSide && !!reg.createField && !op.dataSuppliesCreateField;
        const updateWould =
          !createOnly &&
          !!reg.updateField &&
          ((isCreateSide && !op.dataSuppliesUpdateField) ||
            (isUpdateSide && !op.dataSuppliesUpdateField));
        would = createWould || updateWould;
        const gained = [
          createWould ? reg.createField : null,
          updateWould ? reg.updateField : null,
        ].filter(Boolean);
        reason = would
          ? `passing userId would newly populate ${gained.join(' + ')} on ${op.modelPascal}`
          : `${op.modelPascal}: nothing new would be written (createOnly=${createOnly}, suppliesCreate=${op.dataSuppliesCreateField})`;
      }

      writeVerdicts.push({
        file: s.file,
        statementLine: s.line,
        opLine: op.line,
        model: op.modelPascal,
        operation: op.operation,
        createField: reg.createField,
        updateField: reg.updateField,
        exemptAudit,
        createOnlyAudit: createOnly,
        exemptRls,
        dataSuppliesCreateField: op.dataSuppliesCreateField,
        dataSuppliesUpdateField: op.dataSuppliesUpdateField,
        userIdWouldChangeBehaviour: would,
        reason,
      });
    }
  }

  // ---- anti-vacuity -------------------------------------------------------
  const checks: { name: string; pass: boolean; detail: string }[] = [];
  const FLOOR_STATEMENTS = 80;
  const FLOOR_FILES = 45;

  if (!AFTER) {
    checks.push({
      name: 'FLOOR statements',
      pass: statements.length >= FLOOR_STATEMENTS,
      detail: `${statements.length} >= ${FLOOR_STATEMENTS}`,
    });
    checks.push({
      name: 'FLOOR files',
      pass: files.length >= FLOOR_FILES,
      detail: `${files.length} >= ${FLOOR_FILES}`,
    });
  } else {
    checks.push({
      name: 'AFTER: zero executable bypass statements under api/mobile/**',
      pass: statements.length === 0,
      detail: `${statements.length} === 0${statements.length ? ` — still at ${statements.map((s) => `${s.file}:${s.line}`).join(', ')}` : ''}`,
    });
  }

  // POSITIVE WITNESS — in BEFORE mode it is the statement count; in AFTER mode
  // the statements are gone by design, so the witness becomes "the file is
  // still READ and still carries the literal in prose or is confirmed read".
  const hosPath = 'src/app/api/mobile/driver/hos/route.ts';
  const hosFull = resolve(WEB_ROOT, hosPath);
  const hosText = readNormalised(hosFull);
  const hosStmts = statements.filter((s) => s.file === hosPath);
  if (!AFTER) {
    checks.push({
      name: `POSITIVE WITNESS ${hosPath}`,
      pass: hosStmts.length >= 2,
      detail: `${hosStmts.length} statements at lines [${hosStmts.map((s) => s.line).join(', ')}] >= 2`,
    });
  } else {
    checks.push({
      name: `POSITIVE WITNESS (AFTER) ${hosPath} was READ and now acquires a tenant client`,
      pass: hosText.length > 0 && /getTenantPrismaForOrg\(/.test(hosText),
      detail: `bytes=${Buffer.byteLength(hosText)} getTenantPrismaForOrg=${/getTenantPrismaForOrg\(/.test(hosText)}`,
    });
  }

  // COUNTER-ASSERTION, two halves — a mobile file quick-588 already routed.
  const cPath = 'src/app/api/mobile/carrier/driver/dispatches/route.ts';
  const cFull = resolve(WEB_ROOT, cPath);
  const cText = readNormalised(cFull);
  const cScan = scanFile(cFull);
  checks.push({
    name: `COUNTER-ASSERTION ${cPath} WAS READ`,
    pass: cScan.bytes > 0 && cScan.parsed,
    detail: `bytes=${cScan.bytes} parsed=${cScan.parsed} getTenantPrismaForOrg=${/getTenantPrismaForOrg\(/.test(cText)}`,
  });
  checks.push({
    name: `COUNTER-ASSERTION ${cPath} YIELDS ZERO`,
    pass: cScan.statements.length === 0,
    detail: `${cScan.statements.length} executable statements === 0`,
  });

  // SCHEMA CONTROL — a registry that answered null for everything would report
  // "no behaviour change" for all 83, which is the vacuous pass.
  const di = schemaReg.get('DriverIncident');
  const cd = schemaReg.get('CarrierDocument');
  checks.push({
    name: 'SCHEMA CONTROL positive — DriverIncident carries createdById/updatedById',
    pass: di?.createField === 'createdById' && di?.updateField === 'updatedById',
    detail: JSON.stringify(di),
  });
  checks.push({
    name: 'SCHEMA CONTROL negative — CarrierDocument carries neither convention',
    pass: cd != null && cd.createField === null && cd.updateField === null,
    detail: JSON.stringify(cd),
  });
  checks.push({
    name: 'AUDIT-SET CONTROL — both sets lifted non-empty with a known member',
    pass:
      EXEMPT_AUDIT.size > 0 &&
      EXEMPT_AUDIT.has('Tenant') &&
      CREATE_ONLY_AUDIT.size > 0 &&
      CREATE_ONLY_AUDIT.has('FleetMessage') &&
      EXEMPT_RLS.size > 0 &&
      EXEMPT_RLS.has('CarrierDriver'),
    detail: `EXEMPT_AUDIT=${EXEMPT_AUDIT.size} CREATE_ONLY=${CREATE_ONLY_AUDIT.size} EXEMPT_RLS=${EXEMPT_RLS.size}`,
  });

  // ---- sub-surface roll-up ------------------------------------------------
  const bySub: Record<string, { files: Set<string>; statements: number }> = {};
  for (const s of statements) {
    bySub[s.subSurface] ??= { files: new Set(), statements: 0 };
    bySub[s.subSurface].files.add(s.file);
    bySub[s.subSurface].statements += 1;
  }
  const subSurfaces = Object.fromEntries(
    Object.entries(bySub).map(([k, v]) => [k, { files: v.files.size, statements: v.statements }]),
  );

  const out = {
    generated: new Date().toISOString(),
    mode: AFTER ? 'AFTER' : 'BEFORE',
    method:
      'ts.createSourceFile per file, no Program, no type checker. INNERMOST CallExpression/TaggedTemplateExpression whose own literal children contain "app.bypass_rls". CRLF normalised before offsets. Comments are not AST nodes.',
    scope: 'apps/web/src/app/api/mobile/** (tests excluded)',
    totals: {
      files: files.length,
      statements: statements.length,
      writes: writeVerdicts.length,
      writesWhereUserIdWouldChangeBehaviour: writeVerdicts.filter(
        (w) => w.userIdWouldChangeBehaviour,
      ).length,
      pureReadStatements: statements.filter((s) => s.operations.every((o) => !o.isWrite)).length,
    },
    subSurfaces,
    antiVacuity: checks,
    filesScanned: all.length,
    statements,
    writeVerdicts,
    rlsInjectionNarrows,
    findUniqueSelectHazards,
    relationFormTenantWrites: statements.flatMap((s) =>
      s.operations
        .filter((o) => o.dataHasTenantRelationConnect && !EXEMPT_RLS.has(o.modelPascal))
        .map((o) => ({ file: s.file, opLine: o.line, model: o.modelPascal, operation: o.operation })),
    ),
    schemaRegistrySize: schemaReg.size,
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  // BEFORE mode refuses to clobber a committed BEFORE artefact. `01-inventory.json`
  // is the pinned record of the 47/83 population AND the hazard list, and it is what
  // `617-apply-routing.js` and `617-routing-verify.ts` read; a BEFORE re-run after
  // the edits silently rewrote it to 45/80 once. Post-edit runs use `--after`.
  const target = resolve(EVIDENCE_DIR, AFTER ? '01-inventory-after.json' : '01-inventory.json');
  if (!AFTER && existsSync(target) && !process.argv.includes('--force')) {
    console.error(
      `[617-inventory] REFUSING to overwrite the pinned BEFORE artefact at ${posix(relative(REPO_ROOT, target))}.\n` +
        `                Use --after for a post-edit run, or --force if you really mean to re-pin it.`,
    );
    process.exit(1);
  }
  writeFileSync(target, JSON.stringify(out, null, 2));

  console.log(`[617-inventory] mode=${out.mode}`);
  console.log(`[617-inventory] files=${files.length} statements=${statements.length}`);
  console.log(`[617-inventory] sub-surfaces: ${JSON.stringify(subSurfaces)}`);
  console.log(
    `[617-inventory] writes=${writeVerdicts.length} of which userIdWouldChangeBehaviour=${out.totals.writesWhereUserIdWouldChangeBehaviour}`,
  );
  console.log(`[617-inventory] rlsInjectionNarrows=${rlsInjectionNarrows.length}`);
  console.log(`[617-inventory] findUniqueSelectHazards=${findUniqueSelectHazards.length}`);
  for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name} — ${c.detail}`);
  console.log(`[617-inventory] written: ${posix(relative(REPO_ROOT, target))}`);

  if (checks.some((c) => !c.pass)) {
    console.error('[617-inventory] ANTI-VACUITY FAILED');
    process.exit(1);
  }
}

main();
