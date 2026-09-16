# quick-617 — Task 3: the per-sub-surface application record

Three commits, one per sub-surface, so the diff is reviewable in pieces rather than as one 47-file
blob. Driven from `evidence/01-inventory.json` by `apps/web/scripts/audit/617-apply-routing.js`,
applying the pattern proven in `02-single-file-proof.md` unchanged.

---

## 1. The record

| sub-surface | files routed | statements removed | tenant predicates BEFORE → AFTER | `app.bypass_rls` after | commit |
|---|---:|---:|---|---:|---|
| `driver/incidents` (Task 2) | 1 | 2 | 5 → 7 | 0 | `956fe987` |
| `support` | 1 | 1 | 4 → 5 | 0 | `4f868357` |
| `driver` (remaining) | 13 | 19 | 60 → 62 | 0 | `9447e6eb` |
| `owner` | 24 | 47 | 158 → 164 | 0 | `8816b2ef` |
| **routed total** | **39** | **69 lines / 67 statements** | **227 → 238** | **0** | |
| **stopped and reported** | **8** | **16 statements untouched** | unchanged | 16 | — |

`after >= before` holds on **every file individually** and on every sub-surface — asserted
mechanically by the applier, which refuses to write a file whose count fell. The `+11` across the
surface is the `auth.tenantId` mentions inside the inserted comments; **no `where`, `data`, `select`,
`include`, `orderBy` or `take` changed anywhere in the diff.**

`git diff --stat` across the four source commits: **39 files changed, 494 insertions(+), 527
deletions(-)** — a net removal of 33 lines.

### The absence claims, each with a positive control in the same run (H-bis)

```
instrument: grep -rn, same corpus, same invocation shape

NEGATIVE (the claim)   app.bypass_rls over the 39 ROUTED files   -> 0
POSITIVE CONTROL       app.bypass_rls over the  8 STOPPED files  -> 16   (non-zero: the instrument works)
POSITIVE CONTROL 2     getTenantPrismaForOrg over the 39 ROUTED  -> 96

NEGATIVE (the claim)   getAdminDb in the source diff             -> 0
POSITIVE CONTROL       getTenantPrismaForOrg in the same diff    -> 113
POSITIVE CONTROL       getAdminDb DOES exist in the repo         -> src/lib/automations/evaluator.ts
```

A zero with no paired non-zero is not a measurement.

### The AFTER inventory asserts SET EQUALITY, not zero

```
[617-inventory] mode=AFTER   files=8 statements=16
  PASS  AFTER: the ONLY remaining bypass statements are in the 8 stopped-and-reported files
        — 16 statements in 8 files; unexpected (routed file that kept a bypass): [];
          missing (stopped file that was routed anyway): []
  PASS  AFTER: the routed population is gone — 83 before, 16 stopped, 67 routed — 16 === 16
  PASS  POSITIVE WITNESS (AFTER) driver/hos/route.ts was READ and now acquires a tenant client
  PASS  COUNTER-ASSERTION carrier/driver/dispatches/route.ts WAS READ   (bytes=4396 parsed=true)
  PASS  COUNTER-ASSERTION carrier/driver/dispatches/route.ts YIELDS ZERO
  PASS  SCHEMA CONTROL positive / negative
  PASS  AUDIT-SET CONTROL
```

`=== 0` would have been the right assertion for a task that routed all 47. This one routed 39, so
relaxing the check to `<= 16` to make it green would be the weakening this repo forbids. Naming
**which** sixteen is *stronger* than `=== 0` over the routed set, because it fails in **both**
directions: a routed file that kept its bypass shows as `unexpected`, and a stopped file that was
routed anyway shows as `missing` — the latter meaning somebody shipped a route that returns null for
its own tenant. The stopped set is read from the **pinned BEFORE artefact**, so it cannot be edited
into agreement with whatever the tree happens to contain.

---

## 2. DEVIATIONS

### 2a. STOPPED AND REPORTED — 8 files, 16 statements

Not "none". All eight stop for **one measured reason**, set out in full in `01-inventory.md` §7 and
confirmed on staging on two independent models: a `findUnique` carrying a **top-level `select` that
omits `tenantId`** returns **null for its own tenant** once the client is `withTenantRLS`-extended,
because the extension cannot filter a findUnique `where` and instead post-checks
`result.tenantId !== tenantId`.

| file | statements | the offending call | what it does with the result |
|---|---:|---|---|
| `driver/loads/[id]/revert/route.ts` | 1 | `load.findUnique … select {id, driverId, status}` | `if (!load) return 404` |
| `driver/loads/[id]/status/route.ts` | 1 | `load.findUnique … select {id, driverId, status}` | `if (!load) return 404` |
| `owner/loads/[id]/assign-truck/route.ts` | 1 | `load.findUnique … select {id}` | `if (!existingLoad) return null` → 404 |
| `owner/loads/[id]/route.ts` | 4 | `load.findUnique … select {20 fields}` | **IS the response body** |
| `owner/routes/[id]/route.ts` | 2 | `route.findUnique … select {id}` | `throw NOT_FOUND` |
| `owner/trucks/[id]/maintenance/route.ts` | 2 | `truck.findUnique … select {id}` ×2 | `if (!truck) return null` → 404 |
| `owner/trucks/[id]/route.ts` | 2 | `truck.findUnique … select {id}` | `if (!existing) return null` → 404 |
| `owner/trucks/[id]/scheduled-service/route.ts` | 3 | `truck.findUnique … select {odometer}` ×2 | `if (!truck) return null` → 404 |

**Why stopping is the correct outcome and not a shortfall.** Both available actions change
something:

- routing them as-is changes what the statement returns on success from *the row* to *null* — every
  one of these eight routes would answer "not found" for its own tenant's data, on every request;
- fixing the select changes what the statement returns on success by one field, which this task's
  limits also forbid — and on `owner/loads/[id]:178` that field would land in the client's response
  body.

Leaving them alone changes nothing about them at all, and hands the follow-up a decision backed by a
measurement rather than a rediscovery. **What each would need**, per site:

1. **nine sites** — add `tenantId: true` to the select. The result is an internal ownership guard
   tested for truthiness, so this is externally invisible; it is still a deliberate change and needs
   to be made as one.
2. **`owner/loads/[id]:178`** — `findUnique` → `findFirst`, which takes the AND-injection path
   instead of the post-hoc check, so the select is irrelevant and the response body is unchanged.

### 2b. The four deviation candidates the plan named — INSPECTED, none needed a deviation

| file | statements | what was checked | verdict |
|---|---:|---|---|
| `owner/fleet/messages/[recipientId]/route.ts` | 7 | nested? spanning handlers? | **Not nested.** Seven sibling transactions across two handlers (5 in GET, 2 in POST); every later one sits inside the same `try` block that opens with the first, so ONE acquisition per handler is in scope for all of them. tsc is the backstop and is clean |
| `owner/fleet/messages/route.ts` | 6 | same | same — 4 in GET, 2 in POST |
| `owner/loads/[id]/route.ts` | 4 | GET/PATCH/DELETE each with their own? | **Stopped** for the §2a reason, not this one |
| `owner/drivers/invite/route.ts` | 4 | Supabase Auth user creation mid-transaction; does the create/updateMany pair depend on atomicity? | **The plan's concern DOES NOT APPLY.** There is no `createUser` call in this route at all — it writes a `DriverInvitation` and sends an email; the globally-unique `auth.users.email` trap lives in the acceptance flow. And the four transactions are already four *independent* `$transaction` calls, so the `updateMany` + `create` pair was never atomic and nothing was preserved or lost. Routed normally, one acquisition for its single POST handler |

### 2c. EXEMPT_MODELS — named here rather than discovered later

Exactly **one** operation in the entire routed set touches a model in `withTenantRLS`'s
`EXEMPT_MODELS`:

```
owner/drivers/invite/route.ts  ::  tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } })
```

`Tenant` has no `tenantId` column. The Prisma-level filter does not engage, so isolation there is the
explicit `where: { id: tenantId }` plus the table's own RLS policy — which is fine, and is exactly
quick-588's situation, but it is stated rather than left to be found. It is also **why this one is
not a `findUnique` hazard**: the post-hoc check only runs on non-exempt models.

### 2d. The inverse check — a statement whose `where` lacks a tenant predicate on a NON-exempt model

13 operations in the pre-edit inventory are id-keyed on a non-exempt model without naming the tenant.
Each was classified by what `withTenantRLS` actually does to it, read out of the extension's switch:

| class | count | what the injection does | own-tenant success path |
|---|---:|---|---|
| `MERGE-WHERE` (update) | 9 | `where = {...where, tenantId}` | unchanged — the id was already resolved from a tenant-scoped read in the same transaction |
| `AND-INJECT-WHERE` (findFirst/count) | 3 | `where = {AND:[{tenantId}, where]}` | unchanged — the parent id was tenant-verified |
| `POST-HOC-CHECK` (findUnique **with `tenantId` in the select**) | 1 | nothing to the args | unchanged |

**Nothing in this class changes what a statement returns on success** — the injection only ever
excludes rows belonging to another tenant, which is the isolation being added. That is why these are
not stop-and-reports while the `findUnique`-without-`tenantId` class is: there, the own-tenant row is
the thing excluded.

### 2e. `prisma` kept in ONE file, deliberately

`support/ticket/route.ts` keeps `import { prisma, TX_OPTIONS }`. Its module-level
`generateTicketNumber` reads quick-616's sequence with `prisma.$queryRaw` — no tenant in hand, no
transaction, nothing to scope. This is the plan's "some files use `prisma` outside the transaction —
check, do not assume" case and it is the only one of the 38. In the other 37 the binding is dropped
after asserting no other use.

### 2f. `relation-form tenant writes` — hunted for, zero found

A `data: { tenant: { connect: … } }` would collide with `withTenantRLS`'s scalar `tenantId` spread
(Prisma rejects both spellings of one relation in one payload). Scanned for explicitly rather than
assumed absent: `relationFormTenantWrites: []`.

---

## 3. Three defects the applier's own guards caught, in this batch

Each was a real destructive change, caught, reverted, and turned into a guard rather than a note.

1. **The docblock deleter used `.includes('@bypass_rls reason:')` and deleted quick-616's entire
   22-line `generateTicketNumber` header**, which *quotes* the annotation it replaced. It now matches
   the **annotation form** — a JSDoc line that *begins* `@bypass_rls reason:`. Same family as
   quick-600's `pool.on('connect'` check and quick-612's migration guard, both of which
   false-positived on the prose describing the invariant they protect.

2. **A botched in-flight patch to the applier wrote the literal text `undefined` into all 13 driver
   files** — `getTenantPrismaForOrg(tenantId)undefined` — and **`tsc` reported nothing**, because
   `fooundefined` is a valid identifier. Reverted; the applier now asserts the emitted acquisition
   line is *exactly* `const tenantPrisma = await getTenantPrismaForOrg(<tenantExpr>)<semi>` and that
   the transform introduced no literal `undefined`.

3. **A post-edit BEFORE run of `617-mobile-inventory.ts` silently rewrote `01-inventory.json` from
   47f/83s to 45f/80s**, destroying the pinned population *and* the hazard list that both the applier
   and the harness read from it. BEFORE mode now refuses to overwrite an existing artefact without
   `--force`; post-edit runs use `--after`.

A fourth, smaller one: eight of the 38 files are written without statement semicolons and got a stray
`;`. The applier now reads the file's own convention off its `prisma` import.
