---
phase: quick-234
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/driver/driver-messages-preview.tsx
  - apps/web/src/components/driver/driver-dispatch-card.tsx
autonomous: true
must_haves:
  truths:
    - "Driver dashboard loads with zero React hydration warnings (error #418) in browser console"
    - "Relative timestamps in messages preview display correctly after mount"
    - "Dispatch card dates display correctly after mount"
    - "Server-rendered HTML matches client initial render exactly"
  artifacts:
    - path: "apps/web/src/components/driver/driver-messages-preview.tsx"
      provides: "Hydration-safe relative timestamps"
      contains: "useEffect"
    - path: "apps/web/src/components/driver/driver-dispatch-card.tsx"
      provides: "Hydration-safe date formatting"
      contains: "useEffect"
  key_links:
    - from: "apps/web/src/components/driver/driver-dashboard.tsx"
      to: "driver-messages-preview.tsx"
      via: "props: recentMessages"
    - from: "apps/web/src/components/driver/driver-dashboard.tsx"
      to: "driver-dispatch-card.tsx"
      via: "props: dispatch"
---

<objective>
Fix all remaining React hydration mismatches (error #418) on the driver portal dashboard.

Purpose: The dashboard built in quick-232 has components that compute time-dependent values during render (relativeTime, Intl.DateTimeFormat). Server renders with UTC/server locale, client renders with user's local timezone — producing different HTML and triggering React error #418.

Output: Zero hydration warnings on driver dashboard load.
</objective>

<context>
@apps/web/src/components/driver/driver-messages-preview.tsx
@apps/web/src/components/driver/driver-dispatch-card.tsx
@apps/web/src/components/driver/driver-dashboard.tsx
@apps/web/src/app/(driver)/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix relativeTime hydration mismatch in DriverMessagesPreview</name>
  <files>apps/web/src/components/driver/driver-messages-preview.tsx</files>
  <action>
The `relativeTime()` function (lines 16-29) is called directly in JSX render at line 60: `{relativeTime(msg.createdAt)}`. This calls `Date.now()` during render, producing different values on server vs client.

Fix:
1. Add `useState` and `useEffect` imports (useState already not imported, add both from react).
2. Add a `mounted` state: `const [mounted, setMounted] = useState(false)` and `useEffect(() => setMounted(true), [])`.
3. Replace the inline `{relativeTime(msg.createdAt)}` on line 60 with a conditional:
   - Before mount: render the raw ISO date as a short date string using a static formatter that produces identical output server and client. Use a simple approach: render an empty string or a static placeholder like the date portion only (e.g., just show nothing or a non-breaking space).
   - After mount: render `{relativeTime(msg.createdAt)}` as before.
   
Simplest correct approach: render `{mounted ? relativeTime(msg.createdAt) : '\u00A0'}` (non-breaking space keeps layout stable). The messages are fetched server-side and passed as props, so the server will render the nbsp, and on client hydration the initial render also renders nbsp (since mounted starts false), then useEffect fires and switches to relative time. Zero mismatch.
  </action>
  <verify>
Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit --project apps/web/tsconfig.json` — no type errors in the modified file.
Open driver dashboard in browser, check console for zero React error #418 warnings. Messages preview should show relative times after a brief moment.
  </verify>
  <done>DriverMessagesPreview renders without hydration mismatch. Relative timestamps appear after client mount. No layout shift (nbsp placeholder maintains space).</done>
</task>

<task type="auto">
  <name>Task 2: Fix Intl.DateTimeFormat hydration mismatch in DriverDispatchCard</name>
  <files>apps/web/src/components/driver/driver-dispatch-card.tsx</files>
  <action>
The `formatDate()` function (lines 38-47) uses `new Intl.DateTimeFormat('en-US', ...)` during render. This produces locale/timezone-dependent output that differs between server (UTC) and client (user's local TZ), causing hydration mismatch on lines 106 and 129.

Fix:
1. Add `useState` and `useEffect` imports from react.
2. Add a `mounted` state: `const [mounted, setMounted] = useState(false)` and `useEffect(() => setMounted(true), [])` inside the `DriverDispatchCard` component (after the early return for null dispatch).
   
   Actually, place the hooks BEFORE the early return `if (!dispatch)` — React hooks cannot be called conditionally. Move the hooks to the top of the component, before any early returns.

3. Update `formatDate` usage at lines 106 and 129:
   - Line 106: `{mounted ? formatDate(dispatch.scheduledDeparture) : '\u00A0'}`
   - Line 129: `{mounted ? formatDate(nextStop.scheduledArrival) : '\u00A0'}`

This ensures server and client initial render both output nbsp (no mismatch), then dates appear after mount.
  </action>
  <verify>
Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit --project apps/web/tsconfig.json` — no type errors.
Open driver dashboard with an active dispatch in browser, confirm dates appear after mount with no console errors.
  </verify>
  <done>DriverDispatchCard renders without hydration mismatch. Scheduled departure and next stop arrival dates display correctly after client mount.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit --project apps/web/tsconfig.json` passes with no errors in modified files
2. Load driver dashboard in browser — zero React error #418 in console
3. Messages preview shows relative timestamps (e.g., "5m ago") after mount
4. Dispatch card shows formatted dates after mount
5. No visual layout shift — placeholder spaces maintain element dimensions
</verification>

<success_criteria>
- Driver portal dashboard loads with zero React hydration warnings in browser console
- All time-dependent rendering deferred to client via mounted pattern
- No regressions in dashboard functionality or appearance
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/234-fix-all-remaining-react-hydration-mismat/234-SUMMARY.md`
</output>
