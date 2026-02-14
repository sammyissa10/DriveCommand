# DriveCommand

## What This Is

A multi-tenant SaaS web platform for logistics fleet management. Logistics company owners sign up, manage their trucks, drivers, and routes through a dedicated portal. The core operational unit is a Route — which ties together a driver, a truck, and all associated documents (shipping docs, inspections, compliance). Drivers access a read-only portal showing their assigned route, truck, and documents. A system admin portal allows platform operators to manage tenants.

## Core Value

Logistics owners can manage their entire operation — trucks, drivers, routes, and documents — from one platform, with each route showing the full picture (driver + truck + documents + status) on a single screen.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multi-tenant architecture with complete data isolation between companies
- [ ] Three portals: System Admin, Owner/Manager, Driver
- [ ] Route management — create one-time or recurring routes with lifecycle statuses (Planned, In Progress, Completed)
- [ ] Route detail — unified view showing assigned driver, truck, documents, and status
- [ ] Truck CRUD with structured fields (make, model, year, VIN, license plate, odometer)
- [ ] Truck document storage (file uploads + structured fields: registration, insurance, inspection certs)
- [ ] Driver management — manager-provisioned accounts with invite-based onboarding
- [ ] Driver-truck-route assignment — assign a driver and truck to each route
- [ ] Driver portal — read-only view of assigned route, truck, and route documents
- [ ] Owner can view drivers, trucks, and routes individually and together
- [ ] Route documents — shipping docs, delivery receipts, inspection forms, compliance paperwork, and more
- [ ] Maintenance records — log past maintenance events per truck
- [ ] Service scheduling — schedule future services with time and mileage triggers
- [ ] Dashboard + email reminders for upcoming services and expiring documents
- [ ] Fleet overview dashboard with filtering and sorting
- [ ] Self-service company signup + system admin tenant management
- [ ] Role-based access control (System Admin, Owner/Manager, Driver)
- [ ] Secure authentication for all portals

### Out of Scope

- Mobile native app — web-first for v1
- Real-time GPS tracking — high complexity, not core to management value
- Billing/subscription management — defer until product-market fit validated
- Push notifications — dashboard + email sufficient for v1
- Route optimization / dispatch algorithms — different domain (logistics routing)
- Fuel card integrations — manual logging acceptable for v1

## Context

- SaaS product for logistics companies as paying customers
- No existing codebase — greenfield build
- Tech stack: Next.js 16 + PostgreSQL 17 (RLS) + Clerk + Prisma 7 + Cloudflare R2 + Resend (from research)
- Core data model: Route = Driver + Truck + Documents + Status
- Routes can be one-time trips or recurring assignments
- Route lifecycle: Planned → In Progress → Completed
- Driver accounts are manager-provisioned, not self-registered
- Drivers see only their assigned route/truck — no company-wide data

## Constraints

- **Multi-tenancy**: Complete data isolation between tenants — no data leakage
- **Security**: Auth must be production-grade from day one (SaaS with multiple companies)
- **Scalability**: Architecture must support growing number of tenants without rework

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Three portals (Admin, Owner, Driver) | Multi-tenant SaaS needs platform admin; owners and drivers have distinct needs | — Pending |
| Route as core operational unit | Routes tie together driver + truck + documents — reflects real logistics operations | — Pending |
| Manager-provisioned driver accounts | Prevents unauthorized access to fleet data | — Pending |
| Dashboard + email for reminders (no push) | Simpler v1, covers primary use case | — Pending |
| Self-service signup + admin panel | Enables SaaS growth while maintaining control | — Pending |

---
*Last updated: 2026-02-14 after questioning (route-centric model clarification)*
