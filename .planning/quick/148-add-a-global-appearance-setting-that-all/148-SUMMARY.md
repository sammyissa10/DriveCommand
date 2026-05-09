---
phase: quick-148
plan: "01"
subsystem: mobile-app
tags: [theme, dark-mode, appearance, nativewind, mmkv, settings]
dependency_graph:
  requires: [nativewind, react-native-mmkv, lucide-react-native]
  provides: [useThemeColors hook, appearance persistence, Light/Dark/System toggle]
  affects: [all theme-aware screens and components]
tech_stack:
  added: [CSS custom properties (global.css), NativeWind darkMode class]
  patterns: [useThemeColors hook for reactive color palettes, module-level colorScheme.set() for startup init]
key_files:
  created:
    - apps/mobile/lib/appearance.ts
    - apps/mobile/app/(owner)/more/settings/appearance.tsx
  modified:
    - apps/mobile/tailwind.config.js
    - apps/mobile/global.css
    - apps/mobile/constants/tokens.ts
    - apps/mobile/components/useColorScheme.ts
    - apps/mobile/app/_layout.tsx
    - apps/mobile/app/(owner)/more/index.tsx
    - apps/mobile/components/shared/AppHeader.tsx
    - apps/mobile/components/ui/ScreenWrapper.tsx
    - apps/mobile/components/ui/Card.tsx
    - apps/mobile/app/(owner)/index.tsx
    - apps/mobile/app/(driver)/index.tsx
    - apps/mobile/app/(driver)/_layout.tsx
    - apps/mobile/app/(owner)/_layout.tsx
decisions:
  - "Used NativeWind module-level colorScheme.set() for startup initialization instead of useEffect — avoids theme flash on cold start"
  - "Kept original colors const as dark palette for backward-compat; added lightColors and useThemeColors() hook on top"
  - "AppHeader uses tap-to-cycle (dark→light→system) for drivers instead of a separate screen — drivers have no More/Settings tab"
  - "StyleSheet.create() entries with color references stripped to layout-only; colors applied via inline style overrides — avoids styled component migration"
  - "GPSStatusDot and unread badge use hardcoded hex values (brand/danger colors that don't change between themes) to avoid prop-drilling useThemeColors into helper components"
metrics:
  duration_seconds: 528
  completed_date: "2026-04-03"
  tasks_completed: 2
  files_modified: 13
---

# Phase quick-148 Plan 01: Appearance Setting Summary

Global Light/Dark/System theme toggle via NativeWind class-based dark mode with MMKV persistence, reactive useThemeColors() hook, and coverage across both portal dashboards, tab bars, AppHeader, Card, and ScreenWrapper.

## What Was Built

### Task 1: Theme Infrastructure
- `tailwind.config.js` — Added `darkMode: 'class'` and semantic CSS variable color aliases (`bg-bg`, `bg-surface-card`, etc.)
- `global.css` — Added `:root` (light) and `.dark` CSS custom property blocks for all semantic surface/text/tab bar colors
- `constants/tokens.ts` — Added `lightColors` palette and `useThemeColors()` hook (returns dark or light palette based on NativeWind colorScheme)
- `components/useColorScheme.ts` — Re-exported from `nativewind` so existing imports get the reactive version with `setColorScheme`
- `lib/appearance.ts` — MMKV persistence layer: `getSavedAppearance()`, `saveAppearance(mode)`, `initAppearance()`
- `app/_layout.tsx` — Calls `initAppearance()` at module level before first render to apply saved preference

### Task 2: Settings Screen + Theme-Aware Screens
- `app/(owner)/more/settings/appearance.tsx` — New screen with Sun/Moon/Smartphone option rows, animated selection indicator, checkmark
- `app/(owner)/more/index.tsx` — Added Appearance row (Palette icon, brand color) to SETTINGS section
- `components/shared/AppHeader.tsx` — Fully rewritten with `useThemeColors()`; added appearance cycle toggle (dark→light→system) in profile popup modal
- `components/ui/ScreenWrapper.tsx` — Dynamic background and StatusBar style via `useThemeColors()` + `useColorScheme()`
- `components/ui/Card.tsx` — Dynamic surface/border colors via `useThemeColors()`
- `app/(owner)/index.tsx` — Owner dashboard colors wired via `c = useThemeColors()` inline style overrides
- `app/(driver)/index.tsx` — Driver dashboard colors wired via `c = useThemeColors()` inline style overrides
- `app/(driver)/_layout.tsx` — Tab bar backgroundColor, borderColor, tintColor wired to `c.tabBarBg`, etc.
- `app/(owner)/_layout.tsx` — Same treatment for owner tab bar

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `colors` reference remaining in driver layout `tabBarActiveLabelStyle`**
- **Found during:** Task 2 TypeScript check
- **Issue:** After replacing `colors` import with `useThemeColors`, one `colors.tabActive` reference was missed in the `tabBarActiveLabelStyle` block
- **Fix:** Changed to `c.tabActive`
- **Files modified:** `apps/mobile/app/(driver)/_layout.tsx`
- **Commit:** 71110a6

**2. [Rule 2 - Missing functionality] GPSStatusDot and unread badge used deleted `colors` import**
- **Found during:** Task 2 implementation
- **Issue:** These module-level helper components referenced `colors.X` directly which would break after removing the import
- **Fix:** Replaced with hardcoded hex values for status colors (brand/danger/success don't change between themes)
- **Files modified:** `apps/mobile/app/(driver)/_layout.tsx`
- **Commit:** 71110a6

## Self-Check: PASSED

All key files exist on disk. Both commits (8774449, 71110a6) verified in git log.
