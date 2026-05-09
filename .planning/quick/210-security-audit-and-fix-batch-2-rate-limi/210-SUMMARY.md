---
phase: quick-210
plan: "01"
subsystem: security / api-hardening
tags: [rate-limiting, error-sanitization, security, api]
dependency_graph:
  requires: []
  provides: [publicLimiter, uploadLimiter, sanitized-error-responses]
  affects: [api/track, api/documents, api/support, api/mobile/owner]
tech_stack:
  added: []
  patterns: [IP-based rate limiting for public endpoints, tenant-scoped rate limiting for upload endpoints, generic error responses with server-side logging]
key_files:
  created: []
  modified:
    - apps/web/src/lib/rate-limit.ts
    - apps/web/src/app/api/track/[token]/route.ts
    - apps/web/src/app/api/documents/request-upload-url/route.ts
    - apps/web/src/app/api/documents/upload/route.ts
    - apps/web/src/app/api/documents/complete-upload/route.ts
    - apps/web/src/app/api/documents/download-url/[id]/route.ts
    - apps/web/src/app/api/documents/delete/[id]/route.ts
    - apps/web/src/app/api/documents/multipart/initiate/route.ts
    - apps/web/src/app/api/documents/multipart/part-url/route.ts
    - apps/web/src/app/api/documents/multipart/complete/route.ts
    - apps/web/src/app/api/support/upload-attachment/route.ts
    - apps/web/src/app/api/mobile/owner/loads/route.ts
    - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    - apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
decisions:
  - "Use tenantId (not userId) as rate limit key for document/upload routes — simpler, still prevents per-tenant abuse since tenants have few users"
  - "publicLimiter uses IP from x-forwarded-for split on comma — matches existing login route pattern"
  - "v1/carrier/* routes (40 routes) excluded from rate limiting — all authenticated, lower priority, flag for future middleware-level solution"
metrics:
  duration: "15 minutes"
  completed: "2026-04-14"
  tasks_completed: 2
  files_modified: 14
---

# Phase quick-210 Plan 01: Security Audit Batch 2 — Rate Limiting + Error Sanitization

Rate limiting added to all unprotected/upload endpoints; internal error details scrubbed from all 500 responses across API routes.

## What Was Built

### Task 1: Rate Limiting on Unprotected Endpoints

Added two new rate limiters to `apps/web/src/lib/rate-limit.ts`:

- **`publicLimiter`** — 30 requests/minute per IP, `rl:public` prefix. Applied to the public customer tracking endpoint to prevent token enumeration attacks.
- **`uploadLimiter`** — 20 requests/minute per tenant, `rl:upload` prefix. Applied to all document upload/download routes and the support attachment upload route.

Rate limiting applied to:
- `/api/track/[token]` — IP-based via `x-forwarded-for` header
- `/api/documents/request-upload-url` — tenant-scoped
- `/api/documents/upload` — tenant-scoped
- `/api/documents/complete-upload` — tenant-scoped
- `/api/documents/download-url/[id]` — tenant-scoped
- `/api/documents/delete/[id]` — tenant-scoped
- `/api/documents/multipart/initiate` — tenant-scoped
- `/api/documents/multipart/part-url` — tenant-scoped
- `/api/documents/multipart/complete` — tenant-scoped
- `/api/support/upload-attachment` — tenant-scoped

### Task 2: Error Message Leakage Fixes

Eight routes were leaking raw `err.message` / `error.message` in their 500 responses. Fixed all:

| Route | Before | After |
|-------|--------|-------|
| `documents/download-url/[id]` | `error.message` leaked | Generic + `logger.error` added |
| `documents/delete/[id]` | `error.message` leaked | Generic + `logger.error` added |
| `documents/multipart/initiate` | `error.message` leaked | Generic (logger already present) |
| `documents/multipart/part-url` | `error.message` leaked | Generic (logger already present) |
| `documents/multipart/complete` | `error.message` leaked | Generic (logger already present) |
| `mobile/owner/loads` (POST) | `err.message` leaked | Generic (logger already present) |
| `mobile/owner/loads/[id]` (PATCH) | `err.message` leaked | Generic (logger already present) |
| `mobile/owner/routes/[id]` (PATCH) | `err.message` leaked | Generic (logger already present) |

Acceptable patterns left unchanged:
- `v1/carrier/clients` and `v1/carrier/clients/[id]` — use `detail: process.env.NODE_ENV !== 'production' ? detail : undefined` (correct)
- `v1/carrier/contracts` — NODE_ENV guard (correct)
- `v1/carrier/fleet/drivers` — specific known business error "User already linked" (controlled)
- `v1/carrier/loads` — specific known business error about client_id (controlled)
- `v1/carrier/loads/[id]` — err.message only in `logger.error` call, generic response returned (safe)

## Commits

| Hash | Message |
|------|---------|
| `6e7b048` | feat(quick-210): add rate limiting to public and document upload endpoints |
| `fdb8f86` | fix(quick-210): stop error.message leakage in API 500 responses |

## Deviations from Plan

None — plan executed exactly as written.

## Flagged for Future Work

The 40 `/api/v1/carrier/*` routes are all authenticated (session-based) but have no per-route rate limiting. These are internal API routes with lower abuse risk. Recommended approach: add middleware-level rate limiting for the entire `/api/v1/` prefix in a future task rather than patching all 40 routes individually.

## Self-Check: PASSED

Files verified present:
- `apps/web/src/lib/rate-limit.ts` — contains `publicLimiter` and `uploadLimiter`
- All 14 modified route files committed

Commits verified: `6e7b048` and `fdb8f86` exist in git log.
