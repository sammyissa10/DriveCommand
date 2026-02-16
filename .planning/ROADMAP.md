# Roadmap: DriveCommand

## Overview

DriveCommand builds from secure multi-tenant foundations through entity management (trucks, drivers, routes) to operational workflows (documents, maintenance, notifications), platform administration, and fleet intelligence. v1.0 delivered complete fleet management (phases 1-10). v2.0 added Samsara-inspired fleet intelligence with live GPS tracking, safety analytics, fuel efficiency dashboards, tag-based organization, and modern sidebar navigation — all powered by mock data with hardware-ready API contracts. v3.0 extends operational capability with route financial tracking, unified view/edit page architecture, and driver document compliance uploads.

## Milestones

- ✅ **v1.0 Fleet Management** — Phases 1-10 (shipped 2026-02-15)
- ✅ **v2.0 Samsara-Inspired Fleet Intelligence** — Phases 11-15 (shipped 2026-02-16)
- 🚧 **v3.0 Route Finance & Driver Documents** — Phases 16-18 (in progress)

## Phases

<details>
<summary>✅ v1.0 Fleet Management (Phases 1-10) — SHIPPED 2026-02-15</summary>

**Milestone Goal:** Multi-tenant SaaS platform for logistics fleet management with trucks, drivers, routes, documents, maintenance, and notifications.

- [x] **Phase 1: Foundation & Multi-Tenant Setup** — Database schema with RLS, tenant provisioning, middleware (3 plans)
- [x] **Phase 2: Authentication & Authorization** — Clerk integration, role-based access, signup/login flows (3 plans)
- [x] **Phase 3: Truck Management** — Vehicle CRUD, listing, filtering, structured fields (2 plans)
- [x] **Phase 4: Driver Management** — Driver accounts, invite system, listing, role enforcement (2 plans)
- [x] **Phase 5: Route Management** — Route CRUD, lifecycle, driver-truck assignment, unified detail view (2 plans)
- [x] **Phase 6: Document Storage & Files** — Cloudflare R2 integration, file uploads, tenant-isolated storage (2 plans)
- [x] **Phase 7: Driver Portal** — Read-only driver interface, assigned route view, restricted access (2 plans)
- [x] **Phase 8: Maintenance & Scheduling** — Service history, dual-trigger scheduling, expiry tracking (2 plans)
- [x] **Phase 9: Notifications & Reminders** — Email service, background jobs, maintenance/document alerts (2 plans)
- [x] **Phase 10: Dashboard & System Admin** — Fleet overview, metrics, system admin tenant management (2 plans)

See: [.planning/milestones/v1.0-ROADMAP.md] for full phase details.

</details>

<details>
<summary>✅ v2.0 Samsara-Inspired Fleet Intelligence (Phases 11-15) — SHIPPED 2026-02-16</summary>

**Milestone Goal:** Transform DriveCommand into a Samsara-inspired fleet intelligence platform with live GPS tracking, safety analytics, fuel efficiency dashboards, and modern sidebar navigation — all powered by mock data for rapid UI validation.

- [x] **Phase 11: Navigation & Data Foundation** — Sidebar navigation + GPS/Safety/Fuel data models + mock data seeding (3 plans)
- [x] **Phase 12: Live GPS Map** — Leaflet map + vehicle markers + detail panel + route trails + clustering (2 plans)
- [x] **Phase 13: Safety Analytics Dashboard** — Safety scores + event tracking + trends + rankings + thresholds (2 plans)
- [x] **Phase 14: Fuel & Energy Dashboard** — MPG trends + cost analysis + emissions + idle time + rankings (2 plans)
- [x] **Phase 15: Tags/Groups & Polish** — Organization system + loading states + error handling + mobile responsive (3 plans)

See: [.planning/milestones/v2.0-ROADMAP.md] for full phase details.

</details>

### 🚧 v3.0 Route Finance & Driver Documents (In Progress)

**Milestone Goal:** Add financial tracking to routes (expenses, payments, profit) with a consolidated route page UX, plus driver document upload capabilities for DOT compliance.

**Phase Numbering:**
- Integer phases (16, 17, 18): Planned milestone work
- Decimal phases (16.1, 16.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 16: Route Finance Foundation** — Financial tracking with line-item expenses and profit calculation
- [ ] **Phase 17: Unified Route View/Edit Page** — Single route page with edit mode toggle
- [ ] **Phase 18: Driver Document Uploads** — Driver license, application, and general document uploads

#### Phase 16: Route Finance Foundation
**Goal**: Users can track route expenses, payments, and profitability with financial precision
**Depends on**: Phase 15 (v2.0 complete)
**Requirements**: FIN-01, FIN-02, FIN-03, FIN-04, FIN-05, FIN-06, FIN-07, FIN-08, FIN-09, FIN-10
**Success Criteria** (what must be TRUE):
  1. User can add, edit, and delete line-item expenses for a route with gas cost, driver salary, insurance, tolls, and custom categories
  2. User can record payment/revenue for a route and track payment status (pending/paid)
  3. User can see total operating cost (sum of all expenses) and profit calculation (payment - expenses) per route
  4. User can create custom expense categories for their tenant and apply expense templates to pre-fill common costs
  5. User can view cost per mile and compare against fleet average, and receives alerts when profit margin falls below threshold
**Plans**: TBD

Plans:
- [ ] TBD

#### Phase 17: Unified Route View/Edit Page
**Goal**: Users can view and edit route details on a single page with seamless mode toggling
**Depends on**: Phase 16
**Requirements**: RUX-01, RUX-02, RUX-03
**Success Criteria** (what must be TRUE):
  1. User can view all route details (info, expenses, documents) on a single unified page
  2. User can toggle between view mode and edit mode without leaving the page or losing context
  3. User can edit route status and other route details from the unified page in edit mode
  4. User is protected from losing unsaved changes when navigating away or switching modes
**Plans**: TBD

Plans:
- [ ] TBD

#### Phase 18: Driver Document Uploads
**Goal**: Users can upload and manage driver compliance documents with expiry tracking
**Depends on**: Phase 17
**Requirements**: DOC-01, DOC-02, DOC-03, DOC-04, DOC-05
**Success Criteria** (what must be TRUE):
  1. User can upload driver license, driver application, and general documents to a driver profile
  2. User can set expiry dates on driver documents during upload or edit
  3. User can see expiry status warnings (valid, expiring soon, expired) on driver documents
  4. User can upload large scanned files (50-100MB PDFs) with progress indicators and retry logic
  5. User receives notifications 30/60/90 days before driver documents expire
**Plans**: TBD

Plans:
- [ ] TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 16 → 17 → 18

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Multi-Tenant Setup | v1.0 | 3/3 | ✓ Complete | 2026-02-14 |
| 2. Authentication & Authorization | v1.0 | 3/3 | ✓ Complete | 2026-02-14 |
| 3. Truck Management | v1.0 | 2/2 | ✓ Complete | 2026-02-14 |
| 4. Driver Management | v1.0 | 2/2 | ✓ Complete | 2026-02-14 |
| 5. Route Management | v1.0 | 2/2 | ✓ Complete | 2026-02-14 |
| 6. Document Storage & Files | v1.0 | 2/2 | ✓ Complete | 2026-02-14 |
| 7. Driver Portal | v1.0 | 2/2 | ✓ Complete | 2026-02-14 |
| 8. Maintenance & Scheduling | v1.0 | 2/2 | ✓ Complete | 2026-02-14 |
| 9. Notifications & Reminders | v1.0 | 2/2 | ✓ Complete | 2026-02-15 |
| 10. Dashboard & System Admin | v1.0 | 2/2 | ✓ Complete | 2026-02-15 |
| 11. Navigation & Data Foundation | v2.0 | 3/3 | ✓ Complete | 2026-02-15 |
| 12. Live GPS Map | v2.0 | 2/2 | ✓ Complete | 2026-02-15 |
| 13. Safety Analytics Dashboard | v2.0 | 2/2 | ✓ Complete | 2026-02-15 |
| 14. Fuel & Energy Dashboard | v2.0 | 2/2 | ✓ Complete | 2026-02-15 |
| 15. Tags/Groups & Polish | v2.0 | 3/3 | ✓ Complete | 2026-02-16 |
| 16. Route Finance Foundation | v3.0 | 0/TBD | Not started | - |
| 17. Unified Route View/Edit Page | v3.0 | 0/TBD | Not started | - |
| 18. Driver Document Uploads | v3.0 | 0/TBD | Not started | - |
