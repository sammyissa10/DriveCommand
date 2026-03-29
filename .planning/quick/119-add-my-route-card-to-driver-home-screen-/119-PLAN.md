---
phase: quick-119
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/mobile/app/(driver)/index.tsx
autonomous: true
must_haves:
  truths:
    - "When driver has an assigned route, a My Route card appears above the Active Load card"
    - "Card shows route name (or fallback), origin arrow destination, and status badge"
    - "Tapping the card navigates to /(driver)/loads/my-route"
    - "When no route is assigned, no My Route card renders"
  artifacts:
    - path: "apps/mobile/app/(driver)/index.tsx"
      provides: "My Route card on driver dashboard"
      contains: "driver-route"
  key_links:
    - from: "apps/mobile/app/(driver)/index.tsx"
      to: "driverApi.getMyRoute"
      via: "useQuery with queryKey ['driver-route']"
      pattern: "queryKey.*driver-route"
---

<objective>
Add a "My Route" card to the driver home screen that shows the driver's currently assigned route above the Active Load card. Uses the existing `driverApi.getMyRoute` API and `['driver-route']` query cache. Hidden when no route is assigned.

Purpose: Give drivers immediate visibility into their assigned route from the dashboard.
Output: Updated driver dashboard with conditional My Route card.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(driver)/index.tsx
@apps/mobile/app/(driver)/loads/my-route.tsx (for route badge logic reference)
@packages/api-client/src/driver.ts (DriverRoute type, getMyRoute API)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add My Route card to driver dashboard</name>
  <files>apps/mobile/app/(driver)/index.tsx</files>
  <action>
Add a second useQuery call to the DriverDashboard component that fetches the driver's route:

```
const { data: routeData } = useQuery({
  queryKey: ['driver-route'],
  queryFn: () => driverApi.getMyRoute(token!),
  enabled: !!token,
})
```

Extract `routeData?.route` — when non-null, render a tappable card ABOVE the Active Load card (between the Header and Active Load sections).

Card design — match the Active Load card style but use a green/emerald accent instead of sky:
- Left accent bar: `bg-emerald-500` (instead of sky-500)
- Border: `border-emerald-700` (instead of sky-700)
- Label: "My Route" (uppercase, slate-400, xs)
- Status badge: reuse the `getRouteBadge` helper from my-route.tsx — copy the same function into this file (maps PENDING->muted, ACTIVE/IN_PROGRESS->info, COMPLETED->success, CANCELLED->danger)
- Route name: `route.name ?? 'Unnamed Route'` in lg bold white
- Origin/destination row: same layout as Active Load card — origin text, ArrowRight icon, destination text
- Bottom-right "View Route" link in emerald-400 with ArrowRight icon
- onPress: `router.push('/(driver)/loads/my-route' as any)`
- haptic.light() on press

Also add `import { driverApi } from '@drivecommand/api-client'` is already imported — just ensure DriverRoute type access if needed. The `driverApi` import already exists on line 14. Add `Route` or `MapPin` icon from lucide-react-native for the empty-state fallback (but since we hide the card when no route, no icon needed — just conditionally render).

Ensure the pull-to-refresh also refetches the route query. Update the onRefresh callback:
```
const onRefresh = useCallback(() => {
  haptic.light()
  refetch()          // dashboard
  refetchRoute()     // route
}, [refetch, refetchRoute])
```

Where `refetchRoute` comes from the route useQuery destructuring: `const { data: routeData, refetch: refetchRoute } = useQuery(...)`.

The card should only render when `routeData?.route` is truthy. No empty state needed — just hide the section entirely.
  </action>
  <verify>
Run `cd apps/mobile && npx tsc --noEmit` to verify no TypeScript errors. Visually confirm in Android emulator that:
1. Driver with assigned route sees My Route card above Active Load
2. Tapping card navigates to my-route screen
3. Driver without route sees no My Route card
4. Pull-to-refresh refreshes both dashboard and route data
  </verify>
  <done>
My Route card conditionally renders on driver dashboard when route is assigned, showing route name, origin/destination, status badge, and navigates to /(driver)/loads/my-route on tap. Hidden when no route assigned. Pull-to-refresh covers both queries.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- My Route card appears only when driver has assigned route
- Card displays: route name, origin -> destination, status badge
- Tap navigates to /(driver)/loads/my-route
- Pull-to-refresh refreshes route data alongside dashboard data
</verification>

<success_criteria>
Driver dashboard shows a tappable My Route card (emerald accent) above Active Load when a route is assigned, hidden otherwise, with pull-to-refresh support.
</success_criteria>

<output>
After completion, create `.planning/quick/119-add-my-route-card-to-driver-home-screen-/119-SUMMARY.md`
</output>
