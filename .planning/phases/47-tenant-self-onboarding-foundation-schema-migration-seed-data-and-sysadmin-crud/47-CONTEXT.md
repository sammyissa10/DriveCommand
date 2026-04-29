# Phase 47: Tenant Self-Onboarding Foundation — Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Database foundation for tenant self-onboarding. Three deliverables in strict order:
1. **A-01** — Raw SQL DDL migration + Prisma schema update (new tables, Tenant column additions, RLS policies, isSample on domain tables)
2. **A-02** — Separate seed migration (default Plans + SYSTEM AutomationRules)
3. **A-03** — SysAdmin CRUD UI for Plans (`/admin/plans`) and Promos (`/admin/promos`)

No signup flow, no email, no hydration, no activation tracking — those are Phases B/C/D.

</domain>

<decisions>
## Implementation Decisions

### Migration Strategy
- Two separate migration directories in `apps/web/prisma/migrations/` (NOT `migrations/` — scripts/migrate.mjs reads from `prisma/migrations/<dir>/migration.sql`):
  - `apps/web/prisma/migrations/20260429000001_tenant_self_onboarding/migration.sql` — all DDL (A-01)
  - `apps/web/prisma/migrations/20260429000002_seed_plans_and_automations/migration.sql` — seed INSERT statements (A-02)
- Each migration directory contains exactly one `migration.sql` file.
- Do NOT include `BEGIN`/`COMMIT` — `scripts/migrate.mjs` wraps each file in its own transaction.
- Do NOT use `prisma migrate dev`. Migrations apply via `scripts/migrate.mjs` at deploy time.
- Update `apps/web/prisma/schema.prisma` manually to match DDL (no Prisma codegen for the migration itself).

### New Tables (A-01)
All from spec section 4. In order:
- Enums first: `FleetSizeBucket`, `TenantStatus`, `ProvisioningPhase`, `SubscriptionStatus`, `AutomationScope`, `AutomationRunStatus`
- Extend `Tenant` table: **NOTE — `slug` column already exists as nullable** (`slug String? @unique`). Migration must ALTER it to NOT NULL and add the 6 remaining columns: fleetSizeBucket, status, manualTrial, emailConfirmedAt, sampleDataSeeded, provisioningPhase. Use `ALTER TABLE "Tenant" ALTER COLUMN "slug" SET NOT NULL` (after ensuring no NULL values exist or providing a DEFAULT).
- Add `isSample BOOLEAN DEFAULT FALSE` to: `Truck`, `User`, `Customer` (or equivalent client table — check existing schema), `Load`
- New tables: `Plan`, `Promo`, `Subscription`, `ActivationProgress`, `AutomationRule`, `AutomationRun`, `AppEvent`, `TenantMetricsDaily`, `TenantHealthScore`

### RLS Policies (spec section 4.12 — hard rule)
- **Tenant-scoped tables** (get both policies): `Subscription`, `ActivationProgress`, `AutomationRun`, `AppEvent`, `TenantMetricsDaily`, `TenantHealthScore`
- **Platform-level tables** (NO RLS): `Plan`, `Promo`
- **AutomationRule** gets the partial policy: `USING (scope = 'SYSTEM' OR tenant_id = current_tenant_id())`
- Every tenant-scoped table: `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `tenant_isolation_policy`, `bypass_rls_policy`

### Money Columns
All money columns use `DECIMAL(10,2)` minimum. No FLOAT, no REAL.
Affected: `Plan.monthlyPriceCents`, `Plan.yearlyPriceCents` — spec uses Int (cents, not dollars) so no decimal needed; use INTEGER.

### Stripe Deferral
Leave nullable and do not write: `stripeProductId`, `stripeCouponId`, `stripeCustomerId`, `stripeSubscriptionId`.

### Seed Data (A-02)
Three Plans:
- Starter: key="starter", defaultTrialDays=14, monthlyPriceCents=4900, maxTrucks=5, maxUsers=5
- Pro: key="pro", defaultTrialDays=14, monthlyPriceCents=9900, maxTrucks=20, maxUsers=20
- Fleet: key="fleet", defaultTrialDays=14, monthlyPriceCents=19900, maxTrucks=null (unlimited), maxUsers=null

Six SYSTEM AutomationRules from spec section 7.4:
- `welcome_owner` — trigger: tenant.created, immediate email actions
- `no_progress_nudge` — trigger: tenant.created, delayed 1800s email
- `add_driver_nudge` — trigger: truck.created.real, condition: firstRealDriverAt isNull
- `dispatch_load_nudge` — trigger: load.created.real, condition: firstLoadInTransitAt isNull
- `trial_ending_soon` — trigger: cron.daily, condition: trialEndsAt between now+3d and now+4d
- `activation_celebration` — trigger: tenant.activated, immediate + delayed actions

### SysAdmin UI (A-03)
Follow existing SysAdmin portal patterns exactly (no new UI frameworks):
- Plans list: table view matching `/admin/billing` or `/admin/tenants` style
- Plans create/edit: modal dialog or inline form, consistent with existing admin modals
- Promos list + create: same pattern
- No delete UI for Plans (soft disable via isActive toggle)
- Promo create form includes: code, description, bonusTrialDays, discountPct, activeFrom, activeTo, maxRedemptions

### TypeScript Verification
After all three plans complete:
- `npx prisma generate` must succeed from `apps/web`
- `npx tsc --noEmit` must pass from `apps/web`
- `npm run lint` must pass from `apps/web`

### Claude's Discretion
- Exact migration timestamp format (match existing migrations/ files)
- SysAdmin page layout details (column widths, sort order) — follow existing patterns
- Error handling in SysAdmin forms (follow existing form patterns)
- SysAdmin UI uses separate create pages (not modals) — confirmed by reading existing admin pages. Use `page.tsx` + `actions.ts` pattern per section.

</decisions>

<specifics>
## Specific Ideas

- The spec (section 10) calls out email enumeration: signup should respond identically regardless of duplicate email — but that's Phase B, not relevant to A-03.
- The `Customer` table equivalent in the existing schema may be named differently. Research the actual table name before writing the migration.
- The `bypass_rls_policy` pattern already exists on other tables — copy the exact SQL from an existing migration rather than inventing it.
- Enum CHECK constraints must match Zod enums in `packages/validation` — verify these match before committing.
- The migration runner at `scripts/migrate.mjs` must fail-fast — that was fixed in Phase 01-02; don't regress it.

</specifics>

<deferred>
## Deferred Ideas

- Signup flow, email templates, session creation — Phase B
- Hydration / sample data seeding — Phase B
- Activation tracker hooks in domain actions — Phase C
- Automations engine (emitEvent, evaluator, action handlers) — Phase D
- Cron routes (aggregate-tenant-metrics, compute-health-scores, run-scheduled-automations) — Phase D
- SysAdmin tenant detail page enhancements (activation panels, health score, timeline) — Phase D

</deferred>

---

*Phase: 47-tenant-self-onboarding-foundation-schema-migration-seed-data-and-sysadmin-crud*
*Context gathered: 2026-04-29*
