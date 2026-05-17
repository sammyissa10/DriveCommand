---
phase: quick-360
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/maps/live-map.tsx
  - apps/web/src/components/tracking/MapStyleConfig.ts
autonomous: true

must_haves:
  truths:
    - "Live tracking map renders tiles successfully in production"
    - "No Stadia 401 authentication errors in browser console"
    - "OpenStreetMap tiles load without fallback chain complexity"
  artifacts:
    - path: "apps/web/src/components/maps/live-map.tsx"
      provides: "Live map with working tile layer"
      contains: "tile.openstreetmap.org"
  key_links:
    - from: "apps/web/src/components/maps/live-map.tsx"
      to: "OpenStreetMap tile server"
      via: "TileLayer url prop"
      pattern: "https://\\{s\\}\\.tile\\.openstreetmap\\.org"
---

<objective>
Revert map tile configuration to pre-UX-refactor working state.

Purpose: Fix production Stadia 401 errors by restoring the simple OpenStreetMap tile layer that worked before quick-354.
Output: Working live map in production without authentication errors.
</objective>

<execution_context>
@/Users/ayazmohammed/.claude/get-shit-done/workflows/execute-plan.md
@/Users/ayazmohammed/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
Pre-refactor commit: 2f37e60d (fix(quick-257))
Refactor commit: 095b0b45 (feat(quick-354))

The refactor introduced MapStyleConfig.ts which tries:
1. MapTiler (requires NEXT_PUBLIC_MAPTILER_KEY - not set)
2. Stadia (free in dev, requires auth in production - causes 401)
3. OSM fallback (never reached because Stadia is returned)

Pre-refactor used simple OSM tiles directly:
- url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
- attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
</context>

<tasks>

<task type="auto">
  <name>Task 1: Revert TileLayer in live-map.tsx to pre-refactor OSM config</name>
  <files>apps/web/src/components/maps/live-map.tsx</files>
  <action>
In apps/web/src/components/maps/live-map.tsx:

1. Remove the import line:
   `import { getMapTileConfig, MAP_CSS_FILTER } from '@/components/tracking/MapStyleConfig';`

2. Remove the tileConfig constant (around line 158):
   `const tileConfig = getMapTileConfig();`

3. Remove the desaturated-tiles CSS rule from the style jsx block:
   ```
   .desaturated-tiles {
     filter: ${MAP_CSS_FILTER};
   }
   ```

4. Replace the TileLayer component (lines 178-183) with the pre-refactor version:
   ```tsx
   <TileLayer
     attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
     url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
   />
   ```

   Remove the maxZoom and className props that were added by the refactor.
  </action>
  <verify>
Run `tsc --noEmit` in apps/web to confirm no TypeScript errors.
Grep for "MapStyleConfig" in live-map.tsx - should return no results.
  </verify>
  <done>
TileLayer uses direct OSM URL. No reference to MapStyleConfig remains in live-map.tsx.
  </done>
</task>

<task type="auto">
  <name>Task 2: Delete MapStyleConfig.ts (created by quick-354 refactor)</name>
  <files>apps/web/src/components/tracking/MapStyleConfig.ts</files>
  <action>
Delete the file: apps/web/src/components/tracking/MapStyleConfig.ts

This file was created by commit 095b0b45 (quick-354) and is no longer imported anywhere after Task 1.

Verify no other files import from it:
`grep -r "MapStyleConfig" apps/web/src --include="*.tsx" --include="*.ts"`

Should return no results after Task 1 is complete.
  </action>
  <verify>
File apps/web/src/components/tracking/MapStyleConfig.ts no longer exists.
`grep -r "MapStyleConfig" apps/web/src` returns no results.
`tsc --noEmit` in apps/web passes.
  </verify>
  <done>
MapStyleConfig.ts is deleted. No orphan imports remain. TypeScript compiles successfully.
  </done>
</task>

</tasks>

<verification>
1. `tsc --noEmit` passes in apps/web
2. `grep -r "MapStyleConfig" apps/web/src` returns empty
3. `grep -r "stadiamaps.com" apps/web/src` returns empty
4. apps/web/src/components/tracking/MapStyleConfig.ts does not exist
5. live-map.tsx TileLayer uses "tile.openstreetmap.org" URL
</verification>

<success_criteria>
- Live tracking map loads OpenStreetMap tiles directly
- No Stadia tile requests (no 401 errors possible)
- No MapStyleConfig.ts file exists
- TypeScript compiles without errors
- All other UX updates (KpiStrip, FilterChips, ViewToggle, TruckRow, etc.) remain untouched
</success_criteria>

<output>
After completion, create `.planning/quick/360-revert-map-tile-configuration-to-pre-ux-/360-SUMMARY.md`
</output>
