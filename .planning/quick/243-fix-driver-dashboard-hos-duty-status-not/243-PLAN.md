---
phase: quick-243
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(driver)/actions/driver-hos.ts
  - apps/web/src/components/driver/driver-hos-widget.tsx
autonomous: true
must_haves:
  truths:
    - "Tapping a duty status button writes a DriverHOSEntry row to the database"
    - "Refreshing the driver dashboard shows the last-saved duty status highlighted"
    - "Widget renders even when no prior HOS entries exist (defaults to OFF_DUTY)"
  artifacts:
    - path: "apps/web/src/app/(driver)/actions/driver-hos.ts"
      provides: "Real DB-backed updateDutyStatus and getDriverHOS"
      contains: "prisma.driverHOSEntry"
    - path: "apps/web/src/components/driver/driver-hos-widget.tsx"
      provides: "Widget that always renders with fallback"
  key_links:
    - from: "apps/web/src/app/(driver)/actions/driver-hos.ts"
      to: "prisma.driverHOSEntry"
      via: "create + updateMany + findFirst"
      pattern: "prisma\\.driverHOSEntry\\.(create|updateMany|findFirst)"
---

<objective>
Fix driver dashboard HOS duty status so it persists to the database instead of returning hardcoded stubs.

Purpose: Drivers currently see a status widget that appears to work (optimistic UI) but never saves — status resets on refresh and no DriverHOSEntry rows are created.
Output: Working HOS status persistence via DriverHOSEntry table.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (DriverHOSEntry model, HOSDutyStatus enum)
@apps/web/src/lib/auth/supabase.ts (getSession → SessionData with userId, tenantId)
@apps/web/src/lib/db/prisma.ts (prisma client import)
@apps/web/src/app/(driver)/actions/driver-hos.ts (stub to replace)
@apps/web/src/components/driver/driver-hos-widget.tsx (widget to fix)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire updateDutyStatus and getDriverHOS to the database</name>
  <files>apps/web/src/app/(driver)/actions/driver-hos.ts</files>
  <action>
Replace the entire stub implementation in `driver-hos.ts` with real DB operations.

**Imports to add:**
- `import { getSession } from '@/lib/auth/supabase';`
- `import { prisma } from '@/lib/db/prisma';`
- `import { HOSDutyStatus } from '@/generated/prisma';`
- Keep `import type { ActionState } from '@drivecommand/types'`
- Remove `requireRole` and `UserRole` imports (no longer needed — getSession handles auth)

**`getDriverHOS()` — replace stub with:**
1. Call `const session = await getSession();` — if null, return null
2. Query latest entry: `prisma.driverHOSEntry.findFirst({ where: { driverId: session.userId, tenantId: session.tenantId }, orderBy: { startTime: 'desc' } })`
3. Return object matching `HosData` interface: `{ currentStatus: latestEntry?.status ?? 'OFF_DUTY', onDutyHoursUsed: 0, drivingHoursUsed: 0, drivingHoursRemaining: 11, onDutyHoursRemaining: 14 }` — hours remain placeholders for now, the critical fix is `currentStatus` from DB

**`updateDutyStatus(prevState, formData)` — replace stub with:**
1. Call `const session = await getSession();` — if null, return `{ error: 'Not authenticated' }`
2. Extract and validate `status` from formData (keep existing validStatuses check)
3. Cast status: `const hosStatus = status as HOSDutyStatus;`
4. In a try/catch block:
   - Close previous open entry: `await prisma.driverHOSEntry.updateMany({ where: { driverId: session.userId, tenantId: session.tenantId, endTime: null }, data: { endTime: new Date() } });`
   - Create new entry: `await prisma.driverHOSEntry.create({ data: { tenantId: session.tenantId, driverId: session.userId, status: hosStatus, startTime: new Date() } });`
   - Return `{ success: true, message: \`Status updated to \${status}\` }`
5. In catch: return `{ error: 'Failed to update duty status. Please try again.' }`

**Tenant isolation:** Both queries filter by `tenantId` from session. The `driverId` field maps to `User.id` (not CarrierDriver.id) per schema comment.
  </action>
  <verify>Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json` — no errors in driver-hos.ts</verify>
  <done>updateDutyStatus writes DriverHOSEntry rows; getDriverHOS reads latest status from DB; both scoped by tenantId</done>
</task>

<task type="auto">
  <name>Task 2: Fix widget to render without prior HOS data</name>
  <files>apps/web/src/components/driver/driver-hos-widget.tsx</files>
  <action>
In `driver-hos-widget.tsx`, remove the early return guard on lines 59-61:

```
// REMOVE THIS:
if (!hos) {
  return null;
}
```

The widget already has `const defaultStatus = hos?.currentStatus ?? 'OFF_DUTY'` on line 55 which handles null `hos`.

Fix the hours display on line 64 to handle null `hos`:
- Change `hos.onDutyHoursUsed` to `hos?.onDutyHoursUsed ?? 0` so it shows "0m on duty today" instead of crashing when `hos` is null.

No other changes needed — the rest of the widget already uses `optimisticStatus` (derived from `defaultStatus`) for rendering.
  </action>
  <verify>Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json` — no errors in driver-hos-widget.tsx</verify>
  <done>Widget renders with OFF_DUTY default when no HOS data exists; shows actual status when data is present; no null reference crashes</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p apps/web/tsconfig.json` passes with zero errors
2. Manual test: log in as driver, tap a status button, refresh page — status persists
3. Check DB: `SELECT * FROM "DriverHOSEntry" ORDER BY "startTime" DESC LIMIT 5;` shows new rows after status changes
</verification>

<success_criteria>
- Duty status changes persist to DriverHOSEntry table
- Page refresh shows previously selected status
- Widget renders for drivers with no prior HOS entries (defaults to OFF_DUTY)
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/243-fix-driver-dashboard-hos-duty-status-not/243-SUMMARY.md`
</output>
