# DriveCommand â€” Checklists & Workflows

**Full Technical & UX Specification Â· v2.0 Â· 2026**
**Target audience:** Claude Code (primary), human engineers, product reviewers
**Status:** Implementation-ready
**Source of truth:** this document. If any other doc disagrees, this wins.

---

## Table of Contents

1. [Product Context](#1-product-context)
2. [Design Philosophy](#2-design-philosophy)
3. [Naming Rules](#3-naming-rules)
4. [Architecture Overview](#4-architecture-overview)
5. [Data Model](#5-data-model)
6. [Service Layer](#6-service-layer)
7. [tRPC API Surface](#7-trpc-api-surface)
8. [Web UX](#8-web-ux)
9. [Mobile UX](#9-mobile-ux)
10. [Notifications](#10-notifications)
11. [Automation Recipes](#11-automation-recipes)
12. [Starter Seed Data](#12-starter-seed-data)
13. [Integration Points](#13-integration-points)
14. [Phased Build Plan](#14-phased-build-plan)
15. [Testing Strategy](#15-testing-strategy)
16. [Implementation Instructions for Claude Code](#16-implementation-instructions-for-claude-code)
17. [Prompts (Copy-Paste Ready)](#17-prompts-copy-paste-ready)

---

## 1. Product Context

DriveCommand is a multi-tenant SaaS platform for small-to-midsize trucking carriers (5â€“50 trucks). Users are dispatchers, owner-operators, safety managers, mechanics, and drivers â€” almost none of them technical. Every record is scoped by `tenantId`.

**Stack:**

| Layer | Technology |
|-------|-----------|
| Monorepo | Turborepo |
| Web | Next.js App Router (server components, `app/` directory) |
| Mobile | React Native 0.83 + Expo SDK 55 (`apps/mobile/`, EAS Build) |
| ORM | Prisma 7 + PostgreSQL |
| Auth + Storage | Supabase (migration in progress from bcryptjs) |
| File Storage | AWS S3 |
| CI | GitHub Actions (typecheck, Vitest, Playwright) |
| Deploy | Vercel (web), EAS (mobile) |

**What Checklists & Workflows is:** a template engine that lets carriers define reusable checklists (driver onboarding, vehicle inspections, partner setup), automatically assign them when real-world events happen, and block dispatch until required steps are complete.

**What it replaces:** spreadsheets, paper DVIRs, and tribal knowledge.

---

## 2. Design Philosophy

Three non-negotiable principles. Every design decision gets measured against all three.

### 2.1 The Midnight Owner-Op Test

A 55-year-old owner-operator with 8 trucks must be able to configure the product alone, at midnight, without calling support. If a screen requires training, the screen is wrong.

### 2.2 One Screen, One Action

Mobile especially: the driver has one hand free and is in a truck cab. Every screen has one primary action. Secondary actions are pushed to overflow menus or removed.

### 2.3 Fail Loud, Recover Easy

When something breaks (failed inspection, blocked dispatch, overdue step), the system tells the user exactly what to do next â€” in the notification itself, not behind three taps. No dead ends.

---

## 3. Naming Rules

Internal code uses precise technical names. UI copy uses plain English. **Never mix them.**

| Internal (code only) | User-facing (UI copy) |
|---------------------|----------------------|
| Workflow Template Engine | Checklists & Workflows |
| Playbook | Playbook (user-facing too â€” this is the one exception, because "playbook" reads naturally) |
| StepTemplate | Step |
| Step Library | Step Library |
| PlaybookInstance | Active Checklist |
| StepInstance | Task |
| PlaybookTrigger | Auto-Start Rule |
| isDispatchBlocker | Required Before Dispatch |
| Skip | Skip with Reason |
| Tenant Admin | Account Admin |

**Enforcement:** a Vitest test greps all `.tsx` files under `apps/web/src/app/` and `apps/mobile/src/screens/` for the words `PlaybookInstance`, `StepInstance`, `StepTemplate`, `PlaybookTrigger` in JSX text nodes and fails the build if found.

---

## 4. Architecture Overview

### 4.1 Two-World Model

The feature splits cleanly into **template world** (design time) and **instance world** (runtime). This is the single most important architectural decision.

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ TEMPLATE WORLD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                          â”‚
â”‚   StepTemplate â”€â”€many-to-manyâ”€â”€> Playbook                â”‚
â”‚        (via PlaybookStep, ordered, phased)               â”‚
â”‚                                                          â”‚
â”‚   Playbook â”€â”€has-manyâ”€â”€> PlaybookTrigger                 â”‚
â”‚                                                          â”‚
â”‚   Edits here DO NOT affect running instances.            â”‚
â”‚                                                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”¬â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                               â”‚
                    generatePlaybookInstance()
                               â”‚
                               â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ INSTANCE WORLD â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚                                                          â”‚
â”‚   PlaybookInstance â”€â”€has-manyâ”€â”€> StepInstance            â”‚
â”‚       (immutable snapshot of template at creation)       â”‚
â”‚                                                          â”‚
â”‚   Attached to a specific entity (Driver/Vehicle/etc.)    â”‚
â”‚                                                          â”‚
â”‚   This is where humans actually do work.                 â”‚
â”‚                                                          â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### 4.2 The Snapshot Rule

When a PlaybookInstance is created, the full Playbook + its Steps is deep-copied into `playbookSnapshot` (JSON). Each StepInstance gets its own `stepSnapshot`. These snapshots are **never mutated**.

**Why:** an admin editing a checklist template shouldn't silently change the requirements of checklists that drivers are already halfway through. Auditors and DOT inspectors need to see exactly what was required at the time of inspection.

**Cost awareness:** this generates ~3-10KB of JSON per instance. At 50 trucks Ã— daily DVIRs Ã— 365 days, that's ~55MB per tenant per year. Acceptable. If it grows past that, introduce versioned templates with a `playbookVersionId` pointer â€” tracked in the tech-debt ledger, not Phase 1-5.

### 4.3 Dispatch Readiness Aggregation

`Driver.isDispatchReady` and `Vehicle.isDispatchReady` are **derived columns**, recomputed by `computeDispatchReadiness()` whenever a StepInstance changes status.

```
  StepInstance.status changes
            â”‚
            â–¼
  computeDispatchReadiness(instanceId)
            â”‚
            â”œâ”€> updates PlaybookInstance.completionPercent
            â”œâ”€> updates PlaybookInstance.isDispatchReady
            â”‚
            â–¼
  aggregate across all active instances for entity
            â”‚
            â–¼
  updates Driver.isDispatchReady / Vehicle.isDispatchReady
            â”‚
            â–¼
  if changed â†’ fire DISPATCH_READY notification
```

An entity is ready only when **every active PlaybookInstance attached to it** is ready.

### 4.4 Event Fan-out

Domain events (`ON_DRIVER_CREATE`, `ON_DISPATCH_DEPART`, etc.) are emitted at lifecycle boundaries of existing models. `fireEvent()` matches active triggers, evaluates conditions, and calls `generatePlaybookInstance()` for each match.

**Condition evaluation is intentionally simple** â€” flat key-value equality match. Example: `{ driverType: 'CDL' }`. No expression language, no JSONLogic, no regex. This keeps the UI a dropdown instead of a formula editor. When a tenant demands richer logic, that's Phase 6+.

### 4.5 Module Boundaries

```
apps/web/src/
  app/
    checklists/
      page.tsx                    # Dashboard (Work Board + Playbook grid)
      playbooks/
        [id]/
          edit/page.tsx           # Playbook Builder
        new/page.tsx
      instances/
        [id]/page.tsx             # Active Checklist detail
      automation/page.tsx         # Auto-Start Rules

  server/api/routers/workflows/
    stepTemplate.ts
    playbook.ts
    instance.ts
    stepInstance.ts
    trigger.ts
    index.ts                      # router merge

  server/services/workflows/
    generatePlaybookInstance.ts
    computeDispatchReadiness.ts
    completeStep.ts
    failInspectionItem.ts
    fireEvent.ts
    recipes.ts                    # recipe library constants
    seedStarterPlaybooks.ts

apps/mobile/src/
  screens/workflows/
    MyTasksScreen.tsx
    InspectionModeScreen.tsx      # full-screen takeover
    DocumentUploadScreen.tsx
    FormFillScreen.tsx
    SignatureScreen.tsx

packages/validation/src/workflows/
  stepTemplate.ts                 # Zod schemas, shared web + mobile
  playbook.ts
  instance.ts
  stepInstance.ts
  trigger.ts
```

---

## 5. Data Model

All models follow existing codebase conventions: UUID PKs, `tenantId` scoping, `createdAt`/`updatedAt`, soft delete via `deletedAt`.

### 5.1 Enums

```prisma
enum StepType {
  DOCUMENT_UPLOAD
  FORM_FILL
  SIGNATURE
  INSPECTION_ITEM
  TRAINING_ACK
  APPROVAL
  THIRD_PARTY
  CUSTOM_NOTE
}

enum AssigneeRole {
  DRIVER
  DISPATCHER
  SAFETY_MANAGER
  ADMIN
  MECHANIC
}

enum PlaybookCategory {
  DRIVER_ONBOARDING
  VEHICLE_INSPECTION
  PARTNER_ONBOARDING
  LOAD_CHECKLIST
  COMPLIANCE
  CUSTOM
}

enum EntityType {
  DRIVER
  VEHICLE
  DISPATCH
  PARTNER
  LOAD
}

enum TriggerEvent {
  ON_DRIVER_CREATE
  ON_VEHICLE_CREATE
  ON_DISPATCH_CREATE
  ON_DISPATCH_DEPART
  ON_DISPATCH_DELIVER
  ON_PARTNER_CREATE
  MANUAL_ONLY
  RECURRING
}

enum InstanceStatus { NOT_STARTED  IN_PROGRESS  COMPLETED  BLOCKED }
enum StepStatus     { NOT_STARTED  IN_PROGRESS  COMPLETE  FAILED  SKIPPED }
enum PhaseType      { PRE_START  DAY_1  WEEK_1  ONGOING  NONE }
enum NotifType      { STEP_ASSIGNED  STEP_OVERDUE  INSTANCE_BLOCKED  DISPATCH_READY  STEP_FAILED  APPROVAL_NEEDED }
enum NotifChannel   { PUSH  SMS  IN_APP  EMAIL }
```

### 5.2 Models

**StepTemplate** â€” atomic reusable step definition.

```prisma
model StepTemplate {
  id                String         @id @default(uuid())
  tenantId          String
  tenant            Tenant         @relation(fields: [tenantId], references: [id])
  name              String
  description       String?
  stepType          StepType
  assigneeRole      AssigneeRole
  requiresPhoto     Boolean        @default(false)
  requiresSignature Boolean        @default(false)
  formSchema        Json?          // FORM_FILL: [{id,label,type,required,options?}]
  documentTypeName  String?        // DOCUMENT_UPLOAD: "Driver's License"
  isActive          Boolean        @default(true)
  deletedAt         DateTime?
  createdAt         DateTime       @default(now())
  updatedAt         DateTime       @updatedAt
  playbookSteps     PlaybookStep[]
  stepInstances     StepInstance[]

  @@index([tenantId])
  @@index([tenantId, stepType])
}
```

**Playbook** â€” named ordered collection of steps.

```prisma
model Playbook {
  id          String              @id @default(uuid())
  tenantId    String
  tenant      Tenant              @relation(fields: [tenantId], references: [id])
  name        String
  description String?
  category    PlaybookCategory
  entityType  EntityType
  icon        String?
  color       String?
  isActive    Boolean             @default(true)
  deletedAt   DateTime?
  createdAt   DateTime            @default(now())
  updatedAt   DateTime            @updatedAt
  steps       PlaybookStep[]
  triggers   PlaybookTrigger[]
  instances   PlaybookInstance[]

  @@index([tenantId])
  @@index([tenantId, category])
  @@index([tenantId, entityType])
}
```

**PlaybookStep** â€” join of StepTemplate to Playbook with ordering and dispatch-blocker flag.

```prisma
model PlaybookStep {
  id                String       @id @default(uuid())
  playbookId        String
  playbook          Playbook     @relation(fields: [playbookId], references: [id])
  stepTemplateId    String
  stepTemplate      StepTemplate @relation(fields: [stepTemplateId], references: [id])
  phase             PhaseType    @default(NONE)
  sequence          Int
  isRequired        Boolean      @default(true)
  isDispatchBlocker Boolean      @default(false)
  dueDaysFromStart  Int?
  dueBeforeDispatch Boolean      @default(false)
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt

  @@unique([playbookId, stepTemplateId, sequence])
  @@index([playbookId])
}
```

**PlaybookTrigger** â€” auto-start rule.

```prisma
model PlaybookTrigger {
  id              String       @id @default(uuid())
  playbookId      String
  playbook        Playbook     @relation(fields: [playbookId], references: [id])
  tenantId        String
  tenant          Tenant       @relation(fields: [tenantId], references: [id])
  triggerEvent    TriggerEvent
  conditions      Json?        // { driverType: "CDL" }
  recurringConfig Json?        // { frequency:"daily", daysOfWeek:[1..5], time:"07:00" }
  isActive        Boolean      @default(true)
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  @@index([tenantId, triggerEvent])
}
```

**PlaybookInstance** â€” live active checklist.

```prisma
model PlaybookInstance {
  id                String                 @id @default(uuid())
  tenantId          String
  tenant            Tenant                 @relation(fields: [tenantId], references: [id])
  playbookId        String
  playbook          Playbook               @relation(fields: [playbookId], references: [id])
  playbookSnapshot  Json                   // immutable deep copy
  entityType        EntityType
  entityId          String
  status            InstanceStatus         @default(NOT_STARTED)
  completionPercent Float                  @default(0)
  isDispatchReady   Boolean                @default(false)
  startedAt         DateTime?
  completedAt       DateTime?
  dueDate           DateTime?
  createdAt         DateTime               @default(now())
  updatedAt         DateTime               @updatedAt
  stepInstances     StepInstance[]
  notifications     PlaybookNotification[]

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, status])
  @@index([tenantId, isDispatchReady])
}
```

**StepInstance** â€” one record per step per PlaybookInstance.

```prisma
model StepInstance {
  id                 String           @id @default(uuid())
  playbookInstanceId String
  playbookInstance   PlaybookInstance @relation(fields: [playbookInstanceId], references: [id])
  stepTemplateId     String
  stepTemplate       StepTemplate     @relation(fields: [stepTemplateId], references: [id])
  stepSnapshot       Json             // immutable
  status             StepStatus       @default(NOT_STARTED)
  assigneeRole       AssigneeRole
  assignedUserId     String?
  completedByUserId  String?
  completedAt        DateTime?
  result             Json?            // { formData?, fileUrls?, signatureUrl?, note?, passOrFail?, photoUrls? }
  skipReason         String?
  skippedByUserId    String?
  dueDate            DateTime?
  isOverdue          Boolean          @default(false)
  createdAt          DateTime         @default(now())
  updatedAt          DateTime         @updatedAt

  @@index([playbookInstanceId])
  @@index([assignedUserId, status])
  @@index([playbookInstanceId, status])
}
```

**PlaybookNotification** â€” audit log for every notification sent.

```prisma
model PlaybookNotification {
  id                 String           @id @default(uuid())
  tenantId           String
  playbookInstanceId String
  playbookInstance   PlaybookInstance @relation(fields: [playbookInstanceId], references: [id])
  stepInstanceId     String?
  notificationType   NotifType
  channel            NotifChannel
  recipientUserId    String
  message            String
  sentAt             DateTime?
  deliveredAt        DateTime?
  createdAt          DateTime         @default(now())

  @@index([playbookInstanceId])
  @@index([recipientUserId])
}
```

### 5.3 Entity Model Updates

```prisma
// Existing Driver model â€” add:
isDispatchReady  Boolean @default(false)

// Existing Vehicle model â€” add:
isDispatchReady  Boolean @default(false)

// Partner: no readiness flag (partners don't dispatch), but they get a "Checklists" tab.
```

---

## 6. Service Layer

Pure functions (no HTTP concerns) living in `apps/web/src/server/services/workflows/`. Callable from tRPC, from event hooks, from cron jobs.

### 6.1 generatePlaybookInstance

```ts
async function generatePlaybookInstance(args: {
  playbookId: string;
  entityType: EntityType;
  entityId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'trigger';
}): Promise<PlaybookInstance>
```

**Steps:**

1. Load Playbook with all PlaybookSteps ordered by `(phase, sequence)`. Throw 404 if missing, 400 if `!isActive`.
2. Deep-copy playbook+steps into `playbookSnapshot`.
3. Create `PlaybookInstance` with `status=NOT_STARTED`, `isDispatchReady=false`.
4. For each PlaybookStep: create a StepInstance with `stepSnapshot`, resolve `assigneeRole`, compute `dueDate` from `dueDaysFromStart` or `dueBeforeDispatch`, status `NOT_STARTED`.
5. Resolve `assignedUserId`: query tenant users matching `assigneeRole`. If exactly one â†’ assign; if multiple â†’ leave `null` (dispatcher assigns).
6. Emit `STEP_ASSIGNED` notification per resolvable assignee.
7. Return hydrated instance.

**Error cases:** Playbook 404; !active 400; Entity 404; duplicate active instance for same (entity, playbook) â†’ 409 (configurable per playbook via a future `allowMultiple` field â€” flagged as a tech-debt note, not built yet).

### 6.2 computeDispatchReadiness

```ts
async function computeDispatchReadiness(instanceId: string): Promise<{
  isReady: boolean;
  blockers: StepInstance[];
}>
```

**Steps:**

1. Load StepInstances where source PlaybookStep has `isDispatchBlocker=true`.
2. If any blocker is in `NOT_STARTED | IN_PROGRESS | FAILED` â†’ `isReady=false`, set instance.status=`BLOCKED`.
3. If all blockers are `COMPLETE | SKIPPED` â†’ `isReady=true`.
4. Recompute `completionPercent = (COMPLETE + SKIPPED) / total * 100`.
5. Persist.
6. If `isDispatchReady` flipped true â†’ fire `DISPATCH_READY` to dispatcher.
7. Recompute parent entity's `isDispatchReady` (aggregate across all active instances attached to that entity) and persist to entity record.

**Edge case:** if instance has no blocker steps at all â†’ `isReady=true`, `blockers=[]`.

### 6.3 completeStep

```ts
async function completeStep(args: {
  stepInstanceId: string;
  userId: string;
  result: StepResult;
}): Promise<StepInstance>
```

**Validation by `stepType`** (all reject with specific error codes, not generic 400):

| stepType | Required in `result` |
|----------|---------------------|
| DOCUMENT_UPLOAD | `fileUrls` non-empty; template must have `documentTypeName` |
| SIGNATURE | `signatureUrl` is valid URL |
| FORM_FILL | `formData` passes validation against `formSchema` |
| INSPECTION_ITEM | `passOrFail` is `'pass'` or `'fail'` (if fail â†’ `failInspectionItem`) |
| TRAINING_ACK | `note` present OR boolean acknowledgment |
| APPROVAL | approver role matches `assigneeRole` |
| THIRD_PARTY | `note` or `fileUrls` |
| CUSTOM_NOTE | `note` present |

**Side effects:**

- Set `status=COMPLETE`, `completedByUserId`, `completedAt`.
- If `DOCUMENT_UPLOAD`: create a document record in existing document storage, labeled `documentTypeName`, attached to `entityId`.
- Call `computeDispatchReadiness(instanceId)`.
- Emit `STEP_ASSIGNED` to assignee of next `NOT_STARTED` step.

### 6.4 failInspectionItem

```ts
async function failInspectionItem(args: {
  stepInstanceId: string;
  userId: string;
  result: { photoUrls: string[]; note?: string };
}): Promise<void>
```

**Steps:**

1. Validate `photoUrls` non-empty if `requiresPhoto=true`.
2. Set StepInstance `status=FAILED`, persist `result`.
3. If parent Playbook category is `VEHICLE_INSPECTION`: create an ad-hoc StepInstance of type `APPROVAL`, assigned to `MECHANIC`, title `Repair sign-off: [step name]`, attached to same PlaybookInstance.
4. Set PlaybookInstance `status=BLOCKED`.
5. Emit `STEP_FAILED` to dispatcher + mechanic.
6. Call `computeDispatchReadiness` â†’ vehicle flips not-ready.

### 6.5 fireEvent

```ts
async function fireEvent(args: {
  event: TriggerEvent;
  entityData: Record<string, any>;
  tenantId: string;
}): Promise<void>
```

**Steps:**

1. Load active PlaybookTriggers for `(tenantId, triggerEvent=event)`.
2. For each: evaluate `conditions` via simple key-value equality against `entityData`. Skip non-matches.
3. For each match: call `generatePlaybookInstance({ playbookId: trigger.playbookId, entityType: derived from event, entityId: entityData.id, tenantId, triggeredBy: 'trigger' })`.
4. Log to `PlaybookNotification` or dedicated audit table.

**Attachment points (wired in Phase 4):**

| Lifecycle | Call |
|-----------|------|
| Driver onCreate | `fireEvent('ON_DRIVER_CREATE', driverRecord, tenantId)` |
| Vehicle onCreate | `fireEvent('ON_VEHICLE_CREATE', vehicleRecord, tenantId)` |
| Dispatch onCreate | `fireEvent('ON_DISPATCH_CREATE', dispatchRecord, tenantId)` |
| Dispatch â†’ DEPARTED | `fireEvent('ON_DISPATCH_DEPART', dispatchRecord, tenantId)` |
| Dispatch â†’ DELIVERED | `fireEvent('ON_DISPATCH_DELIVER', dispatchRecord, tenantId)` |
| Partner onCreate | `fireEvent('ON_PARTNER_CREATE', partnerRecord, tenantId)` |

`fireEvent` runs in the same transaction as the triggering mutation where possible. If the existing codebase uses a job queue, enqueue; otherwise inline.

---

## 7. tRPC API Surface

All procedures use existing auth middleware, Zod validation from `packages/validation`, and the existing error-formatting conventions.

### 7.1 stepTemplate router

| Procedure | Auth | Input | Notes |
|-----------|------|-------|-------|
| `list` | tenant member | `{ tenantId, stepType?, assigneeRole? }` | Active only |
| `create` | admin | full template fields | Returns created |
| `update` | admin | `{ id, tenantId, ...partial }` | Cannot change `stepType` if instances exist |
| `archive` | admin | `{ id, tenantId }` | Soft delete via `isActive=false` |

### 7.2 playbook router

| Procedure | Auth | Notes |
|-----------|------|-------|
| `list` | tenant member | Returns stepCount + activeInstanceCount per playbook |
| `get` | tenant member | Full playbook with ordered steps, triggers, last 5 instances |
| `create` | admin | Empty playbook; steps added separately |
| `update` | admin | Name/desc/icon/color only; category & entityType locked once instances exist |
| `addStep` | admin | Inserts step at sequence, re-sequences as needed |
| `removeStep` | admin | Removes, re-sequences |
| `reorderSteps` | admin | Batch `{ steps: [{playbookStepId, sequence}] }` |
| `setTrigger` | admin | Upsert; one trigger per event per playbook |
| `removeTrigger` | admin | Hard delete trigger |
| `duplicate` | admin | Clones playbook + PlaybookSteps; no triggers, no instances |
| `archive` | admin | Soft delete, disables all triggers |

### 7.3 instance router

| Procedure | Auth | Notes |
|-----------|------|-------|
| `generate` | dispatcher+ | Calls `generatePlaybookInstance` |
| `list` | tenant member | Paginated, BLOCKED first |
| `get` | tenant member | Full instance + step instances + results |
| `computeReadiness` | internal | Wrapper for the service |
| `getForEntity` | tenant member | All active instances for one entity â€” powers profile tabs |

### 7.4 stepInstance router

| Procedure | Auth | Notes |
|-----------|------|-------|
| `complete` | assignee | Validates per type, calls `completeStep` |
| `fail` | assignee | INSPECTION_ITEM only, calls `failInspectionItem` |
| `skip` | admin | Requires `reason` |
| `requestApproval` | assignee | Sets IN_PROGRESS, notifies approver |
| `approve` | approver role | Sets COMPLETE, recomputes readiness |
| `getForDriver` | driver self | Powers mobile My Tasks |

### 7.5 trigger router

| Procedure | Auth | Notes |
|-----------|------|-------|
| `listRecipes` | admin | Pre-built recipe list + enabled/disabled status per tenant |
| `enableRecipe` | admin | Creates PlaybookTrigger from recipe |
| `disableRecipe` | admin | Sets `isActive=false` |
| `fire` | internal only | Server-side, called from hooks |

---

## 8. Web UX

UX baseline: Housecall Pro and Jobber. Large tap targets, one action per screen, dashboards that surface work rather than bury it.

### 8.1 Checklists & Workflows Dashboard â€” `/checklists`

**Top â€” Active Work Board** (three swimlanes, only shown when â‰¥1 instance exists):

| Column | Accent | Contents |
|--------|--------|---------|
| Needs Attention | Red left border | BLOCKED instances + overdue steps |
| In Progress | Yellow left border | Active with upcoming due steps |
| Completed Today | Green left border | Completed in last 24h |

Each card: entity name + avatar, playbook name + icon, completion ring, next/overdue step label, single action button. Sort: overdue blockers first.

Empty-state illustration + copy: "When you start a checklist, it'll show up here."

**Middle â€” Your Playbooks**:

Grid of cards. Filter tabs: All / Driver / Vehicle / Dispatch / Partner.

Each card: icon, name, category badge, step count, active instance count, last used.

"Create New Playbook" is always the first card â€” dashed border, plus icon, never filtered.

Empty state (new tenant pre-seed): "We've built starter checklists for your fleet type. Import them?" one-click import button.

**Bottom â€” Auto-Start Rules** (collapsed by default):

Card grid of recipe toggles. "Custom Rules" link for power users.

### 8.2 Playbook Builder â€” `/checklists/playbooks/[id]/edit`

**UX mandate:** a dispatcher must build a functional Pre-Trip Inspection in under 10 minutes on first use.

Three-column desktop layout. Mobile collapses to stacked accordion.

**Left â€” Playbook Details** (always visible):

- Name â€” large editable field, auto-focused on create
- Category â€” 6-tile icon grid, not dropdown
- Entity type â€” auto-set by category, editable override
- Icon â€” scrollable emoji grid filtered by category
- Color â€” 8 preset swatches
- Description â€” optional
- Auto-Start Rules section â€” active triggers listed; "Add Rule" opens modal

**Auto-Start Rule Modal** â€” 3 fields, nothing more:

1. "When does this start?" â€” plain-English dropdown
2. "Only for specific records?" â€” optional condition (e.g., `Driver type = CDL`)
3. Live preview sentence: "This checklist will start automatically when a new CDL driver is added." Updates in real time.

**Center â€” Canvas**:

Vertical ordered step list. Phase dividers: Pre-Start / Day 1 / Week 1 / Ongoing â€” collapsible. Steps draggable between phases.

Row: drag handle, type icon, name, assignee badge, phase tag, "Required Before Dispatch" toggle, due-days input, delete.

Expanded row: full instruction (inline editable), photo/signature toggles, type-specific builders (form field builder for FORM_FILL, pass/fail config for INSPECTION_ITEM).

"Add Step" button at bottom of each phase section.

**Right â€” Step Library**:

Search. Filter chips: All / Document / Inspection / Form / Signature / Approval.

StepTemplate cards with "+" to add to canvas. "Create New Step" opens inline form in the panel â€” no separate screen.

**Preview Panel** (slide-in from right, triggered by header button):

Toggle: "Preview as Driver" (phone frame) / "Preview as Dispatcher" (instance card). Live â€” updates as steps added/reordered. "Close Preview" returns focus.

### 8.3 Active Checklist Detail â€” `/checklists/instances/[id]`

**Header card:** entity name + avatar + link to entity, playbook name + icon, status badge, completion ring, dispatch readiness banner (green "Dispatch Ready" or red "Blocked â€” N steps required" with step list), "Add Step" button (admin, ad-hoc).

**Phase sections:** collapsible; label + count e.g. "Day 1 (3/5 complete)".

**Step rows:** status icon, name, assignee avatar, due date (red if overdue), result summary, contextual action button.

Action button by status Ã— user role:

| Status | Is Assignee | Label |
|--------|-------------|-------|
| NOT_STARTED | yes | Start / Upload / Fill Out / Sign Now |
| COMPLETE | any | View Result |
| FAILED | any | View Issue (red) |
| SKIPPED | any | Skipped â€” [reason] (muted) |
| IN_PROGRESS + APPROVAL | approver | Review & Approve |

### 8.4 Auto-Start Rules â€” `/checklists/automation`

**Recipes section:** card grid; each card has icon, name, plain-English sentence, playbook-selector dropdown, enabled/disabled pill, "Active X times" counter.

**Custom Rules section:** table of Event â†’ Condition â†’ Playbook â†’ Status â†’ Edit/Delete. "Create Custom Rule" opens a 3-step modal: (1) when does this start? (2) for which records? (3) which checklist runs?

---

## 9. Mobile UX

**Mandate:** drivers use this in a cab, one hand, sometimes poor lighting. Tap targets â‰¥56px. Instructions â‰¤2 short sentences. No navigation while a task is in progress.

### 9.1 My Tasks â€” driver home tab

**Top summary bar:** "3 of 7 tasks complete today" + thin animated progress bar. Tap to expand grouped by checklist.

**Feed:** vertical cards, one per open step:

- Context label (muted): "Pre-Trip Inspection Â· Truck #104"
- Step name (large bold): "Check Front Brakes"
- Instruction (first line truncated, tap to expand)
- Due badge: green "Due Today" / yellow "Due Tomorrow" / red "Overdue"
- Full-width action button, â‰¥56px

**Empty state:** "You're all caught up. No open tasks right now." No upsell, no filler.

### 9.2 Inspection Mode â€” full-screen takeover

Triggered by "Start Inspection" on a `VEHICLE_INSPECTION` instance. This is the product's signature UX.

**Critical:** full-screen takeover. No navigation chrome. No tab bar. Mirrors Calm/Headspace focused-session UX.

**Top bar (minimal):**
- Back arrow â†’ confirmation "Exit inspection? Your progress is saved."
- Playbook name (muted center)
- Progress counter ("4 / 12") right-aligned
- Thin progress bar below

**Step card (80% of screen):** step number badge, step name (large bold, 2-3 words), instruction (1-2 short sentences), optional diagram.

**Action area (bottom 20%, always visible):**

INSPECTION_ITEM â€” two side-by-side buttons, â‰¥56px, full half-width:

| PASS | FAIL |
|------|------|
| Green Â· tap â†’ card slides left, next slides in | Red Â· tap â†’ card expands in place to fail-capture |

**Fail-capture flow (expands in place, no navigation):**
- Red "Issue Found" header
- Camera button "Take Photo (Required)", up to 3 photos with thumbnail preview
- Notes field (optional), keyboard auto-opens
- "Submit & Continue" validates `requiresPhoto`, saves, advances

**Between-step micro-moments:** pass â†’ subtle checkmark anim, green flash on progress bar. Every 3 steps: tiny encouragement ("Halfway there! 6 of 12").

**Completion screen:** full-screen success moment (not a toast):
- Large animated checkmark
- "Pre-Trip Inspection Complete"
- "Submitted at 7:42 AM Â· Truck #104"
- Summary: "12 passed Â· 0 failed" or "11 passed Â· 1 flagged"
- If failures: "1 item flagged â€” your dispatcher has been notified"
- Single button: "Back to My Tasks"

### 9.3 Document Upload

Full-screen, not inspection mode. Step name large, instruction, document type label ("Driver's License"), upload area (â‰¥200px dashed box): "Tap to take a photo or choose from files". Thumbnail + Replace. "Submit Document" button disabled until file selected. Inline checkmark on submit.

### 9.4 Form Fill

Full-screen form, no modals. Fields rendered from `formSchema`, one per row, large touch targets:

- Boolean â†’ large YES/NO toggle buttons (not checkboxes)
- Date â†’ native date picker
- Select â†’ bottom sheet picker (not dropdown)
- Text â†’ large input, auto-scroll on keyboard

"Submit Form" validates required fields, inline error per field on blur.

### 9.5 Signature

Full-screen pad. Instruction, signature canvas (full width, â‰¥200px), "Clear" top right, "I confirm and sign" submits with timestamp + userId. Confirmation shows signed-document summary.

---

## 10. Notifications

**Copy rule:** every notification contains the action, not just an alert. Recipient should know what to do from the notification alone.

| Type | Recipient + Channel | Message |
|------|--------------------|---------| 
| STEP_ASSIGNED | Driver â€” Push + SMS (immediate) | Push: "[Company]: New task ready â€” '[Step Name]'. Tap to complete." SMS: "DriveCommand task from [Company]: [Step Name]. Complete here: [link]" |
| STEP_OVERDUE | Dispatcher â€” Push (24h after due) | "[Driver Name] hasn't completed '[Step Name]' â€” due [X] days ago. Tap to send a reminder." |
| INSTANCE_BLOCKED | Dispatcher â€” Push (immediate) | "[Driver Name] is blocked from dispatch â€” '[Step Name]' is required. Tap to review." |
| DISPATCH_READY | Dispatcher â€” Push (immediate on flip) | "[Driver Name] is dispatch ready â€” all required steps complete." |
| STEP_FAILED | Dispatcher â€” Push | "[Driver] flagged an issue on Truck #[X]: '[Step Name]'. Photo attached. Tap to review." |
| STEP_FAILED | Mechanic â€” Push | "Repair needed on Truck #[X]: '[Step Name]' flagged by [Driver Name]. Tap to sign off." |
| APPROVAL_NEEDED | Approver â€” Push | "[Name] completed '[Step Name]' and needs your approval. Tap to review." |

**Channel logic by role:**

- Drivers â†’ Push + SMS. SMS always sent for `STEP_ASSIGNED` (drivers often have push off).
- Dispatchers â†’ Push only.
- Safety Managers â†’ Push + daily email digest (all compliance items last 24h).
- Admins â†’ In-app only for non-critical. Email `INSTANCE_BLOCKED` if instance >48h old.
- Mechanics â†’ Push for repair sign-offs.

---

## 11. Automation Recipes

Stored as configuration constants in `apps/web/src/server/services/workflows/recipes.ts`. Seeded to `PlaybookTrigger` on enable.

| Recipe Key | Display Name | Trigger + Condition |
|-----------|-------------|--------------------|
| `cdl_driver_onboarding` | Start CDL Driver Onboarding automatically | `ON_DRIVER_CREATE` Â· `{ driverType: 'CDL' }` |
| `non_cdl_driver_onboarding` | Start Non-CDL Driver Onboarding automatically | `ON_DRIVER_CREATE` Â· `{ driverType: 'NON_CDL' }` |
| `owner_op_onboarding` | Start Owner-Operator Onboarding automatically | `ON_DRIVER_CREATE` Â· `{ driverType: 'OWNER_OP' }` |
| `pre_trip_inspection` | Assign Pre-Trip Inspection on every dispatch | `ON_DISPATCH_CREATE` Â· no condition |
| `post_trip_inspection` | Assign Post-Trip Inspection after every delivery | `ON_DISPATCH_DELIVER` Â· no condition |
| `new_vehicle_intake` | New truck intake checklist | `ON_VEHICLE_CREATE` Â· no condition |
| `partner_onboarding` | Start partner onboarding when a new broker is added | `ON_PARTNER_CREATE` Â· no condition |

UI copy pattern: "When [event in plain English] â†’ [outcome in plain English]."

---

## 12. Starter Seed Data

Three Playbooks auto-created for new tenants on signup (based on setup wizard answers). Fully editable â€” not locked.

### Starter 1 â€” CDL Driver Onboarding

Category: `DRIVER_ONBOARDING` Â· Entity: `DRIVER`

| # | Step | Type Â· Assignee Â· Blocker Â· Due |
|---|------|--------------------------------|
| 1 | Upload Driver's License | DOCUMENT_UPLOAD Â· ADMIN Â· Blocker Â· Day 0 |
| 2 | Upload Medical Certificate | DOCUMENT_UPLOAD Â· ADMIN Â· Blocker Â· Day 0 |
| 3 | Pre-Employment Drug Test | THIRD_PARTY Â· SAFETY_MANAGER Â· Blocker Â· Day 0 |
| 4 | Driver Application Form | FORM_FILL Â· DRIVER Â· Blocker Â· Day 0 |
| 5 | FMCSA Clearinghouse Query | THIRD_PARTY Â· SAFETY_MANAGER Â· Blocker Â· Within 3 days |
| 6 | Motor Vehicle Record (MVR) | THIRD_PARTY Â· SAFETY_MANAGER Â· Blocker Â· Within 3 days |
| 7 | Safety Policy Acknowledgment | TRAINING_ACK Â· DRIVER Â· Not Blocker Â· Day 1 |
| 8 | ELD Training Completion | TRAINING_ACK Â· DRIVER Â· Not Blocker Â· Week 1 |
| 9 | Driver Signature | SIGNATURE Â· DRIVER Â· Blocker Â· Day 0 |

Step 4 form fields: full name, address, CDL number, CDL expiry, CDL state, endorsements.

### Starter 2 â€” Pre-Trip Inspection (DVIR)

Category: `VEHICLE_INSPECTION` Â· Entity: `DISPATCH`

All steps: INSPECTION_ITEM Â· DRIVER Â· Blocker Â· `requiresPhoto` on FAIL.

1. Front Brakes â€” "Press pedal firmly. Check for resistance and unusual sounds."
2. Rear Brakes â€” "Check brake lines for leaks. Test parking brake."
3. Tires & Wheels â€” "Check tread depth, inflation, and sidewall condition on all tires."
4. Lights â€” "Verify headlights, brake lights, turn signals, and clearance lamps."
5. Mirrors â€” "Confirm all mirrors are clean, undamaged, and properly adjusted."
6. Windshield & Wipers â€” "Check for cracks. Test wiper operation and washer fluid."
7. Horn â€” "Test horn operation."
8. Fuel Level â€” "Confirm adequate fuel for the route."
9. Engine Compartment â€” "Check oil, coolant, belts, and hoses for leaks or damage."
10. Coupling Devices â€” "Inspect fifth wheel or hitch. Confirm trailer connection if applicable."
11. Emergency Equipment â€” "Confirm reflectors, fire extinguisher, and first aid kit are present."
12. Driver Signature â€” SIGNATURE Â· DRIVER Â· Blocker.

### Starter 3 â€” New Partner Setup (Carrier Packet)

Category: `PARTNER_ONBOARDING` Â· Entity: `PARTNER`

| # | Step | Type Â· Assignee Â· Blocker |
|---|------|--------------------------|
| 1 | Upload W-9 | DOCUMENT_UPLOAD Â· ADMIN Â· Blocker |
| 2 | Upload Certificate of Insurance | DOCUMENT_UPLOAD Â· ADMIN Â· Blocker |
| 3 | Upload Letter of Authority | DOCUMENT_UPLOAD Â· ADMIN Â· Blocker |
| 4 | Broker-Carrier Agreement | SIGNATURE Â· ADMIN Â· Blocker |
| 5 | Payment Terms Confirmation | FORM_FILL Â· ADMIN Â· Not Blocker |
| 6 | Partner Approval | APPROVAL Â· ADMIN Â· Blocker |

Step 5 fields: payment terms, factoring company, NOA on file yes/no.

---

## 13. Integration Points

| Module | Required Change |
|--------|----------------|
| `Driver` model | Add `isDispatchReady Boolean`. Aggregated by `computeDispatchReadiness`. Surface on profile + load-assignment screen with badge. |
| `Vehicle` model | Add `isDispatchReady Boolean`. Same aggregation pattern for DVIR blockers. |
| Dispatch creation | Before save: check `driver.isDispatchReady` and `vehicle.isDispatchReady`. If false â†’ modal "This driver has incomplete required steps. View checklist or override." Override requires admin + logged reason. |
| Load assignment screen | Surface readiness badges. Green check = ready. Red = blocked with open-blocker count. |
| Driver profile | New "Checklists" tab â†’ all PlaybookInstances with status, %, link to detail. |
| Vehicle profile | Same pattern. |
| Partner profile | Same pattern. |
| Driver onCreate | Attach `fireEvent('ON_DRIVER_CREATE', ...)`. |
| Vehicle onCreate | Attach `fireEvent('ON_VEHICLE_CREATE', ...)`. |
| Dispatch status | Hook on transitions to DEPARTED and DELIVERED. |
| Partner onCreate | Attach `fireEvent('ON_PARTNER_CREATE', ...)`. |
| Document storage | `DOCUMENT_UPLOAD` step completion uses existing Supabase/S3 pipeline. Creates document record labeled with `documentTypeName`, attached to `entityId`. |
| Notification service | Map `NotifChannel` to existing push/SMS/email/in-app methods. Do not add new providers. |
| Mobile nav | Add "My Tasks" tab to driver bottom tab navigator. Badge = open DRIVER-role steps count. |

---

## 14. Phased Build Plan

**Philosophy:** ship value incrementally. Each phase independently useful. Each ends on a green CI, a manual demo of its Definition of Done, and a clean commit on `master`.

### Phase 1 â€” Foundation

**DoD:** Admin creates a Playbook, adds steps from library, saves. No runtime.

- Prisma: `StepTemplate`, `Playbook`, `PlaybookStep` migrations
- tRPC: stepTemplate CRUD, playbook CRUD, step management (add/remove/reorder)
- Web: Playbook Builder (left + center + right columns)
- Web: Playbook card grid on `/checklists` (grid only, no Work Board)
- Seed: 3 starter Playbooks on tenant create
- Excluded: triggers, instances, mobile

### Phase 2 â€” Execution

**DoD:** Dispatcher creates an Active Checklist manually. Driver completes non-inspection steps on mobile.

- Prisma: `PlaybookInstance`, `StepInstance` migrations
- tRPC: `instance.generate/list/get/getForEntity/computeReadiness`, `stepInstance.complete/skip/getForDriver`
- Service: `generatePlaybookInstance`, `computeDispatchReadiness`, `completeStep`
- Web: Active Checklist Detail screen
- Web: "Checklists" tab on Driver/Vehicle/Partner profiles
- Web: Active Work Board swimlanes on dashboard (manual instances only)
- Mobile: My Tasks tab
- Mobile: Document Upload, Form Fill, Signature screens
- `isDispatchReady` surfaced on driver profile â€” **not enforced yet**
- `fireEvent` hook attachment points marked with TODOs, not wired

### Phase 3 â€” Inspection Mode

**DoD:** Driver executes full DVIR via card-by-card Inspection Mode. Fails auto-create mechanic sign-offs. Vehicle readiness enforced.

- Mobile: full-screen Inspection Mode UX (pass/fail, fail capture, completion screen, micro-moments)
- Service: `failInspectionItem`
- tRPC: `stepInstance.fail/requestApproval/approve`
- Notifications: `STEP_FAILED`, `APPROVAL_NEEDED`
- `Vehicle.isDispatchReady` computed and surfaced
- Notification infra: push + SMS for `STEP_ASSIGNED` and `STEP_FAILED`

### Phase 4 â€” Automation

**DoD:** Playbooks fire automatically. Tenants toggle recipes. Dispatch blocked for non-ready drivers.

- Prisma: `PlaybookTrigger` migration
- tRPC: trigger router (`listRecipes`, `enableRecipe`, `disableRecipe`, `fire`)
- Service: `fireEvent`
- Hooks wired on Driver/Vehicle/Dispatch/Partner lifecycle events
- Web: Auto-Start Rules page (recipe toggles + custom rules table)
- Recipe library constants (all 7)
- Dispatch enforcement: load-assignment blocks non-ready drivers + admin override with audit
- Full notification suite across all types and channels

### Phase 5 â€” Polish & Analytics

**DoD:** Preview panel live. Analytics on dashboard. SMS confirmed in staging.

- Web: Preview Panel slide-in (phone frame + dispatcher card)
- SMS verified end-to-end
- Analytics: completion rate per playbook, average time, step drop-off
- Daily email digest for Safety Managers
- Overdue alerts: 24h after due date
- Skip-with-reason audit trail visible on instance detail
- Tenant account page: automation activity log

---

## 15. Testing Strategy

**Layers in order of increasing cost:**

1. **TypeScript** â€” strict mode; `tsc --noEmit` per package in CI
2. **Unit (Vitest)** â€” services as pure functions; inputs/outputs only
3. **Integration (Vitest + test DB)** â€” tRPC procedures end-to-end with a seeded DB
4. **E2E Web (Playwright)** â€” critical paths only (builder, instance completion, dispatch block)
5. **E2E Mobile (Expo + Detox/Maestro)** â€” Inspection Mode pass/fail path

**Per-phase coverage gates:**

### Phase 1
- Typecheck green in `apps/web` and `packages/validation`
- Unit tests: tenant scoping (every query includes `tenantId`), soft-delete behavior, step re-sequence edge cases
- Integration: full CRUD round-trip for playbook + steps
- Seed test: new tenant gets exactly 3 starter Playbooks
- Naming lint: grep fails build if `PlaybookInstance|StepInstance|StepTemplate|PlaybookTrigger` appears in `.tsx` text nodes (case-sensitive, excluding types/imports)

### Phase 2
- Snapshot immutability: generate instance, mutate source Playbook, assert snapshot unchanged
- Readiness with zero blockers returns `isReady=true`
- `completeStep` type-specific validation â€” one test per `StepType`, error code asserted
- Mobile tap-target audit: test utility fails if any `Pressable`/`TouchableOpacity` has `height < 56`

### Phase 3
- `failInspectionItem` creates exactly one mechanic APPROVAL step when category=`VEHICLE_INSPECTION`, zero otherwise
- Readiness flips false after fail, true after mechanic approval
- Photos rejected if `requiresPhoto=true` and `photoUrls` empty
- E2E: complete 12-step DVIR with one intentional fail, verify completion screen copy

### Phase 4
- `fireEvent` matches condition, skips mismatch
- Disabling a recipe stops future spawns, leaves existing instances untouched
- Override audit record written with reason + userId
- Dispatch creation blocked for non-ready driver without override

### Phase 5
- Preview panel renders both driver + dispatcher views, updates on step reorder
- SMS to real staging number confirmed delivered
- Overdue alert fires exactly at 24h (time-mocked)
- Analytics numbers match raw SQL aggregates within Â±0 (same query)

---

## 16. Implementation Instructions for Claude Code

Everything in this section is written **for the AI agent**, not humans.

### 16.1 One-Time Setup

1. This document lives at `docs/specs/workflow-engine.md`
2. Reference line appended to root `CLAUDE.md`: "When any task touches Checklists & Workflows, read `docs/specs/workflow-engine.md` in full first."
3. Create a feature branch per phase: `feat/workflow-phase-1-foundation`, etc.
4. One PR per phase.

### 16.2 Per-Phase Workflow (GSD)

Every phase follows this exact 4-step loop:

| Step | GSD Command | Purpose |
|------|-------------|---------|
| 1 | `/gsd:discuss-phase` | Read spec, read codebase, surface gaps & questions |
| 2 | `/gsd:plan-phase` | Produce `.gsd/phase-N-plan.md` with atomic tasks |
| 3 | `/gsd:execute-phase` | Work tasks one at a time, commit per task |
| 4 | `/gsd:verify-work` | Run verification checks against Section 14 DoD |

Do not skip steps. Do not batch phases. If execute reveals a plan gap, stop and go back to plan â€” do not improvise scope.

### 16.3 Hard Rules

- **Spec is truth.** If the codebase contradicts the spec on something the spec is explicit about, follow the spec and flag the conflict in the PR description.
- **Read the codebase before writing code.** Existing patterns for Prisma, tRPC, auth, upload, and notifications already exist. Do not invent alternatives.
- **No mid-phase scope creep.** If you find a related improvement, write it in `docs/tech-debt.md`, do not build it.
- **Tenant scoping is mandatory.** Every query filters by `tenantId`. The Phase 1 verification greps for this â€” missing scope fails CI.
- **User-facing copy uses user-facing names.** Internal names (`PlaybookInstance`, `StepInstance`, `StepTemplate`) never appear in `.tsx` rendered text. Lint enforced.
- **Tap targets â‰¥56px on mobile.** Audit enforced.
- **Snapshots are immutable.** Tested in Phase 2.
- **Use the UI UX Pro Max skill per `CLAUDE.md`** for every UI task. Run the search script with appropriate keywords before finalizing a screen.

### 16.4 File-Writing Conventions

- New Zod schemas go in `packages/validation/src/workflows/` if that package exists; otherwise co-locate with routers
- New services go in `apps/web/src/server/services/workflows/`
- New routers go in `apps/web/src/server/api/routers/workflows/`
- Mobile screens go in `apps/mobile/src/screens/workflows/`
- Prisma schema additions preserve alphabetical ordering of models where the existing schema does; otherwise append at end

### 16.5 Definition of Done Verification Template

For each phase, `/gsd:verify-work` must produce a report in this shape:

```
Phase N â€” Verification Report

DoD checks:
  [âœ“] 1. <check description> â€” evidence
  [âœ—] 2. <check description> â€” failure detail + proposed fix
  ...

Guardrails:
  [âœ“] typecheck (apps/web)
  [âœ“] typecheck (packages/validation)
  [âœ“] vitest (apps/web)
  [âœ“] playwright (if applicable)
  [âœ“] naming-lint
  [âœ“] tap-target-audit (if applicable)
  [âœ“] tenant-scoping-grep

Tech debt noted: <list or "none">

Merge decision: âœ“ ready / âœ— blocked
```

---

## 17. Prompts (Copy-Paste Ready)

Run these in order. Wait for each to fully complete and verify before the next. All prompts assume this document is at `docs/specs/workflow-engine.md` (Prompt 0 gets it there).

### Prompt 0 â€” One-Time Setup

```
Use the GSD skill with /gsd:quick.

Task: Install the Workflow Engine specification into the repository.

Steps:
1. Create docs/specs/ at the repo root if missing.
2. I will attach two files in a follow-up: workflow-engine.md (the full spec) and DriveCommand_Workflow_Engine_Technical_Spec.docx (human-readable mirror). Save both to docs/specs/ unchanged.
3. Append the following block to the existing root CLAUDE.md (do not overwrite existing content):

# Workflow Engine Spec â€” Always Load

When any task touches the "Checklists & Workflows" feature, Playbooks, Step Templates, Active Checklists, Tasks, Auto-Start Rules, or DVIR inspection flows:

1. Read docs/specs/workflow-engine.md in full before writing code.
2. Section 14 (Phased Build Plan) defines scope per phase â€” do not build ahead.
3. UI copy uses only user-facing names (Section 3 naming table). Internal names never appear in .tsx rendered text.
4. Follow existing codebase conventions for Prisma, tRPC, auth, upload, and notifications â€” do not introduce new patterns.

4. Create branch feat/workflow-engine-spec and commit: "docs: add workflow engine spec and loader directive".

Constraints:
- Do not modify any other files.
- Do not run any code generation.
- Do not install dependencies.

Output: confirmation, CLAUDE.md diff, commit SHA.
```

### Prompt 1 â€” Phase 1: Discuss

```
Use the GSD skill with /gsd:discuss-phase.

Context: Building the "Checklists & Workflows" feature for DriveCommand. Full spec at docs/specs/workflow-engine.md. Read it in full before answering.

Scope for this discussion: Phase 1 â€” Foundation (Section 14). Template creation only. No runtime, no triggers, no mobile.

Before responding, analyze:
- prisma/schema.prisma (existing conventions, tenantId scoping, soft delete, indices)
- apps/web/src/server/api/routers/ (auth middleware, Zod patterns, error handling)
- apps/web/src/app/ (App Router conventions, layout structure)
- packages/validation (shared Zod schemas if present)
- Existing new-tenant onboarding/seed logic

Return:
1. Three-sentence restatement of Phase 1 scope.
2. Gaps between spec and codebase â€” name specific files and patterns.
3. Proposed file structure for new work (routers, components, services, seed).
4. Open questions, max 5, ranked by blocker severity.
5. Risks and trade-offs for the three-column Playbook Builder given existing UI components.

Constraints:
- No code.
- No Phase 2+ work.
- UI copy in examples uses only user-facing names (Section 3).
- Stack per CLAUDE.md: Next.js + Tailwind + shadcn/ui.
```

### Prompt 2 â€” Phase 1: Plan

```
Use the GSD skill with /gsd:plan-phase.

Context: Phase 1 discussion complete. My answers to your questions are in this thread. Produce the execution plan for Phase 1 â€” Foundation. Spec: docs/specs/workflow-engine.md, Section 14 Phase 1 only.

Plan must include:
1. Ordered atomic tasks, each independently verifiable.
2. Per task: files to create/modify, files NOT to touch, expected lines of change.
3. Single Prisma migration named add_workflow_templates covering StepTemplate, Playbook, PlaybookStep only. No PlaybookTrigger, no PlaybookInstance, no StepInstance.
4. Separate tRPC router task per router (stepTemplate, playbook).
5. UI: Playbook Builder (Section 8.2) and Playbook card grid (Section 8.1 middle only). No Work Board, no Auto-Start Rules page.
6. Seed task for the 3 starter Playbooks (Section 12).
7. Per-layer test coverage task.
8. Verification criteria mapping to Phase 1 DoD in Section 14.

Constraints:
- Apply UI UX Pro Max per CLAUDE.md. Run: python3 .claude/skills/ui-ux-pro-max/scripts/search.py "playbook builder three column" --design-system -p "DriveCommand"
- No work beyond Phase 1.
- Flag any change to existing Driver/Vehicle/Dispatch models â€” those are Phase 2+.

Output: .gsd/phase-1-plan.md
```

### Prompt 3 â€” Phase 1: Execute

```
Use the GSD skill with /gsd:execute-phase.

Execute .gsd/phase-1-plan.md task by task. After each task:
1. Run npx tsc --noEmit in the affected workspace.
2. Run relevant Vitest suites.
3. Commit with a conventional commit message.
4. Pause and report before starting the next task.

Constraints:
- If a task reveals a plan gap, stop and report â€” do not improvise scope.
- User-facing names only in UI copy.
- Existing soft-delete pattern (deletedAt DateTime?).
- Existing tRPC auth middleware â€” no new auth patterns.
- Zod schemas in packages/validation if that pattern exists; otherwise co-locate with router.
- Playbook Builder UI passes UI UX Pro Max Pre-Delivery Checklist.
- Do not modify any file outside the plan.

Output: commit per task, final summary of every file changed, test output per layer.
```

### Prompt 4 â€” Phase 1: Verify

```
Use the GSD skill with /gsd:verify-work.

Verify Phase 1 against the DoD in Section 14 of docs/specs/workflow-engine.md.

Required checks:
1. Admin creates a Playbook end-to-end through the UI â€” walk through the click path.
2. Step Library loads; inline Step creation works.
3. Steps add, reorder (drag-and-drop), and remove on the canvas.
4. Phases (Pre-Start / Day 1 / Week 1 / Ongoing) render as dividers; steps move between them.
5. /checklists renders the Playbook card grid with filter tabs.
6. A brand-new tenant gets exactly 3 starter Playbooks seeded â€” test with a fresh tenant record.
7. Every Prisma query is tenantId-scoped â€” grep and report any miss.
8. npx tsc --noEmit passes in apps/web and packages/validation.
9. npx vitest run passes in apps/web.
10. No internal names (PlaybookInstance/StepInstance/StepTemplate/PlaybookTrigger) in user-visible .tsx text.

Report format (Section 16.5 template).

Do not mark Phase 1 complete until all 10 pass.
```

### Prompt 5 â€” Phase 2: Discuss

```
Use the GSD skill with /gsd:discuss-phase.

Context: Phase 1 verified and merged. Begin Phase 2 â€” Execution. Spec sections to read in full first: 6 (Service Layer), 8.3 (Active Checklist Detail), 9.1, 9.3, 9.4, 9.5 (mobile non-inspection), 14 Phase 2.

Scope: manual instance creation, step completion (non-inspection), mobile My Tasks, Document Upload / Form Fill / Signature mobile screens, Active Checklist Detail, Active Work Board swimlanes on dashboard, readiness flag surfaced but NOT enforced.

Analyze before proposing:
- Existing document upload / S3 flow (signatures, tenantId injection, existing document record model).
- Existing notification service (method signatures per channel, provider wiring).
- apps/mobile navigator structure (tab registration, screen typing).
- Existing Driver/Vehicle/Partner profile pages (tab patterns).

Return:
1. Three-sentence scope restatement.
2. Integration points for fireEvent() to be wired in Phase 4 â€” document where hooks will attach, leave TODOs.
3. Snapshot strategy confirmation â€” PlaybookSnapshot and StepSnapshot deep-copied at generation, never mutated. Confirm shape and query patterns.
4. Proposed file structure for services (generatePlaybookInstance, computeDispatchReadiness, completeStep).
5. Open questions, max 5.

Constraints:
- No code.
- No Phase 3+ work (no Inspection Mode, no fail flow, no triggers).
- Do not enforce dispatch blocking â€” surface flag only.
```

### Prompt 6 â€” Phase 2: Plan

```
Use the GSD skill with /gsd:plan-phase.

Build the Phase 2 â€” Execution plan. Spec: docs/specs/workflow-engine.md Section 14 Phase 2.

Include:
1. Migration add_workflow_instances for PlaybookInstance and StepInstance only.
2. Service files with signatures matching Section 6 exactly.
3. tRPC per Section 7.3 and 7.4, Phase 2 subset: instance.generate/list/get/getForEntity/computeReadiness, stepInstance.complete/skip/getForDriver.
4. Web: Active Checklist Detail (Section 8.3), Active Work Board swimlanes (Section 8.1 top), Checklists tab on Driver/Vehicle/Partner.
5. Mobile: My Tasks, Document Upload, Form Fill, Signature. NO Inspection Mode.
6. Tests: snapshot immutability, readiness, completeStep validation-by-type.
7. Explicit NON-scope list â€” what Phase 2 excludes.

Constraints:
- Run UI UX Pro Max search for "active work board swimlanes dashboard" before finalizing board UI.
- Run UI UX Pro Max search for "mobile task feed one handed driver" before finalizing mobile.
- Mobile tap targets â‰¥56px.
- Use existing upload and notification services.

Output: .gsd/phase-2-plan.md
```

### Prompt 7 â€” Phase 2: Execute

```
Use the GSD skill with /gsd:execute-phase.

Execute .gsd/phase-2-plan.md task by task. Typecheck, test, commit, pause, report after each.

Constraints:
- Snapshot deep-copied at generation â€” test mutates source Playbook after generation and asserts snapshot unchanged.
- computeDispatchReadiness returns isReady=true, blockers=[] when no blockers exist.
- completeStep rejects with type-specific error codes, not generic 400.
- Mobile screens pass 56px tap target audit â€” add a test utility that fails if any Pressable/TouchableOpacity has height < 56.
- Do not wire fireEvent() hooks â€” leave TODO comments referencing Phase 4.
- Do not enforce dispatch blocking â€” surface readiness badge only.

Output: commit per task, change summary, full test output.
```

### Prompt 8 â€” Phase 2: Verify

```
Use the GSD skill with /gsd:verify-work.

Verify Phase 2 against Section 14 Phase 2 DoD.

Checks:
1. Dispatcher creates an Active Checklist manually from any Playbook.
2. Active Checklist Detail renders phase sections, step rows, contextual action buttons (Section 8.3).
3. Driver opens mobile â†’ My Tasks shows open DRIVER-role steps across all active instances.
4. Document Upload step â€” file uploads via existing S3/Supabase, document record created against entityId, status flips to COMPLETE.
5. Form Fill â€” formData validated against formSchema, required fields enforced.
6. Signature step â€” persisted with timestamp and userId.
7. Active Work Board â€” three swimlanes, BLOCKED-first sort.
8. Driver/Vehicle/Partner profiles have a Checklists tab.
9. Dispatch readiness surfaces on driver profile but does NOT block dispatch.
10. Snapshot immutability test passes â€” mutating a Playbook leaves the instance snapshot unchanged.
11. Typecheck + Vitest pass.
12. No internal names in UI copy.

Report (Section 16.5 template). Do not proceed until all pass.
```

### Prompt 9 â€” Phase 3: Discuss

```
Use the GSD skill with /gsd:discuss-phase.

Context: Phase 2 verified and merged. Begin Phase 3 â€” Inspection Mode. Spec sections: 9.2 (Inspection Mode UX), 6.4 (failInspectionItem), 14 Phase 3.

Scope: full-screen mobile Inspection Mode (card-by-card pass/fail), failInspectionItem with auto-creation of mechanic approval, Vehicle readiness enforcement, STEP_FAILED and APPROVAL_NEEDED notifications.

Analyze before proposing:
- React Navigation in apps/mobile â€” how to remove tab + stack chrome for full-screen takeover.
- Existing camera/photo capture module â€” API, permissions, S3 upload.
- Existing notification provider wiring â€” push + SMS, role targeting.
- Vehicle model location for isDispatchReady addition.

Return:
1. Three-sentence scope restatement.
2. Full-screen takeover approach â€” modal stack vs Screen options vs dedicated Navigator. Pick one and justify.
3. Card transition animation approach â€” pick an existing animation dependency. No new libraries.
4. failInspectionItem interaction order with computeDispatchReadiness.
5. Open questions, max 5.

Constraints:
- No new animation libraries.
- No Phase 4 work.
- Tap targets â‰¥56px.
```

### Prompt 10 â€” Phase 3: Plan + Execute + Verify

```
Use the GSD skill. Run /gsd:plan-phase â†’ /gsd:execute-phase â†’ /gsd:verify-work sequentially for Phase 3.

Plan includes:
1. Full-screen Inspection Mode navigator/screen.
2. Card transition (pass slides left, next slides in right).
3. Fail capture â€” in-place card expansion, up to 3 photos, notes, requiresPhoto enforcement.
4. Between-step micro-moments â€” checkmark, progress flash, every-3 encouragement.
5. Final completion screen â€” full-screen success, pass/fail counts, "Back to My Tasks".
6. Service failInspectionItem per Section 6.4.
7. tRPC: stepInstance.fail, .requestApproval, .approve.
8. Notifications: STEP_FAILED (dispatcher + mechanic), APPROVAL_NEEDED (mechanic).
9. Vehicle.isDispatchReady computed + surfaced.
10. Tests: fail creates mechanic step, readiness flips, photos enforced.

Execute constraints:
- Run UI UX Pro Max search for "mobile inspection flow focused session" before finalizing.
- Pass/fail buttons â‰¥56px, full half-width.
- Exit confirmation on back arrow.
- No tab bar during inspection â€” verified by screenshot test.

Verify checks:
1. Driver completes 12-step DVIR full-screen â€” no chrome visible.
2. Intentional fail on step 4 expands card in place, enforces photo, captures note, advances.
3. Completion screen shows correct counts.
4. Failed step creates one mechanic approval step on same PlaybookInstance.
5. Vehicle.isDispatchReady=false after fail, true after mechanic approves.
6. STEP_FAILED fires to dispatcher AND mechanic.
7. APPROVAL_NEEDED fires to mechanic on requestApproval.
8. Typecheck + Vitest + E2E mobile pass.

Constraints: no Phase 4 work; do not enforce dispatch block in load assignment.

Output: phase-3-plan.md, commits, change summary, verification report.
```

### Prompt 11 â€” Phase 4: Discuss + Plan + Execute + Verify

```
Use the GSD skill. Run the full sequence for Phase 4 â€” Automation.

Spec: Sections 7.5, 6.5, 8.4, 11, 13, 14 Phase 4.

Scope:
1. Migration add_workflow_triggers for PlaybookTrigger.
2. tRPC trigger router per Section 7.5.
3. fireEvent service per Section 6.5 â€” flat key-value condition match only, no expression language.
4. Wire fireEvent into Driver/Vehicle/Dispatch/Partner onCreate + Dispatch status transitions. Replace Phase 2 TODOs.
5. Recipe library constants (all 7 per Section 11).
6. Web: Auto-Start Rules screen (Section 8.4) â€” recipe toggles + custom rules table.
7. Dispatch enforcement: load assignment blocks non-ready drivers with admin override + logged reason.
8. Full notification suite â€” all types, all channels per Section 10.

Constraints:
- Condition evaluation is flat key-value only. No JSONLogic, no regex, no expressions.
- fireEvent completes before triggering transaction commits. Enqueue if job queue exists; otherwise inline.
- Admin override MUST log reason + userId to an audit table â€” design this table in the plan.
- Phase 2 manual instance creation must still work.
- Run UI UX Pro Max search for "recipe toggle cards automation rules" before finalizing UI.

Verify checks:
1. Creating a CDL driver with cdl_driver_onboarding enabled spawns an instance.
2. Creating a non-CDL driver with only CDL recipe enabled does NOT spawn.
3. Toggling a recipe off stops future spawns, existing instances untouched.
4. Dispatch creation for non-ready driver shows override modal.
5. Admin override logs to audit table with reason.
6. All 7 recipes on /checklists/automation with correct plain-English copy.
7. fireEvent test: condition mismatch skips, match triggers.
8. Typecheck + Vitest + Playwright pass.

Output: phase-4-plan.md, commits, verification report.
```

### Prompt 12 â€” Phase 5: Discuss + Plan + Execute + Verify

```
Use the GSD skill. Run the full sequence for Phase 5 â€” Polish & Analytics.

Spec: Section 8.2 Preview Panel, Section 10 SMS, Section 14 Phase 5.

Scope:
1. Preview Panel slide-in in Playbook Builder â€” phone-frame driver view, dispatcher instance card view, live updates on step reorder.
2. SMS delivery for drivers via existing provider â€” retry + delivery-status logging.
3. Analytics: completion rate per playbook, average time to complete, step drop-off â€” admin dashboard tile.
4. Daily email digest for Safety Manager role â€” prior 24h compliance items.
5. Overdue alerts â€” scheduled job 24h after step.dueDate fires STEP_OVERDUE.
6. Skip with Reason â€” admin only, reason required, audit trail on instance detail.
7. Tenant automation activity log â€” every trigger fire with timestamp + result.

Constraints:
- Use existing job scheduler. No new scheduler.
- Preview panel read-only â€” tapping preview does NOT navigate or mutate.
- Analytics queries tenantId-scoped, DB aggregation, not JS reduction.
- Run UI UX Pro Max search for "playbook builder preview phone frame" and "analytics dashboard completion rates".

Verify:
1. Preview panel toggles driver phone view vs dispatcher card, live step updates.
2. Test SMS sends to a real staging number.
3. Analytics numbers match raw DB aggregates (spot-check 3 playbooks).
4. Overdue alert fires at exactly 24h (time-mocked).
5. Skip-with-reason audit immutable + visible.
6. Typecheck + full suite pass.

Output: phase-5-plan.md, commits, verification report, release-notes.md summarizing Phases 1â€“5.
```

### Quick-Prompt (Scope Reset Mid-Phase)

```
Use GSD. Spec: docs/specs/workflow-engine.md Section 14 Phase [N]. Build only what that phase's DoD lists. Do not touch future phases. User-facing names only (Section 3 naming table). Run UI UX Pro Max for any design work per CLAUDE.md. Commit per task. Stop and report after each task.
```

---

*End of document â€” v2.0*