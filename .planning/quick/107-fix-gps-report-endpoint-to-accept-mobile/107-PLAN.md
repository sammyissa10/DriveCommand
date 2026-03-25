---
phase: quick-107
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/gps/report/route.ts
autonomous: true
must_haves:
  truths:
    - "Mobile app sending Bearer token can POST GPS coordinates and get 201"
    - "Web app using cookie session can still POST GPS coordinates and get 201"
    - "Non-DRIVER roles are rejected with 403 from both auth paths"
  artifacts:
    - path: "apps/web/src/app/api/gps/report/route.ts"
      provides: "Dual-auth GPS report endpoint"
      contains: "validateMobileToken"
  key_links:
    - from: "apps/web/src/app/api/gps/report/route.ts"
      to: "@/lib/auth/mobile-auth"
      via: "import validateMobileToken"
      pattern: "validateMobileToken"
---

<objective>
Fix the GPS report endpoint to accept mobile Bearer token authentication in addition to cookie-based web auth.

Purpose: The mobile driver app sends `Authorization: Bearer <token>` but `/api/gps/report` only calls `getSession()` (cookie-based), causing 401 errors from mobile GPS tracking.
Output: Updated route.ts that tries mobile token first, falls back to cookie session.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/gps/report/route.ts
@apps/web/src/lib/auth/mobile-auth.ts
@apps/web/src/lib/auth/session.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add dual-auth (mobile Bearer + web cookie) to GPS report endpoint</name>
  <files>apps/web/src/app/api/gps/report/route.ts</files>
  <action>
    Update the POST handler authentication section (steps 1-2) to:

    1. Import `validateMobileToken` from `@/lib/auth/mobile-auth` at the top of the file.

    2. Replace the current auth block (lines 16-24) with dual-auth logic:
       - First, try `validateMobileToken(req)`. If it returns a non-null `MobileAuthContext`, use it. The `MobileAuthContext` has `userId`, `tenantId`, and `role` fields which match what the rest of the handler needs from `session`.
       - If mobile auth returns null (no Bearer header or invalid token), fall back to `getSession()` for cookie-based web auth.
       - If both return null, return 401.

    3. After resolving auth from either path, check `role !== 'DRIVER'` and return 403 if not a driver. This check works the same for both auth types since both provide a `role` field.

    4. Create a normalized auth object like `{ userId, tenantId, role }` from whichever auth method succeeded, and use it in place of `session` throughout the rest of the handler (truckId resolution at line 69/83 uses `session.userId` and `session.tenantId`; GPSLocation create at line 100 uses `session.tenantId`; geofence check at line 115 uses `session.tenantId` and `session.userId`).

    The rest of the handler (body parsing, validation, truckId resolution, GPSLocation write, geofence check) stays exactly the same -- just replace `session.userId` and `session.tenantId` references with the normalized auth object's fields.
  </action>
  <verify>
    Run `npx tsc --noEmit --project apps/web/tsconfig.json` to verify no type errors.
    Visually confirm the file imports validateMobileToken and tries it before getSession.
  </verify>
  <done>
    The GPS report endpoint accepts both Bearer token (mobile) and cookie session (web) authentication. Non-driver roles are rejected with 403. All downstream logic (truckId resolution, GPS write, geofence check) works with either auth source.
  </done>
</task>

</tasks>

<verification>
- TypeScript compiles without errors
- Endpoint imports and calls validateMobileToken before getSession
- Both auth paths produce the same userId/tenantId/role shape for downstream logic
- 401 returned when neither auth method succeeds
- 403 returned for non-DRIVER roles regardless of auth method
</verification>

<success_criteria>
Mobile driver app can successfully POST to /api/gps/report with Bearer token and receive 201. Web cookie-based auth continues to work unchanged.
</success_criteria>

<output>
After completion, create `.planning/quick/107-fix-gps-report-endpoint-to-accept-mobile/107-SUMMARY.md`
</output>
