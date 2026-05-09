---
phase: quick-222
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
autonomous: true
must_haves:
  truths:
    - "Creating a carrier driver with an email sends an invitation email to that address"
    - "The invitation email contains a working accept-invitation link"
    - "If the email send fails, the carrier driver record is still created and a warning is returned"
    - "The invitation is scoped to the correct orgId from the session, never from the request body"
    - "Creating a carrier driver without an email skips the invitation flow entirely"
  artifacts:
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "createCarrierDriver with invitation logic"
      contains: "driverInvitation.create"
    - path: "apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts"
      provides: "POST handler returning emailWarning if email send fails"
      contains: "emailWarning"
  key_links:
    - from: "apps/web/src/lib/carrier/fleet-drivers.ts"
      to: "apps/web/src/lib/email/send-driver-invitation.ts"
      via: "import sendDriverInvitation"
      pattern: "sendDriverInvitation"
    - from: "apps/web/src/lib/carrier/fleet-drivers.ts"
      to: "prisma.driverInvitation"
      via: "database create"
      pattern: "prisma\\.driverInvitation\\.create"
---

<objective>
Fix carrier driver creation to send an invitation email when a driver is created with an email address.

Purpose: Currently, creating a carrier driver saves the record but never notifies the driver. They have no way to set up their account. The main fleet module already has a working invitation flow (DriverInvitation model + sendDriverInvitation email helper). We need to reuse that same flow in the carrier driver creation path.

Output: Updated createCarrierDriver function that creates a DriverInvitation record and sends the invitation email after driver creation, with graceful email failure handling.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
@apps/web/src/app/(owner)/actions/drivers.ts (reference: inviteDriver function lines 25-163 show the existing invitation pattern)
@apps/web/src/lib/email/send-driver-invitation.ts (the email helper to reuse)
@apps/web/src/lib/app-url.ts (getAppBaseUrl for building the accept URL)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add invitation flow to createCarrierDriver</name>
  <files>apps/web/src/lib/carrier/fleet-drivers.ts, apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts</files>
  <action>
**In `apps/web/src/lib/carrier/fleet-drivers.ts`:**

1. Add imports at the top:
   - `import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';`
   - `import { getAppBaseUrl } from '@/lib/app-url';`
   - `import { logger } from '@/lib/logger';`

2. Change `createCarrierDriver` return type to include invitation status. Add a return type interface:
   ```ts
   export interface CreateCarrierDriverResult {
     driver: /* the prisma CarrierDriver return type */;
     emailSent: boolean;
     emailWarning?: string;
   }
   ```

3. Modify `createCarrierDriver` to return `CreateCarrierDriverResult` instead of the raw prisma result:

   a. After the existing `prisma.carrierDriver.create(...)` call (keep it exactly as-is), store the result in a `driver` variable.

   b. If `data.email` is provided (truthy), add an invitation block:
      - Cancel any existing PENDING DriverInvitation records for the same email + orgId (same pattern as the fleet module: `prisma.driverInvitation.updateMany` where email + tenantId + status PENDING -> set status CANCELLED).
      - Create a `DriverInvitation` record via `prisma.driverInvitation.create` with:
        - `tenantId: orgId`
        - `email: data.email`
        - `firstName: data.firstName`
        - `lastName: data.lastName`
        - `licenseNumber: data.cdlNumber || null`
        - `expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)` (30 days)
        - `status: 'PENDING'`
      - Fetch the tenant name: `prisma.tenant.findUnique({ where: { id: orgId }, select: { name: true } })` — fallback to `'your fleet'` if not found.
      - Build the accept URL: `${getAppBaseUrl()}/accept-invitation?id=${invitation.id}`
      - Call `sendDriverInvitation(data.email, { firstName, lastName, organizationName, acceptUrl, expiresAt formatted })` inside a try/catch.
      - If send succeeds: return `{ driver, emailSent: true }`.
      - If send fails: `logger.error(...)` and return `{ driver, emailSent: false, emailWarning: 'Driver created but invitation email failed to send. Please resend manually.' }`.
      - Wrap the ENTIRE invitation block (DriverInvitation create + email send) in a try/catch so that if even the DriverInvitation DB insert fails, the driver record is still returned successfully with a warning.

   c. If `data.email` is NOT provided: return `{ driver, emailSent: false }`.

**In `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`:**

4. Update the POST handler to handle the new return shape:
   - Change `const driver = await createCarrierDriver(...)` to `const result = await createCarrierDriver(...)`.
   - Build the response: `{ data: result.driver, ...(result.emailWarning ? { warning: result.emailWarning } : {}) }`.
   - Keep the 201 status code.

**Key constraints:**
- The `orgId` for the invitation MUST come from the session (already does — it's the `orgId` parameter passed from the route handler which reads `session.tenantId`). Do NOT read orgId from the request body.
- Do NOT modify the existing fleet driver invitation flow, email template, or DriverInvitation schema.
- Use the global `prisma` import already at the top of fleet-drivers.ts (not tenant-scoped prisma).
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — zero TypeScript errors. Grep for `sendDriverInvitation` in fleet-drivers.ts to confirm the import and call are present. Grep for `driverInvitation.create` in fleet-drivers.ts to confirm the DB record is created.
  </verify>
  <done>
(1) createCarrierDriver with an email creates a DriverInvitation record and calls sendDriverInvitation. (2) createCarrierDriver without an email skips the invitation flow. (3) A failed email send returns the driver record with an emailWarning string. (4) A failed DriverInvitation DB insert returns the driver record with a warning. (5) The API route returns the warning in the response if present. (6) No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with zero errors
- `grep -n "sendDriverInvitation" apps/web/src/lib/carrier/fleet-drivers.ts` shows import and usage
- `grep -n "driverInvitation" apps/web/src/lib/carrier/fleet-drivers.ts` shows create call
- `grep -n "emailWarning" apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` shows warning propagation
</verification>

<success_criteria>
- Creating a carrier driver with an email address creates a DriverInvitation record and sends the invitation email
- Creating a carrier driver without an email address works as before (no invitation)
- Email send failure does not prevent driver creation — returns success with warning
- DriverInvitation DB failure does not prevent driver creation — returns success with warning
- Invitation is always scoped to session orgId, never request body
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/222-fix-carrier-driver-creation-to-send-invi/222-SUMMARY.md`
</output>
