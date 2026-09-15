# Blast radius of the `withTenantContext` migration

**Date:** 2026-09-12
**Scope:** investigation only. No call site, extension, or `tenant-context.ts` changed. Migration not begun.
**Predecessors:** `docs/audits/guc-binding.md`, `docs/audits/guc-binding-fix.md` §3.3 and §6.
**Method:** TypeScript compiler API (`typescript` 5.9.3, already installed) over the 1,694 `.ts`/`.tsx`
files in `apps/web/src`, excluding `src/generated` and the unwired `tenant-rls-bound.prototype.ts`.
Every count below traces to a named enumeration, not an estimate. Staging was read for policy
metadata only; production was never touched.

---

## Correction to the inherited scope figure

Both predecessor audits carried "~90 `getTenantPrisma()` call sites". **That number is wrong** — 90 is
the count of `requireTenantId()` sites (93 exactly), which is a different function. The real figure:

| | count |
|---|---|
| `await getTenantPrisma(…)` occurrences | 369 |
| `await getTenantPrismaForOrg(…)` occurrences | 80 |
| **total call sites** | **449** |
| **units of work that acquire a tenant client** (the thing that migrates) | **456** across **198 files** |

456 exceeds 449 because a few functions acquire twice and the AST catches non-`await` forms a grep
misses. The migration unit is the *function*, so 456 is the number that matters.

Adding the 350 raw `$queryRaw`/`$executeRaw` occurrences across 134 files gives the "~224 files"
figure the brief cites; the union of both sets is **larger than either audit stated**.

---

## Summary table

| group | risk | units | files |
|---|---|---|---|
| **1** | **Nested transactions** — deadlock 6/6 under the wrapper | **108** | **69** |
| 1a | …direct, a grep would find | 44 | 36 |
| 1b | …**only via a call chain — a grep misses these** | **64** | **38** |
| **2** | **External I/O between the first and last DB op** — holds a connection | **8** | **6** |
| **3** | **Multi-write units** (>1 write in the unit) | **46** | **35** |
| 3a | …already inside a transaction, atomic today, no change | 32 | — |
| 3b | …gain atomicity | 14 | — |
| 3c | …**where atomicity is a behaviour CHANGE, not an improvement** | **5** | **5** |
| — | **Transaction-abort (25P02) sites** — the risk §6 did not name at all | **17** | **16** |

| migration group | meaning | units | files |
|---|---|---|---|
| **A** | move first, no restructuring | **336** | **154** |
| **B** | remove or hoist an inner transaction first | **98** | **65** |
| **C** | restructure before moving, or do not move in current shape | **22** | **20** |
| | | 336+98+22 = 456 ✓ | |

---

## 1. Nested transactions — 108 units / 69 files

A unit that opens a transaction inside `withTenantContext` deadlocks: `guc-binding-fix.md` §4
measured that shape at 6/6 P2028 at `max: 1`.

### 1a. Direct — 44 units / 36 files

Of these, **33 open the transaction on the tenant client itself** (`const prisma = await
getTenantPrisma(); prisma.$transaction(...)`) and **11 on the bare imported client**. The distinction
decides the fix: a tenant-client transaction is simply *deleted* (the wrapper already provides one),
whereas a bare-client transaction is the §4a shape from the previous audit and must be hoisted.

Counting this correctly required care: `const prisma = await getTenantPrisma()` **shadows** the
imported bare client in 11 files, so a naive grep for `prisma.$transaction` misclassifies them.

The 11 **bare**-client sites — the ones that need real restructuring:

```
src/app/(owner)/carrier/stops/[id]/page.tsx:61          StopDetailPage
src/app/(owner)/carrier/trips/[id]/page.tsx:27          DispatchDetailPage
src/app/(owner)/carrier/trips/[id]/stops/page.tsx:60    StopsOverviewPage
src/app/api/auth/accept-invitation/route.ts:84          POST
src/app/api/driver/gps-ping/route.ts:18                 POST
src/lib/carrier/fleet-drivers.ts:372                    deleteCarrierDriver
src/lib/driver-pay/require-driver.ts:59                 requireDriverContext
src/server/api/routers/workflows/instance.ts:85         (anon)
src/server/api/routers/workflows/playbook.ts:112        (anon)
src/server/services/workflows/generatePlaybookInstance.ts:18  generatePlaybookInstance
src/server/services/workflows/playbookStepService.ts:12 reorderPlaybookSteps
```

The remaining 33 tenant-client sites span `src/actions/carrier/soft-delete.ts`,
`(driver)/actions/{driver-dashboard,driver-load,driver-routes}.ts`,
`(owner)/actions/{driver-compensation-templates,expense-templates,invoices,loads,routes}.ts`, the six
`api/driver-pay/**` routes, four `api/mobile/carrier/driver/**` routes, both `stops/[id]/messages`
routes, `lib/carrier/{clients,dispatch-generator,trips}.ts` and
`lib/document-import/commit-service.ts`.

### 1b. Reachable only through a call chain — 64 units / 38 files

**This is the group the brief asked to be flagged, and it is larger than the visible one.** These
units contain no `$transaction` themselves; they call a helper that opens one. A grep over call sites
finds none of them. Resolved by transitive call-graph search over the whole `src` tree, then each
resolver verified by reading its source:

| resolver (all verified to open a transaction) | units | its own transaction |
|---|---|---|
| `resolveSenderConfig()` `lib/email/sender-config.ts:132` | 14 | `prisma.$transaction(async tx =>` |
| `sendPushToUser()` `lib/notifications/send-push.ts:26` | 13 | `prisma.$transaction(async tx =>` |
| `getCurrentUser()` `lib/auth/supabase.ts:146` | 9 | `prisma.$transaction([` |
| `recordActivationEvent()` `lib/onboarding/activation-tracker.ts:47` | 5 | `prisma.$transaction(async tx =>` |
| `sendInstanceBlocked()` `server/services/workflows/notifications.ts:315` | 5 | `prisma.$transaction(async tx =>` |
| `saveRouteTemplateCore()` `lib/carrier/route-template-save.ts:351` | 4 | `db.$transaction(async tx =>` |
| `generatePlaybookInstance()` | 3 | |
| `getTicketById()`, `persistStops()`, `loadStepInstance()` | 2 each | |
| `getCarrierTruckDiagnostics()`, `generateSettlementForDriver()`, `seedDefaultTypes()`, `writeAuditLog()`, `reorderPlaybookSteps()` | 1 each | |

**`getCurrentUser()` is the dangerous one.** It is a generic auth helper in `lib/auth/supabase.ts`
that happens to use an array `$transaction`, and it is called from all over the app. Nine units reach
a transaction *through it alone*, and the BFS attributes each unit to the first resolver it finds, so
the true number of units that touch `getCurrentUser` is higher. Fixing that single function — it does
not need a transaction — removes a whole class of deadlock from the migration.

**Method limits, stated:** resolution is by function *name* over a global index, so a name shared by
two functions can mis-attribute. Builtin method names (`bind`, `map`, `then`, …) are excluded — an
earlier run attributed 5 units through a local `bind`, which was a false positive and is excluded
here. The 16 resolvers above were each opened and confirmed. The direction of remaining error is
*under*-counting: a transaction reached through a dynamically-dispatched or renamed import is invisible
to this method.

---

## 2. External I/O inside the unit — 8 units / 6 files

The test is the brief's: does a network or filesystem operation sit **between the first and last
database operation** of the unit. 25 units contain external I/O at all; in 17 of them the I/O sits
outside the DB span and the unit can move as-is.

**Calls deferred with Next's `after()` are excluded**, and that exclusion is load-bearing: an earlier
pass counted 10 units, and `transitionTripStatus` and `sendTripChangeNotification` were both in it
purely because of `after(() => sendPushToUser(...))`, which runs after the response and never holds
the unit's connection.

| unit | DB span | operation held |
|---|---|---|
| `api/auth/accept-invitation/route.ts:84 POST` | 122–267 | Supabase admin (user creation) |
| `api/driver-pay/settlements/[settlementId]/finalize/route.ts:22 POST` | 45–187 | R2/S3 command |
| `api/driver/stops/[stopId]/documents/route.ts:37 POST` | 120–177 | `fetch()` |
| `api/mobile/carrier/driver/stops/[stopId]/documents/route.ts:39 POST` | 113–158 | `fetch()` |
| `lib/carrier/documents.ts:33 uploadDocument` | 62–171 | Supabase Storage upload |
| `lib/carrier/documents.ts:276 deleteDocument` | 281–319 | Supabase Storage delete |
| `lib/carrier/notifications.ts:77 sendDispatchAssignedNotification` | 93–196 | email (SMTP/Resend) |
| `lib/carrier/notifications.ts:347 sendStopCompletedNotification` | 364–458 | email (SMTP/Resend) |

At `max: 1` each of these would hold the worker's only database connection for the duration of an
upload or an SMTP round trip. The two document-upload routes and `uploadDocument` are the worst: a
large file upload is unbounded in a way an email is not.

**Method limit:** detection is by call-name pattern (an explicit list of R2/S3, Supabase, email, push,
OSRM, geocoding, LLM, SMS and bare `fetch` shapes). An I/O call behind an unrecognised wrapper name is
missed, so this is a floor.

---

## 3. Multi-write units — 46 units / 35 files, of which 5 change behaviour

Write-count distribution across all 456 units (writes inside `after()` excluded):

| writes | 0 | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|---|
| units | 251 | 159 | 25 | 12 | 3 | 3 | 3 |

46 units perform more than one write. **32 of them are already inside a transaction** (group 1), so
they are atomic today and atomicity is not a change. **14 genuinely gain atomicity.**

### The question is narrower than "does it have multiple writes"

A first pass flagged 11 units on the heuristic "a swallowing `try/catch` follows the first write".
That heuristic is wrong, and the reason is worth recording: **a swallowed error does not roll back a
transaction.** If the `catch` logs and returns, the transaction still commits, so behaviour is
unchanged. Atomicity only changes observable behaviour when a later step can throw *out of* the
callback while earlier writes have already been issued.

But investigating that surfaced a sharper and previously unnamed risk, which is the real answer here.

### The transaction-abort risk — 17 sites / 16 files (not in §6 at all)

**PostgreSQL aborts the entire transaction on any statement error.** Today
`try { await db.x.create(...) } catch { logger.error(...) }` is harmless: the statement autocommits,
the error is logged, execution continues. Inside one transaction the failed statement puts the
transaction in an aborted state, and **every subsequent statement fails with 25P02** until rollback.
Prisma does not wrap individual statements in savepoints.

Enumerated: 170 `try/catch` blocks inside a tenant unit contain a DB operation and do not rethrow. Of
those, **76 are terminal** — the catch returns and no DB work follows, so a rollback produces the same
user-visible error and behaviour is unchanged. **17 continue to further DB work** and are the real
risk:

**Swallowed WRITE, then more DB work — 3 sites:**

```
src/lib/carrier/fleet-drivers.ts:276-292   createCarrierDriver()
    swallows carrierDriver.update  ("Non-fatal — driver record still valid, can be linked later")
    then 3 more db ops from line 321
src/lib/carrier/inspection-service.ts:703-731  overrideInspection()
    swallows trip.update + dispatchOverrideAudit.create,  then 3 more db ops from line 748
src/lib/carrier/trips.ts:786-939           transitionTripStatus()
    swallows trip.create + carrierStop.create ("auto-generate next dispatch failed")
    then 3 more db ops from line 969
```

`createCarrierDriver` is the clearest case and was read line by line to confirm. Today: linking an
existing user fails, the comment says the driver record stays valid, and the invitation is still
created. Under one transaction: the failed `update` aborts the transaction, the invitation insert
fails with 25P02, and the commit rolls back **the driver row itself** — a driver the owner was told
was created does not exist. That is a behaviour change *and* a data-loss bug, and the source comment
asserts the opposite invariant.

**Swallowed READ, then more DB work — 14 sites:** `team-permissions.ts:152`,
`carrier/fleet/drivers/[id]/compensation/page.tsx:21`, `crm/[id]/page.tsx:39`, `crm/page.tsx:19`,
`invoices/[id]/edit/page.tsx:18`, `invoices/[id]/page.tsx:52`, `invoices/new/page.tsx:20`,
`loads/[id]/page.tsx:44`, `loads/page.tsx:18`, `payroll/[id]/edit/page.tsx:18`,
`driver-pay/settlements/[settlementId]/finalize/route.ts:74`, `driver/gps-ping/route.ts:67`,
`lib/carrier/documents.ts:101`, `lib/carrier/trips.ts:720`. Ten are page-level
`try { …queries… } catch { /* render empty */ }` followed by another query. Lower severity — the
second query is usually also guarded, so the page still renders — but the fallback stops being a
fallback: once the transaction is aborted, *everything* after it fails, so "render partial" silently
becomes "render empty".

### Named answer to step 3

**The 5 multi-write units where atomicity changes observable behaviour rather than improving it:**

| unit | writes | why it is a change |
|---|---|---|
| `lib/carrier/fleet-drivers.ts:223 createCarrierDriver` | 4 | user-link failure is documented as non-fatal; under a transaction it destroys the driver row |
| `lib/carrier/trips.ts:640 transitionTripStatus` | 5 | "auto-generate next dispatch failed" is a swallowed, expected failure; under a transaction it rolls back the status transition that already succeeded |
| `lib/carrier/inspection-service.ts:674 overrideInspection` | 2 | the override audit write is guarded; under a transaction a failure there rolls back the override itself, and the trip stays blocked |
| `app/(owner)/actions/team-permissions.ts:120 inviteTeamMember` | 2 | tenant lookup after the invitation write is guarded as `/* non-critical */`; abort makes it critical |
| `api/driver-pay/settlements/[settlementId]/finalize/route.ts:22 POST` | 2 | guarded read after the finalize write, and it also holds an R2 call inside the DB span |

**The other 41 multi-write units are cases where atomicity is an improvement** — 32 already atomic, 9
gaining it with terminal error handling. Examples in the improving set: `routes.ts:218 updateRoute`
(6 writes: route update, stop delete + recreate, driver delete + recreate — a partial failure today
leaves a route with no stops), `settlements/[id]/void/route.ts` (5 writes),
`soft-delete.ts softDeleteRecords` (3 writes).

---

## 4. Migration order

Groups are disjoint and total 456. Precedence is C over B over A: a unit with both an inner
transaction and an abort risk is in C, because the abort risk must be fixed before the transaction
matters.

### Group A — move first, no restructuring: 336 units / 154 files

No transaction, no held I/O, no abort risk. Mechanical change: wrap the body, use the callback's
client. These carry the bulk of the value and can go in batches by directory.

### Group B — remove or hoist the inner transaction first: 98 units / 65 files

Two sub-cases with different work:

- **Tenant-client `$transaction` (the majority)** — delete the inner transaction and let the wrapper's
  own transaction cover the body. Nearly mechanical, but each one must be checked for a `tx` variable
  that is then passed around.
- **Bare-client `$transaction`, and the 64 call-chain cases** — the transaction is somewhere else.
  Fix the *helper*, not the caller: removing the array `$transaction` from `getCurrentUser()` and the
  interactive ones from `resolveSenderConfig()`, `sendPushToUser()`, `recordActivationEvent()` and
  `sendInstanceBlocked()` clears **46 of the 64** call-chain units in five edits. **Do this before
  anything else in the migration** — it is the highest-leverage work in the whole plan.

### Group C — restructure before moving, or do not move in current shape: 22 units / 20 files

All 22, with reason (2 units carry both):

```
holds I/O                     accept-invitation POST · driver/stops/[stopId]/documents POST
                              mobile/.../stops/[stopId]/documents POST · documents.ts deleteDocument
                              notifications.ts sendDispatchAssignedNotification
                              notifications.ts sendStopCompletedNotification
holds I/O + tx-abort risk     driver-pay/settlements/[id]/finalize POST · documents.ts uploadDocument
tx-abort risk                 team-permissions inviteTeamMember · fleet-drivers createCarrierDriver
                              inspection-service overrideInspection · trips transitionTripStatus
                              driver/gps-ping POST · compensation/page · crm/page · crm/[id]/page
                              invoices/new · invoices/[id] · invoices/[id]/edit
                              loads/page · loads/[id] · payroll/[id]/edit
```

Prescriptions: the I/O units split into "read → close → upload → reopen" (the two document routes and
`uploadDocument` should presign, upload outside the context, then record the key in a second short
context); the two `notifications.ts` senders should move their email send to `after()`, which the
codebase already uses for exactly this and which the analysis already treats as outside the unit. The
ten page-level abort-risk units are the cheapest — replacing `catch { /* render empty */ }` with a
narrower guard, or accepting whole-page failure, is a small edit each.

**`createCarrierDriver`, `transitionTripStatus` and `overrideInspection` should not move in their
current shape at all.** Their swallowed writes encode a deliberate partial-success contract that a
transaction cannot express; each needs its optional work moved out of the unit before it can migrate.

---

## 5. Can the all-or-nothing cutover be relaxed?

> **BUILT 2026-09-15 (quick-602).** This section is a design; the built version, with every number
> re-measured and the three things this section assumed now measured rather than reasoned about, is
> **`docs/audits/unmigrated-path-tripwire.md`**. Three of this section's premises turned out to be
> false and are corrected below and there: the policy counts, the "must stay inline" pair, and — the
> one that changes how the signal is operated — **`ALTER ROLE app_user SET app.tenant_context_tripwire`
> is REFUSED on this Supabase instance (42501), so the flag is armed by a session-level `SET`.**

**Yes.** There is a single, already-central place to put a loud signal.

### The mechanism

Every RLS policy that consults the tenant GUC does so through one SQL function, and today that
function is exactly what makes the failure silent:

```sql
CREATE OR REPLACE FUNCTION current_tenant_id() RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;
```

An unset GUC returns **NULL**, the policy predicate `"tenantId" = NULL` evaluates to unknown, the row
is filtered, and the caller gets an empty result with no error. Replacing the body with a `RAISE
EXCEPTION` when the setting is null or empty converts every unmigrated read from a silent empty into
a loud, attributable database error — one function, no application change, and it cannot be
forgotten at a call site because it lives below all of them.

Measured on staging, this covers most but not all of the surface:

| policies on staging | ~~count (2026-09-12)~~ | **count (2026-09-15, quick-602)** |
|---|---|---|
| total | 183 | **183** |
| route through `current_tenant_id()` — **covered by the signal** | ~~87~~ | **91** (**93** after quick-602's migration) |
| `app.bypass_rls` policies (deliberately unaffected) | 86 | **86** |
| **inline `current_setting('app.current_tenant_id')` — would NOT signal** | ~~5~~ | **2** (**0** after quick-602's migration) |
| neither mechanism | ~~5~~ | **4** |

> **CORRECTION 2026-09-15 (quick-602).** The 87/5/86/5 row above was three migrations stale and is
> struck through. Re-measured on BOTH databases: **91 / 2 / 86 / 4 = 183**, with an empty policy-name
> set difference in both directions. The move is derived per policy from the SQL of
> `20260913120000`, `20260914120000` and `20260914160000` in
> `docs/audits/unmigrated-path-tripwire.md` §1.

~~The 5 inline policies are the precondition, and two of them must stay inline:~~

- ~~`Tag.tenant_isolation_policy`, `TagAssignment.tenant_isolation_policy`, `audit_log.tenant_isolation_policy`
  — ordinary tenant isolation; rewrite to call the function.~~
- ~~`SysAdminInvoice.sysadmin_invoices_deny_tenant_users`, `SysAdminInvoiceItem…` — **deliberately
  inverted**: they *pass* when the GUC is null or empty. Rewriting them to call a raising function
  would break sysadmin access. Leave them inline.~~

> **CORRECTION 2026-09-15 (quick-602).** The precondition is now exactly **TWO** policies, and there
> is **no "must stay inline" residue at all**:
>
> - `audit_log.tenant_isolation_policy` already moved in quick-597.
> - **The two `SysAdminInvoice*` deny policies NO LONGER EXIST** — quick-597 DROPPED them
>   (`20260913120000_rls_policy_satisfiability_fixes`, §3). The sentence saying they must stay inline
>   describes objects that are gone.
> - `Tag.tenant_isolation_policy` and `TagAssignment.tenant_isolation_policy` were rewritten by
>   quick-602 (`20260914180000_tenant_context_tripwire`) under their original names, with the
>   before/after row-count matrix in `unmigrated-path-tripwire.md` §2 and §4.

### How to run the partial migration

1. ~~Fix the 3 Tag/audit_log policies to route through the function.~~ **DONE (quick-602): the TWO
   remaining policies — `Tag` and `TagAssignment` — were rewritten; `audit_log` had already moved in
   quick-597. Zero policies now read the GUC inline.**
2. Deploy the raising `current_tenant_id()` **to staging and preview only**, gated on an environment
   check so production keeps the NULL-returning body. During a partial migration the signal must be a
   500 you can see, not a 500 your customers see.
3. Point staging's `DATABASE_URL` at `app_user` (the role now has a password and a recorded
   connection string, per `guc-binding-fix.md` §7). Every unmigrated path fails loudly and by name.
   **quick-602 discharged this PER PROCESS rather than by a standing configuration change**: the
   execution sweep and the HTTP pass each pointed one process at staging-as-`app_user` and reported
   24 entry points by name. Staging's standing `DATABASE_URL` is unchanged.
4. Add a CI countdown: a static check that fails on any `getTenantPrisma`/`getTenantPrismaForOrg`
   outside a `withTenantContext` callback. It gives an exact remaining count per commit and, unlike
   the runtime signal, catches paths no test exercises.
5. Cut production over only when the CI count reaches zero.

The static gate alone is not sufficient — it cannot see a transaction reached through a call chain,
which §1b shows is the majority of the deadlock risk. The runtime signal alone is not sufficient
either — it only fires on paths that get exercised, and the previous audit's inventory of silently
swallowed cron and `after()` paths shows how many are not. **Together they relax the constraint;
either alone leaves the cutover all-or-nothing in practice.**

### One caveat worth naming

Three `in_app_notifications` policies use `auth.jwt() ->> 'org_id'`, a claim this codebase does not
put in the JWT (the same defect `project_rls_carrier_tables_jwt_fix` recorded for other carrier
tables). Those policies are already broken independently of this migration and will not be fixed by
any signal placed in `current_tenant_id()`.

---

## Reproduction

Analysis scripts are in the session scratchpad, not committed: an AST pass over `apps/web/src`
building per-unit facts (`analyze.mjs`), the group enumerations (`report.mjs`), the swallowed-DB-error
pass (`swallowed-db.mjs`), and the consolidation (`final.mjs`). Two corrections were applied after
verification and both changed the numbers materially: excluding `after()`-deferred calls (group 2:
10 → 8) and excluding builtin method names from call-graph resolution (group 1b: 69 → 64). One
intermediate result was discarded as vacuous — a patch that failed to apply left a comparison against
`undefined`, which reported "0 continuing sites" for what turned out to be 17.
