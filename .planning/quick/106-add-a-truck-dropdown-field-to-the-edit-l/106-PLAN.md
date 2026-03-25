---
phase: quick-106
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - packages/validation/src/load.ts
  - apps/web/src/components/loads/load-form.tsx
  - apps/web/src/app/(owner)/actions/loads.ts
  - apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
  - apps/web/src/app/(owner)/loads/new/page.tsx
autonomous: true

must_haves:
  truths:
    - "Truck dropdown appears after Driver dropdown on both New Load and Edit Load forms"
    - "Truck dropdown lists all tenant trucks by year/make/model and is optional"
    - "Selecting a truck saves truckId to the Load record"
    - "Editing a load with an existing truckId pre-selects the correct truck"
    - "Leaving truck unselected saves null for truckId"
  artifacts:
    - path: "packages/validation/src/load.ts"
      provides: "truckId field in loadCreateSchema/loadUpdateSchema"
      contains: "truckId"
    - path: "apps/web/src/components/loads/load-form.tsx"
      provides: "Truck dropdown select element"
      contains: "truckId"
    - path: "apps/web/src/app/(owner)/actions/loads.ts"
      provides: "truckId read from formData and persisted to DB"
      contains: "truckId"
  key_links:
    - from: "apps/web/src/components/loads/load-form.tsx"
      to: "apps/web/src/app/(owner)/actions/loads.ts"
      via: "form field name='truckId'"
      pattern: "name=\"truckId\""
    - from: "apps/web/src/app/(owner)/actions/loads.ts"
      to: "prisma.load.create / prisma.load.update"
      via: "truckId in data object"
      pattern: "truckId.*result\\.data\\.truckId"
---

<objective>
Add a Truck dropdown field to the shared LoadForm component so it appears on both the New Load and Edit Load pages. The field should appear after the Driver dropdown, be optional, list all tenant trucks, and persist truckId on the Load record.

Purpose: Allow owners/managers to assign a truck when creating or editing a load (not just during dispatch).
Output: Working truck dropdown on both New Load and Edit Load forms, saving truckId to the database.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/loads/load-form.tsx
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
@apps/web/src/app/(owner)/loads/new/page.tsx
@packages/validation/src/load.ts
@apps/web/prisma/schema.prisma (Load model at ~line 868, Truck model at ~line 193)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add truckId to validation schema and server actions</name>
  <files>
    packages/validation/src/load.ts
    apps/web/src/app/(owner)/actions/loads.ts
  </files>
  <action>
    1. In `packages/validation/src/load.ts`, add `truckId` to `loadCreateSchema` (and therefore `loadUpdateSchema` which inherits from it). Use the same pattern as `driverId`: `truckId: z.string().uuid().optional().or(z.literal(''))`.

    2. In `apps/web/src/app/(owner)/actions/loads.ts`:
       - In `createLoad` function: extract `truckId` from formData the same way as `driverId` — `truckId: (formData.get('truckId') as string) || ''`. Add it to the `rawData` object. In the `prisma.load.create` data, add `truckId: result.data.truckId || null`.
       - In `updateLoad` function: same extraction of `truckId` from formData into `rawData`. In the `prisma.load.update` data, add `truckId: result.data.truckId || null`.
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit` to confirm no type errors. The validation package should also compile cleanly.</verify>
  <done>Both loadCreateSchema and loadUpdateSchema accept optional truckId. Both createLoad and updateLoad server actions read truckId from form data and persist it to the database.</done>
</task>

<task type="auto">
  <name>Task 2: Add Truck dropdown to LoadForm and fetch trucks in page components</name>
  <files>
    apps/web/src/components/loads/load-form.tsx
    apps/web/src/app/(owner)/loads/[id]/edit/page.tsx
    apps/web/src/app/(owner)/loads/new/page.tsx
  </files>
  <action>
    1. In `apps/web/src/components/loads/load-form.tsx`:
       - Add `truckId?: string | null` to the `initialData` interface.
       - Add `trucks?: Array<{ id: string; year: number; make: string; model: string; licensePlate: string }>` to `LoadFormProps`.
       - Default `trucks` to `[]` in the destructured props (same pattern as `drivers`).
       - Add a Truck `<select>` immediately after the Driver `<select>` block (after the closing `</div>` of the driverId field, around line 103). Follow the exact same pattern as the Driver dropdown:
         ```
         <div>
           <label htmlFor="truckId" className={labelClass}>
             Truck <span className="text-xs text-muted-foreground font-normal">(optional)</span>
           </label>
           <select
             id="truckId"
             name="truckId"
             defaultValue={initialData?.truckId || ''}
             disabled={isPending}
             className={inputClass}
           >
             <option value="">No truck assigned</option>
             {trucks.map((t) => (
               <option key={t.id} value={t.id}>
                 {t.year} {t.make} {t.model} — {t.licensePlate}
               </option>
             ))}
           </select>
         </div>
         ```

    2. In `apps/web/src/app/(owner)/loads/[id]/edit/page.tsx`:
       - Add a `trucks` query to the `Promise.all`: `prisma.truck.findMany({ where: { archivedAt: null }, select: { id: true, year: true, make: true, model: true, licensePlate: true }, orderBy: [{ year: 'desc' }, { make: 'asc' }] })`.
       - Update the destructuring to include `trucks`.
       - Add `truckId: load.truckId` to the `initialData` prop passed to `<LoadForm>`.
       - Pass `trucks={trucks}` prop to `<LoadForm>`.

    3. In `apps/web/src/app/(owner)/loads/new/page.tsx`:
       - Add a `trucks` query to the `Promise.all` (same query as edit page).
       - Update the destructuring to include `trucks`.
       - Pass `trucks={trucks}` prop to `<LoadForm>`.
  </action>
  <verify>Run `cd apps/web && npx tsc --noEmit`. Then run `npm run dev` and visit `/loads/new` — confirm Truck dropdown appears after Driver. Visit an existing load's edit page — confirm Truck dropdown appears and pre-selects if a truck was previously assigned via dispatch.</verify>
  <done>Truck dropdown renders on both New Load and Edit Load forms, displays all tenant trucks as "Year Make Model — Plate", pre-selects existing truckId on edit, and submitting the form persists the selected truckId (or null if none selected).</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with no errors
2. Visit `/loads/new` — Truck dropdown visible after Driver, lists all trucks, is optional
3. Create a load with a truck selected — load detail page shows the truck
4. Edit that load — truck is pre-selected in the dropdown
5. Edit the load and clear the truck — truckId saved as null
</verification>

<success_criteria>
- Truck dropdown appears on both New Load and Edit Load forms, positioned after Driver
- Dropdown lists all non-archived tenant trucks as "Year Make Model — Plate"
- Field is optional (default: "No truck assigned")
- Saving a load with a truck selected persists truckId to the database
- Editing a load with existing truckId pre-selects the correct truck
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/106-add-a-truck-dropdown-field-to-the-edit-l/106-SUMMARY.md`
</output>
