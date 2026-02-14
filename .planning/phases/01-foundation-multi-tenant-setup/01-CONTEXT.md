# Phase 1: Foundation & Multi-Tenant Setup - Context

**Gathered:** 2026-02-14
**Status:** Ready for planning

<domain>
## Phase Boundary

Multi-tenant database architecture with complete data isolation. This phase delivers: PostgreSQL schema with tenant_id on all scoped tables, Row-Level Security policies, tenant provisioning, Next.js middleware for tenant context injection, and a base repository pattern that filters all queries by tenant. Authentication UI and role-based access are Phase 2.

</domain>

<decisions>
## Implementation Decisions

### Tenant Identification
- Single domain with auth-based tenant resolution — no tenant in the URL
- Tenant is resolved from the logged-in user's account (Clerk metadata → tenant_id)
- One company per user — no multi-tenant switching needed
- No subdomain or path-based routing required

### Provisioning Behavior
- Empty workspace on signup — owner starts adding real data (trucks, drivers, routes) immediately
- No sample/demo data seeded
- Email verification required before tenant becomes active (Clerk handles this)
- Full onboarding form at signup: email, password, company name, phone, address
- Tenant record created after email verification completes

### Initial Schema Scope
- Timestamps stored in tenant's configured timezone (tenant has a timezone setting)
- Tenant isolation tests are critical — dedicated tests verifying Tenant A cannot see Tenant B's data

### Data Isolation
- Tenant isolation tests are a must — automated tests that cross-tenant queries return zero results
- These tests are non-negotiable and must be part of the phase's verification

### Claude's Discretion
- System admin model: platform-level admins vs special admin tenant — Claude picks best approach
- Tenant identifier type: UUID vs readable slug — Claude decides
- Table scope: foundation-only vs all tables upfront — Claude decides based on what's cleanest
- Soft deletes vs hard deletes — Claude decides
- Audit logging: include now or defer — Claude decides
- DB strategy: shared DB + RLS vs schema-per-tenant — Claude decides (RLS is the likely pick given the tech stack)
- Isolation depth: defense-in-depth vs standard — Claude decides
- Tenant-level config table: include now or defer — Claude decides

</decisions>

<specifics>
## Specific Ideas

- Users should be able to start working immediately after signup — zero friction to adding first truck/driver/route
- Tenant isolation is the #1 priority of this phase — if this fails, the entire platform is compromised
- Tech stack is locked: Next.js 16 + PostgreSQL 17 + Clerk + Prisma 7

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-multi-tenant-setup*
*Context gathered: 2026-02-14*
