---
phase: quick-626
plan: 01
type: measurement-gated adoption
autonomous: true
files_modified:
  - apps/web/scripts/audit/626-preconditions.ts (copy of 625's, evidence path only)
  - apps/web/scripts/audit/626-cache-hit-rate.ts (new — step 1)
  - apps/web/scripts/audit/626-checkout-counter-hook.js (new — real-traffic GUC round-trip counter)
  - apps/web/scripts/audit/626-start-staging-server.js (copy of 620's launcher, preloads the counter hook)
  - docs/audits/guc-checkout-reassertion.md (§8 addendum)
  - .planning/quick/626-adopt-checkout-time-guc-re-assertion/* (evidence, analysis script, summary)
  - CONDITIONAL on step 1: src/lib/db/prisma.ts, src/lib/db/tenant-client.ts, src/lib/context/tenant-context.ts, two guard tests
---

# quick-626 — adopt checkout-time GUC re-assertion (gated on its latency)

Executed inline by the orchestrator rather than planner and executor subagents, as quick-624 and quick-625 were: step 1
is a gate whose raw numbers decide whether steps 2–7 exist at all, which a plan written up front cannot carry.

## Constraints (from the brief)

- Staging `wyixpgunnjmzguhggocz` as `app_user`, tripwire armed. Production never written; no cutover; no change to
  production `DATABASE_URL`; `bypass_rls_policy` not dropped.
- No package installed. `tenant-mechanism-fence` and `wrapper-migration-countdown` are not loosened.
- **Do not adopt without step 1's answer. If the hit rate is low enough that most checkouts pay the round trip, stop
  and report rather than adopting.**

## Steps

0. Preconditions (app_user, tripwire both directions, 86 bypass policies, sorted parity with production); vitest
   baseline from the working tree, JSON reporter, failing-file set.
1. Cache hit rate under request-shaped traffic (many short requests, five tenants, the auth bootstrap's bare
   transaction, c=1 and c=4), median + p95 with and without the cache against shipped; cross-region cost per miss.
   **Gate.**
2. Guard the `__internalParams` private-field dependency; prove it fires.
3. Guard the AsyncLocalStorage dependency; prove it fires.
4. Adopt in `prisma.ts`, `tenant-client.ts`, `tenant-context.ts`; remove the two session `set_config`s; keep unbatch
   and the socket listener.
5. Re-run quick-625's eviction cells (cold process each) and the 8-way concurrency matrix on shipped code.
6. Both click-throughs with the in-process detector and quiet-log attribution; arming check; `/home`.
7. The 144 bare-client statements.

Gates at close: tsc (probed), `npm run build`, vitest failing-file set vs step 0.
