---
phase: quick-355
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/tracking/StatusPill.tsx
  - apps/web/src/components/tracking/RouteStop.tsx
  - apps/web/src/components/tracking/RouteTimeline.tsx
  - apps/web/src/components/tracking/TruckRow.tsx
  - apps/web/src/components/tracking/TruckRowExpanded.tsx
  - apps/web/src/lib/tracking/computeRouteProgress.ts
  - apps/web/src/components/maps/live-map-wrapper.tsx
autonomous: true
must_haves:
  truths:
    - "List view shows all trucks with inline route timelines"
    - "Each truck row displays vehicle icon, unit number, driver, status pill, and ETA"
    - "Route timeline shows stops with completed/current/upcoming states"
    - "Truck rows expand to show driver contact, load list, and activity log"
    - "5+ stops collapse to first 2 + last 2 with +N more indicator"
  artifacts:
    - path: "apps/web/src/components/tracking/StatusPill.tsx"
      provides: "Reusable status pill with semantic colors"
      exports: ["StatusPill"]
    - path: "apps/web/src/components/tracking/RouteTimeline.tsx"
      provides: "Horizontal timeline with stop markers and truck position"
      exports: ["RouteTimeline"]
    - path: "apps/web/src/components/tracking/TruckRow.tsx"
      provides: "Full-width truck row card (96px) with timeline"
      exports: ["TruckRow"]
    - path: "apps/web/src/lib/tracking/computeRouteProgress.ts"
      provides: "Pure function for timeline positioning"
      exports: ["computeRouteProgress"]
  key_links:
    - from: "apps/web/src/components/maps/live-map-wrapper.tsx"
      to: "TruckRow component"
      via: "List view renders TruckRow instead of VehicleSidebar"
      pattern: "TruckRow"
---

<objective>
Build TruckRow-based List view for /tracking/live with inline route timelines

Purpose: Replace the simple VehicleSidebar list view with rich TruckRow cards that show route progress visually via horizontal timelines, status pills, and ETA deltas. This gives fleet managers at-a-glance visibility into each truck's current position and delay status.

Output: 6 new components/utilities + updated live-map-wrapper.tsx to render TruckRow list
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/maps/live-map-wrapper.tsx
@apps/web/src/components/maps/vehicle-sidebar.tsx
@apps/web/src/lib/maps/map-utils.ts
@apps/web/src/lib/maps/vehicle-status.ts
@apps/web/src/components/tracking/KpiStrip.tsx
@apps/web/src/components/tracking/FilterChips.tsx
@apps/web/src/components/tracking/ViewToggle.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create StatusPill, RouteStop, RouteTimeline components + computeRouteProgress utility</name>
  <files>
    apps/web/src/components/tracking/StatusPill.tsx
    apps/web/src/components/tracking/RouteStop.tsx
    apps/web/src/components/tracking/RouteTimeline.tsx
    apps/web/src/lib/tracking/computeRouteProgress.ts
  </files>
  <action>
Create the foundational components for the List view:

**1. StatusPill.tsx** - Reusable status indicator with semantic colors
- Props: `status: 'on-time' | 'delayed' | 'early' | 'at-risk' | 'no-route'`, optional `className`
- Solid background colors: green-500 (on-time), red-500 (delayed), blue-500 (early), amber-500 (at-risk), gray-400 (no-route)
- White text, rounded-full, px-2.5 py-0.5, text-xs font-medium
- Labels: "On Time", "Delayed", "Early", "At Risk", "No Route"

**2. RouteStop.tsx** - Individual stop marker for the timeline
- Props: `state: 'completed' | 'current' | 'upcoming' | 'skipped'`, `type: 'pickup' | 'delivery' | 'fuel' | 'weigh'`, `label?: string`, `isFirst?: boolean`, `isLast?: boolean`
- Visual states:
  - completed: green-500 filled circle with checkmark
  - current: blue-500 filled circle, pulsing ring animation
  - upcoming: gray-300 hollow circle
  - skipped: gray-400 with strikethrough
- Size: 16px circle, 8px dot inside
- Show connecting line between stops (horizontal) unless isFirst/isLast

**3. RouteTimeline.tsx** - Horizontal timeline showing route progress
- Props: `stops: RouteStopData[]`, `truckPosition: number` (0-1 progress along route), `className?: string`
- RouteStopData: `{ id: string; type: 'pickup' | 'delivery' | 'fuel' | 'weigh'; status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'SKIPPED'; address: string; scheduledAt?: string; arrivedAt?: string; }`
- Layout: flex with justify-between, stops evenly spaced (NOT distance-weighted)
- Truck icon (Truck from lucide-react, 16px) positioned at truckPosition using absolute positioning
- Handle edge cases:
  - 0 stops: Show "No active route" centered text
  - 1-2 stops: Show all stops
  - 3-4 stops: Show all stops
  - 5+ stops: Show first 2 stops + "+N more" badge + last 2 stops
- Background line connecting all stops (gray-200)
- Progress line (green-500) from start to truck position

**4. computeRouteProgress.ts** - Pure function for timeline calculations
```typescript
interface RouteStopInput {
  id: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'SKIPPED';
  position: number;
}

interface RouteProgressResult {
  truckPosition: number; // 0-1, position along route
  completedStops: number;
  totalStops: number;
  currentStopIndex: number; // -1 if no current stop
}

export function computeRouteProgress(stops: RouteStopInput[]): RouteProgressResult
```
- Calculate truckPosition based on completed stops / total stops
- If a stop is IN_PROGRESS, truck is at that stop's position
- Return -1 for currentStopIndex if all completed or none started
  </action>
  <verify>
Files created with no TypeScript errors:
```bash
cd /Users/ayazmohammed/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30
```
  </verify>
  <done>
StatusPill renders semantic status with correct colors. RouteStop renders 4 visual states. RouteTimeline renders horizontal timeline with truck position indicator. computeRouteProgress returns correct position calculations.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create TruckRow and TruckRowExpanded components</name>
  <files>
    apps/web/src/components/tracking/TruckRow.tsx
    apps/web/src/components/tracking/TruckRowExpanded.tsx
  </files>
  <action>
Create the main row components:

**1. TruckRow.tsx** - Full-width truck row card
- Props: `vehicle: VehicleLocation`, `isExpanded: boolean`, `onToggleExpand: () => void`, `onVehicleClick: (vehicle: VehicleLocation) => void`
- Height: 96px (h-24), border-b, hover:bg-muted/50
- Three-zone layout:
  - **Left zone (w-56, shrink-0)**:
    - Truck icon (Truck from lucide-react, 24px, color based on status)
    - Unit number (truck.licensePlate, font-semibold)
    - Driver avatar placeholder (32px circle with initials) + driver name
    - Last location timestamp (text-xs text-muted-foreground)
  - **Middle zone (flex-1, min-w-[480px], overflow-hidden)**:
    - RouteTimeline component
    - Pass stops from vehicle.dispatch (mock empty array for now since API doesn't return full stops yet)
  - **Right zone (w-60, shrink-0)**:
    - StatusPill (derive status from vehicle data)
    - ETA delta text (e.g., "+15 min" in red, "-5 min" in green, "On Time" in muted)
    - Kebab menu button (MoreVertical icon, 44px touch target)
- Click on row (except kebab) calls onVehicleClick
- Click on expand chevron toggles expanded state
- Keyboard: Enter/Space on row to click, Tab through interactive elements
- Include ChevronDown icon that rotates when expanded

**2. TruckRowExpanded.tsx** - Expanded content panel
- Props: `vehicle: VehicleLocation`
- Renders below TruckRow when expanded
- framer-motion AnimatePresence for smooth expand/collapse (height from 0, opacity 0->1)
- Three sections in a grid (grid-cols-3):
  - **Driver Contact**: Phone icon + phone number (mock or from driver data), Email icon + email
  - **Load List**: List of loads on this route (mock "Load #1234 - Chicago to Dallas" style items)
  - **Activity Log**: Recent events (mock "Arrived at Stop 2 - 10:23 AM", "Departed Stop 1 - 8:45 AM")
- Placeholder data for now (real data integration deferred) - show "No data available" if empty
- Background: bg-muted/30, border-b, py-4 px-6

**Status derivation for StatusPill:**
- vehicle.status === 'moving' + has dispatch -> "on-time" (green)
- vehicle.status === 'idle' + has dispatch -> "at-risk" (amber)
- vehicle.status === 'offline' + has dispatch -> "delayed" (red)
- no dispatch -> "no-route" (gray)
  </action>
  <verify>
Files created with no TypeScript errors:
```bash
cd /Users/ayazmohammed/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json 2>&1 | head -30
```
  </verify>
  <done>
TruckRow renders 96px card with three zones. TruckRowExpanded animates open/closed with driver contact, load list, and activity sections. Status derivation maps vehicle state to StatusPill.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire TruckRow into live-map-wrapper List view</name>
  <files>
    apps/web/src/components/maps/live-map-wrapper.tsx
  </files>
  <action>
Replace VehicleSidebar in the list view with TruckRow components:

1. Import TruckRow and TruckRowExpanded at top of file

2. Add state for expanded truck IDs:
```typescript
const [expandedTruckIds, setExpandedTruckIds] = useState<Set<string>>(new Set());
```

3. Add toggle handler:
```typescript
const handleToggleExpand = useCallback((truckId: string) => {
  setExpandedTruckIds(prev => {
    const next = new Set(prev);
    if (next.has(truckId)) {
      next.delete(truckId);
    } else {
      next.add(truckId);
    }
    return next;
  });
}, []);
```

4. In the list view section (where `viewMode === 'list'`), replace VehicleSidebar with:
```tsx
<div className="divide-y">
  {statusFilteredVehicles.map((vehicle) => (
    <div key={vehicle.truckId}>
      <TruckRow
        vehicle={vehicle}
        isExpanded={expandedTruckIds.has(vehicle.truckId)}
        onToggleExpand={() => handleToggleExpand(vehicle.truckId)}
        onVehicleClick={handleVehicleClick}
      />
      <TruckRowExpanded
        vehicle={vehicle}
        isExpanded={expandedTruckIds.has(vehicle.truckId)}
      />
    </div>
  ))}
</div>
```

5. Keep VehicleSidebar in the left desktop sidebar (it's still used there for quick navigation)

6. Ensure the empty state still shows when statusFilteredVehicles.length === 0
  </action>
  <verify>
TypeScript compiles without errors and Vercel build succeeds:
```bash
cd /Users/ayazmohammed/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json && cd apps/web && npm run build 2>&1 | tail -20
```
  </verify>
  <done>
List view renders TruckRow cards instead of VehicleSidebar. Expand/collapse works via state. Empty state preserved. Desktop sidebar still uses VehicleSidebar.
  </done>
</task>

</tasks>

<verification>
1. TypeScript: `cd /Users/ayazmohammed/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json`
2. Build: `cd /Users/ayazmohammed/DriveCommand/apps/web && npm run build`
3. Visual: Navigate to /live-map, toggle to List view, verify TruckRow cards render with timelines
</verification>

<success_criteria>
- All 6 files created (StatusPill, RouteStop, RouteTimeline, TruckRow, TruckRowExpanded, computeRouteProgress)
- live-map-wrapper.tsx updated to use TruckRow in list view
- TypeScript compiles cleanly
- Vercel build succeeds
- List view shows truck rows with status pills and timeline placeholders
- Expand/collapse animation works smoothly
</success_criteria>

<output>
After completion, create `.planning/quick/355-build-list-view-for-tracking-live-with-i/355-SUMMARY.md`
</output>
