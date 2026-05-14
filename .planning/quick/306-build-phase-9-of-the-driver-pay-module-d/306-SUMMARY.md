---
phase: quick-306
plan: 306
subsystem: driver-pay
tags: [driver-portal, api, mobile, web, rbac, dispute, pay]
dependency_graph:
  requires:
    - quick-305 (driver pay phase 8 — DriverDispute model pre-existing)
  provides:
    - Driver-readable pay portal (web + mobile)
    - /api/driver-pay/me/* endpoints (7 routes)
    - Dispute submission flow (web + mobile)
  affects:
    - apps/web/src/app/(driver)/pay/**
    - apps/web/src/app/api/driver-pay/me/**
    - apps/mobile/app/(driver)/pay/**
    - apps/web/src/components/driver/driver-nav.tsx
    - apps/web/src/components/driver/driver-bottom-nav.tsx
    - apps/mobile/app/(driver)/_layout.tsx
tech_stack:
  added:
    - Progress component (native HTML, no new npm packages)
  patterns:
    - Dual-auth helper (getSession() + validateMobileToken() with bypass_rls for mobile)
    - requireDriverContext() shared across all 7 /me/ routes
    - decimal.js for all money/progress math
key_files:
  created:
    - apps/web/src/lib/driver-pay/require-driver.ts
    - apps/web/src/app/api/driver-pay/me/settlements/route.ts
    - apps/web/src/app/api/driver-pay/me/settlements/[id]/route.ts
    - apps/web/src/app/api/driver-pay/me/settlements/[id]/pdf/route.ts
    - apps/web/src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts
    - apps/web/src/app/api/driver-pay/me/bonuses/route.ts
    - apps/web/src/app/api/driver-pay/me/deductions/route.ts
    - apps/web/src/app/api/driver-pay/me/current-period/route.ts
    - apps/web/src/app/(driver)/pay/page.tsx
    - apps/web/src/app/(driver)/pay/_components/DriverPayPage.tsx
    - apps/web/src/app/(driver)/pay/_components/DisputeForm.tsx
    - apps/web/src/app/(driver)/pay/settlements/[id]/page.tsx
    - apps/web/src/app/(driver)/pay/settlements/[id]/_components/DriverSettlementDetailView.tsx
    - apps/web/src/components/ui/progress.tsx
    - apps/mobile/app/(driver)/pay/index.tsx
    - apps/mobile/app/(driver)/pay/settlements/[id].tsx
    - apps/mobile/app/(driver)/pay/settlements/[id]/dispute.tsx
    - apps/web/src/app/api/driver-pay/__tests__/driver-portal-api.test.ts
  modified:
    - apps/web/src/components/driver/driver-nav.tsx (Pay link + DollarSign)
    - apps/web/src/components/driver/driver-bottom-nav.tsx (Pay link + DollarSign)
    - apps/mobile/app/(driver)/_layout.tsx (Pay tab added)
decisions:
  - Used requireDriverContext() shared helper imported by all 7 /me/ routes instead of inline helpers per file
  - DriverDispute model already existed in schema — no migration needed (confirmed at schema.prisma:2828)
  - dual-auth: getSession() first (web cookie), validateMobileToken() fallback (mobile Bearer); isMobile flag drives withBypassRls() usage
  - CarrierDriver uses orgId not tenantId — selected only id and used session.tenantId for isolation
  - Progress component implemented as native HTML (no @radix-ui/react-progress dep needed)
  - Mobile FlashList used without estimatedItemSize (not exposed in this version's types)
  - Pre-existing settlements-paid.test.ts failures (2 tests) are unrelated to quick-306
metrics:
  duration_minutes: 20
  completed_date: "2026-05-14"
  tasks_completed: 4
  files_created: 18
  files_modified: 3
---

# Phase quick-306 Summary: Driver Pay Portal — Phase 9

**One-liner:** Driver read-only pay portal with 4-tab UI (settlements, current period, deductions, bonuses), dispute submission flow, and dual-auth (Supabase session + Bearer token) across 7 new /me/ API routes.

## What Was Built

### Task 1: Seven driver-scoped /me/ API routes
All 7 routes live under `/api/driver-pay/me/` and share a common `requireDriverContext()` helper that handles dual authentication. Each route enforces DRIVER role, filters by `driverId` (from CarrierDriver lookup), and applies `tenantId` as defense-in-depth.

- `GET /me/settlements` — paginated (page/limit) list, status != DRAFT
- `GET /me/settlements/[id]` — full breakdown with assignments, payComponents, bonuses, deductions snapshot
- `GET /me/settlements/[id]/pdf` — returns pdfUrl or 404
- `POST /me/settlements/[id]/dispute` — FINALIZED only, min 50 chars, creates DriverDispute + DriverPayAuditLog
- `GET /me/bonuses` — visibleToDriver=true only
- `GET /me/deductions` — with decimal.js installment progress (collected/total/remaining/pct)
- `GET /me/current-period` — PENDING_REVIEW/APPROVED assignments not yet in a settlement

### Task 2: Web driver pay portal
- `(driver)/pay/page.tsx` — server component, parallel data fetch, Decimal/Date serialization for client
- `DriverPayPage.tsx` — 4-tab portal with shadcn Tabs, empty states matching spec copy
- `DisputeForm.tsx` — shadcn Dialog + AlertDialog confirmation + live char count + toast feedback
- `DriverSettlementDetailView.tsx` — read-only mirror of owner SettlementDetailView with dispute trigger
- DollarSign Pay link added to both `driver-nav.tsx` (desktop) and `driver-bottom-nav.tsx` (mobile bottom)
- New `progress.tsx` UI component (native HTML, no new npm dependency)

### Task 3: Mobile driver pay screens
- `pay/index.tsx` — horizontal scrollable tab bar, 4 FlashList views with pull-to-refresh, theme tokens
- `pay/settlements/[id].tsx` — settlement detail with PDF via expo-web-browser, dispute button
- `pay/settlements/[id]/dispute.tsx` — category radio picker + multiline TextInput + Alert confirmation
- Pay tab (DollarSign) added to mobile driver tab bar in `_layout.tsx`
- All screens use `useThemeColors()` + NativeWind v4 classNames
- Auth via Bearer token from `useAuthContext().token`

### Task 4: Vitest suite
- 12 tests in `driver-portal-api.test.ts`
- Covers: settlements RBAC (403 non-driver), 401 no auth, driverId filter, 404 wrong driver, 404 missing PDF, dispute min-50-char validation, dispute PAID status rejection, valid FINALIZED dispute creates both DriverDispute + AuditLog, tenant isolation
- All 12 tests pass

## Key Implementation Notes

**DriverDispute model was pre-existing** — confirmed at `apps/web/prisma/schema.prisma:2828`. No migration was created. The model includes `DisputeTargetType`, `DisputeIssueCategory`, and `DisputeStatus` enums.

**Dual-auth approach:** `requireDriverContext(req)` in `apps/web/src/lib/driver-pay/require-driver.ts` tries `getSession()` first. If null, falls back to `validateMobileToken(req)`. Sets `isMobile=true` for the Bearer token path. Mobile DB queries use `withBypassRls()` helper that wraps in `$transaction` with `set_config('app.bypass_rls', 'on', TRUE)`.

**CarrierDriver.orgId vs tenantId:** CarrierDriver uses `orgId` as the tenant FK (not `tenantId`). Tenant isolation for driver pay models is enforced by using `session.tenantId` directly in WHERE clauses.

**No native float math:** All money calculations use `decimal.js`. Progress percentages computed with `Decimal.div().times(100).toDecimalPlaces(0)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] CarrierDriver uses orgId not tenantId**
- **Found during:** Task 1 tsc check
- **Issue:** Plan's `requireDriver()` helper selected `tenantId` from CarrierDriver but the model uses `orgId`
- **Fix:** Select only `id` from CarrierDriver; derive `tenantId` from `session.tenantId` instead
- **Files modified:** `apps/web/src/lib/driver-pay/require-driver.ts`
- **Commit:** dddc0bc

**2. [Rule 2 - Missing functionality] Progress UI component did not exist**
- **Found during:** Task 2 tsc check
- **Issue:** `@/components/ui/progress` doesn't exist and `@radix-ui/react-progress` not installed
- **Fix:** Created native HTML progress component with no new npm dependency
- **Files modified:** `apps/web/src/components/ui/progress.tsx`
- **Commit:** 624a6e9

**3. [Rule 3 - Blocking] FlashList estimatedItemSize not in type definitions**
- **Found during:** Task 3 tsc check
- **Issue:** This version's `@shopify/flash-list` types don't expose `estimatedItemSize` as a typed prop
- **Fix:** Removed `estimatedItemSize` props (consistent with how other screens use FlashList)
- **Files modified:** `apps/mobile/app/(driver)/pay/index.tsx`
- **Commit:** 990e995

## Self-Check: PASSED

All files verified to exist, all commits verified in git log.
