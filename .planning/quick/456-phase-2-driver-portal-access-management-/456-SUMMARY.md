---
phase: quick-456
plan: 456
subsystem: carrier-fleet
tags: [portal-access, revoke-restore, ui, driver-detail]
dependency_graph:
  requires: [quick-454, quick-455]
  provides: [portal-access-badge, revoke-access-ui, restore-access-ui]
  affects: [carrier-driver-detail-page, carrier-driver-form]
tech_stack:
  added: []
  patterns: [AlertDialog confirm for destructive action, fetch+router.refresh pattern, computed access state from derived fields]
key_files:
  created:
    - apps/web/src/components/carrier/fleet/PortalAccessControls.tsx
  modified:
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/components/carrier/fleet/DriverDetailActions.tsx
    - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
    - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
decisions:
  - computeAccessState precedence: suspended (userId+isActive=false) > active (userId+isActive!=false) > pending (no userId+PENDING invite) > none
  - canManageAccess includes SYSTEM_ADMIN alongside OWNER/MANAGER to avoid locking sysadmin out (consistent with canEdit superset)
  - userId interface field retained in CarrierDriverData (harmless unused field avoids larger interface refactor)
  - flex-wrap added to DriverDetailActions container to handle multiple badges+buttons on narrow viewports
metrics:
  duration: 131s
  completed: 2026-06-16
  tasks_completed: 3
  files_modified: 5
---

# Phase quick-456: Phase 2 Driver Portal Access Management Summary

Portal-access status badge + revoke/restore controls on carrier driver detail page, plus removal of the raw Linked User ID UUID input footgun.

## What Was Built

**Task 1 — getCarrierDriver now returns user.isActive**

Added `isActive: true` to the user select inside `getCarrierDriver`. No other functions were touched. This single field enables the detail page to distinguish "Portal access active" (user.isActive === true) from "Access suspended" (user.isActive === false).

**Task 2 — PortalAccessControls component + detail page wiring**

Created `PortalAccessControls.tsx` — a `'use client'` component that computes access state from three inputs (userId, userIsActive, invitationStatus) using a strict precedence order:

| State | Condition | Badge | Controls |
|-------|-----------|-------|----------|
| suspended | userId set AND isActive=false | "Access suspended" red | Restore access button (single-click) |
| active | userId set AND isActive!=false | "Portal access active" green | Revoke access button (AlertDialog confirm) |
| pending | No userId AND invitationStatus=PENDING | "Invitation pending" amber | None (ResendInvitationButton handles this) |
| none | otherwise | "No portal access" muted | None |

Revoke flow: opens AlertDialog "Revoke portal access?" with description warning the driver will be signed out immediately. Confirm calls `POST /api/v1/carrier/fleet/drivers/[id]/revoke-access`, then `router.refresh()`. Restore flow is a single-click button calling the restore route.

Updated `DriverDetailActions.tsx` to accept `userId`, `userIsActive`, `canManageAccess` props and render `<PortalAccessControls />` before the existing ResendInvitationButton.

Updated `page.tsx` to compute `canManageAccess = role === 'OWNER' || role === 'MANAGER' || role === 'SYSTEM_ADMIN'` and pass `userId`, `userIsActive`, `canManageAccess` to `<DriverDetailActions />`.

**Task 3 — Remove Linked User ID field from CarrierDriverForm**

Removed the manual UUID entry path:
- Deleted `userId: driver?.userId ?? ''` from the `values` state initializer
- Deleted `...(values.userId ? { userId: values.userId } : {})` from the submit body
- Deleted the entire Linked User ID `<div>` block from the JSX (label + Input)

The `userId: string | null` field on `CarrierDriverData` interface is retained (harmless; the page still passes it in the driver prop and the invite-accept flow still sets userId server-side untouched).

## Commits

| Hash | Message |
|------|---------|
| 44926b81 | feat(quick-456): add user.isActive to getCarrierDriver query |
| 6faa3f0e | feat(quick-456): add PortalAccessControls badge and revoke/restore buttons |
| de940e71 | feat(quick-456): remove raw Linked User ID field from CarrierDriverForm |

## Deviations from Plan

None — plan executed exactly as written.

The only minor addition was `flex-wrap` on the DriverDetailActions container to handle multiple elements (badge + revoke button + resend button + delete button) on narrower viewports without overflow.

## Self-Check: PASSED

- FOUND: apps/web/src/components/carrier/fleet/PortalAccessControls.tsx
- FOUND: apps/web/src/components/carrier/fleet/DriverDetailActions.tsx
- FOUND: apps/web/src/lib/carrier/fleet-drivers.ts
- FOUND: apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
- FOUND: apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
- Commits 44926b81, 6faa3f0e, de940e71 confirmed in git log
- tsc --noEmit: no new errors
- "Linked User ID" and `name="userId"` absent from CarrierDriverForm.tsx
- `isActive: true` present in getCarrierDriver user select
