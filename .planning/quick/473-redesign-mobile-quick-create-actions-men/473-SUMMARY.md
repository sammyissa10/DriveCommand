---
phase: quick-473
plan: 473
subsystem: ui
tags: [mobile-design-system, quick-actions, bottom-sheet, tailwind, nextjs]

# Dependency graph
requires:
  - phase: mobile-design-system-foundation
    provides: ds kit components (AddButton, SheetContainer, SectionHeader) and ds.* tailwind tokens
provides:
  - QuickActionsMenu variant prop ('desktop' | 'mobile') with unchanged desktop dropdown and new ds mobile bottom sheet
affects: [mobile-web-design-system-migration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "QuickActionsMenu variant split mirrors NotificationBell variant=\"mobile\" convention"
    - "Mobile bottom-sheet rows: rounded-[20px] bg-ds-card group + ml-12 inset hairline between rows (not before first / after last)"

key-files:
  created: []
  modified:
    - apps/web/src/components/quick-actions/QuickActionsMenu.tsx
    - apps/web/src/components/navigation/owner-shell.tsx

key-decisions:
  - "Desktop dropdown markup extracted into the default render path of QuickActionsMenu unchanged; mobile variant implemented as a separate internal MobileQuickActionsMenu component to avoid touching desktop JSX at all"
  - "Dropped keyboard shortcut hints entirely on mobile per plan (touch device, no other mobile page shows shortcuts)"

patterns-established:
  - "Grouped ds-card list pattern for menu/action sheets: SectionHeader + rounded-[20px] bg-ds-card wrapper + per-row inset ml-12 hairline divider"

# Metrics
duration: ~10min
completed: 2026-07-18
---

# Quick 473: Redesign Mobile Quick Create/Actions Menu Summary

**QuickActionsMenu gained a `variant` prop so mobile renders a ds bottom sheet (AddButton trigger + SheetContainer + grouped ds-card rows) while the desktop Linear-style dropdown stays byte-for-byte unchanged.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-07-18T19:10:00Z
- **Completed:** 2026-07-18T19:20:38Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- `QuickActionsMenu` now accepts `variant?: 'desktop' | 'mobile'` (default `'desktop'`); desktop dropdown markup/behavior untouched.
- Mobile variant renders `AddButton` trigger + `SheetContainer` sheet titled "Create" with subtitle, two `SectionHeader`-grouped `rounded-[20px] bg-ds-card` sections (Quick Create / Quick Actions), rows with muted `text-ds-txt2` icons, `text-ds-txt3` chevrons, and inset `ml-12` hairlines between rows only.
- Mobile owner-shell top-bar call site now passes `variant="mobile"`; desktop call site unchanged.
- Row tap closes the sheet then navigates via `router.push(href)`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add mobile bottom-sheet variant to QuickActionsMenu and wire the mobile call site** - `d69c812e` (feat)

**Plan metadata:** (this summary is the closing artifact — no separate metadata commit for quick tasks)

## Files Created/Modified
- `apps/web/src/components/quick-actions/QuickActionsMenu.tsx` - Added `variant` prop; default path is the original desktop `DropdownMenu` tree unchanged; new `MobileQuickActionsMenu` internal component renders the ds `AddButton` + `SheetContainer` bottom sheet built from `SectionHeader` + grouped `ds-card` rows reading `QUICK_ACTION_SECTIONS` as-is.
- `apps/web/src/components/navigation/owner-shell.tsx` - Mobile topbar call site (`lg:hidden` dark bar) changed to `<QuickActionsMenu variant="mobile" />`; desktop call site left as `<QuickActionsMenu />`.

## Decisions Made
- Implemented the mobile variant as a fully separate `MobileQuickActionsMenu()` function called from an early return inside `QuickActionsMenu`, rather than branching mid-JSX — keeps the desktop `DropdownMenu` tree completely untouched and easy to diff.
- No changes to `quickActions.config.ts` — `QUICK_ACTION_SECTIONS` reused as-is per plan constraint.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Initial `npx tsc --noEmit` run failed with syntax errors inside an unrelated, stale auto-generated file (`.next/dev/types/validator.ts`) left over from a previous dev server run — not related to this task's files. Cleared the `.next` build cache (`rm -rf apps/web/.next`) and reran; `tsc --noEmit` then passed with exit code 0 and zero errors project-wide (no regressions in `QuickActionsMenu.tsx` or `owner-shell.tsx`).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Mobile top-bar "+" now matches the rest of the mobile-web design system; no other consumers of `QuickActionsMenu` need updating (confirmed via grep — only the two owner-shell call sites exist).
- No blockers.

---
*Phase: quick-473*
*Completed: 2026-07-18*
