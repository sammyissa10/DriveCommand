---
phase: quick-184
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260406000001_facility_lumper_appointment_contacts/migration.sql
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/facilities.ts
  - apps/web/src/app/api/v1/carrier/facilities/route.ts
  - apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts
  - apps/web/src/components/carrier/facilities/FacilityForm.tsx
  - apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
autonomous: true
must_haves:
  truths:
    - "Facility form type dropdown shows exactly 5 valid values: terminal, yard, warehouse, drop_yard, customer_site"
    - "Creating a facility with any of the 5 types succeeds without DB constraint error"
    - "Lumper Required and Appointment Required toggles appear on the form and persist on save"
    - "Dynamic contacts array replaces single contact fields - user can add/remove multiple contacts"
  artifacts:
    - path: "apps/web/prisma/migrations/20260406000001_facility_lumper_appointment_contacts/migration.sql"
      provides: "DB columns for lumper_required, appointment_required, contacts"
    - path: "apps/web/src/components/carrier/facilities/FacilityForm.tsx"
      provides: "Fixed type dropdown, boolean toggles, dynamic contacts UI"
  key_links:
    - from: "FacilityForm.tsx"
      to: "/api/v1/carrier/facilities"
      via: "fetch POST/PATCH with lumperRequired, appointmentRequired, contacts in body"
      pattern: "lumperRequired|appointmentRequired|contacts"
---

<objective>
Fix the carrier facilities form that currently throws a 500 DB constraint error on submit due to invalid facility type values. Also add lumperRequired/appointmentRequired boolean toggles and replace single contact fields with a dynamic contacts JSONB array.

Purpose: Unblock facility creation/editing and add missing facility metadata fields.
Output: Working facility form with correct types, toggles, and multi-contact support.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (CarrierFacility model around line 1316)
@apps/web/src/lib/carrier/facilities.ts
@apps/web/src/app/api/v1/carrier/facilities/route.ts
@apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
@apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: DB migration + Prisma schema + API schemas</name>
  <files>
    apps/web/prisma/migrations/20260406000001_facility_lumper_appointment_contacts/migration.sql
    apps/web/prisma/schema.prisma
    apps/web/src/lib/carrier/facilities.ts
    apps/web/src/app/api/v1/carrier/facilities/route.ts
    apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts
  </files>
  <action>
    1. Create migration file at `apps/web/prisma/migrations/20260406000001_facility_lumper_appointment_contacts/migration.sql`:
    ```sql
    ALTER TABLE "facilities"
      ADD COLUMN "lumper_required" BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN "appointment_required" BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN "contacts" JSONB NOT NULL DEFAULT '[]';
    ```

    2. In `apps/web/prisma/schema.prisma`, add 3 fields to the CarrierFacility model AFTER the `contactEmail` line (before `notes`):
    ```prisma
    lumperRequired      Boolean  @default(false) @map("lumper_required")
    appointmentRequired Boolean  @default(false) @map("appointment_required")
    contacts            Json     @default("[]")
    ```

    3. In `apps/web/src/lib/carrier/facilities.ts`, add to `FacilityCreateInput` interface (after contactEmail):
    ```ts
    lumperRequired?: boolean;
    appointmentRequired?: boolean;
    contacts?: Array<{ name: string; phone?: string; email?: string; role?: string }>;
    ```
    `FacilityUpdateInput = Partial<FacilityCreateInput>` already inherits these.

    4. In `apps/web/src/app/api/v1/carrier/facilities/route.ts`, add to `FacilityCreateSchema`:
    ```ts
    lumperRequired: z.boolean().optional(),
    appointmentRequired: z.boolean().optional(),
    contacts: z.array(z.object({
      name: z.string(),
      phone: z.string().optional(),
      email: z.string().optional(),
      role: z.string().optional(),
    })).optional(),
    ```

    5. In `apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts`, add the same 3 fields to `FacilityUpdateSchema`.

    6. Run `npx prisma generate` from `apps/web/` to regenerate the Prisma client. The migration hook should auto-deploy; if not, run `npx prisma migrate deploy` manually.
  </action>
  <verify>
    Run `cd apps/web && npx prisma generate` succeeds without error. Run `npx tsc --noEmit` from repo root to confirm no type errors in the API routes or facilities lib.
  </verify>
  <done>Migration file exists, Prisma schema has 3 new fields, FacilityCreateInput has 3 new optional fields, both Zod schemas accept the new fields, Prisma client regenerated.</done>
</task>

<task type="auto">
  <name>Task 2: Rewrite FacilityForm with correct types, toggles, and dynamic contacts</name>
  <files>
    apps/web/src/components/carrier/facilities/FacilityForm.tsx
    apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx
  </files>
  <action>
    1. In `FacilityForm.tsx`:

    a. Replace the FACILITY_TYPES array with the 5 correct DB values:
    ```ts
    const FACILITY_TYPES = [
      { value: 'terminal',      label: 'Terminal' },
      { value: 'yard',          label: 'Yard' },
      { value: 'warehouse',     label: 'Warehouse' },
      { value: 'drop_yard',     label: 'Drop Yard' },
      { value: 'customer_site', label: 'Customer Site' },
    ];
    ```

    b. Update `FacilityData` interface: add `lumperRequired: boolean`, `appointmentRequired: boolean`, and `contacts: Array<{name:string;phone:string;email:string;role:string}>`. Keep contactName/contactPhone/contactEmail in the interface for backward compat with existing data but they will no longer be edited.

    c. Add imports: `Switch` from `@/components/ui/switch`, `Label` from `@/components/ui/label`, `Plus` and `X` from `lucide-react`.

    d. Add state for the new fields:
    - `lumperRequired: boolean` initialized from `initialData?.lumperRequired ?? false`
    - `appointmentRequired: boolean` initialized from `initialData?.appointmentRequired ?? false`
    - `contacts: Array<{name:string;phone:string;email:string;role:string}>` initialized from `initialData?.contacts ?? []` (ensure it's an array)

    e. Add an "Options" section AFTER the Address section with two Switch toggles:
    - "Lumper Required" toggle bound to `lumperRequired` state
    - "Appointment Required" toggle bound to `appointmentRequired` state
    Layout: horizontal row with gap, each toggle is a flex row with Label + Switch.

    f. Replace the entire Contact section with a dynamic contacts array:
    - Section header: "Contacts" with an "Add Contact" button (Plus icon, small outline button) aligned right
    - Each contact row: 4 inputs in a grid (Name, Phone, Email, Role) + an X remove button
    - Grid: `grid-cols-1 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]` with gap-3
    - "Add Contact" pushes `{name:'',phone:'',email:'',role:''}` to the contacts array
    - X button removes the contact at that index
    - Each input updates its field in the contacts array by index

    g. Update `handleSubmit` body construction:
    - ADD `lumperRequired`, `appointmentRequired`, and `contacts` (filtered to remove empty-name entries) to the body
    - REMOVE `contactName`, `contactPhone`, `contactEmail` from the body (stop sending them)

    h. Remove contactName/contactPhone/contactEmail from the `values` state object and the form inputs. Remove the contactEmail validation from the `validate` function and `FormErrors` interface.

    2. In `apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx`:
    Update the `initialData` prop passed to `FacilityForm` to include:
    ```ts
    lumperRequired: facility.lumperRequired,
    appointmentRequired: facility.appointmentRequired,
    contacts: Array.isArray(facility.contacts) ? facility.contacts as Array<{name:string;phone:string;email:string;role:string}> : [],
    ```
  </action>
  <verify>
    Run `npx tsc --noEmit` from repo root. No type errors. Visually confirm: open `/carrier/facilities/new` in browser - type dropdown should show 5 options (Terminal, Yard, Warehouse, Drop Yard, Customer Site), two toggle switches visible, Add Contact button works to add rows with 4 fields each.
  </verify>
  <done>
    - Type dropdown shows exactly 5 valid DB values
    - Submitting a new facility with any type succeeds (no 500 error)
    - Lumper Required and Appointment Required toggles render and their values are included in POST/PATCH
    - Dynamic contacts array: can add/remove contacts, each with name/phone/email/role
    - Old single contact fields removed from form UI (DB columns untouched)
    - Edit page passes new fields to form from existing facility data
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes from repo root
2. Creating a facility with type "yard" succeeds (previously would 500)
3. Creating a facility with type "customer_site" succeeds
4. Lumper/appointment toggles save and load correctly on edit
5. Contacts array saves as JSONB and loads correctly on edit
</verification>

<success_criteria>
- No DB constraint error when creating facilities with any of the 5 valid types
- Boolean toggles for lumperRequired and appointmentRequired render and persist
- Dynamic contacts array replaces single contact fields in the form
- All changes type-check cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/184-fix-carrier-facilities-form-type-dropdow/184-SUMMARY.md`
</output>
