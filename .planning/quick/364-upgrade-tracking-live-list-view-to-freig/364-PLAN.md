---
phase: quick-364
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/tracking/StatusPill.tsx
  - apps/web/src/components/tracking/ExceptionFlag.tsx
  - apps/web/src/components/tracking/RouteStop.tsx
  - apps/web/src/components/tracking/RouteTimeline.tsx
  - apps/web/src/components/tracking/TruckRow.tsx
  - apps/web/src/lib/tracking/computeRouteProgress.ts
  - apps/web/src/lib/tracking/computeRouteProgress.test.ts
autonomous: true

must_haves:
  truths:
    - "StatusPill uses semantic tokens (status.success/warning/danger) not hardcoded colors"
    - "RouteStop renders circles for normal stops, diamonds for exception stops"
    - "RouteTimeline shows stop labels (city abbreviation, scheduled time)"
    - "Segments between stops have visual states: solid completed, pulsing current, dashed upcoming, red exception"
    - "Collapsed stops indicator shows diamond with +N count for high stop counts"
    - "ExceptionFlag pill renders as secondary status indicator"
    - "Empty route gracefully renders 2-stop placeholder with backend TODO comment"
  artifacts:
    - path: "apps/web/src/components/tracking/StatusPill.tsx"
      provides: "Semantic-token StatusPill with ARIA"
      min_lines: 30
    - path: "apps/web/src/components/tracking/ExceptionFlag.tsx"
      provides: "Secondary exception indicator pill"
      min_lines: 20
    - path: "apps/web/src/components/tracking/RouteStop.tsx"
      provides: "Stop marker with circle/diamond variants, exception state"
      min_lines: 80
    - path: "apps/web/src/components/tracking/RouteTimeline.tsx"
      provides: "Timeline with segments, stop labels, truck position"
      min_lines: 120
    - path: "apps/web/src/lib/tracking/computeRouteProgress.test.ts"
      provides: "Unit tests for pure computeRouteProgress function"
      min_lines: 40
  key_links:
    - from: "RouteTimeline"
      to: "RouteStop"
      via: "props: state, type, isException, label"
    - from: "TruckRow"
      to: "StatusPill + ExceptionFlag"
      via: "status zone composition"
    - from: "StatusPill"
      to: "tailwind.config.ts"
      via: "status.success/warning/danger/info semantic tokens"
---

<objective>
Upgrade /tracking/live List view to freight-tracking inspired design with route timelines, stop markers, exception flags, and dispatcher-grade information density.

Purpose: Transform the current placeholder timeline into a professional freight-tracking visualization that shows route progress, stop states, exceptions, and ETA status at a glance.

Output: Enhanced TruckRow component with semantic StatusPill, ExceptionFlag, improved RouteTimeline with segment states, and stop markers with labels.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/tracking/TruckRow.tsx
@apps/web/src/components/tracking/RouteTimeline.tsx
@apps/web/src/components/tracking/RouteStop.tsx
@apps/web/src/components/tracking/StatusPill.tsx
@apps/web/src/lib/tracking/computeRouteProgress.ts
@apps/web/tailwind.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Upgrade StatusPill to semantic tokens and create ExceptionFlag</name>
  <files>
    apps/web/src/components/tracking/StatusPill.tsx
    apps/web/src/components/tracking/ExceptionFlag.tsx
  </files>
  <action>
**StatusPill.tsx** (~45 lines):
1. Replace hardcoded Tailwind colors with semantic tokens from tailwind.config.ts:
   - `on-time`: `bg-status-success text-status-success-foreground`
   - `delayed`: `bg-status-danger text-status-danger-foreground`
   - `early`: `bg-status-info text-status-info-foreground`
   - `at-risk`: `bg-status-warning text-status-warning-foreground`
   - `no-route`: `bg-muted text-muted-foreground`
2. Add `role="status"` and `aria-label` for accessibility
3. Export StatusType for reuse

**ExceptionFlag.tsx** (NEW, ~35 lines):
1. Create secondary pill component for exception indicators
2. Props: `type: 'weather' | 'traffic' | 'detention' | 'mechanical' | 'other'`
3. Use `bg-status-danger-bg text-status-danger` for all exceptions (subtle background)
4. Icon mapping: AlertTriangle (weather), Construction (traffic), Clock (detention), Wrench (mechanical), AlertCircle (other)
5. Compact size: `px-1.5 py-0.5 text-[10px]` with icon + short label
6. Add `role="status"` and `aria-label`
  </action>
  <verify>
- `tsc --noEmit` passes
- StatusPill renders with correct semantic token classes (inspect element)
- ExceptionFlag renders all 5 variants
  </verify>
  <done>
StatusPill uses semantic tokens instead of hardcoded colors. ExceptionFlag component exists with 5 exception type variants. Both have ARIA accessibility attributes.
  </done>
</task>

<task type="auto">
  <name>Task 2: Upgrade RouteStop with exception state and labels, enhance RouteTimeline segments</name>
  <files>
    apps/web/src/components/tracking/RouteStop.tsx
    apps/web/src/components/tracking/RouteTimeline.tsx
    apps/web/src/lib/tracking/computeRouteProgress.ts
    apps/web/src/lib/tracking/computeRouteProgress.test.ts
  </files>
  <action>
**RouteStop.tsx** (~100 lines):
1. Add `isException?: boolean` prop - when true, render diamond shape instead of circle
2. Add `label?: { city: string; time: string }` prop for below-stop labels
3. Update STATE_CONFIG to use semantic tokens:
   - completed: `bg-status-success` (green)
   - current: `bg-status-info` (blue) with pulse
   - upcoming: `border-2 border-n-300 bg-background`
   - skipped: `bg-n-400`
   - NEW exception: `bg-status-danger` (red) - triggered by isException=true on any state
4. Diamond shape: rotate-45 on the container, counter-rotate content
5. Label positioning: absolute, below marker, 2-line (city on top, time below)
6. Add `aria-label` describing stop state and type

**RouteTimeline.tsx** (~150 lines):
1. Add segment state rendering between stops:
   - completed segments: solid `bg-status-success` line
   - current segment (before current stop): pulsing animation `animate-pulse bg-status-info`
   - upcoming segments: dashed border `border-dashed border-n-300`
   - exception segments: solid `bg-status-danger`
2. Update collapsed view "+N more" badge to use diamond shape (consistent with exception markers)
3. Pass city/time labels to RouteStop (extract city abbreviation from address, format scheduledAt)
4. Handle graceful degradation: when `stops.length === 0`, show 2-stop placeholder with comment:
   ```tsx
   {/* TODO: Backend API doesn't populate dispatch.stops yet. Wire getLatestVehicleLocations to include RouteStop data */}
   ```
5. Add utility function `extractCityAbbrev(address: string): string` - extracts "City, ST" pattern

**computeRouteProgress.ts** (~80 lines):
1. Add `hasException` field to RouteStopInput interface
2. Add `exceptionCount` to RouteProgressResult
3. Update logic to count exceptions and flag exception segments

**computeRouteProgress.test.ts** (NEW, ~60 lines):
1. Test empty stops array returns defaults
2. Test all completed returns truckPosition=1
3. Test IN_PROGRESS stop positions truck correctly
4. Test mixed states (2 completed, 1 in progress, 2 pending)
5. Test exception counting
  </action>
  <verify>
- `npm test -- computeRouteProgress` passes all tests
- `tsc --noEmit` passes
- RouteStop renders diamond when isException=true
- RouteTimeline renders segment states correctly
- Empty stops shows placeholder with TODO comment
  </verify>
  <done>
RouteStop supports exception diamonds and labels. RouteTimeline renders segment states (solid/pulsing/dashed/red). computeRouteProgress has unit tests. Empty route gracefully degrades with backend TODO.
  </done>
</task>

<task type="auto">
  <name>Task 3: Integrate upgraded components into TruckRow</name>
  <files>
    apps/web/src/components/tracking/TruckRow.tsx
  </files>
  <action>
**TruckRow.tsx** (~180 lines):
1. Import ExceptionFlag from './ExceptionFlag'
2. Update TRUCK_ICON_COLORS to use semantic tokens:
   - `on-time`: `text-status-success`
   - `delayed`: `text-status-danger`
   - `early`: `text-status-info`
   - `at-risk`: `text-status-warning`
   - `no-route`: `text-n-400`
3. In right zone, add ExceptionFlag next to StatusPill when vehicle has exception:
   ```tsx
   <div className="flex flex-col items-end gap-1">
     <div className="flex items-center gap-1.5">
       <StatusPill status={status} />
       {vehicle.dispatch?.hasException && (
         <ExceptionFlag type={vehicle.dispatch.exceptionType ?? 'other'} />
       )}
     </div>
     <span className="text-xs text-muted-foreground">{etaDelta}</span>
   </div>
   ```
4. Update deriveStatus to check for exception state:
   - If `vehicle.dispatch?.hasException` is true and status would be 'on-time', return 'at-risk' instead
5. Replace mockStops with actual stops from vehicle.dispatch (when available):
   ```tsx
   // TODO: Backend API doesn't populate dispatch.stops yet
   // When wired, map dispatch.stops to RouteStopData[]
   const routeStops: RouteStopData[] = vehicle.dispatch?.stops?.map(s => ({
     id: s.id,
     type: s.type.toLowerCase() as RouteStopData['type'],
     status: s.status,
     address: s.address,
     scheduledAt: s.scheduledAt,
     arrivedAt: s.arrivedAt,
     hasException: s.hasException ?? false,
   })) ?? [];
   ```
6. Add type augmentation comment for VehicleDispatch:
   ```tsx
   // Type augmentation: VehicleDispatch needs stops: RouteStopData[], hasException: boolean, exceptionType?: string
   // See: apps/web/src/lib/maps/map-utils.ts
   ```
  </action>
  <verify>
- `tsc --noEmit` passes
- TruckRow renders StatusPill with semantic colors
- ExceptionFlag appears when dispatch has exception (mock test with hardcoded data)
- RouteTimeline receives stops array (empty until backend wired)
- No visual regressions in /live-map List view
  </verify>
  <done>
TruckRow integrates StatusPill, ExceptionFlag, and RouteTimeline. Uses semantic tokens throughout. Gracefully handles missing backend data with TODO comments. Ready for backend wiring.
  </done>
</task>

</tasks>

<verification>
1. `tsc --noEmit` - TypeScript compiles without errors
2. `npm test -- computeRouteProgress` - Unit tests pass
3. Visual inspection at /live-map (List view):
   - StatusPill uses semantic colors (green/red/amber/blue)
   - RouteTimeline shows "No active route" or placeholder (until backend wired)
   - Truck icon colors match status
4. Inspect element confirms semantic token classes (bg-status-success, text-status-danger, etc.)
</verification>

<success_criteria>
- [ ] StatusPill uses semantic tokens from tailwind.config.ts, not hardcoded colors
- [ ] ExceptionFlag component exists with 5 exception types
- [ ] RouteStop renders diamonds for exceptions, circles for normal stops
- [ ] RouteStop renders city/time labels below markers
- [ ] RouteTimeline renders segment states (solid/pulsing/dashed/red)
- [ ] RouteTimeline gracefully degrades with TODO comment when stops empty
- [ ] computeRouteProgress has passing unit tests
- [ ] TruckRow integrates all components with semantic tokens
- [ ] All ARIA accessibility attributes present
- [ ] `tsc --noEmit` passes
</success_criteria>

<output>
After completion, create `.planning/quick/364-upgrade-tracking-live-list-view-to-freig/364-SUMMARY.md`
</output>
