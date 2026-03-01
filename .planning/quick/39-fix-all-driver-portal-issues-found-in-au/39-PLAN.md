---
phase: quick-39
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(driver)/layout.tsx
  - src/components/driver/gps-tracker.tsx
  - src/app/(driver)/page.tsx
  - src/app/(driver)/hours/page.tsx
  - src/app/(driver)/my-route/page.tsx
  - src/app/(driver)/actions/driver-documents.ts
  - src/components/driver/document-list-readonly.tsx
  - src/app/(driver)/actions/driver-messages.ts
  - src/app/(driver)/actions/driver-incidents.ts
  - src/app/(driver)/error.tsx
autonomous: true
must_haves:
  truths:
    - "Driver portal does not crash during static pre-rendering at build time"
    - "GPS tracker component does not violate React Rules of Hooks"
    - "Driver pages gracefully handle server action failures with fallback values"
    - "Document list renders correctly in dark mode"
    - "Driver portal has an error boundary catching unexpected crashes"
  artifacts:
    - path: "src/app/(driver)/layout.tsx"
      provides: "force-dynamic export preventing static pre-render"
      contains: "export const dynamic"
    - path: "src/components/driver/gps-tracker.tsx"
      provides: "Hooks-compliant GPS tracker"
    - path: "src/app/(driver)/error.tsx"
      provides: "Error boundary for driver portal"
  key_links: []
---

<objective>
Fix all driver portal issues found in audit — 5 HIGH, 4 MEDIUM, 1 LOW fix across 10 files.

Purpose: Prevent build failures, React hooks violations, unhandled server errors, dark mode breakage, and missing error boundary in the driver portal.
Output: All 10 driver portal files fixed, TypeScript clean.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix HIGH issues — force-dynamic, hooks violation, try/catch on pages</name>
  <files>
    src/app/(driver)/layout.tsx
    src/components/driver/gps-tracker.tsx
    src/app/(driver)/page.tsx
    src/app/(driver)/hours/page.tsx
    src/app/(driver)/my-route/page.tsx
  </files>
  <action>
Read each file before editing.

1. `src/app/(driver)/layout.tsx` — Add `export const dynamic = 'force-dynamic';` at the top of the file (after imports, before the component function). This prevents Next.js from attempting static pre-rendering at build time.

2. `src/components/driver/gps-tracker.tsx` — Fix Rules of Hooks violation. The `if (!truckId) return null` on line 29 is BEFORE two `useEffect` calls on lines 33 and 56. Fix by:
   - Remove the early return on line 29
   - Remove the two `// eslint-disable-next-line react-hooks/rules-of-hooks` comments
   - At the END of the component (just before the return JSX block around line 152), add: `if (!truckId) return null;`
   - This ensures all hooks run unconditionally, and the early return happens AFTER hooks but BEFORE rendering
   - Do NOT change any hook logic or other code

3. `src/app/(driver)/page.tsx` — Wrap `getMyAssignedRoute()` in try/catch. On failure, set route to null (which renders the "No Route Assigned" empty state). Add console.error in catch block.

4. `src/app/(driver)/hours/page.tsx` — Wrap `getDriverHOS()` in try/catch. On failure, fall back to `[]` (empty array). Pass fallback to HOSDashboard. Add console.error in catch block.

5. `src/app/(driver)/my-route/page.tsx` — Wrap `getMyAssignedRoute()` in try/catch. On failure, set route to null (which renders the existing "No route assigned" empty state). Also wrap the `Promise.all([getMyRouteDocuments(), getMyTruckDocuments()])` in its own try/catch, falling back to `[[], []]`. Add console.error in catch blocks.
  </action>
  <verify>Run `npx tsc --noEmit` from project root — zero errors.</verify>
  <done>All 5 HIGH issues fixed: force-dynamic export added, hooks violation resolved (early return after all hooks), three driver pages have try/catch with safe fallbacks.</done>
</task>

<task type="auto">
  <name>Task 2: Fix MEDIUM issues and create error boundary</name>
  <files>
    src/app/(driver)/actions/driver-documents.ts
    src/components/driver/document-list-readonly.tsx
    src/app/(driver)/actions/driver-messages.ts
    src/app/(driver)/actions/driver-incidents.ts
    src/app/(driver)/error.tsx
  </files>
  <action>
Read each file before editing.

1. `src/app/(driver)/actions/driver-documents.ts` — In `getMyTruckDocuments()`, add null guard on line 93: before calling `repo.findByTruckId(route.truckId)`, check `if (!route.truckId) return [];`. The route.truckId can be null if no truck is assigned yet.

2. `src/components/driver/document-list-readonly.tsx` — Replace all hardcoded light-mode classes with design token classes:
   - `bg-white` -> `bg-card`
   - `border-gray-200` -> `border-border`
   - `divide-gray-200` -> `divide-border`
   - `text-gray-900` -> `text-foreground`
   - `text-gray-500` -> `text-muted-foreground`
   - `text-gray-400` -> `text-muted-foreground/40`
   - `bg-gray-100 text-gray-800` -> `bg-muted text-muted-foreground`
   - `bg-red-100 text-red-800` -> `bg-red-500/10 text-red-500` (PDF badge — works in both modes)
   - `bg-blue-100 text-blue-800` -> `bg-blue-500/10 text-blue-500` (image badge — works in both modes)
   - Keep the blue-600/700 on the Download button (brand action color, acceptable in both modes)

3. `src/app/(driver)/actions/driver-messages.ts` — Remove dead imports. Currently imports `requireAuth`, `getTenantPrisma`, `requireTenantId`, and `getSession` — none of which are used in any function body. Keep only `requireRole` and `UserRole` imports.

4. `src/app/(driver)/actions/driver-incidents.ts` — Remove dead imports. Currently imports `getSession`, `getTenantPrisma`, `requireTenantId`, and `revalidatePath` — none of which are used. Keep only `requireRole` and `UserRole` imports.

5. `src/app/(driver)/error.tsx` — Create new file. Use same pattern as `src/app/(owner)/error.tsx` but adapted for driver portal:
   - 'use client' directive
   - Console.error the error in useEffect
   - Show "Something went wrong" heading with error.message
   - Show error digest if present
   - "Try again" button calling reset()
   - "Back to Home" link pointing to `/` (driver root, not /dashboard)
   - Use design token classes (text-foreground, text-muted-foreground, bg-primary, etc.)
  </action>
  <verify>Run `npx tsc --noEmit` from project root — zero errors.</verify>
  <done>Null guard on truckId in driver-documents, dark mode tokens on document-list-readonly, dead imports removed from driver-messages and driver-incidents, error boundary created for driver portal.</done>
</task>

</tasks>

<verification>
Run `npx tsc --noEmit` — zero TypeScript errors across all modified files.
Visually: no hardcoded gray/white classes remain in document-list-readonly.tsx.
</verification>

<success_criteria>
- `export const dynamic = 'force-dynamic'` exists in driver layout
- No hooks called after conditional return in gps-tracker.tsx
- All three driver pages (page.tsx, hours/page.tsx, my-route/page.tsx) have try/catch with fallbacks
- `getMyTruckDocuments` guards against null truckId
- document-list-readonly.tsx uses only design token classes (no bg-white, text-gray-*)
- driver-messages.ts and driver-incidents.ts have no unused imports
- src/app/(driver)/error.tsx exists with retry button
- `npx tsc --noEmit` passes clean
</success_criteria>

<output>
After completion, create `.planning/quick/39-fix-all-driver-portal-issues-found-in-au/39-SUMMARY.md`
</output>
