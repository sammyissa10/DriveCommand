# Phase 52: Automation Evaluator + Behavioral Emails — Context

**Gathered:** 2026-05-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the automation evaluation engine that reads AppEvent rows (and scans tenant state on cron ticks), matches them against seeded AutomationRule rows, schedules AutomationRun records, and executes the send_email action via existing Gmail SMTP. Wire a cron route that drives the evaluator on a recurring schedule. Add SysAdmin pages to inspect and manually trigger rules, view per-tenant AutomationRun history, and extend a tenant's trial.

**Three plans, executed as three separate commits in this order:**
- 52-01: Evaluator core + send_email action handler + welcome-owner + activation-celebration templates
- 52-02: Cron route + scheduling for time-based rules + 4 remaining email templates
- 52-03: SysAdmin automations management UI + tenant detail enhancements + extend-trial action

**Does NOT include:** in-app notification action, SMS, email retry on failure, template editing in SysAdmin, conditional logic beyond simple field-equality.

</domain>

<decisions>
## Implementation Decisions

### Evaluator architecture
- Main entrypoint: `runEvaluator()` in `apps/web/src/lib/automations/evaluator.ts`
- Two execution paths in one function:
  1. **Event-driven**: Pull AppEvent rows where `createdAt > last evaluator tick` AND no AutomationRun exists yet for (eventId, ruleId). For each event, find matching AutomationRule rows where `triggerEvent` matches AND conditions evaluate true. Create AutomationRun with `status='PENDING'`, `scheduledAt = event.createdAt + rule.delaySeconds`.
  2. **Execute due runs**: Find PENDING AutomationRun rows where `scheduledAt <= now()` and execute their action. Update status to SENT or FAILED atomically (single transaction per run).
- For cron-driven rules (no_progress_nudge, add_driver_nudge, dispatch_load_nudge, trial_ending_soon): direct scan of Tenant + ActivationProgress + Subscription state on each cron tick — create AutomationRun rows directly when conditions match. NOT synthetic events. Document this design choice in a comment at the top of evaluator.ts.
- Dedup for cron-driven rules: `(tenantId, ruleKey, fired_within_window)` check to prevent duplicate runs across consecutive ticks.

### Idempotency
- UNIQUE constraint on `AutomationRun(eventId, ruleId)` enforced at DB level (not just app-level). If constraint does not exist, add it via migration before Plan 52-01 ships.
- Cron-driven rules use a time-window dedup (e.g., "has a FIRED run for this rule+tenant within the last X hours?") checked before creating a new run.

### send_email action handler
- File: `apps/web/src/lib/automations/actions/send-email.ts`
- Looks up email template by rule key from a template registry (`apps/web/src/lib/automations/template-registry.ts`)
- Resolves recipient via `Tenant.ownerEmail` or OWNER User row lookup
- Renders template with event payload + tenant context
- Sends via **existing Gmail SMTP utility from Phase 48** — do NOT create a new SMTP client
- Updates AutomationRun.status to `SENT` or `FAILED` with `errorMessage`

### Error handling
- Email send failures: caught, logged, AutomationRun marked FAILED with errorMessage. Evaluator continues to next run. No automatic retries.
- Template render errors: same — caught, FAILED, continue.
- DB connection issues at evaluator level: log and exit gracefully. Next cron tick retries naturally.

### Email templates (6 total)
Plan 52-01 delivers:
- `welcome-owner.tsx` — subject "Welcome to DriveCommand", body welcoming owner, links back to `/onboarding/welcome`
- `activation-celebration.tsx` — congratulates owner, mentions `daysToActivate` from event properties

Plan 52-02 delivers:
- `no-progress-nudge.tsx`
- `add-driver-nudge.tsx`
- `dispatch-load-nudge.tsx`
- `trial-ending-soon.tsx`

All templates follow existing React Email pattern from Phase 48. From-name is a human name ("Tom from DriveCommand"), not no-reply.

### Cron route
- File: `apps/web/src/app/api/cron/automations/route.ts`
- GET handler, validates `Authorization: Bearer ${CRON_SECRET}` (return 401 otherwise)
- Calls `runEvaluator()`, returns JSON with run counts
- Schedule: `*/5 * * * *` (every 5 minutes). Fall back to `*/15 * * * *` if Vercel tier rejects 5-minute cadence.
- CRON_SECRET: generate a fresh 32-byte hex value. Add to `.env.local` AND to Vercel production env (separate values).

### SysAdmin automations UI
- `/admin/automations/page.tsx` — table of all AutomationRule rows: rule key, eventType, formatted conditions, action summary, isActive toggle (toggle flips DB row immediately via server action)
- `/admin/automations/[ruleId]/page.tsx` — detail view: full rule definition, last 10 AutomationRun rows for this rule (tenant, status, firedAt, errorMessage), "Manually trigger" button that fires the rule against a specified tenant (tenant picker or text input for tenantId)
- `/admin/tenants/[tenantId]/page.tsx` — add Automations tab/section: all AutomationRun rows for that tenant chronologically. Add ActivationProgress panel: `completionPct`, `isActivated`, `daysSinceLastProgress`. Add Extend Trial button.
- Extend Trial: modal accepts number of days, server action updates `Subscription.trialEndsAt`, writes AppEvent with `eventType='trial.extended'` (adminUserId, newEndDate in properties).
- Layout: match existing SysAdmin patterns from `/plans` and `/promos` pages (table component, breadcrumbs, dark mode).

### Observability
- `console.log` at key evaluator points: start, # events scanned, # runs scheduled, # runs executed, # SENT, # FAILED. Appears in Vercel runtime logs.
- `AutomationRun.errorMessage` queryable from SysAdmin rule detail page.

### Deployment rule
- After each plan's commit, run `vercel --prod` BEFORE attempting live verification. Each plan verified in production before moving to next.

### All writes to AutomationRun and AppEvent
- Use `bypass_rls` — these are system writes, not user-scoped actions.
- Each AutomationRun status update (PENDING → SENT/FAILED) wraps in a single transaction.

### Middleware allowlist
- `/admin/automations` must be added to `ADMIN_ALLOWED_PATHS` in `src/middleware.ts` (per spec section 5.12 warning). Same for any new `/admin/` paths added in Plan 52-03.

### Claude's Discretion
- Exact SQL for the "last evaluator tick" checkpoint (timestamp stored in DB, Redis, or derived from most recent AutomationRun firedAt)
- Exact time window for cron-driven rule dedup (e.g., 23 hours for daily rules, 45 minutes for 30-min nudge)
- Tenant picker UX in "Manually trigger" button (text input for UUID vs dropdown)
- Exact table column ordering and sort defaults in SysAdmin lists

</decisions>

<specifics>
## Specific Ideas

- **Live verify tenant:** `7c03ff70-9407-421a-8725-d3d12630d74b` has an existing `tenant.activated` AppEvent. Use this for idempotency testing: run evaluator twice, confirm same AutomationRun row (no duplicate), no duplicate email.
- **Fresh signup test:** `sammy.issa21+phase52@gmail.com` — sign up, welcome_owner rule should fire within 60 seconds.
- **Delivery address for all test emails:** `ayazali7244+dcprodtest1@gmail.com`
- **Verification end-state (all must be true after all 3 plans deploy):**
  - (a) Existing `tenant.activated` AppEvent for tenant 7c03ff70 fires activation_celebration. AutomationRun status=SENT. Email arrives at test address.
  - (b) Fresh signup triggers welcome_owner within 60s. Email arrives.
  - (c) Vercel Cron Jobs UI shows `/api/cron/automations` registered with recent last-fired timestamp.
  - (d) SysAdmin can visit `/automations`, see all 6 rules, toggle isActive, inspect AutomationRun history per rule.
  - (e) SysAdmin can visit `/tenants/<id>`, see AutomationRun history, extend trial by N days, confirm `Subscription.trialEndsAt` updates and `trial.extended` AppEvent written.
  - (f) `npx tsc --noEmit` passes. Skip lint (broken on Windows).
  - (g) No more than 1 email per (tenantId, ruleKey) — idempotency holds under repeated cron ticks and re-deploys.

</specifics>

<deferred>
## Deferred Ideas

- In-app notification action (`in_app_message` action type) — explicitly out of scope for Phase 52
- SMS action — out of scope
- Email retry on failure — out of scope; FAILED stays FAILED, next cron tick evaluates fresh
- Template copy editing in SysAdmin — out of scope; templates are code in Phase 52
- Conditional logic beyond simple field-equality in conditionsJson — out of scope
- `run-scheduled-automations` as a separate named cron (spec originally named it differently) — consolidated into single `/api/cron/automations` route

</deferred>

---

*Phase: 52-automation-evaluator-behavioral-emails*
*Context gathered: 2026-05-03*
