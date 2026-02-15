# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-02-14)

**Core value:** Logistics owners can manage their entire operation — trucks, drivers, routes, and documents — from one platform, with each route showing the full picture (driver + truck + documents + status) on a single screen.
**Current focus:** Phase 8 - Maintenance & Scheduling

## Current Position

Phase: 8 of 10 (Maintenance & Scheduling)
Plan: 1 of 2 in current phase
Status: In progress
Last activity: 2026-02-15 — Plan 08-01 complete (maintenance data layer)

Progress: [████████░░] 75%

## Performance Metrics

**Velocity:**
- Total plans completed: 17
- Average duration: 3.7 min
- Total execution time: 1.18 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01    | 3     | 16 min | 5 min    |
| 02    | 3     | 6 min  | 2 min    |
| 03    | 2     | 7 min  | 3.5 min  |
| 04    | 2     | 7 min  | 3.5 min  |
| 05    | 2     | 8 min  | 4 min    |
| 06    | 2     | 15 min | 7.5 min  |
| 07    | 2     | 6 min  | 3 min    |
| 08    | 1     | 5 min  | 5 min    |

**Recent Trend:**
- Last 5 plans: 7min, 7.7min, 1.9min, 3.7min, 5.1min
- Trend: Excellent velocity

*Updated after each plan completion*

**Recent Executions:**

| Plan | Duration (s) | Tasks | Files |
|------|--------------|-------|-------|
| Phase 08-maintenance-scheduling P01 | 307 | 2 tasks | 5 files |
| Phase 07-driver-portal P02 | 220 | 2 tasks | 4 files |
| Phase 06 P02 | 463 | 2 tasks | 6 files |
| Phase 06 P01 | 403 | 2 tasks | 11 files |
| Phase 05 P02 | 297 | 2 tasks | 11 files |

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
- [Phase 02-03]: Layout auth checks are UX-only; security enforced in server actions and Data Access Layer
- [Phase 02-03]: RoleGuard returns null during loading to prevent content flash
- [Phase 02-03]: Each portal has distinct visual styling (dark for admin, white for owner, blue for driver)

**From Plan 03-01 (2026-02-14):**
- JSONB for documentMetadata instead of separate table - flexible storage for registration/insurance fields without schema changes
- Composite unique constraint on tenantId + VIN - VIN must be unique per tenant, allows same VIN across tenants (e.g., fleet sold)
- Odometer as integer (whole miles) - federal ELD regulations require whole miles only, enforces compliance at database level
- @ts-ignore for extended Prisma client - follows Phase 01 pattern for type inference issues with withTenantRLS extension

**From Plan 03-02 (2026-02-14):**
- TanStack Table for truck list - industry-standard table library with built-in sorting, filtering, and column management
- useOptimistic for delete feedback - React 19 pattern provides instant UI feedback while server action processes
- Separate client wrapper components - server components for data fetching, client components only where interactivity needed
- Document metadata in collapsible section - groups registration/insurance fields under 'Documents' heading

**From Plan 04-01 (2026-02-14):**
- Soft delete (isActive) for drivers instead of hard delete - preserves audit trail and prevents orphaned foreign keys in route assignments
- Automatic cancellation of pending invitations before creating new one - prevents duplicate invites to same email
- Session revocation on deactivation - ensures immediate logout via clerk.sessions.revokeSession(), not just database flag
- Permissive license number validation with regex /^[A-Z0-9\s\-]+$/i - accommodates different state formats (5-20 chars)
- Store tenantId in Clerk invitation publicMetadata - webhook can use it to assign driver to correct tenant on acceptance

**From Plan 04-02 (2026-02-14):**
- Single DriverForm with mode prop - reusable for both invite (with email) and edit (without email, pre-filled)
- Status badge color coding (green for Active, red for Deactivated) in both list and detail views
- Confirmation dialogs for deactivate (warns about immediate logout) and reactivate actions
- useOptimistic for status toggles - instant UI feedback while server action processes
- Webhook validates invitation expiry before creating user - expired invitations marked EXPIRED and rejected

**From Plan 05-01 (2026-02-14):**
- RouteStatus enum enforces three-state lifecycle (PLANNED, IN_PROGRESS, COMPLETED) at database level
- State machine with VALID_TRANSITIONS prevents invalid status changes (e.g., COMPLETED cannot transition back)
- completedAt timestamp automatically set when route transitions to COMPLETED status
- scheduledDate validated as string (not z.string().datetime()) because HTML datetime-local sends 'YYYY-MM-DDTHH:mm' without timezone offset
- Date utilities use Intl.DateTimeFormat (no external libraries) for timezone-aware formatting to avoid hydration mismatches
- Business rule validation before route creation: driver must be active, have DRIVER role, and truck must exist
- Both OWNER and MANAGER can manage routes, but DRIVER can only view (list and get actions)

**From Plan 05-02 (2026-02-14):**
- Unified detail view shows route + driver + truck on one screen (ROUT-04 requirement)
- Active drivers only in dropdown: new/edit pages query WHERE isActive=true for driver selection
- Status transition buttons rendered conditionally based on current status (PLANNED shows Start, IN_PROGRESS shows Complete, COMPLETED shows checkmark)
- Nullable firstName/lastName handling: database schema allows null, UI renders empty string fallback
- Optimistic delete for instant UI feedback using React 19 useOptimistic hook

**From Plan 06-01 (2026-02-14):**
- Lazy S3 client initialization via Proxy to allow build without S3 env vars
- Magic bytes validation using file-type library (4100 bytes read) to prevent MIME spoofing
- Tenant-prefixed S3 keys (tenant-{id}/{category}/{fileId}-{filename}) for storage isolation
- Defense in depth: verify tenant prefix on every S3 key operation in server actions
- 5-minute presigned upload URLs, 1-hour download URLs (balance security vs usability)
- File size limit 10MB enforced at both validation and Next.js serverActions.bodySizeLimit
- Document associated with exactly one entity (truck OR route) enforced via Zod schema
- Fixed Prisma client initialization with engineType='library' and empty constructor

**From Plan 06-02 (2026-02-14):**
- Client wrapper components manage state and refresh, not the page components (server/client separation)
- router.refresh() triggers server-side re-fetch after upload/delete (Next.js App Router pattern)
- 3-stage progress feedback: validating -> uploading -> saving (clear user feedback)
- Non-null assertions after type guards to satisfy TypeScript union narrowing limitations
- [Phase 07-01]: Driver identity resolved from getCurrentUser() session, never from parameters - prevents IDOR attacks
- [Phase 07-01]: Document ownership verified through route assignment chain for driver access control

**From Plan 07-02 (2026-02-14):**
- Semantic HTML (dl/dt/dd) for read-only data instead of disabled inputs - accessibility best practice for screen readers
- Server action passed as prop to DocumentListReadOnly - makes component reusable and testable
- Landing page uses redirect() to /my-route instead of inline rendering - cleaner URL structure, driver can bookmark directly
- No status transition buttons in driver portal - owner/manager controls route status, drivers are read-only consumers

**From Plan 08-01 (2026-02-15):**
- @ts-ignore for Prisma 7 withTenantRLS extension - follows existing pattern from Phase 03, extended client doesn't properly infer new model types
- calculateNextDue uses Date.setDate() not millisecond math - avoids DST bugs per 08-RESEARCH.md findings
- Zod .refine() enforces at least one trigger - validates business rule (intervalDays OR intervalMiles required) at schema level
- listScheduledServices augments results with dueStatus - server action computes isDue/isDueByDate/isDueByMileage before returning to UI
- Empty form fields converted to null for optional fields - FormData returns empty strings, use ternary pattern for cost/provider/notes/intervals

### Pending Todos

None yet.

### Blockers/Concerns

**From Research:**
- Phase 1: Tenant isolation is critical — failure here causes data leakage across all subsequent phases
- Phase 6: File upload security must be bulletproof (MIME validation, virus scanning, randomized names)
- Phase 9: Dual-trigger reminder logic (time AND mileage) requires careful implementation to avoid missing alerts

## Session Continuity

Last session: 2026-02-15 (phase execution)
Stopped at: Phase 08 Plan 01 complete (maintenance data layer)
Resume file: .planning/phases/08-maintenance-scheduling/08-01-SUMMARY.md
