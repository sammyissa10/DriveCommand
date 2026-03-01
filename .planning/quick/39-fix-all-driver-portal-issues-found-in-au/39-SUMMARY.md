---
phase: quick-39
plan: 1
subsystem: driver-portal
tags: [bug-fix, hooks, dark-mode, error-handling, error-boundary]
dependency_graph:
  requires: []
  provides: [driver-portal-stability, driver-portal-dark-mode, driver-portal-error-boundary]
  affects: [driver-layout, gps-tracker, driver-pages, driver-documents, document-list-readonly]
tech_stack:
  added: []
  patterns: [force-dynamic, hooks-compliant-early-return, try-catch-fallback, design-tokens, error-boundary]
key_files:
  created:
    - src/app/(driver)/error.tsx
  modified:
    - src/app/(driver)/layout.tsx
    - src/components/driver/gps-tracker.tsx
    - src/app/(driver)/page.tsx
    - src/app/(driver)/hours/page.tsx
    - src/app/(driver)/my-route/page.tsx
    - src/app/(driver)/actions/driver-documents.ts
    - src/components/driver/document-list-readonly.tsx
    - src/app/(driver)/actions/driver-messages.ts
    - src/app/(driver)/actions/driver-incidents.ts
decisions:
  - "force-dynamic on driver layout prevents static pre-render crashes at build time"
  - "Hooks early return moved after all useEffect hooks to comply with React Rules of Hooks"
  - "HOS fallback uses null + conditional render instead of typed fallback object to avoid type widening issues"
  - "Dark mode tokens: bg-card/border-border/text-foreground replace bg-white/border-gray-*/text-gray-*"
  - "driver error boundary Back to Home links to / (driver root) not /dashboard"
metrics:
  duration: ~180s
  completed: 2026-02-28
  tasks: 2
  files_affected: 10
---

# Quick-39: Fix All Driver Portal Issues Summary

**One-liner:** Hardened driver portal against build-time crashes, React hooks violations, server action failures, dark mode breakage, and missing error boundary — 10 files fixed across 5 HIGH and 4 MEDIUM issues.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Fix HIGH issues — force-dynamic, hooks, try/catch | 7480830 | layout.tsx, gps-tracker.tsx, page.tsx, hours/page.tsx, my-route/page.tsx |
| 2 | Fix MEDIUM issues + error boundary | 8ace0ae | driver-documents.ts, document-list-readonly.tsx, driver-messages.ts, driver-incidents.ts, error.tsx |

## What Was Fixed

### HIGH Issues (Task 1)

**1. Build-time static pre-render crash**
- Added `export const dynamic = 'force-dynamic'` to `src/app/(driver)/layout.tsx`
- Prevents Next.js from attempting to statically pre-render driver pages at build time (requires auth context at runtime)

**2. React Rules of Hooks violation in gps-tracker.tsx**
- Removed the `if (!truckId) return null` early return on line 29 (which was before two `useEffect` calls)
- Removed two `// eslint-disable-next-line react-hooks/rules-of-hooks` suppression comments
- Moved the `if (!truckId) return null` guard to line 145, after all hooks but before the return JSX
- All hooks now run unconditionally; early return happens after hooks — fully compliant

**3. Driver home page (page.tsx) — unguarded server action**
- Wrapped `getMyAssignedRoute()` in try/catch
- On failure: route falls back to null → renders "No Route Assigned" empty state gracefully

**4. Driver hours page (hours/page.tsx) — unguarded server action**
- Wrapped `getDriverHOS()` in try/catch with `null` fallback
- On failure: renders an inline error message rather than crashing the page
- Used `Awaited<ReturnType<typeof getDriverHOS>> | null` type to avoid type narrowing issues

**5. Driver my-route page (my-route/page.tsx) — two unguarded server actions**
- Wrapped `getMyAssignedRoute()` in try/catch (falls back to null → empty state)
- Wrapped `Promise.all([getMyRouteDocuments(), getMyTruckDocuments()])` in try/catch (falls back to `[[], []]`)

### MEDIUM Issues (Task 2)

**6. Null truckId crash in driver-documents.ts**
- Added `if (!route.truckId) return []` guard before calling `repo.findByTruckId(route.truckId)`
- `route.truckId` can be null when no truck is assigned yet — prevents TypeScript and runtime errors

**7. Dark mode breakage in document-list-readonly.tsx**
- Replaced all hardcoded light-mode Tailwind classes with design tokens:
  - `bg-white` → `bg-card`
  - `border-gray-200` → `border-border`
  - `divide-gray-200` → `divide-border`
  - `text-gray-900` → `text-foreground`
  - `text-gray-500` → `text-muted-foreground`
  - `text-gray-400` → `text-muted-foreground/40`
  - `bg-gray-100 text-gray-800` → `bg-muted text-muted-foreground`
  - `bg-red-100 text-red-800` → `bg-red-500/10 text-red-500`
  - `bg-blue-100 text-blue-800` → `bg-blue-500/10 text-blue-500`

**8. Dead imports in driver-messages.ts**
- Removed unused: `requireAuth`, `getTenantPrisma`, `requireTenantId`, `getSession`
- Kept only: `requireRole`, `UserRole`

**9. Dead imports in driver-incidents.ts**
- Removed unused: `getSession`, `getTenantPrisma`, `requireTenantId`, `revalidatePath`
- Kept only: `requireRole`, `UserRole`

**10. Missing error boundary**
- Created `src/app/(driver)/error.tsx` following same pattern as `src/app/(owner)/error.tsx`
- Features: `'use client'`, `useEffect` to console.error, error message display, error digest display, "Try again" reset button, "Back to Home" link to `/`
- Uses design tokens throughout (text-foreground, text-muted-foreground, bg-primary, bg-muted)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] HOSDashboard fallback type mismatch**
- **Found during:** Task 1
- **Issue:** Plan specified fallback to `[]` (empty array) for `getDriverHOS()`, but `HOSDashboard` requires `HOSData` object — wrong type would cause TypeScript error
- **Fix:** Used `null` fallback with conditional render (error message state) instead of typed object fallback, avoiding type widening issues entirely
- **Files modified:** `src/app/(driver)/hours/page.tsx`
- **Commit:** 7480830

## Self-Check

**Files created:**
- `src/app/(driver)/error.tsx` — FOUND

**Commits:**
- `7480830` (Task 1 HIGH issues) — FOUND
- `8ace0ae` (Task 2 MEDIUM issues) — FOUND

**Success criteria:**
- `export const dynamic = 'force-dynamic'` in driver layout — VERIFIED
- No hooks called after conditional return in gps-tracker.tsx — VERIFIED (early return at line 145, after useEffect calls)
- All three driver pages have try/catch with fallbacks — VERIFIED
- `getMyTruckDocuments` guards against null truckId — VERIFIED
- document-list-readonly.tsx has no bg-white/text-gray-* classes — VERIFIED (grep returned empty)
- driver-messages.ts and driver-incidents.ts have no unused imports — VERIFIED
- `src/app/(driver)/error.tsx` exists with retry button — VERIFIED
- `npx tsc --noEmit` passes clean — VERIFIED

## Self-Check: PASSED
