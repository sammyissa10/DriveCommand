/**
 * quick-605 — the generalisation scan. REPORT ONLY.
 *
 *   npx tsx scripts/audit/605-provider-scan.ts
 *
 * Question: is any OTHER provider/context mounted in one route group while a
 * consumer of it lives in another? That is the shape of the nuqs defect, and an
 * enumeration is the only honest answer — the whole app mounts three providers,
 * so this is tractable rather than a survey.
 *
 * Reuses `605-nuqs-coverage.ts`'s graph rather than rebuilding one. Touches no
 * database and must never import `scripts/_bootstrap-env`.
 *
 * FINDINGS ARE REPORTED, NOT FIXED. Widening a live fix is how this goes wrong.
 */

import { readdirSync, statSync, existsSync } from 'fs';
import { resolve, relative, sep, dirname } from 'path';
import { buildGraph, readSource, extractSpecifiers, routeForAppFile, routeGroupForAppFile } from './605-nuqs-coverage';

const APP_ROOT = resolve(__dirname, '../..');
const SRC = resolve(APP_ROOT, 'src');
const APP = resolve(SRC, 'app');

const toPosix = (p: string) => p.split(sep).join('/');

function allLayouts(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) allLayouts(full, out);
    else if (name === 'layout.tsx' || name === 'layout.ts') out.push(full);
  }
  return out;
}

const graph = buildGraph(APP_ROOT);

// --- 1. every layout, and every capitalised component it RENDERS -------------
console.log('=== every layout under src/app, and what it renders ===\n');
const mounts: { layout: string; group: string; components: string[] }[] = [];
for (const l of allLayouts(APP).sort()) {
  const src = readSource(l);
  const rendered = [...new Set([...src.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)].map((m) => m[1]))].sort();
  const rel = `src/${toPosix(relative(SRC, l))}`;
  mounts.push({ layout: rel, group: routeGroupForAppFile(toPosix(relative(APP, l))), components: rendered });
  console.log(`${rel}\n  renders: ${rendered.join(', ') || '(nothing capitalised)'}`);
}

// --- 2. BFS up from a seed module to the pages that reach it -----------------
function pagesReaching(seedFiles: string[]): { route: string; group: string; file: string }[] {
  const found = new Map<string, { route: string; group: string; file: string }>();
  const queue = [...seedFiles];
  const seen = new Set(seedFiles);
  while (queue.length) {
    const f = queue.shift()!;
    const rel = toPosix(relative(APP, f));
    if (!rel.startsWith('..') && /(^|\/)(page|layout|template|default|error)\.tsx?$/.test(rel)) {
      const key = rel;
      if (!found.has(key)) {
        found.set(key, {
          route: routeForAppFile(rel),
          group: routeGroupForAppFile(rel),
          file: `src/app/${rel}`,
        });
      }
      continue;
    }
    for (const importer of graph.importedBy.get(f) ?? []) {
      if (seen.has(importer)) continue;
      seen.add(importer);
      queue.push(importer);
    }
  }
  return [...found.values()].sort((a, b) => a.file.localeCompare(b.file));
}

function resolveUnder(p: string): string | null {
  for (const c of [p, `${p}.ts`, `${p}.tsx`, resolve(p, 'index.ts'), resolve(p, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

// --- 3. the three providers -------------------------------------------------
console.log('\n=== provider 1 — AuthProvider (root) ===');
const authConsumers = graph.files.filter((f) => {
  const s = readSource(f);
  return /\buseAuth\s*\(/.test(s) && extractSpecifiers(s).some((x) => x.includes('auth-context'));
});
console.log(`useAuth() consumers: ${authConsumers.length}`);
const authGroups = new Set(pagesReaching(authConsumers).map((p) => p.group));
console.log(`route groups reached: ${[...authGroups].sort().join(', ')}`);
console.log('mounted at: src/app/layout.tsx (root) — covers every group by construction');

console.log('\n=== provider 2 — TRPCReactProvider ((owner)/layout.tsx) ===');
const trpcClient = resolveUnder(resolve(SRC, 'trpc/client'));
if (!trpcClient) throw new Error('could not resolve src/trpc/client — the scan would silently report nothing');
const trpcConsumers = graph.files.filter((f) => {
  if (f === trpcClient) return false;
  const s = readSource(f);
  return /\buseTRPC\s*\(/.test(s);
});
if (trpcConsumers.length === 0) throw new Error('found ZERO useTRPC() consumers — the scan is broken, not the app');
console.log(`useTRPC() consumers: ${trpcConsumers.length}`);
for (const c of trpcConsumers.sort()) console.log(`  src/${toPosix(relative(SRC, c))}`);
const trpcPages = pagesReaching(trpcConsumers);
console.log(`\npages reaching a useTRPC() consumer: ${trpcPages.length}`);
for (const p of trpcPages) console.log(`  ${p.group.padEnd(12)} ${p.route.padEnd(50)} ${p.file}`);
const outsideOwner = trpcPages.filter((p) => p.group !== '(owner)');
console.log(`\npages OUTSIDE (owner) that reach a useTRPC() consumer: ${outsideOwner.length}`);
for (const p of outsideOwner) console.log(`  ${p.group} ${p.route}  ${p.file}`);

console.log('\n=== provider 3 — NuqsAdapter (root, as of quick-605) ===');
console.log('fixed by this task; see docs/audits/nuqs-adapter-render-failure.md');

console.log('\n=== layouts that mount NO provider at all ===');
for (const m of mounts) {
  if (!m.components.some((c) => /(Provider|Adapter)$/.test(c))) console.log(`  ${m.layout}`);
}
