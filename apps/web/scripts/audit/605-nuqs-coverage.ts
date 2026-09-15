/**
 * quick-605 — the nuqs consumer trace and the adapter-coverage computation.
 *
 *   npx tsx scripts/audit/605-nuqs-coverage.ts            (prints + writes evidence)
 *   npx tsx scripts/audit/605-nuqs-coverage.ts --quiet     (no evidence write)
 *
 * THIS FILE MUST NEVER IMPORT `scripts/_bootstrap-env` — it assigns
 * `DATABASE_URL = DIRECT_URL` unconditionally and `DIRECT_URL` is PRODUCTION in
 * every env file. It touches no database at all: it is a pure source scan.
 *
 * ─── WHAT THIS ANSWERS ──────────────────────────────────────────────────────
 *
 * `nuqs` throws `[nuqs] nuqs requires an adapter to work with your framework.`
 * at RENDER time when a `useQueryState` call finds no `NuqsAdapter` above it in
 * the React tree. A missing React context is not a type error, so `tsc` cannot
 * see it; and `(owner)/layout.tsx` is `force-dynamic`, so `next build` never
 * renders those pages. The only cheap gate left is a source scan, and this is it.
 *
 * Three exported functions, deliberately separate so the committed vitest guard
 * (`src/__tests__/nuqs-adapter-coverage.test.ts`) imports the SAME code that
 * produced the evidence rather than a second copy that can drift:
 *
 *   findNuqsConsumerPages(root) — BFS UP the import graph from every module that
 *     imports a hook from `nuqs` to every Next special file that can reach it.
 *   findAdapterMounts(root)     — every layout that imports AND renders NuqsAdapter.
 *   computeCoverage(pages, mounts) — per page, walk the layout chain upward and
 *     mark `covered` iff an ancestor layout is a mount.
 *
 * ─── THE FAILURE MODE OF A SOURCE SCAN IS GREEN, NOT RED ────────────────────
 *
 * This repo is `core.autocrlf=true` with no `.gitattributes`, so the working
 * tree is CRLF and the index is LF (quick-546). A regex anchored on `\n` matches
 * nothing in the working tree and the scan returns an empty set, which every
 * downstream assertion then passes over vacuously. Every read here is
 * CRLF-normalised, and `assertScanIntegrity` exists so an empty result is a
 * thrown error rather than a green run.
 */

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { resolve, dirname, relative, sep, posix } from 'path';

// ---------------------------------------------------------------------------
// Constants — one place, imported by the tests rather than restated.
// ---------------------------------------------------------------------------

/** Next special files that terminate the upward BFS. A page is not the only entry point. */
export const NEXT_SPECIAL_FILES = [
  'page.tsx',
  'page.ts',
  'layout.tsx',
  'layout.ts',
  'template.tsx',
  'template.ts',
  'default.tsx',
  'default.ts',
  'error.tsx',
  'error.ts',
] as const;

/**
 * A hook import from nuqs is the CONSUMER. `nuqs/adapters/*` is the MOUNT and
 * `nuqs/server` is parser-only (no React context), so neither seeds the BFS —
 * seeding from the adapter would make the graph circular, since the mount is
 * itself a layout the BFS terminates on.
 */
const NUQS_CONSUMER_SPECIFIER = 'nuqs';
const NUQS_ADAPTER_SPECIFIER_PREFIX = 'nuqs/adapters/';

/**
 * Integrity floors. Deliberately low — they exist to separate "the scan found
 * nothing because the tree moved" from "the scan found nothing because it is
 * broken", not to pin today's numbers. A floor that tracks the current count
 * turns every legitimate refactor into a red test, and a red test everyone
 * knows to ignore protects nothing.
 */
export const SCAN_FLOORS = {
  /** `apps/web/src` carried ~2,900 .ts/.tsx files when this was written. */
  scannedFiles: 500,
  /** At least the one consumer module (`useGridUrlState.ts`). */
  seedModules: 1,
  /** At least one layout must mount the adapter, or the app is broken. */
  adapterMounts: 1,
  /** At least the seven pages in the quick-605 trace. */
  consumerPages: 7,
} as const;

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

/**
 * Every read in this module goes through here. CRLF normalisation is not a
 * nicety: without it the import regexes (anchored on line starts) match nothing
 * on a Windows checkout and the whole scan returns empty AND GREEN.
 */
export function readSource(file: string): string {
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function toPosix(p: string): string {
  return p.split(sep).join('/');
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', '.turbo', 'coverage']);

function walk(dir: string, out: string[] = []): string[] {
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of names) {
    if (SKIP_DIRS.has(name)) continue;
    const full = resolve(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Import extraction
// ---------------------------------------------------------------------------

/**
 * Every module specifier this file references: static `import … from 'x'`,
 * bare `import 'x'`, `export … from 'x'`, and dynamic `import('x')`.
 * Deliberately regex-based rather than a TS parse — the guard must run in
 * vitest without pulling the compiler in, and specifier extraction is the one
 * thing a regex does reliably on this shape.
 */
export function extractSpecifiers(source: string): string[] {
  const out: string[] = [];
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push(m[1]);
  }
  return out;
}

/** Resolve a specifier to an absolute file under `srcRoot`, or null if external. */
function resolveSpecifier(specifier: string, fromFile: string, srcRoot: string): string | null {
  let base: string;
  if (specifier.startsWith('@/')) {
    base = resolve(srcRoot, specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    base = resolve(dirname(fromFile), specifier);
  } else {
    return null; // package or alias this scan does not follow
  }
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    resolve(base, 'index.ts'),
    resolve(base, 'index.tsx'),
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* not this one */
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Route derivation
// ---------------------------------------------------------------------------

/** `src/app/(owner)/carrier/x/page.tsx` → `/carrier/x`. Route groups disappear. */
export function routeForAppFile(appRelPosix: string): string {
  const withoutFile = appRelPosix.replace(/\/(page|layout|template|default|error)\.(tsx?|jsx?)$/, '');
  const segments = withoutFile
    .split('/')
    .filter((s) => s.length > 0 && !(s.startsWith('(') && s.endsWith(')')));
  return '/' + segments.join('/');
}

/** `(owner)/carrier/x/page.tsx` → `(owner)`; a route-group-less path → `(root)`. */
export function routeGroupForAppFile(appRelPosix: string): string {
  const m = appRelPosix.split('/').find((s) => s.startsWith('(') && s.endsWith(')'));
  return m ?? '(root)';
}

// ---------------------------------------------------------------------------
// The scan
// ---------------------------------------------------------------------------

export type ScanGraph = {
  srcRoot: string;
  appRoot: string;
  files: string[];
  /** importee → importers */
  importedBy: Map<string, string[]>;
  /** modules that import a hook from bare `nuqs` */
  seeds: string[];
};

export function buildGraph(root: string): ScanGraph {
  const srcRoot = resolve(root, 'src');
  const appRoot = resolve(srcRoot, 'app');
  const files = walk(srcRoot);
  const importedBy = new Map<string, string[]>();
  const seeds: string[] = [];

  for (const file of files) {
    const source = readSource(file);
    const specs = extractSpecifiers(source);
    for (const spec of specs) {
      if (spec === NUQS_CONSUMER_SPECIFIER) {
        if (!seeds.includes(file)) seeds.push(file);
        continue;
      }
      if (spec.startsWith(NUQS_ADAPTER_SPECIFIER_PREFIX) || spec === 'nuqs/server') continue;
      const target = resolveSpecifier(spec, file, srcRoot);
      if (!target) continue;
      const list = importedBy.get(target);
      if (list) {
        if (!list.includes(file)) list.push(file);
      } else {
        importedBy.set(target, [file]);
      }
    }
  }

  return { srcRoot, appRoot, files, importedBy, seeds };
}

function isNextSpecialFile(file: string, appRoot: string): boolean {
  const rel = toPosix(relative(appRoot, file));
  if (rel.startsWith('..')) return false;
  const name = rel.split('/').pop()!;
  return (NEXT_SPECIAL_FILES as readonly string[]).includes(name);
}

export type ConsumerPage = {
  /** repo-relative-ish: `src/app/(owner)/carrier/x/page.tsx` */
  pageFile: string;
  route: string;
  routeGroup: string;
  kind: string;
  /** the import path that reached it, nearest-consumer-first */
  chain: string[];
};

/**
 * BFS UP the import graph (who-imports-whom) from every nuqs hook consumer to
 * every Next special file that transitively renders it.
 */
export function findNuqsConsumerPages(root: string, graph?: ScanGraph): ConsumerPage[] {
  const g = graph ?? buildGraph(root);
  const { appRoot, srcRoot, importedBy, seeds } = g;

  const found = new Map<string, ConsumerPage>();
  // queue carries the chain that reached each node, so the report can show WHY
  // a page is in the trace rather than only that it is.
  const queue: { file: string; chain: string[] }[] = seeds.map((s) => ({ file: s, chain: [s] }));
  const visited = new Set<string>(seeds);

  while (queue.length) {
    const { file, chain } = queue.shift()!;
    if (isNextSpecialFile(file, appRoot)) {
      const appRel = toPosix(relative(appRoot, file));
      const key = toPosix(relative(srcRoot, file));
      if (!found.has(key)) {
        found.set(key, {
          pageFile: `src/${key}`,
          route: routeForAppFile(appRel),
          routeGroup: routeGroupForAppFile(appRel),
          kind: appRel.split('/').pop()!.replace(/\.(tsx?|jsx?)$/, ''),
          chain: chain.map((c) => `src/${toPosix(relative(srcRoot, c))}`),
        });
      }
      // A Next special file terminates this branch: nothing in `src/app` imports
      // a page, and continuing would only re-walk shared modules.
      continue;
    }
    for (const importer of importedBy.get(file) ?? []) {
      if (visited.has(importer)) continue;
      visited.add(importer);
      queue.push({ file: importer, chain: [...chain, importer] });
    }
  }

  return [...found.values()].sort((a, b) => a.pageFile.localeCompare(b.pageFile));
}

export type AdapterMount = {
  /** `src/app/(dev)/layout.tsx` */
  layoutFile: string;
  routeGroup: string;
  /** the directory the mount covers, app-relative; '' means the root layout */
  coversFrom: string;
};

/** Every `src/app/**​/layout.tsx` that both imports AND renders `NuqsAdapter`. */
export function findAdapterMounts(root: string, graph?: ScanGraph): AdapterMount[] {
  const g = graph ?? buildGraph(root);
  const { appRoot, srcRoot, files } = g;
  const out: AdapterMount[] = [];
  for (const file of files) {
    const rel = toPosix(relative(appRoot, file));
    if (rel.startsWith('..')) continue;
    if (!/(^|\/)layout\.tsx?$/.test(rel)) continue;
    const source = readSource(file);
    const imports = extractSpecifiers(source).some((s) => s.startsWith(NUQS_ADAPTER_SPECIFIER_PREFIX));
    // "Imports it" is not "renders it" — a dead import would otherwise count as
    // a mount and make every page below it read as covered.
    const renders = /<NuqsAdapter[\s>]/.test(source);
    if (imports && renders) {
      out.push({
        layoutFile: `src/${toPosix(relative(srcRoot, file))}`,
        routeGroup: routeGroupForAppFile(rel),
        coversFrom: rel.replace(/(^|\/)layout\.tsx?$/, ''),
      });
    }
  }
  return out.sort((a, b) => a.layoutFile.localeCompare(b.layoutFile));
}

/**
 * Every `layout.tsx` on the path from a page up to `src/app/layout.tsx`,
 * nearest-first. This is Next's own resolution order, so a mount in any of them
 * is above the page in the React tree.
 */
export function layoutChainFor(pageFile: string, root: string): string[] {
  const srcRoot = resolve(root, 'src');
  const abs = resolve(root, pageFile);
  const appRoot = resolve(srcRoot, 'app');
  const chain: string[] = [];
  let dir = dirname(abs);
  for (;;) {
    for (const name of ['layout.tsx', 'layout.ts']) {
      const candidate = resolve(dir, name);
      if (existsSync(candidate)) chain.push(`src/${toPosix(relative(srcRoot, candidate))}`);
    }
    if (dir === appRoot) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return chain;
}

export type CoverageRow = ConsumerPage & {
  layoutChain: string[];
  coveredBy: string | null;
  covered: boolean;
};

export function computeCoverage(
  pages: ConsumerPage[],
  mounts: AdapterMount[],
  root: string,
): CoverageRow[] {
  const mountSet = new Set(mounts.map((m) => m.layoutFile));
  return pages.map((p) => {
    const layoutChain = layoutChainFor(p.pageFile, root);
    // A layout that mounts the adapter covers ITSELF too — it renders the
    // provider around its own children, and its own body is above that.
    const coveredBy = layoutChain.find((l) => mountSet.has(l)) ?? null;
    return { ...p, layoutChain, coveredBy, covered: coveredBy !== null };
  });
}

/**
 * The "was it actually found" assertions. Called before any coverage claim is
 * believed. Without these, an empty scan satisfies "every page is covered".
 */
export function assertScanIntegrity(
  graph: ScanGraph,
  pages: ConsumerPage[],
  mounts: AdapterMount[],
  floors: Partial<typeof SCAN_FLOORS> = {},
): void {
  const f = { ...SCAN_FLOORS, ...floors };
  const problems: string[] = [];
  if (graph.files.length < f.scannedFiles) {
    problems.push(`scanned ${graph.files.length} files, floor is ${f.scannedFiles} — the walk is broken`);
  }
  if (graph.seeds.length < f.seedModules) {
    problems.push(
      `found ${graph.seeds.length} module(s) importing a hook from '${NUQS_CONSUMER_SPECIFIER}', floor is ${f.seedModules}`,
    );
  }
  if (mounts.length < f.adapterMounts) {
    problems.push(`found ${mounts.length} NuqsAdapter mount(s), floor is ${f.adapterMounts}`);
  }
  if (pages.length < f.consumerPages) {
    problems.push(`traced ${pages.length} consumer page(s), floor is ${f.consumerPages}`);
  }
  // A file that reads as empty after CRLF normalisation means the reader broke,
  // not that the source is empty.
  for (const seed of graph.seeds) {
    if (readSource(seed).length < 1) problems.push(`seed module ${seed} read as empty`);
  }
  if (problems.length) {
    throw new Error(
      `605-nuqs-coverage: the scan did not find enough to be believed:\n  - ${problems.join('\n  - ')}`,
    );
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const APP_ROOT = resolve(__dirname, '../..');
  const REPO_ROOT = resolve(APP_ROOT, '../..');
  const EVIDENCE_DIR = resolve(
    REPO_ROOT,
    '.planning/quick/605-fix-the-two-production-screens-that-500-/evidence',
  );

  const graph = buildGraph(APP_ROOT);
  const pages = findNuqsConsumerPages(APP_ROOT, graph);
  const mounts = findAdapterMounts(APP_ROOT, graph);
  assertScanIntegrity(graph, pages, mounts);
  const coverage = computeCoverage(pages, mounts, APP_ROOT);

  console.log(`scanned ${graph.files.length} .ts/.tsx files under apps/web/src`);
  console.log(`\nseed modules (import a hook from '${NUQS_CONSUMER_SPECIFIER}'):`);
  for (const s of graph.seeds) console.log(`  ${toPosix(relative(APP_ROOT, s))}`);
  console.log(`\nNuqsAdapter mounts:`);
  for (const m of mounts) console.log(`  ${m.layoutFile}   covers ${m.routeGroup}`);
  console.log(`\nconsumer pages (${coverage.length}):`);
  for (const c of coverage) {
    console.log(
      `  ${c.covered ? 'COVERED    ' : 'NOT COVERED'} ${c.routeGroup.padEnd(10)} ${c.route.padEnd(42)} ${c.pageFile}`,
    );
  }
  const uncovered = coverage.filter((c) => !c.covered);
  console.log(`\n${coverage.length} consumer page(s) — covered ${coverage.length - uncovered.length} · NOT covered ${uncovered.length}`);

  if (!process.argv.includes('--quiet')) {
    if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      resolve(EVIDENCE_DIR, '01-consumer-trace.json'),
      JSON.stringify(
        {
          task: 'quick-605',
          phase: 'consumer-trace',
          at: new Date().toISOString(),
          scannedFiles: graph.files.length,
          seedModules: graph.seeds.map((s) => toPosix(relative(APP_ROOT, s))),
          adapterMounts: mounts,
          pages: coverage,
        },
        null,
        2,
      ) + '\n',
    );
    console.log(`\nwrote ${posix.join(toPosix(relative(REPO_ROOT, EVIDENCE_DIR)), '01-consumer-trace.json')}`);
  }
}

if (require.main === module) main();
