# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Logistics owners can manage their entire operation from one platform, with fleet intelligence dashboards providing real-time visibility into vehicle location, driver safety, and fuel efficiency.
**Current focus:** Phase 16 - Route Finance Foundation

## Current Position

Phase: 16 of 18 (Route Finance Foundation)
Plan: 5 of 5 in current phase
Status: Complete
Last activity: 2026-02-16 — Completed 16-05-PLAN.md (Cost-Per-Mile Analysis and Profit Alerts)

Progress: [███████████████████████████████████████████████████░░░] 83% (15/18 phases complete)

## Performance Metrics

**v1.0 metrics:**
- Phases: 1-10 (22 plans)
- Average duration: 4.3 min per plan
- Total execution time: 1.54 hours

**v2.0 metrics:**
- Phases: 11-15 (12 plans)
- Total execution time: 68m 59s
- Files modified: 103
- Lines added: 19,316

**v3.0 metrics:**
- Phase 16-01 (2026-02-16): Database foundation — 470s, 2 tasks, 4 files affected
- Phase 16-02 (2026-02-16): Expense line-item CRUD — 368s, 3 tasks, 5 files affected
- Phase 16-03 (2026-02-16): Payment & revenue tracking — 438s, 3 tasks, 7 files affected
- Phase 16-04 (2026-02-16): Expense category and template management — 351s, 2 tasks, 10 files affected
- Phase 16-05 (2026-02-16): Cost-per-mile analysis and profit alerts — 211s, 2 tasks, 6 files affected

**Combined:**
- Total: 15 phases complete, 16 in progress (34 plans + 1 new)
- Total project LOC: 71,160 TypeScript + financial schema

**Quick tasks:**
- Quick-1 (2026-02-16): Management pages bugs + seed data — 457s, 3 tasks, 7 files affected

## Accumulated Context

### Decisions

**v3.0 architectural decisions (from research):**
- Use Decimal.js for all financial calculations (matching Prisma.Decimal pattern from FuelRecord) — prevents floating-point errors
- Implement optimistic locking via version field on Route model — prevents concurrent edit race conditions
- Use soft delete pattern (deletedAt) for financial records — preserves audit trail for tax/compliance
- Defense-in-depth s3Key validation for driver documents — tenant prefix + entity ownership checks
- Multipart upload for files >5MB — handles large scanned driver compliance documents

**Quick-1 decisions:**
- Wrapped ALL DriverInvitation queries in webhook with RLS-bypassed transactions (3 locations)
- Used form key remounting pattern for driver invite form reset instead of controlled inputs
- Moved redirect() calls outside try/catch blocks to avoid catching NEXT_REDIRECT errors
- Created comprehensive seed script with production-realistic data (names, cities, license plates)

**Phase 16-01 decisions:**
- Used Decimal(10,2) for all money amounts matching existing FuelRecord pattern
- Applied RLS tenant_isolation_policy to all financial tables with tenantId
- ExpenseTemplateItem does not have RLS directly (inherits through ExpenseTemplate)
- Used raw SQL for financial seed data to avoid tsx Prisma client caching issues
- Implemented soft delete pattern (deletedAt) on RouteExpense and RoutePayment for audit trail
- Added Route.version field for optimistic locking to prevent concurrent edit race conditions

**Phase 16-02 decisions:**
- Used Prisma.Decimal (imported from @/generated/prisma) for all money calculations to avoid floating-point errors
- Enforced COMPLETED route protection at server action level (not just UI) for security
- Used soft delete pattern (deletedAt check) in all query and mutation actions
- Implemented inline edit/add forms in RouteExpensesSection instead of modal dialogs for better UX
- Used window.confirm() for delete confirmation (simple and effective for v1)
- Calculated total operating cost client-side using parseFloat for display purposes (server handles accurate Decimal calculations)
- Used Promise.all to fetch expenses and categories in parallel on route detail page for performance

**Phase 16-03 decisions:**
- Created centralized route-calculator.ts library for all financial math (single source of truth)
- Used local state (useState) in PaymentForm to track status and conditionally render paidAt field
- Applied green badge for PAID status, yellow/amber badge for PENDING status for visual distinction
- Calculated margin as (profit / totalRevenue) * 100 with zero-division protection
- Set default profitMarginThreshold to 10% (can be made configurable from Tenant model later)
- Auto-set paidAt to current date when status changes to PAID without explicit date in server action
- Used parseFloat ONLY for display formatting (Intl.NumberFormat), never for calculations

**Phase 16-04 decisions:**
- Reused listCategories instead of creating duplicate listExpenseCategories action
- Used JSON serialization in hidden field for dynamic template items (itemsJson)
- Protected system default categories from deletion at action level (not just UI)
- Hard delete for categories and templates (configuration, not financial records)
- Applied applyTemplate in transaction to ensure atomicity of multi-expense creation
- Used dropdown menu pattern for template selection on route detail page
- Showed system default vs custom badges with blue/gray color distinction

**Phase 16-05 decisions:**
- Fleet average calculated from COMPLETED routes in last 90 days (rolling window for relevance)
- Used Prisma query + TypeScript iteration for fleet analytics (simpler than raw SQL aggregation)
- Fleet average requires MANAGER or OWNER role (DRIVER role cannot see fleet-wide data)
- Cost per mile returns null when odometer data missing (graceful degradation)
- Profit margin alert only renders when isLowMargin is true (conditional rendering)
- Zero-division protection for both fleet average and cost-per-mile calculations

All milestone decisions logged in PROJECT.md Key Decisions table.

### Pending Todos

None.

### Blockers/Concerns

**v3.0 Financial Features Critical Requirements:**
- All money calculations MUST use Decimal.js (never JavaScript number type) to prevent rounding errors
- Financial records MUST use soft delete only (never hard delete) for audit trail preservation
- s3Key validation MUST enforce tenant isolation for driver document uploads

**Phase 16 Notes:**
- .env file created by copying .env.local (not committed - contains secrets)
- tsx caching issue with Prisma client worked around using raw SQL in seed script

None blocking immediate progress.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 1 | Audit and fix all Management pages with Playwright tests | 2026-02-16 | f543014 | [1-audit-and-fix-all-management-pages-with-](./quick/1-audit-and-fix-all-management-pages-with-/) |

## Session Continuity

Last session: 2026-02-16
Stopped at: Completed 16-05-PLAN.md (Cost-Per-Mile Analysis and Profit Alerts)
Resume file: None
Next action: Phase 16 complete — ready to proceed to Phase 17 or run end-to-end testing for Route Finance workflow
