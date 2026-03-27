---
phase: 37-polish-performance
plan: "05"
subsystem: ui
tags: [react-native, nativewind, skeleton, loading-states, owner-portal]

requires:
  - phase: 37-polish-performance/37-02
    provides: Skeleton component + driver portal skeleton loaders (established the pattern)
  - phase: 37-polish-performance/37-04
    provides: NativeWind className migration for owner screens (required for consistent className usage)

provides:
  - TruckCardSkeleton, InvoiceRowSkeleton, ComplianceRowSkeleton, PayrollRowSkeleton, CRMCardSkeleton, LoadDetailSkeleton components
  - Owner portal secondary screens (compliance, crm, trucks, payroll, invoices, load detail) show content-shaped skeletons during loading
  - fleet.tsx messages loading confirmed as 4x MessageSkeleton (no ActivityIndicator)

affects: [37-06, 37-07]

tech-stack:
  added: []
  patterns:
    - "Owner list screen skeleton pattern: 3x NameSkeleton rows replacing ActivityIndicator centered spinner"
    - "Skeleton components use style={} not className (pure layout primitives with fixed dark colors)"
    - "LoadDetailSkeleton wraps SafeAreaView and mirrors full screen structure (header bar + info cards)"

key-files:
  created:
    - apps/mobile/components/skeletons/TruckCardSkeleton.tsx
    - apps/mobile/components/skeletons/InvoiceRowSkeleton.tsx
    - apps/mobile/components/skeletons/ComplianceRowSkeleton.tsx
    - apps/mobile/components/skeletons/PayrollRowSkeleton.tsx
    - apps/mobile/components/skeletons/CRMCardSkeleton.tsx
    - apps/mobile/components/skeletons/LoadDetailSkeleton.tsx
  modified:
    - apps/mobile/app/(owner)/more/trucks.tsx
    - apps/mobile/app/(owner)/more/compliance.tsx
    - apps/mobile/app/(owner)/more/crm.tsx
    - apps/mobile/app/(owner)/more/payroll.tsx
    - apps/mobile/app/(owner)/more/invoices/index.tsx
    - apps/mobile/app/(owner)/loads/[id].tsx

key-decisions:
  - "Kept screen header visible during loading by placing skeletons inside the existing isLoading conditional (header is rendered above the conditional, stays visible)"
  - "LoadDetailSkeleton includes SafeAreaView wrapper so it can be returned as standalone screen replacement"
  - "ActivityIndicator kept in loads/[id].tsx for DriverPickerSheet loading state and CancelConfirmSheet mutation spinner (these are mutation-time indicators, not page-load spinners)"

patterns-established:
  - "List screen skeleton: 3 rows of NameSkeleton with pt-3 wrapping View, replacing ActivityIndicator block"
  - "Detail screen skeleton: full standalone component returned via early return (if isLoading) return <XxxDetailSkeleton />"

duration: 8min
completed: 2026-03-27
---

# Phase 37 Plan 05: Owner Portal Skeleton Loaders Summary

**Six content-shaped skeleton components for owner portal screens, eliminating all ActivityIndicator full-page spinners from owner secondary screens (compliance, CRM, trucks, payroll, invoices, load detail)**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-27T00:00:00Z
- **Completed:** 2026-03-27T00:08:00Z
- **Tasks:** 2
- **Files modified:** 12 (6 created, 6 modified)

## Accomplishments

- Created 6 new skeleton components matching each owner screen's content shape (card layout, list rows, detail page structure)
- Replaced ActivityIndicator centered spinners in 5 owner list screens with 3-row skeleton patterns
- Replaced inline skeleton block in loads/[id].tsx with dedicated `LoadDetailSkeleton` component
- Confirmed fleet.tsx messages loading already uses 4x MessageSkeleton (no change needed)

## Task Commits

1. **Task 1: Create five list-screen skeleton components** - `386fc62` (feat)
2. **Task 2: Create LoadDetailSkeleton, wire all skeletons into screens, confirm fleet.tsx** - `75df999` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified

- `apps/mobile/components/skeletons/TruckCardSkeleton.tsx` - Icon square + text lines + status chip
- `apps/mobile/components/skeletons/InvoiceRowSkeleton.tsx` - Invoice number/amount top row + customer/dot bottom row
- `apps/mobile/components/skeletons/ComplianceRowSkeleton.tsx` - Indicator dot + text lines + days chip on right
- `apps/mobile/components/skeletons/PayrollRowSkeleton.tsx` - Avatar circle + name/period + amount/status chip
- `apps/mobile/components/skeletons/CRMCardSkeleton.tsx` - Avatar square + company name + two badge chips
- `apps/mobile/components/skeletons/LoadDetailSkeleton.tsx` - Header bar + route info grid + stops timeline + truck card
- `apps/mobile/app/(owner)/more/trucks.tsx` - Replaced ActivityIndicator with 3x TruckCardSkeleton; removed ActivityIndicator import
- `apps/mobile/app/(owner)/more/compliance.tsx` - Replaced ActivityIndicator with 3x ComplianceRowSkeleton; removed ActivityIndicator import
- `apps/mobile/app/(owner)/more/crm.tsx` - Replaced ActivityIndicator with 3x CRMCardSkeleton; removed ActivityIndicator import
- `apps/mobile/app/(owner)/more/payroll.tsx` - Replaced ActivityIndicator with 3x PayrollRowSkeleton; removed ActivityIndicator import
- `apps/mobile/app/(owner)/more/invoices/index.tsx` - Replaced ActivityIndicator with 3x InvoiceRowSkeleton; removed ActivityIndicator import
- `apps/mobile/app/(owner)/loads/[id].tsx` - Replaced inline skeleton block with LoadDetailSkeleton; replaced Skeleton import with LoadDetailSkeleton import

## Decisions Made

- Skeleton loading state sits inside the `isLoading` ternary branch within `AnimatedScreen`, so the screen header (back button + title) stays visible during loading — more oriented user experience
- `LoadDetailSkeleton` owns its own `SafeAreaView` wrapper to enable clean early-return replacement of the inline skeleton
- `ActivityIndicator` kept in `loads/[id].tsx` because it is still used for mutation spinner states (DriverPickerSheet loading, CancelConfirmSheet isPending indicator) — only the initial page-load spinner was replaced

## Deviations from Plan

None — plan executed exactly as written. fleet.tsx was already using 4x MessageSkeleton as expected (verification-only step confirmed).

## Issues Encountered

None. Pre-existing TypeScript errors in `fleet.tsx` (FlashList type issue) and `ExternalLink.tsx` were present before this plan and are unrelated.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Owner portal is now fully consistent with driver portal: all data-fetching screens show content-shaped skeletons during loading
- Ready to proceed with Phase 37 Plan 06

---
*Phase: 37-polish-performance*
*Completed: 2026-03-27*
