---
phase: quick-451
plan: 451
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/dashboard.ts
autonomous: true

must_haves:
  truths:
    - "Document/compliance expiry alerts on the owner dashboard show how long ago the alert surfaced (effectively 'just now'), not how old the expiry date is."
    - "The alert title and description still reference the expiry date (e.g. 'Expired 23 days ago') — only the relative-time stamp changes."
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/dashboard.ts"
      provides: "_fetchNotificationAlerts() with expiry alert timestamps anchored to now"
      contains: "timestamp: now.toISOString()"
  key_links:
    - from: "_fetchNotificationAlerts() expiry alerts"
      to: "NotificationAlert.timestamp"
      via: "now.toISOString()"
      pattern: "timestamp: now\\.toISOString\\(\\)"
---

<objective>
Fix Bug B1: owner dashboard document/compliance expiry alerts display the age of the EXPIRY DATE instead of when the alert surfaced. A document that expired 23 days ago incorrectly reads "23d ago" in the alert feed, even though the alert is current.

Purpose: The `timestamp` field feeds the UI's `relativeTime()` helper, which should reflect alert recency, not the source date. Other alert types (overdue invoices use `updatedAt`, safety events use event time) already anchor correctly — only the two expiry blocks use `expiryDate.toISOString()`.

Output: Both expiry-alert `timestamp` fields changed to `now.toISOString()` so the relative time reads "just now" while title/description still describe the expiry.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/src/app/(owner)/actions/dashboard.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Anchor expiry alert timestamps to now</name>
  <files>apps/web/src/app/(owner)/actions/dashboard.ts</files>
  <action>
In `_fetchNotificationAlerts()`, change the `timestamp` field on the two expiry/compliance alerts from `expiryDate.toISOString()` to `now.toISOString()`.

There are exactly two occurrences of `timestamp: expiryDate.toISOString(),`:
  - Line ~235 — inside `checkDoc()` for truck document alerts (registration/insurance).
  - Line ~276 — inside the driver document alerts loop.

The `now` variable is already in scope (declared at line ~87 as `const now = new Date();`). Use `now.toISOString()` for both.

Do NOT change anything else:
  - Do NOT touch alert `title`, `description`, `severity`, `id`, `type`, `href`, or ordering.
  - Do NOT change which alerts are generated or the `daysUntil`/expiry math.
  - Do NOT modify the overdue invoice block (`invoice.updatedAt.toISOString()`) or the safety event block — those are already correct.
  - Do NOT touch any other file.

TypeScript is strict; no `any`. `now` is already a `Date`, so `now.toISOString()` is type-safe with no new imports.
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` introduces no new errors in dashboard.ts (compare against pre-existing baseline of 35 errors).
- Grep confirms zero remaining `expiryDate.toISOString()` in dashboard.ts and exactly two `now.toISOString()` inside the expiry alert blocks (plus any pre-existing `now.toISOString()` usages elsewhere are untouched).
- Verify the overdue invoice alert still uses `invoice.updatedAt.toISOString()` (unchanged).
  </verify>
  <done>
Both truck-document and driver-document expiry alerts set `timestamp: now.toISOString()`. No other field, alert, or file is modified. tsc shows no new errors.
  </done>
</task>

</tasks>

<verification>
- Only `apps/web/src/app/(owner)/actions/dashboard.ts` is changed (`git diff --name-only` shows one file).
- `git diff` shows only the two `timestamp:` lines changed from `expiryDate.toISOString()` to `now.toISOString()`.
- `npx tsc --noEmit` from `apps/web` reports no new type errors.
</verification>

<success_criteria>
- Document/compliance expiry alerts surface with a current relative time ("just now") instead of the expiry date's age.
- Alert titles/descriptions ("Expired N days ago" / "Expires in N days") are unchanged.
- Exactly one file modified, exactly two lines changed.
</success_criteria>

<output>
After completion, create `.planning/quick/451-fix-bug-b1-dashboard-alert-age-shows-the/451-SUMMARY.md`
</output>
