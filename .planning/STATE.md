# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Logistics owners can manage their entire operation — trucks, drivers, routes, and documents — from one platform, with each route showing the full picture (driver + truck + documents + status) on a single screen.
**Current focus:** Phase 2 - Authentication & Authorization

## Current Position

Phase: 2 of 10 (Authentication & Authorization)
Plan: 2 of 3 in current phase
Status: In progress
Last activity: 2026-02-14 — Completed plan 02-02-PLAN.md (Authentication UI)

Progress: [██░░░░░░░░] 17%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 4 min
- Total execution time: 0.35 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01    | 3     | 16 min | 5 min    |
| 02    | 2     | 5 min  | 2 min    |

**Recent Trend:**
- Last 5 plans: 5min, 3min, 3min, 3min, 2min
- Trend: Improving velocity

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Three portals (Admin, Owner, Driver): Multi-tenant SaaS needs platform admin; owners and drivers have distinct needs
- Route as core operational unit: Routes tie together driver + truck + documents — reflects real logistics operations
- Manager-provisioned driver accounts: Prevents unauthorized access to fleet data

**From Plan 01-01 (2026-02-14):**
- UUID primary keys (not slugs) for security - slug is optional field on Tenant
- Hard deletes (no deletedAt field) - simpler for v1
- isSystemAdmin boolean on User - platform-level admin, not special tenant
- All timestamps use TIMESTAMPTZ - store UTC, display in tenant timezone
- Conditional ClerkProvider - allows build without Clerk keys for development
- Manual migration creation - no database running yet, RLS policies require customization

**From Plan 01-02 (2026-02-14):**
- Transaction-local set_config (third param TRUE) prevents connection pool contamination
- Tenant resolved from Clerk privateMetadata, not URL or subdomain
- Middleware uses standard filename (middleware.ts) for Next.js 16
- Webhook is idempotent with existence check before tenant creation
- x-tenant-id header as tenant context carrier between middleware and API routes
- @ts-ignore for PrismaClient constructor due to Prisma 7 type issue

**From Plan 01-03 (2026-02-14):**
- Repository constructor takes tenantId parameter (not fetched from context) for flexibility in tests and API routes
- Provisioning repository uses transaction-local bypass_rls for operations that create/query tenants
- Tests use real PostgreSQL with actual RLS policies, not mocks or SQLite
- Test helpers use bypass_rls in transaction-local scope for setup/teardown
- Vitest timeout set to 30s to accommodate database operations

**From Plan 02-01 (2026-02-14):**
- UserRole enum includes SYSTEM_ADMIN (not in Prisma enum) for authorization logic - system admins identified by isSystemAdmin boolean
- ROLE_HIERARCHY uses numeric levels for future permission comparison (SYSTEM_ADMIN: 100, OWNER: 50, MANAGER: 40, DRIVER: 10)
- Dual role storage: Clerk publicMetadata for fast session-based checks, database isSystemAdmin for special admin flag
- Type assertion workaround for Clerk publicMetadata.role until type augmentation is properly configured
- Webhook sets publicMetadata.role in both new user and idempotency paths for consistency

### Pending Todos

None yet.

### Blockers/Concerns

**From Research:**
- Phase 1: Tenant isolation is critical — failure here causes data leakage across all subsequent phases
- Phase 6: File upload security must be bulletproof (MIME validation, virus scanning, randomized names)
- Phase 9: Dual-trigger reminder logic (time AND mileage) requires careful implementation to avoid missing alerts

## Session Continuity

Last session: 2026-02-14 (phase execution)
Stopped at: Completed 02-02-PLAN.md (Authentication UI)
Resume file: .planning/phases/02-authentication-authorization/02-02-SUMMARY.md
