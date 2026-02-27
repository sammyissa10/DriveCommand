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

---

### Phase 19: Multi-Stop Routes — Extend routes to support ordered multi-stop itineraries with per-stop status tracking and geofence arrival detection

**Goal:** Allow dispatchers to build routes with multiple pickup and delivery stops in a defined sequence. Each stop tracks its own status (pending → arrived → departed), scheduled time, and coordinates. Geofencing auto-marks arrival when a driver's GPS ping falls within the stop radius. The driver app shows the active stop with navigation context.
**Depends on:** None (extends existing Route model)
**Plans:** 3 plans

Plans:
- [ ] 19-01-PLAN.md — RouteStop model + migration SQL with RLS, Prisma schema, Zod validation, server action stop CRUD
- [ ] 19-02-PLAN.md — Dispatcher UI: multi-stop editor in route form (add/remove/reorder with up/down buttons, AddressAutocomplete per stop), route detail stop timeline with status badges
- [ ] 19-03-PLAN.md — Driver integration: geofence auto-arrive at next pending stop (500m radius), driver portal active stop panel, manual Mark Departed button

---

### Phase 20: Driver Pay Settlement — Automated driver compensation calculation from completed loads with settlement statements

**Goal:** Calculate driver pay automatically from completed loads based on configurable pay structures (per-mile, percentage of load rate, or flat per-load), generate itemized settlement statements covering a pay period, and link settlements to the payroll module. Eliminates manual pay calculation — dispatcher marks loads delivered, system computes what each driver is owed.
**Depends on:** Phase 19 (multi-stop loads have more complex mileage), but can run independently
**Plans:** 3 plans

Plans:
- [ ] 20-01-PLAN.md — Data model: DriverPayConfig model (driverId, payType enum PER_MILE/PERCENTAGE/FLAT, rateValue, effectiveFrom), DriverSettlement model (driverId, tenantId, periodStart, periodEnd, status DRAFT/APPROVED/PAID, totalPay Decimal), SettlementLine model (settlementId, loadId, description, miles, grossRate, payAmount), migration SQL, RLS, schema.prisma update
- [ ] 20-02-PLAN.md — Settlement engine: calculateSettlement server action (pull DELIVERED loads in period for driver, apply pay config, compute per-line pay amounts using Decimal.js, create SettlementLine records), settlement list page at /payroll/settlements, settlement detail with line-item breakdown and approve/mark-paid actions
- [ ] 20-03-PLAN.md — Settlement statement PDF: react-pdf statement with driver info, pay period, itemized load table (load number, origin→destination, miles, gross rate, pay amount), total, signature line; download button on settlement detail page; link Payroll records to settlement via settlementId FK

---

### Phase 21: QuickBooks Online Integration — OAuth2 connection and two-way sync for invoices, expenses, and settlements

**Goal:** Connect a tenant's QuickBooks Online account via OAuth2, then automatically sync DriveCommand financial records to QBO: invoices become QBO invoices (with line items and customer mapping), route expenses sync as QBO expenses, and driver settlements sync as vendor bills or journal entries. Eliminates double-entry for bookkeeping. The integration framework and TenantIntegration model already exist — this wires in the actual QBO API.
**Depends on:** Phase 20 (settlements), existing invoice/expense modules
**Plans:** 3 plans

Plans:
- [ ] 21-01-PLAN.md — OAuth2 connect flow: QBO app credentials in env vars, /api/integrations/qbo/connect initiates OAuth2 code flow (redirect to Intuit), /api/integrations/qbo/callback exchanges code for access+refresh tokens, stores encrypted tokens in TenantIntegration.configJson, connect/disconnect UI on integrations settings page with connection status badge
- [ ] 21-02-PLAN.md — Invoice sync: syncInvoiceToQBO server action (find or create QBO Customer by tenant customer name, create/update QBO Invoice with line items, store qboInvoiceId on Invoice record for idempotent re-sync), sync button on invoice detail page, sync status badge (synced / not synced / error), auto-sync trigger when invoice status changes to SENT
- [ ] 21-03-PLAN.md — Expense and settlement sync: syncExpenseToQBO (map RouteExpense to QBO Expense with category mapping), syncSettlementToQBO (map DriverSettlement to QBO Vendor Bill), token refresh middleware (auto-refresh expired access token using refresh token before any QBO API call), sync error logging to TenantIntegration.configJson.lastSyncError

---

### Phase 22: Support Ticket System — In-app support tickets for tenant owners with threaded replies and status tracking

**Goal:** Tenant owners can submit support tickets from within the owner portal (subject, description, category, priority), view ticket history, and receive replies in-thread. The DriveCommand team manages all tickets from the super-admin portal (Phase 23). Email notifications alert the owner on reply and the DriveCommand team on new ticket submission. Replaces ad-hoc email support with a trackable, in-product support channel.
**Depends on:** None (standalone module)
**Plans:** 3 plans

Plans:
- [ ] 22-01-PLAN.md — Data model: SupportTicket model (id, tenantId, createdByUserId, subject, description, category enum BILLING/BUG/FEATURE/GENERAL, priority enum LOW/NORMAL/HIGH/URGENT, status enum OPEN/IN_PROGRESS/WAITING_ON_CUSTOMER/RESOLVED/CLOSED, closedAt), TicketMessage model (ticketId, senderType OWNER/ADMIN, senderLabel, body, createdAt), migration SQL, RLS (tenant-scoped read/write for SupportTicket and TicketMessage; bypass_rls for admin reads across all tenants), schema.prisma update
- [ ] 22-02-PLAN.md — Owner portal UI: /support page with ticket list (status badge, priority, last updated), new ticket form (subject, category, priority, description), ticket detail page with threaded message timeline, reply form (owner can reply, auto-sets status to WAITING_ON_CUSTOMER), email notification to DriveCommand team inbox on new ticket via Resend
- [ ] 22-03-PLAN.md — Ticket status lifecycle and notifications: admin reply triggers email to ticket creator (owner) with message preview and link, owner reply triggers admin email alert, auto-close RESOLVED tickets after 7 days of no owner reply (cron job), ticket sidebar link under Help section in owner portal nav (chat-bubble icon, unread reply badge count)

---

### Phase 23: System Admin Portal — Super-admin interface for the DriveCommand team to manage all tenants

**Goal:** A fully separate super-admin portal at /admin/* accessible only to DriveCommand team members via a hardcoded ADMIN_SECRET_KEY environment variable (not the tenant session system). Provides tenant list with key metrics, ability to create new tenants directly (bypassing the self-signup flow), suspend/reactivate tenants, view tenant details, and manage support tickets (Phase 22) across all tenants. This is the internal operations tool for running DriveCommand as a business.
**Depends on:** Phase 22 (support ticket management is the primary admin workflow)
**Plans:** 3 plans

Plans:
- [ ] 23-01-PLAN.md — Admin auth layer: ADMIN_SECRET_KEY env var, /admin/login page with password form (hash comparison, no rate-limit bypass — brute-force resistant), admin session stored as separate signed cookie (admin_session, 8-hour expiry), adminMiddleware guards all /admin/* routes and redirects to /admin/login if not authenticated, admin session has no tenantId (reads across all tenants using bypass_rls pattern), logout endpoint clears cookie
- [ ] 23-02-PLAN.md — Tenant management: /admin/tenants list (company name, owner email, plan, created date, truck count, driver count, active load count, status badge), tenant detail page (/admin/tenants/[id]) with all stats + recent activity + suspension controls, createTenant admin action (name, owner email, auto-generate initial Owner User, send welcome email), suspendTenant/reactivateTenant actions (set Tenant.suspended boolean, middleware blocks suspended tenant sessions), /admin/tenants/new form
- [ ] 23-03-PLAN.md — Admin dashboard and support queue: /admin home with system metrics (total tenants, total active loads today, new signups this week, open support tickets), /admin/support ticket queue showing all SupportTicket records across tenants (filterable by status/priority/tenant), ticket detail with admin reply form (creates TicketMessage with senderType=ADMIN, triggers owner email), ticket status update controls (assign priority, change status, close ticket)
