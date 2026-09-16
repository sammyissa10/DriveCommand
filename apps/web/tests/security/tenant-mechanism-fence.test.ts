/**
 * quick-606 — the tenant-mechanism fence.
 *
 * ─── WHAT HAPPENS TO `withTenantRLS` ───────────────────────────────────────
 *
 * It SURVIVES. It is not dead weight and this guard does not deprecate it:
 * `lib/db/tenant-client.ts` composes it inside `createTenantClient`, and
 * `getTenantPrisma` / `getTenantPrismaForOrg` both set `app.current_tenant_id`
 * on the connection AND apply it. What is fenced is DIRECT use from feature
 * code, which scopes at the Prisma layer and sets nothing on the connection —
 * so with the tripwire armed every such statement raises `TC001`. quick-604
 * measured that on three cron routes; quick-606 moved the nine sites. From here
 * a new direct use is a deliberate, reviewable edit rather than an accident.
 *
 * ─── WHY A VITEST SOURCE SCAN AND NOT AN ESLINT RULE ───────────────────────
 *
 * `apps/web` has **no working lint entry point** (quick-562): `next lint` no
 * longer accepts `--dir` on this Next version and ESLint 9 finds no
 * `eslint.config.js` because the repo still carries `.eslintrc.*`. A rule nobody
 * can run is not a control. A source scan under `tests/` is the enforcement
 * actually available, and it is the shape `admin-connection-allowlist.test.ts`
 * already proved.
 *
 * ─── TWO LISTS, AND MERGING THEM WOULD MAKE THE GUARD USELESS ──────────────
 *
 *   `withTenantRLS`    — a CLOSED FENCE. Every legitimate reference is
 *                        enumerated. A new `src` importer fails the suite.
 *
 *   `createTenantClient` — a FROZEN INVENTORY, not a fence. Direct callers
 *                        remain that quick-606 did not convert, because they
 *                        were not measured failures and R4 forbids starting the
 *                        `withTenantContext` migration here. Freezing the counts
 *                        makes a new one a reviewable edit and — just as
 *                        importantly — NAMES THE LATENT SET where a reader will
 *                        find it. A fence here would be red against correct
 *                        existing code, and a red test everyone learns to ignore
 *                        protects nothing (quick-562).
 *
 * ─── HOW IT IS MATCHED ─────────────────────────────────────────────────────
 *
 *   1. By MODULE PATH, never by imported name — an alias cannot dodge a path
 *      match (quick-600's rule).
 *   2. `vi.mock(...)` / `vi.doMock(...)` of the module counts as a reference.
 *      That is deliberate: `tests/cron/digests.test.ts` was coupled to
 *      `withTenantRLS` by a mock and by nothing else, and after quick-606's fix
 *      that mock would have injected into a dead path forever. A reference test
 *      that ignored mocks would not have seen it.
 *   3. COMMENTS ARE STRIPPED before anything is counted. Half the surviving
 *      mentions of both names in this repo are prose explaining exactly this
 *      guard — including, recursively, this header. A scan that counted them
 *      would be permanently red against its own documentation.
 *   4. Per-file CALL COUNTS, so a new call inside an already-listed file is
 *      still a reviewable diff.
 *   5. CRLF normalisation on every read (quick-546 — `core.autocrlf=true`, no
 *      `.gitattributes`, and the failure mode of a bad read is GREEN).
 *   6. Anti-vacuity (quick-549/562): a floor on files visited, a per-entry
 *      `minBytes` floor on each NAMED file, and a counter-assertion that a file
 *      deliberately NOT on either list was read and contains zero matches.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';

const APP_ROOT = resolve(__dirname, '../..');

/** quick-546: LF in the index, CRLF in the working tree. Normalise or the scan reads a different file than CI does. */
function read(path: string): string {
  return readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
}

/**
 * Remove block comments and comment-only lines, then trailing `//`.
 * Conservative by design: it under-strips rather than over-strips, so a missed
 * comment can only ever make this guard NOISIER, never blinder.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trim();
      return !(t.startsWith('//') || t.startsWith('*'));
    })
    .map((l) => l.replace(/\/\/.*$/, ''))
    .join('\n');
}

type Scanned = {
  /** repo-relative, forward slashes */
  path: string;
  bytes: number;
  /** references the `db/extensions/tenant-rls` module (import, re-export or vi.mock) */
  refsRls: boolean;
  /** references the `db/tenant-client` module */
  refsTenantClient: boolean;
  rlsCalls: number;
  tenantClientCalls: number;
  aliased: string[];
};

const SKIP_DIRS = new Set(['node_modules', '.next', 'generated', 'dist', '__snapshots__']);

/** The module specifier forms that resolve to the two modules. */
const RLS_MODULE = /(^|['"/])(?:[\w@./-]*\/)?extensions\/tenant-rls(?:\.ts)?['"]/;
const TENANT_CLIENT_MODULE = /(^|['"/])(?:[\w@./-]*\/)?tenant-client(?:\.ts)?['"]/;

/**
 * Built by concatenation rather than written as a literal, so THIS FILE does not
 * match its own call pattern. Written literally, `/\bwithTenantRLS\s*\(/` reads
 * as one call inside the guard, and the guard would then have to freeze a count
 * of 1 for a call it does not make — a number with no meaning, which is the kind
 * of frozen figure that later gets "corrected" by whoever adds a real call here.
 */
const CALL = (name: string) => new RegExp('\\b' + name + '\\s*\\(', 'g');
const RLS_CALL = () => CALL('with' + 'TenantRLS');
const TENANT_CLIENT_CALL = () => CALL('create' + 'TenantClient');
const ALIAS = () => /\b(with[T]enantRLS|create[T]enantClient)\s+as\s+(\w+)/g;

function scanFile(abs: string, rel: string): Scanned {
  const raw = read(abs);
  const code = stripComments(raw);

  // Module references: every string literal in a code line that names the module.
  const literals = code.match(/['"][^'"\n]+['"]/g) ?? [];
  const refsRls = literals.some((l) => RLS_MODULE.test(l));
  const refsTenantClient = literals.some((l) => TENANT_CLIENT_MODULE.test(l));

  const aliased: string[] = [];
  for (const m of code.matchAll(ALIAS())) {
    aliased.push(`${m[1]} as ${m[2]}`);
  }

  return {
    path: rel,
    bytes: Buffer.byteLength(raw),
    refsRls,
    refsTenantClient,
    rlsCalls: (code.match(RLS_CALL()) ?? []).length,
    tenantClientCalls: (code.match(TENANT_CLIENT_CALL()) ?? []).length,
    aliased,
  };
}

function scanTree(root: string): Scanned[] {
  const out: Scanned[] = [];
  (function walk(dir: string) {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(resolve(dir, e.name));
      } else if (/\.tsx?$/.test(e.name)) {
        const abs = resolve(dir, e.name);
        out.push(scanFile(abs, abs.replace(/\\/g, '/').slice(APP_ROOT.replace(/\\/g, '/').length + 1)));
      }
    }
  })(resolve(APP_ROOT, root));
  return out;
}

const FILES = [...scanTree('src'), ...scanTree('tests')];

/**
 * ── LIST 1 — `withTenantRLS`: A CLOSED FENCE ───────────────────────────────
 *
 * Every legitimate reference, with its call count and a byte floor. After
 * quick-606 no feature-code module is on it.
 *
 * NOTE, against the plan that commissioned this guard: it names
 * `lib/db/extensions/tenant-rls-bound.prototype.ts` and
 * `src/__tests__/security/tenant-header-forgery.test.ts` as importers. **Neither
 * imports `withTenantRLS`** — the prototype defines its own `withTenantRLSBound`
 * and imports only `Prisma`, and the forgery test mocks `@/lib/db/tenant-client`,
 * one layer up. Verified by grep before this list was written, which is why the
 * plan's list is not copied into it.
 */
const RLS_ALLOWLIST: Record<string, { calls: number; minBytes: number; why: string }> = {
  'src/lib/db/tenant-client.ts': {
    calls: 1,
    minBytes: 800,
    why: 'THE composition point. `createTenantClient` applies it; this is the only production call.',
  },
  'src/lib/db/extensions/tenant-rls.ts': {
    calls: 1,
    minBytes: 800,
    why: 'the definition itself — the exported function declaration.',
  },
  'src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts': {
    calls: 5,
    minBytes: 1000,
    why: 'exercises the extension directly against the real database — that IS the unit under test.',
  },
  'tests/security/audit-log-isolation.test.ts': {
    calls: 2,
    minBytes: 1000,
    why: 'same: the extension is the subject, not a means.',
  },
  'tests/security/restricted-documents.test.ts': {
    calls: 1,
    minBytes: 1000,
    why: 'same.',
  },
  'tests/security/tenant-mechanism-fence.test.ts': {
    calls: 0,
    minBytes: 2000,
    why: 'this file. It names the module in its own regexes, and never calls it.',
  },
  'src/lib/db/extensions/__tests__/tenant-rls-finduniq-injection.test.ts': {
    calls: 0,
    minBytes: 4000,
    why:
      "quick-618's guard on the findUnique where-injection. It READS " +
      "'src/lib/db/extensions/tenant-rls.ts' off disk as a path string — which is " +
      'what this fence matched — and never imports or calls the function, hence ' +
      'calls: 0. Added deliberately rather than by widening the pattern: the fence ' +
      'is closed in BOTH directions, so a new referencing file is supposed to ' +
      'fail until a human decides it belongs.',
  },
};

/**
 * ── A GAP THIS FENCE DOES NOT COVER, STATED RATHER THAN LEFT TO BE FOUND ────
 *
 * `FILES` is `scanTree('src')` + `scanTree('tests')`. It does NOT scan
 * `scripts/`, and `scripts/audit/618-finduniq-probe.ts` genuinely imports
 * `withTenantRLS` and calls it — it drives the real extension against staging,
 * which is the whole point of that harness. So the fence's "closed" claim is
 * closed over two of the three trees that can reach the module.
 *
 * Left as-is, deliberately: widening the corpus to `scripts/` would pull in a
 * population of audit harnesses whose whole job is to exercise mechanisms
 * directly, and the fence's value is that no FEATURE code applies the extension
 * by hand. But "no file references it" is not what this guard proves, and a
 * reader should not infer it.
 */

/**
 * ── LIST 2 — `createTenantClient`: NOW A CLOSED FENCE ──────────────────────
 *
 * quick-606 froze this as an INVENTORY because it still held six latent direct
 * callers it had deliberately not converted (they were not measured failures at
 * the time). **quick-610 measured all six and converted all six**, so the list is
 * down to the mechanism itself: the definition, and the two legitimate callers
 * that issue the `set_config` before returning the client.
 *
 * The rule the six broke, kept here because it is the reason the fence exists: a
 * `createTenantClient` client carries the Prisma argument filter and NO GUC, so
 * the RLS policies — which consult `current_tenant_id()` — read whatever some
 * earlier statement happened to leave on the `max: 1` pooled connection. Under
 * the tripwire that raises `TC001`; after the `app_user` cutover without the
 * tripwire it is worse, because it is silent. Latent in exactly the way
 * `check-upcoming-maintenance.ts` was latent until it was measured.
 *
 * A new entry on this list is therefore a violation now, not an inventory row.
 * `EMPTIED_BY_610` below is the other half: set-equality alone would pass if a
 * call were re-added AND this list widened in the same edit.
 */
const TENANT_CLIENT_INVENTORY: Record<string, { calls: number; minBytes: number; why: string }> = {
  'src/lib/db/tenant-client.ts': {
    calls: 1,
    minBytes: 800,
    why: 'the definition.',
  },
  'src/lib/context/tenant-context.ts': {
    calls: 2,
    minBytes: 4000,
    why: 'THE legitimate callers — `getTenantPrisma` and `getTenantPrismaForOrg`, both of which set the GUC first.',
  },
};

/**
 * ── quick-610 — THE NAMED NEGATIVE ────────────────────────────────────────
 *
 * Files that used to hold a `createTenantClient` call and now hold none. Each
 * was measured raising `TC001` on a cold pool before conversion (evidence
 * `02-cold-before.md`) and passing after it (`05-cold-after.md`).
 *
 * WHY THIS IS NOT JUST A SHORTER INVENTORY. The both-directions set-equality
 * test above would pass identically if someone re-added a call to one of these
 * files AND widened `TENANT_CLIENT_INVENTORY` in the same edit — the shape
 * quick-566 recorded when a nav entry was removed and nothing asserted its
 * absence. Naming the emptied files makes re-adding one a red test rather than
 * a silent list edit.
 *
 * All three were measured, not read: six sites across these three files, each
 * raising TC001 in a fresh process whose first tenant-touching statement went
 * through it. None reclassified.
 */
const EMPTIED_BY_610 = [
  'src/app/(owner)/actions/dashboard.ts',
  'src/app/(owner)/actions/tenant-notification-settings.ts',
  'src/lib/db/repositories/base.repository.ts',
];

/** A file deliberately on NEITHER list, used as the counter-assertion (rule 6). */
const COUNTER_ASSERTION_FILE = 'src/lib/db/extensions/tenant-rls-bound.prototype.ts';

describe('tenant-mechanism fence — withTenantRLS is fenced, createTenantClient is inventoried', () => {
  it('the scan actually visited a tree (anti-vacuity floor)', () => {
    // 1690+ files on this tree at quick-606 (wrapper-countdown.json: filesScanned).
    // A floor of 900 cannot be satisfied by a walker that silently returned [].
    expect(FILES.length).toBeGreaterThan(900);
    expect(FILES.some((f) => f.path === 'src/lib/db/tenant-client.ts')).toBe(true);
    expect(FILES.some((f) => f.path.startsWith('tests/'))).toBe(true);
  });

  it('every file this guard names was actually FOUND and is not a stub', () => {
    // quick-546: the failure mode of a bad slice/read is GREEN. Assert found,
    // then assert a per-entry byte floor — never a blanket floor over the swept
    // tree, which would be red against a legitimate one-line re-export
    // (quick-562).
    for (const [path, entry] of Object.entries({ ...RLS_ALLOWLIST })) {
      const f = FILES.find((x) => x.path === path);
      expect(f, `RLS_ALLOWLIST names ${path} but the scan never read it`).toBeDefined();
      expect(f!.bytes, `${path} is ${f!.bytes} bytes — below its floor`).toBeGreaterThanOrEqual(
        entry.minBytes,
      );
    }
    for (const [path, entry] of Object.entries(TENANT_CLIENT_INVENTORY)) {
      const f = FILES.find((x) => x.path === path);
      expect(f, `TENANT_CLIENT_INVENTORY names ${path} but the scan never read it`).toBeDefined();
      expect(f!.bytes).toBeGreaterThanOrEqual(entry.minBytes);
    }
  });

  it('withTenantRLS: the set of referencing files equals the allowlist, in BOTH directions', () => {
    const found = FILES.filter((f) => f.refsRls || f.rlsCalls > 0)
      .map((f) => f.path)
      .sort();
    const listed = Object.keys(RLS_ALLOWLIST).sort();
    // Both directions: a new importer fails, and a listed file that stopped
    // importing fails just as loudly (quick-600's rule 2).
    expect(found).toEqual(listed);
  });

  it('withTenantRLS: per-file call counts are frozen', () => {
    for (const [path, entry] of Object.entries(RLS_ALLOWLIST)) {
      const f = FILES.find((x) => x.path === path)!;
      expect(f.rlsCalls, `${path}: ${entry.why}`).toBe(entry.calls);
    }
  });

  it('withTenantRLS: NO file under src/app or src/lib/notifications references it', () => {
    // The nine sites quick-606 moved all lived here. A named negative, because a
    // set-equality test alone would pass identically if the allowlist were
    // widened by whoever added the new site (quick-566's rule).
    const offenders = FILES.filter(
      (f) =>
        (f.path.startsWith('src/app/') || f.path.startsWith('src/lib/notifications/')) &&
        (f.refsRls || f.rlsCalls > 0),
    ).map((f) => f.path);
    expect(offenders).toEqual([]);
  });

  it('createTenantClient: the inventory is frozen, in BOTH directions', () => {
    const found = FILES.filter((f) => f.tenantClientCalls > 0)
      .map((f) => f.path)
      .sort();
    expect(found).toEqual(Object.keys(TENANT_CLIENT_INVENTORY).sort());
    for (const [path, entry] of Object.entries(TENANT_CLIENT_INVENTORY)) {
      const f = FILES.find((x) => x.path === path)!;
      expect(f.tenantClientCalls, `${path}: ${entry.why}`).toBe(entry.calls);
    }
  });

  it('createTenantClient: the files quick-610 emptied still hold ZERO calls', () => {
    for (const path of EMPTIED_BY_610) {
      const f = FILES.find((x) => x.path === path);
      // Both halves. "Was read" first: the failure mode of a walker that never
      // saw the file is GREEN on the count assertion (quick-546), so a path
      // rename would otherwise satisfy this test by making it vacuous.
      expect(f, `EMPTIED_BY_610 names ${path} but the scan never read it`).toBeDefined();
      expect(f!.bytes, `${path} is ${f!.bytes} bytes — too small to be the real file`).toBeGreaterThan(200);
      expect(
        f!.tenantClientCalls,
        `${path} calls createTenantClient again — it obtains its client from ` +
          'getTenantPrismaForOrg(tenantId) since quick-610, which is what sets the GUC the ' +
          'RLS policies read. A call here is LATENT: correct only while some earlier ' +
          'statement happens to have left a tenant context on the max:1 pool.',
      ).toBe(0);
    }
  });

  it('neither name is ever imported under an ALIAS', () => {
    const aliased = FILES.filter((f) => f.aliased.length > 0).map(
      (f) => `${f.path}: ${f.aliased.join(', ')}`,
    );
    // An alias defeats a name-based grep and is the obvious way round a
    // path-matched allowlist. Banned outright rather than allowlisted.
    expect(aliased).toEqual([]);
  });

  it('counter-assertion: a file on NEITHER list was read and contains zero matches', () => {
    // Without this, an empty-corpus walker or an over-eager comment stripper
    // would satisfy every assertion above by finding nothing anywhere.
    const f = FILES.find((x) => x.path === COUNTER_ASSERTION_FILE);
    expect(f, `${COUNTER_ASSERTION_FILE} was not read — the sweep is not reaching src/lib/db`).toBeDefined();
    expect(f!.bytes).toBeGreaterThan(1000);
    expect(f!.rlsCalls).toBe(0);
    expect(f!.tenantClientCalls).toBe(0);
    expect(f!.refsRls).toBe(false);
    // And the positive half: the stripper has NOT eaten the real calls it should see.
    const composition = FILES.find((x) => x.path === 'src/lib/db/tenant-client.ts')!;
    expect(composition.rlsCalls).toBe(1);
    expect(composition.tenantClientCalls).toBe(1);
  });
});
