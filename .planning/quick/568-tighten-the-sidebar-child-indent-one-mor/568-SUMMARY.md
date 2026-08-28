# quick-568 — SUMMARY

**One more step off the sidebar child indent: `ml-2` → `ml-1`.**

Mode: quick · 1 plan · 2 tasks · autonomous
Baseline commit: `5a8d8cd8`

---

## What changed

One character, one file: `apps/web/src/components/Sidebar/SidebarGroup.tsx:107`.

```diff
-<div className="ml-2 space-y-1 border-l border-sidebar-border pl-3">
+<div className="ml-1 space-y-1 border-l border-sidebar-border pl-3">
```

`git diff --stat` confirmed exactly one file, one line changed before commit.

`border-l border-sidebar-border`, `pl-3`, `space-y-1`, `SidebarFlyout.tsx`, and
every nav entry are untouched — grep- and disk-verified, and confirmed again
by the tsc probe (see below) and the empty `git diff` after every temporary
edit made during measurement.

---

## Before/after measurement table

Measured at 1568×900, real Chromium (Playwright), signed in as owner via the
repo's `apps/web/.playwright/auth/owner.json` storage state, on
`/carrier/dashboard`. Waited on `a[href="/live-map?view=board"]` before
reading (the sidebar hydrates from `useAuth()` and renders no links on first
paint — `networkidle` was never used).

The "before" (`ml-2`) reading was taken via a temporary HMR edit in the
running dev server, per quick-566's method — not a stash or file swap. The
edit was reverted immediately after the reading and `git diff`/`git status`
on the file confirmed empty before proceeding.

| | Trips (parent) icon left | Document Imports (child) icon left | Delta (child − parent) | Parent label origin |
|---|---|---|---|---|
| **Before** (`ml-2`, temporary HMR edit) | 16px | 37px | 21px | 44px |
| **After** (`ml-1`, committed) | 16px | 33px | 17px | 44px |
| **After, reconfirmed** (post-restore, same tree) | 16px | 33px | 17px | 44px |

The measured delta (17px) matches the plan's arithmetic exactly:
`ml-1`(4px) + `border-l`(1px) + `pl-3`(12px) = **17px**. This is the nearest
Tailwind step below `ml-2`'s 21px while holding `pl-3` fixed, as the plan
requires — `pl-3` was not touched to chase the brief's ~15px estimate.

**Constraint check — child icon strictly between parent icon and parent
label:** `16 < 33 < 44` — holds. IMPLEMENTED.

(Parent label origin measured 44px here vs. quick-566's recorded 43.88px —
sub-pixel rendering variance between runs, not a regression; both round to
the same integer pixel and the ordering constraint is unaffected either way.)

The "after" reading was taken twice (once immediately after the edit, once
again after restoring from the temporary `ml-2` HMR edit) and both readings
were identical (33px), confirming the temporary edit left no residual state.

---

## tsc probe results (both apps)

**apps/web** — probed non-blind:
1. First clean run hit a **gate-blind trap**: `.next/dev/types/routes.d.ts`
   (left corrupt by the running dev server) produced 383 syntax errors
   (`TS1005`/`TS1002`) and suppressed semantic checking of everything,
   including the probe — exactly the documented CLAUDE.md trap.
2. Stopped the dev server (`taskkill`), deleted `apps/web/.next` and
   `tsconfig.tsbuildinfo`, re-ran.
3. Probe (`const __probe: number = 'y'`) injected into
   `SidebarGroup.tsx` — tsc reported `TS2322: Type 'string' is not
   assignable to type 'number'` at exactly that file/line. Gate is live, not
   blind.
4. Probe removed, `git diff`/`git status` on the file confirmed empty.
5. Clean re-run: **0 errors**, exit code 0.

**apps/mobile** — probed non-blind:
1. Clean baseline run first (no probe): 0 errors.
2. No mobile file was touched by this task (grep-confirmed zero mobile
   references to `SidebarGroup.tsx`, `ml-2`/`ml-1`, or the sidebar indent
   classes), so per quick-567's precedent the probe was injected into
   `app/index.tsx`.
3. Probe reported `TS2322` at `app/index.tsx(4,7)` — correct file, gate live.
4. Probe removed, `git diff`/`git status` confirmed empty.
5. Clean re-run: **0 errors**, exit code 0.

---

## Suite before/after (same reporter: `--reporter=json`)

Dev server was stopped before running the suite; no files were edited during
either run. Baseline obtained via `git checkout 5a8d8cd8 -- apps/web/src/components/Sidebar/SidebarGroup.tsx`
in the main tree (never a `git worktree` — quick-567's `.env.local` skew is
avoided this way), then restored via `git checkout HEAD -- <same file>`
before the "after" run.

| | Total tests | Passed | Failed | Pending | Test suites |
|---|---|---|---|---|---|
| **Before** (`ml-2`) | 1730 | 1600 | 66 | 61 | 600 |
| **After** (`ml-1`) | 1730 | 1600 | 66 | 61 | 600 |
| **Delta** | 0 | 0 | 0 | 0 | 0 |

Matches quick-567's published baseline at the same underlying commit exactly.
The failing-test identity set was additionally diffed (test file + full test
name), not just the count: **66 failing before, 66 failing after, 0 newly
fixed, 0 newly broken — byte-identical set.**

As predicted in the plan: a Tailwind class change cannot move the suite, and
it did not. This is a regression check, not a claim of new coverage.

---

## Lint

`apps/web` has no working lint entry point (`next lint` no longer accepts
`--dir` on this Next version; ESLint 9 finds no `eslint.config.js` while the
repo still has `.eslintrc.*`). Reported as unavailable, not claimed passing —
consistent with quick-562/565/566/567.

---

## Per-item audit

| Item | Status |
|---|---|
| `ml-2` → `ml-1` on `SidebarGroup.tsx:107`, nothing else in the file | IMPLEMENTED |
| `border-l`, `pl-3`, `space-y-1` untouched | IMPLEMENTED |
| `SidebarFlyout.tsx` untouched (zero diff) | IMPLEMENTED |
| Every other nav entry / sidebar structure untouched | IMPLEMENTED |
| Measured delta (browser, real Chromium) reported honestly rather than adjusted toward the brief's ~15px estimate | IMPLEMENTED — measured 17px, matches arithmetic, reported as-is |
| Child icon strictly between parent icon and parent label | IMPLEMENTED — `16 < 33 < 44` |
| tsc probed non-blind, both apps | IMPLEMENTED |
| Suite before/after, same reporter, zero delta expected and confirmed | IMPLEMENTED |
| Lint | NOT DONE — no working entry point in this repo, reported not worked around |
| No DDL, no data changes | IMPLEMENTED — zero DB interaction of any kind |

---

## Deviations from Plan

None. Plan executed exactly as written, including the one gate-blind
diagnostic detour (corrupt `.next/dev/types/routes.d.ts`), which is a known,
documented class of issue (CLAUDE.md) and was resolved by the documented
remedy (stop server → delete `.next` + tsbuildinfo → restart → re-probe),
not a deviation from the plan's intent.

## Self-Check

- `apps/web/src/components/Sidebar/SidebarGroup.tsx` — FOUND, contains `ml-1` (verified via grep post-commit)
- Commit `96c3bbd8` (`fix(quick-568): tighten the sidebar child indent to ml-1`) — FOUND in `git log`
- `git status` clean of any residual edits/probes at end of execution — CONFIRMED
