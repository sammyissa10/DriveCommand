# Phase 49: Tenant Self-Onboarding — Onboarding UX + Activation Tracking - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Build the onboarding experience that greets new tenants after signup. Three deliverables:
1. `/onboarding/welcome` page with 5-item activation checklist and hydration call (C-01)
2. Activation tracker library that hooks into existing create/status-change actions and updates ActivationProgress + emits AppEvents (C-02)
3. Sample-data banner + SAMPLE pill components wired into existing dashboard and list pages, with isSample=false filters on all KPI/count queries (C-03)

Spec reference: `docs/specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md` sections 5.7, 5.10, 6.2, 8.
Schema reconciliation: `docs/specs/tenant-self-onboarding/04-SCHEMA-RECONCILIATION.md` is authoritative.

</domain>

<decisions>
## Implementation Decisions

### Checklist Visual Design

- **Location:** Right-side panel on `/onboarding/welcome`, always visible. Welcome content (greeting, next steps copy) on the left; checklist panel on the right.
- **Item states:**
  - Completed → green circle check icon + label with strikethrough text, greyed out
  - Incomplete → grey circle outline + normal label text
- **Progress indicator:** Progress bar + percentage label (e.g. "20% complete") above the checklist items. Bar fills as items are checked.
- **Completion state:** When all 5 items are complete, replace the checklist panel with a celebration state: "You're all set!" message + green success animation + "Go to Dashboard" CTA button. Do not auto-redirect.
- **Recoverable error UI:** The Phase B postscript error UI on this page must remain intact — do not remove or replace it.

### Sample Banner Behavior

- **Dismissal:** `sessionStorage` with key `sample-banner-dismissed-<tenantId>`. Banner is gone for the current browser tab/session. Reappears on a new session (new tab, new browser, page close+reopen) if any `isSample=true` records still exist for the tenant.
- **Condition to show:** `tenant.sampleDataSeeded = true` AND at least one isSample=true record exists in any of Truck/User(DRIVER)/Customer/Load for the tenant.
- **Banner copy:** "These are sample records to help you explore. Add your own to get started."
- **Placement:** Owner dashboard AND all owner list pages (trucks, drivers, loads, customers/CRM).

### Dashboard Integration Scope

**SAMPLE pills** (rendered next to sample records in list tables):
- Trucks list — next to each `Truck` row where `isSample=true`
- Drivers list — next to each `User WHERE role='DRIVER' AND isSample=true` row
- Loads list — next to each `Load` row where `isSample=true`
- Customers / CRM list — next to each `Customer` row where `isSample=true`

**isSample=false filters** (KPI and count queries must exclude sample records):
- Owner dashboard KPIs: all count/revenue/summary stats must add `AND isSample=false`
- Trucks list total count
- Drivers list total count (`User WHERE role='DRIVER' AND isSample=false`)
- Loads list total count

**Architectural hard rule:** ALL queries in this phase target PascalCase tables only — `Truck`, `Customer`, `Load`, `User`. Do NOT touch `carrier_trucks`, `carrier_drivers`, `clients`, or `loads` (snake_case Carrier Operations tables). See schema reconciliation report.

### Activation Tracker Failure Handling

- **User action always wins:** The calling action (add truck, create load, etc.) MUST succeed regardless of tracker outcome. Tracker errors never propagate to caller.
- **Error handling in tracker:**
  1. Catch block runs `console.error('[activation-tracker] failed for tenant <id> event <event>:', error)` with full stack
  2. Write an `AppEvent` with `eventType='activation.tracker.error'` and `properties: { tenantId, intendedEvent, errorMessage }` using `bypass_rls=on` — this provides a paper trail without breaking user flow
  3. Self-healing: completionPct is recomputed deterministically from which timestamps are set — a missed event that fires on retry will heal automatically
- **Call pattern:** `await recordActivationEvent(...)` inside a `try/catch` in the calling action — awaited for reliability (ensures DB write completes), but errors are caught and do not propagate.
- **No Sentry** — not in this stack.

### Activation Event Rules (from spec + user prompt — locked)

- "First real truck added" → `Truck.create` where `isSample=false`
- "First real driver added" → `User.create` where `role='DRIVER' AND isSample=false` (Prisma User row, NOT Supabase auth user creation)
- "First real client added" → `Customer.create` where `isSample=false`
- "First real load dispatched" → `Load` update where `isSample=false AND status=IN_PROGRESS` (NOT on create — must be status transition)
- `tenant.activated` AppEvent properties: `{ tenantId, ownerEmail, completionPct: 100, daysToActivate }`
- All AppEvent writes use `bypass_rls=on` (system writes, not tenant writes)
- **Idempotency:** Check `ActivationProgress.<timestampField> IS NULL` before writing. If already set, skip silently. Do not re-fire.
- **completionPct formula:** `20 * (1 + (firstRealTruckAt?1:0) + (firstRealDriverAt?1:0) + (firstRealClientAt?1:0) + (firstLoadInTransitAt?1:0))` — deterministic, not incremented

### Claude's Discretion

- Exact progress bar height, color tokens, and animation easing
- Exact success animation on 100% completion (keep it tasteful — CSS-only preferred, no heavy animation library)
- How `sampleDataSeeded` flag is read on list pages (server action vs. existing data fetch — use whatever requires fewest new queries)

</decisions>

<specifics>
## Specific Ideas

- sessionStorage key format: `sample-banner-dismissed-<tenantId>` — tenant-scoped so dismissing as one tenant doesn't affect another in the same browser
- Error AppEvent type: `activation.tracker.error` with `{ tenantId, intendedEvent, errorMessage }` — gives paper trail for debugging activation gaps without surfacing to user
- The welcome page left/right split: left = greeting + encouragement copy, right = checklist panel. Both visible on desktop. On mobile, stack vertically (checklist below content).

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope.

</deferred>

---

*Phase: 49-tenant-self-onboarding-onboarding-ux-activation-tracking*
*Context gathered: 2026-05-01*
