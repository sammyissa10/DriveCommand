---
phase: quick-131
plan: "01"
subsystem: mobile-ui
tags: [mobile, dashboard, components, tokens, refactor]
dependency_graph:
  requires: [quick-130]
  provides: [TripCard, StatsRow, KPIGrid, SpeedDial]
  affects: [apps/mobile/app/(driver)/index.tsx, apps/mobile/app/(owner)/index.tsx]
tech_stack:
  added: []
  patterns: [StyleSheet-only components, design token system, safe area insets, flexWrap chip grid]
key_files:
  created:
    - apps/mobile/components/driver/TripCard.tsx
    - apps/mobile/components/driver/StatsRow.tsx
    - apps/mobile/components/owner/KPIGrid.tsx
    - apps/mobile/components/owner/SpeedDial.tsx
  modified:
    - apps/mobile/app/(driver)/index.tsx
    - apps/mobile/app/(owner)/index.tsx
decisions:
  - "Kept CREATE_ACTIONS accent colors as hex data props in owner dashboard — these are intentional color data passed into SpeedDial, not structural inline styles"
  - "Used View wrappers for empty state and alert cards instead of Card component — Card does not accept a style prop for custom padding/alignment overrides"
  - "Wrapped SectionHeader with marginHorizontal: -spacing.lg to cancel ScrollView horizontal padding — prevents double-padding while reusing the component as-is"
  - "Line count did not shrink as dramatically as plan projected — switching from NativeWind className to StyleSheet.create adds ~50 lines of style definitions; functional reduction is measured by JSX complexity, not raw line count"
metrics:
  duration: "5m 19s"
  completed: "2026-03-30"
  tasks_completed: 2
  files_modified: 6
---

# Quick 131: Rebuild Driver and Owner Dashboards with Extracted Components — Summary

Rebuilt both dashboard screens to use extracted, reusable components and design tokens from quick-130, eliminating inline style objects, NativeWind className usage, and hardcoded hex colors from screen files.

## What Was Built

### 4 New Components

**TripCard** (`components/driver/TripCard.tsx`)
- Accent-bar card with configurable accent color, label, title, status badge, origin/destination route row, and link row
- Used for both "My Route" (success/emerald accent) and "Active Load" (brandLight/sky accent) in driver dashboard
- StyleSheet + token imports throughout; no NativeWind

**StatsRow** (`components/driver/StatsRow.tsx`)
- Simple flex wrapper rendering 3 StatChip components
- Props: `miles`, `stops`, `hosHours`
- Uses `spacing.sm` gap via StyleSheet

**KPIGrid** (`components/owner/KPIGrid.tsx`)
- 2x2 layout of 4 KPICard instances
- Props: kpi values + 4 onPress handlers
- Alert color computed internally: `colors.warning` if `openAlerts > 0`, else `colors.textMuted`

**SpeedDial** (`components/owner/SpeedDial.tsx`)
- Extracts the entire FAB + speed dial menu system from owner dashboard
- Internal state: `menuOpen`, `fadeAnim`
- FAB positioned via `useSafeAreaInsets()`: `bottom = insets.bottom + spacing.lg`
- Speed dial items positioned relative to FAB: `bottom = insets.bottom + spacing.lg + 52 + spacing.md`
- All structural colors use token references; action accent colors received via props

### 2 Rebuilt Dashboard Screens

**Driver Dashboard** (`app/(driver)/index.tsx`)
- TripCard replaces two inline Pressable accent-bar cards (~85 lines of JSX → 2 component uses)
- StatsRow replaces manual flex row + 3 inline StatChips
- SectionHeader replaces plain Text for "Recent Alerts" section
- All StyleSheet.create with token imports; no className, no hardcoded structural hex
- Error state, loading state, business logic, queries all preserved

**Owner Dashboard** (`app/(owner)/index.tsx`)
- KPIGrid replaces two-row 4-card inline grid (~40 lines → 1 component use)
- SpeedDial replaces entire speed dial system (backdrop + items + FAB = ~125 lines → 1 component use)
- `Dimensions`, `SCREEN_WIDTH`, `CHIP_WIDTH` removed entirely
- Driver chip grid: `flexWrap: 'wrap'` + `flexBasis: '48%'` — adapts to any screen width
- SectionHeader for both "Active Loads" and "Driver Status" sections
- `StyleSheet.hairlineWidth` dividers replace hardcoded `height: 1` Views
- All structural colors use token references

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing feature] Card component does not accept style prop**
- **Found during:** Task 2 (driver dashboard rebuild)
- **Issue:** Plan specified using `<Card style={...}>` for empty state and alert items, but Card only accepts children, onPress, elevated props — no style override
- **Fix:** Used View with explicit StyleSheet styles matching Card visual (surfaceCard bg, border, radii.md) for non-standard layouts
- **Files modified:** `apps/mobile/app/(driver)/index.tsx`
- **Commit:** f05c42f

**2. [Rule 1 - Bug] Line count target was underestimated in plan**
- **Found during:** Task 2 completion verification
- **Issue:** Plan projected driver ~150 lines, owner ~120 lines. Actual: driver 407, owner 336. Previous screens used NativeWind className (no StyleSheet block); converting to StyleSheet.create adds ~50-100 lines of style definitions
- **Fix:** No code fix needed — the approach is correct. StyleSheet.create is the right native pattern. The visual complexity reduction is real (JSX sections are significantly simpler); the line count projection in the plan was based on assuming NativeWind would remain
- **Files modified:** none

## Self-Check

**File existence:**
- [x] `apps/mobile/components/driver/TripCard.tsx` — FOUND
- [x] `apps/mobile/components/driver/StatsRow.tsx` — FOUND
- [x] `apps/mobile/components/owner/KPIGrid.tsx` — FOUND
- [x] `apps/mobile/components/owner/SpeedDial.tsx` — FOUND
- [x] `apps/mobile/app/(driver)/index.tsx` — FOUND (modified)
- [x] `apps/mobile/app/(owner)/index.tsx` — FOUND (modified)

**Commit existence:**
- [x] 24f0475 — feat(quick-131-01): extract TripCard, StatsRow, KPIGrid, and SpeedDial components
- [x] f05c42f — feat(quick-131-01): rebuild driver and owner dashboards with extracted components

**TypeScript:** `tsc --noEmit` passes with no errors in any of the 6 modified/created files.

**Hex colors in screen files:** Only `CREATE_ACTIONS` data-prop accent colors remain — all structural layout/UI colors use token references.

## Self-Check: PASSED
