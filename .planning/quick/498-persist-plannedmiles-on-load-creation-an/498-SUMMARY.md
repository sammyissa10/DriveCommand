# Quick-498: Persist plannedMiles on load creation and dispatch attach — Summary

**One-liner:** `plannedMiles` submitted on a per_mile load now reaches `calculateRevenue` at both creation and dispatch-attach time via a new shared `applyPlannedMilesRevenue` helper, so `totalRevenue` banks correctly instead of persisting as 0; `LoadForm` was also collapsed from two competing planned-miles states down to one.

## What was broken

1. **Create-time drop**: `LoadCreateSchema` (Zod, POST `/api/v1/carrier/loads`) had no `plannedMiles` field, so Zod silently stripped it from every create payload before it ever reached `createLoad`.
2. **createLoad ignored it anyway**: even if it had survived validation, `createLoad` always called the unconditional `recalculateAndStore(orgId, load.id)`, which for a per_mile load with no dispatch yet has no miles to read — banking `totalRevenue: 0` at creation despite a correct client-side preview.
3. **Dispatch-attach didn't recalc**: `updateLoad`'s `rateFields`/`needsRecalc` check didn't include `dispatchId`, so a dispatchId-only PATCH (attaching a Trip to a milesless per_mile load) never re-triggered revenue calculation — the Trip's `plannedMiles` was never consulted.
4. **Two competing form states**: `LoadForm` held both `plannedMiles` (Rate section, fed the load payload + preview) and `dispatchPlannedMiles` (Dispatch section, fed the immediate-dispatch Trip body + template auto-fill) — a user could type miles in one field and have the other silently stay empty.

## What changed (3 commits)

### Task 1 — `855c624e` — Server-side accept + apply
- `route.ts` `LoadCreateSchema`: added `plannedMiles: z.number().int().positive().optional()` so the POST body's `plannedMiles` survives validation and reaches `createLoad` (`LoadCreateInput` already typed it — no type churn needed).
- `loads.ts`: extracted the plannedMiles-override money-math block (previously only in `updateLoad`) into a new shared private helper `applyPlannedMilesRevenue(tenantPrisma, orgId, loadId, plannedMiles)` — one code path for both callers. It re-reads the load with its dispatch + contract, builds a `dispatchMiles` override (Trip's actual/planned miles wins if present, otherwise the submitted value), runs the load through the exact same `calculateRevenue` call `updateLoad` always used, writes `totalRevenue`/`fuelSurcharge`, and writes `plannedMiles` back onto the Trip if it doesn't have one yet.
- `createLoad`: when `data.plannedMiles !== undefined`, calls `applyPlannedMilesRevenue` instead of the old unconditional `recalculateAndStore` — banking the correct revenue at creation instead of 0.
- `updateLoad`: its old inline override block now just calls the shared helper (identical math, no behavior change). Added `'dispatchId'` to `rateFields` so a dispatchId-only PATCH sets `needsRecalc = true`; since that PATCH carries no `plannedMiles` override, it falls through to the existing `recalculateAndStore(orgId, id)` fallback — which re-reads the load with its now-attached dispatch and sources miles from the Trip's `actualMiles`/`plannedMiles`, so dispatch-attach revenue recomputation "just works" via the pre-existing fallback path once the trigger condition was added.

### Task 2 — `2a0915f7` — Unify LoadForm's planned-miles states
- Removed the separate `dispatchPlannedMiles`/`setDispatchPlannedMiles` `useState`.
- The Dispatch-section "Planned Miles (optional)" input now reads/writes `plannedMiles`/`setPlannedMiles` (same state the Rate-section input and revenue preview already used).
- The immediate-dispatch Trip body (`dispatchBody.plannedMiles`) and the route-template auto-fill guard now source from `plannedMiles` instead of the removed state.
- Net effect: one number the user types once now drives both the load's per_mile revenue and (when "Add to Trip immediately" is on) the Trip's `plannedMiles` — no more silently-empty sibling field.

### Task 3 — `90a1aa12` — Vitest + build gate
- New `apps/web/src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts` (2 tests, both passing):
  - `createLoad` with `plannedMiles: 48`, `rateType: 'per_mile'`, `rateAmount: 2.85`, no contract/FSC → asserts the `carrierLoad.update` call that writes `totalRevenue` carries `136.8` (`toFixed(2)` === `'136.80'`) and `fuelSurcharge: 0` — proving miles reach `calculateRevenue` at creation instead of being dropped.
  - `updateLoad('org-1', 'load-2', { dispatchId: 'trip-1' })` (dispatchId-only PATCH, no `plannedMiles` override) against a mocked Trip with `plannedMiles: 120` and `rateAmount: 2.5` → asserts `totalRevenue` recomputes to `300` (not `0`), proving the `dispatchId`-triggered `needsRecalc` → `recalculateAndStore` fallback correctly sources miles from the Trip.
  - Mocking: `@/lib/context/tenant-context` (`getTenantPrisma`), `@/lib/db/prisma` (avoids the real Postgres pool's module-load side effect), `@/lib/carrier/notifications` (avoids real email-sending logic), and `next/server` (`after`) — following the `getTenantPrisma` mock pattern from the sibling `load-driver-assignments.test.ts`. `carrierLoad.findFirst` is content-branched (by `include`/`select`/`where` shape) since both functions call it with several distinct shapes in sequence.
- `npx vitest run` on the new file — 2/2 pass.
- `npx tsc --noEmit` from `apps/web` — 0 new errors in any touched or new file.
- `npm run build` (next build) from `apps/web` — **compiled successfully** (mandatory gate per constraints; tsc alone is not sufficient).

## Verification results

- `npx vitest run src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts` — 2/2 pass.
- `npx tsc --noEmit` — no errors in `route.ts`, `loads.ts`, `LoadForm.tsx`, or the new test file.
- `npm run build` — `✓ Compiled successfully in 37.1s`.
- Grep: `plannedMiles` present in `LoadCreateSchema` (route.ts:42); `dispatchPlannedMiles` returns zero matches in `LoadForm.tsx`.
- `git diff --stat apps/web/prisma/schema.prisma` — empty (no schema/migration change, as required).

## Deviations from plan

None — plan executed exactly as written, including the STRONGLY-PREFERRED extraction of a shared `applyPlannedMilesRevenue` helper (rather than duplicating the money-math block) so `createLoad` and `updateLoad` share one revenue-calculation code path.

## Not done (explicitly out of scope per plan)

- No `planned_miles` column added to `CarrierLoad` / `schema.prisma` — plannedMiles remains a calc-only override sourced from the Trip, as directed.
- `trips.ts` dispatch-readiness gate, mobile `NewLoadMobile`/`LoadDetailMobile`, and invoice code were not touched.
- API response shape unchanged.
- Not deployed, not pushed — commits only (orchestrator handles the final push/deploy decision).

## Files changed

- `apps/web/src/app/api/v1/carrier/loads/route.ts`
- `apps/web/src/lib/carrier/loads.ts`
- `apps/web/src/components/carrier/loads/LoadForm.tsx`
- `apps/web/src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts` (new)

## Commits

- `855c624e` fix(quick-498): accept and apply plannedMiles server-side for per_mile loads
- `2a0915f7` fix(quick-498): unify LoadForm's two planned-miles states into one
- `90a1aa12` test(quick-498): vitest for create-with-miles and dispatch-attach recompute

## Self-Check: PASSED

- `apps/web/src/app/api/v1/carrier/loads/route.ts` — FOUND
- `apps/web/src/lib/carrier/loads.ts` — FOUND
- `apps/web/src/components/carrier/loads/LoadForm.tsx` — FOUND
- `apps/web/src/lib/carrier/__tests__/load-planned-miles-revenue.test.ts` — FOUND
- Commit `855c624e` — FOUND
- Commit `2a0915f7` — FOUND
- Commit `90a1aa12` — FOUND
