---
phase: 37-polish-performance
plan: "04"
subsystem: ui
tags: [nativewind, react-native, mobile, tailwind, className, Pressable]

requires:
  - phase: 37-polish-performance
    provides: "Plan 03 — tap target, font, and button color polish that set baseline for secondary screens"

provides:
  - "NativeWind className migration for login.tsx, more/index.tsx, crm, trucks, compliance, payroll, invoices screens"
  - "TouchableOpacity replaced with Pressable + active:opacity-75 in all migrated files"
  - "Dynamic runtime colors (hex+alpha, STATUS_COLORS lookups) kept as style props per convention"

affects: [37-05-skeletons, dark-mode-support]

tech-stack:
  added: []
  patterns:
    - "Dynamic hex+alpha colors (e.g. statusColor+'22', '#f59e0b40') kept as style prop — cannot express in NativeWind"
    - "shadow* props kept as style prop — no Tailwind equivalent in React Native"
    - "contentContainerStyle stays inline — NativeWind className does not apply to contentContainerStyle"
    - "Custom font families (Poppins-ExtraBold) kept as style prop — className applies font-family via font utilities but custom fonts require style prop"
    - "TouchableOpacity replaced with Pressable + active:opacity-75 or active:opacity-80"

key-files:
  created: []
  modified:
    - apps/mobile/app/login.tsx
    - apps/mobile/app/(owner)/more/index.tsx
    - apps/mobile/app/(owner)/more/crm.tsx
    - apps/mobile/app/(owner)/more/trucks.tsx
    - apps/mobile/app/(owner)/more/compliance.tsx
    - apps/mobile/app/(owner)/more/payroll.tsx
    - apps/mobile/app/(owner)/more/invoices/index.tsx

key-decisions:
  - "map.tsx already had AnimatedScreen wrap — no change needed (plan anticipated adding it, was already present)"
  - "Dynamic hex+alpha colors cannot be expressed in NativeWind; kept as style props per plan spec"
  - "contentContainerStyle left as inline style object — NativeWind v4 does not apply className to contentContainerStyle prop"

patterns-established:
  - "Static spacing/color/layout -> className; runtime computed colors -> style prop"
  - "All SafeAreaView, header bar, loading/error states, and card layout now use className pattern"

duration: 5min
completed: 2026-03-27
---

# Phase 37 Plan 04: StyleSheet-to-NativeWind Migration Summary

**Migrated 7 owner/shared screens from StyleSheet.create to NativeWind className, unlocking dark: variant support and removing ~200 lines of hardcoded hex color values**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-27T23:03:57Z
- **Completed:** 2026-03-27T23:08:12Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments

- login.tsx fully migrated from StyleSheet to className; TouchableOpacity replaced with Pressable
- more/index.tsx fully migrated; all row TouchableOpacity replaced with Pressable + active:opacity-75
- crm, trucks, compliance, payroll, invoices/index migrated — static layout in className, dynamic runtime colors (hex+alpha) kept as style props per plan spec
- Zero TypeScript errors introduced in any migrated file
- map.tsx already had AnimatedScreen wrap — confirmed, no change needed

## Task Commits

Each task was committed atomically:

1. **Task 1: Migrate login.tsx from StyleSheet to NativeWind className** - `7350c90` (feat)
2. **Task 2: Migrate more/index.tsx StyleSheet to NativeWind className** - `2be24a8` (feat)
3. **Task 3: Migrate crm, trucks, compliance, payroll, invoices + map.tsx AnimatedScreen** - `9d66ce1` (feat)

## Files Created/Modified

- `apps/mobile/app/login.tsx` - Full StyleSheet replaced with NativeWind className; TouchableOpacity to Pressable
- `apps/mobile/app/(owner)/more/index.tsx` - Full StyleSheet replaced; TouchableOpacity to Pressable
- `apps/mobile/app/(owner)/more/crm.tsx` - Inline style card/row layout replaced with className; dynamic borderColor/badge colors kept as style props
- `apps/mobile/app/(owner)/more/trucks.tsx` - STATUS_COLORS bg/text kept as style prop; static layout uses className
- `apps/mobile/app/(owner)/more/compliance.tsx` - Dynamic statusBg/statusColor kept as style prop; indicator dot/chip layout uses className
- `apps/mobile/app/(owner)/more/payroll.tsx` - Dynamic statusColor+'22' badge kept as style prop; card layout uses className
- `apps/mobile/app/(owner)/more/invoices/index.tsx` - TouchableOpacity replaced with Pressable throughout; inline styles migrated to className

## Decisions Made

- map.tsx already had AnimatedScreen in place — the plan anticipated adding it but it was pre-existing. No change made.
- Dynamic hex+alpha colors (e.g. `statusColor + '22'`, `'#f59e0b40'`) cannot be expressed in NativeWind at runtime; kept as style props as specified in the plan.
- `contentContainerStyle` stays as inline style object — NativeWind className does not apply to this ScrollView prop.

## Deviations from Plan

None — plan executed exactly as written. The only note: map.tsx had AnimatedScreen already present, so that sub-task was a no-op verification rather than an addition.

## Issues Encountered

None. Pre-existing TypeScript errors (FlashList typing issues in unrelated files) were present before and after; no new errors introduced.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All 7 screens now use NativeWind className, ready for dark: variant additions in Phase 37 Plan 05+
- Loading states (ActivityIndicator) in these screens are next to be replaced by skeleton loaders (Plan 05)
- All TouchableOpacity removed from migrated files; Pressable pattern established for all interactive elements

---
*Phase: 37-polish-performance*
*Completed: 2026-03-27*
