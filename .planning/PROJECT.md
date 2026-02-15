# DriveCommand

## What This Is

A multi-tenant SaaS web platform for logistics fleet management. Logistics company owners sign up, manage their trucks, drivers, and routes through a dedicated portal. The core operational unit is a Route — which ties together a driver, a truck, and all associated documents (shipping docs, inspections, compliance). Drivers access a read-only portal showing their assigned route, truck, and documents. A system admin portal allows platform operators to manage tenants.

## Core Value

Logistics owners can manage their entire operation — trucks, drivers, routes, and documents — from one platform, with each route showing the full picture (driver + truck + documents + status) on a single screen.

## Current Milestone: v2.0 Samsara-Inspired Fleet Intelligence

**Goal:** Transform DriveCommand from basic fleet management into a Samsara-inspired fleet intelligence platform with live GPS tracking, safety analytics, fuel efficiency dashboards, and a modern sidebar navigation — all powered by mock data for rapid UI development.

**Target features:**
- Live Map + GPS Tracking with vehicle detail panel and diagnostics
- Samsara-style sidebar navigation overhaul
- Safety Dashboard with scores, driver performance, behavior insights
- Fuel & Energy Dashboard with vehicle efficiency metrics

## Requirements

### Validated

<!-- Shipped and confirmed in v1.0 -->

- ✓ Multi-tenant architecture with complete data isolation — v1.0 Phase 1
- ✓ Three portals: System Admin, Owner/Manager, Driver — v1.0 Phase 2
- ✓ Truck CRUD with structured fields — v1.0 Phase 3
- ✓ Driver management with invite-based onboarding — v1.0 Phase 4
- ✓ Route management with lifecycle statuses — v1.0 Phase 5
- ✓ Document storage with tenant-isolated S3 — v1.0 Phase 6
- ✓ Driver portal with read-only access — v1.0 Phase 7
- ✓ Maintenance records and service scheduling — v1.0 Phase 8
- ✓ Email reminders for maintenance and documents — v1.0 Phase 9
- ✓ Fleet overview dashboard and system admin portal — v1.0 Phase 10
- ✓ Role-based access control and secure authentication — v1.0 Phase 2
- ✓ Self-service company signup — v1.0 Phase 2

### Active

- [ ] Samsara-style icon sidebar navigation with restructured pages
- [ ] Live map view with real-time vehicle location (mock GPS data)
- [ ] Vehicle detail panel with diagnostics (engine state, fuel, odometer, DEF level)
- [ ] Route trail visualization on map
- [ ] Tags/groups system for organizing drivers and vehicles into teams
- [ ] Safety overview dashboard with fleet-wide safety scores
- [ ] Driver performance view with safety score distribution histogram
- [ ] Behavior insights (crash events, harsh braking, rolling stops)
- [ ] Safety score trends over time
- [ ] Fuel & Energy dashboard with per-vehicle efficiency (MPG)
- [ ] Fuel usage, carbon emissions, and cost estimates per vehicle
- [ ] Mock data seeding for GPS, diagnostics, safety, and fuel metrics

### Out of Scope

- Mobile native app — web-first
- Real hardware/telematics integration — mock data for v2.0, hardware-ready APIs later
- FMCSA/DOT HOS compliance logic — UI dashboard only for v2.0
- Live Share (public location links) — defer to v2.1
- Compliance dashboard (HOS violations, unassigned driving) — defer to v2.1
- Dashcam/camera feed integration — requires hardware, defer
- Billing/subscription management — defer until product-market fit validated
- Push notifications — dashboard + email sufficient
- Route optimization / dispatch algorithms — different domain

## Context

- SaaS product for logistics companies as paying customers
- v1.0 complete — full fleet management with trucks, drivers, routes, documents, maintenance, notifications
- Tech stack: Next.js 16 + PostgreSQL 17 (RLS) + Clerk + Prisma 7 + AWS S3 + Resend
- Core data model: Route = Driver + Truck + Documents + Status
- v2.0 adds Samsara-inspired intelligence layer: GPS tracking, safety analytics, fuel efficiency
- All v2.0 features use mock/simulated data — API contracts designed for future hardware integration
- UI inspiration: Samsara fleet management platform (screenshots provided by user)
- Key UI patterns from Samsara: icon sidebar, map-first vehicle view, collapsible detail panels, donut charts for compliance, histograms for driver performance

## Constraints

- **Multi-tenancy**: Complete data isolation between tenants — no data leakage
- **Security**: Auth must be production-grade from day one (SaaS with multiple companies)
- **Scalability**: Architecture must support growing number of tenants without rework

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three portals (Admin, Owner, Driver) | Multi-tenant SaaS needs platform admin; owners and drivers have distinct needs | ✓ Good |
| Route as core operational unit | Routes tie together driver + truck + documents — reflects real logistics operations | ✓ Good |
| Manager-provisioned driver accounts | Prevents unauthorized access to fleet data | ✓ Good |
| Dashboard + email for reminders (no push) | Simpler v1, covers primary use case | ✓ Good |
| Self-service signup + admin panel | Enables SaaS growth while maintaining control | ✓ Good |
| Mock data for v2.0 GPS/safety/fuel | Build UI first, design API contracts for future hardware integration | — Pending |
| Samsara-style sidebar navigation | Matches industry standard UX, replaces current navigation | — Pending |
| UI-first approach for safety/compliance | Build dashboard visuals with mock data, add real logic in future milestones | — Pending |

---
*Last updated: 2026-02-15 after milestone v2.0 started (Samsara-inspired fleet intelligence)*
