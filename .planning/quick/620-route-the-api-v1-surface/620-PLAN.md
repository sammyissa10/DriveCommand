# quick-620 — PLAN

**Route the API_V1 surface — 6 files, 14 statements — off `app.bypass_rls` onto
`getTenantPrismaForOrg(tenantId)`.**

Target: staging (`wyixpgunnjmzguhggocz`) as `app_user`, tripwire armed. Production is read for
`pg_policies` only and never written.

Planned and executed inline by the orchestrator, not by planner/executor subagents: the surface is
small, and every decision depends on facts measured in steps 0–3.

## Step 0 — preconditions (done before any edit)
- vitest baseline from the working tree at `63e08682` → `evidence/00-vitest-baseline*.{json,txt}`
- `620-preconditions.ts` (a copy of 619's) → app_user, tripwire armed, 86/86, sorted list == production

## Tasks
1. **Re-verify + reconcile** — `620-repo-remainder.ts` before; 14 pairs vs the census; commits.
2. **Tenant source** per statement, plus live `pg_policies` on both DBs, before any edit.
3. **findUnique census** over the 6 files.
4. **Route** — two code commits, each well under 10 files / 250 lines:
   - (a) `api/v1/messages/*` — 5 files, 10 statements
   - (b) `api/v1/carrier/stops/[id]/messages` — 4 statements, **plus** `tests/security/bypass-rls-flag-removal.test.ts`,
     which pins `retainedFlags: 4` on that file. Witness it RED against the routed file first, then update
     `retainedFlags 4→0`, `TOTAL_RETAINED 15→11`, and add the new receiver name to RULE 1 so it keeps
     guarding the routed transactions.
   Pattern: `const tenantPrisma = await getTenantPrismaForOrg(tenantId)` once per handler, `userId` never
   passed, `$transaction` + `TX_OPTIONS` kept, every `tenantId`/`orgId` predicate kept (counted per file,
   comments stripped, before/after), the `set_config` line and stale `@bypass_rls` docblock deleted.
   In the stops file the existing `getTenantPrisma()` stop-ownership lookup is NOT a bypass statement and
   stays untouched; the routed client gets its own name (`orgPrisma`).
5. **Remainder** — `620-repo-remainder.ts --after`: expected 59 − 14 = 45, non-API_V1 statements identical.
6. **Proof** — `620-routing-verify.ts`, built from 619's harness (capture / drop / restore / self-heal,
   fixed dual-form TC001 hook, `--throw-after-drop`, no `process.kill`). Drop `bypass_rls_policy` on
   `FleetMessage`, `User`, `dispatches`. Call the **real route handlers** in cold child processes with
   `getSession` supplied for a real staging user (a session cannot come from a cookie in a script), so the
   routed code itself executes, including the two `updateMany` and three `create` writes, on disposable
   rows that are deleted after. Per-table own/foreign pairs, empty tables named.
7. **Both click-throughs** (web 604 passes 1+2, mobile 617) + 4-part arming counter-assertion; state
   whether either exercised a routed statement.
8. **Gates** — tsc (probed), `npm run build`, vitest failing-file set vs step 0, wrapper countdown.

## Limits
No production writes · no permanent policy drop · no `tenantId` where clause removed · no `userId` passed
· nothing outside `src/app/api/v1/**` routed.
