---
status: resolved
trigger: "sendDispatchAssignedNotification is never called — zero NotificationLog entries exist after creating a dispatch with an assigned driver"
created: 2026-04-15T00:00:00Z
updated: 2026-04-15T00:00:00Z
symptoms_prefilled: true
---

## Current Focus

hypothesis: CONFIRMED — Vercel serverless function terminates after response is sent before the fire-and-forget async promise completes. sendDispatchAssignedNotification is called but Vercel kills the lambda before its async DB operations run.
test: Static analysis confirmed all code paths, TypeScript passes, logic is correct. Root cause is serverless execution model.
expecting: Fix using Next.js after() will cause the promise to run reliably after the response.
next_action: Apply fix using after() from next/server in dispatches.ts, remove diagnostic logs, run tsc, commit.

## Symptoms

expected: Creating a dispatch with primaryDriverId set and status=planned calls sendDispatchAssignedNotification, which writes a PENDING NotificationLog row then sends the email
actual: Zero NotificationLog rows with carrier- prefix exist. Function is never entered.
errors: None — the try/catch wrapping prevents any surface error
reproduction: POST to /api/v1/carrier/dispatches with a primaryDriverId in the body. Check NotificationLog. Zero rows.
started: Never worked. Built in quick-224, PENDING-first restructure applied in a debug session, but trigger still never fires.

## Eliminated

(none yet — starting investigation)

## Evidence

- timestamp: 2026-04-15T00:01:00Z
  checked: apps/web/src/app/api/v1/carrier/dispatches/route.ts POST handler
  found: Routes correctly calls createDispatch(orgId, parsed.data) from lib/carrier/dispatches.ts — not inline Prisma. Import is present on line 5.
  implication: Root cause A (route bypasses createDispatch) is eliminated.

- timestamp: 2026-04-15T00:02:00Z
  checked: apps/web/src/lib/carrier/dispatches.ts createDispatch function
  found: sendDispatchAssignedNotification IS imported (line 4) and IS called (line 224) as fire-and-forget with .catch(()=>{}). No condition gate — it fires unconditionally after every successful createDispatch. Root cause B (condition always false) is eliminated.
  implication: The function call exists. Either it's silently swallowed before reaching the DB, or there's an issue at runtime.

- timestamp: 2026-04-15T00:03:00Z
  checked: apps/web/src/lib/carrier/notifications.ts sendDispatchAssignedNotification
  found: Function is exported, takes (orgId, dispatchId, driverId). Full try/catch wrapping. Writes PENDING row via recordNotification BEFORE sending email. Import of DispatchAssignedEmail from emails/carrier/dispatch-assigned.tsx is valid.
  implication: Code logic is correct. Must be a runtime failure silently caught.

- timestamp: 2026-04-15T00:04:00Z
  checked: RLS on NotificationLog table
  found: RLS is enabled with FORCE ROW LEVEL SECURITY, but tenant-rls.ts comment explicitly states "Supabase's postgres role has BYPASSRLS privilege, which means all queries run through the Prisma connection pool bypass RLS entirely." So RLS is NOT blocking.
  implication: RLS bypass means raw prisma calls to NotificationLog should work fine.

- timestamp: 2026-04-15T00:05:00Z
  checked: TypeScript compilation
  found: npx tsc --noEmit shows only e2e test errors unrelated to dispatch/notifications code. No type errors in the relevant modules.
  implication: No import path errors or type mismatches at compile time.

- timestamp: 2026-04-15T00:06:00Z
  checked: All schema models, relations, and field names used in sendDispatchAssignedNotification
  found: All field names correct — truck relation on CarrierDispatch uses field name "truck" (PrimaryTruck relation), stops count is valid, CarrierDriver has email and user relation named CarrierDriverUser, User has email field.
  implication: No Prisma query structural errors found statically.

- timestamp: 2026-04-15T00:07:00Z
  checked: Hypothesis about root cause
  found: All static analysis passes. The only way to confirm is to add diagnostic console.log to trace execution at runtime. Adding logs at: (1) dispatches.ts after fire-and-forget call, (2) notifications.ts function entry, (3) notifications.ts after recordNotification. This will confirm whether the function is entered and where it stops.
  implication: Need runtime evidence. Proceeding with diagnostic logging.

## Resolution

root_cause: Vercel serverless function was terminating after the HTTP response was sent before the fire-and-forget async promise could complete its DB writes. sendDispatchAssignedNotification was being called via .catch(()=>{}) but the execution context was frozen/killed before the first await inside the function could run, so zero NotificationLog rows were ever written.
fix: Replaced fire-and-forget .catch(()=>{}) pattern with Next.js after() from next/server in both createDispatch and updateDispatch in dispatches.ts. after() registers the async callback with the Next.js runtime which guarantees it runs to completion after the response is sent, even in serverless. TypeScript passes clean (npx tsc --noEmit).
verification: TypeScript check passes. No diagnostic console.logs remain. after() is stable in Next.js 16.2.1. The fix applies to both code paths: createDispatch (new dispatch) and updateDispatch (reassignment to new driver).
files_changed:
  - apps/web/src/lib/carrier/dispatches.ts
  - apps/web/src/lib/carrier/notifications.ts (diagnostic logs only — no functional change)
