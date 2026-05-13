---
phase: 302-phase-6-gap-fix-auto-base-pay-wiring-act
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
  - packages/validation/src/load-driver-assignment.ts
  - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
  - apps/web/src/components/driver-pay/override-form.tsx
  - apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
  - apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts
autonomous: true

must_haves:
  truths:
    - "Submitting a CPM assignment with actualMiles set auto-creates a BASE_PAY_MILEAGE component"
    - "Submitting a HOURLY assignment with actualHours/estimatedHours auto-creates a BASE_PAY_HOURLY component"
    - "Submitting a FLAT_PER_LOAD / SALARY / PERCENTAGE / DAILY assignment always attempts base-pay creation"
    - "Submitting a CPM assignment with no miles still returns the 422 pre-condition error from the FSM"
    - "Submitting twice is idempotent — duplicate BASE_PAY rows are not created"
    - "Owner can edit actual_miles and mileage_source on an assignment via the override form"
    - "Setting actualMiles without mileageSource returns a validation error (and vice versa)"
    - "actualMiles + mileageSource values round-trip from DB → server action → form → DB update"
  artifacts:
    - path: "apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts"
      provides: "submit branch calls ensureBasePayComponent before FSM check"
      contains: "ensureBasePayComponent"
    - path: "packages/validation/src/load-driver-assignment.ts"
      provides: "actualMiles + mileageSource fields on update schema with cross-field refinement"
      contains: "actualMiles"
    - path: "apps/web/src/app/(owner)/actions/load-driver-assignments.ts"
      provides: "actualMiles + mileageSource on SerializedAssignment, in serializer, and in updateAssignment merge logic"
      contains: "mileageSource"
    - path: "apps/web/src/components/driver-pay/override-form.tsx"
      provides: "actual miles input + mileage source select wired to updateAssignment"
      contains: "mileageSource"
    - path: "apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts"
      provides: "tests for ensureBasePayComponent invocation guards on submit"
      contains: "ensureBasePayComponent"
    - path: "apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts"
      provides: "tests for actualMiles + mileageSource persistence + Pattern B validation"
      contains: "actualMiles"
  key_links:
    - from: "transitions/route.ts (submit branch)"
      to: "lib/driver-pay/auto-base-pay.ts (ensureBasePayComponent)"
      via: "direct import + call before components reload"
      pattern: "ensureBasePayComponent\\(assignmentId"
    - from: "override-form.tsx"
      to: "updateAssignment server action"
      via: "actualMiles + mileageSource in input payload"
      pattern: "actualMiles:.*mileageSource:"
    - from: "loadDriverAssignmentUpdateSchema"
      to: "Prisma loadDriverAssignment.update"
      via: "merged fields in actions/load-driver-assignments.ts"
      pattern: "mergedActualMiles|mergedMileageSource"
---

<objective>
Close two Phase 6 gaps that block real-world submit-for-review use:

1. The submit transition currently 422s when no BASE_PAY component exists. The auto-base-pay helper (`ensureBasePayComponent`) exists but is never called by the submit endpoint. Wire it in (guarded for CPM/HOURLY cases with no quantity data).
2. The override form has no way to enter `actual_miles` or `mileage_source`. Without these, CPM submissions can't gather the data the FSM needs to auto-create base pay. Add the fields end-to-end (validation schema → server action → form UI).

Purpose: Unblock the submit-for-review workflow for CPM assignments without forcing users to manually create BASE_PAY rows.

Output: Working submit transition that auto-creates base pay; owner-editable actual_miles + mileage_source fields; tests covering both flows.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/301-driver-pay-phase-6-state-machine-approva/301-SUMMARY.md

# Files that will be modified (read for context before editing)
@apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
@apps/web/src/lib/driver-pay/auto-base-pay.ts
@packages/validation/src/load-driver-assignment.ts
@apps/web/src/app/(owner)/actions/load-driver-assignments.ts
@apps/web/src/components/driver-pay/override-form.tsx

# Existing tests (patterns + extensions)
@apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
@apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire ensureBasePayComponent into submit transition + extend tests</name>
  <files>
    apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
    apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
  </files>
  <action>
In `transitions/route.ts`:

1. Add import at the top:
   ```ts
   import { ensureBasePayComponent } from '@/lib/driver-pay/auto-base-pay';
   ```

2. Between step 4 (load assignment) and step 5 (load components), insert a NEW step that only runs when `body.action === 'submit'`:

   - Compute a `shouldEnsureBasePay` boolean by switching on `assignment.payType`:
     - `CPM`: true only if `assignment.actualMiles != null || assignment.estimatedMiles != null`
     - `HOURLY`: true only if `assignment.actualHours != null || assignment.estimatedHours != null`
     - all other pay types (`FLAT_PER_LOAD`, `SALARY`, `PERCENTAGE`, `DAILY`): always true
   - If `shouldEnsureBasePay`, call:
     ```ts
     await ensureBasePayComponent(
       assignmentId,
       assignment.tenantId,
       prisma as unknown as PrismaClient,
       session.userId,
     );
     ```
     (Cast is needed because `getTenantPrisma()` returns a proxied client; `ensureBasePayComponent` is typed to `PrismaClient`. Import the type alongside `Prisma`:
     `import type { PrismaClient } from '@/generated/prisma';`)

3. Step 5 (existing `prisma.loadPayComponent.findMany`) stays unchanged — it now runs AFTER potential creation so the FSM sees the new BASE_PAY row.

4. If `shouldEnsureBasePay` was false (CPM/HOURLY with no miles/hours), do nothing — the existing `canTransition` call in step 7 will see an empty components list and return the existing 422 pre-condition error. No new error path required.

Rationale for guard: `ensureBasePayComponent` would write a zero-amount BASE_PAY row when given no actuals/estimates, which would silently bypass the FSM's "needs base pay" gate. The guard preserves the gate's intent for CPM/HOURLY while enabling auto-creation everywhere else.

In `transitions-api.test.ts`:

1. Add a new mock at the top alongside existing mocks (after the `next/cache` mock):
   ```ts
   vi.mock('@/lib/driver-pay/auto-base-pay', () => ({
     ensureBasePayComponent: vi.fn().mockResolvedValue(undefined),
   }));
   ```
   And import it: `import { ensureBasePayComponent } from '@/lib/driver-pay/auto-base-pay';`

2. Add a new `describe('submit auto-base-pay wiring', ...)` block with three tests:

   **Test (a) — CPM with actualMiles → ensureBasePayComponent called once:**
   - Build assignment with `payType: 'CPM'`, `actualMiles: { toString: () => '412' }`, `estimatedMiles: { toString: () => '400' }`, `payStatus: 'DRAFT'`.
   - Mock `getSession` to return owner. Mock `getTenantPrisma` to return `makePrisma()` with that assignment. Mock `canTransition` to return `{ ok: true, nextStatus: 'PENDING_REVIEW' }`.
   - POST `{ action: 'submit' }`.
   - Expect response 200 AND `expect(ensureBasePayComponent).toHaveBeenCalledTimes(1)` AND `expect(ensureBasePayComponent).toHaveBeenCalledWith(ASSIGNMENT_ID, 'tenant-123', expect.anything(), expect.any(String))`.

   **Test (b) — FLAT_PER_LOAD always calls ensureBasePayComponent (no quantity fields needed):**
   - Build assignment with `payType: 'FLAT_PER_LOAD'`, `actualMiles: null`, `estimatedMiles: null`.
   - POST `{ action: 'submit' }`. Expect `ensureBasePayComponent` called once.

   **Test (c) — CPM with no miles → NOT called, returns 422 pre-condition error from FSM:**
   - Build assignment with `payType: 'CPM'`, `actualMiles: null`, `estimatedMiles: null`.
   - Mock `canTransition` to return `{ ok: false, reason: 'Add a base pay component before submitting.', actionHint: 'add-base-pay' }`.
   - POST `{ action: 'submit' }`.
   - Expect status 422 AND `expect(ensureBasePayComponent).not.toHaveBeenCalled()`.

3. Add `vi.clearAllMocks()` in the existing `beforeEach` if not already present so call counts reset per test.

4. Update the existing `makeDbAssignment` helper signature: it must now also be able to set `estimatedMiles`, `actualHours`, `estimatedHours` — add them as `null` defaults in the base object so spread overrides work.

Do not modify the FSM itself, the existing `approve` / `reject` / `dispute` flows, or any other test in the file.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/transitions-api.test.ts
  </verify>
  <done>
- TypeScript passes from apps/web.
- All existing transitions-api tests still pass.
- Three new tests pass: CPM-with-miles calls ensureBasePayComponent, FLAT_PER_LOAD always calls it, CPM-with-no-miles does not and returns 422.
- `ensureBasePayComponent` is invoked for `submit` actions only — never for approve/reject/dispute (verified by grepping for the call inside the `if (body.action === 'submit')` block).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add actualMiles + mileageSource to validation schema and server action</name>
  <files>
    packages/validation/src/load-driver-assignment.ts
    apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts
  </files>
  <action>
In `packages/validation/src/load-driver-assignment.ts`:

1. Add two new optional/nullable fields to `loadDriverAssignmentUpdateSchema`:
   ```ts
   actualMiles: z
     .string()
     .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, 'Must be >= 0')
     .refine((v) => {
       const parts = v.split('.');
       return !parts[1] || parts[1].length <= 4;
     }, 'Maximum 4 decimal places')
     .nullable()
     .optional(),
   mileageSource: z
     .enum(['PCMILER', 'GOOGLE', 'ELD', 'MANUAL', 'RAND_MCNALLY'])
     .nullable()
     .optional(),
   ```

2. Convert the bare `z.object({...})` export into a chained `.superRefine` to enforce the cross-field rule (Pattern B — both required together when either is provided):
   ```ts
   export const loadDriverAssignmentUpdateSchema = z
     .object({ /* existing fields + new ones above */ })
     .superRefine((data, ctx) => {
       const hasActual = data.actualMiles != null && data.actualMiles !== '';
       const hasSource = data.mileageSource != null;
       if (hasActual && !hasSource) {
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['mileageSource'],
           message: 'Mileage source is required when actual miles is set.',
         });
       }
       if (hasSource && !hasActual) {
         ctx.addIssue({
           code: z.ZodIssueCode.custom,
           path: ['actualMiles'],
           message: 'Actual miles is required when mileage source is set.',
         });
       }
     });
   ```
   Keep the `LoadDriverAssignmentUpdateInput` type export (`z.infer` continues to work on the refined schema).

In `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`:

1. Extend the `SerializedAssignment` type with:
   ```ts
   actualMiles: string | null;
   mileageSource: string | null;
   ```

2. Extend the `serializeAssignment` function's input type (the inline object type at the function param) with:
   ```ts
   actualMiles: Prisma.Decimal | null;
   mileageSource: string | null;
   ```
   And include them in the returned object:
   ```ts
   actualMiles: serializeDecimal(a.actualMiles),
   mileageSource: a.mileageSource ?? null,
   ```

3. In `listAssignmentsForLoad`, the `findMany` does not currently select specific fields (it returns everything), so `actualMiles` and `mileageSource` are already in the row payload — no change to the query, just confirm by reading: the function destructures `rows.map(serializeAssignment)` and the runtime row will carry the new fields once we widen the param type.

4. In `updateAssignment`, after the existing `mergedEstimatedMiles` line, add merge handling for both new fields:
   ```ts
   const mergedActualMiles =
     data.actualMiles !== undefined
       ? data.actualMiles != null && data.actualMiles !== ''
         ? new Decimal(data.actualMiles)
         : null
       : existing.actualMiles;
   const mergedMileageSource =
     data.mileageSource !== undefined ? data.mileageSource : existing.mileageSource;
   ```

5. In the `prisma.loadDriverAssignment.update({ data: {...} })` call inside `updateAssignment`, add:
   ```ts
   actualMiles: mergedActualMiles,
   mileageSource: mergedMileageSource as
     | 'PCMILER'
     | 'GOOGLE'
     | 'ELD'
     | 'MANUAL'
     | 'RAND_MCNALLY'
     | null,
   ```

In `apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts`:

Add a new `describe('updateAssignment — actual miles + mileage source', ...)` block at the end of the file with two tests:

**Test (d) — persists actualMiles + mileageSource:**
- Set up an `existing` row returned by `findFirst` with `payType: 'CPM'`, `templateId: null`, all decimal fields as Decimal instances, `actualMiles: null`, `mileageSource: null`.
- Call `updateAssignment(assignmentId, { actualMiles: '412', mileageSource: 'MANUAL' })`.
- Assert `prisma.loadDriverAssignment.update` was called with a `data` object containing `mileageSource: 'MANUAL'` and an `actualMiles` matching a Decimal of '412' (use `expect.objectContaining` with a custom matcher or `toString()` check).

**Test (e) — Pattern B violation returns validation error:**
- Call `updateAssignment(assignmentId, { actualMiles: '412' })` (mileageSource omitted).
- Assert result has `error` defined and contains the string `mileageSource` (the flattened field error key).
- Assert `prisma.loadDriverAssignment.update` was NOT called.

Follow the existing test file's prisma mock pattern (`makePrisma` helper). Use `template: null` on the existing row so the override-reason check is skipped (the merge logic still works without a template).

Do NOT touch the schema.prisma file. The `actualMiles` and `mileageSource` columns already exist on `LoadDriverAssignment` (confirmed by their presence in `transitions/route.ts` serializer).
  </action>
  <verify>
cd packages/validation && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
cd apps/web && npx vitest run "src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts"
  </verify>
  <done>
- Both packages typecheck.
- New tests (d) + (e) pass; existing tests in the file still pass.
- `loadDriverAssignmentUpdateSchema.parse({ actualMiles: '412', mileageSource: 'MANUAL' })` succeeds.
- `loadDriverAssignmentUpdateSchema.safeParse({ actualMiles: '412' })` returns `success: false` with an issue at path `['mileageSource']`.
- `SerializedAssignment.actualMiles` and `.mileageSource` are accessible from any consumer importing the type.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add actual miles + mileage source fields to override form</name>
  <files>
    apps/web/src/components/driver-pay/override-form.tsx
  </files>
  <action>
Modify `override-form.tsx`:

1. Add two new state variables after the existing `perDiemRate` state (around line 33):
   ```ts
   const [actualMiles, setActualMiles] = useState(assignment.actualMiles ?? '');
   const [mileageSource, setMileageSource] = useState(assignment.mileageSource ?? '');
   ```

2. Extend the `isDirty` check to include both new fields:
   ```ts
   (actualMiles || null) !== assignment.actualMiles ||
   (mileageSource || null) !== assignment.mileageSource ||
   ```
   Insert these lines inside the existing `isDirty` expression.

3. Add a client-side Pattern B guard in `handleSubmit` BEFORE calling `updateAssignment` (after the existing `isDirty && overrideReason.trim().length < 10` check):
   ```ts
   const hasActual = actualMiles.trim() !== '';
   const hasSource = mileageSource.trim() !== '';
   if (hasActual !== hasSource) {
     setSubmitError(
       'Both Actual miles and Mileage source must be set together (or both left blank).',
     );
     return;
   }
   ```

4. Wire the new fields into the `updateAssignment` call:
   ```ts
   const result = await updateAssignment(assignment.id, {
     payType,
     baseRate,
     rateUnit,
     loadedMilesOnly,
     fuelSurchargeRate: fuelSurchargeRate || null,
     perDiemEnabled,
     perDiemRate: perDiemRate || null,
     estimatedMiles: null,
     actualMiles: actualMiles || null,
     mileageSource: mileageSource || null,
     overrideReason,
   });
   ```

5. Reflect both fields in the reconstructed `updated: SerializedAssignment`:
   ```ts
   actualMiles: actualMiles || null,
   mileageSource: mileageSource || null,
   ```

6. Insert a NEW full-width row in the JSX AFTER the closing `</div>` of the `grid grid-cols-2 gap-3` block (line 154) and BEFORE the `<div className="flex items-center gap-3">` for `loadedMilesOnly` (line 156):
   ```tsx
   <div className="grid grid-cols-2 gap-3">
     <div className="space-y-1">
       <Label htmlFor="actualMiles">Actual miles</Label>
       <div className="flex items-center gap-2">
         <Input
           id="actualMiles"
           type="number"
           inputMode="numeric"
           min="0"
           step="0.0001"
           placeholder={assignment.estimatedMiles ?? 'Optional'}
           value={actualMiles}
           onChange={(e) => setActualMiles(e.target.value)}
           className="w-[14ch]"
         />
         <span className="text-sm text-muted-foreground">mi</span>
       </div>
     </div>

     <div className="space-y-1">
       <Label htmlFor="mileageSource">Mileage source</Label>
       <Select value={mileageSource} onValueChange={setMileageSource}>
         <SelectTrigger id="mileageSource">
           <SelectValue placeholder="Select source" />
         </SelectTrigger>
         <SelectContent>
           <SelectItem value="PCMILER">PC*MILER</SelectItem>
           <SelectItem value="GOOGLE">Google Maps</SelectItem>
           <SelectItem value="ELD">ELD</SelectItem>
           <SelectItem value="MANUAL">Manual</SelectItem>
           <SelectItem value="RAND_MCNALLY">Rand McNally</SelectItem>
         </SelectContent>
       </Select>
     </div>
   </div>
   ```

UI/UX notes (DriveCommand stack: Next.js + Tailwind + shadcn/ui, dark mode supported):
- Use existing shadcn `Input`, `Label`, `Select` components — already imported.
- Keep the existing semantic spacing (`space-y-4 pt-3 border-t` on the wrapper).
- The `w-[14ch]` keeps the numeric input compact and visually distinct.
- `text-muted-foreground` for the "mi" suffix matches existing token-driven theming.
- Both fields are visually paired in a 2-col grid so the relationship is obvious (mirrors the Pattern B "both or neither" requirement).
- No new icons, no new variants — pure composition of existing primitives.

Do not change the Rate Unit Select, Base Rate Input, or any other existing field. Do not add new shadcn components. Do not introduce a separate stand-alone section header.
  </action>
  <verify>
cd apps/web && npx tsc --noEmit
cd apps/web && npx eslint src/components/driver-pay/override-form.tsx
  </verify>
  <done>
- TypeScript passes.
- No ESLint errors on the modified file.
- Form renders two new inputs paired in a grid row above the "Loaded miles only" toggle.
- Entering `actualMiles` without `mileageSource` (or vice versa) on submit shows the client-side Pattern B error and does NOT call the server action.
- Entering both saves successfully and the toast + `onSaved` callback fire with the updated assignment.
- The placeholder on `Actual miles` shows the existing `estimatedMiles` value when present.
  </done>
</task>

</tasks>

<verification>
## Overall Phase Checks

1. **End-to-end submit flow:**
   ```bash
   cd apps/web && npx tsc --noEmit
   cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/transitions-api.test.ts
   cd apps/web && npx vitest run "src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts"
   ```

2. **Manual smoke (optional, document in summary):**
   - Open a CPM load → enter actualMiles + mileageSource → save → click Submit for review → assignment status flips to PENDING_REVIEW AND a BASE_PAY_MILEAGE component appears.
   - Open a FLAT_PER_LOAD load → click Submit for review → assignment status flips to PENDING_REVIEW AND a BASE_PAY_FLAT component appears.
   - Open a CPM load with no miles → click Submit for review → still see the existing 422 "needs base pay" error.

3. **No regressions:**
   ```bash
   cd apps/web && npx vitest run src/app/api/driver-pay/__tests__
   ```
   All five `__tests__/*-api.test.ts` files continue to pass.
</verification>

<success_criteria>
- [ ] `transitions/route.ts` imports and conditionally calls `ensureBasePayComponent` on submit actions only.
- [ ] Guard prevents zero-quantity BASE_PAY rows for CPM (no miles) and HOURLY (no hours).
- [ ] `loadDriverAssignmentUpdateSchema` accepts and validates `actualMiles` + `mileageSource` with Pattern B cross-field rule.
- [ ] `updateAssignment` server action persists both fields via Prisma update.
- [ ] `SerializedAssignment` type exposes both fields; `serializeAssignment` returns them.
- [ ] `OverrideForm` renders Actual miles + Mileage source side-by-side and wires them through save.
- [ ] Client-side Pattern B guard in the form prevents one-without-the-other submissions.
- [ ] 3 new tests in `transitions-api.test.ts` pass (CPM-with-miles, FLAT-always, CPM-no-miles).
- [ ] 2 new tests in `load-driver-assignments.test.ts` pass (persist, Pattern B error).
- [ ] `npx tsc --noEmit` clean from both `apps/web` and `packages/validation`.
- [ ] No changes to `schema.prisma`, `state-machine.ts`, `auto-base-pay.ts`, `snapshot.ts`, `calculator.ts`, the pending-pay queue page, approval card, or badge components.
</success_criteria>

<output>
After completion, create `.planning/quick/302-phase-6-gap-fix-auto-base-pay-wiring-act/302-SUMMARY.md`
</output>
