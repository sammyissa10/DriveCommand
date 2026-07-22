# Quick Task 484 — Opt-in control for driver-portal invite emails

## Goal
Creating a carrier driver currently **auto-sends** the portal-invite email whenever an email is present, with no opt-out. Make the invite **opt-in** (default OFF), and give the driver detail screen explicit Send/Resend controls + an invite-status line. Do NOT touch invite email content or the accept-invitation flow.

## Context (verified by orchestrator)
- `createCarrierDriver(orgId, data)` in `apps/web/src/lib/carrier/fleet-drivers.ts` (lines ~215–358) is the ONLY place that creates the `DriverInvitation` + sends `sendDriverInvitation`. Its **only** caller is `POST /api/v1/carrier/fleet/drivers` (`apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`). Confirmed via grep.
- Three client surfaces POST to that endpoint:
  1. `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx` — desktop `/new` create form (also the edit form; POST only when `!isEdit`).
  2. `apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx` — mobile-web DS `/new` form.
  3. `apps/web/src/app/(owner)/carrier/fleet/drivers/InviteDriverSheet.tsx` — explicit "Invite Driver" quick-sheet.
- Detail screen already has `PortalAccessControls.tsx` (used by `DriverDetailActions.tsx`, rendered on the desktop half of `[id]/page.tsx`). It already shows Grant/Resend/Revoke/Restore + status badges and posts to `.../${driverId}/resend-invitation`, which (`resendCarrierDriverInvitation`) already handles the first-send case. Items 3 & 4 are 90% present on desktop — they need the task's exact labels and a **sent date**.
- The `resend-invitation` route + `resendCarrierDriverInvitation` are UNCHANGED by this task.
- Primitives: shadcn `Checkbox` at `@/components/ui/checkbox`; DS `Toggle` from `@/components/ui/ds`.
- Backward-compat: because the sole lib caller is the one route and all three forms are updated here, defaulting `sendInvite` to **false** is the intended product change. `InviteDriverSheet` must explicitly send `true` to preserve its "invite now" purpose.

## Scope decisions (follow exactly)
- **Opt-in checkbox** goes on the two **New Driver** forms (`CarrierDriverForm` create mode, `DriverCreateMobile`), default UNCHECKED.
- **`InviteDriverSheet`** keeps inviting: add `sendInvite: true` to its POST body (using this sheet IS the opt-in). No checkbox there.
- **Detail controls (items 3 & 4)** are enhanced on the existing **desktop** `PortalAccessControls`. The **mobile DS detail** (`DriverDetailMobile`) is intentionally OUT of scope for the send/resend buttons (it already shows an "Invited" pill); note this as a follow-up in the SUMMARY. Do NOT redesign the DS detail.
- Do NOT make email optional/required differently than today. Leave existing field validation untouched. `sendInvite` only gates whether the invite is sent.

---

## Task 1 — Backend: gate the invite behind `sendInvite` (commit 1)

**File: `apps/web/src/lib/carrier/fleet-drivers.ts`**
1. Add to `CarrierDriverCreateInput` interface: `sendInvite?: boolean;`
2. In `createCarrierDriver`, destructure `sendInvite` out of `data` so it is NOT spread into the Prisma `create`:
   - Change `const { userId, cdlExpiry, payRate, email: rawEmail, ...rest } = data;`
     to `const { userId, cdlExpiry, payRate, email: rawEmail, sendInvite, ...rest } = data;`
3. Gate the invitation block: change the condition `if (email) {` (the block that cancels PENDING, creates `DriverInvitation`, and calls `sendDriverInvitation`, ~line 285) to:
   `if (email && sendInvite === true) {`
   Leave the block body unchanged. The final `return { driver, emailSent: false };` at the end already covers the not-sent path.
   - IMPORTANT: keep the "Link to existing User" block (the `if (email && !userId)` block, ~lines 264–282) UNCHANGED and OUTSIDE the gate — it only links a pre-existing login and sends no email.

**File: `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`**
4. Add to `CarrierDriverCreateSchema`: `sendInvite: z.boolean().optional(),`
   (`parsed.data` is already passed to `createCarrierDriver`, so it flows through. Omitted → `undefined` → treated as not-send.)

## Task 2 — New Driver forms: opt-in checkbox + Invite sheet passes true (commit 2)

**File: `apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx`** (desktop /new)
- Add `import { Checkbox } from '@/components/ui/checkbox';`
- Add state: `const [sendInvite, setSendInvite] = useState(false);`
- In `handleSubmit`, when creating only, add to `body`: `...(!isEdit ? { sendInvite } : {}),`
- Render, CREATE MODE ONLY (`{!isEdit && ( ... )}`), just above the Submit row, a checkbox row:
  - Label text: **"Send portal invite email now"**
  - Helper text (muted, `text-xs text-muted-foreground`): "Off by default. You can send it later from the driver's profile."
  - Wire `Checkbox` `checked={sendInvite}` `onCheckedChange={(v) => setSendInvite(v === true)}` with an associated `<label htmlFor>`.

**File: `apps/web/src/app/(owner)/carrier/fleet/drivers/new/DriverCreateMobile.tsx`** (mobile /new)
- Import `Toggle` and `SectionHeader` (SectionHeader already imported) from `@/components/ui/ds`. Add `Toggle` to the existing ds import.
- Add state: `const [sendInvite, setSendInvite] = useState(false);`
- In `save()`'s `body`, add: `sendInvite,`
- Add a new section before the `<PrimaryButton>` (after Notes):
  ```tsx
  <div>
    <SectionHeader title="Portal Access" />
    <div className="flex">
      <Toggle label="Send portal invite email now" on={sendInvite} onChange={setSendInvite} />
    </div>
    <p className="px-1 pt-2 text-[13px] text-ds-txt3">
      Off by default. You can send it later from the driver's profile.
    </p>
  </div>
  ```

**File: `apps/web/src/app/(owner)/carrier/fleet/drivers/InviteDriverSheet.tsx`** (explicit invite)
- In `submit()`'s POST body, add `sendInvite: true,` (this sheet's purpose is to invite; preserves current behavior under the new default). No UI change.

## Task 3 — Detail screen: Send/Resend labels + invite status with date + test (commit 3)

**File: `apps/web/src/lib/carrier/fleet-drivers.ts`**
- Add a helper next to `getLatestInvitationStatus`:
  ```ts
  export async function getLatestInvitationInfo(
    orgId: string,
    email: string
  ): Promise<{ status: string; sentAt: Date } | null> {
    const tenantPrisma = await getTenantPrisma();
    const invitation = await tenantPrisma.driverInvitation.findFirst({
      where: { email, tenantId: orgId },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true },
    });
    return invitation ? { status: invitation.status, sentAt: invitation.createdAt } : null;
  }
  ```
  (Keep `getLatestInvitationStatus` as-is; it is still used elsewhere.)

**File: `apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx`**
- Also fetch the sent date. Replace the `invitationStatus` derivation to additionally get the date, e.g. import `getLatestInvitationInfo` and compute:
  `const invitationInfo = driver.email ? await getLatestInvitationInfo(orgId, driver.email) : null;`
  `const invitationStatus = invitationInfo?.status ?? null;`
  (leaves the rest, incl. `invited`, working since it reads `invitationStatus`).
- Pass a new prop to `DriverDetailActions`: `invitationSentAt={invitationInfo?.sentAt ? invitationInfo.sentAt.toISOString() : null}`

**File: `apps/web/src/components/carrier/fleet/DriverDetailActions.tsx`**
- Add `invitationSentAt: string | null;` to `Props`, accept it, and forward to `<PortalAccessControls invitationSentAt={invitationSentAt} ... />`.

**File: `apps/web/src/components/carrier/fleet/PortalAccessControls.tsx`**
- Add `invitationSentAt: string | null;` to `Props`.
- Status badge text (item 4):
  - `none` → **"Invite not sent"**
  - `pending` → **"Invite sent {date}"** where date = `new Date(invitationSentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })` (fallback to just "Invite sent" if `invitationSentAt` is null).
  - `active` → **"Portal active"**
  - `suspended` → keep "Access suspended"
- Button labels (item 3):
  - `none` state button → **"Send invite"** (keep Mail icon, keep `disabled`/title email guard).
  - `pending` state button → **"Resend invite"** (keep Mail icon).
- Update the two success toasts to match: first send → `Invite sent to ${driverEmail}`; resend → `Invite resent to ${driverEmail}`. Keep the `alreadyProvisioned`/`warning` branches.

**File (NEW): `apps/web/tests/unit/carrier/create-driver-invite-optin.test.ts`**
- Vitest, mirror the mock style of `apps/web/tests/unit/carrier/resend-invitation-idempotent.test.ts`.
- Mocks: `@/lib/context/tenant-context` → `getTenantPrisma` returning a `tenantPrisma` with `carrierDriver.create` (resolves `{ id: 'd1', email: 'driver@example.com' }`), `carrierDriver.findFirst`, `carrierDriver.update`, `driverInvitation.updateMany`, `driverInvitation.create`, `carrierFacility.findFirst`. Mock `@/lib/db/prisma` → `prisma.user.findFirst` (resolve `null`), `prisma.tenant.findUnique`. Mock `@/lib/email/send-driver-invitation` → `sendDriverInvitation`. Mock `@/lib/logger`, `@/lib/supabase/admin`, `@/lib/app-url`, and `@/lib/security/*` only if import-time requires (prefer NOT passing `cdlNumber` so `buildEncryptedCdl` is never invoked and crypto mocks are unnecessary).
- Import `createCarrierDriver` + `sendDriverInvitation`.
- **Test A (required):** `await createCarrierDriver('org-1', { firstName: 'A', lastName: 'B', email: 'driver@example.com', sendInvite: false })` → assert `sendDriverInvitation` NOT called, `driverInvitation.create` NOT called, result `{ driver: <obj>, emailSent: false }`.
- **Test B:** same but `sendInvite` omitted → also no email (default off).
- **Test C:** `sendInvite: true` → `sendDriverInvitation` called once and `driverInvitation.create` called (proves the flag still sends). Needs `prisma.tenant.findUnique` to resolve `{ name: 'Acme' }`.

## Verification (executor must run)
- `cd apps/web && npx tsc --noEmit` → confirm **no NEW** TypeScript errors vs the known baseline (baseline is ~35 pre-existing per project notes; only regressions or errors in touched files fail the gate). Report the touched-files check explicitly.
- `cd apps/web && npx vitest run tests/unit/carrier/create-driver-invite-optin.test.ts` → all pass.
- Do NOT run a dev server; do NOT deploy; do NOT push.

## Commit plan (atomic)
1. `feat(quick-484): gate driver-portal invite behind opt-in sendInvite flag (backend)`
2. `feat(quick-484): opt-in "Send portal invite email now" on New Driver forms`
3. `feat(quick-484): driver detail Send/Resend invite + invite-status with date + test`

## Out of scope / follow-up (note in SUMMARY)
- Mobile-web DS driver detail (`DriverDetailMobile`) send/resend controls (currently shows an "Invited" pill only). Desktop detail fully satisfies items 3 & 4.
