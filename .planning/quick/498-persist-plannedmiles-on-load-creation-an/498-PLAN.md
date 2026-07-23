---
phase: quick-498
plan: 498
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/loads/route.ts
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts
autonomous: true

must_haves:
  truths:
    - "Creating a per_mile load with plannedMiles=48 and rate=2.85 persists totalMiles-derived revenue of 136.80 (not 0)"
    - "Attaching a dispatch (dispatchId-only PATCH) to a milesless per_mile load recomputes totalRevenue from the Trip's plannedMiles"
    - "The Load form exposes a single planned-miles value that feeds both the load payload and the immediate-dispatch Trip"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/loads/route.ts"
      provides: "LoadCreateSchema accepts plannedMiles so Zod no longer strips it from POST body"
      contains: "plannedMiles"
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "createLoad applies submitted plannedMiles to revenue; updateLoad recalcs on dispatchId attach"
      contains: "plannedMiles"
    - path: "apps/web/src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts"
      provides: "Vitest covering create-with-miles and dispatch-attach recompute"
      contains: "136.80"
  key_links:
    - from: "apps/web/src/app/api/v1/carrier/loads/route.ts"
      to: "createLoad"
      via: "validated payload carrying plannedMiles"
      pattern: "plannedMiles"
    - from: "apps/web/src/lib/carrier/loads.ts createLoad"
      to: "calculateRevenue"
      via: "plannedMiles-override dispatchMiles arg"
      pattern: "calculateRevenue"
---

<objective>
Fix per_mile loads persisting with null miles and totalRevenue "0" despite a correct client-side preview. Three server gaps drop the submitted planned miles: the Zod create schema strips `plannedMiles`, `createLoad` never applies it to revenue, and `updateLoad` doesn't recalc when only `dispatchId` changes. The form also holds two competing planned-miles states.

Purpose: Loads accepted at a per-mile rate must bank revenue at creation and re-derive it when a dispatch (carrying the Trip's plannedMiles) is attached — penny-exact through the existing `calculateRevenue` path.
Output: Updated create schema + createLoad + updateLoad + LoadForm, and a Vitest proving both flows.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/api/v1/carrier/loads/route.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/lib/carrier/revenue-calculator.ts
@apps/web/src/components/carrier/loads/LoadForm.tsx
</context>

<constraints>
HARD constraints — call out any deviation:
- Do NOT add a `planned_miles` column to Prisma / schema.prisma. CarrierLoad has none by design; plannedMiles is a calc-only override sourced from the Trip.
- Do NOT touch trips.ts dispatch-readiness gate, mobile files (NewLoadMobile / LoadDetailMobile), or invoice code.
- Money math MUST stay penny-exact through the existing `calculateRevenue`. No new float arithmetic, no rounding invented here.
- Do NOT change the API response shape.
- REUSE the existing plannedMiles-override-into-revenue logic already in `updateLoad` (loads.ts ~lines 552-621). Do not invent a second code path; extract/share a helper if cleaner, but the money math must flow through `calculateRevenue` exactly as updateLoad does.
- `LoadCreateInput` (loads.ts line 61) ALREADY types `plannedMiles?: number` — only the Zod schema strips it. No type change needed there.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Accept and apply plannedMiles server-side (create schema + createLoad + updateLoad recalc trigger)</name>
  <files>apps/web/src/app/api/v1/carrier/loads/route.ts, apps/web/src/lib/carrier/loads.ts</files>
  <action>
Three edits, all server-side:

(a) route.ts — In `LoadCreateSchema` (~lines 25-48), add:
    `plannedMiles: z.number().int().positive().optional(),`
so Zod stops stripping it from the POST body. `createLoad`'s `LoadCreateInput` already types `plannedMiles?: number`, so no type churn.

(b) loads.ts `createLoad` (~lines 159-259) — After the `carrierLoad.create(...)` and stop persistence, and BEFORE the current unconditional `recalculateAndStore(orgId, load.id)` at ~line 254: when `data.plannedMiles !== undefined`, apply it to revenue by REUSING the exact same override logic `updateLoad` already runs at ~lines 557-619. Concretely, mirror that block: build `dispatchMiles` = { actualMiles: dispatch.actualMiles ?? null, plannedMiles: dispatch.plannedMiles ?? data.plannedMiles }, build `contractForRevenue` from the load's contract (fuelSurchargeMethod/fuelSurchargeRate), call `calculateRevenue({rateType, rateAmount, commodityWeightLbs, commodityPallets, otherCharges, brokerFlag, carrierCost}, dispatchMiles, contractForRevenue)`, then `carrierLoad.update` with `{ totalRevenue: result.totalRevenue, fuelSurcharge: result.fuelSurcharge }`. Also write plannedMiles back to the dispatch Trip when `load.dispatchId` exists and the Trip has no plannedMiles yet (same as updateLoad lines ~607-611). If `data.plannedMiles === undefined`, keep calling `recalculateAndStore` as today.
    STRONGLY PREFER extracting the shared override block from updateLoad into a private helper in loads.ts (e.g. `applyPlannedMilesRevenue(tenantPrisma, orgId, loadId, plannedMiles)`) and calling it from BOTH createLoad and updateLoad, so there is exactly one money-math path. If extraction is risky, duplicate the block verbatim — but do not diverge the math.

(c) loads.ts `updateLoad` — In the `rateFields`/`needsRecalc` logic (~lines 540-551), make a `dispatchId`-only PATCH trigger recalculation. Add `'dispatchId'` to `rateFields` (or OR `'dispatchId' in data` into `needsRecalc`). Then in the recalc branch: when the update payload carries NO `plannedMiles` override but the newly-attached dispatch/Trip has `plannedMiles`, revenue must recompute from the Trip's plannedMiles. The plain `recalculateAndStore(orgId, id)` fallback path already re-reads the load with its dispatch and runs calculateRevenue (which reads `dispatch.plannedMiles`), so confirm the fallback covers the dispatch-attach-without-override case; only route through the plannedMiles-override branch when `data.plannedMiles !== undefined`. Do NOT double-write or change response shape.

Keep all Number()/Decimal handling identical to the existing block — no new float math.
  </action>
  <verify>
From apps/web: `npx tsc --noEmit` shows no NEW errors in route.ts or loads.ts (baseline ~35 pre-existing unrelated errors are acceptable). Grep confirms `plannedMiles` present in LoadCreateSchema and that `needsRecalc` reacts to dispatchId.
  </verify>
  <done>LoadCreateSchema accepts plannedMiles; createLoad banks per_mile revenue from submitted miles via calculateRevenue; updateLoad recalculates on a dispatchId-only attach sourcing miles from the Trip. No schema/column change, no response-shape change, one shared money-math path preferred.</done>
</task>

<task type="auto">
  <name>Task 2: Unify the two planned-miles states in LoadForm</name>
  <files>apps/web/src/components/carrier/loads/LoadForm.tsx</files>
  <action>
The form holds TWO planned-miles states: `plannedMiles` (~line 150, Rate section, feeds the load payload at ~line 420 and the preview at ~line 984) and `dispatchPlannedMiles` (~line 188, Dispatch section, feeds the immediate-dispatch Trip body at ~line 479 and the template auto-fill at ~line 293).

Collapse them into ONE state variable (keep `plannedMiles` / `setPlannedMiles` as the survivor):
- Remove the separate `dispatchPlannedMiles` / `setDispatchPlannedMiles` useState (~line 188).
- Point the Dispatch-section miles input (`value={dispatchPlannedMiles}` ~line 854 and its onChange) at `plannedMiles` / `setPlannedMiles`.
- Update the immediate-dispatch body (~line 479): `if (plannedMiles) dispatchBody.plannedMiles = parseFloat(plannedMiles);` (was `dispatchPlannedMiles`). Keep parseFloat here to match existing Trip numeric handling; the load payload continues to use `parseInt(plannedMiles, 10)` at ~line 420.
- Update the template auto-fill (~line 293): guard/assign on `plannedMiles` instead of `dispatchPlannedMiles` (`if (plannedMiles === '' && template.estimatedMiles != null) setPlannedMiles(String(template.estimatedMiles))`).
- The Rate-section input (~line 919) and preview (~line 984) already use `plannedMiles` — leave them.

Result: one number the user types once drives the load's per_mile revenue AND (when "Add to Trip immediately" is on) the Trip's plannedMiles. Do not alter unrelated dispatch fields.
  </action>
  <verify>From apps/web: `npx tsc --noEmit` shows no NEW errors in LoadForm.tsx. Grep for `dispatchPlannedMiles` in LoadForm.tsx returns ZERO matches.</verify>
  <done>Single planned-miles state feeds both the load payload and the immediate-dispatch Trip body; `dispatchPlannedMiles` fully removed; preview and Rate-section input unchanged.</done>
</task>

<task type="auto">
  <name>Task 3: Vitest for create-with-miles and dispatch-attach recompute + build gate</name>
  <files>apps/web/src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts</files>
  <action>
Add a Vitest covering the two flows. Follow the mocking style of the sibling tests in `apps/web/src/lib/carrier/__tests__/` (inspect an existing one, e.g. dispatch-assigned-email.test.ts, for the getTenantPrisma mock pattern). Use quantity/miles values > 1 in ALL fixtures.

Cases:
(i) Create per_mile load with `plannedMiles: 48`, `rateType: 'per_mile'`, `rateAmount: 2.85`, no contract/FSC → asserts persisted `totalRevenue` equals 136.80 (48 * 2.85). Assert the value that createLoad writes via the calculateRevenue path (mock carrierLoad.update / capture its data arg), proving miles are applied at creation, not 0.
(ii) Attach a dispatch to a milesless per_mile load whose Trip has `plannedMiles` (use > 1, e.g. 120) → call updateLoad with a `dispatchId`-only payload → assert totalRevenue recomputes from the Trip's plannedMiles (e.g. 120 * rateAmount), i.e. `needsRecalc` fired and revenue moved off 0.

Prefer unit-testing calculateRevenue directly for the exact-money assertion if fully mocking Prisma in createLoad/updateLoad proves heavy — but at minimum one test must exercise createLoad's new plannedMiles branch end-to-end with mocked tenantPrisma. Keep assertions penny-exact (136.80).
  </action>
  <verify>From apps/web: `npx vitest run src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts` — all cases pass. Then run the FULL build gate: from apps/web `npm run build` (next build) completes successfully — tsc --noEmit alone is NOT sufficient per constraints.</verify>
  <done>Vitest passes for both create-with-miles (136.80) and dispatch-attach recompute; `next build` from apps/web succeeds with no regressions in touched files.</done>
</task>

</tasks>

<verification>
- From apps/web: `npm run build` (next build) succeeds — mandatory, tsc alone insufficient.
- `npx vitest run src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts` passes.
- Grep: `plannedMiles` present in LoadCreateSchema; `dispatchPlannedMiles` absent from LoadForm.tsx.
- No new Prisma migration; schema.prisma unchanged. No changes under apps/mobile, trips.ts readiness gate, or invoice code.
</verification>

<success_criteria>
- per_mile load created with plannedMiles=48 @ 2.85 persists totalRevenue 136.80 (was "0").
- dispatchId-only attach to a milesless load recomputes revenue from the Trip's plannedMiles.
- One unified planned-miles field in the form.
- Money math flows solely through calculateRevenue; response shape unchanged; next build green.
</success_criteria>

<output>
After completion, create `.planning/quick/498-persist-plannedmiles-on-load-creation-an/498-SUMMARY.md`.
Executor commits atomically but does NOT push and does NOT run vercel — the orchestrator handles the single final push/deploy decision.
</output>
