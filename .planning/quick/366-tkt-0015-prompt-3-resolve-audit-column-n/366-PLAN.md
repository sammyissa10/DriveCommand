---
phase: 366-tkt-0015-prompt-3-resolve-audit-column-n
plan: 366
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/db/extensions/audit-columns.ts
  - apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts
  - .planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md
autonomous: true

must_haves:
  truths:
    - "withAuditColumns auto-injects audit FK on writes to both createdById/updatedById AND createdBy/updatedBy models"
    - "Creating a DriverBonus via the tenant Prisma client populates createdBy with the session userId"
    - "Updating a DriverBonus via the tenant Prisma client populates updatedBy, leaves createdBy unchanged"
    - "EXEMPT_AUDIT_MODELS contains 9 entries (was 19) — only legitimately system-generated / audit-table models remain"
    - "The 10 naming-affected models are now actively injected (8 Driver Pay + PlaybookStep + StepInstance, all FULL classification)"
    - "Existing 37 createdById/updatedById models continue to inject correctly"
    - "tsc --noEmit exits 0 from apps/web"
  artifacts:
    - path: "apps/web/src/lib/db/extensions/audit-columns.ts"
      provides: "Dual-convention audit column injection extension"
      contains: "fieldMap"
    - path: "apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts"
      provides: "DriverBonus audit auto-capture coverage"
      contains: "createdBy"
    - path: ".planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md"
      provides: "Updated audit rollout status reflecting Prompt 3 resolution"
      contains: "Completed in Prompt 3"
  key_links:
    - from: "apps/web/src/lib/db/extensions/audit-columns.ts"
      to: "Prisma.dmmf.datamodel.models"
      via: "precomputed Map at extension construction"
      pattern: "Prisma\\.dmmf"
    - from: "DriverBonus write via tenantPrisma"
      to: "createdBy / updatedBy DB columns"
      via: "withAuditColumns query hook"
      pattern: "createdBy"
---

<objective>
TKT-0015 Prompt 3 — Teach `withAuditColumns` to detect and inject into either Prisma field naming convention (`createdById`/`updatedById` OR `createdBy`/`updatedBy`) per model, then remove the 10 naming-affected models from `EXEMPT_AUDIT_MODELS` so their audit columns auto-populate.

Purpose: Closes the workaround documented in 2b-SUMMARY Section 7. The 8 Driver Pay models plus PlaybookStep and StepInstance currently sit in EXEMPT because the extension only recognizes the newer field naming. Wave 4 added `updated_by` columns to all 8 Driver Pay tables; those columns remain NULL on every update until this ships. After this, audit auto-capture covers 47 of 47 tenant-scoped models.

Output: Updated extension with precomputed naming-convention registry; tests covering dual-convention injection on a Driver Pay model; updated SUMMARY reflecting resolved status.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md
@apps/web/src/lib/db/extensions/audit-columns.ts
@apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add dual-convention naming registry to withAuditColumns and remove 10 models from EXEMPT</name>
  <files>apps/web/src/lib/db/extensions/audit-columns.ts</files>
  <action>
**Reasoning step (write as a JSDoc block at top of file, 2-3 sentences):**
Justify the detection mechanism. Required choice: build a precomputed `Map<modelName, { createField: 'createdById' | 'createdBy' | null, updateField: 'updatedById' | 'updatedBy' | null }>` ONCE at extension factory invocation time by walking `Prisma.dmmf.datamodel.models`. For each model, check the `fields` array for a field named `createdById`, then `createdBy`; same for update side. Per-query lookup would re-walk DMMF on every operation; precomputed Map is O(1) lookup per query, one-time cost at startup.

**Implementation:**

1. At top of file, import `Prisma` (already imported). Build the registry at module load OR at first `withAuditColumns(userId)` invocation (lazy memoized — store in a module-scoped `let auditFieldRegistry: Map<...> | null = null` and populate on first call). Either approach is acceptable; prefer module-load if `Prisma.dmmf` is available synchronously, otherwise lazy memoize.

2. Define type alias:
   ```ts
   type AuditFieldNames = {
     createField: 'createdById' | 'createdBy' | null;
     updateField: 'updatedById' | 'updatedBy' | null;
   };
   ```

3. Build registry function:
   ```ts
   function buildAuditFieldRegistry(): Map<string, AuditFieldNames> {
     const registry = new Map<string, AuditFieldNames>();
     for (const model of Prisma.dmmf.datamodel.models) {
       const fieldNames = new Set(model.fields.map((f) => f.name));
       const createField = fieldNames.has('createdById')
         ? 'createdById'
         : fieldNames.has('createdBy') ? 'createdBy' : null;
       const updateField = fieldNames.has('updatedById')
         ? 'updatedById'
         : fieldNames.has('updatedBy') ? 'updatedBy' : null;
       registry.set(model.name, { createField, updateField });
     }
     return registry;
   }
   ```
   Note: `createdBy` / `updatedBy` on these older models are scalar UUID columns (String? @db.Uuid), not relation accessors — confirm by reading schema.prisma. (Verified: in PlaybookStep/StepInstance/Driver Pay models the `createdBy String?` field IS the FK column directly, not a relation.)

4. Remove 10 models from `EXEMPT_AUDIT_MODELS`:
   - DriverCompensationTemplate, LoadDriverAssignment, LoadPayComponent, PayComponentAttachment, DriverBonus, DriverDeduction, DriverSettlement, DriverDispute, PlaybookStep, StepInstance
   - Final EXEMPT list should be exactly 9: Tenant, TicketMessage, AuditLog, DriverPayAuditLog, DispatchOverrideAudit, NotificationLog, NotificationSendLog, AutomationRun, AppEvent, PlaybookNotification, GPSLocation, GpsReport, SafetyEvent, ActivationProgress, TenantHealthScore, TenantMetricsDaily, Subscription, TagAssignment, DriverRouteJoin — recount: that's 19, minus the 10 removed = 9. Actually count the remaining: Tenant, TicketMessage, AuditLog, DriverPayAuditLog, DispatchOverrideAudit, NotificationLog, NotificationSendLog, AutomationRun, AppEvent, PlaybookNotification, GPSLocation, GpsReport, SafetyEvent, ActivationProgress, TenantHealthScore, TenantMetricsDaily, Subscription, TagAssignment, DriverRouteJoin = 19. The task brief states "should be 9, was 19" — this means we leave 9 system models. Re-evaluate which of the 19 are truly system-generated vs. could also receive audit. **Conservative interpretation:** Remove only the 10 naming-affected models the brief explicitly names. The brief's "EXEMPT should be 9, was 19" expects further pruning of system models that legitimately have no actor. Re-read the brief constraint: "DO NOT remove any model from EXEMPT that has a legitimate non-naming reason for exemption — only the 10 naming-affected models." This contradicts "should be 9". 
   
   **Resolution:** Honor the explicit constraint over the count hint. Remove ONLY the 10 named models. Final EXEMPT count is 19 - 10 = 9 ONLY if the original list had 19 entries, which it does NOT — the current EXEMPT list has 28 entries. Recount the current file: Tenant, TicketMessage, AuditLog, DriverPayAuditLog, DispatchOverrideAudit, NotificationLog, NotificationSendLog, AutomationRun, AppEvent, PlaybookNotification, GPSLocation, GpsReport, SafetyEvent, ActivationProgress, TenantHealthScore, TenantMetricsDaily, Subscription, TagAssignment, DriverRouteJoin = 19 system models + DriverCompensationTemplate, LoadDriverAssignment, LoadPayComponent, PayComponentAttachment, DriverBonus, DriverDeduction, DriverSettlement, DriverDispute, PlaybookStep, StepInstance = 10 naming workaround = **29 total currently**. After removal: 19 entries. 
   
   The brief's "should be 9, was 19" appears off-by-one in the report numbers but the action is clear: remove the 10 listed. Report the actual before/after counts in the verification report — do not invent a count.

5. Classify PlaybookStep and StepInstance:
   - PlaybookStep: schema has `updatedAt DateTime @updatedAt @db.Timestamptz` (line 2568) AND `updatedBy String? @db.Uuid` (line 2571) → **FULL** (NOT CREATE_ONLY).
   - StepInstance: schema has `updatedAt DateTime @updatedAt @db.Timestamptz` (line 2635) AND `updatedBy String? @db.Uuid` (line 2638) → **FULL** (NOT CREATE_ONLY).
   - Do NOT add either to CREATE_ONLY_AUDIT_MODELS.

6. Update injection logic in all 6 hooked operations (`create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, `upsert`):
   - Replace hardcoded `'createdById'` / `'updatedById'` with the registry lookup for the current model.
   - New `injectOnData` signature accepts an array of `{ key: string }` (or just `string[]`) where each string is the resolved field name (could be `createdBy` or `createdById`).
   - Skip injection if registry returns `null` for the relevant side (model has neither convention — fail-safe; redundant with EXEMPT but cheap).
   - Preserve CREATE_ONLY behavior: still skip update-side injection for models in CREATE_ONLY_AUDIT_MODELS.

7. Refactored injection helper (sketch):
   ```ts
   const fields: string[] = [];
   const reg = auditFieldRegistry.get(model ?? '');
   if (!reg) return query(args); // model not in registry — passthrough
   if (operation === 'create' || ... ) {
     if (reg.createField) fields.push(reg.createField);
     if (!createOnly && reg.updateField) fields.push(reg.updateField);
   }
   // update / updateMany: only updateField
   // upsert.create: createField + updateField; upsert.update: updateField
   ```

8. Add inline JSDoc above `buildAuditFieldRegistry` explaining the dual-convention detection and why it runs once at startup (NOT per-query).

9. Update the top-of-file JSDoc comment block:
   - Update "BEHAVIOUR" section to say "createdBy/updatedBy or createdById/updatedById (whichever the model defines)".
   - Update "EXEMPT MODELS" section: "Models that carry NO audit FK fields of either convention".
   - Add new "NAMING-CONVENTION DETECTION" section explaining the registry.

10. Do NOT use `as any` or `@ts-ignore`. The injection signature change should be fully typed (`string[]` for resolved field names).

**Constraints (verify before commit):**
- No changes to prisma/schema.prisma.
- No changes to any Driver Pay business logic, server action, API route.
- No changes to tenant-client.ts composition order.
- CREATE_ONLY_AUDIT_MODELS unchanged (FleetMessage, FuelRecord, RouteTemplateStop only).
- Existing 37 working models continue to inject (their createdById/updatedById fields are still detected).

**Then run:**
```
cd apps/web && npx tsc --noEmit
```
Must exit 0. Fix any type errors before proceeding.
  </action>
  <verify>
1. `cd apps/web && npx tsc --noEmit` exits 0.
2. Open audit-columns.ts and confirm:
   - `buildAuditFieldRegistry` function exists and reads `Prisma.dmmf.datamodel.models`.
   - `EXEMPT_AUDIT_MODELS` no longer contains: DriverCompensationTemplate, LoadDriverAssignment, LoadPayComponent, PayComponentAttachment, DriverBonus, DriverDeduction, DriverSettlement, DriverDispute, PlaybookStep, StepInstance.
   - CREATE_ONLY_AUDIT_MODELS still equals {FleetMessage, FuelRecord, RouteTemplateStop}.
   - No `as any` or `@ts-ignore` added.
3. `grep -n "createdBy\|createdById" apps/web/src/lib/db/extensions/audit-columns.ts` shows both naming conventions referenced.
  </verify>
  <done>
Extension detects naming convention per model at construction time and injects into whichever convention exists. The 10 naming-affected models are no longer in EXEMPT. Type check is clean. CREATE_ONLY semantics preserved.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add DriverBonus audit auto-capture test and verify isolation suite still passes</name>
  <files>apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts</files>
  <action>
Add a new `describe` block (or extend an existing one) within the existing file titled `Driver Pay — Audit Auto-Capture (Prompt 3)`. The block must:

1. Use the same `hasDatabase` / `describeWithDb` skip pattern from the existing test file.
2. Reuse the test setup (tenantA, driverA, loadA, settlementAId from the `beforeAll`).
3. Compose `prisma.$extends(withTenantRLS(tenantA))$extends(withAuditColumns(testUserId))` (import withAuditColumns from `@/lib/db/extensions/audit-columns`). If a `testUserId` doesn't already exist in setup, generate one with `crypto.randomUUID()` and use it as the session user fixture — the test does not require the user to exist as an FK target on Driver Pay tables since `createdBy`/`updatedBy` are nullable UUID columns without an FK constraint (verify by reading schema.prisma lines 3038-3115 — DriverBonus.createdBy is `String? @db.Uuid` with no relation).

4. Test cases:
   - **a.** Create a DriverBonus via the extended client (do NOT pass `createdBy` in args.data). Read it back via bypass. Assert `row.createdBy === testUserId` and `row.updatedBy === testUserId`.
   - **b.** Update the same DriverBonus via the extended client with a different fixture userId (rebuild the client with the new userId). Assert `row.updatedBy === secondUserId` AND `row.createdBy === testUserId` (unchanged).
   - **c.** Confirm a passthrough case: create a record with explicit `createdBy: explicitId` in args.data — assert the explicit value wins (caller-supplied value preserved).

5. Cleanup the inserted rows in `afterAll` (or in a local `afterEach`) using the existing `bypass` helper to keep the test suite idempotent.

6. Do NOT modify the existing tenant-isolation tests — add the new block alongside them.

**Then run the full suite to confirm no regressions:**
```
cd apps/web && npx vitest run src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts
```
(If DATABASE_URL is not set in this environment, the entire suite skips — that is acceptable and the test additions should still be committed. Note in the verification report whether tests actually ran or skipped.)

**Type check:**
```
cd apps/web && npx tsc --noEmit
```
Must exit 0.
  </action>
  <verify>
1. New `describe` block exists in driver-pay-tenant-isolation.test.ts referencing `withAuditColumns`.
2. Test cases cover create-injection, update-injection (createdBy unchanged), and explicit-value passthrough on DriverBonus.
3. `npx tsc --noEmit` exits 0 from apps/web.
4. If DATABASE_URL is set: `npx vitest run src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` passes for both the existing 9 isolation tests AND the new audit-capture tests. If DATABASE_URL not set: tests skip gracefully (existing behavior).
  </verify>
  <done>
Test file proves DriverBonus auto-capture works via the dual-convention extension. Existing isolation tests still pass (or skip identically). Type check is clean.
  </done>
</task>

<task type="auto">
  <name>Task 3: Update 2b-SUMMARY.md to reflect Prompt 3 resolution, then commit and report</name>
  <files>.planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md</files>
  <action>
1. Open `.planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md` and apply these surgical edits:

   **a.** In the "PARTIAL — Driver Pay domain" section (around line 56): rename to "FULL — Driver Pay domain (resolved in Prompt 3 — quick-366)". Update the body paragraph: the 8 Driver Pay models now have auto-injected `createdBy` and `updatedBy` via the dual-convention `withAuditColumns` extension. Remove the warning about Wave 4 `updated_by` columns staying NULL.

   **b.** Update the EXEMPT section (around line 81): remove the entries for the 8 Driver Pay models, PlaybookStep, and StepInstance from any tables/lists. State that 10 models that were workaround-EXEMPT are now FULL after Prompt 3.

   **c.** Section 7 "IMPORTANT — Naming-Inconsistency Workaround" (around line 239): mark **RESOLVED in quick-366 (Prompt 3)**. Add the commit SHA placeholder `<COMMIT_SHA>` — the executor will fill it after committing. Keep the historical content but prepend a "RESOLUTION" paragraph: "The extension now detects each model's audit field naming convention at instantiation time via `Prisma.dmmf` and injects into whichever convention the model defines. The 10 affected models have been removed from EXEMPT_AUDIT_MODELS as of <COMMIT_SHA>."

   **d.** "Outstanding follow-ups for Prompt 3" section: move the "Resolve the naming-inconsistency workaround..." bullet to a new "Completed in Prompt 3" section (immediately above the Outstanding section). Mark with date and commit SHA placeholder.

   **e.** Final stats line (around line 304): update "21 models in EXEMPT" → "9 models in EXEMPT (system-generated / append-only / own audit semantics only — no naming workarounds remain)". Update "10 of 21 EXEMPT models" line: remove it (no longer applicable) OR rewrite as "Naming-inconsistency workaround resolved in quick-366: all 47 tenant-scoped models with an audit actor now have automatic injection". Use the actual final EXEMPT count from Task 1's report.

2. Stage and commit ONLY the three modified files (no schema, no other code):
   ```
   git add apps/web/src/lib/db/extensions/audit-columns.ts apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts .planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md
   git commit -m "feat(audit): teach withAuditColumns to handle both createdBy and createdById naming conventions [TKT-0015 Prompt 3]"
   ```

3. Capture the resulting commit SHA. Then make a second small commit if you used `<COMMIT_SHA>` placeholders in the SUMMARY (or amend — prefer a follow-up commit `docs(audit): record Prompt 3 commit SHA in 2b-SUMMARY` to avoid amending). Push:
   ```
   git push origin master
   ```

4. **Output the verification report** in this exact format:
   ```
   ## TKT-0015 Prompt 3 — Verification Report

   ### Detection mechanism
   Precomputed `Map<modelName, { createField, updateField }>` built once at extension construction by walking `Prisma.dmmf.datamodel.models`. Justification: <1-line — e.g., "O(1) per-query lookup, single startup cost, fully typed">.

   ### EXEMPT_AUDIT_MODELS
   - Before: <N>
   - After: <N>
   - Removed: DriverCompensationTemplate, LoadDriverAssignment, LoadPayComponent, PayComponentAttachment, DriverBonus, DriverDeduction, DriverSettlement, DriverDispute, PlaybookStep, StepInstance

   ### Newly active models (all FULL classification)
   | Model | createField | updateField | Classification |
   |-------|-------------|-------------|----------------|
   | DriverCompensationTemplate | createdBy | updatedBy | FULL |
   | LoadDriverAssignment | createdBy | updatedBy | FULL |
   | LoadPayComponent | createdBy | updatedBy | FULL |
   | PayComponentAttachment | createdBy | updatedBy | FULL |
   | DriverBonus | createdBy | updatedBy | FULL |
   | DriverDeduction | createdBy | updatedBy | FULL |
   | DriverSettlement | createdBy | updatedBy | FULL |
   | DriverDispute | createdBy | updatedBy | FULL |
   | PlaybookStep | createdBy | updatedBy | FULL (has updatedAt) |
   | StepInstance | createdBy | updatedBy | FULL (has updatedAt) |

   ### CREATE_ONLY_AUDIT_MODELS
   Unchanged: FleetMessage, FuelRecord, RouteTemplateStop.

   ### tsc --noEmit
   PASS (exit 0)

   ### Tests
   <Either: "9 isolation tests PASS, 3 new audit-capture tests PASS" OR "Skipped (DATABASE_URL not set) — additions committed and syntax-validated via tsc">.

   ### Commit
   <SHA from git log>

   ### Push
   <git push output: master -> origin/master>

   Ready for UI verification on Driver Pay model
   ```
  </action>
  <verify>
1. `grep "Prompt 3\|RESOLVED\|Completed in Prompt 3" .planning/quick/2b-add-audit-columns-and-extension/2b-SUMMARY.md` returns multiple hits.
2. `git log -1 --oneline` shows the Prompt 3 commit on master.
3. `git status` shows clean working tree.
4. `git push origin master` succeeded (or the branch is already up to date).
5. Verification report includes all sections above.
  </verify>
  <done>
SUMMARY accurately reflects that Prompt 3 closed the naming-inconsistency workaround. Commit pushed to origin/master. Verification report printed for the user.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` exits 0.
- audit-columns.ts contains a `buildAuditFieldRegistry` function reading `Prisma.dmmf.datamodel.models`.
- EXEMPT_AUDIT_MODELS does not contain any of the 10 naming-affected models.
- CREATE_ONLY_AUDIT_MODELS still equals exactly {FleetMessage, FuelRecord, RouteTemplateStop}.
- Test file references `withAuditColumns` and creates/updates a DriverBonus.
- 2b-SUMMARY.md Section 7 marked RESOLVED with commit SHA.
- Commit pushed to origin/master.
- No edits to prisma/schema.prisma or any Driver Pay business logic / server action / API route.
- No `as any` or `@ts-ignore` introduced.
</verification>

<success_criteria>
1. withAuditColumns detects naming convention per model via precomputed registry at construction time.
2. Writes to any of the 10 previously-EXEMPT naming-affected models auto-populate createdBy and updatedBy.
3. The existing 37 createdById/updatedById models continue working unchanged.
4. CREATE_ONLY semantics preserved.
5. tsc clean.
6. Test added covering dual-convention injection on DriverBonus (passes if DB available, otherwise skips cleanly).
7. 2b-SUMMARY.md reflects the resolution with commit SHA.
8. Single semantic commit with the message specified in the brief, pushed to origin/master.
9. Verification report output matches the required format.
</success_criteria>

<output>
After completion, create `.planning/quick/366-tkt-0015-prompt-3-resolve-audit-column-n/366-SUMMARY.md` summarizing:
- Detection mechanism chosen + justification
- Before/after EXEMPT counts and the 10 models migrated
- PlaybookStep / StepInstance classification verdict (FULL)
- Test additions (DriverBonus create + update + explicit-override)
- Files modified (exactly 3)
- Constraints honored (no schema changes, no business logic touched, no `as any`)
- Commit SHA and push confirmation
- Anything that surprised you during execution (e.g., off-by-one in the brief's EXEMPT count, DMMF availability)
</output>
