# Phase 2 — Execution
**Spec:** `docs/specs/DriveCommand_Workflow_Engine_v2.md` Section 14  
**DoD:** Dispatcher creates an Active Checklist manually. Driver completes non-inspection steps on mobile.  
**Branch:** `feat/workflow-phase-2-execution`  
**Output file:** `.gsd/phase-2-plan.md`

---

## Scope

| In | Out |
|----|-----|
| Prisma: `PlaybookInstance`, `StepInstance`, `PlaybookNotification` migrations | Inspection Mode full-screen UX (Phase 3) |
| Enums: `InstanceStatus`, `StepStatus`, `NotifType`, `NotifChannel` | `failInspectionItem` service (Phase 3) |
| `PlaybookStep` first-class columns: `isRequired`, `isDispatchBlocker`, `dueDaysFromStart`, `dueBeforeDispatch` | `stepInstance.fail`, `.requestApproval`, `.approve` procedures (Phase 3) |
| `User.isDispatchReady`, `Truck.isDispatchReady` additions | `fireEvent()` wired — only `// TODO(phase-4): fireEvent(...)` stubs at lifecycle call sites |
| Zod schemas: `instance.ts`, `stepInstance.ts` in `packages/validation/src/workflows/` | `PlaybookTrigger` model (Phase 4) |
| Service: `generatePlaybookInstance` (snapshot + transaction) | Dispatch enforcement / blocking non-ready drivers at dispatch creation (Phase 4) |
| Service: `computeDispatchReadiness` (reads from stepSnapshot, not template) | Auto-Start Rules page (Phase 4) |
| Service: `completeStep` (8-type validation, Document side-effect, readiness recompute) | `trigger` tRPC router (Phase 4) |
| tRPC: `instance.generate/list/get/getForEntity/computeReadiness` | Preview Panel in Builder (Phase 5) |
| tRPC: `stepInstance.complete/skip/getForDriver` | SMS notifications (Phase 3+) |
| Web: Active Work Board swimlanes on `/checklists` dashboard | `PlaybookNotification` model table wired to full notification suite (Phase 3+) |
| Web: Active Checklist Detail at `/checklists/instances/[id]` | STEP_OVERDUE, INSTANCE_BLOCKED full notification suite (Phase 3/4) |
| Web: Checklists tab on Driver, Truck, and Customer/Partner profiles | |
| Web: `isDispatchReady` badge on driver profile — surfaced only, not enforced | |
| Mobile REST: `GET/POST /api/mobile/driver/tasks` endpoints | |
| Mobile: My Tasks tab with open-step badge | |
| Mobile: `DocumentUploadScreen`, `FormFillScreen`, `SignatureScreen` | |
| Mobile: `TaskActionDispatcher` routing by `stepType` | |
| Notifications: `STEP_ASSIGNED` push on instance generate and step complete | |
| Notifications: `DISPATCH_READY` push on false-to-true flip only | |
| Tests: snapshot immutability, zero-blocker readiness, 8-type completeStep validation, mobile tap-target audit | |

**Flag — Phase 3+ only:** Do NOT add `failInspectionItem`, do NOT add `stepInstance.fail` / `.requestApproval` / `.approve` procedures, do NOT wire `fireEvent()` — mark call sites with `// TODO(phase-4): fireEvent(...)` only.

---

## Codebase Conventions (read before building)

| Pattern | Where |
|---------|-------|
| UUID PK | `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` — never `@default(uuid())` |
| Tenant scope | `tenantId String @db.Uuid` + FK to `Tenant` + `@@index([tenantId, ...])` |
| Soft delete | `deletedAt DateTime? @db.Timestamptz` (filter `deletedAt: null` in queries) |
| Timestamps | `@db.Timestamptz` on all date fields |
| Mutations | `adminProcedure` (OWNER + MANAGER roles) |
| Queries | `tenantMemberProcedure` (any authenticated role) |
| Tenant id in ctx | `ctx.tenantId` — never accept `tenantId` from client input |
| Zod schemas | `packages/validation/src/workflows/` → import as `@drivecommand/validation` |
| tRPC error | `throw new TRPCError({ code: 'NOT_FOUND' \| 'FORBIDDEN' \| 'BAD_REQUEST' })` |
| RLS bypass in services | `await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`` |
| TX_OPTIONS | Import from `@/lib/db/prisma` — always pass to `$transaction` calls |
| Push notifications | `sendPushToUser(userId, { title, body, data })` from `@/lib/notifications/send-push` |
| S3 presigned upload | `generateUploadUrl()` from `@/lib/storage/presigned.ts` |
| Document creation | `prisma.document.create({ data: { tenantId, driverId, truckId, fileName, s3Key, ... } })` |
| Mobile auth | `withMobileAuth(handler, { allowedRoles })` from `@/lib/api/with-mobile-auth` |
| Mobile navigation | Expo Router v4, `apps/mobile/app/(driver)/` route groups |
| Mobile components | FlashList (not FlatList), expo-image, `useThemeColors()`, `haptic()` |
| Notifications module | All push calls route through `apps/web/src/server/services/workflows/notifications.ts` |

### Schema field-name notes (v2 spec → codebase)

| v2 spec field | Codebase field | Where |
|--------------|----------------|-------|
| `EntityType` enum | `PlaybookEntityType` enum | `schema.prisma` |
| `Driver` entity | `User` model (`role: DRIVER`) | DB + service layer |
| `Vehicle` entity | `Truck` model | DB + service layer |
| `PlaybookStep.phase` | `PlaybookStep.playbookPhase` | model + Zod |
| `StepTemplate.formSchema + documentTypeName` | `StepTemplate.defaultConfig Json` | model — all type-specific config in one JSON blob |
| `StepInstance.result.acknowledged` | `result.note` or `result.acknowledged` | both accepted in completeStep |

When building, use codebase field names. When writing user-facing UI copy, use only the names from Section 3 of the spec.

---

## UI Design System — Phase 2

**Stack:** Next.js 15 App Router + Tailwind + shadcn/ui (web) · NativeWind v4 (mobile)  
**Industry:** logistics / fleet SaaS  
**Style:** professional, minimal, flat — no gradients, 150-200ms transitions  

**Work Board swimlane colors (apply these Tailwind classes):**

| Column | Left border + background |
|--------|--------------------------|
| Needs Attention | `border-l-4 border-l-red-500 bg-red-50/30 dark:bg-red-950/20` |
| In Progress | `border-l-4 border-l-yellow-400 bg-yellow-50/30 dark:bg-yellow-950/20` |
| Completed Today | `border-l-4 border-l-green-500 bg-green-50/30 dark:bg-green-950/20` |

**Work Board card:**
- Completion ring: SVG `<circle>` with `stroke-dasharray` / `stroke-dashoffset` — no third-party chart library
- Action button: shadcn/ui `<Button variant="outline">` for View Checklist
- BLOCKED card action: `variant="destructive"` for "View Issue"

**Active Checklist Detail (section 8.3):**
- Phase sections: Radix `<Collapsible>`, chevron `ChevronDown` from lucide-react, rotates 90° on open
- Dispatch readiness banner: green row `CheckCircle2` / red row `AlertTriangle` from lucide-react
- Step status icons: `CheckCircle2` (COMPLETE), `XCircle` (FAILED), `Minus` (SKIPPED), `Circle` (NOT_STARTED), `Loader2` (IN_PROGRESS)

**Mobile — My Tasks:**
- Top summary bar: progress fraction + thin `<Animated.View>` bar, NativeWind width update on rerender
- Task cards: full-width action button `minHeight: 56` (spec mandate)
- Due badge: `bg-green-100 text-green-800` / `bg-yellow-100 text-yellow-800` / `bg-red-100 text-red-800`

**Mobile — task action screens:**
- All `Pressable`/`TouchableOpacity` interactive elements: `height: 56` minimum (tap-target spec mandate)
- Upload area: dashed border box `minHeight: 200`, `borderStyle: 'dashed'`
- Signature canvas: `PanResponder`-based SVG canvas, full width, `minHeight: 200`

**Pre-Delivery Checklist:**
- No emojis as icons — Lucide SVG on web, `lucide-react-native` on mobile
- `cursor-pointer` on all clickable web elements
- Hover states with 150-300ms transitions on web
- Text contrast ≥4.5:1
- Focus states visible for keyboard nav on web

---

## Tasks

All tasks are independently executable and verifiable. Execute in order.
Each task ends with its verification command.

---

### Task 1 — Prisma Migration: `workflow_engine_execution`

**Wave:** 1  
**Depends on:** Phase 1 (StepTemplate, Playbook, PlaybookStep, and their enums exist)  

**Goal:** Add instance-world tables (`PlaybookInstance`, `StepInstance`, `PlaybookNotification`), the four new enums, first-class dispatch-blocker columns on `PlaybookStep`, and `isDispatchReady` on `User` and `Truck`.

**Files to CREATE:**
```
apps/web/prisma/migrations/
  20260423200001_workflow_engine_execution/
    migration.sql                    (~180 lines)
```

**Files to MODIFY:**
```
apps/web/prisma/schema.prisma        (+~120 lines)
```

**Files NOT to touch:**
```
- Any existing model outside of PlaybookStep, User, Truck
- Any existing migration
- PlaybookTrigger model — Phase 4
- PlaybookNotification table wiring to full notification suite — Phase 3+
```

**migration.sql — ordered sections:**

```sql
-- 1. Enums (safe: DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END; $$)

-- InstanceStatus
DO $$ BEGIN
  CREATE TYPE "InstanceStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- StepStatus
DO $$ BEGIN
  CREATE TYPE "StepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETE', 'FAILED', 'SKIPPED');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- NotifType
DO $$ BEGIN
  CREATE TYPE "NotifType" AS ENUM (
    'STEP_ASSIGNED', 'STEP_OVERDUE', 'INSTANCE_BLOCKED',
    'DISPATCH_READY', 'STEP_FAILED', 'APPROVAL_NEEDED'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- NotifChannel
DO $$ BEGIN
  CREATE TYPE "NotifChannel" AS ENUM ('PUSH', 'SMS', 'IN_APP', 'EMAIL');
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- 2. PlaybookInstance
CREATE TABLE "PlaybookInstance" (
  "id"                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"          UUID        NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  "playbookId"        UUID        NOT NULL REFERENCES "Playbook"(id) ON DELETE RESTRICT,
  "playbookSnapshot"  JSONB       NOT NULL,
  "entityType"        "PlaybookEntityType" NOT NULL,
  "entityId"          UUID        NOT NULL,
  "status"            "InstanceStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "completionPercent" FLOAT       NOT NULL DEFAULT 0,
  "isDispatchReady"   BOOLEAN     NOT NULL DEFAULT false,
  "startedAt"         TIMESTAMPTZ,
  "completedAt"       TIMESTAMPTZ,
  "dueDate"           TIMESTAMPTZ,
  "createdAt"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"         TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "PlaybookInstance"("tenantId", "entityType", "entityId");
CREATE INDEX ON "PlaybookInstance"("tenantId", "status");
CREATE INDEX ON "PlaybookInstance"("tenantId", "isDispatchReady");

ALTER TABLE "PlaybookInstance" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "PlaybookInstance"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "PlaybookInstance"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- 3. StepInstance
CREATE TABLE "StepInstance" (
  "id"                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "playbookInstanceId" UUID        NOT NULL REFERENCES "PlaybookInstance"(id) ON DELETE CASCADE,
  "stepTemplateId"     UUID        REFERENCES "StepTemplate"(id) ON DELETE RESTRICT,
  "stepSnapshot"       JSONB       NOT NULL,
  "status"             "StepStatus" NOT NULL DEFAULT 'NOT_STARTED',
  "assigneeRole"       "AssigneeRole" NOT NULL,
  "assignedUserId"     UUID,
  "completedByUserId"  UUID,
  "completedAt"        TIMESTAMPTZ,
  "result"             JSONB,
  "skipReason"         TEXT,
  "skippedByUserId"    UUID,
  "dueDate"            TIMESTAMPTZ,
  "isOverdue"          BOOLEAN     NOT NULL DEFAULT false,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "StepInstance"("playbookInstanceId");
CREATE INDEX ON "StepInstance"("assignedUserId", "status");
CREATE INDEX ON "StepInstance"("playbookInstanceId", "status");

ALTER TABLE "StepInstance" ENABLE ROW LEVEL SECURITY;

-- StepInstance has no tenantId — isolate via JOIN to PlaybookInstance
CREATE POLICY tenant_isolation_policy ON "StepInstance"
  FOR ALL USING (
    "playbookInstanceId" IN (
      SELECT id FROM "PlaybookInstance" WHERE "tenantId" = current_tenant_id()
    )
  );

CREATE POLICY bypass_rls_policy ON "StepInstance"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- 4. PlaybookNotification
CREATE TABLE "PlaybookNotification" (
  "id"                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId"           UUID        NOT NULL,
  "playbookInstanceId" UUID        NOT NULL REFERENCES "PlaybookInstance"(id) ON DELETE CASCADE,
  "stepInstanceId"     UUID,
  "notificationType"   "NotifType" NOT NULL,
  "channel"            "NotifChannel" NOT NULL,
  "recipientUserId"    UUID        NOT NULL,
  "message"            TEXT        NOT NULL,
  "sentAt"             TIMESTAMPTZ,
  "deliveredAt"        TIMESTAMPTZ,
  "createdAt"          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "PlaybookNotification"("playbookInstanceId");
CREATE INDEX ON "PlaybookNotification"("recipientUserId");

ALTER TABLE "PlaybookNotification" ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "PlaybookNotification"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "PlaybookNotification"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- 5. PlaybookStep: add first-class dispatch-blocker columns
--    (These were stored only in overrideConfig JSON in Phase 1 — promote to columns here)
ALTER TABLE "PlaybookStep"
  ADD COLUMN IF NOT EXISTS "isRequired"          BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "isDispatchBlocker"   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "dueDaysFromStart"     INT,
  ADD COLUMN IF NOT EXISTS "dueBeforeDispatch"    BOOLEAN NOT NULL DEFAULT false;

-- Backfill from overrideConfig for existing rows
UPDATE "PlaybookStep"
  SET "isRequired"        = COALESCE((("overrideConfig"->>'isRequired')::boolean), true),
      "isDispatchBlocker" = COALESCE((("overrideConfig"->>'isDispatchBlocker')::boolean), false),
      "dueDaysFromStart"  = ("overrideConfig"->>'dueDaysFromStart')::int,
      "dueBeforeDispatch" = COALESCE((("overrideConfig"->>'dueBeforeDispatch')::boolean), false);

-- 6. User.isDispatchReady
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "isDispatchReady" BOOLEAN NOT NULL DEFAULT false;

-- 7. Truck.isDispatchReady
ALTER TABLE "Truck"
  ADD COLUMN IF NOT EXISTS "isDispatchReady" BOOLEAN NOT NULL DEFAULT false;
```

**schema.prisma additions:**

```prisma
// New enums (append after existing enums)
enum InstanceStatus { NOT_STARTED  IN_PROGRESS  COMPLETED  BLOCKED }
enum StepStatus     { NOT_STARTED  IN_PROGRESS  COMPLETE  FAILED  SKIPPED }
enum NotifType      { STEP_ASSIGNED  STEP_OVERDUE  INSTANCE_BLOCKED  DISPATCH_READY  STEP_FAILED  APPROVAL_NEEDED }
enum NotifChannel   { PUSH  SMS  IN_APP  EMAIL }

// PlaybookInstance model
model PlaybookInstance {
  id                String             @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId          String             @db.Uuid
  playbookId        String             @db.Uuid
  playbookSnapshot  Json
  entityType        PlaybookEntityType
  entityId          String             @db.Uuid
  status            InstanceStatus     @default(NOT_STARTED)
  completionPercent Float              @default(0)
  isDispatchReady   Boolean            @default(false)
  startedAt         DateTime?          @db.Timestamptz
  completedAt       DateTime?          @db.Timestamptz
  dueDate           DateTime?          @db.Timestamptz
  createdAt         DateTime           @default(now()) @db.Timestamptz
  updatedAt         DateTime           @updatedAt @db.Timestamptz

  tenant         Tenant                 @relation(fields: [tenantId], references: [id])
  playbook       Playbook               @relation(fields: [playbookId], references: [id])
  stepInstances  StepInstance[]
  notifications  PlaybookNotification[]

  @@index([tenantId, entityType, entityId])
  @@index([tenantId, status])
  @@index([tenantId, isDispatchReady])
}

// StepInstance model
model StepInstance {
  id                 String           @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  playbookInstanceId String           @db.Uuid
  stepTemplateId     String?          @db.Uuid
  stepSnapshot       Json
  status             StepStatus       @default(NOT_STARTED)
  assigneeRole       AssigneeRole
  assignedUserId     String?          @db.Uuid
  completedByUserId  String?          @db.Uuid
  completedAt        DateTime?        @db.Timestamptz
  result             Json?
  skipReason         String?
  skippedByUserId    String?          @db.Uuid
  dueDate            DateTime?        @db.Timestamptz
  isOverdue          Boolean          @default(false)
  createdAt          DateTime         @default(now()) @db.Timestamptz
  updatedAt          DateTime         @updatedAt @db.Timestamptz

  playbookInstance PlaybookInstance  @relation(fields: [playbookInstanceId], references: [id], onDelete: Cascade)
  stepTemplate     StepTemplate?     @relation(fields: [stepTemplateId], references: [id], onDelete: Restrict)

  @@index([playbookInstanceId])
  @@index([assignedUserId, status])
  @@index([playbookInstanceId, status])
}

// PlaybookNotification model
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

  playbookInstance PlaybookInstance @relation(fields: [playbookInstanceId], references: [id])

  @@index([playbookInstanceId])
  @@index([recipientUserId])
}

// Additions to existing models:
// User model: add isDispatchReady Boolean @default(false)
// Truck model: add isDispatchReady Boolean @default(false)
// Playbook model: add instances PlaybookInstance[] relation
// PlaybookStep model: isRequired/isDispatchBlocker/dueDaysFromStart/dueBeforeDispatch promoted from JSON to columns
```

**Verification:**
```bash
cd apps/web && npx prisma validate
# Must exit 0, no errors
cd apps/web && npx prisma generate
# Must exit 0
```

---

### Task 2 — Zod Validation Schemas: `instance.ts` + `stepInstance.ts`

**Wave:** 1 (parallel with Task 1)  
**Depends on:** nothing (schemas are spec-derived, no DB dependency)  

**Files to CREATE:**
```
packages/validation/src/workflows/
  instance.ts       (~50 lines)   — generateInstanceSchema, listInstancesSchema,
                                     getInstanceSchema, getForEntitySchema, computeReadinessSchema
  stepInstance.ts   (~80 lines)   — stepResultSchema (StepResult type), completeStepSchema,
                                     skipStepSchema, getForDriverSchema, failInspectionItemSchema,
                                     approveStepSchema
```

**Files to MODIFY:**
```
packages/validation/src/workflows/index.ts   (+2 lines) — export * from './instance', './stepInstance'
```

**Files NOT to touch:**
```
- trigger.ts — Phase 4
- Any existing validation schemas
```

**Schema shapes:**

```typescript
// instance.ts
export const generateInstanceSchema = z.object({
  playbookId: z.string().uuid(),
  entityType: playbookEntityTypeSchema,
  entityId: z.string().uuid(),
});

export const listInstancesSchema = z.object({
  status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).optional(),
  entityType: playbookEntityTypeSchema.optional(),
  entityId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  take: z.number().int().min(1).max(100).default(20),
});

export const getInstanceSchema = z.object({ id: z.string().uuid() });
export const getForEntitySchema = z.object({
  entityType: playbookEntityTypeSchema,
  entityId: z.string().uuid(),
});
export const computeReadinessSchema = z.object({ instanceId: z.string().uuid() });

// stepInstance.ts
export const stepResultSchema = z.object({
  fileUrls:     z.array(z.string()).optional(),    // DOCUMENT_UPLOAD
  signatureUrl: z.string().optional(),             // SIGNATURE
  formData:     z.record(z.string(), z.unknown()).optional(), // FORM_FILL
  passOrFail:   z.enum(['pass', 'fail']).optional(), // INSPECTION_ITEM
  acknowledged: z.boolean().optional(),            // TRAINING_ACK
  note:         z.string().optional(),             // CUSTOM_NOTE + THIRD_PARTY
  photoUrls:    z.array(z.string()).optional(),    // shared
});
export type StepResult = z.infer<typeof stepResultSchema>;

export const completeStepSchema = z.object({
  stepInstanceId: z.string().uuid(),
  result: stepResultSchema,
});

export const skipStepSchema = z.object({
  stepInstanceId: z.string().uuid(),
  reason: z.string().min(1, 'Skip reason is required'),
});

export const getForDriverSchema = z.object({
  cursor: z.string().uuid().optional(),
  take: z.number().int().min(1).max(50).default(20),
});

// Phase 3 schemas (created here so router can import, procedures added in Phase 3)
export const failInspectionItemSchema = z.object({
  stepInstanceId: z.string().uuid(),
  result: z.object({
    photoUrls: z.array(z.string()).default([]),
    note: z.string().max(1000).optional(),
  }),
});

export const approveStepSchema = z.object({
  stepInstanceId: z.string().uuid(),
  note: z.string().max(1000).optional(),
});
```

**Verification:**
```bash
cd packages/validation && npx tsc --noEmit
# Must exit 0
```

---

### Task 3 — Service: `generatePlaybookInstance`

**Wave:** 2  
**Depends on:** Task 1 (Prisma types for PlaybookInstance, StepInstance)  

**Files to CREATE:**
```
apps/web/src/server/services/workflows/
  generatePlaybookInstance.ts   (~200 lines)
  notifications.ts              (~80 lines)  — sendStepAssigned helper (thin push wrapper)
```

**Files NOT to touch:**
```
- computeDispatchReadiness.ts — Task 4
- completeStep.ts — Task 5
- Any existing service outside workflows/
```

**Service signature:**

```typescript
export async function generatePlaybookInstance(args: {
  playbookId: string;
  entityType: PlaybookEntityType;
  entityId: string;
  tenantId: string;
  triggeredBy: 'manual' | 'trigger';
}): Promise<PlaybookInstance>
```

**Implementation steps:**

1. Load Playbook with all PlaybookSteps ordered by `(playbookPhase ASC, sequence ASC)`. Throw `NOT_FOUND` if missing; throw `BAD_REQUEST` if `!isActive`.
2. Verify entity exists: DRIVER → `User` (role=DRIVER), VEHICLE → `Truck`, PARTNER → `Customer`. DISPATCH and OTHER: no verification. Throw `NOT_FOUND` if missing.
3. Check for duplicate active instance: `findFirst({ where: { playbookId, entityId, tenantId, status: { not: 'COMPLETED' } } })`. Throw `CONFLICT` if found.
4. Build `playbookSnapshot` via `buildPlaybookSnapshot(playbook)` — deep-copy of name, category, entityType, and all steps with their stepTemplate data. This snapshot is immutable once written.
5. Open `prisma.$transaction(async (tx) => { ... }, TX_OPTIONS)`:
   - `await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\``
   - Create `PlaybookInstance` with status=NOT_STARTED, isDispatchReady=false
   - For each PlaybookStep: compute `dueDate` from `dueDaysFromStart` (fallback), build `stepSnapshot` via `buildStepSnapshot(step)`, create `StepInstance` with status=NOT_STARTED, assignedUserId=null
6. Outside transaction: resolve assignees — for DRIVER entity + DRIVER role → assign entityId directly; for all other roles → query tenant OWNER/MANAGER users, assign if exactly one found (null if ambiguous).
7. Update assignedUserId on each resolved StepInstance. Call `sendStepAssigned({ stepInstanceId, tenantId })` per assignee — best-effort, never throws.
8. Return hydrated instance via `findUniqueOrThrow({ include: { stepInstances: true } })`.

**buildPlaybookSnapshot must include:** id, name, category, entityType, and per-step: stepTemplateId, sequence, playbookPhase, isRequired, isDispatchBlocker, dueDaysFromStart, dueBeforeDispatch, stepTemplate: { name, stepType, assigneeRole, defaultConfig, description }.

**buildStepSnapshot must include:** name (from stepTemplate.name), stepType, assigneeRole, isRequired, isDispatchBlocker, dueDaysFromStart, dueBeforeDispatch, defaultConfig, description, overrideConfig, playbookPhase, sequence.

**notifications.ts (thin wrapper for Phase 2 scope):**
```typescript
export async function sendStepAssigned(args: {
  stepInstanceId: string;
  tenantId: string;
}): Promise<void>
// Loads step + assignedUserId, calls sendPushToUser with title/body/data,
// writes PlaybookNotification audit row (channel: IN_APP or PUSH).
// Best-effort: catches all errors, never throws.
// TODO(phase-3): SMS for STEP_ASSIGNED (drivers — push may be off)
```

**Verification:**
```bash
cd apps/web && npx tsc --noEmit
# No errors in generatePlaybookInstance.ts or notifications.ts
```

---

### Task 4 — Service: `computeDispatchReadiness`

**Wave:** 2 (parallel with Task 3)  
**Depends on:** Task 1 (Prisma types)  

**Files to CREATE:**
```
apps/web/src/server/services/workflows/
  computeDispatchReadiness.ts   (~120 lines)
```

**Service signature:**

```typescript
export async function computeDispatchReadiness(instanceId: string): Promise<{
  isReady: boolean;
  blockers: StepInstance[];
}>
```

**Implementation steps:**

1. Load instance via `findUniqueOrThrow({ where: { id: instanceId }, include: { stepInstances: true } })`.
2. Compute `completionPercent = (COMPLETE + SKIPPED count) / total * 100`. If total = 0, completionPercent = 100.
3. **CRITICAL:** Read `isDispatchBlocker` from `stepSnapshot` (immutable), NEVER from the live PlaybookStep template. Cast: `const snap = s.stepSnapshot as { isDispatchBlocker?: boolean }`.
4. `blockerSteps = stepInstances.filter(s => snap.isDispatchBlocker === true)`.
5. `openBlockers = blockerSteps.filter(s => s.status in [NOT_STARTED, IN_PROGRESS, FAILED])`.
6. `isReady = openBlockers.length === 0`.
7. Compute status: COMPLETED if completionPercent=100; BLOCKED if !isReady; IN_PROGRESS if completeCount>0; else NOT_STARTED.
8. Persist update to PlaybookInstance: `{ completionPercent, isDispatchReady: isReady, status }`.
9. **DISPATCH_READY notification:** fire ONLY when `wasReady === false && isReady === true` (strict false→true flip gate, no spam on repeated calls).
10. Aggregate entity-level readiness: query all non-COMPLETED instances for same (entityId, tenantId). Entity is ready only when ALL are ready. Update `User.isDispatchReady` (DRIVER) or `Truck.isDispatchReady` (VEHICLE). Skip PARTNER, DISPATCH, OTHER.
11. Return `{ isReady, blockers: openBlockers }`.

**Edge case:** if instance has zero blocker steps → `isReady=true`, `blockers=[]`.

**Verification:**
```bash
cd apps/web && npx tsc --noEmit
# No errors in computeDispatchReadiness.ts
```

---

### Task 5 — Service: `completeStep`

**Wave:** 2 (parallel with Tasks 3–4)  
**Depends on:** Task 1 (Prisma types), Task 4 (computeDispatchReadiness import)  

**Files to CREATE:**
```
apps/web/src/server/services/workflows/
  completeStep.ts   (~160 lines)
  skipStep.ts       (~60 lines)
```

**Service signatures:**

```typescript
// completeStep — note: tenantId added beyond spec (required for Document creation)
export async function completeStep(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  result: StepResult;
}): Promise<StepInstance>

export async function skipStep(args: {
  stepInstanceId: string;
  userId: string;
  tenantId: string;
  reason: string;
}): Promise<StepInstance>
```

**completeStep implementation:**

1. Load step via `findFirst({ where: { id: stepInstanceId, playbookInstance: { tenantId } }, include: { playbookInstance: true } })`. Throw `NOT_FOUND` if missing. Throw `BAD_REQUEST` if already COMPLETE or SKIPPED.
2. Cast `stepSnapshot` to get `stepType` and `documentTypeName`.
3. **Type-specific validation** (all throw `TRPCError` with specific message, not generic 400):

| stepType | Validation | Error message |
|----------|-----------|---------------|
| DOCUMENT_UPLOAD | `result.fileUrls` non-empty | `'MISSING_FILES'` |
| SIGNATURE | `result.signatureUrl` non-empty string | `'MISSING_SIGNATURE'` |
| FORM_FILL | `result.formData` is non-null object | `'INVALID_FORM'` |
| INSPECTION_ITEM | `passOrFail === 'pass'` only; fail rejects | `'USE_FAIL_ENDPOINT'` |
| TRAINING_ACK | `result.acknowledged` truthy OR `result.note` present | `'MISSING_ACK'` |
| APPROVAL | No extra validation at service layer (role guard at tRPC) | — |
| THIRD_PARTY | `result.note` non-empty OR `result.fileUrls` non-empty | `'MISSING_EVIDENCE'` |
| CUSTOM_NOTE | `result.note` non-empty | `'MISSING_NOTE'` |

4. Update step: `status=COMPLETE`, `completedByUserId=userId`, `completedAt=now()`, `result`.
5. **DOCUMENT_UPLOAD side effect:** create `prisma.document.create({ data: { tenantId, driverId: entityType=DRIVER ? entityId : null, truckId: entityType=VEHICLE ? entityId : null, fileName: documentTypeName ?? 'Document', s3Key: result.fileUrls[0], ... } })`. Best-effort — step is still COMPLETE even if this fails.
6. Call `computeDispatchReadiness(playbookInstanceId)`.
7. Notify next `NOT_STARTED` assignee via `sendStepAssigned` — best-effort.
8. Return updated StepInstance.

**Verification:**
```bash
cd apps/web && npx tsc --noEmit
# No errors in completeStep.ts or skipStep.ts
```

---

### Task 6 — tRPC Routers: `instance` + `stepInstance`

**Wave:** 3  
**Depends on:** Tasks 2, 3, 4, 5 (Zod schemas + all three services)  

**Files to CREATE:**
```
apps/web/src/server/api/routers/workflows/
  instance.ts       (~140 lines)
  stepInstance.ts   (~120 lines)
```

**Files to MODIFY:**
```
apps/web/src/server/api/routers/workflows/index.ts   (+4 lines) — import + mount instance + stepInstance routers
```

**Files NOT to touch:**
```
- trigger.ts — Phase 4
- stepTemplate.ts, playbook.ts — Phase 1, already exists
```

**instance router procedures (5 total):**

```
generate         adminProcedure     Input: generateInstanceSchema
                                    Action: calls generatePlaybookInstance, triggeredBy='manual'
                                    Returns: created PlaybookInstance with stepInstances

list             tenantMemberProcedure  Input: listInstancesSchema (cursor pagination)
                                    Where: tenantId=ctx.tenantId, optional status/entityType/entityId
                                    Sort: BLOCKED first (in-memory after fetch), then by createdAt desc
                                    Include: stepInstances { id, status, dueDate }
                                    Returns: { instances, nextCursor }

get              tenantMemberProcedure  Input: { id: z.string().uuid() }
                                    Where: id + tenantId=ctx.tenantId
                                    Throw NOT_FOUND if missing
                                    Include: stepInstances
                                    Resolve skippedByUserId display names (secondary query with RLS bypass)
                                    Returns: { ...instance, skippedByUsers: Record<id, { fullName }> }

getForEntity     tenantMemberProcedure  Input: getForEntitySchema
                                    Where: tenantId, entityType, entityId
                                    OrderBy: createdAt desc
                                    Include: stepInstances { id, status }
                                    Returns: PlaybookInstance[]

computeReadiness adminProcedure     Input: { instanceId: z.string().uuid() }
                                    Verify tenant ownership first (findFirst with tenantId)
                                    Throw NOT_FOUND if not owned
                                    Action: calls computeDispatchReadiness(instanceId)
                                    Returns: { isReady, blockers }
```

**stepInstance router procedures (3 total — Phase 2 subset):**

```
complete   tenantMemberProcedure  Input: completeStepSchema
                                  Action: calls completeStep({ stepInstanceId, userId: ctx.userId,
                                          tenantId: ctx.tenantId, result })
                                  Returns: updated StepInstance

skip       adminProcedure         Input: skipStepSchema
                                  Action: calls skipStep({ stepInstanceId, userId: ctx.userId,
                                          tenantId: ctx.tenantId, reason })
                                  Returns: updated StepInstance

getForDriver tenantMemberProcedure  Input: getForDriverSchema
                                  Where: assignedUserId=ctx.userId, status IN [NOT_STARTED, IN_PROGRESS],
                                         playbookInstance.tenantId=ctx.tenantId, cursor pagination
                                  OrderBy: dueDate asc
                                  Include: playbookInstance { id, entityType, entityId, playbookSnapshot }
                                  Returns: { steps, nextCursor }
```

**Phase 3 procedures (add stubs with TODO comments, NOT wired):**
```typescript
// TODO(phase-3): fail procedure — stepInstance.fail — calls failInspectionItem service
// TODO(phase-3): requestApproval procedure — moves APPROVAL step to IN_PROGRESS
// TODO(phase-3): approve procedure — dispatcher approves mechanic sign-off
```

**index.ts update:**
```typescript
import { instanceRouter } from './instance';
import { stepInstanceRouter } from './stepInstance';

export const workflowsRouter = router({
  stepTemplate: stepTemplateRouter,
  playbook: playbookRouter,
  instance: instanceRouter,
  stepInstance: stepInstanceRouter,
  // TODO(phase-4): trigger: triggerRouter
});
```

**Verification:**
```bash
cd apps/web && npx tsc --noEmit
# No errors in instance.ts, stepInstance.ts, or index.ts
```

---

### Task 7 — Web: Active Work Board + Start Checklist Dialog

**Wave:** 4  
**Depends on:** Task 6 (tRPC procedures available)  

**Goal:** Surface the Active Work Board swimlanes at the top of `/checklists` and the "Start Checklist" modal. The Work Board was a `TODO(phase-2)` block in Phase 1.

**Files to CREATE:**
```
apps/web/src/app/(owner)/checklists/_components/
  WorkBoardSection.tsx       (~180 lines)  — three swimlane columns
  StartChecklistDialog.tsx   (~100 lines)  — playbook selector + entity picker modal
```

**Files to MODIFY:**
```
apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx
  — remove TODO(phase-2) comment block
  — add instanceData query: trpc.workflows.instance.list.queryOptions({ take: 20 })
  — render <WorkBoardSection> above Playbook library
  — render <StartChecklistDialog> triggered by "Start Checklist" button
```

**Files NOT to touch:**
```
- PlaybookCard.tsx, CreatePlaybookCard.tsx, EntityTypeFilterTabs.tsx — Phase 1, already exists
- /checklists/instances/ — Task 8
- /checklists/automation/ — Phase 4
```

**WorkBoardSection behavior:**

Three swimlane columns, rendered ONLY when `instances.length > 0`. When 0 instances: show empty state `"When you start a checklist, it'll show up here."` — no columns rendered at all.

Classification logic (per instance):
```
'attention': status=BLOCKED OR (status=IN_PROGRESS AND has step with status≠COMPLETE/SKIPPED AND dueDate < now())
'progress':  status=IN_PROGRESS AND no overdue non-complete steps
'completed': status=COMPLETED AND completedAt >= today midnight UTC
```

Instances not matching any bucket are not rendered.

Column layout (desktop): `grid grid-cols-3 gap-4`. Each column:
```html
<div class="rounded-lg border {left-border-class} {bg-class} p-4">
  <h3 class="text-sm font-semibold mb-3">{column label}</h3>
  {cards or empty column placeholder}
</div>
```

Card content:
- Entity name (linked to entity profile page)
- Playbook name + icon from `playbookSnapshot.name`
- Circular SVG completion ring with `{completionPercent}%` text center
- Next/overdue step label in muted text (first non-COMPLETE/SKIPPED step name from stepSnapshot)
- Single action button: `<Button variant="outline">View Checklist</Button>` → `/checklists/instances/[id]`

Sort within each bucket: `openBlockers first (BLOCKED instances top), then by updatedAt desc`.

**StartChecklistDialog:**
- Modal with shadcn/ui `<Dialog>`
- Step 1: Playbook selector — `trpc.workflows.playbook.list` grouped by entityType
- Step 2: Entity picker — shows appropriate entity list (drivers for DRIVER playbooks, trucks for VEHICLE, etc.)
- Submit: calls `trpc.workflows.instance.generate.mutate(...)`, closes dialog, invalidates instance list

**Verification:**
```bash
# Manual: open /checklists in browser
# - With 0 instances: shows "When you start a checklist, it'll show up here." (no swimlane columns)
# - Click "Start Checklist" → dialog opens with playbook selector
# - Start a checklist → Work Board swimlanes appear with 1 instance in correct column
cd apps/web && npx tsc --noEmit   # exit 0
```

---

### Task 8 — Web: Active Checklist Detail

**Wave:** 4 (parallel with Task 7)  
**Depends on:** Task 6 (tRPC procedures available)  

**Goal:** Build `/checklists/instances/[id]` — the full step-by-step view of a running Active Checklist with dispatch readiness banner, collapsible phase sections, and step action buttons.

**Files to CREATE:**
```
apps/web/src/app/(owner)/checklists/instances/[id]/
  page.tsx                          (~15 lines)  — server wrapper
  _components/
    ChecklistDetailClient.tsx        (~280 lines) — main "use client" component
```

**Files NOT to touch:**
```
- /checklists/playbooks/ — Phase 1 builder
- /checklists/_components/ — Task 7
```

**ChecklistDetailClient layout:**

**Header card** (shadcn/ui `<Card>`):
- Back arrow → `/checklists`
- Entity name (linked to entity profile) + playbook name from `playbookSnapshot.name`
- Status badge: `NOT_STARTED` (muted), `IN_PROGRESS` (yellow), `COMPLETED` (green), `BLOCKED` (red destructive)
- Circular SVG completion ring with `{completionPercent}%`
- Dispatch readiness banner:
  - `isDispatchReady=true`: `<ShieldCheck className="text-green-600" />` "Dispatch Ready"
  - `isDispatchReady=false` + blockers: `<AlertTriangle className="text-red-500" />` "Blocked — {N} steps required" listing step names from stepSnapshot

**Phase sections** (Radix `<Collapsible>`, default open):
```
Section label: "{phaseLabel} ({completeCount}/{total} complete)"
ChevronDown icon rotates on toggle
Groups stepInstances by playbookPhase from stepSnapshot
Phase order: PRE_START → DAY_1 → WEEK_1 → ONGOING → NONE (labeled "Ungrouped")
```

**Step rows:**
```
Left:  status icon (CheckCircle2/XCircle/Minus/Circle/Loader2), step name from stepSnapshot
Mid:   assignee role badge, due date (red text if overdue)
Right: result summary (truncated to 40 chars), contextual action button
```

**Action button by status × user role** (spec Section 8.3):

| Step status | Is assignee? | Button |
|-------------|-------------|--------|
| NOT_STARTED | yes | `"Start"` / `"Upload"` (DOCUMENT_UPLOAD) / `"Fill Out"` (FORM_FILL) / `"Sign Now"` (SIGNATURE) |
| COMPLETE | any | `"View Result"` (outline) |
| FAILED | any | `"View Issue"` (destructive) |
| SKIPPED | any | Muted text `"Skipped — {reason}"` |
| IN_PROGRESS + APPROVAL | approver role | `"Review & Approve"` |

Admin overflow menu (`<DropdownMenu>`): "Skip" option on every step row → opens skip dialog with required reason textarea.

Skip dialog: `<Dialog>` with `<Textarea placeholder="Reason for skipping...">` → calls `trpc.workflows.stepInstance.skip.mutate`.

**Verification:**
```bash
# Manual: navigate to /checklists/instances/[id] (use an instance ID from DB or Start Checklist flow)
# - Header shows playbook name, status badge, completion ring
# - Dispatch readiness banner shows correct state
# - Phase sections collapse/expand
# - Step rows show correct action buttons
# - Skip dialog opens and calls skip procedure
cd apps/web && npx tsc --noEmit   # exit 0
```

---

### Task 9 — Web: Profile Tabs + `isDispatchReady` Badge

**Wave:** 4 (parallel with Tasks 7–8)  
**Depends on:** Task 6 (getForEntity tRPC available)  

**Goal:** Add a Checklists section to Driver, Truck, and Customer (Partner) profile pages. Add `isDispatchReady` badge to the Driver header (display only — not enforced).

**Files to MODIFY:**
```
apps/web/src/app/(owner)/drivers/[id]/page.tsx    (+~40 lines)
apps/web/src/app/(owner)/trucks/[id]/page.tsx     (+~40 lines)
apps/web/src/app/(owner)/crm/[id]/page.tsx        (+~40 lines)
```

**Files NOT to touch:**
```
- Dispatch enforcement / blocking on non-ready drivers — Phase 4
- Any other page outside these three
```

**Driver profile additions:**

1. In the page server component, fetch: `trpc.workflows.instance.getForEntity({ entityType: 'DRIVER', entityId: driverId })` via `caller` (server-side tRPC caller pattern — see existing page for pattern). Non-blocking: wrap in try/catch, page renders without checklists if this fails.

2. In the driver header section, add `isDispatchReady` badge (display only):
```tsx
{driver.isDispatchReady ? (
  <Badge className="bg-green-100 text-green-800 border-green-200">
    <ShieldCheck className="w-3 h-3 mr-1" /> Dispatch Ready
  </Badge>
) : (
  <Badge variant="outline" className="text-muted-foreground">
    Not Dispatch Ready
  </Badge>
)}
```

3. Append "Checklists" section near bottom of page:
```tsx
<div className="mt-6">
  <h2 className="text-lg font-semibold mb-4">Checklists</h2>
  {instances.length === 0 ? (
    <p className="text-muted-foreground text-sm">No checklists started for this driver yet.</p>
  ) : (
    <div className="space-y-2">
      {instances.map(instance => {
        const snap = instance.playbookSnapshot as { name?: string };
        return (
          <div key={instance.id} className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="font-medium text-sm">{snap.name ?? 'Checklist'}</p>
              <p className="text-xs text-muted-foreground">
                {instance.status} · {Math.round(instance.completionPercent)}% complete
              </p>
            </div>
            <Link href={`/checklists/instances/${instance.id}`}
                  className="text-sm text-primary hover:underline">View</Link>
          </div>
        );
      })}
    </div>
  )}
</div>
```

**Truck and Customer profiles:** Same pattern, `entityType: 'VEHICLE'` / `entityType: 'PARTNER'` respectively. No `isDispatchReady` badge on Customer profile (Partners don't dispatch per spec Section 5.3).

**Verification:**
```bash
# Manual: open a driver profile → "Checklists" section visible at bottom
# Manual: open a truck profile → same
# Manual: open a customer profile → same
# isDispatchReady badge visible on driver header (green or muted depending on DB state)
cd apps/web && npx tsc --noEmit   # exit 0
```

---

### Task 10 — Mobile REST Endpoints

**Wave:** 3 (parallel with Task 6)  
**Depends on:** Tasks 3, 4, 5 (service layer available)  

**Goal:** Create mobile REST endpoints that the driver app calls. Mobile uses Bearer token auth (not tRPC). All routes under `apps/web/src/app/api/mobile/driver/tasks/`.

**Files to CREATE:**
```
apps/web/src/app/api/mobile/driver/tasks/
  route.ts                          (~60 lines)  — GET open steps for authenticated driver
  [id]/
    complete/route.ts               (~50 lines)  — POST complete a step (calls completeStep service)
    skip/route.ts                   (~50 lines)  — POST skip a step (dispatcher-only action)
    upload-photo/route.ts           (~60 lines)  — POST generate presigned S3 URL for photo/file upload
```

**Files NOT to touch:**
```
- Any existing mobile API routes
- tRPC routers — separate layer
```

**GET /api/mobile/driver/tasks:**
```typescript
export const GET = withMobileAuth(async (req, { auth }) => {
  const { userId, tenantId } = auth;
  // RLS bypass needed (mobile Bearer auth pattern)
  const stepInstances = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.stepInstance.findMany({
      where: {
        assignedUserId: userId,
        status: { in: ['NOT_STARTED', 'IN_PROGRESS'] },
        playbookInstance: { tenantId },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        playbookInstance: {
          select: { id: true, entityType: true, entityId: true, playbookSnapshot: true },
        },
      },
    });
  }, TX_OPTIONS);
  return NextResponse.json({ stepInstances });
}, { allowedRoles: ['DRIVER'] });
```

**POST /api/mobile/driver/tasks/[id]/complete:**
```typescript
// Parses body as { result: StepResult }, calls completeStep service
// Returns 200 { stepInstance } on success
// Returns 400 with { error: message } on type-validation failure
```

**POST /api/mobile/driver/tasks/[id]/skip:**
```typescript
// Parses body as { reason: string }, calls skipStep service
// Restricted to DISPATCHER/MANAGER — drivers cannot self-skip
// Returns 403 if DRIVER role attempts skip
```

**POST /api/mobile/driver/tasks/[id]/upload-photo:**
```typescript
// Parses body as { fileName: string, contentType: string }
// Calls generateUploadUrl() from @/lib/storage/presigned.ts
// Returns { uploadUrl, s3Key } for client-side direct S3 PUT
```

**Verification:**
```bash
# TypeScript only (no running server needed)
cd apps/web && npx tsc --noEmit
# Check: all 4 route files compile without errors
# Manual (optional): curl -H "Authorization: Bearer <token>" http://localhost:3000/api/mobile/driver/tasks
# Expected: { stepInstances: [] } if no open tasks
```

---

### Task 11 — Mobile: My Tasks Screen + Task Action Screens

**Wave:** 5  
**Depends on:** Task 10 (REST endpoints exist)  

**Goal:** Build the My Tasks tab for the driver portal and the three task action screens (Document Upload, Form Fill, Signature). Wire via `TaskActionDispatcher` by `stepType`.

**Files to CREATE:**
```
apps/mobile/components/driver/workflows/
  MyTasksScreen.tsx          (~200 lines)  — feed of open tasks with summary bar + badge
  DocumentUploadScreen.tsx   (~180 lines)  — camera/library + S3 upload
  FormFillScreen.tsx         (~220 lines)  — dynamic form from stepSnapshot.formSchema
  SignatureScreen.tsx        (~180 lines)  — PanResponder canvas + PNG upload
  TaskActionDispatcher.tsx   (~60 lines)   — routes to correct screen by stepType

apps/mobile/app/(driver)/tasks/
  index.tsx                  (~15 lines)   — renders <MyTasksScreen />
  [id].tsx                   (~15 lines)   — renders <TaskActionScreen stepInstanceId={id} />
```

**Files to MODIFY:**
```
apps/mobile/app/(driver)/_layout.tsx   — add Tasks tab (Tab 5) with badge
```

**Files NOT to touch:**
```
- InspectionModeScreen.tsx — Phase 3
- Any existing driver screens (loads, map, messages, etc.)
```

**MyTasksScreen:**

```
Summary bar: "N of M tasks complete today" + thin animated progress bar (Animated.Value width)
FlashList of open StepInstances, one card per step:
  - Context label (muted): "{playbookSnapshot.name} · {entity label}" 
  - Step name (large bold) from stepSnapshot.name
  - Instruction (truncated 1 line, tap to expand) from stepSnapshot.description
  - Due badge: green "Due Today" / yellow "Due Tomorrow" / red "Overdue" (based on dueDate vs today)
  - Full-width action button, minHeight: 56 → navigates to /tasks/[stepInstance.id]
Empty state: "You're all caught up. No open tasks right now."
Polling: useFocusEffect + 30s interval (matches message polling pattern)
Badge count: shown on tab bar — count of open (NOT_STARTED + IN_PROGRESS) steps
```

**TaskActionDispatcher:**
```typescript
// Reads stepType from stepSnapshot
// stepType → screen component:
//   DOCUMENT_UPLOAD → <DocumentUploadScreen />
//   FORM_FILL       → <FormFillScreen />
//   SIGNATURE       → <SignatureScreen />
//   INSPECTION_ITEM → <InspectionModeScreen /> (Phase 3 placeholder, show "Coming soon" for now)
//   TRAINING_ACK    → show simple acknowledgment button (inline, no dedicated screen)
//   APPROVAL        → show read-only step info (dispatcher action, not driver)
//   THIRD_PARTY     → <FormFillScreen /> with note-only simplified view
//   CUSTOM_NOTE     → <FormFillScreen /> with note-only simplified view
// Back-press confirmation: "Exit this task? Your progress will be lost." (only if unsaved input)
```

**DocumentUploadScreen:**
```
Full-screen (not modal). SafeAreaView.
Step name (large bold, text-2xl), instruction text, document type label from stepSnapshot.defaultConfig.documentTypeName
Upload area: dashed border box minHeight:200, "Tap to take a photo or choose from files"
  - Camera option: expo-image-picker (launchCameraAsync)
  - Files option: expo-document-picker
  - Shows thumbnail preview after selection
"Submit Document" button: disabled until file selected, minHeight:56
  - On press: POST to upload-photo endpoint to get presigned URL → PUT to S3 → POST to complete endpoint
  - Inline success checkmark on completion
```

**FormFillScreen:**
```
Full-screen form from stepSnapshot.formSchema (array of field definitions).
Field type → component:
  boolean  → full-width YES/NO button pair (TouchableOpacity, each minHeight:56)
  date     → @react-native-community/datetimepicker or expo DateTimePicker
  select   → existing BottomSheet picker (list of options)
  text     → large TextInput, auto-scroll on keyboard show
"Submit Form" button: validates required fields, inline error per field on blur. minHeight:56
```

**SignatureScreen:**
```
Full-screen. SafeAreaView.
Step name (large bold), instruction.
Signature canvas: full-width, minHeight:200
  - PanResponder for draw tracking (builds SVG path from PanResponder gesture state)
  - Uses ref + captureRef (react-native-view-shot or expo-modules equivalent) to export PNG
"Clear" button top-right (TouchableOpacity minHeight:44 — not primary action)
"I confirm and sign" button: full-width primary, minHeight:56
  - On press: capture canvas as PNG → upload to S3 via presigned URL → POST to complete endpoint
  - Confirmation shows signed timestamp
```

**Tasks tab in `_layout.tsx`:**
```tsx
// Tab 5 (after Documents, before More)
<Tabs.Screen
  name="tasks"
  options={{
    title: 'Tasks',
    tabBarIcon: ({ color }) => <CheckSquare size={24} color={color} />,
    tabBarBadge: openTaskCount > 0 ? openTaskCount : undefined,
  }}
/>
// openTaskCount: loaded via GET /api/mobile/driver/tasks, polled on focus
```

**Verification:**
```bash
# Android emulator only (MMKV, camera native modules)
# 1. cd apps/mobile && npx expo start
# 2. Open driver portal → Tasks tab (5th tab)
# 3. Badge shows open task count
# 4. Tap a task → TaskActionDispatcher routes to correct screen
# 5. Complete a DOCUMENT_UPLOAD or FORM_FILL step → navigates back, badge decrements
cd apps/mobile && npx tsc --noEmit   # exit 0 (if configured)
```

---

### Task 12 — Tests: Phase 2 Coverage

**Wave:** 6  
**Depends on:** Tasks 1–11  

**Per spec Section 15, Phase 2 — all 4 checks required for DoD:**

**Files to CREATE:**
```
apps/web/src/__tests__/
  workflows-instance.test.ts        (~60 lines)
  workflows-complete-step.test.ts   (~120 lines)

apps/mobile/tests/
  workflows-tap-targets.test.ts     (~80 lines)
```

**12a. TypeScript check (automated):**
```bash
cd apps/web && npx tsc --noEmit       # must exit 0
cd packages/validation && npx tsc --noEmit   # must exit 0
```

**12b. Snapshot immutability test (`workflows-instance.test.ts`):**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
// Mock prisma and send-push (unit test — no DB)
vi.mock('@/lib/db/prisma', () => ({ prisma: { ... } }));

test('snapshot immutability: mutating source Playbook does not affect playbookSnapshot', async () => {
  // Generate instance → record playbookSnapshot.name
  // Update Playbook.name in DB
  // Reload instance → assert playbookSnapshot.name unchanged
});

test('readiness with zero blockers returns isReady=true', async () => {
  // Create instance where NO step has isDispatchBlocker=true in stepSnapshot
  // Call computeDispatchReadiness
  // Assert: { isReady: true, blockers: [] }
});
```

**12c. completeStep type-validation tests (`workflows-complete-step.test.ts`):**

One test per StepType (8 tests total), each asserting:
(a) valid input completes the step, (b) invalid input rejects with specific error code (not generic 400).

```typescript
import { describe, it, expect, vi } from 'vitest';

// Mock prisma.stepInstance.findFirst to return stub step with given stepType in stepSnapshot
// Mock prisma.stepInstance.update to return updated step
// Mock computeDispatchReadiness

const CASES: Array<{ stepType: string; validResult: StepResult; invalidResult: StepResult; errorCode: string }> = [
  { stepType: 'DOCUMENT_UPLOAD', validResult: { fileUrls: ['s3://x'] }, invalidResult: {}, errorCode: 'MISSING_FILES' },
  { stepType: 'SIGNATURE',       validResult: { signatureUrl: 'https://s3/sig.png' }, invalidResult: {}, errorCode: 'MISSING_SIGNATURE' },
  { stepType: 'FORM_FILL',       validResult: { formData: { name: 'John' } }, invalidResult: { formData: null as any }, errorCode: 'INVALID_FORM' },
  { stepType: 'INSPECTION_ITEM', validResult: { passOrFail: 'pass' }, invalidResult: { passOrFail: 'fail' }, errorCode: 'USE_FAIL_ENDPOINT' },
  { stepType: 'TRAINING_ACK',    validResult: { acknowledged: true }, invalidResult: {}, errorCode: 'MISSING_ACK' },
  { stepType: 'APPROVAL',        validResult: { note: 'approved' }, invalidResult: {}, errorCode: null as any /* no validation */ },
  { stepType: 'THIRD_PARTY',     validResult: { note: 'receipt attached' }, invalidResult: {}, errorCode: 'MISSING_EVIDENCE' },
  { stepType: 'CUSTOM_NOTE',     validResult: { note: 'custom note' }, invalidResult: {}, errorCode: 'MISSING_NOTE' },
];

describe.each(CASES)('completeStep: $stepType', ({ stepType, validResult, invalidResult, errorCode }) => {
  it('valid input: completes step', async () => {
    // setup mock, call completeStep with validResult, assert status=COMPLETE
  });
  if (errorCode) {
    it('invalid input: rejects with specific error code', async () => {
      // setup mock, call completeStep with invalidResult
      // assert throws TRPCError with message === errorCode
    });
  }
});
```

**12d. Mobile tap-target audit (`workflows-tap-targets.test.ts`):**

```typescript
/**
 * IMPORTANT: import vitest explicitly — no globals assumed.
 * apps/mobile has no vitest.config.ts with globals:true.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SCREENS_DIR = path.resolve(__dirname, '../components/driver/workflows');
const MIN_TAP_TARGET_PX = 56;
const HEIGHT_PATTERN = /height\s*:\s*(\d+)/g;

const AUDIT_FILES = [
  'MyTasksScreen.tsx',
  'DocumentUploadScreen.tsx',
  'FormFillScreen.tsx',
  'SignatureScreen.tsx',
];

describe('Mobile tap-target audit — workflow task screens', () => {
  AUDIT_FILES.forEach((fileName) => {
    it(`${fileName}: no Pressable/TouchableOpacity with height < ${MIN_TAP_TARGET_PX}px`, () => {
      const filePath = path.join(SCREENS_DIR, fileName);
      if (!fs.existsSync(filePath)) {
        console.warn(`SKIP: ${fileName} not found at ${filePath}`);
        return; // Skip gracefully if file doesn't exist yet
      }
      const source = fs.readFileSync(filePath, 'utf-8');
      const violations: Array<{ height: number; context: string }> = [];
      let match: RegExpExecArray | null;
      HEIGHT_PATTERN.lastIndex = 0;
      while ((match = HEIGHT_PATTERN.exec(source)) !== null) {
        const heightValue = parseInt(match[1], 10);
        if (heightValue <= 0 || heightValue >= MIN_TAP_TARGET_PX) continue;
        const contextStart = Math.max(0, match.index - 500);
        const context = source.slice(contextStart, match.index + 20);
        // Heuristic: is this height inside a Pressable/TouchableOpacity/Btn context?
        const isTouchable = /Pressable|TouchableOpacity|Btn/.test(context);
        if (isTouchable) {
          violations.push({ height: heightValue, context: context.slice(-100) });
        }
      }
      expect(violations).toEqual([]);
    });
  });
});
```

**Verification:**
```bash
cd apps/web && npx vitest run --reporter verbose
# workflows-instance.test.ts: 2 tests pass
# workflows-complete-step.test.ts: 8 tests pass (7 type-validation + 1 zero-blocker)

cd apps/mobile && npx vitest run tests/workflows-tap-targets.test.ts
# All 4 screen audits pass
```

---

## fireEvent TODOs — exact comment format

Add these comments at lifecycle call sites. Do NOT wire the function — only mark the spots:

```typescript
// Driver create action:
// TODO(phase-4): fireEvent('ON_DRIVER_CREATE', driver, tenantId)

// Truck create action:
// TODO(phase-4): fireEvent('ON_VEHICLE_CREATE', truck, tenantId)

// Dispatch/load status update action (on create):
// TODO(phase-4): fireEvent('ON_DISPATCH_CREATE', dispatch, tenantId)

// Dispatch depart transition:
// TODO(phase-4): fireEvent('ON_DISPATCH_DEPART', dispatch, tenantId)

// Dispatch deliver transition:
// TODO(phase-4): fireEvent('ON_DISPATCH_DELIVER', dispatch, tenantId)

// Customer/Partner create action:
// TODO(phase-4): fireEvent('ON_PARTNER_CREATE', customer, tenantId)
```

Locations to add these: `apps/web/src/actions/drivers.ts`, `apps/web/src/actions/trucks.ts` (or wherever create actions live — grep for `prisma.user.create` / `prisma.truck.create`), dispatch status update logic, `apps/web/src/actions/customers.ts`.

---

## Verification Criteria — Phase 2 DoD

These are the official checks per spec Section 14 Phase 2 and Section 16.5.

```
Phase 2 — Verification Report

DoD checks:
  [ ] 1. Dispatcher creates an Active Checklist via "Start Checklist" modal
         Click path: /checklists → "Start Checklist" → select Playbook → select entity →
         confirm → Work Board shows new card in In Progress column
         Evidence: screen recording or manual walkthrough note

  [ ] 2. Active Work Board swimlanes render on /checklists
         Evidence: BLOCKED instances in "Needs Attention" (red border),
         IN_PROGRESS in "In Progress" (yellow), COMPLETED today in "Completed Today" (green).
         Empty state shows when 0 instances (no columns rendered)

  [ ] 3. Active Checklist Detail page functional at /checklists/instances/[id]
         Evidence: phase sections collapsible; dispatch readiness banner shows correct state;
         step action buttons correct per status × role; Skip dialog works with reason

  [ ] 4. isDispatchReady badge on driver profile (display only, not enforced)
         Evidence: badge visible in driver header; green if isDispatchReady=true, muted if false

  [ ] 5. Checklists section on Driver, Truck, and Customer profiles
         Evidence: section appears on each profile page; links to instance detail pages;
         "No checklists" message when none exist

  [ ] 6. Mobile Tasks tab with badge count
         Evidence: Tasks tab (5th tab) visible in driver portal; badge shows count of open steps

  [ ] 7. Mobile task completion end-to-end (DOCUMENT_UPLOAD or FORM_FILL)
         Evidence: tap step on Tasks tab → correct screen renders; submit → step COMPLETE;
         badge count decrements; Work Board on web updates

  [ ] 8. snapshot immutability confirmed
         Evidence: workflows-instance.test.ts passes; mutating Playbook name does not change snapshot

  [ ] 9. computeDispatchReadiness reads from stepSnapshot, not live PlaybookStep
         Evidence: code review confirms cast pattern; workflows-instance.test.ts passes

  [ ] 10. completeStep validates all 8 StepTypes with specific error codes
          Evidence: workflows-complete-step.test.ts passes (8 tests)

Guardrails:
  [ ] typecheck (apps/web)                — npx tsc --noEmit → exit 0
  [ ] typecheck (packages/validation)     — npx tsc --noEmit → exit 0
  [ ] vitest (apps/web)                   — npx vitest run → all pass
  [ ] tap-target-audit (apps/mobile)      — workflows-tap-targets.test.ts passes (explicit imports)
  [ ] naming-lint                         — naming-lint.test.ts passes (no PlaybookInstance/StepInstance
                                            in .tsx text nodes) — inherited from Phase 1
  [ ] tenant-scoping-grep                 — all PlaybookInstance queries include tenantId;
                                            StepInstance queries scoped via playbookInstance.tenantId
  [ ] no-inspection-mode-code             — grep for failInspectionItem, stepInstance.fail → 0 results
                                            in new files (Phase 3 only)

Tech debt noted:
  - duplicate active instance (same entity + playbook) throws CONFLICT — allowMultiple field deferred
  - stepTemplate.update: cannot change stepType if instances exist — guard deferred to Phase 3
  - playbook.update: category/entityType lock once instances exist — deferred to Phase 3
  - signatureUrl validation: URL format only (not HTTPS-only) — acceptable for internal S3 URLs
  - All fireEvent call sites are TODO(phase-4) stubs — not wired yet
  - SMS for STEP_ASSIGNED deferred to Phase 3 — TODO(phase-3) comment in notifications.ts
  - STEP_OVERDUE cron/alerting deferred to Phase 3

Merge decision: [ ] ready / [ ] blocked
```

---

## Execution Notes

**Order of execution (recommended wave sequence):**

| Wave | Tasks | What it builds | Can parallelize? |
|------|-------|----------------|-----------------|
| 1 | T1 + T2 | Schema + Zod schemas | Yes — independent |
| 2 | T3 + T4 + T5 | Service layer (generate + readiness + complete) | Yes — independent logic |
| 3 | T6 + T10 | tRPC routers + mobile REST endpoints | Yes — parallel after Wave 2 |
| 4 | T7 + T8 + T9 | Web UI (Work Board + Detail + Profile tabs) | Yes — parallel after T6 |
| 5 | T11 | Mobile screens | Sequential — needs T10 endpoints |
| 6 | T12 | Tests | Sequential — needs all prior tasks |

**Before executing each task:**
1. Run `cd apps/web && npx tsc --noEmit` — must be green before starting
2. Run `cd apps/web && npx vitest run` — must be green before starting

**Key invariants to maintain throughout:**
- `isDispatchBlocker` is ALWAYS read from `stepSnapshot` in computeDispatchReadiness — never from the live PlaybookStep
- RLS bypass (`SELECT set_config('app.bypass_rls', 'on', TRUE)`) is required in all service transactions
- All PlaybookInstance queries must include `tenantId: ctx.tenantId` (or equivalent)
- StepInstance queries scope via `playbookInstance: { tenantId }` (StepInstance has no tenantId column)
- Mobile REST endpoints use `withMobileAuth` + always set RLS bypass in transactions
- Push notifications are best-effort — never throw, wrap in try/catch

**Commit message pattern (conventional commits):**
```
feat(workflows): add PlaybookInstance/StepInstance migration + schema
feat(workflows): add instance and stepInstance Zod schemas
feat(workflows): add generatePlaybookInstance service
feat(workflows): add computeDispatchReadiness service
feat(workflows): add completeStep + skipStep services
feat(workflows): add instance + stepInstance tRPC routers
feat(workflows): add Active Work Board swimlanes to /checklists
feat(workflows): add Active Checklist Detail page
feat(workflows): add Checklists tabs + isDispatchReady badge on profiles
feat(workflows): add mobile driver tasks REST endpoints
feat(workflows): add mobile My Tasks + task action screens
test(workflows): add Phase 2 snapshot + completeStep + tap-target tests
```

**If a task reveals a plan gap:** stop, document in `docs/tech-debt.md`, message the user before proceeding. Do not improvise scope.
