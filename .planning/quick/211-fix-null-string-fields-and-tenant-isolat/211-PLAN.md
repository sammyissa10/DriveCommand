---
phase: quick-211
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/trucks.ts
  - packages/validation/src/truck.ts
autonomous: true
must_haves:
  truths:
    - "Submitting truck form with only required fields creates truck without validation error"
    - "Submitting truck form with all fields (including optional document metadata) creates truck without error"
    - "Truck tenantId always comes from session middleware, never from client payload"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/trucks.ts"
      provides: "Null-safe FormData extraction and tenant-isolated truck CRUD"
    - path: "packages/validation/src/truck.ts"
      provides: "Truck Zod schemas with null-tolerant optional string fields"
  key_links:
    - from: "apps/web/src/app/(owner)/actions/trucks.ts"
      to: "packages/validation/src/truck.ts"
      via: "truckCreateSchema.safeParse()"
      pattern: "truckCreateSchema\\.safeParse"
---

<objective>
Fix "Invalid input: expected string, received null" error on truck creation and verify tenant isolation.

Purpose: FormData.get() returns `string | File | null`. When optional fields are absent or empty, null gets passed through `as string` cast into Zod string validators that reject null. The server action must convert null to undefined/empty-string before validation. Additionally, confirm tenant isolation is enforced server-side (it already uses requireTenantId + getTenantPrisma, but we add an explicit guard comment for clarity).

Output: Working truck creation for both minimal and full-field submissions.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/actions/trucks.ts
@packages/validation/src/truck.ts
@apps/web/src/components/trucks/truck-form.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix null-to-string coercion in truck server action and harden Zod schema</name>
  <files>
    apps/web/src/app/(owner)/actions/trucks.ts
    packages/validation/src/truck.ts
  </files>
  <action>
**In `apps/web/src/app/(owner)/actions/trucks.ts` — `createTruck` function:**

1. Replace the raw `formData.get('field') as string` pattern with a null-safe helper. Add at top of file:
   ```
   function formString(fd: FormData, key: string): string {
     const val = fd.get(key);
     return typeof val === 'string' ? val : '';
   }
   function formStringOrUndefined(fd: FormData, key: string): string | undefined {
     const val = fd.get(key);
     if (typeof val !== 'string' || val === '') return undefined;
     return val;
   }
   ```

2. In `createTruck`, replace the rawData construction:
   ```
   const rawData = {
     make: formString(formData, 'make'),
     model: formString(formData, 'model'),
     year: formString(formData, 'year'),
     vin: formString(formData, 'vin'),
     licensePlate: formString(formData, 'licensePlate'),
     odometer: formString(formData, 'odometer'),
   };
   ```

3. For document metadata fields, use `formStringOrUndefined`:
   ```
   const registrationNumber = formStringOrUndefined(formData, 'registrationNumber');
   const registrationExpiry = formStringOrUndefined(formData, 'registrationExpiry');
   const insuranceNumber = formStringOrUndefined(formData, 'insuranceNumber');
   const insuranceExpiry = formStringOrUndefined(formData, 'insuranceExpiry');
   ```

4. Apply the same `formString`/`formStringOrUndefined` pattern to `updateTruck` function for consistency. Replace `formData.get('field') as string` with the helpers.

5. Add an explicit comment above `requireTenantId()` in createTruck confirming tenant isolation:
   ```
   // SECURITY: tenantId sourced exclusively from session middleware (x-tenant-id header).
   // Never accepted from client payload. getTenantPrisma() applies RLS scoping.
   ```

**In `packages/validation/src/truck.ts` — `documentMetadataSchema`:**

6. Update optional string fields in `documentMetadataSchema` to tolerate null from FormData edge cases:
   ```
   registrationNumber: z.string().optional().or(z.literal(null)).transform(v => v === null ? undefined : v),
   registrationExpiry: z.string().optional().or(z.literal(null)).transform(v => v === null ? undefined : v),
   insuranceNumber: z.string().optional().or(z.literal(null)).transform(v => v === null ? undefined : v),
   insuranceExpiry: z.string().optional().or(z.literal(null)).transform(v => v === null ? undefined : v),
   ```
   Alternatively, the simpler approach: use `z.preprocess((v) => v === null || v === '' ? undefined : v, z.string().optional())` for each field.

   Also remove `.strict()` from documentMetadataSchema — strict mode rejects unknown keys and is unnecessary here since the schema already defines all expected fields.

   Wait — keep `.strict()` actually, it's a good security practice. Only change the field definitions.
  </action>
  <verify>
    Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit` — no TypeScript errors.
    Run `cd C:/Users/sammy/Projects/DriveCommand && npx vitest run --reporter=verbose -- truck` to check if any existing truck tests pass.
  </verify>
  <done>
    - `formData.get()` null values are converted to empty string (required fields) or undefined (optional fields) before reaching Zod
    - Document metadata optional fields tolerate null input via Zod preprocess
    - Tenant isolation is enforced via requireTenantId() + getTenantPrisma() with no client-supplied tenantId/org_id accepted
    - No TypeScript errors
    - Both createTruck and updateTruck use null-safe FormData extraction
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. Existing truck validation tests pass (if any)
3. Manual verification: submitting truck form with only required fields should not produce "expected string, received null"
4. The server action never reads tenantId/org_id from form payload — confirmed by code inspection (uses requireTenantId() from middleware header)
</verification>

<success_criteria>
- Truck creation works without Zod validation errors when optional fields are empty
- Truck creation works when all fields are filled
- tenantId is always sourced from authenticated session middleware, never from client
- No TypeScript errors introduced
</success_criteria>

<output>
After completion, create `.planning/quick/211-fix-null-string-fields-and-tenant-isolat/211-SUMMARY.md`
</output>
