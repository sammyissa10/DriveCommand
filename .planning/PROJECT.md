# DriveCommand

## What This Is

A multi-tenant SaaS fleet intelligence platform for logistics companies. Owners manage trucks, drivers, routes, and documents through a dedicated portal with Samsara-inspired fleet intelligence dashboards — live GPS tracking, safety analytics, fuel efficiency monitoring, and tag-based fleet organization. The core operational unit is a Route that ties together a driver, a truck, and all associated documents. Drivers access a read-only portal. A system admin portal manages tenants. All intelligence features currently use mock data with API contracts designed for future hardware integration.

## Core Value

Logistics owners can manage their entire operation — trucks, drivers, routes, and documents — from one platform, with fleet intelligence dashboards providing real-time visibility into vehicle location, driver safety, and fuel efficiency.

## Requirements

### Validated

<!-- Shipped and confirmed in v1.0 -->

- ✓ Multi-tenant architecture with complete data isolation — v1.0
- ✓ Three portals: System Admin, Owner/Manager, Driver — v1.0
- ✓ Truck CRUD with structured fields — v1.0
- ✓ Driver management with invite-based onboarding — v1.0
- ✓ Route management with lifecycle statuses — v1.0
- ✓ Document storage with tenant-isolated S3 — v1.0
- ✓ Driver portal with read-only access — v1.0
- ✓ Maintenance records and service scheduling — v1.0
- ✓ Email reminders for maintenance and documents — v1.0
- ✓ Fleet overview dashboard and system admin portal — v1.0
- ✓ Role-based access control and secure authentication — v1.0
- ✓ Self-service company signup — v1.0

<!-- Shipped and confirmed in v2.0 -->

- ✓ Samsara-style icon sidebar navigation with role-based menus — v2.0
- ✓ Live map view with real-time vehicle location and marker clustering — v2.0
- ✓ Vehicle detail panel with diagnostics (engine state, fuel, odometer, speed) — v2.0
- ✓ Route trail visualization with speed-color-coded polylines — v2.0
- ✓ Tags/groups system for organizing vehicles and drivers into teams — v2.0
- ✓ Safety analytics dashboard with composite scoring (0-100) — v2.0
- ✓ Driver safety rankings with leaderboard and performance tracking — v2.0
- ✓ Safety events with distribution charts and trend analysis — v2.0
- ✓ Configurable safety alert thresholds per vehicle class — v2.0
- ✓ Fuel & Energy dashboard with per-vehicle MPG and cost tracking — v2.0
- ✓ CO2 emissions and idle time analysis per vehicle — v2.0
- ✓ Mock data seeding for GPS, safety, and fuel with RLS validation — v2.0
- ✓ Cross-dashboard tag filtering (Map, Safety, Fuel) — v2.0
- ✓ Mobile responsive dashboards with loading states — v2.0

### Active

<!-- v3.0 Route Finance & Driver Documents -->

- [ ] Route finance tracking with line-item expenses (gas cost, driver salary, insurance, custom)
- [ ] Route payment tracking with total operating cost and profit calculation
- [ ] Unified route view/edit page with edit mode toggle and status editing
- [ ] Driver document uploads (driver license, driver application, general documents)

## Current Milestone: v3.0 Route Finance & Driver Documents

**Goal:** Add financial tracking to routes (expenses, payments, profit) with a consolidated route page UX, plus driver document upload capabilities.

**Target features:**
- Route finance: line-item expenses, payment tracking, operating cost, profit
- Route page consolidation: merge view/edit into one page with edit mode
- Driver documents: upload driver license, application, and general documents

### Out of Scope

- Mobile native app — web-first, responsive design works well
- Real hardware/telematics integration — mock data for v2.0, hardware-ready APIs designed
- FMCSA/DOT HOS compliance logic — UI dashboard only for now
- Live Share (public location links) — defer to future milestone
- Compliance dashboard (HOS violations, unassigned driving) — defer to future milestone
- Dashcam/camera feed integration — requires hardware, defer
- Billing/subscription management — defer until product-market fit validated
- Push notifications — dashboard + email sufficient
- Route optimization / dispatch algorithms — different domain
- Predictive maintenance — requires historical data from real hardware

## Context

- SaaS product for logistics companies as paying customers
- v1.0 shipped — full fleet management (trucks, drivers, routes, documents, maintenance, notifications)
- v2.0 shipped — Samsara-inspired fleet intelligence (GPS map, safety analytics, fuel dashboard, tags/groups)
- v3.0 in progress — Route finance tracking, route page consolidation, driver document uploads
- Tech stack: Next.js 16 + PostgreSQL 17 (RLS) + Clerk + Prisma 7 + AWS S3 + Resend + Leaflet + Recharts
- 71,160 lines of TypeScript across 15 phases
- All fleet intelligence features use mock/simulated data with API contracts for future hardware integration
- Deployed on Railway with Cloudflare R2 for file storage
- Key UI patterns: icon sidebar, map-first vehicle view, collapsible detail panels, severity-weighted safety scores, MPG leaderboards
- Tag-based fleet organization enables cross-dashboard filtering

## Constraints

- **Multi-tenancy**: Complete data isolation between tenants — no data leakage
- **Security**: Auth must be production-grade from day one (SaaS with multiple companies)
- **Scalability**: Architecture must support growing number of tenants without rework
- **Mock data**: All intelligence features use mock data — API contracts must be hardware-ready for future integration

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three portals (Admin, Owner, Driver) | Multi-tenant SaaS needs platform admin; owners and drivers have distinct needs | ✓ Good |
| Route as core operational unit | Routes tie together driver + truck + documents — reflects real logistics operations | ✓ Good |
| Manager-provisioned driver accounts | Prevents unauthorized access to fleet data | ✓ Good |
| Dashboard + email for reminders (no push) | Simpler v1, covers primary use case | ✓ Good |
| Self-service signup + admin panel | Enables SaaS growth while maintaining control | ✓ Good |
| Mock data for v2.0 GPS/safety/fuel | Build UI first, design API contracts for future hardware integration | ✓ Good — API contracts ready for hardware swap |
| Samsara-style sidebar navigation | Matches industry standard UX, replaces current navigation | ✓ Good — consistent with Samsara patterns |
| UI-first approach for safety/compliance | Build dashboard visuals with mock data, add real logic in future milestones | ✓ Good — full dashboard suite shipped |
| shadcn/ui component library | Industry-standard with built-in accessibility and responsive behavior | ✓ Good |
| Severity-weighted safety scoring | Exponential weights emphasize critical events over linear scaling | ✓ Good — meaningful differentiation |
| EPA CO2 factor for emissions | Industry-standard methodology (8.887 kg/gallon) | ✓ Good |
| Turf.js for GPS interpolation | Creates realistic route trails along US interstates | ✓ Good — replaced with specific imports for bundle size |
| Tag-based fleet organization | Cross-dashboard filtering enables flexible fleet grouping | ✓ Good — works across Map/Safety/Fuel |
| Client component wrapper for Leaflet | SSR-safe dynamic import pattern for browser-only libraries | ✓ Good |

---
*Last updated: 2026-02-16 after v3.0 milestone started (Route Finance & Driver Documents)*
