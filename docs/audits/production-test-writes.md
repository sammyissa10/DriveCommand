# Production test writes — what creates ZZ-THROWAWAY tenants

**Investigation only.** Nothing was deleted, no test/script/config was changed, and no row was
written to production or staging by this task. The nine tenants are evidence and are left in place.

---

## 0. The answer in one paragraph

Seven real-database test files under `apps/web/tests/carrier/` create a tenant named
`ZZ-THROWAWAY-<SCENARIO>-<Date.now()>` and exercise the real commit path against it. They are
ordinary `*.test.ts` files collected by `vitest.config.ts`, so **`npx vitest run` / `npm test` in
`apps/web` runs them**. Each one hand-parses `apps/web/.env.local` for `DATABASE_URL`, which points
at **production** — and unlike the two bare-`DATABASE_URL` suites that quick-598 hardened, **none of
the seven carries any production refusal at all.** They clean up in `afterAll` and verify the
cleanup, but the cleanup runs inside a single Prisma `$transaction`, and when the run is
connection-starved that transaction cannot start either. The nine survivors are the runs where that
happened. **No real tenant's data was touched — every write landed inside the throwaway tenant, and
that has been measured, not assumed.**

The invoker is not exotic. It is a developer or an agent running the test suite. That is why the
cadence looks weekly: it tracks whoever ran the full suite that week.

---

## 1. Every code path that creates a ZZ-THROWAWAY tenant

All seven build the name as `ZZ-THROWAWAY-<SCENARIO>-${STAMP}` where `const STAMP = ${Date.now()}` —
a millisecond epoch, which is what makes each tenant name decodable to the exact moment its module
was loaded.

| # | file | line | tenant name |
|---|---|---|---|
| 1 | `apps/web/tests/carrier/document-import-commit-rollback.test.ts` | **170** | `ZZ-THROWAWAY-PHASE8-ROLLBACK-${STAMP}` |
| 2 | `apps/web/tests/carrier/document-import-commit-out-of-service.test.ts` | **149** | `ZZ-THROWAWAY-PHASE8-OOS-${STAMP}` |
| 3 | `apps/web/tests/carrier/document-import-commit-windows.test.ts` | **141** | `ZZ-THROWAWAY-PHASE8-WINDOWS-${STAMP}` |
| 4 | `apps/web/tests/carrier/document-import-commit-notification-isolation.test.ts` | **180** | `ZZ-THROWAWAY-PHASE8-NOTIF-${STAMP}` |
| 5 | `apps/web/tests/carrier/inspection-blocked-side-effects.test.ts` | **187** | `ZZ-THROWAWAY-QUICK549-${STAMP}` |
| 6 | `apps/web/tests/carrier/driver-incident-report-persists.test.ts` | **108** | `ZZ-THROWAWAY-QUICK570-INCIDENT-${STAMP}` |
| 7 | `apps/web/tests/carrier/sample-record-picker-filtering.test.ts` | **114** | `ZZ-THROWAWAY-TKT0076-${STAMP}` |

Two further stamped identifiers are written inside those tenants and are worth knowing about
because they are what a `LIKE 'ZZ-%'` sweep over `Tenant` alone will miss:

- `document-import-commit-rollback.test.ts:409` — `vehicleId: ZZ-THROWAWAY-${STAMP}`
- `inspection-blocked-side-effects.test.ts:377` — `vehicleId: ZZ-THROWAWAY-549-${suffix}-${STAMP}`

**Nothing else in the repo creates one.** No script under `apps/web/scripts/`, no fixture, no seed,
no CI workflow, and no GSD task step contains the literal. The only other producers of
`ZZ-`-prefixed tenants are `scripts/seed-staging.ts` / `seed-staging-auth.ts` (staging-only, guarded
on the production ref) and one hand-made `ZZ-TEST-B3-0914` row from quick-601.

---

## 2. How each resolves its connection, and what stops it reaching production

Traced, not inferred. All seven share the same block — quoted from
`document-import-commit-rollback.test.ts:93-132`:

```ts
const candidates = [
  resolve(process.cwd(), '.env.local'),          // apps/web/.env.local   <- FIRST
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), '..', '..', '.env.local'),
  resolve(process.cwd(), '..', '..', '.env'),
];
...
if (process.env[key] !== undefined) continue;    // existing values win
```

```ts
loadEnvLocal();
const hasDatabase = !!process.env.DATABASE_URL;
const describeWithDb = hasDatabase ? describe : describe.skip;
...
if (hasDatabase) { ({ prisma } = await import('@/lib/db/prisma')); }
```

`apps/web/.env.local:17` supplies:

```
DATABASE_URL="postgresql://postgres.oqdhberkghtnszrkdvfm:***@aws-1-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true"
```

`oqdhberkghtnszrkdvfm` is **production**. `@/lib/db/prisma` builds its `pg.Pool` from that string at
module scope, so the suite is connected to production before its first assertion.

### What stops it reaching production: nothing

Measured across all seven — **zero** occurrences of the production ref and **zero** imports of the
bootstrap in any of them:

```
sample-record-picker-filtering.test.ts        prodref=0 bootstrap=0
inspection-blocked-side-effects.test.ts       prodref=0 bootstrap=0
driver-incident-report-persists.test.ts       prodref=0 bootstrap=0
document-import-commit-windows.test.ts        prodref=0 bootstrap=0
document-import-commit-rollback.test.ts       prodref=0 bootstrap=0
document-import-commit-out-of-service.test.ts prodref=0 bootstrap=0
document-import-commit-notification-isolation.test.ts prodref=0 bootstrap=0
```

Two clarifications that matter, because both look like protection and are not:

1. **The guards these files DO carry protect a tenant, not a database.**
   `PROTECTED_TENANT_ID = '7e9eca25-…'` plus `assertDisposable(id)` refuse any write that is not
   keyed to this suite's own throwaway tenant. That is a real and effective guard — §5 shows it
   held perfectly — but its whole model is *"scope every write to my own throwaway tenant"*, and
   **the throwaway tenant is created in production.** "Disposable" describes the tenant, never the
   database.

2. **quick-607's writer guard does not cover these.** That work hardened
   `scripts/_bootstrap-env`, and its census found four importers — none of them these files. The
   two bare-`DATABASE_URL` writers that *were* hardened (by quick-598, with a hardcoded refusal)
   are `tests/security/db-fixture-setup.ts` and `tests-db/rls-isolation/env.ts`. **These seven sit
   in the gap between the two efforts**: they neither import the bootstrap nor carry quick-598's
   refusal, and no census has ever enumerated them.

---

## 3. What invokes them

**A local `npx vitest run` (or `npm test`) in `apps/web`.** Concretely:

`apps/web/vitest.config.ts:8-16` includes `'tests/**/*.test.ts'`. All seven live in
`apps/web/tests/carrier/`. They are not marked, not tagged, not in a separate project, and not
excluded from the default run. **Running the whole suite runs them against production.**

**CI is not the invoker, and is safe.** `.github/workflows/ci.yml:35-39` runs `npx vitest run` with

```yaml
DATABASE_URL: postgresql://ci:ci@localhost:5432/ci
```

and `loadEnvLocal()` skips any key already present (`if (process.env[key] !== undefined) continue`),
so CI keeps the dummy. No CI job supplies a production connection string to vitest.

So the population at risk is exactly "whoever runs the suite on a machine that has
`apps/web/.env.local`" — every developer, and every agent session that runs the suite as a gate.

### The scenario suite behind PHASE8-ROLLBACK / -OOS / -WINDOWS

They are not one file but a family of four Phase 8 commit suites, plus three later additions.
Every scenario, from the file headers and `it(...)` titles:

**1. `document-import-commit-rollback.test.ts` — "Phase 8 commit — atomic rollback, asserted against the database"**
- starts from a clean database for this tenant
- `rolls back completely when the transaction fails at ${step}` — **parameterised over `STEPS: CommitStep[]`**, one test per commit step
- writes the trip, its stops, its load and its documents when nothing fails
- refuses a direct call that names a driver with an expired licence

**2. `document-import-commit-out-of-service.test.ts` — "Phase 8 — an out-of-service truck is offered, flagged and refused"**
- returns the out-of-service truck from the assignment picker, flagged and blocked
- answers 422 with a structured block code and creates no trip
- stops blocking once the same truck returns to service

**3. `document-import-commit-windows.test.ts` — "Phase 8 commit — template appointment windows materialise on real rows"**
- writes `scheduledDeparture + offsetMin * 60000` into every stop window
- leaves the window null on a stop the template gave no offsets

**4. `document-import-commit-notification-isolation.test.ts` — "Phase 8 commit — a failing driver notification cannot undo the trip"**
- commits the trip, its stops, its load and its documents though the notification throws
- writes exactly the same rows when the notification succeeds

**5. `inspection-blocked-side-effects.test.ts` — "quick-549 — a BLOCKED inspection writes its defects"**
- starts with no defects for this tenant · writes a defect row for EVERY failed item when the
  verdict is BLOCKED · re-submitting the same failed checklist updates rather than duplicates ·
  writes NO defects when the same checklist passes · kept the two trips on separate trucks
- (plus a non-DB source-scan `describe` that needs no tenant)

**6. `driver-incident-report-persists.test.ts` — "submitIncidentReport — success implies a row"**
- records a `DriverIncident` row · keeps the incident when the notification fails · maps a form
  type the enum cannot hold · rejects a missing severity without writing anything

**7. `sample-record-picker-filtering.test.ts` — "TKT-0076 — samples are hidden from pickers"**
- hides a sample truck / driver / client from the picker while keeping it in the list · puts a
  converted record into the pickers immediately
- (plus a source-scan `describe` that needs no tenant)

---

## 4. Cleanup — it exists, it is verified, and it still failed

Every suite has a thorough `afterAll` (`document-import-commit-rollback.test.ts:494-558`) that
deletes children first, then re-counts and **throws** if anything survived:

```ts
const leftover = Object.entries(survivors).filter(([, n]) => (n as number) > 0);
if (leftover.length > 0) {
  throw new Error(`CLEANUP FAILED — orphan rows left in production for throwaway tenant ...`);
}
```

The design is right, and its own header says why: *"a silent cleanup failure would leave orphans in
a production database, which is worse than a red test."*

### Why it did not run

**Every child row of every surviving tenant is still present** (§5). Not a partial delete — nothing
was deleted. That rules out the obvious hypothesis (a RESTRICT foreign key missing from the delete
list) for the recent ones, because a missing FK would still have removed the rows deleted before it.
Two facts explain it:

1. **All the deletes are inside ONE `prisma.$transaction`** (`bypass()`,
   `document-import-commit-rollback.test.ts:189-196`). Any failure rolls the whole thing back, so the
   outcome is all-or-nothing by construction.
2. **The transaction could not start.** From my own saved run artefacts of 2026-09-15:

```
document-import-commit-rollback.test.ts
  PrismaClientKnownRequestError: Transaction API error:
  Unable to start a transaction in the given time.

document-import-commit-windows.test.ts
  Error: timeout exceeded when trying to connect
      at node_modules/pg-pool/index.js:45:11
```

Four such suites run concurrently under vitest's default worker pool, each opening its own pool
against the **pgbouncer pooler on 6543**. Under that contention the test body times out — and the
`afterAll` that would clean up needs a transaction on the same starved pool, so it times out too.
**The cleanup fails for the very reason the test failed.** A suite that only cleans up over the
connection it just exhausted has no way to recover.

So: **these nine are failure residue, and that is worth stating separately.** They are not evidence
of a cleanup bug on the happy path — on a green run the tenant is deleted and verified gone. They
are evidence that the failure mode of these suites is *leave a tenant in production*.

The older survivors have a second, historical cause that is already documented in the code:
`ZZ-THROWAWAY-PHASE8-ROLLBACK-1788491882746` carries **12 `NotificationLog` rows**, and
`NotificationLog` is a RESTRICT FK that was **absent from the delete list** until quick-551 added it
(see the comment at `:520-530`). That is the FK-blocker shape, and it is fixed.

### Already reported once, and never owned

`.planning/quick/570-.../570-SUMMARY.md:161` recorded:

> **One pre-existing orphan tenant in production**, `ZZ-THROWAWAY-PHASE8-ROLLBACK-1787861997834`,
> created 2026-08-27 — not from this task and left alone. **Its `afterAll` verification should have
> thrown; it is worth finding out why it did not.**

That was correct, it was the first of the nine, and nobody picked it up. Eight more accumulated
behind it.

### Attribution of the three most recent — mine

Local time here is **UTC-5**, verified (`GMT-0500 Central Daylight Time`). Decoding the epoch in
each name:

| tenant | `STAMP` decoded | `Tenant.createdAt` |
|---|---|---|
| `…PHASE8-ROLLBACK-1789503263285` | 2026-09-15T**20:14:23**Z | 20:14:24Z |
| `…PHASE8-OOS-1789503363905` | 2026-09-15T**20:16:03**Z | 20:16:04Z |
| `…PHASE8-WINDOWS-1789503466708` | 2026-09-15T**20:17:46**Z | 20:17:48Z |

In the immediately preceding session (quick-607) I ran the full vitest suite three times plus a
four-file run, starting at 15:12:15 local = **20:12:15Z**. The JSON artefacts of those runs are
still on disk with mtimes 15:15 and 15:17 local (20:15Z, 20:17Z), and **they contain the exact
failure messages quoted above, for exactly these files.** All three tenants fall inside that window.

**I created these three, while running the suite as a verification gate.** quick-607's own summary
reported those four files as "flaky at HEAD" — which was true, and incomplete: each of those flakes
left a tenant in production. That is the honest correction to make, and it is the second time in two
sessions that a production write happened as a side effect of verifying something else.

---

## 5. Blast radius per run

Per-tenant counts read from production. Each row is one run of one suite.

| tenant | users | clients | drivers | trucks | facilities | fac_refs | route_tmpl | imports | pages | trips | stops | loads | in_app | notif_log | step_inst |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| PHASE8-ROLLBACK-…97834 (08-27) | 1 | 1 | 1 | 1 | 2 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 1 | 0 | 0 |
| QUICK549-…27210 (09-03) | 1 | 0 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 2 | 0 | 0 | 2 | 0 | 6 |
| PHASE8-ROLLBACK-…82746 (09-04) | 1 | 1 | 1 | 1 | 2 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 2 | **12** | 0 |
| PHASE8-ROLLBACK-…33232 (09-09) | 1 | 1 | 1 | 1 | 2 | 0 | 0 | 1 | 2 | 1 | 2 | 1 | 2 | 6 | 0 |
| PHASE8-ROLLBACK-…49456 (09-12) | 1 | 1 | 1 | 1 | 2 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 2 | 3 | 0 |
| PHASE8-ROLLBACK-…63285 (09-15) | 1 | 1 | 1 | 1 | 2 | 2 | 0 | 1 | 2 | 1 | 2 | 1 | 1 | 0 | 0 |
| PHASE8-OOS-…63905 (09-15) | 1 | 1 | 1 | **2** | 2 | 2 | 0 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| PHASE8-WINDOWS-…66708 (09-15) | 1 | 1 | 1 | 1 | **4** | 4 | **1** | **2** | **8** | 1 | **4** | 1 | 1 | 0 | 0 |

Plus **1 `Tenant`** row each. Nine tenants; the ninth, `ZZ-TEST-B3-0914`, is quick-601's hand-made
provisioning fixture (4 users, 2 clients, 3 carrier_drivers) and is a different origin.

**A typical Phase 8 run writes ~12-25 rows across 10-13 tables.** The heaviest is WINDOWS, which
seeds a route template and two imports: ~28 rows across 13 tables.

### Does anything touch a real tenant's data?

**No — measured.** Every row created in production during the 2026-09-15 20:10-20:25Z window,
counted against whether its owner is a ZZ tenant:

| table | rows created in window | belonging to a REAL tenant |
|---|---|---|
| document_imports | 4 | **0** |
| dispatches | 2 | **0** |
| loads | 2 | **0** |
| facilities | 8 | **0** |
| clients | 3 | **0** |
| carrier_trucks | 4 | **0** |
| route_templates | 1 | **0** |
| User | 3 | **0** |
| in_app_notifications | 2 | **0** |

`assertDisposable()` and the tenant-keyed `where` clauses held completely. The damage is confined to
self-created tenants: **junk in the tenant list, not corruption of anyone's data.** Stated plainly
because it is the difference between an embarrassment and an incident, and it is the one part of the
original design that worked exactly as intended.

Two residual notes, reported not fixed:
- The nine tenants are visible to any SysAdmin portal tenant listing and are counted by any
  tenant-count metric (`TenantMetricsDaily`, health scores, billing surfaces).
- `in_app_notifications` and `NotificationLog` rows exist for users inside those tenants only. No
  email left the system for a real user, because the recipients are the throwaway tenant's own
  fabricated `User` rows.

---

## 6. What would have caught this

No task's verification did, and the reason is uniform: **every gate in this phase counted the things
a migration changes — policy counts, `_prisma_migrations` rows, grants, ledger heads — and nothing
counted the things a test writes.** quick-604 and quick-606 both re-read production at open and at
close and both reported "never written", honestly: they compared **156 migrations / 183 policies /
migration head**, and all three of those numbers are invariant under creating a tenant.

The assertion that would have caught it, in order of how cheaply it closes the gap:

1. **A production-ref refusal in the seven files, identical to the one quick-598 already wrote.**
   Four lines, and it turns the whole class from "silently writes to production" into "refuses to
   start". This is the actual fix; everything below is detection after the fact.

2. **`SELECT count(*) FROM "Tenant"` in the open/close gate.** quick-604's `604-survey.ts --open/--close`
   already reads production twice and diffs three counts. A fourth — total tenants, plus
   `count(*) WHERE name LIKE 'ZZ-%'` — would have failed the close of quick-606 on 2026-09-15 and of
   every earlier task back to 08-27. **One line in a script that already existed.**

3. **A census test for real-DB suites, the shape quick-607 built for bootstrap importers.** Enumerate
   every file under `apps/web/tests/` that constructs a Prisma client, assert the set equals a
   declared list, and assert each member contains the production-ref refusal. The reason these seven
   were invisible is that no list of them has ever existed — quick-607's census deliberately scoped
   itself to `_bootstrap-env` importers and these are not that.

4. **A CI or pre-commit sweep for orphans**: `count(*) FROM "Tenant" WHERE name LIKE 'ZZ-THROWAWAY%'`
   must be 0. quick-536's own summary (`536-SUMMARY.md:718`) records running exactly this query and
   getting 0 — so the check was invented, used once at close, and never made recurring.

5. **Making the cleanup survivable.** The deletes need a connection independent of the exhausted pool,
   or a retry, or a `finally` that reconnects. As written, the cleanup can only run when the test run
   was healthy enough not to need it.

The general lesson, and it is the same one as quick-607's: **a verification that never states which
database it measured, and counts only what it expected to change, cannot detect a write it did not
expect.** "Production was never written" was true of every deliberate action in this phase and false
of the test suite the whole time, and no artefact in the repo contained the number that would have
shown the difference.

---

## 7. Recommended follow-ups (not performed — this task changed nothing)

- Add the production-ref refusal to all seven files.
- Add a tenant-count assertion to the open/close survey.
- Decide what to do with the nine tenants. They are **left in place as evidence**; deleting them is a
  separate, deliberate act that should re-verify the FK order and be recorded.
- Re-examine whether these suites should run in the default `npx vitest run` at all, or move behind a
  separate vitest project the way `tests-db/rls-isolation/` already is (`vitest.db.config.ts`).
