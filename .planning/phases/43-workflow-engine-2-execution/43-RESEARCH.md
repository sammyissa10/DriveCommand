# Phase 43: Workflow Engine 2 — Execution — Research

**Researched:** 2026-04-23
**Domain:** Runtime execution layer — PlaybookInstance, StepInstance, completeStep service, Active Work Board, Mobile My Tasks
**Confidence:** HIGH (spec is the authoritative source; codebase fully read and cross-referenced)

---

## Summary

Phase 42 built the template world: StepTemplate, Playbook, PlaybookStep — the design-time layer. Phase 43 builds the instance world: PlaybookInstance and StepInstance, the runtime that turns templates into work that gets done.

The codebase has a clear, consistent pattern: tRPC procedures in `apps/web/src/server/api/routers/workflows/`, pure service functions in `apps/web/src/server/services/workflows/`, Zod schemas in `packages/validation/src/workflows/`, and client components consuming tRPC via `useTRPC()` + `@tanstack/react-query`. This pattern is well-established and must be followed exactly.

**Critical schema gap:** The current `PlaybookStep` in the schema stores per-step configuration in a freeform `overrideConfig Json` blob. The spec defines `isDispatchBlocker`, `isRequired`, `dueDaysFromStart`, and `dueBeforeDispatch` as first-class fields on PlaybookStep. Phase 43 needs to add these columns to PlaybookStep in the same migration that adds the new Phase 2 models — without breaking Phase 42's existing builder UI.

**Primary recommendation:** Follow the spec's service → tRPC → UI layering strictly. Services are pure async functions called from tRPC procedures. Every query must include `WHERE tenantId = ctx.tenantId`. Use `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` for PKs. No exceptions.

---

## Standard Stack

### Core (inherited from Phase 42 — already installed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| tRPC | already wired | Type-safe API | Phase 42 decision; `createTRPCContext`, `tenantMemberProcedure`, `adminProcedure` all exist |
| Prisma 7 | already installed | ORM | Project-wide convention |
| Zod | already installed | Schema validation | `packages/validation/src/workflows/` already established |
| @tanstack/react-query | already installed | Client-side server state | Phase 42 uses `useQuery` + `useMutation` via `useTRPC()` |
| shadcn/ui | already installed | UI components | All existing pages use it |
| expo-server-sdk (Expo) | already installed | Push notifications | `sendPushToUser` in `apps/web/src/lib/notifications/send-push.ts` |

### New for Phase 43

| Library | Purpose | Install needed |
|---------|---------|----------------|
| None | All dependencies already present | No new installs |

---

## Architecture Patterns

### Module Boundaries (from spec Section 4.5 — verified against codebase)

```
apps/web/src/
  app/(owner)/checklists/
    page.tsx                     # EXISTS — add Active Work Board to top
    instances/
      [id]/page.tsx              # NEW — Active Checklist Detail
  server/api/routers/workflows/
    index.ts                     # EXISTS — add instance + stepInstance routers
    instance.ts                  # NEW
    stepInstance.ts              # NEW
  server/services/workflows/
    generatePlaybookInstance.ts  # NEW
    computeDispatchReadiness.ts  # NEW
    completeStep.ts              # NEW

apps/mobile/app/(driver)/
  _layout.tsx                    # MODIFY — add My Tasks tab
  tasks/
    index.tsx                    # NEW — My Tasks screen
    [id].tsx                     # NEW — Task action screen (doc upload / form fill / signature)

packages/validation/src/workflows/
  instance.ts                    # NEW
  stepInstance.ts                # NEW
  index.ts                       # MODIFY — re-export new schemas
```

### Pattern 1: tRPC Procedure Pattern (verified from Phase 42)

```typescript
// Source: apps/web/src/server/api/routers/workflows/playbook.ts
const generate = adminProcedure
  .input(generateInstanceSchema)
  .mutation(async ({ ctx, input }) => {
    return generatePlaybookInstance({
      playbookId: input.playbookId,
      entityType: input.entityType,
      entityId: input.entityId,
      tenantId: ctx.tenantId,
      triggeredBy: 'manual',
    });
  });
```

All procedures: tenantId from `ctx.tenantId`, never from input. Mutations that call services pass `ctx.tenantId` explicitly.

### Pattern 2: Service Function Pattern (verified from playbookStepService.ts)

```typescript
// Source: apps/web/src/server/services/workflows/playbookStepService.ts
export async function reorderPlaybookSteps(params: { ... }): Promise<void> {
  // 1. Verify tenant ownership first
  const playbook = await prisma.playbook.findFirst({
    where: { id: playbookId, tenantId, deletedAt: null },
  });
  if (!playbook) throw new TRPCError({ code: 'NOT_FOUND' });
  // 2. Business logic
  await prisma.$transaction(async (tx) => { ... });
}
```

### Pattern 3: Client Component Pattern (verified from DashboardClient.tsx)

```typescript
// Source: apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx
'use client';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/trpc/client';

export function DashboardClient() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.workflows.instance.list.queryOptions({ ... })
  );
  // ...
}
```

### Pattern 4: Bypass RLS for service transactions (verified from send-push.ts + prisma.ts)

```typescript
// Source: apps/web/src/lib/db/prisma.ts — TX_OPTIONS already defined
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  // ... queries that need to cross tenant boundaries (e.g. finding dispatcher users)
}, TX_OPTIONS);
```

Service functions called from tRPC already run under the tenant context. Bypass RLS only needed when looking up users by role across a tenant (e.g., resolving assignees).

### Pattern 5: Push Notification Pattern (verified from send-push.ts)

```typescript
// Source: apps/web/src/lib/notifications/send-push.ts
import { sendPushToUser } from '@/lib/notifications/send-push';

await sendPushToUser(userId, {
  title: '[Company]: New task ready',
  body: `"${stepName}". Tap to complete.`,
  data: { type: 'STEP_ASSIGNED', stepInstanceId },
});
```

Notifications are best-effort (never throw). Use `sendPushToUser` for individual, `sendPushToOrg` for broadcast.

### Pattern 6: Document Creation Pattern (verified from document.repository.ts)

```typescript
// Source: apps/web/src/lib/db/repositories/document.repository.ts
// Document model supports: truckId, routeId, driverId, loadId as nullable FKs
// For workflow step document uploads, use driverId = entityId when entityType = DRIVER
// For vehicle entity type, use truckId = entityId
// s3Key already uploaded by mobile client before calling completeStep
await prisma.document.create({
  data: {
    tenantId,
    driverId: entityId, // or truckId based on entityType
    fileName: documentTypeName,
    s3Key: fileUrls[0], // the s3Key from the upload
    contentType: 'application/octet-stream', // or passed from client
    sizeBytes: 0, // or passed from client
    uploadedBy: userId,
    documentType: 'GENERAL',
    description: `Uploaded via checklist: ${stepName}`,
  },
});
```

The Document model does not have a `workflowStepId` FK — that linkage is only in `StepInstance.result.fileUrls`. This is correct per spec Section 13.

### Anti-Patterns to Avoid

- **Never put `tenantId` in tRPC input for queries** — always read from `ctx.tenantId`. This is enforced by the existing pattern.
- **Never use `@default(uuid())` in Prisma schema** — the codebase uses `@default(dbgenerated("gen_random_uuid()")) @db.Uuid` exclusively.
- **Never put internal names (PlaybookInstance, StepInstance) in JSX text** — naming lint test will fail the build.
- **Never bypass the snapshot rule** — `playbookSnapshot` and `stepSnapshot` are written at creation and never mutated. The service must deep-copy at `generatePlaybookInstance` time.

---

## Schema Additions (Phase 43)

### Critical Schema Gap: PlaybookStep is Missing Dispatch-Blocker Fields

The current `PlaybookStep` schema stores all per-step config in a freeform `overrideConfig Json` blob. The spec defines `isDispatchBlocker`, `isRequired`, `dueDaysFromStart`, `dueBeforeDispatch` as first-class columns needed by `computeDispatchReadiness`. These do NOT exist in the current schema.

**Decision required:** Either (a) add them as first-class columns to PlaybookStep in this migration, or (b) read them from `overrideConfig`. Option (a) is correct per spec and makes `computeDispatchReadiness` straightforward. The planner must include a `ALTER TABLE PlaybookStep ADD COLUMN ...` statement in the Phase 43 migration.

### New Enums Needed

```sql
-- InstanceStatus (new)
CREATE TYPE "InstanceStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');

-- StepStatus (new)
CREATE TYPE "StepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'SKIPPED');

-- NotifType (new)
CREATE TYPE "NotifType" AS ENUM ('STEP_ASSIGNED', 'STEP_OVERDUE', 'INSTANCE_BLOCKED', 'DISPATCH_READY', 'STEP_FAILED', 'APPROVAL_NEEDED');

-- NotifChannel (new)
CREATE TYPE "NotifChannel" AS ENUM ('PUSH', 'SMS', 'IN_APP', 'EMAIL');
```

### New Models

**PlaybookInstance:**
```prisma
model PlaybookInstance {
  id                String         @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String         @db.Uuid
  playbookId        String         @db.Uuid
  playbookSnapshot  Json           // immutable deep copy at creation time
  entityType        PlaybookEntityType
  entityId          String         @db.Uuid
  status            InstanceStatus @default(NOT_STARTED)
  completionPercent Float          @default(0)
  isDispatchReady   Boolean        @default(false)
  startedAt         DateTime?      @db.Timestamptz
  completedAt       DateTime?      @db.Timestamptz
  dueDate           DateTime?      @db.Timestamptz
  createdAt         DateTime       @default(now()) @db.Timestamptz
  updatedAt         DateTime       @updatedAt @db.Timestamptz

  tenant         Tenant                 @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  playbook       Playbook               @relation(fields: [playbookId], references: [id], onDelete: Restrict)
  stepInstances  StepInstance[]
  notifications  PlaybookNotification[]

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, status])
  @@index([tenantId, isDispatchReady])
}
```

**StepInstance:**
```prisma
model StepInstance {
  id                 String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  playbookInstanceId String           @db.Uuid
  stepTemplateId     String           @db.Uuid
  stepSnapshot       Json             // immutable copy of StepTemplate + PlaybookStep config at creation
  status             StepStatus       @default(NOT_STARTED)
  assigneeRole       AssigneeRole
  assignedUserId     String?          @db.Uuid
  completedByUserId  String?          @db.Uuid
  completedAt        DateTime?        @db.Timestamptz
  result             Json?            // { formData?, fileUrls?, signatureUrl?, note?, passOrFail?, photoUrls? }
  skipReason         String?
  skippedByUserId    String?          @db.Uuid
  dueDate            DateTime?        @db.Timestamptz
  isOverdue          Boolean          @default(false)
  createdAt          DateTime         @default(now()) @db.Timestamptz
  updatedAt          DateTime         @updatedAt @db.Timestamptz

  playbookInstance PlaybookInstance @relation(fields: [playbookInstanceId], references: [id], onDelete: Cascade)
  stepTemplate     StepTemplate     @relation(fields: [stepTemplateId], references: [id], onDelete: Restrict)

  @@index([playbookInstanceId])
  @@index([assignedUserId, status])
  @@index([playbookInstanceId, status])
}
```

**PlaybookNotification:**
```prisma
model PlaybookNotification {
  id                 String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId           String           @db.Uuid
  playbookInstanceId String           @db.Uuid
  stepInstanceId     String?          @db.Uuid
  notificationType   NotifType
  channel            NotifChannel
  recipientUserId    String           @db.Uuid
  message            String
  sentAt             DateTime?        @db.Timestamptz
  deliveredAt        DateTime?        @db.Timestamptz
  createdAt          DateTime         @default(now()) @db.Timestamptz

  tenant           Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  playbookInstance PlaybookInstance @relation(fields: [playbookInstanceId], references: [id], onDelete: Cascade)

  @@index([playbookInstanceId])
  @@index([recipientUserId])
}
```

### Entity Model Updates

```prisma
// Add to User model (drivers):
isDispatchReady  Boolean  @default(false)

// Add to Truck model (vehicles):
isDispatchReady  Boolean  @default(false)
```

**Note:** The codebase uses `User` model for drivers (role = DRIVER). There is no separate `Driver` model — `User.role = DRIVER` is the driver. `Truck` is the Vehicle equivalent. The spec's "Driver.isDispatchReady" maps to `User.isDispatchReady` and "Vehicle.isDispatchReady" maps to `Truck.isDispatchReady`.

### Relation Additions (Tenant model)

The `Tenant` model lists all reverse relations. Add:
```prisma
playbookInstances     PlaybookInstance[]
playbookNotifications PlaybookNotification[]
```

### StepTemplate Back-relation

Add `stepInstances StepInstance[]` to `StepTemplate` model.

### Playbook Back-relation

Add `instances PlaybookInstance[]` to `Playbook` model.

### PlaybookStep — Missing Columns for Phase 43

Add to `PlaybookStep`:
```prisma
isRequired        Boolean  @default(true)
isDispatchBlocker Boolean  @default(false)
dueDaysFromStart  Int?
dueBeforeDispatch Boolean  @default(false)
```

These are needed for `computeDispatchReadiness` to know which steps block dispatch. `overrideConfig` cannot substitute because the service needs to query these as SQL-level filters.

### RLS Pattern (from migration 20260423100001)

All new tables need two policies:
```sql
-- Policy 1: tenant isolation
CREATE POLICY tenant_isolation_policy ON "PlaybookInstance"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

-- Policy 2: bypass for service operations
CREATE POLICY bypass_rls_policy ON "PlaybookInstance"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

`PlaybookNotification` has `tenantId` directly → same pattern as above.
`StepInstance` has no `tenantId` → isolate via PlaybookInstance JOIN (same pattern as PlaybookStep):
```sql
CREATE POLICY tenant_isolation_policy ON "StepInstance"
  FOR ALL USING (
    "playbookInstanceId" IN (
      SELECT id FROM "PlaybookInstance" WHERE "tenantId" = current_tenant_id()
    )
  );
```

---

## Service Layer Implementation

### generatePlaybookInstance

```typescript
// apps/web/src/server/services/workflows/generatePlaybookInstance.ts
async function generatePlaybookInstance(args: {
  playbookId: string;
  entityType: PlaybookEntityType;
  entityId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'trigger';
}): Promise<PlaybookInstance>
```

**Implementation steps (from spec Section 6.1):**

1. Load Playbook with PlaybookSteps ordered by `(playbookPhase ASC, sequence ASC)`. Throw `NOT_FOUND` if missing, `BAD_REQUEST` if `!isActive`.
2. Verify entity exists (User for DRIVER, Truck for VEHICLE, Customer for PARTNER). Throw `NOT_FOUND` if missing.
3. Check for duplicate active instance: if a `PlaybookInstance` with same `(entityId, playbookId)` exists where `status != COMPLETED` → throw `CONFLICT` with message `"Active checklist already exists for this entity"`.
4. Deep-copy playbook+steps into `playbookSnapshot` JSON. Shape:
   ```json
   {
     "id": "...", "name": "...", "category": "...", "entityType": "...",
     "steps": [
       { "stepTemplateId": "...", "sequence": 0, "playbookPhase": "DAY_1",
         "isRequired": true, "isDispatchBlocker": true, "dueDaysFromStart": null,
         "dueBeforeDispatch": false,
         "stepTemplate": { "name": "...", "stepType": "...", "assigneeRole": "...",
                           "defaultConfig": {}, "description": "..." }
       }
     ]
   }
   ```
5. Create `PlaybookInstance` with `status=NOT_STARTED`, `isDispatchReady=false`.
6. For each PlaybookStep (in phase+sequence order): create a `StepInstance` with `stepSnapshot = { ...stepTemplate fields merged with playbookStep overrides }`, resolve `dueDate` from `dueDaysFromStart` (add N days to `createdAt`) or `dueBeforeDispatch` (leave null, set when dispatch entity is known).
7. Resolve `assignedUserId`: query `User.findMany({ where: { tenantId, role: mappedRole, isActive: true } })`. Role mapping: `DRIVER` → `UserRole.DRIVER`, `DISPATCHER/SAFETY_MANAGER/MECHANIC/ADMIN` → `UserRole.MANAGER` or `UserRole.OWNER`. If exactly one result → assign; if multiple → leave null.
8. For each resolved assignee: emit `STEP_ASSIGNED` notification via `sendPushToUser`. Create `PlaybookNotification` record.
9. Return hydrated instance with stepInstances.

**Role resolution note:** The codebase's `UserRole` enum is `OWNER | MANAGER | DRIVER`. The spec's `AssigneeRole` is `DRIVER | DISPATCHER | SAFETY_MANAGER | MECHANIC | THIRD_PARTY | ADMIN`. Mapping: `DRIVER → DRIVER`, all others → `OWNER | MANAGER`. When multiple admin-role users exist, leave `assignedUserId = null`.

### computeDispatchReadiness

```typescript
// apps/web/src/server/services/workflows/computeDispatchReadiness.ts
async function computeDispatchReadiness(instanceId: string): Promise<{
  isReady: boolean;
  blockers: StepInstance[];
}>
```

**Implementation steps (from spec Section 6.2):**

1. Load all StepInstances for this instance. Also need their `stepSnapshot.isDispatchBlocker` field.
2. Filter to those where `stepSnapshot.isDispatchBlocker === true`.
3. If no blocker steps → `isReady = true`, `blockers = []`.
4. If any blocker has status `NOT_STARTED | IN_PROGRESS | FAILED` → `isReady = false`.
5. Recompute `completionPercent = (COMPLETE + SKIPPED steps) / total steps * 100`.
6. Determine `status`: if `!isReady` → `BLOCKED`; else if `completionPercent === 100` → `COMPLETED`; else if any step is COMPLETE or IN_PROGRESS → `IN_PROGRESS`; else `NOT_STARTED`.
7. Persist updated `PlaybookInstance` (completionPercent, isDispatchReady, status).
8. If `isDispatchReady` just flipped to `true`: find dispatchers (OWNER/MANAGER users in tenant), send `DISPATCH_READY` push.
9. Aggregate across all active PlaybookInstances for the entity: `SELECT isDispatchReady FROM PlaybookInstance WHERE entityId = ? AND status != 'COMPLETED'`. If all are ready → entity is ready.
10. Persist `User.isDispatchReady` or `Truck.isDispatchReady` on entity record.

**Implementation note:** `stepSnapshot` must store `isDispatchBlocker` so this service doesn't need to rejoin PlaybookStep (which is the template — snapshots must be self-contained).

### completeStep

```typescript
// apps/web/src/server/services/workflows/completeStep.ts
async function completeStep(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  result: StepResult;
}): Promise<StepInstance>
```

**Type-specific validation (from spec Section 6.3):**

| stepType | Validation | Error code |
|----------|-----------|------------|
| DOCUMENT_UPLOAD | `result.fileUrls` non-empty array of strings | `BAD_REQUEST: MISSING_FILES` |
| SIGNATURE | `result.signatureUrl` valid non-empty string | `BAD_REQUEST: MISSING_SIGNATURE` |
| FORM_FILL | `result.formData` validates against `stepSnapshot.defaultConfig.formSchema` | `BAD_REQUEST: INVALID_FORM` |
| INSPECTION_ITEM | `result.passOrFail` is `'pass'` or `'fail'` — if `'fail'` → throw to tRPC layer to call `failInspectionItem` instead | `BAD_REQUEST: USE_FAIL_ENDPOINT` |
| TRAINING_ACK | `result.note` present OR `result.acknowledged === true` | `BAD_REQUEST: MISSING_ACK` |
| APPROVAL | caller's role must match `stepSnapshot.assigneeRole` | `FORBIDDEN: WRONG_ROLE` |
| THIRD_PARTY | `result.note` present OR `result.fileUrls` non-empty | `BAD_REQUEST: MISSING_EVIDENCE` |
| CUSTOM_NOTE | `result.note` present and non-empty | `BAD_REQUEST: MISSING_NOTE` |

**Side effects:**
- Set `status = COMPLETE`, `completedByUserId = userId`, `completedAt = now()`, `result = input.result`.
- If `DOCUMENT_UPLOAD`: create Document record (see Pattern 6 above). Document links to `entityId` via the appropriate FK (driverId if DRIVER entity, truckId if VEHICLE entity).
- Call `computeDispatchReadiness(playbookInstanceId)`.
- Find the next `NOT_STARTED` StepInstance (lowest sequence, same playbookInstanceId) with a resolvable assignee → emit `STEP_ASSIGNED` push.

### skipStep

```typescript
async function skipStep(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  reason: string;
}): Promise<StepInstance>
```

Set `status = SKIPPED`, `skipReason = reason`, `skippedByUserId = userId`. Call `computeDispatchReadiness`.

---

## tRPC Router Additions

### instance router

```typescript
// apps/web/src/server/api/routers/workflows/instance.ts
export const instanceRouter = router({
  generate,      // adminProcedure — calls generatePlaybookInstance
  list,          // tenantMemberProcedure — paginated, BLOCKED first
  get,           // tenantMemberProcedure — full instance + stepInstances + results
  getForEntity,  // tenantMemberProcedure — all instances for one entityId + entityType
  computeReadiness, // adminProcedure — wrapper for computeDispatchReadiness service
});
```

**list query:** filter by tenantId, optional `status`, optional `entityType`, `entityId`. Sort: BLOCKED first, then IN_PROGRESS, then NOT_STARTED, then COMPLETED. Paginate with cursor.

**getForEntity query:** `WHERE tenantId = ctx.tenantId AND entityType = input.entityType AND entityId = input.entityId`. Returns all instances (including completed), ordered by `createdAt DESC`. Powers the "Checklists" tab on profile pages.

### stepInstance router

```typescript
// apps/web/src/server/api/routers/workflows/stepInstance.ts
export const stepInstanceRouter = router({
  complete,         // tenantMemberProcedure — calls completeStep service
  skip,             // adminProcedure — requires reason
  getForDriver,     // tenantMemberProcedure — driver's own open steps
});
```

**getForDriver:** `WHERE assignedUserId = ctx.userId AND status IN ('NOT_STARTED', 'IN_PROGRESS')`. Orders by `dueDate ASC NULLS LAST`. Powers mobile My Tasks feed.

### index.ts update

```typescript
// apps/web/src/server/api/routers/workflows/index.ts
export const workflowsRouter = router({
  stepTemplate: stepTemplateRouter,
  playbook: playbookRouter,
  instance: instanceRouter,        // NEW
  stepInstance: stepInstanceRouter, // NEW
});
```

---

## Web UX

### Active Checklist Detail — `/checklists/instances/[id]/page.tsx`

**Page structure (from spec Section 8.3):**
- Server component at `app/(owner)/checklists/instances/[id]/page.tsx`, delegates to `'use client'` component.
- **Header card:** entity name + link to entity profile, playbook name + icon (from snapshot), status badge (color-coded), completion ring (progress circle, percentage), dispatch readiness banner: green `"Dispatch Ready"` or red `"Blocked — N steps required"` listing step names.
- **Phase sections:** collapsible, label + count e.g. `"Day 1 (3/5 complete)"`.
- **Step rows:** status icon (check/x/clock/skip), step name (from stepSnapshot), assignee (name or role), due date (red text if overdue), result summary (truncated), action button.

**Action button logic (from spec Section 8.3):**

| Status | Is Assignee | Button Label | Action |
|--------|-------------|-------------|--------|
| NOT_STARTED | yes | `"Start"` / `"Upload"` / `"Fill Out"` / `"Sign Now"` | Opens modal or links to form |
| COMPLETE | any | `"View Result"` | Opens result detail sheet |
| FAILED | any | `"View Issue"` | Red button, opens fail detail |
| SKIPPED | any | `"Skipped — [reason]"` | Muted, no action |
| IN_PROGRESS (APPROVAL) | approver role | `"Review & Approve"` | Opens approval form |

For admin users: add `"Skip"` option in overflow menu on every step row.

### Active Work Board — Additions to `/checklists/page.tsx`

Add above the existing Playbook grid (from spec Section 8.1):

**Three swimlane columns:**

| Column | Accent | Filter |
|--------|--------|--------|
| Needs Attention | Red left border | `status = BLOCKED OR (status IN_PROGRESS AND any stepInstance isOverdue)` |
| In Progress | Yellow left border | `status = IN_PROGRESS AND no overdue blockers` |
| Completed Today | Green left border | `status = COMPLETED AND completedAt >= today midnight UTC` |

**Each card:** entity name (linked to entity profile), playbook name + icon (from snapshot), completion ring, next/overdue step label, single action button `"View Checklist"`.

Empty state when no instances: `"When you start a checklist, it'll show up here."` Do not render swimlanes if no instances exist.

**"Start Checklist" button** (new UI element above Work Board): opens a modal with playbook selector + entity picker → calls `instance.generate`.

**Data query:** `instance.list` with pagination. For the dashboard, limit to 20 instances per column (no cursor pagination, just `take: 20`).

### Checklists Tab on Driver/Vehicle Profile Pages

**Driver profile** (`/drivers/[id]/page.tsx`): Add `"Checklists"` as a new tab section at the bottom of the page (not a separate tab navigator — this is a web page, not mobile). Use `getForEntity({ entityType: 'DRIVER', entityId: driverId })` to load all instances. Render a list: playbook name, status badge, completion percent, link to instance detail.

**Truck profile** (`/trucks/[id]/page.tsx`): Same pattern. Use `entityType: 'VEHICLE'`.

**CRM/Customer profile** (`/crm/[id]/page.tsx`): Same pattern. The spec calls this "Partner" — in the codebase, the Partner entity is `Customer` (the CRM). Use `entityType: 'PARTNER'`.

**Implementation pattern:** These are server components. Pre-fetch instances server-side using `api.workflows.instance.getForEntity(...)` from `@/trpc/server`. Render as a static section (no client-side refetch needed).

### isDispatchReady Badge on Driver Profile

On the driver profile page header, add a badge next to the driver name:
- Green badge: `"Dispatch Ready"` — when `driver.isDispatchReady === true`
- Red badge: `"Not Dispatch Ready"` — when `false`
- Only show if the driver has at least one active PlaybookInstance (otherwise don't show readiness status)

This is display-only — no enforcement in Phase 43.

---

## Mobile UX

### My Tasks — New Tab in Driver Navigator

**Current driver tab structure (5 tabs, from `app/(driver)/_layout.tsx`):**
1. Dashboard (`index`)
2. Loads (`loads`)
3. Map (`map`)
4. Messages (`messages`)
5. More (`more`)

**Change:** Add `"Tasks"` tab. The spec says "My Tasks" is the driver home tab — but adding it as a 6th tab would crowd the bar. Recommended placement: replace or slot between Messages and More, with the appropriate icon (`CheckSquare` from lucide-react-native).

**Badge:** count of open `DRIVER`-role StepInstances (`status IN NOT_STARTED, IN_PROGRESS`). Fetched via a new mobile API endpoint (REST, not tRPC — mobile uses the REST api-client pattern).

**New route file:** `app/(driver)/tasks/index.tsx` — My Tasks screen.
**Hidden routes:** may need `<Tabs.Screen name="tasks" options={{ href: null }}>` pattern for sub-screens.

### Mobile API Endpoint for My Tasks

Mobile uses REST, not tRPC (see `packages/api-client/`). Add:
- `GET /api/mobile/tasks` — returns `{ stepInstances: StepInstance[] }` for the authenticated driver
- `POST /api/mobile/tasks/[id]/complete` — calls `completeStep` service
- `POST /api/mobile/tasks/[id]/skip` — calls `skipStep` service (requires reason)

These follow the pattern in `apps/web/src/app/api/mobile/` — Bearer token validation via `validateMobileToken`.

### Task Action Screens

Three task-type screens in `apps/mobile/src/screens/workflows/`:

**DocumentUploadScreen.tsx** (from spec Section 9.3):
- Full-screen, not modal. Step name large. Instruction text. Document type label (`stepSnapshot.defaultConfig.documentTypeName`).
- Upload area (dashed box ≥200px): `"Tap to take a photo or choose from files"`.
- Uses `expo-image-picker` (already in mobile deps) or `expo-document-picker`.
- S3 upload: call `/api/mobile/presigned-upload` → upload to S3 → call complete endpoint with `fileUrls: [s3Key]`.
- `"Submit Document"` button disabled until file selected.

**FormFillScreen.tsx** (from spec Section 9.4):
- Full-screen form. Fields from `stepSnapshot.defaultConfig.formSchema`.
- `boolean` → large YES/NO toggle (not checkbox). Use `TouchableOpacity` pair.
- `date` → native `DateTimePicker` from `@react-native-community/datetimepicker` (check if installed).
- `select` → bottom sheet picker (use existing `BottomSheet` component from `components/ui/`).
- `text` → large `TextInput`.
- `"Submit Form"` validates required fields inline.

**SignatureScreen.tsx** (from spec Section 9.5):
- Full-screen. Signature canvas: use `react-native-signature-canvas` or similar.
- Check if `react-native-signature-canvas` is installed: `cat apps/mobile/package.json | grep signature`.
- If not installed: use a `View` with `PanResponder` to capture path points, render as SVG, export as PNG data URI then upload to S3.
- `"Clear"` button top right. `"I confirm and sign"` submits.

### My Tasks Screen (spec Section 9.1)

```
Top summary bar: "3 of 7 tasks complete today" | thin animated progress bar
Feed: vertical FlashList of StepInstance cards
  - Context label (muted): "Pre-Trip Inspection · Truck #104"
  - Step name (large bold)
  - Instruction (first line truncated)
  - Due badge: green/yellow/red
  - Full-width action button ≥56px
Empty state: "You're all caught up. No open tasks right now."
```

**Navigation:** tapping the action button navigates to the appropriate task screen (`DocumentUploadScreen`, `FormFillScreen`, `SignatureScreen`) passing `stepInstanceId` as param.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Push notifications | Custom WebSocket or polling | `sendPushToUser` from `@/lib/notifications/send-push.ts` | Already handles Expo tokens, chunking, invalid token cleanup |
| S3 uploads | Custom multipart | `generateUploadUrl` from `@/lib/storage/presigned.ts` + existing pattern | Already handles tenant-prefixed keys, presigned URLs |
| Document records | Custom table | `prisma.document.create` with existing `Document` model | Model already supports `driverId` + `truckId` FKs |
| Tenant isolation | Per-query WHERE guards | `tenantMemberProcedure` → `ctx.tenantId` | Already enforced at procedure level |
| Client state | Custom fetch | `useQuery(trpc.workflows.instance.list.queryOptions(...))` | Phase 42 established the pattern |
| RLS bypass | Ad-hoc flags | `TX_OPTIONS` + `set_config('app.bypass_rls', 'on', TRUE)` | Existing pattern from `send-push.ts` |

---

## Common Pitfalls

### Pitfall 1: Snapshot Stores `isDispatchBlocker` as Runtime-Copied Data

**What goes wrong:** `computeDispatchReadiness` loads StepInstances and needs to know which ones are blockers. If `isDispatchBlocker` is only on the live `PlaybookStep` (template) and not in `stepSnapshot`, the service must join back to the template — violating snapshot immutability and creating correctness bugs when the template is edited mid-run.

**How to avoid:** Always include `isDispatchBlocker`, `isRequired`, `dueDaysFromStart`, `dueBeforeDispatch` in `stepSnapshot` at `generatePlaybookInstance` time. The service reads from `stepSnapshot`, never from `PlaybookStep`.

### Pitfall 2: User Model vs. Driver Model Confusion

**What goes wrong:** The spec says `Driver.isDispatchReady`. There is no `Driver` model — the codebase uses `User` with `role = DRIVER`. Writing `prisma.driver` fails; writing `prisma.user.update({ where: { id: driverId }, data: { isDispatchReady: true } })` is correct.

**How to avoid:** Map spec "Driver" → `User` model throughout. Map spec "Vehicle" → `Truck` model.

### Pitfall 3: PlaybookEntityType vs. entityId type mismatch

**What goes wrong:** `entityId` is stored as `String @db.Uuid` but the spec's entity types map to different model PKs: DRIVER → `User.id`, VEHICLE → `Truck.id`, PARTNER → `Customer.id`. Services must use the right prisma model lookup to verify entity existence.

**How to avoid:** In `generatePlaybookInstance`, write an entity lookup function that switches on `entityType`:
```typescript
async function verifyEntity(entityType: PlaybookEntityType, entityId: string, tenantId: string) {
  if (entityType === 'DRIVER') return prisma.user.findFirst({ where: { id: entityId, tenantId, role: 'DRIVER' } });
  if (entityType === 'VEHICLE') return prisma.truck.findFirst({ where: { id: entityId, tenantId } });
  if (entityType === 'PARTNER') return prisma.customer.findFirst({ where: { id: entityId, tenantId } });
  // DISPATCH, OTHER: no entity verification needed
}
```

### Pitfall 4: Internal Names in JSX

**What goes wrong:** The naming lint test (`apps/web/src/__tests__/workflows-naming-lint.test.ts`) scans all `.tsx` files in `app/(owner)/checklists/` and fails if `PlaybookInstance`, `StepInstance`, or `PlaybookTrigger` appear in JSX text or string attributes.

**How to avoid:** Use user-facing names in all rendered text:
- `PlaybookInstance` → `"Active Checklist"`
- `StepInstance` → `"Task"`
- `StepTemplate` → `"Step"`

The lint currently only covers `app/(owner)/checklists/`. New screens there (like `instances/[id]`) are also covered.

### Pitfall 5: Missing isDispatchBlocker / isRequired Columns in PlaybookStep

**What goes wrong:** Phase 42's `PlaybookStep` schema omits `isDispatchBlocker`, `isRequired`, `dueDaysFromStart`, `dueBeforeDispatch`. The Phase 42 builder UI stores these values inside `overrideConfig Json`. If Phase 43 also stores them only in `overrideConfig`, `computeDispatchReadiness` cannot query `WHERE isDispatchBlocker = true` — it must deserialize every step's JSON blob and filter in memory (inefficient and error-prone).

**How to avoid:** Add these as first-class `PlaybookStep` columns in the Phase 43 migration. The builder UI's `StepDetailEditor` stores `isDispatchBlocker` in `overrideConfig` currently (Phase 42 did not add these columns). Phase 43 must: (a) add columns via migration with safe defaults, (b) update the builder UI to write both `overrideConfig` and the dedicated columns, (c) update `generatePlaybookInstance` to copy from the first-class columns into `stepSnapshot`.

**Migration safety:** `ALTER TABLE "PlaybookStep" ADD COLUMN "isDispatchBlocker" BOOLEAN NOT NULL DEFAULT FALSE` is safe — no data loss, existing rows default to false.

### Pitfall 6: Mobile Uses REST, Not tRPC

**What goes wrong:** Trying to call `trpc.workflows.instance.generate` from the mobile app. Mobile does not use tRPC — it uses the `@drivecommand/api-client` REST package which calls Bearer-token protected `/api/mobile/*` routes.

**How to avoid:** Add new REST routes under `apps/web/src/app/api/mobile/tasks/`. These routes call the same service functions (`generatePlaybookInstance`, `completeStep`) but go through `validateMobileToken` instead of tRPC context.

### Pitfall 7: completionPercent Float Precision

**What goes wrong:** `completionPercent` is stored as `Float`. JavaScript `(3/7)*100 = 42.857142857142854`. Store rounded to 1 decimal: `Math.round((complete / total) * 1000) / 10`.

**How to avoid:** Always use integer arithmetic then divide: `Math.round((completeCount / totalCount) * 100)` for whole numbers, or keep to 1 decimal.

---

## Code Examples

### generatePlaybookInstance (service skeleton)

```typescript
// Source: spec Section 6.1 + codebase patterns
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { TRPCError } from '@trpc/server';
import { sendPushToUser } from '@/lib/notifications/send-push';
import type { PlaybookEntityType } from '@drivecommand/validation';

export async function generatePlaybookInstance(args: {
  playbookId: string;
  entityType: PlaybookEntityType;
  entityId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'trigger';
}) {
  const { playbookId, entityType, entityId, tenantId, triggeredBy } = args;

  // 1. Load template
  const playbook = await prisma.playbook.findFirst({
    where: { id: playbookId, tenantId, deletedAt: null },
    include: {
      steps: {
        orderBy: [{ playbookPhase: 'asc' }, { sequence: 'asc' }],
        include: { stepTemplate: true },
      },
    },
  });
  if (!playbook) throw new TRPCError({ code: 'NOT_FOUND' });
  if (!playbook.isActive) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Playbook is not active' });

  // 2. Verify entity exists
  await verifyEntity(entityType, entityId, tenantId); // throws NOT_FOUND if missing

  // 3. Check for duplicate
  const existing = await prisma.playbookInstance.findFirst({
    where: { playbookId, entityId, tenantId, status: { not: 'COMPLETED' } },
  });
  if (existing) throw new TRPCError({ code: 'CONFLICT', message: 'Active checklist already exists' });

  // 4-8. Create instance + step instances in transaction
  const instance = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    const playbookSnapshot = buildSnapshot(playbook); // deep copy
    const newInstance = await tx.playbookInstance.create({
      data: { tenantId, playbookId, playbookSnapshot, entityType, entityId, status: 'NOT_STARTED', isDispatchReady: false },
    });
    for (const step of playbook.steps) {
      const assignedUserId = await resolveAssignee(step.stepTemplate.assigneeRole, tenantId);
      const dueDate = step.dueDaysFromStart
        ? new Date(Date.now() + step.dueDaysFromStart * 86400000)
        : null;
      await tx.stepInstance.create({
        data: {
          playbookInstanceId: newInstance.id,
          stepTemplateId: step.stepTemplateId,
          stepSnapshot: buildStepSnapshot(step),
          assigneeRole: step.stepTemplate.assigneeRole,
          assignedUserId,
          dueDate,
          status: 'NOT_STARTED',
        },
      });
    }
    return newInstance;
  }, TX_OPTIONS);

  // Fire notifications (outside transaction — best effort)
  // ... sendPushToUser for each resolved assignee

  return instance;
}
```

### computeDispatchReadiness (service skeleton)

```typescript
// Source: spec Section 6.2
export async function computeDispatchReadiness(instanceId: string) {
  const instance = await prisma.playbookInstance.findUniqueOrThrow({
    where: { id: instanceId },
    include: { stepInstances: true },
  });

  const total = instance.stepInstances.length;
  const completeCount = instance.stepInstances.filter(
    (s) => s.status === 'COMPLETE' || s.status === 'SKIPPED'
  ).length;
  const completionPercent = total > 0 ? Math.round((completeCount / total) * 100) : 100;

  // Blockers determined from stepSnapshot
  const blockers = instance.stepInstances.filter((s) => {
    const snap = s.stepSnapshot as { isDispatchBlocker?: boolean };
    return snap.isDispatchBlocker === true;
  });
  const unblockedBlockers = blockers.filter(
    (s) => s.status === 'NOT_STARTED' || s.status === 'IN_PROGRESS' || s.status === 'FAILED'
  );
  const isReady = unblockedBlockers.length === 0;

  // Compute status
  let status: InstanceStatus = 'NOT_STARTED';
  if (completionPercent === 100) status = 'COMPLETED';
  else if (!isReady) status = 'BLOCKED';
  else if (completeCount > 0) status = 'IN_PROGRESS';

  await prisma.playbookInstance.update({
    where: { id: instanceId },
    data: { completionPercent, isDispatchReady: isReady, status },
  });

  // Aggregate entity readiness
  await updateEntityReadiness(instance.entityType, instance.entityId, instance.tenantId);

  return { isReady, blockers: unblockedBlockers };
}
```

### Driver Tab Layout Update

```typescript
// Source: apps/mobile/app/(driver)/_layout.tsx — add Tasks tab
import { CheckSquare } from 'lucide-react-native'

// Add between Messages and More:
<Tabs.Screen
  name="tasks"
  options={{
    tabBarLabel: 'Tasks',
    tabBarIcon: ({ color, focused }) => (
      <TabIcon focused={focused}>
        <CheckSquare color={color} size={tabBar.iconSize} />
        {openTaskCount > 0 && (
          <View style={styles.unreadBadge}>
            <Text style={styles.unreadBadgeText}>{openTaskCount > 99 ? '99+' : String(openTaskCount)}</Text>
          </View>
        )}
      </TabIcon>
    ),
  }}
  listeners={{ tabPress: () => haptic.light() }}
/>
```

---

## Integration Points

### Dispatch-Readiness Badge on Load Assignment Screen

Per spec Section 13: `"Load assignment screen — Surface readiness badges. Green check = ready. Red = blocked with open-blocker count."` In Phase 43, this is display-only. The actual load assignment screen needs to read `User.isDispatchReady` from the database and render the badge. No blocking logic yet.

### Driver Profile Checklists Tab

The driver profile page (`/drivers/[id]/page.tsx`) is a server component with no tabs currently. Adding a "Checklists" section means either: (a) appending a new section to the existing page, or (b) converting to a tabbed layout. Option (a) is simpler and consistent with the existing page structure.

### fireEvent Attachment Points (TODOs only)

Phase 43 does NOT wire `fireEvent`. Add TODO comments at these lifecycle hooks:
- `apps/web/src/app/(owner)/actions/drivers.ts` — driver create action
- `apps/web/src/app/(owner)/actions/trucks.ts` — truck create action
- `apps/web/src/app/(owner)/actions/customers.ts` — customer create action

Comment format: `// TODO(phase-44): fireEvent('ON_DRIVER_CREATE', driver, tenantId)`

---

## Testing Requirements (from spec Section 15, Phase 2)

The following tests must be written:

1. **Snapshot immutability test:** `generatePlaybookInstance`, mutate source Playbook, assert `playbookSnapshot` unchanged.
2. **Readiness with zero blockers returns `isReady=true`:** instance where no step has `isDispatchBlocker=true`.
3. **`completeStep` type-specific validation — one test per `StepType`, error code asserted.** 8 tests total.
4. **Mobile tap-target audit:** existing test utility checks Pressable/TouchableOpacity height ≥ 56px. New task screens must pass.
5. **Naming lint:** existing test (`workflows-naming-lint.test.ts`) covers new `instances/[id]` page automatically.
6. **Tenant scoping grep** (existing CI check): all new service queries must include `tenantId`.

---

## Open Questions

1. **isDispatchBlocker in PlaybookStep — migration vs. overrideConfig**
   - What we know: Phase 42's `overrideConfig` is freeform JSON; the spec needs `isDispatchBlocker` as a first-class SQL field for efficient querying.
   - What's unclear: Phase 42's builder UI may already write `isDispatchBlocker` into `overrideConfig`. If so, a data migration is needed to populate the new column.
   - Recommendation: Add first-class columns to PlaybookStep in Phase 43 migration. Update builder UI to write both. Migration backfills: `UPDATE "PlaybookStep" SET "isDispatchBlocker" = COALESCE((overrideConfig->>'isDispatchBlocker')::boolean, false)`.

2. **Signature capture on mobile — library availability**
   - What we know: `react-native-signature-canvas` is not confirmed installed.
   - Recommendation: Planner should check `apps/mobile/package.json` for signature library before planning mobile sub-task. If not present, use `PanResponder`-based canvas with SVG output.

3. **Partner entity type — Customer vs. CarrierClient**
   - What we know: The schema has two "partner-like" models: `Customer` (CRM, accessed at `/crm/`) and `CarrierClient` (carrier ops, accessed via carrier ops screens). The spec says "Partner" entity type gets a Checklists tab.
   - Recommendation: Map `PARTNER` entityType to `Customer` for Phase 43 (it's the user-accessible CRM entity). `CarrierClient` is an internal operations entity and is out of scope for Phase 43.

4. **Mobile file upload for DocumentUploadScreen**
   - What we know: The existing mobile document upload uses `expo-document-picker` + a presigned URL pattern. Check `apps/mobile/` for existing upload hook.
   - Recommendation: Reuse whatever upload utility exists in the mobile app rather than inventing a new one.

---

## Sources

### Primary (HIGH confidence)
- `docs/specs/DriveCommand_Workflow_Engine_v2.md` — spec Sections 4–9, 13–15 read in full
- `apps/web/prisma/schema.prisma` — complete schema read
- `apps/web/prisma/migrations/20260423100001_add_workflow_engine_foundation/migration.sql` — migration pattern verified
- `apps/web/src/server/api/trpc.ts` — auth context verified
- `apps/web/src/server/api/routers/workflows/playbook.ts` — tRPC pattern verified
- `apps/web/src/server/api/routers/workflows/stepTemplate.ts` — procedure pattern verified
- `apps/web/src/server/services/workflows/playbookStepService.ts` — service pattern verified
- `apps/web/src/lib/notifications/send-push.ts` — notification API verified
- `apps/web/src/lib/storage/presigned.ts` — S3 upload pattern verified
- `apps/web/src/lib/db/repositories/document.repository.ts` — document creation pattern verified
- `apps/mobile/app/(driver)/_layout.tsx` — current tab structure verified
- `apps/web/src/app/(owner)/drivers/[id]/page.tsx` — driver profile structure verified
- `apps/web/src/app/(owner)/trucks/[id]/page.tsx` — truck profile structure verified
- `packages/validation/src/workflows/enums.ts` — enum values verified
- `packages/validation/src/workflows/playbook.ts` — validation pattern verified
- `apps/web/src/__tests__/workflows-naming-lint.test.ts` — lint test scope verified

### Secondary (MEDIUM confidence)
- `apps/web/src/app/(driver)/_layout.tsx` does not exist (driver portal is mobile only — confirmed)
- `Customer` model confirmed as the "Partner" equivalent in CRM context (read schema + CRM route)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — everything inherited from Phase 42 or verified in codebase
- Schema additions: HIGH — spec is explicit; codebase conventions verified
- Service implementations: HIGH — spec Sections 6.1–6.3 are detailed; patterns from Phase 42 verified
- Web UX: HIGH — spec Section 8 is detailed; existing page patterns verified
- Mobile UX: MEDIUM — tab structure verified; signature library availability unconfirmed
- Testing: HIGH — spec Section 15 is explicit; existing test patterns verified

**Research date:** 2026-04-23
**Valid until:** 2026-05-23 (spec is locked; codebase changes would require re-research)
