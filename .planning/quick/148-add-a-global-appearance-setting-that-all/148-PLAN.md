---
phase: quick-148
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/tailwind.config.js
  - apps/mobile/global.css
  - apps/mobile/constants/tokens.ts
  - apps/mobile/components/useColorScheme.ts
  - apps/mobile/lib/appearance.ts
  - apps/mobile/app/_layout.tsx
  - apps/mobile/app/(owner)/more/settings/appearance.tsx
  - apps/mobile/app/(owner)/more/index.tsx
  - apps/mobile/components/shared/AppHeader.tsx
  - apps/mobile/components/ui/ScreenWrapper.tsx
  - apps/mobile/components/ui/Card.tsx
  - apps/mobile/app/(owner)/index.tsx
  - apps/mobile/app/(driver)/index.tsx
  - apps/mobile/app/(driver)/_layout.tsx
  - apps/mobile/app/(owner)/_layout.tsx
autonomous: true
must_haves:
  truths:
    - "User can navigate to Appearance settings and see Light / Dark / System options"
    - "Selecting a theme preference immediately changes the app's color scheme"
    - "Theme preference persists across app restarts via MMKV"
    - "System option follows the device's current light/dark setting"
  artifacts:
    - path: "apps/mobile/lib/appearance.ts"
      provides: "Theme persistence and initialization logic"
    - path: "apps/mobile/app/(owner)/more/settings/appearance.tsx"
      provides: "Appearance settings screen with 3 options"
    - path: "apps/mobile/tailwind.config.js"
      provides: "darkMode: 'class' config for NativeWind"
    - path: "apps/mobile/constants/tokens.ts"
      provides: "useThemeColors() hook returning light or dark palette"
  key_links:
    - from: "apps/mobile/lib/appearance.ts"
      to: "nativewind setColorScheme"
      via: "calls setColorScheme on init and preference change"
    - from: "apps/mobile/app/_layout.tsx"
      to: "apps/mobile/lib/appearance.ts"
      via: "calls initAppearance() before first render"
---

<objective>
Add a global appearance setting (Light / Dark / System) to the DriveCommand mobile app.

Purpose: Users can switch between light and dark themes, with the preference persisted across sessions. The app currently only has dark-mode hardcoded colors. This task sets up the NativeWind dark mode infrastructure, creates a reactive token system, builds the settings screen, and converts the most visible screens/components to be theme-aware.

Output: Working theme toggle with immediate visual feedback on key screens (dashboards, navigation, shared components). Screens not yet converted will retain dark styling (progressive migration).
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/tailwind.config.js
@apps/mobile/global.css
@apps/mobile/constants/tokens.ts
@apps/mobile/lib/storage.ts
@apps/mobile/components/useColorScheme.ts
@apps/mobile/app/_layout.tsx
@apps/mobile/app/(owner)/more/index.tsx
@apps/mobile/app/(owner)/more/settings/_layout.tsx
@apps/mobile/components/shared/AppHeader.tsx
@apps/mobile/components/ui/ScreenWrapper.tsx
@apps/mobile/components/ui/Card.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Theme infrastructure — NativeWind dark mode, dual token palettes, appearance persistence</name>
  <files>
    apps/mobile/tailwind.config.js
    apps/mobile/global.css
    apps/mobile/constants/tokens.ts
    apps/mobile/components/useColorScheme.ts
    apps/mobile/lib/appearance.ts
    apps/mobile/app/_layout.tsx
  </files>
  <action>
**1. Enable NativeWind dark mode in tailwind.config.js:**
- Add `darkMode: 'class'` to the config (NativeWind v4 uses this to toggle class-based dark mode).

**2. Add CSS custom properties to global.css for light/dark theming:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --color-bg: 255 255 255;
  --color-surface-card: 241 245 249;
  --color-surface-elevated: 226 232 240;
  --color-surface-input: 248 250 252;
  --color-border: 203 213 225;
  --color-border-light: 226 232 240;
  --color-text-primary: 15 23 42;
  --color-text-secondary: 100 116 139;
  --color-text-tertiary: 148 163 184;
  --color-tab-bar-bg: 255 255 255;
  --color-tab-bar-border: 226 232 240;
}

.dark {
  --color-bg: 15 23 42;
  --color-surface-card: 30 41 59;
  --color-surface-elevated: 36 48 70;
  --color-surface-input: 26 37 56;
  --color-border: 45 61 83;
  --color-border-light: 30 41 59;
  --color-text-primary: 241 245 249;
  --color-text-secondary: 148 163 184;
  --color-text-tertiary: 100 116 139;
  --color-tab-bar-bg: 12 21 36;
  --color-tab-bar-border: 30 41 59;
}
```
Then update `tailwind.config.js` theme.extend.colors to add semantic CSS variable aliases:
```js
bg: 'rgb(var(--color-bg) / <alpha-value>)',
'surface-card': 'rgb(var(--color-surface-card) / <alpha-value>)',
// etc.
```
This allows using `className="bg-bg"` or `bg-surface-card` which automatically switch with theme.

**3. Update constants/tokens.ts:**
- Keep existing `colors` object as-is (it's the dark palette, used by many inline StyleSheet files).
- Add a NEW `lightColors` object with light-mode equivalents:
  - `background: '#ffffff'`, `surfaceCard: '#f1f5f9'`, `surfaceElevated: '#e2e8f0'`, `surfaceInput: '#f8fafc'`
  - `border: '#cbd5e1'`, `borderLight: '#e2e8f0'`, `divider: '#e2e8f0'`
  - `textPrimary: '#0f172a'`, `textSecondary: '#64748b'`, `textTertiary: '#94a3b8'`, `textMuted: '#94a3b8'`, `textInverse: '#f1f5f9'`
  - `tabBarBg: Platform.select({ ios: 'rgba(255,255,255,0.95)', android: '#ffffff' })`, `tabBarBorder: '#e2e8f0'`, `tabActive: '#0ea5e9'`, `tabInactive: '#94a3b8'`
  - Keep brand/status colors identical (they work on both backgrounds).
- Export a `useThemeColors()` hook:
  ```ts
  import { useColorScheme } from 'nativewind';
  export function useThemeColors() {
    const { colorScheme } = useColorScheme();
    return colorScheme === 'dark' ? colors : lightColors;
  }
  ```

**4. Replace components/useColorScheme.ts:**
- Re-export NativeWind's `useColorScheme` from `nativewind` instead of React Native's:
  ```ts
  export { useColorScheme } from 'nativewind';
  ```
  This ensures any existing imports get the NativeWind version with `setColorScheme`.

**5. Create lib/appearance.ts — persistence layer:**
```ts
import { useColorScheme } from 'nativewind';
import { kvStorage } from './storage';

const APPEARANCE_KEY = 'appearance_preference';
export type AppearanceMode = 'light' | 'dark' | 'system';

/** Read saved preference from MMKV. Defaults to 'dark' (existing behavior). */
export function getSavedAppearance(): AppearanceMode {
  return (kvStorage.getString(APPEARANCE_KEY) as AppearanceMode) ?? 'dark';
}

/** Persist preference to MMKV. */
export function saveAppearance(mode: AppearanceMode) {
  kvStorage.setString(APPEARANCE_KEY, mode);
}

/** Call once at app startup to apply saved preference via NativeWind. */
export function initAppearance() {
  // NativeWind exports a module-level colorScheme object that can set before render
  const { colorScheme } = require('nativewind');
  const saved = getSavedAppearance();
  colorScheme.set(saved);
}
```
NOTE: NativeWind v4 exports a module-level `colorScheme` object from `nativewind` with a `.set()` method. Verify this works during implementation. If the module-level API is not available, use an alternative: call `setColorScheme()` from within a component's `useEffect` in `_layout.tsx` instead.

**6. Update app/_layout.tsx:**
- Import `initAppearance` from `../lib/appearance` and call it at the top level (outside any component, after imports) so the scheme is set before the first render.
- If module-level init doesn't work, add a `useEffect` in `RootLayout` that calls `setColorScheme(getSavedAppearance())` using NativeWind's hook.
- Update the `StatusBar` style to be dynamic: use `useColorScheme` from nativewind and set `style={colorScheme === 'dark' ? 'light' : 'dark'}`.
  </action>
  <verify>
- `npx tsc --noEmit` passes in apps/mobile
- App starts without crash on Android emulator
- Default appearance remains dark (backward-compatible)
- `useThemeColors()` returns dark palette by default
  </verify>
  <done>
- NativeWind dark mode infrastructure is configured (darkMode: 'class', CSS variables)
- Light and dark color palettes available via `useThemeColors()` hook
- Appearance preference read/written to MMKV via `lib/appearance.ts`
- Saved preference applied at app startup
- Existing dark-only screens unaffected (backward-compatible)
  </done>
</task>

<task type="auto">
  <name>Task 2: Appearance settings screen + convert key screens to theme-aware</name>
  <files>
    apps/mobile/app/(owner)/more/settings/appearance.tsx
    apps/mobile/app/(owner)/more/index.tsx
    apps/mobile/components/shared/AppHeader.tsx
    apps/mobile/components/ui/ScreenWrapper.tsx
    apps/mobile/components/ui/Card.tsx
    apps/mobile/app/(owner)/index.tsx
    apps/mobile/app/(driver)/index.tsx
    apps/mobile/app/(driver)/_layout.tsx
    apps/mobile/app/(owner)/_layout.tsx
  </files>
  <action>
**1. Create apps/mobile/app/(owner)/more/settings/appearance.tsx:**
- Build a settings screen matching existing settings screen style (see account.tsx for pattern).
- Header with back chevron + "Appearance" title.
- Three selectable rows: Light (Sun icon), Dark (Moon icon), System (Smartphone icon) — use `lucide-react-native` icons.
- Each row is a Pressable with radio-button style indicator (filled circle for selected, empty for unselected).
- On selection: call `saveAppearance(mode)` from `lib/appearance.ts`, then call `setColorScheme(mode)` from NativeWind's `useColorScheme()` hook.
- Show current selection with a brand-colored highlight (bg + border + checkmark).
- Below the options, show a footnote: "System follows your device's appearance setting."
- Use `useThemeColors()` for all colors in this screen so it immediately reflects the change.

**2. Add "Appearance" row to owner More screen (apps/mobile/app/(owner)/more/index.tsx):**
- Import `Palette` from `lucide-react-native`.
- Add a new row to the SETTINGS section (before Team Permissions):
  ```ts
  {
    label: 'Appearance',
    subtitle: 'Light, dark, or system theme',
    Icon: Palette,
    iconBg: 'rgba(14,165,233,0.15)',
    iconColor: '#0ea5e9',
    route: '/(owner)/more/settings/appearance',
  }
  ```

**3. Add Appearance toggle to driver portal:**
- The driver portal has NO "more" tab or settings screen. Add an appearance toggle option to the AppHeader profile popup modal.
- In `components/shared/AppHeader.tsx`, add a theme toggle row between the "Company" row and the "Sign Out" divider:
  - Show current theme icon (Sun/Moon/Smartphone) + label like "Appearance: Dark"
  - On press, cycle through: dark -> light -> system -> dark (simple tap-to-cycle, no separate screen needed for drivers).
  - Use `useColorScheme` from nativewind to get `setColorScheme`, and `saveAppearance` to persist.
  - Update AppHeader to use `useThemeColors()` for its own StyleSheet colors (convert from static `colors.X` to dynamic). Since StyleSheet.create is static, switch AppHeader to inline styles using the hook values, OR use a pattern like `const c = useThemeColors()` and build styles inside the component.

**4. Convert ScreenWrapper to theme-aware:**
- Replace `colors.background` with `useThemeColors().background`.
- Update `StatusBar style` from hardcoded `"light"` to `colorScheme === 'dark' ? 'light' : 'dark'`.
- Since ScreenWrapper uses StyleSheet.create (static), switch to `useMemo`-based styles or inline styles driven by `useThemeColors()`.

**5. Convert Card component to theme-aware:**
- Replace `colors.surfaceCard`, `colors.border`, `colors.surfaceElevated` with values from `useThemeColors()`.
- Same approach as ScreenWrapper — dynamic styles from hook.

**6. Convert owner dashboard (apps/mobile/app/(owner)/index.tsx) to theme-aware:**
- This is the first screen owners see. Replace hardcoded dark colors with `useThemeColors()` values for backgrounds, text, cards, and borders.
- The owner dashboard likely uses `SafeAreaView` with `backgroundColor: '#0f172a'` — change to `useThemeColors().background`.
- Update text colors from hardcoded `#f1f5f9` / `#94a3b8` to `useThemeColors().textPrimary` / `.textSecondary`.

**7. Convert driver dashboard (apps/mobile/app/(driver)/index.tsx) to theme-aware:**
- Same approach as owner dashboard — replace hardcoded hex values with `useThemeColors()` values.

**8. Convert tab bar styling in both portal layouts:**
- In `apps/mobile/app/(driver)/_layout.tsx`: The tab bar uses `colors.tabBarBg`, `colors.tabBarBorder`, etc. from tokens. These are already imported. Change the import to use `useThemeColors()` instead of the static `colors` import for tab bar styling. Note: `tabBarStyle` in Tabs screenOptions may need to be set dynamically — wrap in useMemo or pass inline.
- In `apps/mobile/app/(owner)/_layout.tsx`: Same treatment for the owner tab bar.
  </action>
  <verify>
- `npx tsc --noEmit` passes in apps/mobile
- App starts on Android emulator in dark mode (default)
- Navigate to Owner > More > Settings > Appearance
- Select "Light" — background changes to white/light-gray on dashboard, tab bar, cards, and header
- Select "Dark" — reverts to original dark styling
- Select "System" — follows Android emulator system setting
- Kill and restart app — preference is preserved
- In driver portal, tap avatar > profile popup shows appearance toggle, tap cycles themes
- Both dashboards, tab bars, AppHeader, Card, and ScreenWrapper respond to theme changes
  </verify>
  <done>
- Appearance settings screen exists at (owner)/more/settings/appearance with Light/Dark/System options
- "Appearance" row visible in owner More screen under SETTINGS section
- Driver portal has appearance cycling in AppHeader profile popup
- Owner dashboard, driver dashboard, tab bars, AppHeader, ScreenWrapper, and Card all respond to theme changes
- Theme preference persists across app restarts
- Screens not yet converted (invoices, CRM, compliance, etc.) still render in dark — no regressions
  </done>
</task>

</tasks>

<verification>
1. App builds and runs: `cd apps/mobile && npx expo start` — no errors
2. TypeScript clean: `npx tsc --noEmit` — no errors
3. Default behavior unchanged: Fresh install defaults to dark mode
4. Light mode works: Switch to Light — dashboards, nav bars, headers show light colors
5. System mode works: Switch to System, change Android system theme — app follows
6. Persistence works: Set to Light, kill app, relaunch — still Light
7. No regressions: Navigate through unconverted screens (invoices, CRM, compliance) — they still render correctly in dark styling regardless of theme setting
</verification>

<success_criteria>
- Appearance setting accessible from both owner (settings screen) and driver (header toggle) portals
- Three modes work correctly: Light, Dark, System
- Preference persists via MMKV across app restarts
- Key screens visually respond to theme change: both dashboards, tab bars, app header, cards, screen wrappers
- No crashes, no TypeScript errors, backward-compatible with unconverted screens
</success_criteria>

<output>
After completion, create `.planning/quick/148-add-a-global-appearance-setting-that-all/148-SUMMARY.md`
</output>
