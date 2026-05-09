---
phase: quick-288
plan: "01"
subsystem: workflows
tags: [automation, activity-log, playbook-instance, trpc, ui]
dependency_graph:
  requires: [PlaybookInstance, PlaybookTrigger, generatePlaybookInstance, fireEvent, triggerRouter]
  provides: [listActivityLog tRPC procedure, AutomationActivityLog component, triggeredBy/triggeredEvent columns]
  affects: [/checklists/automation page, automation trigger spawn path]
tech_stack:
  added: []
  patterns: [adminProcedure query, batched entity name resolution, date-fns formatDistanceToNow]
key_files:
  created:
    - apps/web/prisma/migrations/20260428100001_add_playbook_instance_triggered_by/migration.sql
    - apps/web/src/app/(owner)/checklists/automation/_components/AutomationActivityLog.tsx
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
    - apps/web/src/server/services/workflows/fireEvent.ts
    - apps/web/src/server/api/routers/workflows/trigger.ts
    - apps/web/src/app/(owner)/checklists/automation/_components/AutomationClient.tsx
    - apps/web/src/__tests__/workflows-fire-event.test.ts
decisions:
  - "Reused PlaybookInstance with 2 nullable columns rather than a new audit table — matches existing pattern, no new model needed"
  - "Customer entity name uses companyName field (not name) — corrected from plan template"
  - "CarrierDispatch has no dispatchNumber — label built from status + createdAt date"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-28"
  tasks_completed: 2
  files_changed: 8
---

# Quick-288: Tenant Automation Activity Log Summary

Automation activity log for `/checklists/automation` — owners can now audit every checklist that fired automatically: what triggered it, which playbook ran, on which entity, and when.

## What Was Built

### Schema Delta (Task 1)

Two nullable columns added to `PlaybookInstance`:

- `triggeredBy String?` — `'manual'` or `'trigger'`; null for legacy rows
- `triggeredEvent TriggerEvent?` — the firing event (e.g. `ON_DRIVER_CREATE`); only set when `triggeredBy='trigger'`

Plus a composite index `(tenantId, triggeredBy, createdAt DESC)` for efficient activity log queries.

**Rationale for 2-column approach vs. new table:**
- `PlaybookNotification` requires a `recipientUserId` — unsuitable for system-generated audit events with no recipient
- `DispatchOverrideAudit` is dispatch-specific
- A new audit model would be heavier than a 2-column delta and would duplicate information already on the instance
- `generatePlaybookInstance` already accepted `triggeredBy` — it just wasn't persisted; this closes that gap

Migration file: `20260428100001_add_playbook_instance_triggered_by/migration.sql` — auto-deployed via hook on write.

### Service Updates (Task 1)

- `generatePlaybookInstance` now accepts optional `triggeredEvent?: TriggerEvent` and persists both fields on every `PlaybookInstance.create`
- `fireEvent` passes `triggeredEvent: event` so the firing lifecycle event is captured
- Manual callers (instance router) omit `triggeredEvent` — it correctly defaults to `null`

### tRPC Procedure (Task 2)

`workflows.trigger.listActivityLog` — `adminProcedure` query returning up to 50 most-recent trigger-spawned instances for the caller's tenant:

- Filters `triggeredBy: 'trigger'` — manual instances never appear
- Ordered `createdAt DESC`
- Resolves entity display names in batched parallel lookups by entity type

**Field name corrections made during Task 2 verification:**
| Entity | Plan used | Actual schema field |
|--------|-----------|---------------------|
| Customer | `name` | `companyName` |
| CarrierDispatch | `dispatchNumber` | no such field — uses `status` + `createdAt` to build label |
| CarrierTruck | `unitNumber`, `vin` | correct |
| User | `firstName`, `lastName`, `email` | correct |

### UI Component (Task 2)

`AutomationActivityLog.tsx` — read-only feed rendered as a third section on `/checklists/automation` (below Custom Rules):

- Skeleton loader (5 animated placeholder rows) while loading
- Empty state with `Activity` icon when no entries exist
- Entry row: playbook name (truncated), event label + entity name, relative timestamp via `date-fns`
- Dark mode supported via theme tokens (`border`, `muted-foreground`, `foreground`) — no custom colors
- `AutomationClient.tsx` imports and renders `<AutomationActivityLog />` after the Custom Rules section

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated fireEvent test to include triggeredEvent in call assertion**
- **Found during:** Task 1
- **Issue:** Test 1 in `workflows-fire-event.test.ts` used exact `toHaveBeenCalledWith` without `triggeredEvent`, which would fail after adding the new parameter to `fireEvent`
- **Fix:** Added `triggeredEvent: 'ON_DRIVER_CREATE'` to the expected call shape
- **Files modified:** `apps/web/src/__tests__/workflows-fire-event.test.ts`
- **Commit:** e47a67c

**2. [Rule 2 - Field correction] Customer uses companyName not name**
- **Found during:** Task 2 schema verification
- **Issue:** Plan template referenced `customer.name` but the Customer model uses `companyName`
- **Fix:** Used `companyName` in the Prisma select and partner map
- **Files modified:** `apps/web/src/server/api/routers/workflows/trigger.ts`

**3. [Rule 2 - Field correction] CarrierDispatch has no dispatchNumber**
- **Found during:** Task 2 schema verification
- **Issue:** Plan template referenced `dispatchNumber` which does not exist on CarrierDispatch
- **Fix:** Built a descriptive label from `status` + `createdAt` date (e.g. "planned dispatch (4/28/2026)")
- **Files modified:** `apps/web/src/server/api/routers/workflows/trigger.ts`

## Commits

| Hash | Message |
|------|---------|
| e47a67c | feat(288-01): capture trigger metadata on PlaybookInstance |
| ba60868 | feat(288-01): add listActivityLog tRPC procedure and AutomationActivityLog UI |

## Self-Check: PASSED

- migration.sql: FOUND
- AutomationActivityLog.tsx: FOUND
- triggeredBy column in schema.prisma: FOUND (line 2026)
- listActivityLog in trigger.ts: FOUND (line 217)
- Both commits verified in git log
- `tsc --noEmit`: PASSED (clean)
