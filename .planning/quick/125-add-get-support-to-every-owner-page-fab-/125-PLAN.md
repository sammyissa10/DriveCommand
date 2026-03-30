---
phase: quick-125
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/components/ui/PageSpeedDial.tsx
  - apps/mobile/app/(owner)/loads/index.tsx
  - apps/mobile/app/(owner)/drivers/index.tsx
  - apps/mobile/app/(owner)/more/invoices/index.tsx
  - apps/mobile/app/(owner)/more/trucks/index.tsx
  - apps/mobile/app/(owner)/more/crm/index.tsx
  - apps/mobile/components/shared/SupportTicketFAB.tsx
autonomous: true

must_haves:
  truths:
    - "Every owner list page (loads, drivers, invoices, trucks, CRM) shows a speed dial FAB instead of a plain + FAB"
    - "Speed dial opens to show the page's primary action AND a Get Support action"
    - "Get Support opens the support ticket form from any of the 5 pages"
    - "The standalone SupportTicketFAB is hidden on the 5 converted pages (no duplicate FABs)"
  artifacts:
    - path: "apps/mobile/components/ui/PageSpeedDial.tsx"
      provides: "Reusable speed dial component with primary action + Get Support"
    - path: "apps/mobile/components/shared/SupportTicketFAB.tsx"
      provides: "Updated hide logic for converted pages"
  key_links:
    - from: "apps/mobile/components/ui/PageSpeedDial.tsx"
      to: "context/SupportTicketContext"
      via: "useSupportTicket() hook"
      pattern: "useSupportTicket"
---

<objective>
Replace the plain + FAB on 5 owner pages with a reusable PageSpeedDial component that shows a 2-item speed dial: the page's primary action and a "Get Support" option.

Purpose: Make support accessible from every owner list page without cluttering the UI with a separate support FAB.
Output: PageSpeedDial.tsx component, 5 updated pages, updated SupportTicketFAB hide logic.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(owner)/index.tsx (dashboard speed dial — reference for animation and styling)
@apps/mobile/components/shared/SupportTicketFAB.tsx
@apps/mobile/app/(owner)/loads/index.tsx
@apps/mobile/app/(owner)/drivers/index.tsx
@apps/mobile/app/(owner)/more/invoices/index.tsx
@apps/mobile/app/(owner)/more/trucks/index.tsx
@apps/mobile/app/(owner)/more/crm/index.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create PageSpeedDial reusable component</name>
  <files>apps/mobile/components/ui/PageSpeedDial.tsx</files>
  <action>
Create a reusable speed dial component at `apps/mobile/components/ui/PageSpeedDial.tsx`.

Props interface:
```ts
interface PageSpeedDialProps {
  primaryLabel: string          // e.g. "New Load"
  primaryIcon: React.ComponentType<{ color: string; size: number }>  // lucide icon component
  primaryColor: string          // e.g. "#38bdf8"
  onPrimaryPress: () => void    // callback for primary action
}
```

Internal state:
- `open` boolean (default false)
- `fadeAnim` = `React.useRef(new Animated.Value(0)).current`

When closed: render a single FAB button — position absolute, bottom: 24, right: 20, 52x52, borderRadius 26, backgroundColor `#0ea5e9` (sky blue), shows `Plus` icon (white, size 24). Same shadow style as dashboard FAB (shadowColor `#0ea5e9`, shadowOffset {0,4}, shadowOpacity 0.4, shadowRadius 8, elevation 8).

When open: FAB changes to gray (`#475569`) and shows `X` icon (white, size 22).

Speed dial menu (visible when open):
1. Semi-transparent backdrop (Pressable covering full screen, with Animated.View inside at `rgba(0,0,0,0.55)` opacity controlled by fadeAnim). Press backdrop calls closeSpeedDial.

2. Animated.View positioned absolute, bottom: 88, right: 20, alignItems: 'flex-end'. Opacity = fadeAnim, translateY = fadeAnim.interpolate({inputRange: [0,1], outputRange: [20, 0]}).

Inside the Animated.View, stack these items with gap: 10:
- **Row 1 — Primary action:** Pressable with flexDirection: 'row', alignItems: 'center', gap: 10. Contains:
  - Label pill: View with bg `#1e293b`, borderRadius 8, px 14, py 8, border 1px `#334155`. Text inside: primaryLabel, color `#f1f5f9`, fontWeight 600, fontSize 14.
  - Icon circle: View 42x42, borderRadius 21, bg `{primaryColor}22`, border 1px `{primaryColor}55`. Render `<PrimaryIcon color={primaryColor} size={18} />`.

- **Separator:** View height 1, bg `#475569`, width 160, alignSelf 'flex-end', marginVertical 2.

- **Row 2 — Get Support:** Same row structure as primary. Label = "Get Support". Icon circle bg `#f59e0b22`, border `#f59e0b55`, icon = `LifeBuoy` color `#f59e0b` size 18.

Animation functions (match dashboard exactly):
- `openSpeedDial()`: call `haptic.medium()`, set open=true, Animated.timing fadeAnim to 1 duration 180 useNativeDriver true.
- `closeSpeedDial()`: Animated.timing fadeAnim to 0 duration 140, in callback set open=false.

Action handlers:
- Primary row press: call `closeSpeedDial()`, then `haptic.light()`, then `onPrimaryPress()`.
- Get Support press: call `closeSpeedDial()`, then `haptic.light()`, then `setTimeout(() => openSupport(), 160)`.

Imports:
- `useSupportTicket` from `../../context/SupportTicketContext`
- `haptic` from `../../lib/haptics`
- `LifeBuoy, Plus, X` from `lucide-react-native`
- `Animated, Pressable, Text, View` from `react-native`
- React from `react`
  </action>
  <verify>TypeScript compiles: `cd apps/mobile && npx tsc --noEmit --pretty 2>&1 | grep -i "PageSpeedDial" | head -5` shows no errors for the new file.</verify>
  <done>PageSpeedDial.tsx exists, exports the component, accepts the 4 props, renders a 2-item speed dial with animation matching the dashboard pattern.</done>
</task>

<task type="auto">
  <name>Task 2: Replace FABs on 5 owner pages with PageSpeedDial</name>
  <files>
    apps/mobile/app/(owner)/loads/index.tsx
    apps/mobile/app/(owner)/drivers/index.tsx
    apps/mobile/app/(owner)/more/invoices/index.tsx
    apps/mobile/app/(owner)/more/trucks/index.tsx
    apps/mobile/app/(owner)/more/crm/index.tsx
  </files>
  <action>
For each of the 5 pages, remove the existing `+ FAB Pressable` and replace it with the PageSpeedDial component. Import `PageSpeedDial` and the appropriate lucide icon.

**a. loads/index.tsx** (lines 229-238):
- Remove the entire FAB Pressable block (the `{/* FAB — create load */}` comment through the closing `</Pressable>`)
- Remove `Plus` from the lucide imports (keep `Truck` which is used by EmptyState). Add `Package` to lucide imports.
- Add import: `import { PageSpeedDial } from '../../../components/ui/PageSpeedDial'`
- Insert before `{/* Create load bottom sheet */}`:
  ```
  <PageSpeedDial
    primaryLabel="New Load"
    primaryIcon={Package}
    primaryColor="#38bdf8"
    onPrimaryPress={() => setCreateSheetVisible(true)}
  />
  ```

**b. drivers/index.tsx** (lines 300-308):
- Remove the FAB Pressable block (`{/* FAB — invite driver */}` through closing `</Pressable>`)
- Remove `Plus` from lucide imports. Add `UserPlus` to lucide imports.
- Add import: `import { PageSpeedDial } from '../../../components/ui/PageSpeedDial'`
- Insert in same position (before closing `</AnimatedScreen>`):
  ```
  <PageSpeedDial
    primaryLabel="Invite Driver"
    primaryIcon={UserPlus}
    primaryColor="#a78bfa"
    onPrimaryPress={() => router.push('/(owner)/drivers/invite' as any)}
  />
  ```

**c. invoices/index.tsx** (lines 325-334):
- Remove the FAB Pressable block (`{/* FAB — create invoice */}` through closing `</Pressable>`)
- Remove `Plus` from lucide imports (keep `FileText` which is used in the empty state).
- Add import: `import { PageSpeedDial } from '../../../../components/ui/PageSpeedDial'`
- Insert in same position:
  ```
  <PageSpeedDial
    primaryLabel="New Invoice"
    primaryIcon={FileText}
    primaryColor="#fbbf24"
    onPrimaryPress={() => router.push('/(owner)/more/invoices/new' as never)}
  />
  ```

**d. trucks/index.tsx** (lines 199-208):
- Remove the FAB Pressable block (`{/* FAB — add truck */}` through closing `</Pressable>`)
- Remove `Plus` from lucide imports. Keep `Truck` (used by TruckCard and empty state).
- Add import: `import { PageSpeedDial } from '../../../../components/ui/PageSpeedDial'`
- Insert in same position:
  ```
  <PageSpeedDial
    primaryLabel="Add Truck"
    primaryIcon={Truck}
    primaryColor="#f87171"
    onPrimaryPress={() => router.push('/(owner)/more/trucks/new' as never)}
  />
  ```

**e. crm/index.tsx** (lines 254-263):
- Remove the FAB Pressable block (`{/* FAB — add customer */}` through closing `</Pressable>`)
- Remove `Plus` from lucide imports. Keep `Building2` (used in empty state).
- Add import: `import { PageSpeedDial } from '../../../../components/ui/PageSpeedDial'`
- Insert in same position:
  ```
  <PageSpeedDial
    primaryLabel="New Customer"
    primaryIcon={Building2}
    primaryColor="#34d399"
    onPrimaryPress={() => router.push('/(owner)/more/crm/new' as never)}
  />
  ```

For each page, also remove the `Plus` import from `lucide-react-native` since it's no longer used directly (PageSpeedDial handles Plus internally). Only remove Plus — do NOT remove other icons from the import.
  </action>
  <verify>Run `cd apps/mobile && npx tsc --noEmit --pretty 2>&1 | tail -3` — expect no type errors. Grep for unused Plus imports: `grep -n "Plus" apps/mobile/app/\(owner\)/loads/index.tsx apps/mobile/app/\(owner\)/drivers/index.tsx apps/mobile/app/\(owner\)/more/invoices/index.tsx apps/mobile/app/\(owner\)/more/trucks/index.tsx apps/mobile/app/\(owner\)/more/crm/index.tsx` should show no results.</verify>
  <done>All 5 pages use PageSpeedDial instead of the plain + FAB. Each passes the correct primaryLabel, primaryIcon, primaryColor, and onPrimaryPress. No Plus icon imports remain in the 5 files.</done>
</task>

<task type="auto">
  <name>Task 3: Hide SupportTicketFAB on converted pages</name>
  <files>apps/mobile/components/shared/SupportTicketFAB.tsx</files>
  <action>
Update SupportTicketFAB.tsx to hide itself on the 5 pages that now have Get Support built into their speed dial.

Replace the current hide logic (lines 11-14) with an expanded check. Expo Router strips group segments, so the pathnames to match are:
- `/loads` or `/loads/index` (from `/(owner)/loads`)
- `/drivers` or `/drivers/index` (from `/(owner)/drivers`)
- `/more/invoices` or `/more/invoices/index`
- `/more/trucks` or `/more/trucks/index`
- `/more/crm` or `/more/crm/index`

Implementation approach — create a Set of paths where the speed dial handles support:

```ts
const SPEED_DIAL_PAGES = new Set([
  '/',
  '/(owner)',
  '/(owner)/index',
  '/loads',
  '/loads/index',
  '/drivers',
  '/drivers/index',
  '/more/invoices',
  '/more/invoices/index',
  '/more/trucks',
  '/more/trucks/index',
  '/more/crm',
  '/more/crm/index',
])
```

Then replace the isDashboard check with:
```ts
if (SPEED_DIAL_PAGES.has(pathname)) return null
```

Remove the old `isDashboard` const entirely.
  </action>
  <verify>Run `cd apps/mobile && npx tsc --noEmit --pretty 2>&1 | grep -i "SupportTicketFAB" | head -5` — no type errors.</verify>
  <done>SupportTicketFAB returns null on all 6 pages (dashboard + 5 list pages) where a speed dial provides the Get Support action. No duplicate FABs appear.</done>
</task>

</tasks>

<verification>
1. `cd apps/mobile && npx tsc --noEmit` passes with no errors
2. Visually verify on emulator: open each of the 5 list pages, confirm + FAB appears, tap it to see speed dial with primary action + Get Support
3. Confirm no standalone SupportTicketFAB appears on the 5 converted pages
4. Confirm SupportTicketFAB still appears on non-converted pages (e.g. load detail)
</verification>

<success_criteria>
- PageSpeedDial.tsx is a clean, reusable component with animation matching the dashboard
- All 5 owner list pages show a speed dial with their primary action + Get Support
- Get Support opens the support ticket form from each page
- No duplicate support FABs on any page
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/125-add-get-support-to-every-owner-page-fab-/125-SUMMARY.md`
</output>
