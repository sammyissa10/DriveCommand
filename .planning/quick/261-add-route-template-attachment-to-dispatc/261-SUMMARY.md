---
task: 261
type: quick
title: "Add route template attachment to dispatch with stop inheritance, recurring badge, and auto-next-dispatch on completion"
completed: "2026-04-19"
duration_minutes: 35
tasks_completed: 3
files_changed: 5
commits:
  - b1fc06d
  - 4cfaa50
key_decisions:
  - "Auto-next dispatch on completion uses after() pattern so failure never blocks dispatch completion"
  - "Template changes on edit only replace stops when dispatch status is planned"
  - "Duplicate dispatch prevention via existingNext check before creating next occurrence"
  - "formatRecurrenceRule helper kept in DispatchHeader rather than extracted to shared util (plan recommendation)"
---

# Quick Task 261: Route Template Attachment to Dispatch — Summary

## One-liner
Route template selector on dispatch create/edit with stop inheritance, purple Recurring badge + template link, and after()-based auto-generation of next dispatch on completion.

## What Was Built

### Task 1: Active templates API + stop inheritance
- **GET `/api/v1/carrier/route-templates/active`** — lightweight endpoint returning active templates with stop previews (facility name, city/state), client name, recurrence fields, and default driver/truck. Used by dropdown in forms.
- **`createDispatch`**: when `routeTemplateId` is provided, copies all `RouteTemplateStop` records as `CarrierStop` records with appointment times computed from departure + offset. Auto-populates `plannedMiles` from `template.estimatedMiles` if not set by caller. Appends `[Template: name]` tag to notes.
- **`updateDispatch`**: when `routeTemplateId` changes on a `planned` dispatch, deletes all existing stops and recreates from the new template. Ignores `routeTemplateId` when status is not `planned`.

### Task 2: Template selector on create form + edit dialog
- **`NewDispatchForm`**: template dropdown above the primary driver field. On selection: shows a stop preview card (stop number, type badge, facility + city/state), auto-fills primary driver, truck, and planned miles from template defaults if not already set. Includes `routeTemplateId` in POST body.
- **`DispatchHeader` edit dialog**: template dropdown only shown when `dispatch.status === 'planned'`. Loads templates lazily on first dialog open. Shows an amber warning when changing to a different template. Shows stop preview for the newly-selected template. Sends `routeTemplateId` in PATCH payload when changed.

### Task 3: Recurring badge + auto-next dispatch
- **Recurring badge in `DispatchHeader`**: when `routeTemplateId` is set, renders a purple `Recurring` badge next to the dispatch number badge, a clickable template name link to `/carrier/templates/[id]`, and a recurrence summary line (e.g. "Recurrence: Mon, Wed, Fri at 6:00 AM Chicago").
- **Dispatch detail page**: fetches template `templateName`, `recurrenceRule`, `recurrenceTimezone`, and `scheduledDepartureTime` when dispatch has a `routeTemplateId`. Passes all as props to `DispatchHeader`.
- **Auto-generate next dispatch**: in `transitionDispatchStatus` `in_progress → completed` block, if `dispatch.routeTemplateId` is set, fires an `after()` callback that:
  1. Fetches the template and runs `computeNextOccurrence` to get the next date
  2. Checks for an existing dispatch on that date (dedup — cron and manual completion coexist safely)
  3. Creates a new `planned` dispatch with cloned stops, appointment offsets, and `[Template: name]` notes
  4. Sends a push notification and in-app notification to the driver
  5. Logs success; any error is caught and logged without blocking dispatch completion

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/app/api/v1/carrier/route-templates/active/route.ts` | Created — new GET endpoint |
| `apps/web/src/lib/carrier/dispatches.ts` | Modified — stop inheritance, template update, auto-next dispatch |
| `apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx` | Modified — template dropdown + stop preview |
| `apps/web/src/components/carrier/dispatches/DispatchHeader.tsx` | Modified — recurring badge + edit template dropdown |
| `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx` | Modified — fetch and pass template metadata |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All 5 key files exist. Both commits (b1fc06d, 4cfaa50) confirmed in git history. TypeScript compiles with zero new errors (only pre-existing e2e test errors unrelated to this task).
