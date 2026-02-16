# Roadmap: DriveCommand

## Overview

DriveCommand builds from secure multi-tenant foundations through entity management (trucks, drivers, routes) to operational workflows (documents, maintenance, notifications) and platform administration. v1.0 delivered complete fleet management (phases 1-10). v2.0 transforms the platform into a Samsara-inspired fleet intelligence system with live GPS tracking, safety analytics, fuel efficiency dashboards, and modern sidebar navigation—all powered by mock data for rapid validation.

## Milestones

- ✅ **v1.0 Fleet Management** - Phases 1-10 (shipped 2026-02-15)
- 🚧 **v2.0 Samsara-Inspired Fleet Intelligence** - Phases 11-15 (in progress)

## Phases

<details>
<summary>✅ v1.0 Fleet Management (Phases 1-10) - SHIPPED 2026-02-15</summary>

**Milestone Goal:** Multi-tenant SaaS platform for logistics fleet management with trucks, drivers, routes, documents, maintenance, and notifications.

- [x] **Phase 1: Foundation & Multi-Tenant Setup** - Database schema with RLS, tenant provisioning, middleware
- [x] **Phase 2: Authentication & Authorization** - Clerk integration, role-based access, signup/login flows
- [x] **Phase 3: Truck Management** - Vehicle CRUD, listing, filtering, structured fields
- [x] **Phase 4: Driver Management** - Driver accounts, invite system, listing, role enforcement
- [x] **Phase 5: Route Management** - Route CRUD, lifecycle, driver-truck assignment, unified detail view
- [x] **Phase 6: Document Storage & Files** - Cloudflare R2 integration, file uploads, tenant-isolated storage
- [x] **Phase 7: Driver Portal** - Read-only driver interface, assigned route view, restricted access
- [x] **Phase 8: Maintenance & Scheduling** - Service history, dual-trigger scheduling, expiry tracking
- [x] **Phase 9: Notifications & Reminders** - Email service, background jobs, maintenance/document alerts
- [x] **Phase 10: Dashboard & System Admin** - Fleet overview, metrics, system admin tenant management

### Phase 1: Foundation & Multi-Tenant Setup
**Goal**: Multi-tenant database architecture with complete data isolation is operational
**Depends on**: Nothing (first phase)
**Requirements**: AUTH-05
**Success Criteria** (what must be TRUE):
  1. PostgreSQL database exists with tenant_id columns on all tenant-scoped tables
  2. Row-Level Security policies enforce tenant isolation at database level
  3. Tenant provisioning creates isolated data context for new companies
  4. Next.js middleware injects tenant context into all requests
  5. Base repository pattern filters all queries by tenant_id
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffolding + Prisma schema with RLS migration
- [x] 01-02-PLAN.md — Prisma RLS extension, tenant context, proxy, Clerk webhook
- [x] 01-03-PLAN.md — Base repository pattern + cross-tenant isolation tests

### Phase 2: Authentication & Authorization
**Goal**: Users can securely access the platform with role-appropriate permissions
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-06
**Success Criteria** (what must be TRUE):
  1. Company owner can sign up via self-service flow and create new tenant
  2. User can log in with email/password and stay logged in across browser sessions
  3. User can log out from any page
  4. System enforces three distinct roles: System Admin, Owner/Manager, Driver
  5. Users only see features and data appropriate to their role
**Plans**: 3 plans

Plans:
- [x] 02-01-PLAN.md -- RBAC foundation: role definitions, server auth helpers, webhook publicMetadata sync
- [x] 02-02-PLAN.md -- Auth UI: sign-in, sign-up, onboarding, UserMenu for sign-out
- [x] 02-03-PLAN.md -- Portal layouts with role-based access control, RoleGuard component

### Phase 3: Truck Management
**Goal**: Owners can manage their fleet inventory with complete CRUD operations
**Depends on**: Phase 2
**Requirements**: TRUK-01, TRUK-02, TRUK-03, TRUK-04
**Success Criteria** (what must be TRUE):
  1. Owner can add a truck with all core fields (make, model, year, VIN, license plate, odometer)
  2. Owner can edit truck details and delete trucks from the system
  3. Owner can view all their trucks in a filterable and sortable list
  4. Owner can store structured document metadata per truck (registration number, insurance expiry date)
  5. Each tenant only sees their own trucks (no data leakage)
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Data layer: Prisma Truck model with RLS, Zod schemas, repository, server actions
- [x] 03-02-PLAN.md — UI: TanStack Table truck list, create/edit forms, detail view with document metadata

### Phase 4: Driver Management
**Goal**: Owners can manage driver accounts with invite-based provisioning
**Depends on**: Phase 2
**Requirements**: DRVR-01, DRVR-02, DRVR-03
**Success Criteria** (what must be TRUE):
  1. Owner can create driver accounts via invite system (not self-registration)
  2. Owner can view all drivers in filterable and sortable list
  3. Owner can edit driver information and deactivate driver accounts
  4. Driver receives invite and can complete account setup
  5. Deactivated drivers cannot log in or access any data
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Data layer: Prisma schema extensions (User + DriverInvitation), migration with RLS, Zod schemas, server actions with Clerk invite integration
- [x] 04-02-PLAN.md — Webhook extension for driver sign-up + UI: TanStack Table driver list, invite form, detail/edit pages

### Phase 5: Route Management
**Goal**: Owners can create and manage routes with full driver-truck-document coordination
**Depends on**: Phase 3, Phase 4
**Requirements**: ROUT-01, ROUT-02, ROUT-03, ROUT-04, ROUT-06
**Success Criteria** (what must be TRUE):
  1. Owner can create routes (one-time or recurring) with origin, destination, and date
  2. Owner can assign a specific driver and truck to each route
  3. Route progresses through lifecycle: Planned -> In Progress -> Completed
  4. Owner can view unified route detail showing driver, truck, documents, and status on one screen
  5. Owner can view all routes with filtering by status, driver, truck, or date
**Plans**: 2 plans

Plans:
- [x] 05-01-PLAN.md — Data layer: Prisma Route model with RouteStatus enum, RLS, Zod schemas, date utilities, server actions with state machine
- [x] 05-02-PLAN.md — UI: TanStack Table route list, create form with driver/truck dropdowns, unified detail view, status transitions, edit

### Phase 6: Document Storage & Files
**Goal**: Users can securely upload and retrieve files with tenant isolation
**Depends on**: Phase 1
**Requirements**: TRUK-05, ROUT-05
**Success Criteria** (what must be TRUE):
  1. Owner can upload files (PDFs, images, scans) for trucks
  2. Owner can attach documents to routes (shipping docs, delivery receipts, inspections, compliance)
  3. Files are stored with tenant-prefixed paths preventing cross-tenant access
  4. Files are served securely with MIME type validation
  5. File uploads are limited to safe types and reasonable sizes (10MB max)
**Plans**: 2 plans

Plans:
- [x] 06-01-PLAN.md — S3-compatible storage client, file validation, Document model with RLS, repository, server actions
- [x] 06-02-PLAN.md — DocumentUpload and DocumentList components integrated into truck and route detail pages

### Phase 7: Driver Portal
**Goal**: Drivers can view their assigned work without accessing company-wide data
**Depends on**: Phase 5, Phase 6
**Requirements**: DPRT-01, DPRT-02, DPRT-03, DPRT-04
**Success Criteria** (what must be TRUE):
  1. Driver can log in and immediately see only their assigned route (no other routes visible)
  2. Driver can view assigned truck details and truck documents
  3. Driver can view route documents (shipping docs, compliance paperwork)
  4. Driver cannot access other routes, trucks, or company-wide data (enforced at DB and UI level)
  5. Driver has read-only access (cannot modify routes, trucks, or documents)
**Plans**: 2 plans

Plans:
- [x] 07-01-PLAN.md — Driver-scoped server actions with IDOR-proof user-level filtering
- [x] 07-02-PLAN.md — Driver portal UI: landing page, read-only route/truck/documents view

### Phase 8: Maintenance & Scheduling
**Goal**: Owners can track service history and schedule future maintenance with dual triggers
**Depends on**: Phase 3
**Requirements**: MNTC-01, MNTC-02
**Success Criteria** (what must be TRUE):
  1. Owner can log past maintenance events per truck with date, cost, provider, and notes
  2. Owner can view complete service history for each truck
  3. Owner can schedule future services with time-based triggers (every 90 days)
  4. Owner can schedule future services with mileage-based triggers (every 5,000 miles)
  5. System tracks both trigger types simultaneously for each scheduled service
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Data layer: Prisma models (MaintenanceEvent + ScheduledService), migration with RLS, Zod schemas, calculateNextDue utility, server actions
- [x] 08-02-PLAN.md — UI: Combined maintenance page, log event form, schedule service form, TanStack Table lists with due status, truck detail link

### Phase 9: Notifications & Reminders
**Goal**: System automatically sends timely reminders for maintenance and expiring documents
**Depends on**: Phase 8, Phase 6
**Requirements**: MNTC-03, MNTC-04
**Success Criteria** (what must be TRUE):
  1. Dashboard shows upcoming maintenance based on both time and mileage triggers
  2. Dashboard shows expiring documents (insurance, registration, inspections)
  3. Email reminders are sent for upcoming scheduled services (7 days before due date)
  4. Email reminders are sent for expiring documents (14 days before expiry)
  5. Background jobs process reminders without blocking user requests
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Notification infrastructure: NotificationLog model, Resend + React Email templates, cron endpoint with deduplication
- [x] 09-02-PLAN.md — Dashboard widgets: upcoming maintenance and expiring documents with color-coded urgency

### Phase 10: Dashboard & System Admin
**Goal**: Owners see fleet overview and system admins can manage all tenants
**Depends on**: Phase 3, Phase 4, Phase 5, Phase 9
**Requirements**: DASH-01, DASH-02, ADMN-01, ADMN-02, AUTH-04
**Success Criteria** (what must be TRUE):
  1. Owner sees fleet overview dashboard (total trucks, drivers, active routes, upcoming maintenance)
  2. Owner can view trucks, drivers, and routes individually and in combined views
  3. System admin can view all tenants and their status in admin portal
  4. System admin can create new tenants manually (for enterprise sales)
  5. System admin can suspend or delete tenants (with confirmation)
**Plans**: 2 plans

Plans:
- [x] 10-01-PLAN.md — Owner dashboard with fleet stat cards and parallel data fetching
- [x] 10-02-PLAN.md — System admin tenant management with cross-tenant CRUD and confirmation dialogs

</details>

## 🚧 v2.0 Samsara-Inspired Fleet Intelligence (In Progress)

**Milestone Goal:** Transform DriveCommand into a Samsara-inspired fleet intelligence platform with live GPS tracking, safety analytics, fuel efficiency dashboards, and modern sidebar navigation—all powered by mock data for rapid UI validation.

**Phase Numbering:**
- Integer phases (11-15): Planned milestone work
- Decimal phases (e.g., 11.1, 11.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 11: Navigation & Data Foundation** - Sidebar navigation + GPS/Safety/Fuel data models + mock data seeding
- [x] **Phase 12: Live GPS Map** - Leaflet map + vehicle markers + detail panel + route trails + clustering
- [x] **Phase 13: Safety Analytics Dashboard** - Safety scores + event tracking + trends + rankings + thresholds
- [x] **Phase 14: Fuel & Energy Dashboard** - MPG trends + cost analysis + emissions + idle time + rankings
- [ ] **Phase 15: Tags/Groups & Polish** - Organization system + loading states + error handling + mobile responsive

### Phase 11: Navigation & Data Foundation
**Goal**: Modern sidebar navigation is operational and intelligence data models are ready for dashboard features
**Depends on**: Phase 10
**Requirements**: NAVI-01, NAVI-02
**Success Criteria** (what must be TRUE):
  1. Owner portal displays Samsara-style collapsible icon sidebar with role-based menu items (Dashboard, Live Map, Safety, Fuel, Trucks, Drivers, Routes)
  2. Sidebar persists across all owner portal pages with active state highlighting
  3. Database contains GPSLocation, SafetyEvent, and FuelRecord models with RLS policies matching v1.0 tenant isolation patterns
  4. Mock data seed scripts generate realistic GPS coordinates, safety events, and fuel records for all trucks
  5. All mock data flows through RLS-protected APIs (not raw SQL) to validate tenant isolation
**Plans**: 3 plans

Plans:
- [x] 11-01-PLAN.md — Sidebar navigation: Install shadcn/ui, create Samsara-style collapsible sidebar with grouped menu sections
- [x] 11-02-PLAN.md — Data models: Add GPSLocation, SafetyEvent, FuelRecord to Prisma schema with RLS migration
- [x] 11-03-PLAN.md — Mock data seeding: Idempotent seed scripts with Turf.js GPS interpolation, safety events, fuel records

### Phase 12: Live GPS Map
**Goal**: Owners can view real-time fleet locations and route history on an interactive map
**Depends on**: Phase 11
**Requirements**: GMAP-01, GMAP-02, GMAP-03, GMAP-04
**Success Criteria** (what must be TRUE):
  1. Owner can view live map showing all fleet vehicles with color-coded status markers (moving/idle/offline)
  2. Owner can click vehicle marker to open detail sidebar showing diagnostics (fuel level, speed, engine state, DEF level, odometer, last GPS update)
  3. Owner can view vehicle route history as breadcrumb trail polylines showing past 24 hours of travel
  4. Map automatically clusters nearby vehicle markers when zoomed out for fleets with 20+ vehicles
  5. Map initializes without SSR errors (Leaflet loaded via dynamic import with ssr: false)
**Plans**: 2 plans

Plans:
- [x] 12-01-PLAN.md — Leaflet setup, server actions, utility functions, map page with color-coded vehicle markers and clustering
- [x] 12-02-PLAN.md — Vehicle detail sidebar with diagnostics and route history breadcrumb trail polylines

### Phase 13: Safety Analytics Dashboard
**Goal**: Owners can monitor driver safety performance with scores, events, and trends
**Depends on**: Phase 11
**Requirements**: SAFE-01, SAFE-02, SAFE-03, SAFE-04, SAFE-05
**Success Criteria** (what must be TRUE):
  1. Owner can view fleet-wide safety dashboard with composite safety score (0-100 scale)
  2. Owner can view safety events (harsh braking, speeding, rapid acceleration) with distribution charts (bar chart by type, donut chart for percentages)
  3. Owner can view safety score trends over time (30-day line chart showing daily average scores)
  4. Owner can view driver safety performance rankings (leaderboard showing top and bottom performers)
  5. Owner can configure safety alert thresholds (g-force sensitivity settings per vehicle class: light/medium/heavy duty)
**Plans**: 2 plans

Plans:
- [x] 13-01-PLAN.md — Install shadcn chart components, fix seed enums, create score calculator and safety server actions
- [x] 13-02-PLAN.md — Safety dashboard page with score card, event charts, trend line, leaderboard, and threshold config

### Phase 14: Fuel & Energy Dashboard
**Goal**: Owners can track fuel efficiency and environmental impact across the fleet
**Depends on**: Phase 11
**Requirements**: FUEL-01, FUEL-02, FUEL-03, FUEL-04
**Success Criteria** (what must be TRUE):
  1. Owner can view per-vehicle fuel efficiency trends (MPG line chart, total gallons consumed, total cost, cost per mile)
  2. Owner can view estimated CO2 emissions per vehicle based on fuel consumption (kg CO2 with calculation methodology visible)
  3. Owner can view idle time percentage per vehicle (time spent idling vs. moving, with cost impact)
  4. Owner can view fleet fuel efficiency rankings (leaderboard showing top and bottom performers by MPG)
  5. Dashboard aggregations execute in <2 seconds with proper date filtering and database indexes
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md — Fuel calculator utility and 5 RLS-scoped server actions for fuel metrics, trends, emissions, idle time, and rankings
- [x] 14-02-PLAN.md — Fuel dashboard page with summary card, MPG trend chart, emissions card, idle time analysis, and fuel leaderboard

### Phase 15: Tags/Groups & Polish
**Goal**: Fleet organization system is complete and all dashboards have production-ready UX
**Depends on**: Phase 12, Phase 13, Phase 14
**Requirements**: NAVI-03
**Success Criteria** (what must be TRUE):
  1. Owner can create tags/groups to organize vehicles and drivers into teams (e.g., "Long Haul", "Local Delivery", "Maintenance")
  2. Owner can filter all dashboards (Map, Safety, Fuel) by tags/groups
  3. All dashboard pages display loading states (Suspense boundaries for data fetching) and error states (no data, empty states)
  4. All charts and maps are responsive on mobile devices (sidebar collapses to drawer, charts stack vertically)
  5. First-load JavaScript bundle size is under 500KB (verified with bundle analyzer, Leaflet and Recharts loaded via dynamic imports)
**Plans**: 3 plans

Plans:
- [ ] 15-01-PLAN.md — Tag/group data model, CRUD server actions, and tag management page with assignment UI
- [ ] 15-02-PLAN.md — Dashboard tag filtering across Map, Safety, Fuel pages + loading/error states
- [ ] 15-03-PLAN.md — Mobile responsive polish and bundle size verification/optimization

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15

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
| 15. Tags/Groups & Polish | v2.0 | 0/3 | Not started | - |
