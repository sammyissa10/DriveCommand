# Phase 1 — Foundation
**Spec:** `docs/specs/DriveCommand_Workflow_Engine_v2.md` Section 14  
**DoD:** Admin creates a Playbook, adds steps from the Step Library, saves. No runtime.  
**Branch:** `feat/workflow-phase-1-foundation`  
**Output file:** `.gsd/phase-1-plan.md`

---

## Scope

| In | Out |
|----|-----|
| StepTemplate, Playbook, PlaybookStep models | PlaybookTrigger, PlaybookInstance, StepInstance, PlaybookNotification |
| stepTemplate tRPC router (list/create/update/archive) | instance, stepInstance, trigger routers |
| playbook tRPC router (list/get/create/update/addStep/removeStep/reorderSteps/duplicate/archive) | setTrigger / removeTrigger (Phase 4) |
| Playbook Builder — `/checklists/playbooks/[id]/edit` | Active Checklist Detail |
| Playbook card grid — `/checklists` (middle section only) | Work Board (top section) |
| 3 starter Playbooks seeded on tenant create | Auto-Start Rules page |
| Phase 1 tests per Section 15 | Mobile screens |

**Flag — Phase 2+ only:** `isDispatchReady` on Driver and Vehicle models. Do NOT touch
`apps/web/prisma/schema.prisma` Driver or Vehicle models. Mark integration points with
`// TODO(phase-2)` comments, nothing more.

---

## Codebase Conventions (read before building)

| Pattern | Where |
|---------|-------|
| UUID PK | `@id @default(dbgenerated("gen_random_uuid()")) @db.Uuid` |
| Tenant scope | `tenantId String @db.Uuid` + FK to `Tenant` + `@@index([tenantId, ...])` |
| Soft delete | `deletedAt DateTime? @db.Timestamptz` (filter `deletedAt: null` in queries) |
| Timestamps | `@db.Timestamptz` on all date fields |
| Mutations | `adminProcedure` (OWNER + MANAGER roles) |
| Queries | `tenantMemberProcedure` (any authenticated role) |
| Tenant id in ctx | `ctx.tenantId` — never accept tenantId from client input |
| Zod schemas | `packages/validation/src/workflows/` → import as `@drivecommand/validation` |
| tRPC error | `throw new TRPCError({ code: 'NOT_FOUND' | 'FORBIDDEN' | 'BAD_REQUEST' })` |
| Router mount | `apps/web/src/server/api/routers/workflows/index.ts` → merged into `root.ts` |

### Schema field-name notes (v2 spec → codebase)
The v2 spec uses canonical names; the codebase may use variants. These are the accepted
divergences — do NOT rename existing fields:

| v2 spec field | Codebase field | Where |
|--------------|----------------|-------|
| `EntityType` enum | `PlaybookEntityType` enum | `schema.prisma` |
| `PlaybookCategory.DRIVER_ONBOARDING` | `PlaybookCategory.ONBOARDING` | enum |
| `PlaybookCategory.PARTNER_ONBOARDING` | `PlaybookCategory.PARTNER` | enum |
| `PlaybookCategory.LOAD_CHECKLIST` | `PlaybookCategory.OPERATIONS` | enum |
| `PlaybookStep.phase` | `PlaybookStep.playbookPhase` | model + Zod |
| `StepTemplate.formSchema + documentTypeName + requiresPhoto + requiresSignature` | `StepTemplate.defaultConfig Json` | model — all type-specific config stored in one JSON blob |

When building, use the codebase field names. When writing user-facing UI copy, use only
the names from Section 3 of the spec (naming rules table).

---

## UI Design System — Playbook Builder

**Stack:** Next.js 15 App Router + Tailwind + shadcn/ui  
**Industry:** logistics / fleet SaaS  
**Style:** professional, minimal, dark-mode supported  

**Three-column layout (desktop):**
```
┌─────────────────────────────────────────────────────────────────┐
│ Left 280px fixed │     Center flex-1 (min-w-0)    │ Right 320px │
│ Playbook Details │     Canvas (step list)          │ Step Library│
│ auto-saves       │     phase dividers + drag rows  │ search+filter│
└─────────────────────────────────────────────────────────────────┘
```
Mobile: left panel collapses to an accordion header. Center and right stack vertically.

**Category tiles (left panel):** 6 tiles in a 3×2 grid, each 48×48px, icon + label,
`rounded-lg border-2`, selected state `border-primary bg-primary/10`.

**Canvas step row height:** min 56px, drag handle 24×24px, all interactive targets ≥44px.

**Step Library filter chips:** `Badge` variant `outline` when inactive, `default` when active.
Chip scroll: horizontal scroll row, `overflow-x-auto` on mobile.

**Color palette (8 swatches):**
`#3b82f6 #8b5cf6 #10b981 #f59e0b #ef4444 #06b6d4 #f97316 #6b7280`

**Phase dividers:** `bg-muted/40 border-b font-medium text-sm text-muted-foreground px-3 py-1`
Collapsible via Radix Collapsible, chevron rotates 90deg on open.

**Inline "Create New Step" form (right panel):** slides in to replace library list,
3 required fields (name, type, assignee), "Save Step" button creates + immediately adds to canvas.
No navigation to a separate page.

---

## Tasks

All tasks are independently executable and verifiable. Execute in order.
Each task ends with its verification command.

---

### Task 1 — Prisma Migration: `add_workflow_templates`

**Wave:** 1  
**Depends on:** nothing  

**Goal:** Add StepTemplate, Playbook, and PlaybookStep to the database with all Phase 1 enums.
No Phase 2+ models.

**Files to CREATE:**
```
apps/web/prisma/migrations/
  YYYYMMDDHHMMSS_add_workflow_templates/
    migration.sql                    (~120 lines)
```

**Files to MODIFY:**
```
apps/web/prisma/schema.prisma        (+~120 lines)
```

**Files NOT to touch:**
```
- Any existing model (Driver, Vehicle, Dispatch, Load, etc.)
- Any existing migration
- PlaybookTrigger, PlaybookInstance, StepInstance models — Phase 2+
```

**migration.sql — ordered sections:**

```sql
-- 1. Enums (safe: DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END; $$)
StepType:        DOCUMENT_UPLOAD FORM_FILL INSPECTION_ITEM SIGNATURE
                 TRAINING_ACK APPROVAL THIRD_PARTY CUSTOM_NOTE
AssigneeRole:    DRIVER DISPATCHER MECHANIC SAFETY_MANAGER THIRD_PARTY
PlaybookEntityType: DRIVER VEHICLE PARTNER DISPATCH OTHER
PlaybookCategory: ONBOARDING SAFETY OPERATIONS COMPLIANCE PARTNER CUSTOM VEHICLE_INSPECTION
PhaseType:       PRE_START DAY_1 WEEK_1 ONGOING NONE

-- 2. StepTemplate table
CREATE TABLE "StepTemplate" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  "stepType" "StepType" NOT NULL,
  "assigneeRole" "AssigneeRole" NOT NULL,
  "defaultConfig" JSONB NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "StepTemplate"("tenantId", "isActive");
CREATE INDEX ON "StepTemplate"("tenantId", "stepType");
-- RLS: ENABLE ROW LEVEL SECURITY; bypass policy for service_role; tenant policy

-- 3. Playbook table
CREATE TABLE "Playbook" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  "entityType" "PlaybookEntityType" NOT NULL,
  category "PlaybookCategory" NOT NULL,
  "playbookPhase" "PhaseType" NOT NULL DEFAULT 'NONE',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMPTZ,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON "Playbook"("tenantId", "isActive");
CREATE INDEX ON "Playbook"("tenantId", "entityType");
-- RLS policies

-- 4. PlaybookStep join table
CREATE TABLE "PlaybookStep" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "playbookId" UUID NOT NULL REFERENCES "Playbook"(id) ON DELETE CASCADE,
  "stepTemplateId" UUID NOT NULL REFERENCES "StepTemplate"(id) ON DELETE RESTRICT,
  sequence INT NOT NULL,
  "playbookPhase" "PhaseType" NOT NULL DEFAULT 'NONE',
  "overrideConfig" JSONB NOT NULL DEFAULT '{}',
  "isRequired" BOOLEAN NOT NULL DEFAULT true,
  "isDispatchBlocker" BOOLEAN NOT NULL DEFAULT false,
  "dueDaysFromStart" INT,
  "dueBeforeDispatch" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE("playbookId", sequence)
);
CREATE INDEX ON "PlaybookStep"("playbookId");
CREATE INDEX ON "PlaybookStep"("stepTemplateId");
-- RLS policies
```

**schema.prisma additions** (append in alphabetical order where schema does):

```prisma
// Enums: AssigneeRole, PhaseType, PlaybookCategory, PlaybookEntityType, StepType
// Models: StepTemplate, Playbook, PlaybookStep
// Relations on Tenant: stepTemplates StepTemplate[], playbooks Playbook[]
```

**Verification:**
```bash
cd apps/web && npx prisma validate
# Must exit 0, no errors, no warnings about relations
```

---

### Task 2 — Zod Validation Schemas

**Wave:** 1 (parallel with Task 1)  
**Depends on:** nothing (schemas are spec-derived, no DB dependency)  

**Files to CREATE:**
```
packages/validation/src/workflows/
  enums.ts          (~60 lines)   — stepTypeSchema, assigneeRoleSchema, playbookEntityTypeSchema,
                                     playbookCategorySchema, phaseTypeSchema
  stepTemplate.ts   (~50 lines)   — createStepTemplateSchema, updateStepTemplateSchema
  playbook.ts       (~80 lines)   — createPlaybookSchema, updatePlaybookSchema,
                                     addStepSchema, removeStepSchema,
                                     updatePlaybookStepSchema, reorderStepsSchema
  index.ts          (~15 lines)   — re-exports all of the above
```

**Files to MODIFY:**
```
packages/validation/src/index.ts   (+3 lines) — export * from './workflows'
```

**Files NOT to touch:**
```
- instance.ts, stepInstance.ts, trigger.ts — Phase 2+
- Any existing validation schemas (driver, vehicle, load, etc.)
```

**Schema shapes (key constraints):**

```typescript
// enums.ts
export const stepTypeSchema = z.enum([
  'DOCUMENT_UPLOAD','FORM_FILL','INSPECTION_ITEM','SIGNATURE',
  'TRAINING_ACK','APPROVAL','THIRD_PARTY','CUSTOM_NOTE'
]);
export const assigneeRoleSchema = z.enum([
  'DRIVER','DISPATCHER','MECHANIC','SAFETY_MANAGER','THIRD_PARTY'
]);
export const phaseTypeSchema = z.enum(['PRE_START','DAY_1','WEEK_1','ONGOING','NONE']);
export const playbookEntityTypeSchema = z.enum([
  'DRIVER','VEHICLE','PARTNER','DISPATCH','OTHER'
]);
export const playbookCategorySchema = z.enum([
  'ONBOARDING','SAFETY','OPERATIONS','COMPLIANCE','PARTNER','CUSTOM','VEHICLE_INSPECTION'
]);

// stepTemplate.ts
export const createStepTemplateSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  stepType: stepTypeSchema,
  assigneeRole: assigneeRoleSchema,
  defaultConfig: z.record(z.string(), z.any()).optional().default({}),
});
export const updateStepTemplateSchema = createStepTemplateSchema
  .partial()
  .extend({ id: z.string().uuid() });

// playbook.ts
export const createPlaybookSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  entityType: playbookEntityTypeSchema,
  category: playbookCategorySchema,
});
export const addStepSchema = z.object({
  playbookId: z.string().uuid(),
  stepTemplateId: z.string().uuid(),
  playbookPhase: phaseTypeSchema.optional().default('NONE'),
  sequence: z.number().int().nonnegative().optional(),
  overrideConfig: z.record(z.string(), z.any()).optional().default({}),
});
export const reorderStepsSchema = z.object({
  playbookId: z.string().uuid(),
  steps: z.array(z.object({
    playbookStepId: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
  })),
});
```

**Verification:**
```bash
cd packages/validation && npx tsc --noEmit
# Must exit 0
```

---

### Task 3 — stepTemplate tRPC Router

**Wave:** 2  
**Depends on:** Task 1 (schema), Task 2 (Zod schemas)  

**Files to CREATE:**
```
apps/web/src/server/api/routers/workflows/
  stepTemplate.ts   (~120 lines)
```

**Files NOT to touch:**
```
- playbook.ts, instance.ts, stepInstance.ts, trigger.ts
- Any existing router outside workflows/
```

**Procedures (4 total — spec Section 7.1):**

```
list     tenantMemberProcedure  Input: { stepType?, assigneeRole? }
                                Where: tenantId=ctx.tenantId, isActive=true, deletedAt=null
                                Order: name asc
                                Returns: StepTemplate[]

create   adminProcedure         Input: createStepTemplateSchema
                                Sets: tenantId=ctx.tenantId
                                Returns: created StepTemplate

update   adminProcedure         Input: updateStepTemplateSchema
                                Guard: cannot change stepType if stepInstances exist (Phase 2+:
                                       skip this guard for Phase 1, leave TODO(phase-2) comment)
                                Returns: updated StepTemplate

archive  adminProcedure         Input: { id: z.string().uuid() }
                                Action: set isActive=false, deletedAt=now()
                                Guard: tenant ownership check
                                Returns: { success: true }
```

**Export pattern:**
```typescript
export const stepTemplateRouter = router({ list, create, update, archive });
```

**Verification:**
```bash
cd apps/web && npx tsc --noEmit
# No type errors in stepTemplate.ts or imports
```

---

### Task 4 — playbook tRPC Router + Router Merge

**Wave:** 2 (parallel with Task 3)  
**Depends on:** Task 1, Task 2  

**Files to CREATE:**
```
apps/web/src/server/api/routers/workflows/
  playbook.ts       (~200 lines)
  index.ts          (~20 lines)  — merges stepTemplate + playbook; instance/stepInstance/trigger
                                    imported only when those routers exist (Phase 2+)
```

**Files to MODIFY:**
```
apps/web/src/server/api/root.ts   (+2 lines) — import + mount workflowsRouter
```

**Files NOT to touch:**
```
- instance.ts, stepInstance.ts, trigger.ts — do not create these in Phase 1
- Any existing router (drivers, trucks, loads, etc.)
```

**Procedures (9 total — spec Section 7.2, Phase 1 subset):**

```
list            tenantMemberProcedure  Input: { entityType?: PlaybookEntityType }
                                       Returns: Playbook[] with _count.steps + _count.instances

get             tenantMemberProcedure  Input: { id }
                                       Returns: full Playbook with ordered steps (by playbookPhase,
                                                sequence), stepTemplate included, triggers: [] (empty
                                                until Phase 4), last 5 instances: [] (empty until Phase 2)

create          adminProcedure         Input: createPlaybookSchema
                                       Returns: created Playbook (no steps yet)

update          adminProcedure         Input: updatePlaybookSchema
                                       Guard: category + entityType locked once instances exist
                                              (TODO(phase-2) comment for now, no enforcement in Phase 1)
                                       Returns: updated Playbook

addStep         adminProcedure         Input: addStepSchema
                                       Logic: if sequence omitted → append (max sequence + 1)
                                              if sequence provided → insert + re-sequence
                                       Returns: created PlaybookStep with stepTemplate

removeStep      adminProcedure         Input: removeStepSchema { playbookId, stepId }
                                       Logic: delete + re-sequence remaining steps
                                       Returns: { success: true }

reorderSteps    adminProcedure         Input: reorderStepsSchema
                                       Logic: batch UPDATE sequences in transaction
                                       Guard: all stepIds must belong to playbookId + tenantId
                                       Returns: updated PlaybookStep[]

duplicate       adminProcedure         Input: { id }
                                       Logic: clone Playbook (new name: "[name] (copy)") +
                                              clone all PlaybookSteps; no triggers, no instances
                                       Returns: new Playbook

archive         adminProcedure         Input: { id }
                                       Action: soft delete (deletedAt=now(), isActive=false)
                                       Returns: { success: true }
```

**index.ts:**
```typescript
// Phase 1: stepTemplate + playbook only
// Phase 2+: instance, stepInstance will be added when those routers are created
import { router } from '@/server/api/trpc';
import { stepTemplateRouter } from './stepTemplate';
import { playbookRouter } from './playbook';

export const workflowsRouter = router({
  stepTemplate: stepTemplateRouter,
  playbook: playbookRouter,
});
```

**root.ts addition:**
```typescript
import { workflowsRouter } from './routers/workflows';
// in appRouter:
workflows: workflowsRouter,
```

**Verification:**
```bash
cd apps/web && npx tsc --noEmit
# Specifically: no errors in workflows/ routers or root.ts
```

---

### Task 5 — /checklists Page: Playbook Card Grid

**Wave:** 3  
**Depends on:** Task 3, Task 4 (tRPC available)  

**Goal:** Render the "Your Playbooks" middle section from spec Section 8.1.
No Work Board (top section). No Auto-Start Rules (bottom section). Both sections
are Phase 2 and Phase 4 respectively — leave them as clearly commented `{/* TODO(phase-2): Work Board */}` blocks.

**Files to CREATE:**
```
apps/web/src/app/(owner)/checklists/
  page.tsx                      (~30 lines)  — server component, dynamic, h1 + DashboardClient
  _components/
    DashboardClient.tsx          (~80 lines)  — "use client", tRPC query, filter tabs + grid
    PlaybookCard.tsx             (~60 lines)  — single card component
    CreatePlaybookCard.tsx       (~25 lines)  — dashed border "Create New Playbook" card
    EntityTypeFilterTabs.tsx     (~40 lines)  — All/Driver/Vehicle/Dispatch/Partner tabs
```

**Files NOT to touch:**
```
- /checklists/instances/ — Phase 2
- /checklists/automation/ — Phase 4
- /checklists/playbooks/ — separate task (Task 6)
- Any owner layout or nav files (unless adding the nav link — see below)
```

**Nav link:** Add "Checklists & Workflows" to the owner sidebar nav. Find the existing
nav config file (typically `apps/web/src/app/(owner)/_components/Sidebar.tsx` or similar)
and add the entry. Use the user-facing name "Checklists & Workflows", NOT "Workflow Template
Engine" (spec Section 3 naming rules).

**DashboardClient behavior:**
```
1. tRPC call: trpc.workflows.playbook.list.useQuery({ entityType: activeFilter })
2. Filter tabs: All (no entityType filter) / Driver / Vehicle / Dispatch / Partner
   - Tabs use PlaybookEntityType values
   - "All" tab shows all non-deleted playbooks for tenant
3. Grid layout: grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4
4. "Create New Playbook" card always first, never filtered
5. Loading state: skeleton grid (3–4 ghost cards matching PlaybookCard dimensions)
6. Empty state (0 playbooks after seed): 
   "We've built starter checklists for your fleet type. Import them?"
   with a single "Import Starter Checklists" button (calls seed route)
```

**PlaybookCard content (spec Section 8.1):**
```
- Category badge (PlaybookCategory display name, colored chip)
- Playbook name (font-semibold, truncate)
- Entity type icon (small, muted)
- Step count: "N steps"
- Active instance count: "N active" (0 in Phase 1 — placeholder)
- Last used: "Never" in Phase 1 (no instances exist)
- Click → navigate to /checklists/playbooks/[id]/edit
```

**Verification:**
```bash
# Manual: open /checklists in browser
# - Grid renders with correct layout
# - Filter tabs change displayed cards
# - "Create New Playbook" card always visible
# - Clicking a playbook card navigates to /checklists/playbooks/[id]/edit
# - No TypeScript errors: cd apps/web && npx tsc --noEmit
```

---

### Task 6 — Playbook Builder: Three-Column Layout

**Wave:** 3 (parallel with Task 5)  
**Depends on:** Task 3, Task 4  

**Files to CREATE:**
```
apps/web/src/app/(owner)/checklists/playbooks/
  new/
    page.tsx                    (~25 lines) — creates empty playbook → redirects to /[id]/edit
  [id]/
    page.tsx                    (~15 lines) — server component, loads playbook, passes to client
    edit/
      page.tsx                  (~15 lines) — server wrapper for BuilderClient
      _components/
        BuilderClient.tsx        (~120 lines) — three-column shell, state, auto-save
        LeftPanel.tsx            (~130 lines) — name, category tiles, entity type, icon, color, desc
        BuilderCanvas.tsx        (~100 lines) — ordered step list, phase sections, drag-and-drop
        PhaseSection.tsx         (~60 lines)  — collapsible section with divider + "Add Step" button
        BuilderStepRow.tsx       (~90 lines)  — single step row (drag handle, icons, toggles)
        StepLibraryPanel.tsx     (~80 lines)  — search, filter chips, step cards, create form
        NewStepTemplateButton.tsx (~20 lines) — "+ Create New Step" inline form trigger
```

**Files NOT to touch:**
```
- /checklists/instances/ — Phase 2
- PreviewPanel component — Phase 5 (add TODO(phase-5) comment where preview button will go)
- Any trigger-related UI — Phase 4
```

**BuilderClient layout:**
```tsx
// Three-column desktop / stacked mobile
<div className="flex h-[calc(100vh-4rem)] overflow-hidden">
  {/* Left: 280px, scrollable */}
  <div className="w-[280px] shrink-0 border-r overflow-y-auto p-4">
    <LeftPanel ... />
  </div>
  {/* Center: flex-1 min-w-0, scrollable */}
  <div className="flex-1 min-w-0 overflow-y-auto p-6">
    <BuilderCanvas ... />
  </div>
  {/* Right: 320px, scrollable */}
  <div className="w-[320px] shrink-0 border-l overflow-y-auto">
    <StepLibraryPanel ... />
  </div>
</div>
```

**State management (BuilderClient):**
```typescript
// Optimistic state: keep local steps array, send tRPC mutations, 
// revert on error with toast
const [steps, setSteps] = useState<PlaybookStep[]>(initialSteps);
// Auto-save on name/description blur (debounced 500ms)
// Immediate save on step add/remove/reorder
```

**LeftPanel fields:**
```
Name:         <Input autoFocus> for new playbooks, max 200 chars, auto-save on blur
Category:     6 tiles in 3×2 grid — icon + label, selected = border-primary bg-primary/10
              ONBOARDING | VEHICLE_INSPECTION | OPERATIONS | COMPLIANCE | PARTNER | CUSTOM
Entity type:  auto-set by category, override <Select> with PlaybookEntityType options
Icon:         emoji grid (20 per row) filtered by category keyword — Phase 5 refinement OK
              For Phase 1: simple 8-emoji grid per category, "None" option
Color:        8 swatches (hardcoded hex list from Design System section above)
Description:  optional <Textarea>, max 2000 chars, auto-save on blur
Auto-Start Rules section:
              Phase 4 → show placeholder: "Auto-start rules available after connecting to
              driver and vehicle events. (Coming soon)"
```

**BuilderCanvas — Phase dividers (spec Section 8.2):**
```
PhaseType values as section headers:
  PRE_START → "Pre-Start"
  DAY_1     → "Day 1"
  WEEK_1    → "Week 1"
  ONGOING   → "Ongoing"
  NONE      → "Ungrouped" (always visible, shown if any unphased steps)

Collapsible: Radix <Collapsible>, chevron icon rotates on toggle
Drag-and-drop: use @dnd-kit/sortable (already in web package) to reorder steps
  within a phase section AND move between phases (update playbookPhase on drop)

Each phase section has "Add Step" button → selects that phase in Step Library
```

**BuilderStepRow fields (spec Section 8.2):**
```
Left:  drag handle (GripVertical icon), type icon, name (truncated)
Mid:   assignee badge, phase tag
Right: "Required Before Dispatch" toggle (isDispatchBlocker), due-days input,
       delete button (X icon)

Expanded (click row):  inline-editable description/instruction
                       photo/signature toggles (requiresPhoto, requiresSignature in defaultConfig)
                       type-specific config editors in stepConfigEditors/ subdirectory:
                         FORM_FILL → field builder (add/remove/reorder form fields)
                         INSPECTION_ITEM → pass/fail config
                         (other types: simple note editor)
```

**StepLibraryPanel behavior:**
```
Search: debounced 300ms filter on name + description
Filter chips: All / Document / Inspection / Form / Signature / Approval (maps to StepType groups)
Cards: name, type icon, assignee badge, "+" button to add to canvas
  "+" calls trpc.workflows.playbook.addStep.mutate({ playbookId, stepTemplateId, playbookPhase })

"Create New Step" inline form (replaces library list, no navigation):
  Fields: name (required), stepType (select), assigneeRole (select), description (optional)
  "Save Step": calls trpc.workflows.stepTemplate.create → on success calls addStep to canvas
  "Cancel": returns to library list
```

**new/page.tsx:**
```typescript
// Server action: create empty playbook, redirect to /checklists/playbooks/[id]/edit
// Uses redirect() from next/navigation after server action creates the record
// Initial name: "Untitled Playbook" (auto-focused and selected in builder)
```

**Verification:**
```bash
# Manual: create a new playbook end-to-end
# 1. Click "Create New Playbook" → navigates to builder
# 2. Set name, category, entity type
# 3. Add a step from library
# 4. Reorder steps (drag)
# 5. Delete a step
# 6. Create a new step inline (Step Library panel)
# 7. Toggle "Required Before Dispatch" on a step
# 8. Navigate back to /checklists → card shows correct step count
cd apps/web && npx tsc --noEmit   # exit 0
```

---

### Task 7 — Seed: 3 Starter Playbooks

**Wave:** 4  
**Depends on:** Task 1, Task 4  

**Files to CREATE:**
```
apps/web/src/server/services/workflows/
  seedStarterPlaybooks.ts   (~160 lines)
```

**Files to MODIFY:**
```
apps/web/src/actions/tenants.ts  (or wherever tenant creation occurs — grep for createTenant)
  +~3 lines: call seedStarterPlaybooks(tenantId) after tenant record created
```

**Files NOT to touch:**
```
- Any migration files
- The 3 existing seed playbooks (if the function already exists, verify it matches spec)
```

**3 starter Playbooks to seed (exact per spec Section 12):**

#### Starter 1 — CDL Driver Onboarding
`category: ONBOARDING, entityType: DRIVER`

| # | Name | stepType | assigneeRole | isDispatchBlocker | dueConfig |
|---|------|----------|--------------|-------------------|-----------|
| 1 | Upload Driver's License | DOCUMENT_UPLOAD | DISPATCHER | true | Day 0 |
| 2 | Upload Medical Certificate | DOCUMENT_UPLOAD | DISPATCHER | true | Day 0 |
| 3 | Pre-Employment Drug Test | THIRD_PARTY | SAFETY_MANAGER | true | Day 0 |
| 4 | Driver Application Form | FORM_FILL | DRIVER | true | Day 0 |
| 5 | FMCSA Clearinghouse Query | THIRD_PARTY | SAFETY_MANAGER | true | dueDaysFromStart: 3 |
| 6 | Motor Vehicle Record (MVR) | THIRD_PARTY | SAFETY_MANAGER | true | dueDaysFromStart: 3 |
| 7 | Safety Policy Acknowledgment | TRAINING_ACK | DRIVER | false | playbookPhase: DAY_1 |
| 8 | ELD Training Completion | TRAINING_ACK | DRIVER | false | playbookPhase: WEEK_1 |
| 9 | Driver Signature | SIGNATURE | DRIVER | true | Day 0 |

Step 4 `defaultConfig.fields`:
```json
[
  { "key": "fullName", "label": "Full Name", "type": "text", "required": true },
  { "key": "address", "label": "Address", "type": "text", "required": true },
  { "key": "cdlNumber", "label": "CDL Number", "type": "text", "required": true },
  { "key": "cdlExpiry", "label": "CDL Expiry", "type": "date", "required": true },
  { "key": "cdlState", "label": "CDL State", "type": "text", "required": true },
  { "key": "endorsements", "label": "Endorsements", "type": "text", "required": false }
]
```

#### Starter 2 — Pre-Trip Inspection (DVIR)
`category: VEHICLE_INSPECTION, entityType: DISPATCH`
All steps: `stepType: INSPECTION_ITEM, assigneeRole: DRIVER, isDispatchBlocker: true`
`defaultConfig: { requiresPhotoOnFail: true }`

1. Front Brakes — "Press pedal firmly. Check for resistance and unusual sounds."
2. Rear Brakes — "Check brake lines for leaks. Test parking brake."
3. Tires & Wheels — "Check tread depth, inflation, and sidewall condition on all tires."
4. Lights — "Verify headlights, brake lights, turn signals, and clearance lamps."
5. Mirrors — "Confirm all mirrors are clean, undamaged, and properly adjusted."
6. Windshield & Wipers — "Check for cracks. Test wiper operation and washer fluid."
7. Horn — "Test horn operation."
8. Fuel Level — "Confirm adequate fuel for the route."
9. Engine Compartment — "Check oil, coolant, belts, and hoses for leaks or damage."
10. Coupling Devices — "Inspect fifth wheel or hitch. Confirm trailer connection if applicable."
11. Emergency Equipment — "Confirm reflectors, fire extinguisher, and first aid kit are present."
12. Driver Signature — `stepType: SIGNATURE, assigneeRole: DRIVER, isDispatchBlocker: true`

#### Starter 3 — New Partner Setup (Carrier Packet)
`category: PARTNER, entityType: PARTNER`

| # | Name | stepType | assigneeRole | isDispatchBlocker |
|---|------|----------|--------------|-------------------|
| 1 | Upload W-9 | DOCUMENT_UPLOAD | DISPATCHER | true |
| 2 | Upload Certificate of Insurance | DOCUMENT_UPLOAD | DISPATCHER | true |
| 3 | Upload Letter of Authority | DOCUMENT_UPLOAD | DISPATCHER | true |
| 4 | Broker-Carrier Agreement | SIGNATURE | DISPATCHER | true |
| 5 | Payment Terms Confirmation | FORM_FILL | DISPATCHER | false |
| 6 | Partner Approval | APPROVAL | DISPATCHER | true |

Step 5 `defaultConfig.fields`:
```json
[
  { "key": "paymentTerms", "label": "Payment Terms", "type": "text", "required": true },
  { "key": "factoringCompany", "label": "Factoring Company", "type": "text", "required": false },
  { "key": "noaOnFile", "label": "NOA on File", "type": "boolean", "required": true }
]
```

**Implementation pattern:**
```typescript
// seedStarterPlaybooks.ts
export async function seedStarterPlaybooks(tenantId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await createCDLDriverOnboarding(tx, tenantId);
    await createPreTripInspection(tx, tenantId);
    await createPartnerSetup(tx, tenantId);
  });
}
// Each helper: create StepTemplates, create Playbook, create PlaybookSteps in sequence order
```

**Tenant hook:**
```typescript
// In the action/service that creates a new Tenant record (find via grep):
await seedStarterPlaybooks(newTenant.id);
// This runs AFTER the tenant is created and committed
```

**Verification:**
```bash
# Create a fresh tenant (use existing test account creation path or admin UI)
# Assert: tenant has exactly 3 Playbooks
# Assert: CDL Driver Onboarding has 9 steps
# Assert: Pre-Trip Inspection has 12 steps
# Assert: New Partner Setup has 6 steps
cd apps/web && npx tsc --noEmit   # exit 0
```

---

### Task 8 — Tests: Phase 1 Coverage

**Wave:** 5  
**Depends on:** Tasks 1–7  

**Per spec Section 15, Phase 1 — all 5 checks required for DoD:**

#### 8a. TypeScript check (automated in CI)
```bash
cd apps/web && npx tsc --noEmit       # must exit 0
cd packages/validation && npx tsc --noEmit   # must exit 0
```
This gates every other task — run before any PR.

#### 8b. Unit tests (Vitest)

**Files to CREATE:**
```
apps/web/src/server/api/routers/workflows/__tests__/
  stepTemplate.test.ts   (~80 lines)
  playbook.test.ts       (~120 lines)
  seed.test.ts           (~60 lines)
```

**Test cases required:**

`stepTemplate.test.ts`:
```typescript
// Tenant scoping: list only returns records for ctx.tenantId
test('list: returns only records for calling tenant', async () => { ... });
test('list: excludes archived (isActive=false) templates', async () => { ... });
test('create: sets tenantId from ctx, not from input', async () => { ... });
test('archive: soft-deletes (sets isActive=false + deletedAt)', async () => { ... });
test('archive: returns 403 for cross-tenant id', async () => { ... });
```

`playbook.test.ts`:
```typescript
// Step sequencing invariants
test('addStep: appends at end when sequence omitted', async () => { ... });
test('addStep: inserts at position N, renumbers subsequent steps', async () => { ... });
test('removeStep: re-sequences remaining steps without gaps', async () => { ... });
test('reorderSteps: batch updates all sequences atomically', async () => { ... });
test('reorderSteps: rejects stepIds belonging to different playbook', async () => { ... });
test('duplicate: clones playbook + steps, no triggers, no instances', async () => { ... });
// Tenant scoping
test('get: 404 for cross-tenant playbook id', async () => { ... });
test('list: excludes deleted (deletedAt != null) playbooks', async () => { ... });
```

`seed.test.ts`:
```typescript
test('seedStarterPlaybooks: creates exactly 3 playbooks for new tenant', async () => {
  const tenant = await createTestTenant();
  await seedStarterPlaybooks(tenant.id);
  const playbooks = await prisma.playbook.findMany({ where: { tenantId: tenant.id } });
  expect(playbooks).toHaveLength(3);
});
test('seedStarterPlaybooks: CDL Onboarding has 9 steps', async () => { ... });
test('seedStarterPlaybooks: Pre-Trip Inspection has 12 steps', async () => { ... });
test('seedStarterPlaybooks: Partner Setup has 6 steps', async () => { ... });
test('seedStarterPlaybooks: is idempotent when called twice', async () => {
  // Should not throw on duplicate tenant seed — either skip or upsert
});
```

#### 8c. Integration test — CRUD round-trip
```typescript
// playbook.integration.test.ts (~60 lines)
test('full CRUD: create playbook → add 3 steps → reorder → remove 1 → archive', async () => {
  // Uses real prisma test database (no mocks)
  // Steps in order: create, get (verify steps), reorder, remove, get (verify), archive, list (verify excluded)
});
```

#### 8d. Naming lint (spec Section 15 — CI gate)

**Files to CREATE:**
```
apps/web/src/__tests__/naming-lint.test.ts   (~30 lines)
```

```typescript
import { glob } from 'glob';
import { readFileSync } from 'fs';

test('no internal workflow names in .tsx text nodes', () => {
  // Spec Section 3 + Section 15: these MUST NOT appear in user-visible JSX text
  const forbidden = [
    'PlaybookInstance', 'StepInstance', 'StepTemplate', 'PlaybookTrigger',
    'Workflow Template Engine', 'isDispatchBlocker', 'PlaybookStep'
  ];
  const files = glob.sync('src/app/**/*.tsx', { cwd: 'apps/web' });
  const violations: string[] = [];
  for (const file of files) {
    const content = readFileSync(file, 'utf-8');
    // Simple heuristic: find these strings outside of import/type/interface/comment lines
    // Exclude lines starting with: import, //, /*, *, type, interface, export type
    const lines = content.split('\n');
    for (const [i, line] of lines.entries()) {
      const trimmed = line.trim();
      if (/^(import|\/\/|\/\*|\*|type |interface |export type )/.test(trimmed)) continue;
      for (const word of forbidden) {
        if (line.includes(word)) {
          violations.push(`${file}:${i + 1} — found "${word}"`);
        }
      }
    }
  }
  expect(violations).toEqual([]);
});
```

**Verification:**
```bash
cd apps/web && npx vitest run --reporter verbose
# All tests must pass
# Naming lint must pass (0 violations)
```

---

## Verification Criteria — Phase 1 DoD

These are the official checks per spec Section 14 Phase 1 and Section 16.5.

```
Phase 1 — Verification Report

DoD checks:
  [ ] 1. Admin creates a Playbook end-to-end through the UI
         Click path: /checklists → "Create New Playbook" → builder opens →
         set name + category → add step from library → save → back to grid →
         card shows new playbook with step count
         Evidence: screen recording or manual walkthrough note

  [ ] 2. Step Library loads; inline Step creation works
         Evidence: step library panel shows existing templates;
         "Create New Step" opens inline form; saved template appears in library
         AND is added to canvas

  [ ] 3. Steps add, reorder (drag-and-drop), and remove on the canvas
         Evidence: drag handle present; step reorder persists on page refresh;
         remove button removes step and re-sequences

  [ ] 4. Phase dividers render (Pre-Start / Day 1 / Week 1 / Ongoing)
         Evidence: steps can be moved between phase sections;
         collapsible sections work; phase assignment persists

  [ ] 5. /checklists renders Playbook card grid with filter tabs
         Evidence: All/Driver/Vehicle/Dispatch/Partner tabs visible;
         tab filters update grid; "Create New Playbook" always first

  [ ] 6. New tenant gets exactly 3 starter Playbooks
         Evidence: seed.test.ts passes; manual tenant creation check

  [ ] 7. Every Prisma query is tenantId-scoped
         Evidence: grep -n "findMany\|findFirst\|findUnique\|update\|delete" \
           apps/web/src/server/api/routers/workflows/ \
           | grep -v "tenantId" → must return 0 lines

Guardrails:
  [ ] typecheck (apps/web)      — npx tsc --noEmit → exit 0
  [ ] typecheck (packages/validation) — npx tsc --noEmit → exit 0
  [ ] vitest (apps/web)         — npx vitest run → all pass
  [ ] naming-lint               — naming-lint.test.ts passes (0 violations)
  [ ] tenant-scoping-grep       — see check 7 above
  [ ] no-runtime-code           — grep for PlaybookInstance, StepInstance in
                                  new files → 0 results (excluded from Phase 1)

Tech debt noted:
  - stepTemplate.update: cannot change stepType if instances exist — enforcement deferred to Phase 2
  - playbook.update: category/entityType lock once instances exist — deferred to Phase 2
  - setTrigger / removeTrigger procedures — deferred to Phase 4
  - Preview Panel (slide-in) in builder — deferred to Phase 5
  - icon/color fields not exposed in Phase 1 builder beyond color swatches — Phase 5 polish
  - Driver.isDispatchReady, Vehicle.isDispatchReady — Phase 2 additions to existing models

Merge decision: [ ] ready / [ ] blocked
```

---

## Execution Notes

**Order of execution (recommended wave sequence):**

| Wave | Tasks | What it builds | Can parallelize? |
|------|-------|----------------|-----------------|
| 1 | T1 + T2 | Schema + Zod schemas | Yes — independent |
| 2 | T3 + T4 | tRPC routers | Yes — parallel after Wave 1 |
| 3 | T5 + T6 | UI pages + Playbook Builder | Yes — parallel after Wave 2 |
| 4 | T7 | Seed service | Sequential — needs T1 schema |
| 5 | T8 | Tests | Sequential — needs all prior tasks |

**Before executing each task:**
1. Run `npx tsc --noEmit` — must be green before starting
2. Run `npx vitest run` — must be green before starting

**Commit message pattern (conventional commits):**
```
feat(workflows): <task description>
# Examples:
feat(workflows): add StepTemplate/Playbook/PlaybookStep migration
feat(workflows): add stepTemplate and playbook tRPC routers
feat(workflows): add /checklists playbook card grid
feat(workflows): add Playbook Builder three-column UI
feat(workflows): seed 3 starter playbooks on tenant create
test(workflows): add Phase 1 unit + integration + naming lint tests
```

**If a task reveals a plan gap:** stop, document the gap in `docs/tech-debt.md`,
and message the user before proceeding. Do not improvise scope.
