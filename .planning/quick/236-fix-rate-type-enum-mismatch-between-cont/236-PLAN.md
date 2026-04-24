---
phase: quick-236
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/YYYYMMDDHHMMSS_align_rate_type_superset/migration.sql
  - apps/web/src/app/api/v1/carrier/loads/route.ts
  - apps/web/src/app/api/v1/carrier/contracts/route.ts
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/components/carrier/contracts/ContractForm.tsx
  - apps/web/src/lib/carrier/revenue-calculator.ts
autonomous: true
must_haves:
  truths:
    - "Load form submits successfully with any rate_type from the superset (per_mile, per_load, per_hour, per_stop, flat, per_cwt, per_pallet, hourly)"
    - "Contract form submits successfully with any rate_type from the superset"
    - "A contract with rate_type per_load or per_hour auto-populates the load form without Zod rejection"
    - "Revenue calculator handles per_load and per_hour correctly"
  artifacts:
    - path: "apps/web/prisma/migrations/*_align_rate_type_superset/migration.sql"
      provides: "DB CHECK constraint update for both contracts and loads tables"
      contains: "per_load"
    - path: "apps/web/src/app/api/v1/carrier/loads/route.ts"
      provides: "Zod schema with full 8-value superset"
      contains: "per_hour"
    - path: "apps/web/src/app/api/v1/carrier/contracts/route.ts"
      provides: "Zod schema with full 8-value superset"
      contains: "per_cwt"
  key_links:
    - from: "ContractForm rate_type dropdown"
      to: "contracts DB CHECK constraint"
      via: "API Zod validation"
      pattern: "per_mile.*per_load.*per_hour.*per_stop.*flat.*per_cwt.*per_pallet.*hourly"
    - from: "LoadForm rate_type dropdown"
      to: "loads DB CHECK constraint"
      via: "API Zod validation"
      pattern: "per_mile.*per_load.*per_hour.*per_stop.*flat.*per_cwt.*per_pallet.*hourly"
---

<objective>
Fix rate_type enum mismatch between contracts and loads that blocks Load form submission when a contract carries a rate_type value (e.g. per_load, per_hour) not in the load's Zod schema or DB CHECK constraint.

Purpose: Unblock QA on Carrier Operations load editing. Both contracts and loads must accept the full superset: per_mile | per_load | per_hour | per_stop | flat | per_cwt | per_pallet | hourly.

Output: Aligned DB CHECK constraints, Zod schemas, dropdown options, and revenue calculator across contracts and loads.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (lines 1305-1315 for Contract model, lines 1555-1565 for Load model)
@apps/web/src/app/api/v1/carrier/loads/route.ts (line 39 — Zod rateType enum)
@apps/web/src/app/api/v1/carrier/contracts/route.ts (line 14 — Zod rateType enum)
@apps/web/src/components/carrier/loads/LoadForm.tsx (lines 73-81 RATE_TYPE_LABELS, lines 555-561 dropdown options)
@apps/web/src/components/carrier/contracts/ContractForm.tsx (lines 60-65 RATE_TYPES array)
@apps/web/src/lib/carrier/revenue-calculator.ts (lines 55-84 switch on rateType)
@apps/web/prisma/migrations/20260404100002_carrier_contracts/migration.sql (line 36 — contracts_rate_type_check)
@apps/web/prisma/migrations/20260404100008_carrier_loads/migration.sql (line 67 — loads_rate_type_check)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Align DB CHECK constraints to full superset via migration</name>
  <files>
    apps/web/prisma/migrations/YYYYMMDDHHMMSS_align_rate_type_superset/migration.sql
  </files>
  <action>
Create a new Prisma migration that updates both CHECK constraints to the full 8-value superset.

Current mismatches found:
- contracts_rate_type_check: allows (per_mile, flat, per_load, hourly) — MISSING per_hour, per_stop, per_cwt, per_pallet
- loads_rate_type_check: allows (per_mile, flat, per_cwt, per_pallet, per_stop, hourly) — MISSING per_load, per_hour

Migration SQL:
```sql
-- Align contracts rate_type CHECK to full superset
ALTER TABLE carrier_contracts DROP CONSTRAINT IF EXISTS contracts_rate_type_check;
ALTER TABLE carrier_contracts ADD CONSTRAINT contracts_rate_type_check
  CHECK (rate_type IN ('per_mile', 'per_load', 'per_hour', 'per_stop', 'flat', 'per_cwt', 'per_pallet', 'hourly'));

-- Align loads rate_type CHECK to full superset
ALTER TABLE carrier_loads DROP CONSTRAINT IF EXISTS loads_rate_type_check;
ALTER TABLE carrier_loads ADD CONSTRAINT loads_rate_type_check
  CHECK (rate_type IN ('per_mile', 'per_load', 'per_hour', 'per_stop', 'flat', 'per_cwt', 'per_pallet', 'hourly'));
```

Create the migration folder with `npx prisma migrate dev --create-only --name align_rate_type_superset` from apps/web, then replace the generated SQL with the above. Then apply with `npx prisma migrate deploy`.

Also update the carrier_catalog_meta seed data if relevant — the existing seed migration (20260404100014) already has per_load and per_hour in its seed rows, so no change needed there.
  </action>
  <verify>
Run from apps/web:
```
npx prisma migrate deploy
```
Migration applies without error. Then confirm constraints:
```
npx prisma db execute --stdin <<< "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conname IN ('contracts_rate_type_check', 'loads_rate_type_check');"
```
Both constraints should list all 8 values.
  </verify>
  <done>Both carrier_contracts and carrier_loads tables accept the full 8-value rate_type superset at the DB level.</done>
</task>

<task type="auto">
  <name>Task 2: Align Zod schemas, dropdown options, and revenue calculator</name>
  <files>
    apps/web/src/app/api/v1/carrier/loads/route.ts
    apps/web/src/app/api/v1/carrier/contracts/route.ts
    apps/web/src/components/carrier/loads/LoadForm.tsx
    apps/web/src/components/carrier/contracts/ContractForm.tsx
    apps/web/src/lib/carrier/revenue-calculator.ts
  </files>
  <action>
Define the canonical superset once and use it consistently across all files.

**1. Loads API Zod schema** (apps/web/src/app/api/v1/carrier/loads/route.ts line 39):
Change:
  `rateType: z.enum(['per_mile', 'flat', 'per_load', 'per_stop', 'per_cwt', 'per_pallet', 'hourly']).optional()`
To:
  `rateType: z.enum(['per_mile', 'per_load', 'per_hour', 'per_stop', 'flat', 'per_cwt', 'per_pallet', 'hourly']).optional()`
(Add `per_hour` — this is the primary fix for the reported bug.)

**2. Contracts API Zod schema** (apps/web/src/app/api/v1/carrier/contracts/route.ts line 14):
Change:
  `rateType: z.enum(['per_mile', 'flat', 'per_load', 'hourly']).optional()`
To:
  `rateType: z.enum(['per_mile', 'per_load', 'per_hour', 'per_stop', 'flat', 'per_cwt', 'per_pallet', 'hourly']).optional()`
(Add per_hour, per_stop, per_cwt, per_pallet.)

**3. LoadForm dropdown** (apps/web/src/components/carrier/loads/LoadForm.tsx lines 555-561):
Add the missing `per_hour` option. The dropdown currently has 7 options (per_mile, flat, per_load, per_cwt, per_pallet, per_stop, hourly). Add:
  `<option value="per_hour">Per Hour</option>`
Keep the existing `hourly` option — they are distinct values in the superset.

Also update RATE_TYPE_LABELS (lines 73-81) to add:
  `per_hour: 'Rate per Hour ($)',`
And add `per_load` label if missing (check — it IS present at line 76).

**4. ContractForm dropdown** (apps/web/src/components/carrier/contracts/ContractForm.tsx lines 60-65):
The RATE_TYPES array currently has 4 entries (per_mile, flat, per_load, hourly). Expand to full 8:
```ts
const RATE_TYPES = [
  { value: 'per_mile', label: 'Per Mile' },
  { value: 'per_load', label: 'Per Load' },
  { value: 'per_hour', label: 'Per Hour' },
  { value: 'per_stop', label: 'Per Stop' },
  { value: 'flat', label: 'Flat Rate' },
  { value: 'per_cwt', label: 'Per CWT' },
  { value: 'per_pallet', label: 'Per Pallet' },
  { value: 'hourly', label: 'Hourly' },
];
```

**5. Revenue calculator** (apps/web/src/lib/carrier/revenue-calculator.ts):
The switch statement handles per_mile, flat, per_stop, per_cwt, per_pallet, hourly — but NOT per_load or per_hour. Add:
- `case 'per_load':` — treat like flat (baseRevenue = rateAmount). Add right after the `case 'flat':` block.
- `case 'per_hour':` — treat like hourly (baseRevenue = rateAmount * hours). Add right after or combine with `case 'hourly':` using fall-through.

Note: `per_load` and `flat` are semantically similar (single fixed amount). `per_hour` and `hourly` are semantically similar (time-based). The distinction exists because contracts and loads historically used different naming. Both must be supported.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` — no type errors
2. Start dev server, navigate to Carrier > Loads > edit LD-2026-00004
3. Verify the rate_type dropdown shows all 8 options
4. Submit the form — should succeed without Zod error
5. Navigate to Carrier > Contracts > create new — verify dropdown shows all 8 options
  </verify>
  <done>
- Load form submission succeeds with any of the 8 rate_type values
- Contract form accepts all 8 rate_type values
- Revenue calculator handles per_load and per_hour without falling to default case
- TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes
2. DB CHECK constraints on both tables accept all 8 values
3. Load edit form for LD-2026-00004 (which has contract-inherited rate_type) submits without Zod error
4. Both load and contract dropdowns show all 8 rate_type options
5. Revenue preview in LoadFinancials renders correctly for per_load and per_hour
</verification>

<success_criteria>
- Zero Zod validation errors when submitting loads with any rate_type from the superset
- Contracts and loads DB constraints aligned to identical 8-value set
- All UI dropdowns, Zod schemas, and revenue calculator handle the full superset
</success_criteria>

<output>
After completion, create `.planning/quick/236-fix-rate-type-enum-mismatch-between-cont/236-SUMMARY.md`
</output>
