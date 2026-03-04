---
phase: quick-43
plan: "01"
subsystem: admin-portal
tags: [tenant-management, status-badge, onboarding]
dependency_graph:
  requires: [quick-42]
  provides: [three-state-tenant-status]
  affects: [admin-tenant-list]
tech_stack:
  added: []
  patterns: [computed-boolean-from-nested-select, three-state-badge]
key_files:
  created: []
  modified:
    - src/app/(admin)/actions/tenants.ts
    - src/app/(admin)/tenants/tenant-list-client.tsx
decisions:
  - "Check for OWNER-role user existence (not invitation) — user record means they completed account setup"
  - "Suspended takes precedence over Pending in status priority order — admin-disabled tenant shows Suspended regardless of owner status"
  - "No schema changes — ownerSetupComplete computed from existing User.role field in tenant query"
metrics:
  duration: 79s
  completed: 2026-03-04
  tasks_completed: 2
  files_modified: 2
---

# Phase Quick-43 Plan 01: Change Tenant Status to Pending Until Owner Setup Summary

Three-state tenant status badge (Pending/Active/Suspended) using OWNER-role user existence check — no schema changes required.

## Objective

Show tenants as "Pending" until the owner accepts their invitation and completes account setup (sets password), then show "Active". Suspended tenants remain "Suspended". Admin can see at a glance which tenants have completed onboarding vs which are still waiting.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add ownerSetupComplete to getAllTenants query | 5a7293d | src/app/(admin)/actions/tenants.ts |
| 2 | Three-state status badge in tenant list | 7b3a6f1 | src/app/(admin)/tenants/tenant-list-client.tsx |

## What Was Built

### Task 1: getAllTenants — ownerSetupComplete

Added a nested `users` select filtered by `role: 'OWNER'` (take: 1) within the existing `prisma.tenant.findMany`. Results are mapped to compute `ownerSetupComplete: boolean` — true if any OWNER-role user exists for the tenant.

Logic: the `accept-invitation` flow (quick-42) creates a User record with role OWNER when the owner completes setup. So a OWNER user existing = setup complete.

### Task 2: Three-state status badge

Updated `Tenant` type to include `ownerSetupComplete: boolean`. Replaced the two-state `isActive` badge with three-state logic:

- `isActive === false` → **Suspended** (red badge) — takes priority
- `isActive === true && ownerSetupComplete === false` → **Pending** (yellow badge)
- `isActive === true && ownerSetupComplete === true` → **Active** (green badge)

## Verification

- `npx tsc --noEmit` — passes, no errors
- `npm run build` — succeeds, /tenants page compiled correctly
- Status priority: Suspended > Pending > Active (suspended pending tenants correctly show Suspended)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

Files modified exist and commits are confirmed:
- src/app/(admin)/actions/tenants.ts — modified
- src/app/(admin)/tenants/tenant-list-client.tsx — modified
- Commit 5a7293d: feat(quick-43-01)
- Commit 7b3a6f1: feat(quick-43-02)
