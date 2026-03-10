---
phase: quick-50
plan: 50
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/seed.ts
  - src/components/trucks/truck-form.tsx
autonomous: true

must_haves:
  truths:
    - "Users can submit the truck edit form without a VIN format browser error"
    - "Seed data generates VINs that pass the VIN regex (no I, O, Q)"
    - "VIN field is read-only on the edit form (VINs are permanent identifiers)"
  artifacts:
    - path: "prisma/seed.ts"
      provides: "generateVIN() using valid VIN character set"
      contains: "A-HJ-NPR-Z0-9"
    - path: "src/components/trucks/truck-form.tsx"
      provides: "VIN input read-only and no browser pattern validation on edit"
  key_links:
    - from: "prisma/seed.ts"
      to: "prisma.truck.create"
      via: "generateVIN()"
      pattern: "generateVIN"
    - from: "src/components/trucks/truck-form.tsx"
      to: "updateTruck server action"
      via: "form submission"
      pattern: "name=\"vin\""
---

<objective>
Fix VIN validation error on the truck edit page caused by two bugs: (1) the seed's
generateVIN() uses faker.string.alphanumeric which can produce I/O/Q characters that
are banned by the VIN standard, and (2) the VIN <input> has a browser-native `pattern`
attribute that triggers a "please match the requested format" error before the form
even submits — blocking users from saving edits to trucks with seeded (invalid) VINs.

Purpose: Unblock editing of any truck whose seeded VIN contains I, O, or Q.
Output: Fixed seed, VIN shown as read-only on edit form, no browser validation error.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix generateVIN() in seed to use valid VIN character set</name>
  <files>prisma/seed.ts</files>
  <action>
    Replace the generateVIN() function at line 70. The current implementation uses
    faker.string.alphanumeric(17).toUpperCase() which can produce I, O, Q — all
    banned by the VIN standard (ISO 3779).

    Replace with a function that draws from the valid VIN character set only:
    A-H, J-N, P-R, S-Z, 0-9 (i.e., all alphanumeric except I, O, Q).

    New implementation:
    ```ts
    function generateVIN(): string {
      const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
      return Array.from({ length: 17 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    }
    ```

    Do NOT use faker for the character sampling — faker.string.fromCharacters exists
    but the manual implementation avoids a version-dependent API surface.
  </action>
  <verify>
    Manually check: the character set string 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789' must
    not contain I, O, or Q. Count: A B C D E F G H J K L M N P R S T U V W X Y Z = 23
    letters (26 minus I/O/Q = 23). Plus 10 digits = 33 total chars. Verify visually.

    Run: npx ts-node --project tsconfig.json -e "
      const chars = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789';
      const vin = Array.from({length:17},()=>chars[Math.floor(Math.random()*chars.length)]).join('');
      console.log(vin, /^[A-HJ-NPR-Z0-9]{17}$/.test(vin));
    "
    Expected: prints a 17-char VIN followed by `true`.
  </verify>
  <done>generateVIN() produces VINs matching /^[A-HJ-NPR-Z0-9]{17}$/ every time.</done>
</task>

<task type="auto">
  <name>Task 2: Make VIN read-only on the edit form and remove browser pattern validation</name>
  <files>src/components/trucks/truck-form.tsx</files>
  <action>
    The TruckForm component is shared between create and edit flows. The edit flow
    receives `initialData` with the truck's existing VIN. VINs are permanent vehicle
    identifiers — they should not be editable after creation.

    Update the VIN input block (lines 177-194) based on whether `initialData?.vin`
    is present:

    1. When `initialData?.vin` exists (edit mode):
       - Render the VIN as a readonly display with a hidden input to still submit the value
       - Remove the `pattern` attribute entirely (no browser validation)
       - Remove `required` attribute on the visible element
       - Add `readOnly` and style it as disabled-looking (opacity-50 or bg-muted)
       - Show a helper text: "VIN cannot be changed after creation"

    2. When no `initialData?.vin` (create mode):
       - Keep the existing editable input with pattern and required

    Implementation:
    ```tsx
    {/* VIN */}
    <div>
      <label htmlFor="vin" className={labelClass}>VIN</label>
      {initialData?.vin ? (
        <>
          <input
            type="text"
            id="vin"
            value={initialData.vin}
            readOnly
            className={`${inputClass} uppercase font-mono opacity-60 cursor-not-allowed bg-muted`}
          />
          <input type="hidden" name="vin" value={initialData.vin} />
          <p className="mt-1.5 text-xs text-muted-foreground">VIN cannot be changed after creation</p>
        </>
      ) : (
        <>
          <input
            type="text"
            id="vin"
            name="vin"
            maxLength={17}
            pattern="[A-HJ-NPR-Z0-9]{17}"
            disabled={isPending}
            className={`${inputClass} uppercase font-mono`}
            required
          />
          <p className="mt-1.5 text-xs text-muted-foreground">17 characters, no I, O, or Q</p>
        </>
      )}
      {state?.error?.vin && (
        <p className="mt-1.5 text-sm text-red-600">{state.error.vin}</p>
      )}
    </div>
    ```

    The hidden input ensures the VIN is still submitted with the form and processed
    by the updateTruck server action (which uses truckUpdateSchema.partial() — VIN
    will pass Zod validation since it was already valid when created, or if it was
    seeded with an invalid VIN, it won't be re-validated since the value comes
    straight through without the user changing it — but Zod will still validate it).

    Wait — for seeded trucks with invalid VINs (containing O/I/Q), passing the VIN
    through the hidden input will still fail Zod's truckUpdateSchema validation.
    To handle this: also update truckUpdateSchema to make VIN truly optional on update
    by excluding it from the partial update when unchanged, OR update the server action
    to skip VIN from rawData when it matches the existing truck's VIN.

    Simpler fix: in updateTruck server action (trucks.ts line 119-120), do NOT include
    vin in rawData at all for updates. VIN is a permanent identifier — it should never
    be updated via the edit form. Remove the vin parsing block from updateTruck:

    Remove these lines from trucks.ts:
    ```ts
    const vin = formData.get('vin') as string;
    if (vin) rawData.vin = vin;
    ```

    This means VIN is never sent to the DB on update — which is correct business logic.
    Also remove the P2002 vin unique constraint handler from updateTruck since VIN
    can no longer conflict on update.
  </action>
  <verify>
    1. npm run build — no TypeScript errors
    2. Navigate to /trucks/{id}/edit in the browser
    3. Verify the VIN field is displayed as read-only (grayed out, not editable)
    4. Click "Update Truck" without changing anything
    5. Confirm the form submits successfully and redirects to the truck detail page
    6. Confirm no "please match the requested format" browser error appears
  </verify>
  <done>
    Edit form submits without VIN validation errors. VIN field is visually read-only.
    Create form still enforces VIN format via browser pattern validation.
    updateTruck action no longer processes VIN field.
  </done>
</task>

</tasks>

<verification>
1. `npm run build` passes with no TypeScript errors
2. On /trucks/{id}/edit: VIN field is grayed out and not editable
3. Submitting the edit form with an existing truck (including those with seeded VINs containing O/I/Q) succeeds
4. On /trucks/new: VIN field is still editable and enforces the pattern
5. generateVIN() in seed.ts uses only [A-HJ-NPR-Z0-9] characters
</verification>

<success_criteria>
- No "please match the requested format" error when editing a truck
- VIN is read-only on edit form (correct UX — VINs are permanent)
- Seed generates conformant VINs on next `npm run seed`
- TypeScript build clean
</success_criteria>

<output>
After completion, create `.planning/quick/50-tkt-0006-fix-vin-validation-error-on-tru/50-SUMMARY.md`
</output>
