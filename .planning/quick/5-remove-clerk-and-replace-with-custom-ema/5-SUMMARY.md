---
phase: quick-5
plan: "01"
subsystem: auth
tags: [auth, session, bcrypt, prisma, clerk-removal]
dependency_graph:
  requires: []
  provides: [custom-session-auth, demo-user, middleware-tenant-injection]
  affects: [all-layouts, middleware, sidebar, user-menu, drivers-actions]
tech_stack:
  added: [bcryptjs, Web Crypto API (AES-256-GCM)]
  removed: ["@clerk/nextjs", svix]
  patterns: [cookie-based sessions, AES-256-GCM encryption, React context for auth]
key_files:
  created:
    - src/lib/auth/session.ts
    - src/lib/auth/auth-context.tsx
    - src/app/api/auth/login/route.ts
    - src/app/api/auth/logout/route.ts
    - src/app/api/auth/me/route.ts
  modified:
    - src/middleware.ts
    - src/lib/auth/server.ts
    - src/lib/auth/guards.tsx
    - src/app/layout.tsx
    - src/app/page.tsx
    - src/app/(auth)/sign-in/[[...sign-in]]/page.tsx
    - src/app/(auth)/sign-up/[[...sign-up]]/page.tsx
    - src/app/(owner)/layout.tsx
    - src/app/(admin)/layout.tsx
    - src/app/(driver)/layout.tsx
    - src/app/(owner)/actions/drivers.ts
    - src/app/(owner)/dashboard/page.tsx
    - src/app/onboarding/page.tsx
    - src/components/navigation/sidebar.tsx
    - src/components/navigation/user-menu.tsx
    - src/lib/db/repositories/tenant.repository.ts
    - prisma/schema.prisma
    - prisma/seed.ts
    - .env.example
  deleted:
    - src/app/api/webhooks/clerk/route.ts
decisions:
  - Use Web Crypto API (AES-256-GCM) for session encryption — works in both Edge Runtime (middleware) and Node.js without requiring the Node.js crypto module, avoiding Edge Runtime warnings
  - Single encrypt/decrypt implementation shared between middleware and server components for consistency
  - bcryptjs (pure JS) instead of bcrypt — no native dependencies, simpler setup
  - AuthProvider fetches /api/auth/me on mount — clean client-side auth state without Clerk SDK
  - Custom user-menu dropdown with initials avatar — replaces Clerk UserButton, shows name + sign-out
  - Sign-up page redirects to contact-admin message — self-service signup disabled since accounts are provisioned by admins
  - clerkInvitationId removed from DriverInvitation schema — invitations are now database-only records
  - passwordHash added as optional on User — existing users without passwords handled gracefully
metrics:
  duration: "~25 minutes"
  completed_date: "2026-02-17"
  tasks_completed: 3
  files_modified: 22
---

# Quick Task 5: Remove Clerk and Replace with Custom Email/Password Auth

**One-liner:** Cookie-based session auth with AES-256-GCM encryption replacing Clerk — bcrypt passwords, Web Crypto API middleware, demo user (demo@drivecommand.com / demo1234) ready out of the box.

## What Was Built

Custom authentication system replacing Clerk entirely. Encrypted session cookies carry user identity (userId, email, role, tenantId). The middleware reads the session cookie directly from the request (required for Edge Runtime) using Web Crypto API, then injects `x-tenant-id` header for downstream use. Server components use `getSession()` which reads from `next/headers`.

## Task Outcomes

### Task 1: Session auth infrastructure and Prisma schema
- Installed `bcryptjs` and `@types/bcryptjs`, removed `@clerk/nextjs` and `svix`
- Replaced `clerkUserId String @unique` with `passwordHash String?` on User model
- Removed `clerkInvitationId String @unique` from DriverInvitation model
- Added `@@unique([email, tenantId])` constraint on User
- Created `src/lib/auth/session.ts` — AES-256-GCM encryption using Web Crypto API
- Created `/api/auth/login`, `/api/auth/logout`, `/api/auth/me` routes
- Updated `.env.example` with `AUTH_SECRET` replacing all `CLERK_*` vars

### Task 2: Replace all Clerk references
- Rewrote `middleware.ts` — session-based tenant injection using Web Crypto `decrypt()`
- Rewrote `server.ts` — `getSession()` replaces `auth()` for all auth helpers
- Created `auth-context.tsx` — `AuthProvider` + `useAuth()` hook fetching `/api/auth/me`
- Updated `guards.tsx` to use `useAuth` instead of `useUser` from Clerk
- Removed `ClerkProvider` from root layout, added `AuthProvider`
- Custom sign-in form with email/password inputs and demo credentials box
- Custom user-menu dropdown with initials avatar and sign-out button
- Removed `clerkClient` from driver actions (invitations are now DB-only)
- Deleted Clerk webhook handler (`src/app/api/webhooks/clerk/route.ts`)
- Updated all three portal layouts (owner/admin/driver) to use `getSession()`

### Task 3: Seed script with bcrypt passwords, migration, and build verification
- Updated `seed.ts` — creates demo user `demo@drivecommand.com / demo1234` with bcrypt hash
- Removed all `clerkUserId` and `clerkInvitationId` from seed data
- All 5 seed drivers get `driver1234` password hash
- Full reset mode clears all tenants and users for clean state
- `npm run build` passes with zero errors — all 39 routes compile successfully

## Key Decisions

**Web Crypto API for session encryption:** Initially tried Node.js `crypto` module but it causes Edge Runtime warnings in Next.js middleware. Web Crypto API is available in both environments — no library needed, compatible everywhere.

**Single encrypt/decrypt shared across middleware and server:** The same `decrypt()` function works in both contexts because it uses Web Crypto API. This ensures tokens created by `setSession()` (server side) are correctly read by middleware.

**bcryptjs over bcrypt:** Pure JavaScript implementation avoids native binding compilation issues. Slightly slower than native bcrypt but negligible for login operations.

**AuthProvider context pattern:** Fetches `/api/auth/me` on mount once, making user data available to all client components without prop drilling. Replaces Clerk's `useUser()` hook.

**Demo user email:** Changed from `owner@drivecommand.demo` to `demo@drivecommand.com` to match the demo credentials box that was already shown on the sign-in page.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript type error in Web Crypto decrypt**
- **Found during:** Task 3 build verification
- **Issue:** `Uint8Array<ArrayBufferLike>` not assignable to `BufferSource` in Web Crypto `decrypt()` call
- **Fix:** Cast `base64urlDecode` return type to `Uint8Array<ArrayBuffer>` explicitly
- **Files modified:** `src/lib/auth/session.ts`
- **Commit:** dba70a4 (included in task 3 commit)

**2. [Rule 1 - Bug] Session encryption incompatibility between middleware and server**
- **Found during:** Task 3 — after first build attempt
- **Issue:** Initial implementation had Node.js crypto `encrypt` and separate Web Crypto `decryptEdge` — tokens encrypted with Node.js crypto could not be decrypted by Web Crypto (different binary format)
- **Fix:** Unified both to use Web Crypto API for both encrypt and decrypt
- **Files modified:** `src/lib/auth/session.ts`, `src/middleware.ts`
- **Commit:** dba70a4 (included in task 3 commit)

**3. [Rule 2 - Missing functionality] Onboarding page had client onClick in server component**
- **Found during:** Task 2 — when writing the simplified onboarding page
- **Fix:** Used HTML form POST to `/api/auth/logout` for sign-out instead of client-side fetch
- **Files modified:** `src/app/onboarding/page.tsx`
- **Commit:** 82b76ad (included in task 2 commit)

## Verification

| Check | Result |
|-------|--------|
| `grep -r "@clerk" src/` | Zero matches |
| `grep -r "clerkUserId" prisma/*.ts` | Zero matches |
| `grep "CLERK" .env.example` | Zero matches |
| `npm run build` | Passed — 39 routes, zero errors |
| Demo user seeded | demo@drivecommand.com / demo1234 |
| Prisma schema updated | passwordHash added, clerkUserId/clerkInvitationId removed |
| Session encryption | AES-256-GCM via Web Crypto API |
| Middleware tenant injection | x-tenant-id header set from session |

## Self-Check: PASSED

All created files exist, all deleted files are gone, all 3 task commits exist (a4fc05e, 82b76ad, dba70a4), and `npm run build` succeeds with zero errors.
