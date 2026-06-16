---
phase: quick-454
plan: 454
subsystem: carrier/fleet-drivers
tags: [carrier, fleet, drivers, access-control, supabase-auth, backend]
dependency_graph:
  requires: [createAdminClient (@/lib/supabase/admin), getTenantPrisma, logger]
  provides: [revokeCarrierDriverAccess, restoreCarrierDriverAccess, POST /api/v1/carrier/fleet/drivers/[id]/revoke-access, POST /api/v1/carrier/fleet/drivers/[id]/restore-access]
  affects: [carrier driver portal access lifecycle]
tech_stack:
  added: []
  patterns: [Supabase admin ban_duration, isActive flag + global signOut on revoke, try/catch tolerance for Supabase auth API failure]
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/revoke-access/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/restore-access/route.ts
  modified:
    - apps/web/src/lib/carrier/fleet-drivers.ts
decisions:
  - Supabase auth failure does not roll back DB isActive change (same tolerance as owner-portal deactivateDriver pattern)
  - ban_duration '87600h' (10 years) used for revoke; 'none' used to unban on restore
  - OWNER and MANAGER roles can revoke/restore; DRIVER receives 403
  - Cross-org or missing driver returns 404; driver with no linked userId returns 400
metrics:
  duration: "~5 minutes"
  completed: "2026-06-16T16:49:39Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase quick-454: Revoke/Restore Carrier Driver Portal Access (Backend) Summary

**One-liner:** Backend-only revoke/restore for carrier driver portal access — Supabase ban + User.isActive flag with OWNER/MANAGER role gate and tenant scoping.

## What Was Built

Two lib functions added to `fleet-drivers.ts` and two API routes created, closing the portal-access lifecycle gap (granting access already existed; revoking/restoring did not).

### `revokeCarrierDriverAccess(orgId, carrierDriverId)`
- Finds the driver scoped to `orgId` — cross-org or missing returns `{ error: 'Not found' }`
- Driver with no `userId` returns `{ error: 'Driver has no linked account to revoke' }`
- Sets `User.isActive = false` via `tenantPrisma.user.update`
- Calls Supabase Admin API: `updateUserById` with `ban_duration: '87600h'` + `signOut` with `'global'` scope
- Supabase failure is caught and logged; DB change is preserved
- Returns `{ revoked: true, userId }`

### `restoreCarrierDriverAccess(orgId, carrierDriverId)`
- Same tenant scoping and guard checks
- Sets `User.isActive = true`
- Calls Supabase Admin API: `updateUserById` with `ban_duration: 'none'`
- Returns `{ restored: true, userId }`

### `POST /api/v1/carrier/fleet/drivers/[id]/revoke-access`
- Auth: `getSession()` — 401 if no session, 403 if no `tenantId`
- Role gate: OWNER or MANAGER only — DRIVER and others receive 403
- Delegates to `revokeCarrierDriverAccess`; maps errors to 404/400/500

### `POST /api/v1/carrier/fleet/drivers/[id]/restore-access`
- Identical shape; delegates to `restoreCarrierDriverAccess`

## Commits

| Hash | Message |
|------|---------|
| 856f23b3 | feat(quick-454): revoke/restore carrier driver portal access (backend only) |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/fleet-drivers.ts` — modified, exports `revokeCarrierDriverAccess` + `restoreCarrierDriverAccess`
- `apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/revoke-access/route.ts` — created, exports `POST`
- `apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/restore-access/route.ts` — created, exports `POST`
- Commit `856f23b3` verified in git log
- `tsc --noEmit` produced no new errors in touched files (baseline 35 pre-existing errors unchanged)
