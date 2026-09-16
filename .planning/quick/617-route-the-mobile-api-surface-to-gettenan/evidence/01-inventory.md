# quick-617 — Task 1: the MOBILE_API inventory, the 84 → 83 reconciliation, and the second argument

Instrument: `apps/web/scripts/audit/617-mobile-inventory.ts` — `ts.createSourceFile`, no `Program`,
no type checker, CRLF normalised before any offset arithmetic. **No source file under `src/` was
edited in this task.**

---

## 1. The baseline, relocated and verified — NOT re-measured

`.planning/quick/_617_baseline/` has been moved to `evidence/00-baseline/` and the stray directory
removed. Captured by the orchestrator at revision **`5437177a`**, tree clean:

```
tests: 2129 · passed: 2010 · failed: 64 · pending: 52 · failing FILES: 25
```

Verified self-consistent rather than taken on trust — `failing-files.txt` is exactly the set of
`status === 'failed'` entries in `baseline.json`:

```
numTotalTests 2129 passed 2010 failed 64 pending 52
failing files 25 · txt entries 25 · sets equal true
```

`driver-incident-report-persists.test.ts` **is** in that set — relevant because Task 2's proof file
is `driver/incidents/route.ts`. Its status must not change in either direction without an explanation.

Not re-run here. Four tasks in this series published a baseline measured against the wrong revision;
this one is pinned and on disk.

---

## 2. Step 1 RE-VERIFIED in the current tree: 47 files / 83 statements

```
[617-inventory] mode=BEFORE
[617-inventory] files=47 statements=83
[617-inventory] sub-surfaces: {"driver":{"files":16,"statements":21},"owner":{"files":30,"statements":61},"support":{"files":1,"statements":1}}
[617-inventory] writes=30 of which userIdWouldChangeBehaviour=26
  PASS  FLOOR statements — 83 >= 80
  PASS  FLOOR files — 47 >= 45
  PASS  POSITIVE WITNESS src/app/api/mobile/driver/hos/route.ts — 2 statements at lines [29, 174] >= 2
  PASS  COUNTER-ASSERTION src/app/api/mobile/carrier/driver/dispatches/route.ts WAS READ — bytes=4396 parsed=true getTenantPrismaForOrg=true
  PASS  COUNTER-ASSERTION src/app/api/mobile/carrier/driver/dispatches/route.ts YIELDS ZERO — 0 executable statements === 0
  PASS  SCHEMA CONTROL positive — DriverIncident carries createdById/updatedById — {"createField":"createdById","updateField":"updatedById"}
  PASS  SCHEMA CONTROL negative — CarrierDocument carries neither convention — {"createField":null,"updateField":null}
  PASS  AUDIT-SET CONTROL — both sets lifted non-empty with a known member — EXEMPT_AUDIT=19 CREATE_ONLY=3 EXEMPT_RLS=27
```

The sub-surface split matches the plan's table exactly (support 1/1, driver 16/21, owner 30/61,
carrier 0/0). Every one of the 83 is `callee: "tx.$executeRaw"` inside a `$transaction` callback on
the bare `prisma` client. **No `$executeRawUnsafe`, no array-form `$transaction`, no bare-client
`set_config` — the population is uniform, as planning measured.**

Both halves of the counter-assertion fire: the file quick-588 already routed is confirmed READ
(4,396 bytes, parsed, and it does contain `getTenantPrismaForOrg(`) **and** confirmed to yield zero.
Half (i) alone proves nothing; half (ii) alone is satisfied by a walker that reads nothing.

### Two schema controls, because a null-answering registry is the vacuous pass

The audit verdicts below are only worth anything if the schema registry can actually tell a model
that carries audit columns from one that does not. Both directions are asserted in the same run:
`DriverIncident → createdById/updatedById` and `CarrierDocument → null/null`. The two model sets are
**lifted out of `audit-columns.ts` and `tenant-rls.ts` by parsing their own `new Set([...])`
literals**, so the script and the extensions cannot drift apart.

---

## 3. The 84 → 83 reconciliation, attributed to commit `2f92a25a`

**A correction to the plan's fact 1d first.** The plan asserts the census's MOBILE_API row is
`CROSS_TENANT 1f/1s + TENANT_KNOWN_UNSCOPED 47f/83s = 47f/84s`. The census artefact on disk says
otherwise:

```
MOBILE_API matrix: CROSS_TENANT {files:0, statements:0}
                   TENANT_KNOWN_UNSCOPED {files:47, statements:83}
                   TOTAL {files:47, statements:83}
```

That is not a disagreement about the facts — it is that `01-census.json` was **regenerated after
quick-616's own routing commit**, so the 84th statement was already gone when it was written. Its own
anti-vacuity block says so by name:

```
ROUTED STATEMENTS ARE GONE — 2 routed statements absent:
  src/actions/support-tickets.ts:99, src/app/api/mobile/support/ticket/route.ts:39
REMOVED + REMAINING RECONCILES — 175 remaining + 2 routed = 177 (must be 177).
```

The **84** comes from the prior 211-statement audit, transcribed in
`616-audit211-transcription.json`, which classifies the two mobile support-ticket statements as:

```
CROSS_TENANT        src/app/api/mobile/support/ticket/route.ts: [39]
DECORATIVE_GUC_GAP  src/app/api/mobile/support/ticket/route.ts: [97]
```

So MOBILE_API was 47f/84s at audit time and is 47f/83s now. The five mechanical assertions:

| # | assertion | result |
|---|---|---|
| 1 | census MOBILE_API row | **CORRECTED**: it reads 47f/83s, because it post-dates the routing. The `CROSS_TENANT 1` is in the 211-audit transcription, not in the census. |
| 2 | `support/ticket/route.ts:39` absent from the current inventory | **TRUE** — the only executable statement in that file is at line 97 |
| 3 | `2f92a25a` names the file and removes the bypass at line 39 | **TRUE** — see below |
| 4 | line 97 survives and is in the inventory | **TRUE** |
| 5 | all 83 survivors are `TENANT_KNOWN_UNSCOPED` | **TRUE** — so **zero** go to `getAdminDb` |

Git evidence, reproduced:

```
$ git log --oneline 2f92a25a -1
2f92a25a fix(616-02): B7 — a real sequence for TKT-NNNN, replacing a cross-tenant max in two racing copies

$ git show 2f92a25a^:apps/web/src/app/api/mobile/support/ticket/route.ts | sed -n '36,42p'
   * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
   */
  const result = await prisma.$transaction(async (tx) => {          <- line 38
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;   <- LINE 39
    return tx.supportTicket.findFirst({

$ git show 2f92a25a -- .../mobile/support/ticket/route.ts | grep '^-' | grep -i 'bypass\|set_config\|transaction'
-   * @bypass_rls reason: mobile-api
-   * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
-  const result = await prisma.$transaction(async (tx) => {
-    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

$ grep -n "bypass_rls" apps/web/src/app/api/mobile/support/ticket/route.ts
37: * It carried `@bypass_rls reason: mobile-api` with        <- PROSE
97:      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;   <- the survivor
```

---

## 4. The read/write split, and the second argument resolved FROM THE CODE

### What the second argument does today

`getTenantPrismaForOrg(tenantId, userId?)` → `createTenantClient(tenantId, userId ?? null)` →
`.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId))`.

`withAuditColumns`, quoted verbatim from `lib/db/extensions/audit-columns.ts`:

```ts
async $allOperations({ operation, model, args, query }) {
  // No session user → never inject (caller supplies explicitly if needed).
  if (userId == null) {
    return query(args);
  }
  ...
  const injectOnData = (data, fields) => {
    const next = { ...data };
    for (const f of fields) {
      if (next[f] === undefined) {
        next[f] = userId;          // <- injected ONLY when the caller did not supply it
      }
    }
    return next;
  };
```

Detection rule, also quoted: `createdById` first, else `createdBy`, else null; same for the update
side. `617-mobile-inventory.ts` replays exactly that rule over `prisma/schema.prisma`.

### The measured split

| | statements | operations |
|---|---:|---:|
| total | **83** | 142 model operations inside the 83 transaction callbacks |
| pure-read statements (userId inert) | **53** | — |
| write operations | — | **30** |
| writes where passing `userId` **would** newly populate a column | — | **26** |
| writes where it would change nothing | — | **4** |

The four that would change nothing, with the reason the script derived:

```
User.update          — User carries neither audit convention — no injection
PayrollRecord.create — nothing new would be written (the call site already supplies createdById)
Truck.create         — nothing new would be written (the call site already supplies createdById)
DriverInvitation.updateMany / others as recorded per-record in 01-inventory.json
```

### The models that would newly gain audit columns

Every write below today passes no audit field and would start writing one the moment `userId` were
passed. Column names from the schema, not guessed:

| model | operation(s) | would gain |
|---|---|---|
| `Document` | create | `createdById` + `updatedById` |
| `DriverHOSEntry` | create, update | `createdById` + `updatedById` |
| `DriverIncident` | create | `createdById` + `updatedById` |
| `Load` | create, update ×4 | `createdById` + `updatedById` |
| `FleetMessage` | create ×4 | `createdById` (CREATE_ONLY — no update side) |
| `Customer` | create, update | `createdById` + `updatedById` |
| `DriverInvitation` | create | `createdById` + `updatedById` |
| `FuelRecord` | create | `createdById` (CREATE_ONLY) |
| `Invoice` | create | `createdById` + `updatedById` |
| `Route` | create, update | `createdById` + `updatedById` |
| `Truck` | update | `updatedById` |
| `MaintenanceEvent` | create ×2 | `createdById` + `updatedById` |
| `ScheduledService` | create, update | `createdById` + `updatedById` |
| `SupportTicket` | create | `createdById` + `updatedById` |

**26 of 30 write operations, across 26 of the 47 files. That is the majority of the diff, not an
edge case.**

---

## 5. quick-588's two writing files — CHECKED and REPORTED, not fixed

All five `api/mobile/carrier/*` files quick-588 routed pass `getTenantPrismaForOrg(auth.tenantId,
auth.userId)` — confirmed by grep, five call sites, all two-argument.

**`carrier/driver/dispatches/[id]/expenses/route.ts` → `tx.carrierExpense.create`:**

- `CarrierExpense` carries `createdById String? @map("created_by_id")` and
  `updatedById String? @map("updated_by_id")` (schema.prisma:2896–2897).
- It is **not** in `EXEMPT_AUDIT_MODELS` (`CarrierExpense` is in `withTenantRLS`'s `EXEMPT_MODELS`,
  which is a different list and does not affect the audit extension).
- The `data` block passes `dispatchId, expenseType, amount, currency, paidBy, driverId,
  reimbursable, notes, stopId, orgId, submittedAt` — **no audit field**.

**Verdict: yes. quick-588 began populating `carrier_expenses.created_by_id` and `updated_by_id` on a
routing commit, without saying so.** Reported, not fixed — that file is outside this task's 47 and
outside its limits.

**`carrier/driver/stops/[stopId]/documents/route.ts` → `tx.carrierDocument.create`:** `CarrierDocument`
carries `uploadedBy`, which is **neither** audit convention, so nothing is injected. Inert.

**Staging cannot corroborate either way**: `SELECT count(*) AS total, count(created_by_id) AS
with_creator FROM carrier_expenses` returns `{total: 0, with_creator: 0}`. The table is **empty on
staging**, so there is nothing to read and nothing is inferred from the emptiness.

So quick-588's disagreement with quick-610 is three-fifths inert (pure reads), one-fifth inert
(`CarrierDocument`), and **one-fifth an unannounced audit-column write**.

---

## 6. RULE 2 AS APPLIED: `userId` is OMITTED across all routed files

`getTenantPrismaForOrg(auth.tenantId)` — one argument, everywhere, so the rule on the diff is one
rule and not forty-seven judgements.

**The divergence from quick-588 is deliberate and is stated in the code.** quick-588 passes
`auth.userId` on the same surface; §5 above shows that on one of its five files that silently
started writing two columns. quick-610's rule is the one being followed here, quoted:

> the wrapper choice is load-bearing … `getTenantPrisma()` forwards `session.userId` into the
> audit-columns extension, which `createTenantClient(tenantId)` never did, so it would start writing
> `createdById`/`updatedById` on `DocumentRepository#create` — **a behaviour change wearing a routing
> fix's clothes**.

Two consequences, stated rather than left implicit:

- **Audit columns that are NULL today stay NULL.** This task does not improve them; it *declines* to
  change them. Populating them is a separate, deliberate task — and on 14 models at once, it is not a
  small one.
- **`withTenantRLS` still applies.** Omitting `userId` disables only the audit extension. The tenant
  filter is untouched.

---

## 7. THE FINDING THIS TASK DID NOT EXPECT — `findUnique` + a `select` that omits `tenantId`

`withTenantRLS` cannot add `tenantId` to a `findUnique` where (Prisma requires unique-only), so it
runs the query and post-checks the **result**:

```ts
case 'findUnique': {
  const result = await query(args);
  if (result && (result as any).tenantId !== tenantId) {
    return null;                       // treat cross-tenant record as not found
  }
  return result;
}
```

If the call carries a top-level `select` that omits `tenantId`, the field is absent from `result`,
`undefined !== tenantId` is **true**, and the row is discarded — **for its own tenant**. Every such
call returns `null` forever.

**MEASURED on staging as `app_user`, tripwire armed, in a cold process, on TWO independent models**
(`617-routing-verify.ts --guc-probe`, transcript in `02-single-file-proof.md`):

```
finduniq-select-hazard        selectWithoutTenantId: null
                              selectWithTenantId:    { id: 617a…, tenantId: b5623cdd… }
                              noSelect:              { id: 617a… }
                              privilegedCounterRead: 1      hazardConfirmed: true

finduniq-select-hazard-truck  selectWithoutTenantId: null          (PRE-EXISTING row, not a fixture)
                              selectWithTenantId:    { id: 610a…, tenantId: b5623cdd… }
                              hazardConfirmed: true
```

**Ten MOBILE_API statements across EIGHT files have exactly this shape**, all of them followed by
`if (!x) return 404 / null / throw NOT_FOUND`:

| file | line | model | top-level select |
|---|---:|---|---|
| `driver/loads/[id]/revert/route.ts` | 62 | Load | `{id, driverId, status}` |
| `driver/loads/[id]/status/route.ts` | 101 | Load | `{id, driverId, status}` |
| `owner/loads/[id]/assign-truck/route.ts` | 58 | Load | `{id}` |
| `owner/loads/[id]/route.ts` | 178 | Load | 20-field payload **returned to the client** |
| `owner/routes/[id]/route.ts` | 143 | Route | `{id}` |
| `owner/trucks/[id]/maintenance/route.ts` | 42 | Truck | `{id}` |
| `owner/trucks/[id]/maintenance/route.ts` | 160 | Truck | `{id}` |
| `owner/trucks/[id]/route.ts` | 205 | Truck | `{id}` |
| `owner/trucks/[id]/scheduled-service/route.ts` | 86 | Truck | `{odometer}` |
| `owner/trucks/[id]/scheduled-service/route.ts` | 208 | Truck | `{odometer}` |

**These 8 files are STOPPED AND REPORTED (Rule 8) and are NOT routed by this task.** Routing them
would change what the statement returns on success from *the row* to *null* — a far larger violation
of this task's own limit than leaving them alone. Leaving them alone changes nothing about them at all.

Two candidate remedies, per site, for the follow-up task to decide between — **not applied here**:

1. **Add `tenantId: true` to the select** — correct for the nine sites whose result is an internal
   ownership guard tested for truthiness. Externally invisible, but it is still a change to what the
   statement returns, which is why it is a decision and not a repair.
2. **`findUnique` → `findFirst`** — `findFirst` gets the AND-injection path instead of the post-hoc
   check, so the select is irrelevant. Required thinking for `owner/loads/[id]/route.ts:178`, whose
   selected object IS the response body and must not gain a field.

### The larger, separate finding: 24 LIVE call sites elsewhere carry the identical shape

`apps/web/scripts/audit/617-finduniq-scan.ts`, receiver-aware:

```
files scanned: 1555   EXEMPT_MODELS lifted: 27
TOTAL findUnique + top-level select omitting tenantId, non-exempt model: 56
  LIVE TODAY (receiver resolves to a tenant client): 24
  under api/mobile/ (POSITIVE CONTROL, expect >= 10): 10
```

including `(owner)/actions/loads.ts` ×7, `(owner)/actions/invoices.ts` ×2,
`(owner)/actions/routes.ts`, `(owner)/actions/maintenance.ts`, `(owner)/actions/payroll.ts`,
`(driver)/my-tickets/[id]/page.tsx`, `lib/email/send-fleet-message-notifications.ts`. The receivers
there resolve to tenant clients — in `loads.ts` via `const prisma = await getTenantPrisma()`, which
**shadows the module-level import**.

**Reported, NOT fixed, and NOT touched — every one of them is outside `api/mobile/**`.** Two honest
caveats on it:

- the measurement is on `DriverIncident` and `Truck`; the mechanism is model-agnostic and
  application-layer, so the same shape on `Load` is expected to behave identically — but *expected*
  is not *measured*, and each site needs its own confirmation;
- a **file-level** "does this file acquire a tenant client" flag is not good enough. The first
  version of this scan reported 28 and was wrong: `(owner)/actions/loads.ts:273` looked live because
  the file acquires a tenant client *somewhere*, and the receiver at that line had to be resolved to
  know. quick-602's rule — a grep says what a file CONTAINS, never what a statement USED.

---

## 8. What is routed by this task

| sub-surface | files | statements | routed | stopped |
|---|---:|---:|---:|---:|
| support | 1 | 1 | 1 / 1 | — |
| driver | 16 | 21 | 14 / 19 | 2 files / 2 statements |
| owner | 30 | 61 | 24 / 47 | 6 files / 14 statements |
| **total** | **47** | **83** | **39 files / 67 statements** | **8 files / 16 statements** |
