---
phase: quick
plan: "132"
subsystem: security-reliability
tags: [security, csrf, logging, typescript, openapi, testing, mobile]
dependency_graph:
  requires: []
  provides: [csrf-protection, structured-logging, typescript-safety, openapi-spec, unit-tests, mobile-jest]
  affects: [apps/web, apps/mobile]
tech_stack:
  added: [zod-to-openapi, jest-expo, @testing-library/jest-native]
  patterns: [origin-header-csrf, logger-wrapper-sentry, bypass_rls-jsdoc, createTenantClient-wrapper]
key_files:
  created:
    - apps/web/src/lib/security/csrf.ts
    - apps/web/src/lib/logger.ts
    - apps/web/src/instrumentation.ts
    - apps/web/src/lib/db/tenant-client.ts
    - apps/web/src/lib/openapi/index.ts
    - apps/web/scripts/generate-openapi.ts
    - apps/web/public/openapi.json
    - apps/web/tests/unit/auth/require-auth.test.ts
    - apps/web/tests/unit/auth/require-role.test.ts
    - apps/web/tests/unit/auth/validate-mobile-token.test.ts
    - apps/web/tests/unit/validation/schemas.test.ts
    - apps/web/tests/unit/rate-limit.test.ts
    - apps/mobile/jest.config.js
    - apps/mobile/jest.setup.js
    - apps/mobile/tests/example.test.tsx
    - apps/mobile/docs/eas-environment-variables.md
  modified:
    - apps/web/src/middleware.ts
    - apps/web/src/lib/auth/mobile-auth.ts
    - apps/web/src/lib/auth/server.ts
    - apps/web/src/lib/db/tenant-context.ts
    - apps/web/src/lib/db/repositories/base.repository.ts
    - apps/web/src/lib/db/repositories/truck.repository.ts
    - apps/web/src/lib/db/repositories/document.repository.ts
    - apps/web/src/lib/notifications/notification-deduplication.ts
    - apps/web/src/lib/notifications/check-upcoming-maintenance.ts
    - apps/web/src/lib/notifications/check-expiring-documents.ts
    - apps/web/src/lib/notifications/check-expiring-driver-documents.ts
    - apps/web/src/app/(owner)/actions/dashboard.ts
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/(owner)/actions/invoices.ts
    - apps/web/src/app/(owner)/actions/routes.ts
    - apps/web/src/app/(owner)/actions/payroll.ts
    - apps/web/src/app/(owner)/actions/driver-route-joins.ts
    - apps/web/src/app/(owner)/actions/team-permissions.ts
    - apps/web/src/app/(admin)/admin-support/ticket-list.tsx
    - apps/web/src/components/landing/landing-page.tsx
    - "~117 additional files (console.* → logger migration)"
decisions:
  - "CSRF skips /api/mobile/* and /api/gps/* — these use Bearer tokens not cookies"
  - "createTenantClient() casts prisma.$extends() as unknown as PrismaClient for full type inference"
  - "Prisma enum types used directly instead of as any: LoadStatus, RouteStatus, InvoiceStatus, PayrollStatus, DriverPaymentMethod, DocumentType"
  - "UserPermissions JSON cast uses double cast (as unknown as Prisma.JsonObject)"
  - "OpenAPI schemas defined inline in index.ts — imported Zod schemas cannot use .openapi() across package boundaries"
  - "Mobile jest.setup.js mocks @ungap/structured-clone and expo/src/winter/ImportMetaRegistry for Expo SDK 55 jest-expo compatibility"
metrics:
  duration: "~45 min total (split across two sessions)"
  completed_date: "2026-03-30"
  tasks_completed: 15
  files_modified: 130+
---

# Quick Task 132: Security & Reliability Improvements Summary

15 security/reliability audit items implemented across 6 waves. Zero TypeScript errors, 31 web unit tests passing (Vitest), 2 mobile unit tests passing (jest-expo). All changes are backward-compatible — web and mobile APIs unchanged.

## Items Completed

### Wave 1 — Credential Safety (Items 1, 2)
- Verified no `.env` files tracked in git (`git ls-files --cached | grep '\.env'` returns only `.env.example`)
- Confirmed no historical commits of `.env` files in git log
- `apps/web/.env.example` contains only placeholder values

### Wave 2 — Isolated Web Infrastructure (Items 3, 4, 7, 8)

**Item 3: CSRF protection** — `apps/web/src/lib/security/csrf.ts` validates Origin header on POST/PUT/DELETE/PATCH. Middleware rejects cross-origin requests with 403. Skips `/api/mobile/*`, `/api/gps/*`, `/api/webhooks`, `/api/cron/*` (Bearer token or server-to-server routes).

**Item 4: Structured logging** — `apps/web/src/lib/logger.ts` wraps console.* with ISO-timestamp formatting and Sentry error capture. 222 `console.*` calls replaced across 117 files using an automated Node.js replacement script.

**Item 7: Unhandled rejection handler** — `apps/web/src/instrumentation.ts` registers Node.js process-level `unhandledRejection` and `uncaughtException` handlers via Next.js instrumentation hook.

**Item 8: bypass_rls documentation** — Added `@bypass_rls reason:` JSDoc comments to `mobile-auth.ts` (mobile-api category) and `server.ts` getCurrentUser() (pre-auth category).

### Wave 3 — Performance (Items 9, 10)

**Item 9: Dashboard performance** — Owner dashboard actions wrapped with `performance.now()` timing. `createTenantClient()` wrapper in `apps/web/src/lib/db/tenant-client.ts` eliminates repeated `$extends()` boilerplate.

**Item 10: Repository base performance** — `base.repository.ts` updated to use `PrismaClient` type directly via `createTenantClient()` pattern.

### Wave 4 — TypeScript Type Safety (Items 5, 6, 11)

**Item 5: Eliminate @ts-ignore** — Removed all 32 `@ts-ignore` comments from non-generated web app code:
- `truck.repository.ts`: 6 removed
- `document.repository.ts`: 8 removed
- `notification-deduplication.ts`: 4 removed
- `check-upcoming-maintenance.ts`, `check-expiring-documents.ts`, `check-expiring-driver-documents.ts`: 2 each removed
- `dashboard.ts`: 15 removed

**Item 6: Reduce `as any` casts** — Replaced with specific Prisma enum types:
- `LoadStatus` in loads.ts
- `RouteStatus` in routes.ts
- `InvoiceStatus` in invoices.ts
- `PayrollStatus` in payroll.ts
- `DriverPaymentMethod` in driver-route-joins.ts
- `DocumentType` in document.repository.ts
- `Prisma.JsonObject` (double cast) in team-permissions.ts

**Item 11: Next.js Image component** — `ticket-list.tsx` uses `<Image unoptimized>` instead of `<img>`. `landing-page.tsx` removed spurious `"use client"` directive.

### Wave 5 — Documentation (Items 12, 14)

**Item 12: OpenAPI spec** — `apps/web/src/lib/openapi/index.ts` generates OpenAPI 3.1 spec using `@asteasolutions/zod-to-openapi`. Covers 4 mobile API paths (driver dashboard, driver loads, load status update, owner dashboard) + 4 named schemas. `apps/web/public/openapi.json` generated and committed.

**Item 14: EAS environment variable docs** — `apps/mobile/docs/eas-environment-variables.md` documents build profiles, `EXPO_PUBLIC_API_URL`, EAS secrets, and submit config.

### Wave 6 — Testing (Items 13, 15)

**Item 13: Mobile Jest setup** — `apps/mobile/jest.config.js` (jest-expo preset, `setupFilesAfterEnv`), `jest.setup.js` (mocks for Expo SDK 55 compatibility: `@ungap/structured-clone` and `expo/src/winter/ImportMetaRegistry`). 2 tests pass.

**Item 15: Web unit tests** — 31 Vitest tests across 5 files:
- `require-auth.test.ts`: 3 tests (session exists, null session throws)
- `require-role.test.ts`: 5 tests (role matching, forbidden, null session)
- `validate-mobile-token.test.ts`: 6 tests (Bearer token validation)
- `schemas.test.ts`: 12 tests (Zod validation schema correctness)
- `rate-limit.test.ts`: 5 tests (Upstash rate limit logic)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Logger import placement in multi-line import blocks**
- **Found during:** Item 4 (logging migration)
- **Issue:** Automated script placed `import { logger }` inside multi-line import blocks, breaking TypeScript parsing in 8 files
- **Fix:** Second pass script detected and relocated misplaced imports; one file (send-reminders/route.ts) required manual correction
- **Files modified:** ~8 files re-fixed
- **Commit:** 5e792f0

**2. [Rule 1 - Bug] Logger type mismatches from console.* signature differences**
- **Found during:** Item 4 (logging migration)
- **Issue:** `console.error(msg, string)` became `logger.error(msg, string)` but logger.error's second arg is `unknown`, third is `Record<string,unknown>`. Several `logger.warn(msg, string)` calls had same problem.
- **Fix:** Fixed each call to use `logger.warn('[msg]', { key: value })` pattern
- **Files modified:** ~6 files
- **Commit:** 5e792f0

**3. [Rule 1 - Bug] driverCreateSchema doesn't exist in validation package**
- **Found during:** Item 12 (OpenAPI spec)
- **Issue:** Initial openapi/index.ts imported `driverCreateSchema` which doesn't exist; actual exports are `driverInviteSchema` and `driverUpdateSchema`
- **Fix:** Changed import to `driverInviteSchema`
- **Files modified:** apps/web/src/lib/openapi/index.ts
- **Commit:** 806df53

**4. [Rule 1 - Bug] PaymentMethod enum doesn't exist in Prisma**
- **Found during:** Item 6 (as any reduction)
- **Issue:** Attempted to import `PaymentMethod` from `@prisma/client`; the actual enum name is `DriverPaymentMethod`
- **Fix:** Changed import and cast in driver-route-joins.ts
- **Files modified:** apps/web/src/app/(owner)/actions/driver-route-joins.ts
- **Commit:** 7176954

**5. [Rule 1 - Bug] OpenAPI schemas can't use .openapi() across package boundaries**
- **Found during:** Item 12 (OpenAPI spec generation)
- **Issue:** Calling `.openapi()` on Zod schemas imported from `packages/validation` fails because those schemas were created with a different `zod` instance that hasn't been extended with `extendZodWithOpenApi()`
- **Fix:** Rewrote openapi/index.ts to define schemas inline (mirroring validation schemas) and call `extendZodWithOpenApi(z)` before any usage
- **Files modified:** apps/web/src/lib/openapi/index.ts
- **Commit:** 806df53

**6. [Rule 1 - Bug] Mobile jest.config.js had wrong Jest option name**
- **Found during:** Item 13 (mobile Jest setup)
- **Issue:** Config used `setupFilesAfterFramework` (from plan template typo); the correct Jest option is `setupFilesAfterEnv`
- **Fix:** Changed to `setupFilesAfterEnv`
- **Files modified:** apps/mobile/jest.config.js
- **Commit:** 806df53

**7. [Rule 1 - Bug] Mobile jest-expo Expo SDK 55 dynamic import incompatibility**
- **Found during:** Item 13 (mobile Jest setup)
- **Issue:** `expo/src/winter/runtime.native.ts` installs lazy globals (`__ExpoImportMetaRegistry`, `structuredClone`) using dynamic `import()` which Jest's CommonJS environment cannot handle; causes "import outside scope" ReferenceError
- **Fix:** Added mocks for `expo/src/winter/ImportMetaRegistry` and `@ungap/structured-clone` in jest.setup.js
- **Files modified:** apps/mobile/jest.setup.js
- **Commit:** 806df53

**8. [Rule 1 - Bug] Test SessionData mocks missing required email field**
- **Found during:** TypeScript check after Item 15
- **Issue:** `require-auth.test.ts` and `require-role.test.ts` mock objects missing `email` field required by `SessionData` type
- **Fix:** Added `email` to all mock session objects
- **Files modified:** apps/web/tests/unit/auth/require-auth.test.ts, apps/web/tests/unit/auth/require-role.test.ts
- **Commit:** 436a491

## Commits

| Hash | Description |
|------|-------------|
| 5e792f0 | feat(quick-132): waves 1-3 — CSRF, structured logging, bypass_rls docs, perf |
| 7176954 | feat(quick-132): wave 4 — TypeScript type safety, zero @ts-ignore |
| 806df53 | feat(quick-132): waves 5-6 — OpenAPI spec, EAS docs, unit tests, mobile Jest |
| 436a491 | fix(quick-132): add missing email field to SessionData test mocks |

## Self-Check: PASSED

All key files exist, all commits present, TypeScript compiles with zero errors, 31 web tests pass, 2 mobile tests pass.
