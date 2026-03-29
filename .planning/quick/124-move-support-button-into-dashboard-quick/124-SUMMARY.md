---
phase: quick-124
plan: "01"
subsystem: mobile-owner-portal
tags: [mobile, support-ticket, context, speed-dial, dashboard, FAB]
dependency_graph:
  requires: []
  provides: [SupportTicketContext, dashboard-get-support]
  affects: [owner-layout, owner-dashboard, SupportTicketFAB]
tech_stack:
  added: []
  patterns: [React Context for shared modal state, provider wrapping layout for cross-screen access]
key_files:
  created:
    - apps/mobile/context/SupportTicketContext.tsx
  modified:
    - apps/mobile/components/shared/SupportTicketFAB.tsx
    - apps/mobile/app/(owner)/_layout.tsx
    - apps/mobile/app/(owner)/index.tsx
decisions:
  - "SupportTicketProvider placed inside Fragment in _layout.tsx, wrapping both Tabs and FAB — gives all owner screens access via context"
  - "FAB hides on /(owner)(\/index)? route via regex check against usePathname() — simple and avoids passing props down"
  - "Get Support renders after CREATE_ACTIONS.map() in speed dial (bottom of list, closest to FAB button)"
  - "Separator uses slate-600 (#475569) to match existing dashboard color palette"
metrics:
  duration: "~10 minutes"
  completed: "2026-03-29"
  tasks_completed: 2
  files_changed: 4
---

# Quick Task 124: Move Support Button into Dashboard Speed Dial — Summary

## One-liner

Extracted support ticket form into SupportTicketContext provider; FAB now calls context.open(), hidden on dashboard; dashboard speed dial gains "Get Support" item with amber styling and separator.

## What Was Done

### Task 1: Create SupportTicketContext and slim down FAB

Created `apps/mobile/context/SupportTicketContext.tsx` — all form state, mutation logic, S3 upload helper, ROUTE_MAP, BottomSheet rendering moved from SupportTicketFAB into the provider. Exposed `open()` via `useSupportTicket()` hook.

`SupportTicketFAB.tsx` reduced from 564 lines to 46 lines — now just a Pressable calling `useSupportTicket().open()`. Hides itself when pathname matches `/(owner)(\/index)?` (dashboard). Repositioned from `left: 20` to `right: 20`.

`apps/mobile/app/(owner)/_layout.tsx` imports and wraps children with `<SupportTicketProvider>`, keeping the FAB rendered inside (so it has context access).

Commit: `c7d7b3a`

### Task 2: Add Get Support to dashboard speed dial

Updated `apps/mobile/app/(owner)/index.tsx`:
- Added `LifeBuoy` import from lucide-react-native
- Added `useSupportTicket` import from context
- Called `const { open: openSupport } = useSupportTicket()` in component
- Added a slate-600 separator `<View>` (1px height, width 160) after `CREATE_ACTIONS.map()` block
- Added "Get Support" Pressable matching existing action item styling, amber icon (`#f59e0b`), calls `closeMenu() + haptic.light() + openSupport()`

Commit: `6f0dbf2`

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes (pre-existing FlashList and ExternalLink errors unaffected by this task)
- `SupportTicketContext.tsx` exports `SupportTicketProvider` and `useSupportTicket`
- `SupportTicketFAB.tsx` contains no BottomSheet, useMutation, or useState — 46 lines total
- `_layout.tsx` wraps in `SupportTicketProvider` (lines 13 + 86)
- Dashboard has `openSupport`, `Get Support` text, `LifeBuoy` icon, separator comment

## Self-Check: PASSED

Files confirmed present:
- apps/mobile/context/SupportTicketContext.tsx — FOUND
- apps/mobile/components/shared/SupportTicketFAB.tsx — FOUND
- apps/mobile/app/(owner)/_layout.tsx — FOUND
- apps/mobile/app/(owner)/index.tsx — FOUND

Commits confirmed:
- c7d7b3a — FOUND
- 6f0dbf2 — FOUND
