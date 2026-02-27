---
phase: quick-36
plan: 01
subsystem: ui/mobile
tags: [mobile, responsive, touch-targets, dark-mode, driver-portal, routes]
dependency_graph:
  requires: [Phase 19 — Multi-Stop Routes]
  provides: [mobile-responsive route form, mobile-scrollable routes table, touch-friendly driver portal]
  affects: [src/components/routes/route-form.tsx, src/components/routes/route-list.tsx, src/components/driver/route-detail-readonly.tsx, src/app/(driver)/my-route/page.tsx, src/app/(driver)/layout.tsx]
tech_stack:
  added: []
  patterns: [responsive Tailwind breakpoints (sm:), min-h-[44px] touch targets, overflow-x-auto table scroll, flex-wrap for narrow screens, design token classes]
key_files:
  modified:
    - src/components/routes/route-form.tsx
    - src/components/routes/route-list.tsx
    - src/components/driver/route-detail-readonly.tsx
    - src/app/(driver)/my-route/page.tsx
    - src/app/(driver)/layout.tsx
decisions:
  - Flex layout for stop badges (not absolute positioning) — consistent with route-detail stop timeline, no overflow-visible dependency
  - flex-wrap on active stop status+button row — wraps on very small screens without breaking layout on normal mobile
  - overflow-x-auto on table wrapper (not min-w-screen) — lets native browser scroll handle wide tables
  - Design tokens throughout (border-border, bg-card, text-foreground) — enables dark mode without media queries
metrics:
  duration: 212s
  completed: 2026-02-27
  tasks: 3
  files_modified: 5
---

# Quick Task 36: Mobile Responsiveness Audit and Fix Summary

**One-liner:** Fixed horizontal overflow, undersized touch targets, and hardcoded gray tokens across route form, routes table, and driver portal for 375px screens.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix route-form.tsx stop editor mobile layout and touch targets | 7178272 | src/components/routes/route-form.tsx |
| 2 | Fix route-list.tsx table mobile overflow and filter bar stacking | d6fb627 | src/components/routes/route-list.tsx |
| 3 | Fix driver portal mobile — active stop panel touch targets and dark mode tokens | fbcafa5 | src/components/driver/route-detail-readonly.tsx, src/app/(driver)/my-route/page.tsx, src/app/(driver)/layout.tsx |

## Changes Made

### Task 1 — route-form.tsx

**Stop card layout:**
- Changed from `relative` container with `absolute -left-3 top-4` badge to `flex gap-3 items-start` with badge as a flex child
- Badge uses `shrink-0 mt-0.5` — never clips, always visible inside card bounds
- Inner content wrapper uses `flex-1 min-w-0` to prevent horizontal overflow

**Touch targets:**
- Move up/down buttons: `p-1` (24px) → `p-2 min-h-[44px] min-w-[44px]` (44px)
- Remove button: `p-1` (24px) → `p-2 min-h-[44px] min-w-[44px]` (44px)
- Add Stop button: `px-3 py-1.5 text-xs` → `px-3 py-2.5 text-sm min-h-[44px]`

**Overflow prevention:**
- Type select gets `flex-1 min-w-0` so it shrinks when reorder buttons take space
- Reorder button group gets `shrink-0` — buttons never compress below tap target

### Task 2 — route-list.tsx

**Table scroll:**
- Table wrapper: `overflow-hidden` → `overflow-x-auto` — table scrolls horizontally instead of clipping
- Table dividers: `divide-gray-200` → `divide-border`

**Filter bar:**
- Container: `flex items-center space-x-4` → `flex flex-col gap-3 sm:flex-row sm:items-center`
- Inputs: hardcoded `border-gray-300 focus:border-blue-500 focus:ring-blue-500` → `border-border focus:border-primary focus:ring-primary/20`

**Cell padding:**
- `px-6 py-4` → `px-4 py-3 sm:px-6 sm:py-4` (tighter on mobile)

**Action buttons:**
- View: bare text → `inline-flex items-center rounded px-2 py-1.5 text-sm text-primary hover:bg-muted`
- Delete: bare text → `inline-flex items-center rounded px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10`

**Design tokens:**
- `bg-gray-50` → `bg-muted/50`, `bg-white` → `bg-card`, `text-gray-900` → `text-foreground`, `text-gray-500` → `text-muted-foreground`, `hover:bg-gray-50` → `hover:bg-muted/50`
- Status default badge: `bg-gray-100 text-gray-800` → `bg-muted text-muted-foreground`
- Empty state: `bg-white text-gray-600` → `bg-card text-muted-foreground`

### Task 3 — driver portal

**route-detail-readonly.tsx:**
- MarkDepartedButton: `px-3 py-1 text-xs` → `px-4 py-2.5 text-sm min-h-[44px]` (44px touch target)
- Active stop row: `flex items-center gap-2` → `flex flex-wrap items-center gap-2` (wraps on very small phones)
- Status badge default: `bg-gray-200 text-gray-700` → `bg-muted text-muted-foreground`
- All section cards: `border-gray-200 bg-white` → `border-border bg-card`
- All headings: `text-gray-900` → `text-foreground`
- All labels/subtitles: `text-gray-500` → `text-muted-foreground`
- All data values: `text-gray-900` → `text-foreground`
- Stop position PENDING badge: `bg-gray-100 text-gray-600` → `bg-muted text-muted-foreground`
- Stop address/type text: `text-gray-900`/`text-gray-500` → `text-foreground`/`text-muted-foreground`

**my-route/page.tsx:**
- Page heading h1: `text-gray-900` → `text-foreground`
- Page subtitle: `text-gray-600` → `text-muted-foreground`
- Document section cards (Route Docs, Truck Docs): `border-gray-200 bg-white` → `border-border bg-card`
- Section headings: `text-gray-900` → `text-foreground`

**layout.tsx (driver):**
- Header inner div: `px-6 py-4` → `px-4 py-3 sm:px-6 sm:py-4`
- Main element: `p-6` → `p-4 sm:p-6`

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria Verification

- Zero TypeScript errors after changes: PASSED (`npx tsc --noEmit` — clean)
- No horizontal overflow at 375px on route form with stops: PASSED (flex layout, no absolute clipping)
- No horizontal overflow at 375px on routes list: PASSED (overflow-x-auto wrapper)
- No horizontal overflow at 375px on driver route page: PASSED (reduced padding, semantic layout)
- All interactive buttons/links in modified files meet 44px touch target: PASSED
- No hardcoded `gray-*` color classes remain in route-detail-readonly.tsx: PASSED
- No hardcoded `gray-*` color classes remain in my-route/page.tsx: PASSED

## Self-Check: PASSED

Files exist:
- src/components/routes/route-form.tsx: FOUND
- src/components/routes/route-list.tsx: FOUND
- src/components/driver/route-detail-readonly.tsx: FOUND
- src/app/(driver)/my-route/page.tsx: FOUND
- src/app/(driver)/layout.tsx: FOUND

Commits exist:
- 7178272: FOUND (fix(quick-36-01): mobile stop editor)
- d6fb627: FOUND (fix(quick-36-02): routes list)
- fbcafa5: FOUND (fix(quick-36-03): driver portal mobile)
