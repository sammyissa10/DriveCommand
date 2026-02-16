# Feature Research

**Domain:** Route Finance Tracking, Unified View/Edit Pages, Driver Document Uploads
**Researched:** 2026-02-16
**Confidence:** MEDIUM-HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Route Expense Line Items** | Core fleet tracking need - managers need granular visibility into per-route costs (fuel, driver pay, tolls, insurance) to calculate profitability | MEDIUM | Requires extensible schema for custom expense categories, decimal precision for currency, timestamps for expense entry |
| **Route Revenue Tracking** | Essential for profit calculation - without revenue tracking, can't determine route profitability (linehaul + fuel surcharge + accessorials) | LOW-MEDIUM | Simpler than expenses (usually fewer revenue line items), needs decimal precision for currency |
| **Route Profit Calculation** | Standard metric in fleet management - users expect automatic profit = revenue - total expenses, cost per mile aggregation | LOW | Derived field, calculated on read or via database view, should update in real-time as expenses/revenue change |
| **Total Cost Summary** | Users need at-a-glance total expenses per route without manually summing line items | LOW | Aggregate query or computed field, grouped by expense category for breakdowns |
| **Document Upload for Drivers** | DOT compliance requirement - Driver Qualification Files (DQF) must include license, medical examiner certificate, MVR, employment application per 49 CFR 391 | MEDIUM | Already have document storage (Cloudflare R2), need file upload UI, validation (file type, size), metadata (document type, expiry date) |
| **Driver License Upload** | Mandatory DOT compliance - commercial drivers must have valid CDL, fleets must maintain photocopy in DQF | LOW-MEDIUM | Subset of document uploads, specific validation for license format, OCR potential for auto-extraction |
| **Document Expiry Tracking** | Critical for compliance - expired licenses, medical certs, insurance cause DOT violations (12% of FMCSA violations are incomplete DQF) | MEDIUM | Requires expiry date field on documents, background job for expiry checks, alert system integration (already built in Phase 9) |
| **Edit Mode Toggle** | Modern SaaS UX pattern - users expect to toggle between read-only view and editable state without navigation (reduces context switching, faster task completion) | LOW-MEDIUM | Client-side state management (React state), conditional rendering of display vs form components, save/cancel controls |
| **In-Place Editing** | Expected for quick corrections (typo in expense amount, updating payment status) without full form reload | MEDIUM | Inline edit fields with validation, optimistic updates, error handling, visual feedback (checkmark, loading state) |
| **Payment Status Tracking** | Operational necessity - managers need to know which expenses are paid vs pending to manage cash flow and vendor relationships | LOW | Simple enum field (pending, paid, cancelled), timestamp for payment date, optional payment reference |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Custom Expense Categories** | Flexibility for diverse operations - different fleets have unique cost structures (reefer fuel, cross-border fees, hazmat surcharges) that preset categories can't capture | MEDIUM | User-defined expense types with default suggestions, tenant-scoped custom categories, dropdown auto-complete for consistency |
| **Expense Templates** | Time savings - recurring routes have predictable costs (standard driver pay, fuel estimates based on distance), pre-fill common expenses | MEDIUM | Template CRUD, apply template to new route (copy line items), adjust amounts after applying |
| **Profit Margin Alerts** | Proactive management - notify when route profit falls below threshold (e.g., <10% margin triggers review), prevents unprofitable routes from slipping through | MEDIUM | Threshold configuration per tenant, integrates with existing notification system (Phase 9), background job to check margins |
| **Cost Per Mile Comparison** | Benchmarking insight - compare route CPM against fleet average or industry standard ($2.26 in 2024), identify inefficient routes | MEDIUM | Aggregate query across routes for averages, visualization in dashboard (charts already available with Recharts), filter by truck/driver/time period |
| **Document Auto-Expiry Reminders** | Reduces compliance risk - automated reminders 30/60/90 days before license/cert expiry (vs manual calendar tracking), prevents DOT violations | MEDIUM | Extends Phase 9 notification system, scheduled job checks expiry dates, multi-stage reminders (first notice, urgent, expired) |
| **Bulk Document Upload** | Efficiency for onboarding - upload multiple documents at once (license + medical cert + MVR) instead of one-by-one, faster driver setup | MEDIUM | Multi-file drag-drop (react-dropzone supports), parallel R2 uploads, batch metadata entry, progress indicators |
| **OCR License Extraction** | Data entry automation - scan driver license image and auto-populate license number, expiry date, class (vs manual typing), reduces errors | HIGH | Requires OCR service (Tesseract.js client-side or AWS Textract API), accuracy validation, fallback to manual entry |
| **Route Comparison View** | Strategic planning - compare profitability across multiple routes side-by-side (e.g., which routes/drivers/trucks are most profitable), guides resource allocation | MEDIUM | Multi-select routes, comparison table/chart, filter by date range, export to CSV |
| **Expense Approval Workflow** | Financial controls - require manager approval for expenses over threshold or custom categories (prevents unauthorized spending), audit trail | HIGH | Role-based permissions (manager role), approval queue UI, notification on pending approval, status history log |
| **Document Version History** | Compliance audit trail - track when licenses were updated (e.g., renewal), who uploaded, previous versions accessible for DOT audits | MEDIUM | Soft delete old documents (keep in storage, mark inactive), version number, uploaded_by user tracking, restore capability |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Real-Time Expense Entry During Route** | "Drivers should log expenses as they happen" | Drivers are focused on driving safely - distracted data entry creates safety risks, poor UX on mobile while driving, data quality issues (typos, rushed input), GPS tracking already captures fuel stops | **Post-route expense entry** - drivers submit expenses after route completion (safer), fleet managers bulk import fuel card transactions (more accurate), GPS data auto-calculates mileage |
| **Complex Multi-Currency Support** | "We operate across borders" | Most fleet operations are domestic with single currency, multi-currency adds schema complexity (exchange rates, conversion timestamps), regulatory complexity (tax reporting per jurisdiction), UI clutter for 95% of users who don't need it | **Single currency per tenant** - set tenant default currency (USD, CAD, MXN), for cross-border fleets, convert expenses before entry (one-time conversion), flag for future enhancement if real demand emerges |
| **Nested Expense Subcategories** | "We need detailed cost breakdowns" | Over-categorization creates decision fatigue (which subcategory for this?), makes reporting harder (too granular for insights), difficult UX (multi-level dropdowns), diminishing returns on precision | **Flat category list with tags** - one-level expense types (Fuel, Driver Pay, Maintenance, Tolls, Insurance, Other), optional notes field for details, search/filter on notes, keeps UI simple |
| **Predictive Expense Forecasting** | "AI should predict route costs" | Early-stage product lacks historical data for ML accuracy, over-engineering for unproven value (users want actuals first), high development cost vs alternatives, black-box predictions reduce trust | **Simple averages and trends** - show historical average cost per route/truck/driver, percentage change from last period, manual adjustment of estimates, build forecasting AFTER sufficient data and validated demand |
| **Inline Editing for All Fields** | "Everything should be editable in-place" | Complex fields need context (multi-select, date ranges, file uploads can't be inline), validation errors disrupt flow (modal shows all errors at once), confusing for multi-step workflows (driver assignment + truck assignment + route dates), mobile UX suffers (small touch targets) | **Edit mode toggle for complex forms** - simple fields inline (expense amount, payment status), complex changes use edit mode or modal (route details, multi-field updates), clear visual separation of modes (view has gray background, edit has white), responsive to screen size |
| **Document Auto-Deletion on Expiry** | "Clean up expired documents automatically" | DOT audits require historical records (even expired licenses show employment history), compliance risk if audit requests deleted documents, accidental deletion if expiry date wrong, recovery complexity | **Soft expiry with warnings** - mark documents as expired (visual indicator), show warnings on driver profile, keep all documents indefinitely, filter views to hide expired by default but allow "show all" |

## Feature Dependencies

```
[Route Finance Tracking]
    └──requires──> [Route CRUD] (existing - Phase 5)
                       └──requires──> [Truck Management] (existing - Phase 3)
                       └──requires──> [Driver Management] (existing - Phase 4)
    └──enhances──> [Dashboard System] (existing - Phase 10)
                       └──uses──> [Recharts for profit charts] (existing - Milestone 2)

[Unified View/Edit Page]
    └──requires──> [Route Detail View] (existing - Phase 5)
    └──replaces──> [Separate Edit Page] (existing - Phase 5)
    └──conflicts──> [Multiple Edit Pages] (if both exist, causes navigation confusion)

[Driver Document Uploads]
    └──requires──> [Document Storage] (existing - Phase 6 - Cloudflare R2)
    └──requires──> [Driver Management] (existing - Phase 4)
    └──enhances──> [Notifications System] (existing - Phase 9 - for expiry alerts)
    └──optional──> [OCR License Extraction] (future enhancement, not MVP dependency)

[Document Expiry Tracking]
    └──requires──> [Driver Document Uploads] (core feature)
    └──requires──> [Notifications System] (existing - Phase 9)
    └──enhances──> [Compliance Reporting] (future feature)

[Payment Status Tracking]
    └──requires──> [Route Expense Line Items] (core feature)
    └──enhances──> [Route Finance Tracking] (provides cash flow visibility)

[Edit Mode Toggle]
    └──requires──> [Unified View/Edit Page] (implementation pattern)
    └──conflicts──> [Always-Editable Forms] (anti-pattern, no clear save point)
```

### Dependency Notes

- **Route Finance requires existing route foundation:** All expense/revenue tracking depends on route records already existing with truck/driver assignments (Phase 5 complete). Line items reference route ID via foreign key.
- **Unified view/edit replaces separate pages:** Current architecture has `/routes/[id]` (view) and `/routes/[id]/edit` (edit) as separate pages. New pattern merges into single page with toggle, deprecate old edit route.
- **Document uploads leverage existing storage:** Phase 6 built tenant-isolated Cloudflare R2 storage. Driver documents reuse same upload infrastructure with driver_id instead of route_id association.
- **Expiry tracking extends notifications:** Phase 9 built notification system for maintenance reminders. Document expiry uses same notification channel (email/in-app) with new event type `document_expiring`.
- **OCR is enhancement, not blocker:** License extraction can be added after MVP. Initial version: manual upload + manual metadata entry. OCR reduces data entry time but doesn't change core functionality.

## MVP Definition

### Launch With (Milestone Features)

Minimum viable features to deliver user value.

- [x] **Route Expense Line Items** - CRUD for expense entries (amount, category, date, notes), associate with route, display as table
- [x] **Route Revenue Tracking** - Single revenue field or line items (linehaul, fuel surcharge, accessorials), associate with route
- [x] **Route Profit Calculation** - Display total revenue - total expenses, cost per mile (total cost / route distance), visual indicator (green profit, red loss)
- [x] **Payment Status** - Enum field on expenses (pending/paid/cancelled), filter expenses by status, payment date timestamp
- [x] **Driver License Upload** - File upload component, accept image/PDF, save to R2, display on driver profile, download capability
- [x] **Document Expiry Date** - Optional expiry date field on documents, visual warning if expired (<30 days or past date), manual entry
- [x] **Edit Mode Toggle** - Single route page with view/edit modes, "Edit" button switches to edit mode, "Save" commits changes, "Cancel" reverts, read-only display in view mode
- [x] **Basic In-Place Editing** - Inline edit for simple fields (expense amount, payment status), double-click to edit, Enter saves, Escape cancels

### Add After Validation (Post-MVP)

Features to add once core is validated and usage patterns emerge.

- [ ] **Custom Expense Categories** - Let users define custom categories beyond presets, triggers: users request categories not in list
- [ ] **Expense Templates** - Pre-fill common expenses for route types, triggers: users manually re-enter same expenses repeatedly
- [ ] **Profit Margin Alerts** - Notifications when profit < threshold, triggers: users want proactive alerts vs manual checking
- [ ] **Bulk Document Upload** - Multi-file upload for driver onboarding, triggers: onboarding >5 drivers at once becomes painful
- [ ] **Document Version History** - Track license renewals, previous versions, triggers: compliance audit requests historical documents
- [ ] **Route Comparison View** - Side-by-side route profitability, triggers: users export data to Excel for manual comparison

### Future Consideration (Post-Product-Market-Fit)

Features to defer until product-market fit established and resources available.

- [ ] **OCR License Extraction** - Auto-populate from scanned license, triggers: confirmed value (time savings > development cost), user feedback requests it
- [ ] **Expense Approval Workflow** - Manager approval for certain expenses, triggers: enterprise customers with financial controls requirements
- [ ] **Predictive Expense Forecasting** - ML-based cost predictions, triggers: 6+ months of historical data, validated user demand for forecasting
- [ ] **Cost Per Mile Benchmarking** - Compare against fleet/industry averages, triggers: dashboard analytics phase, sufficient data for meaningful comparisons
- [ ] **Multi-Currency Support** - Cross-border operations, triggers: confirmed international customers (not hypothetical)

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Route Expense Line Items | HIGH (core profitability tracking) | MEDIUM (schema, CRUD, validation) | P1 |
| Route Profit Calculation | HIGH (primary use case) | LOW (derived field, simple math) | P1 |
| Driver License Upload | HIGH (DOT compliance mandatory) | MEDIUM (reuse R2, UI, validation) | P1 |
| Edit Mode Toggle | HIGH (UX improvement, reduces navigation) | LOW-MEDIUM (state management, conditional render) | P1 |
| Payment Status | MEDIUM (cash flow visibility) | LOW (enum field, filter UI) | P1 |
| Document Expiry Date | MEDIUM (compliance risk reduction) | LOW (date field, validation, warning UI) | P1 |
| Route Revenue Tracking | HIGH (profit = revenue - expenses) | LOW-MEDIUM (similar to expenses) | P1 |
| Basic In-Place Editing | MEDIUM (UX polish, faster edits) | MEDIUM (inline validation, state management) | P2 |
| Document Expiry Alerts | MEDIUM (proactive compliance) | MEDIUM (extends Phase 9 notifications) | P2 |
| Custom Expense Categories | MEDIUM (flexibility for diverse fleets) | MEDIUM (schema, UI, tenant scoping) | P2 |
| Expense Templates | MEDIUM (time savings for recurring routes) | MEDIUM (template CRUD, apply logic) | P2 |
| Bulk Document Upload | MEDIUM (onboarding efficiency) | MEDIUM (multi-file handling, UX) | P2 |
| Profit Margin Alerts | MEDIUM (proactive management) | MEDIUM (threshold config, notification integration) | P2 |
| Route Comparison View | MEDIUM (strategic insights) | MEDIUM (multi-select, comparison UI) | P2 |
| Document Version History | LOW (nice-to-have for audits) | MEDIUM (soft delete, version tracking) | P3 |
| Cost Per Mile Comparison | LOW (analytics enhancement) | MEDIUM (aggregate queries, charts) | P3 |
| OCR License Extraction | LOW (convenience vs manual entry) | HIGH (OCR service, accuracy validation) | P3 |
| Expense Approval Workflow | LOW (enterprise feature) | HIGH (roles, approval queue, notifications) | P3 |
| Predictive Forecasting | LOW (unproven value) | HIGH (ML model, historical data) | P3 |

**Priority key:**
- P1: Must have for milestone launch (table stakes, high value, blocks other features)
- P2: Should have post-launch (enhances core features, validated demand, medium cost)
- P3: Nice to have future (edge cases, high cost, unvalidated demand, wait for user requests)

## Competitor Feature Analysis

| Feature | Fleetio | Samsara | Our Approach |
|---------|---------|---------|--------------|
| **Route Expense Tracking** | Total cost of ownership view, expense types (fuel, maintenance, tolls, etc.), filterable reports | Real-time expense capture, fuel card integration, automated mileage tracking | **Line-item expense table** - manual entry for MVP (no fuel card API integration yet), custom categories, simpler than Fleetio's complex TCO, more manual than Samsara's automation but easier to build |
| **Profit Calculation** | Cost per mile aggregation, profitability by asset/group, adjustable filters | Revenue vs cost reporting, profit margin tracking, real-time dashboards | **Simple profit = revenue - expenses** - displayed on route detail page, cost per mile calculated, no complex grouping/filtering initially, add dashboards after core works |
| **Document Management** | Centralized document storage, expiry tracking, automated alerts, bulk upload, mobile scanning | DQF management, compliance alerts 30/60/90 days before expiry, mobile app for photo capture | **Start with web upload** - no mobile app yet, single-file upload initially (bulk is P2), expiry alerts reuse Phase 9 notifications, simpler than competitors but faster to ship |
| **View/Edit UX** | Separate detail and edit pages (traditional CRUD) | Single-page view with inline editing for some fields, modals for complex edits | **Toggle pattern** - middle ground between Fleetio's page navigation and Samsara's full inline editing, reduces context switching vs Fleetio, simpler than Samsara's complex inline validation |
| **Payment Tracking** | Expense approval workflows, payment status, vendor management | Invoice tracking, payment reconciliation, integration with accounting software | **Basic payment status only** - no approval workflow (P3), no accounting integration, enum field (pending/paid), sufficient for small-medium fleets, defer complexity |
| **Custom Categories** | Predefined expense types, limited customization | Custom expense fields, configurable categories | **User-defined categories** - more flexible than competitors' presets, tenant-scoped, differentiator for diverse fleet types |

## Sources

### Fleet Management Features & Costs (MEDIUM confidence, verified across sources)
- [Fleet Management Cost Guide 2026 - ExpertMarket](https://www.expertmarket.com/fleet-management/costs)
- [Fleet Management Operations 2026 - AllPro](https://www.allpronow.net/blog/fleet-management-operations/)
- [Expense Management - Simply Fleet](https://www.simplyfleet.app/features/expense-management)
- [Fleet Cost Analysis - Fleetio](https://www.fleetio.com/blog/fleet-management-cost-analysis)
- [Fleet Expenses Guide - CoastPay](https://coastpay.com/blog/fleet-expenses/)

### Profitability & Metrics (MEDIUM confidence)
- [ROI of Fleet Management - GoFleet](https://www.gofleet.com/the-roi-of-fleet-management-cost-savings-and-efficiency/)
- [10 Fleet KPIs 2026 - GPS Insight](https://www.gpsinsight.com/blog/10-metrics-that-define-high-performing-fleet/)
- [Profit Per Load Challenges - LoadStop](https://loadstop.com/blog/fleets-can-not-measure-profits-per-load-efficiently)
- [Fleet KPIs 2026 - Safee](https://safee.com/fleet-management-kpis-how-to-measure-fleet-performance/)

### Driver Document Compliance (MEDIUM-HIGH confidence, DOT regulations)
- [Driver Qualification File Checklist - Avatar Fleet](https://www.avatarfleet.com/blog/driver-qualification-file-checklist-to-pass-dot-audit)
- [DQF Requirements - Foley](https://www.foley.io/articles/driver-file-creation-checklist)
- [FMCSA DQF Checklist - Fleetworthy](https://fleetworthy.com/blog/driver-qualification-file-checklist/)
- [Driver Qualification Files - J.J. Keller](https://www.jjkeller.com/learn/driver-qualification-file-checklist)
- [49 CFR 391 - FMCSA Official](https://csa.fmcsa.dot.gov/safetyplanner/documents/Forms/Driver%20Qualification%20Checklist_508.pdf)

### Document Management Solutions (MEDIUM confidence)
- [Fleet Document Expiry Tracking - Expiration Reminder](https://www.expirationreminder.com/roles/fleet-compliance-software)
- [Vehicle Renewals Automation - Fleetio](https://www.fleetio.com/blog/automating-vehicle-renewals-and-fleet-registration-reminders)
- [Document Management - Driveroo](https://www.driveroo.com/fleet-management-software/)
- [2026 Regulatory Outlook - Keller Encompass](https://eld.kellerencompass.com/resources/blog/2025-blogs/2026-regulatory-outlook)

### Document Verification & AI (MEDIUM confidence)
- [AI Document Verification - Zerity](https://zerity.co.uk/product/onboarding/document-verification)
- [Driver License Check - IDnow](https://www.idnow.io/mobility/driver-checks-car-fleet-management/)
- [Driver Checks - Fleetster](https://www.fleetster.net/fleet-software/driving-licence-check)
- [Digital Fleet Management - Scanbot SDK](https://scanbot.io/blog/data-capture-modules-for-digital-fleet-management/)

### SaaS UX Patterns (MEDIUM confidence)
- [B2B SaaS UX 2026 - Onething Design](https://www.onething.design/post/b2b-saas-ux-design)
- [Inline Edit Pattern - UI Patterns](https://ui-patterns.com/patterns/InplaceEditor)
- [Inline Editing Implementation - Apiko](https://apiko.com/blog/inline-editing/)
- [Inline Edit Design Pattern - Andrew Coyle](https://coyleandrew.medium.com/the-inline-edit-design-pattern-e6d46c933804)
- [Table Design UX - Eleken](https://www.eleken.co/blog-posts/table-design-ux)
- [SaaS Design Principles 2026 - Index](https://www.index.dev/blog/saas-design-principles-ui-ux)

### Fleet Management Software Reviews (MEDIUM confidence)
- [Best Fleet Software 2026 - RTA Fleet](https://rtafleet.com/best-fleet-management-software)
- [Fleetio Pricing - Capterra](https://www.capterra.com/p/120855/Fleetio/)
- [Geotab Total Fleet Management](https://www.geotab.com/)
- [Fleetx AI Transportation Software](https://www.fleetx.io/)

---
*Feature research for: Route Finance Tracking, Unified View/Edit Pages, Driver Document Uploads*
*Researched: 2026-02-16*
*Focus: Table stakes vs differentiators vs anti-features for existing fleet management app*
