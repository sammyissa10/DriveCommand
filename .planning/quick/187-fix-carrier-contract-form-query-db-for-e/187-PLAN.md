---
phase: quick-187
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/YYYYMMDD_contract_missing_fields/migration.sql
  - apps/web/src/components/carrier/contracts/ContractForm.tsx
  - apps/web/src/lib/carrier/contracts.ts
  - apps/web/src/app/api/v1/carrier/contracts/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
  - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
autonomous: true
must_haves:
  truths:
    - "Contract form dropdown values exactly match DB CHECK constraints"
    - "Contract form includes all 7 missing fields from spec"
    - "Creating and editing a contract works end-to-end without CHECK violation errors"
    - "tsc --noEmit passes cleanly"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "CarrierContract model with 7 new fields"
      contains: "contractName"
    - path: "apps/web/src/components/carrier/contracts/ContractForm.tsx"
      provides: "Complete contract form with correct dropdown values and new fields"
    - path: "apps/web/src/lib/carrier/contracts.ts"
      provides: "Create/update logic handling all new fields"
  key_links:
    - from: "ContractForm.tsx"
      to: "/api/v1/carrier/contracts"
      via: "fetch POST/PATCH"
      pattern: "fetch.*api/v1/carrier/contracts"
    - from: "route.ts (API)"
      to: "lib/carrier/contracts.ts"
      via: "createContract/updateContract"
      pattern: "(createContract|updateContract)"
---

<objective>
Fix the carrier contract form so dropdown values match the exact DB CHECK constraints, add the 7 missing schema fields (contract_name, detention_free_minutes, detention_rate_per_hour, tonu_rate, layover_rate_per_day, payment_terms_override, auto_renew), and wire them through the full stack (migration, Prisma schema, lib, API, form, detail view).

Purpose: Contract creation currently fails with CHECK constraint violations because form dropdown values don't match the DB. Additionally, 7 spec fields were never added to the schema.
Output: Working contract CRUD with all fields and correct constraint values.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (lines 1290-1316 — CarrierContract model)
@apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql (DB CHECK constraints)
@apps/web/src/components/carrier/contracts/ContractForm.tsx
@apps/web/src/lib/carrier/contracts.ts
@apps/web/src/app/api/v1/carrier/contracts/route.ts
@apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
@apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add missing columns via migration + update Prisma schema</name>
  <files>
    apps/web/prisma/migrations/YYYYMMDD_contract_add_missing_fields/migration.sql
    apps/web/prisma/schema.prisma
  </files>
  <action>
Create a new SQL migration that ALTERs the `contracts` table to add these 7 columns:

```sql
ALTER TABLE contracts ADD COLUMN contract_name TEXT;
ALTER TABLE contracts ADD COLUMN detention_free_minutes INTEGER DEFAULT 120;
ALTER TABLE contracts ADD COLUMN detention_rate_per_hour NUMERIC(10,2);
ALTER TABLE contracts ADD COLUMN tonu_rate NUMERIC(10,2);
ALTER TABLE contracts ADD COLUMN layover_rate_per_day NUMERIC(10,2);
ALTER TABLE contracts ADD COLUMN payment_terms_override TEXT;
ALTER TABLE contracts ADD COLUMN auto_renew BOOLEAN NOT NULL DEFAULT false;
```

Add a CHECK constraint on payment_terms_override:
```sql
ALTER TABLE contracts ADD CONSTRAINT contracts_payment_terms_override_check
  CHECK (payment_terms_override IS NULL OR payment_terms_override IN ('net_15', 'net_30', 'net_45', 'net_60', 'net_90', 'due_on_receipt'));
```

Then update the CarrierContract model in schema.prisma to add the corresponding fields:
- contractName String? @map("contract_name")
- detentionFreeMinutes Int @default(120) @map("detention_free_minutes")
- detentionRatePerHour Decimal? @map("detention_rate_per_hour") @db.Decimal(10, 2)
- tonuRate Decimal? @map("tonu_rate") @db.Decimal(10, 2)
- layoverRatePerDay Decimal? @map("layover_rate_per_day") @db.Decimal(10, 2)
- paymentTermsOverride String? @map("payment_terms_override")
- autoRenew Boolean @default(false) @map("auto_renew")

Run `npx prisma migrate deploy` from apps/web to apply, then `npx prisma generate`.

Remove the TODO comment block at the top of ContractForm.tsx (lines 2-9) since these fields are now being added.
  </action>
  <verify>
Run `npx prisma migrate deploy` succeeds. Run `npx prisma generate` succeeds. Check the generated Prisma client includes the new fields.
  </verify>
  <done>7 new columns exist on the contracts table, Prisma schema matches, generated client includes all fields.</done>
</task>

<task type="auto">
  <name>Task 2: Fix dropdown values to match CHECK constraints + add new fields to form, API, and lib</name>
  <files>
    apps/web/src/components/carrier/contracts/ContractForm.tsx
    apps/web/src/lib/carrier/contracts.ts
    apps/web/src/app/api/v1/carrier/contracts/route.ts
    apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
    apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
  </files>
  <action>
**ContractForm.tsx — Fix dropdown constants to match exact DB CHECK values:**

```typescript
const CONTRACT_TYPES = [
  { value: 'spot', label: 'Spot' },
  { value: 'contract', label: 'Contract' },
  { value: 'dedicated', label: 'Dedicated' },
];

const RATE_TYPES = [
  { value: 'per_mile', label: 'Per Mile' },
  { value: 'flat', label: 'Flat Rate' },
  { value: 'per_load', label: 'Per Load' },
  { value: 'hourly', label: 'Hourly' },
];

const FUEL_SURCHARGE_METHODS = [
  { value: 'none', label: 'None' },
  { value: 'percentage', label: 'Percentage' },
  { value: 'per_mile', label: 'Per Mile' },
  { value: 'table', label: 'Table' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'expired', label: 'Expired' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'draft', label: 'Draft' },
];
```

Add a PAYMENT_TERMS constant:
```typescript
const PAYMENT_TERMS = [
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
  { value: 'net_45', label: 'Net 45' },
  { value: 'net_60', label: 'Net 60' },
  { value: 'net_90', label: 'Net 90' },
  { value: 'due_on_receipt', label: 'Due on Receipt' },
];
```

**ContractForm.tsx — Add form fields for the 7 new columns:**

Update the ContractData interface to include: contractName, detentionFreeMinutes, detentionRatePerHour, tonuRate, layoverRatePerDay, paymentTermsOverride, autoRenew.

Add form state for each new field with sensible defaults (detentionFreeMinutes: '120', autoRenew: false).

Add UI sections:
1. A "Contract Name" text input at the top (after client selector, before type/status row).
2. Under the "Rate & Accessorials" section heading, add a new sub-section "Detention / TONU / Layover" with:
   - detentionFreeMinutes (number input, placeholder "120")
   - detentionRatePerHour (number input, placeholder "75.00")
   - tonuRate (number input, placeholder "250.00")
   - layoverRatePerDay (number input, placeholder "350.00")
3. After the dates row, add a row with:
   - paymentTermsOverride (Select dropdown using PAYMENT_TERMS, with empty "Use client default" option)
   - autoRenew (checkbox or Switch component)

Include all new fields in the submit body payload.

**lib/carrier/contracts.ts:**

Update `ContractCreateInput` and `ContractUpdateInput` interfaces to include: contractName, detentionFreeMinutes, detentionRatePerHour, tonuRate, layoverRatePerDay, paymentTermsOverride, autoRenew.

Update `createContract` and `updateContract` to handle the new fields — decimal fields (detentionRatePerHour, tonuRate, layoverRatePerDay) need the same treatment as baseRate. detentionFreeMinutes should be parsed as int. autoRenew as boolean.

Update `getContract` and `listContracts` serialization to include decStr for the new Decimal fields and pass through the other new fields.

**API routes (route.ts for POST + [id]/route.ts for PATCH):**

Update ContractCreateSchema and ContractUpdateSchema Zod schemas to include:
- contractName: z.string().optional()
- detentionFreeMinutes: z.number().int().optional() (or z.coerce.number())
- detentionRatePerHour: z.string().optional()
- tonuRate: z.string().optional()
- layoverRatePerDay: z.string().optional()
- paymentTermsOverride: z.string().optional()
- autoRenew: z.boolean().optional()

Also add z.enum() validation for the CHECK-constrained string fields:
- contractType: z.enum(['spot', 'contract', 'dedicated']).optional()
- rateType: z.enum(['per_mile', 'flat', 'per_load', 'hourly']).optional()
- fuelSurchargeMethod: z.enum(['none', 'percentage', 'per_mile', 'table']).optional()
- status: z.enum(['active', 'expired', 'cancelled', 'draft']).optional() (only in update schema)

**ContractDetail.tsx:**

Display the new fields in the contract detail view. Add detention/TONU/layover info in the rate section, payment terms and auto-renew in the contract info section.
  </action>
  <verify>
1. Run `tsc --noEmit` from apps/web — must pass cleanly.
2. Start dev server, navigate to /carrier/contracts/new, verify all dropdowns show correct values matching DB constraints.
3. Create a contract — should succeed without CHECK violation errors.
4. Edit the contract — should round-trip all fields.
  </verify>
  <done>All 4 dropdown fields match DB CHECK constraints exactly. All 7 new fields appear in form, save to DB, and display in detail view. tsc --noEmit passes. End-to-end create and edit works.</done>
</task>

</tasks>

<verification>
1. `tsc --noEmit` passes in apps/web
2. Create a new contract via the UI — no DB errors
3. All dropdown values are valid per DB CHECK constraints
4. Edit an existing contract — all fields round-trip correctly
5. New fields (contract_name, detention, TONU, layover, payment_terms, auto_renew) visible in detail view
</verification>

<success_criteria>
- Zero CHECK constraint violation errors when creating/editing contracts
- Form dropdowns exactly match: contract_type IN (spot, contract, dedicated), rate_type IN (per_mile, flat, per_load, hourly), fuel_surcharge_method IN (none, percentage, per_mile, table), status IN (active, expired, cancelled, draft)
- 7 new fields exist in schema, form, API, and detail view
- tsc --noEmit passes
</success_criteria>

<output>
After completion, create `.planning/quick/187-fix-carrier-contract-form-query-db-for-e/187-SUMMARY.md`
</output>
