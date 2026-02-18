# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-17)

**Core value:** Logistics owners can manage their entire operation — trucks, drivers, routes, finances, and compliance documents — from one platform, with fleet intelligence dashboards providing real-time visibility into vehicle location, driver safety, and fuel efficiency.
**Current focus:** v3.0 milestone complete — planning next milestone

## Current Position

Milestone: v3.0 Route Finance & Driver Documents — SHIPPED
Phase: 18 of 18 (all complete)
Status: Between milestones
Last activity: 2026-02-18 — Completed quick task 14: Build Third-Party Integrations Framework

Progress: [████████████████████████████████████████████████████████] 100% (3 milestones shipped)

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
- Phase 18-02 (2026-02-17): Upload UI components — 396s, 2 tasks, 6 files affected
- Phase 18-03 (2026-02-17): Driver document expiry notifications — 342s, 2 tasks, 4 files affected

**Combined:**
- Total: 18 phases complete, 43 plans
- Total project LOC: 71,500+ TypeScript

**Quick tasks:**
- Quick-1 (2026-02-16): Management pages bugs + seed data — 457s, 3 tasks, 7 files affected
- Quick-6 (2026-02-18): Fix truck save/view errors and route driver dropdown — 133s, 2 tasks, 4 files affected
- Quick-7 (2026-02-18): Build Invoice/Billing UI and Payroll UI — ~900s, 3 tasks, 20 files affected
- Quick-8 (2026-02-18): Build Dispatch and Load Management — ~25min, 3 tasks, 14 files affected
- Quick-9 (2026-02-18): Build Automated Customer Communications — 334s, 2 tasks, 8 files affected
- Quick-10 (2026-02-18): Build Profit Per Lane Analysis — ~10min, 3 tasks, 6 files affected
- Quick-11 (2026-02-18): Build Compliance Dashboard — ~6min, 2 tasks, 7 files affected
- Quick-12 (2026-02-18): Build AI Document Reading — ~8min, 2 tasks, 6 files affected
- Quick-13 (2026-02-18): Build AI Profit Predictor — ~6min, 2 tasks, 4 files affected
- Quick-14 (2026-02-18): Build Third-Party Integrations Framework — ~8min, 2 tasks, 8 files affected

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

**Phase 18-02 decisions:**
- Used date-fns for expiry date calculations (differenceInDays) - clean date math API
- XMLHttpRequest instead of fetch for part uploads - required for progress event tracking
- 5MB threshold for small vs multipart uploads - balances simplicity with large file support
- Inline edit form for document metadata - faster than modal dialog UX
- 30-day threshold for "expiring soon" status - standard compliance warning window

**Phase 18-03 decisions:**
- Milestone filter (90/60/30/0 days) prevents daily notifications - only sends at key intervals
- Used driver-document-expiry notification type (distinct from truck document-expiry) for independent idempotency tracking
- Dashboard link points to /drivers/{driverId} where documents are now visible (per Plan 02)
- formatDocumentType helper converts enum values to human-readable strings for email subject/body

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

**Quick-6 decisions:**
- Keep revalidatePath/redirect outside try/catch blocks — Next.js redirect throws NEXT_REDIRECT internally and must not be caught
- Handle Prisma P2002 unique constraint violation with field-level error for VIN duplicates (vin: ['A truck with this VIN already exists'])
- Use .catch on listDocuments within Promise.all to isolate S3 failures without breaking other data fetches
- Wrap edit-mode driver/truck queries in try/catch so route edit renders with empty dropdowns if DB query fails

**Quick-7 decisions:**
- Used prisma db push + migrate resolve --applied due to drift detection from modified migration file (safer than reset on production DB)
- JSON hidden field (itemsJson) for invoice line items serialization — matches expense-templates pattern from Phase 16-04
- InvoiceItem has no direct RLS — inherits through Invoice cascade delete (same pattern as ExpenseTemplateItem)
- Status-gated deletion: only DRAFT invoices/payroll records deletable — enforced in both server action and UI (conditional render)
- Auto-generate invoice number from latest invoice + increment (INV-NNNN padded format)
- Include inactive driver in payroll edit dropdown if record was created for them (backwards compatibility)

**Quick-8 decisions:**
- Auto-generate loadNumber from latest load + increment (LD-0001 format) inside createLoad action
- Status transitions validated via explicit map: DISPATCHED->PICKED_UP->IN_TRANSIT->DELIVERED->INVOICED; CANCELLED available from any non-terminal status
- Hard delete for loads (not financial records) — unlike invoices/expenses which use soft delete
- Dispatch modal uses useActionState with bound server action (dispatchLoad.bind(null, id))
- In Transit tab covers both PICKED_UP and IN_TRANSIT statuses for simpler dispatcher UX
- Decimal.js (Prisma.Decimal) used for rate field to prevent floating-point errors

**Quick-9 decisions:**
- Fire-and-forget pattern for email sends: do NOT await sendNotificationAndLogInteraction so load status changes are never delayed by email latency
- Email failures caught inside helper with console.error — never propagate to block load operations
- Only send notifications for PICKED_UP, IN_TRANSIT, DELIVERED from updateLoadStatus; DISPATCHED handled separately in dispatchLoad
- INVOICED and CANCELLED skipped — not customer-facing milestones
- z.preprocess to convert FormData checkbox string 'true' to boolean in Zod schema
- Prisma client regenerated with prisma generate after schema change to fix TypeScript types

**Quick-10 decisions:**
- Normalize lane keys with trim+toUpperCase so "Chicago, IL" and "CHICAGO, IL" aggregate to the same lane
- Sort lanes by profit using Decimal.comparedTo (not parseFloat) to preserve precision in sort
- Display only top 10 lanes in bar chart to avoid overcrowding; full detail available in table
- Use -Infinity sentinel for null profitPerMile values during client-side table sort
- Raw Recharts BarChart/Bar/Cell used directly (not ChartContainer) to support per-bar coloring and multi-field tooltips

**Quick-11 decisions:**
- Classify compliance items as OK/EXPIRING_SOON/EXPIRED using 30-day threshold (consistent with Phase 18-02)
- Query driver documents, truck documentMetadata JSONB, and safety events in parallel with Promise.all
- HIGH/CRITICAL safety events aggregated per driver over last 90 days for compliance scoring
- Alerts panel sorted by priority: EXPIRED first, then soonest expiry date
- Sidebar link under Intelligence section with ClipboardCheck icon (OWNER/MANAGER only)

**Quick-12 decisions:**
- Use anthropic.beta.messages.create with betas=['pdfs-2024-09-25'] for PDFs (separate code path from images) to avoid TypeScript union type error on response.content
- claude-haiku-4-5-20251001 model — fast and cost-efficient for structured extraction tasks
- Magic-byte file validation before Claude call — prevents spoofed MIME type attacks and invalid API calls
- Return ExtractedFreightData as typed interface — enables future load form pre-fill without raw JSON

**Quick-13 decisions:**
- Use 365-day window for getLaneAnalytics (vs 90-day default) to maximize lane coverage for prediction accuracy
- accept>=15%, caution 0-14.9%, reject<0% — thresholds match freight dispatcher decision-making standards
- dataSource=none returns caution (not reject) — no historical data is uncertain, not inherently bad
- State variables used in lane data source label (not echoed from server) to keep PredictionResult interface minimal
- Calculator icon chosen for Profit Predictor sidebar link to distinguish from TrendingUp (Lane Profitability)

**Quick-14 decisions:**
- Use db push (not migrate dev) to handle drift — consistent with quick-7 pattern for this project
- Fire-and-forget toggle (no loading state) with optimistic UI revert on error for v1 simplicity
- comingSoon cards show toast on entire card click; Switch uses stopPropagation to avoid conflict
- Sonner Toaster added to root layout so toasts are available across all pages globally
- Settings section in sidebar gated to OWNER only (not MANAGER) per plan spec — settings are owner-only

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
| 3 | Investigate and fix all broken pages in the app | 2026-02-18 | 3f30f62 | [3-investigate-and-fix-all-broken-pages-in-](./quick/3-investigate-and-fix-all-broken-pages-in-/) |
| 5 | Remove Clerk and replace with custom email/password auth | 2026-02-18 | 886f262 | [5-remove-clerk-and-replace-with-custom-ema](./quick/5-remove-clerk-and-replace-with-custom-ema/) |
| 6 | Fix truck save/view errors and improve route driver dropdown | 2026-02-18 | ae7797b | [6-fix-truck-save-view-errors-improve-truck](./quick/6-fix-truck-save-view-errors-improve-truck/) |
| 7 | Build Invoice/Billing UI and Payroll UI with migration and sidebar navigation | 2026-02-18 | 9e9a67f | [7-build-invoice-billing-ui-and-payroll-ui-](./quick/7-build-invoice-billing-ui-and-payroll-ui-/) |
| 7 | Build Invoice/Billing UI and Payroll UI | 2026-02-18 | 5bbef95 | [7-build-invoice-billing-ui-and-payroll-ui-](./quick/7-build-invoice-billing-ui-and-payroll-ui-/) |
| 8 | Build Dispatch and Load Management with dispatch modal, status lifecycle, and sidebar | 2026-02-18 | d3e26fd | [8-build-dispatch-and-load-management-with-](./quick/8-build-dispatch-and-load-management-with-/) |
| 9 | Build Automated Customer Communications with load status emails and CRM interaction logging | 2026-02-18 | 41c0ba7 | [9-build-automated-customer-communications-](./quick/9-build-automated-customer-communications-/) |
| 10 | Build Profit Per Lane Analysis with sortable table, bar chart, and summary cards | 2026-02-18 | 4cc3422 | [10-build-profit-per-lane-analysis](./quick/10-build-profit-per-lane-analysis/) |
| 11 | Build compliance dashboard with driver/truck expiry tracking, safety events, and alerts | 2026-02-18 | 4fbb6b9 | [11-build-compliance-dashboard](./quick/11-build-compliance-dashboard/) |
| 12 | Build AI document reading with Claude-powered freight data extraction | 2026-02-18 | 30d354d | [12-build-ai-document-reading](./quick/12-build-ai-document-reading/) |
| 13 | Build AI profit predictor with lane-based and fleet-average cost estimation | 2026-02-18 | eee9707 | [13-build-ai-profit-predictor](./quick/13-build-ai-profit-predictor/) |
| 14 | Build third-party integrations framework with settings UI and TenantIntegration model | 2026-02-18 | 7462229 | [14-build-third-party-integrations-framework](./quick/14-build-third-party-integrations-framework/) |

## Session Continuity

Last session: 2026-02-18
Stopped at: Completed quick task 14: Build Third-Party Integrations Framework
Resume file: None
Next action: Integrations page live at /settings/integrations. 7 integration cards across 4 categories (ELD, Accounting, Factoring, Email). SendGrid and Mailgun have functional Switch toggles backed by TenantIntegration upsert. Coming Soon integrations (QuickBooks, Samsara, KeepTruckin, Triumph, OTR) show badge and sonner toast on click. Settings section in sidebar for OWNER role only.
