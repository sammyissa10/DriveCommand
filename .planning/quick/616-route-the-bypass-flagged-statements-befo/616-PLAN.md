---
phase: quick-616
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/scripts/audit/616-bypass-census.ts
  - apps/web/scripts/audit/616-routing-verify.ts
  - apps/web/src/actions/support-tickets.ts
  - apps/web/src/app/api/mobile/support/ticket/route.ts
  - apps/web/src/app/api/cron/workflow-digest/route.ts
  - apps/web/src/lib/automations/evaluator.ts
  - apps/web/src/app/api/track/[token]/route.ts
  - apps/web/src/lib/auth/supabase.ts
  - apps/web/src/lib/db/admin-reasons.ts
  - apps/web/tests/security/admin-connection-allowlist.test.ts
  - apps/web/prisma/migrations/*/migration.sql
  - .planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/*
  - docs/audits/bypass-call-classification.md

must_haves:
  truths:
    - "The count reconciliation is the FIRST thing stated: the brief's ~20 against the measured population, WHICH quick-615 §8 row each number came from, and why the ~20 was the wrong row — before any classification or edit."
    - "Every executable `set_config('app.bypass_rls', ...)` statement in the shipping tree is enumerated by file, line and enclosing function/route, by an AST or line-anchored parse — never a bare grep — with the method stated per count and the two disagreeing naive measurements (177/87 and 180/89) adjudicated and the winner argued."
    - "Every statement carries a SURFACE assigned by a STATED path rule using exactly the four surfaces the user named, plus every residue surface named in its own right rather than forced into one of the four."
    - "Every statement carries a CATEGORY whose definition is QUOTED from its source document rather than re-invented; a fifth category is named and defined if the four do not fit, and nothing is forced into DECORATIVE because it is the nearest of four."
    - "Every statement records what routing it needs and its RECEIVER — `getAdminDb` / `getTenantPrismaForOrg` / flag deletion only / a policy fix — and the `@bypass_rls reason:` annotation as found plus whether it VERIFIES against the code."
    - "The deliverable is a per-surface x per-category matrix carrying BOTH file counts and statement counts, plus a machine-readable census JSON the follow-up batches can be driven from."
    - "The census walker carries an anti-vacuity floor AND a counter-assertion: a file known to carry a bypass yields non-zero and a file known NOT to carry one is confirmed read and confirmed to yield zero."
    - "The census is reconciled against `docs/audits/bypass-call-classification.md`'s 211/103, with every statement that has disappeared since attributed to a named commit or task."
    - "Only the NAMED subset is routed. The wrapper-migration population is classified and COUNTED here and its conversions are left to the wrapper programme, so the countdown stays the single place tracking them."
    - "No statement is routed to `getAdminDb` that a tenant client can serve, and no routed path keeps its `set_config` line — removed vs remaining is reported repo-wide and the remaining number RECONCILES with the census."
    - "Every BROKEN_POLICY verdict QUOTES the live policy from `pg_policies` and NAMES what cannot satisfy it; its fix is a MIGRATION, never a bypass."
    - "Every routed statement is proven on staging as `app_user` with the tripwire armed AND `bypass_rls_policy` TEMPORARILY DROPPED on the affected tables, so the proof does not rest on the policy about to be removed."
    - "The dropped policies are restored from DDL captured from `pg_policies` BEFORE the drop, in a `finally`, and the restore is verified by a SORTED TABLE LIST returning to 86 AND by a byte-for-byte match of each restored expression against its captured original — never by a count."
    - "Every probe cell runs in its OWN transaction; SQLSTATE is read off `err.cause.code` never `err.code`; every zero carries a privileged counter-read and every `foreign === 0` is paired with `own > 0`."
    - "The click-through harness RUNS, against a staging-pointed server using the staging `NEXT_PUBLIC_SUPABASE_URL` and anon key, before the routing work is treated as done — or it does not run and exactly why is stated with nothing weaker substituted."
    - "Passes 1 and 2 share the SAME `--out`, and quick-604/605/606's artefacts are hashed at open and at close and confirmed byte-identical."
    - "The summary states PLAINLY that the bypass drop REMAINS BLOCKED, and answers what would break if `bypass_rls_policy` were dropped today by naming SURFACES, not categories."
    - "The remaining backlog is sized PER SURFACE, ready to be one task each."
    - "Production is never written. `apps/web/.env.staging` is never echoed and every connection string and key is masked everywhere it is printed."
  artifacts:
    - path: ".planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.json"
      provides: "Machine-readable per-statement census — file, line, function, surface, category, receiver, annotation, annotation-verifies — driving every follow-up batch"
      contains: "surface"
    - path: ".planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.md"
      provides: "The count reconciliation, the stated path rule and its residue, the quoted category definitions, and the per-surface x per-category matrix with file AND statement counts"
      contains: "statements"
    - path: "apps/web/scripts/audit/616-bypass-census.ts"
      provides: "The AST/line-anchored walker with its anti-vacuity floor and its zero-yield counter-assertion"
      contains: "counter"
    - path: "apps/web/scripts/audit/616-routing-verify.ts"
      provides: "--capture / --drop / --before / --after / --restore both-directions matrix with the captured-DDL restore and the sorted-list verification"
      contains: "pg_policies"
    - path: ".planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/03-proof.md"
      provides: "Both-directions proof per routed statement with the policy dropped, plus the capture/restore byte-comparison"
      contains: "86"
    - path: ".planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/04-click-through.md"
      provides: "The harness run: surfaces, pass, fail, not-reachable, classification counts, and what was PREVIOUSLY UNMEASURED"
      contains: "previously"
  key_links:
    - from: "apps/web/scripts/audit/616-bypass-census.ts"
      to: ".planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.json"
      via: "writeFileSync of the per-statement records"
      pattern: "01-census\\.json"
    - from: "apps/web/scripts/audit/616-routing-verify.ts"
      to: "apps/web/.env.staging"
      via: "explicit dotenv load, never scripts/_bootstrap-env"
      pattern: "\\.env\\.staging"
---

<objective>
Census the `app.bypass_rls`-flagged population by SURFACE and by CATEGORY, then route only the
subset prior audits already named. The census is the deliverable; routing is the smaller half.

Purpose: the `bypass_rls_policy` drop is the next task and cannot be planned until somebody knows
how big the population is, where it lives, and what each part of it needs. The brief assumed ~20
statements. The measured population is an order of magnitude larger, and the follow-up work is one
task per SURFACE — so the census has to name the surfaces.

Output: a per-surface x per-category matrix with file AND statement counts, a machine-readable
`01-census.json` the follow-up batches run off, the named subset routed and proven with the policy
temporarily dropped, the click-through harness actually run, and a summary that says plainly the
bypass drop remains blocked.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/615-route-the-48-unscoped-statements-that-re/615-SUMMARY.md
@docs/audits/bypass-call-classification.md
@docs/audits/admin-connection.md
@docs/audits/policy-or-shortcircuit.md
@docs/audits/bypass-replacement-design.md
@.planning/quick/608-stop-real-database-test-suites-writing-t/608-SUMMARY.md
@.planning/quick/600-build-the-privileged-admin-connection-b5/600-SUMMARY.md
@.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md
</context>

<the_scope_decision>

The user was presented with the gap between the brief's `~20` and the measured population, and has
decided. **These are instructions, not suggestions.**

1. **SCOPE: census + the named ~20 only. Wrapper conversions stay separate.**
2. **Size each category BY SURFACE, not just in total** — driver portal, owner carrier portal,
   mobile API, lib/services. The batches after this task are one per surface, so the census must
   name them.
3. **Per category, state what routing it needs and roughly how many FILES it touches.** A
   DECORATIVE count of 80 and a CROSS_TENANT count of 80 imply very different remaining work.
4. **The drop stays blocked. Say so plainly** — do not imply progress toward it.
5. **Wrapper overlap: COUNT and CLASSIFY here, CONVERT nothing.** The countdown stays the single
   place tracking those.

**THE CENSUS IS THE DELIVERABLE.**

</the_scope_decision>

<what_is_already_measured>

Measured by the orchestrator and re-measured during planning. **Both are inputs to Task 1, neither
is a verdict** — Task 1 adjudicates them.

| measurement | value | method |
|---|---|---|
| raw grep hits, `apps/web/src`, all files | **195** | `grep -rn "app.bypass_rls" src --include=*.ts --include=*.tsx` |
| of those, on a test path | **5** | `grep -E "__tests__\|\.test\.\|\.spec\."` |
| of those, on a line starting `*` / `//` / `/*` | **13** | awk on the stripped line |
| **orchestrator's count** | **180 statements / 89 non-test files** | stated in the brief |
| **planning's naive line-grep** | **177 statements / 87 non-test files** | the awk filter above |

**The two disagree by 3 statements and 2 files. That disagreement is the reason the plan forbids a
bare grep.** A line starting `*` inside a template literal is code; a `$executeRaw` quoted in prose
is not. Task 1 adjudicates and reports which is right and why.

### Surfaces, from the naive measurement (177) — indicative, to be re-derived in Task 1

| bucket | statements |
|---|---|
| `app/api/mobile/**` | **84** |
| `lib/**` + `server/**` + `actions/**` | **45** (20 + 19 + 6) |
| `app/api/v1/**` | 14 |
| `app/(owner)/**` | 7 |
| `app/api/driver/**` | 6 |
| `app/(driver)/**` | 6 |
| `app/api/cron/**` | 4 |
| `app/api/auth/**` | 3 |
| `app/(admin)/**` | **0** |
| **residue** — `api/gps/report` (2), `api/driver-pay/.../dispute` (2), `api/track/[token]` (1), `api/push-tokens` (1), `api/integrations/samsara/sync` (1), `api/integrations/motive/sync` (1) | **8** |

**There IS residue. The four surfaces the user named cover 142 of 177.** The rule must name the
rest rather than force them.

### Outside the shipping tree — report separately, do NOT fold into the census

`apps/web/prisma/seed.ts` (15), `scripts/audit/*` (several), `scripts/backfill/*` (2+). These do not
ship and are not on the cutover path. Count them, name them, keep them out of the matrix.

### The dominant pattern is NOT what the four categories anticipate

`api/mobile/driver/hos/route.ts:20-48`, read in full during planning:

```ts
export const GET = withMobileAuth(async (req, { auth }) => {
  const { driverId, tenantId } = auth        // <- the tenant IS known, from the verified JWT
  /** @bypass_rls reason: mobile-api ... */
  const data = await prisma.$transaction(async (tx) => {          // <- the BARE client
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`
    const rawEntries = await tx.driverHOSEntry.findMany({
      where: { driverId, tenantId, ... },                        // <- and it is IN the where
    })
```

The tenant is in hand. The correct receiver is **`getTenantPrismaForOrg(tenantId)`**, **not
`getAdminDb`** — routing these to admin would violate this task's own prohibition. This is the
**wrapper-migration population**, which the user has ruled out of conversion scope here.

If this population is large — and 84 mobile statements suggest it is — **the four categories do not
fit it and the census must name a fifth.** Forcing 150 statements into DECORATIVE because it is the
nearest of four would destroy the census's whole value.

### The annotation is an input, and it is a CLAIM

79 `@bypass_rls reason:` docblocks across 66 files — so **roughly half the statements have no
annotation at all**, and `no annotation` is a legitimate recorded value. Vocabulary as found:
`mobile-api` 63 · `server-side session-authed web route` 5 · `pre-auth` 3 ·
`driver-server-component` 2 · `cross-tenant` 2 · `system-operation` 3 (**2 of which are prose inside
comments**) · `driver-api` 1.

**A worked example of an annotation that does NOT verify**, found during planning —
`api/mobile/support/ticket/route.ts`'s `generateTicketNumber`:

> `@bypass_rls reason: mobile-api` … `SCOPE: Accesses only data belonging to the authenticated
> user's tenant.`

The statement is `supportTicket.findFirst({ orderBy: { ticketNumber: 'desc' } })` with **no tenant
predicate at all**. It is a cross-tenant max. The annotation is false. Its web twin at
`actions/support-tickets.ts:99` is annotated `cross-tenant` and is correct. **Same function, two
copies, two annotations, one of them wrong** — which is the quick-606 decorative-comment finding in
a new place.

### The prior classification this census supersedes

`docs/audits/bypass-call-classification.md` (2026-09-12) already enumerated **211 executable sites
across 103 files**, classified **DECORATIVE 161 / CROSS_TENANT 50**, with per-file tables in §3 and
§4. It is the direct predecessor and **Task 1 must reconcile against it** — 211 then, ~177-180 now,
so ~31-34 statements have gone. quick-600, quick-613 and quick-615 are the likely destroyers. That
reconciliation is not optional: an unexplained drop of 34 statements is indistinguishable from a
broken walker.

### The named subset, re-resolved during planning — line numbers have DRIFTED

quick-615 §8 says "the 7 in `support-tickets.ts`". There are **5** today. `admin-connection.md` §9
calls `track/[token]`'s the "second bypass statement in that file"; there is **1** today. quick-611's
rule applies: **re-resolve by SYMBOL, keep the audit's line number only as a hint, and report the
corrections rather than silently fixing them.**

| item | file | line (planning) | audit id |
|---|---|---|---|
| `generateTicketNumber` (web) | `src/actions/support-tickets.ts` | 99 | **B7** |
| `generateTicketNumber` (mobile) | `src/app/api/mobile/support/ticket/route.ts` | ~39 | **B7** |
| `getCurrentUser` sysadmin branch | `src/lib/auth/supabase.ts` | 164 | **B8** |
| other `support-tickets.ts` blocks | `src/actions/support-tickets.ts` | 170, 218, 408, 447 | — |
| evaluator loop body | `src/lib/automations/evaluator.ts` | 127 | — |
| workflow-digest loop bodies | `src/app/api/cron/workflow-digest/route.ts` | 82, 102, 181, 190 | — |
| track GPS lookup | `src/app/api/track/[token]/route.ts` | 50 | §9 |

**13 statements, not ~20.** Reconcile that too.

### `.env.staging` now carries auth keys — the harness can run

Variables present (names only; **never echo this file**): `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL`,
`STAGING_DATABASE_URL_APP_USER`, `STAGING_DATABASE_URL_ADMIN`, `STAGING_SEED_PASSWORD`,
`TENANT_CONTEXT_TRIPWIRE`. The URL names **staging `wyixpgunnjmzguhggocz`** — verified during
planning, not production. quick-615 could not run the harness for exactly the missing key; that
blocker is gone.

`--out` is already honoured on passes 1 and 2 (`604-click-through.ts:88-89`, a shared helper added
by quick-610).

</what_is_already_measured>

<tasks>

<task type="auto">
  <name>Task 1: THE CENSUS — enumerate, surface, categorise. NO EDITS TO APPLICATION CODE.</name>
  <files>
apps/web/scripts/audit/616-bypass-census.ts
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.json
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.md
  </files>
  <action>
**This is the deliverable. Give it the most weight. Change no application code in this task.**

### 1a. The count reconciliation — FIRST, before anything else

State, at the top of `01-census.md`:
- the brief assumed **~20**;
- that number is quick-615 §8's **FIRST row** — only the statements prior audits had NAMED;
- the **NEXT row of the same table** says **"~211 bypass-exempt sites — quick-602's stated cost"**;
- both numbers were in the source, and the first was the wrong row for this question.

Quote both rows verbatim. Do not paraphrase — the point is that the source was not ambiguous.

### 1b. The walker — AST or line-anchored, never a bare grep

Build `scripts/audit/616-bypass-census.ts`. Requirements:

- **Parse, do not grep.** Use `ts.createSourceFile` (no `Program`, no type checker — quick-602's
  countdown does exactly this and it is enough). Find call expressions whose argument contains the
  `app.bypass_rls` literal. **A `$executeRaw` inside a comment or quoted in a template literal must
  not count.** If you use a line-anchored parse instead, it must strip block comments and line
  comments properly, and you must say so.
- **Handle BOTH shapes.** The callback form ``await tx.$executeRaw`...` `` and the
  **`$transaction([...])` array form** — `lib/auth/supabase.ts:164` uses the array form and a walker
  that only knows the callback form will silently miss it. `$executeRawUnsafe` is also in use.
- **Record the enclosing function or route export** for every statement. Walk up to the nearest
  `FunctionDeclaration` / `MethodDeclaration` / `ArrowFunction` bound to a named const, or the
  route's exported `GET`/`POST`/etc.
- **Exclude the 5 test-file calls and report them separately** with their file and line.
- **Report `apps/web/prisma/seed.ts`, `scripts/audit/*` and `scripts/backfill/*` separately too** —
  named, counted, and explicitly OUT of the matrix, with the reason (they do not ship; not on the
  cutover path).
- **State the method per count** (quick-607). Every number in the output carries how it was derived.

### 1c. Adjudicate 177/87 vs 180/89

The two naive measurements disagree. **Report which the parse says is right and WHY, naming the
specific lines that differ.** Do not average them, do not pick the larger to be safe. If the parse
gives a third number, that is the answer and the other two are both wrong — say so.

### 1d. Anti-vacuity floor and counter-assertion — both halves

quick-546/600's rule: **the failure mode of a bad walker is GREEN.**

- **Floor:** assert the total exceeds a stated minimum (use 150) and that the file count exceeds a
  stated minimum (use 80). A walker that silently returns nothing must fail, not pass.
- **Positive witness:** name a file known to carry a bypass — `api/mobile/driver/hos/route.ts` —
  and assert it yields a non-zero count at the expected line.
- **Counter-assertion:** name a file known NOT to carry one — use
  `src/lib/auth/mobile-auth.ts`, which `bypass-call-classification.md` §1 records as containing
  **only prose** at line 24 — and assert the walker **confirms it was READ** (parsed, non-zero
  bytes) **and yields zero statements**. Without the "was read" half, a walker that skipped the file
  entirely passes identically.
- **A third witness for the array form:** assert `lib/auth/supabase.ts` yields its statement. That
  is the one shape a callback-only walker drops.

### 1e. The SURFACE rule — stated, applied, residue named

Use **exactly** the four surfaces the user named, in this precedence order, plus explicit residue:

| surface | path rule |
|---|---|
| `DRIVER_PORTAL` | `src/app/(driver)/**` |
| `OWNER_PORTAL` | `src/app/(owner)/**` |
| `MOBILE_API` | `src/app/api/mobile/**` |
| `LIB_SERVICES` | `src/lib/**`, `src/server/**`, `src/actions/**` |

**Anything else gets its own named surface** — `API_V1` (`src/app/api/v1/**`), `API_CRON`,
`API_DRIVER` (`src/app/api/driver/**`), `API_AUTH`, `ADMIN_PORTAL`, and an explicit
`API_OTHER_<name>` for each residue route rather than one bucket. **Report the rule, report the
residue honestly, and state the precedence** (a path can match two rules; say which wins).

Do NOT invent a surface that collapses residue to make the table tidy. The residue is 8 statements
across 6 routes and the follow-up batches need to see them.

### 1f. The CATEGORY rule — QUOTE the definitions, do not re-invent them

**Read the source documents FIRST and reuse the definitions verbatim.** They exist:

- **DECORATIVE** and **CROSS_TENANT** are defined in `docs/audits/bypass-call-classification.md` §2
  (including its rule (d) and its deliberate bias toward CROSS_TENANT — quote that bias, it is
  load-bearing: *"A wrong DECORATIVE is a production outage at cutover; a wrong CROSS_TENANT is
  wasted effort."*).
- **BOOTSTRAP** — the 7 named sites, `docs/audits/bypass-replacement-design.md` and quick-600 §4.1.
- **BROKEN_POLICY** — locate its definition; `admin-connection.md` §9's B7 is the exemplar. If no
  document defines it crisply, **say so** and write a definition, marked as new.

**Quote each definition in `01-census.md` with its source file and section.** If a definition cannot
be found, that is a finding, not licence to guess.

### 1g. The FIFTH category — name it if the four do not fit

The `api/mobile/driver/hos/route.ts` pattern above is the likely case: **the tenant is known, the
predicate is already in the query, and the statement is on the bare client.** It is not DECORATIVE
in the sense that matters (it does not merely lack a need — it has a real need the bare client
cannot meet), it is not CROSS_TENANT, not BOOTSTRAP, not BROKEN_POLICY.

**If a statement genuinely fits none of the four, name a fifth category and define it.** Suggested:
`TENANT_KNOWN_UNSCOPED` — the tenant is in hand from a verified source (JWT, session) and the
receiver should be `getTenantPrismaForOrg(tenantId)`. **This is the wrapper-migration population and
it is CENSUS-ONLY in this task.**

**Do not force statements into DECORATIVE because it is the nearest of four.** If the fifth category
turns out to hold 140 statements, that is the census's most valuable single finding.

### 1h. Per statement, record all of

`file` · `line` · `enclosingFunction` · `surface` · `category` · `routingNeeded` ·
`receiver` (`getAdminDb` | `getTenantPrismaForOrg` | `DELETE_FLAG_ONLY` | `POLICY_FIX`) ·
`annotationReason` (as found, or `null`) · `annotationVerifies` (`true` | `false` | `n/a`) ·
`annotationNote` (why, when false) · `alreadyAcquiresTenantClient` (boolean — the orchestrator
measured 13 such files; re-derive it) · `inNamedSubset` (boolean).

**Treat every annotation as a CLAIM to verify against the code, never a verdict** (quick-606). The
`generateTicketNumber` mobile copy is a worked false example — carry it in the write-up.

### 1i. The reconciliation against the 211

Diff this census against `bypass-call-classification.md` §3/§4's per-file tables. For every statement
present there and absent now, **attribute it to a named commit or task** (`git log -S "app.bypass_rls"`
over the file). Report: still present / removed by quick-NNN / moved / unaccounted. **An unaccounted
statement is a finding** — an unexplained drop of 34 is indistinguishable from a broken walker.

### 1j. The deliverables

- **`evidence/01-census.json`** — machine-readable, one record per statement, the schema above.
  The follow-up batches are driven from this file, so it must be stable and complete.
- **`evidence/01-census.md`** — the reconciliation, the method statements, the surface rule and its
  residue, the quoted category definitions, the annotation findings, the 211 reconciliation, and
  **THE MATRIX**:

```
                  | DECORATIVE | CROSS_TENANT | BOOTSTRAP | BROKEN_POLICY | <5th> | total
                  | files stmt | files   stmt | ...
DRIVER_PORTAL     |
OWNER_PORTAL      |
MOBILE_API        |
LIB_SERVICES      |
API_V1            |
...               |
total             |
```

**Both counts in every cell.** The user asked for files as well as statements, explicitly, because
"a DECORATIVE count of 80 and a CROSS_TENANT count of 80 imply very different remaining work" — and
so does 80 statements in 4 files versus 80 in 60.

Then, **per category**: what routing it needs, how many FILES it touches, and a one-line statement
of what a batch closing it would involve.
  </action>
  <verify>
`npx tsx scripts/audit/616-bypass-census.ts` exits 0, prints its floor and both witness assertions
as explicit PASS lines, and writes both artefacts. Deliberately break the walker (return early from
the visitor) and confirm the floor fires RED; restore and confirm GREEN. Capture both outputs
verbatim — a guard asserted without a witnessed red is the quick-549 shape.
`git status` shows no change under `apps/web/src/`.
  </verify>
  <done>
`01-census.json` holds one record per executable statement with all eleven fields populated.
`01-census.md` leads with the ~20-vs-measured reconciliation naming both quick-615 §8 rows, states
the parse method per count, adjudicates 177/87 vs 180/89, names every surface including residue,
quotes every category definition with its source, names a fifth category if the four do not fit,
reconciles against the 211, and carries the matrix with file AND statement counts per cell plus the
per-category routing/file-count statement. No application file is modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Route the NAMED subset only — 13 statements, re-resolved by symbol</name>
  <files>
apps/web/src/actions/support-tickets.ts
apps/web/src/app/api/mobile/support/ticket/route.ts
apps/web/src/app/api/cron/workflow-digest/route.ts
apps/web/src/lib/automations/evaluator.ts
apps/web/src/app/api/track/[token]/route.ts
apps/web/src/lib/auth/supabase.ts
apps/web/src/lib/db/admin-reasons.ts
apps/web/tests/security/admin-connection-allowlist.test.ts
apps/web/prisma/migrations/*/migration.sql
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/02-routing.md
  </files>
  <action>
**Route ONLY the named subset. Nothing else. The wrapper-migration population is census-only.**

### 2a. Re-resolve every item by SYMBOL before editing

quick-611's rule. The line numbers in quick-615 §8 and `admin-connection.md` §9 have **already
drifted** — §8 says 7 in `support-tickets.ts` and there are 5; §9 calls `track/[token]`'s the
"second" statement and there is 1. Re-resolve each by enclosing function name, keep the audit's
number as a hint only, and **report the corrections in public** rather than silently fixing them.

Reconcile the count: the brief says ~20, planning resolved **13**. State the difference and where
the extra ~7 went (quick-615's own edits are the likely answer — check `git log`).

### 2b. Classify each, then route by class

- **BOOTSTRAP / CROSS_TENANT → `getAdminDb(reason)`.** One `AdminReason` per **UNIT OF WORK**, not
  per call site — `admin-reasons.ts`'s header states this convention; follow it and reuse an
  existing member where the job is the same.
- **DECORATIVE → the flag is DELETED and the statement stays on the tenant client.** No new
  acquisition, no admin connection.
- **BROKEN_POLICY → a MIGRATION, never a bypass.** And for each one: **QUOTE the live policy from
  `pg_policies`** (read it off staging, do not read the migration file — DEC-14) and **NAME what
  cannot satisfy it.** A BROKEN_POLICY verdict without the quoted policy is not a verdict.

### 2c. B7 — the two `generateTicketNumber` copies. Weigh the two remedies and say which and why.

This is the known BROKEN_POLICY candidate. `admin-connection.md` §9:

> An admin connection is the wrong fix here (it would paper over a data-model problem); the correct
> fix is `CREATE SEQUENCE support_ticket_number` + `GRANT USAGE` to `app_user`, which removes the
> cross-tenant read AND the live race between the two copies in one change.

**Weigh the sequence against a `getAdminDb` route explicitly and record the choice with its
argument.** Points that must appear in the weighing:
- The sequence removes the **live race** — two copies doing read-max-then-insert with no lock. A
  `getAdminDb` route fixes the RLS problem and leaves the race.
- §9's predicted symptom: under `app_user` with an empty GUC the read returns **zero rows, not an
  error**, so `generateTicketNumber` issues `TKT-0001` for every new ticket and collides
  immediately. A silent wrong answer, which is the worse failure mode.
- If the sequence is chosen: it must start above the current max (read it, do not assume),
  `GRANT USAGE ON SEQUENCE` to `app_user`, **both** copies converted, and the migration carries a
  DEC-17 hand-mirrored ledger row (`applied_steps_count = 0`, real SHA-256 over LF bytes) READ BACK
  after a known-good sentinel row is confirmed visible.
- Also record: the mobile copy's annotation is **false** (`reason: mobile-api`, SCOPE claiming
  single-tenant, over a query with no tenant predicate). Fix or delete the annotation with the code.

### 2d. B8 — `lib/auth/supabase.ts:164`. STOP-AND-REPORT IS AN ACCEPTABLE OUTCOME.

Read the file's own header before touching it. It states, and planning confirmed:
- `set_config(..., TRUE)` is transaction-local, so **deleting the transaction silently removes the
  bypass**; `User` is FORCE-RLS and the bootstrap read would return null and log nobody in.
- The `withTenantContext` remedy is **wrong here** — it would leave `app.bypass_rls = on` for the
  remainder of the caller's unit of work.
- **Nine call-chain units** reach a transaction through this function
  (`wrapper-migration-scope.md` §1b).
- `admin-connection.md` §9 calls it "a bigger, separate task" and notes **37 of 38 production
  accounts resolve their tenant from the JWT with no database call** — only the single
  `isSystemAdmin` account needs the fallback.

**If routing it safely requires restructuring those nine units, STOP AND REPORT.** Say what it
needs, size it, leave it unrouted, and count it in the remaining backlog. A half-done auth path is
worse than a named open item. Do not force it to fit this task's shape.

### 2e. Leave NO flag behind on a routed path

Every routed statement loses its `set_config` line in the same edit. **Report removed vs remaining
repo-wide by re-running Task 1's walker**, and the remaining number must **reconcile** with the
census total minus the removals. If it does not reconcile, stop — something else changed.

### 2f. Allowlist and reasons

Any new `getAdminDb` call site goes into `tests/security/admin-connection-allowlist.test.ts` with a
**real measured** per-file call count. Raise `TOTAL_EXPECTED_CALLS` to the measured number. **Weaken
no floor.** Witness the gate RED (add a deliberate out-of-allowlist import), then revert and witness
GREEN, capturing both verbatim.

### 2g. Explicitly NOT done here

**Do not convert the wrapper-migration population** (`TENANT_KNOWN_UNSCOPED`, or whatever Task 1
names it). Count it, classify it, leave it. The countdown stays the single place tracking those —
the user's decision. If a named-subset item turns out to BE one of them
(`evaluator.ts:127` and the four `workflow-digest` loop bodies are the likely case —
`admin-connection.md` §9 already says `getTenantPrismaForOrg` is their correct destination and that
"A2's rule governs when, not this task"), **say so and leave it**, counting it in the backlog.
That may reduce the 13 to a smaller routed set. That is the correct outcome, not a shortfall.
  </action>
  <verify>
`npx tsx scripts/audit/616-bypass-census.ts` re-run: the removed statements are gone, the remaining
total reconciles with the census minus removals, arithmetic shown.
Allowlist gate witnessed RED then GREEN, both captured verbatim.
Any migration: applied to STAGING only, DEC-17 ledger row hand-written with `applied_steps_count=0`
and a real SHA-256, and READ BACK after a known-good sentinel row is confirmed visible.
  </verify>
  <done>
Each named item is re-resolved by symbol with its line correction reported; classified; routed by
class or explicitly stopped-and-reported with a reason. B7's sequence-vs-`getAdminDb` choice is
argued in writing with §9's silent-`TKT-0001` symptom named. Every BROKEN_POLICY verdict quotes the
live policy from `pg_policies` and names what cannot satisfy it. No routed path keeps a bypass flag.
No wrapper-population statement is converted. `evidence/02-routing.md` records all of it.
  </done>
</task>

<task type="auto">
  <name>Task 3: The proof — both directions, on staging, with `bypass_rls_policy` TEMPORARILY DROPPED</name>
  <files>
apps/web/scripts/audit/616-routing-verify.ts
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/03-proof.md
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/03-policy-capture.json
  </files>
  <action>
**This is the highest-risk operation in the task. Read 3b in full before writing any DDL.**

Prove on STAGING as `app_user`, tripwire armed and READ BACK, **with `bypass_rls_policy` temporarily
dropped on the affected tables** — so the proof does not rest on the policy that is about to be
removed. That is the whole point of the exercise.

### 3a. The instrument

Model on `scripts/audit/615-routing-verify.ts`. Non-negotiable:
- **Never import `scripts/_bootstrap-env`.** Load `apps/web/.env.staging` explicitly with dotenv.
- **Refuse POSITIVELY on anything that is not staging**, and loudly by name on production
  `oqdhberkghtnszrkdvfm`. Refuse before issuing any statement.
- Print `[db-target] project : wyixpgunnjmzguhggocz (staging)` **to STDERR**, with the connection
  string **MASKED**. Never echo `.env.staging`.
- Arm the tripwire per connection with `set_config('app.tenant_context_tripwire','on',false)`,
  **read it back**, and refuse to run if it reads back as anything but `on`.

### 3b. The drop and the restore — capture DDL first, restore in `finally`, verify byte-for-byte

**`--capture` (before anything else):**
1. Read every `bypass_rls_policy` from `pg_policies` — `schemaname`, `tablename`, `permissive`,
   `roles`, `cmd`, `qual`, `with_check`.
2. Reconstruct the exact `CREATE POLICY` DDL for each and write **all of them** to
   `evidence/03-policy-capture.json`, on disk, before a single `DROP`.
3. Record the **sorted table list** and its length. Confirm **86**. If it is not 86, STOP — the
   population changed and this plan's numbers are stale.

**`--drop`:** drop `bypass_rls_policy` **only on the tables the routed statements touch** — the
affected subset, named explicitly in the evidence, not all 86.

**`--restore`:** re-create each dropped policy **from the captured DDL**, and then **verify**:
- the sorted table list is back to **86** and is **identical** to the captured list — nothing
  only-in-before, nothing only-in-after. **A count is not sufficient**: two compensating changes
  keep a count identical (quick-599/612's rule, and the user asked for the sorted list explicitly).
- **each restored `qual` / `with_check` / `cmd` / `roles` matches the captured original
  byte-for-byte.** Verifying that "a policy with that name exists" is what lets a restored policy
  with a different body pass.

**Structure:** the drop/restore must be **transactional, or the restore must be in a `finally`**
that runs on every exit path including a thrown error and a SIGINT. If a single transaction can
hold the drop, the probes and the restore, prefer that — then an abort restores everything for
free. If it cannot (the probes need separate transactions per cell — see 3c), the `finally` is
mandatory and must itself be verified, not assumed.

**Print the restore verification as the LAST thing the script does, always.**

### 3c. The matrix

Per routed statement, both directions:
- **New receiver:** the statement succeeds.
- **Old receiver:** refused, or under-reads.

Rules, all of which have bitten before:
- **ONE TRANSACTION PER CELL.** A `TC001` aborts its transaction and every later statement in it
  returns `25P02` — a run of `25P02`s is one failure wearing many costumes.
- **SQLSTATE off `err.cause.code`, never `err.code`.** Prisma surfaces it as a `DriverAdapterError`
  whose own `code` is `undefined`. Walk the cause chain.
- **Recognise `TC001` by CODE, never by message prose.**
- **Every zero carries a privileged counter-read** proving the rows exist. A zero over an empty
  table proves nothing (quick-610: an AFTER read that "succeeds" over zero rows is vacuous).
- **Every cross-tenant `foreign === 0` is PAIRED with `own > 0`** on the same connection in the same
  transaction.
- **Counts come from a scalar, never `rowCount`.**
- Any cell that cannot be proven — no fixture, empty table — is reported **UNPROVEN by name**, not
  quietly passed. quick-615 named `Load` this way; do the same.

### 3d. Fixtures

If a cell needs rows, use `scripts/audit/610-staging-fixtures.ts --ensure` or the disposable-tenant
convention (`tests/carrier/document-import-commit-rollback.test.ts`). Delete children before the
tenant. Verify staging is clean afterwards — zero leftover tenants, zero orphan rows.
  </action>
  <verify>
`--capture` writes 86 policies to disk and prints the sorted list length before any DROP.
`--restore` prints the sorted table list back at 86, IDENTICAL to captured (nothing only-in-before,
nothing only-in-after), AND a per-policy byte-for-byte expression match.
Kill the script mid-run (SIGINT) once, deliberately, and confirm the `finally` restored everything —
then re-verify 86 and the identical sorted list. That is the only way to know the `finally` works.
Every matrix cell reports its SQLSTATE from the cause chain; every zero shows its counter-read.
  </verify>
  <done>
Every routed statement is proven in both directions on staging as `app_user`, tripwire armed and
read back, with `bypass_rls_policy` dropped on the affected tables. The policies are restored from
captured DDL and the restore is verified by an identical sorted table list at 86 AND a byte-for-byte
expression comparison. Unproven cells are named. No production statement was issued.
  </done>
</task>

<task type="auto">
  <name>Task 4: THE CLICK-THROUGH HARNESS — it must actually run this time</name>
  <files>
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/04-click-through.md
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/04-click-through.json
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/04-server.log
  </files>
  <action>
**Run it BEFORE the routing work is treated as done** — the user's instruction. quick-615 could not
run it because `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` was **production**. `.env.staging` now
carries a staging URL and anon key, verified during planning. **That blocker is gone.**

### 4a. The server

Start a Next server pointed **entirely at staging**:
- `DATABASE_URL` = staging as **`app_user`** (`STAGING_DATABASE_URL_APP_USER`)
- tripwire **armed**
- `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` from `.env.staging`

**Under no circumstances start a server against production auth.** quick-614 and quick-615 both
refused for this reason. Before starting, **assert the resolved Supabase ref is
`wyixpgunnjmzguhggocz`** and refuse otherwise — positively, by name. Print the ref to stderr with
the key MASKED.

Stop any running `next dev` first, and delete `apps/web/.next` if the tree changed under a running
server (the standing Turbopack rule — a restart alone does not fix a poisoned cache).

### 4b. Logins

From `scripts/seed-staging-auth.ts`'s seeded staging users plus `STAGING_SEED_PASSWORD` from
`.env.staging`. **The session is obtained via `POST /api/auth/login`, never forged** — the harness
header explains why, and it is right.

### 4c. `--out`, and not corrupting closed evidence

- **Passes 1 and 2 must share the SAME `--out`.** Pass 2 reads what pass 1 wrote. Without `--out`
  both land on quick-604's `04-click-through.json`, which carries **byte offsets into quick-604's
  own server log** — overwriting it is destructive by construction. `--out` goes through
  `path.resolve`, so pass an absolute path under this task's evidence directory.
- Point `CLICK_THROUGH_LOG` at this task's own `04-server.log` for the same reason.
- **Hash `.planning/quick/604-*`, `605-*` and `606-*` evidence at open and at close and confirm
  byte-identical.** quick-610 proved all 28 unchanged this way; do the same and report the count.

### 4d. What to report

- **surfaces · pass · fail · not-reachable · the classification counts.**
- **Whether anything it now reaches was PREVIOUSLY UNMEASURED** — the user's specific question.
  This is the first run since the keys landed, so compare the reached-surface set against
  quick-604's and quick-606's artefacts and name what is new.
- **A 200 is not a pass.** quick-602 measured `purge-deleted` raising `TC001` seven times behind an
  HTTP 200 with `success: true`. **The correlated server-log slice is the authority**, never the
  status code. Report per surface from the log slice.

### 4e. If it still cannot run

**Say exactly why and substitute nothing weaker.** No partial harness, no unauthenticated fetch
dressed up as a click-through. quick-615 handled this correctly and its wording is the model.
  </action>
  <verify>
The resolved Supabase ref is asserted `wyixpgunnjmzguhggocz` before the server starts; the assertion
output is captured. Passes 1 and 2 run with the same absolute `--out` under this task's evidence.
Prior-task evidence hashed at open and close, byte-identical, count reported.
  </verify>
  <done>
`04-click-through.md` reports surfaces / pass / fail / not-reachable / classification counts, names
what was previously unmeasured, and draws every per-surface verdict from the correlated log slice
rather than the status code. quick-604/605/606 artefacts confirmed untouched. If it did not run, the
exact reason is stated and nothing weaker is in its place.
  </done>
</task>

<task type="auto">
  <name>Task 5: Gates — and prove each one is not lying</name>
  <files>
.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/05-gates.md
  </files>
  <action>
### 5a. `tsc --noEmit` — and prove the gate is not blind

Run it. Then **probe**: inject `const x: number = 'y'` into a file this task **actually edited**,
confirm tsc reports **that** error at **that** line, **delete the probe**, re-run.

If the only errors are syntax errors, or all in files you did not touch, **the gate is blind, not
green** — delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and
re-run. Sweep for leftover probes from previous runs (quick-519 found a `__probe.ts` still in the
tree).

### 5b. `npm run build`

Exit 0. Record the compile line.

### 5c. `npm run audit:rls-policy-drift`

Zero, **and NAME the database it measured.** quick-615 reported this script **does not print its own
target** — so **pin the target on the command line and state the ref in the evidence.** Do not infer
it. If the definition layer reports exit 3, the canonical artefact is stale and **that refusal is
how you know it covers your change** — regenerate against staging and record that the artefact now
describes staging, so the detector reports drift against production until a human deploys.

### 5d. vitest

- **Same reporter both directions.** `--silent` and `--reporter=json` disagree by ±4 on this suite.
- **Never `--reporter=basic`** — it does not exist in vitest 4 and **exits 0 having run ZERO tests**.
  A green run whose output contains no `Test Files … | Tests …` summary is not a green run.
- **Baseline via `git stash` on THIS tree.** Never `git worktree` — it drops the gitignored
  `apps/web/.env.local` and the skew reads as a real delta (quick-567).
- **Stop any running `next dev` before `git stash`** — it poisons the Turbopack cache and a restart
  does not fix it.
- **Measure the baseline AFTER this task's last file is written** (quick-561), and compare the
  failing-**FILE** set, not just counts.

### 5e. `bypass_rls_policy`

**86 before, 86 after, compared as a sorted TABLE LIST** — this is the cross-check on Task 3's
restore, run independently of Task 3's own instrument.

### 5f. Wrapper countdown

Regenerate `scripts/audit/wrapper-countdown.json`. **The number may go UP** if this task's routing
adds `getTenantPrismaForOrg` acquisitions — quick-610 went 469 → 475 and **that is the honest
direction.** Never weaken the assertion to make it fall.
  </action>
  <verify>
Every gate's raw output is captured verbatim in `05-gates.md`, each with the database or tree it
measured named explicitly. The tsc probe's TS2322 is captured, and its deletion confirmed by a
repo-wide sweep.
  </verify>
  <done>
tsc 0 and proven not blind; build exit 0; drift zero with its database NAMED; vitest failing-FILE
set unchanged measured with the same reporter both ways from a `git stash` baseline on this tree;
`bypass_rls_policy` 86 before and after as a sorted list; countdown regenerated, never weakened.
  </done>
</task>

<task type="auto">
  <name>Task 6: The write-up — lead with the reconciliation, end with the blocked drop</name>
  <files>
.planning/quick/616-route-the-bypass-flagged-statements-befo/616-SUMMARY.md
docs/audits/bypass-call-classification.md
  </files>
  <action>
### 6a. Lead with the count reconciliation

First section, before anything else: **~20 briefed vs the measured population.** Why the ~20 was
wrong — it was quick-615 §8's **first row**, the NAMED statements; the **next row of the same table**
said ~211. **Name which row each number came from.** Quote both. The source was not ambiguous and
the summary should say so rather than soften it.

### 6b. Carry the matrix

The full per-surface x per-category matrix, **file AND statement counts in every cell**, lifted from
`01-census.md`. This is what the reader came for.

### 6c. Per category: what routing it needs and how many files it touches

One row each. "A DECORATIVE count of 80 and a CROSS_TENANT count of 80 imply very different
remaining work" — make that difference visible.

### 6d. STATE PLAINLY THAT THE BYPASS DROP REMAINS BLOCKED

Not "progress toward". **Blocked.** Say what still blocks it and how much is left.

Then answer: **what would break if `bypass_rls_policy` were dropped today — naming SURFACES, not
categories.** "The driver HOS screen", "the owner fleet message thread", "the mobile support ticket
form". **Not** "the CROSS_TENANT class". A surface is something a person can picture; a category is
not. Drive this from `01-census.json` joined to the enclosing-function/route field, so it is derived
from the census rather than recalled.

### 6e. The backlog, sized PER SURFACE

One row per surface, each ready to become one task: statements, files, categories present, what
routing it needs, and any known blocker. `MOBILE_API` at ~84 statements is the biggest and may need
splitting — say so if the census supports it.

### 6f. Stopped-and-reported items

Every correction found: the drifted line numbers, the false `generateTicketNumber` annotation,
B8 if it was left unrouted, any unaccounted statement in the 211 reconciliation, the 177/87-vs-180/89
adjudication, and whether `audit:rls-policy-drift` still fails to name its target.

### 6g. Correct the superseded audit in public

`docs/audits/bypass-call-classification.md` is now stale — its 211/103 and its two-category split.
**Add a dated header correction pointing at this census**, in place, rather than leaving a document
that reads as current. Do not delete its per-file tables; they are the reconciliation's input.

### 6h. What this task deliberately did NOT do

No bypass drop (86 before and after, sorted list). No cutover. No production write. No wrapper
conversions — census only, per the user's decision, so the countdown stays the single tracker.
Nothing installed. No guard weakened. Nothing pushed.
  </action>
  <verify>
The summary's first section is the reconciliation naming both quick-615 §8 rows. The matrix carries
both counts per cell. §6d names surfaces and contains no category name in its break list. The
backlog has one row per surface. `bypass-call-classification.md` carries a dated correction header.
  </verify>
  <done>
`616-SUMMARY.md` leads with the reconciliation, carries the matrix with file and statement counts,
states per category what routing it needs and how many files, says PLAINLY that the bypass drop
remains blocked, answers the break question by SURFACE, sizes the backlog per surface ready to be
one task each, and lists every stopped-and-reported correction. The superseded audit is corrected
in public.
  </done>
</task>

</tasks>

<verification>

- `01-census.json` holds one record per executable statement, eleven fields each, and every
  follow-up batch could be driven from it without re-reading source.
- The census walker's floor and BOTH witness assertions (a positive file, and a
  confirmed-read-yields-zero negative) are witnessed RED then GREEN.
- The 177/87 vs 180/89 disagreement is adjudicated with the differing lines named.
- Every surface in the matrix traces to a stated path rule; residue is named, never bucketed.
- Every category definition is quoted with its source file and section; a fifth is defined if
  needed and nothing is forced into DECORATIVE.
- The 211/103 reconciliation attributes every disappeared statement to a named commit or task,
  or reports it unaccounted.
- No statement routed to `getAdminDb` that a tenant client can serve; no routed path keeps a flag;
  removed + remaining reconciles with the census.
- Every BROKEN_POLICY verdict quotes the live policy from `pg_policies` and names what cannot
  satisfy it.
- The proof ran with `bypass_rls_policy` dropped on the affected tables, one transaction per cell,
  SQLSTATE off the cause chain, counter-reads on every zero, `foreign === 0` paired with `own > 0`.
- The restore is verified by an identical SORTED TABLE LIST at 86 **and** a byte-for-byte expression
  match against captured DDL — and the `finally` is proven by a deliberate SIGINT.
- The click-through harness ran against staging auth, passes 1 and 2 shared one `--out`, prior
  tasks' artefacts hashed byte-identical, and previously-unmeasured surfaces are named.
- Every gate names the database or tree it measured; tsc proven not blind; no reporter mismatch.
- The summary says the drop is BLOCKED and names SURFACES, not categories.

</verification>

<success_criteria>

- A census exists that a follow-up batch can be run from, per surface, without re-deriving anything.
- The named subset is routed or explicitly stopped-and-reported, and proven with the policy dropped.
- The click-through harness ran, or exactly why it could not is stated with nothing weaker in place.
- `bypass_rls_policy` is 86 before and 86 after, verified as a sorted list.
- The bypass drop remains blocked, and the summary says so plainly.

</success_criteria>

<absolute_limits>

- **NEVER write to production `oqdhberkghtnszrkdvfm`.** Staging writes permitted for migrations,
  probe fixtures and the temporary policy drop/restore only.
- **DO NOT DROP `bypass_rls_policy` PERMANENTLY. That is the NEXT task.** Task 3's drop is scoped to
  the affected tables, lives inside the proof, and MUST be restored and byte-verified.
- **Do not route a statement to `getAdminDb` that a tenant client can serve.**
- **Do not leave a bypass flag on a routed path.**
- **Do not convert the wrapper-migration population** — census only, per the user's decision.
- **Install nothing. Do not `git push`. Do not weaken any guard to go green.**
- **`apps/web/.env.staging` holds LIVE CREDENTIALS — never echo it; mask every connection string and
  key everywhere they are printed.**
- **Stop-and-report beats guessing.** B8 in particular is an acceptable stop.

</absolute_limits>

<output>
After completion, create
`.planning/quick/616-route-the-bypass-flagged-statements-befo/616-SUMMARY.md`
per Task 6.
</output>
