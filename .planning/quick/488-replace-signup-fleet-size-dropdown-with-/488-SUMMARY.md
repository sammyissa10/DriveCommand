# Quick Task 488 — Summary

**Option implemented: PRIMARY.** Replaced the banded fleet-size dropdown with a numeric "Number of trucks" input and derive the segmentation band server-side, storing BOTH the exact count and the derived band. (Not the minimal-change alternative.)

## Changes (2 code commits + docs)
**`11bcd507` — DB:** `Tenant.truckCount Int?` (nullable) in `schema.prisma`; raw-SQL migration `20260722000002_add_tenant_truck_count` (`ADD COLUMN IF NOT EXISTS`, no `prisma migrate dev`); applied + verified on the remote DB; `prisma generate` synced the generated client.

**`db6a337a` — App logic:**
- **Form** (`sign-up-form.tsx`, step 2): dropdown → `<Input type="number" inputMode="numeric" min={1} step={1} required name="truckCount">` "Number of trucks". Mobile numeric keypad via `inputmode`.
- **Schema** (`onboarding.schemas.ts`): added `deriveFleetSizeBucket(n)` (1–3 → OWNER_OPERATOR, 4–15 → SMALL, 16–50 → MEDIUM, 50+ → LARGE; upper bound inclusive) and a `truckCount` field (`z.coerce.number().int().min(1).max(100000)`). Kept `fleetSizeBucket` in the schema so `SignUpInput` stays a `ZodObject` (the form's `signUpSchema.pick(...)` for step-1 validation still works) and downstream consumers are unchanged.
- **Server action** (`actions.tsx`): reads `truckCount`, derives the band **server-side**, injects it into the parsed payload (invalid count → surfaces the error on `truckCount`, never provisions). Adds `truckCount` to the `tenant.created` event.
- **Provisioning** (`provision-tenant.ts`): stores `truckCount` on `Tenant.create` alongside the existing `fleetSizeBucket`.
- **Backward-compat:** `Tenant.fleetSizeBucket` is still populated (now derived) → admin pages, `hydrate-tenant`, `seed-sample-data`, and everything else reading the band keep working with zero changes.
- **Test:** `derive-fleet-size-bucket.test.ts` — 4 boundary tests (3→OWNER_OPERATOR, 4/15→SMALL, 16/50→MEDIUM, 51/500→LARGE).

## Verification
- `tsc --noEmit` → **0 errors**.
- `vitest` → **4/4** derivation tests pass.
- **Real end-to-end signup** (Playwright, 390px) with `truckCount=20`: the numeric field replaced the dropdown (`type=number inputmode=numeric min=1`, legacy `#fleetSizeBucket` count = 0), submit **redirected to `/onboarding/welcome`**, and the stored Tenant row = **`truckCount=20`, `fleetSizeBucket=MEDIUM`** (exact count kept + band derived correctly).
- The test tenant + its 4 auth users were fully deleted afterward and verified gone (0 rows).

## Notes / incidents
- The first live attempt failed with `Unknown argument truckCount` — the long-running dev server held a **stale Prisma client** from before regeneration (rollback correctly removed the orphan auth user). Restarting the dev server (fresh client) resolved it; the second run succeeded. The user's dev server on :3000 was restarted and left running.
- Mid-task, some relative-path edits (made while the shell cwd was `apps/web`) created a stray nested `apps/web/apps/web/` copy of `onboarding.schemas.ts` + the test. Detected via a duplicate-file check, deleted the stray tree, and re-applied both files to the real locations with absolute paths. Final tree verified clean (no stray).
- Not deployed, not pushed.
