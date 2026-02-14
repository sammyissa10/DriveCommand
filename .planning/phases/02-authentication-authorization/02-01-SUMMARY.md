---
phase: 02-authentication-authorization
plan: 01
subsystem: authentication-and-authorization
tags:
  - rbac
  - clerk
  - server-actions
  - role-management
dependency_graph:
  requires:
    - 01-02-SUMMARY.md (Clerk webhook for user provisioning)
  provides:
    - UserRole enum and role hierarchy
    - Server-side authorization helpers (requireAuth, requireRole, getRole)
    - Role synchronization in Clerk publicMetadata
  affects:
    - All future server actions (will use requireRole for authorization)
    - Portal routing (will use PORTAL_ROLES for access control)
    - UI role guards (will use getRole for conditional rendering)
tech_stack:
  added:
    - Clerk type customization (publicMetadata/privateMetadata)
  patterns:
    - Role-based access control (RBAC) with enum and hierarchy
    - Dual role storage (Clerk publicMetadata for speed, database for isSystemAdmin)
    - Server-side auth helpers for consistent authorization
key_files:
  created:
    - src/lib/auth/roles.ts (UserRole enum, ROLE_HIERARCHY, PORTAL_ROLES)
    - src/lib/auth/server.ts (getRole, requireAuth, requireRole, isSystemAdmin, getCurrentUser)
    - types/clerk.d.ts (Clerk type customization)
  modified:
    - src/app/api/webhooks/clerk/route.ts (publicMetadata.role sync)
    - package.json (Zod already installed)
decisions:
  - "UserRole enum includes SYSTEM_ADMIN (not in Prisma enum) for authorization logic - system admins identified by isSystemAdmin boolean"
  - "ROLE_HIERARCHY uses numeric levels for future permission comparison (SYSTEM_ADMIN: 100, OWNER: 50, MANAGER: 40, DRIVER: 10)"
  - "Dual role storage: Clerk publicMetadata for fast session-based checks, database isSystemAdmin for special admin flag"
  - "Type assertion workaround for Clerk publicMetadata.role until type augmentation is properly configured"
  - "Webhook sets publicMetadata.role in both new user and idempotency paths for consistency"
metrics:
  duration_minutes: 3
  tasks_completed: 2
  files_created: 3
  files_modified: 2
  commits: 2
  completed_at: "2026-02-14T19:42:21Z"
---

# Phase 02 Plan 01: RBAC Foundation and Role Synchronization Summary

**One-liner:** JWT-based role system with UserRole enum, server-side authorization helpers (requireAuth/requireRole/getRole), and Clerk publicMetadata.role sync for session token access.

## Objective Achieved

Created the RBAC foundation with role definitions, server-side authorization helpers, and updated the Clerk webhook to sync user roles into publicMetadata for session token access. This enables all subsequent plans in Phase 02 (auth UI, portal layouts, role guards) to check user roles both server-side and client-side without database calls.

## Tasks Completed

### Task 1: Create role definitions and server-side authorization helpers
**Status:** Complete
**Commit:** 162a761
**Duration:** ~2 minutes

Created:
- `src/lib/auth/roles.ts`: UserRole enum (SYSTEM_ADMIN, OWNER, MANAGER, DRIVER), ROLE_HIERARCHY constant for numeric permission levels, PORTAL_ROLES constant for portal access mapping
- `src/lib/auth/server.ts`: Five auth helper functions:
  - `getRole()`: Reads role from Clerk session publicMetadata (fast, no DB call)
  - `requireAuth()`: Enforces authentication, throws if not authenticated
  - `requireRole(allowedRoles)`: Enforces role-based access control
  - `isSystemAdmin()`: Checks database isSystemAdmin flag (requires DB call)
  - `getCurrentUser()`: Fetches user database record (requires DB call)
- `types/clerk.d.ts`: Clerk type customization for publicMetadata.role and privateMetadata.tenantId
- Verified Zod is already installed (from Phase 01)

**Key implementation details:**
- UserRole enum includes SYSTEM_ADMIN despite it not being in the Prisma UserRole enum. System admins are identified by the `isSystemAdmin` boolean field in the database, but the enum value is needed for authorization logic.
- Type assertion workaround used in `getRole()` for `sessionClaims.publicMetadata.role` until Clerk type augmentation is properly configured.
- All functions use `@clerk/nextjs/server` auth() helper for session claims.

### Task 2: Update Clerk webhook to set publicMetadata.role
**Status:** Complete
**Commit:** 657f252
**Duration:** ~1 minute

Modified `src/app/api/webhooks/clerk/route.ts` to set `publicMetadata.role` alongside `privateMetadata.tenantId`:
- **New user path:** Sets `publicMetadata.role = 'OWNER'` for self-service signups
- **Idempotency path:** Sets `publicMetadata.role = existingUser.role` to sync from database
- Both paths now set both privateMetadata and publicMetadata in a single `updateUserMetadata` call

This ensures the role is available in the session token from the first login, enabling the `getRole()` helper to read it without a database call.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Added Clerk type customization**
- **Found during:** Task 1 - TypeScript compilation
- **Issue:** TypeScript error "Property 'role' does not exist on type '{}'" when accessing sessionClaims.publicMetadata.role
- **Fix:** Created `types/clerk.d.ts` with global type augmentation for UserPublicMetadata and UserPrivateMetadata. Added type assertion in getRole() as workaround until type augmentation is properly configured.
- **Files created:** `types/clerk.d.ts`
- **Files modified:** `src/lib/auth/server.ts` (type assertion)
- **Commit:** 162a761 (included in Task 1 commit)
- **Why Rule 3:** TypeScript compilation error blocked completing Task 1. Adding type definitions was required for the code to compile.

## Verification Results

All verification criteria met:

1. **TypeScript compilation:** PASSED - `npx tsc --noEmit` runs without errors
2. **Role enum and auth helpers importable:** PASSED - All exports present in roles.ts and server.ts
3. **Webhook sets metadata:** PASSED - Both privateMetadata.tenantId and publicMetadata.role set in both code paths
4. **Zod installed:** PASSED - Already in package.json from Phase 01

## Success Criteria Met

- [x] Server-side code can determine a user's role from Clerk session via `getRole()`
- [x] Server actions can reject unauthorized users via `requireRole()`
- [x] New users signing up get OWNER role set in Clerk publicMetadata
- [x] All TypeScript compiles without errors

## Key Decisions Made

1. **UserRole enum includes SYSTEM_ADMIN despite not being in Prisma enum:** System admins are identified by the `isSystemAdmin` boolean field in the User model, but we need SYSTEM_ADMIN in the TypeScript enum for authorization logic (portal access, role hierarchy). This dual approach balances database normalization with application-level authorization needs.

2. **ROLE_HIERARCHY uses numeric levels:** Assigned numeric values (SYSTEM_ADMIN: 100, OWNER: 50, MANAGER: 40, DRIVER: 10) to enable future permission comparison logic (e.g., "requires MANAGER or higher"). Not used yet, but foundation is in place.

3. **Dual role storage strategy:** Role stored in Clerk publicMetadata for fast session-based checks (no DB call) and in database for source of truth. The `isSystemAdmin` flag lives only in the database since it's a special administrative flag not tied to tenant roles.

4. **Type assertion workaround for Clerk types:** Used type assertion `sessionClaims.publicMetadata as { role?: string }` in `getRole()` because Clerk's type augmentation via `types/clerk.d.ts` wasn't being picked up by TypeScript. This is a pragmatic workaround that maintains type safety while keeping the code functional.

5. **Webhook syncs role in both paths:** Updated both the new user creation path and the idempotency path to set publicMetadata.role. This ensures consistency even if the webhook is retried or the user already exists.

## Impact on System

**Immediate benefits:**
- Server actions can now enforce role-based access control with `requireRole()`
- Fast role checks without database calls via `getRole()` (reads from JWT)
- Foundation for portal routing and UI role guards in upcoming plans

**Enables:**
- Plan 02-02: Auth UI components (sign-in/sign-out/role display)
- Plan 02-03: Portal layout routing based on PORTAL_ROLES
- Future plans: Server actions with role-based authorization

**Dependencies created:**
- All future server actions should use `requireRole()` or `requireAuth()` for authorization
- Portal routing will use PORTAL_ROLES constant
- UI components will use getRole() for conditional rendering

## Next Steps

With the RBAC foundation in place, the next plan (02-02) should implement the authentication UI components (sign-in, sign-out, user menu with role display) and the next plan after that (02-03) should create the portal layout structure with role-based routing.

## Self-Check

Verifying all claimed files and commits exist:

**Files created:**
- src/lib/auth/roles.ts: FOUND
- src/lib/auth/server.ts: FOUND
- types/clerk.d.ts: FOUND

**Files modified:**
- src/app/api/webhooks/clerk/route.ts: FOUND

**Commits:**
- 162a761 (Task 1): FOUND
- 657f252 (Task 2): FOUND

## Self-Check: PASSED

All files and commits verified to exist.
