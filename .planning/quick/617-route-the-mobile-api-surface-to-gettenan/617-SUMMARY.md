---
phase: quick-617
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, bypass_rls, mobile-api, tenant-context, prisma-extensions]
requires:
  - quick-616 census (177 → 175 live statements, `evidence/01-census.json`)
  - quick-588 precedent (`api/mobile/carrier/*`, 5 files)
  - quick-610 rule (omit `userId`; a behaviour change must not ride a routing fix)
provides:
  - 39 of 47 MOBILE_API files routed to `getTenantPrismaForOrg`; 67 of 83 bypass statements removed
  - the GUC-inside-`$transaction` question MEASURED (it holds)
  - a measured, repo-wide defect class — `findUnique` + a `select` omitting `tenantId`
affects:
  - `apps/web/src/app/api/mobile/{support,driver,owner}/**`
  - `apps/web/scripts/audit/617-*`
  - `apps/web/scripts/audit/wrapper-countdown.json` (regenerated, 475 → 530)
tech-stack:
  added: []
  patterns: [tenant-scoped-prisma-client, per-sub-surface-commits, cold-process-probe-cells]
key-files:
  created:
    - apps/web/scripts/audit/617-mobile-inventory.ts
    - apps/web/scripts/audit/617-routing-verify.ts
    - apps/web/scripts/audit/617-apply-routing.js
    - apps/web/scripts/audit/617-finduniq-scan.ts
    - apps/web/scripts/audit/617-mobile-click-through.ts
    - apps/web/scripts/audit/617-start-staging-server.js
    - apps/web/scripts/audit/617-arming-control.ts
    - apps/web/scripts/audit/617-repo-remainder.ts
    - apps/web/scripts/audit/617-run-drift-on-staging.ts
  modified:
    - 39 route files under apps/web/src/app/api/mobile/
decisions:
  - "userId is OMITTED from every acquisition — 26 of 30 write operations would otherwise newly populate audit columns"
  - "8 files STOPPED AND REPORTED rather than routed: findUnique + a top-level select omitting tenantId returns null for its OWN tenant"
metrics:
  statements_routed: 67
  statements_stopped: 16
  files_routed: 39
  repo_remainder: 108
  completed: 2026-09-16
---

# quick-617: Route the MOBILE_API surface to `getTenantPrismaForOrg` — Summary

**39 of 47 files and 67 of 83 statements routed, the GUC-inside-`$transaction` question measured
rather than assumed, and 8 files stopped on a defect class that would have made them return "not
found" for their own tenant on every request.**

---

## 1. THE SINGLE-FILE PROOF, QUOTED — produced before the other 46 were touched

`apps/web/src/app/api/mobile/driver/incidents/route.ts`. Chosen because it exercises everything in one
place: a GET read and a POST write, on a model that carries `tenantId` (so both layers engage) and
carries `createdById`/`updatedById` while the create supplies neither (so it is the worked example for
the second-argument rule).

### BEFORE

```ts
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
...
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const incidents = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.driverIncident.findMany({
        where: { driverId, tenantId },
        ...
      });
    }, TX_OPTIONS);
```

### AFTER

```ts
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
...
    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw —
     * getTenantPrismaForOrg takes validateMobileToken()'s verified
     * auth.tenantId. userId is deliberately NOT passed: it would drive the
     * audit-columns extension to start writing createdById/updatedById on
     * DriverIncident, a behaviour change this routing task declines to make
     * (this diverges from quick-588, which passes it — see 01-inventory.md §5).
     * Every where clause below is unchanged: RLS is the second layer, not a
     * replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const incidents = await tenantPrisma.$transaction(async (tx) => {
      return tx.driverIncident.findMany({
        where: { driverId, tenantId },
        ...
      });
    }, TX_OPTIONS);
```

`1 file changed, 18 insertions(+), 13 deletions(-)`.

### THE PATTERN, STATED

| element | rule |
|---|---|
| **receiver** | `getTenantPrismaForOrg(tenantId)` — never `getTenantPrisma()` (no `x-tenant-id` on `/api/mobile/*`, DEC-11), never `getAdminDb` |
| **second argument** | **OMITTED** — see §4 |
| **where the acquisition goes** | after auth and after the rate-limit return, before the transaction; **once per handler**, not once per transaction |
| **the `where` clause** | **KEPT, byte for byte.** Nothing inside `where`/`data`/`select`/`include`/`orderBy`/`take` changes |
| **the bypass flag** | **deleted in the same edit** |
| **the `$transaction` wrapper** | **KEPT**, `TX_OPTIONS` unchanged. A single-statement transaction is never collapsed |
| **the `@bypass_rls` docblock** | **deleted** — a comment asserting a removed invariant is the quick-547/548/562 class |

### THE PROBE, VERBATIM — staging, `app_user`, tripwire armed, `bypass_rls_policy` DROPPED on `DriverIncident`

```
[db-target] project : wyixpgunnjmzguhggocz (staging)  host : aws-0-us-west-1.pooler.supabase.com:5432
            role : postgres.wyixpgunnjmzguhggocz  lane : RUN  (credential MASKED, never printed)
bypass_rls_policy: 86 policies on 86 tables
DROPPED bypass_rls_policy ON public."DriverIncident"
bypass_rls_policy now: 85 (was 86)

  PASS  guc-visible            {"readBack":"b5623cdd-…","expected":"b5623cdd-…","role":"app_user"}
  PASS  unscoped-raises        {"raised":true,"sqlstate":"TC001"}
  PASS  own-read               {"own":1}
  PASS  foreign-read           {"foreignSeenByTenantA":0,"privilegedCounterRead":1}
  PASS  own-write-audit-null   {"id":"a52718ea-…","createdById":null,"updatedById":null,
                                "tenantId":"b5623cdd-…"}
  PASS  finduniq-select-hazard {"selectWithoutTenantId":null,"selectWithTenantId":{…},
                                "noSelect":{…},"privilegedCounterRead":1,"hazardConfirmed":true}

RESTORE: re-created 1; live now 86
  sorted list identical : true     body mismatches : []     VERDICT : PASS
fixtures left: 0 (must be 0)
```

`own > 0` **paired** with `foreign === 0` and a privileged counter-read; the created row's
`created_by_id` **and** `updated_by_id` still NULL; one transaction per cell, one cold child process
per cell, SQLSTATE off `err.cause.code`.

---

## 2. Step 1 re-verified, and a correction to the plan

**47 files / 83 statements** confirmed in the current tree by an AST walk. Sub-surfaces 1/16/30 files
and 1/21/61 statements — matching the plan exactly. All 83 are `TENANT_KNOWN_UNSCOPED`, so **nothing
went to `getAdminDb`** (`git diff | grep -c getAdminDb` over the source diff: **0**, with a positive
control confirming `getAdminDb` does exist in the repo).

**The 84 → 83 gap is attributed to commit `2f92a25a`**, with the git evidence reproduced in
`01-inventory.md` §3: the pre-commit file's **line 39** was the bypass, the commit removes it, and
line 97 survives and is in the inventory.

**Correction:** the plan asserts the *census* MOBILE_API row is `CROSS_TENANT 1f/1s +
TENANT_KNOWN_UNSCOPED 47f/83s = 47f/84s`. The census artefact on disk reads `CROSS_TENANT 0` and
`TOTAL 47f/83s`, because it was **regenerated after quick-616's own routing commit** — its
anti-vacuity block names `support/ticket/route.ts:39` as one of the two routed statements. The **84**
comes from the prior 211-statement audit transcription, which classifies that line `CROSS_TENANT`. The
substance is unchanged; the source is not what the plan said.

---

## 3. THE GUC-INSIDE-`$transaction` MEASUREMENT — outcome 1 of 3, the pattern holds

`getTenantPrismaForOrg` sets `app.current_tenant_id` with `set_config(..., false)` — session scope, on
the **bare** client, as a single autocommit statement, before the extended client is returned. All 83
statements then run inside `tenantPrisma.$transaction(...)`. Nothing in quick-588, 602, 610 or 616
measured that combination; quick-588 shipped the shape but argued the swap was receiver-only *because
its models are exempt*, so it never relied on the policy seeing the GUC. MOBILE_API's models are the
opposite.

Measured in a **cold process**, as `app_user`, tripwire armed, before any bulk edit:

```
PASS  guc-visible  {"readBack":"b5623cdd-dc19-4900-b75d-0ecfcaf191b8",
                    "expected":"b5623cdd-dc19-4900-b75d-0ecfcaf191b8","role":"app_user"}
```

**Outcome 1: the GUC reads back the tenant id from inside the transaction and the query returns
own-tenant rows.** Not outcome 2 (`''`/NULL + `TC001`, which would have stopped the task and forced
`tenantRawQuery`'s transaction-scoped shape onto 47 files) and not outcome 3 (a *different* tenant id,
a pool-leak finding more serious than the task). Re-confirmed on **all 18** tables in the full-surface
run.

---

## 4. The second argument: `userId` is OMITTED, and quick-588 is reported

`withAuditColumns` short-circuits on `userId == null` and otherwise injects `createdById`/`updatedById`
when the caller did not supply them. Joined to the inventory:

- **30 write operations** across the 47 files;
- **26 of them would newly populate a column that is NULL today**, across 14 models — `Document`,
  `DriverHOSEntry`, `DriverIncident`, `Load`, `FleetMessage`, `Customer`, `DriverInvitation`,
  `FuelRecord`, `Invoice`, `Route`, `Truck`, `MaintenanceEvent`, `ScheduledService`, `SupportTicket`;
- only 4 would change nothing (`User` carries neither convention; `PayrollRecord`/`Truck` creates
  already supply `createdById`).

So `userId` is omitted everywhere, one rule on the diff rather than forty-seven judgements. **This
diverges from quick-588, which passes `auth.userId` on the same surface** — stated in the code comment
and here. The cost is stated as a *declined change*, not an oversight: **audit columns that are NULL
today stay NULL.** `withTenantRLS` is unaffected — omitting `userId` disables only the audit extension.

### quick-588's `carrier_expenses` — CHECKED and REPORTED, not fixed

`CarrierExpense` carries `createdById`/`updatedById` (schema.prisma:2896-2897), is **not** in
`EXEMPT_AUDIT_MODELS`, and the create in `carrier/driver/dispatches/[id]/expenses/route.ts` supplies
neither. **quick-588 therefore did begin populating `carrier_expenses.created_by_id` and
`updated_by_id` on a routing commit, without saying so.** Its sibling
(`carrier/driver/stops/[stopId]/documents/route.ts` → `carrierDocument.create`) is inert:
`CarrierDocument` carries `uploadedBy`, which is neither convention.

Those files are outside the 47 and outside this task's limits — reported, untouched.
**`carrier_expenses` is EMPTY on staging** (`total 0, with_creator 0`), so the table can neither
confirm nor deny it; nothing is inferred from the emptiness.

---

## 5. DEVIATIONS

### 5a. STOPPED AND REPORTED — 8 files, 16 statements, on a measured defect class

`withTenantRLS` cannot add `tenantId` to a `findUnique` `where`, so it runs the query and post-checks
the **result**:

```ts
case 'findUnique': {
  const result = await query(args);
  if (result && (result as any).tenantId !== tenantId) return null;
  return result;
}
```

With a top-level `select` that omits `tenantId`, `result.tenantId` is `undefined`,
`undefined !== tenantId` is **true**, and the row is discarded — **for its own tenant**.

**MEASURED on staging, `app_user`, cold process, on TWO independent models** — a fixture row on
`DriverIncident` and a **pre-existing** row on `Truck`:

```
selectWithoutTenantId : null
selectWithTenantId    : { id: …, tenantId: b5623cdd-… }
noSelect              : { id: … }
privilegedCounterRead : 1            hazardConfirmed: true
```

Ten such statements across eight files, every one followed by `if (!x) return 404 / null / throw`:
`driver/loads/[id]/revert`, `driver/loads/[id]/status`, `owner/loads/[id]/assign-truck`,
`owner/loads/[id]`, `owner/routes/[id]`, `owner/trucks/[id]/maintenance`, `owner/trucks/[id]`,
`owner/trucks/[id]/scheduled-service`.

**Why stopping is correct.** Routing them changes what the statement returns on success from *the row*
to *null* — those eight routes would answer "not found" for their own tenant's data on every request.
Fixing the select also changes what the statement returns, and on `owner/loads/[id]:178` the selected
object **is** the response body. Leaving them alone changes nothing about them at all. Each remedy is
written up per site in `03-routing.md` §2a.

### 5b. The four plan-named deviation candidates — inspected, none needed a deviation

`fleet/messages/[recipientId]` (7 transactions) and `fleet/messages` (6): siblings, never nested, all
inside the `try` the first opens — one acquisition per handler is in scope, and tsc is the backstop.
`owner/loads/[id]` (4): stopped for §5a, not for this. **`owner/drivers/invite` (4): the plan's
Supabase Auth concern DOES NOT APPLY** — there is no `createUser` call in this route at all; it writes
a `DriverInvitation` and sends an email, and its four transactions were already independent, so no
atomicity was preserved or lost.

### 5c. EXEMPT_MODELS, named rather than discovered later

Exactly one operation in the routed set touches a `withTenantRLS`-exempt model:
`owner/drivers/invite` → `tx.tenant.findUnique({ where: { id: tenantId } })`. The Prisma filter does
not engage; isolation is the explicit predicate plus the table's policy. It is also why that one is
**not** a `findUnique` hazard — the post-hoc check only runs on non-exempt models.

### 5d. `prisma` kept in one file, deliberately

`support/ticket/route.ts` keeps the binding: its module-level `generateTicketNumber` reads
quick-616's sequence with `prisma.$queryRaw`, which has no tenant in hand and opens no transaction.
The only one of the 38.

### 5e. Three destructive applier defects, caught and turned into guards

1. `.includes('@bypass_rls reason:')` **deleted quick-616's entire 22-line `generateTicketNumber`
   header**, which quotes the annotation it replaced. Now matches the *annotation form* (a JSDoc line
   that **begins** `@bypass_rls reason:`). Same family as quick-600's `pool.on('connect'` check and
   quick-612's migration guard, both of which false-positived on the prose describing the invariant
   they protect.
2. A botched in-flight patch wrote the literal `undefined` into **all 13 driver files**, and **`tsc`
   reported nothing** — `fooundefined` is a valid identifier. The applier now asserts the emitted
   acquisition line is exactly right and that no literal `undefined` was introduced.
3. A post-edit BEFORE run of `617-mobile-inventory.ts` **silently rewrote `01-inventory.json` from
   47f/83s to 45f/80s**, destroying the pinned population *and* the hazard list both the applier and
   the harness read. BEFORE mode now refuses to overwrite without `--force`.

---

## 6. The tenant-predicate post-check — no `where` clause was removed

Counted with `grep -oE "\btenantId\b|\borgId\b"`, per file and per sub-surface, asserted by the
applier, which refuses to write a file whose count fell.

| sub-surface | BEFORE | AFTER |
|---|---:|---:|
| `driver/incidents` (Task 2) | 5 | 7 |
| `support` | 4 | 5 |
| `driver` | 60 | 62 |
| `owner` | 158 | 164 |
| **total** | **227** | **238** |

`after >= before` holds on **every file individually**. The `+11` is `auth.tenantId` mentions inside
the inserted comments; **no `where`, `data`, `select`, `include`, `orderBy` or `take` changed
anywhere.**

Absence claims carry positive controls in the same run (H-bis):

```
app.bypass_rls over the 39 ROUTED files  -> 0     app.bypass_rls over the 8 STOPPED files -> 16
getAdminDb in the source diff            -> 0     getTenantPrismaForOrg in the same diff  -> 113
```

---

## 7. The proof, and the click-through

**Proof** (`04-proof.md`): `bypass_rls_policy` dropped on all 18 tables the routed statements reach.
**Unscoped reads raise `TC001` on all 18** — not vacuous on an empty table, because the policy
expression is evaluated at scan setup — and **scoped reads raise on none**. Cross-tenant **PROVEN** on
4 (`Document`, `DriverIncident`, `Truck`, `User`) with `own > 0` paired with a non-empty foreign set;
**13 reported UNPROVEN BY NAME** (zero rows on staging on both sides), never counted as passes;
`Tenant` N/A. Restore verified by **sorted table list and byte-for-byte policy bodies** against
**production**, which was never written to. The `finally` proven by `--throw-after-drop` (exit 3,
restored); `process.kill` appears in no new code path. Fixtures `left 0`.

**Fact H resolved:** both recorded hashes reproduce and were never in conflict —
`sha256` over `public.X\n…` is quick-616's `0fa356b9…`, `md5` over **bare, comma-joined** names is the
orchestrator's `29498ef6e52f51dcc02461a1abbb84b0`. Found by trying fourteen normalisations, exactly
one of which matched. **Staging === production under every spelling.**

**Click-through** (`05-click-through.md`): `604-click-through.ts` passes 1+2 →
**66 entries · 60 pass · 0 fail · 6 not-reachable · 0 TC001** — identical to quick-616's 66/60/0/0,
entry for entry, with 0 TC001 in the correlated slices **and** 0 in the whole 24,181-byte log (two
independent measurements, plus a positive control of 98 `GET /` lines).

**But all 66 are session-cookie surfaces — not one touches `/api/mobile/*`.** So that is a regression
result and says nothing about the 67 statements routed. A new harness was built to close the gap
(`validateMobileToken` calls `admin.auth.getUser`, so the Bearer token is a Supabase access token,
obtained never forged). **It ran and all 28 routed mobile GET routes returned 401.** Cause measured,
not inferred: **`SUPABASE_SERVICE_ROLE_KEY` is absent from every env file on this machine** (positive
control confirms the grep works) while the token itself is **valid** (`GET /auth/v1/user` → 200 with
the right id and `app_metadata`). Every `/api/mobile/*` route 401s here, including quick-588's five.
The harness reported `fail`, never `pass`, and **nothing weaker was substituted**; its `TC001 = 0` is
explicitly worth nothing.

**Arming counter-assertion, four parts, all PASS** — the gate says `true` for the server's exact
inputs, `false` for the production ref, `false` for the flag off, the GUC reads back `"on"`, an
unscoped read **raises `TC001`** armed and is **silent** disarmed. The last pair is what shows the
raise is caused by the arming and not by the statement.

**92 prior-task evidence files byte-identical at open and close**; `git status` over all four
directories empty. `616-bypass-census.ts` was deliberately **not** re-run — it writes into quick-616's
evidence.

---

## 8. The gates

| gate | result |
|---|---|
| `tsc --noEmit` | **clean, PROVEN NOT BLIND** — probe injected into a file this task edited, reported as `TS2322` at line 163, then deleted; tree restored byte-for-byte |
| `npm run build` | **exit 0** |
| `audit:rls-policy-drift` | **CLEAN, exit 0** — 0 missing / 0 unexpected / **0 definition drift**, corpus hash == canonical hash, so the body layer genuinely ran (not exit 3). Target pinned and named: **`wyixpgunnjmzguhggocz` (staging)** |
| `vitest` (same reporter, after the last commit, clean tree) | 2129 / 2008 / 66 / 52, **26** failing files vs the baseline's 25 |

`only-in-before: []`. `only-in-after: ["wrapper-migration-countdown.test.ts"]` — **not a regression:**
the countdown artefact went stale because this task's routing made the number go **UP**, 475 → 530,
which is quick-610's finding in a new instance (the counter is blind to `set_config` sites, so the 67
most bypass-dependent statements contributed zero to the metric tracking the migration). Regenerated
per quick-610's rule, **never weakened**; the delta is attributed exactly — 39 newly-routed files, 55
units, `530 − 475 = 55`, `253 − 214 = 39`. The test now passes 11/11.

`driver-incident-report-persists.test.ts` is in the baseline failing set and belongs to Task 2's proof
file: **its status did not change in either direction.**

A method note: pinning the drift audit's target from a POSIX shell on Windows **corrupted the
connection string** (dotenv's banner spliced into the URL; `P2010 DatabaseNotReachable`) while the
banner still named the right project — a reader glancing at it would have believed the run.
`617-run-drift-on-staging.ts` sets `process.env` in-process instead.

---

## 9. THE BATCH-SIZE VERDICT — partly, and I would not repeat the owner commit

```
956fe987  driver/incidents   1 file   +18   −13
4f868357  support            1 file   +11    −2
ea5abef2  driver            13 files +155  −164
8816b2ef  owner             24 files +310  −348
─────────────────────────────────────────────────
combined source             39 files +494  −527   (net −33)
whole task                  66 files +12,770 −527
```

The per-sub-surface split was right and should be kept. `support` and `driver/incidents` are one file
each and genuinely reviewable; `driver` at 13 files is fine because the change is byte-identical in
shape thirteen times.

**The `owner` commit is 24 files / 658 changed lines and I do not think a human reviews that
honestly.** The failure mode is not missing a bad line — it is that after the sixth identical hunk a
reviewer stops reading and starts pattern-matching, which is exactly the state in which this task's
two real defects would have survived. Both were caught in the *small* batches: the deleted quick-616
header because the `support` commit was one file and I read its diff in full, and the 13-file
`undefined` because I grepped the emitted line rather than trusting `tsc`, **which reported nothing**.

**Recommendation for the four remaining surfaces:** cap a commit at **~10 files or ~250 changed lines,
whichever comes first**, splitting a sub-surface across several commits when it exceeds that — `owner`
would have been three commits of eight. The *task* boundary can stay at one surface; the *commit*
boundary is what needs to shrink. And carry this task's two applier guards forward, because they are
what actually caught the defects — not the review and not the type checker.

---

## 10. THE REMAINDER — MEASURED: 108, not 92

```
census live population (quick-616)   177
  − routed by quick-616               −2
  = live at quick-617 start          175
  − routed by quick-617              −67     <- 67, NOT 83
  = expected remaining               108
```

Measured repo-wide by `617-repo-remainder.ts` (same AST method as the census; it writes into *this*
task's evidence so quick-616's artefact is never overwritten): **108 statements in 48 files**, with a
floor, an array-form positive control and a two-half counter-assertion, all passing. Measured 108 vs
expected 108.

**The brief expected 92 and the difference is fully explained: 92 assumed all 83 would be routed; 16
were stopped, so `92 + 16 = 108`.**

| surface | files | statements | not a `getTenantPrismaForOrg` conversion |
|---|---:|---:|---|
| `LIB_SERVICES` | 15 | 44 | **6** (`BROKEN_POLICY` + `BOOTSTRAP`) — not a 15-file repeat of this task |
| `MOBILE_API` (residue) | 8 | 16 | 0 — all blocked on the `findUnique` decision |
| `API_V1` | 6 | 14 | **4** |
| `OWNER_PORTAL` | 4 | 7 | **5** |
| `DRIVER_PORTAL` | 4 | 6 | **3** |
| `API_DRIVER` | 2 | 6 | **5** |
| `API_CRON` | 1 | 4 | 0 |
| `API_AUTH` | 2 | 3 | 0 |
| `API_DRIVER_PAY` · `API_GPS` · `API_INTEGRATIONS` · `API_PUSH_TOKENS` · `API_TRACK` | 6 | 8 | 0 |
| **total** | **48** | **108** | |

### THE BYPASS DROP IS STILL BLOCKED

**108 executable `app.bypass_rls` statements remain across 48 files.** `bypass_rls_policy` cannot be
dropped and the `app_user` cutover stays blocked. This task removed 67 of 175 — 38 %, the largest
single reduction in the programme so far — and it is not the last one.

---

## 11. §7 DEFERRED — what this task declined, found, or could not do

**Declined, deliberately:**

1. **Audit columns stay NULL.** `userId` is omitted on all 39 files; 26 write operations across 14
   models would newly populate `createdById`/`updatedById` if it were passed. Populating them is a
   separate, deliberate task and is not small.

**Found and NOT fixed — outside this task's surface:**

2. **quick-588 began writing `carrier_expenses.created_by_id`/`updated_by_id` on a routing commit.**
   Confirmed from the schema and the call site; `carrier_expenses` is empty on staging, so the table
   cannot corroborate it either way.
3. **`findUnique` + a top-level `select` omitting `tenantId` — 24 LIVE call sites elsewhere in the
   repo**, receiver-resolved, including `(owner)/actions/loads.ts` ×7, `invoices.ts` ×2, `routes.ts`,
   `maintenance.ts`, `payroll.ts`, `(driver)/my-tickets/[id]/page.tsx`,
   `lib/email/send-fleet-message-notifications.ts`. The mechanism is measured on two models and is
   application-layer and model-agnostic, so the same shape is expected to behave identically — but
   *expected* is not *measured*, and **each site needs its own confirmation.** A file-level "does this
   file acquire a tenant client" flag is not good enough: the first version of that scan reported 28
   and was wrong, because `loads.ts` uses the bare client in some functions and shadows the name with
   `const prisma = await getTenantPrisma()` in others (quick-602's rule, new instrument).
   `apps/web/scripts/audit/617-finduniq-scan.ts` is committed for whoever takes it.

**Could not do, with the reason:**

4. **The 8 MOBILE_API files stopped here** — 16 statements. Needs a decision between adding
   `tenantId: true` to nine internal guard selects and switching `owner/loads/[id]:178` to
   `findFirst`. Per-site write-up in `03-routing.md` §2a.
5. **The mobile click-through could not get past the auth gate.** `SUPABASE_SERVICE_ROLE_KEY` is in no
   env file on this machine, so `createAdminClient()` is built with an undefined key and every
   `/api/mobile/*` route 401s. **Remedy is one line: `SUPABASE_SERVICE_ROLE_KEY` for
   `wyixpgunnjmzguhggocz` in `apps/web/.env.staging`** — the mobile analogue of the blocker quick-615
   reported and quick-616 closed. Until then no routed mobile route has been exercised over HTTP.
6. **13 of the 18 tables' cross-tenant cells are UNPROVEN** — zero rows on staging on both sides.
   Needs staging fixtures with their FK chains.

**Four remaining surfaces, sized in §10.** The next one should be `LIB_SERVICES` (15f/44s), noting
that 6 of its statements are `BROKEN_POLICY`/`BOOTSTRAP` members and are **not**
`getTenantPrismaForOrg` conversions.
