# DriveCommand

## What This Is

A multi-tenant SaaS web platform for fleet management. Companies sign up, add their vehicles and drivers, and manage maintenance records, service schedules, and vehicle documentation through role-based portals. Managers get full control; drivers see only their assigned vehicle.

## Core Value

Managers can track and manage their entire fleet — vehicles, drivers, maintenance, and documentation — from one place, with complete tenant isolation between companies.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Multi-tenant architecture with complete data isolation between companies
- [ ] Owner/Manager portal with full fleet visibility and control
- [ ] Driver portal with read-only access to assigned vehicle only
- [ ] Vehicle CRUD with structured fields (VIN, registration, insurance expiry, etc.)
- [ ] Document storage per vehicle (file uploads: PDFs, images, scans)
- [ ] Maintenance records — log past maintenance events
- [ ] Service scheduling — schedule future services with reminders
- [ ] Dashboard + email reminders for upcoming services
- [ ] Flexible driver-to-vehicle assignment (unassigned allowed, reassignment anytime)
- [ ] Manager creates driver accounts (invite-based onboarding)
- [ ] Self-service company signup + platform admin tenant management
- [ ] Role-based access control (Owner/Manager, Driver, Platform Admin)
- [ ] Secure authentication for all portals

### Out of Scope

- Mobile native app — web-first for v1
- Real-time GPS tracking — high complexity, not core to management value
- Billing/subscription management — defer until product-market fit validated
- Push notifications — dashboard + email sufficient for v1

## Context

- SaaS product intended for multiple companies as paying customers
- No existing codebase — greenfield build
- Tech stack to be determined by research
- Driver accounts are manager-provisioned, not self-registered
- Each driver maps to one vehicle; vehicles can exist without a driver assigned

## Constraints

- **Multi-tenancy**: Complete data isolation between tenants — no data leakage
- **Security**: Auth must be production-grade from day one (SaaS with multiple companies)
- **Scalability**: Architecture must support growing number of tenants without rework

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Manager-provisioned driver accounts | Prevents unauthorized access to fleet data | — Pending |
| Dashboard + email for reminders (no push) | Simpler v1, covers primary use case | — Pending |
| Self-service signup + admin panel | Enables SaaS growth while maintaining control | — Pending |
| Tech stack deferred to research | No strong preferences; let domain research inform choices | — Pending |

---
*Last updated: 2026-02-14 after initialization*
