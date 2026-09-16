# quick-623 — PLAN

**Fix `seedStarterPlaybooks`: 25 cutover-gating statements, one acquisition. Fix the swallow that hid the
failure, as a separate change.**

Target: staging `wyixpgunnjmzguhggocz` as `app_user`, tripwire armed. Production is read-only
(`pg_policies` for parity, and one row count for context) and never written. Planned and executed inline by the
orchestrator: every step depends on what the previous one measured, the same reasoning as quick-621's plan.

## Approach
Open the seeder's sentinel read and its transaction on `getTenantPrismaForOrg(tenantId)`. The transaction is
passed into three helpers, so scoping where it is opened scopes every statement inside them, and no helper
signature changes. As a separate change, make each caller report a failed seed: the seed script's exit status,
`migrate.mjs`'s message, and `createTenant`'s return value. Prove it on staging with `bypass_rls_policy` dropped on
the four tables the seeder writes. Count rows after a real seed, and force a real mid-seed failure.

## Steps
0. vitest baseline from the working tree before any edit; `623-preconditions.ts` (role, tripwire both ways,
   86 policies, sorted list = production).
1. Re-verify the census's 25 rows against current code; count the statements and the helpers receiving `tx`.
2. Fix shape: where the client is acquired, what happens to the helper signatures, and whether any helper has
   another caller (stop-and-report if one does).
3. Swallow: decide what each caller should see and what exit status a failed tenant produces.
4. Apply: scoping commit, then the swallow commit. `tenantId` kept, no `userId` passed.
5. `623-seed-verify.ts`: throw-after-drop rehearsal, then cold app_user cells: pre-fix control, fresh-tenant seed
   with privileged row counts, the real `createTenant`, a forced 42501 via a temporary REVOKE, and the real seed
   script. Restore the policy and the grant, and compare the sorted list with production.
6. Regenerate the census into this task's evidence and reconcile 180/169 → new figure, row by row.
7. Both click-throughs with the in-process hook; state whether they exercised the seeder.
8. Gates: tsc (probed), build, vitest failing set vs step 0, wrapper countdown.

## Limits
No production writes · no permanent policy drop · no `tenantId` clause removed · no `userId` passed · no helper
signature change reaching another caller · nothing installed.
