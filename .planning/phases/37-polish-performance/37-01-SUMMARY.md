---
phase: 37
plan: "01"
subsystem: mobile-polish
tags: [mobile, ux, performance, skeleton, flashlist, touch-targets]
dependency_graph:
  requires: [phase-36]
  provides: [polish-ux-baseline]
  affects: [all-mobile-screens]
tech_stack:
  added:
    - react-native-reanimated (Animated.View opacity pulse for skeletons)
    - "@shopify/flash-list (FlashList replacing FlatList in messages + fleet)"
  patterns:
    - Skeleton base component with withRepeat/withTiming opacity animation
    - Screen-specific skeleton variants mimicking real content shape
    - isLoading guard replaced with skeleton; isRefetching drives native PTR spinner
key_files:
  created:
    - apps/mobile/components/ui/Skeleton.tsx
    - apps/mobile/components/skeletons/LoadCardSkeleton.tsx
    - apps/mobile/components/skeletons/DashboardSkeleton.tsx
    - apps/mobile/components/skeletons/DriverCardSkeleton.tsx
    - apps/mobile/components/skeletons/MessageSkeleton.tsx
    - apps/mobile/components/skeletons/DocumentRowSkeleton.tsx
  modified:
    - apps/mobile/app/(driver)/index.tsx
    - apps/mobile/app/(driver)/loads/index.tsx
    - apps/mobile/app/(driver)/loads/[id].tsx
    - apps/mobile/app/(driver)/hos.tsx
    - apps/mobile/app/(driver)/documents.tsx
    - apps/mobile/app/(driver)/messages.tsx
    - apps/mobile/app/(driver)/incidents/new.tsx
    - apps/mobile/app/(owner)/index.tsx
    - apps/mobile/app/(owner)/loads/index.tsx
    - apps/mobile/app/(owner)/loads/[id].tsx
    - apps/mobile/app/(owner)/drivers/index.tsx
    - apps/mobile/app/(owner)/drivers/[id].tsx
    - apps/mobile/app/(owner)/fleet.tsx
    - apps/mobile/app/(owner)/map.tsx
decisions:
  - "Map loading overlay keeps ActivityIndicator: skeleton doesn't apply over full-screen MapView"
  - "Messages screen keeps isLoading-based state management (no TanStack Query) — skeleton replaces ActivityIndicator"
  - "estimatedItemSize values: load card 88, driver card 88, document row 64, message bubble 60"
metrics:
  duration: 439s
  completed: "2026-03-25"
  tasks: 6
  files_modified: 14
  files_created: 6
---

# Phase 37 Plan 01: Touch Targets, FlashList Audit, and Skeleton Loaders Summary

Animated opacity-pulse skeleton loaders replace all loading spinners across 11 data-fetching screens in both driver and owner portals, FlatList removed from all app screens (replaced with FlashList + estimatedItemSize), and 48px touch targets enforced on all interactive elements.

## Tasks Completed

### Task 1: Touch target audit
- `incidents/new.tsx` back button: `p-1` → `p-2` + `hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}`
- `messages.tsx` send button: added `hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}`
- `fleet.tsx` toggle buttons: `paddingVertical: 9` → `paddingVertical: 12` (18px → 24px + content = 48px+)
- `map.tsx` refresh button (36x36): added `hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}`
- `loads/index.tsx` tab toggles: `py-2` → `py-3` (8px → 12px padding each side)

### Task 2: FlashList replacement audit
- `messages.tsx`: `FlatList` → `FlashList` with `estimatedItemSize={60}`
- `fleet.tsx` history panel: `FlatList` → `FlashList` with `estimatedItemSize={60}`
- `loads/index.tsx` (driver): added `estimatedItemSize={88}` to existing FlashList
- `documents.tsx`: added `estimatedItemSize={64}` to existing FlashList
- Verified: `grep FlatList apps/mobile/app/**/*.tsx` returns 0 matches

### Task 3: Skeleton base component
- `components/ui/Skeleton.tsx`: animated `Animated.View` using `withRepeat(withTiming(0.8, {duration: 800}), -1, true)` for shimmer-like opacity pulse
- Props: `width`, `height`, `borderRadius`, `style`

### Task 4: Screen-specific skeleton variants
- `LoadCardSkeleton`: 4 skeleton rows mimicking load number, customer, route, driver
- `DashboardSkeleton`: 2x2 KPI grid (KPICardSkeleton helper) + 3 LoadCardSkeletons
- `DriverCardSkeleton`: avatar circle + 3 text rows + compliance dot
- `MessageSkeleton`: sender label + bubble + timestamp, `isDriver` prop for alignment
- `DocumentRowSkeleton`: icon box + 3 text rows + status badge

### Task 5: Replace spinners with skeletons
Replaced `ActivityIndicator` / `LoadingSpinner` on all 11 screens:
- Driver: dashboard (DashboardSkeleton), loads list (3x LoadCardSkeleton), load detail (Skeleton layout), HOS (Skeleton layout), documents (5x DocumentRowSkeleton), messages (4x MessageSkeleton)
- Owner: dashboard (DashboardSkeleton), loads list (3x LoadCardSkeleton), load detail (Skeleton layout), drivers list (5x DriverCardSkeleton), driver detail (Skeleton layout)

### Task 6: Verify pull-to-refresh
All 13 FlashList/ScrollView instances have `refreshing={isRefetching}` and `onRefresh={refetch/callback}` correctly wired. Since skeleton guards on `isLoading` (initial fetch only) and `isRefetching` is false during initial load, pull-to-refresh correctly shows only the native spinner — not the skeleton.

## Verification Results

| Check | Result |
|-------|--------|
| FlatList in app screens | 0 (all replaced) |
| FlashList instances | 13 |
| Skeleton usages across screens | 64 |
| Pull-to-refresh wired | 13 screens |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Add skeleton to load detail screens (driver + owner)**
- **Found during:** Task 5
- **Issue:** Plan listed load detail screens for driver and owner but only as part of verification, not explicitly covered
- **Fix:** Added Skeleton-based loading layouts to both `loads/[id].tsx` screens
- **Files modified:** `apps/mobile/app/(driver)/loads/[id].tsx`, `apps/mobile/app/(owner)/loads/[id].tsx`
- **Commit:** ee9778a

**2. [Rule 1 - Bug] Remove unused ActivityIndicator imports**
- **Found during:** Tasks 1 + 5
- **Issue:** Several screens had lingering `ActivityIndicator` imports after spinner replacement
- **Fix:** Removed unused imports from driver dashboard, driver loads list, driver messages, owner dashboard, owner drivers list, owner driver detail
- **Files modified:** 6 screen files
- **Commit:** d2e0a30

## Self-Check: PASSED

All 6 created files verified on disk. All 4 task commits found in git log:
- 606f0e0: touch targets + FlashList replacement (tasks 1-2)
- 32fda5b: Skeleton component + skeleton variants (tasks 3-4)
- d2e0a30: spinner → skeleton replacement on all screens (task 5)
- ee9778a: load detail skeletons + pull-to-refresh verification (task 6)
