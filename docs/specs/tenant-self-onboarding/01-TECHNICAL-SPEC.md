# Tenant Self-Onboarding — Technical Specification

**For:** Junior developer building this in Claude Code with the GSD skill
**Project:** DriveCommand
**Status:** Ready to build
**Last updated:** 2026-04-25

---

## 1. What You Are Building

A complete self-serve signup and onboarding system for DriveCommand. A trucking-company owner visits the marketing site, fills out a 6-field signup form, and within seconds is logged in to a fully provisioned tenant with sample data, a 5-step activation checklist, and behavior-driven email automations guiding them to dispatch their first load.

The DriveCommand team monitors these new tenants from the SysAdmin portal at `/admin`, where every tenant has a detail page showing activation progress, engagement, adoption, resource usage, a health score, and a full activity timeline.

This spec covers the entire feature except Stripe billing, which is intentionally deferred. All trial/billing fields are scaffolded so the Stripe wiring can be added at the end without schema changes.

---

## 2. Tech Stack You Will Use (Already in the Project)

You are not picking a stack. The project already uses:

- **Framework:** Next.js 16 (App Router, Server Components, Server Actions)
- **Database:** PostgreSQL via Supabase, accessed through Prisma 7 with the `pg` adapter
- **Migrations:** Raw SQL files in `migrations/` folder, applied by `scripts/migrate.mjs` at deploy time. Do not use `prisma migrate dev` for production.
- **Auth:** Custom session cookie (AES-256-GCM, `session` cookie, 7-day expiry). See `src/lib/auth/session.ts` and `src/lib/auth/server.ts`. Clerk is NOT used in current state — passwords are bcrypt-hashed and stored on `User.passwordHash`.
- **Multi-tenancy:** Postgres Row-Level Security (RLS) on every tenant-scoped table, with a `current_tenant_id()` SQL function reading the `app.tenant_id` session variable, and a `bypass_rls` pattern for cross-tenant operations (signup, sysadmin).
- **Email:** Gmail SMTP via Nodemailer, see `src/lib/email/gmail-client.ts`. Templates use `@react-email/components` and live in `src/emails/`.
- **Cron:** Vercel Cron registered in `vercel.json`, hitting `/api/cron/...` routes guarded by `CRON_SECRET`.
- **UI:** Tailwind + shadcn/ui components.
- **SysAdmin auth:** Separate `admin_session` AES-256-GCM cookie keyed off `ADMIN_SECRET_KEY`. Lives in `src/lib/auth/admin-session.ts`. The SysAdmin portal is at the `(admin)` route group.

You will follow these existing patterns exactly. Do not introduce new auth libraries, new ORMs, or new email providers.

---

## 3. Decisions Already Made (Do Not Re-Decide)

| Topic | Decision |
|---|---|
| Trial duration | 14 days, default |
| Trial collected upfront | Card NOT required for v1 (Stripe not yet wired). When Stripe is added later, switch to card-required. |
| Provisioning model | Two-phase. Tenant + Owner User created at signup. Sample data + Stripe customer (later) created on first authenticated landing. |
| Empty-state strategy | Pre-populated sample data (truck, driver, client, completed load, in-transit load) clearly labeled with `isSample = true` and a SAMPLE pill in the UI. Forked by `fleetSizeBucket`. |
| Onboarding checklist | Exactly 5 items. Item 1 (account created) auto-completed. |
| Activation event | A real (non-sample) Load reaches `IN_PROGRESS` or `COMPLETED` status with a real Driver and a real Truck assigned. |
| Owner role | Owner = tenant_admin = billing_admin. Single User row with `role = 'OWNER'`. |
| Trial length resolution | Plan default + Promo bonus days, calculated at signup, stored as `trialEndsAt` on Subscription. SysAdmin can override `manualExtensionUntil`. |
| Automations engine | Config-driven `AutomationRule` table, evaluated by an event-driven worker. NOT Customer.io / NOT a visual builder for v1. |
| Telemetry in v1 | Six dimensions: activation, engagement, adoption breadth, adoption depth, resource consumption, health/risk score. |
| Email confirmation | User logged in immediately. Email confirmation required before subscription activates. |
| URL strategy | Path-based (`app.drivecommand.io/t/<slug>`). `slug` column lives on Tenant from day one. |
| Signup fields | First name, last name, work email, password, company name, fleet size bucket. |
| Auth method | Email + password (matches existing system). Magic link and SSO deferred. |
| Sample data seed | 1 truck, 1 driver, 1 client, 1 completed load, 1 in-transit load. Forked by fleet size bucket. |
| SysAdmin tenant detail | Header + activation panel + engagement panel + adoption panel + resource panel + health score + activity timeline + billing panel (placeholder until Stripe). |

---

## 4. Database Schema — New Tables and Columns

You will add the following to `prisma/schema.prisma` and write a migration SQL file at `migrations/<timestamp>__tenant_self_onboarding.sql`.

### 4.1 Modify `Tenant` table

Add these columns to the existing `Tenant` model:

```
slug                String   @unique               // URL slug, e.g., "acme-trucking"
fleetSizeBucket     FleetSizeBucket                // OWNER_OPERATOR (1-3), SMALL (4-15), MEDIUM (16-50), LARGE (50+)
status              TenantStatus  @default(TRIAL)  // TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED
manualTrial         Boolean  @default(false)       // True when SysAdmin granted trial without card (sales-assisted)
emailConfirmedAt    DateTime?                      // Owner email confirmation timestamp
sampleDataSeeded    Boolean  @default(false)       // True after first landing seeds samples
provisioningPhase   ProvisioningPhase @default(MINIMAL) // MINIMAL (just tenant+user), HYDRATED (samples seeded)
```

Enums to add:
- `FleetSizeBucket` { OWNER_OPERATOR, SMALL, MEDIUM, LARGE }
- `TenantStatus` { TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED }
- `ProvisioningPhase` { MINIMAL, HYDRATED }

### 4.2 New table: `Plan`

Subscription plans (Starter, Pro, Fleet). Pre-seeded.

```
id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
key                 String   @unique               // "starter", "pro", "fleet"
name                String                         // "Starter", "Pro", "Fleet"
description         String?
defaultTrialDays    Int      @default(14)
monthlyPriceCents   Int                            // e.g. 4900 for $49.00
yearlyPriceCents    Int?                           // optional yearly pricing
maxTrucks           Int?                           // soft seat limits, null = unlimited
maxUsers            Int?
storageGbLimit      Int?
isActive            Boolean  @default(true)
sortOrder           Int      @default(0)
stripeProductId     String?                        // populated when Stripe added later
createdAt           DateTime @default(now()) @db.Timestamptz
updatedAt           DateTime @updatedAt @db.Timestamptz
```

### 4.3 New table: `Promo`

Promotional codes / seasonal trial extensions.

```
id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
code                String   @unique               // "SPRING2026"
description         String?
bonusTrialDays      Int      @default(0)           // added on top of plan's defaultTrialDays
discountPct         Int?                           // 0-100, optional discount
activeFrom          DateTime @db.Timestamptz
activeTo            DateTime @db.Timestamptz
maxRedemptions      Int?                           // null = unlimited
redemptionCount     Int      @default(0)
isActive            Boolean  @default(true)
stripeCouponId      String?                        // populated when Stripe added later
createdAt           DateTime @default(now()) @db.Timestamptz
updatedAt           DateTime @updatedAt @db.Timestamptz
```

### 4.4 New table: `Subscription`

One row per tenant, owns the trial/billing state.

```
id                      String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
tenantId                String   @unique @db.Uuid
planId                  String   @db.Uuid
promoId                 String?  @db.Uuid
status                  SubscriptionStatus @default(TRIALING)
trialEndsAt             DateTime @db.Timestamptz   // resolved at signup: now + plan.defaultTrialDays + (promo?.bonusTrialDays ?? 0)
manualExtensionUntil    DateTime? @db.Timestamptz  // SysAdmin extension
currentPeriodStart      DateTime? @db.Timestamptz  // populated when Stripe added later
currentPeriodEnd        DateTime? @db.Timestamptz
stripeCustomerId        String?
stripeSubscriptionId    String?
cancelAtPeriodEnd       Boolean  @default(false)
createdAt               DateTime @default(now()) @db.Timestamptz
updatedAt               DateTime @updatedAt @db.Timestamptz

tenant                  Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
plan                    Plan     @relation(fields: [planId], references: [id])
promo                   Promo?   @relation(fields: [promoId], references: [id])

@@index([tenantId])
@@index([status])
@@index([trialEndsAt])
```

`SubscriptionStatus` enum: `TRIALING, ACTIVE, PAST_DUE, CANCELLED, SUSPENDED`.

### 4.5 New table: `ActivationProgress`

One row per tenant. Tracks the 5-item checklist + the activation event.

```
id                          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
tenantId                    String   @unique @db.Uuid
accountCreatedAt            DateTime @default(now()) @db.Timestamptz
firstRealTruckAt            DateTime? @db.Timestamptz
firstRealDriverAt           DateTime? @db.Timestamptz
firstRealClientAt           DateTime? @db.Timestamptz
firstRealLoadCreatedAt      DateTime? @db.Timestamptz
firstLoadInTransitAt        DateTime? @db.Timestamptz   // ACTIVATION EVENT
firstLoadDeliveredAt        DateTime? @db.Timestamptz
completionPct               Int      @default(20)         // 20 because account_created auto-counts as 1/5
isActivated                 Boolean  @default(false)      // computed: true once firstLoadInTransitAt set
createdAt                   DateTime @default(now()) @db.Timestamptz
updatedAt                   DateTime @updatedAt @db.Timestamptz

tenant                      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

@@index([tenantId])
@@index([isActivated])
```

### 4.6 Add `isSample` column to existing domain tables

The seeded sample records must be distinguishable from real data so they:
- Show a SAMPLE pill in the UI
- Are excluded from activation calculations
- Are excluded from billable storage and seat counts

Add this column to: `Truck`, `User` (only DRIVER role samples), `Customer` (or your equivalent client table), `Load`.

```
isSample            Boolean  @default(false)
```

### 4.7 New table: `AutomationRule`

Config-driven rules. SysAdmin can edit copy and toggle on/off.

```
id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
key                 String   @unique               // stable identifier, e.g. "welcome_owner"
name                String                         // human-readable
description         String?
triggerEvent        String                         // event_type from AppEvent table, e.g. "tenant.created"
conditionsJson      Json     @default("{}")        // tenant state filters, e.g. {"days_since_signup": {"gte": 1}}
actionsJson         Json                           // [{"type":"send_email","template":"welcome_owner","delaySeconds":0}]
scope               AutomationScope @default(SYSTEM) // SYSTEM (all tenants) or TENANT (per-tenant override)
tenantId            String?  @db.Uuid              // null when scope=SYSTEM
isActive            Boolean  @default(true)
runOncePerTenant    Boolean  @default(true)        // if true, never re-fires for the same tenant
createdAt           DateTime @default(now()) @db.Timestamptz
updatedAt           DateTime @updatedAt @db.Timestamptz

@@index([triggerEvent, isActive])
@@index([tenantId])
```

`AutomationScope` enum: `SYSTEM, TENANT`.

### 4.8 New table: `AutomationRun`

Audit log of every fired (or skipped) rule.

```
id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
ruleId              String   @db.Uuid
tenantId            String   @db.Uuid
userId              String?  @db.Uuid
triggeredBy         String                         // event_type that triggered evaluation
status              AutomationRunStatus            // FIRED, SKIPPED_CONDITION, SKIPPED_ALREADY_RAN, FAILED
resultJson          Json?                          // action results, error details
firedAt             DateTime @default(now()) @db.Timestamptz

@@index([ruleId])
@@index([tenantId])
@@index([firedAt])
```

`AutomationRunStatus` enum: `FIRED, SKIPPED_CONDITION, SKIPPED_ALREADY_RAN, FAILED`.

### 4.9 New table: `AppEvent`

Append-only event log. The source of truth for engagement metrics and the trigger source for automations.

```
id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
tenantId            String   @db.Uuid
userId              String?  @db.Uuid
eventType           String                         // e.g. "tenant.created", "load.in_transit", "user.login"
properties          Json     @default("{}")
createdAt           DateTime @default(now()) @db.Timestamptz

@@index([tenantId, createdAt])
@@index([eventType, createdAt])
@@index([userId, createdAt])
```

This table will grow large. Plan to partition by month later. For v1, just index aggressively.

### 4.10 New table: `TenantMetricsDaily`

Pre-aggregated metrics for fast SysAdmin queries. Computed by a daily cron.

```
id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
tenantId            String   @db.Uuid
date                DateTime @db.Date
dauCount            Int      @default(0)
sessionCount        Int      @default(0)
keyActionCount      Int      @default(0)
storageBytes        BigInt   @default(0)
seatsUsed           Int      @default(0)
loadsCreated        Int      @default(0)
loadsInTransit      Int      @default(0)

@@unique([tenantId, date])
@@index([tenantId])
@@index([date])
```

### 4.11 New table: `TenantHealthScore`

Composite churn-risk score (0-100). Recomputed daily.

```
id                  String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
tenantId            String   @unique @db.Uuid
score               Int                            // 0-100
topFactorsJson      Json                           // [{"factor": "no_login_7_days", "weight": -25}, ...]
computedAt          DateTime @default(now()) @db.Timestamptz

@@index([score])
```

### 4.12 RLS policies

Every new tenant-scoped table (`Subscription`, `ActivationProgress`, `AutomationRule` when scope=TENANT, `AutomationRun`, `AppEvent`, `TenantMetricsDaily`, `TenantHealthScore`) gets the same two policies that exist on other tables:

```sql
ALTER TABLE "TableName" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TableName" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "TableName"
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "TableName"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

`Plan` and `Promo` are platform-level (NOT tenant-scoped) — leave RLS off. They are read by all tenants. Writes happen only from SysAdmin.

`AutomationRule` with `scope = SYSTEM` is also platform-level. Use a partial RLS policy:
```sql
CREATE POLICY tenant_isolation_policy ON "AutomationRule"
  FOR ALL
  USING (scope = 'SYSTEM' OR tenant_id = current_tenant_id());
```

---

## 5. Files You Will Create or Modify

This list is grouped by concern. The GSD plan in section 11 will break it into tasks.

### 5.1 Migration

- `migrations/<timestamp>__tenant_self_onboarding.sql` — all DDL above
- `migrations/<timestamp>__seed_plans_and_automations.sql` — seed initial Plans (Starter / Pro / Fleet) and SYSTEM AutomationRules

### 5.2 Schema

- `prisma/schema.prisma` — add models and enums

### 5.3 Validation Schemas

- `src/lib/validations/onboarding.schemas.ts` — Zod schemas for signup form, fleet-size enum

### 5.4 Provisioning Logic

- `src/lib/onboarding/provision-tenant.ts` — atomic tenant + owner user + subscription + activation_progress creation, called from signup action
- `src/lib/onboarding/seed-sample-data.ts` — fork by fleet size, insert sample truck/driver/client/loads with `isSample = true`
- `src/lib/onboarding/hydrate-tenant.ts` — orchestrates first-landing hydration: seed samples, set `provisioningPhase = HYDRATED`

### 5.5 Marketing Site Integration

The marketing site at `drivecommand.io` is separate. Document the contract: it POSTs to `/api/signup` on the app domain, and on success redirects the browser to `/onboarding/welcome?token=<one-time>`. For now, build a `/sign-up` page in the app itself that mimics the same form so the system can be tested end-to-end without the marketing site.

### 5.6 Signup Flow

- `src/app/(auth)/sign-up/page.tsx` — public signup page (server component)
- `src/app/(auth)/sign-up/sign-up-form.tsx` — client component with the 6 fields
- `src/app/(auth)/sign-up/actions.ts` — server action `signUpAction(formData)` that calls `provisionTenant`, sets session, fires `tenant.created` event, redirects to `/onboarding/welcome`

### 5.7 First-Landing Onboarding

- `src/app/onboarding/welcome/page.tsx` — server component that calls `hydrateTenant()` if `provisioningPhase = MINIMAL`, then renders the welcome screen with the 5-item checklist
- `src/app/onboarding/welcome/checklist.tsx` — client component, persistent right-side panel listing the 5 steps with completion state
- `src/components/onboarding/sample-data-banner.tsx` — yellow banner shown on dashboard pages while `isSample` records exist, "These are sample records. Add your own to get started."
- `src/components/onboarding/sample-pill.tsx` — small "SAMPLE" pill rendered next to sample records in tables

### 5.8 Email Confirmation

- `src/app/api/email-confirm/[token]/route.ts` — GET route, validates token, sets `tenant.emailConfirmedAt = now()`, redirects to dashboard
- `src/lib/email/tokens.ts` — sign and verify single-use tokens (use existing AES-GCM helpers)
- `src/emails/confirm-email.tsx` — React Email template

### 5.9 Automations Engine

- `src/lib/automations/event-bus.ts` — `emitEvent(tenantId, eventType, properties)` writes to `AppEvent` and triggers rule evaluation
- `src/lib/automations/evaluator.ts` — given a triggering event, finds matching `AutomationRule` rows, evaluates `conditionsJson`, schedules actions
- `src/lib/automations/actions/send-email.ts` — action handler that sends via Gmail SMTP using a template registry
- `src/lib/automations/actions/in-app-notification.ts` — writes to existing `NotificationLog` or new `InAppMessage` table (decide based on what already exists)
- `src/lib/automations/template-registry.ts` — maps template keys to React Email components
- `src/app/api/cron/run-scheduled-automations/route.ts` — cron entry that picks up time-delayed actions (e.g., "send 24h after no progress")

### 5.10 Activation Progress Tracking

- `src/lib/onboarding/activation-tracker.ts` — exposes `recordActivationEvent(tenantId, event)` called from domain actions when a real (non-sample) truck/driver/client/load is created or transitions
- Modify existing actions: when a non-sample Truck is created, call `recordActivationEvent(tenantId, 'first_real_truck')`; same for driver/client/load. When a Load transitions to `IN_PROGRESS`, call `recordActivationEvent(tenantId, 'first_load_in_transit')` — and that flips `isActivated = true`, fires `tenant.activated` event.

### 5.11 Telemetry Pipeline

- `src/lib/telemetry/event-types.ts` — central registry of event_type strings
- `src/lib/telemetry/track.ts` — thin wrapper around `emitEvent` for use in actions
- `src/app/api/cron/aggregate-tenant-metrics/route.ts` — daily cron, computes `TenantMetricsDaily` rows from `AppEvent`
- `src/app/api/cron/compute-health-scores/route.ts` — daily cron, computes `TenantHealthScore` rows

### 5.12 SysAdmin UI

- `src/app/(admin)/tenants/page.tsx` — already exists, ENHANCE with: trial-ending soon column, activation% column, health score column
- `src/app/(admin)/tenants/[id]/page.tsx` — already exists, ENHANCE with the new panels: activation, engagement, adoption, resources, health, activity timeline
- `src/app/(admin)/tenants/[id]/actions.ts` — add: `extendTrial(tenantId, days)`, `markEmailConfirmed(tenantId)`, `resendConfirmationEmail(tenantId)`
- `src/app/(admin)/automations/page.tsx` — list of `AutomationRule` rows
- `src/app/(admin)/automations/[id]/edit/page.tsx` — edit form for rule copy and triggers
- `src/app/(admin)/promos/page.tsx` — list of promos
- `src/app/(admin)/promos/new/page.tsx` — create promo form

### 5.13 Email Templates (`src/emails/`)

- `confirm-email.tsx` — confirmation link for new tenant owners
- `welcome-owner.tsx` — sent immediately after signup (from named human, not no-reply)
- `no-progress-nudge.tsx` — 30 minutes after signup with no checklist progress
- `next-step-add-driver.tsx` — after first truck added with no driver
- `next-step-dispatch-load.tsx` — after first load created but not dispatched
- `trial-ending-soon.tsx` — 3 days before `trialEndsAt`
- `activation-celebration.tsx` — fired on `tenant.activated`
- `driver-onboarding-checklist-prompt.tsx` — sent post-activation

### 5.14 Cron Registration

- `vercel.json` — register two new cron jobs:
  - `aggregate-tenant-metrics` — daily at 02:00 UTC
  - `compute-health-scores` — daily at 02:30 UTC
  - `run-scheduled-automations` — every 15 minutes

---

## 6. Provisioning Flow — Step-by-Step

This is the most fragile sequence. Get it right.

### 6.1 Signup Action (Phase 1: Minimal Provisioning)

User submits the 6-field form. The server action does all of the following inside a single Prisma transaction with `bypass_rls = on`:

1. Validate the form with Zod. Reject if email already exists on a `User` record.
2. Hash the password with bcrypt (12 rounds, matches existing pattern).
3. Generate a unique `slug` from company name (lowercase, kebab-case, append numeric suffix on collision).
4. Insert `Tenant` row with `status = TRIAL`, `provisioningPhase = MINIMAL`, `sampleDataSeeded = false`.
5. Insert `User` row with `role = OWNER`, `tenantId = <new>`, `passwordHash`, `firstName`, `lastName`, `email`.
6. Look up the default `Plan` (key = "starter") and any matching `Promo` (URL param `?promo=`).
7. Compute `trialEndsAt = now() + plan.defaultTrialDays + (promo?.bonusTrialDays ?? 0)` days.
8. Insert `Subscription` row with `status = TRIALING`, `trialEndsAt`, `planId`, `promoId`.
9. Insert `ActivationProgress` row with `accountCreatedAt = now()`, `completionPct = 20`.
10. Generate one-time email confirmation token, sign with AES-GCM, set 24h expiry.
11. Commit transaction.
12. After commit: emit `tenant.created` event → triggers `welcome_owner` automation rule → sends welcome email + confirmation email.
13. Set `session` cookie for the owner user.
14. Redirect to `/onboarding/welcome`.

If any step fails before commit, the entire transaction rolls back. There is no half-provisioned tenant.

### 6.2 First-Landing (Phase 2: Hydration)

User lands on `/onboarding/welcome` for the first time. Server component runs:

1. Read session, get `tenantId`.
2. Load tenant record. If `provisioningPhase = MINIMAL`, call `hydrateTenant(tenantId)`.
3. `hydrateTenant`:
   - Wraps in transaction with tenant context set (`set_config('app.tenant_id', :tenantId, TRUE)`)
   - Reads `tenant.fleetSizeBucket`
   - Calls `seedSampleData(tenantId, fleetSizeBucket)` which inserts the 5 sample records based on the bucket
   - Sets `provisioningPhase = HYDRATED`, `sampleDataSeeded = true`
   - Commits
4. Render the welcome page with checklist and sample data visible on the dashboard.

`hydrateTenant` is idempotent — if `provisioningPhase = HYDRATED`, it returns immediately. This protects against double-hits from refresh.

### 6.3 Sample Data Seed Forks

| Fleet size bucket | Samples |
|---|---|
| OWNER_OPERATOR (1-3) | 1 truck (Freightliner Cascadia 2022), 1 driver ("John Sample"), 1 client ("ACME Logistics"), 1 completed load (Chicago → Indianapolis), 1 in-transit load (Indianapolis → Detroit) |
| SMALL (4-15) | 3 trucks (varied makes), 3 drivers, 2 clients, 1 completed load, 2 in-transit loads |
| MEDIUM (16-50) | 3 trucks, 3 drivers, 2 clients, 1 completed load, 2 in-transit loads (same as SMALL — owner will have a dispatcher feel) |
| LARGE (50+) | Same as MEDIUM — at this size they'll likely import their own data; samples just teach structure |

All samples have `isSample = true`. Samples never carry fabricated revenue or KPI numbers — sample loads have realistic distances and dates but the dashboard displays "$0 — your sample loads are excluded from totals" until real data exists.

---

## 7. Automations Engine — How It Works

### 7.1 Event flow

Domain code calls `emitEvent(tenantId, eventType, properties)`. This:

1. Writes to `AppEvent` table.
2. Calls `evaluateRules(eventType, tenantId)`.
3. `evaluateRules` selects matching `AutomationRule` rows where `triggerEvent = eventType` AND `isActive = true` AND (`scope = SYSTEM` OR `tenantId = ?`).
4. For each rule, evaluates `conditionsJson` against current tenant state. If `runOncePerTenant = true`, checks `AutomationRun` for prior FIRED status with same rule+tenant.
5. If conditions match, schedules each action in `actionsJson`. Immediate actions (delaySeconds = 0) execute now. Delayed actions are written to a `ScheduledAction` table (or `AutomationRun` with `status = SCHEDULED` and a `runAt` timestamp).
6. The `run-scheduled-automations` cron picks up due scheduled actions every 15 minutes.

### 7.2 Rule schema (in `actionsJson`)

```json
[
  {
    "type": "send_email",
    "template": "welcome_owner",
    "delaySeconds": 0,
    "to": "owner",
    "fromName": "Tom from DriveCommand"
  },
  {
    "type": "in_app_message",
    "key": "first_truck_nudge",
    "delaySeconds": 0
  }
]
```

Action types for v1: `send_email`, `in_app_message`, `set_tenant_flag`. Keep it minimal.

### 7.3 Conditions schema (`conditionsJson`)

A small DSL. Examples:
```json
{ "tenant.daysSinceSignup": { "gte": 1, "lte": 13 } }
{ "activation.firstRealTruckAt": { "isNull": true } }
{ "activation.isActivated": { "equals": false } }
```

The evaluator implements a small set of operators: `equals`, `gte`, `lte`, `isNull`, `isNotNull`. Document them.

### 7.4 Pre-seeded SYSTEM automation rules (for v1 launch)

Insert these in `migrations/<timestamp>__seed_plans_and_automations.sql`:

| Key | Trigger | Conditions | Actions |
|---|---|---|---|
| `welcome_owner` | `tenant.created` | none | send_email `welcome_owner` immediate + `confirm_email` immediate |
| `no_progress_nudge` | `tenant.created` | none | send_email `no_progress_nudge` after 1800 seconds (30 min) — but evaluator checks `firstRealTruckAt is null` at send time |
| `add_driver_nudge` | `truck.created.real` | `firstRealDriverAt isNull` | in_app_message immediate + send_email `next_step_add_driver` after 86400 seconds (24h) if still no driver |
| `dispatch_load_nudge` | `load.created.real` | `firstLoadInTransitAt isNull` | in_app_message immediate + email after 24h if not dispatched |
| `trial_ending_soon` | `cron.daily` (special trigger) | `subscription.trialEndsAt is between now+3d and now+4d` | send_email `trial_ending_soon` |
| `activation_celebration` | `tenant.activated` | none | in_app_message immediate + send_email `activation_celebration` immediate + send_email `driver_onboarding_checklist_prompt` after 3 days |

The `cron.daily` trigger is fired by a daily cron at 09:00 UTC that emits a synthetic `cron.daily` event for every active tenant. The evaluator runs all rules with `triggerEvent = 'cron.daily'`.

---

## 8. Activation & Telemetry — How Numbers Get Computed

### 8.1 Activation update points

- New `Truck` created with `isSample = false` → call `markFirstRealTruckIfUnset(tenantId)` which UPSERTs `ActivationProgress.firstRealTruckAt` if null. Recomputes `completionPct`. Emits `truck.created.real`.
- Same pattern for `User` (DRIVER role, isSample false), `Customer`, `Load` (created, in_progress, delivered).
- Loads transitioning to `IN_PROGRESS` set `firstLoadInTransitAt`, set `isActivated = true`, emit `tenant.activated`.

### 8.2 `completionPct` formula

5 milestones, each = 20%. `accountCreatedAt` always counts. So:

```
completionPct = 20 * (
  1 +
  (firstRealTruckAt ? 1 : 0) +
  (firstRealDriverAt ? 1 : 0) +
  (firstRealClientAt ? 1 : 0) +
  (firstLoadInTransitAt ? 1 : 0)
)
```

### 8.3 Daily aggregation cron (`aggregate-tenant-metrics`)

For each active tenant, for yesterday's date:
- `dauCount` = distinct user_ids in `AppEvent` with eventType in `('user.login', 'page.view')` for the date
- `sessionCount` = count of `AppEvent` with eventType = `user.login` for the date
- `keyActionCount` = count of `AppEvent` with eventType matching key action set (load created, load dispatched, driver added, etc.)
- `storageBytes` = SUM of file sizes for documents whose `tenantId = ?` (use existing Document table)
- `seatsUsed` = count of `User` rows where `tenantId = ?` and `isSample = false`
- `loadsCreated`, `loadsInTransit` = counts from `Load`

UPSERT into `TenantMetricsDaily`.

### 8.4 Health score cron (`compute-health-scores`)

Composite 0-100 score. Subtract from 100 based on negative factors:

| Factor | Penalty |
|---|---|
| No login in last 7 days | -25 |
| No login in last 14 days | additional -25 (cap at -50 for this factor) |
| Trial expired and no payment method | -30 |
| Activation not reached and signup > 7 days ago | -20 |
| < 1 key action in last 7 days | -15 |
| Subscription `PAST_DUE` | -40 |

Floor at 0. Store top 3 contributing factors in `topFactorsJson`.

---

## 9. Stripe Deferral — What to Stub

Until Stripe is wired, do the following:

- Leave `stripeProductId`, `stripeCouponId`, `stripeCustomerId`, `stripeSubscriptionId` columns nullable. Do not write to them.
- The signup flow does NOT collect a card. The 14-day trial begins on signup.
- When `trialEndsAt` passes and there's no payment method, `subscription.status` flips to `PAST_DUE` (via the daily cron). The tenant's portal shows a "Trial expired — please add billing" banner. SysAdmin can extend with `manualExtensionUntil`.
- Build a Stripe-stub email template `add-billing-prompt.tsx` linking to a placeholder `/billing/setup` page that displays "Billing setup coming soon" for now.

When Stripe is added later, the work is:
1. Set `stripeProductId` on each Plan, `stripeCouponId` on each Promo.
2. Create Stripe Customer + Subscription on first authenticated landing or on billing setup.
3. Add webhook handler at `/api/webhooks/stripe` to update `Subscription.status`, `currentPeriodStart/End` from Stripe events.
4. Build the actual `/billing/setup` page using Stripe Checkout.

---

## 10. Security Considerations

- **Email enumeration:** The signup action must respond identically (200 with redirect) regardless of whether an email is already in use. Show "Check your email" screen always. If duplicate, send a different email ("You already have an account, sign in here") instead of creating a new tenant. Same response time — measure and pad if needed.
- **Slug enumeration:** Slugs are visible in URLs. Do not derive slugs deterministically from a guessable input (use company name + random suffix). Slugs do not need to be secret but should not be guessable for tenant discovery.
- **RLS bypass scope:** The signup transaction is the only place that should use `bypass_rls = on` outside of SysAdmin. Keep it scoped to that single transaction.
- **Email confirmation token:** Single-use, 24-hour expiry, signed with AES-GCM. Invalidate after redemption.
- **CSRF on signup:** Next.js Server Actions have built-in CSRF protection. Do not bypass it.
- **Rate limiting:** Add basic IP-based rate limit (10 signups per hour per IP) using Upstash Redis or a simple in-memory store. Required to prevent automated tenant creation.
- **Sample data isolation:** RLS still applies to sample records. They are tenant-scoped; another tenant cannot see them.

---

## 11. GSD Plan — How to Build This in Phases

This feature is large enough to need 4 phases. Each phase has 2-3 plans. Use the GSD skill for each phase.

### Phase A — Foundation: Schema + Migration + Plans/Promos
- Plan A-01: Prisma schema additions + migration SQL file with all DDL and RLS
- Plan A-02: Seed migration for default Plans (Starter / Pro / Fleet) and SYSTEM AutomationRules
- Plan A-03: Plan and Promo CRUD in SysAdmin (`/admin/plans`, `/admin/promos`)

### Phase B — Signup + Provisioning
- Plan B-01: Validation schemas, `provision-tenant.ts`, `seed-sample-data.ts`, `hydrate-tenant.ts`
- Plan B-02: `/sign-up` page, signup action, session-set on success, redirect to `/onboarding/welcome`
- Plan B-03: Email confirmation route + token helper + confirm-email template + welcome email template

### Phase C — Onboarding UX + Activation Tracking
- Plan C-01: `/onboarding/welcome` page, 5-item checklist component, sample-data banner, sample pill component
- Plan C-02: Activation tracker, hooks into Truck/Driver/Client/Load create actions, completion% calculation
- Plan C-03: Modify existing dashboards to show sample-data banner and SAMPLE pills, exclude samples from KPI counts

### Phase D — Automations + Telemetry + SysAdmin Enhancements
- Plan D-01: AppEvent + emitEvent, automation evaluator, action handlers (send_email, in_app_message), template registry
- Plan D-02: Cron routes (`run-scheduled-automations`, `aggregate-tenant-metrics`, `compute-health-scores`) + vercel.json registration
- Plan D-03: SysAdmin tenant detail page enhancements (activation, engagement, adoption, resources, health, activity timeline panels), `/admin/automations` rule list and editor, extendTrial action

Each plan should ship independently and be verifiable on its own. Phase D plans can run in parallel after Phase C.

---

## 12. Verification Checklist

For the feature to be considered done, the following must all be true:

- [ ] A new visitor can sign up with the 6 fields and reach `/onboarding/welcome` in under 5 seconds end-to-end
- [ ] The new tenant has 1 truck, 1 driver, 1 client, 2 loads, all flagged `isSample = true`
- [ ] The dashboard shows the sample data banner and SAMPLE pills
- [ ] The 5-item checklist shows item 1 complete (account created), 4 to go, 20% bar
- [ ] Adding a real truck flips `firstRealTruckAt` and updates the bar to 40%
- [ ] Transitioning a real load to IN_PROGRESS flips `isActivated = true` and emits `tenant.activated`
- [ ] The welcome email is delivered from a named human (e.g., "Tom from DriveCommand")
- [ ] The 30-minute no-progress nudge fires only if no real records exist after 30 minutes
- [ ] The 3-days-before-trial-end email fires correctly
- [ ] SysAdmin sees the new tenant in the list with activation% and health score
- [ ] SysAdmin can click into the tenant detail page and see all six panels
- [ ] SysAdmin can extend a trial and the change is reflected in the tenant's portal
- [ ] Cross-tenant isolation: tenant B cannot see tenant A's loads, drivers, automations, or events
- [ ] Sample data is excluded from `seatsUsed` and `storageBytes` calculations
- [ ] All TypeScript compiles cleanly (`npx tsc --noEmit`)
- [ ] Existing E2E tests still pass

---

*End of Technical Specification.*
