---
phase: quick-619
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, bypass_rls, lib-services, tenant-context, click-through]
requires:
  - quick-616 census (LIB_SERVICES 15f/44s; 38 TENANT_KNOWN_UNSCOPED, 5 BROKEN_POLICY, 1 BOOTSTRAP)
  - quick-617 pattern (getTenantPrismaForOrg, userId omitted, where clauses kept)
  - quick-618 fix (findUnique tenant predicate in the where)
provides:
  - 33 of 44 LIB_SERVICES statements routed; 11 stopped and reported with reasons
  - the first authenticated run of the mobile click-through
  - two recorded policy claims corrected by measurement
affects:
  - 11 source files under apps/web/src/{actions,lib,server}
  - apps/web/scripts/audit/wrapper-countdown.json (544 -> 561, regenerated)
decisions:
  - "security/audit-log.ts and send-push sendPushToOrg ROUTED — pg_policies contradicts their headers and the census"
  - "support-tickets STOPPED — production holds 7 null-tenant tickets the policy can never admit"
  - "require-driver withBypassRls STOPPED — its queries are defined on the API_DRIVER_PAY surface"
metrics:
  statements_routed: 33
  statements_stopped: 11
  repo_remainder: 59
  completed: 2026-09-16
---

# quick-619 — LIB_SERVICES routed: 33 of 44, and 11 stopped for reasons the data supports

## 0. Preconditions and baseline

**Baseline, from the working tree at `d456c08b`, before any edit:**
`2143 tests · 2023 passed · 65 failed · 52 pending · 26 failing files`.
One file more than quick-618 closed on, identified rather than inherited: `transaction-abort-sites.test.ts`
failed on a timeout (its heaviest test takes 3.9 s alone) and **passes in isolation** — a load flake on a
tree identical to 618's close.

**Staging** (`00-preconditions.txt`), all PASS: `current_user app_user`, `rolbypassrls false`; tripwire
armed → unscoped read raises **TC001**, scoped read succeeds, disarmed read is a silent `rows: 0`;
`bypass_rls_policy` **86 on 86 tables**, sorted list **identical to production** (sha256 `315c31b0…`).

**The mobile click-through ran — the first authenticated run in this programme — before any edit.**
It needed one fix first: quick-617's launcher builds the child env from `process.env` plus named staging
values and **never forwarded `SUPABASE_SERVICE_ROLE_KEY`**, so adding the key to `.env.staging` alone
would still have 401'd every route. `619-start-staging-server.js` forwards it only after checking the
JWT's `ref` claim is staging and its `role` is `service_role`; the value is never printed.

Pre-edit mobile result: **30 entries · 24 pass · 5 fail · 0 not-reachable · 0 TC001**, auth control 401.

---

## 1. Step 1 — 44 statements, nothing moved

All 44 `file:line` pairs are identical to quick-616's census. The only commit touching these files since
is `2f92a25a` (616's own sequence fix), which predates the regenerated census. **44 of the 92 remaining.**

## 2. Step 2 — tenant source, reported before any edit (`evidence/02-tenant-source.md`)

| tenant source | statements |
|---|---:|
| caller's session (server action / tRPC `ctx.tenantId` / Bearer session) | 14 |
| function parameter | 24 |
| job payload (`event.tenantId`) | 1 |
| **nowhere** | **5** |

### Two recorded claims the live policies contradict

Read from `pg_policies` on **both** databases (`02-policies.txt`), byte-identical:

1. **`send-push.ts`'s header (quick-596)** said `PushToken`'s policy is
   `"userId"::text = current_setting('app.current_user_id', true)` and *"can never pass"*. **Live:**
   `tenant_isolation_policy USING ("tenantId" = current_tenant_id())`. So `sendPushToOrg`, which holds the
   tenant, routes. `sendPushToUser` still cannot — for lack of a tenant, not for the reason given.
2. **`security/audit-log.ts`** was classed BROKEN_POLICY by quick-616 for `audit_log`'s cast, and its
   header says quick-599's policy split is *"on staging only; production PENDING"*. **Live on both:**
   `audit_log_append_policy INSERT WITH CHECK (true)` + own-tenant SELECT, no cast. It routes.

Both headers are corrected in the edits that route them.

### Decision: 33 route, 11 stop

| stopped | stmts | reason |
|---|---:|---|
| `actions/support-tickets.ts` | 4 | **BROKEN_POLICY, confirmed with data.** `SupportTicket.tenantId` is nullable; the only policy is `USING ("tenantId" = current_tenant_id())`. **Production: 88 tickets, 7 with a null tenant** (staging 0/0). `getMyTickets` filters on `submittedBy` alone, so routing would silently hide those 7 from the people who filed them. Needs a data decision, then DDL. |
| `lib/auth/supabase.ts` `getCurrentUser` | 1 | **BOOTSTRAP** — reads the user to *learn* the tenant. |
| `lib/driver-pay/require-driver.ts` `withBypassRls` | 1 | **Deviation.** A helper handed to six `api/driver-pay/me/**` handlers, which supply the callbacks. Routing it changes queries defined on `API_DRIVER_PAY`, a surface this task must not touch. |
| `lib/notifications/audit-log.ts` `writeAuditLog` | 1 | **Deviation.** Takes a caller's client and an array whose rows each carry their own `tenantId`; one tenant is not guaranteed by the signature. |
| `lib/notifications/send-push.ts` `sendPushToUser` | 2 | **No tenant** — `userId` only. |
| `server/services/workflows/notifications.ts` `getUserName`, `loadStepInstance` | 2 | **No tenant** — `(userId)` / `(stepInstanceId)` only. Every caller of the second holds one; threading it is mechanical but forbidden by the brief. |

## 3. Step 3 — every findUnique in the 15 files (`evidence/03-finduniq.md`)

10 calls. **The 3 hazards this task makes live all reach quick-618's fix**: `activation-tracker.ts:74/:96`
(`where: { tenantId }` — the unique key *is* `tenantId`, a where-shape 618's probe never exercised) and
`workflows/notifications.ts:252` (`select { dueDate }`). The fourth hazard, `getUserName`, stays on the
bare client and latent. `Tenant` (`:50`) is EXEMPT — the extension never touches it; isolation is the id
predicate plus `tenant_self_read`. The rest carry `tenantId` (no select / include only).

## 4. Step 4 — routed

Three commits, each under the cap:

```
4fba430d  GPS geofence path          2 files   62 changed lines    9 statements
fa5631ae  workflow reads             4 files  112 changed lines   17 statements
48e75da7  feedback/evaluator/push/   5 files  127 changed lines    7 statements
          activation/security audit
```

`getTenantPrismaForOrg(tenantId)` once per unit of work, **`userId` never passed**, every `$transaction`
kept (including `activation-tracker`'s and `generatePlaybookInstance`'s, whose atomicity is real), bypass
`set_config` deleted in the same edit. Where the acquisition sits inside an existing `try` that swallows
errors, it stays inside it, so an acquisition failure is handled exactly as a query failure was — and in
`evaluator.ts` it is inside the try so it cannot be mistaken for the idempotent already-scheduled branch.

**`tenantId` where clauses — counted per file with comments stripped, before → after:** equal in all 11
files (`evidence/04-tenant-mentions-after.txt`). Raw mention counts rose or held in every file.

Checked before routing rather than assumed:
- `StepTemplate.tenantId` and `RouteStop.tenantId` are **NOT NULL** — the injection cannot hide a
  platform-global row, because there are none.
- `sendPushToOrg`: the extension adds `PushToken.tenantId` beside the query's `user.tenantId` filter. Both
  databases hold **zero** tokens, so the data could not show agreement; the guarantee is structural — the
  only writer (`api/push-tokens:55`) sets both from the same verified token.

**tsc clean and proven not blind** — probe injected into `workflows/notifications.ts`, reported as TS2322,
removed.

## 5. Step 5 — remainder: **59 measured, 59 expected**

```
92 at quick-619 start − 33 routed = 59
repo-wide remainder: 59 statements in 31 files
PASS FLOOR · PASS POSITIVE CONTROL (supabase.ts array form) ·
PASS COUNTER-ASSERTION geofence-check.ts read, acquires a tenant client, yields ZERO
```

The 11 LIB_SERVICES statements left are **exactly** the stop list, line for line. The **48 statements on
every other surface are byte-identical** before and after — no other surface was touched.

## 6. Step 6 — proof with `bypass_rls_policy` dropped on 17 tables

`619-routing-verify.ts`: capture / drop / restore / self-healing pre-flight copied verbatim from
quick-617's harness. **No `process.kill`.**

**The `finally`, proven first** (`--throw-after-drop`): `86 → 69 → 86`, sorted list identical, zero body
mismatches, exit 3.

**The run — 25/25 PASS**, each cell a cold process:

| cell | result |
|---|---|
| `hook-control` | caller saw TC001, **hook recorded 1** |
| `fn:checkGeofenceAndAlert` (real) | 0 TC001, no error logged — **covers statement 1 of 8** (no active load on staging) |
| `fn:sendPushToOrg` (real) | 0 TC001 — covers the token read (1 of 2) |
| `fn:recordActivationEvent` (real) | 0 TC001, no failure, AppEvents 1 → 1, progress row unchanged — the `where: { tenantId }` read **returned the row**, or the function would have taken the auto-create branch and failed P2002 |
| `shape:activationProgress-where-tenantId` | row returned, keys `["completionPct","isActivated"]` == select exactly |
| `fn:sendInstanceBlocked` (real) | 0 TC001 — the read (0 instances on staging) |
| `fn:security-writeAuditLog` (real **write**) | admitted with the bypass gone, 1 row written, deleted, **left 0** |
| `own-write-audit-null` | Truck update via the tenant client: `updatedById` stays **NULL**; `updatedAt` restored |
| 17 × `table:<Model>` | **unscoped raises TC001 on all 17**; scoped succeeds on all 17; cross-tenant **PROVEN on `Tenant`, `Truck`, `User`**, **UNPROVEN BY NAME on 14** (zero rows on staging on both sides) |

**Restore:** re-created 17, live 86, sorted list identical, body mismatches `[]`. **Against production:**
staging and production sorted lists identical — sha256 `0fa356b9…` and md5 `29498ef6…`, reproducing both
figures recorded by quick-616 and the orchestrator.

### Two harness defects, caught by the harness's own controls

1. **The TC001 driver hook was blind to autocommit statements.** First run: `hook-control` FAILED — caller
   saw TC001, hook recorded 0 — so every "0 TC001" in that run was worthless. Cause, read from the adapter:
   `@prisma/adapter-pg` sends non-transactional statements through `Pool.query`, which calls
   `client.query(text, values, callback)`; only interactive-transaction statements use the promise form the
   hook watched. Fixed to wrap both forms; the first transcript is kept, labelled `hook-blind`.
2. **The audit fixture passed a non-UUID to `resource_id`** (`@db.Uuid`) → P2007. Fixture defect, not routing.

## 7. Step 7 — both click-throughs

**Arming counter-assertion — all four parts PASS** (`07-arming-control.txt`): gate true for the server's
exact inputs; false for the production ref; false with the flag off; GUC reads `on`; unscoped read raises
TC001 armed and is **silent** disarmed.

### Web — `604-click-through.ts` passes 1 + 2

**Final (warm server): 66 entries · 60 pass · 0 fail · 6 not-reachable · 0 TC001** — identical to
quick-616/617. 0 TC001 in the correlated slices **and** in the whole log range, against a positive control
of 66 `GET` lines in that range.

**Not hidden:** the first two attempts each produced one 500 — `/crm`, then `/settings/notifications` —
both `timeout exceeded when trying to connect` inside the **unchanged** `getTenantPrisma()`, each on that
page's first compile on a server started with `.next` wiped, 0 TC001 in the slice. Neither page reaches a
LIB_SERVICES file. Both transcripts are kept (`*-FIRST-cold*`, `*-SECOND*`). `prisma.ts` itself notes the
5 s connect timeout is marginal from a developer machine; that is the explanation the evidence supports,
and it is an explanation, not a proof.

### Mobile — `617-mobile-click-through.ts` — first authenticated run ever

**30 entries · 24 pass · 5 fail · 0 not-reachable · 0 TC001**; FLOOR, AUTH CONTROL (401), TENANT CONTROL
and ZERO-TC001 all PASS. **Identical entry-for-entry before and after routing.**

The 5 failures pre-date this task and are not tenancy: **4 × `P2022 ColumnNotFound`** — staging schema
drift on `FleetMessage` (×2), `DriverInvitation`, `PayrollRecord` — and `driver/messages/route-thread`
returning **400** because the harness calls it without its required parameter.

**What the first mobile run covers, and what it does not:**
- **Covers:** 28 GET routes that quick-617 routed, authenticated with real Supabase tokens for an OWNER and
  a DRIVER in tenant A and a DRIVER in tenant B, each correlated to its server-log slice.
- **Does not cover:** any POST/PATCH/DELETE; any dynamic `[id]` route — so **none of the 8 files quick-618
  routed**; and, measured statically, **effectively none of this task's 33 statements** — only one exercised
  route file imports a routed module (`owner/fleet/messages` → `send-push`), and its GET fails on P2022
  before reaching it. Tenant control over sparse data proves the route does not *raise*, not that it *scopes*.

**Neither click-through executed a routed LIB_SERVICES statement.** The web harness reaches two routed
modules (`/api/cron/automations` → evaluator; `/api/cron/workflow-notifications` → workflow notifications),
and the server log shows both returned early on sparse data (`pendingCreated=0`; `0 overdue step(s)`,
`0 instance(s) blocked`). **The step-6 function cells are the only execution of routed code in this task.**

**Prior evidence:** 72 files across quick-604/616/617/618 byte-identical at open and close. One slip,
caught and undone before the open hash: running `618-preconditions.ts` rewrote 618's
`02-preconditions.json`; restored with `git checkout`, and a 619 copy used from then on.

## 8. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** |
| `npm run build` | **exit 0**; the two docs search-index files it regenerates reverted as pre-existing drift (same as 617/618) |
| vitest after the last code/test commit (`5e421c7e`) | `2143 / 2024 / 64 / 52`, **25 failing files** |
| vs step-0 baseline | **`only-in-after: []`** · `only-in-before: [transaction-abort-sites.test.ts]` — the baseline's load flake, now passing. Nothing new fails; the set is a strict subset, not literally identical. |
| `wrapper-migration-countdown` | went up **544 → 561**, quick-610's pattern (third instance); regenerated, assertion untouched; delta **+17 in 8 routed files, 0 elsewhere** |

## 9. Deviations and deferred

**Deviations from the brief, stated:**
1. **The evidence commit `9fbd1a3b` is 45 files**, over the ~10-file cap. It is generated artefacts and
   harness copies, not reviewable source; the three source commits are all within the cap.
2. **Two statements the census called BROKEN_POLICY / "bypass load-bearing" were routed**, on the strength
   of `pg_policies` read from both databases. That is a reclassification by measurement, not a change to
   the pattern.

**Remaining work this task names:**
- **LIB_SERVICES residue — 6 files / 11 statements**, all stopped with reasons above. Three need decisions
  (null-tenant support tickets; where `withBypassRls` belongs; `writeAuditLog`'s multi-tenant array), three
  need a tenant threaded through a signature, one is BOOTSTRAP.
- **Staging schema drift**: `FleetMessage`, `DriverInvitation`, `PayrollRecord` P2022 on four mobile routes.
- **The mobile harness exercises no dynamic or write routes** — quick-618's 8 files and this task's code are
  still unexercised over HTTP. Staging has too little data for the crons to reach routed statements either.
- **14 tables' cross-tenant cells UNPROVEN BY NAME** — staging needs fixtures with FK chains.

## 10. Remaining surfaces — 59 statements in 31 files

| surface | files | statements |
|---|---:|---:|
| API_V1 | 6 | 14 |
| LIB_SERVICES (stopped residue) | 6 | 11 |
| OWNER_PORTAL | 4 | 7 |
| DRIVER_PORTAL | 4 | 6 |
| API_DRIVER | 2 | 6 |
| API_CRON | 1 | 4 |
| API_AUTH | 2 | 3 |
| API_DRIVER_PAY | 1 | 2 |
| API_GPS | 1 | 2 |
| API_INTEGRATIONS | 2 | 2 |
| API_PUSH_TOKENS | 1 | 1 |
| API_TRACK | 1 | 1 |

**The bypass drop remains blocked** at 59 statements. API_V1 is the largest routable surface left;
API_DRIVER_PAY should take `require-driver.ts`'s `withBypassRls` with it.
