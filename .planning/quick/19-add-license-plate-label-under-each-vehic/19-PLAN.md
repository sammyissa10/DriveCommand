---
phase: 19-add-license-plate-label-under-each-vehic
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/maps/vehicle-marker.tsx
autonomous: true
must_haves:
  truths:
    - "Each vehicle marker on the live map shows the license plate text below the truck icon"
    - "Labels do not break MarkerClusterGroup clustering behavior"
    - "Labels are readable at default zoom levels"
  artifacts:
    - path: "src/components/maps/vehicle-marker.tsx"
      provides: "Vehicle marker with license plate label"
      contains: "licensePlate"
  key_links:
    - from: "src/components/maps/vehicle-marker.tsx"
      to: "vehicle.truck.licensePlate"
      via: "inline HTML in divIcon template"
      pattern: "vehicle\\.truck\\.licensePlate"
---

<objective>
Add a license plate label below each vehicle marker on the live map so owners can identify trucks at a glance without clicking.

Purpose: Eliminates the need to click each marker just to see which truck it is.
Output: Updated VehicleMarker component with plate label.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/maps/vehicle-marker.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add license plate label to VehicleMarker divIcon</name>
  <files>src/components/maps/vehicle-marker.tsx</files>
  <action>
Modify the `divIcon` html template in `src/components/maps/vehicle-marker.tsx` to add a license plate label below the truck circle:

1. After the closing `</div>` of the heading arrow ternary (line ~42), and before the final closing `</div>` of the outer container, add a label element:
   ```html
   <div class="absolute left-1/2 -translate-x-1/2 whitespace-nowrap mt-0.5"
        style="top: 100%; pointer-events: none;">
     <span class="inline-block px-1.5 py-0 text-[10px] font-semibold leading-tight
                  bg-gray-900/80 text-white rounded-sm shadow-sm backdrop-blur-sm">
       ${vehicle.truck.licensePlate || ''}
     </span>
   </div>
   ```

2. Increase `iconSize` from `[40, 40]` to `[40, 56]` to accommodate the label below the circle (40px icon + ~16px label).

3. Keep `iconAnchor` at `[20, 20]` so the circle center stays on the GPS coordinate. The label will extend below naturally.

4. Update `popupAnchor` to remain `[0, -20]` (unchanged, still relative to the circle center).

Key constraints:
- Use `pointer-events: none` on the label so it does not interfere with marker click events.
- Use `whitespace-nowrap` so plate text stays on one line.
- Use small font (10px) and a dark semi-transparent pill so it is readable over any map tile.
- Do NOT change the existing circle icon or heading arrow markup.
- The label is pure inline HTML within the divIcon string template, compatible with MarkerClusterGroup.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Then visually verify by running the dev server (`npm run dev`) and navigating to the live map page — each vehicle marker should show a small dark pill with the license plate text below the truck circle.
  </verify>
  <done>
Every vehicle marker on the live map displays the truck's license plate as a small dark pill label below the icon circle. Labels are readable, do not block click events, and clustering still works.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- Vehicle markers render with license plate labels below the icon
- Clicking a marker still opens the popup
- MarkerClusterGroup still clusters markers when zoomed out
</verification>

<success_criteria>
License plate text visible below each vehicle marker on the live map without needing to click the marker.
</success_criteria>

<output>
After completion, create `.planning/quick/19-add-license-plate-label-under-each-vehic/19-01-SUMMARY.md`
</output>
