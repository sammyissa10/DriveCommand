# Roadmap: DriveCommand

## Overview

DriveCommand builds from secure multi-tenant foundations through entity management (trucks, drivers, routes) to operational workflows (documents, maintenance, notifications), platform administration, and fleet intelligence. v1.0 delivered complete fleet management (phases 1-10). v2.0 added Samsara-inspired fleet intelligence with live GPS tracking, safety analytics, fuel efficiency dashboards, tag-based organization, and modern sidebar navigation — all powered by mock data with hardware-ready API contracts. v3.0 extends operational capability with route financial tracking, unified view/edit page architecture, and driver document compliance uploads.

## Milestones

- ✅ **v1.0 Fleet Management** — Phases 1-10 (shipped 2026-02-15)
- ✅ **v2.0 Samsara-Inspired Fleet Intelligence** — Phases 11-15 (shipped 2026-02-16)
- ✅ **v3.0 Route Finance & Driver Documents** — Phases 16-18 (shipped 2026-02-17)

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

<details>
<summary>✅ v3.0 Route Finance & Driver Documents (Phases 16-18) — SHIPPED 2026-02-17</summary>

**Milestone Goal:** Add financial tracking to routes (expenses, payments, profit) with a consolidated route page UX, plus driver document upload capabilities for DOT compliance.

- [x] **Phase 16: Route Finance Foundation** — Financial tracking with line-item expenses and profit calculation (5 plans)
- [x] **Phase 17: Unified Route View/Edit Page** — Single route page with edit mode toggle (2 plans)
- [x] **Phase 18: Driver Document Uploads** — Driver license, application, and general document uploads (3 plans)

See: [.planning/milestones/v3.0-ROADMAP.md] for full phase details.

</details>

## Progress

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
| 16. Route Finance Foundation | v3.0 | 5/5 | ✓ Complete | 2026-02-16 |
| 17. Unified Route View/Edit Page | v3.0 | 2/2 | ✓ Complete | 2026-02-16 |
| 18. Driver Document Uploads | v3.0 | 3/3 | ✓ Complete | 2026-02-17 |

### Phase 1: Database Integrity Hardening — Add missing RLS policies to NotificationLog/InvoiceItem/ExpenseTemplateItem, create missing migration SQL for Load and TenantIntegration tables, fix migration script error handling to fail hard instead of swallowing errors

**Goal:** Close all database security and deployment gaps — add RLS to tables missing tenant isolation policies, create tracked migration SQL for tables that were added via db push, and make the migration runner fail-fast so broken deploys surface immediately.
**Depends on:** None (infrastructure hardening, independent)
**Plans:** 2 plans

Plans:
- [x] 01-01-PLAN.md — Create migration SQL (enum types, tenantId columns + backfill + RLS for NotificationLog/InvoiceItem/ExpenseTemplateItem, CREATE TABLE IF NOT EXISTS for Load and TenantIntegration with full RLS) and update schema.prisma
- [x] 01-02-PLAN.md — Fix migrate.mjs outer catch to process.exit(1) instead of swallowing error; TypeScript type check
