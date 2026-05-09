---
phase: quick-130
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/constants/tokens.ts
  - apps/mobile/components/ui/Card.tsx
  - apps/mobile/components/ui/Typography.tsx
  - apps/mobile/components/ui/Input.tsx
  - apps/mobile/components/ui/Button.tsx
  - apps/mobile/components/ui/Badge.tsx
  - apps/mobile/components/ui/BottomSheet.tsx
  - apps/mobile/components/ui/ScreenWrapper.tsx
  - apps/mobile/components/ui/ListRow.tsx
  - apps/mobile/components/ui/SectionHeader.tsx
  - apps/mobile/components/shared/AppHeader.tsx
  - apps/mobile/app/(driver)/_layout.tsx
  - apps/mobile/app/(owner)/_layout.tsx
  - apps/mobile/tailwind.config.js
autonomous: true
must_haves:
  truths:
    - "All shared UI components use design tokens instead of hardcoded hex colors"
    - "Cards have platform-adaptive shadows (iOS shadow, Android elevation)"
    - "Tab bars use proper native heights and translucent background on iOS"
    - "Typography scale matches iOS HIG / Material Design body sizes"
    - "New ListRow and SectionHeader components exist for native list patterns"
  artifacts:
    - path: "apps/mobile/constants/tokens.ts"
      provides: "Design token system with colors, spacing, radii, shadows per platform"
    - path: "apps/mobile/components/ui/ListRow.tsx"
      provides: "Native list row with 44pt min height, chevron, divider"
    - path: "apps/mobile/components/ui/SectionHeader.tsx"
      provides: "Native section header (uppercase, gray, proper sizing)"
    - path: "apps/mobile/components/ui/Card.tsx"
      provides: "Platform-adaptive card with iOS shadows and Android elevation"
  key_links:
    - from: "apps/mobile/constants/tokens.ts"
      to: "all UI components"
      via: "import { tokens } from '../../constants/tokens'"
      pattern: "import.*tokens.*from.*constants/tokens"
---

<objective>
Make the DriveCommand mobile app feel native by replacing the web-like UI foundation with platform-adaptive design tokens, native typography scales, proper card shadows, native tab bars, and new list row / section header primitives.

Purpose: The app currently looks like a web app ported to mobile -- flat dark cards, hardcoded hex colors, web-scale typography, and a generic tab bar. These foundational changes propagate automatically to all 47 screens.

Output: Updated shared UI components + new design token system + new ListRow/SectionHeader primitives.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/constants/Colors.ts
@apps/mobile/components/ui/Card.tsx
@apps/mobile/components/ui/Typography.tsx
@apps/mobile/components/ui/Button.tsx
@apps/mobile/components/ui/Input.tsx
@apps/mobile/components/ui/Badge.tsx
@apps/mobile/components/ui/BottomSheet.tsx
@apps/mobile/components/ui/ScreenWrapper.tsx
@apps/mobile/components/shared/AppHeader.tsx
@apps/mobile/app/(driver)/_layout.tsx
@apps/mobile/app/(owner)/_layout.tsx
@apps/mobile/tailwind.config.js
@apps/mobile/components/driver/LoadCard.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create design token system and update all shared UI components</name>
  <files>
    apps/mobile/constants/tokens.ts
    apps/mobile/components/ui/Card.tsx
    apps/mobile/components/ui/Typography.tsx
    apps/mobile/components/ui/Input.tsx
    apps/mobile/components/ui/Button.tsx
    apps/mobile/components/ui/Badge.tsx
    apps/mobile/components/ui/BottomSheet.tsx
    apps/mobile/components/ui/ScreenWrapper.tsx
    apps/mobile/components/shared/AppHeader.tsx
    apps/mobile/tailwind.config.js
  </files>
  <action>
    **1. Create `apps/mobile/constants/tokens.ts`** -- the single source of truth for the native design language:

    ```ts
    import { Platform } from 'react-native'

    export const colors = {
      // Surfaces
      background: '#0f172a',
      surfaceCard: '#1e293b',
      surfaceElevated: '#243046',
      surfaceInput: '#1a2538',
      border: '#2d3d53',
      borderLight: '#1e293b',
      divider: '#1e2d42',

      // Brand
      brand: '#0ea5e9',
      brandLight: '#38bdf8',
      brandDark: '#0284c7',
      brandSubtle: '#0c4a6e',

      // Text
      textPrimary: '#f1f5f9',
      textSecondary: '#94a3b8',
      textTertiary: '#64748b',
      textMuted: '#475569',
      textInverse: '#0f172a',

      // Status
      success: '#22c55e',
      successBg: 'rgba(34,197,94,0.12)',
      warning: '#f59e0b',
      warningBg: 'rgba(245,158,11,0.12)',
      danger: '#ef4444',
      dangerBg: 'rgba(239,68,68,0.12)',
      info: '#3b82f6',
      infoBg: 'rgba(59,130,246,0.12)',
      mutedBg: 'rgba(100,116,139,0.12)',

      // Tab bar
      tabBarBg: Platform.select({ ios: 'rgba(15,23,42,0.85)', android: '#0c1524' })!,
      tabBarBorder: '#1e293b',
      tabActive: '#0ea5e9',
      tabInactive: '#4a5e78',
    } as const

    export const radii = {
      sm: Platform.select({ ios: 8, android: 8 })!,
      md: Platform.select({ ios: 12, android: 12 })!,
      lg: Platform.select({ ios: 16, android: 16 })!,
      xl: Platform.select({ ios: 20, android: 20 })!,
      full: 9999,
    } as const

    export const spacing = {
      xs: 4,
      sm: 8,
      md: 12,
      lg: 16,
      xl: 20,
      xxl: 24,
    } as const

    // iOS HIG / Material Design native text scales
    export const typography = {
      largeTitle: { fontSize: 34, lineHeight: 41, fontWeight: '700' as const },
      title1:    { fontSize: 28, lineHeight: 34, fontWeight: '700' as const },
      title2:    { fontSize: 22, lineHeight: 28, fontWeight: '700' as const },
      title3:    { fontSize: 20, lineHeight: 25, fontWeight: '600' as const },
      headline:  { fontSize: 17, lineHeight: 22, fontWeight: '600' as const },
      body:      { fontSize: Platform.select({ ios: 17, android: 16 })!, lineHeight: Platform.select({ ios: 22, android: 24 })!, fontWeight: '400' as const },
      callout:   { fontSize: 16, lineHeight: 21, fontWeight: '400' as const },
      subhead:   { fontSize: 15, lineHeight: 20, fontWeight: '400' as const },
      footnote:  { fontSize: 13, lineHeight: 18, fontWeight: '400' as const },
      caption1:  { fontSize: 12, lineHeight: 16, fontWeight: '400' as const },
      caption2:  { fontSize: 11, lineHeight: 13, fontWeight: '400' as const },
    } as const

    // Platform-adaptive card shadows
    export const shadows = {
      card: Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
        },
        android: {
          elevation: 3,
        },
      })!,
      cardElevated: Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.2,
          shadowRadius: 12,
        },
        android: {
          elevation: 6,
        },
      })!,
      tabBar: Platform.select({
        ios: {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -1 },
          shadowOpacity: 0.15,
          shadowRadius: 4,
        },
        android: {
          elevation: 8,
        },
      })!,
    } as const

    // Native tab bar dimensions
    export const tabBar = {
      height: Platform.select({ ios: 49, android: 56 })! + Platform.select({ ios: 34, android: 0 })!, // + safe area bottom
      iconSize: Platform.select({ ios: 28, android: 24 })!,
      labelSize: Platform.select({ ios: 10, android: 12 })!,
    } as const

    // Native list row dimensions
    export const listRow = {
      minHeight: Platform.select({ ios: 44, android: 48 })!,
      paddingHorizontal: 16,
      dividerInsetLeft: 16,
    } as const
    ```

    **2. Update `Card.tsx`** -- Platform-adaptive shadows, use token colors:

    Replace the flat `bg-slate-800 border border-slate-700 rounded-xl` with StyleSheet-based component that uses `colors.surfaceCard`, `colors.border`, `radii.md`, and `shadows.card`. Keep the same props interface (children, className, onPress). Use `className` for additional NativeWind overrides but base styles come from StyleSheet for shadow support (NativeWind can't do iOS shadows). Add `android_ripple` on Pressable variant for native tap feedback. Keep `active:opacity-80` for iOS fallback.

    ```tsx
    // Base card style:
    const cardBase = {
      backgroundColor: colors.surfaceCard,
      borderRadius: radii.md,
      borderWidth: 1,
      borderColor: colors.border,
      padding: spacing.lg,
      ...shadows.card,
    }
    ```

    Add an optional `elevated` prop (boolean, default false) that uses `shadows.cardElevated` and `colors.surfaceElevated` for a higher-prominence card.

    **3. Update `Typography.tsx`** -- Map to native type scale:

    Replace arbitrary Tailwind text sizes with the `typography` token scale. Use system font for body text (remove explicit Poppins on body variants). Keep Poppins-SemiBold only for H1, H2, H3 (brand headings). Map existing exports:
    - `H1` -> `typography.title1` + Poppins-SemiBold
    - `H2` -> `typography.title2` + Poppins-SemiBold
    - `H3` -> `typography.title3` + Poppins-SemiBold
    - `Heading` -> `typography.headline` + Poppins-SemiBold
    - `Body` -> `typography.body` + system font (remove fontFamily override)
    - `BodySmall` -> `typography.subhead` + system font
    - `Muted` -> `typography.subhead` + `colors.textSecondary`
    - `Caption` -> `typography.caption1` + `colors.textTertiary`

    Add new exports: `Footnote` (typography.footnote, textSecondary), `Callout` (typography.callout, textPrimary).

    Switch from NativeWind className-based sizing to StyleSheet with style prop so the native type scale is pixel-precise. Still accept `className` for color overrides. Still accept `style` for further customization. Use `colors.textPrimary` (#f1f5f9) instead of hardcoded `text-white`.

    **4. Update `Input.tsx`** -- Token colors + iOS-specific props:

    Replace hardcoded `bg-slate-800 border-slate-600` with `colors.surfaceInput`, `colors.border`. Use `radii.md` for borderRadius. Use `typography.body` fontSize. Add `clearButtonMode="while-editing"` on iOS (Platform.select). Use `colors.textPrimary` for text color, `colors.textTertiary` for placeholder. Use `colors.textSecondary` for label text.

    **5. Update `Button.tsx`** -- Token colors:

    Replace hardcoded colors in `variantStyles` and `variantTextStyles` with token references:
    - primary: `colors.brand` background, `colors.textPrimary` text
    - secondary: `colors.surfaceCard` background
    - destructive: `colors.danger` background
    - ghost: transparent, `colors.border` border

    Use `radii.md` instead of `rounded-xl`. Switch to StyleSheet for base styles (better performance + shadow support). Keep `android_ripple` as-is (already good). Use `typography.body` size for md, `typography.subhead` for sm, `typography.callout` for lg.

    **6. Update `Badge.tsx`** -- Token colors:

    Replace hardcoded tailwind variant colors with token-derived styles:
    - success: `colors.successBg` background, `colors.success` text, no border
    - warning: `colors.warningBg` background, `colors.warning` text
    - danger: `colors.dangerBg` background, `colors.danger` text
    - info: `colors.infoBg` background, `colors.info` text
    - muted: `colors.mutedBg` background, `colors.textTertiary` text

    Use `typography.caption2` for text sizing. Use `radii.full` for pill shape. Switch to StyleSheet for precise control.

    **7. Update `BottomSheet.tsx`** -- Token colors:

    Replace hardcoded `#1e293b`, `#334155`, `#475569` with `colors.surfaceCard`, `colors.border`, `colors.textMuted`. Use `radii.xl` for top corners. Use `typography.title3` for title text (still Poppins-SemiBold). Use `colors.textSecondary` for close button.

    **8. Update `ScreenWrapper.tsx`** -- Token colors:

    Replace `bg-slate-900` / `bg-white` with `colors.background` for dark mode (always dark in this app -- the app uses dark theme). Use StyleSheet for background so it's consistent. Keep safe area and status bar handling as-is.

    **9. Update `AppHeader.tsx`** -- Token colors:

    Replace all hardcoded hex values:
    - Background: `colors.background`
    - Border: `colors.borderLight`
    - Company name text: `colors.textPrimary`
    - Avatar background: `colors.brandSubtle`
    - Avatar border: `colors.brand`
    - Avatar text: `colors.brandLight`
    - Modal card: `colors.surfaceCard`, `colors.border`
    - Section labels: `colors.textMuted`
    - Email/role: `colors.textTertiary`

    **10. Update `tailwind.config.js`** -- Align with tokens:

    Update the surface and brand color values to exactly match the token file values. This ensures NativeWind className usage elsewhere (on screens we're NOT touching) picks up the same palette. Add `textPrimary`, `textSecondary`, `textTertiary` as color keys.

    IMPORTANT: All changes must be backward-compatible. Keep all existing prop interfaces. Screens using `<Card className="...">` or `<Body className="text-red-400">` must still work. The className prop on Typography components is still accepted for color overrides.
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit` to confirm no type errors.
    Grep for remaining hardcoded colors: `grep -rn "#1e293b\|#334155\|#0f172a\|#64748b\|bg-slate-800\|bg-slate-900" apps/mobile/components/ui/ apps/mobile/components/shared/AppHeader.tsx` -- should return zero matches in these files (other screen files will still have them, that's expected).
  </verify>
  <done>
    All shared UI components (Card, Typography, Input, Button, Badge, BottomSheet, ScreenWrapper, AppHeader) use design tokens from constants/tokens.ts instead of hardcoded hex values. Card has platform-adaptive shadows. Typography uses native iOS/Android text scales. Existing screen code using these components compiles without changes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create native list primitives and update tab bar layouts</name>
  <files>
    apps/mobile/components/ui/ListRow.tsx
    apps/mobile/components/ui/SectionHeader.tsx
    apps/mobile/app/(driver)/_layout.tsx
    apps/mobile/app/(owner)/_layout.tsx
  </files>
  <action>
    **1. Create `apps/mobile/components/ui/ListRow.tsx`** -- Native list row component:

    Props interface:
    ```ts
    interface ListRowProps {
      title: string
      subtitle?: string
      leading?: React.ReactNode    // left icon/avatar
      trailing?: React.ReactNode   // right side custom content
      showChevron?: boolean         // right chevron indicator (default true for onPress rows)
      showDivider?: boolean         // hairline bottom divider (default true)
      onPress?: () => void
      testID?: string
    }
    ```

    Implementation:
    - Use `minHeight: listRow.minHeight` (44pt iOS, 48dp Android) from tokens
    - `paddingHorizontal: listRow.paddingHorizontal` (16)
    - `paddingVertical: 12`
    - `backgroundColor: colors.surfaceCard`
    - Row layout: `[leading?] [title/subtitle column, flex:1] [trailing?] [chevron?]`
    - Title uses `typography.body`, `colors.textPrimary`
    - Subtitle uses `typography.footnote`, `colors.textSecondary`
    - Chevron: `<ChevronRight size={16} color={colors.textMuted} />` from lucide-react-native. Show automatically when `onPress` is provided (unless `showChevron={false}`).
    - Divider: hairline `View` with `height: StyleSheet.hairlineWidth`, `backgroundColor: colors.divider`, `marginLeft: listRow.dividerInsetLeft` (inset like iOS Settings app)
    - If `onPress`: wrap in `<Pressable>` with `android_ripple={{ color: 'rgba(255,255,255,0.08)' }}` and `active:opacity-80` on iOS
    - If no `onPress`: use `<View>`

    **2. Create `apps/mobile/components/ui/SectionHeader.tsx`** -- Native section header:

    Props: `{ title: string; action?: { label: string; onPress: () => void } }`

    Implementation:
    - Platform-adaptive styling:
      - iOS: uppercase title, `typography.footnote`, `colors.textTertiary`, `paddingTop: 24, paddingBottom: 8, paddingHorizontal: 16`
      - Android: sentence case, `typography.caption1` with `fontWeight: '500'`, `colors.textSecondary`, `paddingTop: 20, paddingBottom: 8, paddingHorizontal: 16`
    - Optional right-aligned action link (e.g., "See All") using `colors.brand`, `typography.footnote`
    - No background color (inherits from parent)

    **3. Update `apps/mobile/app/(driver)/_layout.tsx`** -- Native tab bar:

    Replace hardcoded tab bar styles with token-derived values:
    ```ts
    tabBarStyle: {
      backgroundColor: colors.tabBarBg,
      borderTopColor: colors.tabBarBorder,
      borderTopWidth: StyleSheet.hairlineWidth,
      height: tabBar.height,
      paddingTop: 6,
      ...shadows.tabBar,
    }
    ```
    - `tabBarActiveTintColor: colors.tabActive`
    - `tabBarInactiveTintColor: colors.tabInactive`
    - `tabBarLabelStyle`: use `tabBar.labelSize` for fontSize
    - Icon sizes: use `tabBar.iconSize` for all tab icons (replace hardcoded `size={24}`)
    - Replace hardcoded colors in `GPSStatusDot` styles: border color -> `colors.tabBarBg` (so it blends), green -> `colors.success`, red -> `colors.danger`, grey -> `colors.textTertiary`
    - Replace `unreadBadge` backgroundColor with `colors.danger`

    **4. Update `apps/mobile/app/(owner)/_layout.tsx`** -- Native tab bar:

    Same token migration as driver layout:
    - Replace hardcoded `backgroundColor: '#0c1524'` with `colors.tabBarBg`
    - Replace `tabBarActiveTintColor: '#38bdf8'` with `colors.tabActive`
    - Replace `tabBarInactiveTintColor: '#4a5e78'` with `colors.tabInactive`
    - Apply `shadows.tabBar` instead of manual shadow values
    - Use `tabBar.height` for height
    - Use `tabBar.iconSize` for icon size props
    - Use `tabBar.labelSize` for label font size
    - Remove `tabBarActiveBackgroundColor` (this highlight behind active tab is not native convention -- native iOS uses tint color only, Android uses indicator)
    - Add `borderTopWidth: StyleSheet.hairlineWidth` and `borderTopColor: colors.tabBarBorder`

    IMPORTANT: Do NOT change any logic in these layout files -- only visual styles. Keep all the HOS polling, GPS status, unread count, notification modal, etc. exactly as-is.
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit` to confirm no type errors.
    Verify new components export properly: `grep -rn "export.*ListRow\|export.*SectionHeader" apps/mobile/components/ui/ListRow.tsx apps/mobile/components/ui/SectionHeader.tsx` shows exports.
    Grep tab layouts for remaining hardcoded colors: `grep -n "#0c1524\|#1e293b\|#334155\|#0ea5e9\|#64748b\|#38bdf8\|#4a5e78" apps/mobile/app/\(driver\)/_layout.tsx apps/mobile/app/\(owner\)/_layout.tsx` -- should return zero matches (except in string literals for non-color purposes if any).
  </verify>
  <done>
    ListRow component provides native-feel list items with proper min heights, chevron disclosure indicators, and hairline dividers. SectionHeader provides platform-adaptive section titles. Both tab bar layouts use design tokens with proper heights and shadows. No logic changes in layouts -- only visual improvements.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/mobile && npx tsc --noEmit` -- zero type errors
2. No hardcoded hex colors remain in `components/ui/` or `components/shared/AppHeader.tsx` (tokens used everywhere)
3. New files exist: `constants/tokens.ts`, `components/ui/ListRow.tsx`, `components/ui/SectionHeader.tsx`
4. Existing screens that import Card, Typography, Button, etc. continue to compile without changes
5. Tab bar layouts reference tokens, not hardcoded colors
</verification>

<success_criteria>
- Design token system (tokens.ts) is the single source of truth for colors, spacing, radii, shadows, typography scales
- All 8 shared UI components use tokens instead of hardcoded values
- Cards have real shadows on iOS and elevation on Android
- Typography uses native text scales (17sp body on iOS, 16sp on Android)
- Tab bars use proper native heights (49pt iOS, 56dp Android)
- Two new primitives (ListRow, SectionHeader) ready for adoption on screens
- Zero breaking changes -- all 47 existing screens compile and render without modifications
</success_criteria>

<output>
After completion, create `.planning/quick/130-make-drivecommand-mobile-app-look-more-l/130-SUMMARY.md`
</output>
