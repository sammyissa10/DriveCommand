---
phase: 29-monorepo-expo-scaffold
plan: 03
subsystem: api
tags: [typescript, zod, monorepo, turborepo, shared-packages, api-client, validation]

# Dependency graph
requires:
  - phase: 29-01
    provides: monorepo structure with packages/types, packages/validation, packages/api-client stubs
  - phase: 29-02
    provides: apps/mobile scaffold referencing workspace packages

provides:
  - packages/types: framework-agnostic TypeScript interfaces for all entities (Auth, Truck, Driver, Load, Route, HOS, Incident, Message, Document, GPS, Dashboard)
  - packages/validation: Zod schemas for all 17 entity types extracted from apps/web
  - packages/api-client: Bearer token REST client for mobile-to-Next.js-API communication

affects:
  - Phase 30+ (mobile screens import from @drivecommand/types and @drivecommand/api-client)
  - apps/web (now imports from @drivecommand/validation instead of @/lib/validations/*)

# Tech tracking
tech-stack:
  added: [zod (in packages/validation)]
  patterns: [workspace package imports via @drivecommand/*, shared Zod schemas across web and mobile, Bearer token auth pattern for REST calls]

key-files:
  created:
    - packages/types/src/index.ts
    - packages/types/tsconfig.json
    - packages/validation/src/index.ts
    - packages/validation/src/load.ts
    - packages/validation/src/driver.ts
    - packages/validation/src/truck.ts
    - packages/validation/src/document.ts
    - packages/validation/src/customer.ts
    - packages/validation/src/route.ts
    - packages/validation/src/invoice.ts
    - packages/validation/src/expense.ts
    - packages/validation/src/payroll.ts
    - packages/validation/src/maintenance.ts
    - packages/validation/src/tag.ts
    - packages/validation/src/notification.ts
    - packages/validation/src/notification-preferences.ts
    - packages/validation/src/payment.ts
    - packages/validation/src/expense-category.ts
    - packages/validation/src/expense-template.ts
    - packages/validation/src/driver-route-join.ts
    - packages/validation/tsconfig.json
    - packages/api-client/src/client.ts
    - packages/api-client/src/index.ts
    - packages/api-client/tsconfig.json
  modified:
    - packages/api-client/package.json
    - 23 files in apps/web (import paths updated to @drivecommand/validation)

key-decisions:
  - "packages/* are pure TypeScript/Zod with no React Native or Next.js imports"
  - "document.ts in packages/validation inlines ALLOWED_MIME_TYPES to remove web-specific storage/validate dependency"
  - "api-client extends REST endpoints incrementally per phase, not all upfront"
  - "apps/web validations kept in place (not deleted) alongside package — only imports redirected"

patterns-established:
  - "Pattern 1: Shared types imported as @drivecommand/types in both web and mobile"
  - "Pattern 2: Shared Zod schemas imported as @drivecommand/validation — single source of truth for validation"
  - "Pattern 3: Mobile calls Next.js API routes via apiClient with Bearer token auth"

# Metrics
duration: 7min
completed: 2026-03-22
---

# Phase 29 Plan 03: Shared Packages — Types, Validation, API Client Summary

**Three monorepo shared packages: framework-agnostic TypeScript types, 17 Zod validation schemas extracted from apps/web, and a Bearer token REST client for mobile-to-API communication**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-22T22:40:03Z
- **Completed:** 2026-03-22T22:47:18Z
- **Tasks:** 3
- **Files modified:** 46 (23 created in packages/, 23 modified in apps/web/)

## Accomplishments
- packages/types built with all shared entity interfaces: AuthUser, AuthSession, Truck, Driver, Load, Route, HOSEntry, Incident, FleetMessage, DriverDocument, GPSLocation, OwnerDashboardData and their status enums
- packages/validation contains all 17 Zod schema files from apps/web — single source of truth for both web and mobile validation
- packages/api-client provides apiClient with login/me/logout/registerPushToken/reportGPS/getGPSLocations — extensible per mobile phase
- All 23 apps/web files now import from @drivecommand/validation, TypeScript check passes with no errors

## Task Commits

1. **Task 1: packages/types** - `dc895ac` (feat)
2. **Task 2: packages/validation + apps/web import updates** - `a9afccb` (feat)
3. **Task 3: packages/api-client** - `798bbbb` (feat)

## Files Created/Modified
- `packages/types/src/index.ts` - All shared TypeScript interfaces (framework-agnostic, no Prisma imports)
- `packages/validation/src/*.ts` - 17 Zod schema files mirroring apps/web/src/lib/validations/
- `packages/api-client/src/client.ts` - apiClient using fetch with Bearer token auth
- `packages/api-client/src/index.ts` - Re-exports apiClient and all @drivecommand/types
- `apps/web/src/app/(owner)/actions/*.ts` - 18 action files updated to import from @drivecommand/validation
- `apps/web/src/app/api/documents/**/*.ts` - 3 API routes updated
- `apps/web/src/components/tags/tag-manager.tsx` - PRESET_COLORS now from @drivecommand/validation
- `apps/web/src/app/(owner)/trucks/[id]/page.tsx` - documentMetadataSchema from @drivecommand/validation

## Decisions Made
- Inlined `ALLOWED_MIME_TYPES` constant in `packages/validation/src/document.ts` to eliminate the web-specific `@/lib/storage/validate` import — keeps the validation package framework-agnostic while preserving the same business rules
- Kept the original `apps/web/src/lib/validations/` source files in place (not deleted) — the package is the canonical source but the originals remain as reference; they are no longer imported anywhere in apps/web

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed web-specific storage import from document.ts**
- **Found during:** Task 2 (packages/validation schema migration)
- **Issue:** `document.schemas.ts` imports `ALLOWED_TYPES` from `@/lib/storage/validate` — a Next.js app-specific module that would break the shared package build
- **Fix:** Inlined the constant as `ALLOWED_MIME_TYPES` (same values: pdf, jpeg, png) directly in `packages/validation/src/document.ts`
- **Files modified:** packages/validation/src/document.ts
- **Verification:** `npm run build` in packages/validation succeeds, no external app imports
- **Committed in:** a9afccb (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - blocking dependency issue)
**Impact on plan:** Necessary for correctness — the shared package must build without depending on app-specific modules. Identical business logic preserved.

## Issues Encountered
None beyond the document.ts import deviation above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three shared packages are compiled and available via workspace symlinks
- apps/mobile can import from @drivecommand/types and @drivecommand/api-client
- apps/web TypeScript checks pass with no errors after import migration
- Phase 30 (auth screens) can immediately use apiClient.login() and @drivecommand/types

---
*Phase: 29-monorepo-expo-scaffold*
*Completed: 2026-03-22*

## Self-Check: PASSED

- packages/types/src/index.ts: FOUND
- packages/types/tsconfig.json: FOUND
- packages/validation/src/index.ts: FOUND
- packages/validation/src/document.ts: FOUND
- packages/api-client/src/client.ts: FOUND
- packages/api-client/src/index.ts: FOUND
- .planning/phases/29-monorepo-expo-scaffold/29-03-SUMMARY.md: FOUND
- Commit dc895ac (packages/types): FOUND
- Commit a9afccb (packages/validation): FOUND
- Commit 798bbbb (packages/api-client): FOUND
