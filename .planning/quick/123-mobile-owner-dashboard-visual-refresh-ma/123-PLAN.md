---
phase: quick-123
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/app/(owner)/index.tsx
  - apps/mobile/app/(owner)/_layout.tsx
  - apps/mobile/components/owner/KPICard.tsx
  - apps/mobile/components/owner/DashboardLoadCard.tsx
  - apps/mobile/components/owner/DriverStatusChip.tsx
  - apps/mobile/components/skeletons/DashboardSkeleton.tsx
autonomous: true

must_haves:
  truths:
    - "Dashboard page background is visibly darker than cards, creating depth hierarchy"
    - "KPI cards appear elevated with shadows and colored accent strips, no flat borders"
    - "Tab bar feels solid and native with no visible top border line"
    - "Section headers have a native feel with uppercase tracking"
  artifacts:
    - path: "apps/mobile/components/owner/KPICard.tsx"
      provides: "Elevated KPI cards with shadow + accent color strip"
      contains: "shadowColor"
    - path: "apps/mobile/app/(owner)/_layout.tsx"
      provides: "Native-feeling tab bar styling"
      contains: "borderTopWidth: 0"
    - path: "apps/mobile/app/(owner)/index.tsx"
      provides: "Darker page background and updated section headers"
      contains: "#080f1a"
---

<objective>
Refresh the mobile owner dashboard to feel like a native fleet management app instead of a web dashboard ported to mobile.

Purpose: The current dashboard has a flat uniform dark background with web-style bordered tiles and a web-ish tab bar. Native apps use elevation hierarchy, material depth, and stronger visual separation.

Output: Updated styling across dashboard screen, KPI cards, load cards, driver chips, tab bar, and skeleton — all purely visual, no logic changes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(owner)/index.tsx
@apps/mobile/app/(owner)/_layout.tsx
@apps/mobile/components/owner/KPICard.tsx
@apps/mobile/components/owner/DashboardLoadCard.tsx
@apps/mobile/components/owner/DriverStatusChip.tsx
@apps/mobile/components/skeletons/DashboardSkeleton.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add depth hierarchy to dashboard page and section headers</name>
  <files>
    apps/mobile/app/(owner)/index.tsx
    apps/mobile/components/skeletons/DashboardSkeleton.tsx
  </files>
  <action>
In `apps/mobile/app/(owner)/index.tsx`:

1. **Page background**: Change SafeAreaView `bg-slate-900` to use inline style `backgroundColor: '#080f1a'` (slate-950-ish). This darkens the canvas so cards float above it. Apply to BOTH the main SafeAreaView (line 163) and the error-state SafeAreaView (line 136).

2. **Dashboard header**: Change "Dashboard" text from `text-2xl` to `text-3xl`. Keep `font-bold text-white`. Change subtitle "Fleet overview" from `text-slate-400` to `text-slate-500` (slightly more muted for contrast with the brighter title).

3. **Section dividers**: Replace the two `<View style={{ height: 1, backgroundColor: '#334155' ... }}>` dividers (lines 224-229 and 258-263) with `<View style={{ height: 1, backgroundColor: '#1e293b', marginBottom: 14 }}>` — subtler separator that doesn't compete.

4. **Section headers** ("Active Loads" and "Driver Status"): Change the icon color from `#64748b` to the section's accent color — `#38bdf8` (sky) for Active Loads, `#a78bfa` (violet) for Driver Status. Add `letterSpacing: 0.8` and `textTransform: 'uppercase'` to the section header Text elements (convert from className to style if needed). Reduce font size to 12. Keep fontWeight '600'.

5. **Empty states**: The two "no active loads" / "all drivers off duty" Views currently use `bg-slate-800 border border-slate-700`. Change to `backgroundColor: '#111827'` (darker than cards but lighter than page), remove border (`borderWidth: 0`), keep rounded-xl.

In `apps/mobile/components/skeletons/DashboardSkeleton.tsx`:

6. **Match the darker background**: Change the SafeAreaView backgroundColor from `'#0f172a'` to `'#080f1a'`. Change the KPICardSkeleton backgroundColor from `'#1e293b'` to `'#162032'` and remove borderWidth/borderColor (set borderWidth: 0). Change the divider from `'#1e293b'` to `'#162032'`.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/mobile/tsconfig.json` — no type errors. Visually grep for old values: search for `bg-slate-900` in index.tsx (should be gone from SafeAreaView), search for `#334155` divider (should be gone).</verify>
  <done>Page background is #080f1a, cards visually float above it. Section headers are uppercase with colored icons. Skeleton matches new color scheme.</done>
</task>

<task type="auto">
  <name>Task 2: Elevate KPI cards, load cards, and driver chips with shadows and accent colors</name>
  <files>
    apps/mobile/components/owner/KPICard.tsx
    apps/mobile/components/owner/DashboardLoadCard.tsx
    apps/mobile/components/owner/DriverStatusChip.tsx
    apps/mobile/app/(owner)/index.tsx
  </files>
  <action>
In `apps/mobile/components/owner/KPICard.tsx`:

1. **Add `accentColor` prop** to KPICardProps interface: `accentColor?: string`. This will render a 3px left-border accent strip.

2. **Update cardStyle**: Change `backgroundColor` from `'#1e293b'` to `'#162032'`. Remove `borderWidth: 1` and `borderColor: '#334155'` (delete them). Add elevation/shadow:
   ```
   shadowColor: '#000000',
   shadowOffset: { width: 0, height: 2 },
   shadowOpacity: 0.3,
   shadowRadius: 4,
   elevation: 4,
   ```

3. **Add accent strip**: Inside the outer `<View>` (both pressable and non-pressable variants), add as the FIRST child before the existing content:
   ```tsx
   {accentColor && (
     <View style={{
       position: 'absolute',
       left: 0,
       top: 8,
       bottom: 8,
       width: 3,
       borderRadius: 2,
       backgroundColor: accentColor,
     }} />
   )}
   ```
   Adjust inner padding: change `padding: 12` to `paddingVertical: 12, paddingLeft: 16, paddingRight: 12` to accommodate the accent strip.

4. **Pass accentColor from dashboard** — In `apps/mobile/app/(owner)/index.tsx`, add `accentColor` to each KPICard:
   - Active Loads: `accentColor="#38bdf8"` (sky)
   - Available: `accentColor="#38bdf8"` (sky)
   - Revenue (MTD): `accentColor="#10b981"` (green)
   - Open Alerts: `accentColor={kpis.openAlertsCount > 0 ? '#fbbf24' : '#475569'}` (amber when active, muted when zero)

In `apps/mobile/components/owner/DashboardLoadCard.tsx`:

5. **Update card styling**: Change `backgroundColor` from `'#1e293b'` to `'#162032'`. Remove `borderWidth: 1` and `borderColor` entirely. Add shadow:
   ```
   shadowColor: '#000000',
   shadowOffset: { width: 0, height: 2 },
   shadowOpacity: 0.25,
   shadowRadius: 3,
   elevation: 3,
   ```
   For active loads (isActive), add a subtle left accent: wrap content in a View that has a 3px sky-colored left border via an absolutely positioned View, similar to KPICard pattern.

In `apps/mobile/components/owner/DriverStatusChip.tsx`:

6. **Update chip styling**: Change `backgroundColor` from `'#1e293b'` to `'#162032'`. Remove `borderWidth: 1` and `borderColor: '#334155'`. Add shadow:
   ```
   shadowColor: '#000000',
   shadowOffset: { width: 0, height: 1 },
   shadowOpacity: 0.2,
   shadowRadius: 2,
   elevation: 2,
   ```
   Also update the status dot `borderColor` from `'#1e293b'` to `'#162032'` so it matches the new chip background.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/mobile/tsconfig.json` — no type errors. Grep for old `borderColor: '#334155'` in KPICard.tsx, DashboardLoadCard.tsx, DriverStatusChip.tsx — should be gone. Grep for `shadowColor` in all three files — should exist.</verify>
  <done>All cards and chips have elevation shadows, no flat borders, accent color strips on KPI cards, darker card backgrounds that float above the #080f1a page.</done>
</task>

<task type="auto">
  <name>Task 3: Make tab bar feel native with solid background and stronger active indicator</name>
  <files>
    apps/mobile/app/(owner)/_layout.tsx
  </files>
  <action>
In `apps/mobile/app/(owner)/_layout.tsx`, update the `tabBarStyle` object:

1. **Darken and solidify**: Change `backgroundColor` from `'#1e293b'` to `'#0c1524'` (very dark, nearly matching page but distinct).

2. **Remove top border**: Change `borderTopColor` to `'transparent'` or add `borderTopWidth: 0`.

3. **Add top shadow/elevation** for material depth: Add to tabBarStyle:
   ```
   shadowColor: '#000000',
   shadowOffset: { width: 0, height: -2 },
   shadowOpacity: 0.3,
   shadowRadius: 4,
   elevation: 8,
   ```

4. **Stronger active tab indicator**: Change `tabBarActiveBackgroundColor` from `'rgba(56,189,248,0.12)'` to `'rgba(56,189,248,0.18)'` for a more prominent pill highlight.

5. **Bump inactive tint**: Change `tabBarInactiveTintColor` from `'#3d5068'` to `'#4a5e78'` — slightly brighter so icons are visible but still clearly inactive.

Do NOT change `tabBarActiveTintColor` (#38bdf8), `tabBarLabelStyle`, or `tabBarShowLabel`. Preserve all existing tab screen definitions and haptic listeners.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/mobile/tsconfig.json` — no type errors. Grep for `'#1e293b'` in _layout.tsx — should be gone (replaced with '#0c1524'). Grep for `borderTopColor: '#334155'` — should be gone.</verify>
  <done>Tab bar has solid dark background, no visible top border line, material shadow for depth, and a stronger active tab pill indicator. Inactive tabs slightly more visible.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p apps/mobile/tsconfig.json` passes with zero errors
2. No references to old flat border pattern (`borderWidth: 1, borderColor: '#334155'`) remain in KPICard, DashboardLoadCard, or DriverStatusChip
3. All six files compile and export correctly
4. Color palette preserved: sky (#38bdf8), green (#10b981), amber (#fbbf24), red (#f87171) still used for their original purposes
5. No new packages added, no routing changes, no data fetching changes
</verification>

<success_criteria>
- Page background is #080f1a creating clear depth separation from cards
- KPI cards have shadows, no borders, colored left accent strips matching their value colors
- Load cards and driver chips have shadows and no flat borders
- Tab bar is solid dark with shadow depth, no top border line, stronger active indicator
- Section headers are uppercase with colored icon accents
- All existing functionality (navigation, data fetching, refresh, FAB) unchanged
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/123-mobile-owner-dashboard-visual-refresh-ma/123-SUMMARY.md`
</output>
