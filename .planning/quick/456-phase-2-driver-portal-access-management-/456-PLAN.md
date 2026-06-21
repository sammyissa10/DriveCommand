---
phase: quick-456
plan: 456
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/components/carrier/fleet/PortalAccessControls.tsx
  - apps/web/src/components/carrier/fleet/DriverDetailActions.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
  - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
autonomous: true

must_haves:
  truths:
    - "OWNER/MANAGER sees a portal-access status badge on the carrier driver detail page reflecting the driver's real state"
    - "When access is active, OWNER/MANAGER can click Revoke access, confirm a sign-out warning, and the badge updates to Access suspended"
    - "When access is suspended, OWNER/MANAGER can click Restore access and the badge updates to Portal access active"
    - "The edit form no longer shows a raw Linked User ID text input"
    - "Email-invite create/update path still works (userId set by invite flow, not by form)"
  artifacts:
    - path: "apps/web/src/components/carrier/fleet/PortalAccessControls.tsx"
      provides: "Client component rendering status badge + revoke/restore controls with confirm dialog"
      min_lines: 60
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "getCarrierDriver selects user.isActive"
      contains: "isActive: true"
  key_links:
    - from: "PortalAccessControls.tsx"
      to: "/api/v1/carrier/fleet/drivers/[id]/revoke-access"
      via: "fetch POST then router.refresh"
      pattern: "revoke-access"
    - from: "PortalAccessControls.tsx"
      to: "/api/v1/carrier/fleet/drivers/[id]/restore-access"
      via: "fetch POST then router.refresh"
      pattern: "restore-access"
    - from: "page.tsx"
      to: "DriverDetailActions / PortalAccessControls"
      via: "passes userId, userIsActive, invitationStatus, canManageAccess"
      pattern: "userIsActive"
---

<objective>
Surface driver portal-access state and add revoke/restore controls on the carrier driver detail page, and remove the confusing raw "Linked User ID" form field.

Purpose: Phase 1 (QT 454/455) shipped verified backend (revoke/restore actions + POST routes, OWNER/MANAGER-gated, tenant-safe). This phase makes access VISIBLE and controllable, and removes the manual UUID footgun.
Output: A portal-access status badge + conditional revoke/restore buttons (confirm step on revoke) on the detail page; getCarrierDriver returns user.isActive; CarrierDriverForm no longer has the Linked User ID input.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Existing patterns to mirror (DO NOT rebuild these)
@apps/web/src/components/carrier/fleet/ResendInvitationButton.tsx
@apps/web/src/components/carrier/fleet/DriverDetailActions.tsx
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
@apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add user.isActive to getCarrierDriver query</name>
  <files>apps/web/src/lib/carrier/fleet-drivers.ts</files>
  <action>
In `getCarrierDriver` (around line 137), change the `user` include from `user: { select: { email: true } }` to `user: { select: { email: true, isActive: true } }`.

Do NOT touch any other function in this file. In particular do NOT modify `revokeCarrierDriverAccess`, `restoreCarrierDriverAccess`, `listCarrierDrivers`, `createCarrierDriver`, or `updateCarrierDriver` logic. The only edit is adding `isActive: true` to the user select inside `getCarrierDriver`.

This is needed so the detail page can distinguish "Portal access active" (user.isActive === true) from "Access suspended" (user.isActive === false).
  </action>
  <verify>Grep confirms `isActive: true` appears inside the getCarrierDriver user select. `tsc --noEmit` introduces no new errors in this file.</verify>
  <done>getCarrierDriver returns driver.user with both email and isActive.</done>
</task>

<task type="auto">
  <name>Task 2: Create PortalAccessControls component and wire it into the detail page</name>
  <files>apps/web/src/components/carrier/fleet/PortalAccessControls.tsx, apps/web/src/components/carrier/fleet/DriverDetailActions.tsx, apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx</files>
  <action>
**A. Create `apps/web/src/components/carrier/fleet/PortalAccessControls.tsx`** — a `'use client'` component. Props:
```ts
interface Props {
  driverId: string;
  userId: string | null;
  userIsActive: boolean | null;   // from driver.user.isActive (null if no linked user)
  invitationStatus: string | null; // ACCEPTED | PENDING | EXPIRED | CANCELLED | null
  canManageAccess: boolean;        // OWNER or MANAGER
}
```

Compute the access state (a single derived string) using this exact precedence:
- `userId` set AND `userIsActive === false` → state `'suspended'` → badge "Access suspended", red (use `border-red-500 text-red-600 dark:text-red-400` outline Badge, matching the page's existing badge style).
- `userId` set AND `invitationStatus === 'ACCEPTED'` AND `userIsActive !== false` → state `'active'` → badge "Portal access active", green (`border-green-500 text-green-600 dark:text-green-400`).
- `userId` set AND `userIsActive !== false` (accepted not yet reflected but linked + active) → also `'active'`. (Fold this into the active branch: treat `userId` set && `userIsActive !== false` as active.)
- `userId` null AND `invitationStatus === 'PENDING'` → state `'pending'` → badge "Invitation pending", amber (`border-amber-500 text-amber-600 dark:text-amber-400`).
- otherwise (`userId` null, no/expired/cancelled invitation) → state `'none'` → badge "No portal access", muted (`border-border text-muted-foreground`).

Render the Badge always (variant="outline", import from `@/components/ui/badge`).

Controls (only when `canManageAccess === true`):
- state `'active'` → a "Revoke access" button (outline, size sm, red text classes like DriverDetailActions delete button uses). Clicking opens an AlertDialog confirm (import the shadcn AlertDialog primitives from `@/components/ui/alert-dialog`, same primitives DeleteDriverDialog uses). Dialog title "Revoke portal access?", description: "This will sign the driver out immediately and they will lose portal access until you restore it." Confirm action label "Revoke access". On confirm: `fetch('/api/v1/carrier/fleet/drivers/' + driverId + '/revoke-access', { method: 'POST' })`.
- state `'suspended'` → a single-click "Restore access" button (outline, size sm, no confirm): `fetch('/api/v1/carrier/fleet/drivers/' + driverId + '/restore-access', { method: 'POST' })`.
- states `'pending'` and `'none'` → render NO button here (the existing ResendInvitationButton in DriverDetailActions covers invite/resend — do not duplicate it).

Fetch handling pattern (mirror ResendInvitationButton.tsx):
- `const [isBusy, setIsBusy] = useState(false)`; disable button while busy.
- `import { toast } from 'sonner'` and `import { useRouter } from 'next/navigation'`.
- On success (`res.ok`): `toast.success(...)` ("Portal access revoked" / "Portal access restored"), then `router.refresh()` so the page re-fetches and the badge + controls update.
- On error: parse `await res.json().catch(() => ({}))`, `toast.error(data.error ?? 'Something went wrong')`. (This surfaces the route's 400 "no linked account" message.)
- Wrap in try/catch; in catch `toast.error('Something went wrong')`; `setIsBusy(false)` in finally.

TypeScript strict, no `any`.

**B. Update `DriverDetailActions.tsx`** to render PortalAccessControls. Add props `userId: string | null`, `userIsActive: boolean | null`, `canManageAccess: boolean` to its `Props` interface. Render `<PortalAccessControls .../>` inside the existing flex container, before the ResendInvitationButton (or adjacent — keep it in the same action row). Keep ResendInvitationButton and DeleteDriverDialog exactly as-is. The Delete button should remain gated as it currently is (no change to delete behavior). Pass `canManageAccess` only to PortalAccessControls.

**C. Update `page.tsx`** where `<DriverDetailActions />` is rendered (around line 134):
- Compute `const canManageAccess = role === 'OWNER' || role === 'MANAGER';` (role is already uppercased at line 64; note SYSTEM_ADMIN can already edit — include OWNER and MANAGER per spec; you may also include SYSTEM_ADMIN to match canEdit, but spec says OWNER/MANAGER — use `role === 'OWNER' || role === 'MANAGER' || role === 'SYSTEM_ADMIN'` to stay consistent with the page's canEdit superset and avoid locking sysadmin out).
- Pass new props: `userId={driver.userId}`, `userIsActive={driver.user?.isActive ?? null}`, `canManageAccess={canManageAccess}` to `<DriverDetailActions />` alongside the existing props.

Do NOT modify the revoke/restore routes or server actions.
  </action>
  <verify>`tsc --noEmit` introduces no new errors. Manual: on a driver with an accepted+active linked user, badge shows "Portal access active" and a Revoke access button appears for OWNER; clicking it shows the confirm dialog; confirming flips the badge to "Access suspended" with a Restore access button after refresh. On a driver with only a pending invite, badge shows "Invitation pending" and only the existing Resend Invitation button shows.</verify>
  <done>PortalAccessControls renders the correct badge for all four states; revoke requires confirm and restore is single-click; both call the correct POST route and refresh; controls hidden for non-OWNER/MANAGER/SYSTEM_ADMIN.</done>
</task>

<task type="auto">
  <name>Task 3: Remove the raw Linked User ID field from CarrierDriverForm</name>
  <files>apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx</files>
  <action>
Remove the manual UUID entry path from CarrierDriverForm.tsx:
1. Delete the entire "Linked User ID" form block (the `<div className="space-y-1.5 lg:col-span-2">` containing the `userId` label and Input, lines ~214-226).
2. Remove `userId: driver?.userId ?? '',` from the `useState` initial `values` object (line ~79).
3. Remove the `...(values.userId ? { userId: values.userId } : {}),` line from the submit `body` object (line ~118).

Leave the `userId: string | null;` field on the `CarrierDriverData` interface (the page still passes it in the `driver` prop and removing it from the interface would be a larger change; an unused interface field is harmless). Do NOT change the page's CarrierDriverForm invocation.

Confirm the email-invite path is unaffected: createCarrierDriver/updateCarrierDriver still accept `userId` in their input types but the form will simply never send it. The invite flow (email → DriverInvitation → accept-invitation) sets userId server-side; that is untouched.
  </action>
  <verify>Grep confirms no `Linked User ID` string and no `name="userId"` Input remains in CarrierDriverForm.tsx. `tsc --noEmit` introduces no new errors. Manual: editing a driver and saving still works (name/email/CDL/pay fields persist); creating a driver via email invite still provisions access.</verify>
  <done>The Linked User ID input is gone from both create and edit forms; form submit no longer includes userId; create/update via email still work.</done>
</task>

</tasks>

<verification>
- `tsc --noEmit` introduces no new errors in the touched files.
- Badge reflects all four states correctly (active / suspended / pending / none).
- Revoke shows a confirm dialog stating the driver will be signed out; restore is single-click.
- Both controls POST to the correct verified routes and the page refreshes to the new state.
- Controls are hidden for roles other than OWNER/MANAGER/SYSTEM_ADMIN.
- No Linked User ID field remains in CarrierDriverForm.
- git diff limited to: fleet-drivers.ts (getCarrierDriver only), PortalAccessControls.tsx (new), DriverDetailActions.tsx, [id]/page.tsx, CarrierDriverForm.tsx.
</verification>

<success_criteria>
- OWNER/MANAGER can see portal-access status and revoke/restore from the carrier driver detail page.
- Revoke requires confirmation; restore is one click; both reflect immediately after refresh.
- The raw Linked User ID manual entry path is removed.
- Verified backend actions/routes, invite/accept flow, and schema are untouched.
</success_criteria>

<output>
After completion, create `.planning/quick/456-phase-2-driver-portal-access-management-/456-SUMMARY.md`
</output>
