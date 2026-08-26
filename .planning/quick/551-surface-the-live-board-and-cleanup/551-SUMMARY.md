---
phase: quick-551
plan: 01
subsystem: carrier-live-map
tags: [tracking, live-board, navigation, tests]
dependency-graph:
  requires:
    - Phase 11 (document-import/11-SUMMARY.md) — the live board's `/api/v1/carrier/live-board` endpoint, `BoardToggle`, `BoardRow`
  provides:
    - A discoverable Drivers|Trucks control in the /live-map KPI header row
    - A URL (`/live-map?view=board`) and a sidebar entry for the board
    - A titled, retryable first-load-failed state for LiveBoard
    - Teardown-hole closure for NotificationLog in three document-import commit test suites
  affects:
    - apps/web/src/components/maps/live-map-wrapper.tsx
    - apps/web/src/components/tracking/LiveBoard.tsx
    - apps/web/src/app/(owner)/live-map/page.tsx
    - apps/web/src/components/navigation/sidebar.tsx
tech-stack:
  added: []
  patterns:
    - "Controlled child component (LiveBoard) with view lifted to the parent so a header control can reveal it"
    - "Server-read searchParams (Promise) → initial client prop, avoiding useSearchParams in a shared component tree"
key-files:
  created: []
  modified:
    - apps/web/src/components/maps/live-map-wrapper.tsx
    - apps/web/src/components/tracking/LiveBoard.tsx
    - apps/web/src/app/(owner)/live-map/page.tsx
    - apps/web/src/components/navigation/sidebar.tsx
    - apps/web/tests/carrier/document-import-commit-rollback.test.ts
    - apps/web/tests/carrier/document-import-commit-windows.test.ts
    - apps/web/tests/carrier/document-import-commit-notification-isolation.test.ts
decisions:
  - "Map stays the default view; only an explicit ?view=board changes viewMode's initial value"
  - "No useSearchParams in sidebar.tsx — the board nav entry has no isActive prop; Live Map's existing pathname-based highlight covers it honestly"
  - "No owner-more-menu.tsx entry — LiveMapMobile does not render LiveBoard, so a mobile nav entry would point at a screen that can't show it"
metrics:
  duration: "~35 min"
  tasks_completed: 3
  files_changed: 7
  completed: 2026-08-26
---

# Quick 551: Surface the Live Board and Cleanup Summary

Lifted the Phase 11 live board's Drivers|Trucks control out of `LiveBoard` (which only mounted after
a user found and pressed `List`) into the KPI header row beside `Map | List`, so the board is
discoverable from a cold start; gave it a real URL (`/live-map?view=board`) and sidebar entry; fixed
`LiveBoard`'s blank-body first-load-failure state and a `FilterChips` overflow that pushed the toggles
off-screen; and closed a `NotificationLog` teardown hole in three document-import commit test suites
that reproduces the orphan-tenant bug.

## What Was Built

**Task 1 — Board toggle lifted into the control row (`61974568`)**

- `LiveBoard` is now a controlled component: `view: BoardView` arrives as a prop instead of owning
  its own `useState`. Its header no longer renders `<BoardToggle>`; instead it shows a single-string
  row-count label (`rowCountLabel`, e.g. `"3 drivers"`) built through one template literal per the
  quick-517 "one string per sentence" rule.
- The `error: string | null` state became `failed: boolean`, splitting one collapsed string into two
  distinct facts: `BOARD_REFRESH_FAILED_COPY` for a poll failure with a payload already on screen
  (banner, non-blocking) vs. `BOARD_LOAD_FAILED_TITLE` / `BOARD_LOAD_FAILED_BODY` for a first fetch
  that never succeeded (full panel with an icon and a `Try again` button — no more bare empty body
  under an invisible banner).
- `live-map-wrapper.tsx` now owns `boardView` state, imports `BoardToggle`, and renders it in the
  control row next to `ViewToggle`, dimmed (`opacity-60`) while the map is showing since the
  projection is selected but not yet in effect. `handleBoardViewChange` both sets the projection and
  flips `viewMode` to `'list'` so a tap always produces visible feedback.
- `FilterChips` is now wrapped in a `min-w-0 flex-1` div — the fix lives on the consumer
  (`live-map-wrapper.tsx`), not on the shared `FilterChips` component, per the quick-519/quick-551
  convention of fixing overflow where the layout is composed rather than in a component other pages
  also render.
- `viewMode`'s default (`useState<'map' | 'list'>('map')`) was left untouched in this task, exactly
  as scoped — Task 2 is what parameterizes it.

**Task 2 — URL and sidebar entry (`997f570d`)**

- `(owner)/live-map/page.tsx` now accepts `searchParams: Promise<{ view?: string }>` (Next 16
  convention), reads `view` server-side, and derives `initialViewMode` (`'list'` only when
  `view === 'board'`, `'map'` for anything else). Passed to the **desktop** `LiveMapWrapper` only —
  `LiveMapMobile` is untouched since it has no board.
- `LiveMapWrapper` gained an optional `initialViewMode` prop (default `'map'`), used to seed the
  `viewMode` `useState`. Every existing caller that doesn't pass it keeps today's behavior.
- `sidebar.tsx` got a new `Live Board` menu item inside the same `liveMap` `PermissionGuard`,
  immediately after the existing `Live Map` item, linking to `/live-map?view=board`. No
  `useSearchParams` import or call was added — the sidebar still resolves active state only via
  `usePathname`.

**Task 3 — NotificationLog teardown hole (`b009a0fc`)**

- `NotificationLog.tenantId` is a RESTRICT foreign key to `Tenant` with no `onDelete`, and it was
  absent from the delete list in all three document-import commit test suites
  (`document-import-commit-rollback.test.ts`, `-windows.test.ts`,
  `-notification-isolation.test.ts`). Live production carried 2 orphaned rows from these suites'
  disposable tenants.
- Each file now deletes `NotificationLog` rows (`where: { tenantId }`) immediately before the existing
  `inAppNotification.deleteMany` call, and each `survivors` re-count object gained a
  `notificationLogs` key, so a future regression fails the test loudly instead of silently orphaning
  a tenant.
- Per the task's explicit instruction, these suites were **not run** — they point at production and
  create/destroy disposable tenants. Verified by inspection and `tsc` only.

## Verification

- `cd apps/web && npx tsc --noEmit` — 0 errors after every task, confirmed non-blind by a probe
  (`const x: number = 'y'` / `const __probe: number = 'x'`) inserted into a file inside each task's
  edit set (`LiveBoard.tsx`'s directory, `page.tsx`, and the rollback test file respectively),
  confirmed tsc reported `TS2322` for that exact file, then deleted before committing. No probe file
  survives (`find apps/web -iname "__probe*"` returns nothing).
- `git diff --name-only` across all three commits touches exactly the 7 files named in
  `files_modified` — confirmed against `git status --porcelain` (clean except the untracked
  `.planning/quick/551-.../` directory).
- No forbidden files touched: `board-lookup.ts`, `board-view.ts`, `board-status.ts`,
  `board-constants.ts`, `BoardRow.tsx`, `BoardToggle.tsx`, `ViewToggle.tsx`, `FilterChips.tsx` do not
  appear in the diff.
- No new dependency (`package.json`/lockfiles absent from the diff), no DDL
  (`schema.prisma`/`prisma/migrations/` absent from the diff).
- All plan-specified greps (BoardToggle import-only in LiveBoard.tsx, distinct `layoutId`s, no bare
  `: null` branch, `viewMode` default preserved in Task 1; `initialViewMode` wiring, untouched
  `LiveMapMobile` call, exactly one `live-map?view=board` sidebar hit, nothing in
  `owner-more-menu.tsx` in Task 2; `notificationLog` count of 2 per file, correct delete ordering, no
  `tenantNotificationSettings` in Task 3) passed as specified.

## Deviations from Plan

None — plan executed exactly as written.

**One observation, not a deviation:** Task 2's verify item 6 (`grep -n "useSearchParams"
apps/web/src/components/navigation/sidebar.tsx` must return nothing) technically finds one hit — the
plan's own verbatim comment text explains *why* `useSearchParams` is deliberately not used, and that
explanation itself contains the string `useSearchParams`. The substantive requirement — no import of
`useSearchParams`, no hook call — is satisfied (`grep -n "^import" sidebar.tsx` shows only
`usePathname` from `next/navigation`). Flagging this in case a future automated check on this string
is added elsewhere; the code is correct as specified.

## Self-Check

- `apps/web/src/components/maps/live-map-wrapper.tsx` — FOUND, modified as specified
- `apps/web/src/components/tracking/LiveBoard.tsx` — FOUND, modified as specified
- `apps/web/src/app/(owner)/live-map/page.tsx` — FOUND, modified as specified
- `apps/web/src/components/navigation/sidebar.tsx` — FOUND, modified as specified
- `apps/web/tests/carrier/document-import-commit-rollback.test.ts` — FOUND, modified as specified
- `apps/web/tests/carrier/document-import-commit-windows.test.ts` — FOUND, modified as specified
- `apps/web/tests/carrier/document-import-commit-notification-isolation.test.ts` — FOUND, modified as specified
- Commit `61974568` — FOUND in `git log`
- Commit `997f570d` — FOUND in `git log`
- Commit `b009a0fc` — FOUND in `git log`

## Self-Check: PASSED
