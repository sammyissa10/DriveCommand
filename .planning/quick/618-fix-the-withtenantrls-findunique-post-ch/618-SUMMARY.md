---
phase: quick-618
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, prisma-extensions, findUnique, mobile-api, extendedWhereUnique]
requires:
  - quick-617 (8 MOBILE_API files stopped on this defect; 108-statement remainder)
  - quick-610 (omit userId on a routing fix; countdown regenerated, never weakened)
  - quick-602 (per-identifier receiver resolution; tripwire armed by a session SET)
provides:
  - the findUnique tenant predicate moved from a post-check into the `where`
  - MOBILE_API fully routed — 0 app.bypass_rls statements across all 47 files
  - remainder 108 -> 92, reconciled exactly
affects:
  - apps/web/src/lib/db/extensions/tenant-rls.ts (+ the prototype, kept in step)
  - 8 route files under apps/web/src/app/api/mobile/
  - apps/web/scripts/audit/wrapper-countdown.json (530 -> 544, regenerated)
  - apps/web/tests/security/tenant-mechanism-fence.test.ts (allowlist +1)
tech-stack:
  added: []
  patterns: [extended-where-unique, two-mode-rls-probe, guarded-applier]
key-files:
  created:
    - apps/web/src/lib/db/extensions/__tests__/tenant-rls-finduniq-injection.test.ts
    - apps/web/scripts/audit/618-finduniq-census.ts
    - apps/web/scripts/audit/618-finduniq-probe.ts
    - apps/web/scripts/audit/618-preconditions.ts
    - apps/web/scripts/audit/618-where-shapes.ts
    - apps/web/scripts/audit/618-apply-routing.js
    - apps/web/scripts/audit/618-repo-remainder.ts
    - apps/web/scripts/audit/618-fixtures.ts
  modified:
    - apps/web/src/lib/db/extensions/tenant-rls.ts
    - apps/web/src/lib/db/extensions/tenant-rls-bound.prototype.ts
    - 8 route files under apps/web/src/app/api/mobile/
decisions:
  - "the predicate goes in the WHERE (extendedWhereUnique), not into the select"
  - "the post-check is kept but may only speak when the projection carries tenantId"
  - "adminDb sites are NOT_APPLICABLE, not latent — they never reach the extension"
metrics:
  hazard_sites_total: 56
  live_before: 27
  latent_before: 22
  not_applicable: 7
  statements_routed: 16
  repo_remainder: 92
  completed: 2026-09-16
---

# quick-618 — the `findUnique` post-check, fixed at the mechanism

**The premise that produced this defect was false, and two things in this repo already depended on
it being false. Moving the tenant predicate into the `where` fixes all 56 sites at once, unblocks
the 8 files quick-617 stopped, and makes MOBILE_API the first surface with zero `app.bypass_rls`.**

---

## 0. Baseline, captured from the working tree at task start

Commit `41acff63`, tree clean. **Not** inherited from quick-617's published figure — quick-561, 565
and 567 each published a baseline that was measuring something other than the tree they thought.

```
2129 tests   2010 passed   64 failed   52 pending   25 failing files
```

Staging preconditions, all four PASS (`evidence/02-preconditions.txt`):

```
current_user : app_user        rolbypassrls : false
flag before SET : null (a fresh backend carries nothing)    flag after SET : "on"
unscoped read  : {"raised":true,"sqlstate":"TC001"}
scoped read    : {"ok":true,"own":1}
disarmed read  : {"raised":false,"sqlstate":"none","rows":0}   <- the silent 0 the tripwire exists to catch
staging : 86 policies on 86 tables      expected 86 : PASS
sorted-list parity staging vs production : IDENTICAL
  staging sha256    : 315c31b0a8f53bac7d7813c3ce7ba35e94f71a02bd9f519cbda582c2f1d1548a
  production sha256 : 315c31b0a8f53bac7d7813c3ce7ba35e94f71a02bd9f519cbda582c2f1d1548a
```

The first run of that script reported `flag: null` and **no raise** — because it only READ the flag
and never armed it. Arming is a per-connection `SET` and there is no other mechanism (quick-602:
`ALTER ROLE` of a placeholder GUC is 42501 here and Supavisor drops connection-string `options`).
A probe that measures its own failure to arm is indistinguishable from a disarmed environment, so
the disarmed counter-read is now part of the check.

Production was opened **read-only, for `pg_policies` only**, and never written.

---

## 1. STEP 1 — the true count: **56**, not 34

`618-finduniq-census.ts`, AST over 1692 files, `EXEMPT_MODELS` lifted from the shipped extension
rather than restated.

| projection (TOP LEVEL) | count | carries `tenantId`? |
|---|---:|---|
| `NO_PROJECTION` — no select, no omit | 63 | yes — safe |
| `SELECT_HAS_TENANTID` | 6 | yes — safe |
| **`SELECT_OMITS_TENANTID`** | **56** | **no — HAZARD** |
| `OMIT_STRIPS_TENANTID` | 0 | — |
| `UNRESOLVABLE` (spread/computed) | 0 | — |
| **total on non-exempt models** | **125** | |

**Top-level or nested, answered precisely:** all 56 hazards omit `tenantId` at the TOP LEVEL, which
is the only level the post-check can see — a nested relation select cannot put a `tenantId` key on
the result object. `omit: { tenantId: true }` would strip it too and is measured at **0**
occurrences. `UNRESOLVABLE` is **0**, so nothing is unclassified.

### Reconciliation against the 10 + 24 already named

```
56 hazards = 27 LIVE + 22 LATENT + 7 NOT_APPLICABLE
prior tasks named 34 = 10 (MOBILE_API, latent) + 24 (live elsewhere)
this task adds   22 = 3 (live, MISSED) + 12 (latent, non-mobile) + 7 (admin, misclassifiable as latent)
```

**The 10 MOBILE_API sites match exactly, file for file and line for line.**

### The three prior tasks MISSED, and why

```
src/lib/notifications/digests/compliance-30day-payload.ts:79   User   recv=tenantPrisma
src/lib/notifications/digests/daily-driver-payload.ts:63       User   recv=tenantPrisma
src/lib/notifications/digests/weekly-owner-payload.ts:68       User   recv=tenantPrisma
```

All three receive the tenant client as a **function parameter** — the three cron digest routes each
call `buildXPayload(await getTenantPrismaForOrg(tenant.id), …)`. A scan that seeds receivers only
from local `const x = await getTenantPrisma*()` declarations sees a bare parameter and scores them
LATENT. They are LIVE. Closing that needed a one-hop inter-procedural pass (function name + argument
position), deliberately bounded: anything it cannot resolve stays `BARE_OR_UNKNOWN`, which
under-reports LIVE rather than inventing live defects.

### Two blind spots in quick-617's scanner, fixed and MEASURED

1. **it text-matched `tenantId` over the whole `select` initialiser**, so
   `select: { id: true, driver: { select: { tenantId: true } } }` scored SAFE though the top level
   omits it — a **false negative**. Measured on this tree: **0 sites** currently have that shape, so
   the blind spot cost nothing here. Reported as a measurement rather than left as a possibility.
2. **it never looked at `omit`.** Also 0 today.

### A CORRECTION to quick-617

That task's scanner header states `(owner)/actions/loads.ts:273` *"is on the BARE prisma client in a
file that also acquires a tenant client elsewhere"*, and uses it as the worked example for why
file-level resolution is wrong. **The example is wrong.** `loads.ts` contains **zero** imports from
`@/lib/db/prisma` — every `prisma` in it is a function-local `const prisma = await getTenantPrisma()`
shadow (lines 264, 367, 406, 511, 567, 750, 776) or the `generateLoadNumber(prisma, …)` parameter
those shadows are passed into. All eight `loads.ts` sites are **LIVE**. The *rule* quick-617 drew —
resolve per-identifier, never per-file — is right, and this task follows it; only its illustration
was not.

---

## 2. STEP 2 — live vs latent vs not-applicable

| class | before routing | after routing | meaning |
|---|---:|---:|---|
| **LIVE** — receiver is a `withTenantRLS` client today | **27** | 37 | the post-check ran here; a production defect independent of the migration |
| **LATENT** — bare client | **22** | 12 | would become affected the moment it is routed |
| **N/A** — `getAdminDb` | **7** | 7 | `app_admin` applies no tenant extension, so the post-check can never run |

The 7 admin sites are a **third** class, not latent. `getAdminDb` returns the `app_admin` connection
(quick-600), which carries no tenant extension and never will — routing an admin path onto a tenant
client would be the wrong fix, not a pending one. Counting them as latent would inflate the number
of sites this defect can still reach by a third.

The 10 MOBILE_API sites moved LATENT → LIVE when this task routed them, which is why LIVE rose to 37;
they are correct now, not broken, because the extension underneath them changed first.

**One LIVE site is worth naming on its own.** `(owner)/live-map/actions.ts:202` reads
`db.truck.findUnique({ where: { id: truckId, tenantId }, select: { make, model, year, licensePlate,
odometer } })` — it already passed `tenantId` in the where, and the post-check discarded the row
anyway because the select omits the column. That is the vehicle-detail read behind the live map's
`VehicleDetailSheet`. It is also **the in-repo proof that a `findUnique` where accepts a non-unique
scalar on this Prisma version**, sitting in application code the whole time.

---

## 3. STEP 3 — the fix, and the trade-offs, stated before building

The shipped extension said:

```ts
// findUnique/findUniqueOrThrow require unique-field-only where clauses,
// so we cannot add tenantId directly. Instead, run the query then verify
// the result belongs to this tenant.
```

**That sentence has been false since Prisma 5 made `extendedWhereUnique` GA** — `XWhereUniqueInput`
carries every scalar field and requires only that at least one unique identifier be present. This
repo is on Prisma **7.4.0**, and two things already depended on it:

- the same extension's `update` case does `a.where = { ...a.where, tenantId }` on a
  `WhereUniqueInput`, and ships;
- `(owner)/live-map/actions.ts:202` writes `findUnique({ where: { id, tenantId }, … })` by hand.

So: **option C — put the tenant predicate in the `where`, and keep the post-check as a second layer
that may only speak when the projection carries the column.**

| option | why not / why |
|---|---|
| **(a) force `tenantId` into the select, strip it after** | Correct, but the extension rewrites the caller's projection and then has to un-rewrite the result — and must REMEMBER whether the caller asked for the column, or the strip deletes a field they wanted. It also needs a special case for `omit`, which Prisma forbids alongside `select`. Option C needs no memory and touches no projection. |
| **(b) skip the post-check when the select omits `tenantId`** | Removes the only application-layer guard on exactly the queries the injection was believed unable to reach. **Bad only because of the false premise** — with the injection in place it removes nothing, which is why option C *contains* option (b) and is safe. |
| **(c) inject into the `where`** | The tenant predicate becomes real SQL. The caller's `select` is untouched, so the result shape is unchanged **by construction** rather than by a strip step. A cross-tenant row is refused by the database instead of being fetched into the process and then dropped — strictly stronger than what it replaces. |

### What it does when RLS is NOT in force — production's bare connection today

The injection is a **Prisma-level predicate compiled into the SQL**, so it is independent of the
GUC, of `app.bypass_rls`, and of whether the role carries `BYPASSRLS`. On production today — where
the post-check was the ONLY layer — cross-tenant is now refused by `WHERE tenant_id = $n` and
own-tenant rows come back. **Measured, not argued:** §4's `rls_not_in_force` mode sets
`app.bypass_rls = 'on'` so the database refuses nothing, with a control cell proving the bypass
actually engaged. Both directions hold there.

### The one behaviour change, stated

For a genuine cross-tenant `findUniqueOrThrow`, the error is now Prisma's `P2025` ("No record was
found") rather than the bespoke `Error('Tenant isolation violation: …')`. That is the same verdict
`findUnique` already gave (cross-tenant = not found). Nothing in `src/`, `tests/` or `scripts/`
catches that message — it appears only in the two extension files — and the post-check still throws
it if it ever sees a mismatched tenant, so the string has not left the codebase.

---

## 4. STEP 5 — the proof, quoted. Staging, `app_user`, tripwire armed

`618-finduniq-probe.ts` drives the **real** `withTenantRLS` and a **real** Prisma client. Matrix:
2 methods × 3 projections × own/cross × 2 RLS modes, plus a compound-unique cell = **26 cells**.
Every zero paired with a **privileged counter-read on a separate connection**; a control cell asserts
the bypass really engages so `rls_not_in_force` cannot silently become a second copy of the other.

### BEFORE — run against HEAD's extension, so the defect is reproduced rather than described

```
=== MODE: rls_in_force ===
  CONTROL — foreign row visible to the DATABASE on this connection: 0  (expect 0 — RLS is refusing it)
  PASS  findUnique         selectWithTenantId    own   -> row  keys=["id","make","tenantId"]
  PASS  findUnique         selectWithTenantId    cross -> null  counterRead=1
  FAIL  findUnique         selectWithoutTenantId own   -> null  keys=null expected=["id","make"]
  PASS  findUnique         selectWithoutTenantId cross -> null  counterRead=1
  PASS  findUniqueOrThrow  selectWithTenantId    own   -> row  keys=["id","make","tenantId"]
  PASS  findUniqueOrThrow  selectWithTenantId    cross -> throw:NotFound  counterRead=1
  FAIL  findUniqueOrThrow  selectWithoutTenantId own   -> throw:TenantIsolationViolation  expected=["id","make"]
  PASS  findUniqueOrThrow  selectWithoutTenantId cross -> throw:NotFound  counterRead=1

=== MODE: rls_not_in_force ===
  CONTROL — foreign row visible to the DATABASE on this connection: 1  (expect 1 — bypass is on, the DB refuses nothing)
  FAIL  findUnique         selectWithoutTenantId own   -> null
  FAIL  findUniqueOrThrow  selectWithoutTenantId own   -> throw:TenantIsolationViolation
  PASS  findUniqueOrThrow  selectWithTenantId    cross -> throw:TenantIsolationViolation  counterRead=1
  PASS  findUniqueOrThrow  selectWithoutTenantId cross -> throw:TenantIsolationViolation  counterRead=1

CELLS: 24   PASS: 20   FAIL: 4
```

Four failures, all of them `selectWithoutTenantId` + **own tenant**, in both modes. Note the two
`rls_not_in_force` cross cells: with the database refusing nothing, the **post-check** is what
raises — that is the layer being replaced, caught doing its job, on the queries where it worked.

### AFTER — the four cases, both methods, both modes

```
=== MODE: rls_in_force ===
  CONTROL — foreign row visible to the DATABASE on this connection: 0  (expect 0 — RLS is refusing it)
  PASS  findUnique         selectWithTenantId    own   -> row  keys=["id","make","tenantId"] expected=["id","make","tenantId"]
  PASS  findUnique         selectWithoutTenantId own   -> row  keys=["id","make"]            expected=["id","make"]
  PASS  findUnique         selectWithTenantId    cross -> null  counterRead=1
  PASS  findUnique         selectWithoutTenantId cross -> null  counterRead=1
  PASS  findUniqueOrThrow  selectWithTenantId    own   -> row  keys=["id","make","tenantId"] expected=["id","make","tenantId"]
  PASS  findUniqueOrThrow  selectWithoutTenantId own   -> row  keys=["id","make"]            expected=["id","make"]
  PASS  findUniqueOrThrow  selectWithTenantId    cross -> throw:NotFound  counterRead=1
  PASS  findUniqueOrThrow  selectWithoutTenantId cross -> throw:NotFound  counterRead=1
  PASS  findUnique         noSelect              own   -> row  (full 17-key row)
  PASS  findUnique         noSelect              cross -> null  counterRead=1
  PASS  findUniqueOrThrow  noSelect              own   -> row  (full 17-key row)
  PASS  findUniqueOrThrow  noSelect              cross -> throw:NotFound  counterRead=1
  PASS  COMPOUND_UNIQUE tenantId_triggerKey -> row  privilegedCounterRead=1  fixturesLeft=0

=== MODE: rls_not_in_force ===
  CONTROL — foreign row visible to the DATABASE on this connection: 1  (expect 1 — bypass is on, the DB refuses nothing)
  PASS  findUnique         selectWithTenantId    own   -> row  keys=["id","make","tenantId"] expected=["id","make","tenantId"]
  PASS  findUnique         selectWithoutTenantId own   -> row  keys=["id","make"]            expected=["id","make"]
  PASS  findUnique         selectWithTenantId    cross -> null  counterRead=1
  PASS  findUnique         selectWithoutTenantId cross -> null  counterRead=1
  PASS  findUniqueOrThrow  selectWithTenantId    own   -> row  keys=["id","make","tenantId"] expected=["id","make","tenantId"]
  PASS  findUniqueOrThrow  selectWithoutTenantId own   -> row  keys=["id","make"]            expected=["id","make"]
  PASS  findUniqueOrThrow  selectWithTenantId    cross -> throw:NotFound  counterRead=1
  PASS  findUniqueOrThrow  selectWithoutTenantId cross -> throw:NotFound  counterRead=1
  PASS  findUnique         noSelect              own   -> row  (full 17-key row)
  PASS  findUnique         noSelect              cross -> null  counterRead=1
  PASS  findUniqueOrThrow  noSelect              own   -> row  (full 17-key row)
  PASS  findUniqueOrThrow  noSelect              cross -> throw:NotFound  counterRead=1
  PASS  COMPOUND_UNIQUE tenantId_triggerKey -> row  privilegedCounterRead=1  fixturesLeft=0

CELLS: 26   PASS: 26   FAIL: 0
```

**Result shape unchanged, asserted not eyeballed:** `keys=["id","make"]` is compared for equality
against `expected=["id","make"]`. A fix that forced `tenantId` into the select and forgot to strip it
would produce `["id","make","tenantId"]` and **fail that cell** rather than pass it.

**Cross-tenant still refused, with the row proven to exist:** every `cross` cell carries
`counterRead=1` from a privileged connection. In `rls_not_in_force` the database returns everything
(control = 1), so the refusal there is the application layer's alone.

### The compound-unique cell — a shape this fix newly mutates

`618-where-shapes.ts` measured the real `where` population: **107 SINGLE_SCALAR · 15 MULTI_SCALAR ·
3 COMPOUND_UNIQUE · 0 NON_LITERAL**. The three compound sites (`TenantNotificationSettings` on
`tenantId_triggerKey` ×2 and `tenantId_triggerKey_userId`) matter *because of this fix*: the old code
never touched a findUnique's `where`; the new code spreads `tenantId` into it, so they now emit a
compound unique **plus** a top-level scalar. One is `dispatcher.ts:111`, on the path every
notification takes, and the other 24 cells — all `where: { id }` — said nothing about it.

`TenantNotificationSettings` is empty on staging, so reading a missing key would only have shown
Prisma did not throw. The cell creates one marker row on the privileged connection, reads it back
through the extension, and deletes it in a `finally`. **`-> row`, `counterRead=1`, `fixturesLeft=0`,
in both modes**, and staging independently re-checked afterwards: back to 0 rows.

---

## 5. STEP 6 — the ten deferred MOBILE_API statements, routed

All 8 files, 16 `app.bypass_rls` statements (of which the 10 findUnique hazards). Three commits,
each under the ~10-file / ~250-line cap quick-617 §9 asked for:

```
94641222  driver loads status + revert       2 files   54 changed lines
dd78d90c  owner loads + routes               3 files  148 changed lines
7fe47688  owner trucks                       3 files  191 changed lines
```

Pattern unchanged from quick-617: `getTenantPrismaForOrg(auth.tenantId)` **once per handler**,
`userId` omitted (quick-610 — audit columns that are NULL today stay NULL), `$transaction` and
`TX_OPTIONS` kept, the `@bypass_rls` docblock and its `set_config` deleted in the same edit, and
**every `where` / `select` / `include` byte-identical**. Neither remedy quick-617 proposed was
needed: with the predicate in the `where`, "add `tenantId: true` to nine selects" and "switch
`owner/loads/[id]:178` to `findFirst`" both became unnecessary, and the response body of that route
is untouched.

```
app.bypass_rls in the 8 routed files : 0 0 0 0 0 0 0 0
app.bypass_rls anywhere under api/mobile/ : 0 files
POSITIVE CONTROL — still present elsewhere in src : 51 files
```

### Remainder reconciled against 108

`618-repo-remainder.ts` — a copy of quick-617's script with the evidence path, counter-assertion
target and arithmetic changed and **nothing else**, so the two numbers are comparable rather than
merely similar. Running 617's unchanged would have overwritten its closed artefact (quick-610's
`--out` class).

```
repo-wide remainder: 92 statements in 40 files (tests: 5, excluded)
  LIB_SERVICES     15 files  44      API_CRON          1 file    4
  API_V1            6 files  14      API_AUTH          2 files   3
  OWNER_PORTAL      4 files   7      API_DRIVER_PAY/GPS/INTEGRATIONS/PUSH/TRACK  6 files  6
  DRIVER_PORTAL     4 files   6
  API_DRIVER        2 files   6
  PASS  FLOOR — total statements >= 50 — 92 >= 50
  PASS  POSITIVE CONTROL — lib/auth/supabase.ts still yields its ARRAY-FORM statement
  PASS  COUNTER-ASSERTION scheduled-service/route.ts WAS READ — bytes=14001 parsed=true acquiresTenantClient=true
  PASS  COUNTER-ASSERTION scheduled-service/route.ts YIELDS ZERO — 0 === 0
  PASS  ARITHMETIC — 108 − 16 = 92 — measured 92 vs expected 92
```

**MOBILE_API no longer appears in the surface table at all** — the first surface fully off
`app.bypass_rls`. The bypass drop is still blocked: 92 statements across 40 files remain.

---

## 6. STEP 7 — the 24 other live sites

**The fix closes all of them, and nothing site-specific remains.** It is in the extension, not at any
call site, so every site that reaches `withTenantRLS` is covered at once: the 24 quick-617 named, the
3 it missed, the 12 non-mobile latent sites when they are routed, and any future one.

Three things were checked rather than assumed before claiming that:

1. **Shape coverage.** The probe used `where: { id }`. `618-where-shapes.ts` measured the whole
   population and found one shape the probe did not cover — 3 COMPOUND_UNIQUE sites — which was then
   proven on staging with a real row (§4). `NON_LITERAL` is 0, so no site builds its `where`
   somewhere this could not see.
2. **Exempt models are untouched.** The switch is reached only for non-exempt models, so nothing
   changes for `Tenant`, the carrier `orgId` tables, or the grid models.
3. **Nothing depends on the old error string** — `Tenant isolation violation` appears in the two
   extension files and nowhere else in `src/`, `tests/` or `scripts/`.

**What still needs doing at those sites is NOT this defect:** the 12 latent ones remain on the bare
client and so still hold `app.bypass_rls` or run unscoped. Routing them is the remaining migration
work sized in §5 — this task removed the reason they could not be routed, not the work itself.

---

## 7. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | **clean, PROVEN NOT BLIND** — `const __probe618: number = "not a number"` injected into `tenant-rls.ts`, reported as `TS2322` at line 297, then deleted (`grep -c` 0). tsc also caught a real TS2304 scope bug in the applier's output, which is the only reason it was found. |
| `npm run build` | **exit 0** |
| vitest, same reporter, after the last commit | `2143 / 2024 / 64 / 52`, **25 failing files** |
| failing-file set vs the step-0 baseline | **`only-in-after: []` · `only-in-before: []`** — byte-identical |
| `618-repo-remainder` arithmetic | 92 measured vs 92 expected |

Test count rose 2129 → 2143: exactly the 14 tests in the new guard file. Failures stayed at 64 on
the same 25 files.

### Two guards went red on this task's own work, and both were RECORDED, not weakened

- **`wrapper-migration-countdown`** — routing eight files made the number go **UP**, 530 → 544 units
  and 253 → 261 files, because the counter recognises `getTenantPrisma*` acquisitions and is blind
  to the `app.bypass_rls` sites they replaced. quick-610's finding, second instance. Regenerated per
  that rule; delta attributed exactly — `only-in-after` = the 8 files this task routed, carrying
  1+1+1+2+2+2+2+3 = **14** units; `only-in-before` = 0; `changed-in-both` = 0.
- **`tenant-mechanism-fence`** — the new guard test matched because it READS
  `'src/lib/db/extensions/tenant-rls.ts'` off disk as a path string. It never imports or calls the
  function, so it is allowlisted with `calls: 0`. The fence is closed in both directions, so a new
  referencing file is *supposed* to fail until a human decides it belongs.

---

## 8. §7 DEFERRED — what this task found, declined, or could not do

**Found and FIXED as part of the work:**

1. The `findUnique` defect itself, at the mechanism — 56 sites.

**Found and NOT fixed, reported:**

2. **`(owner)/live-map/actions.ts:202` was a user-visible live defect** — the vehicle-detail read
   behind the live map's `VehicleDetailSheet` returned `null` for its own tenant. It is fixed by this
   task incidentally, along with the other 26 LIVE sites, but **no LIVE site was verified end-to-end
   over HTTP**; the proof is at the extension, on two models. A click-through of the owner portal
   would be worth its own pass.
3. **quick-617's scanner header mis-describes `loads.ts:273`** as being on the bare client. Corrected
   in §1 here; the header itself is left alone, in quick-617's closed evidence.
4. **The `tenant-mechanism-fence` corpus is `src/` + `tests/` and does NOT include `scripts/`**,
   where this task's probe genuinely imports and calls `withTenantRLS`. Left as-is deliberately —
   widening it would pull in audit harnesses whose whole job is to exercise mechanisms directly — but
   recorded in the file, so "closed fence" is not read as "no file anywhere references it".
5. **`apps/web/src/lib/docs/search-index.json` and `.docs-data/admin-docs-search-index.json` drift on
   every `npm run build`** and were reverted, exactly as quick-617 did. Unrelated to this task; the
   committed indexes are stale relative to what the build generates, and nobody owns it.
6. **The post-check is now structurally unreachable** — the `where` predicate means the database can
   never return a foreign row for it to catch. It is kept as defence in depth and pinned by the new
   guard, but it is dead code under normal operation, and that is stated rather than hidden.

**Could not do:**

7. **No `/api/mobile/*` route was exercised over HTTP.** `SUPABASE_SERVICE_ROLE_KEY` is absent from
   every env file on this machine, so `validateMobileToken` 401s on every mobile route — quick-617
   measured this and the blocker is unchanged. The eight routed files are covered by `tsc`, the
   build, the absence checks and the extension-level proof, **not** by a request.
8. **`Route` and `Load` have rows in only one staging tenant**, so the probe's cross-tenant cells
   used `Truck` and could not be repeated on those models. Same gap quick-617 reported as "13 tables
   UNPROVEN BY NAME"; the mechanism is application-layer and model-agnostic, but that is an argument,
   not a measurement.
