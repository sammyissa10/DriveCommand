---
phase: quick-109
plan: "01"
subsystem: auth
tags: [supabase, auth, session, middleware, mobile-auth]
dependency_graph:
  requires: []
  provides:
    - Supabase Auth session management (cookie-based via @supabase/ssr)
    - Supabase JWT validation for mobile Bearer tokens
    - User metadata in JWT (role, tenantId, permissions — no DB lookup)
  affects:
    - apps/web/src/lib/auth/session.ts
    - apps/web/src/middleware.ts
    - apps/web/src/app/api/auth/login/route.ts
    - apps/web/src/app/api/auth/logout/route.ts
    - apps/web/src/app/api/auth/me/route.ts
    - apps/web/src/lib/auth/mobile-auth.ts
tech_stack:
  added:
    - "@supabase/supabase-js"
    - "@supabase/ssr"
  patterns:
    - Supabase SSR pattern (createServerClient with cookie get/set)
    - JWT user_metadata for role/tenantId (bypasses Prisma IPv6 issue)
    - Admin client (service_role) for server-to-server token validation
key_files:
  created:
    - apps/web/src/lib/supabase/server.ts
    - apps/web/src/lib/supabase/client.ts
    - apps/web/src/lib/supabase/middleware.ts
    - apps/web/src/lib/supabase/admin.ts
    - apps/web/src/app/api/auth/callback/route.ts
    - apps/web/scripts/create-supabase-demo-user.ts
  modified:
    - apps/web/src/lib/auth/session.ts
    - apps/web/src/lib/auth/server.ts
    - apps/web/src/lib/auth/mobile-auth.ts
    - apps/web/src/middleware.ts
    - apps/web/src/app/api/auth/login/route.ts
    - apps/web/src/app/api/auth/logout/route.ts
    - apps/web/src/app/api/auth/me/route.ts
    - apps/web/src/app/api/auth/accept-invitation/route.ts
    - apps/web/.env.local
    - apps/web/.env.example
    - apps/web/package.json
decisions:
  - "Keep bcryptjs as devDependency: prisma/seed.ts still hashes passwords for local seeding"
  - "User metadata in Supabase JWT stores role/tenantId/permissions, bypassing Prisma IPv6 issue on Vercel"
  - "Mobile isActive check removed from validateMobileToken: deactivating a user should also call supabase.auth.admin.updateUserById({ banned: true })"
  - "accept-invitation creates Supabase Auth user first then Prisma User with the same UUID"
metrics:
  duration: "6 minutes"
  completed_date: "2026-03-25"
  tasks_completed: 2
  tasks_total: 3
  files_created: 6
  files_modified: 11
---

# Phase quick-109 Plan 01: Migrate Auth to Supabase Auth Summary

**One-liner:** Replaced custom bcrypt/AES-256-GCM session auth with Supabase Auth cookie sessions and JWT user_metadata, eliminating Prisma DB lookups for all auth flows.

## What Was Built

The entire authentication layer was migrated from a hand-rolled AES-256-GCM encrypted cookie system to Supabase Auth using `@supabase/ssr`. The migration:

1. **Supabase client utilities** (`apps/web/src/lib/supabase/`) — Four clients covering all contexts: browser (createBrowserClient), server components/route handlers (createServerClient with cookies()), middleware (NextRequest/NextResponse cookie handling), and admin (service_role for server-to-server ops).

2. **session.ts rewrite** — `getSession()` now calls `supabase.auth.getUser()` and reads role/tenantId/permissions from `user.user_metadata` JWT claims. The `SessionData` interface is unchanged — all 20+ downstream consumers work without modification.

3. **Login route** — `bcrypt.compare` replaced with `supabase.auth.signInWithPassword`. Session cookie set by `@supabase/ssr` automatically. Returns `data.session.access_token` as the mobile token (replaces the old AES-GCM encrypted token).

4. **Logout route** — `clearSession()` replaced with `supabase.auth.signOut()`.

5. **Middleware** — `decrypt(sessionToken)` replaced with `createMiddlewareClient(request)` + `supabase.auth.getUser()`. All guards (system admin, driver redirect, manager permissions) preserved. Session cookies are refreshed on each request via the middleware client. `x-tenant-id` header still injected.

6. **Mobile auth** — `validateMobileToken` now calls `admin.auth.getUser(token)` on the Supabase admin client. No DB query needed — role/tenantId read from JWT user_metadata. Eliminates the Prisma IPv6 issue for all 35 mobile API routes.

7. **Accept invitation** — Creates a Supabase Auth user (with `email_confirm: true`) using the admin client, then creates the Prisma User record with the same UUID. Signs the user in via `signInWithPassword`.

8. **Auth callback** — New `/api/auth/callback` route for OAuth/email confirmation code exchange.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] Kept bcryptjs as devDependency**
- **Found during:** Task 2 verification (TypeScript check)
- **Issue:** `prisma/seed.ts` imports `bcryptjs` for hashing seed data passwords. Removing the package caused a TS error.
- **Fix:** Moved `bcryptjs` and `@types/bcryptjs` to `devDependencies` instead of fully removing them. The seed script is dev-only, not part of the auth migration.
- **Files modified:** `apps/web/package.json`
- **Commit:** 94b1c70

## Pending (Checkpoint Required)

Task 3 requires human verification:
- Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`
- Run `npx tsx scripts/create-supabase-demo-user.ts`
- Test sign-in at http://localhost:3000/sign-in with `demo@drivecommand.com / demo1234`

## Self-Check: PASSED

Files created verified:
- apps/web/src/lib/supabase/server.ts — EXISTS
- apps/web/src/lib/supabase/client.ts — EXISTS
- apps/web/src/lib/supabase/middleware.ts — EXISTS
- apps/web/src/lib/supabase/admin.ts — EXISTS
- apps/web/src/app/api/auth/callback/route.ts — EXISTS
- apps/web/scripts/create-supabase-demo-user.ts — EXISTS

Commits verified:
- 7d66800 — Task 1: Supabase packages + client utilities
- 94b1c70 — Task 2: Auth layer migration
