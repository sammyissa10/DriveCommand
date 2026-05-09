---
task: "223"
type: quick
title: "Add hard delete and resend invitation to carrier driver management"
status: planned
---

<objective>
Add two features to carrier driver management: (1) hard delete with safety checks for active dispatches and paid pay records, requiring typed name confirmation, and (2) resend invitation for drivers with PENDING/EXPIRED invitations.

Purpose: Carrier owners need to permanently remove drivers who are no longer associated with their fleet, and re-invite drivers whose invitations expired or were never accepted.
Output: DELETE handler on driver endpoint, new resend-invitation endpoint, and frontend UI (delete dialog + resend button) on the driver detail page.
</objective>

<context>
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
@apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
@apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
@apps/web/src/lib/email/send-driver-invitation.ts
@apps/web/prisma/schema.prisma (CarrierDriver model at line 1358, DriverInvitation at line 249, DriverPayRecord at line 1692, CarrierDispatch at line 1490)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Backend — deleteCarrierDriver and resendCarrierDriverInvitation lib functions</name>
  <files>apps/web/src/lib/carrier/fleet-drivers.ts</files>
  <action>
Add two new exported functions to fleet-drivers.ts:

**deleteCarrierDriver(orgId: string, driverId: string)**
1. Fetch the driver with `prisma.carrierDriver.findFirst({ where: { id: driverId, orgId } })` — return `{ error: 'Not found' }` if null (tenant isolation).
2. Check for active dispatches: query `prisma.carrierDispatch.count({ where: { OR: [{ primaryDriverId: driverId }, { coDriverId: driverId }], status: 'in_progress' } })`. If count > 0, return `{ error: 'Cannot delete a driver with an active dispatch. Complete or cancel the dispatch first.' }`.
3. Check for approved/paid pay records: query `prisma.driverPayRecord.count({ where: { driverId, status: { in: ['approved', 'paid'] } } })`. If count > 0, return `{ error: 'Cannot delete a driver with approved or paid pay records.' }`.
4. If checks pass, delete in order (use a `prisma.$transaction`):
   - `prisma.driverPayRecord.deleteMany({ where: { driverId } })` — delete all pay records (only pending/voided remain after checks)
   - `prisma.carrierExpense.deleteMany({ where: { driverId } })` — delete expenses
   - If driver.email: `prisma.driverInvitation.deleteMany({ where: { email: driver.email, tenantId: orgId } })` — delete invitations
   - `prisma.carrierDriver.delete({ where: { id: driverId } })` — delete the driver record
   - If driver.userId: check if user has other tenant associations (`prisma.user.findUnique` and check tenantId). If the user's tenantId matches orgId and no other CarrierDriver records reference this userId, delete the User record. Otherwise leave the User intact.
5. Return `{ deleted: true }`.
6. Return type: `Promise<{ deleted: true } | { error: string }>`.

**resendCarrierDriverInvitation(orgId: string, driverId: string)**
1. Fetch the driver with `prisma.carrierDriver.findFirst({ where: { id: driverId, orgId } })` — return `{ error: 'Not found' }` if null.
2. If no driver.email, return `{ error: 'Driver has no email address on file.' }`.
3. Find the most recent invitation: `prisma.driverInvitation.findFirst({ where: { email: driver.email, tenantId: orgId }, orderBy: { createdAt: 'desc' } })`.
4. If invitation exists and status is 'ACCEPTED', return `{ error: 'This driver has already accepted their invitation and has an active account.' }`.
5. If invitation exists and status is PENDING or EXPIRED, cancel it: `prisma.driverInvitation.updateMany({ where: { email: driver.email, tenantId: orgId, status: { in: ['PENDING', 'EXPIRED'] } }, data: { status: 'CANCELLED' } })`.
6. Create a new invitation record (same pattern as createCarrierDriver — 30-day expiry, PENDING status, include driver firstName/lastName/cdlNumber).
7. Fetch tenant name for the email (same pattern as createCarrierDriver).
8. Build acceptUrl and call `sendDriverInvitation()`.
9. On email success: return `{ sent: true, email: driver.email }`.
10. On email failure (catch around sendDriverInvitation only): return `{ sent: true, email: driver.email, warning: 'Invitation created but email failed to send' }` — never throw for email failures.
11. If no invitation existed at step 3, skip step 5 and go straight to step 6.
12. Return type: `Promise<{ sent: true; email: string; warning?: string } | { error: string }>`.

Import `getAppBaseUrl` (already imported) and `sendDriverInvitation` (already imported). No new imports needed.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors in fleet-drivers.ts.</verify>
  <done>Both functions exist, handle all edge cases, respect tenant isolation, and compile cleanly.</done>
</task>

<task type="auto">
  <name>Task 2: API routes — DELETE handler and resend-invitation POST endpoint</name>
  <files>
    apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
    apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/resend-invitation/route.ts
  </files>
  <action>
**Add DELETE handler to existing [id]/route.ts:**
1. Import `deleteCarrierDriver` from `@/lib/carrier/fleet-drivers`.
2. Add `export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> })`.
3. Get session, extract orgId (same pattern as existing GET/PATCH).
4. Call `deleteCarrierDriver(orgId, id)`.
5. If result has `error` property: if error is 'Not found' return 404, otherwise return 400 with `{ error: result.error }`.
6. Return `NextResponse.json({ deleted: true })`.
7. Wrap in try/catch, log errors, return 500.

**Create new resend-invitation/route.ts:**
1. Create the file at `apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/resend-invitation/route.ts`.
2. Import `NextRequest`, `NextResponse`, `getSession`, `logger`, and `resendCarrierDriverInvitation` from fleet-drivers.
3. Export `POST` handler following the same session/orgId pattern.
4. Call `resendCarrierDriverInvitation(orgId, id)`.
5. If result has `error`: if 'Not found' return 404, otherwise return 400 with the error message.
6. Return 200 with `{ sent: result.sent, email: result.email, ...(result.warning ? { warning: result.warning } : {}) }`.
7. Wrap in try/catch, log, return 500.

Both endpoints must validate session and orgId before any operation.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors. Confirm the new route file exists at the correct path.</verify>
  <done>DELETE /api/v1/carrier/fleet/drivers/[id] returns 200/400/404 correctly. POST /api/v1/carrier/fleet/drivers/[id]/resend-invitation returns 200/400/404 correctly.</done>
</task>

<task type="auto">
  <name>Task 3: Frontend — Delete dialog and Resend Invitation button on driver detail page</name>
  <files>
    apps/web/src/components/carrier/fleet/DeleteDriverDialog.tsx
    apps/web/src/components/carrier/fleet/ResendInvitationButton.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
  </files>
  <action>
**Create DeleteDriverDialog.tsx (client component):**
1. Props: `{ driverId: string; driverName: string; open: boolean; onOpenChange: (open: boolean) => void }`.
2. Use `Dialog` / `DialogContent` / `DialogHeader` / `DialogTitle` / `DialogDescription` / `DialogFooter` from `@/components/ui/dialog`.
3. State: `typedName` (string), `isDeleting` (boolean), `errorMessage` (string | null).
4. Dialog content:
   - Title: "Delete Driver"
   - Description: "This will permanently delete {driverName} and all associated records. This cannot be undone."
   - Input field with label: "Type the driver's full name to confirm:"
   - Placeholder: the driver's full name
   - If errorMessage is set, show it in a red `<p>` below the input (for backend 400 errors).
5. Footer: Cancel button + red "Delete Driver" button.
   - Delete button is `disabled` unless `typedName.trim() === driverName` (case-sensitive match) OR `isDeleting` is true.
   - Delete button uses `variant="destructive"` and shows `Loader2` spinner when deleting.
6. On confirm click: call `DELETE /api/v1/carrier/fleet/drivers/${driverId}`.
   - If response ok: `toast.success('Driver deleted')`, call `router.push('/carrier/fleet/drivers')`, call `router.refresh()`.
   - If response 400: parse error, set `errorMessage` to the error string, do NOT close the dialog.
   - If other error: `toast.error('Something went wrong')`.
7. Reset `typedName` and `errorMessage` when dialog opens/closes (in `onOpenChange` handler).

**Create ResendInvitationButton.tsx (client component):**
1. Props: `{ driverId: string; driverEmail: string; invitationStatus: string | null }`.
2. If `invitationStatus === 'ACCEPTED'`, render nothing (return null).
3. State: `isSending` (boolean), `hideButton` (boolean — set true if backend returns "already accepted").
4. Render a `Button` with `variant="outline"` labeled "Resend Invitation" with a `Mail` icon from lucide-react.
5. On click: call `POST /api/v1/carrier/fleet/drivers/${driverId}/resend-invitation`.
   - Success with no warning: `toast.success('Invitation resent to ${driverEmail}')`.
   - Success with warning: `toast.warning(response.warning)`.
   - 400 error: `toast.error(error message)`, set `hideButton = true` if the error mentions "already accepted".
6. If `hideButton` is true, render nothing.

**Update driver detail page ([id]/page.tsx):**
1. Convert the page header section to include the action buttons. Add a `'use client'` wrapper component (e.g., `DriverDetailActions`) or use the existing server component approach with client island components.
   - Actually: since the page is a server component, just import and render `DeleteDriverDialog` and `ResendInvitationButton` as client components. Pass driverId, driverName (`${driver.firstName} ${driver.lastName}`), driverEmail, and invitationStatus.
2. To get invitationStatus: in the page's data fetch, also query `prisma.driverInvitation.findFirst({ where: { email: driver.email, tenantId: orgId }, orderBy: { createdAt: 'desc' }, select: { status: true } })` — but since the page is a server component and the lib function already fetches the driver, add a new helper or inline the query. Simplest: add a `getDriverInvitationStatus(orgId: string, email: string)` function in fleet-drivers.ts that returns the latest invitation status, or just query inline in the page.
   - Best approach: query inline in the server page since it is a one-off. Use `prisma` directly (already used in other server pages) or add a small helper to fleet-drivers.ts.
   - Use fleet-drivers.ts: add `export async function getLatestInvitationStatus(orgId: string, email: string): Promise<string | null>` that returns the status of the most recent invitation, or null.
3. Place the buttons in the header area, next to the driver name:
   - ResendInvitationButton: shown when driver has an email
   - A "Delete Driver" button (red outline, Trash2 icon) that opens the DeleteDriverDialog on click — needs a thin client wrapper component `DriverDetailActions` that manages the dialog open state.
4. Create `DriverDetailActions.tsx` (client component) in the same fleet folder:
   - Props: `{ driverId: string; driverName: string; driverEmail: string | null; invitationStatus: string | null }`
   - Renders the delete button (Trash2 icon, red text, outline variant) + DeleteDriverDialog + ResendInvitationButton
   - Manages `deleteDialogOpen` state
5. Import and render `DriverDetailActions` in the page header, right-aligned next to the back link / name.

Use `toast` from `sonner` (already used in CarrierDriverForm), `useRouter` from `next/navigation`, `Button` from `@/components/ui/button`, and Dialog components from `@/components/ui/dialog`. Import `Trash2`, `Mail`, `Loader2` from `lucide-react`.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors. Visually confirm the driver detail page shows Delete Driver and Resend Invitation buttons.</verify>
  <done>Driver detail page has a red "Delete Driver" button that opens a typed-name confirmation dialog, and a "Resend Invitation" button visible only when invitation status is not ACCEPTED. Both call their respective API endpoints and show appropriate success/error feedback via toast.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors.
2. Navigate to a carrier driver detail page — Delete Driver and Resend Invitation buttons are visible.
3. Clicking Delete Driver opens the confirmation dialog requiring the full driver name to be typed.
4. Attempting to delete a driver with active dispatches shows the 400 error inside the dialog.
5. Resend Invitation button is hidden for drivers with ACCEPTED invitation status.
6. Clicking Resend Invitation shows a success toast with the driver's email.
</verification>

<success_criteria>
- Hard delete with safety checks (active dispatches, approved/paid pay records) works end-to-end
- Typed name confirmation prevents accidental deletion
- Resend invitation creates new invitation, cancels old one, sends email
- Resend button hidden for ACCEPTED invitations
- Tenant isolation enforced on both endpoints
- No TypeScript errors
</success_criteria>
