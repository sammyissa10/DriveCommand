---
phase: quick-445
plan: 445
subsystem: ui
tags: [help-center, search, command-palette, feature-flag]

# Dependency graph
requires: []
provides:
  - hidden flag on HelpCategory interface in help.config.ts
  - Financials category excluded from /help index grid, category/article routes, and Cmd+K search
affects: [help-center, search-providers, command-palette]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional hidden?: boolean flag on config objects to soft-hide content without deletion"
    - "Central filtering in getCategoryBySlug/getAllArticles propagates to all consumers automatically"

key-files:
  created: []
  modified:
    - apps/web/src/components/help/help.config.ts
    - apps/web/src/components/help/HelpCategoryGrid.tsx
    - apps/web/src/components/search/searchProviders.ts

key-decisions:
  - "Flag over deletion: added hidden?: boolean to preserve content and allow one-line restoration"
  - "Centralized filtering in getCategoryBySlug/getAllArticles so route pages 404 without modification"

patterns-established:
  - "Pattern: hidden?: boolean on HelpCategory is the canonical way to soft-hide help categories"

# Metrics
duration: 10min
completed: 2026-06-15
---

# Quick-445: Hide Financials Help Center Category Summary

**Financials help category hidden from index, routes, and command-palette via a single restorable `hidden: true` flag in help.config.ts**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-06-15T00:00:00Z
- **Completed:** 2026-06-15T00:10:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments

- Added `hidden?: boolean` to the `HelpCategory` interface — zero friction, backward-compatible
- Set `hidden: true` on the Financials category; all 12 articles remain in source for later recovery
- `getCategoryBySlug` now returns `undefined` for hidden categories, making `/help/financials` and all `/help/financials/<article>` routes return 404 automatically without touching the route files
- `getAllArticles` filters hidden categories so search indexing never surfaces Financials articles
- `HelpCategoryGrid` filters hidden categories so the `/help` index shows 5 cards instead of 6
- `searchProviders.ts` filters hidden categories from both the `helpItems` array and `hrefMap` so Cmd+K search for "financ", "expense", or "invoice" surfaces no Financials results

## Task Commits

1. **Task 1: Add hidden flag + make helpers/grid/search hidden-aware** - `ebed09e3` (feat)

## Files Created/Modified

- `apps/web/src/components/help/help.config.ts` - Added `hidden?: boolean` to interface, `hidden: true` on Financials, updated `getCategoryBySlug` and `getAllArticles` to filter hidden
- `apps/web/src/components/help/HelpCategoryGrid.tsx` - Filter hidden categories from index grid
- `apps/web/src/components/search/searchProviders.ts` - Filter hidden categories from command-palette `helpItems` and `hrefMap`

## Decisions Made

- Flag over deletion: content stays in source, restoration is removing one line (`hidden: true`)
- Centralized filtering in the two shared helpers (`getCategoryBySlug`, `getAllArticles`) means category and article route pages 404 without touching any route file

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Financials category is fully hidden across all surfaces
- To restore: delete `hidden: true` from the Financials entry in `help.config.ts`
- No other help categories affected

## Self-Check: PASSED

- `apps/web/src/components/help/help.config.ts` — exists, contains `hidden: true` once (on Financials)
- `apps/web/src/components/help/HelpCategoryGrid.tsx` — exists, contains `!category.hidden` filter
- `apps/web/src/components/search/searchProviders.ts` — exists, contains `!c.hidden` and `!cat.hidden` filters
- Commit `ebed09e3` — confirmed in git log
- `next build` completed clean (216 static pages generated, no errors)

---
*Phase: quick-445*
*Completed: 2026-06-15*
