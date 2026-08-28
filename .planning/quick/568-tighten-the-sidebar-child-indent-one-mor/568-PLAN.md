# quick-568 — PLAN

**One more step off the sidebar child indent: `ml-2` → `ml-1`.**

Mode: quick · 1 plan · 2 tasks · autonomous
Baseline commit: `5a8d8cd8`

---

## Why

quick-566 took the Document Imports child row from `ml-6` (37px past the Trips
icon) to `ml-2` (21px). Still too deep in use. One further step.

---

## Grounding (verified — do NOT re-explore)

**The only line that changes.** `apps/web/src/components/Sidebar/SidebarGroup.tsx:107`:
```
<div className="ml-2 space-y-1 border-l border-sidebar-border pl-3">
```
becomes
```
<div className="ml-1 space-y-1 border-l border-sidebar-border pl-3">
```

**The arithmetic, and a correction to the brief's estimate.** The indent is the
SUM of three classes (quick-566's rule): `ml-1` (4px) + `border-l` (1px) +
`pl-3` (12px) = **17px**, not the ~15px the brief estimated. 17px is the nearest
Tailwind step below `ml-2`'s 21px while holding `pl-3` fixed, which the brief
requires. Reaching exactly 15px would mean also moving `pl-3` → `pl-2.5`, and
the brief explicitly says `pl-3` stays. **Report the measured 17px; do not chase
15px by changing a class the brief froze.**

Expected measured values at 1568px, against quick-566's recorded figures:
- Trips (parent) icon left: **16px** — unchanged, it is not in the child wrapper.
- Document Imports (child) icon left: 37px → **33px**.
- Delta: 21px → **17px**.
- Parent LABEL origin stays **43.88px**. The child icon at 33px remains strictly
  between the parent icon (16px) and the parent label (43.88px), which is the
  constraint quick-566 established and this change must not break. Confirm it.

**Nothing pins the class.** Grep-verified: no unit test or e2e spec asserts the
indent classes. `navigation-reachability.spec.ts` mentions `SidebarGroup` only
in prose comments (lines 20, 67, 160) about the parent-as-`<div>` bug — no
assertion, nothing to update.

**MUST NOT TOUCH:**
- `border-l border-sidebar-border`, `pl-3`, `space-y-1` — all stay exactly as-is.
- `apps/web/src/components/Sidebar/SidebarFlyout.tsx` — the collapsed rail
  renders children in a Radix popover with its own layout and is unaffected by
  this class. Zero diff.
- Every nav entry, every group, the sidebar structure, `Sidebar/index.tsx`.
- Anything AR-Aging-related (quick-566/567). Zero diff.

**Nothing else is in scope.** This is a one-character edit plus measurement.

---

## Task 1 — The edit

Change `ml-2` → `ml-1` on `SidebarGroup.tsx:107`. Nothing else in the file.

Verify `git diff` shows exactly one changed line in exactly one file.

Commit: `fix(quick-568): tighten the sidebar child indent to ml-1`

## Task 2 — Measure and report

1. **Measure at 1568px in real Chromium**, signed in as owner, using the repo's
   `.playwright/auth/owner.json` storage state. The sidebar hydrates from
   `useAuth()` and renders NO links on first paint — **wait on
   `a[href="/live-map?view=board"]`, never `networkidle`**, or you will read an
   empty sidebar and report a false result.

   Read `getBoundingClientRect().left` on the actual `<svg>` icon inside the
   **Trips** parent `<a>` and inside the **Document Imports** child `<a>`.
   Report both absolute lefts and the delta, before and after.

   The committed tree already carries `ml-1`, so to get an honest before/after
   pair use quick-566's method: temporarily edit the class back to `ml-2` in the
   RUNNING dev server so HMR picks it up (NOT a stash or a file swap — those
   poison the Turbopack cache and report correct work as missing), measure,
   restore `ml-1`, re-measure, and confirm `git diff`/`git status` on the file
   are empty at the end.

   Also report the parent LABEL origin and confirm the child icon still sits
   strictly between the parent icon and the parent label.

2. `tsc --noEmit` **PROBED** in `apps/web` and `apps/mobile` — inject
   `const __probe: number = 'y'` into `SidebarGroup.tsx`, confirm tsc reports
   THAT error, remove it, re-run clean, confirm `git diff` empty. A clean run
   alone is not evidence; if the only errors are syntax errors or sit in files
   nobody touched (including under `.next/`), the gate is BLIND. Leave no
   `__probe` files behind.

3. **Suite before/after, same reporter** (`--reporter=json`, matching
   quick-567's 1730 / 1600 passed / 66 failed / 61 pending). A Tailwind class
   change cannot move the suite, so **expect a zero delta and say so** — this is
   a regression check, not a claim of new coverage.

   **Do NOT use a `git worktree` for the baseline** (quick-567): it does not
   carry the untracked, gitignored `apps/web/.env.local`, which skewed a
   baseline by 25 tests at the same commit. Use `git checkout <rev> -- .` on the
   touched file in the MAIN tree, then `git checkout HEAD -- .` to restore.
   Stop `next dev` before running the suite. Do not edit files during a run.

4. **Lint:** `apps/web` has no working entry point. Report it; do not claim it
   passed.

Write `568-SUMMARY.md` with a before/after measurement table and a per-item
audit: the class change, the measured delta, and the constraint check (child
icon between parent icon and parent label) — each IMPLEMENTED / PARTIALLY /
NOT DONE.

Commit: `docs(quick-568): plan, summary, STATE.md`

---

## Constraints

- One character changes. `border-l`, `pl-3`, `space-y-1`, `SidebarFlyout.tsx`
  and every nav entry are untouched.
- No DDL, no data changes.
- PowerShell has NO `&&` / `||` statement separators — use `;` or `if ($?) { }`.
- `git worktree remove --force`, never `Remove-Item`; never symlink
  `node_modules`; and per quick-567, prefer not to use a worktree for the
  baseline at all.
- Commit each task atomically. Do NOT push — the user pushes.
- Also update `.planning/STATE.md`: add a 568 row to the "Quick Tasks Completed"
  table and update the "Last activity" line, demoting the current one to
  "Previous activity" per the repo convention.
