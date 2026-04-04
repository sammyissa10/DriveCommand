---
phase: quick-150
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/app/(driver)/loads/my-route.tsx
autonomous: true
must_haves:
  truths:
    - "Driver sees a Start Navigation button on the My Route screen"
    - "Tapping the button opens external navigation to the correct address (origin for pickup statuses, destination for delivery statuses)"
    - "Button switches to the Map tab simultaneously"
    - "Button is disabled/greyed when all loads are DELIVERED or CANCELLED"
  artifacts:
    - path: "apps/mobile/app/(driver)/loads/my-route.tsx"
      provides: "Start Navigation button with address-resolution logic"
      contains: "openNavigation"
  key_links:
    - from: "apps/mobile/app/(driver)/loads/my-route.tsx"
      to: "apps/mobile/lib/navigation.ts"
      via: "openNavigation import"
      pattern: "openNavigation"
---

<objective>
Add a "Start Navigation" button to the driver my-route screen that determines the next active load's target address and opens external navigation while switching to the Map tab.

Purpose: Drivers on the routes view currently have no way to start navigation — only the loads view has it via StatusUpdateButton. This gives parity.
Output: Updated my-route.tsx with navigation button.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(driver)/loads/my-route.tsx
@apps/mobile/lib/navigation.ts
@packages/api-client/src/driver.ts (DriverRouteLoad interface, lines 135-142)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Start Navigation button to my-route.tsx</name>
  <files>apps/mobile/app/(driver)/loads/my-route.tsx</files>
  <action>
In `apps/mobile/app/(driver)/loads/my-route.tsx`:

1. Add import for `openNavigation` from `../../../lib/navigation`.
2. Add import for `Navigation` icon from `lucide-react-native` (add to existing import line).

3. After `const loadList = route.loads ?? []` (around line 202), add the navigation target computation:

```ts
// Determine next active load for navigation
const DONE_STATUSES = ['DELIVERED', 'CANCELLED']
const PICKUP_STATUSES = ['DISPATCHED', 'ACCEPTED']
// EN_ROUTE, IN_TRANSIT, PICKED_UP → destination

const activeLoads = loadList
  .filter((l) => !DONE_STATUSES.includes(l.status))
  .sort((a, b) => (a.sequence ?? 999) - (b.sequence ?? 999))

const nextLoad = activeLoads[0] ?? null
const navAddress = nextLoad
  ? PICKUP_STATUSES.includes(nextLoad.status)
    ? nextLoad.origin
    : nextLoad.destination
  : null
```

4. Add a `handleStartNavigation` callback (using `useCallback`):
```ts
const handleStartNavigation = useCallback(() => {
  if (!navAddress) return
  openNavigation({ address: navAddress })
  router.navigate('/(driver)/map' as never)
}, [navAddress, router])
```

5. Place the button in the header area, right after the closing `</View>` of the header row (line 229, after the Badge). Insert a new row below the header border, before the KeyboardAvoidingView (between lines 229 and 231). Use a `Pressable` styled consistently with the file's patterns:

```tsx
{/* Start Navigation button */}
<View className="px-4 py-2" style={{ borderBottomWidth: 1, borderBottomColor: c.border }}>
  <Pressable
    onPress={handleStartNavigation}
    disabled={!navAddress}
    className="flex-row items-center justify-center py-3 rounded-xl active:opacity-80"
    style={{
      backgroundColor: navAddress ? c.brand : c.surfaceElevated,
      opacity: navAddress ? 1 : 0.5,
    }}
  >
    <Navigation size={18} color={navAddress ? '#ffffff' : c.textMuted} />
    <Text
      className="font-semibold ml-2"
      style={{ color: navAddress ? '#ffffff' : c.textMuted }}
    >
      Start Navigation
    </Text>
  </Pressable>
</View>
```

Key constraints:
- Only modify my-route.tsx, no other files
- Use NativeWind className patterns (no StyleSheet.create)
- Import openNavigation from ../../../lib/navigation
- The button sits between the header and the KeyboardAvoidingView in the main route-loaded return block only (not in loading/error/no-route states)
  </action>
  <verify>
Run TypeScript check: `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit --project apps/mobile/tsconfig.json 2>&1 | head -20`

Visual check: the button should appear between the header (with back arrow, "My Route" title, badge) and the scrollable content. When all loads are done, the button should appear greyed out.
  </verify>
  <done>
- Start Navigation button renders below the header on the my-route screen
- Tapping it calls openNavigation with the correct address (origin for DISPATCHED/ACCEPTED, destination for EN_ROUTE/IN_TRANSIT/PICKED_UP)
- Tapping it also navigates to the Map tab
- Button is disabled and visually greyed when no active loads remain
- No other files modified
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors
2. Button renders in correct position on the my-route screen
3. Navigation logic correctly resolves pickup vs delivery address based on load status
4. Button disabled state works when all loads are DELIVERED/CANCELLED
</verification>

<success_criteria>
- my-route.tsx has a working Start Navigation button
- Correct address resolution: origin for pickup statuses, destination for delivery statuses
- Map tab switch on tap
- Disabled state when route is complete
- Atomic commit: `feat(driver): add Start Navigation button to route view`
</success_criteria>

<output>
After completion, create `.planning/quick/150-add-start-navigation-button-to-driver-my/150-SUMMARY.md`
</output>
