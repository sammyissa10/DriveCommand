---
phase: quick-66
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(driver)/actions/driver-routes.ts
  - src/app/(driver)/actions/driver-load.ts
  - src/app/(driver)/my-route/page.tsx
  - src/app/(driver)/my-load/page.tsx
autonomous: true
must_haves:
  truths:
    - "Driver sees active load info card on /my-route page with load number, origin, destination, and status"
    - "Driver sees active route info card on /my-load page with route name, origin, destination, and status"
    - "Each info card links to the other page (/my-route links to /my-load and vice versa)"
    - "If no linked record exists, no card is shown (no errors)"
  artifacts:
    - path: "src/app/(driver)/actions/driver-routes.ts"
      provides: "getMyAssignedRouteSummary server action"
    - path: "src/app/(driver)/actions/driver-load.ts"
      provides: "getMyActiveLoadSummary server action"
    - path: "src/app/(driver)/my-route/page.tsx"
      provides: "Active Load info card"
    - path: "src/app/(driver)/my-load/page.tsx"
      provides: "Active Route info card"
  key_links:
    - from: "src/app/(driver)/my-route/page.tsx"
      to: "driver-load.ts getMyActiveLoadSummary"
      via: "server action call"
      pattern: "getMyActiveLoadSummary"
    - from: "src/app/(driver)/my-load/page.tsx"
      to: "driver-routes.ts getMyAssignedRouteSummary"
      via: "server action call"
      pattern: "getMyAssignedRouteSummary"
---

<objective>
TKT-0022: Cross-reference routes and loads in driver portal.

Purpose: Drivers currently see /my-route and /my-load as disconnected pages with different destinations, causing confusion. Adding cross-reference info cards clarifies the relationship.
Output: Each page shows a compact info card about the linked record with a navigation link to the other page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(driver)/my-route/page.tsx
@src/app/(driver)/my-load/page.tsx
@src/app/(driver)/actions/driver-routes.ts
@src/app/(driver)/actions/driver-load.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add summary server actions for cross-referencing</name>
  <files>src/app/(driver)/actions/driver-load.ts, src/app/(driver)/actions/driver-routes.ts</files>
  <action>
Add a lightweight `getMyActiveLoadSummary` function to `driver-load.ts` that returns only the fields needed for the info card: `{ id, loadNumber, origin, destination, status }`. Follow the exact same security pattern as `getMyActiveLoad` (requireRole DRIVER, getCurrentUser, filter by driverId = user.id, status in DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED). Use `select` instead of `include` to keep it lightweight — no customer join needed. Return null if no active load.

Add a lightweight `getMyAssignedRouteSummary` function to `driver-routes.ts` that returns only: `{ id, name, origin, destination, status }`. Follow the exact same security pattern as `getMyAssignedRoute` (requireRole DRIVER, getCurrentUser, filter by driverId = user.id, status in PLANNED/IN_PROGRESS). Use `select` to return only those fields. Return null if no active route.

Both functions must be exported and marked `'use server'` (already at top of each file).
  </action>
  <verify>TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -30`</verify>
  <done>Two new server actions exist that return minimal summary data for cross-reference cards</done>
</task>

<task type="auto">
  <name>Task 2: Add cross-reference info cards to both pages</name>
  <files>src/app/(driver)/my-route/page.tsx, src/app/(driver)/my-load/page.tsx</files>
  <action>
**On /my-route page (page.tsx):**
1. Import `getMyActiveLoadSummary` from `driver-load` actions and `Link` from `next/link` and `Package` from `lucide-react`.
2. After fetching the route (and only if route exists), call `getMyActiveLoadSummary()` in the same try/catch block as the document fetches (add it to the Promise.all).
3. If a load summary is returned, render an "Active Load" info card immediately after the page heading div and before the RouteDetailReadOnly component. Card structure:
   - Use the same card styling as existing sections: `rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm`
   - Add a subtle left border accent: `border-l-4 border-l-blue-500` (to visually distinguish it as a cross-reference)
   - Header: Package icon + "Your Active Load" in small uppercase tracking-wider muted text
   - Body: Load number (bold), origin arrow destination, status badge
   - Footer: `<Link href="/my-load">` styled as a text link: "View load details →"
4. If no load summary, render nothing (no empty state for cross-reference).

**On /my-load page (page.tsx):**
1. Import `getMyAssignedRouteSummary` from `driver-routes` actions and `Link` from `next/link` and `MapPin` icon (already has it but verify import).
2. After fetching the load (and only if load exists), call `getMyAssignedRouteSummary()` in a try/catch. Assign to a variable, default null on error.
3. If a route summary is returned, render an "Active Route" info card immediately after the page heading div and before the "Load Details" card. Card structure:
   - Same card styling as load page sections: `rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm`
   - Left border accent: `border-l-4 border-l-emerald-500` (green for routes)
   - Header: MapPin icon + "Your Active Route" in small uppercase tracking-wider muted text
   - Body: Route name (bold, or "Unnamed Route" if null), origin arrow destination, status badge
   - Footer: `<Link href="/my-route">` styled as a text link: "View route details →"
4. If no route summary, render nothing.

**Status badge styling** for both cards: Use inline conditional classes — green bg for active/in-progress, yellow for pending/planned, blue for dispatched, gray for delivered. Small rounded pill: `inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium`.
  </action>
  <verify>
1. `npx tsc --noEmit --pretty 2>&1 | head -30` — no type errors
2. `npm run build 2>&1 | tail -20` — build succeeds
  </verify>
  <done>Both /my-route and /my-load pages show cross-reference info cards linking to each other when a linked record exists, and show nothing when no linked record exists</done>
</task>

</tasks>

<verification>
1. TypeScript compiles without errors
2. Next.js build succeeds
3. Both pages render without errors when driver has both route and load
4. Both pages render without errors when driver has only one or neither
</verification>

<success_criteria>
- /my-route shows "Your Active Load" card with load number, addresses, status, and link to /my-load
- /my-load shows "Your Active Route" card with route name, addresses, status, and link to /my-route
- Cards only appear when the linked record exists
- No schema changes, no new dependencies
</success_criteria>

<output>
After completion, create `.planning/quick/66-tkt-0022-cross-reference-routes-and-load/66-SUMMARY.md`
</output>
