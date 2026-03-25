---
phase: quick-108
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/app/(owner)/_layout.tsx
  - apps/mobile/app/(owner)/more.tsx
  - apps/mobile/app/(owner)/invoices.tsx
  - apps/mobile/app/(owner)/crm.tsx
  - apps/mobile/app/(owner)/payroll.tsx
  - apps/mobile/app/(owner)/ai-documents.tsx
  - apps/mobile/app/(owner)/trucks.tsx
  - apps/mobile/app/(owner)/compliance.tsx
  - apps/mobile/app/(owner)/settings/_layout.tsx
  - apps/mobile/app/(owner)/settings/team.tsx
  - apps/mobile/app/(owner)/settings/account.tsx
autonomous: true
must_haves:
  truths:
    - "Tab bar shows Dashboard, Live Map, Loads, Drivers, More (5 tabs)"
    - "Tapping More shows hub screen with grouped sections and tappable rows"
    - "Tapping any row navigates to its sub-screen"
    - "Sub-screens show Coming Soon with back button navigation"
    - "Messages row navigates to existing fleet screen"
  artifacts:
    - path: "apps/mobile/app/(owner)/_layout.tsx"
      provides: "Tab bar with More tab and hidden screen registrations"
    - path: "apps/mobile/app/(owner)/more.tsx"
      provides: "More hub screen with grouped navigation rows"
    - path: "apps/mobile/app/(owner)/settings/_layout.tsx"
      provides: "Stack layout for settings sub-screens"
  key_links:
    - from: "apps/mobile/app/(owner)/more.tsx"
      to: "all sub-screens"
      via: "router.push()"
      pattern: "router\\.push.*\\/(owner)\\/"
    - from: "apps/mobile/app/(owner)/_layout.tsx"
      to: "hidden screens"
      via: "href: null"
      pattern: "href:\\s*null"
---

<objective>
Replace the 5th "Messages" tab with a "More" hub that organizes Communications, Business, Fleet, and Settings sub-screens behind a single tab. Create stub screens for all sub-screens that don't exist yet.

Purpose: Consolidate secondary features into a single hub tab, keeping the tab bar clean at 5 items while providing access to 10+ features.
Output: Updated tab layout, More hub screen, 10 stub/sub-screens.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(owner)/_layout.tsx
@apps/mobile/app/(owner)/fleet.tsx
@apps/mobile/components/ui/AnimatedScreen.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update tab layout and register hidden screens</name>
  <files>apps/mobile/app/(owner)/_layout.tsx</files>
  <action>
In `apps/mobile/app/(owner)/_layout.tsx`:

1. Replace the `fleet` tab (currently 5th, labeled "Messages") with a `more` tab:
   - Import `Grid2X2` from `lucide-react-native` (remove `MessageSquare` import)
   - Change the last `Tabs.Screen` from `name="fleet"` to `name="more"` with `tabBarLabel: 'More'` and `Grid2X2` icon

2. Add hidden `Tabs.Screen` entries (with `href: null` in options) for all sub-screens that exist as files in the `(owner)` directory but should NOT appear in the tab bar:
   - `fleet` (moved from visible tab to hidden)
   - `invoices`
   - `crm`
   - `payroll`
   - `ai-documents`
   - `trucks`
   - `compliance`
   - `settings` (for the settings stack navigator)

Each hidden screen entry:
```tsx
<Tabs.Screen name="fleet" options={{ href: null, headerShown: false }} />
```

Keep all existing tab styling (`tabBarStyle`, `tabBarActiveTintColor`, etc.) unchanged. Keep `haptic.light()` listener on the More tab.
  </action>
  <verify>App compiles without errors. Tab bar shows: Dashboard, Live Map, Loads, Drivers, More. No extra tabs visible.</verify>
  <done>5-tab bar renders correctly with More as the last tab using Grid2X2 icon. All sub-screens registered as hidden tabs.</done>
</task>

<task type="auto">
  <name>Task 2: Create More hub screen</name>
  <files>apps/mobile/app/(owner)/more.tsx</files>
  <action>
Create `apps/mobile/app/(owner)/more.tsx` — a scrollable hub screen with grouped sections.

Use `StyleSheet.create` (NO NativeWind). Dark theme: bg `#0f172a`, card bg `#1e293b`, border `#334155`, text `#f1f5f9`, subtext `#64748b`, accent `#0ea5e9`.

Structure:
- `SafeAreaView` (edges: bottom, left, right) wrapping `AnimatedScreen` wrapping `ScrollView`
- Header: "More" title (22px bold white) + "Features & settings" subtitle (13px slate)
- 4 grouped sections, each with:
  - Section header: 11px uppercase, letterSpacing 1.5, color `#64748b`, marginBottom 8, marginTop 24 (first section marginTop 16)
  - Card container: bg `#1e293b`, borderRadius 12, border 1px `#334155`, overflow hidden

Each row inside a section card is a `Pressable` with:
- Left: 40x40 View, borderRadius 10, colored background (unique per row, use 15% opacity of icon color), centered icon (20px)
- Center: label (16px fontWeight 600, color `#f1f5f9`) + subtitle below (12px color `#64748b`)
- Right: `ChevronRight` icon (18px, color `#334155`)
- Row padding: horizontal 14, vertical 14
- Separator between rows: 1px line color `#334155`, marginLeft 68 (to align past icon)
- `onPress`: `haptic.light()` then `router.push('/(owner)/TARGET' as any)`

Section definitions with icon colors:

**COMMUNICATIONS**
| Label | Subtitle | Icon | Color | Route |
|-------|----------|------|-------|-------|
| Messages | Fleet messaging | MessageSquare | #0ea5e9 | /(owner)/fleet |

**BUSINESS**
| Label | Subtitle | Icon | Color | Route |
|-------|----------|------|-------|-------|
| Invoices | Billing & payments | FileText | #22c55e | /(owner)/invoices |
| CRM | Customer management | Users | #8b5cf6 | /(owner)/crm |
| Payroll | Driver pay | DollarSign | #f59e0b | /(owner)/payroll |
| AI Documents | Smart doc reading | Sparkles | #ec4899 | /(owner)/ai-documents |

**FLEET**
| Label | Subtitle | Icon | Color | Route |
|-------|----------|------|-------|-------|
| Trucks | Vehicle management | Truck | #f97316 | /(owner)/trucks |
| Compliance | Docs & expiry | ShieldCheck | #06b6d4 | /(owner)/compliance |

**SETTINGS**
| Label | Subtitle | Icon | Color | Route |
|-------|----------|------|-------|-------|
| Team Permissions | Roles & access | Shield | #64748b | /(owner)/settings/team |
| Account & Subscription | Plan & billing | CreditCard | #a78bfa | /(owner)/settings/account |

Import icons from `lucide-react-native`. Use `useRouter` from `expo-router`.

Define row data as a typed array constant to keep the JSX clean — map over sections and rows.
  </action>
  <verify>Tapping More tab shows hub screen. All 4 sections render with correct headers. All 10 rows display icon, label, subtitle, chevron.</verify>
  <done>More hub screen renders all sections and rows. Tapping any row navigates to the correct route.</done>
</task>

<task type="auto">
  <name>Task 3: Create stub sub-screens and settings stack</name>
  <files>
    apps/mobile/app/(owner)/invoices.tsx
    apps/mobile/app/(owner)/crm.tsx
    apps/mobile/app/(owner)/payroll.tsx
    apps/mobile/app/(owner)/ai-documents.tsx
    apps/mobile/app/(owner)/trucks.tsx
    apps/mobile/app/(owner)/compliance.tsx
    apps/mobile/app/(owner)/settings/_layout.tsx
    apps/mobile/app/(owner)/settings/team.tsx
    apps/mobile/app/(owner)/settings/account.tsx
  </files>
  <action>
Create 9 files. All stub screens follow this exact pattern (using `StyleSheet.create`, NO NativeWind):

```tsx
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { ChevronLeft, ICON_HERE } from 'lucide-react-native'
import { AnimatedScreen } from '../../components/ui/AnimatedScreen'  // adjust path for settings

export default function SCREEN_NAME() {
  const router = useRouter()
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <AnimatedScreen>
        {/* Header with back button */}
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
            <ChevronLeft color="#f1f5f9" size={24} />
          </Pressable>
          <Text style={styles.title}>TITLE</Text>
        </View>
        {/* Coming soon card */}
        <View style={styles.content}>
          <View style={styles.card}>
            <ICON color="#ICON_COLOR" size={40} />
            <Text style={styles.cardTitle}>TITLE</Text>
            <Text style={styles.cardSubtitle}>Coming soon</Text>
          </View>
        </View>
      </AnimatedScreen>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0f172a' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backBtn: { marginRight: 12 },
  title: { fontSize: 18, fontWeight: '700', color: '#f1f5f9' },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  card: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#334155',
    padding: 32,
    alignItems: 'center',
    width: '100%',
    maxWidth: 300,
  },
  cardTitle: { fontSize: 18, fontWeight: '700', color: '#f1f5f9', marginTop: 16 },
  cardSubtitle: { fontSize: 14, color: '#64748b', marginTop: 6 },
})
```

Screen-specific values:

| File | Title | Icon | Icon Color |
|------|-------|------|------------|
| invoices.tsx | Invoices | FileText | #22c55e |
| crm.tsx | CRM | Users | #8b5cf6 |
| payroll.tsx | Payroll | DollarSign | #f59e0b |
| ai-documents.tsx | AI Documents | Sparkles | #ec4899 |
| trucks.tsx | Trucks | Truck | #f97316 |
| compliance.tsx | Compliance | ShieldCheck | #06b6d4 |
| settings/team.tsx | Team Permissions | Shield | #64748b |
| settings/account.tsx | Account & Subscription | CreditCard | #a78bfa |

For settings screens, the AnimatedScreen import path is `../../../components/ui/AnimatedScreen`.

**Settings stack layout** (`apps/mobile/app/(owner)/settings/_layout.tsx`):
```tsx
import { Stack } from 'expo-router'

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
      <Stack.Screen name="team" />
      <Stack.Screen name="account" />
    </Stack>
  )
}
```
  </action>
  <verify>Navigate to each sub-screen from the More hub. Each shows the correct title, icon, and "Coming soon" card. Back button returns to More hub.</verify>
  <done>All 9 files created. Each stub screen renders with dark theme, back navigation, and Coming Soon card. Settings stack navigator works for team and account screens.</done>
</task>

</tasks>

<verification>
1. App compiles: `cd apps/mobile && npx expo start` launches without errors
2. Tab bar: exactly 5 tabs — Dashboard, Live Map, Loads, Drivers, More
3. More screen: 4 sections (Communications, Business, Fleet, Settings) with correct rows
4. Navigation: tapping Messages row opens fleet messaging screen; tapping any other row opens its stub
5. Stub screens: all show title, icon, Coming Soon card, back button works
6. Settings: team and account screens accessible via settings stack
</verification>

<success_criteria>
- 5-tab layout with More replacing Messages as the 5th tab
- More hub displays 10 rows across 4 grouped sections
- All 10 navigation targets are reachable and render correctly
- Back navigation works from every sub-screen
- Dark theme consistent across all new screens (#0f172a bg)
</success_criteria>

<output>
After completion, create `.planning/quick/108-build-more-hub-tab-for-mobile-owner-port/108-SUMMARY.md`
</output>
