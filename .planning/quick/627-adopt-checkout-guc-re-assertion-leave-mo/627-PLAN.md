---
phase: quick-627
plan: 01
type: execute
autonomous: true
---

# quick-627: adopt checkout-time tenant-GUC re-assertion with `onNoContext: 'leave'`

**Executed inline by the orchestrator**, as quick-626 was: steps 1 and 5 are gates whose answers decide whether
anything in `src` changes. A planner/executor handoff would have to carry those stop conditions across two agents.

## Target and limits

- `drivecommand-staging` (`wyixpgunnjmzguhggocz`) as `app_user`, tripwire armed. Production is never written; it is
  read for `pg_policies` only (preconditions). No cutover, no change to production `DATABASE_URL`, `bypass_rls_policy`
  not dropped.
- No package installed. `tenant-mechanism-fence` and `wrapper-migration-countdown` are not loosened.
- **Do not adopt if step 1 or step 5 misses its bar. Stop and report instead.**

## Steps

0. Read the quick-626 summary and `docs/audits/guc-checkout-reassertion.md` (incl. §4 and the §8 addendum).
   Preconditions: `app_user`, tripwire both directions, 86 bypass policies with sorted parity against production.
   vitest baseline from the working tree (JSON reporter, failing-file set).
1. Build the **adoption candidate** (`scripts/audit/627-checkout-candidate.ts`): quick-625's prototype reduced to
   `leave` + cache (write-only invalidation, per §4) + unbatch + socket listener. Re-measure under it: the cache
   cells (cold process each) and the 8-way × 2-tenant × 64 matrix at max:1/max:5 with and without errors.
   **Gate:** 64/64 correct, 0 wrong-tenant, 0 empty, 0 P2028.
2. quick-624's error reproduction under `leave`, one cold process per cell, every error shape quick-625 used,
   tripwire on and off.
3. Guard tests (`tests/security/tenant-checkout-guards.test.ts`) per §4: the private `__internalParams.transaction`
   field, and the AsyncLocalStorage caller-context dependency (with an in-file self-test). Each is proven to fire by a
   deliberate break, then restored. They test the ADOPTED code, so each break is proven after step 4.
4. Adopt in `prisma.ts`, `tenant-client.ts` and `tenant-context.ts`. Remove the two session `set_config` calls, keep
   unbatch and the listener, and default the mode to `'leave'` in `prisma.ts` (`TENANT_CHECKOUT_NO_CONTEXT`). Re-run
   steps 1 and 2 against the real modules.
5. Latency on quick-626's traffic (`627-latency.ts`, a byte-identical copy of `626-cache-hit-rate.ts`), fresh process
   per configuration. Shipped is measured by stashing the three files. **Gate:** parity with shipped on hit rate and
   percentiles.
6. Both click-throughs (626 launcher: in-process detector + counter hook; quiet-log attribution), with the four-part
   arming control. Is `/home` fixed?
7. Regenerate the query census; is it still 144, and what are the batches?

Gates at close: tsc (probed), `npm run build`, vitest failing-file set vs step 0.
