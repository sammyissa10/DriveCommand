---
phase: quick-259
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/owner-shell.tsx
  - apps/web/src/components/navigation/notification-center.tsx
autonomous: true
must_haves:
  truths:
    - "Notification dropdown renders above Leaflet map tiles on the live-map page"
    - "Header bar renders above all map content"
  artifacts:
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "Header with z-[1001] stacking context"
      contains: "z-[1001]"
    - path: "apps/web/src/components/navigation/notification-center.tsx"
      provides: "Notification dropdown panel"
      contains: "z-[1001]"
  key_links:
    - from: "owner-shell.tsx header"
      to: "Leaflet map container"
      via: "z-index stacking order"
      pattern: "z-\\[1001\\]"
---

<objective>
Fix the notification bell dropdown being hidden behind the Leaflet map on the live-map page.

Purpose: The Leaflet map renders tiles at z-index 400+. The header element in owner-shell.tsx has no z-index, so even though notification-bell.tsx wrapper has z-[1001], it inherits the header's lower stacking context. The notification-center.tsx dropdown panel also only has z-50, which is below the map.

Output: Notification dropdown fully visible above the map on the live-map page.
</objective>

<context>
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/components/navigation/notification-bell.tsx
@apps/web/src/components/navigation/notification-center.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add z-[1001] to header and notification dropdown panel</name>
  <files>
    apps/web/src/components/navigation/owner-shell.tsx
    apps/web/src/components/navigation/notification-center.tsx
  </files>
  <action>
    Two changes needed:

    1. In `apps/web/src/components/navigation/owner-shell.tsx` line 22:
       Add `relative z-[1001]` to the header element's className.
       Change from:
         className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-4 lg:px-6"
       To:
         className="relative z-[1001] flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-4 lg:px-6"

       WHY: The header needs `relative` to establish a positioned stacking context, and `z-[1001]` to sit above the Leaflet map tiles (z-index 400+). Without this, child elements like the notification bell inherit the header's default stacking context which is below the map.

    2. In `apps/web/src/components/navigation/notification-center.tsx` line 146:
       Change `z-50` to `z-[1001]` on the outer div of the NotificationCenter component.
       Change from:
         className="... z-50 flex flex-col"
       To:
         className="... z-[1001] flex flex-col"

       WHY: z-50 is only z-index: 50, well below Leaflet's 400+. Match the parent bell wrapper's z-[1001].

    Do NOT modify notification-bell.tsx — it already has z-[1001] from task 254.
    Do NOT modify any map components.
    Do NOT change notification functionality.
  </action>
  <verify>
    1. Run `npx tsc --noEmit -p apps/web/tsconfig.json` — no new errors
    2. Visual check: Navigate to /owner/live-map, click notification bell — dropdown should render fully above map tiles
  </verify>
  <done>
    Notification dropdown renders above Leaflet map on the live-map page. Header bar sits above all map content.
  </done>
</task>

</tasks>

<verification>
- Notification bell dropdown is fully visible above the Leaflet map on the live-map page
- No visual regressions on other pages (header z-index should have no effect on non-map pages)
- TypeScript compiles without errors
</verification>

<success_criteria>
- Header has `relative z-[1001]` class
- NotificationCenter panel has `z-[1001]` instead of `z-50`
- Dropdown renders above map tiles on /owner/live-map
</success_criteria>
