# quick-624 — PLAN

**Explain DRIVER_A's `/home` TC001 on a statement the census marks `SCOPED`, and fix the click-through
attribution that blamed `/my-load`.**

Target: staging `wyixpgunnjmzguhggocz` as `app_user`, tripwire armed. Production is read-only (`pg_policies` parity,
one `information_schema` read) and never written. Investigation first; a fix only if the cause is contained.
Executed inline by the orchestrator: each step depends on what the previous one measured.

## Approach
Reproduce on demand against a staging dev server with a second, tracing-only hook. For every physical
connection it journals connects, ends, `set_config` values, errors of any SQLSTATE, and call-time stacks. That
separates "wrong client", "context cleared", and "different connection" by observation. Then prove the mechanism in
isolation with the app's real prisma module, and size the class from the census rows.

## Steps
0. vitest baseline from the working tree; `624-preconditions.ts`.
1. `624-start-staging-server.js` (620's launcher, preloads `624-guc-trace-hook.js`, which loads 620's detector) +
   `624-home-repro.ts`: `/home` N times, per-request windows, raise block + GUC at raise time.
2. Resolve the statement from SQL/values/stack; look the row up in the census.
3. Classify the cause; prove it with `624-eviction-probe.ts` (cold app_user cells: control, autocommit error,
   error inside a transaction, transaction after an error, re-acquire, tripwire off).
4/5. Establish the class and relate it to quick-610/621/618/606.
6. Fix only if contained; otherwise stop and report.
7. Fix click-through attribution (quiet-log windows), witness both rules on `/home,/my-load`, re-run both
   click-throughs on the standard 620 server.
8. Gates: tsc (probed), build, vitest failing set vs step 0.

## Limits
No production writes · no policy drop needed (reads only) · census generator untouched · no raise suppressed ·
nothing installed.
