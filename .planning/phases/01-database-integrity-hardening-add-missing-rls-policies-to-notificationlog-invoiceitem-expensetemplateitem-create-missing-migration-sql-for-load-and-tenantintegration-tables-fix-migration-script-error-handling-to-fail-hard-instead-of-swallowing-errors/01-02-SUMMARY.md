---
phase: 01-database-integrity-hardening
plan: 02
subsystem: infra
tags: [postgres, migration, nodejs, typescript]

# Dependency graph
requires:
  - phase: 01-01
    provides: RLS policies on 5 tables, tenantId on InvoiceItem/ExpenseTemplateItem, CREATE TABLE IF NOT EXISTS for Load/TenantIntegration

provides:
  - migrate.mjs that exits with code 1 on any migration failure (fail-fast deployment guard)
  - Confirmed zero TypeScript errors from Phase 01-01 schema changes

affects: [deployment, vercel-build, database-integrity]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fail-fast migration pattern: process.exit(1) in outer catch so broken deployments are caught before serving traffic"
    - "Node.js finally-before-exit: finally block runs before process.exit(1), ensuring pg client is properly closed"

key-files:
  created: []
  modified:
    - scripts/migrate.mjs

key-decisions:
  - "process.exit(1) in outer catch replaces 'Starting app anyway...' — any migration failure now terminates the process with non-zero exit code so CI/CD and Vercel buildCommand chain fails fast"
  - "Node.js executes finally before process.exit(1) so client.end() still runs — no pg connection leak on failure"
  - "TypeScript confirmed clean — Plan 01-01's tenantId additions to InvoiceItem and ExpenseTemplateItem require no call-site changes because those fields are added via Prisma backfill pattern with correct defaults"

patterns-established:
  - "Fail-fast infrastructure: migration errors must terminate with non-zero exit code, never be swallowed"

# Metrics
duration: 2min
completed: 2026-02-26
---

# Phase 01 Plan 02: migrate.mjs Fail-Hard Error Handling Summary

**migrate.mjs now exits with code 1 on any migration failure, ending silent schema-broken deployments — confirmed zero TypeScript errors from Plan 01-01 schema changes**

## Performance

- **Duration:** ~2 min (85 seconds)
- **Started:** 2026-02-26T21:55:59Z
- **Completed:** 2026-02-26T21:57:24Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Fixed one-line bug in scripts/migrate.mjs: outer catch block no longer swallows migration errors and continues starting the app
- Deployment pipeline now fails fast and visibly at infrastructure level — broken schema detected before serving traffic
- TypeScript compilation produces zero errors after Plan 01-01's schema changes (tenantId on InvoiceItem/ExpenseTemplateItem)

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix migrate.mjs to exit with code 1 on migration failure** - `d9013c0` (fix)
2. **Task 2: TypeScript type check to confirm no new errors** - no commit (verification-only, zero errors, no file changes)

**Plan metadata:** TBD (docs commit)

## Files Created/Modified

- `scripts/migrate.mjs` - Outer catch block now calls `process.exit(1)` instead of logging "Starting app anyway..."

## Decisions Made

- `process.exit(1)` in outer catch replaces `console.log('Starting app anyway...')` — any migration failure now terminates the process with non-zero exit code so CI/CD and Vercel buildCommand chain (migrate.mjs && prisma generate && next build) fails fast
- Node.js executes `finally` before `process.exit(1)` so `client.end()` still runs — no pg connection leak on failure path
- TypeScript confirmed clean with zero errors — Plan 01-01's tenantId additions to InvoiceItem and ExpenseTemplateItem required no call-site changes (backfill pattern with correct defaults handled it)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The `grep -c "catch"` verification check in the plan expects 2 but returns 3 — this is because `grep` counts literal occurrences of the string "catch" which includes the `.catch()` method call on line 72 (`await client.query('ROLLBACK').catch(() => {})`). There are exactly 2 try/catch *blocks* as intended: the inner per-migration catch (lines 59-75) and the outer catch (lines 79-81). This is a false positive in the verification check, not a code issue.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 01 (Database Integrity Hardening) is fully complete:
  - Plan 01-01: RLS policies on 5 tables (NotificationLog, InvoiceItem, ExpenseTemplateItem, Load, TenantIntegration), tenantId columns on InvoiceItem and ExpenseTemplateItem, CREATE TABLE IF NOT EXISTS migration SQL for Load and TenantIntegration
  - Plan 01-02: migrate.mjs exits with code 1 on failure (fail-fast deployment guard)
- No blockers for next milestone planning

---
*Phase: 01-database-integrity-hardening*
*Completed: 2026-02-26*
