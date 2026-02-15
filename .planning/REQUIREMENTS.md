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
- [x] **TRUK-05**: Owner can upload files per truck (PDFs, images, scans of documents)

### Driver Management

- [x] **DRVR-01**: Owner can create driver accounts (invite-based)
- [x] **DRVR-02**: Owner can view, edit, and deactivate drivers
- [x] **DRVR-03**: Owner can view all drivers with filtering and sorting

### Route Management

- [ ] **ROUT-01**: Owner can create a route (one-time or recurring) with origin, destination, and date
- [ ] **ROUT-02**: Owner can assign a driver and truck to a route
- [ ] **ROUT-03**: Route has lifecycle statuses: Planned → In Progress → Completed
- [ ] **ROUT-04**: Owner can view unified route detail (driver + truck + documents + status on one screen)
- [x] **ROUT-05**: Owner can attach documents to a route (shipping docs, delivery receipts, inspections, compliance)
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

## v2.0 Requirements

Requirements for milestone v2.0: Samsara-Inspired Fleet Intelligence. Each maps to roadmap phases 11-15.

### GPS & Live Map

- [ ] **GMAP-01**: Owner can view live map showing all fleet vehicles with color-coded status markers (moving/idle/offline)
- [ ] **GMAP-02**: Owner can view vehicle route history as breadcrumb trail polylines on the map
- [ ] **GMAP-03**: Owner can click a vehicle marker to open a detail sidebar showing diagnostics (fuel level, speed, engine state, DEF level, odometer)
- [ ] **GMAP-04**: Map clusters nearby vehicle markers when zoomed out for fleets with many vehicles

### Safety Analytics

- [ ] **SAFE-01**: Owner can view fleet-wide safety dashboard with composite safety score (0-100)
- [ ] **SAFE-02**: Owner can view safety events (harsh braking, speeding, rapid acceleration) with distribution charts (donut/histogram)
- [ ] **SAFE-03**: Owner can view safety score trends over time (30-day line chart per driver or fleet-wide)
- [ ] **SAFE-04**: Owner can view driver safety performance rankings (leaderboard of top/bottom performers)
- [ ] **SAFE-05**: Owner can configure safety alert thresholds (g-force sensitivity per vehicle class)

### Fuel & Energy

- [ ] **FUEL-01**: Owner can view per-vehicle fuel efficiency (MPG) trends, total cost, gallons consumed, and cost per mile
- [ ] **FUEL-02**: Owner can view estimated CO2 emissions per vehicle based on fuel consumption
- [ ] **FUEL-03**: Owner can view idle time percentage per vehicle
- [ ] **FUEL-04**: Owner can view fleet fuel efficiency rankings (top/bottom performers by MPG)

### Navigation & Infrastructure

- [ ] **NAVI-01**: Owner portal uses Samsara-style collapsible icon sidebar navigation with role-based menu items
- [ ] **NAVI-02**: System seeds realistic mock data for GPS locations, safety events, and fuel records through RLS-protected APIs
- [ ] **NAVI-03**: Owner can organize vehicles and drivers into tags/groups for filtering across all dashboards

## Future Requirements

Deferred to future milestones. Tracked but not in current roadmap.

### Operations

- **OPER-01**: Pre/post-trip inspection checklists (DVIR) with photo uploads
- **OPER-02**: Work order management (create from inspection failures, track to completion)

### Reporting

- **REPT-01**: Cost tracking and reporting per truck (maintenance + fuel costs)
- **REPT-02**: Advanced analytics (cost trends, utilization, replacement timing)

### Advanced Fleet Intelligence (v2.1+)

- **ADVN-01**: Trip replay with timeline scrubber (playback vehicle path at any past moment)
- **ADVN-02**: Route compliance visualization (planned vs actual path overlay)
- **ADVN-03**: Geofence creation and entry/exit alerts
- **ADVN-04**: Driver coaching workflow (assign tasks from safety events)
- **ADVN-05**: Real-time ETA sharing (public tracking links for customers)
- **ADVN-06**: Hardware telematics integration (replace mock data with real devices)

### Integrations

- **INTG-01**: OAuth/SSO login (Google, Microsoft)
- **INTG-02**: Fuel card integrations

### Mobile

- **MOBL-01**: Native mobile apps for iOS/Android

## Out of Scope

| Feature | Reason |
|---------|--------|
| Real hardware/telematics integration | Mock data for v2.0, hardware-ready APIs later |
| Route optimization / dispatch algorithms | Different domain (logistics routing), complex algorithms |
| Billing/subscription management | Defer until product-market fit validated |
| Push notifications | Dashboard + email sufficient |
| AI dashcam / video telematics | Requires hardware, video storage, complex AI |
| Built-in messaging/chat | Scope creep — email + external tools suffice |
| Driver payroll / HR features | Complex regulatory domain, integrate with existing systems |
| Predictive maintenance | Requires historical data from real hardware |
| FMCSA/DOT HOS compliance logic | UI dashboard only for v2.0, compliance logic later |
| Live Share (public location links) | Defer to v2.1 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.0 Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 2 | ✓ Done |
| AUTH-02 | Phase 2 | ✓ Done |
| AUTH-03 | Phase 2 | ✓ Done |
| AUTH-04 | Phase 10 | ✓ Done |
| AUTH-05 | Phase 1 | ✓ Done |
| AUTH-06 | Phase 2 | ✓ Done |
| TRUK-01 | Phase 3 | ✓ Done |
| TRUK-02 | Phase 3 | ✓ Done |
| TRUK-03 | Phase 3 | ✓ Done |
| TRUK-04 | Phase 3 | ✓ Done |
| TRUK-05 | Phase 6 | ✓ Done |
| DRVR-01 | Phase 4 | ✓ Done |
| DRVR-02 | Phase 4 | ✓ Done |
| DRVR-03 | Phase 4 | ✓ Done |
| ROUT-01 | Phase 5 | ✓ Done |
| ROUT-02 | Phase 5 | ✓ Done |
| ROUT-03 | Phase 5 | ✓ Done |
| ROUT-04 | Phase 5 | ✓ Done |
| ROUT-05 | Phase 6 | ✓ Done |
| ROUT-06 | Phase 5 | ✓ Done |
| DPRT-01 | Phase 7 | ✓ Done |
| DPRT-02 | Phase 7 | ✓ Done |
| DPRT-03 | Phase 7 | ✓ Done |
| DPRT-04 | Phase 7 | ✓ Done |
| MNTC-01 | Phase 8 | ✓ Done |
| MNTC-02 | Phase 8 | ✓ Done |
| MNTC-03 | Phase 9 | ✓ Done |
| MNTC-04 | Phase 9 | ✓ Done |
| DASH-01 | Phase 10 | ✓ Done |
| DASH-02 | Phase 10 | ✓ Done |
| ADMN-01 | Phase 10 | ✓ Done |
| ADMN-02 | Phase 10 | ✓ Done |

**v1.0 Summary:**
- v1 requirements: 32 total
- Mapped to phases: 32
- Unmapped: 0 ✓

### v2.0 Coverage

| Requirement | Phase | Status |
|-------------|-------|--------|
| GMAP-01 | Phase 12 | Pending |
| GMAP-02 | Phase 12 | Pending |
| GMAP-03 | Phase 12 | Pending |
| GMAP-04 | Phase 12 | Pending |
| SAFE-01 | Phase 13 | Pending |
| SAFE-02 | Phase 13 | Pending |
| SAFE-03 | Phase 13 | Pending |
| SAFE-04 | Phase 13 | Pending |
| SAFE-05 | Phase 13 | Pending |
| FUEL-01 | Phase 14 | Pending |
| FUEL-02 | Phase 14 | Pending |
| FUEL-03 | Phase 14 | Pending |
| FUEL-04 | Phase 14 | Pending |
| NAVI-01 | Phase 11 | Pending |
| NAVI-02 | Phase 11 | Pending |
| NAVI-03 | Phase 15 | Pending |

**v2.0 Summary:**
- v2.0 requirements: 16 total
- Mapped to phases: 16
- Unmapped: 0 ✓

---
*Requirements defined: 2026-02-14*
*Last updated: 2026-02-15 after v2.0 roadmap creation (phases 11-15)*
