---
phase: 289-driver-pay-phase-2-compensation-template
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/validation/src/driver-compensation.ts
  - packages/validation/src/index.ts
  - apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
  - apps/web/src/app/(owner)/drivers/[id]/page.tsx
  - apps/web/src/app/(owner)/drivers/[id]/compensation/page.tsx
  - apps/web/src/app/(owner)/drivers/[id]/compensation/wizard/page.tsx
  - apps/web/src/components/driver-compensation/active-template-card.tsx
  - apps/web/src/components/driver-compensation/template-history.tsx
  - apps/web/src/components/driver-compensation/wizard/wizard-step-1-pay-model.tsx
  - apps/web/src/components/driver-compensation/wizard/wizard-step-2-rate-and-unit.tsx
  - apps/web/src/components/driver-compensation/wizard/wizard-step-3-add-ons.tsx
  - apps/web/src/components/driver-compensation/wizard/live-preview-panel.tsx
  - apps/web/src/components/driver-compensation/wizard/confirmation-card.tsx
  - apps/web/src/components/driver-compensation/wizard/starter-templates.ts
autonomous: true

must_haves:
  truths:
    - "Owner can navigate from driver profile to a Compensation page"
    - "Owner can launch the 3-step wizard from the Compensation page"
    - "Owner picks a pay model (CPM/Hourly/Flat/Percentage/Daily/Salary), or copies an existing template, or applies a starter template"
    - "Wizard rate+unit step shows smart defaults driven by the chosen pay model and validates input"
    - "Wizard add-ons step toggles overtime, per diem, and fuel surcharge with detail fields revealed conditionally"
    - "Live preview shows '$X.XX on a typical 412-mile load' updating as the form changes"
    - "Saving creates a new DriverCompensationTemplate row, closes the prior active template's effectiveTo, and shows the success toast"
    - "Active template card displays pay type, base rate, unit, add-on chips, and Effective since [date]"
    - "Active template card shows amber 'Ending soon' badge when effectiveTo is within 7 days"
    - "Template history shows all prior templates with effective ranges"
    - "Empty state appears when the driver has no active template"
  artifacts:
    - path: "packages/validation/src/driver-compensation.ts"
      provides: "Zod schemas for create/update with refinements (base_rate>0, percentage<=1, OT/perDiem requires details)"
      exports: ["driverCompensationTemplateCreateSchema", "DriverCompensationTemplateCreateInput"]
    - path: "packages/validation/src/index.ts"
      provides: "Re-export of driver-compensation schemas"
      contains: "export * from './driver-compensation'"
    - path: "apps/web/src/app/(owner)/actions/driver-compensation-templates.ts"
      provides: "Server actions: listTemplatesForDriver, getActiveTemplate, createTemplate, getCopyableTemplates"
      exports: ["listTemplatesForDriver", "getActiveTemplate", "createTemplate", "getCopyableTemplates"]
    - path: "apps/web/src/app/(owner)/drivers/[id]/compensation/page.tsx"
      provides: "Compensation page (server component) with active template card + history + 'Create/Replace' CTA"
    - path: "apps/web/src/app/(owner)/drivers/[id]/compensation/wizard/page.tsx"
      provides: "3-step wizard route, hoisted state via useState, live preview, save handler"
    - path: "apps/web/src/components/driver-compensation/wizard/starter-templates.ts"
      provides: "5 hard-coded starter template presets"
      contains: "STARTER_TEMPLATES"
  key_links:
    - from: "apps/web/src/app/(owner)/drivers/[id]/page.tsx"
      to: "/drivers/[id]/compensation"
      via: "Compensation section card with link"
      pattern: "/compensation"
    - from: "apps/web/src/app/(owner)/drivers/[id]/compensation/page.tsx"
      to: "actions/driver-compensation-templates"
      via: "getActiveTemplate + listTemplatesForDriver server-side calls"
      pattern: "getActiveTemplate|listTemplatesForDriver"
    - from: "apps/web/src/app/(owner)/drivers/[id]/compensation/wizard/page.tsx"
      to: "actions/driver-compensation-templates"
      via: "createTemplate server action invocation from client"
      pattern: "createTemplate"
    - from: "wizard step components"
      to: "live-preview-panel.tsx"
      via: "shared wizard form state + decimal.js calc"
      pattern: "decimal\\.js|new Decimal"
---

<objective>
Build Phase 2 of the Driver Pay module: a 3-step compensation template wizard with live preview, starter templates, an active-template summary card, and history view — all wired to existing Phase 1 schema (DriverCompensationTemplate).

Purpose: Allow owners/managers to define how each driver gets paid (CPM, Hourly, Flat, Percentage, Daily, Salary) with optional overtime, per diem, and fuel surcharge add-ons. Templates feed downstream payroll calculations.

Output: New compensation page nested under driver profile, wizard route, starter template presets, server actions with proper RLS handling for CarrierDriver, and Zod validation in shared validation package.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/actions/payroll.ts
@apps/web/src/app/(owner)/drivers/[id]/page.tsx
@packages/validation/src/payroll.ts
@packages/validation/src/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Validation schemas + server actions (data layer)</name>
  <files>
    packages/validation/src/driver-compensation.ts
    packages/validation/src/index.ts
    apps/web/src/app/(owner)/actions/driver-compensation-templates.ts
  </files>
  <action>
    1. Create `packages/validation/src/driver-compensation.ts`:
       - Import `z` from `zod`.
       - Mirror the enums from Prisma as Zod enums:
         - `payTypeSchema = z.enum(['CPM','HOURLY','FLAT_PER_LOAD','PERCENTAGE','DAILY','SALARY'])`
         - `rateUnitSchema = z.enum(['PER_MILE','PER_HOUR','PER_LOAD','PER_DAY','PERCENTAGE','ANNUAL'])`
         - `employmentTypeSchema = z.enum(['EMPLOYEE','CONTRACTOR','OWNER_OPERATOR'])` (match the Prisma enum exactly — open `apps/web/src/generated/prisma/index.d.ts` and grep for `EmploymentType` if values differ).
       - Build `driverCompensationTemplateCreateSchema = z.object({...})` with:
         - employmentType: employmentTypeSchema
         - payType: payTypeSchema
         - baseRate: z.string().refine(v => !isNaN(Number(v)) && Number(v) > 0, 'Base rate must be > 0')
         - rateUnit: rateUnitSchema
         - loadedMilesOnly: z.boolean().optional().default(false)
         - fuelSurchargeRate: z.string().optional().nullable()
         - perDiemEnabled: z.boolean().optional().default(false)
         - perDiemRate: z.string().optional().nullable()
         - overtimeEligible: z.boolean().optional().default(false)
         - overtimeThresholdHours: z.string().optional().nullable()
         - overtimeMultiplier: z.string().optional().nullable()
         - dailyOvertimeThreshold: z.string().optional().nullable()
         - weeklyEarningGoal: z.string().optional().nullable()
         - currency: z.string().default('USD')
         - effectiveFrom: z.string().refine(v => !isNaN(Date.parse(v)), 'Invalid date')
         - notes: z.string().optional().nullable()
       - Add `.superRefine` to enforce:
         - if `payType === 'PERCENTAGE'`, `Number(baseRate) <= 1` else error path `baseRate`
         - if `overtimeEligible === true`, `overtimeThresholdHours` and `overtimeMultiplier` must be present and numeric
         - if `perDiemEnabled === true`, `perDiemRate` must be present and numeric
       - Export inferred type `DriverCompensationTemplateCreateInput = z.infer<typeof driverCompensationTemplateCreateSchema>`.

    2. Add `export * from './driver-compensation'` to `packages/validation/src/index.ts`.

    3. Create `apps/web/src/app/(owner)/actions/driver-compensation-templates.ts`:
       - `'use server'` directive.
       - Imports: `ActionState` from `@drivecommand/types`, `requireRole`/`requireAuth` from `@/lib/auth/supabase`, `UserRole` from `@/lib/auth/roles`, `getTenantPrisma`/`requireTenantId` from `@/lib/context/tenant-context`, `Prisma` from `@/generated/prisma`, `driverCompensationTemplateCreateSchema` and the input type from `@drivecommand/validation`, `revalidatePath` from `next/cache`. `const Decimal = Prisma.Decimal`.

       - `listTemplatesForDriver(driverId: string)` — `driverId` here is `User.id`:
         - `requireRole([UserRole.OWNER, UserRole.MANAGER])`
         - `tenantId = await requireTenantId()`, `prisma = await getTenantPrisma()`
         - **CarrierDriver lookup is NOT auto-tenant-scoped** — manually filter:
           `const cd = await prisma.carrierDriver.findFirst({ where: { userId: driverId, orgId: tenantId } })`
         - if `!cd` return `{ data: [] }`
         - Query templates: `prisma.driverCompensationTemplate.findMany({ where: { driverId: cd.id }, orderBy: { effectiveFrom: 'desc' } })` (tenant auto-injected)
         - Return `{ data: templates }` (serialize Decimal to string for client transit)

       - `getActiveTemplate(driverId: string)`:
         - Same auth + lookup as above.
         - `prisma.driverCompensationTemplate.findFirst({ where: { driverId: cd.id, effectiveTo: null, deletedAt: null } })`
         - Return `{ data: template | null }` with Decimal fields serialized.

       - `createTemplate(driverId: string, input: DriverCompensationTemplateCreateInput): Promise<ActionState<{ id: string }>>`:
         - `requireRole([UserRole.OWNER, UserRole.MANAGER])`
         - `userId = await requireAuth()`, `tenantId = await requireTenantId()`, `prisma = await getTenantPrisma()`
         - Validate via `driverCompensationTemplateCreateSchema.safeParse(input)`. If fail, return `{ error: result.error.flatten().fieldErrors }`.
         - Look up CarrierDriver: `const cd = await prisma.carrierDriver.findFirst({ where: { userId: driverId, orgId: tenantId } })`. If `!cd` return `{ error: 'Driver not found.' }`.
         - `prisma.$transaction(async (tx) => { ... })`:
           - Find the current active template: `tx.driverCompensationTemplate.findFirst({ where: { driverId: cd.id, effectiveTo: null, deletedAt: null } })`.
           - If found: set `effectiveTo` to `new Date(effectiveFrom).getTime() - 86400000` (one day before new start) — `tx.driverCompensationTemplate.update({ where: { id: prev.id }, data: { effectiveTo: new Date(prevDate) } })`.
           - Create the new template with all fields, converting numeric strings to `new Decimal(...)`. Set `tenantId`, `driverId: cd.id`, `createdBy: userId`. Return new id.
         - On `Prisma.PrismaClientKnownRequestError`, return generic `{ error: 'Failed to create template.' }`.
         - `revalidatePath(\`/drivers/${driverId}/compensation\`)`
         - Return `{ data: { id: newId } }`.

       - `getCopyableTemplates()`:
         - `requireRole([UserRole.OWNER, UserRole.MANAGER])`
         - List active templates across all CarrierDrivers in tenant: `prisma.driverCompensationTemplate.findMany({ where: { effectiveTo: null, deletedAt: null }, include: { driver: { include: { user: { select: { firstName: true, lastName: true } } } } } })`
         - Return shape suitable for a select: `{ data: Array<{ id, driverName, payType, baseRate, rateUnit }> }`.
         - If `driver.user` relation field name differs in Prisma model, inspect `apps/web/src/generated/prisma/index.d.ts` for the actual relation name on `CarrierDriver`.

    4. Run `npx tsc --noEmit` from repo root to confirm types resolve.
  </action>
  <verify>
    - `npx tsc --noEmit` passes for both `packages/validation` and `apps/web`.
    - `grep -n "driverCompensationTemplateCreateSchema" packages/validation/src/driver-compensation.ts` shows the export.
    - `grep -n "from './driver-compensation'" packages/validation/src/index.ts` shows the re-export.
    - `grep -n "carrierDriver.findFirst" apps/web/src/app/\(owner\)/actions/driver-compensation-templates.ts` shows manual orgId filter.
    - `grep -n "$transaction" apps/web/src/app/\(owner\)/actions/driver-compensation-templates.ts` shows the close-and-create transaction.
  </verify>
  <done>
    Zod schemas validate all required refinements (base_rate > 0, percentage cap, conditional OT/perDiem). Server actions enforce OWNER/MANAGER role, manually scope CarrierDriver lookups by orgId, and atomically close+create in a transaction. TypeScript clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: Wizard route + 3 step components + live preview + starter templates</name>
  <files>
    apps/web/src/app/(owner)/drivers/[id]/compensation/wizard/page.tsx
    apps/web/src/components/driver-compensation/wizard/starter-templates.ts
    apps/web/src/components/driver-compensation/wizard/wizard-step-1-pay-model.tsx
    apps/web/src/components/driver-compensation/wizard/wizard-step-2-rate-and-unit.tsx
    apps/web/src/components/driver-compensation/wizard/wizard-step-3-add-ons.tsx
    apps/web/src/components/driver-compensation/wizard/live-preview-panel.tsx
    apps/web/src/components/driver-compensation/wizard/confirmation-card.tsx
  </files>
  <action>
    1. Create `starter-templates.ts` exporting `STARTER_TEMPLATES` (typed array):
       ```ts
       export type StarterTemplate = {
         id: string;
         label: string;
         description: string;
         payType: 'CPM' | 'HOURLY' | 'FLAT_PER_LOAD' | 'PERCENTAGE' | 'DAILY' | 'SALARY';
         rateUnit: 'PER_MILE' | 'PER_HOUR' | 'PER_LOAD' | 'PERCENTAGE' | 'PER_DAY' | 'ANNUAL';
         baseRate: string;
         overtimeEligible: boolean;
         overtimeThresholdHours?: string;
         overtimeMultiplier?: string;
       }
       ```
       Five entries:
       - `standard-otr-cpm`: "Standard OTR CPM", CPM/$0.55/PER_MILE, OT enabled (40h, 1.5x)
       - `local-hourly`: "Local Hourly", HOURLY/$25/PER_HOUR, OT enabled (40h, 1.5x)
       - `hotshot-flat`: "Hotshot Flat", FLAT_PER_LOAD/$300/PER_LOAD, no OT
       - `owner-op-80`: "Owner-Operator 80%", PERCENTAGE/0.80/PERCENTAGE, no OT
       - `dedicated-salary`: "Dedicated Salary", SALARY/$65000/ANNUAL, no OT

    2. Create `wizard/page.tsx`:
       - `'use client'` directive.
       - Define `WizardFormState` type matching `DriverCompensationTemplateCreateInput` plus `currentStep: 1|2|3|'confirm'`.
       - Use `useState<WizardFormState>(initialState)` — DO NOT use `useFormState`/`useActionState`.
       - Read `params.id` (driverId = User.id) via `useParams()`.
       - Render header with breadcrumb back to `/drivers/[id]/compensation`.
       - Render the appropriate step component based on `currentStep`. Pass `state`, `setState`, `goNext`, `goBack` callbacks.
       - Steps 2 and 3 render alongside `<LivePreviewPanel state={state} />` in a 2-column grid (lg:grid-cols-3 with preview spanning col 1).
       - On final confirmation submit:
         - Call `await createTemplate(driverId, payload)` (imported from server actions file — Next.js supports calling server actions from client components).
         - On `data`: `toast.success('Template saved. Active for new loads.')` + `router.push(\`/drivers/${driverId}/compensation\`)`.
         - On `error`: `toast.error('Failed to save template.')` and surface field errors inline.
       - Use shadcn `Button`, `Card`, `Input`, `Label`, `Switch`, `Select`, `RadioGroup` from `@/components/ui/*`.

    3. Create `wizard-step-1-pay-model.tsx`:
       - Render 6 pay model cards in a responsive grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`):
         - CPM, Hourly, Flat per Load, Percentage, Daily, Salary
         - Each card has icon + label + 1-line description; clicking selects and sets `payType` + smart-default `rateUnit` (CPM→PER_MILE, HOURLY→PER_HOUR, FLAT_PER_LOAD→PER_LOAD, PERCENTAGE→PERCENTAGE, DAILY→PER_DAY, SALARY→ANNUAL).
       - Below the grid: two collapsible sections:
         - "Use a starter template" — list `STARTER_TEMPLATES` as cards; clicking applies all fields and jumps to step 3 (skip step 2).
         - "Copy from another driver" — fetch via `getCopyableTemplates()` on mount (`useEffect`), render select; on change applies fields and jumps to step 3.
       - "Continue" button enables when `payType` is set; calls `goNext()`.

    4. Create `wizard-step-2-rate-and-unit.tsx`:
       - Inputs:
         - `baseRate` — number input with currency/percentage prefix based on payType
         - `rateUnit` — `Select` defaulted from step 1 but editable
         - `currency` — `Select` (USD default; CAD optional)
         - `effectiveFrom` — date input, default today
         - `loadedMilesOnly` — `Switch` only shown when payType === CPM
       - Inline validation messages from local refinement (mirror Zod refinements client-side for instant feedback).
       - "Back" + "Continue" buttons.

    5. Create `wizard-step-3-add-ons.tsx`:
       - Three toggle sections (`Switch` + collapsible details):
         - **Overtime** — when on, show `overtimeThresholdHours` (default 40), `overtimeMultiplier` (default 1.5), `dailyOvertimeThreshold` (optional).
         - **Per Diem** — when on, show `perDiemRate` input.
         - **Fuel Surcharge** — when on, show `fuelSurchargeRate` (typically $/mile passthrough).
       - Optional `weeklyEarningGoal` field at the bottom.
       - "Back" + "Review" buttons. Clicking Review sets `currentStep: 'confirm'` and renders `ConfirmationCard`.

    6. Create `live-preview-panel.tsx`:
       - Sticky `Card` showing computed: "On a typical 412-mile load, this driver earns: $X.XX".
       - Use `decimal.js` for math: `import Decimal from 'decimal.js'`.
       - Calculation rules:
         - CPM: `baseRate * 412`
         - HOURLY: `baseRate * 8` (assume 8h average load)
         - FLAT_PER_LOAD: `baseRate`
         - PERCENTAGE: `baseRate * 1500` (assume $1500 typical load gross)
         - DAILY: `baseRate * 1`
         - SALARY: `baseRate / 52 / 5` (per-day estimate from annual)
       - Add per diem ($1 * threshold if enabled) and FSC ($0.05 * 412 if enabled) breakdown lines.
       - Format with `Intl.NumberFormat('en-US', { style: 'currency', currency: state.currency || 'USD' })`.

    7. Create `confirmation-card.tsx`:
       - Render summary of all fields collected in a clean two-column layout.
       - "Edit" buttons jump back to the relevant step.
       - "Save Template" calls the parent submit handler (which invokes `createTemplate`).

    Color tokens per spec 8.2: success = `text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/50`; warning = amber equivalents; primary = shadcn `text-primary bg-primary`.
  </action>
  <verify>
    - `npx tsc --noEmit` passes.
    - `grep -rn "useState" apps/web/src/app/\(owner\)/drivers/\[id\]/compensation/wizard/page.tsx` shows local state (no useFormState/useActionState).
    - `grep -n "decimal.js" apps/web/src/components/driver-compensation/wizard/live-preview-panel.tsx` confirms client-side decimal math.
    - `grep -n "STARTER_TEMPLATES" apps/web/src/components/driver-compensation/wizard/starter-templates.ts | wc -l` shows the export and 5 entries.
    - `grep -n "createTemplate" apps/web/src/app/\(owner\)/drivers/\[id\]/compensation/wizard/page.tsx` confirms server action wiring.
    - Manual: navigate to `/drivers/<id>/compensation/wizard` in dev — wizard renders 3 steps, live preview updates, success toast fires on save.
  </verify>
  <done>
    Wizard renders all 3 steps with shared `useState`, smart defaults flow from step 1 → step 2, add-on toggles reveal detail fields conditionally, live preview shows formatted currency for a 412-mile load that updates on every state change, starter templates and "copy from driver" both populate state and skip step 2, confirmation card shows full summary, save calls `createTemplate` and surfaces success toast.
  </done>
</task>

<task type="auto">
  <name>Task 3: Compensation page + active card + history + driver profile link</name>
  <files>
    apps/web/src/app/(owner)/drivers/[id]/compensation/page.tsx
    apps/web/src/components/driver-compensation/active-template-card.tsx
    apps/web/src/components/driver-compensation/template-history.tsx
    apps/web/src/app/(owner)/drivers/[id]/page.tsx
  </files>
  <action>
    1. Create `compensation/page.tsx` (server component):
       - Receives `params: { id: string }` (driverId = User.id).
       - Calls `getActiveTemplate(params.id)` and `listTemplatesForDriver(params.id)` server-side.
       - Layout: page header with driver name + breadcrumb back to `/drivers/[id]`.
       - Renders `<ActiveTemplateCard template={active} driverId={params.id} />` at top.
       - Renders `<TemplateHistory templates={all} />` below.
       - If `active === null` AND `all.length === 0`: show empty state with primary CTA "Create compensation template" linking to `/drivers/[id]/compensation/wizard`.
       - If `active === null` BUT history exists: show "No active template" empty state with same CTA, then history.

    2. Create `active-template-card.tsx`:
       - Props: `{ template, driverId }`.
       - If `!template`: render the empty state described in spec 8.6 — muted card with icon, "No compensation template set", and primary "Create template" button linking to `/drivers/[id]/compensation/wizard`.
       - Else display:
         - **Header row:** pay type label (humanized: CPM → "Cost Per Mile", etc.), employment type chip.
         - **Rate display:** large formatted base rate + rate unit suffix (e.g., "$0.55 / mile" or "80% of load gross"). Use `Intl.NumberFormat`. For PERCENTAGE pay type render `(Number(baseRate) * 100).toFixed(1)`%.
         - **Add-on chips row:** show colored badges for overtime (`OT after Xh @ Ym`), per diem (`Per diem $X/day`), fuel surcharge (`FSC $X/mi`) — use success token classes.
         - **Effective since [date]** badge using success colors (`text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/50`).
         - **Ending soon badge:** if `template.effectiveTo !== null` and `new Date(effectiveTo) - now <= 7 * 86400000`, render amber badge "Ending soon — [date]".
         - **Action button:** "End and replace" → `<Link href={\`/drivers/${driverId}/compensation/wizard\`}>` styled as primary button.

    3. Create `template-history.tsx`:
       - Props: `{ templates: Template[] }` (already includes the active one — filter to those with `effectiveTo !== null` OR de-emphasize the active one).
       - Render compact `Card` with table-like rows: pay type, base rate + unit, effective range (`effectiveFrom – effectiveTo || 'present'`), notes preview.
       - Sort by `effectiveFrom` desc (already done server-side).
       - Empty state: "No prior templates."

    4. Modify `apps/web/src/app/(owner)/drivers/[id]/page.tsx`:
       - Add a new "Compensation" section card near the bottom (after existing sections, mirroring the "Driver Documents" section style — find that section in the file and copy its `<Card>` shell).
       - Card contents:
         - Header: "Compensation"
         - Body: brief text "Set how this driver is paid (CPM, hourly, flat, percentage, etc.)."
         - Footer / action: `<Button asChild>` containing `<Link href={\`/drivers/${driver.id}/compensation\`}>Manage compensation</Link>`.
       - Do NOT introduce a tab system — the spec confirms a section card linking to a sub-page.

    5. Run `npx tsc --noEmit` and start dev server to manually click through the flow.
  </action>
  <verify>
    - `npx tsc --noEmit` passes.
    - `grep -n "Compensation" apps/web/src/app/\(owner\)/drivers/\[id\]/page.tsx` shows the new section.
    - `grep -n "/compensation" apps/web/src/app/\(owner\)/drivers/\[id\]/page.tsx` shows the link to the sub-page.
    - `grep -n "Effective since" apps/web/src/components/driver-compensation/active-template-card.tsx` confirms badge.
    - `grep -n "Ending soon" apps/web/src/components/driver-compensation/active-template-card.tsx` confirms warning badge logic.
    - Manual: `/drivers/<id>` shows Compensation section → click → `/drivers/<id>/compensation` shows empty state for a driver with no template, then create one via wizard, then return to verify active card displays correctly with chips and effective date.
  </verify>
  <done>
    Driver profile page links to `/drivers/[id]/compensation`. Compensation page calls server actions and renders `ActiveTemplateCard` + `TemplateHistory`. Active card shows formatted rate, employment chip, add-on chips, success-colored "Effective since" badge, amber "Ending soon" badge when within 7 days, and "End and replace" CTA. Empty state appears when no active template. Full TypeScript compile is clean.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes from repo root with zero errors.
2. From driver profile (`/drivers/<userId>`) the Compensation section card is visible and the "Manage compensation" link navigates to `/drivers/<userId>/compensation`.
3. With no template: empty state on compensation page; "Create template" CTA opens wizard.
4. Wizard step 1: clicking each pay model card sets `payType` and a sensible `rateUnit` default; "Use a starter template" applies all fields and skips to step 3; "Copy from another driver" populates a select via `getCopyableTemplates()`.
5. Wizard step 2: rate input validates `> 0`; PERCENTAGE pay type rejects `> 1`; date input has today default.
6. Wizard step 3: overtime, per diem, FSC toggles each reveal their detail fields and require those fields when enabled.
7. Live preview panel updates instantly on every keystroke; uses `decimal.js`; formats with `Intl.NumberFormat`.
8. Confirmation card shows full summary with edit jumps; clicking Save invokes `createTemplate` server action; success toast fires; redirect to `/drivers/<id>/compensation`.
9. After save: previous active template's `effectiveTo` is closed to (new effectiveFrom - 1 day); new template appears as active card.
10. Active template card shows green "Effective since [date]" badge; if `effectiveTo` falls within 7 days, amber "Ending soon" badge appears.
11. Template history shows all prior templates ordered by `effectiveFrom` desc.
12. CarrierDriver queries always include `orgId: tenantId` (no auto RLS).
13. Roles: only `UserRole.OWNER` and `UserRole.MANAGER` may call any server action (verified by `requireRole`).
</verification>

<success_criteria>
- All 13 files created/modified per the file list.
- `npx tsc --noEmit` clean.
- Wizard end-to-end save creates a `DriverCompensationTemplate` row in the DB with all expected fields populated and the prior active template properly closed.
- Active template card and history render correctly for both empty and populated driver states.
- All money math uses `Prisma.Decimal` server-side and `decimal.js` client-side — never raw `Number`.
- All toasts use `import { toast } from 'sonner'`.
- Color tokens match spec 8.2 (success/warning/primary).
</success_criteria>

<output>
After completion, create `.planning/quick/289-driver-pay-phase-2-compensation-template/289-SUMMARY.md` documenting:
- Files added/modified
- Key implementation notes (transaction strategy, RLS handling for CarrierDriver, smart defaults map)
- Any deviations from the plan and rationale
- Manual test checklist results
</output>
