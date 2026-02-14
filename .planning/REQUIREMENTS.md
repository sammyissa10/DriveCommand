# Requirements: DriveCommand

**Defined:** 2026-02-14
**Core Value:** Logistics owners can manage their entire operation — trucks, drivers, routes, and documents — from one platform, with each route showing the full picture on a single screen.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication & Multi-Tenancy

- [x] **AUTH-01**: User can sign up as a company owner (self-service)
- [x] **AUTH-02**: User can log in with email/password and stay logged in across sessions
- [x] **AUTH-03**: User can log out from any page
- [ ] **AUTH-04**: System Admin can view and manage all tenants
- [ ] **AUTH-05**: Each tenant's data is completely isolated via Row-Level Security
- [x] **AUTH-06**: Three roles enforced: System Admin, Owner/Manager, Driver

### Truck Management

- [x] **TRUK-01**: Owner can add a truck with core fields (make, model, year, VIN, license plate, odometer)
- [x] **TRUK-02**: Owner can edit and delete trucks
- [x] **TRUK-03**: Owner can view all trucks with filtering and sorting
- [x] **TRUK-04**: Owner can store structured document fields per truck (registration number, insurance expiry)
- [ ] **TRUK-05**: Owner can upload files per truck (PDFs, images, scans of documents)

### Driver Management

- [x] **DRVR-01**: Owner can create driver accounts (invite-based)
- [x] **DRVR-02**: Owner can view, edit, and deactivate drivers
- [x] **DRVR-03**: Owner can view all drivers with filtering and sorting

### Route Management

- [ ] **ROUT-01**: Owner can create a route (one-time or recurring) with origin, destination, and date
- [ ] **ROUT-02**: Owner can assign a driver and truck to a route
- [ ] **ROUT-03**: Route has lifecycle statuses: Planned → In Progress → Completed
- [ ] **ROUT-04**: Owner can view unified route detail (driver + truck + documents + status on one screen)
- [ ] **ROUT-05**: Owner can attach documents to a route (shipping docs, delivery receipts, inspections, compliance)
- [ ] **ROUT-06**: Owner can view all routes with filtering and sorting

### Driver Portal

- [ ] **DPRT-01**: Driver can log in and see only their assigned route
- [ ] **DPRT-02**: Driver can view assigned truck details and documents
- [ ] **DPRT-03**: Driver can view route documents (shipping docs, compliance paperwork)
- [ ] **DPRT-04**: Driver cannot see other routes, trucks, or company-wide data

### Maintenance & Service

- [ ] **MNTC-01**: Owner can log past maintenance events per truck (date, cost, provider, notes)
- [ ] **MNTC-02**: Owner can schedule future services with time-based and mileage-based triggers
- [ ] **MNTC-03**: Dashboard shows upcoming maintenance and expiring documents
- [ ] **MNTC-04**: Email reminders sent for upcoming services and expiring documents

### Dashboard

- [ ] **DASH-01**: Owner sees fleet overview (total trucks, drivers, active routes, upcoming maintenance)
- [ ] **DASH-02**: Owner can view trucks, drivers, and routes individually and together

### System Admin

- [ ] **ADMN-01**: System admin can view all tenants and their status
- [ ] **ADMN-02**: System admin can create, suspend, or delete tenants

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Operations

- **OPER-01**: Pre/post-trip inspection checklists (DVIR) with photo uploads
- **OPER-02**: Work order management (create from inspection failures, track to completion)
- **OPER-03**: Fuel tracking (manual entry: date, gallons, cost, odometer)

### Reporting

- **REPT-01**: Cost tracking and reporting per truck (maintenance + fuel costs)
- **REPT-02**: Advanced analytics (cost trends, utilization, replacement timing)

### Integrations

- **INTG-01**: OAuth/SSO login (Google, Microsoft)
- **INTG-02**: Fuel card integrations

### Mobile

- **MOBL-01**: Native mobile apps for iOS/Android

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real-time GPS tracking | High complexity, hardware dependency, not core to management value |
| Route optimization / dispatch algorithms | Different domain (logistics routing), complex algorithms |
| Billing/subscription management | Defer until product-market fit validated |
| Push notifications | Dashboard + email sufficient for v1 |
| AI dashcam / video telematics | Requires hardware, video storage, complex AI |
| Telematics / OBD-II diagnostics | Requires hardware dongles, vehicle integration |
| Built-in messaging/chat | Scope creep — email + external tools suffice |
| Driver payroll / HR features | Complex regulatory domain, integrate with existing systems |
| Predictive maintenance | Requires 6-12 months of historical data to be effective |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | ✓ Done |
| AUTH-02 | Phase 2 | ✓ Done |
| AUTH-03 | Phase 2 | ✓ Done |
| AUTH-04 | Phase 10 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 2 | ✓ Done |
| TRUK-01 | Phase 3 | ✓ Done |
| TRUK-02 | Phase 3 | ✓ Done |
| TRUK-03 | Phase 3 | ✓ Done |
| TRUK-04 | Phase 3 | ✓ Done |
| TRUK-05 | Phase 6 | Pending |
| DRVR-01 | Phase 4 | ✓ Done |
| DRVR-02 | Phase 4 | ✓ Done |
| DRVR-03 | Phase 4 | ✓ Done |
| ROUT-01 | Phase 5 | Pending |
| ROUT-02 | Phase 5 | Pending |
| ROUT-03 | Phase 5 | Pending |
| ROUT-04 | Phase 5 | Pending |
| ROUT-05 | Phase 6 | Pending |
| ROUT-06 | Phase 5 | Pending |
| DPRT-01 | Phase 7 | Pending |
| DPRT-02 | Phase 7 | Pending |
| DPRT-03 | Phase 7 | Pending |
| DPRT-04 | Phase 7 | Pending |
| MNTC-01 | Phase 8 | Pending |
| MNTC-02 | Phase 8 | Pending |
| MNTC-03 | Phase 9 | Pending |
| MNTC-04 | Phase 9 | Pending |
| DASH-01 | Phase 10 | Pending |
| DASH-02 | Phase 10 | Pending |
| ADMN-01 | Phase 10 | Pending |
| ADMN-02 | Phase 10 | Pending |

**Coverage:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-14 after roadmap creation*
