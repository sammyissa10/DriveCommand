# DriveCommand

## What This Is

A multi-tenant SaaS fleet intelligence platform for logistics companies. Owners manage trucks, drivers, routes, documents, and finances through a dedicated portal with Samsara-inspired fleet intelligence dashboards — live GPS tracking, safety analytics, fuel efficiency monitoring, and tag-based fleet organization. Route financial tracking provides line-item expense management, payment tracking, and profitability analysis. Driver document compliance ensures DOT-ready document uploads with expiry tracking and automated email notifications. The core operational unit is a Route that ties together a driver, a truck, finances, and all associated documents. Drivers access a read-only portal. A system admin portal manages tenants. All intelligence features currently use mock data with API contracts designed for future hardware integration.

## Core Value

Logistics owners can manage their entire operation — trucks, drivers, routes, finances, and compliance documents — from one platform, with fleet intelligence dashboards providing real-time visibility into vehicle location, driver safety, and fuel efficiency.

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

<!-- Shipped and confirmed in v3.0 -->

- ✓ Route finance tracking with line-item expenses (gas, driver salary, insurance, tolls, custom categories) — v3.0
- ✓ Route payment tracking with total operating cost, profit calculation, and payment status — v3.0
- ✓ Expense categories and templates with system defaults and tenant customization — v3.0
- ✓ Cost-per-mile analysis with fleet average comparison and profit margin alerts — v3.0
- ✓ Unified route view/edit page with seamless mode toggling and optimistic locking — v3.0
- ✓ Driver document uploads (license, application, general) with multipart support up to 100MB — v3.0
- ✓ Driver document expiry tracking with color-coded status badges — v3.0
- ✓ Automated expiry notifications at 30/60/90 day milestones via cron — v3.0

### Active

(None — start next milestone to define new requirements)

### Out of Scope

- Mobile native app — web-first, responsive design works well
- Real hardware/telematics integration — mock data with hardware-ready APIs designed
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
- v3.0 shipped — Route finance tracking, unified route page, driver document compliance uploads
- Tech stack: Next.js 16 + PostgreSQL 17 (RLS) + Clerk + Prisma 7 + AWS S3 + Resend + Leaflet + Recharts
- 71,500+ lines of TypeScript across 18 phases
- All fleet intelligence features use mock/simulated data with API contracts for future hardware integration
- Deployed on Railway with Cloudflare R2 for file storage
- Key UI patterns: icon sidebar, map-first vehicle view, collapsible detail panels, severity-weighted safety scores, MPG leaderboards
- Tag-based fleet organization enables cross-dashboard filtering
- Financial calculations use Decimal.js for precision (matching Prisma.Decimal pattern)
- Soft delete pattern for financial records preserves audit trail
- Defense-in-depth s3Key validation for tenant-isolated document uploads

## Constraints

- **Multi-tenancy**: Complete data isolation between tenants — no data leakage
- **Security**: Auth must be production-grade from day one (SaaS with multiple companies)
- **Scalability**: Architecture must support growing number of tenants without rework
- **Mock data**: All intelligence features use mock data — API contracts must be hardware-ready for future integration
- **Financial precision**: All money calculations use Decimal.js, never JavaScript number type

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
| Decimal.js for financial calculations | Prevents floating-point rounding errors in money amounts | ✓ Good — matches Prisma.Decimal pattern |
| Optimistic locking on Route model | Version field prevents concurrent edit race conditions | ✓ Good — clean conflict detection |
| Soft delete for financial records | Preserves audit trail for tax/compliance requirements | ✓ Good — never lose financial data |
| Multipart upload for large files | Handles 50-100MB scanned compliance documents with progress tracking | ✓ Good — direct-to-R2 presigned URLs |
| Defense-in-depth s3Key validation | Tenant prefix + entity ownership checks in 4 locations | ✓ Good — prevents cross-tenant access |
| Milestone-based expiry notifications | 30/60/90 day intervals prevent notification fatigue vs daily alerts | ✓ Good — clean idempotency |

---
*Last updated: 2026-02-17 after v3.0 milestone completed (Route Finance & Driver Documents)*
