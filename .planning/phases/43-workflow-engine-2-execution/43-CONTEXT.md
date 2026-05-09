# Phase 43: Workflow Engine 2 — Execution - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 43 builds the execution runtime on top of Phase 42's templates: dispatchers manually create Active Checklists from any Playbook, assign them to a Driver, Vehicle, or Partner, and monitor progress via three swimlane columns on the `/checklists` dashboard. Drivers complete non-inspection steps (Document Upload, Form Fill, Signature, Training ACK, Custom Note) from a dedicated Tasks tab in the mobile app. `isDispatchReady` is computed and surfaced on driver and truck profile pages but does not block dispatch creation — that enforcement is Phase 4.

**Spec sections in scope:** §6 (Service Layer), §7.3–7.4 (Phase 2 tRPC subset), §8.1 (Work Board only), §8.3 (Active Checklist Detail), §9.1 §9.3 §9.4 §9.5 (non-inspection mobile), §14 Phase 2.

**Explicitly excluded:** Inspection Mode, `failInspectionItem`, `fireEvent()` wiring (TODO stubs only), dispatch enforcement.

</domain>

<decisions>
## Implementation Decisions

### Manual Create Entry Point
- Entry point lives in **both places**: a "Start Checklist" button on the Playbook card grid (`/checklists`) AND a Checklists tab on Driver/Vehicle/Partner profile pages.
- Entity selection from the Playbook card: Claude decides — modal with searchable entity picker using existing modal conventions.
- After successful creation: Claude decides — navigate to Active Checklist Detail (`/checklists/instances/[id]`) is the most useful action for a dispatcher.
- Duplicate guard (409 CONFLICT): Claude decides — surface the service error clearly; do not allow silent duplicate creation.

### My Tasks Feed Layout (mobile)
- Feed grouping: Claude decides — flat list sorted by due date (overdue first, then due today, then future) fits one-handed, poor-lighting driver use per spec §9.1.
- Task card info: **Spec default exactly** — muted context label ("Pre-Trip Inspection · Truck #104"), step name (large bold), instruction first line truncated, due badge (green/yellow/red), full-width action button ≥56px.
- Summary bar: Claude decides — decorative only (progress text + thin animated bar). Simplest implementation, no toggle mode.
- Empty state: **Spec copy exactly** — "You're all caught up. No open tasks right now." No upsell, no filler.

### Step Completion UX on Mobile
- Screen pattern: Claude decides — full-screen pushed route for complex steps (Form Fill, Document Upload); bottom sheet for simple steps (Signature, Training ACK, Custom Note). Matches complexity of each step type.
- Back navigation during completion: **Prompt to confirm exit** — "Exit this task? Your progress will be lost." Yes/No confirmation. Matches the Inspection Mode exit pattern from Phase 3 for consistency.
- After successful submission: Claude decides — pop back to My Tasks + success toast. Matches load status update pattern used across the driver app. Task card disappears from feed immediately.
- Tab badge count: Claude decides — DRIVER-role steps only (`assigneeRole = DRIVER`, status `NOT_STARTED | IN_PROGRESS`), per spec §13.

### Work Board Card Design (web)
- Card info: **Spec default exactly** — entity name + avatar, playbook name + icon, circular completion ring, next/overdue step label (muted), single action button.
- Swimlane sort: **Most recently updated first** within each column. Active work rises naturally.
- Action button: Claude decides — context-aware label: BLOCKED → "View Issue" (red); IN_PROGRESS → "Continue"; COMPLETED → "View Summary". Keeps dispatcher oriented without opening the detail page first.
- Empty state for Work Board section: Claude decides — follow spec §8.1 exactly: hidden entirely when 0 active instances. Section renders only when ≥1 instance exists.

### fireEvent() Attachment Points (Phase 4 TODOs)
Leave `TODO: Phase 4 — fireEvent()` comments at these exact call sites (do NOT wire in Phase 2):
- `apps/web/src/actions/driver.ts` — Driver invite/create → `ON_DRIVER_CREATE`
- `apps/web/src/actions/truck.ts` — Truck create → `ON_VEHICLE_CREATE`
- Dispatch create action → `ON_DISPATCH_CREATE`
- Dispatch status transition → DEPARTED → `ON_DISPATCH_DEPART`
- Dispatch status transition → DELIVERED → `ON_DISPATCH_DELIVER`
- CRM/customer create → `ON_PARTNER_CREATE`

### Snapshot Strategy
- `generatePlaybookInstance()` deep-copies full Playbook + ordered PlaybookSteps (with embedded StepTemplate data) into `playbookSnapshot` at creation time.
- Each StepInstance gets its own `stepSnapshot` — a copy of the individual step config at that moment.
- Snapshots are **never mutated** after creation.
- `computeDispatchReadiness()` reads `isDispatchBlocker` from `stepSnapshot`, not from the live PlaybookStep record. Template edits cannot silently change in-flight checklist requirements.
- Snapshot immutability is verified by a unit test: generate an instance, mutate the source Playbook, assert `playbookSnapshot` unchanged.

### Service File Structure
```
apps/web/src/server/services/workflows/
  generatePlaybookInstance.ts   — instance creation + deep-copy snapshot
  computeDispatchReadiness.ts   — readiness aggregation + entity flag update
  completeStep.ts               — 8-type validation + document side effect + readiness trigger
  skipStep.ts                   — admin skip with required reason
  notifications.ts              — sendStepAssigned (Phase 2); STEP_FAILED/APPROVAL_NEEDED Phase 3

apps/web/src/server/api/routers/workflows/
  instance.ts     — generate / list / get / getForEntity / computeReadiness
  stepInstance.ts — complete / skip / getForDriver

packages/validation/src/workflows/
  instance.ts     — GenerateInstanceInput Zod schema
  stepInstance.ts — CompleteStepInput / SkipStepInput Zod schemas

apps/mobile/app/(driver)/tasks/
  index.tsx              — My Tasks screen (summary bar + FlashList feed)
  [id].tsx               — TaskActionDispatcher (routes by stepType)
  document-upload.tsx    — DocumentUploadScreen
  form-fill.tsx          — FormFillScreen
  signature.tsx          — SignatureScreen
```

### Claude's Discretion
- Entity picker modal design (existing modal components in codebase)
- Exact post-create navigation behavior (navigate to detail vs stay on page)
- 409 CONFLICT error surface (inline error on the create dialog)
- Task feed grouping algorithm edge cases
- Summary bar animation implementation
- Action button label logic implementation detail
- Work Board render-when-empty threshold

</decisions>

<specifics>
## Specific Ideas

- Spec §9.1 is the ground truth for task card layout — no deviation from that information hierarchy
- Spec §8.1 swimlane structure (Needs Attention / In Progress / Completed Today) with exact accent colors (red / yellow / green left border)
- "Fail Loud, Recover Easy" principle (§2.3): BLOCKED cards must be visually distinct and immediately actionable
- One Screen One Action (§2.2): each mobile completion screen has exactly one primary submit button; no secondary actions

</specifics>

<deferred>
## Deferred Ideas

- Duplicate active instance override (allow multiple per entity+playbook) — flagged as tech-debt in spec §6.1; not built until a tenant demands it
- Recurring instance creation (`RECURRING` trigger type) — Phase 4 Automation
- Inspection Mode and `failInspectionItem` flow — Phase 3
- Dispatch enforcement modal (blocking non-ready drivers) — Phase 4
- Full notification suite (STEP_OVERDUE, INSTANCE_BLOCKED, DISPATCH_READY) — Phase 3/4

</deferred>

---

## Pre-Analysis: Requested Outputs

### 1. Scope Restatement (three sentences)

Phase 43 builds the runtime execution layer on top of Phase 42's template foundation: dispatchers manually create Active Checklists from Playbooks and monitor them via the Work Board swimlanes and the Active Checklist Detail page. Drivers complete the four non-inspection step types (Document Upload, Form Fill, Signature, Training ACK / Custom Note) from a new Tasks tab in the mobile driver portal. The `isDispatchReady` flag is computed from blocker step statuses and surfaced on Driver and Vehicle profiles, but dispatch creation is not yet gated — enforcement and `fireEvent()` wiring are Phase 4.

### 2. fireEvent() Integration Points (wire in Phase 4, TODO stubs in Phase 2)

| Location | Event | Where to add TODO |
|----------|-------|------------------|
| Driver invite accept / create | `ON_DRIVER_CREATE` | `apps/web/src/actions/driver.ts` after Driver record created |
| Truck create | `ON_VEHICLE_CREATE` | `apps/web/src/actions/truck.ts` after Truck record created |
| Dispatch create | `ON_DISPATCH_CREATE` | dispatch/load create action |
| Dispatch → DEPARTED | `ON_DISPATCH_DEPART` | load/dispatch status update transition |
| Dispatch → DELIVERED | `ON_DISPATCH_DELIVER` | load/dispatch status update transition |
| CRM / Customer create | `ON_PARTNER_CREATE` | customer create action |

Phase 2 only adds the comment: `// TODO Phase 4: fireEvent('ON_DRIVER_CREATE', record, tenantId)`. The `fireEvent` service function body is built in Phase 4.

### 3. Snapshot Strategy Confirmation

At `generatePlaybookInstance()` time, the full Playbook + ordered PlaybookSteps (with embedded StepTemplate fields) are deep-copied into `playbookSnapshot` (JSON). Each StepInstance also receives `stepSnapshot` — a copy of its individual step config. These are written once and never mutated. `computeDispatchReadiness()` reads `isDispatchBlocker` from `stepSnapshot`, not the live record, so in-flight checklists are immune to template edits. Snapshot immutability is tested by mutating the source template after instance creation and asserting `playbookSnapshot` is unchanged.

### 4. Proposed File Structure for Services

See "Service File Structure" under Implementation Decisions above.

### 5. Open Questions (ranked by blocker severity)

1. **Document upload side effect (blocker)** — Spec §6.3 says completing a `DOCUMENT_UPLOAD` step creates a document record labeled `documentTypeName` attached to `entityId`. Which existing `Document` model field maps to `documentTypeName`? And does `entityId` reference the `User.id` for driver-type entities or the `Driver.id`? Answer determines the document creation query.

2. **Mobile signature capture package (blocker for SignatureScreen)** — The spec requires a drawn signature captured as PNG and uploaded to S3. Is there an existing signature capture package in `apps/mobile`? If not, which package fits the project (react-native-signature-canvas, or expo-canvas)? Answer determines the SignatureScreen implementation path.

3. **Notification scope for Phase 2 (planning clarity)** — Phase 2 includes `STEP_ASSIGNED` push on instance creation. Phase 3 adds `STEP_FAILED` and `APPROVAL_NEEDED`. Does Phase 2 also require `DISPATCH_READY` (fires when readiness flips true) and `INSTANCE_BLOCKED`? The spec §14 Phase 2 is silent on this — clarify before planning notifications.ts.

4. **CRM entity type mapping (data model)** — The spec uses `EntityType.PARTNER` but DriveCommand's CRM uses a `Customer` model. Should the Checklists tab on `/crm/[id]` pass `entityType = 'PARTNER'` and `entityId = customer.id`? Or is there a separate Partner model to add?

5. **My Tasks REST vs tRPC (mobile API boundary)** — The mobile tasks feed hits a REST endpoint at `/api/mobile/driver/tasks`. Should this endpoint return `StepInstance` records directly (with stepSnapshot), or a flattened DTO shaped for the task card UI? The answer affects the mobile api-client type definitions.

---

*Phase: 43-workflow-engine-2-execution*
*Context gathered: 2026-04-25*
