---
phase: quick-130
plan: "01"
subsystem: mobile-ui
tags: [mobile, design-tokens, native-ux, typography, platform-adaptive]
dependency_graph:
  requires: []
  provides:
    - constants/tokens.ts design token system
    - ListRow primitive
    - SectionHeader primitive
  affects:
    - all screens using Card, Typography, Button, Input, Badge, BottomSheet, ScreenWrapper, AppHeader
    - driver and owner tab bar layouts
tech_stack:
  added: []
  patterns:
    - "Platform.select for per-platform values (iOS HIG / Material Design)"
    - "StyleSheet.create for shadow support (NativeWind cannot do iOS shadowOpacity/shadowRadius)"
    - "Typed record maps instead of dynamic key indexing for TypeScript compatibility"
key_files:
  created:
    - apps/mobile/constants/tokens.ts
    - apps/mobile/components/ui/ListRow.tsx
    - apps/mobile/components/ui/SectionHeader.tsx
  modified:
    - apps/mobile/components/ui/Card.tsx
    - apps/mobile/components/ui/Typography.tsx
    - apps/mobile/components/ui/Input.tsx
    - apps/mobile/components/ui/Button.tsx
    - apps/mobile/components/ui/Badge.tsx
    - apps/mobile/components/ui/BottomSheet.tsx
    - apps/mobile/components/ui/ScreenWrapper.tsx
    - apps/mobile/components/shared/AppHeader.tsx
    - apps/mobile/app/(driver)/_layout.tsx
    - apps/mobile/app/(owner)/_layout.tsx
    - apps/mobile/tailwind.config.js
decisions:
  - "StyleSheet.create used instead of NativeWind for components needing iOS shadows (Card, Button) — NativeWind cannot apply shadowOpacity/shadowRadius reliably"
  - "Dynamic record key lookups (styles['variant_primary']) replaced with explicit typed Record<string, ViewStyle> maps in Button and Badge — avoids TypeScript 'no overload matches' errors"
  - "ScreenWrapper always uses dark background (colors.background) — app is dark-only, removed useColorScheme conditional"
  - "tabBarActiveBackgroundColor removed from owner layout — non-native convention; iOS uses tint color only, Android uses ripple"
metrics:
  duration: "6 minutes"
  completed: "2026-03-30"
  tasks_completed: 2
  files_changed: 13
---

# Quick Task 130: Native Mobile UI Foundation Summary

**One-liner:** Design token system with platform-adaptive shadows, native typography scales, and new ListRow/SectionHeader primitives replacing web-ported flat UI.

## What Was Built

### Task 1: Design Token System + Shared UI Components

**`constants/tokens.ts`** — single source of truth for the app's visual language:
- `colors`: 30 semantic color values (surfaces, brand, text, status, tab bar)
- `typography`: 11-level native text scale (iOS HIG largeTitle through caption2, platform-branched body/callout sizes)
- `shadows`: Platform-adaptive shadow objects (iOS `shadowColor/Offset/Opacity/Radius`, Android `elevation`)
- `radii`, `spacing`, `tabBar`, `listRow`: all pixel-precise platform values

**Updated UI components** (8 files, all backward-compatible):

| Component | Key change |
|-----------|------------|
| Card | Real iOS shadows + Android elevation; `elevated` prop for higher-prominence cards |
| Typography | Native type scale (17sp body iOS, 16sp Android); system font for body variants; H1-H3 keep Poppins-SemiBold; new `Footnote` and `Callout` exports |
| Input | Token colors, `clearButtonMode="while-editing"` on iOS via Platform.select |
| Button | StyleSheet-based with typed variant/size record maps; token colors |
| Badge | Pill badges with semantic token backgrounds (successBg, warningBg, etc.) |
| BottomSheet | `colors.surfaceCard`, `colors.border`, `radii.xl` for top corners |
| ScreenWrapper | Always-dark `colors.background`, removed light mode branch |
| AppHeader | All 15+ hardcoded hex values replaced with token references |

**`tailwind.config.js`** updated to align with token values and add `textPrimary`, `textSecondary`, `textTertiary` color keys so NativeWind className usage on existing screens picks up the same palette.

### Task 2: List Primitives + Native Tab Bars

**`ListRow`** component:
- 44pt min height (iOS) / 48dp (Android) from `listRow.minHeight`
- Automatic chevron disclosure when `onPress` provided (`ChevronRight` from lucide)
- Hairline dividers inset 16pt from left (iOS Settings-style)
- `android_ripple` for native tap feedback; `active:opacity-80` on iOS
- Slots: `leading` (icon/avatar), `trailing` (custom content)

**`SectionHeader`** component:
- iOS: uppercase title, `typography.footnote`, `colors.textTertiary`
- Android: sentence case, `typography.caption1`, `fontWeight: '500'`, `colors.textSecondary`
- Optional right-aligned action link in `colors.brand`

**Driver layout** tab bar:
- `colors.tabBarBg` (translucent on iOS, opaque dark on Android)
- `tabBar.height` (83pt iOS including safe area, 56dp Android)
- `tabBar.iconSize` (28pt iOS, 24dp Android)
- `tabBar.labelSize` (10pt iOS, 12sp Android)
- `shadows.tabBar` for proper elevation
- GPSStatusDot: `colors.success`, `colors.danger`, `colors.textSecondary`
- Unread badge: `colors.danger`, `colors.textPrimary`

**Owner layout** tab bar: same token migration, removed non-native `tabBarActiveBackgroundColor` highlight.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Duplicate `tabBarLabelStyle` key in driver layout**
- **Found during:** Task 2
- **Issue:** My edit to add the new tab bar options resulted in a duplicate `tabBarLabelStyle` key in the screenOptions object (one from the original, one from the replacement block)
- **Fix:** Removed the old key, kept the new token-driven version
- **Files modified:** `apps/mobile/app/(driver)/_layout.tsx`

**2. [Rule 1 - Bug] Dynamic StyleSheet key indexing caused TypeScript errors in Button and Badge**
- **Found during:** Task 1 TypeScript verification
- **Issue:** Using `styles[\`variant_${variant}\`]` as array element in Pressable style prop caused "no overload matches" TS2769 and TS2322 errors because TypeScript couldn't narrow the union type to match `ViewStyle`
- **Fix:** Replaced dynamic indexing with explicit `Record<string, ViewStyle>` and `Record<string, TextStyle>` maps defined outside StyleSheet (these hold plain objects, not StyleSheet IDs)
- **Files modified:** `apps/mobile/components/ui/Button.tsx`, `apps/mobile/components/ui/Badge.tsx`

**3. [Rule 1 - Bug] `StyleSheet` incorrectly imported from `expo-router` in owner layout**
- **Found during:** Task 2 owner layout edit
- **Issue:** Initial import edit placed `StyleSheet` in the `expo-router` import instead of `react-native`
- **Fix:** Moved to correct `react-native` import
- **Files modified:** `apps/mobile/app/(owner)/_layout.tsx`

## Verification Results

1. `npx tsc --noEmit` — zero errors in all modified files (pre-existing FlashList and ExternalLink errors unchanged)
2. No hardcoded hex colors in `components/ui/` or `components/shared/AppHeader.tsx`
3. New files confirmed: `constants/tokens.ts`, `components/ui/ListRow.tsx`, `components/ui/SectionHeader.tsx`
4. No hardcoded colors in driver or owner layout files
5. All existing prop interfaces preserved (Card `className`, Typography `className`/`style`, Button `variant`/`size`, etc.)

## Commits

| Hash | Message |
|------|---------|
| `7e03dc9` | feat(quick-130): add design token system and update all shared UI components |
| `214204f` | feat(quick-130): add ListRow/SectionHeader primitives and update tab bar layouts |

## Self-Check: PASSED
