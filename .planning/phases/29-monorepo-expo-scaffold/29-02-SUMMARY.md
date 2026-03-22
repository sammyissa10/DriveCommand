---
phase: 29-monorepo-expo-scaffold
plan: "02"
subsystem: infra
tags: [expo, react-native, nativewind, tailwindcss, eas, expo-router, poppins, mobile]

# Dependency graph
requires:
  - phase: 29-monorepo-expo-scaffold
    plan: "01"
    provides: Turborepo monorepo, apps/mobile/ directory, shared packages stubs
provides:
  - Expo SDK 55 app scaffold in apps/mobile/
  - Expo Router v4 file-based routing with (driver)/ and (owner)/ route groups
  - NativeWind v4 configured with tailwind.config.js, metro.config.js, global.css
  - EAS build profiles (development/preview/production) in eas.json
  - Poppins-SemiBold font loaded via @expo-google-fonts/poppins
  - app.json with DriveCommand bundle IDs, permissions, iOS/Android config
  - Workspace dep links to @drivecommand/types, validation, api-client
affects:
  - Phase 30 (auth screens use this scaffold)
  - Phase 31 (driver tab navigator extends (driver)/_layout.tsx)
  - Phase 35 (owner tab navigator extends (owner)/_layout.tsx)
  - Phase 38 (EAS build uses eas.json profiles)

# Tech tracking
tech-stack:
  added:
    - expo@~55.0.8 (Expo SDK 55)
    - expo-router@~55.0.7 (file-based routing)
    - nativewind@^4.2.3 (Tailwind for React Native)
    - tailwindcss@^3.4.19
    - @expo-google-fonts/poppins@^0.4.1
    - expo-location@~55.1.4
    - expo-camera@~55.0.10
    - expo-notifications@~55.0.13
    - expo-document-picker@~55.0.9
    - expo-file-system@~55.0.11
    - expo-image-picker@~55.0.13
    - expo-local-authentication@~55.0.9
    - expo-haptics@~55.0.9
    - expo-image@~55.0.6
    - react-native-maps@1.27.2
    - react-native-map-clustering@^4.0.0
    - react-native-mmkv@^4.3.0
    - @react-native-community/netinfo@11.5.2
  patterns:
    - NativeWind className on View/Text — enabled via nativewind-env.d.ts reference
    - Expo Router file-based routing with (driver)/ and (owner)/ route groups
    - SafeAreaProvider wrapping root Stack navigator
    - Font loading pattern with useFonts + SplashScreen.preventAutoHideAsync()
    - EAS build profiles: development (internal dist), preview, production (autoIncrement)

key-files:
  created:
    - apps/mobile/app.json
    - apps/mobile/app/_layout.tsx
    - apps/mobile/app/index.tsx
    - apps/mobile/app/login.tsx
    - apps/mobile/app/(driver)/_layout.tsx
    - apps/mobile/app/(owner)/_layout.tsx
    - apps/mobile/tailwind.config.js
    - apps/mobile/metro.config.js
    - apps/mobile/global.css
    - apps/mobile/nativewind-env.d.ts
    - apps/mobile/eas.json
    - apps/mobile/package.json (renamed to @drivecommand/mobile)
  modified:
    - .gitignore (added mobile-specific ignores)

key-decisions:
  - "Used Expo SDK 55 (latest, shipped with React Native 0.83.2 and React 19)"
  - "Kept template android icon structure (foreground/background/monochrome) rather than single adaptive-icon"
  - "Added nativewind-env.d.ts type reference file — required for className prop TypeScript support"
  - "Notification icon uses logo-192.png as placeholder — replace with proper icon before Phase 38"

patterns-established:
  - "NativeWind v4 setup: tailwind.config.js with nativewind/preset + metro.config.js with withNativeWind + global.css @tailwind directives + nativewind-env.d.ts type reference"
  - "Route groups: (driver)/ and (owner)/ as placeholder Stack navigators, converted to Tabs in Phases 31/35"

# Metrics
duration: 6min
completed: 2026-03-22
---

# Phase 29 Plan 02: Expo App Scaffold + NativeWind + EAS Config Summary

**Expo SDK 55 app in apps/mobile/ with NativeWind v4, Expo Router v4 route groups for driver/owner portals, Poppins font, and EAS build profiles ready for Phase 30 auth screens**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-03-22T22:31:09Z
- **Completed:** 2026-03-22T22:37:14Z
- **Tasks:** 10
- **Files modified:** 33

## Accomplishments
- Created full Expo SDK 55 app scaffold with all required native modules (location, camera, notifications, biometrics, maps, MMKV, etc.)
- Configured NativeWind v4 with tailwind config matching web app design tokens (brand/surface color palette)
- Built clean app structure replacing tabs template: root layout with Poppins font + SafeAreaProvider, login placeholder, (driver)/ and (owner)/ route groups
- Created EAS build profiles for development/preview/production with DriveCommand bundle IDs

## Task Commits

1. **Tasks 1-10: Full scaffold** - `737bd89` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/mobile/app.json` — DriveCommand config: bundle IDs, permissions, iOS background modes, Android adaptive icon
- `apps/mobile/app/_layout.tsx` — Root layout: SafeAreaProvider, Poppins font loading, SplashScreen control, global.css import
- `apps/mobile/app/index.tsx` — Entry redirect to /login
- `apps/mobile/app/login.tsx` — Placeholder login screen with NativeWind className
- `apps/mobile/app/(driver)/_layout.tsx` — Placeholder Stack for driver portal (Phase 31 converts to Tabs)
- `apps/mobile/app/(owner)/_layout.tsx` — Placeholder Stack for owner portal (Phase 35 converts to Tabs)
- `apps/mobile/tailwind.config.js` — NativeWind preset, brand/surface design tokens, Poppins heading font
- `apps/mobile/metro.config.js` — withNativeWind wrapper pointing to global.css
- `apps/mobile/global.css` — Tailwind base/components/utilities directives
- `apps/mobile/nativewind-env.d.ts` — NativeWind v4 type reference for className prop support
- `apps/mobile/eas.json` — EAS build profiles: dev (internal), preview, production (autoIncrement)
- `apps/mobile/package.json` — Renamed to @drivecommand/mobile, workspace deps, EAS scripts
- `.gitignore` — Added apps/mobile/node_modules, .expo, android, ios, dist ignores

## Decisions Made
- Used Expo SDK 55 (latest stable, created by create-expo-app — includes React 19 and RN 0.83.2)
- Kept template's android icon structure (foreground/background/monochrome) rather than plan's single `adaptive-icon.png` — the template generates more complete adaptive icon assets
- Notification icon uses `logo-192.png` placeholder — needs proper 96x96 PNG before Phase 38 EAS build
- Added `nativewind-env.d.ts` — required for TypeScript to accept `className` prop on View/Text (NativeWind v4 type augmentation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added nativewind-env.d.ts type declaration**
- **Found during:** Task 4 (NativeWind install) / TypeScript verification
- **Issue:** NativeWind v4 requires a `/// <reference types="nativewind/types" />` declaration file for TypeScript to accept `className` prop. Without it, `npx tsc --noEmit` fails with "Property 'className' does not exist" on View/Text.
- **Fix:** Created `nativewind-env.d.ts` and added it to tsconfig.json `include` array
- **Files modified:** apps/mobile/nativewind-env.d.ts, apps/mobile/tsconfig.json
- **Verification:** `npx tsc --noEmit` passes with zero errors after fix
- **Committed in:** 737bd89 (scaffold commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical)
**Impact on plan:** Fix required for TypeScript correctness. No scope creep.

## Issues Encountered
- `expo config --type introspect` produces a warning: "Install expo-system-ui to enable userInterfaceStyle" — informational only, does not affect functionality. Can add expo-system-ui in a later phase if needed.

## User Setup Required
None — EAS credentials (Apple ID, team ID, App Store Connect ID, Google Play key) are placeholder values in eas.json. These are filled in during Phase 38 when preparing for store submission.

## Next Phase Readiness
- apps/mobile/ scaffold is complete and TypeScript-clean
- Phase 30 can start immediately: implement login/auth screens using existing login.tsx placeholder and root _layout.tsx pattern
- EAS profiles ready; actual EAS account link (eas login + eas build:configure) done in Phase 38
- Replace notification-icon.png placeholder with proper 96x96 PNG before Phase 38

---
*Phase: 29-monorepo-expo-scaffold*
*Completed: 2026-03-22*
