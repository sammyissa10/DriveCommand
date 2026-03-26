---
phase: quick-113
plan: "01"
subsystem: security-observability
tags:
  - rate-limiting
  - sentry
  - eas-update
  - security
  - observability
  - mobile
  - api
dependency_graph:
  requires: []
  provides:
    - "Rate limiting utility (authLimiter, gpsLimiter, mobileLimiter)"
    - "Sentry error monitoring for web (client/server/edge)"
    - "Sentry error monitoring for mobile (init + wrap)"
    - "EAS Update OTA config in app.json"
  affects:
    - "apps/web/src/app/api/auth/login/route.ts"
    - "apps/web/src/app/api/gps/report/route.ts"
    - "apps/web/src/app/api/mobile/driver/dashboard/route.ts"
    - "apps/web/src/app/api/mobile/owner/dashboard/route.ts"
    - "apps/mobile/app/_layout.tsx"
tech_stack:
  added:
    - "@upstash/ratelimit"
    - "@upstash/redis"
    - "@sentry/nextjs"
    - "@sentry/react-native"
  patterns:
    - "Graceful no-op rate limiting when Redis env vars absent (safe for local dev)"
    - "Sentry.wrap(RootLayout) for mobile error boundary"
    - "EAS Update checkAutomatically: ON_LOAD with silent error handling"
key_files:
  created:
    - "apps/web/src/lib/rate-limit.ts"
    - "apps/web/sentry.client.config.ts"
    - "apps/web/sentry.server.config.ts"
    - "apps/web/sentry.edge.config.ts"
  modified:
    - "apps/web/src/app/api/auth/login/route.ts"
    - "apps/web/src/app/api/gps/report/route.ts"
    - "apps/web/src/app/api/mobile/driver/dashboard/route.ts"
    - "apps/web/src/app/api/mobile/owner/dashboard/route.ts"
    - "apps/web/next.config.ts"
    - "apps/web/.env.example"
    - "apps/mobile/app/_layout.tsx"
    - "apps/mobile/app.json"
  deleted:
    - "apps/web/src/app/api/debug/route.ts"
decisions:
  - "Rate limiters return null when env vars absent so local dev works without Redis"
  - "GPS limiter keyed by userId (not IP) because drivers share IPs via fleet networks"
  - "Auth limiter keyed by IP to catch credential-stuffing before userId is known"
  - "Sentry enabled only in production (NODE_ENV=production / !__DEV__) to reduce noise"
  - "EAS Update uses appVersion runtime policy for predictable native/JS compatibility"
metrics:
  duration: "~5 minutes"
  completed: "2026-03-26T19:34:04Z"
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 8
  files_deleted: 1
---

# Quick Task 113: Production Readiness Hardening Summary

**One-liner:** Removed unauthenticated debug data-exposure route, added Upstash Redis rate limiting to auth/GPS/mobile APIs, and integrated Sentry error monitoring with EAS OTA update checks for production launch readiness.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Delete debug route and add rate limiting | 20ef21b | rate-limit.ts, login/route.ts, gps/report/route.ts, mobile dashboards |
| 2 | Sentry integration for web and mobile | e661441 | sentry.*.config.ts, next.config.ts, _layout.tsx |
| 3 | EAS Update configuration for OTA updates | b256231 | app.json, _layout.tsx |

## What Was Built

### Task 1: Security Hardening

**Debug route deleted** — `apps/web/src/app/api/debug/route.ts` exposed Tenant table data and raw DB queries to any unauthenticated caller. Permanently removed.

**Rate limiting utility** — `apps/web/src/lib/rate-limit.ts` provides three pre-configured Upstash Redis limiters:
- `authLimiter` — sliding window, 5 req/15min per IP (brute-force protection on login)
- `gpsLimiter` — fixed window, 1 req/5s per userId (prevents GPS spam from mobile)
- `mobileLimiter` — fixed window, 60 req/min per userId (general mobile API throttle)

All limiters return a 429 with `Retry-After` header when triggered. When `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are absent (local dev), `applyRateLimit` returns null — no Redis dependency required in development.

**Routes updated:**
- `/api/auth/login` — rate limited by forwarded IP
- `/api/gps/report` — rate limited by userId after auth resolves
- `/api/mobile/driver/dashboard` — rate limited by userId
- `/api/mobile/owner/dashboard` — rate limited by userId

### Task 2: Sentry Error Monitoring

**Web** — Three Sentry config files created (client, server, edge). `next.config.ts` now wraps with `withSentryConfig` pointing to org `onesquad-drivecommand` / project `drivecommand-web`. Source maps uploaded on CI builds via `SENTRY_AUTH_TOKEN`. Client uses `NEXT_PUBLIC_SENTRY_DSN`; server/edge use `SENTRY_DSN`.

**Mobile** — `@sentry/react-native` installed. `Sentry.init()` called at module load in `_layout.tsx` with `EXPO_PUBLIC_SENTRY_DSN`. `RootLayout` wrapped with `Sentry.wrap()` for automatic error boundary. Both disabled in development (`enabled: !__DEV__`).

### Task 3: EAS Update / OTA

**app.json** — `updates` block added with correct EAS project URL (`u.expo.dev/010aaae1...`), `checkAutomatically: ON_LOAD`, 5s fallback timeout. `runtimeVersion.policy: appVersion` ensures OTA updates only apply to matching native builds.

**_layout.tsx** — `checkForOTAUpdate()` runs on mount in `RootLayout`. Skipped in `__DEV__`. Silently catches errors to never block app launch.

## Deviations from Plan

None — plan executed exactly as written.

## User Action Required

Before production deployment, set these environment variables:

**Vercel (web app):**
```
UPSTASH_REDIS_REST_URL=      # Upstash Console -> Database -> REST API -> URL
UPSTASH_REDIS_REST_TOKEN=    # Upstash Console -> Database -> REST API -> Token
NEXT_PUBLIC_SENTRY_DSN=      # Sentry -> Project Settings -> Client Keys (DSN)
SENTRY_DSN=                  # Same DSN value
SENTRY_AUTH_TOKEN=           # Sentry -> Settings -> Auth Tokens -> Create New Token
```

**apps/mobile/.env.local:**
```
EXPO_PUBLIC_SENTRY_DSN=      # Sentry -> Mobile project DSN
```

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| apps/web/src/lib/rate-limit.ts exists | FOUND |
| apps/web/sentry.client.config.ts exists | FOUND |
| apps/web/sentry.server.config.ts exists | FOUND |
| apps/web/sentry.edge.config.ts exists | FOUND |
| apps/web/src/app/api/debug/route.ts deleted | CONFIRMED |
| Commit 20ef21b exists | FOUND |
| Commit e661441 exists | FOUND |
| Commit b256231 exists | FOUND |
