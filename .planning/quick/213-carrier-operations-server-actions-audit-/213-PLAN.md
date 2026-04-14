---
phase: quick-213
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md
autonomous: true
must_haves:
  truths:
    - "All 13 carrier tables checked for CHECK constraint mismatches"
    - "All carrier Zod schemas cross-referenced against Prisma NOT NULL columns"
    - "All carrier form defaultValues audited for null string initialization"
    - "All carrier write actions audited for tenant isolation"
  artifacts:
    - path: ".planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md"
      provides: "Complete 4-section audit report with severity-rated findings"
      contains: "## Audit 1"
  key_links: []
---

<objective>
Systematic read-only audit of all Carrier Operations server actions, Zod schemas, forms, and API routes for ISE risk and tenant isolation gaps.

Purpose: Surface all remaining instances of three confirmed ISE patterns (CHECK constraint mismatches, Zod stripping NOT NULL fields, null string initialization) plus tenant isolation gaps across the entire Carrier Operations module.
Output: A comprehensive markdown report at `.planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/schema.prisma

Key file groups to audit:

Zod schemas (packages/validation/src/):
@packages/validation/src/load.ts
@packages/validation/src/truck.ts
@packages/validation/src/driver.ts
@packages/validation/src/route.ts
@packages/validation/src/expense.ts
@packages/validation/src/document.ts
@packages/validation/src/customer.ts
@packages/validation/src/invoice.ts
@packages/validation/src/payroll.ts

Carrier lib (data access / write logic):
@apps/web/src/lib/carrier/clients.ts
@apps/web/src/lib/carrier/contracts.ts
@apps/web/src/lib/carrier/dispatches.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/stops.ts
@apps/web/src/lib/carrier/facilities.ts
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/src/lib/carrier/fleet-trucks.ts
@apps/web/src/lib/carrier/expenses.ts
@apps/web/src/lib/carrier/documents.ts
@apps/web/src/lib/carrier/route-templates.ts
@apps/web/src/lib/carrier/pay-calculator.ts

Server action:
@apps/web/src/actions/carrier/save-route-template.ts

Form components:
@apps/web/src/components/carrier/clients/ClientForm.tsx
@apps/web/src/components/carrier/contracts/ContractForm.tsx
@apps/web/src/components/carrier/dispatches/NewDispatchForm.tsx
@apps/web/src/components/carrier/loads/LoadForm.tsx
@apps/web/src/components/carrier/facilities/FacilityForm.tsx
@apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
@apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
@apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
@apps/web/src/components/carrier/expenses/ExpenseForm.tsx
@apps/web/src/components/carrier/stops/StopBuilder.tsx
@apps/web/src/components/carrier/stops/StopCard.tsx
@apps/web/src/components/carrier/documents/DocumentUploadModal.tsx

API routes (write endpoints):
@apps/web/src/app/api/v1/carrier/clients/route.ts
@apps/web/src/app/api/v1/carrier/contracts/route.ts
@apps/web/src/app/api/v1/carrier/dispatches/route.ts
@apps/web/src/app/api/v1/carrier/loads/route.ts
@apps/web/src/app/api/v1/carrier/stops/route.ts
@apps/web/src/app/api/v1/carrier/facilities/route.ts
@apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
@apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
@apps/web/src/app/api/v1/carrier/expenses/route.ts
@apps/web/src/app/api/v1/carrier/documents/route.ts
@apps/web/src/app/api/v1/carrier/route-templates/route.ts
@apps/web/src/app/api/v1/carrier/pay-records/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Run all 4 audits and produce findings report</name>
  <files>.planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md</files>
  <action>
This is a READ-ONLY audit. Do NOT modify any source files.

**Audit 1 — CHECK constraint alignment:**

Use the Supabase MCP `execute_sql` tool to run the following query for EACH of these 13 tables:
- clients, contracts, dispatches, loads, stops, documents, expenses, driver_pay_records, route_templates, route_template_stops, facilities, trucks, drivers

Query per table:
```sql
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = '"<table_name>"'::regclass AND contype = 'c';
```

If a table does not exist, note it as "not yet migrated" and move on.

For each CHECK constraint found:
1. Extract the allowed values from the constraint definition
2. Find the corresponding Zod schema in `packages/validation/src/` — extract the z.enum() or z.literal() values
3. Find the corresponding form component dropdown — extract the `<option value="...">` or SelectItem values
4. Flag ANY mismatch where:
   - A DB CHECK value is missing from the Zod enum (will reject valid DB values)
   - A Zod/form value is NOT in the DB CHECK constraint (will cause DB rejection → ISE)
   - The Zod schema uses z.string() instead of z.enum() for a CHECK-constrained column

**Audit 2 — Zod schema vs DB NOT NULL columns:**

For each Carrier Operations Prisma model in `apps/web/prisma/schema.prisma`:
1. List all columns where the field is required (no `?` suffix) AND has no `@default()` annotation — these are NOT NULL with no default
2. Find the corresponding Zod schema in `packages/validation/src/`
3. Flag any required DB column that is:
   - Absent from the Zod schema entirely (will be stripped → Prisma NOT NULL failure)
   - Marked as `.optional()` in the Zod schema (will be stripped if not provided → Prisma failure)
   - Note: `org_id`/`tenantId` is typically injected server-side, so its absence from Zod is expected — note but mark as Low severity

**Audit 3 — Null string initialization in forms:**

Search ALL carrier form components listed in the context section:
1. Find every `defaultValues` object (React Hook Form) or initial state object
2. Flag any optional string field initialized as `null` rather than `""` or `undefined`
3. Search for `formData.get('field') as string` patterns that do NOT use `formString()` / `formStringOrUndefined()` helpers
4. Also flag any `useState<string | null>(null)` for form input fields

**Audit 4 — Tenant isolation consistency:**

For every API route and lib function that performs a database WRITE (create, update, delete):
1. Confirm `requireTenantId()` or equivalent auth check is called at the top of the handler
2. Confirm `org_id` / `tenantId` is read from the authenticated session, NEVER from the request body/params
3. For any FK reference in the write (client_id, driver_id, truck_id, facility_id, contract_id, dispatch_id, load_id, route_template_id):
   - Confirm there is an ownership check that the referenced entity belongs to the same tenant
   - Flag any FK that is accepted from client input without an ownership verification query
4. Check the lib/carrier/*.ts files since these contain the actual Prisma queries — many API routes delegate to these

**Report format:**

Write the report to `.planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md` with this structure:

```markdown
# Carrier Operations Audit Report
**Date:** 2026-04-14
**Scope:** All Carrier Operations server actions, Zod schemas, forms, API routes
**Mode:** Read-only — no fixes applied

## Summary
- Total findings: X
- Critical: X | High: X | Medium: X | Low: X

## Audit 1 — CHECK Constraint Alignment

### Methodology
[Brief description of what was checked]

### Findings

| # | Table | Column | Finding | Current Value | Expected Value | Severity |
|---|-------|--------|---------|---------------|----------------|----------|
| 1 | ... | ... | ... | ... | ... | Critical |

### Tables with no CHECK constraints
[List]

### Tables not yet migrated
[List or "None"]

## Audit 2 — Zod Schema vs DB NOT NULL Columns

### Findings

| # | Model | Column | Zod Schema | Finding | Severity |
|---|-------|--------|------------|---------|----------|
| 1 | ... | ... | ... | ... | High |

## Audit 3 — Null String Initialization in Forms

### Findings

| # | File | Field | Pattern Found | Recommended Fix | Severity |
|---|------|-------|---------------|-----------------|----------|
| 1 | ... | ... | `null` default | Use `""` | Medium |

## Audit 4 — Tenant Isolation

### Findings

| # | File/Route | Action | Finding | Severity |
|---|------------|--------|---------|----------|
| 1 | ... | CREATE | Missing FK ownership check for client_id | Critical |

## Appendix: Files Audited
[Full list of files reviewed]
```

Severity definitions:
- **Critical**: Will cause ISE in production under normal user actions (CHECK mismatch, missing NOT NULL field)
- **High**: Can cause ISE under edge cases or enables cross-tenant data access
- **Medium**: Code smell that increases ISE risk or reduces safety (null init, missing helper)
- **Low**: Best practice violation with minimal runtime risk
  </action>
  <verify>
Verify the report file exists and contains all 4 audit sections:
```bash
grep -c "## Audit" .planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md
```
Should return 4.

Also verify all 13 tables were checked:
```bash
grep -c "clients\|contracts\|dispatches\|loads\|stops\|documents\|expenses\|driver_pay_records\|route_templates\|route_template_stops\|facilities\|trucks\|drivers" .planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md
```
Should be >= 13.
  </verify>
  <done>
213-REPORT.md exists with all 4 audit sections complete. Every carrier table checked for CHECK constraints. Every Zod schema cross-referenced against Prisma NOT NULL columns. Every form component checked for null initialization. Every write action checked for tenant isolation. Each finding has table/file, field, finding type, current vs expected values, and severity rating.
  </done>
</task>

</tasks>

<verification>
- Report file exists at `.planning/quick/213-carrier-operations-server-actions-audit-/213-REPORT.md`
- All 4 audit sections present with findings tables
- All 13 tables checked in Audit 1 (or noted as not-yet-migrated)
- Summary section has accurate counts
</verification>

<success_criteria>
- Complete audit report covering all Carrier Operations entities
- Zero source files modified
- Every finding has a severity rating
- No entity skipped
</success_criteria>

<output>
After completion, create `.planning/quick/213-carrier-operations-server-actions-audit-/213-SUMMARY.md`
</output>
