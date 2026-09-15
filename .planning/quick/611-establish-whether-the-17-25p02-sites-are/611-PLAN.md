---
phase: quick-611
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/scripts/audit/611-tx-enclosure.ts
  - apps/web/scripts/audit/611-cascade-proof.ts
  - apps/web/tests/security/transaction-abort-sites.test.ts
  - docs/audits/25p02-site-classification.md
  - docs/audits/wrapper-migration-scope.md
  - .planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/*
  - "(application source: ONLY the sites task 3 proves LIVE — possibly none)"

must_haves:
  truths:
    - "Each of the 17 sites has its own verdict block with quoted current source, not a summary row"
    - "Every site classified LIVE is demonstrated to cascade on staging, quoted, before it is fixed"
    - "Every site classified DORMANT or IMPOSSIBLE carries the specific condition that would wake it"
    - "The discriminating criterion is demonstrated to discriminate — a positive control cascades and a negative control does not"
    - "Whether Prisma savepoints can clear an aborted transaction is MEASURED on staging, not assumed"
    - "The live/dormant/impossible counts are stated explicitly and sum to 17"
    - "No new transaction is introduced anywhere; no catch is removed"
    - "A guard test fails if any site later moves into a transaction callback"
  artifacts:
    - path: "apps/web/scripts/audit/611-tx-enclosure.ts"
      provides: "AST enumerator: re-resolves the 17 sites by symbol and reports enclosure shape"
    - path: "apps/web/scripts/audit/611-cascade-proof.ts"
      provides: "Staging positive/negative control + savepoint capability measurement"
    - path: "docs/audits/25p02-site-classification.md"
      provides: "Durable per-site record with wake conditions"
    - path: "apps/web/tests/security/transaction-abort-sites.test.ts"
      provides: "Source-scanning guard pinning the classification"
    - path: ".planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/01-site-verdicts.md"
      provides: "17 per-site verdict blocks"
    - path: ".planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/02-cascade-proof.md"
      provides: "Quoted staging transcript"
  key_links:
    - from: "611-tx-enclosure.ts"
      to: "the 17 sites"
      via: "symbol resolution, never the audit's line numbers"
    - from: "611-cascade-proof.ts"
      to: "apps/web/.env.staging"
      via: "explicit load, positive refusal on production ref oqdhberkghtnszrkdvfm"
---

<objective>
Establish which of the 17 `25P02` transaction-abort sites named in
`docs/audits/wrapper-migration-scope.md` are a risk **today**, and fix only those.

Purpose: the audit found these while scoping a `withTenantContext` migration that
would have wrapped 456 units in transactions. That migration is not proceeding as
scoped (quick-602 measured the overlap at 4 of 456 units — 0.88 % — and
`withTenantContext` has zero real call sites; the three files naming it do so in
prose inside comments). So the audit's framing — "this is what will happen after
the migration" — is no longer the question. `25P02` fires only where a unit of
work is **already transactional today**. This task re-asks the question against
that premise and closes one of the four remaining items before the `app_user`
cutover.

Output: a per-site verdict for all 17, a witnessed cascade proof, fixes for the
live sites (possibly none), a durable dormant record, and a guard.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/audits/wrapper-migration-scope.md
@docs/audits/app-user-failure-remediation.md
@apps/web/src/lib/db/prisma.ts
@apps/web/scripts/audit/610-latent-caller-probe.ts
</context>

<prior_findings>

**Do not re-derive these. Three were confirmed against current source during
planning; two of them REVERSE what was expected, and that is the substance of
this task.**

### F1 — `createCarrierDriver` is DORMANT. The headline site does not qualify.

`src/lib/carrier/fleet-drivers.ts:223` `createCarrierDriver` opens **no
transaction**. It acquires `await getTenantPrisma()` at :227 and uses the bare
`prisma` for the user lookup — all autocommit. Its only caller,
`src/app/api/v1/carrier/fleet/drivers/route.ts:68`, contains no `$transaction`
(zero grep hits in that file). The audit's own §"Named answer to step 3" calls
this "the clearest case", and it is — but as a *post-migration* case. Today
nothing can abort. **Report this reversal prominently; do not bury it.**

### F2 — `driver/gps-ping` is a FALSE POSITIVE, and its shape is the key to the whole task.

The orchestrator nominated this as the strongest live candidate because §1a lists
a bare-client `$transaction` at `route.ts:18` and site 15 is a swallowed read at
`:67`. Reading it: the transaction is opened at the **`carrierTruckId =
await prisma.$transaction(async (tx) => {…}, TX_OPTIONS)`** assignment, and the
`try` opens *above* that assignment with its `catch` *below* it:

```ts
try {
  carrierTruckId = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    const carrierDriver = await tx.carrierDriver.findFirst({ … });
    if (!carrierDriver) return null;
    const activeDispatch = await tx.trip.findFirst({ … });
    return activeDispatch?.truckId ?? null;
  }, TX_OPTIONS);
} catch {
  // Non-fatal — we still log and return success even without truckId
}

if (carrierTruckId) {
  const tenantPrisma = await getTenantPrisma();
  await tenantPrisma.gPSLocation.create({ … });
}
```

The catch is **outside** the transaction. A failing statement rejects the
`$transaction` promise, Prisma rolls back, and the transaction has **already
settled** by the time control reaches the catch. The subsequent write is on a
different client from a fresh acquisition. There is no aborted transaction left
to inherit, so there is no `25P02`. **This is the SAFE shape, and the audit
counted it as a risk.**

### F3 — two of the three "swallowed WRITE" sites are inside `after()`.

`src/lib/carrier/trips.ts` sites at ~:720 and ~:786 sit inside
`after(async () => { try { … } catch { … } })` — post-response deferred
callbacks, not inside any request-time transaction. The file's only
`$transaction` is at `:1033` on `tenantPrisma`, in a different function.
`after()` adds a second reason these cannot cascade, independent of the first.

### F4 — the discriminating criterion, stated once.

A site is **LIVE** iff **both**:

- **(A)** the swallowed statement executes on a transaction client (`tx`) whose
  `$transaction` callback has **not yet settled** at the moment it runs; **and**
- **(B)** after the catch, further DB work runs on **that same `tx` binding**
  before the callback returns.

In practice the true-positive shape is: `catch` **lexically inside** the
`$transaction(async (tx) => …)` callback, with `tx.` calls after it.

### F5 — four false-positive shapes, all observed in this tree.

| id | shape | why it cannot cascade |
|---|---|---|
| **FP-1** | `try { await prisma.$transaction(async tx => …) } catch {}` | transaction settles before the catch runs (F2) |
| **FP-2** | site calls a helper that opens and closes its **own** transaction (e.g. `getCurrentUser()` doing `prisma.$transaction([...])`) and returns | that transaction has committed; the caller is not inside one |
| **FP-3** | swallowed work inside `after(async () => …)` | runs post-response, outside any request transaction (F3) |
| **FP-4** | no transaction in the unit or any caller | nothing to abort (F1) |

**FP-2 is the one the constraints single out, and getting it backwards would
classify nearly everything as live and produce a large, wrong, destabilising
diff.** The enclosing-transaction question is about scope **at the moment the
swallowed statement runs**, not about whether a transaction exists anywhere in
the call graph.

### F6 — a fifth shape that is NOT this task's problem.

The pool is `max: 1`. If a site acquires its **own** client while a caller holds
an open transaction on a **different** client, the failure is connection
starvation / `P2028` deadlock — which is the audit's **group 1** (108 units,
already owned). It is **not** `25P02`. If the analysis finds that shape,
classify it `GROUP-1-DEADLOCK`, report it, and **do not fix it here**.

### F7 — measurements already banked.

- Baseline suite already captured at HEAD on a clean tree:
  `evidence/00-suite-before.json` — **715 suites / 55 failed · 2123 tests /
  64 failed / 52 pending / 3 todo**. The AFTER run must use the identical
  command and reporter (`vitest run` with the JSON reporter writing to
  `evidence/04-suite-after.json`). **Do not re-run BEFORE after editing** — that
  is the quick-561/565/567 baseline trap three tasks in a row.
- `apps/web/.env.staging` exists. `typescript` 5.9.3 is already installed (the
  audit used the compiler API).
- Staging confirmed at open: `drivecommand-staging` / `wyixpgunnjmzguhggocz`,
  `current_user=app_user`, `rolbypassrls=false`, tripwire live, 183 policies,
  PG 17.6.

</prior_findings>

<tasks>

<task type="auto">
  <name>Task 1: Re-resolve all 17 sites and give each an individual verdict</name>
  <files>
apps/web/scripts/audit/611-tx-enclosure.ts
.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/01-tx-enclosure.json
.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/01-site-verdicts.md
  </files>
  <action>
Answer, for each of the 17 sites, the question in F4 — **not** "is there a
transaction in this file".

**A pure grep cannot answer this.** Use a two-instrument method, and record both
outputs, because they catch different classes (quick-549):

**Instrument 1 — AST enumerator, `apps/web/scripts/audit/611-tx-enclosure.ts`.**
Use the TypeScript compiler API (`ts.createSourceFile`, no `Program` and no type
checker needed — quick-602's rule; the identifiers all resolve lexically).

- **Re-resolve every site by SYMBOL, never by the audit's line number.** The
  audit is from 2026-09-12 and the plan-time read already found drift (its
  `gps-ping:18` is the exported `POST`, the transaction is ~:65, the swallowed
  read is the whole `$transaction` call). Key each site on
  `(file, enclosing function name, the swallowed call expression)`. **If a site
  cannot be re-resolved, that is a finding — record it `NOT-FOUND` with what was
  searched for.** Do not silently drop it; 17 must be accounted for.
- For each resolved `CatchClause`, walk **ancestors** looking for an
  `ArrowFunction`/`FunctionExpression` that is `arguments[0]` of a
  `CallExpression` whose expression ends in `.$transaction`. Record: found or
  not, and if found the `tx` parameter's identifier text.
- Independently record the **client binding** each DB call inside the `try`
  uses (`tx` / a `getTenantPrisma()` result / the bare imported `prisma`), and
  the bindings used by DB calls **after** the catch, within the same enclosing
  function.
- Detect and label FP-1 explicitly: a `TryStatement` whose `tryBlock` contains a
  `.$transaction(` CallExpression **and** whose catch is a sibling of it rather
  than inside its callback.
- Detect FP-3: any ancestor `CallExpression` whose expression is `after`.
- Emit one JSON record per site to `evidence/01-tx-enclosure.json` with every
  field above plus the exact resolved line span.

**Instrument 2 — reverse call-graph pass, in the same script.** For any site the
AST does not resolve inside a same-function transaction callback, enumerate
callers of its enclosing function across `apps/web/src` (AST, match
`CallExpression` by callee name + import specifier, transitively, **depth capped
at 3 and the cap recorded in the output**). For each caller, answer the *same*
F4 question at the call expression.

**The FP-2 exclusion is structural and must be implemented as such:** a caller's
transaction only reaches the site if the **`tx` binding itself is passed into
it**. If the site acquires its own client (`getTenantPrisma()` /
`getTenantPrismaForOrg()` / bare `prisma`), a caller's `tx` cannot be the client
its statements run on — so the caller's transaction is irrelevant to `25P02`,
and the site is at most F6's `GROUP-1-DEADLOCK`. Encode that as: **LIVE requires
the transactional client to be reachable at the statement.** Report the reasoning
per site; do not leave it implicit.

**Instrument 3 — hand read, and it is the adjudicator.** The AST enumerates; a
human read decides. Open each of the 17 at its re-resolved span and write a
verdict block to `evidence/01-site-verdicts.md`:

```
### Site N/17 — <file>:<re-resolved line span>  <enclosing function>
Audit said: <original line ref from wrapper-migration-scope.md>
Resolved:   <current line span, or NOT-FOUND with search terms>
Swallowed:  <the statement inside the try, quoted>
Client:     <tx | own getTenantPrisma | bare prisma>
Enclosure:  <none | FP-1 | FP-2 | FP-3 | FP-4 | GROUP-1-DEADLOCK | TX-CALLBACK>
After the catch: <the next DB work, quoted, and the client it runs on>
VERDICT:    LIVE | DORMANT | IMPOSSIBLE | GROUP-1-DEADLOCK
Wake condition (DORMANT only): <the specific change that would make it live>
Cost if live: <what a USER loses — not an SQLSTATE>
AST agreed:  yes | no — <if no, what differed and why the hand read wins>
```

Every site gets a block. **A summary table is not a substitute and does not
satisfy this task** — add one only *in addition*, at the end, carrying the
counts.

`IMPOSSIBLE` means: no enclosing transaction can exist for this statement in any
reachable call path, so it cannot cascade even after a future migration.
`DORMANT` means: no enclosing transaction today, but a named change would create
one.

Close with the explicit counts: **live / dormant / impossible /
group-1-deadlock / not-found**, stated to sum to 17.

**Do not fix anything in this task. Do not add a transaction to any file.**
  </action>
  <verify>
`npx tsx scripts/audit/611-tx-enclosure.ts` runs from `apps/web` and writes
`evidence/01-tx-enclosure.json`. `evidence/01-site-verdicts.md` contains 17
blocks matching the template — verify by counting `^### Site ` headings = 17.
The counts at the foot sum to 17.
  </verify>
  <done>
All 17 sites re-resolved against current source and individually adjudicated,
with F1/F2/F3 either confirmed or overturned by the measurement rather than
assumed. Counts stated.
  </done>
</task>

<task type="auto">
  <name>Task 2: Prove the criterion discriminates on staging, and measure whether savepoints work</name>
  <files>
apps/web/scripts/audit/611-cascade-proof.ts
.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/02-cascade-proof.md
  </files>
  <action>
Build `apps/web/scripts/audit/611-cascade-proof.ts` following quick-607 script
conventions **exactly**: it MUST NOT import `scripts/_bootstrap-env`; it MUST
load `apps/web/.env.staging` explicitly; it MUST refuse **positively** on the
production ref `oqdhberkghtnszrkdvfm` (assert the staging ref
`wyixpgunnjmzguhggocz` is present, not merely that production is absent); and it
MUST print the resolved project ref to **stderr**. Assign `DATABASE_URL` and
`TENANT_CONTEXT_TRIPWIRE` **before** importing any app module — `prisma.ts`
evaluates `ARM_TRIPWIRE` at module scope — so use dynamic `await import()`.
Follow `tests/carrier/document-import-commit-rollback.test.ts` for the disposable
tenant: scope every write to it, delete children before the tenant, and verify
staging is clean afterwards.

Detect `25P02` **by code**, never by message prose, and **walk the cause chain —
the SQLSTATE is on `err.cause.code`, not `err.code`** (quick-610).

**Part A — the cascade proof.**

*If task 1 found one or more LIVE sites:* drive the real code path for at least
one of them. Force the caught statement to fail (prefer a real constraint
violation over a mock — e.g. a duplicate on a real unique index, or a deliberate
FK miss), and show that (i) the enclosing transaction aborts, (ii) the statements
after the catch fail `25P02`, and (iii) **an earlier write in the same
transaction is gone after rollback** — assert its absence with a row count, not
by inference. If the real path genuinely cannot be driven from a script (session
forgery — see `610-latent-caller-probe.ts`'s rule that a forged session measures
our understanding of `@supabase/ssr` rather than the application), run the real
transaction shape with the real client and **state exactly what was substituted
and why**.

*If task 1 found ZERO live sites:* the proof becomes a **positive/negative
control pair**, and this is mandatory — otherwise "zero live" is unfalsifiable.

- **Positive control:** the F4 true-positive shape — catch *inside* a
  `$transaction` callback, `tx.` work after it — built with the real client
  against the disposable tenant. Show the cascade and show the earlier write
  rolled back.
- **Negative control:** the FP-1 shape as it appears verbatim at
  `driver/gps-ping` — catch *outside* the `$transaction` call, a fresh
  acquisition after it. Show the second write **succeeds** and the row exists.

Two shapes, one client, one script, opposite outcomes. That demonstrates the
criterion is real and that the tree's shape is on the safe side of it.

**Part B — savepoint capability, run regardless of Part A's branch.**

The audit asserts "Prisma does not wrap individual statements in savepoints".
There is no `tx.$savepoint()` in Prisma 7. **Measure**, do not assume, whether
inside `$transaction(async (tx) => …)`:

```
tx.$executeRawUnsafe('SAVEPOINT sp1')
  → force a failing statement on tx
  → tx.$executeRawUnsafe('ROLLBACK TO SAVEPOINT sp1')
  → a subsequent tx model call
```

genuinely clears the aborted state so the subsequent `tx` call **succeeds**.
Record the answer either way — a future task must not re-derive this. If it does
NOT work, say so plainly; task 3's fix shape is then "move the statement out of
the transaction" and nothing else.

Write `evidence/02-cascade-proof.md` containing the **quoted transcript** —
actual output with actual SQLSTATEs and actual row counts. A description of
PostgreSQL semantics does not satisfy this task.

**Never connect to production. Never write to production.**
  </action>
  <verify>
`npx tsx scripts/audit/611-cascade-proof.ts` prints the staging ref to stderr and
exits 0. `evidence/02-cascade-proof.md` contains a literal `25P02` in quoted
output, a row-count assertion showing a rolled-back write is absent, and the
savepoint verdict stated as works / does-not-work. Confirm the script refuses
when pointed at the production ref (test the refusal without connecting).
Staging left with zero leftover disposable tenants.
  </verify>
  <done>
A real cascade is quoted from staging, the criterion is shown to discriminate in
both directions, and the savepoint question is answered by measurement.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix the live sites — and only those</name>
  <files>(only the application source files task 1 proved LIVE — possibly none)
.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/03-fix-proofs.md
  </files>
  <action>
**If task 1 found zero LIVE sites, this task writes no application code.** Record
that in `evidence/03-fix-proofs.md` as the outcome, with the count, and move on.
That is a successful result, not a gap.

**The prohibition that governs this task: do not wrap anything new in a
transaction to make the finding true.** A fix that creates the very enclosure it
then guards against would invalidate the whole task. Likewise: **do not remove
any catch** — the resilience is intended and documented in the source comments —
and do not change what any route returns on success.

For each LIVE site, choose **per site** between two shapes and **state the
reason in the code comment and in the evidence file**:

- **Savepoint around the statement allowed to fail** — `SAVEPOINT` /
  `ROLLBACK TO SAVEPOINT` / `RELEASE SAVEPOINT` issued on the **same `tx`**, so
  the catch can resume. Only available if task 2 Part B measured it working.
  Prefer this where the statement genuinely belongs inside the transaction's
  atomic unit.
- **Move the statement out of the transaction** — where the swallowed work is
  incidental to the atomic unit (a lookup, an audit write, a notification) and
  nothing in the transaction depends on its result. Prefer this where it applies;
  it is the simpler shape and needs no raw SQL.

**Prove each fix individually.** For each, extend `611-cascade-proof.ts` (or add
a sibling) to force the **same** failure against the fixed path on staging and
show: the catch is reached, the subsequent statements **succeed**, and the
**earlier writes survive** — asserted with a row count. Capture before/after for
each. **A fix asserted without a witnessed before/after is the quick-549 shape
and does not count.** Write it all to `evidence/03-fix-proofs.md`.
  </action>
  <verify>
For each LIVE site: the forced failure now leaves earlier writes present
(row-count assertion quoted), and no `25P02` appears after the catch. If zero
live sites, `git diff --stat` shows **no application source changed** by this
task.
  </verify>
  <done>
Every live site is fixed with a stated per-site rationale and a witnessed
before/after; no dormant site was touched; no new transaction was introduced.
  </done>
</task>

<task type="auto">
  <name>Task 4: Record the dormant sites durably and guard the classification</name>
  <files>
docs/audits/25p02-site-classification.md
docs/audits/wrapper-migration-scope.md
apps/web/tests/security/transaction-abort-sites.test.ts
  </files>
  <action>
**The durable record.** Create `docs/audits/25p02-site-classification.md` from
task 1's verdicts: all 17, their current resolved locations, their verdicts, and
for each DORMANT one **the specific condition that would wake it** (e.g.
"`createCarrierDriver` becomes live if its body or
`api/v1/carrier/fleet/drivers/route.ts:68` is wrapped in a transaction, or if the
`withTenantContext` migration reaches this unit"). State the counts. State the
four false-positive shapes (F5) so the next reader does not re-derive them, and
state F6's boundary — that the `max: 1`-pool shape is a group-1 deadlock, not a
`25P02`, and is owned elsewhere.

**Correct the predecessor in place, do not rewrite it.** Add a dated correction
note to `docs/audits/wrapper-migration-scope.md` at the
§"The transaction-abort risk" section: the 17 were enumerated as
*post-migration* risks under a migration that is not proceeding as scoped; of
them N are live today, and the enumeration counted the FP-1 shape (catch outside
the `$transaction` call) as a risk when it is the safe shape. Follow the repo's
correct-in-place convention (as `07-SUMMARY.md` items 2 and 3 were struck through
and corrected). **Do not delete the original text** — a future reader needs to
see what was claimed.

**The guard**, `apps/web/tests/security/transaction-abort-sites.test.ts`. A
source-scanning test that fails if any of the 17 sites moves into a transaction
callback. Every constraint below is a repo rule paid for by a previous task:

- **Normalise line endings** (`.replace(/\r\n/g, '\n')`) before slicing — this
  repo is `core.autocrlf=true` with no `.gitattributes`, and a column-zero
  `\n}\n` end marker does not exist in a CRLF working tree. quick-546's bad
  slice returned null and its assertion then **passed against an empty string**.
- **Assert the slice was actually found** before asserting anything about its
  contents, and carry a **length floor as a PARAMETER, not a constant**
  (quick-562 — a legitimate one-line re-export `page.tsx` is 293 bytes, so a
  blanket 400-byte floor fails on healthy source).
- **Scope the scan to the enclosing function bodies**, not whole files —
  quick-546's rule: a whole-file scan goes permanently red on legitimate
  neighbours, and a red test everyone ignores protects nothing.
- **Positive + negative pair.** The negative ("no catch inside a `$transaction`
  callback at these sites") passes vacuously if the sites vanish; pair it with a
  positive assertion that each of the 17 is still **found**, so a deleted or
  renamed site fails loudly rather than silently leaving the enumeration
  (quick-599's vacuous-filter shape).
- **Witness the red.** Deliberately move one site's catch inside a transaction
  callback, watch the guard fail, then revert and reconfirm green. Record both in
  `evidence/05-guard-fires.md`. A guard asserted without a witnessed red is the
  quick-549 shape.
  </action>
  <verify>
`npx vitest run tests/security/transaction-abort-sites.test.ts` passes on the
real tree. `evidence/05-guard-fires.md` quotes the deliberate red and the
restored green. `docs/audits/25p02-site-classification.md` accounts for all 17
with wake conditions on every DORMANT one.
  </verify>
  <done>
The classification is durable, the predecessor audit is corrected in place rather
than left misleading, and a witnessed guard stops the dormant sites waking
unnoticed.
  </done>
</task>

<task type="auto">
  <name>Task 5: Gates — tsc probe, build, suite delta, and what remains before cutover</name>
  <files>
.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/04-suite-after.json
.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/04-suite-after.log
.planning/quick/611-establish-whether-the-17-25p02-sites-are/evidence/06-gates.md
  </files>
  <action>
**Stop `next dev` first.** If any mass file change happened, delete
`apps/web/.next` before building — a poisoned Turbopack cache reports correct
work as missing.

**tsc, PROBED not believed.** Run `npx tsc --noEmit` in `apps/web`. Then inject
`const x: number = 'y';` into a file this task actually edited, confirm tsc
reports **that** error, and remove the probe. If the only errors are syntax
errors, or are all in files this task did not touch (including untracked ones),
the gate is **blind, not green** — delete `apps/web/.next/dev/types/validator.ts`
and `apps/web/tsconfig.tsbuildinfo` and re-run. Check no stray `__probe.ts`
survives. Note `apps/web` has **no working lint entry point**; tsc is the only
gate that runs — state that rather than implying lint passed.

**`npm run build` succeeds.**

**Suite delta, same reporter both directions.** BEFORE is already banked at
`evidence/00-suite-before.json` (715 suites / 55 failed · 2123 tests / 64 failed
/ 52 pending / 3 todo), captured on a clean tree at HEAD. Run AFTER with the
**identical command and JSON reporter** into `evidence/04-suite-after.json`.
**Compare the failing-FILE set, not the counts** — `--silent` and
`--reporter=json` disagree by ±4 on this suite, and a cold run imports for ~82 s
so a single isolated failure that passes alone is a cold-cache flake, not a
regression (quick-549). Do **not** re-run BEFORE. A green run whose output
carries no test counts is not a green run.

**Write `evidence/06-gates.md`** with all of the above plus the closing
statement of record:

> **Counts:** N live · N dormant · N impossible · N group-1-deadlock — summing to 17.
>
> **Remaining before the `app_user` cutover:** the `AutomationRule` DELETE split
> (a four-policy per-command split — `WITH CHECK` never reaches DELETE), these
> `25P02` sites (now closed / N remaining), `app_admin` LOGIN on production, and
> the bypass policy drop. quick-610 closed the latent `createTenantClient`
> callers and changed none of these four.

Update that sentence to reflect what this task actually closed.

**Do not begin the bypass drop or the cutover. Do not install any package.**
  </action>
  <verify>
tsc clean **and** the probe was demonstrably reported then removed;
`npm run build` exits 0; the failing-FILE set in `04-suite-after.json` matches
`00-suite-before.json`; `evidence/06-gates.md` carries the counts and the
remaining-work statement.
  </verify>
  <done>
All gates pass with the blindness checks actually performed, and the state of the
cutover is recorded for the next task.
  </done>
</task>

</tasks>

<verification>
- 17 individual verdict blocks exist — counted, not assumed.
- The live/dormant/impossible counts sum to 17 and are stated in two places.
- `evidence/02-cascade-proof.md` quotes a real staging transcript containing
  `25P02` and a row-count showing a rolled-back write absent.
- The savepoint question is answered by measurement and recorded either way.
- Every fix (if any) has a witnessed before/after with row counts.
- `git diff` introduces **no new `$transaction`** anywhere:
  `git diff -U0 | grep '^+' | grep '\$transaction'` returns nothing except
  inside `scripts/audit/611-*` and the guard test.
- `git diff` **removes no catch clause**:
  `git diff -U0 | grep '^-' | grep -c 'catch'` is 0 in application source.
- No connection string resolving to `oqdhberkghtnszrkdvfm` appears in any script.
- tsc probed, `npm run build` green, failing-FILE set unchanged.
</verification>

<success_criteria>
- Requirement 1 — per-site verdict for all 17 against current source, line
  numbers re-resolved, sites with no enclosing transaction reclassified with
  evidence rather than fixed.
- Requirement 2 — every in-transaction site reported as a **live defect** with
  what a user loses, not an SQLSTATE. `createCarrierDriver` addressed first if it
  qualifies; F1 says it does not, and the measurement — not the plan — decides.
- Requirement 3 — the cascade is **quoted** from staging, with the criterion
  shown to discriminate in both directions.
- Requirement 4 — live sites fixed, shape chosen per site with a stated reason,
  no catch removed.
- Requirement 5 — dormant sites recorded with wake conditions, not fixed.
- Requirement 6 — counts stated.
- The headline reversals (F1, F2) are reported prominently, not buried.
</success_criteria>

<output>
Create `.planning/quick/611-establish-whether-the-17-25p02-sites-are/611-SUMMARY.md`.

It must open with the **counts** and the **two reversals** — that
`createCarrierDriver`, the site the brief calls the sharpest, appears dormant,
and that `driver/gps-ping`, nominated as the strongest live candidate, appears to
be the FP-1 safe shape — each either confirmed or overturned by task 1's
measurement. Then the fixes, then what remains before the `app_user` cutover.
</output>
