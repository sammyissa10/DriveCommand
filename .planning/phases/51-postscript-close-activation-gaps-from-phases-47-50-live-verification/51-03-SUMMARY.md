---
phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification
plan: 03
subsystem: ui
tags: [onboarding, checklist, next-link, tailwind, shadcn]

# Dependency graph
requires:
  - phase: 51-02
    provides: activation event hooks for direct driver creation
provides:
  - Clickable checklist items in ActivationChecklist linking to truck/driver/customer/dispatch create pages
  - Conditional Link wrapping — incomplete items linked, complete items plain
  - Updated item 3 label from "Invite your first driver" to "Add your first driver"
affects: [onboarding-welcome, activation-checklist]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Conditional Link wrapping pattern: rowContent fragment + if(!item.complete && item.href) branch"

key-files:
  created: []
  modified:
    - apps/web/src/app/onboarding/welcome/checklist.tsx

key-decisions:
  - "Item 1 (Account created) has no href — it is always complete and should never be interactive"
  - "Link wraps the entire li row content so the full row is the click target, not just the text"
  - "hover:bg-muted/50 dark:hover:bg-muted/30 provides visible affordance without being heavy"

patterns-established:
  - "ChecklistItem href pattern: optional href field drives conditional Link wrapping at render time"

# Metrics
duration: 2min
completed: 2026-05-03
---

# Phase 51 Plan 03: Wire Checklist CTAs to Actionable URLs Summary

**Onboarding checklist incomplete items wrapped in next/link with hover affordance — trucks, drivers, customers, and dispatches each route to their respective create pages**

## Performance

- **Duration:** 2 min
- **Started:** 2026-05-03T21:43:18Z
- **Completed:** 2026-05-03T21:45:38Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added `href?: string` to `ChecklistItem` interface enabling conditional link behavior
- Items 2-5 now carry hrefs pointing to `/carrier/fleet/trucks/new`, `/carrier/fleet/drivers/new`, `/carrier/clients/new`, and `/carrier/dispatches`
- Incomplete items render as `<Link>` with `hover:bg-muted/50 dark:hover:bg-muted/30 transition-colors` — full row is the click target
- Complete items remain plain `<li>` rows with no interactivity
- Item 3 label corrected from "Invite your first driver" to "Add your first driver"
- TypeScript compiles cleanly (zero errors in source files)

## Task Commits

Each task was committed atomically:

1. **Tasks 1-3: Read, implement, verify, and commit** - `9f15bfb` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/app/onboarding/welcome/checklist.tsx` - Added href to ChecklistItem, updated items array, conditional Link/li render logic

## Decisions Made
- Item 1 has no href because it is always `complete: true` — the conditional guard (`!item.complete && item.href`) would never fire, so omitting href is cleaner and explicit
- The full `<Link>` wraps the `<li>` content (not just the text span) so the entire row is clickable, consistent with list-row affordance conventions in shadcn/ui patterns

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- `npx tsc --noEmit` showed errors only in `.next/dev/` generated stubs — pre-existing artifacts, not in any source file. All source TypeScript is clean.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Checklist items are now fully interactive for new tenants during onboarding
- Plan 51-04 can proceed
- Visual verification at `/onboarding/welcome` recommended: incomplete items should show cursor change + hover highlight, complete items should be inert

---
*Phase: 51-postscript-close-activation-gaps-from-phases-47-50-live-verification*
*Completed: 2026-05-03*
