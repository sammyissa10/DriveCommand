# Phase 46: Workflow Engine 5 — Polish & Analytics - Context

**Gathered:** 2026-04-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the Workflow Engine production-ready. Scope: Preview Panel slide-in on the Playbook Builder, SMS delivery verified end-to-end in staging, overdue step alerts (24h cron), analytics dashboard (completion rate / avg time / step drop-off), daily email digest for Safety Managers, and skip-with-reason audit trail visible on the instance detail page. No new schema entities. No new mobile screens beyond what already exists.

</domain>

<decisions>
## Implementation Decisions

### Skip-with-reason audit trail
- Step rows on the instance detail page show a **SKIPPED badge** inline (visible without extra taps)
- A separate **"Audit Log" section** appears at the bottom of the instance detail page
- Audit section content: **skip events only** — "Skipped by [user] — Reason: [text]" with timestamp
- Other state changes (completions, failures) are NOT shown in the audit section — those are already represented by the step status badges

### Overdue alerts — per-step due dates
- Due date is configured **at the template level** (StepTemplate gets a `dueWithinHours` field — e.g. "24h") as a default
- Dispatchers can **override the due date per step when starting a checklist** (instance-level override)
- Overdue alert recipient is also **configurable at the template level** — when building a playbook, the admin selects who gets notified (DRIVER, OWNER, or BOTH) per step
- If a step has no `dueWithinHours` set, the cron skips it entirely (no hardcoded fallback)
- Cron sweeps PENDING/IN_PROGRESS steps only — completed and skipped steps are ignored

### Claude's Discretion
- Preview Panel layout (slide-in from right, width, phone frame dimensions) — standard approach
- Analytics page location (new /checklists/analytics route vs section on /checklists) — Claude decides what fits the existing layout
- Chart types for analytics (completion rate bar/line, time avg, drop-off funnel) — Claude decides
- Time range default for analytics (last 30 days) — Claude decides
- Safety Manager digest format (HTML email, one per day at 8am tenant timezone) — Claude decides
- SMS provider choice (Twilio is the industry default) — Claude decides if SMS infrastructure needs to be added or if it's already present

</decisions>

<specifics>
## Specific Ideas

- "Both — badge on row + audit section" for skip trail — the badge is the fast-path signal, the audit section is for compliance review
- Per-step overdue deadline should feel like a natural extension of the template builder (a "Due within" field on each step)
- Overdue notification recipient set at template time — same UX pattern as the existing `assigneeRole` field on PlaybookStep

</specifics>

<deferred>
## Deferred Ideas

- None — discussion stayed within phase scope

</deferred>

---

*Phase: 46-workflow-engine-5-polish-analytics*
*Context gathered: 2026-04-24*
