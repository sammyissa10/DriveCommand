---
phase: 394-tkt-0037-part-1-add-3-advanced-tenant-se
plan: 394
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx
  - apps/web/src/app/(admin)/tenants/[id]/page.tsx
  - apps/web/src/app/(admin)/actions/tenants.ts
autonomous: true

must_haves:
  truths:
    - "Sysadmin can view current values of profitMarginThreshold, fleetSizeBucket, and manualTrial on the tenant detail page"
    - "Sysadmin can edit all three new fields inside the existing Tenant Settings card"
    - "Saving the form persists all fields (existing + 3 new) atomically in a single updateTenantSettings call"
    - "Invalid input (e.g. out-of-range threshold, bad enum) is rejected by Zod with a single error toast — no partial writes"
    - "Existing fields (contactEmail, timezone, plan) continue to save correctly with no regression"
  artifacts:
    - path: "apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx"
      provides: "Form UI with Advanced section containing profitMarginThreshold, fleetSizeBucket, manualTrial inputs"
      contains: "profitMarginThreshold|fleetSizeBucket|manualTrial"
    - path: "apps/web/src/app/(admin)/actions/tenants.ts"
      provides: "updateTenantSettings extended Zod schema + Prisma update for 3 new fields"
      contains: "profitMarginThreshold|fleetSizeBucket|manualTrial"
    - path: "apps/web/src/app/(admin)/tenants/[id]/page.tsx"
      provides: "Page fetches + passes 3 new fields as initial props to TenantSettingsForm"
      contains: "profitMarginThreshold|fleetSizeBucket|manualTrial"
  key_links:
    - from: "tenant-settings-form.tsx"
      to: "updateTenantSettings action"
      via: "startTransition -> action call with all 6 fields in the payload"
      pattern: "updateTenantSettings\\(tenantId,"
    - from: "updateTenantSettings"
      to: "prisma.tenant.update"
      via: "validated data spread including new fields"
      pattern: "prisma\\.tenant\\.update"
    - from: "page.tsx"
      to: "TenantSettingsForm"
      via: "initialProfitMarginThreshold / initialFleetSizeBucket / initialManualTrial props"
      pattern: "initialProfitMarginThreshold|initialFleetSizeBucket|initialManualTrial"
---

<objective>
Surface 3 existing-but-hidden Tenant fields (`profitMarginThreshold`, `fleetSizeBucket`, `manualTrial`) in the sysadmin Tenant Settings form so they are editable via the UI.

Purpose: TKT-0037 Part 1 — the columns already exist on the Tenant model but cannot be modified anywhere in the admin UI. Sysadmins currently must edit them directly in the database, which is error-prone.

Output:
- Extended `TenantSettingsForm` with an "Advanced" section containing 3 inputs
- Extended `updateTenantSettings` server action that validates + persists the 3 new fields
- `page.tsx` reads the 3 new fields and passes them as initial props
- All fields save atomically in one request, single success/error toast
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Existing form, server action, and tenant detail page — all 3 files to be modified
@apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx
@apps/web/src/app/(admin)/actions/tenants.ts
@apps/web/src/app/(admin)/tenants/[id]/page.tsx

# Schema for reference (DO NOT MODIFY) — confirms field types and enum values
@apps/web/prisma/schema.prisma
</context>

<schema_notes>
From `apps/web/prisma/schema.prisma`:

```prisma
model Tenant {
  ...
  profitMarginThreshold Decimal           @default(10) @db.Decimal(5, 2)
  fleetSizeBucket       FleetSizeBucket   @default(OWNER_OPERATOR)
  manualTrial           Boolean           @default(false)
  ...
}

enum FleetSizeBucket {
  OWNER_OPERATOR
  SMALL
  MEDIUM
  LARGE
}
```

**IMPORTANT — profitMarginThreshold semantics:**
The task description says "accepts decimal (e.g. 0.15 for 15%), validate 0 <= x <= 1". HOWEVER the schema's `@default(10)` and `Decimal(5,2)` strongly suggest the stored value is a **percentage as a whole number** (e.g. `15.00` means 15%, not 0.15). Confirm by checking any existing reader of this field before writing the form.

Behavior to implement (in priority order):
1. Grep the codebase for `profitMarginThreshold` reads to see how it's interpreted today.
2. If existing code uses it as a whole-number percentage (e.g. compares to `> 10`), keep that convention: input accepts `0 <= x <= 100`, helper text "Profit margin threshold (%) used for low-margin alerts".
3. If existing code uses it as a fraction (e.g. `> 0.10`), use the task description's `0 <= x <= 1` validation.
4. Either way, store as `Decimal` via Prisma (string-or-number both accepted).

Document the interpretation chosen in the task SUMMARY so Part 2 (if any) is consistent.

**Decimal handling for client/server boundary:**
Prisma `Decimal` is serialized as a `Decimal` object on the server and a string when sent to the client via server actions. To keep the form simple:
- Page reads `tenant.profitMarginThreshold` → call `.toString()` or `Number()` before passing to form
- Form holds value as `string` in useState (matches input element semantics), parses to `number` before sending to action
- Action's Zod schema: `z.number().min(...).max(...)` — Prisma accepts `number` for Decimal columns
</schema_notes>

<tasks>

<task type="auto">
  <name>Task 1: Extend updateTenantSettings server action + getTenantById select with 3 new fields</name>
  <files>apps/web/src/app/(admin)/actions/tenants.ts</files>
  <action>
Edit `apps/web/src/app/(admin)/actions/tenants.ts` in two places:

**1. `getTenantById` (around lines 290-318) — add the 3 new fields to the `select`:**

```ts
select: {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  contactEmail: true,
  plan: true,
  isActive: true,
  profitMarginThreshold: true,   // NEW
  fleetSizeBucket: true,          // NEW
  manualTrial: true,              // NEW
  createdAt: true,
  updatedAt: true,
  _count: { ... },                // unchanged
  users: { ... },                 // unchanged
  driverInvitations: { ... },     // unchanged
},
```

**2. `updateTenantSettings` (around lines 505-538) — extend signature, Zod schema, and Prisma update:**

- Import `FleetSizeBucket` enum from `'@/generated/prisma'` (already imports `Prisma` from there)
- Decide on `profitMarginThreshold` semantics first (see schema_notes above). Default to whole-number percentage `0..100` unless existing readers show otherwise.

```ts
export async function updateTenantSettings(
  tenantId: string,
  data: {
    contactEmail?: string;
    timezone: string;
    plan: string;
    profitMarginThreshold: number;
    fleetSizeBucket: 'OWNER_OPERATOR' | 'SMALL' | 'MEDIUM' | 'LARGE';
    manualTrial: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();

  const schema = z.object({
    contactEmail: z.string().email('Must be a valid email address').optional().or(z.literal('')),
    timezone: z.string().min(1, 'Timezone is required'),
    plan: z.enum(['starter', 'pro', 'enterprise'] as const),
    profitMarginThreshold: z
      .number({ invalid_type_error: 'Profit margin threshold must be a number' })
      .min(0, 'Profit margin threshold must be at least 0')
      .max(100, 'Profit margin threshold must be at most 100'),  // adjust to 1 if fraction semantics confirmed
    fleetSizeBucket: z.enum(['OWNER_OPERATOR', 'SMALL', 'MEDIUM', 'LARGE'] as const),
    manualTrial: z.boolean(),
  });

  const validation = schema.safeParse(data);
  if (!validation.success) {
    return { success: false, error: validation.error.issues[0].message };
  }

  try {
    await prisma.tenant.update({
      where: { id: tenantId },
      data: {
        contactEmail: validation.data.contactEmail || null,
        timezone: validation.data.timezone,
        plan: validation.data.plan,
        profitMarginThreshold: validation.data.profitMarginThreshold,
        fleetSizeBucket: validation.data.fleetSizeBucket,
        manualTrial: validation.data.manualTrial,
      },
    });

    revalidatePath(`/tenants/${tenantId}`);

    return { success: true };
  } catch {
    return { success: false, error: 'Failed to update settings. Please try again.' };
  }
}
```

DO NOT touch any other action (createTenant, suspendTenant, reactivateTenant, updateTenant, updateOwnerEmail, etc.).
DO NOT modify the Prisma schema.
DO NOT touch user-related actions.
  </action>
  <verify>
Run from repo root:
```
cd apps/web && npx tsc --noEmit
```
Must complete with zero new errors. `updateTenantSettings` must accept the 3 new fields in its signature and `getTenantById` must return them.
  </verify>
  <done>
- `getTenantById` returns `profitMarginThreshold`, `fleetSizeBucket`, `manualTrial` on the tenant object
- `updateTenantSettings` accepts and validates the 3 new fields via Zod
- `prisma.tenant.update` writes all 6 fields (3 existing + 3 new) in a single update
- TypeScript compiles cleanly
  </done>
</task>

<task type="auto">
  <name>Task 2: Add Advanced section with 3 new inputs to TenantSettingsForm</name>
  <files>apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx</files>
  <action>
Edit `apps/web/src/app/(admin)/tenants/[id]/tenant-settings-form.tsx`.

**Conventions to honor (DO NOT BREAK):**
- Plain `useState` + `useTransition` (NO react-hook-form)
- Existing CSS class patterns: `rounded-md border border-gray-300 px-3 py-1.5 text-sm ...`
- Existing inline error/success banner divs (no new toast library)
- Single submit button at the bottom; `isDirty` gating preserved

**Changes:**

1. Extend `TenantSettingsFormProps`:
```ts
interface TenantSettingsFormProps {
  tenantId: string;
  initialContactEmail: string | null;
  initialTimezone: string;
  initialPlan: string;
  initialProfitMarginThreshold: number;   // NEW — caller converts Decimal -> number
  initialFleetSizeBucket: 'OWNER_OPERATOR' | 'SMALL' | 'MEDIUM' | 'LARGE';  // NEW
  initialManualTrial: boolean;                                              // NEW
}
```

2. Add constants below existing `PLANS`:
```ts
const FLEET_SIZE_BUCKETS = [
  { value: 'OWNER_OPERATOR', label: 'Owner-Operator (1 truck)' },
  { value: 'SMALL', label: 'Small (2-10 trucks)' },
  { value: 'MEDIUM', label: 'Medium (11-50 trucks)' },
  { value: 'LARGE', label: 'Large (51+ trucks)' },
] as const;
```

3. Add 3 new useState hooks alongside existing ones:
```ts
const [profitMarginThreshold, setProfitMarginThreshold] = useState(
  String(initialProfitMarginThreshold ?? 10)
);
const [fleetSizeBucket, setFleetSizeBucket] = useState(initialFleetSizeBucket ?? 'OWNER_OPERATOR');
const [manualTrial, setManualTrial] = useState(initialManualTrial ?? false);
```

4. Extend `isDirty` check to include the 3 new fields:
```ts
const isDirty =
  contactEmail !== (initialContactEmail ?? '') ||
  timezone !== (initialTimezone || 'UTC') ||
  plan !== (initialPlan || 'starter') ||
  profitMarginThreshold !== String(initialProfitMarginThreshold ?? 10) ||
  fleetSizeBucket !== (initialFleetSizeBucket ?? 'OWNER_OPERATOR') ||
  manualTrial !== (initialManualTrial ?? false);
```

5. In `handleSubmit`, parse `profitMarginThreshold` and add a local-validation guard (matches the action's Zod range) before calling the action. If invalid, set the error banner and return without calling the action:
```ts
const threshold = Number(profitMarginThreshold);
if (Number.isNaN(threshold) || threshold < 0 || threshold > 100) {
  setError('Profit margin threshold must be a number between 0 and 100');
  return;
}
```
Then include the 3 new fields in the action payload:
```ts
const result = await updateTenantSettings(tenantId, {
  contactEmail: contactEmail.trim() || undefined,
  timezone,
  plan,
  profitMarginThreshold: threshold,
  fleetSizeBucket,
  manualTrial,
});
```

6. Add an **Advanced section** AFTER the existing 3-column grid (line ~137) and BEFORE the submit button (line ~139). Use a `<details>` element to make it collapsible — this matches the "simple, no new patterns" constraint:

```tsx
<details className="border-t pt-4">
  <summary className="cursor-pointer text-sm font-medium text-gray-700 select-none">
    Advanced
  </summary>
  <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
    {/* Profit Margin Threshold */}
    <div>
      <label htmlFor="profit-margin-threshold" className="block text-xs font-medium text-gray-500 mb-1">
        Profit Margin Threshold (%)
      </label>
      <input
        id="profit-margin-threshold"
        type="number"
        step="0.01"
        min={0}
        max={100}
        value={profitMarginThreshold}
        onChange={(e) => { setProfitMarginThreshold(e.target.value); setSuccess(false); }}
        disabled={isPending}
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
      />
      <p className="mt-1 text-xs text-gray-400">Loads below this margin trigger low-profit alerts.</p>
    </div>

    {/* Fleet Size Bucket */}
    <div>
      <label htmlFor="fleet-size-bucket" className="block text-xs font-medium text-gray-500 mb-1">
        Fleet Size
      </label>
      <select
        id="fleet-size-bucket"
        value={fleetSizeBucket}
        onChange={(e) => { setFleetSizeBucket(e.target.value as typeof fleetSizeBucket); setSuccess(false); }}
        disabled={isPending}
        className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 bg-white"
      >
        {FLEET_SIZE_BUCKETS.map((b) => (
          <option key={b.value} value={b.value}>{b.label}</option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400">Used for analytics segmentation and onboarding flow.</p>
    </div>

    {/* Manual Trial */}
    <div>
      <label htmlFor="manual-trial" className="block text-xs font-medium text-gray-500 mb-1">
        Manual Trial
      </label>
      <label className="inline-flex items-center gap-2 cursor-pointer mt-1">
        <input
          id="manual-trial"
          type="checkbox"
          checked={manualTrial}
          onChange={(e) => { setManualTrial(e.target.checked); setSuccess(false); }}
          disabled={isPending}
          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-60"
        />
        <span className="text-sm text-gray-900">Tenant is on a manually-managed trial</span>
      </label>
      <p className="mt-1 text-xs text-gray-400">Bypasses automatic trial expiry and billing transitions.</p>
    </div>
  </div>
</details>
```

DO NOT add a separate "Save Advanced" button — the single submit button at the bottom must save everything atomically (per task requirements).
DO NOT introduce react-hook-form, toast library, or shadcn Switch component.
DO NOT touch any other file's styling conventions.
  </action>
  <verify>
Run from repo root:
```
cd apps/web && npx tsc --noEmit
```
Must complete with zero new errors. The form file must compile and accept the 3 new props.

Also visually scan the rendered output of the diff — the Advanced `<details>` block must be sibling to (not nested inside) the existing 3-column grid.
  </verify>
  <done>
- `TenantSettingsForm` accepts 3 new initial props
- 3 new inputs render inside a collapsible `<details>` "Advanced" section
- `isDirty` reflects changes to any of the 3 new fields
- `handleSubmit` validates `profitMarginThreshold` locally and includes all 6 fields in the action call
- Existing fields and styling are unchanged
- TypeScript compiles cleanly
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire page.tsx to pass new fields + manual verification</name>
  <files>apps/web/src/app/(admin)/tenants/[id]/page.tsx</files>
  <action>
Edit `apps/web/src/app/(admin)/tenants/[id]/page.tsx`.

Find the `<TenantSettingsForm ... />` invocation (around lines 243-249) and add the 3 new props. Convert `Decimal` to `number` for the threshold:

```tsx
<TenantSettingsForm
  tenantId={tenant.id}
  initialContactEmail={tenant.contactEmail ?? null}
  initialTimezone={tenant.timezone}
  initialPlan={tenant.plan}
  initialProfitMarginThreshold={Number(tenant.profitMarginThreshold)}
  initialFleetSizeBucket={tenant.fleetSizeBucket}
  initialManualTrial={tenant.manualTrial}
/>
```

Note: `Number(tenant.profitMarginThreshold)` safely converts `Decimal | string | number` to a plain JS number for the client component boundary.

DO NOT modify any other section of the page (Tenant Info card, Status card, Users, Billing History, etc.).
DO NOT change `getTenantById` again (it was already updated in Task 1).

**After the file change, run final type-check + manual verification:**

1. From repo root: `cd apps/web && npx tsc --noEmit` → MUST pass with zero new errors.

2. Start dev server (or run against an existing one): `cd apps/web && npm run dev`

3. Manually verify in the browser as a sysadmin:
   - Navigate to `/tenants/<some-tenant-id>`
   - Confirm the existing Tenant Settings card renders
   - Click "Advanced" — the 3 new fields appear with current DB values pre-filled
   - Edit `profitMarginThreshold` to e.g. `12.5`, change `fleetSizeBucket`, toggle `manualTrial`
   - Click "Save Settings"
   - Green success banner appears, page revalidates, values persist after refresh
   - Test invalid input: set threshold to `-5` → red error banner, no save, DB unchanged
   - Test that editing ONLY an existing field (e.g. timezone) still saves correctly with no regression

If anything fails verification, fix in this task before completing.
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` returns 0 errors
- In the browser: 3 new fields visible, editable, persist after save, validation rejects out-of-range values, existing fields still save
  </verify>
  <done>
- Page passes all 6 initial props to `TenantSettingsForm`
- All 3 new fields read/write end-to-end via the form
- Existing functionality preserved (no regression on contactEmail/timezone/plan)
- TypeScript clean
- Manual verification passes
  </done>
</task>

</tasks>

<verification>
End-to-end:
- TypeScript: `cd apps/web && npx tsc --noEmit` → 0 new errors
- Database: confirm via Supabase MCP or `prisma studio` that a saved row reflects the new field values
- UI: Advanced section collapses/expands, 3 inputs render correctly, single save button saves all fields atomically
- Single toast/banner per save (no duplicate notifications)
- Out-of-range threshold rejected with friendly error
- Existing fields continue to save (regression check)
</verification>

<success_criteria>
- Sysadmin can edit `profitMarginThreshold`, `fleetSizeBucket`, and `manualTrial` from `/tenants/[id]` without touching the database directly
- All 6 fields save in one atomic call to `updateTenantSettings`
- No new dependencies introduced (no react-hook-form, no new toast library)
- No changes to Prisma schema, User model, suspension logic, or plan/owner-email editing
- TypeScript compiles cleanly across `apps/web`
</success_criteria>

<output>
After completion, create `.planning/quick/394-tkt-0037-part-1-add-3-advanced-tenant-se/394-SUMMARY.md` covering:
- Which interpretation was chosen for `profitMarginThreshold` (whole-number percentage vs fraction) and why
- Any existing readers of these 3 fields found in the codebase
- Screenshots or descriptions of the rendered Advanced section
- Confirmation of manual verification steps
</output>
