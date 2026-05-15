---
phase: 301-driver-pay-phase-6
plan: 301
type: execute
wave: 1
depends_on: []
files_modified:
  # Plan A — State Machine + Transition APIs (Wave 1)
  - apps/web/src/lib/driver-pay/state-machine.ts
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
  - apps/web/src/lib/driver-pay/__tests__/state-machine.test.ts
  - apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
  # Plan B — Pending Queue + Approval Card UI (Wave 2)
  - apps/web/src/app/api/driver-pay/pending-queue/route.ts
  - apps/web/src/app/api/driver-pay/__tests__/pending-queue-api.test.ts
  - apps/web/src/app/(owner)/carrier/driver-pay/pending/page.tsx
  - apps/web/src/components/driver-pay/pending-queue-client.tsx
  - apps/web/src/components/driver-pay/approval-card.tsx
  - apps/web/src/components/driver-pay/dispute-modal.tsx
  # Plan C — Corrections + Sidebar Badge + Audit API (Wave 2, parallel to B)
  - apps/web/src/components/driver-pay/correction-modal.tsx
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
  - apps/web/src/app/api/driver-pay/__tests__/corrections-api.test.ts
  - apps/web/src/components/navigation/pending-pay-badge.tsx
  - apps/web/src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "Owner/Manager can submit a DRAFT assignment for review and the API blocks submission if no BASE_PAY component exists"
    - "Owner/Manager can approve a PENDING_REVIEW assignment, and the API blocks approval if CPM lacks actual_miles or PERCENTAGE lacks load_revenue"
    - "Owner/Manager can dispute a PENDING_REVIEW or APPROVED assignment with a required reason"
    - "Every status transition writes a DriverPayAuditLog row capturing previous→new status, actor, and IP"
    - "Owner/Manager sees a Pending Pay Queue listing every PENDING_REVIEW + DISPUTED assignment in their tenant, oldest first, with driver, load, total, override badge, and age"
    - "Selecting a row in the queue opens an Approval Card in the right pane showing all components with override highlights and a sticky Approve / Dispute action bar"
    - "Pressing A approves, D disputes, ↑/↓ navigates rows, and Enter opens the selected detail — all without modals"
    - "After approving, focus advances to the next row automatically"
    - "Owner/Manager can open a Correction modal on a PAID/CORRECTED assignment, pick an original component, enter a reason + amount, and save — which creates an ADJUSTMENT component with the correct sign and flips the assignment to CORRECTED"
    - "A red count badge appears next to the Driver Pay sidebar item showing how many assignments are PENDING_REVIEW for the current tenant, polling every 60s"
    - "Cross-tenant access returns 404 on every new endpoint; DRIVER role gets 403 on approve/dispute/correct"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/state-machine.ts"
      provides: "Pure canTransition() function returning discriminated union with user-friendly error strings"
      exports: ["canTransition", "PayStatus", "TransitionAction", "TransitionResult"]
      min_lines: 180
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts"
      provides: "POST endpoint that runs canTransition, persists status, writes audit log"
      exports: ["POST"]
    - path: "apps/web/src/lib/driver-pay/__tests__/state-machine.test.ts"
      provides: "Unit tests covering every valid + invalid transition and every pre-condition"
      contains: "describe('canTransition'"
    - path: "apps/web/src/app/api/driver-pay/pending-queue/route.ts"
      provides: "GET endpoint listing PENDING_REVIEW + DISPUTED assignments with filters and count mode"
      exports: ["GET"]
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/pending/page.tsx"
      provides: "Server component shell for the Pending Pay Queue page"
    - path: "apps/web/src/components/driver-pay/pending-queue-client.tsx"
      provides: "Client component with filter bar, two-panel layout, keyboard navigation"
      contains: "useEffect"
    - path: "apps/web/src/components/driver-pay/approval-card.tsx"
      provides: "Right-pane detail with component table, sticky action bar, inline pre-condition errors"
    - path: "apps/web/src/components/driver-pay/correction-modal.tsx"
      provides: "Dialog-based modal that creates ADJUSTMENT components against PAID/CORRECTED assignments"
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts"
      provides: "POST endpoint that creates ADJUSTMENT component, flips status to CORRECTED, writes audit log"
      exports: ["POST"]
    - path: "apps/web/src/components/navigation/pending-pay-badge.tsx"
      provides: "Polling badge identical in pattern to MessagesBadge"
      contains: "setInterval"
  key_links:
    - from: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts"
      to: "apps/web/src/lib/driver-pay/state-machine.ts"
      via: "import canTransition"
      pattern: "from '@/lib/driver-pay/state-machine'"
    - from: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts"
      to: "prisma.driverPayAuditLog"
      via: "prisma.driverPayAuditLog.create"
      pattern: "driverPayAuditLog\\.create"
    - from: "apps/web/src/components/driver-pay/pending-queue-client.tsx"
      to: "/api/driver-pay/pending-queue"
      via: "fetch in useEffect"
      pattern: "fetch.*pending-queue"
    - from: "apps/web/src/components/driver-pay/approval-card.tsx"
      to: "/api/driver-pay/assignments/[id]/transitions"
      via: "fetch POST"
      pattern: "fetch.*transitions"
    - from: "apps/web/src/components/driver-pay/correction-modal.tsx"
      to: "/api/driver-pay/assignments/[id]/corrections"
      via: "fetch POST"
      pattern: "fetch.*corrections"
    - from: "apps/web/src/components/navigation/sidebar.tsx"
      to: "apps/web/src/components/navigation/pending-pay-badge.tsx"
      via: "import + render next to Driver Pay link"
      pattern: "PendingPayBadge"
---

<objective>
Ship Driver Pay Phase 6: a fully-wired state machine for `LoadDriverAssignment` (DRAFT → PENDING_REVIEW → APPROVED → PAID with DISPUTED + CORRECTED branches), a Pending Pay Queue with keyboard-driven approval flow, a Corrections workflow for paid assignments, and a real-time sidebar badge that tells the owner how many pay items are waiting.

Purpose: Today the schema supports the state machine (Phase 1) and components/templates exist (Phases 2–5), but assignments live forever in DRAFT — there is no way to submit, approve, dispute, or correct pay. Phase 8's settlement engine needs APPROVED assignments + ADJUSTMENT components to do its job, so Phase 6 is the gate before any settlements can be generated. After this phase a manager can clear their pay queue without leaving the keyboard.

Output: State machine module + transition API, pending queue API + page, approval card UI, corrections modal + API, sidebar badge, audit log entries on every transition + correction, and unit/integration tests for the pure logic and tenant/RBAC paths.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/schema.prisma
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/auth/roles.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/driver-pay/calculator.ts
@apps/web/src/lib/driver-pay/snapshot.ts
@apps/web/src/lib/driver-pay/auto-base-pay.ts
@apps/web/src/lib/driver-pay/detention.ts
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts
@apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts
@apps/web/src/components/driver-pay/assignment-card.tsx
@apps/web/src/components/driver-pay/pay-components-list.tsx
@apps/web/src/components/driver-pay/add-component-modal.tsx
@apps/web/src/components/driver-pay/override-form.tsx
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/components/navigation/messages-badge.tsx
@docs/specs/DriverPay_TechnicalSpec_v4.md
</context>

<!-- ================================================================== -->
<!-- PLAN A — STATE MACHINE + TRANSITION API (Wave 1, blocks B and C)    -->
<!-- ================================================================== -->

<tasks>

<task type="auto">
  <name>Task A1: Pure state machine module + comprehensive unit tests</name>
  <files>
    apps/web/src/lib/driver-pay/state-machine.ts
    apps/web/src/lib/driver-pay/__tests__/state-machine.test.ts
  </files>
  <action>
Create a pure-function state machine module — no Prisma imports, no React, no Next.js. This module is the single source of truth for "can this assignment move to that status?" and is consumed by the transition API in A2.

**File 1: `apps/web/src/lib/driver-pay/state-machine.ts`**

Types & exports:
```ts
export type PayStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PAID' | 'DISPUTED' | 'CORRECTED';
export type TransitionAction = 'submit' | 'approve' | 'dispute' | 'correct' | 'reject';

export interface AssignmentSnapshotForFsm {
  payStatus: PayStatus;
  paymentModel: 'CPM' | 'FLAT' | 'PERCENTAGE' | 'HOURLY' | 'DAILY'; // mirror enum
  actualMiles: string | null;            // Decimal as string
  mileageSource: string | null;
  loadRevenue: string | null;            // Decimal as string
  overrideReason: string | null;
  isOverride: boolean;                   // true if any snapshot field differs from template
  settlementId: string | null;
}

export interface ComponentSnapshotForFsm {
  componentType: string;   // e.g. 'BASE_PAY_CPM', 'ADJUSTMENT_POSITIVE'
  category: string;        // 'BASE_PAY' | 'ACCESSORIAL' | 'DEDUCTION' | 'ALLOWANCE' | 'REIMBURSEMENT' | 'ADJUSTMENT'
  originalComponentId: string | null;
  grossAmount: string;     // Decimal as string
}

export type TransitionResult =
  | { ok: true; nextStatus: PayStatus }
  | { ok: false; reason: string; actionHint?: string };

export function canTransition(
  assignment: AssignmentSnapshotForFsm,
  action: TransitionAction,
  components: ComponentSnapshotForFsm[],
): TransitionResult;
```

Transition table (implement EXACTLY this — see spec §3.2):

| Current → action | Next | Pre-conditions |
| --- | --- | --- |
| DRAFT → submit | PENDING_REVIEW | (1) ≥1 component whose componentType starts with `BASE_PAY_`. (2) If `isOverride === true`, `overrideReason` must be a non-empty string. |
| PENDING_REVIEW → approve | APPROVED | (1) If `paymentModel === 'CPM'`, `actualMiles` non-null AND `mileageSource` non-null. (2) If `paymentModel === 'PERCENTAGE'`, `loadRevenue` non-null AND `> 0`. |
| PENDING_REVIEW → dispute | DISPUTED | always allowed |
| PENDING_REVIEW → reject | DRAFT | always allowed (sends back to draft to fix) |
| APPROVED → dispute | DISPUTED | always allowed |
| APPROVED → submit | (n/a — return error) | only the settlement engine can transition APPROVED → PAID; reject any action other than dispute here |
| DISPUTED → submit | PENDING_REVIEW | same pre-conditions as DRAFT→submit |
| DISPUTED → reject | DRAFT | always allowed |
| PAID → correct | CORRECTED | (1) `components.some(c => c.category === 'ADJUSTMENT' && c.originalComponentId !== null OR c.componentType === 'ADJUSTMENT_POSITIVE' OR 'ADJUSTMENT_NEGATIVE')` — i.e. an ADJUSTMENT component exists. |
| CORRECTED → correct | CORRECTED | same — allow further corrections |
| anything else | — | `{ ok: false, reason: ... }` |

**Critical:** Note PAID → PAID transitions are forbidden. APPROVED → PAID is reserved for Phase 8's settlement engine and is NOT exposed in this state machine (the settlement engine writes the status directly with a settlementId — leave a `// reserved for Phase 8` comment).

Error messages — use Pattern B from spec §8.5 (user-friendly + actionHint). Examples to use verbatim:

- DRAFT → submit, no BASE_PAY component:
  - `reason`: "This assignment doesn't have a base pay line yet."
  - `actionHint`: "Add a base pay component (mileage, flat, percentage, hourly, or daily) before submitting for review."
- DRAFT → submit, override without reason:
  - `reason`: "An override is in place but no reason was given."
  - `actionHint`: "Open the override form and add a short reason describing why this assignment differs from the template."
- PENDING_REVIEW → approve, CPM missing miles:
  - `reason`: "Cannot approve — actual miles haven't been recorded."
  - `actionHint`: "Open the load and confirm the trip's actual miles + mileage source (Google, manual, etc.), then try again."
- PENDING_REVIEW → approve, PERCENTAGE missing revenue:
  - `reason`: "Cannot approve — load revenue is missing or zero."
  - `actionHint`: "Set the load's revenue (rate confirmation total) on the load page, then try again."
- PAID → correct, no ADJUSTMENT component:
  - `reason`: "Cannot mark as corrected without an adjustment line."
  - `actionHint`: "Use the Correction modal to add an adjustment first."
- Any unsupported transition (e.g. DRAFT → approve, APPROVED → submit, PAID → submit):
  - `reason`: `Cannot transition from ${current} via ${action}.`
  - `actionHint`: "Refresh the page — the assignment status may have changed since you opened it."

Implementation notes:
- Treat string Decimal fields as strings; use `new Decimal(x).gt(0)` for >0 checks (import `Decimal` from `decimal.js` — already used in calculator.ts).
- Export a `TRANSITION_LABELS: Record<TransitionAction, string>` const map (e.g. `submit: 'Submitted for review'`) for use in audit log action strings.
- Export a `nextStatusFor(current, action)` helper that returns `PayStatus | null` — used by the API to write the status without re-running the full check after canTransition succeeds.

**File 2: `apps/web/src/lib/driver-pay/__tests__/state-machine.test.ts`**

Use Vitest. Follow the existing pattern in `apps/web/src/app/api/driver-pay/__tests__/components-api.test.ts` — describe + it blocks, no mocking needed (pure function).

Test groups (each `describe`):

1. **`describe('valid transitions')`** — for each happy path, assert `{ ok: true, nextStatus: ... }`:
   - DRAFT → submit → PENDING_REVIEW (with BASE_PAY_FLAT component, no override)
   - DRAFT → submit → PENDING_REVIEW (with override + overrideReason)
   - PENDING_REVIEW → approve → APPROVED (FLAT model, no miles/revenue needed)
   - PENDING_REVIEW → approve → APPROVED (CPM with actualMiles + mileageSource)
   - PENDING_REVIEW → approve → APPROVED (PERCENTAGE with loadRevenue > 0)
   - PENDING_REVIEW → dispute → DISPUTED
   - PENDING_REVIEW → reject → DRAFT
   - APPROVED → dispute → DISPUTED
   - DISPUTED → submit → PENDING_REVIEW (with BASE_PAY component)
   - DISPUTED → reject → DRAFT
   - PAID → correct → CORRECTED (with ADJUSTMENT_POSITIVE component present)
   - CORRECTED → correct → CORRECTED (additional adjustments allowed)

2. **`describe('invalid transitions')`** — assert `{ ok: false, reason: /Cannot transition from/ }`:
   - DRAFT → approve
   - DRAFT → correct
   - PENDING_REVIEW → correct
   - APPROVED → submit
   - APPROVED → approve
   - APPROVED → correct
   - PAID → submit
   - PAID → approve
   - PAID → dispute
   - PAID → reject

3. **`describe('pre-condition failures')`**:
   - DRAFT → submit with NO BASE_PAY component → reason contains "base pay line"
   - DRAFT → submit with override but no overrideReason → reason contains "no reason was given"
   - PENDING_REVIEW → approve, CPM, actualMiles = null → reason contains "actual miles"
   - PENDING_REVIEW → approve, CPM, mileageSource = null → reason contains "mileage source" or "actual miles"
   - PENDING_REVIEW → approve, PERCENTAGE, loadRevenue = null → reason contains "load revenue"
   - PENDING_REVIEW → approve, PERCENTAGE, loadRevenue = "0" → reason contains "load revenue"
   - PAID → correct with NO ADJUSTMENT component → reason contains "adjustment line"

4. **`describe('error message shape')`**:
   - Every failure must have `ok === false`, `reason` is a non-empty user-friendly string (no `ERR_` codes), `actionHint` (when present) is a non-empty string.
   - Specifically assert: `expect(result.reason).not.toMatch(/ERR_|E[0-9]+|throw/i);`

5. **`describe('correction sign')`** — NOT testing canTransition itself but a helper: export `adjustmentTypeFor(amount: number | string): 'ADJUSTMENT_POSITIVE' | 'ADJUSTMENT_NEGATIVE'` from state-machine.ts (positive amount → POSITIVE, negative → NEGATIVE, zero throws). Test all three branches.

Aim for ~35–45 tests total.
  </action>
  <verify>
- Run `pnpm --filter web test -- state-machine.test.ts` (or `npx vitest run apps/web/src/lib/driver-pay/__tests__/state-machine.test.ts`) — all tests pass.
- Run `pnpm --filter web exec tsc --noEmit` — zero TypeScript errors.
- `grep -r "from '@/lib/driver-pay/state-machine'" apps/web/src` — no other files import yet (this task only exposes the module).
  </verify>
  <done>
- `state-machine.ts` exports `canTransition`, `nextStatusFor`, `adjustmentTypeFor`, `TRANSITION_LABELS`, plus the type exports above.
- ≥35 passing tests in `state-machine.test.ts`.
- No Prisma, Next.js, or React imports in `state-machine.ts`.
- Every error message is a complete English sentence; no error codes.
  </done>
</task>

<task type="auto">
  <name>Task A2: Transition API route + RBAC + audit log + integration tests</name>
  <files>
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
    apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
  </files>
  <action>
Wire the state machine to the database. This is the only place that mutates `assignment.payStatus` for user-initiated transitions (settlement engine in Phase 8 will be the only other writer).

**File 1: `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts`**

Structure (mirror the existing `components/route.ts` for imports, session pattern, error shape):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import {
  canTransition,
  nextStatusFor,
  TRANSITION_LABELS,
  type TransitionAction,
  type PayStatus,
  type AssignmentSnapshotForFsm,
  type ComponentSnapshotForFsm,
} from '@/lib/driver-pay/state-machine';

const BodySchema = z.object({
  action: z.enum(['submit', 'approve', 'dispute', 'reject', 'correct']),
  reason: z.string().min(1).max(2000).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) { ... }
```

Logic flow:

1. `session = await getSession()` — if null → 401 `{ error: 'Unauthorized' }`.
2. Parse body with Zod — on failure → 400 with `parsed.error.issues[0].message`.
3. RBAC gate:
   - DRIVER role → 403 `{ error: 'Drivers cannot change pay status.' }`.
   - Any other action than `submit`/`approve`/`dispute`/`reject`/`correct` is already filtered by Zod.
   - `approve`, `dispute`, `reject`, `correct` allowed for OWNER + MANAGER only. `submit` also OWNER + MANAGER (drivers can't submit either — per spec: managers submit on behalf of drivers if needed).
   - Compare role using both casings: `role === UserRole.OWNER || role === UserRole.MANAGER` AND a lowercase fallback (`role === 'owner' || role === 'manager'`) — mirror components/route.ts's `isDriver` check pattern.
4. Load assignment via tenant-scoped prisma: `prisma.loadDriverAssignment.findFirst({ where: { id: assignmentId, deletedAt: null } })`. If null → 404 `{ error: 'Assignment not found.' }`. (Tenant isolation is enforced by `getTenantPrisma()` — DO NOT add a manual tenantId filter.)
5. Load components: `prisma.loadPayComponent.findMany({ where: { assignmentId, deletedAt: null } })`. Map to `ComponentSnapshotForFsm[]`.
6. Build `AssignmentSnapshotForFsm`:
   - `payStatus: assignment.payStatus as PayStatus`
   - `paymentModel: assignment.paymentModel`
   - `actualMiles: assignment.actualMiles?.toString() ?? null`
   - `mileageSource: assignment.mileageSource`
   - `loadRevenue: assignment.loadRevenue?.toString() ?? null` (this is on the snapshot, falls back to `load.totalRate` if needed — read from assignment first)
   - `overrideReason: assignment.overrideReason`
   - `isOverride: assignment.isOverride ?? false` (boolean field on assignment snapshot)
   - `settlementId: assignment.settlementId ?? null`
7. `const result = canTransition(snapshot, body.action, components);`
8. If `!result.ok` → return **422** (Unprocessable Entity — pre-condition fail) with `{ error: result.reason, actionHint: result.actionHint }`. Do NOT use 400 — 400 is for malformed input; 422 is for valid input that fails business rules.
9. **Dispute/reject reason required:** if `body.action === 'dispute' || body.action === 'reject'`, require `body.reason` (≥10 chars). If missing → 422 `{ error: 'A reason is required.' }`. (Spec §8.9 Flow C — dispute always requires reason.)
10. **Single transaction**: wrap the status update + audit log in `prisma.$transaction`:
    ```ts
    const prev = assignment.payStatus as PayStatus;
    const next = result.nextStatus;
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      ?? req.headers.get('x-real-ip')
      ?? null;
    const [updated] = await prisma.$transaction([
      prisma.loadDriverAssignment.update({
        where: { id: assignmentId },
        data: {
          payStatus: next,
          ...(body.action === 'dispute' ? { disputeReason: body.reason, disputedAt: new Date(), disputedBy: session.userId } : {}),
          ...(body.action === 'approve' ? { approvedAt: new Date(), approvedBy: session.userId } : {}),
          ...(body.action === 'submit'  ? { submittedAt: new Date(), submittedBy: session.userId } : {}),
        },
      }),
      prisma.driverPayAuditLog.create({
        data: {
          tenantId: assignment.tenantId,
          entityType: 'LoadDriverAssignment',
          entityId: assignmentId,
          action: `status:${prev}->${next}`,
          previousValue: { status: prev },
          newValue: { status: next, reason: body.reason ?? null, actionLabel: TRANSITION_LABELS[body.action] },
          actorId: session.userId,
          ipAddress,
        },
      }),
    ]);
    ```
    NOTE: Only include the `submittedAt/approvedAt/disputedAt` fields IF they exist on the model. If they don't exist in schema.prisma, DROP that ternary — the audit log already captures the timestamp. **Before adding these to the data object, grep schema.prisma for `submittedAt` / `approvedAt` / `disputedAt` on the LoadDriverAssignment model. If absent, omit them entirely.**
11. Return 200 with `{ assignment: serializeAssignment(updated) }`. Reuse/create a minimal `serializeAssignment` helper at the top of this file (Decimal→string, Date→ISO).

Edge cases:
- Body `action: 'correct'` from this endpoint is rejected with 422: "Use the Corrections API to record an adjustment." (corrections go through the dedicated endpoint in Plan C, which then internally writes the status flip.) Add an explicit check: `if (body.action === 'correct') return 422.`

**File 2: `apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts`**

Mirror the existing `components-api.test.ts` mocking pattern. Mock `getSession`, `getTenantPrisma`, and the state-machine module's `canTransition` (so we test the API plumbing, not the FSM — that's already tested in A1).

Test cases (at minimum):
1. Unauthenticated → 401.
2. DRIVER role + submit → 403.
3. Body missing `action` → 400.
4. Invalid `action` value → 400.
5. Dispute without reason → 422.
6. Assignment not found (findFirst returns null) → 404.
7. Happy path — `canTransition` mocked `{ ok: true, nextStatus: 'PENDING_REVIEW' }` → 200 + assignment update called + audit log created with `action: 'status:DRAFT->PENDING_REVIEW'` and `previousValue: { status: 'DRAFT' }`.
8. Pre-condition fail — `canTransition` mocked `{ ok: false, reason: 'X', actionHint: 'Y' }` → 422 + body `{ error: 'X', actionHint: 'Y' }`.
9. Cross-tenant — `findFirst` returns null because tenant-scoped prisma can't see it → 404.
10. Correction via this endpoint → 422 with the "Use the Corrections API" message.
11. IP capture — verify `prisma.driverPayAuditLog.create` is called with `ipAddress: '1.2.3.4'` when `x-forwarded-for: '1.2.3.4, 5.6.7.8'` is set.
12. Transaction usage — verify `prisma.$transaction` is called (assignment update + audit log together).

  </action>
  <verify>
- `pnpm --filter web test -- transitions-api.test.ts` — all pass.
- `pnpm --filter web exec tsc --noEmit` — zero errors.
- `curl -X POST http://localhost:3000/api/driver-pay/assignments/<id>/transitions -H 'Content-Type: application/json' -d '{"action":"submit"}'` against a real DRAFT assignment with a BASE_PAY component returns 200 and the status changes in DB; with no BASE_PAY component returns 422 with the user-friendly message.
- `select * from driver_pay_audit_log order by created_at desc limit 1;` in Supabase shows the audit row.
  </verify>
  <done>
- `POST /api/driver-pay/assignments/[assignmentId]/transitions` enforces auth, RBAC, body validation, runs canTransition, writes status + audit atomically, returns 422 with user-friendly errors.
- Driver/cross-tenant access blocked.
- Audit log captures previousValue, newValue, actorId, ipAddress on every successful transition.
- ≥10 passing tests in `transitions-api.test.ts`.
  </done>
</task>

<!-- ================================================================== -->
<!-- PLAN B — PENDING PAY QUEUE + APPROVAL CARD (Wave 2, depends on A)  -->
<!-- ================================================================== -->

<task type="auto">
  <name>Task B1: Pending queue API with filters, count mode, and integration tests</name>
  <files>
    apps/web/src/app/api/driver-pay/pending-queue/route.ts
    apps/web/src/app/api/driver-pay/__tests__/pending-queue-api.test.ts
  </files>
  <action>
Server endpoint for the queue page AND the sidebar badge. Two modes via query param.

**File 1: `apps/web/src/app/api/driver-pay/pending-queue/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';

const QuerySchema = z.object({
  countOnly: z.enum(['true', 'false']).optional(),
  driverId: z.string().uuid().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  minAmount: z.string().optional(),       // Decimal string
  maxAmount: z.string().optional(),
  overrideOnly: z.enum(['true', 'false']).optional(),
  sort: z.enum(['oldest', 'newest', 'amount_desc', 'amount_asc']).optional().default('oldest'),
});

export async function GET(req: NextRequest) { ... }
```

Logic:
1. Auth: `getSession()` — 401 if missing.
2. RBAC: DRIVER role → 403 (`'Drivers cannot view the pending pay queue.'`). OWNER + MANAGER allowed.
3. Parse query — on fail → 400.
4. `const prisma = await getTenantPrisma();`
5. Build `where`:
   ```ts
   const where: Prisma.LoadDriverAssignmentWhereInput = {
     deletedAt: null,
     payStatus: { in: ['PENDING_REVIEW', 'DISPUTED'] },
     ...(query.driverId ? { driverId: query.driverId } : {}),
     ...(query.dateFrom || query.dateTo
       ? { createdAt: { ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}), ...(query.dateTo ? { lte: new Date(query.dateTo) } : {}) } }
       : {}),
     ...(query.overrideOnly === 'true' ? { isOverride: true } : {}),
   };
   ```
6. **Count-only mode:** if `countOnly === 'true'`, return `{ count: await prisma.loadDriverAssignment.count({ where: { ...where, payStatus: 'PENDING_REVIEW' } }) }` — note this counts ONLY PENDING_REVIEW for the badge (disputed items don't bother the badge per spec).
7. **Full mode:** query rows with joins:
   ```ts
   const rows = await prisma.loadDriverAssignment.findMany({
     where,
     include: {
       driver: { select: { id: true, firstName: true, lastName: true } },
       load: { select: { id: true, loadNumber: true } },
       components: { where: { deletedAt: null }, select: { grossAmount: true } },
     },
     orderBy: query.sort === 'newest' ? { createdAt: 'desc' } : query.sort === 'oldest' ? { createdAt: 'asc' } : undefined,
   });
   ```
8. Compute `totalPay` per row = sum of `components.grossAmount` (using Decimal). Apply `minAmount`/`maxAmount` filters in-memory after computing total (Prisma can't sum across joined relations in a filter cleanly).
9. Sort by amount in-memory if `sort === 'amount_desc'` / `'amount_asc'`.
10. Compute `ageDays` = `Math.floor((Date.now() - createdAt.getTime()) / 86400000)`.
11. Serialize rows to:
    ```ts
    {
      id: string;
      driverId: string;
      driverName: string;          // "First Last"
      loadId: string;
      loadNumber: string | null;
      payStatus: 'PENDING_REVIEW' | 'DISPUTED';
      paymentModel: string;
      totalPay: string;            // Decimal as string
      isOverride: boolean;
      overrideReason: string | null;
      ageDays: number;
      createdAt: string;           // ISO
    }
    ```
12. Return `{ assignments: [...], count: assignments.length }`.

**File 2: `apps/web/src/app/api/driver-pay/__tests__/pending-queue-api.test.ts`**

Following the components-api.test.ts mocking pattern, cover:
1. Unauthenticated → 401.
2. DRIVER role → 403.
3. Default call returns assignments in PENDING_REVIEW + DISPUTED, sorted oldest first.
4. `countOnly=true` → returns `{ count: N }` only, counts only PENDING_REVIEW (mock prisma.count returns 5 → response is `{ count: 5 }`).
5. Filter by `driverId` → where clause includes it.
6. Filter by `overrideOnly=true` → where clause includes `isOverride: true`.
7. `minAmount=100` filters out rows with totalPay < 100.
8. `sort=amount_desc` returns rows highest total first.
9. Cross-tenant: tenant-scoped prisma returns empty → empty array, count 0.
10. Driver name composition: rows with `firstName: 'Jane', lastName: 'Doe'` → `driverName: 'Jane Doe'`.
  </action>
  <verify>
- `pnpm --filter web test -- pending-queue-api.test.ts` — all pass.
- `pnpm --filter web exec tsc --noEmit` — zero errors.
- `curl 'http://localhost:3000/api/driver-pay/pending-queue?countOnly=true'` returns `{"count": <n>}`.
- `curl 'http://localhost:3000/api/driver-pay/pending-queue'` returns array with proper shape (manual smoke test against seeded data).
  </verify>
  <done>
- `GET /api/driver-pay/pending-queue` returns filtered+sorted PENDING_REVIEW+DISPUTED list for OWNER/MANAGER.
- `?countOnly=true` returns just `{ count }` for the badge.
- All filters (driverId, dateFrom/To, minAmount/maxAmount, overrideOnly, sort) work.
- ≥10 passing tests.
  </done>
</task>

<task type="auto">
  <name>Task B2: Pending queue page + two-panel client component with keyboard navigation</name>
  <files>
    apps/web/src/app/(owner)/carrier/driver-pay/pending/page.tsx
    apps/web/src/components/driver-pay/pending-queue-client.tsx
    apps/web/src/components/driver-pay/approval-card.tsx
    apps/web/src/components/driver-pay/dispute-modal.tsx
  </files>
  <action>
Build the two-panel approval surface. The server page is thin — auth + render client component. All interactivity lives client-side.

**File 1: `apps/web/src/app/(owner)/carrier/driver-pay/pending/page.tsx`** (server component)

```tsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { PendingQueueClient } from '@/components/driver-pay/pending-queue-client';

export default async function PendingPayQueuePage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const role = session.role;
  const isOwnerOrManager =
    role === UserRole.OWNER || role === UserRole.MANAGER || role === 'owner' || role === 'manager';
  if (!isOwnerOrManager) redirect('/carrier/dashboard');

  return (
    <div className="flex h-full flex-col p-6">
      <header className="mb-4">
        <h1 className="text-2xl font-semibold">Pending Pay</h1>
        <p className="text-sm text-muted-foreground">
          Review and approve driver pay for completed loads. Use ↑/↓ to navigate, A to approve, D to dispute.
        </p>
      </header>
      <PendingQueueClient />
    </div>
  );
}
```

**File 2: `apps/web/src/components/driver-pay/pending-queue-client.tsx`** (client component)

State:
```ts
type QueueRow = { id: string; driverId: string; driverName: string; loadId: string; loadNumber: string | null; payStatus: 'PENDING_REVIEW' | 'DISPUTED'; paymentModel: string; totalPay: string; isOverride: boolean; ageDays: number; createdAt: string };

const [rows, setRows] = useState<QueueRow[]>([]);
const [selectedId, setSelectedId] = useState<string | null>(null);
const [loading, setLoading] = useState(true);
const [filters, setFilters] = useState({ driverId: '', dateFrom: '', dateTo: '', minAmount: '', maxAmount: '', overrideOnly: false, sort: 'oldest' as const });
```

Layout (uses shadcn/ui — already in this codebase):
```tsx
<div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
  {/* LEFT: filter bar + scrollable list */}
  <div className="flex flex-col gap-2 overflow-hidden rounded-md border bg-card">
    <FilterBar filters={filters} onChange={setFilters} drivers={driverOptions} />
    <div className="flex-1 overflow-y-auto" ref={listRef}>
      {rows.length === 0 ? <EmptyState /> : rows.map((row, i) => <QueueRowItem ... />)}
    </div>
  </div>
  {/* RIGHT: approval card detail */}
  <div className="overflow-hidden rounded-md border bg-card">
    {selectedId ? <ApprovalCard assignmentId={selectedId} onTransition={handleTransition} /> : <SelectPrompt />}
  </div>
</div>
```

Behaviors:
1. On mount + on filter change → fetch `/api/driver-pay/pending-queue?${buildQuery(filters)}` → setRows → auto-select first row if `selectedId === null`.
2. Keyboard listener (useEffect on `window`) — only active when the page is focused (not inside an input). Use `e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement` to skip.
   - `ArrowDown` → select next row (wrap at end? no — stop at end). Scroll into view via `listRef.current.children[i].scrollIntoView({ block: 'nearest' })`.
   - `ArrowUp` → select previous row.
   - `Enter` → no-op (detail is already visible in right pane); keep for future "open full page" hook.
   - `a` or `A` → call `handleApprove(selectedId)`.
   - `d` or `D` → call `handleDispute(selectedId)` (opens DisputeModal).
3. `handleTransition` callback (passed to ApprovalCard) is called after a successful approve. It must:
   - Remove the approved row from `rows` (immutable filter).
   - Auto-advance `selectedId` to the next row in the (now-filtered) list, or null if list empty.
4. Empty state (spec §8.6):
   ```tsx
   <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
     <CheckCircle2 className="h-12 w-12 text-emerald-500" />
     <p className="text-base font-medium">All caught up.</p>
     <p className="text-sm text-muted-foreground">No pay items waiting for review.</p>
   </div>
   ```
5. Row item visual:
   ```tsx
   <button
     type="button"
     onClick={() => setSelectedId(row.id)}
     className={cn(
       "flex w-full items-start gap-3 border-b px-3 py-3 text-left transition hover:bg-muted/50 focus:outline-none focus:bg-muted",
       selectedId === row.id && "bg-muted",
     )}
   >
     <div className="flex-1 min-w-0">
       <div className="flex items-center gap-2">
         <span className="font-medium truncate">{row.driverName}</span>
         {row.isOverride && <Badge variant="outline" className="border-amber-500 text-amber-600">Override</Badge>}
       </div>
       <div className="text-xs text-muted-foreground">Load {row.loadNumber ?? '—'} • {row.ageDays}d ago</div>
     </div>
     <div className="text-right">
       <div className="font-mono text-sm">${row.totalPay}</div>
       <Badge variant={row.payStatus === 'DISPUTED' ? 'destructive' : 'secondary'} className={row.payStatus === 'PENDING_REVIEW' ? 'bg-amber-100 text-amber-900' : undefined}>
         {row.payStatus === 'DISPUTED' ? 'Disputed' : 'Pending'}
       </Badge>
     </div>
   </button>
   ```
6. Filter bar: simple — a Select for driver (fetched from `/api/drivers` or similar — read existing driver-list endpoint), date range inputs, amount inputs, override toggle, sort dropdown. Debounce filter changes (300ms) before refetch.

**File 3: `apps/web/src/components/driver-pay/approval-card.tsx`**

Props: `{ assignmentId: string; onTransition: (id: string) => void }`. Self-fetches assignment + components on mount + when `assignmentId` changes.

```tsx
export function ApprovalCard({ assignmentId, onTransition }: Props) {
  const [data, setData] = useState<ApprovalCardData | null>(null);
  const [submitting, setSubmitting] = useState<'approve' | 'dispute' | null>(null);
  const [transitionError, setTransitionError] = useState<{ message: string; hint?: string } | null>(null);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [flashGreen, setFlashGreen] = useState(false);
  ...
}
```

Fetch from existing endpoints:
- Assignment: `GET /api/driver-pay/assignments/${assignmentId}` (use existing endpoint if it exists; otherwise the queue API already returned the row — pass it down OR fetch via the components endpoint and a new lightweight assignment endpoint. **Check** `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/route.ts` first; if it doesn't exist, accept the assignment data as a prop from the queue client instead of refetching.)
- Components: `GET /api/driver-pay/assignments/${assignmentId}/components`.

Layout:
```tsx
<div className={cn("flex h-full flex-col transition-colors", flashGreen && "bg-emerald-50")}>
  <header className="border-b p-4">
    <div className="flex items-baseline justify-between gap-2">
      <div>
        <h2 className="text-lg font-semibold">{driverName}</h2>
        <p className="text-sm text-muted-foreground">Load {loadNumber} • {paymentModel}</p>
      </div>
      <div className="text-right">
        <div className="text-2xl font-semibold tabular-nums">${total}</div>
        <Badge variant="secondary">{payStatus}</Badge>
      </div>
    </div>
  </header>

  <div className="flex-1 overflow-y-auto p-4">
    <table className="w-full text-sm">
      <thead className="text-xs uppercase text-muted-foreground">
        <tr><th>Type</th><th>Description</th><th className="text-right">Qty/Unit</th><th className="text-right">Rate</th><th className="text-right">Amount</th></tr>
      </thead>
      <tbody>
        {components.map(c => (
          <tr key={c.id} className={cn("border-t", isOverrideField(c) && "bg-amber-50")}>
            <td>{labelFor(c.componentType)}</td>
            <td>{c.description}</td>
            <td className="text-right tabular-nums">{c.quantity} {c.unit}</td>
            <td className="text-right tabular-nums">${c.rate}</td>
            <td className="text-right tabular-nums">${c.grossAmount}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  {/* Sticky action bar */}
  <div className="sticky bottom-0 border-t bg-background p-3">
    {transitionError && (
      <div className="mb-2 rounded-md border border-amber-200 bg-amber-50 p-2 text-sm">
        <p className="font-medium text-amber-900">{transitionError.message}</p>
        {transitionError.hint && <p className="text-amber-800">{transitionError.hint}</p>}
        <Link href={`/carrier/loads/${loadId}`} className="text-xs text-amber-900 underline">Open load</Link>
      </div>
    )}
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={() => setDisputeOpen(true)} disabled={submitting !== null}>
        Dispute (D)
      </Button>
      <Button onClick={handleApprove} disabled={submitting !== null} className="bg-emerald-600 hover:bg-emerald-700">
        {submitting === 'approve' ? 'Approving…' : 'Approve (A)'}
      </Button>
    </div>
  </div>

  <DisputeModal open={disputeOpen} onOpenChange={setDisputeOpen} onSubmit={handleDisputeSubmit} />
</div>
```

`handleApprove`:
```ts
async function handleApprove() {
  setSubmitting('approve');
  setTransitionError(null);
  const res = await fetch(`/api/driver-pay/assignments/${assignmentId}/transitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'approve' }),
  });
  setSubmitting(null);
  if (res.status === 422) {
    const j = await res.json();
    setTransitionError({ message: j.error, hint: j.actionHint });
    return;
  }
  if (!res.ok) {
    toast.error('Could not approve. Please try again.');
    return;
  }
  // Success — flash green then advance
  setFlashGreen(true);
  setTimeout(() => {
    setFlashGreen(false);
    onTransition(assignmentId);
  }, 350);
}
```

`handleDisputeSubmit(reason: string)`:
- POST to transitions with `{ action: 'dispute', reason }`. On 200 → onTransition. On 422 → setTransitionError.

**File 4: `apps/web/src/components/driver-pay/dispute-modal.tsx`**

A shadcn `Dialog` with a Textarea (min 10 chars) + Submit. Pattern E confirm from spec §8.5 — title "Send back for changes?", body "Tell the driver what needs to change. They'll see this in their pay history.", primary button "Dispute", destructive variant.

Export the queue client component so the badge in Plan C can `import { PendingQueueClient } from '...'` if needed (it doesn't need to, but exports stay clean).
  </action>
  <verify>
- `pnpm --filter web exec tsc --noEmit` — zero errors.
- Navigate to `http://localhost:3000/carrier/driver-pay/pending` as an OWNER — page renders the queue, two-panel layout.
- With ≥1 PENDING_REVIEW assignment seeded: row appears, click it → right pane shows components.
- Press `A` → green flash → row disappears → next row auto-selected.
- Press `D` → dispute modal opens.
- With a CPM assignment missing actual_miles in PENDING_REVIEW: press `A` → inline 422 message appears under the action bar with "Cannot approve — actual miles haven't been recorded." and an "Open load" link.
- DRIVER user visiting `/carrier/driver-pay/pending` → redirects to dashboard.
- Empty state: when no rows, "All caught up." appears.
- `pnpm --filter web lint` passes.
  </verify>
  <done>
- `/carrier/driver-pay/pending` renders the two-panel queue for owners + managers.
- Filter bar functional (driver, date range, amount range, override toggle, sort).
- Keyboard shortcuts work: ↑/↓, A, D.
- Auto-advance after approve.
- Inline pre-condition errors shown without modal.
- Empty state per spec.
- DRIVER role blocked.
  </done>
</task>

<!-- ================================================================== -->
<!-- PLAN C — CORRECTIONS + SIDEBAR BADGE (Wave 2, parallel to B)        -->
<!-- ================================================================== -->

<task type="auto">
  <name>Task C1: Corrections API + modal + tests</name>
  <files>
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts
    apps/web/src/components/driver-pay/correction-modal.tsx
    apps/web/src/app/api/driver-pay/__tests__/corrections-api.test.ts
  </files>
  <action>
**File 1: `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';
import { PayComponentType, PayComponentCategory, PayComponentUnit } from '@/generated/prisma';
import Decimal from 'decimal.js';

const BodySchema = z.object({
  originalComponentId: z.string().uuid().nullable().optional(),
  reason: z.string().min(10).max(2000),
  amount: z.string().refine((v) => { try { return !new Decimal(v).isZero(); } catch { return false; } }, 'Amount must be a non-zero number'),
  type: z.enum(['POSITIVE', 'NEGATIVE']),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ assignmentId: string }> },
) { ... }
```

Logic:
1. Auth → 401 if not logged in.
2. Parse body → 400 on failure.
3. RBAC: DRIVER → 403 ('Drivers cannot create corrections.'). OWNER/MANAGER only.
4. Load assignment via tenant-scoped prisma → 404 if not found.
5. Validate state: `if (!['PAID', 'CORRECTED'].includes(assignment.payStatus))` → 422 `{ error: 'Cannot correct an assignment that has not been paid yet.', actionHint: 'Only paid assignments can be corrected.' }`.
6. If `body.originalComponentId` is set, verify it belongs to this assignment:
   ```ts
   const original = await prisma.loadPayComponent.findFirst({
     where: { id: body.originalComponentId, assignmentId, deletedAt: null },
   });
   if (!original) return NextResponse.json({ error: 'Original component not found on this assignment.' }, { status: 422 });
   ```
7. Compute signed amount + componentType:
   ```ts
   const inputAmount = new Decimal(body.amount).abs();           // user enters positive number
   const signedAmount = body.type === 'POSITIVE' ? inputAmount : inputAmount.neg();
   const componentType: PayComponentType = body.type === 'POSITIVE' ? 'ADJUSTMENT_POSITIVE' : 'ADJUSTMENT_NEGATIVE';
   ```
8. Transaction — create component + update status + audit log:
   ```ts
   const prevStatus = assignment.payStatus;
   const nextStatus = 'CORRECTED';
   const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
   const [component, updatedAssignment] = await prisma.$transaction([
     prisma.loadPayComponent.create({
       data: {
         tenantId: assignment.tenantId,
         assignmentId,
         loadId: assignment.loadId,
         driverId: assignment.driverId,
         stopId: null,
         componentType,
         category: 'ADJUSTMENT' as PayComponentCategory,
         description: `Correction: ${body.reason}`.slice(0, 255),
         quantity: new Decimal(1),
         unit: 'FLAT' as PayComponentUnit,
         rate: signedAmount,
         multiplier: new Decimal(1),
         grossAmount: signedAmount,
         isTaxable: true,
         isReimbursement: false,
         visibleToDriver: true,
         notes: body.reason,
         originalComponentId: body.originalComponentId ?? null,
         enteredBy: session.userId,
         createdBy: session.userId,
       },
     }),
     prisma.loadDriverAssignment.update({
       where: { id: assignmentId },
       data: { payStatus: nextStatus },
     }),
     prisma.driverPayAuditLog.create({
       data: {
         tenantId: assignment.tenantId,
         entityType: 'LoadDriverAssignment',
         entityId: assignmentId,
         action: `correction:${prevStatus}->${nextStatus}`,
         previousValue: { status: prevStatus },
         newValue: { status: nextStatus, componentType, amount: signedAmount.toString(), originalComponentId: body.originalComponentId ?? null, reason: body.reason },
         actorId: session.userId,
         ipAddress,
       },
     }),
   ]);
   ```
   NOTE: Prisma transaction returns array in order — destructure carefully (we only need component + updatedAssignment for the response).
9. Return 201 `{ component: serializeComponent(component), assignment: serializeAssignment(updatedAssignment) }` (reuse a minimal serializer — copy from components/route.ts or create a small inline one).

**File 2: `apps/web/src/components/driver-pay/correction-modal.tsx`**

A shadcn `Dialog` with 3-step content in one form (no wizard navigation — single screen with all fields). Props:
```ts
type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  payStatus: 'PAID' | 'CORRECTED';
  components: Array<{ id: string; componentType: string; description: string; grossAmount: string }>;
  onCreated: (newComponent: SerializedComponent) => void;
};
```

State:
```ts
const [originalComponentId, setOriginalComponentId] = useState<string | 'general'>('general');
const [reason, setReason] = useState('');
const [amount, setAmount] = useState('');
const [type, setType] = useState<'POSITIVE' | 'NEGATIVE'>('NEGATIVE');  // overpayment is most common
const [submitting, setSubmitting] = useState(false);
const [error, setError] = useState<string | null>(null);
```

UI:
```tsx
<Dialog open={open} onOpenChange={onOpenChange}>
  <DialogContent className="sm:max-w-lg">
    <DialogHeader>
      <DialogTitle>Add a correction</DialogTitle>
      <DialogDescription>This will create an adjustment line and mark the assignment as Corrected. It'll be picked up by the next settlement.</DialogDescription>
    </DialogHeader>
    <div className="space-y-4">
      <Label>Original line (optional)</Label>
      <Select value={originalComponentId} onValueChange={setOriginalComponentId}>
        <SelectTrigger>...</SelectTrigger>
        <SelectContent>
          <SelectItem value="general">General adjustment</SelectItem>
          {components.map(c => <SelectItem key={c.id} value={c.id}>{c.description} (${c.grossAmount})</SelectItem>)}
        </SelectContent>
      </Select>

      <Label>Direction</Label>
      <RadioGroup value={type} onValueChange={v => setType(v as 'POSITIVE'|'NEGATIVE')}>
        <RadioGroupItem value="POSITIVE">Owe the driver more (add)</RadioGroupItem>
        <RadioGroupItem value="NEGATIVE">Recover from driver (deduct)</RadioGroupItem>
      </RadioGroup>

      <Label>Amount</Label>
      <Input inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)} />

      <Label>Reason (min 10 chars)</Label>
      <Textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} maxLength={2000} />

      {/* Preview */}
      {originalComponentId !== 'general' && amount && (
        <div className="rounded-md border bg-muted/30 p-3 text-sm">
          <p className="text-muted-foreground">Preview:</p>
          <div className="flex justify-between"><span className="line-through">{selectedOriginal.description}</span><span className="line-through tabular-nums">${selectedOriginal.grossAmount}</span></div>
          <div className="flex justify-between font-medium"><span>Adjustment ({type === 'NEGATIVE' ? 'recover' : 'add'})</span><span className="tabular-nums">{type === 'NEGATIVE' ? '−' : '+'}${amount}</span></div>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
    <DialogFooter>
      <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button onClick={handleSubmit} disabled={submitting || reason.length < 10 || !amount}>
        {submitting ? 'Saving…' : 'Save correction'}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

`handleSubmit`: POST to `/api/driver-pay/assignments/${assignmentId}/corrections` with `{ originalComponentId: originalComponentId === 'general' ? null : originalComponentId, reason, amount, type }`. On 201 → `onCreated(json.component)` + `onOpenChange(false)` + toast. On 422 → setError with the error message.

Wire it in: add a "Add correction" button to `apps/web/src/components/driver-pay/assignment-card.tsx` that only renders when `payStatus === 'PAID' || payStatus === 'CORRECTED'` — opens this modal. (Read assignment-card.tsx first to find the right spot; place it next to the existing actions.)

**File 3: `apps/web/src/app/api/driver-pay/__tests__/corrections-api.test.ts`**

Test cases:
1. Unauthenticated → 401.
2. DRIVER role → 403.
3. Reason too short (<10 chars) → 400.
4. Amount = "0" → 400.
5. Type missing → 400.
6. Assignment not found → 404.
7. Assignment in DRAFT → 422 with "not been paid yet" message.
8. Assignment in PENDING_REVIEW → 422.
9. Assignment in APPROVED → 422.
10. originalComponentId doesn't belong to assignment → 422.
11. **Sign correctness — POSITIVE:** POST `{ amount: "50.00", type: "POSITIVE" }` on a PAID assignment → component created with `componentType: 'ADJUSTMENT_POSITIVE'`, `grossAmount: '50'` (positive Decimal), `category: 'ADJUSTMENT'`.
12. **Sign correctness — NEGATIVE:** POST `{ amount: "50.00", type: "NEGATIVE" }` → component created with `componentType: 'ADJUSTMENT_NEGATIVE'`, `grossAmount: '-50'`.
13. **Absolute value handling:** POST `{ amount: "-25.00", type: "NEGATIVE" }` → still results in `grossAmount: '-25'` (abs then negate, not double negate).
14. Status flips: PAID → CORRECTED.
15. CORRECTED → CORRECTED still allowed (multiple corrections).
16. Audit log: assert `prisma.driverPayAuditLog.create` called with `entityType: 'LoadDriverAssignment'`, `action: 'correction:PAID->CORRECTED'`, `previousValue: { status: 'PAID' }`, `newValue` contains status, amount, reason, originalComponentId.
17. Transaction: assert `prisma.$transaction` called once with three operations.
18. Cross-tenant: tenant-scoped prisma returns null on findFirst → 404.

  </action>
  <verify>
- `pnpm --filter web test -- corrections-api.test.ts` — all pass.
- `pnpm --filter web exec tsc --noEmit` — zero errors.
- On a real PAID assignment: open assignment card, click "Add correction", fill reason ("Detention was overpaid by $50"), amount 50, NEGATIVE, submit → new component appears with `-50.00` and `ADJUSTMENT_NEGATIVE` type. Assignment status flips to CORRECTED.
- Audit row appears with `action: 'correction:PAID->CORRECTED'`.
- Re-open on a DRAFT assignment → button hidden (PAID/CORRECTED gating works).
  </verify>
  <done>
- `POST /api/driver-pay/assignments/[id]/corrections` creates an ADJUSTMENT component with correct sign, flips status to CORRECTED, writes audit log, all in one transaction.
- `correction-modal.tsx` renders inside assignment card for PAID/CORRECTED assignments only.
- ≥15 passing tests.
- Cannot correct a non-PAID assignment.
  </done>
</task>

<task type="auto">
  <name>Task C2: Sidebar pending-pay badge + sidebar wiring + nav link</name>
  <files>
    apps/web/src/components/navigation/pending-pay-badge.tsx
    apps/web/src/components/navigation/sidebar.tsx
  </files>
  <action>
**File 1: `apps/web/src/components/navigation/pending-pay-badge.tsx`** — clone the MessagesBadge pattern verbatim, just change the endpoint and interval.

```tsx
"use client"

import { useState, useEffect } from "react"

/**
 * Polls /api/driver-pay/pending-queue?countOnly=true every 60 seconds
 * and shows a red count badge next to the Driver Pay sidebar link.
 * Only renders when count > 0. Fails silently.
 */
export function PendingPayBadge() {
  const [count, setCount] = useState(0)

  const fetchCount = async () => {
    try {
      const res = await fetch("/api/driver-pay/pending-queue?countOnly=true", {
        cache: "no-store",
      })
      if (!res.ok) return
      const json = await res.json()
      const c = typeof json?.count === "number" ? json.count : 0
      setCount(c)
    } catch {
      // Silent failure
    }
  }

  useEffect(() => {
    fetchCount()
    const interval = setInterval(fetchCount, 60_000)
    return () => clearInterval(interval)
  }, [])

  if (count <= 0) return null

  return (
    <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
      {count > 9 ? "9+" : count}
    </span>
  )
}
```

**File 2: `apps/web/src/components/navigation/sidebar.tsx`** — edits only, do NOT rewrite the file.

1. Add import at the top with the other navigation badge imports:
   ```ts
   import { PendingPayBadge } from "@/components/navigation/pending-pay-badge"
   ```

2. Add a **new top-level "Driver Pay" nav item** (NOT a sub-item) for OWNER and MANAGER, pointing at `/carrier/driver-pay/pending`. Place it under the existing Reports group or as a sibling — find the existing "Driver Pay" SubItem at line ~326–334 (currently under Reports → `/carrier/reports/driver-pay`) and ADD a new top-level item with the badge. Do NOT remove the existing Reports sub-item — it's a different page (the historical report). The new entry is for the live action queue.

3. Pattern for the new item (place under the main Loads/Dispatches/Fleet section, before Reports — so managers see "items waiting" at a glance):
   ```tsx
   {isOwnerOrManager && (
     <SidebarMenuItem>
       <SidebarMenuButton
         asChild
         isActive={pathname === "/carrier/driver-pay/pending"}
         tooltip="Driver Pay"
       >
         <Link href="/carrier/driver-pay/pending" onClick={handleNavClick}>
           <CreditCard />
           <span>Driver Pay</span>
           <PendingPayBadge />
         </Link>
       </SidebarMenuButton>
     </SidebarMenuItem>
   )}
   ```
   - `CreditCard` icon is already imported in this file (line 18). Reuse it.
   - For managers, gate by `managerHasPermission(perms, 'driverPayReport')` — reuse existing permission key since granular driver-pay perms don't exist yet (this is intentional — Phase 6 doesn't add new permissions; that's a future polish). Wrap with `{(isOwner || (isManager && managerHasPermission(perms, 'driverPayReport'))) && (...)}`.

4. Use Grep to locate the exact best insertion point. Look for the line with `// Loads section` or similar landmark, OR insert just before the `<SidebarGroupLabel>Reports</SidebarGroupLabel>` block. Read at least 30 lines of context before editing so the JSX nests correctly.

5. Do not remove the existing `/carrier/reports/driver-pay` sub-item.
  </action>
  <verify>
- `pnpm --filter web exec tsc --noEmit` — zero errors.
- Boot the web app, sign in as OWNER. Sidebar shows a new "Driver Pay" item with CreditCard icon. If ≥1 PENDING_REVIEW assignment exists for the tenant, a red `1`–`9+` badge appears next to it within 60s.
- Click → navigates to `/carrier/driver-pay/pending`.
- Sign in as DRIVER → "Driver Pay" item not visible in their sidebar (driver portal sidebar is different; if same sidebar is reused, the `isOwnerOrManager` gate hides it).
- Manager with `driverPayReport: false` permission → item hidden.
- After approving all pending items, badge disappears within 60s.
- Existing Reports → Driver Pay sub-item still works at `/carrier/reports/driver-pay`.
  </verify>
  <done>
- `pending-pay-badge.tsx` exists, polls every 60s, fails silently, renders only when count > 0.
- A new top-level "Driver Pay" sidebar item exists for OWNER and permission-gated MANAGER, linking to `/carrier/driver-pay/pending` with the badge attached.
- Existing Reports → Driver Pay sub-item preserved.
- `pnpm --filter web lint` passes.
  </done>
</task>

</tasks>

<verification>

**Phase-level end-to-end check (run after all 5 tasks complete):**

1. **State machine path:** Create a DRAFT assignment with one BASE_PAY_FLAT component → POST `/transitions {action:'submit'}` → 200, status now PENDING_REVIEW, audit row exists.
2. **Block bad submit:** Create a DRAFT assignment with NO components → POST submit → 422, message "This assignment doesn't have a base pay line yet."
3. **Block bad approve:** Create a PENDING_REVIEW assignment, CPM model, `actualMiles = null` → POST approve → 422, message about actual miles.
4. **Good approve:** Set actualMiles + mileageSource → POST approve → 200, status APPROVED, audit row exists.
5. **Dispute:** POST `{action:'dispute', reason:'rate confirmation differs'}` from APPROVED → 200, status DISPUTED, audit row.
6. **Re-submit from disputed:** POST `{action:'submit'}` → 200, PENDING_REVIEW again.
7. **RBAC:** Sign in as DRIVER, POST any transition → 403.
8. **Tenant isolation:** Sign in as Tenant A owner, POST a transition for Tenant B's assignment → 404.
9. **Pending queue UI:** Navigate to `/carrier/driver-pay/pending`. See list. Press ↓ ↓ → third row selected. Press A → approve → green flash → next row selected. Press D → dispute modal opens.
10. **Inline pre-condition error:** Select a CPM row with no actualMiles, press A → inline 422 message appears with "Open load" link, no row removed.
11. **Empty state:** Approve every row → "All caught up." appears.
12. **Corrections:** On a PAID assignment, click Add correction → fill form → save → new ADJUSTMENT_NEGATIVE component appears, assignment status flips to CORRECTED, audit row.
13. **Sign math:** Submit POSITIVE 100 → component grossAmount = "100.00". Submit NEGATIVE 100 → grossAmount = "-100.00".
14. **Sidebar badge:** With 3 PENDING_REVIEW assignments, badge shows "3" within 60s. Approve all → badge disappears within 60s.

**Tests:**
- `pnpm --filter web test -- state-machine.test.ts transitions-api.test.ts pending-queue-api.test.ts corrections-api.test.ts` → all green.
- `pnpm --filter web exec tsc --noEmit` → zero TS errors.
- `pnpm --filter web lint` → no new warnings.

</verification>

<success_criteria>

- [ ] `apps/web/src/lib/driver-pay/state-machine.ts` exists with pure `canTransition`, ≥35 passing unit tests.
- [ ] `POST /api/driver-pay/assignments/[id]/transitions` enforces auth + RBAC + tenant + state machine + writes audit row + atomic transaction.
- [ ] `GET /api/driver-pay/pending-queue` returns filtered list + `countOnly=true` mode for badge.
- [ ] `/carrier/driver-pay/pending` page renders two-panel queue with filter bar, keyboard nav (↑/↓/A/D), auto-advance after approve, inline pre-condition errors, empty state per spec §8.6.
- [ ] `correction-modal.tsx` opens on PAID/CORRECTED assignments, supports original-component pick OR general adjustment, sign auto-determined.
- [ ] `POST /api/driver-pay/assignments/[id]/corrections` creates ADJUSTMENT_POSITIVE/NEGATIVE with correct sign, flips status to CORRECTED, writes audit row.
- [ ] `pending-pay-badge.tsx` polls every 60s, renders next to a new top-level "Driver Pay" sidebar item for OWNER + permission-gated MANAGER.
- [ ] Every new API path returns 404 for cross-tenant assignments and 403 for DRIVER role.
- [ ] All transitions and corrections write a DriverPayAuditLog row capturing `entityType`, `entityId`, `action` (e.g. `status:DRAFT->PENDING_REVIEW`), `previousValue`, `newValue`, `actorId`, `ipAddress`.
- [ ] `tsc --noEmit` and all four new test files green.

</success_criteria>

<output>
After completion, create `.planning/quick/301-driver-pay-phase-6-state-machine-approva/301-SUMMARY.md` covering:

- Files created (state-machine module, 3 API routes, 4 components, badge, sidebar edit, 4 test files).
- Files modified (sidebar.tsx, assignment-card.tsx).
- Key decisions (e.g. why 422 vs 409, why correction goes through its own endpoint, why audit log is per-row not per-batch).
- Total lines of test coverage.
- Known follow-ups (Phase 8 settlement engine consumes APPROVED + ADJUSTMENT components; future: granular driver-pay permissions split from `driverPayReport`).
</output>
