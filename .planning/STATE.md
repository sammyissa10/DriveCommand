# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-16)

**Core value:** Logistics owners can manage their entire operation from one platform, with fleet intelligence dashboards providing real-time visibility into vehicle location, driver safety, and fuel efficiency.
**Current focus:** Phase 17 complete — ready for Phase 18

## Current Position

Phase: 18 of 18 (Driver Document Uploads)
Plan: 1/3 complete
Status: In Progress
Last activity: 2026-02-17 — Completed 18-01-PLAN.md: Driver Document Storage Foundation

Progress: [█████████████████████████████████████████████████████░░] 94% (17/18 phases complete)

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
- Phase 17-01 (2026-02-17): Client components for unified route view/edit — 188s, 2 tasks, 4 files affected
- Phase 17-02 (2026-02-17): Server integration with optimistic locking — 220s, 2 tasks, 3 files affected
- Phase 18-01 (2026-02-17): Driver document storage foundation — 373s, 2 tasks, 10 files affected

**Combined:**
- Total: 17 phases complete, 42 plans
- Total project LOC: 71,160+ TypeScript

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

**Phase 18-01 decisions:**
- Use DocumentType enum only for driver documents (DRIVER_LICENSE, DRIVER_APPLICATION, GENERAL) - existing truck documents use JSONB metadata to avoid migration complexity
- Increase MAX_FILE_SIZE from 10MB to 100MB to support large scanned compliance PDFs
- Implement multipart upload using presigned URLs per part (client uploads directly to R2) rather than server-side streaming
- Enforce defense-in-depth s3Key validation in 4 locations (tenant prefix + drivers category check)
- Abort multipart upload on validation failure to prevent orphaned parts in R2
- Make all new Document fields optional for backwards compatibility with existing truck/route documents

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

**Phase 17-01 decisions:**
- Used event delegation (onInput/onChange on wrapper div) for dirty tracking instead of controlled inputs to avoid re-render loops with RouteForm's defaultValue pattern
- Used window.history.replaceState instead of Next.js router.replace to avoid server roundtrips for URL state sync
- Added extraHiddenFields prop to RouteForm as backwards-compatible way to inject version field for optimistic locking
- Kept updateRoute's existing redirect behavior (redirects to /routes/[id] without mode param) which naturally returns to view mode after save
- Used window.confirm for unsaved changes dialog (simple, effective, matches existing pattern in expenses/payments sections)

**Phase 17-02 decisions:**
- Used searchParams to determine initial edit mode (server-side decision before rendering client component)
- Fetch drivers/trucks conditionally only when in edit mode for performance optimization (avoid unnecessary DB queries in view mode)
- Version field is optional in updateRoute for backwards compatibility with existing route forms that don't use optimistic locking
- Prisma P2025 error code indicates version mismatch (optimistic locking conflict) — return user-friendly error message
- Keep old /routes/[id]/edit page as redirect rather than removing (preserves bookmarks and existing links)

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
| 2 | Change login method - remove Google, create owner login | 2026-02-17 | a6d016f | [2-change-login-method-remove-google-create](./quick/2-change-login-method-remove-google-create/) |

## Session Continuity

Last session: 2026-02-17
Stopped at: Completed 18-01-PLAN.md: Driver Document Storage Foundation
Resume file: None
Next action: `/gsd:execute-phase 18` to continue with 18-02-PLAN.md (Upload UI Components)
