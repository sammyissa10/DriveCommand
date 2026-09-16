---
phase: quick-625
plan: 01
type: investigation + prototype
autonomous: true
files_modified:
  - apps/web/src/lib/db/tenant-checkout.prototype.ts (new, imported by nothing in src)
  - apps/web/scripts/audit/625-preconditions.ts (copy of 624's, evidence path only)
  - apps/web/scripts/audit/625-checkout-eviction.ts (new)
  - apps/web/scripts/audit/625-checkout-concurrency.ts (new)
  - docs/audits/guc-checkout-reassertion.md (new)
  - .planning/quick/625-checkout-guc-reassertion-vs-per-unit-bin/* (evidence, sizing script, summary)
---

# quick-625 — can the tenant GUC be re-asserted at checkout, or is per-unit binding the only option?

Executed inline by the orchestrator rather than planner and executor subagents, as quick-624 was: every step is a
measurement whose next step depends on the raw numbers of the previous one (step 1's answer decides whether steps 2–4
exist at all; step 3 found the DataLoader hole that changed the prototype before step 4 ran), which a plan written up
front could not have carried.

## Constraints (from the brief)

- Staging `wyixpgunnjmzguhggocz` as `app_user`, tripwire armed. Production is opened read-only for the
  `bypass_rls_policy` parity check and nothing else.
- Do not modify the shipped pool (`prisma.ts`), the extension (`tenant-rls.ts`), or any call site. Prototype alongside.
- Do not install a package. Do not re-litigate quick-607's per-operation extension binding.
- Recommend only what was measured.

## Tasks

0. Preconditions (`625-preconditions.ts`): app_user, tripwire both directions, 86 bypass policies, sorted parity with
   production. vitest baseline from the working tree at task start, JSON reporter, failing-file set recorded.
1. Where is the tenant known at checkout? Read pg-pool 3.11.0 (`connect`, `_pulseQueue`, `_acquireClient`, `query`),
   adapter-pg 7.4.0 (`performIO`, `startTransaction`) and the generated Prisma runtime (DataLoader). Evaluate
   AsyncLocalStorage, a request-scoped client, and anything else, with costs. Stop at step 4 if nothing can supply it.
2. Prototype: a `pg.Pool` subclass whose `connect()` captures the ALS store at CALL time and issues
   `set_config(…, false)` on the delivered client before handing it back; a tenant client that carries the context
   (top-level `$allOperations` + `$transaction`). Include the `'acquire'`-event variant as a negative control.
3. `625-checkout-eviction.ts`: quick-624's cells, cold process per cell, prototype vs shipped, tripwire on and off,
   plus bare-after-tenant, another tenant's error, both transaction shapes, and same-tick `findUnique` across tenants.
4. `625-checkout-concurrency.ts`: 8-way × 8 waves, two tenants alternating, max:1 and max:5, prototype / acquire-event /
   shipped, with and without injected evictions. Raw counts of correct / wrong-tenant / empty / TC001 / P2028. Plus a
   per-checkout cost benchmark.
5. `census-sizing.cjs` against quick-623's regenerated census: coverage of the 1,342 by class; per-unit binding re-sized
   in units (AST, innermost named function); the 144 gating rows under each option.
6. Audit document with the recommendation and blast radius. Gates: tsc (probed), `npm run build`, vitest failing set
   vs step 0. Commit.
