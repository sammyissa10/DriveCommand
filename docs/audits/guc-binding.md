# Is the tenant GUC set on the connection that executes the query?

**Date:** 2026-09-12
**Scope:** investigation only. No application file was changed.
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`, us-west-1), `.env.staging`, Supavisor `:6543`.
**Production (`oqdhberkghtnszrkdvfm`): never connected to, never written.** The only production
data read was the Vercel *runtime error* aggregation (§4.3), which is a log surface, not the database.

---

## Verdict

**No. The binding asserted at `tenant-context.ts:175` does not hold, and — more importantly — it is
the wrong invariant.** The comment claims the `set_config` "lands on the current pooled connection"
and that "every subsequent model query on that connection sees the correct `current_tenant_id()`".

Measured on staging at production's own pool shape (`max: 1`), with two tenants concurrently in
flight in one Node process: **the connection is the same every single time (24/24 identical backend
pids) and half the requests still read the other tenant's id out of the GUC.** Same connection is
not the same thing as correct value. `app.current_tenant_id` is a single last-writer-wins slot on a
shared connection, and every non-transactional Prisma statement is an independent pool checkout, so
any interleaved request overwrites it in the window between the `set_config` and the query it was
meant to protect.

The pid comparison the brief asked for therefore **passes** in the production shape while the design
still fails. That is the strongest available form of the finding.

Transaction scope — the thing session scope was chosen to avoid — was measured clean: **128/128
correct, zero P2028, zero cross-tenant rows.** The P2028 deadlock is real but is caused by
*transaction nesting*, not by `TRUE`; it reproduced 6/6 on the nested shape and 0/128 on the
transaction-scoped shape (§4).

---

## 1. Static reading: `createTenantClient` and `withTenantRLS`

**`withTenantRLS` never touches the connection.** It is a pure query-argument interceptor
(`tenant-rls.ts:144-243`): it injects `tenantId` into `where`/`data` and calls `query(args)`. It
opens no transaction and issues no `set_config`. Its own header records why — the array-form
`$transaction` it used to wrap every operation in is what caused P2028 (`tenant-rls.ts:25-33`).

**`createTenantClient` returns a wrapper over the same `PrismaClient`, hence the same `pg.Pool`**
(`tenant-client.ts:24-28`):

```ts
export function createTenantClient(tenantId: string, userId?: string | null): PrismaClient {
  return prisma
    .$extends(withTenantRLS(tenantId))
    .$extends(withAuditColumns(userId ?? null)) as unknown as PrismaClient;
}
```

`$extends` produces a new client *facade* bound to the same engine and the same adapter. So the
returned client uses the same pool as the preceding `prisma.$executeRawUnsafe`. **That is where the
static guarantee stops.**

**The code that actually determines the connection is in the adapter, and it re-checks-out per
statement.** `@prisma/adapter-pg@7.4.0`, `dist/index.js` — `PrismaPgAdapter extends PgQueryable`,
constructed with the `pg.Pool` (its `startTransaction` calls `this.client.connect()`, which only a
Pool has). Every non-transactional statement goes through:

```js
async performIO(query) {
    const { sql, args } = query;
    const values = args.map((arg, i) => mapArg(arg, query.argTypes[i]));
    try {
      const result = await this.client.query({ text: sql, values, rowMode: "array", ... });
```

`this.client` is the Pool, so `this.client.query(...)` is `Pool.query` — **connect, run one
statement, release.** Transactions are the only exception; they pin a client:

```js
  async startTransaction(isolationLevel) {
    ...
    const conn = await this.client.connect().catch((error) => this.onError(error));
```

**Conclusion for step 1: it cannot be determined statically.** `$executeRawUnsafe(set_config)` is
one checkout and the following query is a different checkout. Whether they land on the same physical
connection is a runtime property of pool scheduling. At `max: 1` (`prisma.ts:46`) there is only one
connection to hand out, so in practice they usually match — but the pool can also destroy it
(`idleTimeoutMillis: 10000`, `prisma.ts:50`), and matching does not imply the *value* survived.

---

## 2. Empirical proof against staging

**Method.** A harness in the session scratchpad drives the **real** `getTenantPrismaForOrg` →
`createTenantClient` → `withTenantRLS`, imported from source via `tsx`. It changes no repo file: it
pre-seeds `globalThis.pool` with an instrumented `pg.Pool`, which `prisma.ts` then adopts through its
own singleton guard (`prisma.ts:41-42`), and it re-registers the same reset `connect` handler
`prisma.ts` would have installed. Per iteration ("one request"):

1. `await getTenantPrismaForOrg(tenantId)`
2. through the **returned** client: `SELECT current_setting('app.current_tenant_id', true), pg_backend_pid()`
3. through the returned client, raw SQL against `"Truck"` — raw bypasses `withTenantRLS` injection, so RLS alone decides those rows

`setPid` is `pg_backend_pid()` taken **on the same pooled client the `set_config` just ran on**,
before release. `readPid` is the in-band pid from step 2. Two staging tenants (A, B) with one truck
each; both roles tested — `postgres` (production's current role, `BYPASSRLS`) and `app_user` (the
cutover target, RLS enforced).

### 2.1 Raw counts

| # | role | pool `max` | mode | tenants | n | **pids identical** | **pids differ** | **GUC correct** | **GUC EMPTY** | **GUC WRONG-TENANT** |
|---|---|---|---|---|---|---|---|---|---|---|
| S1 | postgres | 5 | sequential | single | 25 | **25** | **0** | **25** | **0** | **0** |
| S2 | postgres | 5 | concurrent (8-way) | alternating | 24 | **5** | **19** | **11** | **2** | **11** |
| S3 | postgres | 1 | concurrent (8-way) | alternating | 24 | **24** | **0** | **12** | **0** | **12** |
| S4 | postgres | 1 | sequential | single | 24 | **24** | **0** | **24** | **0** | **0** |
| S5 | app_user | 1 | sequential | single | 24 | **24** | **0** | **24** | **0** | **0** |
| S6 | app_user | 1 | concurrent (8-way) | alternating | 24 | **24** | **0** | **12** | **0** | **12** |

Cross-tenant rows returned by the raw read (RLS alone deciding, `app_user` only):
**S5 — 0 of 24. S6 — 12 of 24.**

### 2.2 S6 per-iteration table (`app_user`, `max: 1`, the production shape)

Every even iteration is tenant A and every odd one is tenant B. Every tenant-A request read tenant
B's id and returned tenant B's truck.

```
iter tenant setPid  readPid  pidsSame  setConn readConn  gucVerdict      rawRowsVisible
   0  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
   1  B    303581   303581  same           1        1  correct        [MODEL-B]
   2  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
   3  B    303581   303581  same           1        1  correct        [MODEL-B]
   4  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
   5  B    303581   303581  same           1        1  correct        [MODEL-B]
   6  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
   7  B    303581   303581  same           1        1  correct        [MODEL-B]
   8  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
   9  B    303581   303581  same           1        1  correct        [MODEL-B]
  10  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
  11  B    303581   303581  same           1        1  correct        [MODEL-B]
  12  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
  13  B    303581   303581  same           1        1  correct        [MODEL-B]
  14  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
  15  B    303581   303581  same           1        1  correct        [MODEL-B]
  16  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
  17  B    303581   303581  same           1        1  correct        [MODEL-B]
  18  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
  19  B    303581   303581  same           1        1  correct        [MODEL-B]
  20  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
  21  B    303581   303581  same           1        1  correct        [MODEL-B]
  22  A    303581   303581  same           1        1  WRONG-TENANT   [MODEL-B]
  23  B    303581   303581  same           1        1  correct        [MODEL-B]
```

**Read the `pidsSame` column before anything else.** It is `same` 24 times out of 24, one physical
connection, one backend. The comment at `:175` is *literally true here* and the tenant is still wrong
half the time. Each of the 8 concurrent requests fires its `set_config` as its own autocommit
checkout; they all serialise onto the one connection; the last writer wins; the reads then follow and
every tenant-A read observes tenant B's value.

### 2.3 S2 per-iteration table (`max: 5` — the pid check fails too)

At `max > 1` the weaker failure also appears: `setPid` and `readPid` genuinely diverge (19/24), the
two statements land on different TCP connections (23/24 `setConn != readConn`), and the GUC comes
back **empty** twice — a fresh connection whose reset handler ran but whose `set_config` went to a
different connection.

```
iter tenant setPid  readPid  pidsSame  setConn readConn  gucVerdict
   0  A    303573   303572  DIFF           1        4  correct
   1  B    302833   303573  DIFF           3        5  correct
   2  A    303572   303572  same           2        5  WRONG-TENANT
   3  B    302833   303572  DIFF           3        3  WRONG-TENANT
   4  A    302833   303572  DIFF           3        2  correct
   5  B    302833   303574  DIFF           3        4  EMPTY
   6  A    302833   303574  DIFF           3        2  EMPTY
   7  B    302833   302833  same           3        1  correct
   8  A    302833   303575  DIFF           3        4  WRONG-TENANT
   9  B    303575   303575  same           5        4  correct
  10  A    302833   302833  same           3        1  WRONG-TENANT
  11  B    303575   302833  DIFF           2        1  WRONG-TENANT
  12  A    302833   303575  DIFF           3        2  WRONG-TENANT
  13  B    302833   303573  DIFF           3        5  WRONG-TENANT
  14  A    302833   303575  DIFF           3        5  WRONG-TENANT
  15  B    302833   303575  DIFF           3        1  correct
  16  A    302833   303572  DIFF           3        2  correct
  17  B    302833   303573  DIFF           3        1  correct
  18  A    303573   302833  DIFF           2        5  correct
  19  B    303572   302833  DIFF           1        4  WRONG-TENANT
  20  A    302833   302833  same           3        5  correct
  21  B    302833   303572  DIFF           3        1  WRONG-TENANT
  22  A    302833   303574  DIFF           3        4  WRONG-TENANT
  23  B    302833   303574  DIFF           3        4  correct
```

### 2.4 What a wrong GUC does to a *model* query

Raw SQL leaks (12/24 above). Model queries do not, because `withTenantRLS` still injects the correct
`tenantId` — but the injection's predicate and RLS's predicate then name different tenants and the
intersection is empty. Measured, `app_user`, `max: 1`, 8-way concurrent, `truck.findMany`, n=24:

```
  iter 0 tenant A wanted [MODEL-A] got []
  iter 1 tenant B wanted [MODEL-B] got [MODEL-B]
  iter 2 tenant A wanted [MODEL-A] got []
  ...
  correct-1-row=12  SILENTLY-EMPTY=12  cross-tenant-rows=0
```

**Half of concurrent cross-tenant requests silently return no rows for data that exists.** No error,
no log line. This is the operational face of the bug at cutover, and it lands on exactly the "silent
failure is the dominant failure mode" warning already recorded in
`docs/audits/bypass-call-classification.md` §3.

### 2.5 Caveat on the harness, stated rather than buried

The harness reproduces interleaving deterministically with `Promise.all` over two tenants. It does
not prove how often two tenants are concurrently in flight in one production worker — that depends on
Vercel per-instance request concurrency, `after()` callbacks and cron overlap, and was not measured.
What it proves is that **the design has no defence when it happens**, and that the stated
justification for session scope ("`max:1` pool + single-threaded Vercel workers guarantee no
concurrent tenant overlap on a given physical connection", `tenant-context.ts:160-164`) is not a
guarantee: single-threaded is not non-concurrent, and `max:1` was measured to make the leak *more*
deterministic, not less.

---

## 3. Does anything reset the GUC? Lifetime of a pooled connection

**Nothing in the application resets it when a request completes.** There is exactly one reset, and it
fires on *new physical connections only* (`prisma.ts:64-74`). `node-postgres` has no
`server_reset_query`; `release()` returns the client to the idle list with its session state intact.

Measured:

| test | result |
|---|---|
| 3a — GUC across statements on an idle pooled connection (0 ms, 1 s, 3 s) | persists unchanged; pid stable |
| 3b — after 13 s idle (past `idleTimeoutMillis: 10000`) | connection destroyed and re-created, reset handler fires, **GUC reads empty** (backend pid happened to be reused) |
| 3c — 15 reads from a *second* client connection while the first holds tenant A | landed on the first's backend **15/15**, observed the first's tenant GUC **0/15** |

So the value's lifetime ends only when (a) another `set_config` overwrites it, (b) the pooled
connection is idle-evicted at 10 s and re-opened, or (c) Supavisor hands that server connection to a
different client session. **Between requests in the same warm worker it simply stays there**, which
was confirmed through the real code:

```
5b  after a tenant-A request finished, a BARE prisma query (no getTenantPrisma*) sees
    guc=b6e49469  rows=[MODEL-A]   (tenant A = b6e49469)
```

Any code path that queries on the bare `prisma` client — cron, `after()`, background work, the 196
sites `bypass-call-classification.md` flags — runs under **whatever tenant last ran in that worker**.
Post-cutover that is nondeterministic: correct, empty, or another tenant's rows, depending on who was
served last.

3c is the one reassuring result: Supavisor did not bleed a GUC between two client connections even
when both were reported on the same backend pid. That is 15 trials on a quiet pooler and is not a
contractual guarantee, but no cross-process leak was observed. **The failure is in-process
interleaving, not pooler bleed.**

---

## 4. Transaction scope, and whether P2028 reproduces

### 4.1 The proposed pattern — `set_config(..., TRUE)` and the query in ONE transaction

This is the shape `tenantRawQuery` already ships (`tenant-context.ts:222-228`). Run against staging as
`app_user`, alternating tenants, under concurrency:

| pool `max` | concurrency | n | GUC correct | GUC wrong | **P2028** | other errors | cross-tenant rows |
|---|---|---|---|---|---|---|---|
| 1 | 8 | 24 | 24 | 0 | **0** | 0 | 0 |
| 1 | 16 | 64 | 64 | 0 | **0** | 0 | 0 |
| 5 | 16 | 64 | 64 | 0 | **0** | 0 | 0 |

**128 transaction-scoped operations under concurrency at both pool sizes: zero deadlocks, zero wrong
tenants, zero leaks.** The failure that motivated session scope did **not** reproduce.

### 4.2 The historical pattern — an inner transaction nested inside an outer one

The shape `tenant-rls.ts:25-33` blames, reproduced deliberately: an outer
`prisma.$transaction(async tx => ...)` holding the connection, with an inner array-form
`prisma.$transaction([set_config, query])` on the root client inside it.

| pool `max` | attempts | succeeded | **P2028** |
|---|---|---|---|
| 1 | 6 | 0 | **6** |
| 5 | 6 | 1 | **5** |

**P2028 is real and reproduces on demand — 6/6 at `max: 1`.** It is caused by *nesting a second
top-level transaction while the only connection is held*, which is exactly what quick-411 recorded
(`411-PLAN.md:82`). It is **not** caused by `TRUE`. Session scope was adopted to avoid a deadlock that
transaction scope, used non-nested, does not produce. The two were conflated.

### 4.3 Has `tenantRawQuery` ever deadlocked in production?

**No evidence of it.** Vercel runtime error clusters for `drive-command`
(`prj_Xmoayi3nYc5ZxVvS3khXO34BtOU3`), 7-day window, 32 groups / 2,074 lines: **zero occurrences of
`P2028`, `deadlock`, or `transaction already closed`** (the file was verified non-vacuous first — 137
hits for `Error`, 72 for `Prisma` — so the zero is a real absence, not a bad grep). The error groups
present are `PrismaClientValidationError` from `digest-compliance-30day`, notification persistence
failures, `purge-deleted` failures and auth refresh-token errors. The affected-route set is
`/api/auth/me`, five `/api/cron/*` routes, `/api/v1/carrier/dispatches` and `/middleware`.

This matters because `tenantRawQuery` is not a rarely-taken path. It has **26 invocations across 4
files**, including **11 in a single request to `/api/v1/carrier/live-map/vehicles`**, which quick-559 established is polled every
15 s from a dashboard left open all day. If `TRUE`-in-a-transaction deadlocked under this topology,
that endpoint would be the loudest thing in the logs. It does not appear at all.

Limits of this evidence, stated: the aggregation window is 7 days (some groups carry an earlier
`first=` timestamp, so the table retains older first-seen data, but the query cannot look back
further); Sentry was not queried, as no Sentry MCP is configured in this session.

---

## 5. Can the current design enforce RLS correctly under `app_user`, and what is the minimum fix?

### 5.1 No.

Under `app_user` the GUC is the *only* thing RLS consults, and the GUC is a mutable slot on a shared
connection written by an autocommit statement that is not bound to the query it protects. Measured
under `app_user` at production's `max: 1`: **12 of 24 concurrent cross-tenant requests read the wrong
tenant through RLS** — leaking rows on raw SQL and silently returning nothing on model queries. No
amount of tuning the pool fixes this; `max: 1` made it *more* reliable, not less.

Two consequences worth separating:

- **This is not a live production data leak today.** Production `DATABASE_URL` is still the `postgres`
  role, which is `rolbypassrls`, so RLS is inert and the app-layer injection in `withTenantRLS` is what
  actually provides isolation. It is unaffected by any of this (0/24 cross-tenant model rows even with
  a wrong GUC).
- **It is a hard blocker for the `app_user` cutover.** It also qualifies a claim already on the record:
  `bypass-call-classification.md:64` counts 15 sites as surviving cutover because "a
  `getTenantPrisma()`/`getTenantPrismaForOrg()` was awaited earlier in the same request". Awaited
  earlier in the same request is **not sufficient** — the value can be overwritten by a concurrent
  request in the window before the query runs. Those 15 need re-checking against the fix below, not
  against the GUC merely having been set.

### 5.2 The minimum change

**Bind the GUC to the same transaction as the query, and never nest.** Concretely: one
`withTenantContext(tenantId, cb)` that opens a single interactive transaction, issues
`set_config('app.current_tenant_id', $1, TRUE)` as its first statement, and hands the tx client —
extended with `withTenantRLS` and `withAuditColumns` — to the callback, which does all of that unit of
work's reads and writes on it.

This is minimal in the sense that matters: **the pattern already exists in this repo and is already in
production.** `tenantRawQuery` is exactly this shape; §4.1 measured it at 128/128 under concurrency
with no P2028, and §4.3 found no production deadlock across its 26 invocations, including the app's
highest-frequency poller. The change is to stop having two mechanisms — session scope for model
queries, transaction scope for raw ones — and keep the one that is provably correct.

It is not a one-liner, and the cost should not be understated: ~90 `getTenantPrisma()` call sites and
**350 `$queryRaw`/`$executeRaw` occurrences across 134 files** that do not go through `tenantRawQuery`
would move inside the callback, and one rule has to hold afterwards — *nothing inside a tenant context
opens another top-level transaction*, since §4.2 shows that is what actually produces P2028.

Two alternatives were considered and rejected:

- **Pin a connection per request outside a transaction.** Prisma's adapter exposes no supported way to
  do this — `startTransaction`'s `this.client.connect()` is the only path that holds a client (§1). An
  interactive transaction *is* Prisma's connection-pinning primitive, so this reduces to the
  recommendation above.
- **A process-wide async mutex around (`set_config` … the request's queries).** Correct, but it
  serialises all database work in the worker, and it is a second isolation mechanism that a future edit
  can drop. The transaction boundary cannot be dropped without the query visibly moving.

### 5.3 Until it lands

- **Do not flip `DATABASE_URL` to `app_user`.** The symptom would be intermittent empty screens rather
  than errors (§2.4), which is close to undiagnosable in production.
- **Treat `withTenantRLS`'s injection as the primary control, not the secondary one.** The header
  comments in both files have the priority the other way round; today the injection is the only thing
  working.
- **The 350 raw sites are the leak surface**, not the model queries. Any `$queryRaw` on a
  `getTenantPrisma()` client — as opposed to inside `tenantRawQuery` — has no injection and, at
  cutover, no reliable GUC either.
- **Correct the two comments** (`tenant-context.ts:158-167`, `tenant-rls.ts:11-33`). They currently
  record `TRUE` as impossible because of P2028. §4 shows the deadlock belongs to nesting and that
  `TRUE` non-nested is clean. Leaving that in place is how the next task re-derives the same wrong
  conclusion — the same failure mode as the design comments corrected in quick-547 and quick-548.

---

## 6. Reproduction, and what was touched on staging

Harness scripts live in the session scratchpad (not committed): they import
`apps/web/src/lib/context/tenant-context.ts` and `apps/web/src/lib/db/prisma.ts` through `tsx` from the
repo root, and inject an instrumented `pg.Pool` into `globalThis.pool` so `prisma.ts` adopts it via its
own singleton guard. No repo file was modified to run any of this.

Staging changes, **all reverted**:

| change | revert | verified |
|---|---|---|
| 2 tenants `gucaudit-a` / `gucaudit-b` | deleted (2 rows) | `SELECT count(*) FROM "Tenant" WHERE slug LIKE 'gucaudit-%'` → 0 |
| 2 `"Truck"` rows `make='GUCAUDIT'` | deleted (2 rows) | `SELECT count(*) FROM "Truck" WHERE make='GUCAUDIT'` → 0 |
| `app_user` given a password (it had none; the role already existed with `LOGIN`) | `ALTER ROLE app_user WITH PASSWORD NULL` | `rolpassword IS NOT NULL` → `false` |

To reproduce, `app_user` needs a password again on staging. Note also that the header comment in
`.env.staging` is stale on two counts: the password placeholder it warns about has already been
replaced, and `STAGING_DATABASE_URL_APP_USER` is described as absent "because the `app_user` role does
not exist on staging yet" — the role does exist, with `LOGIN` and `rolbypassrls = false`.

Finally, `apps/web/scripts/audit/app-user-connection-harness.ts` is a pre-existing harness for adjacent
questions. It is structurally blind to this one: it uses a dedicated `new Client()` per probe (and its
own header says mirroring `TRUE` "would test something the app does not do"), so it never exercises the
shared-pool interleaving that is the entire defect.
