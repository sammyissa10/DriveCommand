---
phase: quick-617
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/src/app/api/mobile/support/ticket/route.ts
  - apps/web/src/app/api/mobile/driver/**/route.ts
  - apps/web/src/app/api/mobile/owner/**/route.ts
  - apps/web/scripts/audit/617-mobile-inventory.ts
  - apps/web/scripts/audit/617-routing-verify.ts
  - .planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/*
  - .planning/quick/617-route-the-mobile-api-surface-to-gettenan/617-SUMMARY.md

must_haves:
  truths:
    - "Step 1 is VERIFIED, not rediscovered: 47 files / 83 statements in the current tree, the census's 84 reconciled to 83 by naming the one statement quick-616 routed and the commit that did it, and all 83 survivors confirmed TENANT_KNOWN_UNSCOPED so nothing goes to getAdminDb."
    - "Every one of the 83 is enumerated by file, line, model and OPERATION (read vs write) by an AST or line-anchored parse — never a bare grep — with an anti-vacuity floor and a counter-assertion that a mobile file known NOT to carry a bypass is confirmed read and confirmed to yield zero."
    - "The SECOND-ARGUMENT question is resolved from the code, not from recall: what getTenantPrismaForOrg's userId actually does today, read out of tenant-context.ts and the audit-columns extension, and stated per statement class."
    - "Every WRITING statement is checked against the audit-columns registry: whether passing userId would newly populate a column that is NULL today. Where it would, userId is OMITTED — a behaviour change is never shipped silently inside a routing task."
    - "The divergence from quick-588's precedent (which passes userId on the same surface) is stated and explained, including whether quick-588 itself introduced an unannounced audit-column write."
    - "ONE representative file is proven end to end on staging as app_user with the tripwire armed BEFORE any other file is touched, and its before/after and probe output are QUOTED in the summary."
    - "The GUC question specific to this shape is MEASURED: that app.current_tenant_id, set session-scope on the bare client by getTenantPrismaForOrg, is visible to statements inside a subsequent tenantPrisma.$transaction() callback — because all 83 statements live inside $transaction callbacks and no prior task measured that combination."
    - "Every existing tenantId/orgId where clause is KEPT — defence in depth alongside RLS — and a mechanical post-check asserts the surface's tenant-predicate occurrence count did not fall."
    - "Any file that does not fit the pattern is STOPPED AND REPORTED, never improvised around, and every deviation is named with its reason."
    - "The proof runs on staging as app_user with bypass_rls_policy TEMPORARILY DROPPED on the affected tables, restored in a finally from DDL captured before the drop, with the restore verified by a SORTED TABLE LIST hash compared against PRODUCTION's — never by a count."
    - "Teardown never uses process.kill: the finally is proven by an explicit --throw-after-drop path plus a self-healing pre-flight that runs in the next process."
    - "Every probe cell runs in its OWN transaction, SQLSTATE is read off err.cause.code never err.code, every zero carries a privileged counter-read, and every foreign === 0 is paired with own > 0."
    - "The click-through harness RUNS and reports entries, pass, fail, not-reachable and TC001 count, with the four-part counter-assertion proving the tripwire was actually armed — because zero TC001 is exactly what a DISARMED tripwire looks like."
    - "The vitest AFTER run uses the SAME reporter as the captured baseline and is compared by failing-FILE SET against failing-files.txt, never against a remembered number."
    - "The BATCH-SIZE VERDICT is answered honestly with git diff --stat numbers, and if 47 files in one task did not produce a reviewable diff the plan for the remaining surfaces is revised downward and said so plainly."
    - "The repo-wide bypass remainder is reconciled with the arithmetic shown: 177 census − 2 routed by 616 = 175 at task start, − 83 here = 92 expected."
    - "Production is never written. apps/web/.env.staging is never echoed and every connection string and key is masked everywhere it is printed."
  artifacts:
    - path: ".planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/01-inventory.json"
      provides: "Per-statement inventory — file, line, model, operation, read/write, audit-field verdict — driving Tasks 2, 3 and 4"
      contains: "operation"
    - path: ".planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/01-inventory.md"
      provides: "The 84 → 83 reconciliation, the read/write split, and the second-argument decision with its evidence"
      contains: "2f92a25a"
    - path: ".planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/02-single-file-proof.md"
      provides: "The quoted before/after of ONE file plus its staging probe output, produced BEFORE the bulk edit"
      contains: "TC001"
    - path: ".planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/03-routing.md"
      provides: "The per-sub-surface application record, the tenant-predicate count assertion, and every stop-and-report deviation"
      contains: "tenant-predicate"
    - path: ".planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/04-proof.md"
      provides: "Both-directions proof per sub-surface with bypass_rls_policy dropped, plus the capture/restore verification against production's hash"
      contains: "sorted"
    - path: "apps/web/scripts/audit/617-routing-verify.ts"
      provides: "The capture/drop/probe/restore harness with the --throw-after-drop proof and the self-healing pre-flight"
      contains: "throw-after-drop"
    - path: ".planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/05-click-through.md"
      provides: "Harness run with the four-part arming counter-assertion and the comparison against quick-616's 66/60/0/0"
      contains: "armed"
    - path: ".planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/06-gates.md"
      provides: "tsc proven-not-blind, build, drift with its target named, vitest AFTER by failing-FILE SET, the batch-size verdict and the remainder arithmetic"
      contains: "92"
  key_links:
    - from: "apps/web/src/app/api/mobile/**/route.ts"
      to: "getTenantPrismaForOrg"
      via: "import from @/lib/context/tenant-context, acquired AFTER auth"
      pattern: "getTenantPrismaForOrg\\("
    - from: "apps/web/src/app/api/mobile/**/route.ts"
      to: "the bypass flag"
      via: "deleted in the same edit as the acquisition"
      pattern: "app\\.bypass_rls"
---

<objective>
Route the MOBILE_API surface — 47 files, 83 statements, every one of them a
`tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`` inside a `$transaction` callback
on the bare `prisma` client — to `getTenantPrismaForOrg`, deleting the bypass flag in the same edit
and keeping every tenant predicate.

Purpose: MOBILE_API is the single largest surface in the quick-616 census (83 of 175 live statements,
47 % of the remaining population). Until it is routed, `bypass_rls_policy` cannot be dropped and the
`app_user` cutover stays blocked. It is also the surface with the most uniform shape, so it is the
one where a single proven pattern goes furthest.

Output: 47 routed files, a per-statement inventory, a single-file proof quoted before the bulk edit,
a both-directions staging proof with the bypass policy dropped, a click-through run, the gates, and
an honest verdict on whether 47 files in one task was reviewable.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@.planning/quick/616-route-the-bypass-flagged-statements-befo/616-SUMMARY.md
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/db/extensions/audit-columns.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts
@apps/web/scripts/audit/616-routing-verify.ts
@apps/web/scripts/audit/616-bypass-census.ts

Machine-readable, and the thing to drive the work from:
`.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.json`
</context>

<what_planning_measured>

Measured during planning, at revision `5437177a`, tree clean. **These are inputs the executor
verifies, not verdicts it inherits** — but they are specific enough that a disagreement is a finding
worth reporting rather than a routine correction.

### A. The population is uniform in a way no other surface is

All **83** MOBILE_API census records carry `callee: "tx.$executeRaw"`. Every single one. There is no
`$executeRawUnsafe`, no array-form `$transaction`, no bare-client `set_config`. The shape is:

```ts
const data = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`
  ... model calls on tx, all carrying tenantId in their where ...
}, TX_OPTIONS)
```

That uniformity is what makes a 47-file batch arguable at all. **If Task 1 finds a statement that is
not this shape, that is the first stop-and-report.**

### B. Sub-surface breakdown, counted from the census

| sub-surface | files | statements |
|---|---:|---:|
| `api/mobile/carrier/**` | **0** | **0** — quick-588 already routed all 5 files |
| `api/mobile/support/**` | 1 | 1 |
| `api/mobile/driver/**` | 16 | 21 |
| `api/mobile/owner/**` | 30 | 61 |
| **total** | **47** | **83** |

### C. 26 of the 47 files carry a WRITE, and that makes fact F decisive

Grepped for `tx.<model>.(create|createMany|update|updateMany|upsert|delete|deleteMany)` across the 47:

```
driver/documents/route.ts                      tx.document.create
driver/hos/route.ts                            tx.driverHOSEntry.update, .create
driver/incidents/route.ts                      tx.driverIncident.create
driver/loads/[id]/revert/route.ts              tx.load.update
driver/loads/[id]/status/route.ts              tx.load.update
driver/messages/route-thread/route.ts          tx.fleetMessage.create
driver/messages/route.ts                       tx.fleetMessage.create
owner/crm/[id]/route.ts                        tx.customer.update
owner/customers/route.ts                       tx.customer.create
owner/drivers/[id]/route.ts                    tx.user.update
owner/drivers/invite/route.ts                  tx.driverInvitation.updateMany, .create
owner/fleet/messages/[recipientId]/route.ts    tx.fleetMessage.create
owner/fleet/messages/route.ts                  tx.fleetMessage.create
owner/fuel/route.ts                            tx.fuelRecord.create
owner/invoices/route.ts                        tx.invoice.create
owner/loads/[id]/assign-truck/route.ts         tx.load.update
owner/loads/[id]/route.ts                      tx.load.update
owner/loads/route.ts                           tx.load.create
owner/payroll/route.ts                         tx.payrollRecord.create
owner/routes/[id]/route.ts                     tx.route.update
owner/routes/route.ts                          tx.route.create
owner/trucks/[id]/maintenance/route.ts         tx.maintenanceEvent.create
owner/trucks/[id]/route.ts                     tx.truck.update
owner/trucks/[id]/scheduled-service/route.ts   tx.scheduledService.create, .update, tx.maintenanceEvent.create
owner/trucks/route.ts                          tx.truck.create
support/ticket/route.ts                        tx.supportTicket.create
```

**26 of 47 files. This is not an edge case — it is the majority of the diff.** A bare grep is not
the method Task 1 uses; this is planning's sizing estimate and Task 1 supersedes it with an AST count.

### D. What the second argument actually does — read out of the code during planning

`getTenantPrismaForOrg(tenantId, userId?)` → `createTenantClient(tenantId, userId ?? null)` →
`.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId))`.

`withAuditColumns` (read in full):
- `if (userId == null) return query(args)` — **no injection at all when the argument is omitted.**
- Otherwise, for `create` / `createMany` / `createManyAndReturn` / `update` / `updateMany` / `upsert`,
  it injects `createdById`/`updatedById` (or the older `createdBy`/`updatedBy`) **when the field is
  `undefined` in `args.data`**, i.e. when the caller did not supply it.
- Skipped only for `EXEMPT_AUDIT_MODELS` and models carrying neither convention.
  `FleetMessage` and `FuelRecord` are `CREATE_ONLY_AUDIT_MODELS` — create-side only, still injected.

Spot-checked against the schema: `DriverIncident` carries `createdById String?` and `updatedById
String?` and is **not** exempt. So `driverIncident.create` — which today passes `tenantId`,
`driverId`, `category`, `severity`, `description`, `latitude`, `longitude`, `photoS3Key`,
`reportedAt` and **no audit columns** — would start writing `createdById` the moment `userId` is
passed.

**That is a behaviour change. Under this task's own limits — "do not change what any statement
returns on success" is the weaker sibling of "do not change what any statement WRITES" — it must not
ship inside a routing task.** Task 1 makes this a per-statement verdict rather than a spot-check.

### E. quick-588's precedent is weaker than it looks, and may itself carry the defect

The five `api/mobile/carrier/*` files quick-588 routed all pass
`getTenantPrismaForOrg(auth.tenantId, auth.userId)`. Three of the five are pure reads, where the
second argument is inert. **Two are not:**

- `carrier/driver/dispatches/[id]/expenses/route.ts` → `tx.carrierExpense.create`. `CarrierExpense`
  carries `createdById` / `updatedById` and is not in `EXEMPT_AUDIT_MODELS`.
- `carrier/driver/stops/[stopId]/documents/route.ts` → `tx.carrierDocument.create`. `CarrierDocument`
  carries `uploadedBy`, which is **neither** audit convention — so no injection there.

So quick-588 plausibly began populating `carrier_expenses.created_by_id` on a routing commit without
saying so. **Task 1 must check this and report it. It is NOT this task's to fix** — those files are
already routed and are outside the 47 — but it is the reconciliation that turns "quick-588 disagrees
with quick-610" into "quick-588's disagreement was three-fifths inert and two-fifths unexamined".

### F. A GUC question specific to this shape that NO prior task has measured

`getTenantPrismaForOrg` sets `app.current_tenant_id` with `set_config(..., false)` — **session scope,
on the bare `prisma` client, as a single autocommit statement, before the extended client is
returned**. Every one of the 83 statements then runs inside `tenantPrisma.$transaction(async tx =>
...)`.

Nothing in quick-588, quick-602, quick-610 or quick-616 measured **"is the session GUC visible to
statements inside a later interactive transaction on the extended client"**. quick-588 shipped the
shape but its own comment argues the swap was *receiver-only* because its models are `EXEMPT_MODELS`
— i.e. quick-588 explicitly did **not** rely on the database-level policy seeing the GUC.

The MOBILE_API models are the opposite: `Load`, `Route`, `Truck`, `Customer`, `Invoice`, `User`,
`Document`, `FleetMessage`, `DriverHOSEntry`, `DriverIncident` all carry `tenantId` and are **not**
exempt, so both layers engage. If the GUC does not reach inside the transaction, every routed
statement raises `TC001` (tripwire armed) or returns zero rows (tripwire off) **in production**.

**This is the single highest-consequence unknown in the task and Task 2 measures it FIRST, before
any edit is judged correct.** If it turns out false, the pattern changes to `tenantRawQuery`'s shape
(a transaction-scoped `set_config('app.current_tenant_id', ..., TRUE)` as the transaction's first
statement) and the task stops and reports before touching 46 more files.

### G. Files that are deviation candidates — inspect individually before editing

Statement counts above 3 in one file mean multiple `$transaction` blocks, possibly nested, possibly
across several exported handlers:

| file | statements | lines |
|---|---:|---|
| `owner/fleet/messages/[recipientId]/route.ts` | 7 | 50, 126, 143, 153, 164, 243, 286 |
| `owner/fleet/messages/route.ts` | 6 | 44, 93, 115, 129, 278, 303 |
| `owner/loads/[id]/route.ts` | 4 | 53, 177, 206, 243 |
| `owner/drivers/invite/route.ts` | 4 | 68, 81, 106, 126 |
| `owner/trucks/[id]/scheduled-service/route.ts` | 3 | 84, 206, 319 |

`owner/drivers/invite/route.ts` additionally touches Supabase Auth user creation — see the
`project_supabase_auth_email_global_unique` memory — and is the most likely genuine stop-and-report.

### H. TWO recorded hashes of the same list, under two algorithms — reconcile, do not assume

The orchestrator's brief states the staging sorted-table-list hash as
`29498ef6e52f51dcc02461a1abbb84b0` — 32 hex characters, i.e. **MD5 length**. quick-616's own harness
records a **sha256** in `evidence/05-bypass-policy-count.txt`:

```
sha256(before) : 0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
sha256(after)  : 0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
VERDICT: PASS — 86 before, 86 after, identical sorted list
```

and `616-routing-verify.ts:339` computes `sortedTableListSha256` with `createHash('sha256')`.

**Both are real.** The brief's value is recorded at `.planning/STATE.md:966`, from the orchestrator's
own independent re-verification of quick-616 against production as the untouched reference — a
different algorithm over what is presumably the same list. So there is no contradiction to resolve,
but there IS a trap: **`617-routing-verify.ts`, inherited from `616-routing-verify.ts`, computes
sha256 and will never print the brief's figure.** An executor comparing its output against the brief
will see a mismatch that means nothing.

**Task 4 therefore: re-derive the sorted table list from staging AND from production, hash it under
BOTH algorithms, and record all four values.** State whether staging matches production — that is the
claim that matters — and state which recorded figure each algorithm reproduces. Do not adopt a
remembered hash as ground truth, and do not read an algorithm mismatch as drift.

### H-bis. A method warning, earned during planning, that binds Tasks 1, 3 and 6

Planning initially reported that `29498ef6` **appeared nowhere in the repo**, on the strength of a
content search over `.planning/` that returned "No matches found". That was wrong. A repo-wide
`grep -rn` found it immediately, at `.planning/STATE.md:966` — **a single line 7,362 characters
long**, which the first instrument silently declined to match. The plan above has been corrected in
place; this note records why.

The lesson is this repo's recurring one wearing a new instrument: **the failure mode of a bad scan is
an empty result, and an empty result is indistinguishable from a true absence.** Any scan in this
task that concludes "zero" — Task 1's counter-assertion, Task 3's post-edit
`grep -c "app.bypass_rls"`, Task 5's TC001 count, Task 6's repo-wide remainder — must carry a
**positive control in the same run**: a pattern known to be present, asserted found, by the same
instrument over the same corpus. A zero with no paired non-zero is not a measurement. Prefer
`grep -rn` over an editor-integrated search for any absence claim, and state which instrument produced
each number.

### I. The baseline is captured and pinned

`.planning/quick/_617_baseline/` at revision `5437177a`, tree clean:

```
tests: 2129 · passed: 2010 · failed: 64 · pending: 52 · failing FILES: 25
```

`failing-files.txt` lists the 25. **Note that `driver-incident-report-persists.test.ts` is already in
that set** — relevant because Task 2's proof file is `driver/incidents/route.ts`. Its status must not
change in either direction without an explanation.

</what_planning_measured>

<the_decision_rules>

These are decided. The executor implements them and reports evidence; it does not re-litigate them
unless its own measurement contradicts them, in which case it stops and reports.

**Rule 1 — Receiver.** `getTenantPrismaForOrg`. Nothing goes to `getAdminDb`: every statement has a
verified tenant in hand, all 83 are `TENANT_KNOWN_UNSCOPED`, and the user prohibited it.

**Rule 2 — The second argument.** **Omit `userId` by default** (quick-610's rule), unless Task 1's
per-statement audit-field verdict proves that for a given file passing it changes nothing. A file
containing only reads may pass it or omit it; **be consistent and omit it everywhere**, so the rule
on the diff is one rule and not forty-seven judgements. State this divergence from quick-588 and why.

Two consequences to state in the summary rather than leave implicit:
- Audit columns that are NULL today stay NULL. This task does not improve them; it declines to
  change them. Populating them is a separate, deliberate task.
- `withTenantRLS` still applies — omitting `userId` disables only the audit extension, never the
  tenant filter.

**Rule 3 — The `where` clause is KEPT.** Every `tenantId` / `orgId` / `driverId` predicate stays
exactly as it is. It is defence in depth alongside RLS, not a redundancy. Removing it takes the app
from two layers to one. Task 3 asserts this mechanically.

**Rule 4 — The bypass flag goes in the same edit.** The acquisition and the deletion are one change.
A file that acquires a tenant client and keeps the flag is strictly worse than either alone.

**Rule 5 — The `$transaction` stays.** quick-588's shipped precedent is `prisma.$transaction(...)` →
`tenantPrisma.$transaction(...)`: same wrapper, same `TX_OPTIONS`, only the receiver and the deleted
first line change. Keeping it is the smaller diff, preserves atomicity where a route depends on it,
and keeps the emitted SQL shape identical apart from the removed `set_config`. **Do not collapse a
single-statement transaction into a bare call** — that is a second change wearing a routing fix's
clothes, and it changes failure semantics.

**Rule 6 — Acquisition goes AFTER auth and AFTER the rate limit, before the transaction.** It must
sit below `withMobileAuth`'s destructure / `validateMobileToken`'s null check, so a tenant client is
never acquired for an unauthenticated request.

**Rule 7 — Comment convention, following quick-588.** One block above the acquisition naming
quick-617, why `getTenantPrismaForOrg` and not `getTenantPrisma` (`/api/mobile/*` sends no
`x-tenant-id`, DEC-11), that the `where` predicates are unchanged, and — where it applies — that
`userId` is deliberately omitted so audit columns are not newly populated. Keep it short; forty-seven
copies of a long comment is noise.

**Rule 8 — Anything else is a STOP-AND-REPORT.** Do not improvise. Record the file, the shape, why it
does not fit, and what it would need. A deviation left un-routed and reported is a good outcome; a
deviation routed by guesswork is not.

</the_decision_rules>

<tasks>

<task type="auto">
  <name>Task 1: Verify step 1, enumerate the 83 with read/write, and resolve the second argument — NO EDITS</name>
  <files>
apps/web/scripts/audit/617-mobile-inventory.ts
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/01-inventory.json
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/01-inventory.md
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/00-baseline/
  </files>
  <action>
**No source file under `src/` is edited in this task.**

**1a — Move the baseline into the task's own evidence.** `git mv` or copy
`.planning/quick/_617_baseline/{baseline.json,baseline.log,failing-files.txt}` into
`evidence/00-baseline/`, remove the stray `_617_baseline` directory, and record in
`01-inventory.md` the revision it was captured at (`5437177a`), the tree state (clean) and the
headline figures (2129 / 2010 / 64 / 52 / 25 failing files). **Do not re-run vitest here.** Four
tasks in this series published a baseline measured against the wrong revision; this one is pinned and
on disk, and re-measuring it would re-open exactly that.

**1b — Build `617-mobile-inventory.ts`.** Method: `ts.createSourceFile` per file, no `Program`, no
type checker — the same method as `616-bypass-census.ts`, which is in context and should be read
first and reused rather than re-derived. A *statement* is a `CallExpression` or
`TaggedTemplateExpression` whose own literal children contain `app.bypass_rls`. Comments are not AST
nodes and are excluded by construction. **Do not use a bare grep**: quick-616 measured that a naive
count over this surface gives 369 because every enclosing `$transaction` counts again.

Scope: `apps/web/src/app/api/mobile/**`, excluding test paths.

For each statement record: `file`, `line`, `enclosingFunction` (the exported handler), `subSurface`
(`support` | `driver` | `owner` | `carrier`), the receiver the `$transaction` is called on, and the
list of **model operations inside that transaction callback** with, per operation, `model`,
`operation`, and `isWrite` (`create|createMany|createManyAndReturn|update|updateMany|upsert|delete|deleteMany`).

For each write operation additionally record, by reading `prisma/schema.prisma` (or the DMMF):
`createField` / `updateField` per the audit-columns registry's own detection rule (`createdById`
else `createdBy` else null; same for update), whether the model is in `EXEMPT_AUDIT_MODELS` or
`CREATE_ONLY_AUDIT_MODELS`, and **whether the call site already supplies that field explicitly in
`data`**. From those three, derive `userIdWouldChangeBehaviour: true|false`.

**1c — Anti-vacuity, mandatory, and it must be in the JSON.**
- FLOOR: statements >= 80 and files >= 45 (the census says 83/47; a floor below the expected value
  catches a broken walker without pinning the answer).
- POSITIVE WITNESS: `api/mobile/driver/hos/route.ts` yields >= 2 statements.
- **COUNTER-ASSERTION, two halves.** Pick `api/mobile/carrier/driver/dispatches/route.ts` — a mobile
  file quick-588 already routed. Assert (i) the file **was read** (`bytes > 0`, `parsed === true`)
  and (ii) it yields **exactly zero** bypass statements. Half (i) alone proves nothing; half (ii)
  alone is satisfied by a walker that reads nothing. Both, or the guard is decorative.
- CRLF: normalise `\r\n` → `\n` before any offset arithmetic. This repo is `core.autocrlf=true` with
  no `.gitattributes`; quick-546 lost an assertion to exactly this and the failure mode was green.

**1d — The 84 → 83 reconciliation.** Assert, mechanically:
- the census's MOBILE_API row is `CROSS_TENANT 1f/1s + TENANT_KNOWN_UNSCOPED 47f/83s = 47f/84s`;
- `api/mobile/support/ticket/route.ts:39` — the mobile `generateTicketNumber` copy — is **absent**
  from the current tree's inventory;
- `git log --oneline 2f92a25a -1` and `git show 2f92a25a --stat` name that file, and
  `git show 2f92a25a -- apps/web/src/app/api/mobile/support/ticket/route.ts` shows the bypass at
  line 39 being removed;
- line 97 in that same file **survives** and is in the inventory.
- all 83 survivors carry `category: TENANT_KNOWN_UNSCOPED` in the census — so **zero** go to
  `getAdminDb`.

If any of those five is false, that is the finding and the task stops there and reports it.

**1e — Resolve the second argument from the code.** Read `lib/context/tenant-context.ts`,
`lib/db/tenant-client.ts` and `lib/db/extensions/audit-columns.ts` and write down, in
`01-inventory.md`, **what the second argument does today** — quoting the `if (userId == null) return
query(args)` short-circuit and the injection rule. Then join that to the inventory and produce:

- the count of statements that are pure reads (userId inert),
- the count that write, split into `userIdWouldChangeBehaviour: true` and `false`,
- **the named list of models that would newly gain audit columns**, with column names.

**1f — Check quick-588's two writing files and REPORT.** For
`carrier/driver/dispatches/[id]/expenses/route.ts` (`carrierExpense.create`) and
`carrier/driver/stops/[stopId]/documents/route.ts` (`carrierDocument.create`): does the create supply
the audit field explicitly? Is the model exempt? Did quick-588 therefore start populating
`carrier_expenses.created_by_id` on a routing commit? **Report the answer. Do not change those
files** — they are outside the 47 and outside this task's limits. If a staging read of
`carrier_expenses` can show `created_by_id` non-null on rows created after quick-588's commit date,
say so; if the table is empty on staging, say **that**, and do not infer.

**1g — State the rule.** Conclude `01-inventory.md` with Rule 2 as applied: `userId` is omitted
across all 47 files; the divergence from quick-588 is named; the reason is quick-610's, quoted; and
the cost (audit columns stay NULL) is stated as a declined change rather than an oversight.
  </action>
  <verify>
`npx tsx apps/web/scripts/audit/617-mobile-inventory.ts` exits 0 with every anti-vacuity check
`pass: true`. `evidence/01-inventory.json` exists, contains 83 statement records across 47 files,
every record carries `operations[]` with `isWrite`, and every write carries
`userIdWouldChangeBehaviour`. `evidence/00-baseline/failing-files.txt` exists and lists 25 files.
`.planning/quick/_617_baseline/` no longer exists.
  </verify>
  <done>
47 files / 83 statements verified in the current tree; the 84 → 83 gap attributed to commit
`2f92a25a` with git evidence, not assertion; all 83 confirmed `TENANT_KNOWN_UNSCOPED` so nothing goes
to `getAdminDb`; the read/write split published with per-write audit-field verdicts; the
second-argument rule decided with the code quoted; quick-588's two writing files checked and
reported; the baseline relocated into the task's evidence and committed.
  </done>
</task>

<task type="auto">
  <name>Task 2: The single-file proof — one file, measured end to end on staging, QUOTED before any bulk edit</name>
  <files>
apps/web/src/app/api/mobile/driver/incidents/route.ts
apps/web/scripts/audit/617-routing-verify.ts
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/02-single-file-proof.md
  </files>
  <action>
**Exactly ONE source file is edited in this task.** The other 46 are not touched until Task 3.

**2a — The file.** `apps/web/src/app/api/mobile/driver/incidents/route.ts`. It is chosen because it
exercises everything in one place: 2 statements (lines 38 and 134), a **GET read**
(`driverIncident.findMany`, `where: { driverId, tenantId }`) and a **POST write**
(`driverIncident.create`), on a model that carries `tenantId` (so `withTenantRLS` injects and the DB
policy engages) **and** carries `createdById`/`updatedById` while the create supplies neither (so it
is the worked example for Rule 2). If Task 1's inventory contradicts any of that, pick the nearest
`driver/**` file that satisfies read + write + non-exempt model, and say why in the evidence.

**2b — MEASURE THE GUC QUESTION FIRST, before deciding the edit is correct.** This is fact F and it
is the highest-consequence unknown in the task.

Write the probe into `617-routing-verify.ts` (start by copying `616-routing-verify.ts` — it already
carries the staging-only env loading, the production refusal, the masked `[db-target]` banner, the
`pg_policies` capture/restore, the sorted-list verification, the `--throw-after-drop` path and the
self-healing pre-flight; **adapt it, do not reinvent it**).

The probe, on staging, as `app_user`, tripwire armed, in a **fresh process**:

1. `await getTenantPrismaForOrg(tenantId)` — no `userId`.
2. Inside `tenantPrisma.$transaction(async tx => ...)`, run
   `SELECT current_setting('app.current_tenant_id', TRUE)` and record what comes back.
3. In the same transaction, run the real `tx.driverIncident.findMany({ where: { driverId, tenantId } })`.

**Three outcomes, three different next steps, and the executor must say which one it got:**
- the GUC reads back the tenant id and the query returns own-tenant rows → **the pattern holds**,
  proceed;
- the GUC reads back `''` or NULL and the query raises `TC001` → **the pattern does NOT hold**.
  STOP. Report. The remedy is `tenantRawQuery`'s shape — a transaction-scoped
  `set_config('app.current_tenant_id', ..., TRUE)` as the callback's first statement — which is a
  materially different 47-file edit and needs the user's decision before 46 more files are touched;
- the GUC reads back a tenant id **that is not the one just set** → a pool-leak finding
  (quick-413/quick-602's class). STOP and report; this is more serious than the task.

**The process must be COLD for this probe** — quick-610's rule: the GUC is session scope on a `max:1`
pool, so the first tenant-touching statement in a process leaves it set for everything after. Run
this probe as the first tenant-touching statement of its own process, or it is measuring something
else. If more than one variant is probed, **one child process per variant.**

**2c — The edit.** Apply the shape, exactly:

```ts
// import added
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
// `prisma` import removed if it becomes unused; TX_OPTIONS import KEPT

// inside the handler, AFTER auth (and after any rate-limit return), BEFORE the transaction:
/*
 * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id (DEC-11),
 * so the header-reading getTenantPrisma() would throw — getTenantPrismaForOrg
 * takes validateMobileToken()'s verified auth.tenantId. userId is deliberately
 * NOT passed: it would drive the audit-columns extension to start writing
 * createdById on DriverIncident, a behaviour change this routing task declines
 * to make. Every where clause below is unchanged — RLS is the second layer, not
 * the replacement for the first.
 */
const tenantPrisma = await getTenantPrismaForOrg(tenantId);
const incidents = await tenantPrisma.$transaction(async (tx) => {
  // the set_config bypass line is DELETED here
  return tx.driverIncident.findMany({ where: { driverId, tenantId }, ... });  // UNCHANGED
}, TX_OPTIONS);
```

And delete the now-false `@bypass_rls reason: mobile-api` docblock — it documents a mechanism that no
longer exists, and a comment asserting an invariant that has been removed is the exact class this
repo has been bitten by three times (quick-547, quick-548, quick-562).

Apply the same to the POST handler.

**2d — Prove it, both directions, with the policy DROPPED.** On staging, as `app_user`, tripwire
armed, `bypass_rls_policy` temporarily dropped on `driver_incidents` — so the proof does not rest on
the policy that is going to be removed later. Per Task 4's rules in miniature:
- **own-tenant read returns > 0 AND foreign-tenant read returns exactly 0** — the pair, always. A
  foreign `0` over an empty foreign set proves nothing; `own > 0` is what makes the `0` mean
  something (quick-610).
- own-tenant **write** succeeds and the row lands with `created_by_id` **still NULL** — the positive
  evidence for Rule 2.
- **one transaction per cell.** A `TC001` aborts the transaction and every later statement in it
  returns `25P02`, which would make one raise look like six.
- SQLSTATE off `err.cause.code`, walking the cause chain — **never `err.code`**, which is `undefined`
  on Prisma's `DriverAdapterError`.
- counts read as a scalar, never `rowCount`.
- staging is sparse: create fixtures on the **privileged** connection, tear down with an asserted
  `left 0`.
- restore the policy in a `finally` from DDL captured **before** the drop, and verify by sorted table
  list, not by count.

**2e — QUOTE IT.** `evidence/02-single-file-proof.md` carries: the full before and after of the
edited regions (not a paraphrase), the GUC probe output verbatim, the both-directions matrix with
actual numbers, the `created_by_id IS NULL` read-back, and the policy capture/restore verification.
**The user requires this quoted before the bulk edit.** It is also quoted again in the summary.

**2f — Commit this file alone**, so the diff that establishes the pattern is reviewable on its own
before 46 more land on top of it.
  </action>
  <verify>
`npx tsx apps/web/scripts/audit/617-routing-verify.ts --run` (single-file mode) exits 0 and prints the
masked `[db-target] project : wyixpgunnjmzguhggocz (staging)` banner. `evidence/02-single-file-proof.md`
contains a verbatim before/after and a probe transcript showing the GUC value read from inside the
transaction, `own > 0`, `foreign === 0`, and a created row with `created_by_id` NULL.
`grep -c "app.bypass_rls" apps/web/src/app/api/mobile/driver/incidents/route.ts` returns 0.
`grep -c "tenantId" apps/web/src/app/api/mobile/driver/incidents/route.ts` is >= its value before the
edit. `npx tsc --noEmit` clean (see Task 6 for the not-blind probe).
  </verify>
  <done>
The GUC-inside-`$transaction` question is MEASURED with its outcome named; one file is routed, proven
both directions with the bypass policy dropped, its write confirmed not to have gained an audit
column, its tenant predicates confirmed intact, the policy confirmed restored by sorted list; the
before/after and the probe output are quoted on disk; the file is committed alone.
  </done>
</task>

<task type="auto">
  <name>Task 3: Apply to the remaining 46, in sub-surface order, one commit per sub-surface</name>
  <files>
apps/web/src/app/api/mobile/support/ticket/route.ts
apps/web/src/app/api/mobile/driver/**/route.ts
apps/web/src/app/api/mobile/owner/**/route.ts
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/03-routing.md
  </files>
  <action>
Drive from `evidence/01-inventory.json`. Apply the pattern proven in Task 2, unchanged.

**Order and commits — three, not one.** The diff must be reviewable in pieces:
1. `support` — 1 file, 1 statement. Commit.
2. `driver` — 15 remaining files, 19 remaining statements (incidents is already done). Commit.
3. `owner` — 30 files, 61 statements. Commit.

**Per file, mechanically:**
- add the `getTenantPrismaForOrg` import; drop the `prisma` import **only if** it becomes unused
  (some files use `prisma` outside the transaction — check, do not assume); keep `TX_OPTIONS`;
- acquire after auth / after rate limit, before the transaction, per Rule 6;
- `prisma.$transaction` → `tenantPrisma.$transaction`, `TX_OPTIONS` unchanged;
- delete the `set_config('app.bypass_rls', ...)` line;
- delete the now-false `@bypass_rls` docblock, add the quick-617 comment;
- **change nothing inside any `where`, `data`, `select`, `include`, `orderBy` or `take`.**

**A file with multiple transactions gets the acquisition ONCE per handler**, reused by every
transaction in that handler — not once per transaction. If two exported handlers in one file both
need it, each acquires its own after its own auth check.

**Deviation candidates — inspect BEFORE editing, and stop rather than improvise (Rule 8):**

| file | statements | what to check |
|---|---:|---|
| `owner/fleet/messages/[recipientId]/route.ts` | 7 | are the transactions nested? do any span handlers? |
| `owner/fleet/messages/route.ts` | 6 | same |
| `owner/loads/[id]/route.ts` | 4 | GET/PATCH/DELETE each with their own? |
| `owner/drivers/invite/route.ts` | 4 | **Supabase Auth user creation mid-transaction.** `auth.users.email` is globally unique across tenants and `createUser` can throw an email-exists error that this route currently handles; check whether a tenant-scoped client changes anything about the `DriverInvitation` half, and whether the create/updateMany pair depends on the transaction's atomicity |
| `owner/trucks/[id]/scheduled-service/route.ts` | 3 | three models in one callback |

Also check for any statement whose transaction callback touches a model in `withTenantRLS`'s
`EXEMPT_MODELS` (carrier models, `Tenant`, `TicketMessage`, `InAppNotification`, the Document Import
four, …). For those the Prisma-level filter does **not** engage and the explicit `orgId`/`ticketId`
predicate plus the DB policy is the whole isolation story — which is fine, and is exactly quick-588's
situation, but it must be **named** in the evidence rather than discovered later.

And check the inverse: a query whose `where` does **not** already carry `tenantId` on a
**non-exempt** model. `withTenantRLS` will now inject it, which narrows the result set. That is the
right direction, but it is a change to what the statement returns on success — **which this task's
limits forbid**. Any such statement is a stop-and-report, with the model, the current `where` and
what the injection would add.

**The mechanical post-check, and it is an assertion not an eyeball.** Before the first edit of each
sub-surface, count tenant-predicate occurrences across that sub-surface's files:

```
grep -oE "\btenantId\b|\borgId\b" <files> | wc -l
```

After the edits, count again. **Assert `after >= before`.** Record both numbers per sub-surface in
`03-routing.md`. A predicate cannot be removed without the number falling, and the number falling is
a hard failure of the task, not a note. (`>=` rather than `==` because the quick-617 comment mentions
`auth.tenantId`, which legitimately raises the count.)

Also assert, per sub-surface, that `grep -c "app.bypass_rls"` over its files returns **0** after.

**`03-routing.md` records:** per sub-surface, files touched, statements removed, the
tenant-predicate before/after pair, the bypass count after, the commit sha; then a **Deviations**
section listing every file that was stopped on, what it is, and what it would need. An empty
Deviations section is an acceptable outcome only if it is the truth — say "none, and here is what was
checked" rather than omitting the heading.
  </action>
  <verify>
`grep -rn "app.bypass_rls" apps/web/src/app/api/mobile/ --include=*.ts` returns **only** prose matches,
if any — zero executable statements, confirmed by re-running `617-mobile-inventory.ts`, which must now
report 0 statements for the routed sub-surfaces (its FLOOR check will need a mode or a flag for the
after-run; keep the counter-assertion active). Per-sub-surface tenant-predicate `after >= before`
asserted and recorded. `npx tsc --noEmit` clean. Three commits exist, one per sub-surface.
  </verify>
  <done>
All 46 remaining files routed or explicitly stopped-and-reported; three reviewable commits; every
tenant predicate provably intact by a recorded count assertion; zero executable bypass statements left
under `api/mobile/`; every deviation named with its reason and what it would need.
  </done>
</task>

<task type="auto">
  <name>Task 4: The proof — staging, app_user, tripwire armed, bypass_rls_policy DROPPED</name>
  <files>
apps/web/scripts/audit/617-routing-verify.ts
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/04-proof.md
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/04-policy-capture.json
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/04-probe-cells.json
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/04-run-transcript.txt
  </files>
  <action>
Extend the harness from Task 2 to the whole surface. **Adapt `616-routing-verify.ts`; do not rewrite
it.**

**4a — Instrument safety, non-negotiable.**
- **Never** import `scripts/_bootstrap-env` — it reassigns `DATABASE_URL = DIRECT_URL`, and in this
  repo `DIRECT_URL` points at **production**. Load `apps/web/.env.staging` explicitly, as
  `616-routing-verify.ts:120` does.
- Refuse **positively**: proceed only when the resolved project ref is `wyixpgunnjmzguhggocz`; refuse
  loudly and by name if it is `oqdhberkghtnszrkdvfm`. A negative-only check passes on a third,
  unknown database.
- Print `[db-target] project : <ref>` to **STDERR** with the credential masked (quick-585: `--json`
  payloads pipe into `jq`; quick-607: an operator must never have to infer the target).
- **`.env.staging` holds live credentials — never echo it, mask every connection string and key in
  every artefact.**

**4b — Capture, then drop.** For each table reached by the 83 routed statements, capture the exact
`bypass_rls_policy` DDL from `pg_policies` — name, table, command, roles, `qual`, `with_check` —
into `04-policy-capture.json` **before** dropping anything. Then drop only those, only on staging.

**4c — Restore, and verify against PRODUCTION.** Restore in a `finally`. Verify by:
- re-reading the full sorted list of tables carrying `bypass_rls_policy` on staging and hashing it
  (sha256, matching `616-routing-verify.ts:339`);
- **re-deriving the same sorted-list hash from PRODUCTION**, read-only, and comparing. Production is
  the right reference precisely because this task never touched it.
- a byte-for-byte comparison of each restored expression against its captured original.

**Never verify by count.** 86 restored policies on the wrong 86 tables is a passing count and a
broken database.

**Hash BOTH algorithms (fact H).** Two figures are on record for the same list: the brief's
`29498ef6e52f51dcc02461a1abbb84b0` (MD5 length, from `.planning/STATE.md:966`, the orchestrator's
independent re-verification against production) and quick-616's harness sha256
`0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd`. They are not in conflict — they
are two algorithms over what should be one list. **The harness you inherit computes sha256 only and
will never print the brief's figure**, so a naive comparison produces a mismatch that means nothing.

Compute, for staging and for production, **both** md5 and sha256 of the sorted table list — four
values — and record all four. State (i) whether staging equals production, which is the claim that
matters, and (ii) which recorded figure each algorithm reproduces. Do not adopt a remembered hash as
ground truth and do not read an algorithm mismatch as drift.

**4d — Teardown. DO NOT USE `process.kill`.** quick-616's SIGINT proof terminated unconditionally on
Windows — no handler, no `finally` — and left staging at 85 policies. Use the two replacements
already in `616-routing-verify.ts`:
- `--throw-after-drop`: a deliberate throw between the drop and the probes, proving the `finally`
  restores on the path it can cover. **Run it and put its transcript in the evidence.**
- `preflightHeal()`: the self-healing pre-flight that runs in the **next** process, restoring
  anything a previous run left dropped. It survives what a `finally` cannot.

**4e — The matrix, per sub-surface, both directions.**
- **One transaction per cell.** A `TC001` aborts its transaction; every later statement in that
  transaction returns `25P02` and would make one raise look like many.
- SQLSTATE off `err.cause.code`, walking the cause chain — never `err.code`.
- **Every zero carries a privileged counter-read.** An RLS-refused UPDATE/DELETE is a silent 0 rows,
  not a 42501; without the counter-read, "refused" and "the row does not exist" are indistinguishable
  (quick-599).
- **Every `foreign === 0` is paired with `own > 0`.** An empty table still raises `TC001` — the policy
  expression evaluates at scan setup, not per row — so the vacuity risk is entirely on the success
  side (quick-610).
- Counts as a scalar, never `rowCount`.
- Staging is sparse. Create fixtures on the **privileged** connection (see `610-staging-fixtures.ts`
  and `597-staging-fixtures.ts` for the convention); tear down with an asserted `left 0`; create them
  under a disposable tenant and delete children before the tenant (`in_app_notifications.org_id` is a
  real FK — quick-546's shape, where every assertion passes and the file fails).
- Cold-process rule: any "does this raise" cell must be the first tenant-touching statement of its own
  process, or it inherits the previous cell's GUC. **One child process per cell that tests a raise.**

**4f — `04-proof.md`** carries: the masked target banner, the capture/drop/restore record with both
sha256 hashes and the brief-discrepancy note, the `--throw-after-drop` transcript, the per-sub-surface
both-directions matrix with real numbers, the fixture create/teardown `left 0` assertion, and a plain
statement of anything that could not be probed and why.
  </action>
  <verify>
`npx tsx apps/web/scripts/audit/617-routing-verify.ts --run` exits 0. A separate
`--run --throw-after-drop` exits non-zero **and** leaves the policy count and sorted list restored,
confirmed by an independent read in a fresh process. `04-proof.md` shows, per sub-surface,
`own > 0` and `foreign === 0` with counter-reads, and the staging sorted-list sha256 equal to
production's. No fixture rows remain (`left 0` asserted).
  </verify>
  <done>
Every routed sub-surface proven both directions on staging as `app_user`, tripwire armed, with
`bypass_rls_policy` dropped on the affected tables; the drop restored from captured DDL in a `finally`
and verified by sorted-list hash against production; the `finally` proven by `--throw-after-drop`, not
by `process.kill`; the brief's hash discrepancy resolved and recorded; production never written.
  </done>
</task>

<task type="auto">
  <name>Task 5: The click-through harness, with the arming counter-assertion</name>
  <files>
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/05-click-through.md
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/05-click-through.json
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/05-arming-control.txt
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/05-prior-evidence-hashes.txt
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/05-server.log
  </files>
  <action>
**5a — Hash prior evidence at OPEN.** `604-click-through.ts` passes 1 and 2 honour `--out`, and
re-running them without it **overwrites quick-604's closed evidence** — `04-click-through.json`
carries byte offsets into quick-604's own server log. Before starting: hash every artefact under
quick-604's, quick-605's, quick-606's and quick-616's evidence directories into
`05-prior-evidence-hashes.txt`. **Passes 1 and 2 must share the SAME `--out`**, pointed at this
task's evidence directory (an absolute path; `--out` goes through `path.resolve`). Hash again at
close and assert byte-identical. Report the count compared.

**5b — The server.** Staging-pointed, staging `NEXT_PUBLIC_SUPABASE_URL` and anon key, tripwire
armed, `app_user`. **Never start a server against production auth.** Stop any running `next dev`
first and delete `apps/web/.next` if the tree has been swapped since it last ran — swapping files
under a running Turbopack poisons its on-disk cache and a restart does not fix it, and the result is
your own work reported as missing (Phase 12's finding).

**5c — THE ARMING COUNTER-ASSERTION. Zero TC001 is exactly what a DISARMED tripwire looks like**, so
the count alone is not evidence. Reproduce quick-616's four-part assertion into
`05-arming-control.txt`:
1. `shouldArmTripwire` returns **true** for the server's real inputs;
2. it returns **false** for the production ref;
3. it returns **false** for `TENANT_CONTEXT_TRIPWIRE=off`;
4. the GUC reads back `'on'` on the live connection, **and** an unscoped read raises armed and is
   silent disarmed.

Parts 1–3 alone are satisfied by a function that ignores the world; part 4 is the one that touches
the database. All four, or the TC001 count means nothing.

**5d — Run it and report:** entries, pass, fail, **not-reachable**, and **TC001 count**. Compare
against quick-616's **66 entries / 60 pass / 0 fail / 0 TC001** and account for every difference —
including a difference in entries, which would mean the surface inventory changed.

**A TC001 on a routed mobile route is a FINDING, not noise**, and would likely mean fact F's GUC
question has a case Task 2 did not cover. Stop and report it rather than routing around it.

**5e — If the harness cannot run**, say exactly why, substitute nothing weaker, and mark this task
not-done rather than green. A click-through that did not happen is a known gap; one that is claimed
is a lie in the record.
  </action>
  <verify>
`05-click-through.json` exists at this task's `--out`. `05-arming-control.txt` records all four parts
with their results. `05-prior-evidence-hashes.txt` shows open and close hashes with a byte-identical
verdict and the count of artefacts compared. `05-click-through.md` states entries / pass / fail /
not-reachable / TC001 and the comparison to 66 / 60 / 0 / 0.
  </verify>
  <done>
The harness ran against a staging-pointed server with the tripwire proven armed by a four-part
counter-assertion; the five figures are reported and reconciled against quick-616's; prior tasks'
evidence confirmed byte-identical at open and close; any TC001 named as a finding.
  </done>
</task>

<task type="auto">
  <name>Task 6: Gates, the batch-size verdict, the remainder arithmetic, and the write-up</name>
  <files>
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/06-gates.md
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/evidence/06-vitest-after.json
.planning/quick/617-route-the-mobile-api-surface-to-gettenan/617-SUMMARY.md
  </files>
  <action>
**6a — `tsc --noEmit`, and prove it is not blind.** A parse error in **any** file in the program —
including an untracked half-written file from another session — suppresses semantic checking of
everything, and the gate then reports green while checking nothing.
- Delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` first if a dev
  server has crashed or the tree has been swapped.
- **Probe it:** inject `const __probe617: number = 'y';` into a file this task actually edited —
  `api/mobile/driver/incidents/route.ts` — and confirm tsc reports **that** error. Then **delete the
  probe** and re-run clean. quick-519 found a previous run's `__probe.ts` still sitting in the tree;
  do not leave one.
- If the only errors are syntax errors, or are all in files this task did not touch, the gate is
  blind — say so and fix it before claiming green.

**6b — `npm run build`** exit 0.

**6c — `npm run audit:rls-policy-drift`, ZERO, with the target PINNED ON THE COMMAND LINE and named
in the evidence.** quick-615 found the script does not print its own target. Pin both `DATABASE_URL`
and `DIRECT_URL` to the same project (quick-607's rung 1) and record the ref in `06-gates.md`.
If it exits **3**, the canonical artefact is stale and the definition layer did not run — a clean
name-layer result in that state is evidence of nothing. Regenerate with
`npm run audit:rls-canonicalise` against the pinned target, commit the artefact, and **expect the
regenerated artefact to describe staging**, so the detector will report drift against production
until a human deploys. Record that, or the next reader is confused.

**6d — vitest AFTER.** Same reporter as the baseline: `--reporter=json --outputFile=<path>`.
**`--reporter=basic` does not exist in vitest 4 and exits 0 having executed zero tests** — a green run
whose output carries no test counts is not a green run. Run it **after the last commit of the task**,
on a clean tree, with `next dev` stopped.

**Compare by failing-FILE SET against `evidence/00-baseline/failing-files.txt`, never against a
remembered number.** Publish:
- the four counts before and after,
- `only-in-before` and `only-in-after` file lists,
- and a specific note on `driver-incident-report-persists.test.ts`, which is in the baseline failing
  set and belongs to Task 2's proof file: **if its status changed in either direction, explain why.**

Any file newly failing is a regression and must be fixed or explicitly stopped-and-reported. **Do not
weaken any guard to go green.**

**6e — THE BATCH-SIZE VERDICT. Answer this honestly; a reflexive "it worked" is a task failure.**
Publish `git diff --stat` across the task's commits: files changed, insertions, deletions, and the
per-commit split across the three sub-surfaces. Then answer, in plain words:

> Did 47 files in one task produce a diff a human can actually review?

If it did not — and 30 files in the `owner` commit is the number to be honest about —
**say so and recommend a smaller batch for the four remaining surfaces**, with the split you would
use. The point of this task was partly to find out; reporting "it was fine" when the owner commit is
unreviewable destroys the only reason to have asked.

**6f — The remaining surfaces, sized from the census**, ready to be one task each:

| surface | files | statements |
|---|---:|---:|
| LIB_SERVICES | 15 | 45 (44 in the matrix + reconcile) |
| API_V1 | 6 | 14 |
| OWNER_PORTAL | 4 | 7 |
| DRIVER_PORTAL | 4 | 6 |
| API_DRIVER | 2 | 6 |
| API_CRON | 1 | 4 |
| API_AUTH | 2 | 3 |
| the residue named in quick-616 §2 | — | the balance |

Re-derive these from `01-census.json` rather than transcribing this table, and note that
LIB_SERVICES contains `BROKEN_POLICY` (2f/5s) and `BOOTSTRAP` (1f/1s) members which are **not**
`getTenantPrismaForOrg` conversions — so it is not a 15-file repeat of this task.

**6g — The remainder arithmetic, shown.**

```
census live population (quick-616)                 177
  − routed by quick-616                             −2
  = live at quick-617 start                        175
  − routed by quick-617 (MOBILE_API)               −83
  = expected remaining                              92
```

**Measure it**, repo-wide, with the census walker — do not assert it. If the measured figure is not
92, that difference is a finding: something else changed, and naming it is more valuable than the
number. Publish measured-vs-expected either way.

**6h — `617-SUMMARY.md`.** Lead with the single-file proof quoted (the user asked for it), then:
- step 1's verification and the `2f92a25a` attribution;
- the second-argument decision, its evidence, its cost, and the quick-588 finding;
- the GUC-inside-`$transaction` measurement and which of the three outcomes it was;
- the per-sub-surface routing record with the tenant-predicate assertions;
- every stop-and-report deviation;
- the proof and the click-through figures;
- the gates;
- **the batch-size verdict**;
- **the remainder arithmetic, measured**;
- and a §7 deferred list: what this task declined to do (audit columns stay NULL), what it found and
  did not fix (quick-588's `carrier_expenses` write, if confirmed), and the four remaining surfaces.

State plainly whether the bypass drop is still blocked. It is — 92 statements remain — and implying
otherwise would be the one sentence in the summary that matters most and is wrong.
  </action>
  <verify>
`06-gates.md` records: tsc clean **with the probe transcript showing the injected error was reported
and the probe deleted**; `npm run build` exit 0; drift ZERO with its target ref named; the vitest
before/after four-count table plus `only-in-before` / `only-in-after` file lists; `git diff --stat`
totals; the batch-size verdict in plain words; the measured remainder against the expected 92.
`617-SUMMARY.md` exists and leads with the quoted single-file proof.
  </verify>
  <done>
All four gates run and recorded with their blindness checks; vitest compared by failing-FILE SET
against the pinned baseline with `driver-incident-report-persists.test.ts` specifically accounted for;
the batch-size question answered honestly with real numbers and a recommendation for the remaining
surfaces; the remainder measured and reconciled against 92 with the arithmetic shown; the summary
written, leading with the quoted proof and stating plainly that the drop remains blocked.
  </done>
</task>

</tasks>

<verification>

**The task is not done until all of these hold.**

1. `617-mobile-inventory.ts` reports **zero** executable bypass statements under
   `apps/web/src/app/api/mobile/**`, with its counter-assertion still active and passing.
2. Every one of the 47 files either acquires `getTenantPrismaForOrg` or is a named, reasoned
   stop-and-report in `03-routing.md`. There is no third state.
3. **No `getAdminDb` appears anywhere in the diff.** `git diff | grep -c getAdminDb` is 0.
4. Per-sub-surface tenant-predicate `after >= before`, asserted and recorded with both numbers.
5. `04-proof.md` shows `own > 0` paired with `foreign === 0` per sub-surface, every zero carrying a
   privileged counter-read, with `bypass_rls_policy` dropped during the probe and restored verified by
   a sorted-list sha256 equal to production's.
6. The `finally` is proven by `--throw-after-drop`. `process.kill` appears in no new code path.
7. The click-through harness ran with the four-part arming counter-assertion recorded, or its absence
   is stated with nothing weaker substituted.
8. tsc proven not blind by a probe that was reported and then deleted; build exit 0; drift ZERO with
   its target named.
9. vitest AFTER compared by failing-FILE SET against `evidence/00-baseline/failing-files.txt`, same
   reporter, run after the final commit on a clean tree.
10. The batch-size verdict is answered with `git diff --stat` numbers and a recommendation.
11. The remainder is **measured** and reconciled against the expected 92, arithmetic shown.
12. Production was never written; `.env.staging` was never echoed; every credential is masked in every
    artefact.

</verification>

<absolute_limits>

- **NEVER write to production** (`oqdhberkghtnszrkdvfm`). Staging writes are permitted only for probe
  fixtures and Task 4's temporary policy drop/restore.
- **DO NOT DROP `bypass_rls_policy` PERMANENTLY.** Every drop is captured first and restored in a
  `finally`, verified by sorted list against production.
- **DO NOT REMOVE ANY `tenantId` / `orgId` `where` CLAUSE.** Asserted mechanically per sub-surface.
- **DO NOT ROUTE ANYTHING TO `getAdminDb`.** All 83 statements have a verified tenant in hand.
- **TOUCH NO SURFACE OTHER THAN MOBILE_API** (`apps/web/src/app/api/mobile/**`), and within it, not
  `carrier/**` — quick-588 already routed those five files. A finding about them is reported, never
  fixed here.
- **Install nothing. Do not `git push`. Do not weaken any guard to go green.**
- **Do not change what any statement returns on success, and do not change what any statement
  writes** — including audit columns.
- Do not re-measure the vitest baseline. It is pinned at `5437177a` and on disk.
- Do not import `scripts/_bootstrap-env` from any probe or harness.

</absolute_limits>

<success_criteria>

47 files routed to `getTenantPrismaForOrg` with the bypass flag gone and every tenant predicate
intact; the GUC-inside-`$transaction` question measured rather than assumed; the second-argument
question resolved from the code with the behaviour change declined and said so; one file proven end to
end and quoted before the other 46 were touched; the whole surface proven both directions on staging
as `app_user` with the bypass policy dropped and restored-verified against production's hash; the
click-through run with the tripwire proven armed; four gates green and proven not blind; and an honest
verdict on whether 47 files in one task was a reviewable diff, with the remaining 92 statements sized
per surface.

</success_criteria>

<output>
After completion, create
`.planning/quick/617-route-the-mobile-api-surface-to-gettenan/617-SUMMARY.md`.
</output>
