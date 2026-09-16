# quick-617 — Task 2: ONE file, proven end to end, BEFORE the other 46 were touched

File: `apps/web/src/app/api/mobile/driver/incidents/route.ts` — 2 statements, a **GET read**
(`driverIncident.findMany`, `where: { driverId, tenantId }`) and a **POST write**
(`driverIncident.create`), on a model that carries `tenantId` (so `withTenantRLS` injects and the DB
policy engages) **and** carries `createdById`/`updatedById` while the create supplies neither (so it
is the worked example for Rule 2). The inventory confirms all of that, so the plan's nominated file
stands.

---

## 1. FACT F MEASURED FIRST — is the session GUC visible inside a later `$transaction`?

`getTenantPrismaForOrg` sets `app.current_tenant_id` with `set_config(..., false)` — **session scope,
on the bare `prisma` client, as a single autocommit statement, before the extended client is
returned**. All 83 statements then run inside `tenantPrisma.$transaction(async tx => …)`. Nothing in
quick-588, 602, 610 or 616 measured that combination; quick-588 shipped the shape but its own comment
argues the swap was receiver-only *because its models are exempt*, so it never relied on the policy
seeing the GUC. MOBILE_API's models are the opposite.

Measured in a **cold process** (the GUC is session scope and the pool is `max: 1`, so the first
tenant-touching statement in a process leaves it set for everything after — quick-602/610). One child
process per cell. Staging, `app_user`, tripwire armed:

```
[db-target] project : wyixpgunnjmzguhggocz (staging)  host : aws-0-us-west-1.pooler.supabase.com:5432
            role : app_user.wyixpgunnjmzguhggocz  lane : GUC PROBE (app_user, tripwire armed)
            (credential MASKED, never printed)

  PASS  guc-visible  {"readBack":"b5623cdd-dc19-4900-b75d-0ecfcaf191b8",
                      "expected":"b5623cdd-dc19-4900-b75d-0ecfcaf191b8","role":"app_user"}
```

**OUTCOME 1 OF THREE: the GUC reads back the tenant id from inside the transaction and the query
returns own-tenant rows. THE PATTERN HOLDS.** Not outcome 2 (`''`/NULL + `TC001`, which would have
stopped the task and forced `tenantRawQuery`'s transaction-scoped shape onto 47 files) and not
outcome 3 (a *different* tenant id, which would have been a pool-leak finding more serious than the
task).

The probe runs the REAL `getTenantPrismaForOrg` imported from `src/lib/context/tenant-context`, not a
re-derivation of it — a probe that reimplements the acquisition is not measuring the acquisition.

---

## 2. THE EDIT — before and after, verbatim

### BEFORE (GET)

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

### AFTER (GET)

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

### BEFORE / AFTER (POST)

```diff
-    const incident = await prisma.$transaction(async (tx) => {
-      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
-
+    // quick-617: see the GET handler above for why getTenantPrismaForOrg and
+    // why userId is omitted. The create's `data` is unchanged.
+    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
+    const incident = await tenantPrisma.$transaction(async (tx) => {
       return tx.driverIncident.create({
         data: {
           tenantId,
```

`git diff --stat`: **1 file changed, 18 insertions(+), 13 deletions(-)**.

### THE PATTERN, STATED EXPLICITLY

| element | rule |
|---|---|
| **receiver** | `getTenantPrismaForOrg(tenantId)` — never `getTenantPrisma()` (no `x-tenant-id` on `/api/mobile/*`, DEC-11), never `getAdminDb` (every statement has a verified tenant in hand) |
| **second argument** | **OMITTED.** See 01-inventory.md §6 — passing it would newly populate audit columns on 26 of 30 writes |
| **where the acquisition goes** | AFTER `validateMobileToken`'s null check and AFTER the rate-limit early return, BEFORE the transaction. A tenant client is never acquired for an unauthenticated request. **Once per handler**, not once per transaction |
| **`where` clauses** | **KEPT, byte for byte.** Defence in depth alongside RLS. Nothing inside `where` / `data` / `select` / `include` / `orderBy` / `take` changes |
| **the bypass flag** | **DELETED IN THE SAME EDIT** (Rule 4). A file that acquires a tenant client and keeps the flag is strictly worse than either alone |
| **the `$transaction` wrapper** | **KEPT**, with `TX_OPTIONS` unchanged. Only the receiver changes and one line is removed. Collapsing a single-statement transaction into a bare call would be a second change and would alter failure semantics |
| **the `@bypass_rls` docblock** | **DELETED.** It documents a mechanism that no longer exists, and a comment asserting an invariant that has been removed is the exact class this repo has been bitten by three times (quick-547, 548, 562). Replaced by a short quick-617 block |

Mechanical checks on this file:

```
grep -c "app.bypass_rls"        -> 0
tenant-predicate occurrences    -> BEFORE 5, AFTER 7   (>= holds; the +2 is the comment naming auth.tenantId)
npx tsc --noEmit                -> exit 0
```

---

## 3. THE PROOF — staging, `app_user`, tripwire armed, `bypass_rls_policy` DROPPED

`npx tsx scripts/audit/617-routing-verify.ts --run --single-file`, exit 0:

```
[db-target] project : wyixpgunnjmzguhggocz (staging)  host : aws-0-us-west-1.pooler.supabase.com:5432
            role : postgres.wyixpgunnjmzguhggocz  lane : RUN  (credential MASKED, never printed)
bypass_rls_policy: 86 policies on 86 tables
captured DDL for all 86 → evidence/04-policy-capture.json
fixtures present: 2 (expect 2)
tables reached by routed statements : 1
  carrying bypass_rls_policy (DROP) : 1 — ["DriverIncident"]
  NOT carrying one (nothing to drop): 0 — []
DROPPED bypass_rls_policy ON public."DriverIncident"
bypass_rls_policy now: 85 (was 86)

  PASS  guc-visible            {"readBack":"b5623cdd-…","expected":"b5623cdd-…","role":"app_user"}
  PASS  unscoped-raises        {"raised":true,"sqlstate":"TC001"}
  PASS  own-read               {"own":1}
  PASS  foreign-read           {"foreignSeenByTenantA":0,"privilegedCounterRead":1}
  PASS  own-write-audit-null   {"id":"a52718ea-91a5-4b28-95d4-450e9fb8635f",
                                "createdById":null,"updatedById":null,"tenantId":"b5623cdd-…"}
  PASS  finduniq-select-hazard {"selectWithoutTenantId":null,
                                "selectWithTenantId":{"id":"617a…","tenantId":"b5623cdd-…"},
                                "noSelect":{"id":"617a…"},"privilegedCounterRead":1,
                                "hazardConfirmed":true}

RESTORE: re-created 1; live now 86
  sorted list identical : true
  only in before        : []
  only in after         : []
  body mismatches       : []
  VERDICT               : PASS
fixtures left: 0 (must be 0)
```

Reading the cells:

- **`own > 0` PAIRED with `foreign === 0` and a privileged counter-read of 1.** A foreign `0` over an
  empty foreign set proves nothing; the counter-read is what makes it mean something (quick-610).
- **The own-tenant WRITE succeeded and the row landed with `created_by_id` AND `updated_by_id` still
  NULL.** That is the positive evidence for Rule 2 — the routing did not smuggle in an audit-column
  write.
- **`unscoped-raises` is the arming proof**: an unscoped read on the same connection raised `TC001`,
  by SQLSTATE off `err.cause.code` and never by message prose. Zero `TC001` elsewhere is exactly what
  a *disarmed* tripwire looks like, so this cell is what makes the other zeros evidence.
- **The bypass policy was DROPPED on `DriverIncident` for the duration**, so none of this rests on
  the policy that the programme exists to remove.
- Each cell ran in its **own transaction** in its **own cold child process**. A `TC001` aborts its
  transaction and every later statement returns `25P02`, which would make one raise look like six.
- Counts are read as scalars, never `rowCount`.

### The `finally` is proven, and `process.kill` is nowhere

`--run --single-file --throw-after-drop` — a deliberate throw between the DROP and the probes:

```
DROPPED bypass_rls_policy ON public."DriverIncident"
bypass_rls_policy now: 85 (was 86)

!! --throw-after-drop: deliberate throw between the DROP and the probes, to prove the finally restores.
RESTORE: re-created 1; live now 86
  sorted list identical : true
  body mismatches       : []
  VERDICT               : PASS
fixtures left: 0 (must be 0)
EXIT=3
```

Exits non-zero **and** leaves staging restored. quick-616's SIGINT proof terminated unconditionally
on Windows — no handler, no `finally` — and left staging at 85 policies; that method is not used
here. What a `finally` cannot cover is covered by `preflightHeal()`, which runs in the **next**
process and refuses loudly if the live count is short and there is no capture file to heal from.

### Fact H resolved — BOTH recorded hashes reproduce, and staging === production

`--hashes`, reading `pg_policies` from staging and — read-only, one SELECT — from production:

```
staging      count 86   sha256           0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
                        md5              8d1d6cbda610a7e3a8f3a5582078b42c
                        sha256BareComma  4b1739327821b66b03d18bc6c3909ef7db3ca3311a888ed8142224b9772c446a
                        md5BareComma     29498ef6e52f51dcc02461a1abbb84b0
production   count 86   sha256           0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
                        md5              8d1d6cbda610a7e3a8f3a5582078b42c
                        sha256BareComma  4b1739327821b66b03d18bc6c3909ef7db3ca3311a888ed8142224b9772c446a
                        md5BareComma     29498ef6e52f51dcc02461a1abbb84b0
```

- **staging equals production under every spelling** — that is the claim that matters, and production
  is the right reference precisely because this task never wrote to it.
- `sha256` over `public.X\npublic.Y…` reproduces **quick-616's** recorded
  `0fa356b9…f8cd` exactly.
- `md5` over the **bare, comma-joined** names reproduces **the orchestrator's `.planning/STATE.md:966`**
  figure `29498ef6e52f51dcc02461a1abbb84b0` exactly.

So the two recorded figures were never in conflict: they are two algorithms over two spellings of one
list. The bare/comma normalisation was **found by trying fourteen** — full/bare, `\n`/`,`/`, `/JSON,
with and without a trailing newline, lowercased — of which **exactly one** matched, so it is a
reproduction and not a coincidence. The inherited harness computed sha256 only and could never have
printed the brief's figure; both are now computed and labelled by name inside the script, so no
future reader has to search for the normalisation.

---

## 4. The finding this file's probe also nailed down

`finduniq-select-hazard` is reported here because it was measured on the same connection in the same
run, but it is **not about this file** — `driver/incidents/route.ts` has no `findUnique`. See
`01-inventory.md` §7: `findUnique` + a top-level `select` omitting `tenantId` returns **null for its
own tenant** under `withTenantRLS`, confirmed on `DriverIncident` (a fixture) and on `Truck` (a
pre-existing row). Ten such statements across eight mobile files are **stopped and reported**, and 24
more live sites elsewhere in the repo are reported untouched.
