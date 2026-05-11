---
phase: 298-driver-pay-phase-3-assignment-snapshot
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/validation/src/load-driver-assignment.ts
  - packages/validation/src/index.ts
  - apps/web/src/lib/driver-pay/snapshot.ts
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  - apps/web/src/components/driver-pay/assignment-section.tsx
  - apps/web/src/components/driver-pay/assign-driver-modal.tsx
  - apps/web/src/components/driver-pay/assignment-card.tsx
  - apps/web/src/components/driver-pay/override-form.tsx
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/lib/driver-pay/__tests__/snapshot.test.ts
  - apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts
autonomous: true

must_haves:
  truths:
    - "Dispatcher opens a load detail page and sees a Driver Assignments section"
    - "Dispatcher can assign a driver to a load; the active pay template is snapshotted at assignment time"
    - "Dispatcher cannot assign two MAIN_DRIVER roles to the same load"
    - "Dispatcher cannot assign a driver who has no active compensation template"
    - "Dispatcher can override any pay term for a specific load assignment with a required reason (min 10 chars)"
    - "Override vs. inherited pay is visually distinct: green banner for inherited, amber banner for overridden"
    - "Dispatcher can remove a DRAFT assignment; non-DRAFT assignments cannot be removed"
    - "Hazmat loads show a contextual hint chip offering a +$0.10/mile hazmat premium override"
    - "Loads on a US federal holiday show a contextual hint chip offering 1.5x holiday pay override"
    - "Future template changes to the driver's compensation never retroactively alter existing assignments"
  artifacts:
    - path: "packages/validation/src/load-driver-assignment.ts"
      provides: "Zod schemas for create and update with overrideReason superRefine"
      exports: ["loadDriverAssignmentCreateSchema", "loadDriverAssignmentUpdateSchema"]
    - path: "apps/web/src/lib/driver-pay/snapshot.ts"
      provides: "snapshotActiveTemplate() and computeIsOverride() pure helpers"
      exports: ["snapshotActiveTemplate", "computeIsOverride", "AssignmentSnapshot"]
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "Server actions for CRUD + SerializedAssignment type"
      exports: ["listAssignmentsForLoad", "createAssignment", "updateAssignment", "deleteAssignment", "SerializedAssignment"]
    - path: "apps/web/src/components/driver-pay/assignment-section.tsx"
      provides: "Server wrapper + client section component for load detail page"
    - path: "apps/web/src/components/driver-pay/assign-driver-modal.tsx"
      provides: "3-step assign modal with hazmat/holiday hint chips"
    - path: "apps/web/src/components/driver-pay/assignment-card.tsx"
      provides: "Per-assignment card with inherited/override banner and edit/delete"
    - path: "apps/web/src/components/driver-pay/override-form.tsx"
      provides: "Inline override form with dirty-tracking and reason textarea"
    - path: "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
      provides: "Load detail page updated to include DriverAssignmentSection"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
      to: "apps/web/src/components/driver-pay/assignment-section.tsx"
      via: "JSX import and render after LoadForm"
      pattern: "DriverAssignmentSection|AssignmentSection"
    - from: "apps/web/src/components/driver-pay/assignment-section.tsx"
      to: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      via: "listAssignmentsForLoad server-side call"
      pattern: "listAssignmentsForLoad"
    - from: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      to: "apps/web/src/lib/driver-pay/snapshot.ts"
      via: "snapshotActiveTemplate called inside createAssignment"
      pattern: "snapshotActiveTemplate"
    - from: "apps/web/src/components/driver-pay/assignment-card.tsx"
      to: "apps/web/src/lib/driver-pay/snapshot.ts"
      via: "computeIsOverride imported client-side to compute banner state"
      pattern: "computeIsOverride"
---

<objective>
Build Phase 3 of the Driver Pay module: assignment creation with server-side pay template snapshotting, per-load pay override with mandatory reason, and the full assignment UI on the carrier load detail page.

Purpose: When a dispatcher assigns a driver to a load, the driver's active compensation template is snapshotted into the assignment row. Future template changes never touch existing assignments. Dispatchers can override pay terms for individual loads with a required reason, creating an auditable record.

Output: Validation schemas, snapshot service, four server actions, four UI components, updated load detail page, and unit tests for pure logic functions.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
@apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
@packages/validation/src/index.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Validation schemas + snapshot service + server actions (data layer)</name>
  <files>
    packages/validation/src/load-driver-assignment.ts
    packages/validation/src/index.ts
    apps/web/src/lib/driver-pay/snapshot.ts
    apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  </files>
  <action>
    Before writing, confirm exact enum values by reading `apps/web/src/generated/prisma/index.d.ts`:
    - `DriverPayType`: CPM | HOURLY | FLAT_PER_LOAD | PERCENTAGE | DAILY | SALARY
    - `RateUnit`: PER_MILE | PER_HOUR | PER_LOAD | PERCENTAGE | PER_DAY | ANNUAL
    - `DriverRole`: MAIN_DRIVER | CO_DRIVER
    - `DriverAssignmentStatus`: DRAFT | PENDING_REVIEW | APPROVED | PAID | DISPUTED | CORRECTED

    1. Create `packages/validation/src/load-driver-assignment.ts`:
       - Import `z` from `zod`.
       - Define `loadDriverAssignmentCreateSchema = z.object({
           driverId: z.string().uuid(),
           driverRole: z.enum(['MAIN_DRIVER', 'CO_DRIVER']),
         })`.
       - Define `loadDriverAssignmentUpdateSchema = z.object({
           payType: z.enum(['CPM','HOURLY','FLAT_PER_LOAD','PERCENTAGE','DAILY','SALARY']).optional(),
           baseRate: z.string().refine(v => !isNaN(Number(v)) && Number(v) >= 0, 'Must be >= 0').optional(),
           rateUnit: z.enum(['PER_MILE','PER_HOUR','PER_LOAD','PERCENTAGE','PER_DAY','ANNUAL']).optional(),
           loadedMilesOnly: z.boolean().optional(),
           fuelSurchargeRate: z.string().nullable().optional(),
           perDiemEnabled: z.boolean().optional(),
           perDiemRate: z.string().nullable().optional(),
           estimatedMiles: z.string().nullable().optional(),
           overrideReason: z.string().optional(),
         })`. No superRefine here — the action validates the diff against the snapshot.
       - Export inferred types: `LoadDriverAssignmentCreateInput` and `LoadDriverAssignmentUpdateInput`.

    2. Add `export * from './load-driver-assignment'` to `packages/validation/src/index.ts` after the existing exports.

    3. Create `apps/web/src/lib/driver-pay/snapshot.ts`:
       - No `'use server'` directive — this is a pure server-safe utility (no server-only imports).
       - Import `type { PrismaClient } from '@/generated/prisma'` and `Prisma from '@/generated/prisma'`.
       - Export type `AssignmentSnapshot` with these fields (all Decimal stay as Prisma.Decimal):
         ```
         templateId: string
         payType: string
         baseRate: Prisma.Decimal
         rateUnit: string
         loadedMilesOnly: boolean
         fuelSurchargeRate: Prisma.Decimal | null
         perDiemEnabled: boolean
         perDiemRate: Prisma.Decimal | null
         currency: string
         ```
       - Export `async function snapshotActiveTemplate(driverId: string, tenantId: string, prisma: PrismaClient): Promise<AssignmentSnapshot>`:
         - `prisma.driverCompensationTemplate.findFirst({ where: { driverId, tenantId, effectiveTo: null, deletedAt: null } })`
         - If not found, `throw new Error('NO_ACTIVE_TEMPLATE')`
         - Return the AssignmentSnapshot shape picking exactly the fields above from the template row.
       - Export `function computeIsOverride(assignment, template): boolean` where both params have the shape:
         ```
         { payType: string; baseRate: { toString(): string }; rateUnit: string; loadedMilesOnly: boolean;
           fuelSurchargeRate: { toString(): string } | null; perDiemEnabled: boolean;
           perDiemRate: { toString(): string } | null }
         ```
         Returns `true` if any of the 7 fields differ when compared as strings. Use a helper `s = (v: { toString(): string } | null) => v?.toString() ?? null` for nullable Decimals. Return false only when all 7 match.

    4. Create `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`:
       - `'use server'` directive.
       - Imports: `Prisma` from `@/generated/prisma`; `requireRole`, `requireAuth` from `@/lib/auth/supabase`; `UserRole` from `@/lib/auth/roles`; `getTenantPrisma`, `requireTenantId` from `@/lib/context/tenant-context`; `revalidatePath` from `next/cache`; `snapshotActiveTemplate` from `@/lib/driver-pay/snapshot`; `loadDriverAssignmentCreateSchema`, `loadDriverAssignmentUpdateSchema` from `@drivecommand/validation`.
       - Serialization: `const Decimal = Prisma.Decimal`. Copy the `serializeDecimal` helper verbatim from `driver-compensation-templates.ts`.
       - Export type `SerializedAssignment`:
         ```
         id, tenantId, loadId, driverId, driverRole, templateId: string | null
         payType, baseRate: string, rateUnit, currency: string
         loadedMilesOnly: boolean
         fuelSurchargeRate: string | null
         perDiemEnabled: boolean
         perDiemRate: string | null
         estimatedMiles: string | null
         overrideReason: string | null
         payStatus: string
         createdAt: string
         deletedAt: string | null
         driver: { id: string; firstName: string; lastName: string }
         template: {
           payType: string; baseRate: string; rateUnit: string
           loadedMilesOnly: boolean
           fuelSurchargeRate: string | null
           perDiemEnabled: boolean
           perDiemRate: string | null
         } | null
         ```
       - Write a private `serializeAssignment(a)` function that maps the Prisma row (with `driver` and `template` includes) into `SerializedAssignment`.

       - **`listAssignmentsForLoad(loadId: string)`**:
         - `await requireRole([UserRole.OWNER, UserRole.MANAGER])`
         - `const tenantId = await requireTenantId(); const prisma = await getTenantPrisma()`
         - `prisma.loadDriverAssignment.findMany({ where: { loadId, deletedAt: null }, include: { driver: { select: { id: true, firstName: true, lastName: true } }, template: { select: { payType: true, baseRate: true, rateUnit: true, loadedMilesOnly: true, fuelSurchargeRate: true, perDiemEnabled: true, perDiemRate: true } } }, orderBy: { createdAt: 'asc' } })`
         - Note: tenantId is auto-injected by `getTenantPrisma` middleware — no need to add it to the where clause.
         - Return `{ data: { assignments: rows.map(serializeAssignment) } }`.

       - **`createAssignment(loadId: string, input: unknown)`**:
         - `await requireRole([UserRole.OWNER, UserRole.MANAGER])`
         - `const parseResult = loadDriverAssignmentCreateSchema.safeParse(input)`. If fail, return `{ error: JSON.stringify(parseResult.error.flatten().fieldErrors) }`.
         - `const { driverId, driverRole } = parseResult.data`
         - `const userId = await requireAuth(); const tenantId = await requireTenantId(); const prisma = await getTenantPrisma()`
         - Tenant-check the driver (CarrierDriver is NOT auto-scoped): `const cd = await prisma.carrierDriver.findFirst({ where: { id: driverId, orgId: tenantId } })`. If not found: `return { error: 'Driver not found.' }`.
         - If `driverRole === 'MAIN_DRIVER'`: `const existing = await prisma.loadDriverAssignment.findFirst({ where: { loadId, driverRole: 'MAIN_DRIVER', deletedAt: null } })`. If found: `return { error: 'Cannot assign a second main driver to this load. This load already has a primary driver assigned. Assign them as co-driver instead, or remove the existing main driver first.' }`.
         - Snapshot: wrap in try/catch. `const snap = await snapshotActiveTemplate(driverId, tenantId, prisma)`. Catch: if `err instanceof Error && err.message === 'NO_ACTIVE_TEMPLATE'`, return `{ error: "Cannot assign this driver because they don't have an active pay template. Set up their compensation template first, then return here." }`. Re-throw anything else.
         - Create: `await prisma.loadDriverAssignment.create({ data: { tenantId, loadId, driverId: cd.id, driverRole, templateId: snap.templateId, payType: snap.payType as any, baseRate: snap.baseRate, rateUnit: snap.rateUnit as any, loadedMilesOnly: snap.loadedMilesOnly, fuelSurchargeRate: snap.fuelSurchargeRate ?? null, perDiemEnabled: snap.perDiemEnabled, perDiemRate: snap.perDiemRate ?? null, currency: snap.currency, createdBy: userId } })`
         - `revalidatePath(\`/carrier/loads/${loadId}\`)`
         - Return `{ data: { id: created.id } }`.

       - **`updateAssignment(assignmentId: string, input: unknown)`**:
         - `await requireRole([UserRole.OWNER, UserRole.MANAGER])`
         - `const parseResult = loadDriverAssignmentUpdateSchema.safeParse(input)`. If fail, return `{ error: JSON.stringify(parseResult.error.flatten().fieldErrors) }`.
         - `const data = parseResult.data`
         - `const tenantId = await requireTenantId(); const prisma = await getTenantPrisma()`
         - Fetch existing: `const existing = await prisma.loadDriverAssignment.findFirst({ where: { id: assignmentId, deletedAt: null }, include: { template: true } })`. If not found: `return { error: 'Assignment not found.' }`.
         - Build the merged update fields (start with existing values, overlay `data` fields that are defined). Convert numeric string fields using `new Decimal(v)`.
         - If any overrideable field in `data` is defined: compute whether the merged result differs from the snapshotted template (import `computeIsOverride` from snapshot.ts). If `computeIsOverride(mergedFields, existing.template)` is true AND (`!data.overrideReason || data.overrideReason.trim().length < 10`): return `{ error: 'A reason is required when overriding pay terms. Please describe why this load needs different pay (minimum 10 characters).' }`.
         - `await prisma.loadDriverAssignment.update({ where: { id: assignmentId }, data: { ...mergedDecimalFields, overrideReason: data.overrideReason ?? existing.overrideReason } })`
         - `revalidatePath(\`/carrier/loads/${existing.loadId}\`)`
         - Return `{ data: { id: assignmentId } }`.

       - **`deleteAssignment(assignmentId: string)`**:
         - `await requireRole([UserRole.OWNER, UserRole.MANAGER])`
         - `const tenantId = await requireTenantId(); const prisma = await getTenantPrisma()`
         - `const existing = await prisma.loadDriverAssignment.findFirst({ where: { id: assignmentId, deletedAt: null } })`. If not found: `return { error: 'Assignment not found.' }`.
         - If `existing.payStatus !== 'DRAFT'`: `return { error: 'Only draft assignments can be removed.' }`.
         - `await prisma.loadDriverAssignment.update({ where: { id: assignmentId }, data: { deletedAt: new Date() } })`
         - `revalidatePath(\`/carrier/loads/${existing.loadId}\`)`
         - Return `{ data: { ok: true } }`.

    5. Run `npx tsc --noEmit` from repo root to verify zero type errors.
  </action>
  <verify>
    - `grep -n "loadDriverAssignmentCreateSchema\|loadDriverAssignmentUpdateSchema" packages/validation/src/load-driver-assignment.ts` shows both exports.
    - `grep -n "load-driver-assignment" packages/validation/src/index.ts` shows the re-export line.
    - `grep -n "NO_ACTIVE_TEMPLATE" apps/web/src/lib/driver-pay/snapshot.ts` confirms the throw string.
    - `grep -n "computeIsOverride" apps/web/src/lib/driver-pay/snapshot.ts` shows the export.
    - `grep -n "orgId: tenantId" "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"` shows the manual CarrierDriver tenant check.
    - `grep -n "MAIN_DRIVER" "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"` shows the duplicate main-driver check.
    - `grep -n "deletedAt: new Date" "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"` confirms soft delete.
    - `npx tsc --noEmit` passes with zero errors.
  </verify>
  <done>
    Validation schemas export create and update schemas. snapshot.ts exports snapshotActiveTemplate (throws 'NO_ACTIVE_TEMPLATE') and computeIsOverride (pure, no side effects). Four server actions enforce OWNER|MANAGER role, manually scope CarrierDriver by orgId, snapshot the template at create time, validate override reason when any field differs, and soft-delete only DRAFT assignments. TypeScript is clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: UI components — AssignmentSection, AssignModal, AssignmentCard, OverrideForm</name>
  <files>
    apps/web/src/components/driver-pay/assignment-section.tsx
    apps/web/src/components/driver-pay/assign-driver-modal.tsx
    apps/web/src/components/driver-pay/assignment-card.tsx
    apps/web/src/components/driver-pay/override-form.tsx
  </files>
  <action>
    Before writing, confirm:
    - `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` exports exist (Task 1 must be done).
    - `apps/web/src/lib/driver-pay/snapshot.ts` exports `computeIsOverride` (import is safe for client components — no server-only imports in that file).
    - shadcn components available: `Button`, `Card`, `CardContent`, `CardHeader`, `CardTitle`, `Badge`, `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Input`, `Textarea`, `Select`, `SelectTrigger`, `SelectContent`, `SelectItem`, `SelectValue`, `Label` from `@/components/ui/*`.
    - Color tokens: success = `text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/50`; warning = `text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50`.

    1. Create `apps/web/src/components/driver-pay/assignment-section.tsx`:
       - Top of file: no directive — this is a server component wrapper.
       - Import `listAssignmentsForLoad` and `SerializedAssignment` from `@/app/(owner)/actions/load-driver-assignments`.
       - Props: `{ loadId: string; load: { id: string; hazmat: boolean; referenceNumber: string | null; rateAmount: number | null; createdAt: string }; drivers: { id: string; firstName: string; lastName: string; status: string }[] }`.
       - Body: call `listAssignmentsForLoad(loadId)` server-side; pass result into `<AssignmentSectionClient>`.
       - Also export `AssignmentSectionClient` as a separate `'use client'` component in the same file (or a co-located file — same file is fine for colocation).
       - `AssignmentSectionClient` receives:
         - `initialAssignments: SerializedAssignment[]`
         - `drivers` prop (same shape as above)
         - `load` prop (same shape as above)
       - State: `const [assignments, setAssignments] = useState(initialAssignments)`.
       - Renders:
         - Section header: `<h2 className="text-lg font-semibold">Driver Assignments</h2>`.
         - If `assignments.length === 0`: muted `<Card>` with text "No driver assigned yet. Pay terms will be set when you assign one." and a primary "Assign Driver" button that opens `<AssignDriverModal>`.
         - If `assignments.length > 0`: map over `assignments` rendering `<AssignmentCard>` for each, plus an "Assign Co-Driver" button if no CO_DRIVER exists yet, or "Assign Driver" if empty.
         - `<AssignDriverModal>` receives `open`, `onOpenChange`, `loadId`, `load`, `drivers`, and `onAssigned: (newAssignment: SerializedAssignment) => void` callback that prepends the new assignment to state.

    2. Create `apps/web/src/components/driver-pay/assign-driver-modal.tsx`:
       - `'use client'` directive.
       - Import `createAssignment` from `@/app/(owner)/actions/load-driver-assignments`.
       - Import `toast` from `sonner`.
       - Props: `{ open: boolean; onOpenChange: (v: boolean) => void; loadId: string; load: { hazmat: boolean; referenceNumber: string | null; rateAmount: number | null; createdAt: string }; drivers: { id: string; firstName: string; lastName: string }[]; onAssigned: (a: SerializedAssignment) => void }`.
       - Internal state: `step: 1 | 2 | 3`, `selectedDriverId: string | null`, `selectedRole: 'MAIN_DRIVER' | 'CO_DRIVER' | null`, `search: string`, `isSubmitting: boolean`, `error: string | null`.
       - **Holiday detection** — define a static const at the top of the file:
         ```ts
         const US_FEDERAL_HOLIDAYS: string[] = [
           '2026-01-01','2026-01-19','2026-02-16','2026-05-25','2026-06-19',
           '2026-07-03','2026-09-07','2026-10-12','2026-11-11','2026-11-26','2026-12-25',
           '2027-01-01','2027-01-18','2027-02-15','2027-05-31','2027-06-18',
           '2027-07-05','2027-09-06','2027-10-11','2027-11-11','2027-11-25','2027-12-24',
         ]
         ```
         Compute `isHoliday = US_FEDERAL_HOLIDAYS.includes(new Date(load.createdAt).toISOString().slice(0,10))` inside the component body.
         For the holiday name display, use a simple lookup map: `{ '2026-01-01': "New Year's Day", '2026-01-19': 'MLK Day', ... }` (include all dates above). If no exact match, fall back to `'a federal holiday'`.
       - **Step 1 — Driver picker**:
         - Text `<Input placeholder="Search drivers..." value={search} onChange={...}/>`.
         - Filter `drivers` by search (case-insensitive match on `firstName + ' ' + lastName`).
         - For each result render a button-style row: driver name. Show a red dot badge `text-red-500` with title "No active template" if the driver is not yet checked — note that at this step you do not know if they have a template until the server responds. The check happens implicitly: if `createAssignment` returns the NO_ACTIVE_TEMPLATE error, surface it as `error` state after submit attempt.
         - Clicking a row sets `selectedDriverId` and advances to step 2.
       - **Step 2 — Role selector**:
         - Two radio-style cards: "Main Driver" (primary border when selected) and "Co-Driver" (muted).
         - "Back" returns to step 1. "Continue" validates role is selected then advances to step 3.
       - **Step 3 — Confirm + smart hints**:
         - Show: "Ready to assign [Driver Name] as [role] to this load."
         - **Hazmat hint** (show only if `load.hazmat === true`):
           - Render info chip with amber colors: "This load is marked hazmat. Standard pay doesn't include a hazmat premium."
           - Button "Note: hazmat premium must be applied as an override after assigning." — this is informational only; no pre-fill at this step since the override happens post-assignment via `OverrideForm`.
         - **Holiday hint** (show only if `isHoliday`):
           - Render info chip with amber colors: "This load was created on [holiday name]. Standard rates apply — apply a holiday multiplier as an override after assigning if needed."
         - "Assign Driver" button: on click, sets `isSubmitting = true`, calls `await createAssignment(loadId, { driverId: selectedDriverId, driverRole: selectedRole })`. On `data`: `toast.success('[Driver Name] assigned to this load.')`, `onAssigned(...)`, `onOpenChange(false)`, reset state. On `error`: set `error` state and show inline below the button. Set `isSubmitting = false`.
       - On `onOpenChange(false)` or dialog close, always reset state to `step: 1`, `selectedDriverId: null`, `selectedRole: null`, `search: ''`, `error: null`.

    3. Create `apps/web/src/components/driver-pay/assignment-card.tsx`:
       - `'use client'` directive.
       - Import `computeIsOverride` from `@/lib/driver-pay/snapshot`.
       - Import `deleteAssignment`, `SerializedAssignment` from `@/app/(owner)/actions/load-driver-assignments`.
       - Import `OverrideForm` from `./override-form`.
       - Import `toast` from `sonner`.
       - Props: `{ assignment: SerializedAssignment; onDeleted: () => void; onUpdated: (updated: SerializedAssignment) => void }`.
       - State: `showOverrideForm: boolean`, `isDeleting: boolean`, `showDeleteConfirm: boolean`.
       - **Banner logic** — computed from `assignment.template`:
         - If `assignment.template === null` (no snapshot to compare): render no banner.
         - Else compute `isOverride = computeIsOverride(assignment, assignment.template)` (passing the serialized strings — `computeIsOverride` uses `.toString()` on both sides, strings return themselves).
         - If `!isOverride`: green banner — `text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/50` — "Inheriting [firstName]'s standard pay: [formatRate(assignment)]. Override pay terms for this load specifically."
         - If `isOverride`: amber banner — `text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50` — "Overridden — [assignment.overrideReason]".
       - **Rate formatting helper** `formatRate(a: SerializedAssignment): string`:
         - CPM / PER_MILE → `$${Number(a.baseRate).toFixed(4)}/mile`
         - HOURLY / PER_HOUR → `$${Number(a.baseRate).toFixed(2)}/hr`
         - FLAT_PER_LOAD / PER_LOAD → `$${Number(a.baseRate).toFixed(2)} flat`
         - PERCENTAGE → `${(Number(a.baseRate) * 100).toFixed(1)}% of load gross`
         - DAILY / PER_DAY → `$${Number(a.baseRate).toFixed(2)}/day`
         - SALARY / ANNUAL → `$${Number(a.baseRate).toFixed(2)}/yr`
       - **Card layout**:
         - Header: `<Badge>` for role (variant="default" for MAIN_DRIVER, variant="secondary" for CO_DRIVER), driver full name, `<Badge>` for `payStatus`.
         - Body: `formatRate(assignment)`.
         - Banner (conditional per above).
         - Footer actions: "Edit pay" button (sets `showOverrideForm = true`). "Remove" button shown only when `assignment.payStatus === 'DRAFT'`.
       - **Delete flow**: clicking "Remove" sets `showDeleteConfirm = true`. Render a shadcn `<Dialog open={showDeleteConfirm}>`. Dialog content: "Remove this driver assignment? This will remove [firstName] from this load. If you proceed, their pay record will be deleted. This cannot be undone for submitted assignments." Two buttons: "Cancel" (closes dialog) and "Remove assignment" (destructive, calls `deleteAssignment(assignment.id)`). On success: `toast.success('Driver assignment removed.')`, `onDeleted()`.
       - **Override form**: when `showOverrideForm`, render `<OverrideForm assignment={assignment} onSaved={(updated) => { onUpdated(updated); setShowOverrideForm(false) }} onCancel={() => setShowOverrideForm(false)} />` below the card body.

    4. Create `apps/web/src/components/driver-pay/override-form.tsx`:
       - `'use client'` directive.
       - Import `updateAssignment`, `SerializedAssignment` from `@/app/(owner)/actions/load-driver-assignments`.
       - Import `toast` from `sonner`.
       - Props: `{ assignment: SerializedAssignment; onSaved: (updated: SerializedAssignment) => void; onCancel: () => void }`.
       - State: controlled fields for `payType`, `baseRate`, `rateUnit`, `loadedMilesOnly`, `fuelSurchargeRate`, `perDiemEnabled`, `perDiemRate`, `overrideReason` — all initialized from `assignment` props.
       - **Dirty tracking** — `isDirty`: computed via inline comparison of each field vs. the initial `assignment` value. Do not import `computeIsOverride` here — just compare field-by-field inline (strings vs. strings). `isDirty` is true if any overrideable field differs from the original `assignment`.
       - When `isDirty === true`: show `<Label>Reason for override *</Label><Textarea value={overrideReason} onChange={...} placeholder="Explain why this load needs different pay terms (min 10 characters)" className="mt-1"/>`. Validate: `overrideReason.trim().length >= 10` before submit.
       - **Submit handler**:
         - Validate `isDirty && overrideReason.trim().length < 10` → inline error "Please provide at least 10 characters explaining the override reason."
         - Call `await updateAssignment(assignment.id, { payType, baseRate, rateUnit, loadedMilesOnly, fuelSurchargeRate: fuelSurchargeRate || null, perDiemEnabled, perDiemRate: perDiemRate || null, estimatedMiles: null, overrideReason })`.
         - On `data`: `toast.success('Pay terms updated.')`, `onSaved(/* reconstruct updated SerializedAssignment from current fields */)`.
         - Note: since `updateAssignment` only returns `{ data: { id } }`, reconstruct the updated `SerializedAssignment` by merging the form fields over the original `assignment` prop and pass to `onSaved`.
         - On `error`: show inline error message below the form.
       - Form layout: `Select` for payType, `Input` for baseRate, `Select` for rateUnit, `Switch` for loadedMilesOnly, `Input` for fuelSurchargeRate, `Switch` for perDiemEnabled, `Input` for perDiemRate. Show submit error above the action buttons. Two buttons at bottom: "Cancel" and "Save override" (shows "Saving..." when `isSaving`).
  </action>
  <verify>
    - `grep -n "'use client'" apps/web/src/components/driver-pay/assign-driver-modal.tsx` confirms client directive.
    - `grep -n "computeIsOverride" apps/web/src/components/driver-pay/assignment-card.tsx` confirms import.
    - `grep -n "US_FEDERAL_HOLIDAYS" apps/web/src/components/driver-pay/assign-driver-modal.tsx` shows the static array.
    - `grep -n "MAIN_DRIVER" apps/web/src/components/driver-pay/assign-driver-modal.tsx` shows role cards.
    - `grep -n "deleteAssignment" apps/web/src/components/driver-pay/assignment-card.tsx` shows delete wiring.
    - `grep -n "overrideReason" apps/web/src/components/driver-pay/override-form.tsx` shows the conditional textarea.
    - `grep -n "isDirty" apps/web/src/components/driver-pay/override-form.tsx` confirms dirty tracking.
    - `npx tsc --noEmit` passes with zero errors.
  </verify>
  <done>
    AssignmentSection server wrapper fetches assignments and passes to client. AssignDriverModal runs 3 steps (pick driver, pick role, confirm with hazmat/holiday hint chips) and calls createAssignment on submit. AssignmentCard shows role badge, pay rate, green/amber banner based on computeIsOverride, delete dialog gated on DRAFT status, and toggleable OverrideForm. OverrideForm tracks dirty state, shows reason textarea only when dirty, validates min 10 chars, and calls updateAssignment. TypeScript clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Page integration + unit tests</name>
  <files>
    apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
    apps/web/src/lib/driver-pay/__tests__/snapshot.test.ts
    apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts
  </files>
  <action>
    1. Modify `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx`:
       - Read the current file in full before editing.
       - Add import at the top: `import { DriverAssignmentSection } from '@/components/driver-pay/assignment-section'`.
       - The page already fetches `rawDrivers` (CarrierDriver list with `id`, `firstName`, `lastName`, `status`) and the `load` object which includes `hazmat` and `referenceNumber`.
       - The `load` object returned by `getLoad()` uses `load.financials.otherCharges` for some fields but `load.hazmat`, `load.referenceNumber` are direct fields on the spread load. Confirm the shape by reading `apps/web/src/lib/carrier/loads.ts` line 143 (`return { ...load, financials: {...} }`).
       - The `load.rateAmount` on the raw prisma load is a Decimal that has already been converted to `initialData.rateAmount` as `Number(load.rateAmount)` — for the section prop, pass `load.rateAmount != null ? Number(load.rateAmount) : null`.
       - The `load.createdAt` is a Date from Prisma — pass it as `.toISOString()`.
       - Inside the returned JSX, after the closing `</LoadForm>` tag and before the end of the outer `<div className="space-y-6">`, add:
         ```tsx
         <DriverAssignmentSection
           loadId={id}
           load={{
             id: load.id,
             hazmat: load.hazmat,
             referenceNumber: load.referenceNumber ?? null,
             rateAmount: load.rateAmount != null ? Number(load.rateAmount) : null,
             createdAt: (load.createdAt as Date).toISOString(),
           }}
           drivers={rawDrivers}
         />
         ```
       - Verify the page still compiles after the addition — do not remove any existing imports or JSX.

    2. Create directory `apps/web/src/lib/driver-pay/__tests__/` and file `snapshot.test.ts`:
       - `import { describe, it, expect } from 'vitest'`
       - `import { computeIsOverride } from '@/lib/driver-pay/snapshot'`
       - Build a base template object for reuse:
         ```ts
         const base = {
           payType: 'CPM', baseRate: { toString: () => '0.5500' },
           rateUnit: 'PER_MILE', loadedMilesOnly: false,
           fuelSurchargeRate: null, perDiemEnabled: false, perDiemRate: null,
         }
         ```
       - Write 7 `it` tests:
         1. `'returns false when all fields are identical'` — `computeIsOverride(base, base)` → `false`
         2. `'returns true when payType differs'` — override `payType: 'HOURLY'` on assignment → `true`
         3. `'returns true when baseRate differs'` — `baseRate: { toString: () => '0.6000' }` → `true`
         4. `'returns true when rateUnit differs'` — `rateUnit: 'PER_HOUR'` → `true`
         5. `'returns true when loadedMilesOnly differs'` — `loadedMilesOnly: true` → `true`
         6. `'returns true when fuelSurchargeRate changes from null to a value'` — `fuelSurchargeRate: { toString: () => '0.05' }` on assignment → `true`
         7. `'returns true when perDiemEnabled differs'` — `perDiemEnabled: true` → `true`

    3. Create directory `apps/web/src/app/(owner)/actions/__tests__/` and file `load-driver-assignments.test.ts`:
       - Mock dependencies at the top using `vi.mock`:
         ```ts
         vi.mock('@/lib/auth/supabase', () => ({ requireRole: vi.fn(), requireAuth: vi.fn().mockResolvedValue('user-123') }))
         vi.mock('@/lib/context/tenant-context', () => ({
           requireTenantId: vi.fn().mockResolvedValue('tenant-123'),
           getTenantPrisma: vi.fn(),
         }))
         vi.mock('@/lib/driver-pay/snapshot', () => ({ snapshotActiveTemplate: vi.fn() }))
         vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
         ```
       - Import the mocks with `import { getTenantPrisma } from '@/lib/context/tenant-context'` etc.
       - Import `createAssignment`, `updateAssignment`, `deleteAssignment` from the actions file.
       - Import `snapshotActiveTemplate` from `@/lib/driver-pay/snapshot`.
       - Helper to build a mock prisma object:
         ```ts
         function makePrisma(overrides: Partial<Record<string, object>> = {}) {
           return {
             carrierDriver: { findFirst: vi.fn() },
             loadDriverAssignment: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
             ...overrides,
           }
         }
         ```
       - Write 5 tests:
         1. `'createAssignment: returns NO_ACTIVE_TEMPLATE error when snapshot throws'`:
            - `(getTenantPrisma as vi.Mock).mockResolvedValue(makePrisma({ carrierDriver: { findFirst: vi.fn().mockResolvedValue({ id: 'driver-1' }) }, loadDriverAssignment: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() } }))`;
            - `(snapshotActiveTemplate as vi.Mock).mockRejectedValue(new Error('NO_ACTIVE_TEMPLATE'))`;
            - result = `await createAssignment('load-1', { driverId: '00000000-0000-0000-0000-000000000001', driverRole: 'MAIN_DRIVER' })`;
            - `expect(result.error).toContain("don't have an active pay template")`.
         2. `'createAssignment: returns duplicate MAIN_DRIVER error when one already exists'`:
            - `loadDriverAssignment.findFirst` returns an existing assignment with `driverRole: 'MAIN_DRIVER'`.
            - `expect(result.error).toContain('Cannot assign a second main driver')`.
         3. `'createAssignment: driver not found returns error'`:
            - `carrierDriver.findFirst` returns null.
            - `expect(result.error).toBe('Driver not found.')`.
         4. `'deleteAssignment: non-DRAFT payStatus returns error'`:
            - `loadDriverAssignment.findFirst` returns `{ id: 'a-1', payStatus: 'APPROVED', loadId: 'load-1' }`.
            - `expect(result.error).toBe('Only draft assignments can be removed.')`.
         5. `'updateAssignment: missing overrideReason when fields differ returns error'`:
            - Mock existing assignment with template; mock `computeIsOverride` to return true by providing values that differ.
            - Because `updateAssignment` uses `computeIsOverride` inline (not via mock), build the existing assignment and update input such that `baseRate` clearly differs from the template's `baseRate` (e.g., assignment `baseRate: Decimal('0.5500')`, template `baseRate: Decimal('0.5500')` but input `baseRate: '0.9000'`).
            - Call `updateAssignment('assign-1', { baseRate: '0.9000' })` with no `overrideReason`.
            - `expect(result.error).toContain('A reason is required')`.

    4. Run tests: `cd apps/web && npx vitest run src/lib/driver-pay/__tests__/snapshot.test.ts src/app/\(owner\)/actions/__tests__/load-driver-assignments.test.ts`.
    5. Run `npx tsc --noEmit` from repo root.
  </action>
  <verify>
    - `grep -n "DriverAssignmentSection" apps/web/src/app/\(owner\)/carrier/loads/\[id\]/page.tsx` shows the import and JSX usage.
    - `grep -n "hazmat" apps/web/src/app/\(owner\)/carrier/loads/\[id\]/page.tsx` shows hazmat is passed to the section.
    - `npx vitest run apps/web/src/lib/driver-pay/__tests__/snapshot.test.ts` — 7 tests pass.
    - `npx vitest run "apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts"` — 5 tests pass.
    - `npx tsc --noEmit` passes from repo root with zero errors.
  </verify>
  <done>
    Load detail page renders DriverAssignmentSection after LoadForm, passing load with hazmat flag, referenceNumber, rateAmount, and createdAt. snapshot.test.ts has 7 passing tests covering all 7 comparator branches of computeIsOverride. load-driver-assignments.test.ts has 5 passing tests covering NO_ACTIVE_TEMPLATE error, duplicate MAIN_DRIVER check, driver-not-found guard, non-DRAFT delete guard, and missing override reason guard. TypeScript compile is clean.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` from repo root passes with zero errors.
2. Navigate to `/carrier/loads/[any-load-id]` in dev — a "Driver Assignments" section is visible after the load form.
3. With no assignments: empty state card shows "No driver assigned yet." and an "Assign Driver" button.
4. Clicking "Assign Driver" opens the modal. Step 1 shows the driver list filtered by search input. Selecting a driver advances to step 2.
5. Step 2: selecting MAIN_DRIVER or CO_DRIVER role and clicking Continue advances to step 3.
6. Step 3: for a hazmat load (`load.hazmat === true`), an amber info chip is visible. For a load created on a federal holiday, another amber chip is visible. Both are informational only.
7. Clicking "Assign Driver" in step 3 calls `createAssignment`. If the driver has no active template, an error appears inline: "...don't have an active pay template...". If a MAIN_DRIVER is already assigned, error appears: "Cannot assign a second main driver...".
8. On success: modal closes, new assignment card appears in the section. Green banner shows: "Inheriting [name]'s standard pay: ...".
9. Clicking "Edit pay" on a card opens the OverrideForm inline. Changing any field reveals the "Reason for override *" textarea. Submitting with fewer than 10 reason characters shows an inline validation error. Submitting with ≥10 chars calls `updateAssignment` and shows amber "Overridden — [reason]" banner on the card.
10. Clicking "Remove" on a DRAFT assignment opens a confirm dialog. Confirming calls `deleteAssignment` and removes the card. A non-DRAFT assignment does not show the Remove button.
11. In the DB: `load_driver_assignments` row has `template_id` set to the source template's ID, and all pay fields match the template at time of assignment. Editing another load's assignment does not change this row.
12. All 7 `snapshot.test.ts` tests pass. All 5 `load-driver-assignments.test.ts` tests pass.
13. No raw `Number()` used for Decimal math in server actions — only `new Prisma.Decimal(v)` for conversions.
</verification>

<success_criteria>
- All 11 files created or modified per the file list above.
- `npx tsc --noEmit` is clean — zero errors in both `packages/validation` and `apps/web`.
- `createAssignment` snapshots the driver's active template fields into the `LoadDriverAssignment` row at creation time and never reads from the template again for that assignment.
- Override validation: `updateAssignment` returns the exact error string "A reason is required when overriding pay terms..." if any overrideable field differs from the template snapshot and `overrideReason` is absent or under 10 chars.
- MAIN_DRIVER uniqueness enforced at app layer: second MAIN_DRIVER attempt returns the exact error "Cannot assign a second main driver to this load..."
- `deleteAssignment` returns the exact error "Only draft assignments can be removed." for non-DRAFT payStatus.
- `computeIsOverride` is a pure function with no side effects and no imports from server-only modules.
- Color tokens used correctly: green for inherited pay banner, amber for override banner and hint chips.
- `toast` imported from `sonner` in all client components — never from shadcn or react-hot-toast.
- All 12 tests (7 + 5) pass with `npx vitest run`.
</success_criteria>

<output>
After completion, create `.planning/quick/298-driver-pay-phase-3-assignment-snapshot/298-SUMMARY.md` documenting:
- Files added and modified
- Key implementation notes: snapshot strategy, CarrierDriver orgId scoping, computeIsOverride client/server dual use, holiday detection approach
- Any deviations from the plan and rationale
- Manual test checklist results (steps 1–13 from verification section)
</output>
