# Quick Task 488 — Numeric truck count → derived fleet-size band

## Decision: PRIMARY option (not the minimal-change alternative)
Replace the banded fleet-size dropdown with a numeric "Number of trucks" input; derive the band server-side; store BOTH exact count + band. Chosen over the "keep dropdown + optional exact field" fallback because it's cleaner UX and the exact number is the better source of truth.

## Context
- The band is stored on `Tenant.fleetSizeBucket` (enum) and read by admin pages, `hydrate-tenant`, `seed-sample-data`. Must stay populated (backward-compat).
- Signup flow: `sign-up-form.tsx` (2-step wizard, step 2 has fleet size) → `signUpAction` (actions.tsx) → `signUpSchema` → `provisionTenant`.
- `signUpSchema.pick(...)` is used by the form for step-1 client validation, so the schema must remain a `ZodObject` (no top-level `.transform`).

## Plan
1. `Tenant.truckCount Int?` in schema.prisma + raw-SQL migration `20260722000002` (`ADD COLUMN IF NOT EXISTS`); `prisma generate`; apply on remote DB via MCP (hook may not fire).
2. `onboarding.schemas.ts`: add `deriveFleetSizeBucket(n)` (1-3/4-15/16-50/50+, upper-bound inclusive) + `truckCount` field; keep `fleetSizeBucket` (derived, injected by action).
3. `actions.tsx`: read `truckCount`, derive band server-side, inject into `raw`, add `truckCount` to the tenant.created event.
4. `provision-tenant.ts`: store `truckCount` on `Tenant.create`.
5. `sign-up-form.tsx`: dropdown → `<Input type="number" inputMode="numeric" min=1 step=1 required name="truckCount">`.
6. Unit test for `deriveFleetSizeBucket` boundaries.

## Verify
- tsc 0 errors; vitest boundary tests; real signup at 390px completes + stored `truckCount` + derived band correct; clean up the test tenant.

## Commits
1. `feat(quick-488): add Tenant.truckCount column + migration`
2. `feat(quick-488): numeric 'Number of trucks' input, derive band server-side`
