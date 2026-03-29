---
phase: quick-125
plan: "01"
subsystem: mobile-owner-ui
tags: [mobile, speed-dial, support, fab, owner-portal]
dependency_graph:
  requires:
    - SupportTicketContext (useSupportTicket hook)
    - haptics lib
  provides:
    - PageSpeedDial reusable component
  affects:
    - apps/mobile/app/(owner)/loads/index.tsx
    - apps/mobile/app/(owner)/drivers/index.tsx
    - apps/mobile/app/(owner)/more/invoices/index.tsx
    - apps/mobile/app/(owner)/more/trucks/index.tsx
    - apps/mobile/app/(owner)/more/crm/index.tsx
    - apps/mobile/components/shared/SupportTicketFAB.tsx
tech_stack:
  added: []
  patterns:
    - Reusable speed dial component with animated backdrop
    - Set-based page exclusion list for conditional FAB rendering
key_files:
  created:
    - apps/mobile/components/ui/PageSpeedDial.tsx
  modified:
    - apps/mobile/app/(owner)/loads/index.tsx
    - apps/mobile/app/(owner)/drivers/index.tsx
    - apps/mobile/app/(owner)/more/invoices/index.tsx
    - apps/mobile/app/(owner)/more/trucks/index.tsx
    - apps/mobile/app/(owner)/more/crm/index.tsx
    - apps/mobile/components/shared/SupportTicketFAB.tsx
decisions:
  - Set-based SPEED_DIAL_PAGES lookup replaces boolean isDashboard check for cleaner extensibility
metrics:
  duration_seconds: 184
  completed_date: "2026-03-29"
  tasks_completed: 3
  files_changed: 7
---

# Quick Task 125: Add Get Support to Every Owner Page FAB — Summary

## One-liner

Replaced plain + FABs on 5 owner list pages with a reusable `PageSpeedDial` component that shows a 2-item speed dial: the page's primary action and a Get Support option, with animation matching the dashboard.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create PageSpeedDial reusable component | e98e443 | components/ui/PageSpeedDial.tsx (new) |
| 2 | Replace FABs on 5 owner pages with PageSpeedDial | 74558f0 | loads, drivers, invoices, trucks, crm index files |
| 3 | Hide SupportTicketFAB on converted pages | 41fec2e | components/shared/SupportTicketFAB.tsx |

## What Was Built

### PageSpeedDial component (`apps/mobile/components/ui/PageSpeedDial.tsx`)
- Accepts 4 props: `primaryLabel`, `primaryIcon`, `primaryColor`, `onPrimaryPress`
- Single FAB (sky blue `#0ea5e9`) that toggles to gray/X when open
- Animated 2-item speed dial: primary action row + separator + Get Support row
- Animation: 180ms open / 140ms close via `Animated.timing` with `useNativeDriver: true`
- Semi-transparent backdrop (`rgba(0,0,0,0.55)`) with press-to-close
- Haptics: `haptic.medium()` on open, `haptic.light()` on item press
- Get Support uses `setTimeout(() => openSupport(), 160)` to allow close animation to complete

### 5 pages updated
- **loads/index.tsx** — `Package` icon, `#38bdf8` (sky blue), opens CreateLoadSheet
- **drivers/index.tsx** — `UserPlus` icon, `#a78bfa` (violet), navigates to invite
- **invoices/index.tsx** — `FileText` icon, `#fbbf24` (amber), navigates to new invoice
- **trucks/index.tsx** — `Truck` icon, `#f87171` (red), navigates to new truck
- **crm/index.tsx** — `Building2` icon, `#34d399` (emerald), navigates to new customer

### SupportTicketFAB updated
- Replaced `isDashboard` boolean with `SPEED_DIAL_PAGES` Set containing 13 path variants
- Covers dashboard (3 variants) + 5 pages × 2 variants (with/without `/index` suffix)

## Decisions Made

**Set-based page exclusion** — Used a `Set<string>` for `SPEED_DIAL_PAGES` instead of multiple boolean conditions. More readable and easier to extend when new pages get a speed dial in the future.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/mobile/components/ui/PageSpeedDial.tsx` exists
- [x] All 5 page files modified (Plus removed, PageSpeedDial imported and used)
- [x] `SupportTicketFAB.tsx` updated with expanded SPEED_DIAL_PAGES Set
- [x] Commits e98e443, 74558f0, 41fec2e all exist
- [x] No TypeScript errors introduced by this task's changes

## Self-Check: PASSED
