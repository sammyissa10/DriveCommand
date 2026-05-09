---
phase: quick-221
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/maps/vehicle-marker.tsx
autonomous: true
must_haves:
  truths:
    - "Clicking a vehicle marker opens the details sheet with no blinking"
    - "The Leaflet Popup does not appear (details sheet replaces it)"
    - "30-second poll refresh does not cause markers to flicker or remount"
  artifacts:
    - path: "apps/web/src/components/maps/vehicle-marker.tsx"
      provides: "Vehicle marker with no Popup, memoized icon"
  key_links:
    - from: "apps/web/src/components/maps/vehicle-marker.tsx"
      to: "apps/web/src/components/maps/live-map.tsx"
      via: "onClick prop triggers VehicleDetailsSheet"
      pattern: "eventHandlers.*click.*onClick"
---

<objective>
Fix the blinking marker tooltip/popup on the Live Fleet Map.

Purpose: Vehicle markers currently use a react-leaflet `<Popup>` inside the `<Marker>`. When clicked, the Popup opens AND the `onClick` handler fires (opening the VehicleDetailsSheet sidebar). The Popup competes with the sidebar sheet for interaction — mouse events on the Popup trigger mouseout on the marker, causing a rapid open/close blink loop. Additionally, the `divIcon()` is recreated on every render (new object reference each poll cycle), which causes Leaflet to remount markers every 30 seconds.

Output: A stable, non-blinking VehicleMarker that opens the details sheet on click with no Popup interference and no flicker on poll refresh.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/maps/vehicle-marker.tsx
@apps/web/src/components/maps/live-map.tsx
@apps/web/src/components/maps/live-map-wrapper.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove Popup and memoize divIcon in VehicleMarker</name>
  <files>apps/web/src/components/maps/vehicle-marker.tsx</files>
  <action>
The blinking is caused by two issues in `vehicle-marker.tsx`:

**Issue 1 — Popup conflict:** The `<Popup>` (lines 71-94) opens on marker click by default. But the `onClick` handler ALSO opens VehicleDetailsSheet (a sidebar panel). The Popup and the sidebar compete — the Popup captures mouse events, triggers mouseout on the marker, and creates a blink loop. The Popup content (truck make/model, driver, status, speed) is redundant because VehicleDetailsSheet shows the same info in more detail.

**Fix:** Remove the `<Popup>` component entirely from the `<Marker>`. The marker click already opens VehicleDetailsSheet via the `onClick` prop — the Popup is not needed. Remove the `Popup` import from `react-leaflet`.

**Issue 2 — Icon recreation on every render:** `divIcon()` is called inline inside the render function. Every time `initialVehicles` changes (every 30s poll), React re-renders VehicleMarker with the same props, but `divIcon()` returns a new object. Leaflet sees a new icon reference and remounts the marker DOM, causing a visual flicker.

**Fix:** Memoize the icon using `useMemo` with dependencies on the values that actually affect the icon: `vehicle.latitude`, `vehicle.longitude`, `vehicle.heading`, `vehicle.truck.licensePlate`, `vehicle.speed`, `vehicle.timestamp`, and `vehicle.status`. This requires converting VehicleMarker from a plain function that returns null early to a component that uses hooks — move the null guard for missing GPS data AFTER the hooks (React rules of hooks: no conditional returns before hooks). Use a conditional return of `null` AFTER the `useMemo` call.

Also wrap the entire component in `React.memo()` so React skips re-rendering when the vehicle object has not changed between polls.

**Do NOT:**
- Add a Tooltip component (the license plate label in the divIcon HTML is sufficient)
- Change the onClick handler or the VehicleDetailsSheet interaction
- Modify live-map.tsx or any other file
- Change the marker data source or polling logic
  </action>
  <verify>
1. Run `cd apps/web && npx tsc --noEmit` — no TypeScript errors
2. Visual check: click a marker on /owner/live-map — details sheet opens cleanly, no blinking popup
3. Wait 30+ seconds for poll refresh — markers update position without flickering or remounting
4. No console errors related to Leaflet on marker interaction
  </verify>
  <done>
- Popup component fully removed from VehicleMarker
- divIcon memoized with useMemo
- VehicleMarker wrapped in React.memo
- Clicking a marker opens VehicleDetailsSheet with zero blinking
- 30-second poll does not cause marker flicker
- No TypeScript errors
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. On /owner/live-map: click any vehicle marker — details sheet slides open, no popup appears, no blinking
3. Click elsewhere or close the sheet — marker returns to normal state
4. Wait for 30s poll — markers stay stable, no flicker
5. Browser console shows no Leaflet warnings or errors on marker interaction
</verification>

<success_criteria>
- Zero blinking on marker click
- Zero popup appearing (Popup fully removed)
- Zero marker flicker on 30-second poll refresh
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/221-fix-blinking-marker-tooltip-on-live-flee/221-SUMMARY.md`
</output>
