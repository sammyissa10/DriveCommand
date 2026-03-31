---
phase: quick-133
plan: 01
subsystem: auth, api, security
tags: [open-redirect, rate-limiting, security-headers, error-sanitization, mmkv, middleware]

# Dependency graph
requires: []
provides:
  - Open redirect prevention in auth callback (relative-path validation)
  - Auth + rate limiting on geocoding autocomplete endpoint
  - Rate limiting on accept-invitation POST endpoint
  - Generic error messages on all client-facing 500 responses (6 routes)
  - HTTP security headers on all responses (X-Frame-Options, HSTS, etc.)
  - MMKV session storage security documentation
  - Middleware public route documentation
affects: [auth, geocoding, documents, integrations, mobile]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dual mobile/web auth check pattern in route handlers: validateMobileToken ?? getSession"
    - "Rate limit key pattern: geo:{userId|ip}, accept-inv:{ip}"
    - "Client error response sanitization: log full error server-side, return generic message to client"

key-files:
  created: []
  modified:
    - apps/web/src/app/api/auth/callback/route.ts
    - apps/web/src/app/api/geocoding/autocomplete/route.ts
    - apps/web/src/app/api/auth/accept-invitation/route.ts
    - apps/web/src/lib/rate-limit.ts
    - apps/web/src/app/api/documents/upload/route.ts
    - apps/web/src/app/api/documents/request-upload-url/route.ts
    - apps/web/src/app/api/documents/complete-upload/route.ts
    - apps/web/src/app/api/support/upload-attachment/route.ts
    - apps/web/src/app/api/integrations/motive/sync/route.ts
    - apps/web/src/app/api/integrations/samsara/sync/route.ts
    - apps/web/next.config.ts
    - apps/mobile/lib/storage.ts
    - apps/web/src/middleware.ts

key-decisions:
  - "Protocol-relative URL bypass (?next=//evil.com) explicitly blocked with !startsWith('//')"
  - "Geocoding auth uses dual pattern (mobile Bearer token OR session cookie) — consistent with gps/report pattern"
  - "geocodingLimiter uses slidingWindow(30, '1m') — generous for autocomplete but blocks abuse"
  - "No Content-Security-Policy added to headers — managed separately to avoid Next.js/Sentry conflicts"
  - "accept-invitation GET handler not rate limited — read-only, UUID-gated, negligible risk"

patterns-established:
  - "Error sanitization: always console.error/logger.error full stack, return {error: 'Internal server error'} to client"
  - "Security headers live in second headers() entry in next.config.ts (first is X-Accel-Buffering)"

# Metrics
duration: 15min
completed: 2026-03-30
---

# Quick-133: Fix Security Audit Findings Summary

**Open redirect blocked in auth callback, geocoding endpoint secured with dual auth and rate limiting, error internals scrubbed from 6 API client responses, and HTTP security headers added site-wide**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-03-30T00:55:23Z
- **Completed:** 2026-03-30T01:10:00Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments

- Auth callback now validates `next` param is a relative path (blocks open redirect + protocol-relative bypass)
- Geocoding autocomplete endpoint gated behind dual auth check (mobile token or session) with 30 req/min rate limit
- Accept-invitation POST endpoint rate limited (reuses authLimiter: 5 req/15 min per IP)
- 6 API routes sanitized: full errors logged server-side, generic messages returned to clients
- HTTP security headers applied to all responses via next.config.ts
- MMKV session storage documented with security rationale and usage callouts
- Middleware public route list comprehensively documented with reasons for each bypass

## Task Commits

1. **Task 1: Fix open redirect, add auth + rate limiting to unprotected endpoints** - `86dd26f` (fix)
2. **Task 2: Sanitize error messages, add security headers, document and audit** - `51a9b2b` (fix)

## Files Created/Modified

- `apps/web/src/app/api/auth/callback/route.ts` - `safeNext` validation blocks open redirect and protocol-relative bypass
- `apps/web/src/app/api/geocoding/autocomplete/route.ts` - Added dual auth + geocodingLimiter before processing
- `apps/web/src/app/api/auth/accept-invitation/route.ts` - Added authLimiter rate limit on POST
- `apps/web/src/lib/rate-limit.ts` - New `geocodingLimiter` export (slidingWindow 30/1m, prefix rl:geo)
- `apps/web/src/app/api/documents/upload/route.ts` - Generic error response
- `apps/web/src/app/api/documents/request-upload-url/route.ts` - Generic error response
- `apps/web/src/app/api/documents/complete-upload/route.ts` - Generic error response
- `apps/web/src/app/api/support/upload-attachment/route.ts` - Generic error response
- `apps/web/src/app/api/integrations/motive/sync/route.ts` - Generic error response ('Sync failed')
- `apps/web/src/app/api/integrations/samsara/sync/route.ts` - Generic error response ('Sync failed')
- `apps/web/next.config.ts` - Security headers block (X-Frame-Options DENY, HSTS, nosniff, Referrer-Policy, Permissions-Policy)
- `apps/mobile/lib/storage.ts` - JSDoc security note above sessionStorage object
- `apps/web/src/middleware.ts` - Comprehensive PUBLIC API ROUTES documentation comment

## Decisions Made

- Protocol-relative URLs (e.g., `//evil.com`) explicitly blocked via `!next.startsWith('//')` — a common bypass vector not covered by checking `startsWith('/')` alone
- Geocoding auth pattern mirrors `gps/report/route.ts` (validateMobileToken ?? getSession) for consistency
- No Content-Security-Policy header added — deliberately deferred to avoid conflicts with Next.js inline scripts and Sentry source map injection
- accept-invitation GET handler intentionally left without rate limiting: it's read-only, UUID-keyed (not guessable), and returns only email + firstName

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

All security fixes complete. TypeScript compiles cleanly. No blockers for subsequent work.

## Self-Check: PASSED

All 13 modified files verified on disk. Both task commits verified in git log (86dd26f, 51a9b2b). TypeScript compiles cleanly with zero errors.

---
*Phase: quick-133*
*Completed: 2026-03-30*
