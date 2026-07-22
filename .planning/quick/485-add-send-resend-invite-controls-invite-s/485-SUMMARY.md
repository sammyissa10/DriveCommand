# Quick Task 485 — Summary

**Goal:** Bring the driver-portal invite controls (items 3 & 4 of quick-484) to the mobile-web DS driver detail (`DriverDetailMobile`), which previously showed only an "Invited" pill and had no way to send/resend.

## What changed (2 files, 1 commit `a64f443a`)

**`apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/DriverDetailMobile.tsx`**
- New `DriverPortalAccess` interface + `computePortalState()` helper (mirrors desktop `PortalAccessControls.computeAccessState`: `active`/`suspended`/`pending`/`none`).
- New **Portal Access** card in the Profile view tab (after Contact): status line **"Invite not sent" / "Invite sent {date}" / "Portal active" / "Access suspended"** plus a `StatusPill` (Not invited / Invited / Active / Suspended).
- **Send invite** (state `none`) / **Resend invite** (state `pending`) `PrimaryButton`, shown only when `canManageAccess`; disabled with a hint when the driver has no email. Posts to the unchanged `POST /api/v1/carrier/fleet/drivers/{id}/resend-invitation` (handles both first-send and resend), with the same toast handling as desktop (`alreadyProvisioned` → info, `warning` → warning, else success) and `router.refresh()`.
- Portal facts are read from a **separate `portal` prop**, deliberately NOT folded into the component's local `data` state — `data` is seeded once via `useState(driver)` and would go stale after `router.refresh()`; reading from props keeps the status/date fresh after a send.

**`apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx`**
- Passes `canManageAccess` and a `portal={{ userId, userIsActive, invitationStatus, invitationSentAt }}` prop to `DriverDetailMobile` (all values already computed for the desktop half in quick-484).

## Verification
- `cd apps/web && npx tsc --noEmit` → **0 errors** (none in the 2 touched files).
- Logic parity checked against desktop `PortalAccessControls`: none→Send invite, pending→Resend invite, active/suspended→status only, entire action hidden when `!canManageAccess`.
- No dev server / deploy / push (per workflow + user preference).

## Not changed / out of scope
- The `resend-invitation` route, `resendCarrierDriverInvitation`, invite email content, accept-invitation flow — all untouched.
- **Revoke/Restore** controls remain **desktop-only** (the mobile card intentionally covers only Send/Resend + status, matching the original items 3 & 4 request).
