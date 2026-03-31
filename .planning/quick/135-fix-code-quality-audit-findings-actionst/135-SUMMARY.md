---
phase: quick-135
plan: 135
subsystem: ui
tags: [typescript, actionstate, eslint, prettier, react, nextjs, turborepo, mobile]

# Dependency graph
requires:
  - phase: quick-132
    provides: withMobileAuth pattern and mobile API route structure
  - phase: quick-134
    provides: mobile app architecture with form patterns
provides:
  - ActionState type in packages/types with warning and values fields
  - withMobileAuth higher-order function wrapping 5 mobile routes
  - Typed SQL interfaces replacing as any[] in fuel and live-map actions
  - Split landing page (8 section components from 936-line monolith)
  - ESLint + Prettier configs for web and mobile
  - Zero any types in server action prevState and catch blocks across codebase
affects: [any phase building new server actions, any phase adding mobile API routes, landing page work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "ActionState type for useActionState/useFormState compatibility"
    - "withMobileAuth HOF for mobile route auth, rate limiting, and error handling"
    - "fieldErrors narrowing pattern in form components for typed field error display"
    - "vals typed cast pattern for Record<string, unknown> values in form defaultValue props"

key-files:
  created:
    - packages/types/src/index.ts (ActionState type with warning/values)
    - apps/web/src/lib/api/with-mobile-auth.ts
    - apps/web/src/components/landing/hero-section.tsx
    - apps/web/src/components/landing/features-section.tsx
    - apps/web/src/components/landing/how-it-works-section.tsx
    - apps/web/src/components/landing/integrations-section.tsx
    - apps/web/src/components/landing/testimonials-section.tsx
    - apps/web/src/components/landing/pricing-section.tsx
    - apps/web/src/components/landing/cta-section.tsx
    - apps/web/src/components/landing/footer-section.tsx
    - apps/web/src/app/not-found.tsx
    - apps/web/.eslintrc.json
    - apps/mobile/.eslintrc.json
    - .prettierrc
  modified:
    - apps/web/src/app/(owner)/actions/trucks.ts
    - apps/web/src/app/(owner)/actions/drivers.ts
    - apps/web/src/app/(owner)/actions/customers.ts
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/(owner)/actions/routes.ts
    - apps/web/src/app/(owner)/actions/payroll.ts
    - apps/web/src/app/(owner)/fuel/actions.ts
    - apps/web/src/app/(owner)/live-map/actions.ts
    - apps/web/src/app/(driver)/actions/driver-incidents.ts
    - apps/web/src/app/api/mobile/driver/dashboard/route.ts
    - apps/web/src/app/api/mobile/driver/messages/route.ts
    - apps/web/src/app/api/mobile/driver/hos/route.ts
    - apps/web/src/app/api/mobile/owner/dashboard/route.ts
    - apps/web/src/app/api/mobile/owner/drivers/route.ts
    - apps/web/src/components/trucks/truck-form.tsx
    - apps/web/src/components/drivers/driver-invite-form.tsx
    - apps/web/src/components/crm/customer-form.tsx
    - apps/web/src/components/loads/load-form.tsx
    - apps/web/src/components/routes/route-form.tsx
    - apps/web/src/components/invoices/invoice-form.tsx
    - apps/web/src/components/payroll/payroll-form.tsx
    - apps/web/src/components/maintenance/maintenance-event-form.tsx
    - apps/web/src/components/maintenance/scheduled-service-form.tsx
    - apps/web/src/components/loads/dispatch-modal.tsx
    - apps/web/src/components/loads/change-truck-modal.tsx
    - apps/web/src/components/landing/landing-page.tsx

key-decisions:
  - "ActionState gets warning and values fields to support driver invite (email warning) and truck form (field repopulation)"
  - "withMobileAuth wraps 5 demonstration routes instead of all 40 — validates pattern without boilerplate explosion"
  - "fieldErrors narrowing variable (typeof error !== string check) added per form component instead of global helper"
  - "vals typed cast in TruckForm preserves type safety without changing Record<string, unknown> in ActionState.values"

patterns-established:
  - "fieldErrors pattern: const fieldErrors = typeof state?.error === 'object' ? state.error : undefined"
  - "vals pattern: const vals = state?.values as { field1?: string; field2?: string } | undefined"
  - "withMobileAuth HOF: wraps handler with auth, role check, driverId guard, rate limiting, error boundary"

# Metrics
duration: 120min
completed: 2026-03-30
---

# Quick 135: Fix Code Quality Audit Findings Summary

**Eliminated all `any` types from server action prevState and catch blocks, extracted withMobileAuth HOF, added typed SQL interfaces, split 936-line landing page into 8 sections, and added ESLint/Prettier config — tsc passes clean.**

## Performance

- **Duration:** ~120 min
- **Completed:** 2026-03-30
- **Tasks:** 3 planned + 1 deviation fix
- **Files modified:** ~55 (21 deleted + 34 modified/created)

## Accomplishments
- Removed 21 dead code files (17 Zod validation schema files, 4 Expo boilerplate components) with zero broken imports
- Typed all `prevState: any` → `ActionState | null` across 17 action files and 11 form components; all `catch(error: any)` → `catch(error: unknown)` with `instanceof Prisma.PrismaClientKnownRequestError` narrowing
- Created `withMobileAuth` HOF and refactored 5 mobile API routes (driver/dashboard, driver/messages, driver/hos, owner/dashboard, owner/drivers) to eliminate repeated auth boilerplate
- Replaced 6 `as any[]` raw SQL casts with typed interfaces in fuel/live-map actions
- Split 936-line `landing-page.tsx` monolith into 8 focused section components; composition file is 26 lines
- Added ESLint configs for web and mobile (`@typescript-eslint/no-explicit-any: warn`), Prettier config at repo root, dark-theme custom 404 page

## Task Commits

Each task was committed atomically:

1. **Task 1: Dead code removal, ActionState type, catch/prevState fixes** - `70d2d66` (feat)
2. **Task 2: withMobileAuth wrapper, typed SQL, dashboard cleanup** - `fa586f7` (feat)
3. **Task 3: Landing page split, not-found, ESLint/Prettier, tsc clean** - `93861b1` (feat)
4. **Deviation fix: Form component prop types + ActionState warning/values** - `401ca1a` (fix)

## Files Created/Modified
- `packages/types/src/index.ts` — ActionState with warning and values fields
- `apps/web/src/lib/api/with-mobile-auth.ts` — HOF for mobile route auth
- `apps/web/src/app/(owner)/fuel/actions.ts` — FuelSummaryRow, FuelTrendRow, etc. typed interfaces
- `apps/web/src/app/(owner)/live-map/actions.ts` — GPSLocationRow typed interface
- `apps/web/src/components/landing/landing-page.tsx` — thin 26-line composition file
- `apps/web/src/components/landing/[hero|features|how-it-works|integrations|testimonials|pricing|cta|footer]-section.tsx` — 8 new section components
- `apps/web/src/app/not-found.tsx` — dark-theme custom 404
- `apps/web/.eslintrc.json`, `apps/mobile/.eslintrc.json`, `.prettierrc` — linting/formatting config
- 11 form components — ActionState imports, fieldErrors narrowing, vals typed cast

## Decisions Made
- ActionState gets `warning?: string` and `values?: Record<string, unknown>` — driver invite needs warning for email-send failures; truck form needs values for field repopulation on validation error
- withMobileAuth covers 5 routes as demonstration — validates the pattern; remaining routes can be migrated incrementally
- fieldErrors narrowing is per-component (not a shared utility) — keeps components self-contained without a new import

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Form component prop types used `any` — missed by original scan**
- **Found during:** Verification (post-task-3 tsc run)
- **Issue:** 11 form component files had `action: (prevState: any, formData: FormData) => Promise<any>` in prop interfaces; 10 also accessed `state?.error?.fieldName` without narrowing, causing tsc errors after ActionState was properly typed
- **Fix:** Added ActionState import and `fieldErrors`/`vals` narrowing variables in all 11 components; extended ActionState with `warning` and `values` fields that pre-existing code relied on
- **Files modified:** 11 form components + packages/types/src/index.ts
- **Verification:** tsc --noEmit passes with zero errors
- **Committed in:** 401ca1a

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Required fix was larger than expected scope but essential for tsc clean goal. All form components in the codebase are now properly typed.

## Issues Encountered
- Mobile route paths in plan (`driver/hours`, `owner/fleet`) don't exist — substituted `driver/hos` and `owner/drivers` which have the same auth pattern
- `packages/types` dist is gitignored; required `npm run build` after each source change for tsc to pick up type changes
- `catch(error: unknown)` propagation required 4 rounds of tsc iteration to fix all narrowing issues (Prisma instanceof checks, error.message boolean operators, `error.meta.target` array check)

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All server actions are properly typed; new actions should follow the ActionState pattern from packages/types
- withMobileAuth is ready for adoption in remaining mobile routes when needed
- tsc clean — safe to deploy

---
*Phase: quick-135*
*Completed: 2026-03-30*

## Self-Check: PASSED

- FOUND: apps/web/src/lib/api/with-mobile-auth.ts
- FOUND: apps/web/src/components/landing/hero-section.tsx
- FOUND: apps/web/.eslintrc.json
- FOUND: .prettierrc
- FOUND: .planning/quick/135-fix-code-quality-audit-findings-actionst/135-SUMMARY.md
- Commits: 70d2d66, fa586f7, 93861b1, 401ca1a all present
- tsc --noEmit: 0 errors
