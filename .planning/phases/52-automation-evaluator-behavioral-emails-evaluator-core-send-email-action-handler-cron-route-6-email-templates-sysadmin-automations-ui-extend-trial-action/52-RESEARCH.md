# Phase 52: Automation Evaluator + Behavioral Emails — Research

**Researched:** 2026-05-03
**Domain:** Automation engine, behavioral email, cron routing, SysAdmin UI
**Confidence:** HIGH (all findings verified from codebase)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### Evaluator architecture
- Main entrypoint: `runEvaluator()` in `apps/web/src/lib/automations/evaluator.ts`
- Two execution paths in one function:
  1. **Event-driven**: Pull AppEvent rows where `createdAt > last evaluator tick` AND no AutomationRun exists yet for (eventId, ruleId). For each event, find matching AutomationRule rows where `triggerEvent` matches AND conditions evaluate true. Create AutomationRun with `status='PENDING'`, `scheduledAt = event.createdAt + rule.delaySeconds`.
  2. **Execute due runs**: Find PENDING AutomationRun rows where `scheduledAt <= now()` and execute their action. Update status to SENT or FAILED atomically (single transaction per run).
- For cron-driven rules (no_progress_nudge, add_driver_nudge, dispatch_load_nudge, trial_ending_soon): direct scan of Tenant + ActivationProgress + Subscription state on each cron tick — create AutomationRun rows directly when conditions match. NOT synthetic events. Document this design choice in a comment at the top of evaluator.ts.
- Dedup for cron-driven rules: `(tenantId, ruleKey, fired_within_window)` check to prevent duplicate runs across consecutive ticks.

#### Idempotency
- UNIQUE constraint on `AutomationRun(eventId, ruleId)` enforced at DB level (not just app-level). If constraint does not exist, add it via migration before Plan 52-01 ships.
- Cron-driven rules use a time-window dedup (e.g., "has a FIRED run for this rule+tenant within the last X hours?") checked before creating a new run.

#### send_email action handler
- File: `apps/web/src/lib/automations/actions/send-email.ts`
- Looks up email template by rule key from a template registry (`apps/web/src/lib/automations/template-registry.ts`)
- Resolves recipient via `Tenant.ownerEmail` or OWNER User row lookup
- Renders template with event payload + tenant context
- Sends via **existing Gmail SMTP utility from Phase 48** — do NOT create a new SMTP client
- Updates AutomationRun.status to `SENT` or `FAILED` with `errorMessage`

#### Error handling
- Email send failures: caught, logged, AutomationRun marked FAILED with errorMessage. Evaluator continues to next run. No automatic retries.
- Template render errors: same — caught, FAILED, continue.
- DB connection issues at evaluator level: log and exit gracefully. Next cron tick retries naturally.

#### Email templates (6 total)
Plan 52-01 delivers:
- `welcome-owner.tsx` — subject "Welcome to DriveCommand", body welcoming owner, links back to `/onboarding/welcome`
- `activation-celebration.tsx` — congratulates owner, mentions `daysToActivate` from event properties

Plan 52-02 delivers:
- `no-progress-nudge.tsx`
- `add-driver-nudge.tsx`
- `dispatch-load-nudge.tsx`
- `trial-ending-soon.tsx`

All templates follow existing React Email pattern from Phase 48. From-name is a human name ("Tom from DriveCommand"), not no-reply.

#### Cron route
- File: `apps/web/src/app/api/cron/automations/route.ts`
- GET handler, validates `Authorization: Bearer ${CRON_SECRET}` (return 401 otherwise)
- Calls `runEvaluator()`, returns JSON with run counts
- Schedule: `*/5 * * * *` (every 5 minutes). Fall back to `*/15 * * * *` if Vercel tier rejects 5-minute cadence.
- CRON_SECRET: generate a fresh 32-byte hex value. Add to `.env.local` AND to Vercel production env (separate values).

#### SysAdmin automations UI
- `/admin/automations/page.tsx` — table of all AutomationRule rows: rule key, eventType, formatted conditions, action summary, isActive toggle (toggle flips DB row immediately via server action)
- `/admin/automations/[ruleId]/page.tsx` — detail view: full rule definition, last 10 AutomationRun rows for this rule (tenant, status, firedAt, errorMessage), "Manually trigger" button that fires the rule against a specified tenant (tenant picker or text input for tenantId)
- `/admin/tenants/[tenantId]/page.tsx` — add Automations tab/section: all AutomationRun rows for that tenant chronologically. Add ActivationProgress panel: `completionPct`, `isActivated`, `daysSinceLastProgress`. Add Extend Trial button.
- Extend Trial: modal accepts number of days, server action updates `Subscription.trialEndsAt`, writes AppEvent with `eventType='trial.extended'` (adminUserId, newEndDate in properties).
- Layout: match existing SysAdmin patterns from `/plans` and `/promos` pages (table component, breadcrumbs, dark mode).

#### Observability
- `console.log` at key evaluator points: start, # events scanned, # runs scheduled, # runs executed, # SENT, # FAILED. Appears in Vercel runtime logs.
- `AutomationRun.errorMessage` queryable from SysAdmin rule detail page.

#### Deployment rule
- After each plan's commit, run `vercel --prod` BEFORE attempting live verification. Each plan verified in production before moving to next.

#### All writes to AutomationRun and AppEvent
- Use `bypass_rls` — these are system writes, not user-scoped actions.
- Each AutomationRun status update (PENDING → SENT/FAILED) wraps in a single transaction.

#### Middleware allowlist
- `/admin/automations` must be added to `ADMIN_ALLOWED_PATHS` in `src/middleware.ts` (per spec section 5.12 warning). Same for any new `/admin/` paths added in Plan 52-03.

### Claude's Discretion
- Exact SQL for the "last evaluator tick" checkpoint (timestamp stored in DB, Redis, or derived from most recent AutomationRun firedAt)
- Exact time window for cron-driven rule dedup (e.g., 23 hours for daily rules, 45 minutes for 30-min nudge)
- Tenant picker UX in "Manually trigger" button (text input for UUID vs dropdown)
- Exact table column ordering and sort defaults in SysAdmin lists

### Deferred Ideas (OUT OF SCOPE)
- In-app notification action, SMS action, email retry on failure, template copy editing in SysAdmin, conditional logic beyond simple field-equality
</user_constraints>

---

## Summary

Phase 52 builds the automation evaluation engine on top of the Phase 47 data models (AutomationRule, AutomationRun, AppEvent, Subscription, ActivationProgress) that are already seeded in production. The evaluator reads AppEvent rows, matches them against 6 pre-seeded AutomationRule rows, creates AutomationRun records for scheduled delivery, and executes the `send_email` action via the existing `sendEmail()` function in `apps/web/src/lib/email/gmail-client.ts`. A new cron route at `/api/cron/automations` drives evaluation every 5 minutes (Vercel Pro supports this). SysAdmin UI follows the same server-component + `Card`/table pattern used by `/plans` and `/promos`.

**Critical schema gap discovered:** The existing `AutomationRunStatus` enum in the DB is `FIRED | SKIPPED_CONDITION | SKIPPED_ALREADY_RAN | FAILED`. The CONTEXT.md design calls for `PENDING | SENT | FAILED`. The `AutomationRun` table also has no `scheduledAt` column and no `eventId` column for the idempotency constraint. These missing fields require a new migration before Plan 52-01 can ship. This is the highest-risk item for the planner.

**Also discovered:** A `welcome-owner.tsx` email template already exists at `apps/web/src/emails/welcome-owner.tsx`. It must be reviewed — it may already cover the welcome email need or may need to be adapted/replaced. The CONTEXT.md description of the template differs slightly from what is already built.

**Primary recommendation:** The first task in Plan 52-01 must be a migration that (1) adds `PENDING` and `SENT` values to the `AutomationRunStatus` enum, (2) adds `scheduledAt TIMESTAMPTZ` and `eventId UUID nullable` and `errorMessage TEXT nullable` columns to `AutomationRun`, and (3) adds a UNIQUE constraint on `(eventId, ruleId)` where `eventId IS NOT NULL`. Without this migration, the evaluator cannot be built as specified.

---

## Standard Stack

### Core (already in project — no new installs)
| Library | Version | Purpose | Source |
|---------|---------|---------|--------|
| `nodemailer` | installed | Email transport | `apps/web/src/lib/email/gmail-client.ts` |
| `@react-email/components` | installed | Email templates | `apps/web/src/emails/*.tsx` |
| `@react-email/render` | installed | Render JSX to HTML | `apps/web/src/lib/email/gmail-client.ts` |
| `prisma` | 7.x | ORM for AutomationRun/AppEvent writes | `apps/web/src/lib/db/prisma.ts` |
| `next` | 15.x | App Router for cron route + SysAdmin pages | project |

No new packages needed. Everything required is already installed.

---

## Architecture Patterns

### Recommended New File Structure
```
apps/web/src/lib/automations/
├── evaluator.ts                  # main runEvaluator() — two execution paths
├── template-registry.ts          # maps ruleKey → email template component
└── actions/
    └── send-email.ts             # send_email action handler

apps/web/src/app/api/cron/
└── automations/
    └── route.ts                  # GET handler, CRON_SECRET auth, calls runEvaluator()

apps/web/src/app/(admin)/
└── automations/
    ├── page.tsx                  # all AutomationRule rows + isActive toggle
    ├── automations-list-client.tsx
    └── [ruleId]/
        └── page.tsx              # rule detail + last 10 runs + manual trigger

apps/web/src/app/(admin)/actions/
└── automations.ts                # server actions: toggleRule, triggerRule, extendTrial

apps/web/prisma/migrations/
└── 20260503000001_automation_run_schema/
    └── migration.sql             # adds PENDING/SENT to enum, scheduledAt, eventId, errorMessage
```

Email templates — all already exist or should be placed in:
```
apps/web/src/emails/
├── welcome-owner.tsx             # ALREADY EXISTS — review, may need adaptation
├── activation-celebration.tsx    # NEW
├── no-progress-nudge.tsx         # NEW
├── add-driver-nudge.tsx          # NEW
├── dispatch-load-nudge.tsx       # NEW
└── trial-ending-soon.tsx         # NEW
```

### Pattern 1: bypass_rls Transaction
Every write to AutomationRun or AppEvent must use this pattern (sourced from `activation-tracker.ts` and `send-reminders/route.ts`):

```typescript
// Source: apps/web/src/lib/onboarding/activation-tracker.ts
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  // ... writes to AutomationRun / AppEvent
}, TX_OPTIONS);
```

`TX_OPTIONS` is `{ maxWait: 15000, timeout: 30000 }` — already exported from `apps/web/src/lib/db/prisma.ts`.

### Pattern 2: CRON_SECRET validation
Exact pattern from `apps/web/src/app/api/cron/send-reminders/route.ts`:

```typescript
export const dynamic = 'force-dynamic'; // CRITICAL: prevent Next.js caching

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  const expectedAuth = `Bearer ${process.env.CRON_SECRET}`;
  if (authHeader !== expectedAuth) {
    return new Response('Unauthorized', { status: 401 });
  }
  // ... call runEvaluator()
}
```

### Pattern 3: sendEmail signature
Exact signature from `apps/web/src/lib/email/gmail-client.ts`:

```typescript
// Source: apps/web/src/lib/email/gmail-client.ts
import { sendEmail, FROM_EMAIL } from '@/lib/email/gmail-client';

await sendEmail({
  to: recipientEmail,          // string or string[]
  subject: 'Welcome to DriveCommand',
  react: <WelcomeOwnerEmail firstName="..." />,
  replyTo: process.env.SUPPORT_REPLY_TO, // optional
});
```

`FROM_EMAIL` is already configured from `GMAIL_FROM_NAME` + `GMAIL_USER` env vars. No per-send from-name override possible through `sendEmail()` — the CONTEXT.md mentions "fromName" in `actionsJson`, but this is a template-registry concern, not a sendEmail call concern.

### Pattern 4: React Email template pattern
All templates follow this structure (from `apps/web/src/emails/welcome-owner.tsx`):

```typescript
// Source: apps/web/src/emails/welcome-owner.tsx
import { Html, Head, Body, Container, Section, Text, Button, Hr } from '@react-email/components';

interface TemplateProps { /* typed props */ }

export function TemplateName(props: TemplateProps) {
  return (
    <Html>
      <Head />
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Text style={styles.headerText}>DriveCommand</Text>
          </Section>
          <Section style={styles.content}>
            {/* ... */}
          </Section>
          <Section style={styles.footer}>
            <Hr style={styles.divider} />
            <Text style={styles.footerText}>DriveCommand — Fleet Management</Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

const styles = {
  body: { backgroundColor: '#f6f9fc', fontFamily: '...' },
  container: { margin: '0 auto', padding: '20px 0', maxWidth: '600px' },
  header: { backgroundColor: '#1e40af', padding: '20px', borderRadius: '8px 8px 0 0' },
  // ...
};
```

Note: Templates use inline `const styles` objects (not Tailwind) — consistent with all existing templates.

### Pattern 5: SysAdmin page structure
From `apps/web/src/app/(admin)/plans/page.tsx` + `plans-list-client.tsx`:

```typescript
// Server component (page.tsx)
export const dynamic = 'force-dynamic';
export default async function AutomationsPage() {
  const rules = await getAutomationRules(); // server action
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">...</h1>
          <p className="mt-1 text-sm text-gray-500">...</p>
        </div>
      </div>
      <AutomationsListClient rules={rules} />
    </div>
  );
}

// Client component (automations-list-client.tsx)
'use client';
import { Card, CardContent } from '@/components/ui/card';

export function AutomationsListClient({ rules }) {
  return (
    <Card>
      <CardContent className="p-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
              {/* ... */}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rules.map((rule) => (
              <tr key={rule.id} className="hover:bg-gray-50">
                {/* ... */}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
```

### Pattern 6: isActive toggle server action
From `apps/web/src/app/(admin)/actions/plans.ts` — `updatePlan` style:

```typescript
'use server';
import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) throw new Error('Unauthorized: Admin access required');
}

export async function toggleAutomationRule(ruleId: string, isActive: boolean) {
  await requireAdminAccess();
  await prisma.automationRule.update({ where: { id: ruleId }, data: { isActive } });
  revalidatePath('/automations');
}
```

### Anti-Patterns to Avoid
- **Using withTenantRLS extension for system writes**: AutomationRun/AppEvent writes always use raw `bypass_rls`, never `prisma.$extends(withTenantRLS(...))`. The extension is for user-scoped reads.
- **Not adding `export const dynamic = 'force-dynamic'`**: All cron routes and SysAdmin pages querying live data must have this. Missing it causes stale cached responses in production.
- **Using GMAIL_FROM_NAME per-send override**: The FROM_EMAIL is a singleton built at import time. You cannot pass a per-send from-name to `sendEmail()`. If different from-names are needed, override at the call site by constructing the header manually (but this contradicts the existing utility — keep one from-name via env var).
- **Calling evaluator from within a user request**: The evaluator is always invoked from the cron route only. Never embed it in a server action or API route handler that processes user requests.

---

## Critical Schema Gap — Must Resolve in Migration Before Plan 52-01

### What the CONTEXT.md design requires vs. what exists in DB

| Required by CONTEXT.md | Exists in DB today | Action needed |
|------------------------|-------------------|---------------|
| `AutomationRunStatus.PENDING` | NOT EXISTS | Add via ALTER TYPE |
| `AutomationRunStatus.SENT` | NOT EXISTS | Add via ALTER TYPE |
| `AutomationRun.scheduledAt` | NOT EXISTS | Add column via ALTER TABLE |
| `AutomationRun.eventId` | NOT EXISTS | Add column via ALTER TABLE |
| `AutomationRun.errorMessage` | NOT EXISTS | Add column via ALTER TABLE |
| UNIQUE constraint on `(eventId, ruleId)` | NOT EXISTS | Add via CREATE UNIQUE INDEX |

**Existing `AutomationRunStatus` enum values:** `FIRED`, `SKIPPED_CONDITION`, `SKIPPED_ALREADY_RAN`, `FAILED`

The Prisma schema at `apps/web/prisma/schema.prisma` must also be updated to reflect new enum values and new columns.

### Required migration SQL (Plan 52-01, first task)

```sql
-- Add new enum values to AutomationRunStatus
ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'PENDING';
ALTER TYPE "AutomationRunStatus" ADD VALUE IF NOT EXISTS 'SENT';

-- Add scheduledAt: when to execute this run (now + delaySeconds)
ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "scheduledAt" TIMESTAMPTZ;

-- Add eventId: FK to the AppEvent that triggered this run (null for cron-driven)
ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "eventId" UUID;

-- Add errorMessage: populated on FAILED status
ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "errorMessage" TEXT;

-- Idempotency constraint: one run per (eventId, ruleId) pair
-- Partial index: only enforces uniqueness when eventId is NOT NULL
CREATE UNIQUE INDEX IF NOT EXISTS "AutomationRun_eventId_ruleId_key"
  ON "AutomationRun"("eventId", "ruleId")
  WHERE "eventId" IS NOT NULL;

-- Index to support "find PENDING runs where scheduledAt <= now()"
CREATE INDEX IF NOT EXISTS "AutomationRun_status_scheduledAt_idx"
  ON "AutomationRun"("status", "scheduledAt");
```

**Prisma schema additions** (in `schema.prisma`):
```prisma
enum AutomationRunStatus {
  FIRED
  SKIPPED_CONDITION
  SKIPPED_ALREADY_RAN
  FAILED
  PENDING   // new: scheduled, not yet executed
  SENT      // new: email delivered successfully
}

model AutomationRun {
  // existing fields...
  scheduledAt  DateTime?  @db.Timestamptz  // new
  eventId      String?    @db.Uuid          // new
  errorMessage String?                       // new
  // @@unique on (eventId, ruleId) where eventId IS NOT NULL — expressed as partial index above
}
```

---

## Seeded AutomationRule Keys (Verified from Migration)

Six rules are already seeded in DB. The evaluator must handle all of them:

| ruleKey | triggerEvent | runOncePerTenant | delaySeconds (first action) |
|---------|-------------|-----------------|----------------------------|
| `welcome_owner` | `tenant.created` | true | 0 (immediate) |
| `no_progress_nudge` | `tenant.created` | true | 1800 (30 min) |
| `add_driver_nudge` | `truck.created.real` | true | 0 (immediate) |
| `dispatch_load_nudge` | `load.created.real` | true | 0 (immediate) |
| `trial_ending_soon` | `cron.daily` | false | 0 |
| `activation_celebration` | `tenant.activated` | true | 0 (immediate) |

**Important:** `add_driver_nudge` and `dispatch_load_nudge` have `conditionsJson` with activation field checks (`{"activation.firstRealDriverAt": {"isNull": true}}`). The evaluator's condition-evaluation logic must handle `isNull` checks against `ActivationProgress` fields.

**Important:** `welcome_owner` actionsJson has TWO actions (welcome email + confirm email). The evaluator must iterate over `actionsJson` array, not assume a single action per rule.

**Important:** `no_progress_nudge`, `add_driver_nudge`, `dispatch_load_nudge`, and `trial_ending_soon` are described in the CONTEXT.md as "cron-driven rules" that bypass event matching. However, the seeded `triggerEvent` values for the first three are `tenant.created`, `truck.created.real`, `load.created.real` — NOT `cron.daily`. The CONTEXT.md instructions say to handle them via "direct scan of Tenant + ActivationProgress + Subscription state on each cron tick". The planner should follow CONTEXT.md (cron-driven approach) and use the cron tick to check conditions directly, ignoring the `triggerEvent` field for these three rules.

---

## Existing `welcome-owner.tsx` Template — Review Required

**File:** `apps/web/src/emails/welcome-owner.tsx`

This template **already exists** and has slightly different props than what Phase 52 will need:
- Current props: `{ firstName, companyName, trialEndsAt, dashboardUrl }`
- The template text mentions trial end date prominently

The CONTEXT.md says Plan 52-01 delivers `welcome-owner.tsx` with body "welcoming owner, links back to `/onboarding/welcome`". The existing template already does this but also includes trial info. **Decision for planner:** Either reuse the existing template as-is (it already works with `sendEmail()`) or create a new automation-specific version. Recommendation: use the existing template since it already matches the intended behavior. Do not overwrite it.

---

## ActivationProgress Fields Available for Evaluator

The `ActivationProgress` model (from schema) has these fields relevant to cron-driven condition checks:

| Field | Type | What it signals |
|-------|------|----------------|
| `completionPct` | Int | 20 = no steps done, 100 = fully activated |
| `isActivated` | Boolean | true when all 4 steps complete |
| `firstRealTruckAt` | DateTime? | null = no truck added yet |
| `firstRealDriverAt` | DateTime? | null = no driver added yet |
| `firstRealClientAt` | DateTime? | null = no client added yet |
| `firstRealLoadCreatedAt` | DateTime? | null = no real load created |
| `firstLoadInTransitAt` | DateTime? | null = no load dispatched |
| `accountCreatedAt` | DateTime | start of trial — for 30-min nudge window |

**Note:** The CONTEXT.md mentions `daysSinceLastProgress` in the SysAdmin UI. This is a derived value computed from `updatedAt` (the last time any activation field changed), not a stored field. Compute it as `now() - activationProgress.updatedAt`.

---

## Subscription Fields for Extend Trial

The `Subscription` model has:
- `trialEndsAt DateTime @db.Timestamptz` — the field to update
- `manualExtensionUntil DateTime? @db.Timestamptz` — may also be relevant
- `status SubscriptionStatus` — `TRIALING | ACTIVE | PAST_DUE | CANCELLED | SUSPENDED`
- `tenantId String @unique` — one subscription per tenant

The extend-trial server action should update `Subscription.trialEndsAt` by adding N days to the current value (or to `now()` if the trial has already expired). Also write an AppEvent with bypass_rls.

---

## Tenant Owner Email Resolution

The CONTEXT.md says recipient is resolved via `Tenant.ownerEmail` or OWNER User row lookup. **Important:** `Tenant` has no `ownerEmail` field. The schema shows `Tenant.contactEmail` (nullable) which is not the same thing. The evaluator must always resolve the owner email by querying `User` WHERE `tenantId = X AND role = 'OWNER'`. This is the same pattern used in `activation-tracker.ts`:

```typescript
// Source: apps/web/src/lib/onboarding/activation-tracker.ts
const owner = await tx.user.findFirst({
  where: { tenantId, role: 'OWNER' },
  select: { email: true },
});
const ownerEmail = owner?.email;
```

---

## Middleware Allowlist

**File:** `apps/web/src/middleware.ts`, line 155

Current `ADMIN_ALLOWED_PATHS`:
```typescript
const ADMIN_ALLOWED_PATHS = [
  '/admin', '/admin-support', '/admin-dashboard',
  '/tenants', '/billing', '/plans', '/promos',
  '/unauthorized', '/onboarding', '/api'
];
```

The admin portal pages are under `(admin)` route group but the **actual URL paths** do NOT include `/admin/` prefix. Looking at the file structure: plans are at `/plans/*`, tenants at `/tenants/*`, promos at `/promos/*`. The new Automations page at path `/automations` must be added to this list.

**However**, the CONTEXT.md says the automations page is at `/admin/automations/page.tsx`. This would correspond to URL path `/admin/automations`. If the file is placed at `apps/web/src/app/(admin)/automations/page.tsx`, the URL path is `/automations` (route group `(admin)` has no URL impact). If placed at `apps/web/src/app/admin/automations/page.tsx`, the URL path would be `/admin/automations`.

**Recommendation:** Follow the CONTEXT.md exactly — place the file at `apps/web/src/app/(admin)/automations/page.tsx`. The URL will be `/automations`. Add `/automations` to `ADMIN_ALLOWED_PATHS`. This is consistent with how `/plans`, `/promos`, `/tenants` work.

---

## Vercel Cron Schedule

**Verified from official docs:** Vercel Pro plan supports once-per-minute minimum interval. `*/5 * * * *` (every 5 minutes) is valid on Pro.

**vercel.json entry to add:**
```json
{
  "path": "/api/cron/automations",
  "schedule": "*/5 * * * *"
}
```

The project is already running 8 cron jobs (verified in `vercel.json`). Adding a 9th is within the 100-job limit.

---

## "Last Evaluator Tick" Checkpoint — Claude's Discretion Resolution

**Recommendation:** Derive from most-recent `firedAt` across ALL AutomationRun rows (not limited by rule or tenant). This requires no extra infrastructure:

```typescript
// In evaluator.ts
const lastRun = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  return tx.automationRun.findFirst({
    orderBy: { firedAt: 'desc' },
    select: { firedAt: true },
  });
}, TX_OPTIONS);

const since = lastRun?.firedAt ?? new Date(Date.now() - 10 * 60 * 1000); // 10min fallback
```

**Fallback:** If no AutomationRun rows exist (fresh install), default to `now() - 10 minutes` so the very first run doesn't try to scan all events since epoch.

**Alternative (Redis):** The project has Upstash Redis (for rate limiting). A Redis key like `evaluator:last_tick` could store the timestamp. This is more precise under concurrent invocations but adds complexity. Recommendation: start with DB derivation, migrate to Redis if race conditions emerge.

---

## Cron-Driven Dedup Time Windows — Claude's Discretion Resolution

| Rule | Trigger cadence | Recommended dedup window |
|------|-----------------|--------------------------|
| `no_progress_nudge` | Once per tenant after 30 min | 23 hours (fires once, runOncePerTenant=true means DB handles it) |
| `add_driver_nudge` | Once per tenant after truck.created.real | runOncePerTenant=true handles it |
| `dispatch_load_nudge` | Once per tenant after load.created.real | runOncePerTenant=true handles it |
| `trial_ending_soon` | Daily when trial ends in 3-4 days | 20 hours (prevents double-fire on consecutive 5-min ticks within same day) |

For `no_progress_nudge`: check if `ActivationProgress.completionPct === 20` AND `accountCreatedAt <= now() - 30 minutes` AND no existing AutomationRun for this tenant + rule. `runOncePerTenant=true` means once a SENT run exists, no new run is created.

---

## Manually Trigger UX — Claude's Discretion Resolution

**Recommendation:** Text input for tenantId UUID (not dropdown). Rationale:
- Dropdown would require loading all tenants — expensive on page render
- SysAdmin already has the tenant UUID visible on the tenant detail page (there's a "Copy Tenant ID" button)
- A text input with UUID validation is simpler and avoids an extra data fetch

---

## Common Pitfalls

### Pitfall 1: AutomationRun status enum mismatch
**What goes wrong:** The schema has `FIRED | SKIPPED_CONDITION | SKIPPED_ALREADY_RAN | FAILED`. Writing `status: 'PENDING'` without migrating first causes a Prisma validation error at runtime, not at compile time (Prisma enums are strings).
**Why it happens:** The CONTEXT.md was written as a design spec, not against the actual DB state.
**How to avoid:** Plan 52-01's first task must be the migration. Do not attempt to write any AutomationRun rows before the migration is applied.
**Warning signs:** TypeScript type errors when assigning `'PENDING'` to `AutomationRunStatus` typed fields.

### Pitfall 2: Missing `scheduledAt` column before evaluator queries
**What goes wrong:** `tx.automationRun.findMany({ where: { status: 'PENDING', scheduledAt: { lte: now } } })` fails with "column does not exist".
**How to avoid:** Same as above — migration must run first.

### Pitfall 3: welcome-owner.tsx already exists
**What goes wrong:** Plan 52-01 creates a new `welcome-owner.tsx`, overwriting the existing template which is already used by existing email-sending code.
**How to avoid:** Check if existing callers reference `welcome-owner.tsx`. If they do, either reuse it as-is or create an automation-specific variant with a different filename.
**Warning signs:** Grep for `welcome-owner` before writing any template.

### Pitfall 4: Not setting `export const dynamic = 'force-dynamic'`
**What goes wrong:** Vercel caches the GET response of the cron route or the SysAdmin page, serving stale data.
**How to avoid:** Add `export const dynamic = 'force-dynamic'` to the cron route (same as all other cron routes) and all SysAdmin pages.

### Pitfall 5: actionsJson has multiple actions
**What goes wrong:** Only the first action in `welcome_owner.actionsJson` is executed, missing the `confirm_email` action.
**Why it happens:** The seeded `actionsJson` for `welcome_owner` has two action objects in the array. If the evaluator only processes `actionsJson[0]`, the second action is silently skipped.
**How to avoid:** The evaluator must iterate `rule.actionsJson as Action[]`. Note: the `confirm_email` action involves a different template not part of Phase 52's scope. The evaluator should skip or log-warn on unrecognized action types.

### Pitfall 6: Cron invocations can overlap
**What goes wrong:** Two consecutive cron ticks run simultaneously (Vercel cold-start variation). Both read the same PENDING AutomationRun row, both try to send the email and mark it SENT. Duplicate emails are sent.
**How to avoid:** The status update from PENDING → SENT/FAILED must use a conditional update (optimistic locking):
```typescript
const updated = await tx.automationRun.updateMany({
  where: { id: run.id, status: 'PENDING' }, // only update if still PENDING
  data: { status: 'SENT', firedAt: new Date() },
});
if (updated.count === 0) continue; // another invocation already claimed this run
```

### Pitfall 7: SysAdmin path is `/automations` not `/admin/automations`
**What goes wrong:** Placing the page at `apps/web/src/app/(admin)/automations/page.tsx` results in URL `/automations`, not `/admin/automations`. The ADMIN_ALLOWED_PATHS must include `/automations`, not `/admin/automations`.
**How to avoid:** Follow the existing pattern — all SysAdmin pages are in `(admin)` route group but the URL has no `/admin/` prefix.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Email rendering | Custom HTML string builder | `@react-email/render` + existing template pattern | Already installed, type-safe, consistent with all other templates |
| Email sending | New SMTP client | `sendEmail()` in `apps/web/src/lib/email/gmail-client.ts` | Already configured, handles transporter singleton |
| RLS bypass | Custom raw SQL | `TX_OPTIONS` pattern from `apps/web/src/lib/db/prisma.ts` | Project-wide standard, already handles pgbouncer pool correctly |
| Admin auth guard | Custom middleware check | `requireAuth()` + `isSystemAdmin()` from `apps/web/src/lib/auth/supabase.ts` | Same as all admin server actions |

---

## Open Questions

1. **confirm_email action in welcome_owner rule**
   - What we know: `welcome_owner.actionsJson` has a second action `{ "type": "send_email", "template": "confirm_email" }`. This is outside Phase 52 scope.
   - What's unclear: Should the evaluator skip it silently, log a warning, or throw?
   - Recommendation: Skip with `console.warn('[evaluator] unrecognized template: confirm_email — skipping')`. This is clean and leaves room for Phase 53 to add the template.

2. **tenant.created AppEvent — when is it written?**
   - What we know: The welcome_owner rule triggers on `tenant.created`. The `activation-tracker.ts` writes `activation.*` events, not `tenant.created`.
   - What's unclear: Is a `tenant.created` AppEvent currently written anywhere in the sign-up flow?
   - Recommendation: The planner should verify this. If no `tenant.created` event is written, Plan 52-01 must add it to the sign-up/provisioning flow. Check `apps/web/src/lib/onboarding/provision-tenant.ts`.

3. **AppEvent for tenant.created during sign-up**
   - What we know: `apps/web/src/lib/onboarding/provision-tenant.ts` exists but was not fully inspected.
   - Recommendation: The first investigation step in Plan 52-01 must be to read `provision-tenant.ts` and `hydrate-tenant.ts` to confirm where `tenant.created` and `truck.created.real` / `load.created.real` AppEvents are (or are not) written.

---

## Sources

### Primary (HIGH confidence — directly read from codebase)
- `apps/web/prisma/schema.prisma` — AutomationRule, AutomationRun, AppEvent, Subscription, ActivationProgress, Tenant models
- `apps/web/prisma/migrations/20260429000001_tenant_self_onboarding/migration.sql` — DB table creation, RLS policies, enum values
- `apps/web/prisma/migrations/20260429000002_seed_plans_and_automations/migration.sql` — 6 seeded AutomationRule rows with exact ruleKeys and actionsJson
- `apps/web/src/lib/email/gmail-client.ts` — `sendEmail()` signature, `FROM_EMAIL`, `SendEmailOptions`
- `apps/web/src/lib/onboarding/activation-tracker.ts` — bypass_rls pattern, AppEvent write pattern, TX_OPTIONS usage
- `apps/web/src/app/api/cron/send-reminders/route.ts` — cron CRON_SECRET auth pattern, `export const dynamic`, cron structure
- `apps/web/vercel.json` — existing cron registrations, confirms 8 cron jobs currently
- `apps/web/src/middleware.ts` — `ADMIN_ALLOWED_PATHS` current list (line 155)
- `apps/web/src/app/(admin)/tenants/[id]/page.tsx` — tenant detail page structure to extend
- `apps/web/src/app/(admin)/plans/page.tsx` + `plans-list-client.tsx` — SysAdmin table pattern
- `apps/web/src/app/(admin)/actions/plans.ts` — server action pattern with requireAdminAccess
- `apps/web/src/emails/welcome-owner.tsx` — **EXISTING template** (already has welcome-owner template)
- `apps/web/src/emails/owner-invitation.tsx` — React Email component structure reference
- `apps/web/src/lib/db/prisma.ts` — `TX_OPTIONS`, prisma singleton, `pool` max=1

### Secondary (HIGH confidence — official docs)
- Vercel Cron Jobs usage & pricing docs (verified 2026-03-04) — Pro plan supports once-per-minute, `*/5 * * * *` is valid
  - Source: https://vercel.com/docs/cron-jobs/usage-and-pricing

---

## Metadata

**Confidence breakdown:**
- Schema gaps: HIGH — directly verified from migration SQL and schema.prisma
- Email sending pattern: HIGH — read directly from gmail-client.ts
- Cron auth pattern: HIGH — read directly from send-reminders/route.ts
- Seeded rules: HIGH — read directly from migration SQL
- SysAdmin patterns: HIGH — read from plans/promos/tenants pages
- Middleware paths: HIGH — read from middleware.ts line 155
- Vercel 5-min cron: HIGH — verified from official docs (2026-03-04)
- `welcome-owner.tsx` exists: HIGH — directory listing confirmed

**Research date:** 2026-05-03
**Valid until:** 2026-06-03 (30 days — stable codebase)
