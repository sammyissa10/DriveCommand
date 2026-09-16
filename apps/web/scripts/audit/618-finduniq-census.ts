/**
 * quick-618 — the TRUE count of `findUnique` / `findUniqueOrThrow` sites whose
 * result does not carry `tenantId`, and which of them are reachable through
 * `withTenantRLS` TODAY.
 *
 * ── WHY A SECOND SCANNER, WHEN quick-617 SHIPPED ONE ────────────────────────
 *
 * `617-finduniq-scan.ts` answered a narrower question and carries two blind
 * spots that understate the population. Both are fixed here and both are
 * counted, so the delta between the two instruments is a measured number rather
 * than an assertion:
 *
 *  (1) IT TEXT-MATCHES `tenantId` OVER THE WHOLE `select` INITIALISER.
 *      `select: { id: true, driver: { select: { tenantId: true } } }` has NO
 *      top-level `tenantId` — the result object has no such key and the
 *      post-check reads `undefined` — but `/\btenantId\b/` over the initialiser
 *      text matches the NESTED one and the site is scored safe. That is a FALSE
 *      NEGATIVE: a real hazard the prior scan reports as clean. This scanner
 *      reads the top-level object literal's OWN property names via the AST and
 *      records the nested mention separately, so the class is quantified.
 *
 *  (2) IT DOES NOT LOOK AT `omit`. Prisma's `omit: { tenantId: true }` strips
 *      the column from a result that has no `select` at all — the shape this
 *      repo's own code reads as "no select, therefore safe".
 *
 * A third difference is scope rather than a defect: 617 seeded tenant receivers
 * from `getTenantPrisma`/`getTenantPrismaForOrg` only. `withTenantRLS` is a
 * closed fence (tests/security/tenant-mechanism-fence.test.ts) whose only
 * production door is `createTenantClient`, reached by exactly three routes —
 * `getTenantPrisma()`, `getTenantPrismaForOrg()`, and `TenantRepository#client()`,
 * which forwards to the second. All three are seeded here.
 *
 * ── LIVE vs LATENT ──────────────────────────────────────────────────────────
 *
 * The post-check runs only when the client came through `withTenantRLS`. A site
 * on the bare client is NOT affected today and becomes affected the moment it is
 * routed. LIVE is a production defect now; LATENT is a tripwire under the
 * remaining migration. They are counted separately and never summed into one
 * headline.
 *
 * Receiver resolution is per-IDENTIFIER, never per-file: quick-602's rule, and
 * quick-617 recorded the file-level version reporting 28 and being wrong because
 * `(owner)/actions/loads.ts` uses the bare client in some functions and shadows
 * the name with `const prisma = await getTenantPrisma()` in others.
 */
import * as ts from 'typescript';
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, relative, sep, dirname } from 'path';

const WEB = resolve(process.cwd());
const SRC = resolve(WEB, 'src');
const posix = (p: string) => p.split(sep).join('/');

/* ── EXEMPT_MODELS lifted from the shipped extension, never restated ──────── */
const rlsSrc = readFileSync(
  resolve(SRC, 'lib/db/extensions/tenant-rls.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const exStart = rlsSrc.indexOf('const EXEMPT_MODELS = new Set([');
if (exStart < 0) throw new Error('EXEMPT_MODELS block not found in tenant-rls.ts');
const EXEMPT = new Set(
  [...rlsSrc.slice(exStart, rlsSrc.indexOf(']);', exStart)).matchAll(/'([^']+)'/g)].map(
    (m) => m[1],
  ),
);
if (EXEMPT.size === 0) throw new Error('EXEMPT lift failed');

/* ── file walk ────────────────────────────────────────────────────────────── */
const TEST_RE = /\.test\.|\.spec\.|__tests__|__mocks__/;
function walk(dir: string, out: string[]): string[] {
  for (const e of readdirSync(dir)) {
    const f = resolve(dir, e);
    if (statSync(f).isDirectory()) {
      if (e !== 'node_modules' && e !== 'generated' && e !== '.next') walk(f, out);
    } else if (/\.tsx?$/.test(e)) out.push(f);
  }
  return out;
}

/* ── projection verdict ───────────────────────────────────────────────────── */
type Projection =
  | 'NO_PROJECTION' /* no select, no omit -> every scalar, tenantId present  */
  | 'SELECT_HAS_TENANTID' /* top-level select names tenantId                 */
  | 'SELECT_OMITS_TENANTID' /* top-level select does NOT name it -> HAZARD   */
  | 'OMIT_STRIPS_TENANTID' /* omit: { tenantId: true } -> HAZARD             */
  | 'UNRESOLVABLE'; /* spread / computed / non-literal -> report, never score */

function propName(p: ts.ObjectLiteralElementLike): string | null {
  if (ts.isShorthandPropertyAssignment(p)) return p.name.text;
  if (ts.isPropertyAssignment(p)) {
    if (ts.isIdentifier(p.name)) return p.name.text;
    if (ts.isStringLiteral(p.name)) return p.name.text;
  }
  return null;
}

/** true when the property exists AND is not explicitly `false`. */
function ownKeyIsTruthy(obj: ts.ObjectLiteralExpression, key: string): boolean {
  for (const p of obj.properties) {
    if (propName(p) !== key) continue;
    if (ts.isPropertyAssignment(p) && p.initializer.kind === ts.SyntaxKind.FalseKeyword) {
      return false;
    }
    return true;
  }
  return false;
}

function hasSpread(obj: ts.ObjectLiteralExpression): boolean {
  return obj.properties.some((p) => ts.isSpreadAssignment(p));
}

function classifyProjection(arg: ts.ObjectLiteralExpression): {
  verdict: Projection;
  nestedMentionsTenantId: boolean;
} {
  const get = (k: string) => arg.properties.find((p) => propName(p) === k);
  const selProp = get('select');
  const omitProp = get('omit');

  let nestedMentionsTenantId = false;

  // omit first: `omit` and `select` are mutually exclusive in Prisma, but a
  // caller could still write both; if omit strips the column the result lacks it.
  if (omitProp && ts.isPropertyAssignment(omitProp)) {
    const init = omitProp.initializer;
    if (ts.isObjectLiteralExpression(init)) {
      if (hasSpread(init)) return { verdict: 'UNRESOLVABLE', nestedMentionsTenantId };
      if (ownKeyIsTruthy(init, 'tenantId')) {
        return { verdict: 'OMIT_STRIPS_TENANTID', nestedMentionsTenantId };
      }
    } else {
      return { verdict: 'UNRESOLVABLE', nestedMentionsTenantId };
    }
  }

  if (!selProp) return { verdict: 'NO_PROJECTION', nestedMentionsTenantId };
  if (!ts.isPropertyAssignment(selProp)) {
    return { verdict: 'UNRESOLVABLE', nestedMentionsTenantId };
  }
  const init = selProp.initializer;
  if (!ts.isObjectLiteralExpression(init)) {
    return { verdict: 'UNRESOLVABLE', nestedMentionsTenantId };
  }

  // Does any NESTED level mention tenantId while the top level does not?
  // This is precisely the shape 617's text match scores as safe.
  const topLevelHas = ownKeyIsTruthy(init, 'tenantId');
  const wholeText = init.getText();
  nestedMentionsTenantId = !topLevelHas && /\btenantId\b/.test(wholeText);

  if (hasSpread(init)) return { verdict: 'UNRESOLVABLE', nestedMentionsTenantId };
  return {
    verdict: topLevelHas ? 'SELECT_HAS_TENANTID' : 'SELECT_OMITS_TENANTID',
    nestedMentionsTenantId,
  };
}

/* ── receiver resolution ──────────────────────────────────────────────────── */
const TENANT_ACQ =
  /\b(getTenantPrisma|getTenantPrismaForOrg|createTenantClient)\s*\(|\.\$extends\s*\(\s*withTenantRLS\s*\(|\bthis\s*\.\s*client\s*\(\s*\)/;

/**
 * `getAdminDb` returns the `app_admin` connection (quick-600). It applies NO
 * tenant extension at all, so the post-check can never run on it. These sites
 * are NOT_APPLICABLE — never affected today and never affected by the
 * migration, because routing an admin path onto a tenant client would be the
 * wrong fix, not a pending one. Counting them as LATENT would inflate the
 * number of sites this defect can still reach.
 */
const ADMIN_ACQ = /\bgetAdminDb\s*\(/;

type ReceiverClass = 'TENANT' | 'ADMIN' | 'BARE_OR_UNKNOWN';

type Hit = {
  file: string;
  line: number;
  op: 'findUnique' | 'findUniqueOrThrow';
  model: string;
  recv: string;
  receiverClass: ReceiverClass;
  projection: Projection;
  nestedMentionsTenantId: boolean;
  live: boolean;
  isTest: boolean;
  viaParameter?: string;
};

const files = walk(SRC, []);

/* ── PASS A: inter-procedural — which FUNCTION PARAMETERS receive a tenant
 *            client from a caller?
 *
 * `digests/daily-driver-payload.ts` takes `tenantPrisma` as an argument; the
 * cron route passes `await getTenantPrismaForOrg(tenant.id)` into it. A scan
 * that only reads local declarations sees a bare parameter and scores the site
 * LATENT — it is LIVE. Three of this repo's sites are exactly that shape, so the
 * pass is not hypothetical.
 *
 * Bounded deliberately: one hop, matched on function NAME and argument
 * POSITION. Anything it cannot resolve stays BARE_OR_UNKNOWN, which is the
 * conservative direction for a LIVE count (it under-reports rather than
 * inventing live defects).
 */
const tenantParamsByFn = new Map<string, Set<number>>();
for (const full of files) {
  const text = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  if (!TENANT_ACQ.test(text)) continue;
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);

  const localTenant = new Set<string>();
  const seed = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      if (TENANT_ACQ.test(n.initializer.getText())) localTenant.add(n.name.text);
    }
    n.forEachChild(seed);
  };
  seed(sf);

  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const callee = ts.isIdentifier(n.expression)
        ? n.expression.text
        : ts.isPropertyAccessExpression(n.expression)
          ? n.expression.name.text
          : null;
      if (callee) {
        n.arguments.forEach((a, i) => {
          const t = a.getText();
          if ((ts.isIdentifier(a) && localTenant.has(a.text)) || TENANT_ACQ.test(t)) {
            if (!tenantParamsByFn.has(callee)) tenantParamsByFn.set(callee, new Set());
            tenantParamsByFn.get(callee)!.add(i);
          }
        });
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
}

const hits: Hit[] = [];

for (const full of files) {
  const text = readFileSync(full, 'utf8').replace(/\r\n/g, '\n');
  if (!text.includes('findUnique')) continue;
  const sf = ts.createSourceFile(full, text, ts.ScriptTarget.Latest, true);
  const rel = posix(relative(WEB, full));
  const isTest = TEST_RE.test(rel);

  /* identifiers bound to a withTenantRLS client */
  const tenantNames = new Set<string>();
  const adminNames = new Set<string>();
  const paramOrigin = new Map<string, string>();
  const seedDecls = (n: ts.Node) => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const init = n.initializer.getText();
      if (TENANT_ACQ.test(init)) tenantNames.add(n.name.text);
      else if (ADMIN_ACQ.test(init)) adminNames.add(n.name.text);
    }
    n.forEachChild(seedDecls);
  };
  seedDecls(sf);

  /* PASS A applied: a parameter this repo passes a tenant client into */
  const seedParams = (n: ts.Node) => {
    const fnName =
      (ts.isFunctionDeclaration(n) && n.name?.text) ||
      (ts.isFunctionExpression(n) && n.name?.text) ||
      (ts.isVariableDeclaration(n.parent ?? n) &&
        ts.isIdentifier((n.parent as ts.VariableDeclaration).name) &&
        (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) &&
        (n.parent as ts.VariableDeclaration).name.getText()) ||
      null;
    if (
      fnName &&
      (ts.isFunctionDeclaration(n) || ts.isArrowFunction(n) || ts.isFunctionExpression(n))
    ) {
      const idxs = tenantParamsByFn.get(fnName);
      if (idxs) {
        for (const i of idxs) {
          const p = n.parameters[i];
          // A LOCAL declaration wins. `loads.ts` shadows `prisma` with
          // `const prisma = await getTenantPrisma()` inside seven functions AND
          // passes it to `generateLoadNumber(prisma, …)`, so without this the
          // whole file's verdict is attributed to the parameter rather than to
          // the shadow that actually binds it. The verdict is the same either
          // way; the EXPLANATION is not, and an explanation nobody can check is
          // how quick-617 came to record this file as bare.
          if (p && ts.isIdentifier(p.name) && !tenantNames.has(p.name.text)) {
            tenantNames.add(p.name.text);
            paramOrigin.set(p.name.text, `${fnName}(arg ${i})`);
          }
        }
      }
    }
    n.forEachChild(seedParams);
  };
  seedParams(sf);

  /* `$transaction(async (tx) => ...)` on a tenant receiver binds `tx` too */
  const seedTx = (n: ts.Node) => {
    if (
      ts.isCallExpression(n) &&
      ts.isPropertyAccessExpression(n.expression) &&
      n.expression.name.text === '$transaction'
    ) {
      const recv = n.expression.expression.getText();
      const cb = n.arguments[0];
      if (
        (tenantNames.has(recv) || TENANT_ACQ.test(recv)) &&
        cb &&
        (ts.isArrowFunction(cb) || ts.isFunctionExpression(cb))
      ) {
        const p0 = cb.parameters[0];
        if (p0 && ts.isIdentifier(p0.name)) tenantNames.add(p0.name.text);
      }
    }
    n.forEachChild(seedTx);
  };
  seedTx(sf);
  seedTx(sf); // twice: a param can be seeded by a name seeded in pass 1

  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const op = n.expression.name.text;
      if (
        (op === 'findUnique' || op === 'findUniqueOrThrow') &&
        ts.isPropertyAccessExpression(n.expression.expression)
      ) {
        const model = n.expression.expression.name.text;
        const recvNode = n.expression.expression.expression;
        const recv = recvNode.getText().replace(/\s+/g, ' ');
        const Pascal = model.charAt(0).toUpperCase() + model.slice(1);
        if (!EXEMPT.has(Pascal)) {
          const arg = n.arguments[0];
          const { verdict, nestedMentionsTenantId } =
            arg && ts.isObjectLiteralExpression(arg)
              ? classifyProjection(arg)
              : { verdict: 'UNRESOLVABLE' as Projection, nestedMentionsTenantId: false };

          const receiverClass: ReceiverClass =
            tenantNames.has(recv) || TENANT_ACQ.test(recvNode.getText())
              ? 'TENANT'
              : adminNames.has(recv) || ADMIN_ACQ.test(recvNode.getText())
                ? 'ADMIN'
                : 'BARE_OR_UNKNOWN';

          hits.push({
            file: rel,
            line: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
            op: op as Hit['op'],
            model: Pascal,
            recv,
            receiverClass,
            projection: verdict,
            nestedMentionsTenantId,
            live: receiverClass === 'TENANT',
            isTest,
            viaParameter: paramOrigin.get(recv),
          });
        }
      }
    }
    n.forEachChild(visit);
  };
  visit(sf);
}

/* ── integrity floors: the failure mode of a broken walker is an empty set ── */
if (files.length < 500) throw new Error(`file walk floor: only ${files.length} files`);
if (hits.length < 20) throw new Error(`hit floor: only ${hits.length} findUnique hits`);
const anySafe = hits.some((h) => h.projection === 'NO_PROJECTION');
const anyHazard = hits.some((h) => h.projection === 'SELECT_OMITS_TENANTID');
if (!anySafe) throw new Error('counter-assertion: no NO_PROJECTION site found — predicate is degenerate');
if (!anyHazard) throw new Error('counter-assertion: no SELECT_OMITS_TENANTID site found — predicate is degenerate');

const prod = hits.filter((h) => !h.isTest);
const HAZARD: Projection[] = ['SELECT_OMITS_TENANTID', 'OMIT_STRIPS_TENANTID'];
const hazards = prod.filter((h) => HAZARD.includes(h.projection));
const live = hazards.filter((h) => h.receiverClass === 'TENANT');
const latent = hazards.filter((h) => h.receiverClass === 'BARE_OR_UNKNOWN');
const notApplicable = hazards.filter((h) => h.receiverClass === 'ADMIN');
const mobile = latent.filter((h) => h.file.startsWith('src/app/api/mobile/'));
const maskedByNested = prod.filter(
  (h) => h.projection === 'SELECT_OMITS_TENANTID' && h.nestedMentionsTenantId,
);

const out = {
  generatedAt: new Date().toISOString(),
  filesScanned: files.length,
  exemptModelsLifted: EXEMPT.size,
  totals: {
    allFindUniqueOnNonExemptModels: prod.length,
    hazards: hazards.length,
    live: live.length,
    latent: latent.length,
    notApplicableAdminConnection: notApplicable.length,
    mobileApi: mobile.length,
    unresolvable: prod.filter((h) => h.projection === 'UNRESOLVABLE').length,
    maskedByNestedSelectIn617Scan: maskedByNested.length,
    findUniqueOrThrowHazards: hazards.filter((h) => h.op === 'findUniqueOrThrow').length,
  },
  byProjection: Object.fromEntries(
    (
      [
        'NO_PROJECTION',
        'SELECT_HAS_TENANTID',
        'SELECT_OMITS_TENANTID',
        'OMIT_STRIPS_TENANTID',
        'UNRESOLVABLE',
      ] as Projection[]
    ).map((p) => [p, prod.filter((h) => h.projection === p).length]),
  ),
  live,
  latent,
  notApplicable,
  maskedByNested,
  unresolvableSites: prod.filter((h) => h.projection === 'UNRESOLVABLE'),
};

const dest = resolve(
  WEB,
  '../../.planning/quick/618-fix-the-withtenantrls-findunique-post-ch/evidence/01-census.json',
);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, JSON.stringify(out, null, 2));

console.log(`files scanned: ${files.length}   EXEMPT_MODELS lifted: ${EXEMPT.size}`);
console.log(`findUnique/findUniqueOrThrow on NON-EXEMPT models (production): ${prod.length}`);
console.log('  by projection:', JSON.stringify(out.byProjection));
console.log(`HAZARDS (result cannot carry tenantId): ${hazards.length}`);
console.log(`  LIVE   (receiver is a withTenantRLS client today): ${live.length}`);
console.log(`  LATENT (bare client — reaches it when routed):     ${latent.length}`);
console.log(`  N/A    (getAdminDb — no tenant extension, ever):   ${notApplicable.length}`);
console.log(`  of the LATENT, under src/app/api/mobile/:          ${mobile.length}`);
console.log(`  findUniqueOrThrow among hazards:                   ${out.totals.findUniqueOrThrowHazards}`);
console.log(`MASKED BY A NESTED tenantId (617 scan scores these SAFE): ${maskedByNested.length}`);
console.log(`UNRESOLVABLE (spread/computed — reported, never scored): ${out.totals.unresolvable}`);
/**
 * LIVE/LATENT describe REACHABILITY — whether the post-check runs on this site —
 * not whether the site is broken. Before quick-618's fix every LIVE row was a
 * production defect; after it, LIVE means "reaches the fixed extension and is
 * therefore correct", and LATENT means "will reach it when routed, and will also
 * be correct". The label is kept because the reachability question is the one
 * the remaining migration needs answered; the defect reading is not.
 */
console.log('\n--- LIVE (the post-check runs here) ---');
for (const h of live)
  console.log(
    `  ${h.file}:${h.line}  ${h.op}  ${h.model}  recv=${h.recv}${h.viaParameter ? ` <- ${h.viaParameter}` : ''}`,
  );
console.log('\n--- LATENT (becomes live on routing) ---');
for (const h of latent) console.log(`  ${h.file}:${h.line}  ${h.op}  ${h.model}  recv=${h.recv}`);
console.log('\n--- NOT APPLICABLE (admin connection) ---');
for (const h of notApplicable) console.log(`  ${h.file}:${h.line}  ${h.op}  ${h.model}  recv=${h.recv}`);
if (maskedByNested.length) {
  console.log('\n--- MASKED BY NESTED tenantId (new in this scan) ---');
  for (const h of maskedByNested) console.log(`  ${h.file}:${h.line}  ${h.op}  ${h.model}  live=${h.live}`);
}
if (out.unresolvableSites.length) {
  console.log('\n--- UNRESOLVABLE ---');
  for (const h of out.unresolvableSites) console.log(`  ${h.file}:${h.line}  ${h.op}  ${h.model}  recv=${h.recv}`);
}
console.log(`\nwritten: ${posix(relative(WEB, dest))}`);
