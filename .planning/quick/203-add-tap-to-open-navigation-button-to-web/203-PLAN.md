---
phase: quick-203
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/driver/route-detail-readonly.tsx
autonomous: true
must_haves:
  truths:
    - "Each PENDING or ARRIVED stop shows a Navigate button"
    - "Tapping Navigate opens Google Maps directions in a new tab"
    - "DEPARTED stops do NOT show a Navigate button"
    - "Button uses lat/lng when available, falls back to address string"
  artifacts:
    - path: "apps/web/src/components/driver/route-detail-readonly.tsx"
      provides: "Navigate button on stop cards"
      contains: "google.com/maps/dir"
  key_links:
    - from: "Navigate button href"
      to: "Google Maps Directions URL"
      via: "anchor tag with target=_blank"
      pattern: "google\\.com/maps/dir"
---

<objective>
Add a "Navigate" button to each stop in the web driver portal's route detail view that opens Google Maps directions in a new tab.

Purpose: Drivers using the web portal on their phone currently have to manually copy/paste addresses to navigate. This adds one-tap navigation like the mobile app already has.
Output: Updated route-detail-readonly.tsx with Navigate buttons on PENDING and ARRIVED stops.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/driver/route-detail-readonly.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Navigate button to stop cards in route-detail-readonly.tsx</name>
  <files>apps/web/src/components/driver/route-detail-readonly.tsx</files>
  <action>
Modify `apps/web/src/components/driver/route-detail-readonly.tsx`:

1. Update the `RouteStop` interface (line ~14) to add optional lat/lng fields:
   - `lat: number | null;` (Prisma returns Decimal but serialized as number)
   - `lng: number | null;`

2. Add a helper function `buildNavigationUrl` above the component:
   ```
   function buildNavigationUrl(stop: RouteStop): string {
     const destination = stop.lat != null && stop.lng != null
       ? `${stop.lat},${stop.lng}`
       : encodeURIComponent(stop.address);
     return `https://www.google.com/maps/dir/?api=1&destination=${destination}`;
   }
   ```

3. Import `Navigation` icon from `lucide-react` at the top of the file (add to existing imports or add new import).

4. In the **Active Stop Panel** (the blue highlighted card around line ~117-143): Add a Navigate button inside the existing `flex flex-wrap items-center gap-2` div, BEFORE the status badge. Only show when `activeStop.status !== 'DEPARTED'` (which is already guaranteed since activeStop filters out DEPARTED). Add:
   ```
   <a
     href={buildNavigationUrl(activeStop)}
     target="_blank"
     rel="noopener noreferrer"
     className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white min-h-[48px] hover:bg-emerald-700 transition-colors"
   >
     <Navigation className="h-4 w-4" />
     Navigate
   </a>
   ```

5. In the **All Stops list** (the `<ol>` around line ~199-225): For each stop where `stop.status !== 'DEPARTED'`, add a Navigate link below the stop address/type line, inside the `flex-1 min-w-0` div. Add:
   ```
   {stop.status !== 'DEPARTED' && (
     <a
       href={buildNavigationUrl(stop)}
       target="_blank"
       rel="noopener noreferrer"
       className="mt-1 inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white min-h-[36px] hover:bg-emerald-700 transition-colors"
     >
       <Navigation className="h-3.5 w-3.5" />
       Navigate
     </a>
   )}
   ```
   Note: The All Stops list button is smaller (text-xs, px-3 py-1.5) since it repeats for every stop. The Active Stop panel button is larger (text-sm, px-4 py-2.5, min-h-[48px]) for easy thumb tapping.

6. Do NOT modify any other files. Do NOT touch mobile app files, owner portal, or API routes.
  </action>
  <verify>
Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors.
Visually confirm the Navigate button renders by checking the component code has the anchor tags with correct Google Maps URL pattern.
  </verify>
  <done>
PENDING and ARRIVED stops show a green "Navigate" button with map icon. DEPARTED stops do not. Clicking opens Google Maps directions in a new tab using lat/lng when available, falling back to URL-encoded address. Button has min-h-[48px] on the active stop panel for mobile touch targets.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Navigate button appears only on PENDING and ARRIVED stops (not DEPARTED)
- Google Maps URL uses lat/lng format when coordinates exist, address format otherwise
- Links open in new tab with noopener noreferrer
- Touch target meets 48px minimum on the active stop panel
</verification>

<success_criteria>
- Driver can tap Navigate on any active stop to open Google Maps directions
- No regressions in existing stop display or Mark Departed functionality
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/203-add-tap-to-open-navigation-button-to-web/203-SUMMARY.md`
</output>
