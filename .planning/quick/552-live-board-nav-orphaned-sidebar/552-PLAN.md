---
phase: quick-552
plan: 552
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/Sidebar/index.tsx
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/src/components/navigation/support-badge.tsx
  - apps/web/src/components/Sidebar/SidebarSearch.tsx
  - apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts
autonomous: true

must_haves:
  truths:
    - "An owner/manager with the liveMap permission sees a 'Live Board' link nested under 'Live Map' in the Intelligence group of the sidebar that is actually mounted"
    - "The three dead navigation components no longer exist in the repo"
    - "Adding a nav entry to a navigation component that nothing imports fails a test instead of shipping green"
  artifacts:
    - path: "apps/web/src/components/Sidebar/index.tsx"
      provides: "Live Board as a child of the Live Map item in the INTELLIGENCE block"
      contains: "/live-map?view=board"
    - path: "apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts"
      provides: "Mechanical orphan guard over src/components/navigation/ and src/components/Sidebar/"
      min_lines: 60
  key_links:
    - from: "apps/web/src/components/navigation/owner-shell.tsx"
      to: "apps/web/src/components/Sidebar/index.tsx"
      via: "AnimatedSidebar import (pre-existing, must remain the only sidebar)"
      pattern: "AnimatedSidebar"
    - from: "apps/web/src/components/Sidebar/index.tsx"
      to: "apps/web/src/components/Sidebar/SidebarGroup.tsx"
      via: "NavItem.children rendered as an inline submenu when expanded"
      pattern: "children"
---

<objective>
quick-551 added a "Live Board" sidebar entry to `apps/web/src/components/navigation/sidebar.tsx`.
That file exports `AppSidebar` and is imported by **nothing**. Phase 11's "Today's Trips" entry went
into the same dead file. Both shipped as a false "wired" claim; neither has ever rendered.

The sidebar that is actually mounted is `AnimatedSidebar`, exported from
`apps/web/src/components/Sidebar/index.tsx` (capital S), imported by
`apps/web/src/components/navigation/owner-shell.tsx:4`.

Purpose: put the Live Board entry where it renders, delete the three verified-dead navigation
components, and add a source-scanning vitest guard so the next edit to a dead navigation component
fails a test rather than shipping.

Output: one nav entry in the real sidebar, three files deleted, one guard test.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/components/Sidebar/index.tsx
@apps/web/src/components/Sidebar/sidebar.config.ts
@apps/web/src/components/Sidebar/SidebarGroup.tsx
@apps/web/src/components/navigation/owner-shell.tsx
</context>

<diagnosis_do_not_reinvestigate>
These are verified facts. Do not re-derive them.

1. `grep -rn "navigation/sidebar|AppSidebar"` over `src/`, `e2e/`, `tests/` returns nothing outside
   `src/components/navigation/sidebar.tsx` itself. It is orphaned.
2. The real sidebar is `apps/web/src/components/Sidebar/index.tsx`.
3. `NavItem` supports `children?: NavItem[]` — `apps/web/src/components/Sidebar/sidebar.config.ts:29-36`.
4. `SidebarGroup.tsx:79-99` renders `item.children` as an INLINE submenu when the sidebar is expanded,
   and `useSidebarState.ts:35` defaults `isExpanded` to `true`. On a cold start the child link IS in
   the DOM. If the user has previously collapsed the sidebar, children move into a hover flyout
   (`SidebarGroup.tsx:66`). **Note that caveat in the summary; do not try to change it.**
5. `ListChecks` is ALREADY imported in `Sidebar/index.tsx` (line 37 of the lucide-react import block).
   Do not add a duplicate import.
6. Exactly three files under `src/components/navigation/` and `src/components/Sidebar/` have zero
   importers, verified by a per-file module-specifier scan across all of `src/`:
     - `src/components/navigation/sidebar.tsx`
     - `src/components/navigation/support-badge.tsx`
     - `src/components/Sidebar/SidebarSearch.tsx`
   Every other file in those two directories has at least one importer. No references in `e2e/` or
   `tests/` either.
7. **Do NOT add a "Today's Trips" entry to the real sidebar.** The real sidebar deliberately carries
   NO reports links (`grep -rn "reports" src/components/Sidebar/` is empty) — reports live in the More
   menu, and `owner-more-menu.tsx` IS live (imported by `owner-bottom-nav.tsx:7`), so Today's Trips is
   already reachable. Adding a lone Reports entry to the sidebar is an IA decision this task has no
   mandate for. State this in the summary.

Out of scope, do not touch: the board itself, `board-*.ts`, `BoardRow.tsx`, `LiveBoard.tsx`,
`BoardToggle.tsx`, `live-map-wrapper.tsx`, or the Map default. No DDL, no data changes, install nothing.
</diagnosis_do_not_reinvestigate>

<tasks>

<task type="auto">
  <name>Task 1: Add Live Board as a child of Live Map in the sidebar that is actually mounted</name>
  <files>apps/web/src/components/Sidebar/index.tsx</files>
  <action>
Edit ONLY the INTELLIGENCE block, currently at lines 231-260 of
`apps/web/src/components/Sidebar/index.tsx`. It reads:

```tsx
  // ============================================================================
  // INTELLIGENCE — "What's happening right now?" (situational awareness)
  // Max 2 items: Live Map, Dashboard
  // ============================================================================
  if (isOwnerOrManager) {
    const intelligenceItems = []

    if (managerHasPermission(perms, "liveMap")) {
      intelligenceItems.push({
        label: "Live Map",
        href: "/live-map",
        icon: MapPin,
      })
    }
```

Add `Live Board` as a CHILD of the `Live Map` item — NOT a third top-level Intelligence item. The
in-repo precedent to follow is `Sidebar/index.tsx:303-328`, where "Document Imports" is a child of
"Trips" with a comment explaining that the section is capped and that a child says "this is one of
the ways X happens" rather than "this is a peer of X". Write a comment in the same spirit.

Replace the `Live Map` push with exactly:

```tsx
    if (managerHasPermission(perms, "liveMap")) {
      intelligenceItems.push({
        label: "Live Map",
        href: "/live-map",
        icon: MapPin,
        // Live Board (quick-551) is a CHILD of Live Map rather than a third
        // INTELLIGENCE item, deliberately: this section is capped at two, and
        // the board is not a peer of the map — it is the same page rendered as
        // a list (`/live-map?view=board`, the same route, the same data, a
        // different view). A submenu says exactly that; a third top-level entry
        // would claim a separate destination and break the cap.
        //
        // Gated on `liveMap` because it IS the live map: a manager who may not
        // see the map may not see the board.
        children: [
          {
            label: "Live Board",
            href: "/live-map?view=board",
            icon: ListChecks,
          },
        ],
      })
    }
```

Leave the `Max 2 items: Live Map, Dashboard` comment on the block header unchanged — the cap is still
respected, because the child is not a third top-level item.

`ListChecks` is already imported from lucide-react at line 37. Confirm with
`grep -n "ListChecks" src/components/Sidebar/index.tsx` and do NOT add a second import.

Change nothing else in this file.
  </action>
  <verify>
From `apps/web`:

1. `grep -n "view=board" src/components/Sidebar/index.tsx` — prints exactly one line, inside the
   Intelligence block.
2. `grep -c "ListChecks" src/components/Sidebar/index.tsx` — the import line plus the new usage; the
   import must appear exactly once (`grep -n "ListChecks," src/components/Sidebar/index.tsx`).
3. `grep -n "intelligenceItems.push" src/components/Sidebar/index.tsx` — still exactly TWO pushes
   (Live Map, Carrier Dashboard). If there are three, the child was added as a peer — fix it.
4. `npx tsc --noEmit` → 0 errors.
5. **Blind-gate probe (mandatory — a clean tsc that has not been probed is not evidence in this repo):**
   - `printf "const x: number = 'y';\n" > src/lib/carrier/__probe.ts`
   - `npx tsc --noEmit` → must report **TS2322 for `src/lib/carrier/__probe.ts`**. If it reports only
     errors under `.next/`, or only syntax errors, or does not name the probe file, the gate is BLIND:
     delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, re-run, and do
     not proceed until the probe error is reported.
   - `rm src/lib/carrier/__probe.ts` and re-run `npx tsc --noEmit` → 0 errors.
  </verify>
  <done>
`Live Board` → `/live-map?view=board` exists as `children[0]` of the `Live Map` NavItem in
`apps/web/src/components/Sidebar/index.tsx`. Intelligence still has two top-level items. `tsc` is 0
errors and the probe confirmed the gate is not blind.
  </done>
</task>

<task type="auto">
  <name>Task 2: Delete the three orphaned navigation components and add the mechanical orphan guard</name>
  <files>apps/web/src/components/navigation/sidebar.tsx, apps/web/src/components/navigation/support-badge.tsx, apps/web/src/components/Sidebar/SidebarSearch.tsx, apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts</files>
  <action>
**Part A — delete the three verified-dead files.**

```
rm apps/web/src/components/navigation/sidebar.tsx
rm apps/web/src/components/navigation/support-badge.tsx
rm apps/web/src/components/Sidebar/SidebarSearch.tsx
```

These are verified dead (see diagnosis item 6). Do not re-investigate; do not preserve any of their
code anywhere.

**Part B — add the guard.**

Create the directory `apps/web/src/components/__tests__/` (it does not exist yet) and write
`apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts`.

`vitest.config.ts` already includes `src/**/__tests__/**/*.test.ts`, so no config change is needed.

The guard must:
  - **READ** (never `import`) every `.tsx`/`.ts` file under `src/components/navigation/` and
    `src/components/Sidebar/`, excluding `index.tsx` / `index.ts` and anything under a `__tests__`
    directory.
  - For each such file, scan ALL `.ts`/`.tsx` files under `src/` for an import whose **module
    specifier ENDS in that file's basename**. Match `from '…/<basename>'` and `from './<basename>'`
    with either quote style. **A substring match on the basename alone is NOT acceptable** — it was
    tried and it produced a false negative, missing `sidebar.tsx` because the string `sidebar` also
    occurs inside `sidebar.config`. Anchor the basename against the closing quote.
  - Escape regex metacharacters in the basename — `sidebar.config` contains a `.`.
  - Exclude the file from being counted as its own importer.
  - **Normalise line endings** with `.replace(/\r\n/g, '\n')` on every read. This repo is
    `core.autocrlf=true` on Windows and has no `.gitattributes`; a source-scanning test that skips
    this fails on every checkout (quick-546).
  - **Integrity floor:** assert at least 10 candidate files were scanned AND at least 50 source files
    were scanned, so a bad glob that finds nothing cannot pass vacuously. This repo has been bitten
    by exactly that.
  - Fail with a message naming each orphan and stating why it matters.
  - **No allowlist.** After the Part A deletions this passes with nothing exempted. Do not add an
    exemption mechanism — an exemption list quietly grows and the guard is worthless the moment it
    has one.

Write it in this exact shape:

```ts
/**
 * Guard: no orphaned navigation components.
 *
 * quick-551 added a "Live Board" sidebar entry, and Phase 11 added a "Today's Trips"
 * entry, to `src/components/navigation/sidebar.tsx` — a 670-line component exporting
 * `AppSidebar` that NOTHING imported. Both shipped green, both reported as "wired",
 * and neither ever rendered. The real sidebar is `src/components/Sidebar/index.tsx`.
 *
 * A dead navigation component is uniquely dangerous because editing it looks exactly
 * like doing the work: the file compiles, the entry reads correctly, tsc is clean, and
 * the only signal that anything is wrong is the absence of a link on a screen nobody
 * re-opened. This test makes that absence mechanical.
 *
 * There is deliberately NO allowlist. An exemption list quietly grows, and this guard
 * is worthless the moment it has one. If a component here has no importer, either wire
 * it or delete it.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '..', '..', '..'); // apps/web
const SRC_DIR = path.join(WEB_ROOT, 'src');

const NAV_DIRS = [
  path.join(SRC_DIR, 'components', 'navigation'),
  path.join(SRC_DIR, 'components', 'Sidebar'),
];

/** Read a source file with line endings normalised (repo is core.autocrlf=true). */
function readSource(file: string): string {
  return fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
}

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Basename with the extension stripped: `sidebar.tsx` -> `sidebar`. */
function moduleBasename(file: string): string {
  return path.basename(file).replace(/\.tsx?$/, '');
}

describe('no orphaned navigation components', () => {
  const candidates = NAV_DIRS.flatMap((dir) => walk(dir)).filter(
    (file) => !/^index\.tsx?$/.test(path.basename(file))
  );
  const allSources = walk(SRC_DIR);

  it('scanned a plausible number of files (integrity floor)', () => {
    // A bad glob that finds nothing would otherwise make every assertion below
    // pass vacuously. This repo has been bitten by exactly that.
    expect(candidates.length).toBeGreaterThanOrEqual(10);
    expect(allSources.length).toBeGreaterThanOrEqual(50);
  });

  it('every component under navigation/ and Sidebar/ is imported by something', () => {
    const sourceTexts = new Map<string, string>();
    for (const file of allSources) sourceTexts.set(file, readSource(file));

    const orphans: string[] = [];

    for (const candidate of candidates) {
      const base = escapeRegex(moduleBasename(candidate));
      // The specifier must END in the basename, anchored on the closing quote.
      // A bare substring match is NOT sufficient: `sidebar` also occurs inside
      // `sidebar.config`, which is how the dead `sidebar.tsx` looked imported.
      const importPattern = new RegExp(
        `from\\s*\\(?\\s*['"](?:[^'"]*\\/)?${base}['"]`
      );

      const importedBy = allSources.filter((file) => {
        if (file === candidate) return false;
        return importPattern.test(sourceTexts.get(file) ?? '');
      });

      if (importedBy.length === 0) {
        orphans.push(path.relative(WEB_ROOT, candidate).replace(/\\/g, '/'));
      }
    }

    expect(
      orphans,
      orphans.length === 0
        ? ''
        : [
            'Orphaned navigation component(s) found — nothing in src/ imports these:',
            ...orphans.map((o) => `  - ${o}`),
            '',
            'An orphaned navigation component is how quick-551 and Phase 11 both shipped',
            'a nav entry that never rendered: the edit compiles, tsc is clean, and the only',
            'signal is a missing link nobody looked for. Wire it or delete it.',
            'Do not add an allowlist — this guard is worthless the moment it has one.',
          ].join('\n')
    ).toEqual([]);
  });
});
```

If the vitest version in this repo does not support the second `expect(value, message)` argument,
fall back to an explicit `if (orphans.length > 0) throw new Error(message)` before the assertion —
the failure message content is required either way. Keep the assertion so the test still has one.
  </action>
  <verify>
From `apps/web`:

1. The three files are gone:
   `ls src/components/navigation/sidebar.tsx src/components/navigation/support-badge.tsx src/components/Sidebar/SidebarSearch.tsx` → all "No such file".
2. No dangling references:
   `grep -rn "navigation/sidebar\|AppSidebar\|support-badge\|SupportBadge\|SidebarSearch" src e2e tests` → no output.
3. Guard passes:
   `npx vitest run src/components/__tests__/no-orphaned-navigation-components.test.ts` → 2 passed.
4. **Prove the guard is actually red on the thing it exists to catch** (do this, do not reason about it):
   - `printf 'export function DeadNav() { return null }\n' > src/components/navigation/__scratch-orphan.tsx`
   - re-run the vitest command → must FAIL, naming `src/components/navigation/__scratch-orphan.tsx`.
   - `rm src/components/navigation/__scratch-orphan.tsx` → re-run → 2 passed.
5. `npx tsc --noEmit` → 0 errors.
6. **Blind-gate probe (mandatory):**
   - `printf "const x: number = 'y';\n" > src/lib/carrier/__probe.ts`
   - `npx tsc --noEmit` → must report **TS2322 for `src/lib/carrier/__probe.ts`** by name. Errors only
     under `.next/`, or only syntax errors, mean the gate is BLIND — delete
     `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, re-run, and do not
     proceed until the probe error is reported.
   - `rm src/lib/carrier/__probe.ts` and re-run `npx tsc --noEmit` → 0 errors. Confirm no stray
     `__probe.ts` remains: `ls src/lib/carrier/__probe.ts` → "No such file".
  </verify>
  <done>
The three orphaned files are deleted with no dangling references. The guard exists at
`apps/web/src/components/__tests__/no-orphaned-navigation-components.test.ts`, passes with an EMPTY
allowlist, and was proven red by a temporary scratch orphan that was then removed. `tsc` is 0 errors
and the probe confirmed the gate is not blind.
  </done>
</task>

</tasks>

<verification>
From `apps/web`:

- `grep -n "view=board" src/components/Sidebar/index.tsx` → exactly one line, inside the Intelligence block.
- `grep -n "intelligenceItems.push" src/components/Sidebar/index.tsx` → exactly two.
- `grep -rn "navigation/sidebar\|AppSidebar\|support-badge\|SupportBadge\|SidebarSearch" src e2e tests` → no output.
- `npx vitest run src/components/__tests__/no-orphaned-navigation-components.test.ts` → 2 passed.
- `npx tsc --noEmit` → 0 errors, with the `src/lib/carrier/__probe.ts` TS2322 probe confirmed and the probe deleted.
- No files under `src/components/live-map/` or `src/components/board/` were modified: `git status --short` shows only the five files named in this plan.
</verification>

<success_criteria>
- "Live Board" (`/live-map?view=board`, `ListChecks`) renders as a child of "Live Map" in the
  Intelligence group of `AnimatedSidebar`, the sidebar `owner-shell.tsx` actually mounts, for an
  owner/manager holding the `liveMap` permission.
- The Intelligence cap of two top-level items is preserved, with a comment explaining why the board
  is a child and not a peer.
- `src/components/navigation/sidebar.tsx`, `src/components/navigation/support-badge.tsx` and
  `src/components/Sidebar/SidebarSearch.tsx` are deleted with zero dangling references.
- The orphan guard exists, has no allowlist, normalises line endings, carries an integrity floor, and
  was demonstrated to fail on a deliberately introduced orphan.
- `tsc --noEmit` is 0 errors under a probed (non-blind) gate.
- No board, map-wrapper, or map-default files were touched. No DDL, no data changes, nothing installed.
</success_criteria>

<output>
After completion, create `.planning/quick/552-live-board-nav-orphaned-sidebar/552-SUMMARY.md`.

The summary MUST state, explicitly:
1. That the quick-551 entry never rendered because it was added to an orphaned component, and that
   Phase 11's "Today's Trips" entry died the same way in the same file.
2. **The collapsed-sidebar caveat:** `useSidebarState.ts:35` defaults `isExpanded` to `true`, so on a
   cold start the child link is inline in the DOM (`SidebarGroup.tsx:79-99`); a user who has
   previously collapsed the sidebar reaches children through the hover flyout
   (`SidebarGroup.tsx:66`) instead. This was deliberately not changed.
3. **That "Today's Trips" was deliberately NOT added to the real sidebar:** that sidebar carries no
   reports links at all by design, reports live in the More menu, `owner-more-menu.tsx` is live
   (imported by `owner-bottom-nav.tsx:7`) so Today's Trips is already reachable there, and adding a
   lone Reports entry would be a new IA decision outside this task's mandate.
4. That the guard ships with NO allowlist, and why one must never be added.
5. The result of the deliberate red-run of the guard (scratch orphan introduced, guard failed by
   name, scratch orphan removed, guard green).
</output>
