---
phase: quick-566
plan: 566
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/Sidebar/SidebarGroup.tsx
  - apps/web/src/components/Sidebar/index.tsx
  - apps/web/e2e/owner/navigation-reachability.spec.ts
autonomous: true

must_haves:
  truths:
    - "The Document Imports child row sits at a natural sub-level under Trips — its icon is left of the parent's label, not past it"
    - "The desktop sidebar's REPORTS group shows four entries; AR Aging is not one of them"
    - "/carrier/reports/aging still loads by URL for a permitted user and is still gated for one without arAgingReport"
    - "The e2e nav spec pins AR Aging's sidebar ABSENCE as a decision, not just deletes a line"
    - "No comment left in the tree claims AR Aging is unreachable from any surface"
  artifacts:
    - path: "apps/web/src/components/Sidebar/SidebarGroup.tsx"
      provides: "Reduced child-item indent (single site, line ~107)"
      contains: "border-l border-sidebar-border"
    - path: "apps/web/src/components/Sidebar/index.tsx"
      provides: "REPORTS group without the AR Aging push, plus a reversal comment"
      contains: "quick-566"
    - path: "apps/web/e2e/owner/navigation-reachability.spec.ts"
      provides: "Four required report hrefs plus a sidebar-scoped negative assertion for aging"
  key_links:
    - from: "apps/web/src/components/Sidebar/index.tsx"
      to: "apps/web/src/lib/auth/permissions.ts"
      via: "PERMISSION_GATED_PATHS still carries /carrier/reports/aging (UNCHANGED)"
      pattern: "carrier/reports/aging"
---

<objective>
Two cosmetic nav changes in the mounted desktop sidebar, plus the assertions and comment
corrections that keep them from silently regressing.

1. Reduce the child-item indent so `Document Imports` reads as a sub-level under `Trips`
   instead of overshooting past the parent's own label.
2. Remove the `AR Aging` entry from the sidebar's REPORTS group — the NAV ENTRY only.
   The route, page, API, permission key and `PERMISSION_GATED_PATHS` row all stay.

Purpose: the child indent currently pushes the child icon 37px past the parent icon, which is
further right than the parent's label starts; and AR Aging is a report the owner does not want in
the primary nav. Both are one-line-reversible decisions.

Output: three edited files, a DOM-verified report, and a per-item audit.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/components/Sidebar/SidebarGroup.tsx
@apps/web/src/components/Sidebar/index.tsx
@apps/web/e2e/owner/navigation-reachability.spec.ts
</context>

<grounding>
Everything below was located by the orchestrator. VERIFY it, do not re-discover it.

**Item 1 — the indent lives in ONE place.**
`apps/web/src/components/Sidebar/SidebarGroup.tsx:107`:

    <div className="ml-6 space-y-1 border-l border-sidebar-border pl-3">

The wrapper around `item.children?.map(...)` in the `hasChildren && isExpanded` branch. It is the
ONLY child-indent site. `SidebarFlyout.tsx` (the collapsed rail) renders children in a Radix
popover with its own layout and is NOT in scope — do not touch it.

Measured geometry (Tailwind default scale, 1rem = 16px):
- Parent row is a `SidebarItem` `<Link>` with `p-2`, so the parent ICON left edge is 8px inside the
  `<nav>` content box.
- Child wrapper: `ml-6` (24) + `border-l` (1) + `pl-3` (12) = 37px, then the child `SidebarItem`'s
  own `p-2` (8) puts the child ICON left edge at 45px.
- The child icon is therefore 37px right of the parent icon.
- The parent LABEL starts at 8 + 16 (icon) + 12 (`gap-3`) = 36px. The child icon at 45px sits PAST
  the parent's label — the exact overshoot the brief describes.

Recommended target: `ml-2 pl-3` gives 8 + 1 + 12 = 21px, child icon at 29px, between the parent
icon (8px) and the parent label (36px). Keep `border-l border-sidebar-border` (the rail is the
hierarchy cue) and keep `space-y-1`. A different value is allowed if justified, but it must land
the child icon strictly between 8px and 36px, and the px must be MEASURED in a real browser, not
only computed.

**Item 2 — the AR Aging sidebar entry.**
`apps/web/src/components/Sidebar/index.tsx:476-481`, inside the `if (isOwnerOrManager)` REPORTS
block, is a `managerHasPermission(perms, "arAgingReport", userRole)` guard pushing
`{ label: "AR Aging", href: "/carrier/reports/aging", icon: BarChart3 }` onto `reportsItems`.

**MUST NOT TOUCH** (all verified present, all must stay):
- `apps/web/src/app/(owner)/carrier/reports/aging/page.tsx`, `AgingDesktop.tsx`, `AgingMobile.tsx`,
  `aging-report-utils.ts`
- `apps/web/src/app/api/v1/carrier/reports/aging/route.ts`
- `apps/web/src/lib/auth/permissions.ts` — the `arAgingReport` key (line 36), its defaults
  (lines 90, 111), its catalogue row (line 170), and **`PERMISSION_GATED_PATHS` line 222
  `{ path: '/carrier/reports/aging', permission: 'arAgingReport' }`**
- `apps/web/src/lib/carrier/reports.ts` `getAgingReport`
- `apps/web/src/lib/carrier/report-access.ts`

**Item 3 — other AR Aging references (VERIFY, do not re-discover):**
- `apps/web/src/components/navigation/owner-more-menu.tsx:96` — a real nav link,
  `{ label: 'AR Aging', href: '/carrier/reports/aging', permission: 'arAgingReport' }`. That
  component is `lg:hidden` (mobile only) and its header comment at ~line 55 says AR Aging "is
  ADDED. It was the one report with no entry here". **This is the surface disagreement the brief
  asks about.** The brief says "sidebar only" and "do not change any other nav entry" — so LEAVE
  IT, and REPORT it with a recommendation.
- `apps/web/src/components/carrier/CarrierBreadcrumb.tsx:21` — `aging: "AR Aging"` is a LABEL map,
  not a link source. Unaffected; the page still needs its crumb.
- `apps/web/src/components/carrier/clients/ClientFinancials.tsx` — fetches
  `/api/v1/carrier/reports/aging` and renders buckets inline. An API consumer, not a nav link. A
  second reason the API must survive.
- `apps/web/src/lib/docs/feature-registry.ts:276-284` — the `carrier-reports-aging` entry backing
  `docs-content/client/carrier-reports-aging.mdx` and
  `docs-content/sysadmin/carrier-reports-aging.mdx` plus `search-index.json`. The route still
  works, so the doc is still true. **Do NOT delete it** — `check-doc-drift.ts` is a CI gate and
  `renderClientDoc` throws for a slug absent from the registry. But CHECK both .mdx files for any
  sentence claiming the report is reachable from the sidebar; if present, that sentence is now
  false and must be corrected.
- `apps/web/src/lib/carrier/__tests__/reports-permission-gating.test.ts` and
  `apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts` — must stay
  GREEN UNTOUCHED. If either goes red, the gate was damaged; stop and fix.

**Item 4 — the e2e spec asserts NAV PRESENCE, not route reachability.**
`apps/web/e2e/owner/navigation-reachability.spec.ts`: the list is `REQUIRED_SIDEBAR_HREFS`
(~line 59) and the test (~line 86) does `document.querySelectorAll('a')` and asserts none of the
listed hrefs are missing from the DOM. So the correct edit is removing `'/carrier/reports/aging'`
from `REQUIRED_SIDEBAR_HREFS` (line 80) — NOT touching any route check.

**Item 5 — DOM verification hydration trap.**
The sidebar hydrates from `useAuth()` and renders NO links on first paint. Wait on a sidebar
selector (`a[href="/live-map?view=board"]`), NEVER on `networkidle` — the spec header documents
this exact false negative.
</grounding>

<tasks>

<task type="auto">
  <name>Task 1: Reduce the child indent and drop the AR Aging sidebar entry</name>
  <files>
apps/web/src/components/Sidebar/SidebarGroup.tsx
apps/web/src/components/Sidebar/index.tsx
  </files>
  <action>
FIRST, before editing anything, capture the vitest baseline on a CLEAN tree:
  - `git status` must be clean, or `git stash` first (and record that you did).
  - Run the full `apps/web` suite ONCE with `--reporter=json` and record the TEST count
    (passed/failed), not the file count. The JSON reporter's "test files" number counts
    `describe` suites, not files.
  - Do NOT start this run and then edit files while it is running (quick-565's trap).
  - `--reporter=basic` does not exist in vitest 4: it exits 0 having executed ZERO tests. A run
    whose output shows no test counts is NOT a green run.
  - Whatever reporter you pick here, you MUST use the SAME one for the after-run.
  - `git stash pop` if you stashed.

1a. INDENT — `SidebarGroup.tsx` line ~107. Change the child wrapper class from
    `ml-6 space-y-1 border-l border-sidebar-border pl-3`
    to
    `ml-2 space-y-1 border-l border-sidebar-border pl-3`
    (or another value you can justify that lands the child icon strictly between 8px and 36px).
    Keep `border-l border-sidebar-border` and `space-y-1`. Touch nothing else in the file, and do
    NOT touch `SidebarFlyout.tsx`.

1b. AR AGING — `index.tsx` lines ~476-481. Delete the AR Aging push. In its place leave a short
    comment recording:
      - that the entry is deliberately hidden by quick-566,
      - that the route, page, API, permission key and `PERMISSION_GATED_PATHS` row are all intact
        and `/carrier/reports/aging` still works by URL,
      - that restoring it is re-adding this block.
    If the removal orphans an import (e.g. `BarChart3` used only here), remove the now-unused
    import so tsc and the build stay clean — but grep the file first to confirm it is genuinely
    unused.

1c. STALE COMMENT — the REPORTS block's header comment in `index.tsx` (~lines 439-456) claims
    "AR Aging had none on ANY surface" / "AR Aging by no route at all". That is false twice over:
    quick-553 added it to the mobile more-menu, and this task removes the desktop one. Rewrite
    those sentences to state the truth as of quick-566. CLAUDE.md records repeatedly that a stale
    comment asserting an invariant is how these bugs survive — do not leave it.

Constraints carried from the brief: no DDL, no data changes, do not restructure the sidebar or its
grouping, do not change any other nav entry.
  </action>
  <verify>
- `grep -n "reports/aging" apps/web/src/components/Sidebar/index.tsx` returns no match.
- `grep -n "reports/aging" apps/web/src/lib/auth/permissions.ts` STILL matches
  `PERMISSION_GATED_PATHS`. If it does not, the gate was broken — revert and redo.
- The aging `page.tsx` and the aging API `route.ts` both still exist on disk.
- `grep -n "ml-" apps/web/src/components/Sidebar/SidebarGroup.tsx` shows the new class, and the
  `SidebarFlyout.tsx` diff is empty.
- `git diff --stat` shows exactly two files changed in this task.
  </verify>
  <done>
The child wrapper carries the reduced margin; the AR Aging push is gone and replaced by a reversal
comment; the REPORTS header comment states the post-quick-566 truth; every must-not-touch file is
byte-identical.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update the e2e nav spec and audit the other AR Aging references</name>
  <files>
apps/web/e2e/owner/navigation-reachability.spec.ts
  </files>
  <action>
2a. Remove `'/carrier/reports/aging'` from `REQUIRED_SIDEBAR_HREFS` (~line 80). This spec asserts
    NAV PRESENCE via `document.querySelectorAll('a')`, not route reachability — state that
    explicitly in the summary so the reader knows which of the two was adjusted.

2b. Rewrite the comment block at ~lines 74-79. It currently ends "AR Aging had none on ANY
    surface — it is not in the mobile more-menu either", which is factually wrong today
    (quick-553 added it to the more-menu) and doubly wrong after this change.

2c. Add a COUNTER-ASSERTION in the same spec so the absence is a pinned decision rather than a
    deleted line:
      - `/carrier/reports/aging` must NOT appear as a sidebar link,
      - and the other four report hrefs (revenue, driver pay, performance, today's trips — read
        the exact strings off `REQUIRED_SIDEBAR_HREFS`, do not retype them from memory) MUST be
        present.
    Without the positive half the negative half passes by saying nothing (quick-563's rule).
    **Scope the negative assertion to the SIDEBAR (`aside a`), not to every `<a>` on the page**, so
    an unrelated in-page link cannot trip it. Reuse the spec's existing sidebar wait
    (`a[href="/live-map?view=board"]`) — never `networkidle`.

2d. AUDIT the other references listed in <grounding> — verify each is where it is said to be, and
    for each state whether it should change:
      - `owner-more-menu.tsx:96` — LEAVE IT (brief: sidebar only). Report the resulting surface
        disagreement and give a one-line recommendation (align mobile, or keep both, with a reason).
      - `CarrierBreadcrumb.tsx:21` — unaffected, label map.
      - `ClientFinancials.tsx` — unaffected, API consumer.
      - `feature-registry.ts` plus the two `.mdx` docs — do NOT delete the registry entry. Read both
        `docs-content/client/carrier-reports-aging.mdx` and
        `docs-content/sysadmin/carrier-reports-aging.mdx` and check for any sentence claiming the
        report is reachable from the sidebar or nav. If found, correct that sentence only. If not,
        say so explicitly.
      - `reports-permission-gating.test.ts` and `owner-more-menu-permissions.test.ts` — run them,
        confirm green, leave untouched.
  </action>
  <verify>
- `grep -n "reports/aging" apps/web/e2e/owner/navigation-reachability.spec.ts` shows it ONLY in the
  negative assertion and its comment, never in `REQUIRED_SIDEBAR_HREFS`.
- `reports-permission-gating.test.ts` and `owner-more-menu-permissions.test.ts` both green, and
  `git diff --stat` shows neither file modified.
- If an `.mdx` was touched, `check-doc-drift.ts` passes.
  </verify>
  <done>
The spec no longer requires the AR Aging sidebar link, actively asserts its absence within `aside`,
still requires the other four, and carries a comment that is true. Every other AR Aging reference is
audited with an explicit keep/change verdict.
  </done>
</task>

<task type="auto">
  <name>Task 3: Verify by DOM at 1568px, probe both tsc gates, diff the suite, report</name>
  <files>(no source changes — verification and reporting only)</files>
  <action>
3a. DOM VERIFICATION at width 1568, in a real browser, signed in as an owner:
    - Wait on the sidebar selector `a[href="/live-map?view=board"]`. NEVER `networkidle` — the
      sidebar hydrates from `useAuth()` and renders no links on first paint.
    - Report the FULL list of sidebar link hrefs.
    - Confirm explicitly that `/carrier/reports/aging` is ABSENT.
    - Confirm explicitly that the revenue, driver-pay, performance and today's-trips report hrefs
      are all PRESENT.
    - Expand `Trips`, then measure with `getBoundingClientRect()` the LEFT EDGE of the
      `Document Imports` child row's ICON against the `Trips` parent row's ICON. Report the delta
      BEFORE and AFTER the change. Getting the "before" number means either measuring on a stashed
      tree first or re-applying the old class temporarily — say which you did.
    - Also confirm `/carrier/reports/aging` still LOADS by URL for the same permitted user (it must
      render, not 404 or redirect), and note that the permission gate is untouched.
    - If the DOM check comes back red immediately after a file swap or a `git stash`: that is a
      poisoned Turbopack cache before it is a regression. Stop `next dev`, delete `apps/web/.next`,
      restart, re-run. Do not conclude anything from the first red.

3b. TSC — PROBED in BOTH `apps/web` and `apps/mobile`:
    - Run `npx tsc --noEmit` in each.
    - A clean run is NOT evidence on its own. Inject `const x: number = 'y'` into a file you
      ACTUALLY edited (`SidebarGroup.tsx` for web; for mobile, any file in the program), re-run,
      and confirm tsc reports THAT error. Then delete the probe and re-run.
    - If the only errors are syntax errors, or are all in files you did not touch (including
      anything under `.next/`), the gate is BLIND, not green: delete
      `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then re-run.
    - Also check no stray `__probe.ts` from an earlier run is lying around.

3c. SUITE — run the `apps/web` vitest suite with the SAME reporter used for the Task 1 baseline.
    Compare TEST counts, not file counts. Report before/after explicitly. Any delta must be
    explained; the two named permission tests must be green.

3d. LINT — `apps/web` has NO working lint entry point: `next lint` rejects `--dir` on this Next
    version and ESLint 9 finds no flat config (the repo still has `.eslintrc.*`). tsc is the only
    gate. REPORT that; do not claim lint passed.

3e. Commit. Then write the SUMMARY containing:
    - Step 1: the class string BEFORE and AFTER, and the before/after left offsets in px
      (browser-measured).
    - Step 2: what was removed, and proof the route, API, permission and gate survived.
    - Step 3: every other place AR Aging is linked from, with a keep/change verdict each, including
      the mobile More-menu surface disagreement and a recommendation.
    - Step 4: which assertion the spec makes (nav presence, not route reachability) and what was
      changed and added.
    - Step 5: the DOM proof — full href list, aging ABSENT, the other four PRESENT, indent offset.
    - Diff summary, tsc PROBED in both apps, suite before/after with the same reporter, lint status.
    - **A per-item audit of steps 1-5, each marked IMPLEMENTED / PARTIALLY / NOT DONE.**

Environment constraints, carried verbatim from the brief:
    - PowerShell has NO `&&` or `||` as statement separators. Use separate statements or `;`.
    - If a baseline worktree is used: put it INSIDE the repo, never symlink `node_modules`, and
      remove it with `git worktree remove --force` — NEVER `Remove-Item`, which follows symlinks
      and has destroyed real source in this repo before.
    - No DDL. No data changes.
  </action>
  <verify>
- Browser output pasted into the summary showing the href list, the absence, the four presences and
  the two `getBoundingClientRect()` left edges.
- `npx tsc --noEmit` clean in both apps, WITH the probe run reported (error observed, then removed).
- Vitest before/after counts from the same reporter, delta explained.
- `git log -1 --stat` shows exactly the intended files.
  </verify>
  <done>
The change is proven in a real DOM, both type gates are proven non-blind by probe, the suite is
diffed like-for-like, and the summary carries the per-item IMPLEMENTED / PARTIALLY / NOT DONE audit.
  </done>
</task>

</tasks>

<verification>
- `/carrier/reports/aging` loads by URL for a permitted owner and is still gated for a user without
  `arAgingReport`.
- `PERMISSION_GATED_PATHS` still contains `/carrier/reports/aging`.
- The sidebar's REPORTS group renders exactly four links.
- The `Document Imports` child icon sits strictly between the `Trips` icon and the `Trips` label.
- `reports-permission-gating.test.ts` and `owner-more-menu-permissions.test.ts` green and unmodified.
- tsc clean AND probed in `apps/web` and `apps/mobile`.
- Vitest test count unchanged, or any delta explained, same reporter both sides.
</verification>

<success_criteria>
- Exactly three source files changed: `SidebarGroup.tsx`, `Sidebar/index.tsx`,
  `navigation-reachability.spec.ts` (plus at most a corrected sentence in an `.mdx`, if one was
  actually false).
- No route, page, API, permission key or gate deleted or disabled.
- No other nav entry changed; the sidebar's structure and grouping are untouched.
- The summary reports step 1's class and pixels, step 3's other links, step 5's DOM proof, the diff
  summary, probed tsc in both apps, the like-for-like suite diff, and the per-item audit.
</success_criteria>

<output>
After completion, create
`.planning/quick/566-reduce-child-item-indent-in-mounted-side/566-SUMMARY.md`
</output>
