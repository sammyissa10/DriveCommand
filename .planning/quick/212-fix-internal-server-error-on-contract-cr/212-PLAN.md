---
phase: quick-212
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/contracts/route.ts
  - apps/web/src/components/carrier/contracts/ContractForm.tsx
  - apps/web/src/lib/carrier/contracts.ts
autonomous: true
must_haves:
  truths:
    - "Contract creation succeeds without Internal Server Error"
    - "All enum dropdown values exactly match database CHECK constraints"
    - "org_id on created contract comes from authenticated session, never from client payload"
    - "Submitting a client_id from a different org returns an error and creates nothing"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/contracts/route.ts"
      provides: "POST handler with Zod validation, tenant isolation, client ownership check"
    - path: "apps/web/src/components/carrier/contracts/ContractForm.tsx"
      provides: "Form with enum values matching CHECK constraints"
    - path: "apps/web/src/lib/carrier/contracts.ts"
      provides: "createContract with error logging"
  key_links:
    - from: "ContractForm.tsx"
      to: "/api/v1/carrier/contracts POST"
      via: "fetch POST with JSON body"
      pattern: "fetch.*api/v1/carrier/contracts"
    - from: "route.ts POST"
      to: "createContract"
      via: "function call after Zod parse + client ownership check"
      pattern: "createContract\\(orgId"
---

<objective>
Fix Internal Server Error on contract creation and enforce multi-tenant security.

Purpose: Contract creation is broken (likely CHECK constraint violation) and lacks tenant isolation on client_id.
Output: Working contract creation with full tenant security.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/v1/carrier/contracts/route.ts
@apps/web/src/components/carrier/contracts/ContractForm.tsx
@apps/web/src/lib/carrier/contracts.ts
@apps/web/src/lib/auth/supabase.ts

Database CHECK constraints on `contracts` table (from migration 20260404100002):
- contract_type: IN ('spot', 'contract', 'dedicated')
- rate_type: IN ('per_mile', 'flat', 'per_load', 'hourly')
- fuel_surcharge_method: IN ('none', 'percentage', 'per_mile', 'table')
- status: IN ('active', 'expired', 'cancelled', 'draft')

NOTE: The seed enum catalog (migration 20260404100014) has DIFFERENT values for contract_type
(spot_rate, dedicated, contract_lane, brokered) and fuel_surcharge_method (none, doe_index,
fixed_per_mile, fixed_flat). These are display/catalog values and do NOT match CHECK constraints.
The form currently hardcodes values that DO match CHECK constraints. If the form is ever changed
to load from the catalog, it will break. Keep form values hardcoded to match CHECK constraints.

IMPORTANT: The current form values appear to match CHECK constraints. The actual error may be
caused by something else (e.g., the `status` field being sent by the form but stripped by Zod,
causing the DB default to apply -- or a missing required field, or a FK issue). The executor
MUST add error logging first and reproduce the error to identify the exact cause before
applying fixes.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose and fix contract creation error + align enum values</name>
  <files>
    apps/web/src/lib/carrier/contracts.ts
    apps/web/src/components/carrier/contracts/ContractForm.tsx
    apps/web/src/app/api/v1/carrier/contracts/route.ts
  </files>
  <action>
Step 1 -- Add diagnostic error logging to `createContract` in `apps/web/src/lib/carrier/contracts.ts`:
In the existing catch block (line 155), add `logger.error('createContract failed', { orgId, clientId, data, err })` BEFORE the unique-violation check so the full error (including constraint name) is logged regardless of retry logic.

Step 2 -- Reproduce the error:
Start the dev server (`npm run dev` from apps/web) and attempt to create a contract via the UI, OR use curl:
```
curl -X POST http://localhost:3000/api/v1/carrier/contracts \
  -H "Content-Type: application/json" \
  -H "Cookie: <session cookie>" \
  -d '{"clientId":"<valid-client-uuid>","contractType":"spot","rateType":"per_mile","fuelSurchargeMethod":"none"}'
```
Read the server logs to identify the EXACT error (constraint name, missing field, etc.).

Step 3 -- Fix the root cause based on what the logs reveal:

If the error is a CHECK constraint violation on any enum field:
- Update the corresponding constant array in ContractForm.tsx so each `value` attribute exactly matches the CHECK constraint values listed in the context section above.
- Update the corresponding `z.enum()` in ContractCreateSchema in route.ts to match.

If the error is that `status` is not being set (form sends it but Zod strips it):
- Add `status: z.enum(['active', 'expired', 'cancelled', 'draft']).default('active').optional()` to `ContractCreateSchema` in route.ts.
- Ensure the `ContractCreateInput` type in contracts.ts includes `status?: string`.

If the error is something else (FK violation, missing field, etc.):
- Fix accordingly, ensuring the fix is scoped to the contract creation flow only.

Step 4 -- Regardless of root cause, verify ALL enum arrays in ContractForm.tsx match CHECK constraints:
- CONTRACT_TYPES values must be exactly: spot, contract, dedicated
- RATE_TYPES values must be exactly: per_mile, flat, per_load, hourly
- FUEL_SURCHARGE_METHODS values must be exactly: none, percentage, per_mile, table
- STATUS_OPTIONS values must be exactly: active, expired, cancelled, draft
- Labels can remain human-readable (e.g., "Spot" for "spot").

Step 5 -- Verify the Zod enums in ContractCreateSchema (route.ts) match the same CHECK constraint values.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web -- no TypeScript errors. Create a contract via the API or UI and confirm it returns 201 with a valid contract object. Check server logs for zero constraint violation errors.
  </verify>
  <done>Contract creation succeeds. All form enum values match database CHECK constraints. Error logging is in place for future debugging.</done>
</task>

<task type="auto">
  <name>Task 2: Enforce tenant isolation on contract creation</name>
  <files>
    apps/web/src/app/api/v1/carrier/contracts/route.ts
  </files>
  <action>
In the POST handler of `apps/web/src/app/api/v1/carrier/contracts/route.ts`:

1. After Zod parsing succeeds, BEFORE calling `createContract`, add a client ownership check:

```typescript
// Verify client belongs to this org (prevents cross-tenant contract creation)
const client = await prisma.carrierClient.findFirst({
  where: { id: parsed.data.clientId, orgId },
});
if (!client) {
  return NextResponse.json(
    { error: 'Invalid client' },
    { status: 400 }
  );
}
```

Add the prisma import at the top of route.ts:
```typescript
import { prisma } from '@/lib/db/prisma';
```

2. The route already extracts `orgId` from `session.tenantId` and passes it to `createContract(orgId, clientId, contractData)`. Verify that `orgId` is NOT accepted from the request body -- the current Zod schema already excludes `orgId`, which is correct. Confirm the `createContract` function receives `orgId` as a parameter (not from `data`).

3. Check if the contract form references any other entity that needs ownership validation (e.g., route template). Looking at the current ContractCreateSchema, there is no route template field at creation time, so no additional FK checks are needed.

4. Ensure the error response for invalid client does NOT leak internal details -- return a generic "Invalid client" message.
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web -- no TypeScript errors. Test: (1) Create a contract with a valid client_id belonging to the current org -- succeeds with 201. (2) Create a contract with an invented UUID as client_id -- returns 400 "Invalid client". (3) Query the created contract directly in the database and confirm its org_id matches the session's tenantId.
  </verify>
  <done>client_id ownership is validated server-side before contract creation. org_id comes exclusively from the authenticated session. Cross-tenant contract creation is impossible.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors from apps/web
2. Contract creation succeeds for all valid enum combinations
3. Created contract has correct org_id from session (not from request body)
4. Submitting a client_id from a different org returns 400, creates nothing
5. Server logs show no constraint violation errors during successful creation
</verification>

<success_criteria>
- Contract form submits successfully without Internal Server Error
- All enum dropdown values match database CHECK constraints exactly
- Tenant isolation enforced: org_id from session, client_id ownership validated
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/212-fix-internal-server-error-on-contract-cr/212-SUMMARY.md`
</output>
