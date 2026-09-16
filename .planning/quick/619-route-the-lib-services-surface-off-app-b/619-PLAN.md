# quick-619 — PLAN

**Route the LIB_SERVICES surface — 15 files, 44 statements — off `app.bypass_rls` onto
`getTenantPrismaForOrg`.**

Target: staging (`wyixpgunnjmzguhggocz`) as `app_user`, tripwire armed. Production is never written.

## Why this surface is different

MOBILE_API's statements were route handlers with a tenant from `withMobileAuth()`. These are library
and service functions: the tenant may arrive as a parameter, from a caller's session, from a job
payload — or not at all. quick-618 found three live hazards prior scans missed because a client passed
as a parameter is invisible to a local-declaration scan.

## Preconditions (step 0)

- run from the repo root; install nothing
- staging is `app_user`, tripwire armed (armed → raises, scoped → succeeds, disarmed → silent),
  `bypass_rls_policy` at 86 with a sorted list identical to production's
- vitest baseline captured from the working tree at task start
- the mobile click-through must actually authenticate before any edit (quick-617 and 618 were blocked)

## Tasks, in order

1. **Re-verify** the 15 files / 44 statements against current code; name anything that moved, with
   the commit; reconcile against the 92 remaining.
2. **Tenant source per statement** — parameter / session / job payload / nowhere — reported before any
   edit. No tenant in scope ⇒ stop and report; never thread a tenant through a signature on a guess.
   Check census categories against live `pg_policies` rather than trusting prior prose.
3. **findUnique / findUniqueOrThrow** in these files checked against quick-618's fix — confirm, don't
   assume; name any the fix does not reach.
4. **Route** with the established pattern: one acquisition per unit of work, `userId` omitted, every
   `tenantId` where clause kept (counted per file, comments stripped, before and after), `$transaction`
   kept, the bypass `set_config` deleted in the same edit, stale annotations corrected. Deviations stop.
5. **Remainder** reconciled: `92 − routed = expected`, measured by the same AST method.
6. **Proof** on staging as `app_user` with `bypass_rls_policy` DROPPED on every table the routed
   statements reach; real functions called where possible; TC001 detected at the driver (several of these
   functions swallow errors); `finally` proven by `--throw-after-drop`; restore confirmed by sorted table
   list against production; no `process.kill`.
7. **Both click-throughs**, web and mobile — entries / pass / fail / not-reachable / TC001, plus the
   four-part arming counter-assertion. State exactly what the first mobile run covers.
8. **Commits** capped at ~10 files or ~250 lines.

## Limits

No production writes · no permanent policy drop · no `tenantId` where clause removed · no `userId` passed
· no surface other than LIB_SERVICES touched.

## Gates

tsc clean and probed · `npm run build` exit 0 · failing-file set measured against the step-0 baseline ·
remaining surfaces and sizes stated.
