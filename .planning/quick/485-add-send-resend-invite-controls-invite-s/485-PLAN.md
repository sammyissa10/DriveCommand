# Quick Task 485 — Mobile-web DS driver detail: Send/Resend invite + status (parity with desktop)

## Goal
Bring the driver-portal invite controls (items 3 & 4 of task 484) to the mobile-web DS driver detail (`DriverDetailMobile`), which today shows only an "Invited" pill and has no send/resend action. Desktop `PortalAccessControls` already does this; this closes the follow-up flagged in quick-484.

## Context (verified by orchestrator)
- `apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx` renders `DriverDetailMobile` for phone widths (`lg:hidden`) and `DriverDetailActions`/`PortalAccessControls` for desktop (`hidden lg:block`).
- page.tsx already computes everything needed (from quick-484): `invitationInfo` (`{ status, sentAt }` via `getLatestInvitationInfo`), `invitationStatus`, `canManageAccess`, `driver.userId`, `driver.user?.isActive`, `invited`.
- The send/resend HTTP path is `POST /api/v1/carrier/fleet/drivers/${id}/resend-invitation` (handles BOTH first-send and resend via `resendCarrierDriverInvitation`), returning `{ sent, email, warning? }` | `{ alreadyProvisioned, email }` | `{ error }`. This route + `resendCarrierDriverInvitation` are UNCHANGED.
- Desktop `PortalAccessControls.tsx` is the reference for state computation, labels, status text, and toast handling (post-484): states `active`/`suspended`/`pending`/`none`; labels "Send invite"/"Resend invite"; status "Invite not sent"/"Invite sent {date}"/"Portal active"/"Access suspended".
- DS primitives available: `PrimaryButton` (full-width accent, has `loading`), `StatusPill` (tones: success/accent/warning/danger/neutral/vip), `SectionHeader`. Card surface = `rounded-[20px] bg-ds-card p-4`. Muted text = `text-ds-txt3`; body = `text-ds-txt`/`text-ds-txt2`.
- `DriverDetailMobile` seeds a local `data` state from the `driver` prop via `useState(driver)` — so any field read from `data` goes STALE after `router.refresh()`. **Portal fields MUST be read from fresh props, not folded into `data`.** Pass them as a separate `portal` prop object + `canManageAccess`.

## Scope
- ONLY `DriverDetailMobile.tsx` (add section + handler) and `[id]/page.tsx` (pass new props). No API/route/lib changes. Do NOT touch desktop `PortalAccessControls`, the resend route, invite email, or accept-invitation flow.
- Implement **Send invite** (state none) + **Resend invite** (state pending) + the 4-state status line WITH date. Revoke/Restore stay desktop-only (note in SUMMARY) — keep this focused.
- Keep the existing header "Invited" duty pill behavior as-is (`invited` still passed).

## Task 1 — Thread portal-access props + render Portal Access section (single commit)

**File: `apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx`**
- On the `<DriverDetailMobile .../>` render, add two props (all values already in scope):
  ```tsx
  canManageAccess={canManageAccess}
  portal={{
    userId: driver.userId ?? null,
    userIsActive: driver.user?.isActive ?? null,
    invitationStatus,
    invitationSentAt: invitationInfo?.sentAt ? invitationInfo.sentAt.toISOString() : null,
  }}
  ```
  (Leave the existing `driver={{... invited}}` block and everything else unchanged.)

**File: `apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/DriverDetailMobile.tsx`**

1. Add types + props (do NOT add these to `DriverDetailData`/`data`):
   ```ts
   export interface DriverPortalAccess {
     userId: string | null;
     userIsActive: boolean | null;
     invitationStatus: string | null;
     invitationSentAt: string | null; // ISO
   }
   ```
   Add to the component's prop signature: `portal: DriverPortalAccess;` and `canManageAccess: boolean;` (both required). Destructure them.

2. Add access-state helper (module scope, mirrors desktop `computeAccessState`):
   ```ts
   type AccessState = 'active' | 'suspended' | 'pending' | 'none';
   function computePortalState(p: DriverPortalAccess): AccessState {
     if (p.userId && p.userIsActive === false) return 'suspended';
     if (p.userId && p.userIsActive !== false) return 'active';
     if (!p.userId && p.invitationStatus === 'PENDING') return 'pending';
     return 'none';
   }
   ```

3. Add local state for the action: `const [invLoading, setInvLoading] = useState(false);`

4. Add the send/resend handler (mirror desktop toast handling; refresh on success):
   ```ts
   async function sendPortalInvite() {
     setInvLoading(true);
     try {
       const res = await fetch(`/api/v1/carrier/fleet/drivers/${data.id}/resend-invitation`, { method: 'POST' });
       const json = (await res.json().catch(() => ({}))) as { alreadyProvisioned?: boolean; warning?: string; error?: string };
       if (res.ok) {
         if (json.alreadyProvisioned) toast.info('This driver already has portal access.');
         else if (json.warning) toast.warning(json.warning);
         else toast.success(portalState === 'pending' ? `Invite resent to ${data.email}` : `Invite sent to ${data.email}`);
         navigator.vibrate?.(10);
         router.refresh();
       } else {
         toast.error(json.error ?? 'Something went wrong');
       }
     } catch {
       toast.error('Something went wrong');
     } finally {
       setInvLoading(false);
     }
   }
   ```

5. Compute view-model near the other derived values (after `const duty = ...`):
   ```ts
   const portalState = computePortalState(portal);
   const invitePill: Record<AccessState, { tone: StatusTone; label: string }> = {
     none: { tone: 'neutral', label: 'Not invited' },
     pending: { tone: 'warning', label: 'Invited' },
     active: { tone: 'success', label: 'Active' },
     suspended: { tone: 'danger', label: 'Suspended' },
   };
   const inviteStatusText =
     portalState === 'active' ? 'Portal active'
     : portalState === 'suspended' ? 'Access suspended'
     : portalState === 'pending'
       ? (portal.invitationSentAt ? `Invite sent ${fmtDate(portal.invitationSentAt)}` : 'Invite sent')
       : 'Invite not sent';
   ```
   (`fmtDate` and `StatusTone` are already imported/defined in this file.)

6. Render a **Portal Access** section in the **Profile view** tab only (the `tab === 'profile'` block inside the non-editing `View` branch, alongside Contact/License/Pay/Notes). Place it after the Contact section (or after Notes — pick after Contact for prominence). Do NOT render it in edit mode or the hours/trips/docs tabs.
   ```tsx
   <div>
     <SectionHeader title="Portal Access" />
     <div className="rounded-[20px] bg-ds-card p-4">
       <div className="flex items-center justify-between gap-3">
         <div className="min-w-0">
           <div className="text-[15px] font-semibold text-ds-txt">{inviteStatusText}</div>
           <div className="text-[13px] text-ds-txt3">
             {portalState === 'none' ? 'No invite email has been sent yet.'
               : portalState === 'pending' ? 'Waiting for the driver to accept.'
               : portalState === 'active' ? 'Driver can sign in to the portal.'
               : 'Portal access is revoked.'}
           </div>
         </div>
         <StatusPill label={invitePill[portalState].label} tone={invitePill[portalState].tone} />
       </div>
       {canManageAccess && (portalState === 'none' || portalState === 'pending') ? (
         <div className="pt-4">
           <PrimaryButton
             label={invLoading ? 'Sending…' : portalState === 'pending' ? 'Resend invite' : 'Send invite'}
             onClick={sendPortalInvite}
             disabled={invLoading || !data.email}
             loading={invLoading}
           />
           {!data.email ? (
             <p className="pt-2 text-center text-[13px] text-ds-txt3">Add an email address to invite this driver.</p>
           ) : null}
         </div>
       ) : null}
     </div>
   </div>
   ```
   - Add `PrimaryButton` to the existing `@/components/ui/ds` import (StatusPill, SectionHeader already imported).

## Verification (must run)
- `cd apps/web && npx tsc --noEmit` → confirm 0 new errors and none in the 2 touched files (baseline ~35 pre-existing; total was 0 after 484).
- Sanity self-check of the render logic against desktop `PortalAccessControls` state parity (none→Send invite, pending→Resend invite, active/suspended→status only, hidden when `!canManageAccess`).
- Do NOT run a dev server, deploy, or push.

## Commit
Single atomic commit:
`feat(quick-485): Send/Resend invite + portal status on mobile-web DS driver detail`

## Out of scope (note in SUMMARY)
- Revoke/Restore controls on mobile DS (still desktop-only).
