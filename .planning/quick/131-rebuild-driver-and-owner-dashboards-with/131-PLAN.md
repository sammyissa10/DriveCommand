---
phase: quick-131
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/components/driver/TripCard.tsx
  - apps/mobile/components/driver/StatsRow.tsx
  - apps/mobile/components/owner/KPIGrid.tsx
  - apps/mobile/components/owner/SpeedDial.tsx
  - apps/mobile/app/(driver)/index.tsx
  - apps/mobile/app/(owner)/index.tsx
autonomous: true
must_haves:
  truths:
    - "Driver dashboard renders identically but uses extracted TripCard, StatsRow, SectionHeader, and Card components"
    - "Owner dashboard renders identically but uses extracted KPIGrid, SpeedDial, SectionHeader, and token references"
    - "No hardcoded color hex values remain in either dashboard screen file"
    - "FAB respects safe area insets on all devices"
    - "Driver chip grid uses flexWrap instead of hardcoded CHIP_WIDTH calculation"
  artifacts:
    - path: "apps/mobile/components/driver/TripCard.tsx"
      provides: "Reusable accent-bar card for route and load display"
    - path: "apps/mobile/components/driver/StatsRow.tsx"
      provides: "3-chip stats row wrapper"
    - path: "apps/mobile/components/owner/KPIGrid.tsx"
      provides: "2x2 KPI card grid layout"
    - path: "apps/mobile/components/owner/SpeedDial.tsx"
      provides: "FAB + speed dial menu with safe area awareness"
  key_links:
    - from: "apps/mobile/app/(driver)/index.tsx"
      to: "apps/mobile/components/driver/TripCard.tsx"
      via: "import and render"
      pattern: "import.*TripCard"
    - from: "apps/mobile/app/(owner)/index.tsx"
      to: "apps/mobile/components/owner/SpeedDial.tsx"
      via: "import and render"
      pattern: "import.*SpeedDial"
---

<objective>
Rebuild both driver and owner dashboard screens to use extracted components and design tokens from quick-130, eliminating inline styles, duplicated JSX, and hardcoded color values.

Purpose: Reduce screen file complexity by ~250 lines total, enforce consistent token usage, and make dashboard sections reusable.
Output: 4 new components + 2 rebuilt dashboard screens.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/constants/tokens.ts
@apps/mobile/components/ui/Card.tsx
@apps/mobile/components/ui/SectionHeader.tsx
@apps/mobile/components/ui/Badge.tsx
@apps/mobile/components/driver/StatChip.tsx
@apps/mobile/components/owner/KPICard.tsx
@apps/mobile/components/owner/DriverStatusChip.tsx
@apps/mobile/components/owner/DashboardLoadCard.tsx
@apps/mobile/app/(driver)/index.tsx
@apps/mobile/app/(owner)/index.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Extract shared components (TripCard, StatsRow, KPIGrid, SpeedDial)</name>
  <files>
    apps/mobile/components/driver/TripCard.tsx
    apps/mobile/components/driver/StatsRow.tsx
    apps/mobile/components/owner/KPIGrid.tsx
    apps/mobile/components/owner/SpeedDial.tsx
  </files>
  <action>
**TripCard** (`components/driver/TripCard.tsx`):
- Extract the repeated accent-bar card pattern used for both "My Route" and "Active Load" in the driver dashboard.
- Props: `accentColor: string` (emerald for route, sky for load), `label: string` ("My Route" / "Active Load"), `title: string`, `statusBadge: { label: string; variant: BadgeVariant }`, `origin: string`, `destination: string`, `subtitle?: string` (for customer name on load card), `linkText: string` ("View Route" / "View Details"), `linkColor: string`, `onPress: () => void`.
- Use `StyleSheet.create` with token imports: `colors.surfaceCard` for bg, `radii.md` for border radius, `spacing` for padding/margins.
- Accent bar: absolute positioned View on left, 3px wide, `backgroundColor: accentColor`, full height.
- Border color derived from accentColor (pass as prop or compute from accent — e.g., `borderColor: accentColor + '40'` for 25% opacity).
- Import and use `Badge` component for status badge top-right.
- Import `ArrowRight` from lucide-react-native for the origin->destination row and the link row.
- Must NOT import or use NativeWind className for styling — use StyleSheet only, matching token system.

**StatsRow** (`components/driver/StatsRow.tsx`):
- Simple wrapper that renders 3 `StatChip` components in a flex row.
- Props: `miles: number | string`, `stops: number | string`, `hosHours: number | string`.
- Use `StyleSheet.create` with `flexDirection: 'row', gap: spacing.sm`.
- Passes `value` and `label` to each `StatChip`.
- Note: StatChip itself still uses NativeWind — that is fine, do not change StatChip in this task.

**KPIGrid** (`components/owner/KPIGrid.tsx`):
- Wraps 4 KPICard instances in a 2x2 grid.
- Props: `kpis: { activeLoads: number; availableDrivers: number; revenue: string; openAlerts: number }`, `onPressLoads: () => void`, `onPressDrivers: () => void`, `onPressRevenue: () => void`, `onPressAlerts: () => void`.
- Layout: two rows via `flexDirection: 'row', gap: spacing.sm`, with `marginBottom: spacing.sm` between rows and `marginBottom: spacing.xl` after the grid.
- Compute alert colors internally: if `kpis.openAlerts > 0` use `colors.warning` else `colors.textMuted`.
- Import KPICard, the 4 icon components (Package, UserCheck, DollarSign, AlertTriangle), and tokens.
- Each KPICard gets appropriate `accessibilityLabel`.

**SpeedDial** (`components/owner/SpeedDial.tsx`):
- Extract the entire speed dial system (backdrop, action items list, FAB button) from owner dashboard.
- Props: `actions: ReadonlyArray<{ key: string; label: string; icon: React.ComponentType<any>; route: string; color: string }>`, `onAction: (route: string) => void`, `onSupportPress: () => void`.
- Internal state: `menuOpen`, `fadeAnim` (Animated.Value).
- Internal functions: `openMenu`, `closeMenu`, `handleAction` — same logic as current screen.
- Import `haptic` from `../../lib/haptics`.
- FAB positioning: use `useSafeAreaInsets()` from react-native-safe-area-context. Bottom = `insets.bottom + spacing.lg` (not hardcoded 24). Right = `spacing.xl`.
- Speed dial items positioned at `bottom: insets.bottom + spacing.lg + 52 + spacing.md` (FAB height + gap above FAB).
- All inline style hex values replaced with token references: `colors.surfaceCard` for label bg, `colors.border` for label border, `colors.textPrimary` for label text, `colors.textMuted` for close-state FAB bg, `colors.brand` for open-state FAB bg.
- Separator line: use `StyleSheet.hairlineWidth` and `colors.textMuted` instead of hardcoded values.
- Import `Plus`, `X`, `LifeBuoy` from lucide-react-native.
  </action>
  <verify>
Run `npx tsc --noEmit --project apps/mobile/tsconfig.json` — all 4 new files compile without errors. Visually inspect that each component file uses token imports (no hardcoded hex colors except where passed as props).
  </verify>
  <done>
4 new component files exist, each using StyleSheet.create + design tokens, with clean TypeScript types. No hardcoded hex colors in component internals (accent colors received via props are acceptable).
  </done>
</task>

<task type="auto">
  <name>Task 2: Rebuild driver and owner dashboard screens using extracted components</name>
  <files>
    apps/mobile/app/(driver)/index.tsx
    apps/mobile/app/(owner)/index.tsx
  </files>
  <action>
**Driver Dashboard** (`app/(driver)/index.tsx`):

1. Import new components: `TripCard` from `../../components/driver/TripCard`, `StatsRow` from `../../components/driver/StatsRow`.
2. Import `SectionHeader` from `../../components/ui/SectionHeader` and `Card` from `../../components/ui/Card`.
3. Import `colors, spacing` from `../../constants/tokens`.

4. Replace "My Route" inline Pressable (lines 143-183) with:
   ```
   <TripCard accentColor={colors.success} label="My Route" title={routeData.route.name ?? 'Unnamed Route'} statusBadge={getRouteBadge(routeData.route.status)} origin={routeData.route.origin} destination={routeData.route.destination} linkText="View Route" linkColor={colors.success} onPress={() => { haptic.light(); router.push('/(driver)/loads/my-route' as any) }} />
   ```

5. Replace "Active Load" inline Pressable (lines 186-246) with:
   ```
   <TripCard accentColor={colors.brandLight} label="Active Load" title={`#${activeLoad.loadNumber}`} statusBadge={getStatusBadge(activeLoad.status)} subtitle={activeLoad.customer.companyName} origin={activeLoad.origin} destination={activeLoad.destination} linkText="View Details" linkColor={colors.brandLight} onPress={() => router.push('/(driver)/loads' as any)} />
   ```
   Keep the empty state View as-is but replace inline styles/className with Card component + token colors.

6. Replace stats row View (lines 249-253) with:
   ```
   <StatsRow miles={todayMiles} stops={stopsCompleted} hosHours={`${hosHoursRemaining}h`} />
   ```

7. Replace "Recent Alerts" Text header (line 280) with `<SectionHeader title="Recent Alerts" />`. Remove the manual paddingHorizontal since SectionHeader has its own — but since the ScrollView already has paddingHorizontal:16 and SectionHeader adds paddingHorizontal:16, set SectionHeader's container padding to 0 by wrapping with a style override OR adjust: actually SectionHeader has `paddingHorizontal: spacing.lg` (16) built in. Since the ScrollView already provides 16px horizontal padding, wrap SectionHeader usage with `style={{ marginHorizontal: -spacing.lg }}` to cancel the double padding, OR simpler: just use a plain section header inline matching the SectionHeader visual (uppercase text, tertiary color, footnote size) but without the extra padding. Best approach: use SectionHeader but pass `style` prop — if SectionHeader doesn't accept style, keep the plain Text but style it with tokens: `{ ...typography.footnote, color: colors.textTertiary, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: spacing.sm }`.

8. Replace alert item raw Views with `Card` component (non-pressable). The Card already provides surfaceCard bg, border, rounded corners, and padding. Keep the AlertTriangle icon + text content inside.

9. Replace all remaining inline style objects and hardcoded colors:
   - `backgroundColor: '#080f1a'` or `bg-slate-900` on SafeAreaView → `colors.background`
   - `tintColor="#0ea5e9"` on RefreshControl → `colors.brand`
   - `paddingHorizontal: 16` → `spacing.lg`
   - `paddingVertical: 16` → `spacing.lg`
   - `paddingBottom: 32` → `spacing.xxl + spacing.sm` (28) or just 32 (close enough, keep as literal)
   - Report Incident section: replace `rgba(127,29,29,0.3)` with `colors.dangerBg`, border color with `colors.danger + '80'`.
   - Section spacing: use `marginBottom: spacing.xl` (20) between sections consistently.

10. Keep ALL business logic untouched: queries, getRouteBadge, getStatusBadge, formatAlertTime, onRefresh, error/loading states.

**Owner Dashboard** (`app/(owner)/index.tsx`):

1. Import new components: `KPIGrid` from `../../components/owner/KPIGrid`, `SpeedDial` from `../../components/owner/SpeedDial`.
2. Import `SectionHeader` from `../../components/ui/SectionHeader`.
3. Import `colors, spacing` from `../../constants/tokens`.

4. Remove: `useState` for menuOpen, `fadeAnim` ref, `openMenu`, `closeMenu`, `handleAction` functions — all moved to SpeedDial.
5. Remove: `Dimensions` import and `SCREEN_WIDTH` / `CHIP_WIDTH` constants.
6. Remove: `Animated`, `Plus`, `X`, `LifeBuoy` imports (now in SpeedDial).

7. Replace the 2x2 KPI grid (lines 189-228) with:
   ```
   <KPIGrid kpis={{ activeLoads: kpis.activeLoadsCount, availableDrivers: availableDriversCount, revenue: formatRevenue(kpis.revenueThisMonth), openAlerts: kpis.openAlertsCount }} onPressLoads={() => { haptic.light(); router.push('/(owner)/loads' as any) }} onPressDrivers={() => { haptic.light(); router.push('/(owner)/drivers' as any) }} onPressRevenue={() => { haptic.light(); router.push('/(owner)/invoices' as any) }} onPressAlerts={() => { haptic.light(); router.push('/(owner)/compliance' as any) }} />
   ```

8. Replace section dividers (hardcoded height:1 Views) with: `<View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.divider }} />`. Import `StyleSheet` from react-native.

9. Replace inline section header Text elements with `<SectionHeader>`:
   - "Active Loads" → `<SectionHeader title="Active Loads" />` (SectionHeader already handles uppercase on iOS, icon not needed in SectionHeader — if icon is desired, add icon to the section header row manually using a wrapper View with the Truck icon).
   - "Driver Status" → `<SectionHeader title="Driver Status" />`.
   - Same padding note as driver dashboard — if double padding is an issue, use `marginHorizontal: -spacing.lg` wrapper.

10. Replace driver chip grid: remove `CHIP_WIDTH` calculation entirely. Replace `style={{ width: CHIP_WIDTH }}` on each Pressable with `style={{ width: '48%' }}` or better: use parent `flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm` and child `flex: 0, flexBasis: '48%'` to let flex handle sizing. This adapts to all screen widths without Dimensions.

11. Replace the entire speed dial system (lines 309-431) with:
    ```
    <SpeedDial actions={CREATE_ACTIONS} onAction={(route) => { haptic.light(); router.push(route as any) }} onSupportPress={openSupport} />
    ```

12. Replace all hardcoded hex colors:
    - `backgroundColor: '#080f1a'` → `colors.background`
    - `backgroundColor: '#111827'` → `colors.surfaceCard`
    - `borderColor: '#1e293b'` / `backgroundColor: '#1e293b'` → `colors.divider` or `colors.border`
    - `color: '#ffffff'` → `colors.textPrimary`
    - `tintColor="#0ea5e9"` → `colors.brand`
    - All other inline style objects → token references.

13. Keep ALL business logic untouched: queries, formatRevenue, availableDriversCount computation, CREATE_ACTIONS array, error/loading states.
  </action>
  <verify>
Run `npx tsc --noEmit --project apps/mobile/tsconfig.json` — both screens compile clean. Grep both files for hardcoded hex patterns: `grep -E "#[0-9a-fA-F]{3,8}" apps/mobile/app/\(driver\)/index.tsx apps/mobile/app/\(owner\)/index.tsx` should return zero matches (except possibly in comments). Both screens should be significantly shorter than before (driver ~150 lines, owner ~120 lines vs current 311 and 435).
  </verify>
  <done>
Both dashboard screens use extracted components and design tokens throughout. No hardcoded colors remain in screen files. Driver dashboard reduced from ~310 lines to ~150. Owner dashboard reduced from ~435 lines to ~120. All existing functionality preserved — same queries, same navigation, same visual output.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit --project apps/mobile/tsconfig.json` passes with no errors.
2. No hardcoded hex colors in either dashboard screen file (grep confirms).
3. Both screens import and use design tokens from `constants/tokens.ts`.
4. Both screens use `SectionHeader` component for section titles.
5. Owner dashboard FAB uses safe area insets for bottom positioning.
6. Owner dashboard driver chip grid uses flexWrap, not hardcoded CHIP_WIDTH.
7. All business logic (API calls, data transformations, navigation) unchanged.
</verification>

<success_criteria>
- 4 new extracted components exist and compile
- Driver dashboard uses TripCard (2x), StatsRow, SectionHeader, Card
- Owner dashboard uses KPIGrid, SpeedDial, SectionHeader, StyleSheet.hairlineWidth dividers
- Zero hardcoded hex colors in screen files
- TypeScript compiles clean
- Total line reduction of ~250+ lines across both screens
</success_criteria>

<output>
After completion, create `.planning/quick/131-rebuild-driver-and-owner-dashboards-with/131-SUMMARY.md`
</output>
