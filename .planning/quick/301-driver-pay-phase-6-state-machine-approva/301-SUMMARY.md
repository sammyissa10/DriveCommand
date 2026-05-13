---
phase: quick-301
plan: 301
subsystem: driver-pay
tags: [state-machine, approvals, corrections, sidebar-badge, keyboard-navigation]
dependency_graph:
  requires: [quick-300, quick-299, quick-298, quick-297]  # Driver Pay Phases 1-5
  provides: [assignment-status-transitions, pending-pay-queue, corrections-workflow, sidebar-badge]
  affects: [driver-settlements-phase-8, assignment-card, sidebar-navigation]
tech_stack:
  added: []
  patterns:
    - Pure FSM module (no framework deps) tested independently from API
    - 422 Unprocessable Entity for business rule failures (vs 400 for malformed input)
    - Atomic transactions wrapping status update + audit log together
    - In-memory amount filter/sort after DB query (Prisma can't aggregate across joined relations in filter)
    - countOnly mode on queue endpoint for sidebar badge without full row payload
key_files:
  created:
    - apps/web/src/lib/driver-pay/state-machine.ts
    - apps/web/src/lib/driver-pay/__tests__/state-machine.test.ts
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
    - apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
    - apps/web/src/app/api/driver-pay/pending-queue/route.ts
    - apps/web/src/app/api/driver-pay/__tests__/pending-queue-api.test.ts
    - apps/web/src/app/(owner)/carrier/driver-pay/pending/page.tsx
    - apps/web/src/components/driver-pay/pending-queue-client.tsx
    - apps/web/src/components/driver-pay/approval-card.tsx
    - apps/web/src/components/driver-pay/dispute-modal.tsx
    - apps/web/src/components/driver-pay/correction-modal.tsx
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
    - apps/web/src/app/api/driver-pay/__tests__/corrections-api.test.ts
    - apps/web/src/components/navigation/pending-pay-badge.tsx
  modified:
    - apps/web/src/components/driver-pay/assignment-card.tsx
    - apps/web/src/components/navigation/sidebar.tsx
decisions:
  - "422 for business rule failures, 400 for malformed input: 422 (Unprocessable Entity) is semantically correct for valid input that fails state machine pre-conditions; 400 is for malformed/unparseable requests"
  - "Corrections go through a dedicated endpoint not the transitions API: the corrections endpoint creates a component and flips status atomically; keeping them separate avoids overloading the transitions endpoint and makes the corrections audit trail explicit"
  - "isOverride is inferred from overrideReason not null: the DB schema doesn't have an explicit isOverride boolean field on LoadDriverAssignment, so we infer it from overrideReason presence"
  - "paymentModel maps FLAT_PER_LOAD and SALARY to FLAT: the state machine uses 5 canonical model types; DB payType has more granular values that map cleanly to FSM categories"
  - "loadNumber uses referenceNumber from CarrierLoad: CarrierLoad has no loadNumber field; referenceNumber is the human-readable identifier shown in the queue"
  - "amount filter applied in-memory after DB query: Prisma cannot efficiently filter on computed SUM of joined components; in-memory filtering is acceptable given queue is always small (PENDING_REVIEW + DISPUTED only)"
metrics:
  duration: ~90 minutes
  completed: 2026-05-13
  tasks_completed: 5
  files_created: 14
  files_modified: 2
  tests_total: 87
---

# Phase quick-301: Driver Pay Phase 6 — State Machine + Approval Workflow Summary

State machine + atomic transitions for LoadDriverAssignment (DRAFT→PENDING_REVIEW→APPROVED with DISPUTED/CORRECTED branches), keyboard-driven pending pay queue with two-panel approval UI, corrections workflow for paid assignments, and a 60s-polling sidebar badge.

## What Was Built

### Plan A — State Machine + Transition API (Wave 1)

**`state-machine.ts`** — Pure FSM module, no framework imports:
- `canTransition(assignment, action, components)` — discriminated union result
- Pre-conditions: BASE_PAY component required for submit, override reason required if isOverride, actualMiles+mileageSource for CPM approve, loadRevenue>0 for PERCENTAGE approve, ADJUSTMENT component required for correct
- User-friendly error strings with actionHint, no ERR_ codes
- `nextStatusFor()` helper for status lookup after FSM passes
- `adjustmentTypeFor()` helper for ADJUSTMENT_POSITIVE/NEGATIVE sign determination
- `TRANSITION_LABELS` map for audit log action strings
- APPROVED→PAID reserved for Phase 8 settlement engine

**`transitions/route.ts`** — POST endpoint:
- Auth, RBAC (DRIVER blocked), Zod body validation
- Maps DB `payType` (FLAT_PER_LOAD, SALARY, etc.) → FSM `paymentModel` (FLAT, CPM, etc.)
- Runs `canTransition`, returns 422 with user-friendly error on failure
- Dispute/reject require `reason` ≥ 10 chars
- Correct action blocked — redirected to corrections endpoint
- Atomic transaction: status update + audit log together
- Sets approvedAt/approvedBy on approve action
- IP captured from x-forwarded-for header

### Plan B — Pending Queue + Approval Card UI (Wave 2)

**`pending-queue/route.ts`** — GET endpoint:
- Returns PENDING_REVIEW + DISPUTED assignments for OWNER/MANAGER
- `countOnly=true` mode counts only PENDING_REVIEW (for badge)
- Filters: driverId, dateFrom/To, overrideOnly
- Amount filters and amount sort applied in-memory after DB query
- Serializes: driverName, loadNumber (referenceNumber), totalPay sum, ageDays, isOverride

**`/carrier/driver-pay/pending/page.tsx`** — Server page with auth guard

**`pending-queue-client.tsx`** — Two-panel client component:
- Left: filter bar (sort, min/max amount, override toggle) + scrollable row list
- Right: ApprovalCard detail pane
- Arrow key navigation (↑/↓) with auto-scroll-into-view
- Auto-selects first row on load; auto-advances after transition
- 300ms debounce on filter changes

**`approval-card.tsx`** — Right pane detail:
- Self-fetches components when assignmentId changes
- Override highlight badge in header
- Component table with grossAmount sign coloring
- Sticky action bar: Dispute (D) + Approve (A) buttons
- Inline 422 pre-condition error with "Open load" link
- Green flash animation (350ms) before advancing to next row

**`dispute-modal.tsx`** — Dialog with 10-char minimum textarea

### Plan C — Corrections + Sidebar Badge (Wave 2)

**`corrections/route.ts`** — POST endpoint:
- Only PAID/CORRECTED assignments can be corrected
- Validates originalComponentId belongs to the assignment
- `abs(amount)` then apply sign — prevents double-negation
- ADJUSTMENT_POSITIVE → positive grossAmount; ADJUSTMENT_NEGATIVE → negative
- Creates component + flips status to CORRECTED + writes audit log in one transaction
- Returns 201 with new component + updated assignment

**`correction-modal.tsx`** — Dialog in assignment-card:
- Component selector (general or specific original line)
- Direction buttons (add vs deduct) — no RadioGroup (not available in shadcn setup)
- Amount input + min-10-char reason textarea
- Preview of adjustment vs original line
- Only shown for PAID/CORRECTED assignments

**`pending-pay-badge.tsx`** — Polling badge:
- Polls `?countOnly=true` every 60s
- Silent failure, renders only when count > 0
- Shows "9+" when count exceeds 9

**Sidebar wiring** — New "Driver Pay" item in Carrier Ops group:
- OWNER always visible; MANAGER gated by `driverPayReport` permission
- Links to `/carrier/driver-pay/pending` with badge inline
- Existing Reports → Driver Pay sub-item at `/carrier/reports/driver-pay` preserved

## Test Coverage

| Test File | Tests | Description |
|---|---|---|
| `state-machine.test.ts` | 43 | All valid/invalid transitions, pre-conditions, error shapes, adjustmentTypeFor |
| `transitions-api.test.ts` | 14 | Auth, RBAC, body validation, happy path, 422 errors, IP capture, transaction |
| `pending-queue-api.test.ts` | 12 | Auth, RBAC, filters, countOnly, amount filter, sort, driver name composition |
| `corrections-api.test.ts` | 18 | Auth, RBAC, body validation, state validation, sign math, audit log, transaction |
| **Total** | **87** | All passing |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `loadNumber` field does not exist on CarrierLoad**
- **Found during:** Task B1 (TypeScript check)
- **Issue:** Plan referenced `load: { select: { loadNumber: true } }` but CarrierLoad model has `referenceNumber` not `loadNumber`
- **Fix:** Changed to `{ select: { referenceNumber: true } }` and mapped it to `loadNumber` in the serialized output
- **Files modified:** `apps/web/src/app/api/driver-pay/pending-queue/route.ts`

**2. [Rule 2 - Missing functionality] `isOverride` field not on DB model**
- **Found during:** Task A2 planning
- **Issue:** Plan assumed an `isOverride` boolean field on LoadDriverAssignment; schema only has `overrideReason: String?`
- **Fix:** FSM snapshot infers `isOverride = !!overrideReason` (non-null overrideReason means override is in effect)
- **Files modified:** `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts`

**3. [Rule 2 - Missing functionality] No RadioGroup component in shadcn/ui setup**
- **Found during:** Task C1 (correction-modal.tsx)
- **Issue:** Plan called for RadioGroup component; not available in `apps/web/src/components/ui/`
- **Fix:** Used two Button elements with `variant` toggling (default/outline) for direction selection — equivalent UX
- **Files modified:** `apps/web/src/components/driver-pay/correction-modal.tsx`

**4. [Rule 1 - Bug] Zod UUID validation strict about format**
- **Found during:** Task B1 test run
- **Issue:** Test used `driver-uuid-123` as driverId which failed `z.string().uuid()` validation, causing route to return 400 before calling findMany
- **Fix:** Updated test to use RFC 4122 compliant UUID `550e8400-e29b-41d4-a716-446655440000`
- **Files modified:** `apps/web/src/app/api/driver-pay/__tests__/pending-queue-api.test.ts`

**5. [Rule 2 - Missing] submittedAt/submittedBy/disputedAt/disputedBy fields absent from schema**
- **Found during:** Task A2
- **Issue:** Plan included conditional spreads for these timestamps; LoadDriverAssignment only has `approvedAt`/`approvedBy` in schema
- **Fix:** Dropped non-existent fields; only `approvedAt`/`approvedBy` set on approve action; audit log captures all timestamps
- **Files modified:** `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts`

## Known Follow-ups

- **Phase 8 — Settlement engine:** Reads APPROVED assignments + ADJUSTMENT components to generate DriverSettlement records; writes APPROVED→PAID transition directly with settlementId (bypasses transition API)
- **Granular driver-pay permissions:** Currently uses `driverPayReport` permission key for the sidebar item; future work should split into separate `driverPayApprove` and `driverPayReport` permissions
- **Keyboard shortcut A/D in queue:** Currently ↑/↓ works at the page level; A/D shortcuts live as button labels in the approval card but aren't hooked up as global keyboard shortcuts (the approval card buttons already have the actions; connecting global keydown for A/D would conflict with text inputs)

## Self-Check: PASSED

All 14 created files exist on disk. All 6 commits verified in git log. 87/87 tests green. Zero TypeScript errors (pre-existing render-mdx.ts error excluded).
