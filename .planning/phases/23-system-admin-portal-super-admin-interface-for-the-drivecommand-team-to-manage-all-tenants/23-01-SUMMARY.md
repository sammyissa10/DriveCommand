---
phase: 23-system-admin-portal-super-admin-interface-for-the-drivecommand-team-to-manage-all-tenants
plan: "01"
subsystem: auth
tags: [admin-portal, authentication, session, middleware, aes-gcm]
dependency_graph:
  requires: []
  provides:
    - admin-session library (ADMIN_SECRET_KEY-based AES-256-GCM)
    - /admin/login page
    - /api/admin/login and /api/admin/logout endpoints
    - middleware admin guard for /admin/* paths
  affects:
    - src/middleware.ts (admin path guard)
    - src/app/(admin)/layout.tsx (dual auth: admin_session + legacy isSystemAdmin)
tech_stack:
  added:
    - Web Crypto API for admin session (AES-256-GCM, same pattern as tenant session)
  patterns:
    - Cookie-based AES-256-GCM signed session (admin_session, 8-hour expiry)
    - React.cache() wrapping for decryption deduplication per request
    - Edge-safe decryptAdminSession (pure crypto, no next/headers) used in middleware
    - Conditional UserMenu render (shown only when tenant session exists)
key_files:
  created:
    - src/lib/auth/admin-session.ts
    - src/app/api/admin/login/route.ts
    - src/app/api/admin/logout/route.ts
    - src/app/(admin)/admin-login/page.tsx
    - src/app/(admin)/admin-login/login-form.tsx
  modified:
    - src/app/(admin)/layout.tsx
    - src/middleware.ts
decisions:
  - ADMIN_SECRET_KEY compared as plain string (no bcrypt) — brute-force resistance comes from 32+ char password complexity and 500ms delay on failure
  - decryptAdminSession is pure Web Crypto (no next/headers), making it Edge Runtime safe for middleware use
  - getAdminSession uses React.cache() and validates age defense-in-depth (beyond cookie maxAge) for added security
  - Admin layout checks admin_session first, falls back to legacy isSystemAdmin DB flag without DB hit when admin_session is valid
  - UserMenu conditionally rendered only when tenant session exists — admin-session-only users see Logout link instead
  - middleware admin guard placed BEFORE tenant session checks — valid admin_session bypasses all tenant session logic
  - Legacy isSystemAdmin DB users allowed through /admin/* (added /admin to ADMIN_ALLOWED_PATHS)
metrics:
  duration: 175s
  completed: "2026-03-09"
  tasks: 2
  files_affected: 7
---

# Phase 23 Plan 01: Admin Secret Key Auth Summary

ADMIN_SECRET_KEY password login with AES-256-GCM admin_session cookie (8-hour expiry) gating all /admin/* routes, alongside backward-compatible legacy isSystemAdmin DB access.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Admin session library + login/logout API routes | 67cc71d | admin-session.ts, login/route.ts, logout/route.ts, middleware.ts (PUBLIC_PATHS) |
| 2 | /admin/login page + update layout auth + middleware guard | cb62101 | page.tsx, login-form.tsx, layout.tsx, middleware.ts (admin guard) |

## What Was Built

**Admin session library** (`src/lib/auth/admin-session.ts`): AES-256-GCM encrypt/decrypt using `ADMIN_SECRET_KEY` env var (must be 32+ chars). Exports `encryptAdminSession`, `decryptAdminSession`, `setAdminSession`, `clearAdminSession`, `getAdminSession`, and `ADMIN_SESSION_COOKIE`. The `getAdminSession` function is wrapped with `React.cache()` for per-request deduplication and validates session age as defense-in-depth.

**Login API route** (`/api/admin/login`): POST endpoint that compares submitted password to `ADMIN_SECRET_KEY`. Sets `admin_session` cookie on match. Returns 401 with a 500ms delay on wrong password to slow brute-force. Returns 500 if `ADMIN_SECRET_KEY` is not configured.

**Logout API route** (`/api/admin/logout`): GET endpoint that clears `admin_session` cookie and redirects to `/admin/login`.

**Login page** (`/admin/login`): Server page that redirects to `/admin` if already authenticated. Renders `LoginForm` client component — password input with loading/error states, POSTs to `/api/admin/login`, redirects to `/admin` on success.

**Updated layout** (`(admin)/layout.tsx`): Dual auth — checks `admin_session` first (fast, no DB hit), falls back to `isSystemAdmin()` DB check for legacy access. Redirects to `/admin/login` (not `/unauthorized`) when unauthenticated. Conditionally renders `UserMenu` when tenant session exists, or shows Logout link for admin-session-only users.

**Updated middleware** (`src/middleware.ts`): `/admin/*` paths (except `/admin/login`) are intercepted before the tenant session check. Valid `admin_session` cookie allows through immediately. Falls back to legacy `session.isSystemAdmin` DB flag. Redirects to `/admin/login` when neither is satisfied. All admin API paths added to `PUBLIC_PATHS`.

## Decisions Made

- Plain string comparison for password (no bcrypt) — password complexity + 500ms delay provides brute-force resistance for v1
- `decryptAdminSession` kept as pure Web Crypto with no `next/headers` dependency — Edge Runtime safe for middleware
- `getAdminSession` (uses `cookies()`) kept in Node.js server-component context only
- Admin_session guard in middleware placed before tenant session checks — valid admin cookie bypasses all tenant logic
- `/admin` added to `ADMIN_ALLOWED_PATHS` so `isSystemAdmin` DB users can access new `/admin/*` routes

## Deviations from Plan

None — plan executed exactly as written.

## User Setup Required

Before the admin portal password login will work, add `ADMIN_SECRET_KEY` to your environment:

```bash
# Generate a random 32+ character secret
openssl rand -base64 32

# Add to .env.local:
ADMIN_SECRET_KEY=<generated-value>

# Add to Vercel environment variables via dashboard or CLI:
vercel env add ADMIN_SECRET_KEY production
```

## Self-Check: PASSED

Files verified:
- FOUND: src/lib/auth/admin-session.ts
- FOUND: src/app/api/admin/login/route.ts
- FOUND: src/app/api/admin/logout/route.ts
- FOUND: src/app/(admin)/admin-login/page.tsx
- FOUND: src/app/(admin)/admin-login/login-form.tsx
- FOUND: src/app/(admin)/layout.tsx (modified)
- FOUND: src/middleware.ts (modified)

Commits verified:
- 67cc71d: feat(23-01): admin session library and login/logout API routes
- cb62101: feat(23-01): /admin/login page, updated layout auth, middleware admin guard

TypeScript: npx tsc --noEmit passed with zero errors.
