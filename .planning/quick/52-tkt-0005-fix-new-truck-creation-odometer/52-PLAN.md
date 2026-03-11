---
phase: quick-52
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/trucks.ts
  - src/components/trucks/truck-form.tsx
autonomous: true
must_haves:
  truths:
    - "Odometer field accepts formatted input like '125,000' without validation error"
    - "All form fields retain their values when submission fails with validation error"
    - "Year selection still preserved on error (no regression)"
    - "Edit truck form also benefits from sticky values and odometer fix"
  artifacts:
    - path: "src/app/(owner)/actions/trucks.ts"
      provides: "Server actions that return submitted values on error"
    - path: "src/components/trucks/truck-form.tsx"
      provides: "Form that repopulates fields from action state on error"
  key_links:
    - from: "src/app/(owner)/actions/trucks.ts"
      to: "src/components/trucks/truck-form.tsx"
      via: "action state return shape { error, values }"
      pattern: "return.*error.*values"
---

<objective>
Fix two bugs in the truck creation form at /trucks/new (TKT-0005):
1. Odometer rejects formatted numbers — server action uses parseInt which returns NaN for empty/invalid hidden field values; add z.preprocess to Zod schema to strip non-numeric chars before coercion as a safety net
2. Form values erased on validation error — server actions return only { error } but not the submitted values, so uncontrolled inputs lose their data

Purpose: Users cannot create trucks when entering formatted odometer values, and lose all entered data when any validation error occurs, forcing re-entry of every field.
Output: Both bugs fixed in server action + form component.
</objective>

<context>
@src/app/(owner)/actions/trucks.ts
@src/components/trucks/truck-form.tsx
@src/lib/validations/truck.schemas.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix odometer parsing and return form values from server actions</name>
  <files>src/app/(owner)/actions/trucks.ts, src/lib/validations/truck.schemas.ts</files>
  <action>
In `src/lib/validations/truck.schemas.ts`:
- Change the `odometer` field to use `z.preprocess` to strip commas and non-numeric characters before coercing to number. Replace:
  ```
  odometer: z.number().int(...).min(0, ...)
  ```
  With:
  ```
  odometer: z.preprocess(
    (val) => {
      if (typeof val === 'string') return parseInt(val.replace(/[^0-9]/g, ''), 10);
      return val;
    },
    z.number().int('Odometer must be a whole number').min(0, 'Odometer cannot be negative')
  ),
  ```
- Similarly, add a preprocess for `year` to handle string-to-number conversion safely:
  ```
  year: z.preprocess(
    (val) => (typeof val === 'string' ? parseInt(val, 10) : val),
    z.number().int('Year must be a whole number').min(1900, ...).max(...)
  ),
  ```

In `src/app/(owner)/actions/trucks.ts`:
- In `createTruck`: Remove the `parseInt()` calls for `year` and `odometer` in rawData (lines 32, 34). Just pass the raw string values — let Zod preprocess handle conversion. Change to:
  ```
  year: formData.get('year') as string,
  odometer: formData.get('odometer') as string,
  ```
- In the validation error return block (around line 59-63), also return the submitted values so the form can repopulate:
  ```
  if (!result.success) {
    return {
      error: result.error.flatten().fieldErrors,
      values: {
        make: rawData.make,
        model: rawData.model,
        year: formData.get('year') as string,
        vin: rawData.vin,
        licensePlate: rawData.licensePlate,
        odometer: formData.get('odometer') as string,
        registrationNumber: registrationNumber || '',
        registrationExpiry: registrationExpiry || '',
        insuranceNumber: insuranceNumber || '',
        insuranceExpiry: insuranceExpiry || '',
      },
    };
  }
  ```
- Apply the same changes to `updateTruck`: remove parseInt calls, pass raw strings to Zod, and return values on error in the same shape.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Grep for `parseInt` in the file to confirm all parseInt calls for year/odometer are removed (Zod preprocess handles it now).</verify>
  <done>Server actions pass raw strings to Zod (preprocess handles conversion), and return { error, values } on validation failure instead of just { error }.</done>
</task>

<task type="auto">
  <name>Task 2: Make form fields sticky using returned values from action state</name>
  <files>src/components/trucks/truck-form.tsx</files>
  <action>
In `src/components/trucks/truck-form.tsx`:

1. Update all uncontrolled input `defaultValue` attributes to prefer `state?.values?.fieldName` over `initialData?.fieldName`. The pattern for each field:
   - `make`: `defaultValue={state?.values?.make ?? initialData?.make ?? ''}`
   - `model`: `defaultValue={state?.values?.model ?? initialData?.model ?? ''}`
   - `vin`: `defaultValue={state?.values?.vin ?? initialData?.vin ?? ''}` (only in the create-mode branch, not the read-only edit branch)
   - `licensePlate`: `defaultValue={state?.values?.licensePlate ?? initialData?.licensePlate ?? ''}`
   - `registrationNumber`: `defaultValue={state?.values?.registrationNumber ?? initialData?.documentMetadata?.registrationNumber ?? ''}`
   - `registrationExpiry`: `defaultValue={state?.values?.registrationExpiry ?? initialData?.documentMetadata?.registrationExpiry ?? ''}`
   - `insuranceNumber`: `defaultValue={state?.values?.insuranceNumber ?? initialData?.documentMetadata?.insuranceNumber ?? ''}`
   - `insuranceExpiry`: `defaultValue={state?.values?.insuranceExpiry ?? initialData?.documentMetadata?.insuranceExpiry ?? ''}`

2. IMPORTANT: Since `defaultValue` only applies on initial mount of uncontrolled inputs, and React reuses the same DOM element across re-renders, `defaultValue` changes after mount are IGNORED. To force React to remount the form when state changes (thus applying new defaultValues), add a `key` prop to the `<form>` element that changes when state changes:
   ```
   <form action={formAction} key={state?.values ? JSON.stringify(state.values) : 'initial'} className="max-w-2xl space-y-5">
   ```
   This forces React to unmount/remount the form when values change, ensuring defaultValue picks up the returned values.

3. For the odometer field specifically: Update the `useState` initializer for `odometerDisplay` to also consider `state?.values?.odometer`. But since useState initializers only run once per mount, the `key` approach above handles this. Update the initial state to:
   ```
   const [odometerDisplay, setOdometerDisplay] = useState(() => {
     const val = state?.values?.odometer ?? initialData?.odometer;
     if (val != null && val !== '') return formatWithCommas(val);
     return '';
   });
   ```
   Also set the hidden input defaultValue similarly:
   ```
   defaultValue={state?.values?.odometer ?? initialData?.odometer?.toString() ?? ''}
   ```

4. For year: Update the `selectedYear` useState to also consider state values:
   ```
   const [selectedYear, setSelectedYear] = useState<number | null>(() => {
     const stateYear = state?.values?.year;
     if (stateYear) return parseInt(stateYear, 10) || null;
     return initialData?.year ?? null;
   });
   ```

Do NOT change: the general form structure, styling, error display logic, or submit button behavior.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Run `npm run build` to confirm the build succeeds.</verify>
  <done>All form fields repopulate with previously-entered values when server action returns a validation error. Year and odometer (controlled fields) also restore. The form key forces remount so defaultValue applies correctly.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `npm run build` succeeds
3. Manual test: Go to /trucks/new, fill all fields with odometer "125,000", submit with invalid VIN (e.g., too short) — odometer should not show NaN error, and all fields should retain their values after the VIN validation error appears
</verification>

<success_criteria>
- Odometer field accepts comma-formatted values (e.g., "125,000") without "expected number, received NaN" error
- All form fields (make, model, VIN, license plate, odometer, year, document fields) retain their values when any validation error occurs
- No regressions on the edit truck form (/trucks/[id]/edit)
- TypeScript compiles cleanly, build succeeds
</success_criteria>

<output>
After completion, create `.planning/quick/52-tkt-0005-fix-new-truck-creation-odometer/52-SUMMARY.md`
</output>
