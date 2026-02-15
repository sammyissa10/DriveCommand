# Roadmap: DriveCommand

## Overview

DriveCommand builds from secure multi-tenant foundations through entity management (trucks, drivers, routes) to operational workflows (documents, maintenance, notifications) and platform administration. Each phase delivers complete, verifiable capabilities, starting with tenant isolation and authentication, progressing through core fleet entities, route coordination, driver access, maintenance automation, and finishing with dashboard oversight and system administration.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Multi-Tenant Setup** - Database schema with RLS, tenant provisioning, middleware
- [x] **Phase 2: Authentication & Authorization** - Clerk integration, role-based access, signup/login flows
- [x] **Phase 3: Truck Management** - Vehicle CRUD, listing, filtering, structured fields
- [x] **Phase 4: Driver Management** - Driver accounts, invite system, listing, role enforcement
- [x] **Phase 5: Route Management** - Route CRUD, lifecycle, driver-truck assignment, unified detail view
- [x] **Phase 6: Document Storage & Files** - Cloudflare R2 integration, file uploads, tenant-isolated storage
- [x] **Phase 7: Driver Portal** - Read-only driver interface, assigned route view, restricted access
- [ ] **Phase 8: Maintenance & Scheduling** - Service history, dual-trigger scheduling, expiry tracking
- [ ] **Phase 9: Notifications & Reminders** - Email service, background jobs, maintenance/document alerts
- [ ] **Phase 10: Dashboard & System Admin** - Fleet overview, metrics, system admin tenant management

## Phase Details

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
- [ ] 08-01-PLAN.md — Data layer: Prisma models (MaintenanceEvent + ScheduledService), migration with RLS, Zod schemas, calculateNextDue utility, server actions
- [ ] 08-02-PLAN.md — UI: Combined maintenance page, log event form, schedule service form, TanStack Table lists with due status, truck detail link

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
**Plans**: TBD

Plans:
- [ ] TBD during planning

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
**Plans**: TBD

Plans:
- [ ] TBD during planning

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Multi-Tenant Setup | 3/3 | ✓ Complete | 2026-02-14 |
| 2. Authentication & Authorization | 3/3 | ✓ Complete | 2026-02-14 |
| 3. Truck Management | 2/2 | ✓ Complete | 2026-02-14 |
| 4. Driver Management | 2/2 | ✓ Complete | 2026-02-14 |
| 5. Route Management | 2/2 | ✓ Complete | 2026-02-14 |
| 6. Document Storage & Files | 2/2 | ✓ Complete | 2026-02-14 |
| 7. Driver Portal | 2/2 | ✓ Complete | 2026-02-14 |
| 8. Maintenance & Scheduling | 0/2 | Planned | - |
| 9. Notifications & Reminders | 0/TBD | Not started | - |
| 10. Dashboard & System Admin | 0/TBD | Not started | - |
