/**
 * quick-605 — every nuqs-consuming page has a `NuqsAdapter` at or above it in
 * its layout chain.
 *
 * ─── WHY THIS IS THE PRIMARY GUARD ──────────────────────────────────────────
 *
 * The recurrence shape is **a nuqs consumer reachable from a route with no
 * adapter above it**, and that is exactly what this asserts — without a server,
 * a session or a database. Before quick-605 the only `NuqsAdapter` in the repo
 * was in `src/app/(dev)/layout.tsx`, a route group containing zero pages, and
 * seven pages across `(owner)` and `(admin)` rendered `useDataGrid`. Five of
 * them answered HTTP 500 in production; the other two were one database row
 * away from it.
 *
 * Four separate gates were green the whole time, each blind for a different
 * structural reason — `force-dynamic` in `(owner)`, an implicit `cookies()` read
 * in `(admin)`, no e2e spec navigating to any of the routes, and `tsc`, which
 * cannot see a missing React context by construction. See
 * `docs/audits/nuqs-adapter-render-failure.md` §4.
 *
 * ─── WHAT THIS DOES *NOT* PROVE ─────────────────────────────────────────────
 *
 * That an adapter is in the layout chain is NOT that the page renders. A
 * different missing provider, a bad query, or any other render-time throw passes
 * this test untouched. It is a reachability assertion over the import and layout
 * graphs, nothing more.
 *
 * `e2e/owner/nuqs-grid-render.spec.ts` is the other half: it puts a real browser
 * on the grid-bearing routes and asserts the error string is absent. It needs a
 * server, a session and data in the right branch, and it cannot cover the
 * dynamic-segment routes — which is why both exist rather than one.
 *
 * ─── THE FAILURE MODE OF A SOURCE SCAN IS GREEN ─────────────────────────────
 *
 * `readSource` CRLF-normalises every read: this repo is `core.autocrlf=true`
 * with no `.gitattributes`, so a regex anchored on `\n` matches nothing in the
 * working tree and the scan returns an empty set that every coverage assertion
 * then passes over vacuously (quick-546). `assertScanIntegrity` is therefore
 * called before any coverage claim is believed, and the "was it actually found"
 * assertions below are load-bearing, not decoration.
 *
 * Witnessed RED before being accepted: see
 * `.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/05-guard-fires-red.md`.
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'path';
import {
  buildGraph,
  findNuqsConsumerPages,
  findAdapterMounts,
  computeCoverage,
  assertScanIntegrity,
  readSource,
  SCAN_FLOORS,
} from '../../scripts/audit/605-nuqs-coverage';

// The same code that produced the evidence in the audit report, imported rather
// than reimplemented — a second copy is a second thing to drift.
const APP_ROOT = resolve(__dirname, '../..');

const graph = buildGraph(APP_ROOT);
const pages = findNuqsConsumerPages(APP_ROOT, graph);
const mounts = findAdapterMounts(APP_ROOT, graph);
const coverage = computeCoverage(pages, mounts, APP_ROOT);

describe('nuqs adapter coverage — the scan found something', () => {
  // Every assertion in the next describe block is satisfied by an empty list.
  // These are what stop that.

  it('walked a real number of source files', () => {
    expect(graph.files.length).toBeGreaterThanOrEqual(SCAN_FLOORS.scannedFiles);
  });

  it('found at least one module importing a hook from bare `nuqs`', () => {
    expect(graph.seeds.length).toBeGreaterThanOrEqual(SCAN_FLOORS.seedModules);
  });

  it('read that module as non-empty after CRLF normalisation', () => {
    // A CRLF working tree read with an LF-anchored reader is the classic silent
    // failure; this asserts the reader, not the source.
    for (const seed of graph.seeds) {
      expect(readSource(seed).length).toBeGreaterThan(0);
    }
  });

  it('found at least one NuqsAdapter mount', () => {
    expect(mounts.length).toBeGreaterThanOrEqual(SCAN_FLOORS.adapterMounts);
  });

  it('traced the consumer set to at least the seven pages quick-605 measured', () => {
    expect(coverage.length).toBeGreaterThanOrEqual(SCAN_FLOORS.consumerPages);
  });

  it('assertScanIntegrity agrees, and is the single gate the CLI uses too', () => {
    expect(() => assertScanIntegrity(graph, pages, mounts)).not.toThrow();
  });

  it('COUNTER-ASSERTION: an empty page set is rejected, not passed over', () => {
    // Without this, "every page is covered" is true of no pages at all.
    expect(() => assertScanIntegrity(graph, [], mounts)).toThrow(/traced 0 consumer page/);
  });

  it('COUNTER-ASSERTION: a missing mount is rejected', () => {
    expect(() => assertScanIntegrity(graph, pages, [])).toThrow(/NuqsAdapter mount/);
  });
});

describe('nuqs adapter coverage — every consumer page is covered', () => {
  it('every page that transitively renders a nuqs hook has an adapter above it', () => {
    const uncovered = coverage.filter((c) => !c.covered);
    expect(
      uncovered.map((c) => `${c.route}  (${c.routeGroup})  ${c.pageFile}`),
      uncovered.length === 0
        ? ''
        : `${uncovered.length} page(s) render a nuqs hook with NO NuqsAdapter in their layout chain. ` +
          `Every one of these answers HTTP 500 — or streams a broken region behind a 200 — on first paint. ` +
          `The mount belongs in apps/web/src/app/layout.tsx, wrapping <AuthProvider> inside <body>, ` +
          `because a route-group layout cannot cover a sibling group and the consumers span more than one. ` +
          `See docs/audits/nuqs-adapter-render-failure.md.`,
    ).toEqual([]);
  });

  it('the mount that covers them is the ROOT layout, not a route-group one', () => {
    // Stated as its own assertion because a group-scoped mount can make the
    // assertion above pass for one group while a sibling group is still broken —
    // which is precisely the state quick-605 found the repo in.
    const coveringLayouts = new Set(coverage.map((c) => c.coveredBy));
    expect([...coveringLayouts]).toEqual(['src/app/layout.tsx']);
  });

  it('both route groups that hold consumers are represented, so this is not a one-group scan', () => {
    const groups = new Set(coverage.map((c) => c.routeGroup));
    expect(groups.has('(owner)')).toBe(true);
    expect(groups.has('(admin)')).toBe(true);
  });
});
