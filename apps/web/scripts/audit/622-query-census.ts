/**
 * quick-622 — THE QUERY CENSUS: one row per database statement, keyed on the QUERY.
 *
 *   npx tsx scripts/audit/622-query-census.ts
 *        [--override <src-relative-path>=<git-rev>]   (repeatable; substitute a file's content from git)
 *        [--out <file>]                                (default: quick-622 evidence/01-query-census.json)
 *        [--break-resolver]                            (witness: every origin becomes UNRESOLVED)
 *
 * WHY IT EXISTS. quick-616's census counted statements whose literals contain `app.bypass_rls` — the
 * FLAG was its unit of account. quick-621's inventory counted units rooted at the imported `prisma`
 * identifier, file-locally, with no type checker — a client returned by a helper or passed as a
 * parameter was invisible to it. Both are superseded by this: the unit is ONE QUERY, and its client is
 * resolved through the TypeScript type checker (symbols, declarations, resolved call signatures), not
 * by a local declaration's name.
 *
 * A STATEMENT is one of:
 *   - `X.<delegate>.<op>(…)`            op ∈ PRISMA_MODEL_OPS, delegate a Prisma model accessor
 *   - `X.$queryRaw\`…\`` / `X.$executeRaw\`…\``   (tagged)
 *   - `X.$queryRaw(…)` / `X.$executeRaw(…)` / `X.$queryRawUnsafe(…)` / `X.$executeRawUnsafe(…)`
 * where the op's declaration lives in `src/generated/prisma` (typed), or the receiver is `any` and the
 * delegate is a real model name (untyped — flagged `typed: false`). `$transaction` is NOT a statement;
 * the statements inside it are, and each inherits the transaction's flags.
 *
 * CLIENT ORIGIN — resolved by `originsOf(expr)`, a memoised, cycle-guarded walk:
 *   Identifier            → checker symbol (aliases followed) → declaration:
 *        the `prisma` export of lib/db/prisma.ts                           → BARE
 *        VariableDeclaration                                               → its initializer
 *        BindingElement (destructuring)                                    → property of the initializer
 *        Parameter of a `$transaction` callback                            → TX(receiver, flags)
 *        Parameter of a function passed to a user function F at arg i       → args F passes to that param
 *        Parameter of a named function / method / arrow in a variable       → the argument at that index
 *                                                                              at every resolved call site
 *   CallExpression        → resolved signature's declaration:
 *        getTenantPrisma / getTenantPrismaForOrg / getAdminDb / createTenantClient → that source
 *        `$extends(withTenantRLS…)`                                        → WITH_TENANT_RLS
 *        `$extends(other)`                                                 → the receiver's origin
 *        any function with a body in src                                   → union of its return exprs
 *        `cache(fn)` / `unstable_cache(fn)` wrappers                       → fn's returns
 *   PropertyAccess        → property symbol → PropertyAssignment / Shorthand / class PropertyDeclaration
 *                            initializer + `this.x = …` assignments / an interface property matched
 *                            against every object literal whose contextual type owns that symbol
 *   await / parens / as / ! / ?? / || / ?: → unwrapped / unioned
 * Anything else is UNRESOLVED with a stated reason; nothing is guessed.
 *
 * TABLES. A model statement reaches its @@map table PLUS every relation named anywhere in its argument
 * object literal (select / include / _count / where relation filters / nested writes), recursively —
 * quick-615's finding that `_count` is a statement against another table. A raw statement reaches the
 * production tables named after FROM / JOIN / INTO / UPDATE in its literals. RLS state is PRODUCTION,
 * read-only, captured in evidence/00-production-rls-tables.json.
 *
 * Tenant source, failure handling and the verdict are documented at their functions below.
 */
import * as ts from 'typescript';
import { execFileSync } from 'child_process';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, relative, sep, dirname } from 'path';

const WEB = resolve(__dirname, '..', '..');
const REPO = resolve(WEB, '..', '..');
const SRC = resolve(WEB, 'src');
const EV = resolve(REPO, '.planning/quick/622-query-census-keyed-on-queries/evidence');
const posix = (p: string) => p.split(sep).join('/');
const rel = (abs: string) => posix(relative(WEB, abs));
const TEST_PATH = /(^|\/)(__tests__|__mocks__)\/|\.test\.tsx?$|\.spec\.tsx?$/;

const argv = process.argv.slice(2);
const BREAK = argv.includes('--break-resolver');
const OUT = (() => {
  const i = argv.indexOf('--out');
  return i >= 0 ? resolve(argv[i + 1]) : resolve(EV, '01-query-census.json');
})();
const OVERRIDES = new Map<string, string>(); // abs path (posix, lowercase) -> content
for (let i = 0; i < argv.length; i++) {
  if (argv[i] !== '--override') continue;
  const [p, rev] = argv[i + 1].split('=');
  const content = execFileSync('git', ['show', `${rev}:apps/web/${p}`], { cwd: REPO, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  OVERRIDES.set(posix(resolve(WEB, p)).toLowerCase(), content);
}

// ─────────────────────────────────────────────────────────────────────────────
// schema: model -> table, model -> relation field -> target model
// ─────────────────────────────────────────────────────────────────────────────
const schema = readFileSync(resolve(WEB, 'prisma/schema.prisma'), 'utf8').replace(/\r\n/g, '\n');
const MODELS = new Map<string, string>(); // ModelName -> table
const DELEGATE = new Map<string, string>(); // delegateName -> ModelName
const blocks: [string, string][] = [];
for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) {
  const map = /@@map\("([^"]+)"\)/.exec(m[2]);
  MODELS.set(m[1], map ? map[1] : m[1]);
  DELEGATE.set(m[1].charAt(0).toLowerCase() + m[1].slice(1), m[1]);
  blocks.push([m[1], m[2]]);
}
const RELATIONS = new Map<string, Map<string, string>>();
for (const [model, body] of blocks) {
  const r = new Map<string, string>();
  for (const line of body.split('\n')) {
    const f = /^\s+(\w+)\s+(\w+)(\[\])?\??/.exec(line);
    if (f && MODELS.has(f[2])) r.set(f[1], f[2]);
  }
  RELATIONS.set(model, r);
}

const prod = JSON.parse(readFileSync(resolve(EV, '00-production-rls-tables.json'), 'utf8')) as {
  tables: { relname: string; rls: boolean; forced: boolean; policies: number; bypass_policy: number; app_user_select: boolean }[];
};
const TABLE = new Map(prod.tables.map((t) => [t.relname, t]));

const PRISMA_MODEL_OPS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow', 'create', 'createMany',
  'createManyAndReturn', 'update', 'updateMany', 'updateManyAndReturn', 'upsert', 'delete', 'deleteMany',
  'count', 'aggregate', 'groupBy',
]);
const RAW_OPS = /^\$(query|execute)Raw(Unsafe)?$/;

// ─────────────────────────────────────────────────────────────────────────────
// program
// ─────────────────────────────────────────────────────────────────────────────
function walk(dir: string, out: string[]) {
  for (const n of readdirSync(dir)) {
    const p = resolve(dir, n);
    if (statSync(p).isDirectory()) {
      if (n !== 'generated' && n !== 'node_modules') walk(p, out);
    } else if (/\.tsx?$/.test(n) && !n.endsWith('.d.ts')) out.push(p);
  }
}
const allFiles: string[] = [];
walk(SRC, allFiles);
const shipping = allFiles.filter((f) => !TEST_PATH.test(rel(f)) && !/\.prototype\.tsx?$/.test(f));

const cfg = ts.readConfigFile(resolve(WEB, 'tsconfig.json'), ts.sys.readFile);
const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, WEB);
const options: ts.CompilerOptions = { ...parsed.options, noEmit: true, incremental: false, tsBuildInfoFile: undefined };
const host = ts.createCompilerHost(options, true);
const origRead = host.readFile.bind(host);
const origGetSf = host.getSourceFile.bind(host);
host.readFile = (f) => OVERRIDES.get(posix(f).toLowerCase()) ?? origRead(f);
host.getSourceFile = (f, lang, onErr, create) => {
  const o = OVERRIDES.get(posix(f).toLowerCase());
  if (o !== undefined) return ts.createSourceFile(f, o, lang, true);
  return origGetSf(f, lang, onErr, create);
};
const t0 = Date.now();
const program = ts.createProgram({ rootNames: [resolve(WEB, 'next-env.d.ts'), ...shipping], options, host });
const checker = program.getTypeChecker();
const shippingSet = new Set(shipping.map((f) => posix(f).toLowerCase()));
const sourceFiles = program.getSourceFiles().filter((sf) => shippingSet.has(posix(sf.fileName).toLowerCase()));

const isSrcDecl = (n: ts.Node) => {
  const f = posix(n.getSourceFile().fileName);
  return f.includes('/apps/web/src/') && !f.includes('/src/generated/');
};
const isGenerated = (n: ts.Node) => posix(n.getSourceFile().fileName).includes('/src/generated/prisma');
const fileOf = (n: ts.Node) => rel(n.getSourceFile().fileName);
const lineOf = (n: ts.Node) => n.getSourceFile().getLineAndCharacterOfPosition(n.getStart()).line + 1;
const where = (n: ts.Node) => `${fileOf(n)}:${lineOf(n)}`;

// ─────────────────────────────────────────────────────────────────────────────
// call-site index, by callee NAME (resolved lazily with the checker)
// ─────────────────────────────────────────────────────────────────────────────
const callsByName = new Map<string, ts.CallExpression[]>();
const objLitPropsByName = new Map<string, ts.ObjectLiteralElementLike[]>();
const thisAssignByName = new Map<string, ts.BinaryExpression[]>();
for (const sf of sourceFiles) {
  const v = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const e = n.expression;
      const name = ts.isIdentifier(e) ? e.text : ts.isPropertyAccessExpression(e) ? e.name.text : null;
      if (name) (callsByName.get(name) ?? callsByName.set(name, []).get(name)!).push(n);
    }
    if ((ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) && n.name && (ts.isIdentifier(n.name) || ts.isStringLiteral(n.name))) {
      const name = n.name.text;
      (objLitPropsByName.get(name) ?? objLitPropsByName.set(name, []).get(name)!).push(n);
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isPropertyAccessExpression(n.left) && n.left.expression.kind === ts.SyntaxKind.ThisKeyword) {
      const name = n.left.name.text;
      (thisAssignByName.get(name) ?? thisAssignByName.set(name, []).get(name)!).push(n);
    }
    ts.forEachChild(n, v);
  };
  v(sf);
}

// ─────────────────────────────────────────────────────────────────────────────
// origins
// ─────────────────────────────────────────────────────────────────────────────
type Source = 'BARE' | 'TENANT_SESSION' | 'TENANT_ORG' | 'ADMIN' | 'WITH_TENANT_RLS' | 'CREATE_TENANT_CLIENT' | 'OTHER_CLIENT';
type Origin =
  | { k: 'SRC'; src: Source; at: string; acquire?: ts.Node }
  | { k: 'TX'; base: Origin[]; bypass: boolean; guc: boolean; at: string; txNode: ts.CallExpression }
  | { k: 'UNRESOLVED'; reason: string; at: string }
  /** A flow that provably contributes no value at runtime: an optional parameter no call site passes,
   *  a parameter of a function with zero call sites, an optional interface property no literal supplies.
   *  Ignored when unioning, but RECORDED on the statement so the assumption is visible. */
  | { k: 'ABSENT'; reason: string; at: string };

const SOURCE_FUNCS: Record<string, { file: string; src: Source }> = {
  getTenantPrisma: { file: 'src/lib/context/tenant-context.ts', src: 'TENANT_SESSION' },
  getTenantPrismaForOrg: { file: 'src/lib/context/tenant-context.ts', src: 'TENANT_ORG' },
  getAdminDb: { file: 'src/lib/db/admin-prisma.ts', src: 'ADMIN' },
  getAdminPrismaClient: { file: 'src/lib/db/admin-prisma.ts', src: 'ADMIN' },
  createTenantClient: { file: 'src/lib/db/tenant-client.ts', src: 'CREATE_TENANT_CLIENT' },
};

const memo = new Map<ts.Node, Origin[]>();
const inProgress = new Set<ts.Node>();
let depth = 0;
const unres = (reason: string, n: ts.Node): Origin[] => [{ k: 'UNRESOLVED', reason, at: where(n) }];

function literalText(node: ts.Node): string {
  let s = '';
  const visit = (n: ts.Node) => {
    if (ts.isStringLiteralLike(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) s += ' ' + (n as ts.LiteralLikeNode).text;
    ts.forEachChild(n, visit);
  };
  visit(node);
  return s;
}

function unwrap(e: ts.Expression): ts.Expression {
  let c = e;
  for (;;) {
    if (ts.isAwaitExpression(c) || ts.isParenthesizedExpression(c) || ts.isNonNullExpression(c) || ts.isAsExpression(c) || ts.isTypeAssertionExpression(c) || ts.isSatisfiesExpression(c)) c = c.expression;
    else return c;
  }
}

function symbolOf(n: ts.Node): ts.Symbol | undefined {
  let s = checker.getSymbolAtLocation(n);
  if (s && s.flags & ts.SymbolFlags.Alias) s = checker.getAliasedSymbol(s);
  return s;
}

function returnsOf(fn: ts.SignatureDeclaration): Origin[] {
  const body = (fn as ts.FunctionLikeDeclaration).body;
  if (!body) return unres(`no body: ${fn.name ? fn.name.getText() : 'anonymous'}`, fn);
  if (!ts.isBlock(body)) return originsOf(body);
  const out: Origin[] = [];
  const v = (n: ts.Node) => {
    if (ts.isFunctionLike(n) && n !== fn) return;
    if (ts.isReturnStatement(n) && n.expression) out.push(...originsOf(n.expression));
    ts.forEachChild(n, v);
  };
  ts.forEachChild(body, v);
  return out.length ? out : unres('function returns no client expression', fn);
}

function isTransactionCall(c: ts.CallExpression): boolean {
  return ts.isPropertyAccessExpression(c.expression) && c.expression.name.text === '$transaction';
}

/**
 * The literals a transaction callback issues ON ITS OWN tx — its own body, plus (≤ 2 hops) the bodies of user
 * functions it hands the tx to: `setTransactionTenantId(tx, id)` sets the GUC in a helper. A helper that is
 * NOT given the tx is not followed, because whatever it sets lands on some other connection or none.
 */
function txLiterals(cb: ts.Node, txParamSym: ts.Symbol | undefined, hops: number): string {
  let s = literalText(cb);
  if (!txParamSym || hops <= 0) return s;
  const v = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const idx = n.arguments.findIndex((a) => ts.isIdentifier(unwrap(a)) && checker.getSymbolAtLocation(unwrap(a)) === txParamSym);
      if (idx >= 0) {
        for (const F of calleeBodies(n)) {
          const p = F.parameters[idx];
          const ps = p && ts.isIdentifier(p.name) ? checker.getSymbolAtLocation(p.name) : undefined;
          s += ' ' + txLiterals((F as ts.FunctionLikeDeclaration).body!, ps, hops - 1);
        }
      }
    }
    ts.forEachChild(n, v);
  };
  v(cb);
  return s;
}

function txOrigin(call: ts.CallExpression): Origin {
  const recv = (call.expression as ts.PropertyAccessExpression).expression;
  const cb = call.arguments[0] && unwrap(call.arguments[0]);
  const p0 = cb && (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb)) ? cb.parameters[0] : undefined;
  const lit = cb ? txLiterals(cb, p0 && ts.isIdentifier(p0.name) ? checker.getSymbolAtLocation(p0.name) : undefined, 2) : literalText(call);
  return {
    k: 'TX',
    base: originsOf(recv),
    bypass: /app\.bypass_rls/.test(lit),
    guc: /app\.current_tenant_id/.test(lit),
    at: where(call),
    txNode: call,
  };
}

/** Which user-code function declaration(s) a call resolves to. */
function calleeDecls(call: ts.CallExpression): ts.Declaration[] {
  const sig = checker.getResolvedSignature(call);
  const d = sig?.declaration;
  if (d && !ts.isJSDocSignature(d)) return [d];
  const s = symbolOf(call.expression);
  return s?.declarations ?? [];
}

function functionNodeForDecl(d: ts.Node): ts.SignatureDeclaration | undefined {
  if (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d) || ts.isArrowFunction(d) || ts.isFunctionExpression(d)) return d;
  if (ts.isVariableDeclaration(d) && d.initializer) {
    const i = unwrap(d.initializer);
    if (ts.isArrowFunction(i) || ts.isFunctionExpression(i)) return i;
  }
  return undefined;
}

/**
 * FUNCTION VALUES — which function bodies an expression can evaluate to. Needed because a client is often
 * obtained by calling a function VALUE (`const { getPrisma } = ctx; await getPrisma()`), whose resolved
 * signature declaration is a bodiless function TYPE in an interface.
 */
function fnValues(expr: ts.Expression, seen = new Set<ts.Node>()): ts.SignatureDeclaration[] {
  const e = unwrap(expr);
  if (seen.has(e)) return [];
  seen.add(e);
  if (ts.isArrowFunction(e) || ts.isFunctionExpression(e)) return [e];
  if (ts.isConditionalExpression(e)) return [...fnValues(e.whenTrue, seen), ...fnValues(e.whenFalse, seen)];
  if (ts.isIdentifier(e)) {
    const s = symbolOf(e);
    return (s?.declarations ?? []).flatMap((d) => fnValuesOfDecl(d, [], seen));
  }
  if (ts.isPropertyAccessExpression(e)) return fnValuesProp(e.expression, [e.name.text], seen);
  if (ts.isCallExpression(e)) {
    // `cache(fn)` and similar wrappers
    const a = e.arguments[0] && unwrap(e.arguments[0]);
    if (a && (ts.isArrowFunction(a) || ts.isFunctionExpression(a)) && /(^|\.)(cache|unstable_cache|memoize)$/.test(e.expression.getText())) return [a];
  }
  return [];
}
function fnValuesOfDecl(d: ts.Declaration, path: string[], seen: Set<ts.Node>): ts.SignatureDeclaration[] {
  if (!path.length && (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d))) return isSrcDecl(d) ? [d] : [];
  if (ts.isVariableDeclaration(d) && d.initializer) return path.length ? fnValuesProp(d.initializer, path, seen) : fnValues(d.initializer, seen);
  if (ts.isBindingElement(d)) {
    const prop = d.propertyName ? d.propertyName.getText() : (d.name as ts.Identifier).text;
    const holder = d.parent.parent;
    if (ts.isVariableDeclaration(holder) && holder.initializer && ts.isObjectBindingPattern(d.parent)) return fnValuesProp(holder.initializer, [prop, ...path], seen);
    return [];
  }
  if (ts.isPropertyAssignment(d)) return path.length ? fnValuesProp(d.initializer, path, seen) : fnValues(d.initializer, seen);
  if (ts.isShorthandPropertyAssignment(d)) {
    const vs = checker.getShorthandAssignmentValueSymbol(d);
    return (vs?.declarations ?? []).flatMap((x) => fnValuesOfDecl(x, path, seen));
  }
  return [];
}
function fnValuesProp(expr: ts.Expression, path: string[], seen: Set<ts.Node>): ts.SignatureDeclaration[] {
  const e = unwrap(expr);
  if (ts.isObjectLiteralExpression(e)) {
    for (const p of e.properties) {
      if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === path[0]) return fnValuesOfDecl(p, path.slice(1), seen);
    }
    return [];
  }
  if (ts.isIdentifier(e)) {
    const s = symbolOf(e);
    return (s?.declarations ?? []).flatMap((d) => fnValuesOfDecl(d, path, seen));
  }
  if (ts.isCallExpression(e)) {
    const out: ts.SignatureDeclaration[] = [];
    for (const d of calleeDecls(e)) {
      const F = functionNodeForDecl(d);
      const body = F && isSrcDecl(F) ? (F as ts.FunctionLikeDeclaration).body : undefined;
      if (!body) continue;
      if (!ts.isBlock(body)) { out.push(...fnValuesProp(body, path, seen)); continue; }
      const v = (n: ts.Node) => {
        if (ts.isFunctionLike(n)) return;
        if (ts.isReturnStatement(n) && n.expression) out.push(...fnValuesProp(n.expression, path, seen));
        ts.forEachChild(n, v);
      };
      ts.forEachChild(body, v);
    }
    return out;
  }
  return [];
}

/** Every function body a call can land in: resolved declarations with bodies, else function values. */
function calleeBodies(call: ts.CallExpression): ts.SignatureDeclaration[] {
  const out = new Set<ts.SignatureDeclaration>();
  for (const d of calleeDecls(call)) {
    const F = functionNodeForDecl(d);
    if (F && isSrcDecl(F) && (F as ts.FunctionLikeDeclaration).body) out.add(F);
  }
  if (!out.size) for (const f of fnValues(call.expression)) if ((f as ts.FunctionLikeDeclaration).body && isSrcDecl(f)) out.add(f);
  return [...out];
}

/** All argument expressions passed at `index` of calls that resolve to `fn` — direct calls, and places the
 *  function is handed as a VALUE to another user function that then invokes it. */
function argsPassedTo(fn: ts.SignatureDeclaration, index: number, pathInArg: string[]): { origins: Origin[]; sites: number } {
  let name: string | undefined;
  let nameNode: ts.Node | undefined;
  if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name) { name = fn.name.getText(); nameNode = fn.name; }
  else if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isVariableDeclaration(fn.parent) && ts.isIdentifier(fn.parent.name)) { name = fn.parent.name.text; nameNode = fn.parent.name; }
  if (!name) return { origins: [], sites: 0 };
  const out: Origin[] = [];
  let sites = 0;
  for (const c of callsByName.get(name) ?? []) {
    if (!calleeBodies(c).includes(fn)) continue;
    sites++;
    const a = c.arguments[index];
    if (!a) continue;
    out.push(...(pathInArg.length ? propertyOriginsOf(a, pathInArg) : originsOf(a)));
  }
  // passed as a value: `withBypassRls(fetchBonuses)` — follow the receiving function's invocations
  if (nameNode && !ts.isMethodDeclaration(fn)) {
    const sym = checker.getSymbolAtLocation(nameNode);
    const sf = fn.getSourceFile();
    const v = (n: ts.Node) => {
      if (ts.isIdentifier(n) && n !== nameNode && ts.isCallExpression(n.parent) && n.parent.arguments.includes(n) && checker.getSymbolAtLocation(n) === sym) {
        const call = n.parent;
        const argIndex = call.arguments.indexOf(n);
        for (const G of calleeBodies(call)) {
          const gp = G.parameters[argIndex];
          if (!gp || !ts.isIdentifier(gp.name)) continue;
          const gpSym = checker.getSymbolAtLocation(gp.name);
          const w = (m: ts.Node) => {
            if (ts.isCallExpression(m) && ts.isIdentifier(m.expression) && checker.getSymbolAtLocation(m.expression) === gpSym) {
              sites++;
              const a = m.arguments[index];
              if (a) out.push(...(pathInArg.length ? propertyOriginsOf(a, pathInArg) : originsOf(a)));
            }
            ts.forEachChild(m, w);
          };
          w((G as ts.FunctionLikeDeclaration).body!);
        }
      }
      ts.forEachChild(n, v);
    };
    v(sf);
  }
  return { origins: out, sites };
}

function parameterOrigins(p: ts.ParameterDeclaration, pathInParam: string[], at: ts.Node): Origin[] {
  const fn = p.parent as ts.SignatureDeclaration;
  const index = fn.parameters.indexOf(p);
  // (a) the callback of a `$transaction`
  if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && ts.isCallExpression(fn.parent)) {
    const call = fn.parent;
    if (isTransactionCall(call) && call.arguments[0] === fn && index === 0) return [txOrigin(call)];
    // (b) a callback handed to a user function F: follow F's invocations of that parameter
    const argIndex = call.arguments.indexOf(fn as ts.Expression);
    if (argIndex >= 0) {
      const out: Origin[] = [];
      for (const F of calleeBodies(call)) {
        const fp = F.parameters[argIndex];
        if (!fp || !ts.isIdentifier(fp.name)) continue;
        const fpSym = checker.getSymbolAtLocation(fp.name);
        const body = (F as ts.FunctionLikeDeclaration).body;
        if (!body) continue;
        const v = (n: ts.Node) => {
          if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && checker.getSymbolAtLocation(n.expression) === fpSym) {
            const a = n.arguments[index];
            if (a) out.push(...(pathInParam.length ? propertyOriginsOf(a, pathInParam) : originsOf(a)));
          }
          ts.forEachChild(n, v);
        };
        v(body);
      }
      if (out.length) return out;
      return unres(`parameter ${index} of a callback passed to ${call.expression.getText().slice(0, 60)} (callee not followable)`, at);
    }
  }
  // (c) a named function / method / const arrow: every resolved call site
  const { origins, sites } = argsPassedTo(fn, index, pathInParam);
  const fname = (fn as ts.FunctionDeclaration).name?.getText() ?? (ts.isVariableDeclaration(fn.parent) ? fn.parent.name.getText() : '<anonymous>');
  const optional = !!(p.questionToken || p.initializer);
  const out = [...origins];
  if (p.initializer && !pathInParam.length) out.push(...originsOf(p.initializer));
  if (out.length) return out;
  if (sites === 0) return [{ k: 'ABSENT', reason: `parameter ${index} of ${fname}: the function has NO call site in src (dead or externally invoked)`, at: where(at) }];
  if (optional) return [{ k: 'ABSENT', reason: `optional parameter ${index} of ${fname}: none of ${sites} call site(s) passes it`, at: where(at) }];
  return unres(`parameter ${index} of ${fname}: ${sites} call site(s), none pass a resolvable client`, at);
}

function declOrigins(d: ts.Declaration, at: ts.Node, path: string[]): Origin[] {
  const df = posix(d.getSourceFile().fileName);
  if (ts.isVariableDeclaration(d) && ts.isIdentifier(d.name)) {
    if (df.endsWith('/src/lib/db/prisma.ts') && d.name.text === 'prisma') return path.length ? unres('property of bare client', at) : [{ k: 'SRC', src: 'BARE', at: where(at) }];
    if (df.endsWith('/src/lib/db/admin-prisma.ts') && !path.length) return [{ k: 'SRC', src: 'ADMIN', at: where(at) }];
    if (!d.initializer) {
      // `let db; db = …` — collect assignments in scope
      const sym = checker.getSymbolAtLocation(d.name);
      const scope = d.parent.parent.parent;
      const out: Origin[] = [];
      const v = (n: ts.Node) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && checker.getSymbolAtLocation(n.left) === sym) out.push(...(path.length ? propertyOriginsOf(n.right, path) : originsOf(n.right)));
        ts.forEachChild(n, v);
      };
      v(scope);
      return out.length ? out : unres(`uninitialised variable ${d.name.text}`, at);
    }
    return path.length ? propertyOriginsOf(d.initializer, path) : originsOf(d.initializer);
  }
  if (ts.isBindingElement(d)) {
    const pat = d.parent;
    const holder = pat.parent;
    if (ts.isArrayBindingPattern(pat)) {
      // `const [db, x] = await Promise.all([getTenantPrisma(), …])` — the element at that index
      const idx = pat.elements.indexOf(d);
      const init = ts.isVariableDeclaration(holder) && holder.initializer ? unwrap(holder.initializer) : undefined;
      if (init && ts.isCallExpression(init) && /Promise\.all$/.test(init.expression.getText()) && init.arguments[0] && ts.isArrayLiteralExpression(unwrap(init.arguments[0]))) {
        const el = (unwrap(init.arguments[0]) as ts.ArrayLiteralExpression).elements[idx];
        if (el) return path.length ? propertyOriginsOf(el, path) : originsOf(el);
      }
      if (init && ts.isArrayLiteralExpression(init) && init.elements[idx]) return path.length ? propertyOriginsOf(init.elements[idx], path) : originsOf(init.elements[idx]);
      return unres('array destructuring from a non-literal', at);
    }
    const prop = d.propertyName ? d.propertyName.getText() : (d.name as ts.Identifier).text;
    const fullPath = [prop, ...path];
    if (ts.isVariableDeclaration(holder) && holder.initializer) return propertyOriginsOf(holder.initializer, fullPath);
    if (ts.isParameter(holder)) return parameterOrigins(holder, fullPath, at);
    if (ts.isBindingElement(holder)) return declOrigins(holder, at, fullPath);
    return unres(`destructuring from ${ts.SyntaxKind[holder.kind]}`, at);
  }
  if (ts.isParameter(d)) return parameterOrigins(d, path, at);
  if (ts.isPropertyAssignment(d)) return path.length ? propertyOriginsOf(d.initializer, path) : originsOf(d.initializer);
  if (ts.isShorthandPropertyAssignment(d)) {
    const vs = checker.getShorthandAssignmentValueSymbol(d);
    return (vs?.declarations ?? []).flatMap((x) => declOrigins(x, at, path));
  }
  if (ts.isPropertyDeclaration(d)) {
    const out: Origin[] = [];
    if (d.initializer) out.push(...(path.length ? propertyOriginsOf(d.initializer, path) : originsOf(d.initializer)));
    const sym = checker.getSymbolAtLocation(d.name);
    for (const a of thisAssignByName.get(d.name.getText()) ?? []) {
      if (checker.getSymbolAtLocation((a.left as ts.PropertyAccessExpression).name) === sym) out.push(...(path.length ? propertyOriginsOf(a.right, path) : originsOf(a.right)));
    }
    return out.length ? out : unres(`class property ${d.name.getText()} never assigned`, at);
  }
  if (ts.isPropertySignature(d)) {
    const sym = checker.getSymbolAtLocation(d.name);
    const out: Origin[] = [];
    for (const p of objLitPropsByName.get(d.name.getText()) ?? []) {
      const ol = p.parent as ts.ObjectLiteralExpression;
      const ct = checker.getContextualType(ol);
      const ps: ts.Symbol | undefined = ct?.getProperty(d.name.getText());
      if (ps && ps.declarations?.includes(d)) out.push(...declOrigins(p as ts.Declaration, at, path));
    }
    void sym;
    if (out.length) return out;
    if (d.questionToken) return [{ k: 'ABSENT', reason: `optional property ${d.name.getText()}: no object literal in src supplies it`, at: where(at) }];
    return unres(`interface property ${d.name.getText()} — no object literal found supplying it`, at);
  }
  if (ts.isFunctionDeclaration(d) || ts.isMethodDeclaration(d)) return unres('function used as a value', at);
  if (ts.isImportSpecifier(d) || ts.isImportClause(d)) return unres('unresolved import alias', at);
  return unres(`declaration kind ${ts.SyntaxKind[d.kind]}`, at);
}

/** Origins of `expr.path[0].path[1]…`. */
function propertyOriginsOf(expr: ts.Expression, path: string[]): Origin[] {
  const e = unwrap(expr);
  if (!path.length) return originsOf(e);
  if (ts.isObjectLiteralExpression(e)) {
    for (const p of e.properties) {
      if ((ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) && p.name.getText() === path[0]) return declOrigins(p, p, path.slice(1));
    }
    return unres(`object literal has no property ${path[0]}`, e);
  }
  if (ts.isCallExpression(e)) {
    const out: Origin[] = [];
    for (const d of calleeDecls(e)) {
      const F = functionNodeForDecl(d);
      if (!F || !isSrcDecl(F) || !(F as ts.FunctionLikeDeclaration).body) continue;
      const body = (F as ts.FunctionLikeDeclaration).body!;
      if (!ts.isBlock(body)) { out.push(...propertyOriginsOf(body, path)); continue; }
      const v = (n: ts.Node) => {
        if (ts.isFunctionLike(n)) return;
        if (ts.isReturnStatement(n) && n.expression) out.push(...propertyOriginsOf(n.expression, path));
        ts.forEachChild(n, v);
      };
      ts.forEachChild(body, v);
    }
    if (out.length) return out;
  }
  if (ts.isIdentifier(e)) {
    const s = symbolOf(e);
    if (s?.declarations?.length) return s.declarations.flatMap((d) => declOrigins(d, e, path));
  }
  // type-directed: the property's own declarations
  const t = checker.getTypeAtLocation(e);
  const ps = t.getProperty(path[0]);
  if (ps?.declarations?.length) return ps.declarations.flatMap((d) => declOrigins(d, e, path.slice(1)));
  return unres(`property ${path.join('.')} of ${ts.SyntaxKind[e.kind]}`, e);
}

function originsOf(expr: ts.Expression): Origin[] {
  if (BREAK) return unres('--break-resolver', expr);
  const e = unwrap(expr);
  const hit = memo.get(e);
  if (hit) return hit;
  if (inProgress.has(e) || depth > 60) return [];
  inProgress.add(e);
  depth++;
  let r: Origin[];
  try {
    r = compute(e);
  } finally {
    depth--;
    inProgress.delete(e);
  }
  memo.set(e, r);
  return r;
}

function compute(e: ts.Expression): Origin[] {
  if (ts.isIdentifier(e)) {
    const s = symbolOf(e);
    if (!s?.declarations?.length) return unres(`no symbol for ${e.text}`, e);
    return s.declarations.flatMap((d) => declOrigins(d, e, []));
  }
  if (e.kind === ts.SyntaxKind.ThisKeyword) return unres('`this` as a client', e);
  if (ts.isConditionalExpression(e)) return [...originsOf(e.whenTrue), ...originsOf(e.whenFalse)];
  if (ts.isBinaryExpression(e) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(e.operatorToken.kind)) return [...originsOf(e.left), ...originsOf(e.right)];
  if (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return originsOf(e.right);
  if (ts.isPropertyAccessExpression(e) || ts.isElementAccessExpression(e)) {
    const nameNode = ts.isPropertyAccessExpression(e) ? e.name : e.argumentExpression;
    const s = symbolOf(nameNode);
    if (s?.declarations?.length && s.declarations.some(isSrcDecl)) return s.declarations.filter(isSrcDecl).flatMap((d) => declOrigins(d, e, []));
    if (ts.isPropertyAccessExpression(e)) return propertyOriginsOf(e.expression, [e.name.text]);
    return unres('element access', e);
  }
  if (ts.isNewExpression(e)) return /PrismaClient/.test(e.expression.getText()) ? [{ k: 'SRC', src: 'OTHER_CLIENT', at: where(e) }] : unres('new expression', e);
  if (ts.isCallExpression(e)) {
    const callee = e.expression;
    if (ts.isPropertyAccessExpression(callee) && callee.name.text === '$extends') {
      const t = e.arguments.map((a) => a.getText()).join(',');
      if (/withTenantRLS/.test(t)) return [{ k: 'SRC', src: 'WITH_TENANT_RLS', at: where(e), acquire: e }];
      return originsOf(callee.expression);
    }
    const name = ts.isIdentifier(callee) ? callee.text : ts.isPropertyAccessExpression(callee) ? callee.name.text : '';
    const decls = calleeDecls(e);
    const sf = SOURCE_FUNCS[name];
    if (sf && decls.some((d) => fileOf(d) === sf.file)) return [{ k: 'SRC', src: sf.src, at: where(e), acquire: e }];
    if (sf && !decls.length) return [{ k: 'SRC', src: sf.src, at: where(e), acquire: e }];
    const out: Origin[] = [];
    for (const d of decls) {
      // `const getDb = cache(async () => …)` — the wrapped function's returns
      if (ts.isVariableDeclaration(d) && d.initializer && ts.isCallExpression(unwrap(d.initializer))) {
        const inner = unwrap(d.initializer) as ts.CallExpression;
        const fnArg = inner.arguments[0] && unwrap(inner.arguments[0]);
        if (fnArg && (ts.isArrowFunction(fnArg) || ts.isFunctionExpression(fnArg))) { out.push(...returnsOf(fnArg)); continue; }
      }
    }
    if (!out.length) for (const F of calleeBodies(e)) out.push(...returnsOf(F));
    if (out.length) return out;
    return unres(`call to ${callee.getText().slice(0, 80)} (${decls.length ? 'declaration outside src or bodiless' : 'no resolved declaration'})`, e);
  }
  return unres(`expression kind ${ts.SyntaxKind[e.kind]}`, e);
}

// ─────────────────────────────────────────────────────────────────────────────
// statements
// ─────────────────────────────────────────────────────────────────────────────
type Stmt = {
  id: string;
  file: string;
  line: number;
  surface: string;
  fileKind: string;
  shape: string; // model.op | $queryRaw`` | …
  model: string | null;
  op: string;
  typed: boolean;
  client: string; // BARE | TENANT_SESSION | … | TX(BARE) … | MIXED(…) | UNRESOLVED
  clientChain: string[];
  unresolvedReasons: string[];
  absentFlows: string[];
  inTransaction: boolean;
  txLine: number | null;
  syntacticTxLine: number | null; // nearest enclosing $transaction call in THIS file, any form
  bypassFlag: boolean; // app.bypass_rls set on this statement's transaction (on at least one arm)
  bypassFlagOnEveryArm: boolean;
  decorativeBypass: boolean; // the flag sits on a tenant-scoped arm, where it changes nothing
  tenantGucInTx: boolean;
  isGucPlumbing: boolean;
  tables: string[];
  tablesPartial: boolean;
  rlsTables: string[];
  noPolicyRlsTables: string[];
  noBypassPolicyTables: string[];
  tenantSource: 'SESSION' | 'PARAMETER' | 'JOB_PAYLOAD' | 'NONE';
  tenantSourceEvidence: string;
  failure: 'THROWN' | 'LOGGED' | 'SWALLOWED' | 'ERROR_RESPONSE' | 'DEFERRED';
  failureEvidence: string;
  verdict: string;
  armVerdicts: string[];
  armsDisagree: boolean;
};

function surfaceFor(p: string): string {
  const rules: [string, (p: string) => boolean][] = [
    ['DRIVER_PORTAL', (p) => p.startsWith('src/app/(driver)/') || p.startsWith('src/app/(driver-fullscreen)/')],
    ['OWNER_PORTAL', (p) => p.startsWith('src/app/(owner)/')],
    ['ADMIN_PORTAL', (p) => p.startsWith('src/app/(admin)/')],
    ['MOBILE_API', (p) => p.startsWith('src/app/api/mobile/')],
    ['API_V1', (p) => p.startsWith('src/app/api/v1/')],
    ['API_CRON', (p) => p.startsWith('src/app/api/cron/')],
    ['LIB_SERVICES', (p) => p.startsWith('src/lib/') || p.startsWith('src/server/') || p.startsWith('src/actions/')],
  ];
  for (const [s, t] of rules) if (t(p)) return s;
  let m = /^src\/app\/api\/([^/]+)\//.exec(p);
  if (m) return 'API_' + m[1].toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  m = /^src\/app\/\(([^)]+)\)\//.exec(p);
  if (m) return 'GROUP_' + m[1].toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  m = /^src\/app\/([^/]+)\//.exec(p);
  if (m) return 'APP_' + m[1].toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  if (p.startsWith('src/components/')) return 'COMPONENTS';
  return 'OTHER';
}

function fileKind(p: string): string {
  if (/\/route\.tsx?$/.test(p)) return 'ROUTE_HANDLER';
  if (/\/(layout|template)\.tsx?$/.test(p)) return 'LAYOUT';
  if (/\/page\.tsx?$/.test(p)) return 'PAGE';
  if (p.startsWith('src/actions/') || (p.startsWith('src/app/') && /\/actions?(\/|\.tsx?$)/.test(p))) return 'SERVER_ACTION';
  if (p.startsWith('src/app/')) return 'APP_OTHER';
  if (p.startsWith('src/components/')) return 'COMPONENT';
  return 'LIBRARY';
}

function tablesInSql(sql: string): string[] {
  const out = new Set<string>();
  for (const m of sql.matchAll(/\b(?:FROM|JOIN|INTO|UPDATE)\s+(?:ONLY\s+)?(?:public\.)?"?([A-Za-z_][A-Za-z0-9_]*)"?/gi)) if (TABLE.has(m[1])) out.add(m[1]);
  return [...out];
}

/** Every table a model statement reaches through its argument literal, recursively. */
function modelTables(model: string, args: readonly ts.Expression[]): { tables: string[]; partial: boolean } {
  const tables = new Set<string>([MODELS.get(model)!]);
  let partial = false;
  const seenConst = new Set<ts.Node>();
  const walkVal = (n: ts.Expression, m: string) => {
    const u = unwrap(n);
    if (ts.isObjectLiteralExpression(u)) {
      for (const p of u.properties) {
        if (ts.isSpreadAssignment(p)) { walkVal(p.expression, m); continue; }
        if (!(ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p))) continue;
        const key = p.name.getText().replace(/^['"]|['"]$/g, '');
        const target = RELATIONS.get(m)?.get(key);
        const val = ts.isPropertyAssignment(p) ? p.initializer : p.name;
        if (target) { tables.add(MODELS.get(target)!); walkVal(val, target); } else walkVal(val, m);
      }
    } else if (ts.isArrayLiteralExpression(u)) {
      for (const el of u.elements) walkVal(el, m);
    } else if (ts.isIdentifier(u)) {
      const s = symbolOf(u);
      const d = s?.declarations?.[0];
      if (d && ts.isVariableDeclaration(d) && d.initializer && !seenConst.has(d)) {
        seenConst.add(d);
        const i = unwrap(d.initializer);
        if (ts.isObjectLiteralExpression(i) || ts.isArrayLiteralExpression(i)) walkVal(i, m);
        else if (!ts.isLiteralExpression(i) && i.kind !== ts.SyntaxKind.TrueKeyword && i.kind !== ts.SyntaxKind.FalseKeyword) partial = partial || false;
      } else if (d && ts.isParameter(d)) {
        partial = true;
      }
    } else if (ts.isConditionalExpression(u)) {
      walkVal(u.whenTrue, m);
      walkVal(u.whenFalse, m);
    } else if (ts.isCallExpression(u) || ts.isPropertyAccessExpression(u)) {
      // `buildWhere(...)` / `opts.where` — contents unknown
      const t = checker.getTypeAtLocation(u);
      if (t.flags & ts.TypeFlags.Object) partial = true;
    }
  };
  if (args[0]) walkVal(args[0], model);
  return { tables: [...tables], partial };
}

function enclosingFunction(n: ts.Node): ts.SignatureDeclaration | undefined {
  let c: ts.Node | undefined = n.parent;
  while (c && !ts.isFunctionLike(c)) c = c.parent;
  return c as ts.SignatureDeclaration | undefined;
}
function topFunction(n: ts.Node): ts.Node {
  let top: ts.Node = n.getSourceFile();
  let c: ts.Node | undefined = n.parent;
  while (c && !ts.isSourceFile(c)) {
    if (ts.isFunctionLike(c)) top = c;
    c = c.parent;
  }
  return top;
}

const SESSION_CALLS = new Set([
  'getSession', 'requireAuth', 'requireRole', 'requireTenantId', 'getTenantId', 'requirePermission', 'requireDriverContext',
  'validateMobileToken', 'getCurrentUser', 'getRole', 'isSystemAdmin', 'requireDriver', 'requireSysAdmin', 'requireSystemAdmin',
  'getUser', 'requireOwner', 'auth', 'getTenantPrisma',
]);

/**
 * TENANT SOURCE — where a tenant id for this statement can come from, read off the OUTERMOST function in
 * the file that encloses it (and, for a tenant client, the function that acquired it):
 *   JOB_PAYLOAD  the file is a cron / job / webhook route (the tenant comes from iterating rows or a payload)
 *   SESSION      that function calls a session/token resolver (SESSION_CALLS) or reads `<session|auth|user>.tenantId`
 *   PARAMETER    that function (or any function between it and the statement) takes a parameter named
 *                tenantId / orgId / organizationId, or a parameter whose type carries `tenantId`
 *   NONE         none of the above — the function has no tenant in hand
 * A heuristic over names, stated as one. The evidence string names the token that decided it.
 */
function tenantSourceFor(n: ts.Node, file: string): { src: Stmt['tenantSource']; ev: string } {
  if (/^src\/app\/api\/(cron|webhooks?|inngest|jobs)\//.test(file)) return { src: 'JOB_PAYLOAD', ev: 'cron/job/webhook path' };
  const top = topFunction(n);
  let session: string | null = null;
  const v = (x: ts.Node) => {
    if (session) return;
    if (ts.isCallExpression(x)) {
      const nm = ts.isIdentifier(x.expression) ? x.expression.text : ts.isPropertyAccessExpression(x.expression) ? x.expression.name.text : '';
      if (SESSION_CALLS.has(nm)) session = `calls ${nm}()`;
    }
    if (ts.isPropertyAccessExpression(x) && x.name.text === 'tenantId' && ts.isIdentifier(x.expression) && /^(session|auth|authResult|user|currentUser|ctx|mobileAuth|driver|me)$/.test(x.expression.text)) session = `reads ${x.getText()}`;
    ts.forEachChild(x, v);
  };
  v(top);
  if (session) return { src: 'SESSION', ev: session };
  let c: ts.Node | undefined = n;
  while (c) {
    if (ts.isFunctionLike(c)) {
      for (const p of (c as ts.SignatureDeclaration).parameters) {
        const txt = p.name.getText();
        if (/\b(tenantId|orgId|organizationId|tenant_id)\b/.test(txt)) return { src: 'PARAMETER', ev: `parameter ${txt.slice(0, 60)}` };
        const t = checker.getTypeAtLocation(p);
        if (t.getProperty('tenantId') || t.getProperty('orgId')) return { src: 'PARAMETER', ev: `parameter ${txt.slice(0, 40)} carries tenantId` };
      }
    }
    if (c === top) break;
    c = c.parent;
  }
  return { src: 'NONE', ev: 'no session call, no tenant parameter in the enclosing functions' };
}

/**
 * FAILURE HANDLING — what happens to a rejection from this statement, followed upward through promise
 * chains, `Promise.all`, awaited `$transaction` callbacks and try blocks, stopping at the first function
 * boundary that is not one of those:
 *   SWALLOWED       a catch / .catch handler with no throw, no log call and no error response
 *   LOGGED          a handler that calls logger.* / console.* / Sentry.* and does not rethrow
 *   ERROR_RESPONSE  a handler that hands an error back: an HTTP error response, or an ActionState { error } / { success: false }
 *   THROWN          no handler, or a handler that rethrows: the rejection leaves the function
 *   DEFERRED        the statement runs inside after(…) — its rejection lands in afterResponse, not the request
 */
function classifyHandler(h: ts.Node): { kind: Stmt['failure']; ev: string } {
  let hasThrow = false, hasLog = false, hasErrResp = false;
  const v = (n: ts.Node) => {
    if (ts.isFunctionLike(n) && n !== h) return;
    if (ts.isThrowStatement(n)) hasThrow = true;
    // `return { error: … }` / `return { success: false, … }` — an ActionState-style error handed to the caller
    if (ts.isReturnStatement(n) && n.expression && ts.isObjectLiteralExpression(unwrap(n.expression))) {
      const txt = n.expression.getText();
      if (/\berror\s*:|success\s*:\s*false|ok\s*:\s*false/.test(txt)) hasErrResp = true;
    }
    if (ts.isCallExpression(n)) {
      const t = n.expression.getText();
      if (/^(logger|console|Sentry|log)\.|captureException|reportError|logError/.test(t)) hasLog = true;
      if (/NextResponse\.json|Response\.json|apiError|errorResponse|jsonError|notFound|redirect/.test(t)) {
        const txt = n.getText();
        if (/status:\s*(4|5)\d\d|error/i.test(txt) || /notFound|redirect/.test(t)) hasErrResp = true;
      }
    }
    ts.forEachChild(n, v);
  };
  if (ts.isFunctionLike(h)) { const b = (h as ts.FunctionLikeDeclaration).body; if (b) v(b); } else v(h);
  if (hasThrow) return { kind: 'THROWN', ev: 'handler rethrows' };
  if (hasLog) return { kind: 'LOGGED', ev: 'handler logs, does not rethrow' };
  if (hasErrResp) return { kind: 'ERROR_RESPONSE', ev: 'handler returns an error response' };
  return { kind: 'SWALLOWED', ev: `handler: ${h.getText().replace(/\s+/g, ' ').slice(0, 70)}` };
}

const SILENCE_RANK: Stmt['failure'][] = ['SWALLOWED', 'DEFERRED', 'LOGGED', 'ERROR_RESPONSE', 'THROWN'];
const callerMemo = new Map<ts.Node, { kind: Stmt['failure']; ev: string }>();

/** A rejection that leaves function F: follow F's call sites (≤ 4 hops) and report the MOST SILENT outcome. */
function callerDisposition(F: ts.SignatureDeclaration, hops: number): { kind: Stmt['failure']; ev: string } {
  const top = { kind: 'THROWN' as const, ev: 'propagates out of the entry point (page / route / action / exported helper with no src caller)' };
  const hit = callerMemo.get(F);
  if (hit) return hit;
  let name: string | undefined;
  if ((ts.isFunctionDeclaration(F) || ts.isMethodDeclaration(F)) && F.name) name = F.name.getText();
  else if ((ts.isArrowFunction(F) || ts.isFunctionExpression(F)) && ts.isVariableDeclaration(F.parent) && ts.isIdentifier(F.parent.name)) name = F.parent.name.text;
  if (!name || hops >= 4) return top;
  callerMemo.set(F, top); // cycle guard
  const outcomes: { kind: Stmt['failure']; ev: string }[] = [];
  for (const c of callsByName.get(name) ?? []) {
    if (!calleeBodies(c).includes(F)) continue;
    const r = failureFor(c, hops + 1);
    outcomes.push({ kind: r.kind, ev: `via caller ${where(c)} — ${r.ev}` });
  }
  const res = outcomes.length
    ? outcomes.sort((a, b) => SILENCE_RANK.indexOf(a.kind) - SILENCE_RANK.indexOf(b.kind))[0]
    : top;
  if (outcomes.length > 1 && new Set(outcomes.map((o) => o.kind)).size > 1) res.ev += ` (most silent of ${outcomes.length} callers: ${[...new Set(outcomes.map((o) => o.kind))].join('/')})`;
  callerMemo.set(F, res);
  return res;
}

function failureFor(stmt: ts.Node, hops = 0): { kind: Stmt['failure']; ev: string } {
  let cur: ts.Node = stmt;
  for (let guard = 0; guard < 200 && cur.parent; guard++) {
    const p: ts.Node = cur.parent;
    if (ts.isPropertyAccessExpression(p) && p.expression === cur && ts.isCallExpression(p.parent)) {
      const nm = p.name.text;
      if (nm === 'catch' && p.parent.arguments[0]) { const r = classifyHandler(p.parent.arguments[0]); return { kind: r.kind, ev: `.catch — ${r.ev}` }; }
      if (nm === 'then' && p.parent.arguments[1]) { const r = classifyHandler(p.parent.arguments[1]); return { kind: r.kind, ev: `.then(_, onRejected) — ${r.ev}` }; }
    }
    if (ts.isTryStatement(p) && p.tryBlock === cur && p.catchClause) { const r = classifyHandler(p.catchClause.block); return { kind: r.kind, ev: `try/catch at line ${lineOf(p)} — ${r.ev}` }; }
    if (ts.isCallExpression(p) && /Promise\.allSettled$/.test(p.expression.getText())) return { kind: 'SWALLOWED', ev: 'inside Promise.allSettled (rejection becomes a result value)' };
    if (ts.isFunctionLike(p)) {
      const fp = p.parent;
      if (fp && ts.isCallExpression(fp)) {
        const ct = fp.expression.getText();
        if (/(^|\.)after$/.test(ct)) return { kind: 'DEFERRED', ev: 'inside after(...)' };
        if (/(^|\.)(forEach|setTimeout|setImmediate|waitUntil)$/.test(ct)) return { kind: 'SWALLOWED', ev: `callback of ${ct} — nothing awaits the rejection` };
        // a callback handed to $transaction / map / Promise.all / a user wrapper: the rejection surfaces at that call
        if (fp.arguments.includes(p as ts.Expression)) { cur = fp; continue; }
      }
      return callerDisposition(p as ts.SignatureDeclaration, hops);
    }
    cur = p;
  }
  return { kind: 'THROWN', ev: 'reached file top' };
}

/** One way the receiver can be bound at runtime. A statement with several arms is path-insensitive MIXED. */
type Arm = { src: Source | 'UNRESOLVED'; tx: boolean; bypass: boolean; guc: boolean };

function flatten(os: Origin[]): { arms: Arm[]; labels: string[]; txLine: number | null; reasons: string[]; absent: string[]; acquire: ts.Node[] } {
  const arms = new Map<string, Arm>();
  const reasons: string[] = [];
  const absent: string[] = [];
  const acquire: ts.Node[] = [];
  let txLine: number | null = null;
  const add = (a: Arm) => arms.set(JSON.stringify(a), a);
  const rec = (o: Origin, tx: { bypass: boolean; guc: boolean } | null) => {
    if (o.k === 'ABSENT') { absent.push(`${o.at} — ${o.reason}`); return; }
    if (o.k === 'SRC') { add({ src: o.src, tx: !!tx, bypass: tx?.bypass ?? false, guc: tx?.guc ?? false }); if (o.acquire) acquire.push(o.acquire); }
    else if (o.k === 'UNRESOLVED') { add({ src: 'UNRESOLVED', tx: !!tx, bypass: tx?.bypass ?? false, guc: tx?.guc ?? false }); reasons.push(`${o.at} — ${o.reason}`); }
    else {
      txLine = txLine ?? lineOf(o.txNode);
      const inner = { bypass: (tx?.bypass ?? false) || o.bypass, guc: (tx?.guc ?? false) || o.guc };
      if (!o.base.some((b) => b.k !== 'ABSENT')) add({ src: 'UNRESOLVED', tx: true, ...inner });
      for (const b of o.base) rec(b, inner);
    }
  };
  for (const o of os) rec(o, null);
  const list = [...arms.values()];
  const labels = [...new Set(list.map((a) => (a.tx ? `TX(${a.src})` : a.src)))].sort();
  return { arms: list, labels, txLine, reasons: [...new Set(reasons)], absent: [...new Set(absent)], acquire };
}

const SAFE_SOURCES = new Set(['TENANT_SESSION', 'TENANT_ORG']);

/**
 * VERDICT — what this statement does when the application connects as `app_user` (rolbypassrls false):
 *   NO_RLS_TABLE             reaches no RLS-enabled table — unaffected
 *   ADMIN_CONNECTION         getAdminDb (app_admin, BYPASSRLS) — unaffected by RLS; grants are the control
 *   SCOPED                   tenant client (GUC set by getTenantPrisma*), or a transaction that sets the tenant GUC
 *   SILENT_ZERO_AT_CUTOVER   bare / GUC-less client, no bypass flag, on an RLS table → TC001 armed, 0 rows / 42501 unarmed
 *   BROKEN_UNDER_APP_USER    the bypass flag on a table with NO bypass_rls_policy — the flag does nothing there,
 *                            so this is a silent zero at the cutover too, not at the bypass drop
 *   SILENT_ZERO_AT_BYPASS_DROP  bypass flag on tables that all carry bypass_rls_policy → works until it is dropped
 *   NO_POLICY_TABLE          reaches an RLS table with zero policies (app_user reads nothing from it, any client)
 *   UNCLASSIFIED             the client could not be resolved
 * Evaluated PER ARM; the statement takes the WORST arm (VERDICT_RANK). A statement whose arms disagree is
 * marked `armsDisagree` — the analysis is path-insensitive, so a branch that never runs in practice
 * (driver-pay's `getPrisma` returns the bare client only on the branch its callers never take) still counts.
 */
const VERDICT_RANK = ['UNCLASSIFIED', 'SILENT_ZERO_AT_CUTOVER', 'BROKEN_UNDER_APP_USER', 'NO_POLICY_TABLE', 'SILENT_ZERO_AT_BYPASS_DROP', 'SCOPED', 'ADMIN_CONNECTION', 'NO_RLS_TABLE'];
function armVerdict(a: Arm, rlsTables: string[], noPolicy: string[], noBypassPol: string[]): string {
  if (!rlsTables.length) return 'NO_RLS_TABLE';
  if (a.src === 'UNRESOLVED') return 'UNCLASSIFIED';
  if (a.src === 'ADMIN') return 'ADMIN_CONNECTION';
  if (noPolicy.length) return 'NO_POLICY_TABLE';
  // A tenant client (or a transaction that sets the tenant GUC) is scoped whether or not the flag is ALSO
  // set: on such an arm the flag is DECORATIVE (quick-616's category) and dropping bypass_rls_policy costs nothing.
  if (SAFE_SOURCES.has(a.src) || a.guc) return 'SCOPED';
  if (a.bypass) return noBypassPol.length ? 'BROKEN_UNDER_APP_USER' : 'SILENT_ZERO_AT_BYPASS_DROP';
  return 'SILENT_ZERO_AT_CUTOVER'; // BARE / WITH_TENANT_RLS / CREATE_TENANT_CLIENT / OTHER_CLIENT with no GUC set
}
/**
 * The SQL a raw statement can issue: its own literals PLUS the literals of identifiers interpolated into it,
 * followed to their `const` initialisers (≤ 3 hops) — `Prisma.sql\`${selectBlock} WHERE …\`` in reports.ts
 * carries its FROM/JOIN in `selectBlock`, and without this the statement reaches "no table".
 */
function rawSqlText(n: ts.Node, hops = 3, seen = new Set<ts.Node>()): string {
  let s = literalText(n);
  if (hops <= 0) return s;
  const v = (x: ts.Node) => {
    if (ts.isIdentifier(x) && (ts.isTemplateSpan(x.parent) || ts.isCallExpression(x.parent))) {
      const d = symbolOf(x)?.declarations?.[0];
      if (d && ts.isVariableDeclaration(d) && d.initializer && !seen.has(d)) {
        seen.add(d);
        s += ' ' + rawSqlText(d.initializer, hops - 1, seen);
      }
    }
    ts.forEachChild(x, v);
  };
  v(n);
  return s;
}

function verdictFor(arms: Arm[], rlsTables: string[], noPolicy: string[], noBypassPol: string[], plumbing: boolean, rawNoTable = false): { verdict: string; armVerdicts: string[] } {
  if (plumbing) return { verdict: 'GUC_PLUMBING', armVerdicts: [] };
  // A raw statement whose SQL names no table (nextval, SELECT 1, a SECURITY DEFINER function call). NOT
  // "no RLS table": the census could not see a table, so it says so, and each one is classified by hand.
  if (rawNoTable) return { verdict: 'RAW_NO_TABLE_NAMED', armVerdicts: [] };
  const vs = (arms.length ? arms : [{ src: 'UNRESOLVED', tx: false, bypass: false, guc: false } as Arm]).map((a) => armVerdict(a, rlsTables, noPolicy, noBypassPol));
  const uniq = [...new Set(vs)].sort((x, y) => VERDICT_RANK.indexOf(x) - VERDICT_RANK.indexOf(y));
  return { verdict: uniq[0], armVerdicts: uniq };
}

const stmts: Stmt[] = [];
for (const sf of sourceFiles) {
  const file = rel(sf.fileName);
  const v = (n: ts.Node) => {
    let recv: ts.Expression | null = null;
    let shape = '', model: string | null = null, op = '', typed = true, raw = false;
    if (ts.isTaggedTemplateExpression(n) && ts.isPropertyAccessExpression(n.tag) && /^\$(query|execute)Raw$/.test(n.tag.name.text)) {
      recv = n.tag.expression; op = n.tag.name.text; shape = `${op}\`\``; raw = true;
    } else if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const pa = n.expression;
      if (RAW_OPS.test(pa.name.text)) { recv = pa.expression; op = pa.name.text; shape = `${op}()`; raw = true; }
      else if (PRISMA_MODEL_OPS.has(pa.name.text) && ts.isPropertyAccessExpression(pa.expression) && DELEGATE.has(pa.expression.name.text)) {
        recv = pa.expression.expression; model = DELEGATE.get(pa.expression.name.text)!; op = pa.name.text; shape = `${pa.expression.name.text}.${op}`;
      }
    }
    if (recv) {
      const opNode = ts.isTaggedTemplateExpression(n) ? (n.tag as ts.PropertyAccessExpression).name : (n as ts.CallExpression).expression as ts.PropertyAccessExpression;
      const opSym = checker.getSymbolAtLocation(ts.isPropertyAccessExpression(opNode) ? opNode.name : opNode);
      const decl = opSym?.declarations?.[0];
      const recvType = checker.getTypeAtLocation(recv);
      let accept = false;
      if (decl && isGenerated(decl)) accept = true;
      else if (!opSym && (recvType.flags & ts.TypeFlags.Any)) { accept = true; typed = false; }
      else if (!opSym) { accept = true; typed = false; }
      if (decl && !isGenerated(decl)) accept = false; // a same-named method on something that is not Prisma
      // `$queryRaw`/`$executeRaw` names exist only on Prisma: a receiver cast to a hand-written type literal
      // (require-driver.ts's `(tx as unknown as { $executeRaw: … })`) is still a Prisma statement
      if (!accept && raw) { accept = true; typed = false; }
      if (accept) {
        let os = originsOf(recv);
        // ARRAY-FORM transaction: `prisma.$transaction([prisma.$executeRaw\`set_config…\`, prisma.x.y()])` runs
        // every element in ONE transaction, so a tx-local set_config in the array applies to its siblings
        let el: ts.Node = n;
        while (ts.isParenthesizedExpression(el.parent) || ts.isAsExpression(el.parent)) el = el.parent;
        const arr = el.parent;
        if (arr && ts.isArrayLiteralExpression(arr) && ts.isCallExpression(arr.parent) && arr.parent.arguments[0] === arr && isTransactionCall(arr.parent)) {
          const alit = literalText(arr);
          os = [{ k: 'TX', base: os, bypass: /app\.bypass_rls/.test(alit), guc: /app\.current_tenant_id/.test(alit), at: where(arr.parent), txNode: arr.parent }];
        }
        let anc: ts.Node | undefined = n.parent;
        while (anc && !(ts.isCallExpression(anc) && isTransactionCall(anc))) anc = anc.parent;
        const syntacticTxLine = anc ? lineOf(anc) : null;
        const f = flatten(os);
        let tables: string[] = [], partial = false;
        const lit = raw ? rawSqlText(n) : literalText(n);
        const plumbing = raw && /set_config\s*\(/.test(lit) && tablesInSql(lit).length === 0;
        if (raw) { tables = tablesInSql(lit); partial = !plumbing && tables.length === 0; }
        else { const mt = modelTables(model!, (n as ts.CallExpression).arguments); tables = mt.tables; partial = mt.partial; }
        const rlsTables = tables.filter((t) => TABLE.get(t)?.rls);
        const noPolicy = rlsTables.filter((t) => TABLE.get(t)!.policies === 0);
        const noBypassPol = rlsTables.filter((t) => TABLE.get(t)!.bypass_policy === 0);
        const plumbingBypass = raw && /app\.bypass_rls/.test(lit);
        const tsrcNode = f.acquire.find((a) => a.getSourceFile() === sf) ?? n;
        const tsrc = tenantSourceFor(tsrcNode, file);
        const fail = failureFor(n);
        const client = f.labels.length === 1 ? f.labels[0] : f.labels.length ? `MIXED(${f.labels.join('|')})` : 'UNRESOLVED';
        const line = lineOf(n);
        const vd = verdictFor(f.arms, rlsTables, noPolicy, noBypassPol, plumbing, raw && !plumbing && tables.length === 0);
        stmts.push({
          id: `${file}:${line}:${shape}`,
          file, line, surface: surfaceFor(file), fileKind: fileKind(file), shape, model, op, typed,
          client, clientChain: f.labels, unresolvedReasons: f.reasons, absentFlows: f.absent,
          inTransaction: f.txLine !== null, txLine: f.txLine, syntacticTxLine,
          bypassFlag: plumbingBypass || f.arms.some((a) => a.bypass),
          bypassFlagOnEveryArm: plumbingBypass || (f.arms.length > 0 && f.arms.every((a) => a.bypass)),
          decorativeBypass: f.arms.some((a) => a.bypass && (SAFE_SOURCES.has(a.src) || a.guc)),
          tenantGucInTx: f.arms.some((a) => a.guc), isGucPlumbing: plumbing,
          tables, tablesPartial: partial, rlsTables, noPolicyRlsTables: noPolicy, noBypassPolicyTables: noBypassPol,
          tenantSource: tsrc.src, tenantSourceEvidence: tsrc.ev,
          failure: fail.kind, failureEvidence: fail.ev,
          verdict: vd.verdict, armVerdicts: vd.armVerdicts, armsDisagree: vd.armVerdicts.length > 1,
        });
      }
    }
    ts.forEachChild(n, v);
  };
  v(sf);
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
stmts.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : a.line - b.line));

// ─────────────────────────────────────────────────────────────────────────────
// totals
// ─────────────────────────────────────────────────────────────────────────────
const queries = stmts.filter((s) => !s.isGucPlumbing);
const count = <K extends string>(xs: Stmt[], key: (s: Stmt) => K) => {
  const o: Record<string, number> = {};
  for (const x of xs) o[key(x)] = (o[key(x)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
};
const clientBase = (s: Stmt) => s.client.replace(/^TX\((.*)\)$/, 'TX of $1');
const GATING = new Set(['SILENT_ZERO_AT_CUTOVER', 'BROKEN_UNDER_APP_USER', 'NO_POLICY_TABLE']);
const cross = (xs: Stmt[], a: (s: Stmt) => string, b: (s: Stmt) => string) => {
  const o: Record<string, Record<string, number>> = {};
  for (const x of xs) { o[a(x)] ??= {}; o[a(x)][b(x)] = (o[a(x)][b(x)] ?? 0) + 1; }
  return o;
};
const filesOf = (xs: Stmt[]) => new Set(xs.map((x) => x.file)).size;

const out = {
  generated: new Date().toISOString(),
  overrides: [...argv.entries()].filter(([, a]) => a === '--override').map(([i]) => argv[i + 1]),
  program: { rootFiles: shipping.length, sourceFilesScanned: sourceFiles.length, seconds: Number(elapsed) },
  rlsSource: 'production oqdhberkghtnszrkdvfm, read-only, evidence/00-production-rls-tables.json',
  totals: {
    statementsIncludingGucPlumbing: stmts.length,
    queries: queries.length,
    gucPlumbing: stmts.length - queries.length,
    files: filesOf(queries),
    untypedStatements: queries.filter((s) => !s.typed).length,
    byVerdict: count(queries, (s) => s.verdict),
    cutoverGating: { statements: queries.filter((s) => GATING.has(s.verdict)).length, files: filesOf(queries.filter((s) => GATING.has(s.verdict))) },
    bypassDropGating: { statements: queries.filter((s) => s.verdict === 'SILENT_ZERO_AT_BYPASS_DROP').length, files: filesOf(queries.filter((s) => s.verdict === 'SILENT_ZERO_AT_BYPASS_DROP')) },
    unresolved: {
      statements: queries.filter((s) => s.verdict.startsWith('UNCLASSIFIED')).length,
      statementsWithAnyUnresolvedOrigin: queries.filter((s) => s.client.includes('UNRESOLVED')).length,
      onRlsTables: queries.filter((s) => s.client.includes('UNRESOLVED') && s.rlsTables.length).length,
    },
    tablesPartial: queries.filter((s) => s.tablesPartial).length,
    bypassFlagged: queries.filter((s) => s.bypassFlag).length,
    armsDisagree: queries.filter((s) => s.armsDisagree).length,
    statementsWithAbsentFlows: queries.filter((s) => s.absentFlows.length).length,
    plumbing: {
      bypassSetConfig: stmts.filter((s) => s.isGucPlumbing && s.bypassFlag).length,
      bypassSetConfigFiles: filesOf(stmts.filter((s) => s.isGucPlumbing && s.bypassFlag)),
      other: stmts.filter((s) => s.isGucPlumbing && !s.bypassFlag).length,
    },
  },
  byClient: count(queries, clientBase),
  bySurface: cross(queries, (s) => s.surface, (s) => s.verdict),
  byFileKind: cross(queries, (s) => s.fileKind, (s) => s.verdict),
  byTenantSource: cross(queries, (s) => s.tenantSource, (s) => s.verdict),
  byFailure: cross(queries, (s) => s.failure, (s) => s.verdict),
  gatingBySurface: Object.fromEntries(
    Object.entries(cross(queries.filter((s) => GATING.has(s.verdict)), (s) => s.surface, () => 'n')).map(([k]) => {
      const xs = queries.filter((s) => GATING.has(s.verdict) && s.surface === k);
      return [k, { statements: xs.length, files: filesOf(xs), tenantSource: count(xs, (s) => s.tenantSource), failure: count(xs, (s) => s.failure) }];
    }),
  ),
  unresolvedReasons: count(queries.filter((s) => s.unresolvedReasons.length), (s) => s.unresolvedReasons[0].replace(/^\S+ — /, '').replace(/\d+/g, 'N').slice(0, 90)),
  statements: stmts,
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 2) + '\n');
console.log(`program: ${sourceFiles.length} shipping files, ${elapsed}s`);
console.log(`statements: ${stmts.length} (queries ${queries.length}, GUC plumbing ${stmts.length - queries.length}) in ${filesOf(queries)} files; untyped ${out.totals.untypedStatements}`);
console.log('by verdict:', JSON.stringify(out.totals.byVerdict));
console.log('by client:', JSON.stringify(out.byClient));
console.log('cutover gating:', JSON.stringify(out.totals.cutoverGating), ' bypass-drop gating:', JSON.stringify(out.totals.bypassDropGating));
console.log('unresolved:', JSON.stringify(out.totals.unresolved));
console.log(`wrote ${posix(relative(REPO, OUT))}`);
