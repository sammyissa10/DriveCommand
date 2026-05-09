---
phase: quick-137
plan: "01"
subsystem: web-api, mobile, observability
tags: [health-check, rate-limiting, observability, onboarding, deployment]
dependency_graph:
  requires: []
  provides: [health-endpoint, redis-production-warning, mobile-env-template]
  affects: [apps/web/src/middleware.ts, apps/web/src/lib/rate-limit.ts]
tech_stack:
  added: []
  patterns: [public-path-bypass, production-env-guard, env-example-template]
key_files:
  created:
    - apps/web/src/app/api/health/route.ts
    - apps/mobile/.env.example
  modified:
    - apps/web/src/middleware.ts
    - apps/web/src/lib/rate-limit.ts
decisions:
  - "/api/health placed before /api/warmup in PUBLIC_PATHS to group infrastructure endpoints together"
  - "Android emulator URL (10.0.2.2:3000) used as default in .env.example — most common dev scenario"
metrics:
  duration: "84s"
  completed: "2026-03-31"
  tasks_completed: 2
  files_changed: 4
---

# Quick 137: Three Deployment Hardening Fixes Summary

One-liner: Unauthenticated health check endpoint, production Redis missing-config warning, and mobile .env.example template for developer onboarding.

## What Was Done

Three small deployment hardening fixes to improve production observability and developer onboarding.

### Task 1: /api/health endpoint (commit f28a53a)

Created `apps/web/src/app/api/health/route.ts` — a minimal GET handler returning `{ ok, ts, version }` with `force-dynamic` to prevent caching. Added `/api/health` to `PUBLIC_PATHS` in `apps/web/src/middleware.ts` so middleware short-circuits before Supabase session creation, keeping uptime monitor latency minimal.

### Task 2: Redis production warning + mobile .env.example (commit 17f3eb0)

Updated `createRedis()` in `apps/web/src/lib/rate-limit.ts` to emit a `console.warn` when `NODE_ENV === 'production'` and Redis env vars are missing — previously the failure was silent. Created `apps/mobile/.env.example` with the same section-header style as `apps/web/.env.example`, documenting 3 required vars (API_URL, Supabase URL, Supabase anon key) and 2 optional vars (Sentry DSN, Google Maps API key).

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `cd apps/web && npx tsc --noEmit` — passed, no type errors
- `apps/web/src/app/api/health/route.ts` exists and exports GET
- `apps/web/src/middleware.ts` PUBLIC_PATHS includes '/api/health'
- `apps/web/src/lib/rate-limit.ts` contains production console.warn for missing Redis
- `apps/mobile/.env.example` exists with 5 env vars (EXPO_PUBLIC_API_URL, EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_SENTRY_DSN, EXPO_PUBLIC_GOOGLE_MAPS_API_KEY)

## Self-Check: PASSED

- f28a53a — found in git log
- 17f3eb0 — found in git log
- apps/web/src/app/api/health/route.ts — exists
- apps/mobile/.env.example — exists
