---
phase: quick-493
plan: 493
subsystem: ui
tags: [nextjs, cache-revalidation, carrier-clients]

# Dependency graph
requires:
  - phase: quick-492
    provides: client_contacts table + getMainContact helper used to resolve the Main contact
provides:
  - Clients list EMAIL column resolves to the Main contact's email (legacy client.email fallback)
  - PATCH /api/v1/carrier/clients/[id] revalidates list + detail paths after update
  - POST /api/v1/carrier/clients revalidates list path after create
affects: [carrier-clients, client-contacts]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Route mutation handlers call revalidatePath on affected list/detail paths before returning"]

key-files:
  created: []
  modified:
    - apps/web/src/app/(owner)/carrier/clients/page.tsx
    - apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/clients/route.ts

key-decisions:
  - "Mirrored the existing mainContactName pattern for email resolution rather than introducing a new helper"

patterns-established:
  - "Server-rendered client list rows resolve email/name from getMainContact(c.contacts) with legacy field fallback"

# Metrics
duration: 5min
completed: 2026-07-22
---

# Quick 493: Fix Clients List EMAIL Column + Cache Staleness Summary

**Clients list EMAIL column now resolves the Main contact's email via `getMainContact(c.contacts)?.email ?? c.email`, and client PATCH/POST routes revalidate the list + detail paths so saves are reflected immediately.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-22T21:11:00Z
- **Completed:** 2026-07-22T21:16:36Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- EMAIL column on the Clients list now shows the Main contact's email (falling back to legacy `client.email` when no contact is marked main), mirroring the existing `mainContactName` resolution.
- PATCH `/api/v1/carrier/clients/[id]` now calls `revalidatePath('/carrier/clients')` and `revalidatePath('/carrier/clients/${id}')` after a successful update, eliminating stale cached list/detail views.
- POST `/api/v1/carrier/clients` now calls `revalidatePath('/carrier/clients')` after a successful create, alongside the existing `/onboarding/welcome` revalidation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Resolve EMAIL column to Main contact + add PATCH/POST revalidation** - `c4e7f0db` (fix)

**Plan metadata:** SUMMARY committed separately (see final commit)

## Files Created/Modified
- `apps/web/src/app/(owner)/carrier/clients/page.tsx` - `clientRows.email` now resolves via `getMainContact(c.contacts)?.email ?? c.email`; `mobileRows` inherits the fix automatically via its `...c` spread.
- `apps/web/src/app/api/v1/carrier/clients/[id]/route.ts` - Added `revalidatePath` import; PATCH handler revalidates `/carrier/clients` and `/carrier/clients/${id}` after successful update. GET/DELETE untouched.
- `apps/web/src/app/api/v1/carrier/clients/route.ts` - POST handler revalidates `/carrier/clients` immediately after `createClient` succeeds (existing `revalidatePath` import reused, no duplicate).

## Decisions Made
None beyond what the plan specified - followed plan as written, mirroring the existing `mainContactName` pattern for `email`.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. `npx next build` from `apps/web` completed successfully (`✓ Compiled successfully`, TypeScript finished with no new errors). One pre-existing, unrelated Turbopack NFT-trace warning appeared for `next.config.ts` / `docs/features/[slug]/page.tsx` — not caused by this change and present regardless of these edits.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Clients list EMAIL column and cache revalidation are fixed; no known follow-up work from this task.
- Only the 3 intended files were changed; `clients/_grid/columns.tsx`, `ClientDetailMobile.tsx`, `ClientForm.tsx`, `lib/carrier/clients.ts`, and `prisma/schema.prisma` were left untouched as specified.

---
*Phase: quick-493*
*Completed: 2026-07-22*

## Self-Check: PASSED

- FOUND: apps/web/src/app/(owner)/carrier/clients/page.tsx
- FOUND: apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
- FOUND: apps/web/src/app/api/v1/carrier/clients/route.ts
- FOUND: .planning/quick/493-fix-clients-list-email-column-main-conta/493-SUMMARY.md
- FOUND commit: c4e7f0db
