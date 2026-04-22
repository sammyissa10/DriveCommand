---
phase: quick-274
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/documents.ts
autonomous: true
must_haves:
  truths:
    - "Documents uploaded against a stop get client_id and contract_id from the linked load"
    - "Documents uploaded against a load get client_id and contract_id from the load"
    - "Documents uploaded against a dispatch get client_id and contract_id from the single linked load, or null if ambiguous"
    - "Documents uploaded against a contract get contract_id from the contract and client_id from the contract's client"
    - "Upload never fails due to client/contract resolution errors"
  artifacts:
    - path: "apps/web/src/lib/carrier/documents.ts"
      provides: "client_id and contract_id auto-resolution in uploadDocument"
  key_links:
    - from: "uploadDocument"
      to: "CarrierLoad.clientId / CarrierLoad.contractId"
      via: "Prisma lookup during parent verification"
      pattern: "clientId.*contractId"
---

<objective>
Propagate client_id and contract_id to CarrierDocument records automatically during upload.

Purpose: Documents currently lack client/contract linkage unless explicitly passed. This enriches the data model so documents can be queried and filtered by client and contract.
Output: Updated uploadDocument function with auto-resolution logic.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/documents.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add client_id and contract_id auto-resolution to uploadDocument</name>
  <files>apps/web/src/lib/carrier/documents.ts</files>
  <action>
Modify the `uploadDocument` function in `apps/web/src/lib/carrier/documents.ts`. The existing parent verification block (lines 57-92) already queries parent entities and derives `loadId`/`dispatchId`/`contractId`. Expand those queries to also resolve `clientId` and `contractId` from related loads/contracts. Additionally, replace the existing post-upload clientId resolution block (lines 123-139) with the broader resolution done during parent verification.

Specific changes:

1. Add a `let clientId: string | null = null;` declaration near the top of the function alongside the existing destructured variables (around line 39). Remove the later duplicate declaration at line 124-125.

2. In the `parentType === 'stop'` branch (line 59-69):
   - Expand the `select` to include `load: { select: { clientId: true, contractId: true } }`.
   - After verifying org ownership, wrap in try/catch and resolve:
     ```
     clientId = stop.load?.clientId ?? null;
     if (!contractId) contractId = stop.load?.contractId ?? null;
     ```

3. In the `parentType === 'load'` branch (line 70-80):
   - Expand the `select` to include `clientId: true` (add it alongside existing `dispatchId` and `contractId`).
   - After verifying org ownership, add:
     ```
     if (!clientId) clientId = load.clientId ?? null;
     ```
   (contractId is already resolved on line 79)

4. In the `parentType === 'dispatch'` branch (line 81-84):
   - Query loads for the dispatch: `prisma.carrierLoad.findMany({ where: { dispatchId: parentId, orgId }, select: { clientId: true, contractId: true } })`
   - If exactly 1 load found, set `clientId = loads[0].clientId ?? null` and `contractId = loads[0].contractId ?? null` (only if not already set).
   - If 0 or 2+ loads, leave clientId/contractId as-is (null or whatever was passed in).
   - Wrap the load lookup in try/catch — on error, log warning and leave null.

5. In the `parentType === 'contract'` branch (line 85-88):
   - Expand the query select to include `clientId: true`.
   - After verifying org ownership:
     ```
     if (!contractId) contractId = parentId;
     if (!clientId) clientId = contract.clientId ?? null;
     ```

6. Remove the entire "Determine stopId and clientId linkage" block (lines 123-139). Replace with just:
   ```
   const stopId: string | null = parentType === 'stop' ? parentId : null;
   ```

7. Wrap ALL client/contract resolution logic (steps 2-5) in individual try/catch blocks per branch. On catch, log a warning with `logger.warn(...)` and leave the values as null. The upload must never fail due to resolution errors.

8. The `prisma.carrierDocument.create` call already includes `clientId`, `loadId`, `dispatchId`, `contractId` — no changes needed there.

IMPORTANT: Do NOT change the upload flow, storage logic, file validation, or org verification logic. Only add/modify the client_id and contract_id resolution.
  </action>
  <verify>
Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors. Grep the file for `clientId` and `contractId` to confirm they are resolved in all 4 parent type branches (stop, load, dispatch, contract).
  </verify>
  <done>
- stop uploads resolve clientId and contractId from the linked load
- load uploads resolve clientId directly from the load, contractId already handled
- dispatch uploads resolve clientId and contractId from the single linked load (null if ambiguous)
- contract uploads resolve contractId from parentId and clientId from the contract's client
- All resolution wrapped in try/catch so upload never fails from lookup errors
- Old post-upload clientId block (BOL/POD special case) removed in favor of universal resolution
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit -p apps/web/tsconfig.json` passes
- All 4 parent types (stop, load, dispatch, contract) have clientId/contractId resolution
- No changes to file upload, storage, or org verification logic
- try/catch wrapping prevents upload failures from resolution errors
</verification>

<success_criteria>
The uploadDocument function automatically populates clientId and contractId on CarrierDocument records for all parent types, with graceful fallback to null on any resolution error.
</success_criteria>

<output>
After completion, create `.planning/quick/274-propagate-client-id-and-contract-id-to-c/274-SUMMARY.md`
</output>
