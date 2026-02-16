# Project Research Summary

**Project:** DriveCommand - Milestone 3 (Route Finance Tracking, Unified View/Edit Pages, Driver Documents)
**Domain:** Multi-tenant Fleet Management SaaS - Financial Module Extension
**Researched:** 2026-02-16
**Confidence:** HIGH

## Executive Summary

This milestone extends an existing Next.js 16 multi-tenant fleet management system with three integrated features: route-level financial tracking (line-item expenses, payments, profit calculation), unified view/edit page architecture for improved UX, and driver document uploads for DOT compliance. The research reveals a strong foundation already in place - the app correctly uses Prisma Decimal for fuel cost tracking, PostgreSQL RLS for tenant isolation, Cloudflare R2 for document storage, and shadcn/ui for consistent UI patterns. The recommended approach is to **reuse existing patterns aggressively** rather than introduce new architectural paradigms mid-development.

The critical insight is that financial features require higher data integrity standards than operational features. While the existing codebase handles truck/route CRUD well, adding money tracking demands absolute precision (Decimal.js for calculations, never floating-point), bulletproof concurrency control (optimistic locking with version fields), and immutable audit trails (append-only logs). The unified view/edit pattern presents a UX risk - users expect instant mode toggling but need protection against lost changes and stale data. Driver document uploads leverage existing infrastructure (presigned URLs, tenant-scoped storage) but require multipart upload support for large scanned files (50-100MB PDFs are common for insurance documents).

The primary risk is **technical debt from financial shortcuts**. Using JavaScript `number` instead of `Decimal`, trusting calculated totals instead of database aggregations, or hard-deleting financial records creates data corruption that's expensive to fix later. The second risk is **multi-tenant data leakage** through file storage paths - inadequate validation of s3Keys could expose one tenant's driver licenses to another. Both risks are preventable with defense-in-depth validation and strict adherence to established patterns from earlier phases.

## Key Findings

### Recommended Stack

The existing stack (Next.js 16, React 19, Prisma 7, PostgreSQL 17, Clerk, Tailwind 4, shadcn/ui, Cloudflare R2) is **ideal for this milestone** and requires only three new dependencies: **react-hook-form 7.54** for dynamic expense line-item arrays, **decimal.js 10.6** for client-side financial calculations (matching Prisma's server-side Decimal type), and **react-dropzone 14.3** for enhanced file upload UX. All three libraries are mature, TypeScript-native, and integrate seamlessly with existing patterns.

**Core technologies for this milestone:**
- **Prisma Decimal (@db.Decimal(10,2))**: Reuse existing pattern from FuelRecord model for all monetary fields (RouteExpense.amount, RoutePayment.amount). Stores currency with cent precision, prevents floating-point errors that corrupt financial reports.
- **decimal.js**: Client-side arithmetic library for profit calculations. Converts Prisma.Decimal to decimal.js Decimal for safe subtraction/addition, then back for storage. Essential for financial accuracy - JavaScript's `number` type causes rounding errors that accumulate (100.45 + 25.30 ≠ 125.75).
- **react-hook-form + useFieldArray**: Industry standard for dynamic form arrays. Expense tracking requires variable-length line items (add/remove rows), which standard form state can't handle efficiently. Minimizes re-renders through subscription model.
- **react-dropzone**: Drag-and-drop enhancement for existing document upload flow. Driver licenses/certifications are often high-resolution scans (15-50MB), requiring robust UX with progress indicators and retry logic.
- **Intl.NumberFormat (native)**: Currency formatting for display ($1,234.56). Zero bundle impact, no extra library needed.

**Existing stack elements to reuse (no new installation):**
- PostgreSQL 17 with RLS policies for tenant isolation (extend to RouteExpense, RoutePayment tables)
- Cloudflare R2 presigned URL flow (add 'drivers' category alongside 'trucks', 'routes')
- shadcn/ui components (Form, Input, Button, Toggle for edit mode, existing patterns)
- Zod schemas for validation (extend with z.array() for line items)
- TanStack Query for optimistic updates and cache management

**Critical version requirements:**
- react-hook-form ^7.54.2 (latest stable, React 19 compatible)
- decimal.js ^10.6.0 (TypeScript definitions built-in)
- react-dropzone ^14.3.5 (proven Next.js compatibility, use 14.x not bleeding-edge 15.x)

### Expected Features

**Must have (table stakes):**
- **Route Expense Line Items**: CRUD for expense entries with amount, category (enum), date, notes. Users expect itemized tracking (fuel, tolls, driver pay) to calculate profitability per route. Without this, fleet managers can't identify unprofitable routes.
- **Route Profit Calculation**: Total revenue - total expenses displayed on route detail page. This is the primary use case - managers need to know if route made/lost money. Must be real-time (derived field, not denormalized) to avoid stale data.
- **Driver License Upload**: File upload for CDL, medical certificates, MVR (motor vehicle record). DOT compliance requirement per 49 CFR 391 - Driver Qualification Files must include photocopies. Fleet faces violations if documents missing during audit.
- **Document Expiry Tracking**: Date field on documents with visual warnings when expired or <30 days to expiry. Critical for compliance - expired licenses cause DOT violations (12% of FMCSA violations are incomplete DQF).
- **Edit Mode Toggle**: Single route page with view/edit modes instead of separate pages. Modern SaaS UX pattern reduces context switching (user clicks "Edit", modifies inline, saves without navigation). Expected by users familiar with tools like Notion, Airtable.
- **Payment Status Tracking**: Enum field (pending/paid/cancelled) on expenses. Operations teams need to know which expenses are settled vs outstanding for cash flow management and vendor relationships.

**Should have (competitive advantages):**
- **Custom Expense Categories**: User-defined categories beyond presets (FUEL, TOLLS, MAINTENANCE). Different fleets have unique costs (reefer fuel, cross-border fees, hazmat surcharges) that rigid categories can't capture. Provides flexibility competitors lack.
- **Document Auto-Expiry Reminders**: Automated notifications 30/60/90 days before license/cert expiry. Reduces compliance risk compared to manual calendar tracking. Reuses existing notification system (Phase 9).
- **Profit Margin Alerts**: Notifications when route profit falls below threshold (e.g., <10% margin). Proactive management - prevents unprofitable routes from slipping through. Integrates with Phase 9 notifications.
- **Bulk Document Upload**: Multi-file upload for driver onboarding (license + medical cert + MVR at once). Efficiency gain for fleets onboarding 5+ drivers simultaneously.

**Defer (v2+ / post-PMF):**
- **OCR License Extraction**: Auto-populate license number, expiry from scanned image. High development cost (Tesseract.js or AWS Textract), unproven ROI. Add after validated demand (time savings > implementation cost).
- **Expense Approval Workflow**: Manager approval for expenses over threshold. Enterprise feature, adds complexity (roles, approval queue, notifications). Wait for enterprise customer requests.
- **Predictive Expense Forecasting**: ML-based cost predictions. Requires 6+ months historical data, unvalidated user demand. Focus on actuals first, add forecasting after product-market fit.
- **Multi-Currency Support**: Cross-border operations with exchange rates. Most fleets operate domestically with single currency. Adds schema/regulatory complexity for <5% of users. Only add if confirmed international customers exist.

**Anti-features (explicitly avoid):**
- **Real-time expense entry during route**: Drivers should NOT log expenses while driving (safety risk, poor data quality). Alternative: post-route entry or bulk import from fuel cards.
- **Nested expense subcategories**: Over-categorization creates decision fatigue and reporting complexity. Alternative: flat category list with optional notes field.
- **Denormalized profit field on Route**: Storing calculated totals creates race conditions and stale data. Alternative: calculate on-demand from RouteExpense/RoutePayment aggregation.
- **Separate DriverDocument table**: Duplicates entire upload infrastructure unnecessarily. Alternative: add `driverId` field to existing Document model.

### Architecture Approach

The architecture follows **repository-pattern server actions with RLS enforcement**, already proven in Phases 3-10. New financial models (RouteExpense, RoutePayment) extend existing patterns with three critical additions: (1) **financial precision** - all money fields use `@db.Decimal(10,2)`, Decimal.js for calculations, never `number` type; (2) **immutable audit trail** - append-only FinancialAuditLog with no foreign keys (can't cascade delete), logs every create/update with before/after snapshots; (3) **soft delete only** - `deletedAt` timestamp instead of hard delete, `onDelete: Restrict` on foreign keys to prevent accidental cascade.

**Major components:**
1. **RouteExpenseRepository / RoutePaymentRepository**: Extend `TenantRepository` base class with tenant-scoped Prisma client. Methods: create, findByRouteId, getTotalByRouteId (returns Decimal from SUM aggregation). RLS policies enforce tenant_id match at database level.
2. **route-finance-actions.ts**: Server actions for expense/payment CRUD, getRouteFinancials aggregation helper. Uses `requireRole([OWNER, MANAGER])` guard - drivers cannot view/edit financial data. Returns Prisma.Decimal types to client, converted to decimal.js for display calculations.
3. **RouteFinanceSection component**: Client component displays expenses table, payments table, profit summary. Conditionally shows add/edit forms when page.searchParams.mode='edit'. Uses react-hook-form's useFieldArray for dynamic line-item rows.
4. **Unified Route Page (/routes/[id]?mode=edit)**: Server component reads searchParams to conditionally render RouteViewSection vs RouteEditSection. State persists in URL (bookmarkable, shareable). Refetches data on mode transition to prevent stale state.
5. **Document Upload Extension**: Existing presigned URL flow extended with 'drivers' category (alongside 'trucks', 'routes'). DocumentRepository gains findByDriverId method. Document model adds optional `driverId` field with application-level validation ensuring exactly one of truckId/routeId/driverId is set.

**Key architectural patterns:**
- **Financial aggregations at database layer**: Profit calculated via SQL SUM, not application reduce(). Prevents race conditions from storing calculated totals.
- **Optimistic locking**: Route model gains `version` field (incremented on update). Update actions check `WHERE version = expectedVersion` to detect concurrent edits.
- **Defense-in-depth s3Key validation**: Server actions verify `s3Key.startsWith(\`tenant-${tenantId}/\`)` AND entity (driver/truck/route) belongs to tenant. Prevents path traversal and cross-tenant access.
- **Multipart upload for large files**: Files >5MB use R2 multipart upload API (10MB chunks) with retry logic. Client shows progress bar via XMLHttpRequest upload.addEventListener('progress').

### Critical Pitfalls

**Top 5 pitfalls from research (with prevention strategies):**

1. **Floating-point arithmetic causing financial calculation errors**: Using JavaScript `number` or PostgreSQL FLOAT for money causes rounding errors (0.1 + 0.2 ≠ 0.3) that accumulate across transactions. **Prevention**: Always use `@db.Decimal(10,2)` in schema, Decimal.js for client-side calculations, Zod validation enforces max 2 decimal places. Test aggregations with 1000+ transactions to detect precision loss. **Phase to address**: Phase 1 (Route Finance Foundation).

2. **Race conditions in concurrent financial updates**: Multiple users adding expenses simultaneously creates lost updates when both read current total, calculate new total separately, then overwrite each other. **Prevention**: Use database aggregations (SUM) instead of storing totals. Add `version` field for optimistic locking. Implement idempotency keys for expense creation. Use database transactions with SELECT FOR UPDATE for critical paths. **Phase to address**: Phase 1 (Route Finance Foundation).

3. **Unsaved changes lost when toggling view/edit modes**: Form state destroyed on mode switch or navigation, losing user's work. Especially problematic for multi-step workflows (add 5 expenses, switch to view, all data gone). **Prevention**: Detect unsaved changes with react-hook-form `isDirty`, block navigation with beforeunload handler, persist drafts to localStorage, show confirmation modal before leaving. Keep form state alive across mode transitions (hide/show via CSS, not mount/unmount). **Phase to address**: Phase 2 (Unified View/Edit Page).

4. **Orphaned files from failed upload transactions**: Files uploaded to R2 but not saved to database (due to errors, network failures, user closing tab) accumulate as "orphans" that consume storage and create security risks. **Prevention**: Track pending uploads in database before generating presigned URL, run daily cleanup job to delete expired pending uploads, enable R2 lifecycle policy to abort incomplete multipart uploads after 7 days. **Phase to address**: Phase 3 (Driver Document Uploads).

5. **Cascading deletes destroying financial audit trail**: Using `onDelete: Cascade` on RouteExpense/RoutePayment means deleting a route permanently erases all financial records, violating tax/compliance retention requirements (7+ years). **Prevention**: Use `onDelete: Restrict` on all financial models. Implement soft delete pattern (deletedAt timestamp) instead of hard delete. Create immutable FinancialAuditLog with no foreign keys (can't cascade). Require explicit confirmation before route deletion, block if financial records exist. **Phase to address**: Phase 1 (Route Finance Foundation).

**Additional pitfalls (medium severity):**
- **Missing indexes on financial aggregation queries**: Dashboard queries for route profitability scan millions of expenses without indexes, causing 10-30s query times. Fix: Add composite indexes `(tenantId, expenseDate)`, `(tenantId, routeId)` during schema creation.
- **View/edit state desync with server data**: Edit mode shows stale data when another user updates route concurrently. Fix: Refetch on view mode entry, show staleness indicator if data >1 minute old, implement optimistic locking.
- **File upload size limits silently failing**: Driver license PDFs >10MB fail without clear errors. Fix: Implement multipart upload for >5MB files, increase MAX_FILE_SIZE to 100MB, show upload progress with retry logic.
- **Multi-tenant isolation bypass in file storage paths**: Path traversal vulnerabilities (`../../tenant-other/`) allow accessing other tenants' documents. Fix: Always validate s3Key matches tenantId, sanitize filenames to remove `../`, verify entity ownership server-side.
- **Missing validation on expense categories**: Free-text categories create data quality issues (misspellings, inconsistent naming, unusable reports). Fix: Use Prisma enum or validated dropdown with autocomplete.

## Implications for Roadmap

Based on research, suggested **3-phase structure** for this milestone:

### Phase 1: Route Finance Foundation
**Rationale:** Financial models require highest data integrity standards and serve as foundation for UI in Phase 2. Schema changes (RouteExpense, RoutePayment tables with RLS policies) must be deployed before any UI work. Decimal.js arithmetic patterns and optimistic locking need to be established early and reused across all financial features.

**Delivers:**
- RouteExpense and RoutePayment models with `@db.Decimal(10,2)` for all money fields
- RouteExpenseRepository and RoutePaymentRepository extending TenantRepository base class
- RLS policies on new financial tables matching existing pattern from Phase 3-10
- Server actions for expense/payment CRUD with `requireRole([OWNER, MANAGER])` guards
- getRouteFinancials aggregation helper using Decimal.js for profit calculation
- Optimistic locking via `version` field on Route model
- Soft delete pattern (deletedAt timestamp) instead of hard delete
- Immutable FinancialAuditLog model (append-only, no foreign keys)
- ExpenseCategory enum or validated string with autocomplete data
- Composite indexes on (tenantId, expenseDate), (tenantId, routeId) for query performance
- Integration tests verifying concurrent edit protection and decimal precision

**Addresses (from FEATURES.md):**
- Route Expense Line Items (table stakes)
- Route Profit Calculation (table stakes)
- Payment Status Tracking (table stakes)

**Avoids (from PITFALLS.md):**
- Pitfall 1: Floating-point arithmetic errors (Decimal type + Decimal.js)
- Pitfall 2: Race conditions (optimistic locking, database aggregations)
- Pitfall 5: Cascading deletes (onDelete: Restrict, soft delete)
- Pitfall 7: Missing indexes (composite indexes defined upfront)
- Pitfall 10: Invalid categories (ExpenseCategory enum with validation)

**Stack elements used:**
- Prisma 7 with Decimal type (existing pattern from FuelRecord)
- decimal.js 10.6 for client-side calculations (new dependency)
- Zod for validation (extend existing schemas with z.array())
- PostgreSQL 17 RLS policies (existing infrastructure)

**Research flag:** SKIP research-phase. Financial CRUD follows established repository pattern from Phase 3-10. Decimal.js usage is well-documented in official docs. No complex domain logic or niche integrations.

---

### Phase 2: Unified Route View/Edit Page
**Rationale:** Merging separate view/edit pages improves UX but requires careful state management to prevent data loss. Depends on Phase 1 financial actions being available so finance section can render in unified page. Introduces new pattern (searchParams-based mode toggle) that future pages can reuse.

**Delivers:**
- Modified `/routes/[id]/page.tsx` to use searchParams.mode ('view' | 'edit')
- RouteViewSection component (read-only display with "Edit" button)
- RouteEditSection component (form with save/cancel controls)
- EditModeToggle component for view/edit switching
- RouteFinanceSection integrated into layout (conditionally editable based on mode)
- Unsaved changes detection with react-hook-form `isDirty`
- Browser navigation blocking via beforeunload handler
- localStorage draft persistence with recovery prompt
- Refetch on view mode transition to prevent stale data
- Staleness indicator if data >1 minute old
- Optimistic updates via TanStack Query mutations
- Deprecation of old `/routes/[id]/edit` page
- Updated navigation links to use ?mode=edit pattern

**Addresses (from FEATURES.md):**
- Edit Mode Toggle (table stakes - modern SaaS UX)
- Basic In-Place Editing (for simple fields like expense amounts)

**Avoids (from PITFALLS.md):**
- Pitfall 3: Unsaved changes lost (navigation blocking, localStorage, confirmation modal)
- Pitfall 8: View/edit state desync (refetch on mode change, staleness indicator, optimistic locking)

**Stack elements used:**
- react-hook-form 7.54 with useFieldArray for expense line items (new dependency)
- TanStack Query for optimistic updates (existing)
- Next.js searchParams for URL state (existing App Router feature)
- shadcn/ui Toggle component for edit mode switch (existing)

**Implements (from ARCHITECTURE.md):**
- Pattern 2: Unified View/Edit via searchParams (detailed in architecture research)
- Optimistic locking integration with version field from Phase 1

**Research flag:** SKIP research-phase. React Hook Form integration with Next.js 16 is well-documented. Unsaved changes patterns have established React solutions (beforeunload, localStorage). State management with searchParams is standard App Router pattern.

---

### Phase 3: Driver Document Uploads
**Rationale:** Extends existing document upload infrastructure (Phase 6 - Cloudflare R2, presigned URLs) to new entity type (drivers). Independent of financial features, can proceed in parallel with Phase 2 if needed. Requires multipart upload support for large scanned files (driver licenses/certifications often 15-50MB PDFs).

**Delivers:**
- Extended Document model with optional `driverId` field and driver relation
- Extended User model with driverDocuments relation
- DocumentRepository.findByDriverId(driverId: string) method
- DocumentCategory type extended to include 'drivers' (alongside 'trucks', 'routes')
- Modified requestUploadUrl to handle entityType='driver'
- Modified completeUpload to save driverId and validate exactly one entity ID set
- Enhanced presigned.ts to support 'drivers' category in s3Key generation
- Multipart upload API for files >5MB (10MB chunks with retry logic)
- Upload progress indicator with XMLHttpRequest (shows MB/s, ETA)
- Increased MAX_FILE_SIZE to 100MB (from 10MB)
- react-dropzone integration for drag-and-drop UX enhancement
- PendingUpload tracking table for orphan detection
- Daily cleanup job to delete orphaned files (expired pending uploads)
- R2 lifecycle policy configured to abort incomplete multipart uploads after 7 days
- Document expiry date field with visual warnings (<30 days or expired)
- Integration with notification system (Phase 9) for expiry alerts
- Defense-in-depth s3Key validation (tenant prefix + entity ownership)
- sanitizeFilename utility to prevent path traversal (removes ../, allows only safe chars)
- Security test suite verifying tenant isolation across all file operations

**Addresses (from FEATURES.md):**
- Driver License Upload (table stakes - DOT compliance requirement)
- Document Expiry Date (table stakes - compliance risk reduction)
- Document Auto-Expiry Reminders (differentiator - proactive management)
- Bulk Document Upload (nice-to-have if time permits, otherwise defer to post-launch)

**Avoids (from PITFALLS.md):**
- Pitfall 4: Orphaned files (PendingUpload tracking, cleanup job, R2 lifecycle policy)
- Pitfall 6: Multi-tenant isolation bypass (s3Key validation, filename sanitization, entity ownership checks)
- Pitfall 9: File upload size limits (multipart upload, 100MB limit, progress indicator)

**Stack elements used:**
- react-dropzone 14.3 for drag-drop UX (new dependency)
- Existing Cloudflare R2 infrastructure (Phase 6 patterns)
- Existing notification system (Phase 9 for expiry alerts)
- Intl.NumberFormat for file size formatting (native, zero bundle impact)

**Implements (from ARCHITECTURE.md):**
- Pattern 3: Document Category Extension (detailed in architecture research)
- Multipart upload flow for large files (architectural pattern)
- Defense-in-depth validation for tenant isolation

**Research flag:** SKIP research-phase. R2 multipart upload is documented in Cloudflare official docs. react-dropzone integration with Next.js has established community patterns. File upload security follows OWASP Multi-Tenant Security cheat sheet recommendations.

---

### Phase Ordering Rationale

**Why Phase 1 first:**
- Schema changes must deploy before UI (can't build expense forms without RouteExpense table)
- Financial precision patterns (Decimal.js, optimistic locking) need to be established and tested before UI complexity
- Phase 2 depends on Phase 1 server actions (RouteFinanceSection calls createExpense, getRouteFinancials)
- Failing fast on financial data integrity issues is cheaper in backend-only phase than after UI ships

**Why Phase 2 second:**
- Unified view/edit pattern benefits from having working financial section to test with (validates mode toggle works for complex forms)
- react-hook-form integration needs real data structures (expense line items from Phase 1) to test useFieldArray
- Unsaved changes detection is easier to verify with multi-section forms (route details + expenses + documents)
- Creates reusable pattern for future page consolidations (truck detail, driver detail could adopt same approach)

**Why Phase 3 last:**
- Driver documents are independent feature (doesn't block financial tracking or view/edit UX)
- Can proceed in parallel with Phase 2 if timeline pressure exists (different components, no overlapping code)
- Allows time for R2 lifecycle policy configuration and cleanup job deployment (infrastructure changes)
- Multipart upload complexity benefits from having solid foundation (Phase 1-2 complete, team experienced with codebase)

**Feature grouping rationale:**
All three phases contribute to same user workflow (fleet manager reviewing completed route):
1. Phase 1: "What did this route cost?" (view expenses, calculate profit)
2. Phase 2: "Let me update incorrect expense amount" (inline edit without navigation)
3. Phase 3: "Upload driver's receipt for expense" (attach supporting documents)

Splitting into 3 phases allows independent testing, incremental deployment, and clear rollback points. Alternative would be single mega-phase, but that delays feedback and increases integration risk.

### Research Flags

**Phases SKIP research-phase (standard patterns, well-documented):**
- **Phase 1 (Route Finance Foundation)**: Repository pattern established in Phase 3-10. Decimal.js arithmetic well-documented in official docs. Optimistic locking is standard database pattern (Prisma docs, PostgreSQL docs). No complex domain logic or niche integrations.
- **Phase 2 (Unified View/Edit Page)**: react-hook-form integration with Next.js 16 covered in official docs. Unsaved changes detection has React community consensus solutions (beforeunload, localStorage, React Router useBlocker). searchParams pattern is standard Next.js App Router feature.
- **Phase 3 (Driver Document Uploads)**: R2 multipart upload documented in Cloudflare official docs. react-dropzone + Next.js integration has established community patterns (Medium articles, GitHub examples). File upload security follows OWASP Multi-Tenant Security cheat sheet.

**No phases need `/gsd:research-phase`**. All features extend existing patterns or use well-documented libraries.

**Validation during planning:**
- **Phase 1**: Run EXPLAIN ANALYZE on profit calculation query with 10K+ sample expenses to verify index usage. Load test concurrent expense creation (5 users, same route) to verify optimistic locking prevents lost updates.
- **Phase 2**: Test navigation blocking in both Chrome and Safari (beforeunload behavior differs). Verify localStorage persistence survives browser crash/restart.
- **Phase 3**: Test multipart upload with 50-100MB file on simulated 3G connection to verify retry logic works. Security test path traversal attempts (filenames with `../`, manipulated s3Keys).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | **HIGH** | All recommended technologies already in use (Prisma Decimal pattern exists in FuelRecord). Three new dependencies (react-hook-form, decimal.js, react-dropzone) are mature, TypeScript-native, proven Next.js compatibility. Official documentation complete and current (2026). |
| Features | **HIGH** | Table stakes features validated across multiple fleet management competitors (Fleetio, Samsara). DOT compliance requirements sourced from official FMCSA 49 CFR 391 regulations. Anti-features identified through SaaS UX research (inline editing pitfalls, real-time data entry risks). |
| Architecture | **HIGH** | Extends proven repository pattern from existing codebase (Phase 3-10 implementation). Financial precision patterns (Decimal.js, optimistic locking) sourced from official Prisma docs, PostgreSQL best practices, accounting system architecture research. Unified view/edit via searchParams is documented Next.js App Router pattern. |
| Pitfalls | **MEDIUM-HIGH** | Critical pitfalls (floating-point errors, race conditions, cascade deletes) verified across multiple authoritative sources (OWASP, PostgreSQL docs, financial systems research). Some pitfall severity estimates based on medium-confidence sources (Medium articles, community discussions) rather than official docs. Recovery costs estimated from similar incident reports. |

**Overall confidence:** **HIGH**

Research benefits from strong foundation - this is milestone 3 of existing project, not greenfield. Existing patterns (RLS, repository layer, document uploads) are proven and well-understood. New features extend familiar patterns rather than introducing novel architecture. All dependencies mature and battle-tested (react-hook-form 7+ years active, decimal.js 10+ years, Prisma Decimal type standard for financial apps).

### Gaps to Address

**Areas requiring validation during implementation:**

1. **Decimal.js conversion performance**: Research confirms decimal.js is correct approach for financial calculations, but didn't quantify performance impact of converting Prisma.Decimal → decimal.js → back for every display operation. **Mitigation**: Benchmark profit calculation for route with 100 expenses, verify <100ms. If slow, cache calculated profit with 5-minute TTL.

2. **react-hook-form bundle size with useFieldArray**: Documentation shows 35KB gzipped for full library, but unclear how much specifically for useFieldArray (dynamic arrays). **Mitigation**: Build production bundle, verify route finance page <200KB total JS. If over, lazy load ExpenseLineItemForm with next/dynamic.

3. **R2 multipart upload reliability on mobile**: Cloudflare docs specify multipart API works, but limited real-world data on reliability with 3G/4G connections and iOS Safari. **Mitigation**: Test upload of 50MB file on simulated slow network (Chrome DevTools throttling). Add comprehensive retry logic (3 attempts with exponential backoff). Include "Resume Upload" button if browser closes mid-upload.

4. **Optimistic locking UX for version conflicts**: Research recommends version field for concurrent edit detection, but unclear best UX when conflict occurs (modal? inline error? which user's changes win?). **Mitigation**: Default to "last editor wins with warning" (show toast: "Another user updated this route. Refresh to see changes."). Add conflict resolution UI in post-MVP if version conflicts happen frequently (>5% of saves).

5. **localStorage size limits for draft persistence**: Browsers typically allow 5-10MB localStorage per origin, but large routes with 100+ expenses might exceed limit. **Mitigation**: Compress draft JSON with LZ-string library before localStorage.setItem. Test with route containing 200 expenses + 50 documents. If still exceeds, persist to IndexedDB instead.

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [Next.js 16 Documentation](https://nextjs.org/docs) - App Router patterns, searchParams usage, Server Components
- [Prisma Documentation](https://www.prisma.io/docs/orm) - Prisma 7 pure TypeScript, Decimal type for money, RLS patterns
- [Prisma Decimal Type - Official Recommendation](https://www.prisma.io/docs/postgres/query-optimization/recommendations/avoid-db-money) - Why @db.Decimal(10,2) over @db.Money
- [PostgreSQL 17 Release Notes](https://www.postgresql.org/docs/release/17.0/) - Performance improvements, RLS policies
- [react-hook-form Official Docs](https://react-hook-form.com/docs) - useFieldArray for dynamic arrays, React 19 compatibility
- [decimal.js API Reference](https://mikemcl.github.io/decimal.js/) - Exact decimal arithmetic, TypeScript support
- [react-dropzone Official Docs](https://react-dropzone.js.org/) - File upload UX, Next.js integration
- [Cloudflare R2 Multipart Upload Docs](https://developers.cloudflare.com/r2/objects/multipart-objects/) - Large file uploads, chunk size limits
- [FMCSA 49 CFR 391 - Driver Qualification Files](https://csa.fmcsa.dot.gov/safetyplanner/documents/Forms/Driver%20Qualification%20Checklist_508.pdf) - DOT compliance requirements

**Existing Codebase:**
- DriveCommand Phase 3-10 implementation - Repository pattern, RLS enforcement, document uploads established
- FuelRecord model using @db.Decimal(10,2) - Proven pattern for monetary values in this codebase

### Secondary (MEDIUM-HIGH confidence)

**Technical Best Practices:**
- [OWASP Multi-Tenant Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multi_Tenant_Security_Cheat_Sheet.html) - Tenant isolation patterns
- [PostgreSQL Database Design Best Practices](https://www.tigerdata.com/learn/guide-to-postgresql-database-design) - Schema design, indexing strategies
- [Crunchy Data - Working with Money in Postgres](https://www.crunchydata.com/blog/working-with-money-in-postgres) - DECIMAL vs MONEY vs integer storage
- [Double-Entry Accounting for Software Engineers](https://www.balanced.software/double-entry-bookkeeping-for-programmers/) - Financial data modeling patterns
- [React Router State Management](https://reactrouter.com/explanation/state-management) - URL-based state patterns
- [Soft Delete vs Hard Delete: Choose the Right Data Lifecycle](https://appmaster.io/blog/soft-delete-vs-hard-delete) - When to use each pattern

**Security Research:**
- [Tenant Data Isolation: Patterns and Anti-Patterns](https://propelius.ai/blogs/tenant-data-isolation-patterns-and-anti-patterns) - Multi-tenant architecture pitfalls
- [A Race to the Bottom - Database Transactions Undermining Your AppSec](https://blog.doyensec.com/2024/07/11/database-race-conditions.html) - Concurrency vulnerability examples
- [Race Condition and Double Spending in Money Transfer Systems](https://medium.com/@moeinkolivand97/race-condition-and-double-spending-in-money-transfer-systems-7b5547c5d0de) - Financial system security

**Fleet Management Domain:**
- [Fleet Management Cost Analysis - Fleetio](https://www.fleetio.com/blog/fleet-management-cost-analysis) - Industry expense categories, profitability metrics
- [10 Fleet KPIs 2026 - GPS Insight](https://www.gpsinsight.com/blog/10-metrics-that-define-high-performing-fleet/) - Key performance indicators
- [Driver Qualification File Checklist - Avatar Fleet](https://www.avatarfleet.com/blog/driver-qualification-file-checklist-to-pass-dot-audit) - DOT compliance requirements

### Tertiary (MEDIUM confidence, needs validation)

**Integration Guides:**
- [Building a Drag-and-Drop File Uploader with Next.js - Medium](https://medium.com/@codewithmarish/building-a-drag-and-drop-file-uploader-with-next-js-1cfaf504f8ea) - react-dropzone patterns
- [How to Protect Unsaved Form Data in React Forms - Medium](https://medium.com/technogise/how-to-protect-unsaved-form-data-in-react-forms-87f902a8e1bd) - Navigation blocking UX
- [Form Validation with Zod and React Hook Form - Contentful](https://www.contentful.com/blog/react-hook-form-validation-zod/) - Integration pattern
- [React Leaflet on Next.js 15 App Router - XXL Steve](https://xxlsteve.net/blog/react-leaflet-on-next-15/) - Server component patterns (applicable to file upload components)

**Comparison Articles:**
- [Clerk vs Auth0 for Next.js](https://clerk.com/articles/clerk-vs-auth0-for-nextjs) - Authentication provider comparison (existing choice validated)
- [Prisma vs Drizzle ORM 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma) - ORM performance vs DX tradeoffs (confirms Prisma choice)

---
*Research completed: 2026-02-16*
*Ready for roadmap creation: YES*
*Recommended phase structure: 3 phases (Route Finance Foundation → Unified View/Edit Page → Driver Document Uploads)*
