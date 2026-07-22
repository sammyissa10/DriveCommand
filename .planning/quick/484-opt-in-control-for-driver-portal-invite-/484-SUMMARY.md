# Quick Task 484: Opt-in control for driver-portal invite emails — Summary

Creating a carrier driver no longer auto-sends the portal-invite email. The invite is now **opt-in (default OFF)** on both New Driver forms, the explicit Invite Driver sheet keeps inviting, and the desktop driver-detail screen shows clear Send/Resend controls plus an invite-status line with the sent date.

## What changed

### Task 1 — Backend gate (commit `15bec4c0`)
- `CarrierDriverCreateInput` gained `sendInvite?: boolean`; `createCarrierDriver` destructures `sendInvite` out of the Prisma `create` payload.
- The invitation block is now gated on `if (email && sendInvite === true)` (was `if (email)`). The pre-existing-User linking block stays outside the gate (it sends no email). The trailing `return { driver, emailSent: false }` covers the not-sent path.
- `CarrierDriverCreateSchema` (the sole calling route) accepts `sendInvite: z.boolean().optional()`. Omitted → `undefined` → treated as not-send.

### Task 2 — New Driver forms + Invite sheet (commit `5fcf25f7`)
- **Desktop `CarrierDriverForm`** (create mode only): shadcn `Checkbox` "Send portal invite email now" (default unchecked) + muted helper text; `sendInvite` added to the POST body only when `!isEdit`.
- **Mobile-web `DriverCreateMobile`**: new "Portal Access" section with a DS `Toggle` (default off) + helper text; `sendInvite` always sent in the POST body.
- **`InviteDriverSheet`**: sends `sendInvite: true` (using this sheet IS the opt-in) — preserves its invite-now behavior under the new default. No UI change.

### Task 3 — Detail controls + status date + test (commit `6af4ad40`)
- New `getLatestInvitationInfo(orgId, email)` returns `{ status, sentAt }`; `getLatestInvitationStatus` kept as-is (still used elsewhere).
- Detail `page.tsx` fetches the invitation info, derives `invitationStatus` from it, and passes `invitationSentAt` (ISO or null) through `DriverDetailActions` → `PortalAccessControls`.
- `PortalAccessControls` status badges: `none` → "Invite not sent", `pending` → "Invite sent {Mon D, YYYY}" (fallback "Invite sent"), `active` → "Portal active", `suspended` → "Access suspended". Button labels: "Send invite" / "Resend invite" (Mail icon + email guard kept). Success toasts: "Invite sent to {email}" / "Invite resent to {email}".
- New Vitest `tests/unit/carrier/create-driver-invite-optin.test.ts` — 3 tests: (A) `sendInvite:false` → no invite/email + `{driver, emailSent:false}`; (B) omitted → same default-off; (C) `sendInvite:true` → invitation created + email sent once.

## Verification
- `cd apps/web && npx tsc --noEmit`: **0 errors** — no new errors vs the ~35-error baseline, and none in any touched file (total error count is 0).
- `npx vitest run tests/unit/carrier/create-driver-invite-optin.test.ts`: **3/3 passed**.

## Deviations from Plan
None — plan executed exactly as written.

## Out of scope / follow-up
- Mobile-web DS driver detail (`DriverDetailMobile`) still shows only an "Invited" pill with no send/resend controls. Desktop `PortalAccessControls` fully satisfies items 3 & 4; adding equivalent send/resend controls to the DS detail is a follow-up.

## Self-Check: PASSED
- All 9 touched files present on disk.
- All 3 commits (`15bec4c0`, `5fcf25f7`, `6af4ad40`) exist in git history.
