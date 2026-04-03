---
phase: quick
plan: "149"
subsystem: mobile-theming
tags: [theming, dark-mode, light-mode, useThemeColors, react-native, nativewind]
dependency-graph:
  requires: [quick-148]
  provides: [full-light-dark-mode-support]
  affects: [all-mobile-screens]
tech-stack:
  added: []
  patterns: [useThemeColors-hook, inline-style-theming, theme-token-system]
key-files:
  modified:
    - apps/mobile/app/(driver)/documents.tsx
    - apps/mobile/app/(driver)/incidents/index.tsx
    - apps/mobile/app/(driver)/incidents/new.tsx
    - apps/mobile/app/(driver)/loads/[id].tsx
    - apps/mobile/app/(driver)/loads/index.tsx
    - apps/mobile/app/(driver)/loads/my-route.tsx
    - apps/mobile/app/(driver)/messages.tsx
    - apps/mobile/app/(owner)/loads/[id].tsx
    - apps/mobile/app/(owner)/loads/index.tsx
    - apps/mobile/app/(owner)/more/compliance.tsx
    - apps/mobile/app/(owner)/more/crm/index.tsx
    - apps/mobile/app/(owner)/more/crm/new.tsx
    - apps/mobile/app/(owner)/more/fleet.tsx
    - apps/mobile/app/(owner)/more/fuel.tsx
    - apps/mobile/app/(owner)/more/index.tsx
    - apps/mobile/app/(owner)/more/invoices/index.tsx
    - apps/mobile/app/(owner)/more/invoices/new.tsx
    - apps/mobile/app/(owner)/more/payroll.tsx
    - apps/mobile/app/(owner)/more/profit-predictor.tsx
    - apps/mobile/app/(owner)/more/trucks/[id].tsx
    - apps/mobile/app/(owner)/more/trucks/index.tsx
    - apps/mobile/app/(owner)/more/trucks/new.tsx
    - apps/mobile/app/(owner)/routes/[id].tsx
    - apps/mobile/app/(owner)/routes/index.tsx
    - apps/mobile/components/driver/DocumentUploadSheet.tsx
    - apps/mobile/components/driver/LoadCard.tsx
    - apps/mobile/components/driver/RouteCard.tsx
    - apps/mobile/components/driver/StatusUpdateButton.tsx
    - apps/mobile/components/ui/LoadingSpinner.tsx
decisions:
  - "useThemeColors() called in each sub-component (not passed as prop) — hooks must be called inside React function components"
  - "Variable name collisions resolved: 'c' param in find callbacks renamed to 'cat'/'cust', STATUS_COLORS const renamed to 'statusColors' in trucks/[id].tsx"
  - "LoadingSpinner color prop default changed to c.brand so it picks up theme; explicit color override still supported"
  - "Pre-existing TypeScript errors (FlashList estimatedItemSize, _layout args) confirmed not introduced by this task"
metrics:
  duration: "~90 minutes (split across 2 sessions)"
  completed: "2026-04-03"
  tasks: 3
  files: 29
---

# Quick 149: Migrate All Mobile Screens to useThemeColors Summary

Full light/dark mode support by replacing all 29 hardcoded dark-only Tailwind color classes with `useThemeColors()` hook calls across every driver and owner portal screen plus shared components.

## What Was Built

Systematic replacement of all `bg-slate-*`, `text-slate-*`, `border-slate-*`, and hardcoded hex color values (e.g., `#0f172a`, `#1e293b`, `#334155`, `#f1f5f9`) with `useThemeColors()` token references. The existing theme infrastructure from quick-148 is now fully utilized across the entire app.

**Migration pattern applied:**

```tsx
// Before
<View className="bg-slate-800 border border-slate-700">
  <Text className="text-slate-100">...</Text>
</View>

// After
const c = useThemeColors()
<View style={{ backgroundColor: c.surfaceCard, borderWidth: 1, borderColor: c.border }}>
  <Text style={{ color: c.textPrimary }}>...</Text>
</View>
```

## Tasks Completed

### Task 1 — Driver Portal Screens (7 files) — commit `6f3c91a`

- `app/(driver)/documents.tsx`
- `app/(driver)/incidents/index.tsx`
- `app/(driver)/incidents/new.tsx`
- `app/(driver)/loads/[id].tsx`
- `app/(driver)/loads/index.tsx`
- `app/(driver)/loads/my-route.tsx`
- `app/(driver)/messages.tsx`

### Task 2 — Owner Portal Screens (17 files) — commit `4e7a69c`

- `app/(owner)/loads/[id].tsx` + `index.tsx`
- `app/(owner)/more/compliance.tsx`
- `app/(owner)/more/crm/index.tsx` + `new.tsx`
- `app/(owner)/more/fleet.tsx`
- `app/(owner)/more/fuel.tsx`
- `app/(owner)/more/index.tsx`
- `app/(owner)/more/invoices/index.tsx` + `new.tsx`
- `app/(owner)/more/payroll.tsx`
- `app/(owner)/more/profit-predictor.tsx`
- `app/(owner)/more/trucks/[id].tsx` + `index.tsx` + `new.tsx`
- `app/(owner)/routes/[id].tsx` + `index.tsx`

### Task 3 — Shared Components (5 files) — commit `dd11347`

- `components/driver/DocumentUploadSheet.tsx`
- `components/driver/LoadCard.tsx`
- `components/driver/RouteCard.tsx`
- `components/driver/StatusUpdateButton.tsx`
- `components/ui/LoadingSpinner.tsx`

## Verification

- `npx tsc --noEmit` — zero new errors introduced (all existing errors pre-date this task)
- `grep -rn "bg-slate-\|text-slate-\|border-slate-"` in migrated files — zero results

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Variable name collision in `incidents/new.tsx`**
- **Found during:** Task 1
- **Issue:** `CATEGORIES.find((c) => ...)` parameter `c` clashed with `const c = useThemeColors()`
- **Fix:** Renamed find callback parameter to `cat`
- **Files modified:** `app/(driver)/incidents/new.tsx`
- **Commit:** `6f3c91a`

**2. [Rule 1 - Bug] Variable name collision in `crm/index.tsx`**
- **Found during:** Task 2
- **Issue:** `renderCustomer` callback used `{ item: c }` destructuring, clashing with `const c = useThemeColors()`
- **Fix:** Renamed to `{ item: cust }`
- **Files modified:** `app/(owner)/more/crm/index.tsx`
- **Commit:** `4e7a69c`

**3. [Rule 1 - Bug] `invoices/new.tsx` had infinite recursion in `goBack()`**
- **Found during:** Task 2
- **Issue:** The `else` branch called `goBack()` recursively instead of `router.back()`
- **Fix:** Corrected to `else router.back()`
- **Files modified:** `app/(owner)/more/invoices/new.tsx`
- **Commit:** `4e7a69c`

## Self-Check: PASSED

Files verified:
- `apps/mobile/app/(driver)/documents.tsx` — FOUND
- `apps/mobile/app/(owner)/more/fuel.tsx` — FOUND
- `apps/mobile/app/(owner)/routes/index.tsx` — FOUND
- `apps/mobile/components/driver/LoadCard.tsx` — FOUND
- `apps/mobile/components/ui/LoadingSpinner.tsx` — FOUND

Commits verified:
- `6f3c91a` — FOUND (driver portal screens)
- `4e7a69c` — FOUND (owner portal screens)
- `dd11347` — FOUND (shared components)
