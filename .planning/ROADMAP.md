# Roadmap: DriveCommand

## Overview

DriveCommand builds from secure multi-tenant foundations through entity management (trucks, drivers, routes) to operational workflows (documents, maintenance, notifications), platform administration, and fleet intelligence. v1.0 delivered complete fleet management (phases 1-10). v2.0 added Samsara-inspired fleet intelligence with live GPS tracking, safety analytics, fuel efficiency dashboards, tag-based organization, and modern sidebar navigation — all powered by mock data with hardware-ready API contracts. v3.0 extends operational capability with route financial tracking, unified view/edit page architecture, and driver document compliance uploads. v4.0 adds carrier operations with commercial client/contract management, route templates with iCal recurrence, auto-dispatch generation, and multi-stop execution with BOL/POD enforcement. v5.0 extends DriveCommand into native iOS and Android applications via React Native + Expo — driver and owner portals rebuilt for mobile with background GPS, push notifications, offline support, document camera, and App Store/Play Store distribution.

## Milestones

- ✅ **v1.0 Fleet Management** — Phases 1-10 (shipped 2026-02-15)
- ✅ **v2.0 Samsara-Inspired Fleet Intelligence** — Phases 11-15 (shipped 2026-02-16)
- ✅ **v3.0 Route Finance & Driver Documents** — Phases 16-18 (shipped 2026-02-17)
- ✅ **v4.0 Carrier Operations** — 5 build phases + quick tasks 161-181 (shipped 2026-04-05)
- ⬜ **v5.0 DriveCommand Mobile** — Phases 29-39 (target: 9-10 weeks from kickoff)

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
| 19. Multi-Stop Routes | v4.0 | 3/3 | ✓ Complete | 2026-02-26 |
| 24. Technical Documentation | v4.0 | 2/2 | ✓ Complete | 2026-03-09 |
| 25. SysAdmin Invoicing Module | v4.0 | 3/3 | ✓ Complete | 2026-03-13 |
| 26. QA Test Scripts | v4.0 | 3/3 | ✓ Complete | 2026-03-13 |
| 27. Automated Playwright E2E Tests | v4.0 | 0/3 | �—� Planned | — |
| 28. Driver History | v4.0 | 2/2 | ✓ Complete | 2026-03-21 |
| Carrier Ops P1: DB Schema | v4.0 | —/— | ✓ Complete | 2026-04-05 |
| Carrier Ops P2: Service Layer | v4.0 | —/— | ✓ Complete | 2026-04-05 |
| Carrier Ops P3: API Routes | v4.0 | —/— | ✓ Complete | 2026-04-05 |
| Carrier Ops P4: Web UI | v4.0 | —/— | ✓ Complete | 2026-04-05 |
| Carrier Ops P5: Mobile + Tests | v4.0 | —/— | ✓ Complete | 2026-04-05 |
| 29. Monorepo Foundation + Expo Scaffold | v5.0 | 3/3 | ✓ Complete | 2026-03-22 |
| 31. Driver Core Screens | v5.0 | 3/3 | ✓ Complete | 2026-03-22 |
| 32. Driver HOS + Incident Reporting | v5.0 | 4/4 | ✓ Complete | 2026-03-23 |
| 33. Driver Native Features | v5.0 | 3/3 | ✓ Complete | 2026-03-23 |
| 34. Driver Documents + Messaging | v5.0 | 2/2 | ✓ Complete | 2026-03-25 |
| 35. Owner Core Screens | v5.0 | 3/3 | ✓ Complete | 2026-03-24 |
| 36. Owner Map + Fleet Communication | v5.0 | 3/3 | ✓ Complete | 2026-03-25 |
| 37. Polish + Performance | v5.0 | 7/7 | ✓ Complete | 2026-03-28 |
| 37.1. Driver Portal Gaps | v5.0 | 0/3 | ○ Not started | — |
| 37.2. Owner Route + Maintenance Mobile | v5.0 | 0/4 | ○ Not started | — |
| 37.3. Owner Financial Tools Mobile | v5.0 | 0/? | ○ Not started | — |
| 37.4. Owner Analytics + Support Mobile | v5.0 | 0/? | ○ Not started | — |
| 37.5. Mobile UI/UX Design Overhaul | v5.0 | 0/? | ○ Not started | — |
| 37.6. Web Auth Migration to Supabase | v5.0 | 0/? | ○ Not started | — |

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
**Plans:** 7 plans

Plans:
- [x] 19-01-PLAN.md — RouteStop model + migration SQL with RLS, Prisma schema, Zod validation, server action stop CRUD
- [x] 19-02-PLAN.md — Dispatcher UI: multi-stop editor in route form (add/remove/reorder with up/down buttons, AddressAutocomplete per stop), route detail stop timeline with status badges
- [x] 19-03-PLAN.md — Driver integration: geofence auto-arrive at next pending stop (500m radius), driver portal active stop panel, manual Mark Departed button

---

### Phase 20: Driver Pay Settlement — Automated driver compensation calculation from completed loads with settlement statements

**Goal:** Calculate driver pay automatically from completed loads based on configurable pay structures (per-mile, percentage of load rate, or flat per-load), generate itemized settlement statements covering a pay period, and link settlements to the payroll module. Eliminates manual pay calculation — dispatcher marks loads delivered, system computes what each driver is owed.
**Depends on:** Phase 19 (multi-stop loads have more complex mileage), but can run independently
**Plans:** 6 plans

Plans:
- [ ] 20-01-PLAN.md — Data model: DriverPayConfig model (driverId, payType enum PER_MILE/PERCENTAGE/FLAT, rateValue, effectiveFrom), DriverSettlement model (driverId, tenantId, periodStart, periodEnd, status DRAFT/APPROVED/PAID, totalPay Decimal), SettlementLine model (settlementId, loadId, description, miles, grossRate, payAmount), migration SQL, RLS, schema.prisma update
- [ ] 20-02-PLAN.md — Settlement engine: calculateSettlement server action (pull DELIVERED loads in period for driver, apply pay config, compute per-line pay amounts using Decimal.js, create SettlementLine records), settlement list page at /payroll/settlements, settlement detail with line-item breakdown and approve/mark-paid actions
- [ ] 20-03-PLAN.md — Settlement statement PDF: react-pdf statement with driver info, pay period, itemized load table (load number, origin→destination, miles, gross rate, pay amount), total, signature line; download button on settlement detail page; link Payroll records to settlement via settlementId FK

---

### Phase 21: QuickBooks Online Integration — OAuth2 connection and two-way sync for invoices, expenses, and settlements

**Goal:** Connect a tenant's QuickBooks Online account via OAuth2, then automatically sync DriveCommand financial records to QBO: invoices become QBO invoices (with line items and customer mapping), route expenses sync as QBO expenses, and driver settlements sync as vendor bills or journal entries. Eliminates double-entry for bookkeeping. The integration framework and TenantIntegration model already exist — this wires in the actual QBO API.
**Depends on:** Phase 20 (settlements), existing invoice/expense modules
**Plans:** 6 plans

Plans:
- [ ] 21-01-PLAN.md — OAuth2 connect flow: QBO app credentials in env vars, /api/integrations/qbo/connect initiates OAuth2 code flow (redirect to Intuit), /api/integrations/qbo/callback exchanges code for access+refresh tokens, stores encrypted tokens in TenantIntegration.configJson, connect/disconnect UI on integrations settings page with connection status badge
- [ ] 21-02-PLAN.md — Invoice sync: syncInvoiceToQBO server action (find or create QBO Customer by tenant customer name, create/update QBO Invoice with line items, store qboInvoiceId on Invoice record for idempotent re-sync), sync button on invoice detail page, sync status badge (synced / not synced / error), auto-sync trigger when invoice status changes to SENT
- [ ] 21-03-PLAN.md — Expense and settlement sync: syncExpenseToQBO (map RouteExpense to QBO Expense with category mapping), syncSettlementToQBO (map DriverSettlement to QBO Vendor Bill), token refresh middleware (auto-refresh expired access token using refresh token before any QBO API call), sync error logging to TenantIntegration.configJson.lastSyncError

---

### Phase 22: Support Ticket System — In-app support tickets for tenant owners with threaded replies and status tracking

**Goal:** Tenant owners can submit support tickets from within the owner portal (subject, description, category, priority), view ticket history, and receive replies in-thread. The DriveCommand team manages all tickets from the super-admin portal (Phase 23). Email notifications alert the owner on reply and the DriveCommand team on new ticket submission. Replaces ad-hoc email support with a trackable, in-product support channel.
**Depends on:** None (standalone module)
**Plans:** 6 plans

Plans:
- [x] 22-01-PLAN.md — Extension migration: add SupportTicketCategory/Priority/TicketMessageSenderType enums, WAITING_ON_CUSTOMER status value, category+priority columns to SupportTicket (drop type column), create TicketMessage table with FK to SupportTicket, update prisma/schema.prisma
- [x] 22-02-PLAN.md — Owner portal: update createSupportTicket action (category+priority), add getTicketById+addOwnerReply actions, update support modal to use category+priority, update /support list page with clickable cards, new /support/[id] ticket detail page with message thread + reply form, email to DriveCommand team on new ticket and owner reply
- [x] 22-03-PLAN.md — Admin reply + lifecycle: addAdminReply server action (TicketMessage senderType=ADMIN), admin reply UI in ticket-list.tsx, owner email notification on admin reply, getUnreadAdminReplyCount for sidebar badge, auto-close cron /api/cron/auto-close-tickets (closes RESOLVED tickets older than 7 days), vercel.json cron entry

---

### Phase 23: System Admin Portal — Super-admin interface for the DriveCommand team to manage all tenants

**Goal:** A fully separate super-admin portal at /admin/* accessible only to DriveCommand team members via a hardcoded ADMIN_SECRET_KEY environment variable (not the tenant session system). Provides tenant list with key metrics, ability to create new tenants directly (bypassing the self-signup flow), suspend/reactivate tenants, view tenant details, and manage support tickets (Phase 22) across all tenants. This is the internal operations tool for running DriveCommand as a business.
**Depends on:** Phase 22 (support ticket management is the primary admin workflow)
**Plans:** 6 plans

Plans:
- [x] 23-01-PLAN.md — Admin auth layer: ADMIN_SECRET_KEY env var, /admin/login page with password form (hash comparison, no rate-limit bypass — brute-force resistant), admin session stored as separate signed cookie (admin_session, 8-hour expiry), adminMiddleware guards all /admin/* routes and redirects to /admin/login if not authenticated, admin session has no tenantId (reads across all tenants using bypass_rls pattern), logout endpoint clears cookie
- [x] 23-02-PLAN.md — Tenant management: /admin/tenants list (company name, owner email, plan, created date, truck count, driver count, active load count, status badge), tenant detail page (/admin/tenants/[id]) with all stats + recent activity + suspension controls, createTenant admin action (name, owner email, auto-generate initial Owner User, send welcome email), suspendTenant/reactivateTenant actions (set Tenant.suspended boolean, middleware blocks suspended tenant sessions), /admin/tenants/new form
- [x] 23-03-PLAN.md — Admin dashboard and support queue: /admin home with system metrics (total tenants, total active loads today, new signups this week, open support tickets), /admin/support ticket queue showing all SupportTicket records across tenants (filterable by status/priority/tenant), ticket detail with admin reply form (creates TicketMessage with senderType=ADMIN, triggers owner email), ticket status update controls (assign priority, change status, close ticket)

---

### Phase 24: Technical Documentation — Comprehensive developer documentation for architecture, setup, and codebase

**Goal:** Produce a complete set of developer documentation in a /docs folder covering system architecture, technology stack, multi-tenancy design, authentication flows, database schema, major modules, local development setup, environment configuration, deployment, and email. Written as markdown files so they live with the code and can be shared via Notion or GitHub. A developer unfamiliar with the project can install and run the app using only these docs.
**Depends on:** None (documentation of existing system)
**Plans:** 2 plans

Plans:
- [ ] 24-01-PLAN.md — Core docs: docs/README.md (overview + table of contents), docs/architecture.md (system design, three portals, multi-tenancy, RLS, middleware flow), docs/auth.md (session cookie auth, role-based access, isSystemAdmin, driver/owner/sysadmin flows), docs/database.md (schema overview, Prisma usage, RLS policies, migrations, bypass_rls pattern)
- [ ] 24-02-PLAN.md — Operational docs: docs/stack.md (Next.js App Router, Prisma, Supabase, Tailwind, shadcn/ui, Nodemailer, Zod), docs/modules.md (trucks, drivers, routes, loads, invoices, payroll, CRM, support tickets, admin portal — each module purpose and key files), docs/setup.md (clone, install, env vars, database setup, local dev), docs/deployment.md (Vercel setup, env vars, cron jobs, deploying with npx vercel --prod), docs/email.md (Gmail SMTP, Nodemailer, email templates, notification flows)

---

### Phase 25: SysAdmin Invoicing Module — Per-tenant billing management from the admin portal

**Goal:** Enable DriveCommand to bill tenants directly from the sysadmin portal. Admin can create invoices for any tenant (subscription fees, setup fees, etc.), set line items, amount, and due date, and send the invoice via email to the tenant owner. Admins can track payment status (unpaid/paid/overdue), mark invoices as paid, and view billing history per tenant on the tenant detail page. This is DriveCommand's own billing system, separate from the invoice module tenants use for their customers.
**Depends on:** Phase 23 (sysadmin portal)
**Plans:** 6 plans

Plans:
- [ ] 25-01-PLAN.md — Data layer: SysAdminInvoice + SysAdminInvoiceItem models, migration SQL with RLS, generateInvoiceNumber (SINV-XXXX), all server actions (CRUD + markPaid + void + archive + markOverdueInvoices)
- [ ] 25-02-PLAN.md — Admin invoice UI: /billing list page with summary stats, /billing/new form (tenant select, line items, due date), /billing/[id] detail page, /billing/[id]/edit page, Billing nav link in layout, billing history section on /tenants/[id]
- [ ] 25-03-PLAN.md — Email + overdue: SysAdminInvoiceEmail React Email template, send-sysadmin-invoice.ts helper, sendInvoiceAction (DRAFT to SENT + email), /api/cron/mark-overdue-invoices route, vercel.json cron registration

---

### Phase 26: QA Test Scripts — Written manual test documentation covering all three portals

**Goal:** Produce step-by-step manual QA test scripts (markdown files in docs/qa/) covering every major feature across all three portals. Coworkers follow these scripts to manually test the app. Each test case specifies preconditions, numbered steps with exact field values, expected results, and Pass/Fail checkboxes. Includes a smoke test section per portal and a README with test environment setup instructions.
**Depends on:** Phase 25 (all features complete before QA scripts are written)
**Plans:** 6 plans

Plans:
- [ ] 26-01-PLAN.md — SysAdmin portal test scripts: docs/qa/sysadmin-tests.md covering auth (ADMIN_SECRET_KEY), dashboard, tenant management (create/suspend/reactivate), support ticket queue, and billing/invoicing lifecycle (DRAFT→SENT→PAID→VOID) — ~50 test cases with smoke tests
- [ ] 26-02-PLAN.md — Owner portal test scripts: docs/qa/owner-tests.md covering auth, dashboard, trucks, drivers, routes, loads/dispatch (full PENDING→DISPATCHED→DELIVERED→INVOICED lifecycle), invoices, payroll, CRM, compliance, finance analytics, AI documents, settings — ~100 test cases with smoke tests
- [ ] 26-03-PLAN.md — Driver portal + README: docs/qa/driver-tests.md covering auth, my-route (read-only), my-load status advancement, HOS logging, incidents, messages, support tickets, access boundary tests; plus docs/qa/README.md with test environment setup, test account creation guide, seed data sequence, and portal login quick reference

---

### Phase 28: Driver History — View completed loads and routes in the driver portal

**Goal:** Drivers can view their previously completed loads and routes from within the driver portal. The Load tab and Route tab (or a History tab) surfaces DELIVERED loads and completed routes scoped to the logged-in driver — read-only, with full detail views. Allows drivers to reference past deliveries for disputes, pay questions, or general record-keeping without needing to contact a dispatcher.
**Depends on:** Phase 7 (driver portal), Phase 19 (multi-stop routes)
**Plans:** 2 plans

Plans:
- [ ] 28-01-PLAN.md — Data layer: getMyCompletedLoads() and getMyCompletedRoutes() server actions appended to existing action files (DELIVERED/INVOICED loads + COMPLETED routes, driverId-scoped, most-recent-first)
- [ ] 28-02-PLAN.md — Driver portal UI: CompletedLoadHistory + CompletedRouteHistory client components, expandable inline cards, wired into /my-load and /my-route pages, human verification checkpoint

---

### Phase 27: Automated Playwright E2E Tests — Full browser automation suite covering all three portals

**Goal:** Implement a complete Playwright end-to-end test suite covering all three portals (SysAdmin, Owner/Manager, Driver) and all critical user flows. Auth fixtures for all 3 roles eliminate per-test login overhead. Builds on existing e2e/tkt-fixes.spec.ts. App is considered production-ready when the full suite passes with a clean HTML report.
**Depends on:** Phase 26 (QA Test Scripts serve as source of truth for what to automate)
**Plans:** 6 plans

Plans:
- [ ] 27-01-PLAN.md — Playwright setup + auth fixtures + SysAdmin tests: playwright.config.ts, e2e/fixtures/ with storageState for sysadmin/owner/driver roles, e2e/sysadmin/ tests covering login, dashboard, tenant CRUD, support tickets, invoicing lifecycle
- [ ] 27-02-PLAN.md — Owner portal tests: e2e/owner/ covering dashboard, trucks CRUD, drivers CRUD, full load/dispatch lifecycle (PENDING→DISPATCHED→DELIVERED→INVOICED), route finance, document uploads
- [ ] 27-03-PLAN.md — Driver portal tests + CI config: e2e/driver/ covering login, load status view, document access, access boundary tests; GitHub Actions workflow (.github/workflows/playwright.yml); e2e/README.md with run instructions; production readiness sign-off
- [ ] 27-04-PLAN.md — Carrier dashboard + fleet tests: e2e/carrier/dashboard.spec.ts (page load, KPI, quick actions, nav, auth boundary) + e2e/carrier/fleet.spec.ts (driver and truck list, create, edit, form validation)
- [ ] 27-05-PLAN.md — Carrier dispatches + loads + clients/contracts tests: e2e/carrier/dispatches.spec.ts (list, create-via-url-param, detail panels) + e2e/carrier/loads.spec.ts (list, create, edit) + e2e/carrier/clients.spec.ts (client and contract CRUD)
- [ ] 27-06-PLAN.md — Carrier facilities + templates + reports + access boundary tests: e2e/carrier/facilities.spec.ts + e2e/carrier/reports.spec.ts (all 4 reports + mark-as-paid) + e2e/carrier/access.spec.ts (driver blocked, unauthenticated blocked, owner allowed)

---

## v5.0 DriveCommand Mobile — Phases 29-39

**Milestone Goal:** Extend DriveCommand into production-ready native iOS and Android apps via React Native + Expo. Driver and owner portals delivered as separate tab-navigated experiences. Backend unchanged — all existing Next.js API routes serve as the mobile backend. No sysadmin portal on mobile. Target: App Store + Google Play live within 9-10 weeks of kickoff.

**Architecture:** Turborepo monorepo (apps/web + apps/mobile + packages/). React Native 0.76 New Architecture. Expo SDK 52 + Expo Router v4. NativeWind v4. EAS Build + EAS Update.

---

### ✅ Phase 29: Monorepo Foundation + Expo Scaffold — Convert to Turborepo, extract shared packages, scaffold Expo app with NativeWind and EAS (complete 2026-03-22)

**Goal:** Transform the existing single Next.js repo into a Turborepo monorepo. Move the web app to apps/web. Extract shared TypeScript types and Zod validation schemas into packages/ that both web and mobile import. Scaffold the Expo app at apps/mobile with Expo Router, NativeWind v4, and EAS configuration. Running `npx expo start` in apps/mobile produces a working blank app on a physical device.
**Depends on:** None (additive — web app untouched, just moved/restructured)
**Plans:** 6 plans

Plans:
- [x] 29-01-PLAN.md — Turborepo setup: root package.json with workspaces, turbo.json pipeline (build/lint/test tasks), move existing Next.js app into apps/web/, update all internal import paths, verify `turbo run build` succeeds for apps/web
- [x] 29-02-PLAN.md — Expo scaffold: create apps/mobile/ with Expo SDK 52, Expo Router v4 file-based routing, NativeWind v4 + Tailwind config, app.json (bundle ID com.drivecommand.app, version 1.0.0), .eas.json with development/preview/production profiles, first `npx expo start` boots successfully on physical device
- [x] 29-03-PLAN.md — Shared packages: packages/types/ (TypeScript interfaces for Truck, Driver, Load, Route, User, Tenant), packages/validation/ (move src/lib/validations/* here, import in both apps/web and apps/mobile), packages/api-client/ (typed fetch wrapper with Bearer token auth targeting EXPO_PUBLIC_API_URL, mirrors all server actions as REST calls)

---

### Phase 30: Mobile Auth + Navigation Shell — JWT login flow, MMKV token storage, role-based tab navigators for driver and owner

**Goal:** Build the complete auth system for mobile: login screen UI, JWT token extraction from the existing /api/auth/login endpoint (already returns token in JSON), secure storage in MMKV with optional biometric protection, auth guard in the root layout, and role-based routing so drivers land in the driver tab navigator and owners land in the owner tab navigator. Both navigators are scaffolded with placeholder screens.
**Depends on:** Phase 29 (Expo app exists)
**Plans:** 2 plans

Plans:
- [ ] 30-01-PLAN.md — Auth flow: login screen (email + password, DriveCommand branding), POST to /api/auth/login and extract JWT + user role from JSON response, store token + user in MMKV (react-native-mmkv), useAuth hook (read/write/clear), root _layout.tsx auth guard (redirect to /login if no token, redirect to role portal if authenticated), logout action clears MMKV + navigates to login, /api/auth/me endpoint called on app foreground to validate token freshness
- [ ] 30-02-PLAN.md — Navigation shell: (driver) tab navigator with 5 tabs (Dashboard, Loads, HOS, Messages, Documents) each with placeholder screen + correct Lucide icon; (owner) tab navigator with 5 tabs (Dashboard, Map, Loads, Drivers, Fleet) each with placeholder screen + correct icon; shared UI primitives (Button, Card, Badge, LoadingSpinner, EmptyState) built with NativeWind; safe area handling; keyboard dismiss on tap outside

---

### ✅ Phase 31: Driver Core Screens — Dashboard, loads list, load detail, and status update flow (complete 2026-03-22)

**Goal:** Build the primary screens a driver uses daily: a dashboard showing active load summary and today's snapshot, a loads list with active and completed tabs, a load detail screen with multi-stop timeline, and the status update flow (accept → en route → delivered) with confirmation and haptic feedback.
**Depends on:** Phase 30 (driver navigation shell)
**Plans:** 6 plans

Plans:
- [x] 31-01-PLAN.md — Bearer token validator (validateMobileToken) + 4 REST endpoints: dashboard, loads list (active/history), load detail with stops/truck/customer, status update with transition validation
- [x] 31-02-PLAN.md — api-client driverApi (4 methods), TanStack Query QueryProvider (staleTime 30s), driver dashboard screen (active load card, 3 stat chips, alerts, pull-to-refresh)
- [x] 31-03-PLAN.md — Loads list (FlashList, Active/History tabs, LoadCard), load detail (info grid, stop timeline, truck info), StatusUpdateButton (confirmation Modal, haptic success, toast errors)

---

### ✅ Phase 32: Driver HOS + Incident Reporting — Duty status logging and incident report submission with photo capture (complete 2026-03-23)

**Goal:** Build the HOS (Hours of Service) logging screen where drivers change duty status (Off Duty / Sleeper Berth / Driving / On Duty) and view their daily log summary with 14-hour clock. Build the incident reporting screen where drivers submit an incident report with category, description, location (GPS auto-attached), and optional photo evidence using the device camera.
**Depends on:** Phase 31 (driver screens established)
**Plans:** 4 plans

Plans:
- [x] 32-01-PLAN.md — DB schema: add DriverHOSEntry + DriverIncident Prisma models, enums, migration, type updates
- [x] 32-02-PLAN.md — HOS backend: GET + POST /api/mobile/driver/hos endpoints, api-client HOS + incident methods
- [x] 32-03-PLAN.md — HOS frontend: HOSStatusCard, HOSDayBar, HOSClock components + main HOS screen with status change confirmation
- [x] 32-04-PLAN.md — Incident reporting: POST /api/mobile/driver/incidents endpoint, SeverityToggle, IncidentPhotoCapture, photo upload utility, incident form screen, dashboard entry point

---

### Phase 33: Driver Native Features — Background GPS reporting, push notifications, and offline mutation queue ✓ COMPLETE (2026-03-23)

**Goal:** Implement the three core native capabilities that make the driver app indispensable: background GPS reporting to the existing /api/gps/report endpoint (runs even when app is backgrounded), push notifications for dispatch alerts and HOS warnings via FCM/APNs, and an offline mutation queue that buffers status updates and HOS entries when the driver has no signal and flushes them automatically on reconnect.
**Depends on:** Phase 31 (load status updates exist to queue), Phase 32 (HOS entries exist to queue)
**Plans:** 6 plans

Plans:
- [x] 33-01-PLAN.md — Background GPS: expo-location background location task (BACKGROUND_LOCATION_TASK), permission request flow (foreground then background, explain why), report interval 30s on-duty / 5min off-duty based on current HOS status, POST to /api/gps/report with driver tracking token (existing token system), battery-aware: reduce frequency when battery < 20%, GPS status indicator in driver dashboard header (green dot = active, grey = paused)
- [x] 33-02-PLAN.md — Push notifications: Expo Notifications setup, request permissions on first launch with explanation modal, register FCM (Android) + APNs (iOS) token, POST token to new /api/push-tokens endpoint (upsert by userId + platform), add /api/push-tokens route to web app (stores in new PushToken table with userId/token/platform/updatedAt), send test notification from owner fleet messaging triggers driver push; notification tap deep-links to relevant screen (load detail, message thread)
- [x] 33-03-PLAN.md — Offline queue: MMKV-backed PendingMutation queue (type, payload, timestamp, retryCount), NetInfo listener (reconnect triggers flush), flushQueue processes mutations in order (max 3 retries each, exponential backoff), queue drains via api-client with Bearer token, sync status bar component (shows "X updates pending" when offline, "Syncing..." when flushing, disappears when clear), wrap updateLoadStatus + createHOSEntry + createDriverIncident calls with enqueue-or-execute logic

---

### Phase 34: Driver Documents + Messaging — Document viewer with upload and driver messaging thread

**Goal:** Build the documents screen where drivers can view their compliance documents (license, medical card, etc.) with expiry status, upload new documents using the device file picker or camera, and view upload progress. Build the messaging screen where drivers can view and reply to fleet messages from their owner/dispatcher, with push notification badge counts on the tab icon.
**Depends on:** Phase 33 (push notifications for message badges)
**Plans:** 2 plans

Plans:
- [ ] 34-01-PLAN.md — Documents screen: FlashList of driver documents from getMyDriverDocuments (name, type, expiry date, status badge: valid/expiring/expired color-coded), document detail bottom sheet (full details + download link via presigned S3 URL), upload FAB → bottom sheet with two options (Pick File via expo-document-picker, Take Photo via expo-camera), selected file preview, upload progress bar using existing multipart S3 API (/api/documents/multipart/*), success toast + list refresh
- [ ] 34-02-PLAN.md — Driver messaging: message thread list (FlashList, each row shows sender, preview, timestamp, unread badge), conversation detail screen (FlatList of messages, inverted, auto-scroll to bottom), send message input (TextInput + send button, KeyboardAvoidingView), poll for new messages every 10s when screen focused, unread count badge on Messages tab icon (from getUnreadMessageCount), calls existing driver-messages server actions; mark as read on open

---

### ✅ Phase 35: Owner Core Screens — Dashboard KPIs, loads management, and driver management (complete 2026-03-24)

**Goal:** Build the three primary owner screens: a dashboard with at-a-glance fleet KPIs, a loads management screen where owners can view all loads and create new ones, and a driver management screen showing driver status and compliance at a glance.
**Depends on:** Phase 30 (owner navigation shell)
**Plans:** 6 plans

Plans:
- [x] 35-01-PLAN.md — Owner dashboard: KPI cards row (active loads count, drivers on duty, revenue this month, open alerts), active loads mini-list (top 5, each showing driver name + route + status badge), driver status grid (all drivers, colored dot for on-duty/off-duty/no-load), recent alerts list (maintenance due, expiring documents, incidents); calls existing getDashboardData + getActiveLoads actions via api-client; pull-to-refresh; skeleton loaders
- [x] 35-02-PLAN.md — Loads management: FlashList with status filter tabs (All / Active / Pending / Delivered), each load card (load number, customer, origin→destination, driver name, status badge, rate), FAB → create load bottom sheet (customer select, origin, destination, pickup date, rate, assign driver select), load detail screen (full load info + stop timeline + status update controls for owner), calls existing load server actions
- [x] 35-03-PLAN.md — Driver management: FlashList of all drivers (avatar initials, name, status badge, assigned load if active, compliance indicator), driver detail screen (contact info, current load, document compliance summary with expiry alerts, HOS current status), quick actions: send message button (navigates to fleet messaging), call button (tel: deep link), compliance badges (green/yellow/red per document category); calls existing getDrivers + getDriverById actions

---

### Phase 36: Owner Map + Fleet Communication — Live map with vehicle markers and fleet messaging ✅ 2026-03-25

**Goal:** Build the live map screen showing all vehicles as positioned markers using react-native-maps (replaces Leaflet which is web-only), with tap-to-select vehicle detail. Build the fleet communication screen where owners compose and send messages to individual drivers or broadcast to all drivers, with delivery status tracking.
**Depends on:** Phase 35 (owner screens established)
**Plans:** 6 plans

Plans:
- [x] 36-01-PLAN.md — Live map: full-screen MapView with status-colored VehicleMarker components, VehicleDetailSheet bottom sheet, 60s auto-refresh, fitToCoordinates on load, dark Google Maps style on Android
- [x] 36-02a-PLAN.md — Fleet messaging backend: FleetMessage schema (recipientId, isBroadcast), GET/POST endpoints with push notifications, typed api-client methods
- [x] 36-02b-PLAN.md — Fleet messaging UI: RecipientSelector bottom sheet, compose/history toggle, character counter, pre-select driver via navigation param

---

### Phase 37: Polish + Performance — Touch targets, animations, dark mode, and FlashList everywhere — IN PROGRESS

**Goal:** Full design and performance pass across both portals. Audit every interactive element for minimum 48px touch targets. Replace all FlatList/ScrollView lists with FlashList. Add React Native Reanimated transitions between screens and Haptics on all state-changing actions. Implement system dark mode detection with NativeWind dark: variants. Add skeleton loaders to every data-fetching screen. Ensure the app feels native and polished on both iOS and Android.
**Depends on:** Phases 31-36 (all screens built)
**Plans:** 7 plans

Plans:
- [x] 37-01-PLAN.md — Touch targets, FlashList audit, skeleton loaders
- [x] 37-02-PLAN.md — Animations, haptics, dark mode
- [x] 37-03-PLAN.md — Thumb-friendliness, tab labels, brand fixes
- [ ] 37-04-PLAN.md — NativeWind migration (login + owner secondary screens + map.tsx AnimatedScreen)
- [ ] 37-05-PLAN.md — Skeleton loaders (owner portal + load detail + fleet.tsx messages)
- [ ] 37-06-PLAN.md — Accessibility labels (FABs, back buttons, KPI cards)
- [ ] 37-07-PLAN.md — Form validation standardization (border-red-500 + text-red-500)

---

### Phase 37.1: Driver Portal Gaps — My Route screen and driver support tickets

**Goal:** Close the two remaining gaps in the driver mobile portal. Build the My Route screen showing the driver's currently assigned route with full multi-stop timeline, route details, and status context. Build the driver support ticket FAB: persistent floating action button on all mobile screens that opens a submit-only support ticket form (category, priority, title, description).
**Depends on:** Phase 37 (driver portal polished)
**Plans:** 3 plans

Plans:
- [ ] 37.1-01-PLAN.md — My Route API endpoints + RouteCard + timeline components
- [ ] 37.1-02-PLAN.md — My Route detail screen (loads timeline, route details, route messages)
- [ ] 37.1-03-PLAN.md — Support Ticket FAB + bottom sheet form + API endpoint



---

### Phase 37.1.1: Data Pipeline: Routes, Loads, and Stops (INSERTED)

**Goal:** Fix the broken data pipeline between Routes, Loads, and RouteStops so the driver map has real coordinates — schema changes to link stops to loads, Nominatim geocoding on load save, auto-creation of RouteStops when a load is assigned to a route, and SQL backfill for existing routes.
**Depends on:** Phase 37.1
**Plans:** 2 plans

Plans:
- [ ] 37.1.1-01-PLAN.md — Prisma schema migration (RouteStop + Load field additions) with SQL backfill
- [ ] 37.1.1-02-PLAN.md — Geocode utility extraction, RouteStop sync library, wire into all load mutation paths

### Phase 37.1.2: Invoicing: Trucking Standard (INSERTED)

**Goal:** Align invoicing with trucking industry standards — add freight reference fields to Invoice, itemType/unitType enums to InvoiceItem for standard trucking charges, update invoice UI for freight-standard line item entry with FSC auto-calculation.
**Depends on:** Phase 37.1.1
**Plans:** 2 plans

Plans:
- [ ] 37.1.2-01-PLAN.md — Schema migration (enums + freight fields) + validation + server action PERCENT fix
- [ ] 37.1.2-02-PLAN.md — Invoice UI: Freight Details section, type/unit selectors, FSC logic, quick-add buttons, detail page

### Phase 37.2: Owner Route + Maintenance Mobile — Route management and truck maintenance on mobile

**Goal:** Bring route management and truck maintenance to the owner mobile portal. Route management: list all routes, view route detail (stops, assigned driver/truck, status), create new route, edit existing route. Truck maintenance: view service history per truck, log a new service event (date, type, mileage, notes), schedule upcoming service with due date/mileage trigger.
**Depends on:** Phase 37.1
**Plans:** 4 plans

Plans:
- [ ] 37.2-01-PLAN.md — Route creation API + collapsible status list redesign
- [ ] 37.2-02-PLAN.md — ScheduledService CRUD API + maintenance constants
- [ ] 37.2-03-PLAN.md — Multi-step route creation form screen
- [ ] 37.2-04-PLAN.md — Maintenance UI: top-level screen, truck detail enhancements, truck list badges

---

### Phase 37.3: Owner Financial Tools Mobile — Fuel tracking and expense settings

**Goal:** Add fuel tracking and expense configuration to the owner mobile portal. Fuel tracking: log fuel fill-ups (truck, gallons, cost, odometer, location), view fuel history with cost-per-mile stats. Expense settings: manage expense categories (create/edit/delete) and expense templates (reusable line-item sets for common expense patterns).
**Depends on:** Phase 37.2
**Plans:** TBD

Plans:
- [ ] TBD

---

### Phase 37.4: Owner Analytics + Support Mobile — Safety metrics, profit predictor, and support tickets

**Goal:** Port the remaining owner portal features to mobile. Safety metrics: safety score overview, recent safety events, driver safety rankings. Profit predictor: revenue forecast inputs and output summary. Owner support tickets: same flow as driver (list, detail with thread, submit new ticket).
**Depends on:** Phase 37.3
**Plans:** TBD

Plans:
- [ ] TBD

---

### Phase 37.5: Mobile UI/UX Design Overhaul — Layout, color, typography, and visual polish across both portals

**Goal:** Full design overhaul of both driver and owner mobile portals. Audit and improve layout structure, color palette, typography, spacing, and component consistency. Establish a cohesive visual identity across all screens. Target: the app looks and feels premium — something drivers are proud to use and owners trust as a professional tool.
**Depends on:** Phase 37.4 (all screens built before design pass)
**Plans:** TBD

Plans:
- [ ] TBD

---

### Phase 37.6: Web Auth Migration to Supabase — Migrate web authentication from custom AES-256-GCM session cookies to Supabase Auth, unifying web and mobile onto a single auth system

**Goal:** Replace the custom AES-256-GCM encrypted session cookie system in the web app with Supabase Auth, so both web and mobile use the same authentication provider. This eliminates dual auth maintenance, unifies token handling, and establishes a single security surface before App Store launch. All three portals (Owner, Driver, SysAdmin) must continue to work correctly after migration.
**Depends on:** Phase 37.5 (all mobile screens stable)
**Plans:** 2 plans

Plans:
- [ ] 37.6-01-PLAN.md — Security hardening: move claims from user_metadata to app_metadata + cleanup
- [ ] 37.6-02-PLAN.md — Consolidate auth helpers into supabase.ts + update 70 import paths + build verification

---

### Phase 37.7: Driver Map + Navigation Screen — Mapbox map with live location, OSRM route polyline, and one-tap navigation ✓ COMPLETE (2026-04-04)

**Goal:** Add a Map screen to the driver mobile portal showing the driver's live location and their active load route as a drawn polyline. Restructure driver tab bar to 5 tabs + More. Auto-redirect to Map tab and open the driver's preferred navigation app when a load is started.
**Depends on:** Phase 37.6 (auth stable)
**Plans:** 6 plans

Plans:
- [x] 37.7-01-PLAN.md — Install @rnmapbox/maps, remove react-native-maps, initialize Mapbox token, iOS infoPlist nav app schemes
- [x] 37.7-02-PLAN.md — Backend: /api/geocoding/directions OSRM proxy, getOSRMDirections utility, driverApi.getDirections, RouteStop lat/lng
- [x] 37.7-03-PLAN.md — Tab bar restructure (Dashboard, Loads, Map, Messages, More), map.tsx stub, more/ stack + index
- [x] 37.7-04-PLAN.md — Map screen: MapView + UserLocation + ShapeSource/LineLayer polyline + MarkerView stops + info panel
- [x] 37.7-05-PLAN.md — Auto-redirect + nav deep links: StatusUpdateButton wiring, openNavigation utility, nav-settings.tsx preference screen
- [x] 37.7-06-PLAN.md — Architecture docs update + EAS dev build checkpoint


---

### Phase 38: EAS Build Pipeline + CI/CD + Beta Distribution — Code signing, GitHub Actions, TestFlight, and Google Play Internal Track

**Goal:** Set up the complete build and distribution infrastructure: EAS code signing for both platforms, GitHub Actions workflows for automated lint/test/build/deploy, TestFlight external beta for iOS, and Google Play Internal Track + open testing for Android. At the end of this phase, any push to main automatically ships an OTA update to beta testers, and tagged releases trigger full native builds submitted to stores.
**Depends on:** Phase 37 (all screens polished and stable)
**Plans:** 6 plans

Plans:
- [ ] 38-01-PLAN.md — EAS build setup: eas.json with development (simulator + device, debug), preview (internal distribution, production JS), production (App Store/Play Store submission) profiles; iOS code signing: Apple Developer account credentials in EAS secrets, auto-managed provisioning profiles; Android signing: generate upload keystore, store in EAS secrets; run first production build for both platforms (eas build --platform all --profile production); verify .ipa and .aab are generated without errors
- [ ] 38-02-PLAN.md — GitHub Actions CI/CD: .github/workflows/mobile-ci.yml (on PR: turbo lint + type-check + vitest, then eas build --profile preview for QR code comment on PR); .github/workflows/mobile-deploy.yml (on push to main: eas update --branch production for OTA JS push to all installed apps, no app store review needed for JS-only changes); .github/workflows/mobile-release.yml (on tag v*: eas build --profile production + eas submit for both platforms)
- [ ] 38-03-PLAN.md — Beta distribution: TestFlight external testing group setup (add beta testers by email, 90-day expiry auto-renewal), Google Play Internal Track upload + promote to Open Testing track (14-day mandatory period — must be started by Week 7), internal testing checklist (GPS background on physical device, push notifications end-to-end, camera document upload, offline queue flush, both portals full walkthrough, dark mode, both iOS and Android), document any bugs found and fix before store submission

---

### Phase 39: App Store Submission + Launch — Store assets, listings, submission, review, and staged rollout

**Goal:** Prepare all store assets (icon, screenshots, descriptions, privacy policy), submit to both App Store and Google Play, manage review feedback, and execute a staged rollout. App is live on both stores with a 1.0.0 production release. Includes a rejection response playbook so review issues are resolved within 24 hours.
**Depends on:** Phase 38 (production builds exist, beta testing complete)
**Plans:** 6 plans

Plans:
- [ ] 39-01-PLAN.md — Store assets: app icon 1024�—1024 (DriveCommand logo, no alpha, no rounded corners — stores apply their own mask); splash screen 2732�—2732; iPhone screenshots: 6.7" (iPhone 16 Pro Max) and 6.5" (iPhone 14 Plus) — 5 screenshots each showing login, driver dashboard, load detail, map, owner dashboard; iPad 12.9" screenshots (required for universal app); Android feature graphic 1024�—500; all screenshots show realistic data (use seed data), no placeholder text
- [ ] 39-02-PLAN.md — Store listings: App Store Connect (app name "DriveCommand", subtitle "Fleet Management for Truckers", description, keywords: fleet management/trucking/dispatch/driver app/logistics, support URL, privacy policy URL, category: Business, age rating: 4+, export compliance: No); Google Play Console (title, short description 80 chars, full description, content rating questionnaire, data safety section declaring location collection, app category: Business); both stores: privacy policy must be live at a public URL before submission
- [ ] 39-03-PLAN.md — Submission + launch: iOS submit via `eas submit --platform ios --profile production`, select build, submit to App Store review; Android submit via `eas submit --platform android --profile production`, promote from Internal to Production with 10% staged rollout; rejection playbook (common rejections: background location justification, missing privacy policy, demo account required — prepare demo credentials for reviewers); post-approval: 10% → 50% → 100% rollout over 3 days; announce launch, monitor crash reports via Expo crash reporting

---

### Phase 41: Supabase Auth Migration — Replace custom bcrypt/JWT session system with Supabase Auth

**Goal:** Migrate all authentication from the current custom bcrypt password hashing + AES-256-GCM encrypted cookie session system to Supabase Auth. Web login/logout/session, mobile Bearer token auth, driver/owner invitation flows, and password management all move to Supabase Auth. The existing User table and multi-tenant RLS structure is preserved — Supabase Auth users are linked to the existing User records via the auth.users UUID. Both web and mobile apps are updated to use Supabase Auth tokens.
**Depends on:** Supabase project active (oqdhberkghtnszrkdvfm), Phase 30 (mobile auth exists)
**Plans:** TBD (after context + planning)

Plans:
- [ ] TBD

---

## v7.0 Checklists & Workflows

**Milestone Goal:** Build the Workflow Template Engine — a configurable checklist system that lets carriers define reusable playbooks (driver onboarding, vehicle inspections, partner setup), automatically assign them when real-world events happen, and block dispatch until required steps are complete. Replaces spreadsheets, paper DVIRs, and tribal knowledge.

**Spec:** `docs/specs/workflow-engine.md` (source of truth for all implementation details)

---

### Phase 42: Workflow Engine 1 — Foundation — Playbook Builder, Step Library, and starter seed data

**Goal:** Build the template creation layer. Admin creates Playbooks, adds Steps from a library, configures categories, and saves. Seed 3 starter playbooks for new tenants. No runtime, no triggers, no mobile. At the end of this phase, an admin can open Checklists & Workflows from the sidebar and build a functional Pre-Trip Inspection checklist in under 10 minutes.
**Depends on:** None (new feature, additive)
**Plans:** 7 plans

Plans:
- [x] 42-01-PLAN.md — Prisma schema (StepTemplate, Playbook, PlaybookStep + 5 enums) + migration SQL with RLS + idempotent seedStarterPlaybooks + post-migrate hook backfilling all tenants
- [x] 42-02-PLAN.md — Zod validation schemas in packages/validation/src/workflows/ (enums, stepTemplate, playbook including addStep / reorderSteps)
- [x] 42-03-PLAN.md — tRPC v11 foundation: install packages, createTRPCContext wired to Supabase session, tenantMemberProcedure + adminProcedure, App Router fetch handler at /api/trpc, client provider scoped to (owner)/layout.tsx only
- [x] 42-04-PLAN.md — stepTemplate router (list/getById/create/update/delete) + playbook router (list/getById/create/update/delete/addStep/removeStep/reorderSteps/updateStep) + reorderPlaybookSteps transactional service
- [x] 42-05-PLAN.md — Sidebar 'Workflows' group with 'Checklists & Workflows' link + /checklists dashboard (PlaybookCard grid, entity-type filter tabs, CreatePlaybookDialog redirecting to builder)
- [x] 42-06-PLAN.md — Playbook Builder: 3-column page with DnD canvas (5 phase sections), StepLibraryPanel with drag-to-add + New Step Template dialog, StepDetailEditor supporting all 8 step types (FORM_FILL + INSPECTION_ITEM full editors, other 6 simpler)
- [x] 42-07-PLAN.md — Naming lint Vitest test (spec Section 3) + human-verify checkpoint: admin builds a Pre-Trip Inspection in under 10 minutes

---

### Phase 43: Workflow Engine 2 — Execution — Active Checklists, step completion, and dispatch readiness

**Goal:** Build the runtime layer. Dispatchers manually create Active Checklists from Playbooks, drivers complete non-inspection steps on mobile (document upload, form fill, signature, training ack). `isDispatchReady` surfaced on driver profile. Active Work Board swimlanes appear on the dashboard. Dispatch enforcement not yet wired — readiness is surfaced but not blocking.
**Depends on:** Phase 42 (Playbook templates must exist)
**Plans:** 7 plans

Plans:
- [ ] 43-01-PLAN.md — Prisma schema: PlaybookInstance, StepInstance, PlaybookNotification, enums, isDispatchReady fields, RLS policies
- [ ] 43-02-PLAN.md — Zod validation schemas for instance and stepInstance inputs
- [ ] 43-03-PLAN.md — Service layer (generatePlaybookInstance, computeDispatchReadiness, completeStep, skipStep) + tRPC routers (instance, stepInstance)
- [ ] 43-04-PLAN.md — Active Work Board swimlanes on /checklists dashboard + Active Checklist Detail screen
- [ ] 43-05-PLAN.md — Checklists tabs on Driver/Vehicle/Partner profiles + isDispatchReady badge + mobile REST API endpoints + fireEvent TODOs
- [ ] 43-06-PLAN.md — Mobile: Tasks tab + My Tasks screen + DocumentUpload/FormFill/Signature screens
- [ ] 43-07-PLAN.md — Tests: snapshot immutability, readiness, completeStep type validation, mobile tap-target audit

---

### ✅ Phase 44: Workflow Engine 3 — Inspection Mode — Full-screen DVIR, fail-capture, mechanic sign-offs (complete 2026-04-24)

**Goal:** Build the signature UX of the product: full-screen Inspection Mode for drivers (card-by-card pass/fail, fail photo capture, completion moment). Failed inspection items auto-create mechanic approval steps. Vehicle `isDispatchReady` computed and enforced. Push + SMS notifications for `STEP_FAILED` and `APPROVAL_NEEDED`.
**Depends on:** Phase 43 (execution layer complete)
**Plans:** 6 plans

Plans:
- [x] 44-01-PLAN.md — Schema migration: add VEHICLE_INSPECTION to PlaybookCategory enum, make StepInstance.stepTemplateId nullable for ad-hoc APPROVAL steps
- [x] 44-02-PLAN.md — Fix completeStep INSPECTION_ITEM PASS bug, implement failInspectionItem service + Zod schema, add fail/requestApproval/approve tRPC procedures
- [x] 44-03-PLAN.md — REST endpoints: POST /api/mobile/driver/tasks/[id]/fail + POST /api/mobile/driver/tasks/upload-photo
- [x] 44-04-PLAN.md — Mobile: InspectionModeScreen (card-slide UX, PASS/FAIL, fail-capture, completion screen), update TaskActionDispatcher
- [x] 44-05-PLAN.md — Web: mechanic ApproveDialog in ChecklistDetailClient, isDispatchReady badge on truck profile
- [x] 44-06-PLAN.md — Tests: failInspectionItem unit tests (5), InspectionModeScreen tap-target audit (4)

---

### Phase 45: Workflow Engine 4 — Automation — Auto-Start Rules, event triggers, dispatch enforcement

**Goal:** Playbooks fire automatically based on lifecycle events (driver create, dispatch depart/deliver, etc.). Tenants toggle recipe presets from the Automation page. Dispatch creation blocks non-ready drivers with an admin override + audit trail. Full notification suite across all types and channels.
**Depends on:** Phase 44 (readiness computation stable)
**Plans:** 6 plans

Plans:
- [ ] 45-01-PLAN.md — Schema foundation (PlaybookTrigger + DispatchOverrideAudit + VEHICLE_INSPECTION validation fix)
- [ ] 45-02-PLAN.md — fireEvent service + recipes constants + match/skip unit tests (DoD test 1)
- [ ] 45-03-PLAN.md — Unified notifications module (all 7 NotifType) + DISPATCH_READY + overdue cron
- [ ] 45-04-PLAN.md — tRPC trigger router + wire 8 lifecycle hooks (owner actions + carrier routes + dispatch transitions)
- [ ] 45-05-PLAN.md — Auto-Start Rules page (7 recipe cards + custom rules) + dispatch enforcement modal + override audit
- [ ] 45-06-PLAN.md — Integration tests for DoD tests 2, 3, 4 (instance preservation + audit write + block without override)

---

### Phase 46: Workflow Engine 5 — Polish & Analytics — Preview panel, SMS, overdue alerts, analytics

**Goal:** Builder Preview Panel (phone-frame driver view + dispatcher card). SMS delivery confirmed end-to-end in staging. Overdue alerts fire 24h after due date. Analytics dashboard: completion rate per playbook, average time, step drop-off. Daily email digest for Safety Managers. Skip-with-reason audit trail visible on instance detail.
**Depends on:** Phase 45 (full feature complete)
**Plans:** TBD (after context + planning)

Plans:
- [ ] TBD

---

## v6.0 Owner Portal Permissions

### Phase 40: Owner Portal RBAC — Role-based access control for OwnerUser team members

**Goal:** Implement a granular permissions system in the owner portal so OwnerAdmin users (OWNER role) can control exactly which pages and features their team members (MANAGER role — dispatchers, assistants, partners) can access. OwnerAdmin sees everything. OwnerUser access is configurable per-user via a permissions management UI in Settings. Route guards and sidebar filtering enforce permissions at runtime. The invite flow gains a role selector so new team members can be invited as OwnerUser with a pre-configured permission set.
**Depends on:** Phase 23 (SysAdmin portal), Phase 7 (owner portal foundation)
**Plans:** TBD (after context + planning)

Plans:
- [ ] TBD
