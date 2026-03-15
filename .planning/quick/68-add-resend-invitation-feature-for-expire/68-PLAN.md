---
phase: quick-68
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(admin)/actions/tenants.ts
  - src/app/(admin)/tenants/[id]/resend-invitation-button.tsx
  - src/app/(admin)/tenants/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Sysadmin sees expired invitation info with red Expired badge on tenant detail page"
    - "Sysadmin can click Resend Invitation to reset an expired invitation to PENDING with new 7-day expiry"
    - "Resend action sends the owner invitation email"
    - "Resend button also appears for pending invitations"
  artifacts:
    - path: "src/app/(admin)/actions/tenants.ts"
      provides: "getTenantById returns expiredOwnerInvitation, resendOwnerInvitation server action"
    - path: "src/app/(admin)/tenants/[id]/resend-invitation-button.tsx"
      provides: "Client component with resend button, pending/success/error states"
    - path: "src/app/(admin)/tenants/[id]/page.tsx"
      provides: "Updated owner section with expired invitation display and resend button"
  key_links:
    - from: "resend-invitation-button.tsx"
      to: "tenants.ts"
      via: "resendOwnerInvitation server action call"
    - from: "page.tsx"
      to: "resend-invitation-button.tsx"
      via: "import and render in owner section"
---

<objective>
Add "Resend Invitation" feature for expired (and pending) owner invitations on the sysadmin tenant detail page.

Purpose: When an owner invitation expires before the owner accepts, sysadmins currently have no way to resend it. This adds visibility of expired invitations and a one-click resend.
Output: Updated tenant detail page with expired invitation display and resend functionality.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(admin)/actions/tenants.ts
@src/app/(admin)/tenants/[id]/page.tsx
@src/app/(admin)/tenants/[id]/tenant-status-controls.tsx
@src/lib/email/send-owner-invitation.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update getTenantById and add resendOwnerInvitation server action</name>
  <files>src/app/(admin)/actions/tenants.ts</files>
  <action>
1. Update `getTenantById` — change the `driverInvitations` query to fetch both PENDING and EXPIRED:
   ```
   driverInvitations: {
     where: { role: 'OWNER', status: { in: ['PENDING', 'EXPIRED'] } },
     select: { id: true, email: true, firstName: true, lastName: true, createdAt: true, expiresAt: true, status: true },
     orderBy: { createdAt: 'desc' },
     take: 1,
   },
   ```
   In the return value, split into two properties:
   - `pendingOwnerInvitation`: first result if its status is 'PENDING', else null
   - `expiredOwnerInvitation`: first result if its status is 'EXPIRED', else null

2. Add new exported server action `resendOwnerInvitation(tenantId: string)`:
   - Call `requireAdminAccess()`
   - Find the tenant name: `prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })`
   - If tenant not found, return `{ success: false, error: 'Tenant not found' }`
   - Find the most recent OWNER invitation for this tenant where status is EXPIRED or PENDING:
     ```
     prisma.driverInvitation.findFirst({
       where: { tenantId, role: 'OWNER', status: { in: ['PENDING', 'EXPIRED'] } },
       orderBy: { createdAt: 'desc' },
     })
     ```
   - If no invitation found, return `{ success: false, error: 'No invitation found to resend' }`
   - Calculate new expiresAt: `new Date()` + 7 days
   - Update the invitation: `prisma.driverInvitation.update({ where: { id: invitation.id }, data: { status: 'PENDING', expiresAt } })`
   - Build acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/accept-invitation?id=${invitation.id}`
   - Call `sendOwnerInvitation(invitation.email, { firstName: invitation.firstName, lastName: invitation.lastName, organizationName: tenant.name, acceptUrl, expiresAt: expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) })`
   - Wrap email send in try/catch. On email failure: return `{ success: true, emailWarning: 'Invitation reset but email could not be sent...' }`
   - On success: `revalidatePath('/tenants/' + tenantId)` and return `{ success: true }`
   - Wrap entire logic in try/catch, return `{ success: false, error: 'Failed to resend invitation. Please try again.' }` on unexpected errors
  </action>
  <verify>TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -30`</verify>
  <done>getTenantById returns both pendingOwnerInvitation and expiredOwnerInvitation. resendOwnerInvitation action resets invitation to PENDING with new 7-day expiry and sends email.</done>
</task>

<task type="auto">
  <name>Task 2: Create ResendInvitationButton component and update tenant detail page</name>
  <files>src/app/(admin)/tenants/[id]/resend-invitation-button.tsx, src/app/(admin)/tenants/[id]/page.tsx</files>
  <action>
1. Create `resend-invitation-button.tsx` as a `'use client'` component. Follow the exact pattern from `tenant-status-controls.tsx`:
   - Props: `{ tenantId: string }`
   - Use `useState` for status: `'idle' | 'success' | 'error'` and error message
   - Use `useTransition` for pending state
   - Use `useRouter` for refresh after success
   - On click: call `resendOwnerInvitation(tenantId)`. On success, set status to 'success' and `router.refresh()`. If result has emailWarning, show it. On failure, set error message.
   - Render a button styled like the TenantStatusControls buttons:
     - idle: blue bg (`bg-blue-600 hover:bg-blue-700`), text "Resend Invitation"
     - pending: disabled, text "Sending..."
     - success: green bg (`bg-green-600`), text "Invitation Sent!" (auto-reset to idle after 3 seconds via setTimeout)
     - error: show red error banner above button (same pattern as TenantStatusControls error)
   - Button classes: `inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors`

2. Update `page.tsx`:
   - Import `ResendInvitationButton` from `./resend-invitation-button`
   - Update the Owner section conditional rendering (lines 128-157) to three branches:
     a. `tenant.ownerUser` — show active owner info + OwnerEmailForm (unchanged)
     b. `tenant.pendingOwnerInvitation` — show pending invitation info (unchanged) PLUS add `<ResendInvitationButton tenantId={tenant.id} />` below the expiry text
     c. `tenant.expiredOwnerInvitation` — new branch: show name, email, and a red expired badge:
        ```
        <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">Expired</span>
        ```
        Show expiry date: "Expired on {date}". Add `<ResendInvitationButton tenantId={tenant.id} />` below.
     d. Else — "No owner configured" (unchanged)
  </action>
  <verify>Run `npx tsc --noEmit --pretty 2>&1 | head -30` to confirm no type errors. Run `npm run build 2>&1 | tail -20` to confirm build succeeds.</verify>
  <done>Tenant detail page shows expired invitations with red badge and Resend Invitation button. Pending invitations also show the resend button. Button calls server action and shows success/error feedback.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- `npm run build` completes successfully
- Navigate to /admin/tenants/[id] for a tenant with an expired owner invitation: expired invitation info visible with red "Expired" badge and "Resend Invitation" button
- Click "Resend Invitation": button shows "Sending..." then "Invitation Sent!", page refreshes to show invitation as PENDING with new expiry date
</verification>

<success_criteria>
- Expired owner invitations are visible on the tenant detail page with a red "Expired" badge
- Resend Invitation button appears for both expired and pending invitations
- Clicking resend resets invitation to PENDING with new 7-day expiry and sends email
- Button provides clear feedback: pending, success, and error states
- Build compiles without errors
</success_criteria>

<output>
After completion, create `.planning/quick/68-add-resend-invitation-feature-for-expire/68-SUMMARY.md`
</output>
