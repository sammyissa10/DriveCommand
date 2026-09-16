# Policies whose OR branch cannot save them from the tripwire — and whether the tripwire is the right instrument

**Date:** 2026-09-15
**Status:** INVESTIGATION ONLY. **No writes reached either database.** No migration, no DDL, no
INSERT/UPDATE/DELETE, no fixture. Every probe ran inside `BEGIN; SET TRANSACTION READ ONLY; …;
ROLLBACK`. The only state this task changed anywhere is a **session GUC on the probe's own
connection** (`set_config('app.tenant_context_tripwire','on',false)` and, on two cells,
`set_config('app.bypass_rls','on',true)`) — that is this backend's session state, it persists no
row, touches no catalog, and dies with the connection. It is **not a database write**, and nothing
about the staging tripwire's arming was changed on disk.
**Target:** measurement on STAGING `wyixpgunnjmzguhggocz` as `app_user` (`rolbypassrls=false`) with
the tripwire armed and READ BACK. Catalog enumeration on BOTH databases, read-only.
**This task:** quick-614. Evidence:
`.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/`.
**Predecessors:** quick-602 (the tripwire), quick-612 (the `AutomationRule` split), quick-613 (the
sysadmin routing). `docs/audits/admin-connection.md` §9 is the existing unrouted list this audit
reconciles against.

---

## THE HEADLINE, BEFORE ANYTHING ELSE

The brief asked which policies have a tenant-independent OR branch that cannot save them from
`TC001`. The measured answer makes the question smaller and the finding larger:

> **Nothing can save any statement from the tripwire, because the raise happens at PLAN TIME.**
> `EXPLAIN` *without* `ANALYZE` — which produces a plan and executes nothing — raises `TC001`.
> PostgreSQL's planner evaluates `current_tenant_id()` while estimating the selectivity of
> `Var = <stable expression>`, before a single row is touched. An OR branch cannot short-circuit
> past a call that precedes row processing entirely; nor can an empty table, an empty subquery, a
> `CASE`, or a `COALESCE`. Measured on a table with **RLS switched off**, so this is not even an RLS
> property (evidence `04-explain.md` Part 3, cells `M1`/`M2`/`M3`/`M4`).

And the population is 86 tables, not one, because of how the brief's "OR" is actually spelled:

> **The literal-`OR` policy count is 1.** The **effective** OR count is **86 tables** — PostgreSQL
> ORs PERMISSIVE policies together at the top level, and 86 tables carry a separate permissive
> `bypass_rls_policy` beside their tenant policy, so their effective expression is
> `(bypass) OR (<predicate calling current_tenant_id()>)`. That is the OR shape, 86 times over,
> spelled as two policies rather than one. **And that OR saves none of them.** What saves a
> bypass-flagged statement is not the OR at all — it is the `IF … app.bypass_rls = 'on' THEN RETURN
> NULL` arm INSIDE `tenant_context_required()`, a different mechanism at a different layer. quick-602
> measured the policy-level OR failing to suppress the raise six times out of six before that
> exemption existed; this task re-measured the post-exemption behaviour directly (cells `BYP-on`,
> `BYP-on-tag`).

---

## 1. The state correction — production is NO LONGER "awaiting deploy"

quick-612 §9 item 1 and quick-613 §12 items 1 and 7 both say production is waiting for a human's
`vercel --prod`. **That sentence is now stale, and this audit supersedes it.** All three migrations
are live on production.

Read off `_prisma_migrations` on each database, on a `postgres` connection, with a known-good
sentinel row seen first per DEC-17 (evidence `01-enumeration.md` §6):

### PRODUCTION `oqdhberkghtnszrkdvfm`

| migration | `applied_steps_count` | `checksum` |
|---|---|---|
| `20260914180000_tenant_context_tripwire` | **1** | `manual` |
| `20260915140000_automation_rule_per_command_policy_split` | **1** | `manual` |
| `20260915150000_grant_automation_rule_to_app_admin` | **1** | `manual` |

### STAGING `wyixpgunnjmzguhggocz`

| migration | `applied_steps_count` | `checksum` |
|---|---|---|
| `20260914180000_tenant_context_tripwire` | **0** | `ad2f6892ede6f5c36e71f87b93c709e66ec37885f181aeb85dcce9a886f724dc` |
| `20260915140000_automation_rule_per_command_policy_split` | **0** | `546a2913715646cda77d3b0f942fd2f06a928721311895aa66877aa7df981b2d` |
| `20260915150000_grant_automation_rule_to_app_admin` | **0** | `27619f74901178a04d6eaa3d10dc449e5882ec37b33369c8f5da630e9111d949` |

Per DEC-17 the two signatures mean opposite things, and that is the whole evidence:

- `applied_steps_count = 1` + `checksum = 'manual'` is what **`scripts/migrate.mjs` actually
  executing the file** writes. Production carries it on all three.
- `applied_steps_count = 0` + a real SHA-256 over the LF bytes is the repo's **hand-mirrored**
  resolved-not-run convention. Staging carries it on all three, because quick-602/612/613 applied
  the DDL out of band and wrote the ledger row by hand.

Exactly as quick-612 §4 predicted. **Both databases are now at 186 policies / 86
`bypass_rls_policy`**, and the two enumerations are byte-identical: a comparison of the sorted
`(table, policy, cmd, class, has_bypass, qual, with_check)` tuples returns **0 prod-only, 0
staging-only**.

**The production deploy is a fact, not an assumption, and it changes the risk picture.** The tripwire
FUNCTION is now installed on production. It remains a behavioural no-op there because
`shouldArmTripwire()` requires the staging project ref in the connection string, so
`lib/db/prisma.ts`'s `pool.on('connect')` never sets the flag and the `CASE` branch is never taken.
Both privileged sessions read `app.tenant_context_tripwire` as `NULL`.

---

## 2. The counts

Classification rule, applied to `qual || ' ' || with_check` from `pg_policies`, first match wins
(evidence `01-enumeration.md` §2). Identical on both databases.

| shape | policies | distinct tables | of which measured to RAISE |
|---|---|---|---|
| **EFFECTIVE OR** — permissive-policy ORing with `bypass_rls_policy` | **86** (a second, separate policy per table) | **86** | **7 of 86 tables measured directly; 7 / 7 RAISE** with bypass OFF (`AutomationRule`, `TicketMessage`, `Tenant`, `User`, `Tag`, `carrier_trucks`, `carrier_drivers`) |
| literal `OR` in one policy expression | **1** | 1 | **1 / 1** — `AutomationRule.tenant_isolation_policy` (SELECT), both the SYSTEM-row and the tenant-row probe |
| `CASE` | **0** | 0 | **0** |
| `COALESCE` | **0** | 0 | **0** |
| subquery (`EXISTS` / `IN (SELECT …)`) | **4** | 4 | **4 / 4** |
| bare equality | **91** | 87 | **6 of 87 tables measured directly; 6 / 6 RAISE** |
| **total naming `current_tenant_id`** | **96** | **90** | **11 distinct tables measured, 11 / 11 RAISE** |

Three things about this table need saying rather than leaving to be inferred.

**On the `CASE`/`COALESCE` zeroes.** Both keywords appear inside `current_tenant_id()`'s own body,
not in any policy expression. `pg_policies.qual` stores the CALL, so the function's internals do not
leak into the count. That is the right boundary: the question is which POLICY shapes exist, not what
the one function they all call looks like inside.

**On "11 of 90 measured".** 11 distinct tables were probed in the EMPTY lane and all 11 raised. The
other 79 are not asserted from those 11 by analogy — they are covered by the **mechanism**, which was
itself measured: cells `M1` and `M4` show a `Var = current_tenant_id()` qual raising at plan time on
relations with **RLS disabled and no policy at all**, so any relation whose policy contains that
shape must raise for the same reason. That is a generalisation from a measured mechanism, and it is
labelled as such rather than presented as 90 measurements.

**On leading with 86 rather than 1.** The brief expected a literal-OR population. It is ONE policy,
and it is the already-known, already-routed `AutomationRule` SELECT policy from quick-612/613. The
real answer to "every policy whose OR branch cannot save it" is the 86 tables carrying a second
permissive policy — and the sharpening this task adds is that the OR was never the thing that could
have saved them in the first place.

---

## 3. The per-policy measurement table

**Instrument.** STAGING, role `app_user`, `rolbypassrls=false`. Tripwire armed by the probe's own
session GUC and **read back as `"on"`**; `TENANT_CONTEXT_TRIPWIRE` in `apps/web/.env.staging` read as
`"on"` and left untouched. **One transaction per cell** — never one for the run, because a `TC001`
aborts the transaction and the next statement on it would return `25P02`, silently misreporting every
subsequent cell as a different failure (quick-611's class). REAL lane tenant
`b5623cdd-dc19-4900-b75d-0ecfcaf191b8` ("Staging Alpha Carriers"), discovered from the privileged
connection, never hardcoded.

**SQLSTATE was walked off the CAUSE CHAIN and recognised by CODE, never by message prose** (quick-610,
quick-602). On this raw `pg` client the code also sits at the top level; the record prints both so
they can be compared, and they agree (`TC001` / `TC001`).

**Every cell is a `count(*)` and the reported value is the SCALAR, never `rowCount`** — `rowCount` is
1 for every count query, so a refused read would render exactly like a good one.

Full verbatim capture: `evidence/03-matrix-verbatim.md`. **31 cells · 15 RAISES · 16 RETURNS.**

### 3.1 The literal-OR policy — `AutomationRule.tenant_isolation_policy` (SELECT)

```sql
USING ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
```

| cell | rows probed | lane | verdict |
|---|---|---|---|
| `OR-1a` | SYSTEM-scoped — the rows the tenant-independent branch would have to save | EMPTY | **RAISES `TC001`** |
| `OR-1a` | same | REAL | **RETURNS 6 ROWS** |
| `OR-1b` | tenant-scoped | EMPTY | **RAISES `TC001`** |
| `OR-1b` | same | REAL | **RETURNS 0 ROWS** |

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "AutomationRule" where scope = 'SYSTEM'
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma /
         getTenantPrismaForOrg / withTenantContext) before querying, or SET
         app.tenant_context_tripwire = 'off' on this connection.
```

The `scope = 'SYSTEM'` branch is true for all six rows and does not save the statement. This
corroborates quick-613 §5 from a second, independent run.

### 3.2 The four subquery policies — with their OUTER row counts beside every verdict

The outer count is not decoration. A correlated `EXISTS` qual is evaluated per outer row, so an empty
outer table produces "no raise" for a completely different reason than short-circuiting, and without
the count the two are indistinguishable. All counts read on the privileged connection.

| cell | table | inner relation | outer rows | inner rows | EMPTY | REAL |
|---|---|---|---|---|---|---|
| `SUB-cd` | `carrier_documents` | `"User"` | **2** | **10** | **RAISES `TC001`** | **RETURNS 1 ROWS** |
| `SUB-st` | `stops` | `dispatches` | **4** | **2** | **RAISES `TC001`** | **RETURNS 2 ROWS** |
| `SUB-rts` | `route_template_stops` | `route_templates` | **4** | **2** | **RAISES `TC001`** | **RETURNS 2 ROWS** |
| `SUB-tm` | `"TicketMessage"` | `"SupportTicket"` | **0** | **0** | **RAISES `TC001`** | **RETURNS 0 ROWS** |

`SUB-tm` is the important row and it is discussed in §4.

### 3.3 The bare-equality sample — all four column spellings

The tenant column is spelled four ways across the 91 bare-equality policies (`"tenantId"` ×56,
`org_id` ×20, `tenant_id` ×10, `id` ×2), which is why the sample had to cover all four rather than
pick six tables at random.

| cell | table | spelling | rows | EMPTY | REAL |
|---|---|---|---|---|---|
| `BE-tenant` | `Tenant` (`tenant_self_read`) | `id = current_tenant_id()` | 2 | **RAISES `TC001`** | **RETURNS 1 ROWS** |
| `BE-user` | `User` | `"tenantId"` | 10 | **RAISES `TC001`** | **RETURNS 6 ROWS** |
| `BE-trucks` | `carrier_trucks` | `org_id` | 3 | **RAISES `TC001`** | **RETURNS 2 ROWS** |
| `BE-drivers` | `carrier_drivers` | `org_id` | 5 | **RAISES `TC001`** | **RETURNS 3 ROWS** |
| `BE-audit` | `audit_log` | `tenant_id` | **0** | **RAISES `TC001`** | **RETURNS 0 ROWS** |
| `BE-tag` | `Tag` (rewritten by quick-602) | `"tenantId"` | **0** | **RAISES `TC001`** | **RETURNS 0 ROWS** |

`BE-audit` and `BE-tag` re-measure quick-610's rule from this task's own run: **an EMPTY table still
raises.** Every `tenant_id`-spelled table on staging is empty, so without that rule the spelling
would have been unmeasurable.

### 3.4 Finding C — the top-level permissive OR, and what actually rescues a bypass-flagged statement

| cell | table | lane | verdict |
|---|---|---|---|
| `BYP-on` | `carrier_trucks` | tenant GUC **EMPTY**, `app.bypass_rls = 'on'` | **RETURNS 3 ROWS** |
| `BYP-on-tag` | `Tag` | tenant GUC **EMPTY**, `app.bypass_rls = 'on'` | **RETURNS 0 ROWS** |
| `BE-trucks` | `carrier_trucks` | tenant GUC **EMPTY**, bypass **off** | **RAISES `TC001`** |
| `BE-tag` | `Tag` | tenant GUC **EMPTY**, bypass **off** | **RAISES `TC001`** |

The pair is the point. The same table, the same empty tenant GUC, the same two permissive policies —
and the only difference is one session GUC. **The OR does not decide this.** quick-602 measured that
with the bypass policy present and `app.bypass_rls = 'on'`, SELECT, UPDATE and DELETE all still
raised, in both policy-creation orders, six probes and six raises — because a permissive OR does not
stop PostgreSQL evaluating the other arm. What changed the answer was decision D2: the raiser
function's own `IF COALESCE(current_setting('app.bypass_rls', TRUE),'') = 'on' THEN RETURN NULL` arm.

So the correct sentence about the 86 tables is: *they carry the OR shape, the OR shape does nothing
for them, and they are rescued at a different layer by a branch inside a function.* Anyone reasoning
"it has a bypass policy, so it is fine" is right by accident.

### 3.5 The controls — what they rule out

Without these the matrix is satisfied by a connection that raises on everything, which would read as
a wall of confirmations (quick-546's "the failure mode of a bad slice is GREEN", inverted).

| cell | what | verdict |
|---|---|---|
| `CTL-1` | `select 1` on the armed `app_user` session | **RETURNS 1 ROWS** — the connection is not simply broken |
| `CTL-plan` | `"Plan"` — RLS OFF, `SELECT` granted, 3 rows — under the EMPTY tenant GUC | **RETURNS 3 ROWS** — a real table read succeeds on the same armed session in the same lane |
| `CTL-migrations` | `_prisma_migrations` | **RAISES `42501` — `permission denied for table _prisma_migrations`** |
| `OR-1a` REAL | `AutomationRule` SYSTEM rows | **RETURNS 6 ROWS** — a cell that returns rows, quoted, on a table that raises in the other lane |

`CTL-migrations` is a **substitution the plan did not anticipate, recorded rather than silently
made.** The plan asked for "a table with RLS enabled and NO `current_tenant_id()` policy" which "must
not raise and should return rows". The enumeration found **exactly one such table in the whole
database** — `_prisma_migrations`, RLS enabled, zero policies — and `app_user` holds no grant on it
(DEC-17). The control as specified cannot exist. It was measured anyway, and `"Plan"` (RLS off) was
substituted for the working control.

### 3.6 One methodological correction, reported not hidden

The plan's hard limit 3 asserted that a CommonJS file in the scratchpad would resolve `require('pg')`
and `require('dotenv')` out of the repo's `node_modules` when run with cwd `apps/web`, "VERIFIED this
session" via `node -e "require.resolve('pg')"`. **It does not.** `require` in a CommonJS *file*
resolves from that FILE's directory, never from `process.cwd()`; `node -e` resolves from cwd, so the
verification used a different instrument answering a different question. The first run threw
`MODULE_NOT_FOUND`. Fixed by `require(require.resolve(m, { paths: [<repo>] }))` — the script still
lives in the scratchpad and still installs nothing. Same family as quick-607's `_bootstrap-env`
miscount: the method was wrong, not the tree.

Also: **the Supabase MCP `execute_sql` tool the plan named is not available in this session**
(`No such tool available: mcp__claude_ai_Supabase__execute_sql`). The production enumeration was taken
with the same read-only `pg` instrument as staging — which is strictly better evidence, because both
databases are then measured by one instrument rather than two.

---

## 4. Finding F — does a subquery short-circuit past `current_tenant_id()`? **MEASURED. It does not.**

**Verdict first: the four subquery policies do NOT short-circuit. They raise. They join the blocker
list, and they never had an under-read failure mode to begin with.**

### 4.1 The decisive measurement

`SUB-tm` — `"TicketMessage"`, whose policy is
`"ticketId" IN (SELECT id FROM "SupportTicket" WHERE "tenantId" = current_tenant_id())` — **raised
`TC001` in the EMPTY lane with a 0-row OUTER table and a 0-row INNER table.** Both counts read on the
privileged connection and reported beside the verdict.

That is the strongest possible form of the answer, and it arrived as a contradiction that had to be
run down. In the REAL lane, `EXPLAIN (ANALYZE)` on the identical statement reports:

```
->  Seq Scan on public."TicketMessage" (actual rows=0 loops=1)
      Filter: ((ANY ("TicketMessage"."ticketId" = (hashed SubPlan 1).col1)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text))
      SubPlan 1
        ->  Seq Scan on public."SupportTicket" (never executed)
              Filter: (("SupportTicket"."tenantId" = COALESCE(...tenant_context_required(...)...)) AND ...)
```

**`(never executed)`.** A plan in which the function is never reached, and a statement that raises
anyway, cannot both be describing the same moment — so one of them is not about execution.

### 4.2 The mechanism, measured on relations with RLS switched OFF

| cell | what | verdict |
|---|---|---|
| `Q1-tm-plainexplain` | `EXPLAIN` (no `ANALYZE`) on `"TicketMessage"`, EMPTY lane — **plans, executes nothing** | **RAISES `TC001`** |
| `Q1-tm-plain-real` | the same statement, REAL lane — the control | **RETURNS a plan** |
| `M1-rlsoff-var-eq` | `EXPLAIN` (no `ANALYZE`) on `SELECT count(*) FROM "Plan" p WHERE p.id = current_tenant_id()` — **`"Plan"` has RLS OFF and no policy** | **RAISES `TC001`** |
| `M2-norelation-plan` | `EXPLAIN` (no `ANALYZE`) on `SELECT 1 WHERE current_tenant_id() IS NOT NULL` — no relation, no Var to estimate against | **RETURNS a plan — does NOT raise** |
| `M3-norelation-exec` | the same statement EXECUTED — the counter-assertion | **RAISES `TC001`** |
| `M4-empty-relation-plan` | `EXPLAIN` (no `ANALYZE`) on `"Promo"` (RLS off, **0 rows**) `WHERE p.id = current_tenant_id()` | **RAISES `TC001`** |
| `M5-prepared-generic` | `EXPLAIN (GENERIC_PLAN)` on a parameterised form | **RAISES `TC001`** |

`M1` versus `M2` is the discriminator, and it is why this is a measurement rather than an argument.
Same function, same session, same lane; the only difference is whether the call appears on one side
of an operator with a `Var`. `M2` proves the planner does **not** fold a `STABLE` function in
general (it is not `IMMUTABLE`, and `eval_const_expressions` leaves it alone), and `M3` proves `M2`'s
non-raise is real rather than a function that cannot raise. `M1` and `M4` then show that the moment
the call sits opposite a column, the planner evaluates it — this is `estimate_expression_value()`,
the selectivity path, which deliberately DOES pre-evaluate stable functions. Server: PostgreSQL 17.6.

**Consequence.** Emptiness of any relation is irrelevant. Correlated versus uncorrelated is
irrelevant. Hashed SubPlan versus nested loop is irrelevant. The raise precedes all of it.

### 4.3 The part that could not be constructed read-only — and why it does not weaken the verdict

The plan's variant (a) asked for a real outer row whose correlated inner set is empty. For the three
correlated policies that state does not exist on staging, and the reason is better than "not present":

| column | nullable? | FK |
|---|---|---|
| `carrier_documents.uploaded_by` | **NO** | `→ "User"(id) ON DELETE RESTRICT` |
| `stops.dispatch_id` | **NO** | `→ dispatches(id) ON DELETE RESTRICT` |
| `route_template_stops.route_template_id` | **NO** | `→ route_templates(id) ON DELETE CASCADE` |
| `"TicketMessage"."ticketId"` | **NO** | `→ "SupportTicket"(id) ON DELETE CASCADE` |

Measured on staging: **0 NULL keys and 0 orphan rows on all four.** So an outer row with an empty
correlated inner set is **structurally impossible**, not merely absent — it would require violating a
`NOT NULL` or a foreign key. No orphan row was created to make the probe possible (hard limit 4), and
none was needed.

Variant (b), the expression-isolation cells (`Q2-*`, `Q3-*`), was run anyway and every one raised,
including with a 0-row inner relation and with a 0-row outer relation. **Those cells measure the
PLANNER's behaviour for the shape, not the policy in situ**, and they are labelled that way in the
evidence. The in-situ answer does not rest on them: `SUB-tm` and `Q1-tm-plainexplain` are the real
policy on the real table.

**Finding F is MEASURED, not partially measured.**

### 4.4 Finding D — three of the four subquery tables have no escape hatch of any kind

| table | carries `bypass_rls_policy`? |
|---|---|
| `carrier_documents` | **NO** |
| `route_template_stops` | **NO** |
| `stops` | **NO** |
| `"TicketMessage"` | yes |

For the first three, neither the `@bypass_rls` escape nor the tripwire's own bypass exemption is
available. Any no-tenant path that ever needs them has exactly one option — an admin connection.

### 4.5 What this means, stated plainly

The under-read scenario the brief worried about — a subquery policy silently returning zero rows
instead of raising, invisible to the tripwire and strictly worse to diagnose — **does not exist for
these four policies.** That is the good news. The bad news is its mirror image, and it is in §6: the
under-read failure mode is exactly what option (b) would create for all 96 policies.

---

## 5. Steps 3 and 4 — the files

Full working, per-statement, with grep methods stated:
`evidence/05-source-search.md`. Summary here.

Because the raise is at plan time, **every one of the 90 tables carrying a `current_tenant_id()`
policy raises**. So the interesting axis is not which table but which STATEMENT, and the four states
a statement can be in:

| state | raises? |
|---|---|
| **ADMIN_CONN** — receiver or enclosing `$transaction` is a `getAdminDb` client | No — `app_admin` is `rolbypassrls`; no policy is consulted |
| **TENANT_GUC** — the enclosing block sets `app.current_tenant_id` first | No |
| **BYPASS** — the enclosing block sets `app.bypass_rls` | No — exempted by the raiser's own arm. **NOT SIGNALLED** |
| **UNFLAGGED** | **YES — `TC001`** |

**48 UNFLAGGED statements on raising tables, across 12 files.** 44 model statements and 4 raw-SQL
statements whose literals were read and confirmed to name a policy-bearing table.

### 5.1 CUTOVER BLOCKERS

| # | file : line | table(s) | surface that breaks |
|---|---|---|---|
| B-1 | `apps/web/src/app/(admin)/actions/notifications.ts` :250, :256, :346, :349, :352, :355, :360, :362, :369 | `NotificationSendLog` ×9 | SysAdmin → Notifications: the send log and every delivery statistic. Nine statements, zero routed. |
| B-2 | `apps/web/src/app/(admin)/actions/sysadmin-invoices.ts` :83 | `SysAdminInvoice` | SysAdmin → Invoicing. **The file's other 17 statements are already on `getAdminDb`** — one straggler on a mixed file. |
| B-3 | `apps/web/src/app/(admin)/actions/tenants.ts` :32, :123, :198, :239, :271, :272, :278, :283, :297, :355, :364, :376, :472, :480 | `Tenant` ×5, `User` ×4, `DriverInvitation` ×3, `Load`, `SupportTicket` | SysAdmin → Tenants: the list, the detail, the counts, the invitation admin. **14 unflagged beside 9 already admin-routed.** The most mixed file on the tree. |
| B-4 | `apps/web/src/app/(admin)/actions/users.ts` :41, :102, :115, :130, :144 | `User` ×5 | SysAdmin → Users. Nothing routed. |
| B-5 | `apps/web/src/app/(admin)/admin-support/page.tsx` :24 | `Tenant` | The SysAdmin support page's tenant filter. |
| B-6 | `apps/web/src/app/(admin)/tenants/[id]/activation-progress-section.tsx` :20 | `ActivationProgress` | Tenant detail → activation panel. |
| B-7 | `apps/web/src/app/(admin)/tenants/[id]/automation-runs-section.tsx` :10 | `AutomationRun` | Tenant detail → automation runs. quick-613 routed the `/automations` screen's run list; this second, byte-similar run list was never in that census. |
| B-8 | `apps/web/src/app/(admin)/tenants/[id]/page.tsx` :56 | `Subscription` | Tenant detail → billing summary. |
| B-9 | `apps/web/src/actions/support-tickets.ts` :271, :286, :290 | `SupportTicket`, `User`, `Tenant` (raw SQL) | SysAdmin → Support: the ticket LIST and its submitter/tenant joins. Five statements in this file are admin-routed and seven are bypass-flagged; these three are neither. |
| B-10 | `apps/web/src/app/api/cron/auto-close-tickets/route.ts` :25 | `SupportTicket`, `TicketMessage` (raw SQL) | The stale-ticket sweep. **quick-602 measured this route raising at runtime**, and the source says why: :25 is bare while :57's `getAdminDb` covers only the write half. |
| B-11 | `apps/web/src/app/api/cron/automations/route.ts` :53, :71, :89, :111, :170, **:187**, **:198** | `ActivationProgress`, `Subscription`, `AutomationRule`, `AutomationRun` | Every cron-driven activation nudge and the trial-ending mail. |
| B-12 | `apps/web/src/lib/automations/evaluator.ts` **:64**, :73, **:80**, **:131** | `AppEvent`, `AutomationRule`, `AutomationRun` | The whole behavioural-email evaluator. |

**A blocker of a different class, on a blocker file.** `apps/web/src/actions/support-tickets.ts:292`
reads `auth.users`. Measured: `auth.users` has RLS on with **0 policies**, `app_user` holds **no
grant** on it and **no `USAGE` on schema `auth`**. At cutover that statement fails **`42501`, not
`TC001`** — a grant problem the tripwire will never signal, on the same line block as B-9.

**An adjacent finding, not a blocker in this audit's sense.** `support-tickets.ts:563`
(`getUnreadAdminReplyCount`) is an OWNER path that has `session.tenantId` in hand, hardcodes it into
the SQL, and issues the query on the bare client with no `set_config`. Its fate under `app_user`
depends on whatever the pooled connection last carried — quick-602's "the bare Prisma client is NOT
context-free". Reported, not fixed.

### 5.2 LATENT — the policy raises, nothing reads the table without a tenant today

`app/(admin)/actions/plans.ts` (4), `app/(admin)/actions/promos.ts` (2), and the
`NotificationTemplate`/`NotificationEmailConfig` statements in `notifications.ts` (8) are all on
tables with **RLS OFF** — the Section 4.12 allowlist. Nothing to raise. What would make them live:
adding a tenant policy to those tables.

The three digest crons (`digest-compliance-30day`, `digest-daily-driver`, `digest-weekly-owner`) each
hold one `getAdminDb` acquisition and do their per-tenant work on `getTenantPrismaForOrg`; their bare
import feeds no model statement. `lib/context/tenant-context.ts` :179/:210/:231 are `set_config` only
and touch no relation.

### 5.3 ROUTED / NOT AFFECTED

`app/(admin)/actions/automations.ts` (7 calls, **zero** `prisma.` usages), `billing/[id]/page.tsx`
(1), `track/[token]/page.tsx` (1), `api/track/[token]/route.ts` (1 + bypass), `accept-invitation`
(2 + bypass), seven cron routes on admin + `getTenantPrismaForOrg`, `tenant.repository.ts` (2),
`send-sysadmin-invoice.ts` (1), `lib/context/tenant-context.ts` (0 calls, deliberate), all five
`lib/onboarding/*` (tenant GUC via `setTransactionTenantId`, quick-601), and
`api/auth/login/route.ts` (tenant GUC inline at :74 and :113, quick-423/424).

**`ADMIN_ALLOWLIST` — a correction.** The brief says "24 entries after 613". The file asserts
`toBe(23)` entries and `toBe(48)` calls, and parsing its literal independently gives **23 entries,
48 calls**. quick-613 §6 is explicit that the entry count **stays 23** because no new FILE joined —
only `automations.ts`'s `calls` went 3 → 7. **The correct figure is 23 / 48; the brief's 24 is
wrong.**

### 5.4 Step 4 — the INVERSE shape

A policy whose only branch is `current_tenant_id()`, on a table a no-tenant path MUST read. These
never surface from an OR-shaped search because there is no second branch to look for. **13 distinct
tables** across the blocker list; the ones that matter most:

- **`Tenant`** — `tenant_self_read` is `USING (id = current_tenant_id())`, with no second branch of
  any kind, and the sysadmin tenant list (B-3), the tenant detail page (B-3, B-6, B-7, B-8) and the
  support page's tenant filter (B-5) all read it with no tenant. Measured: EMPTY **RAISES**, REAL
  **RETURNS 1**. There is nothing in that policy that could ever have saved them.
- **`User`** — B-3 and B-4. Measured: EMPTY **RAISES**, REAL **RETURNS 6**.
- **`NotificationSendLog`** — RLS enabled **AND forced**, 2 policies. B-1's nine statements.
- `SysAdminInvoice`, `SupportTicket`, `TicketMessage`, `ActivationProgress`, `Subscription`,
  `AppEvent`, `AutomationRun`, `AutomationRule`, `Load`, `DriverInvitation`.

### 5.5 Reconciliation against `admin-connection.md` §9 — four corrections

1. **B7 — both `generateTicketNumber` copies are BYPASS-FLAGGED.**
   `actions/support-tickets.ts:99` and `api/mobile/support/ticket/route.ts:39` each issue
   `tx.$executeRaw` `SELECT set_config('app.bypass_rls','on',TRUE)` immediately before the
   `supportTicket.findFirst`. They are **exempted by the raiser's own bypass arm and will NOT raise.**
   §9's prediction — silent zero rows, `TKT-0001` forever, colliding immediately — **remains exactly
   right**, and it lands at the **bypass-policy drop** (cutover item 4), not at the `app_user`
   cutover. **B7 is a bypass-programme item, not a tripwire blocker. The tripwire cannot see it.**
2. **B8 — `lib/auth/supabase.ts:164`'s `getCurrentUser` sysadmin branch is BYPASS-FLAGGED too**, in
   the same `$transaction` array as the `user.findUnique` at :165. Same conclusion: exempt, not
   signalled, still broken at the bypass drop. (Recorded alongside: this audit's own first-pass grep
   reported the whole `lib/auth/**` category as ZERO files, because the import specifier is relative
   rather than `@/lib/db/prisma`. Corrected by widening the matcher — the quick-607 class again.)
3. **Five blocker statements are named by NO existing audit.** `api/cron/automations/route.ts` :187
   and :198 (`automationRun.findFirst` ×2, inside the shared `runCronRule` helper that all four
   `candidateQuery()` reads flow through — quick-613 named :170 in the same function and stopped),
   and `lib/automations/evaluator.ts` :64, :80 and :131 (quick-613 named only :73).
4. **§9's "zero rows silently" for the four `candidateQuery()` reads should now read "raises
   `TC001`"** — `ActivationProgress` and `Subscription` both carry `current_tenant_id()` policies, and
   the raise is at plan time. A strictly better failure than the one §9 predicted. Also: §9's "five
   DECORATIVE loop-body statements" counts `workflow-digest` as 4; that is 4 transaction BLOCKS
   containing **8** model statements. Both numbers are right about different things and are stated
   here so they are not read as a disagreement. The `api/track/[token]` GPS lookup and the
   `provision-tenant.ts` / `tenant.repository.ts` pair are confirmed exactly as §9 last left them —
   bypass-flagged and closed-by-quick-601 respectively, with the closure wider than §9 records
   (`setTransactionTenantId` covers all five `lib/onboarding/*` files).

**Eight sysadmin files carrying 37 unflagged statements are not in §9 at all**, because §9 was scoped
to what quick-600's routing left behind rather than to everything the cutover will break.

---

## 6. Is the tripwire the right instrument? **Yes. Keep it exactly as it is, and close the 48 statements by routing them — option (d).**

### The recommendation

**Route the no-tenant paths to `getAdminDb`. Change nothing about `current_tenant_id()` or
`tenant_context_required()`.**

### Why, and what it costs

**(a) Leave as-is — this is the right posture, and the plan-time finding strengthens it rather than
weakening it.** The stated objection to (a) is that the tripwire raises on correct sysadmin paths as
well as on unmigrated ones, and cannot tell the two apart. True, and it is the point: the tripwire's
job is to convert a silent wrong answer into a loud attributable one, and "a sysadmin path with no
tenant context" IS a path that would otherwise return a silently wrong answer. The signal is not a
false positive; it is the same defect wearing a legitimate hat.

The plan-time finding adds a property nobody had measured and which is worth more than it first
looks: **because the raise precedes row processing, the tripwire can never produce a partially
correct result.** A statement either refuses outright or is fully scoped. There is no intermediate
state in which some rows came back and some were filtered. That is the strongest guarantee any of the
four options can offer, and only (a) has it.

**Costs of (a), stated rather than buried.** Every no-tenant surface must be routed before the
cutover — that is §7's work, and §5 names all of it. And one new cost this task discovered: because
the raise is at PLAN time, **`EXPLAIN` raises too**, so any diagnostic or query-plan tooling pointed
at an unscoped connection will fail rather than return a plan. Worth knowing before someone debugs a
slow query at 2am and concludes the database is broken.

**(b) Make `current_tenant_id()` return NULL inside policies and raise only in application code —
REJECTED, and it must be argued rather than assumed, because it looks like an improvement.**

It is the exact inverse of the thing the tripwire exists for. Every tenant predicate becomes
`col = NULL` → NULL → row filtered, so **every raise becomes a silent zero-row under-read** —
quick-599's D3 rule, and `admin-connection.md` §9's B7 is the worked example already sitting in the
codebase: `generateTicketNumber` issuing `TKT-0001` forever because a cross-tenant read returned zero
rows with no error. Applying (b) would recreate that failure mode **48 times over**, on the paths
§5 names. Concretely, on `Tenant.tenant_self_read` it means a sysadmin tenant list that renders
"no tenants" and a login path that says "Account not found. Please contact support." — sentences that
are false and that nobody can debug from the screen.

There is a second, structural objection. It **cannot be done "inside policies only" without a second
function**, because the same `current_tenant_id()` is called from both policy expressions and
application SQL, and a policy node tree carries no marker saying which context it is in. So (b) is
really "ship two near-identical functions and hope every future policy picks the right one" — a rule
an edit can drop, which is the shape this repo has repeatedly decided against (the T3/T4 verdict
union, the `endStop` plan object, `planSignatureSubmission`'s two booleans).

And a third: **§4 measured that the under-read scenario does not currently exist.** All four subquery
policies raise. Option (b) would manufacture the failure mode that this task just proved is absent.

**(c) A `SECURITY DEFINER` no-tenant escape for genuinely tenant-independent branches — REJECTED on
the measurement.** The quick-601 precedent is real and good: narrow definer functions returning one
scalar replaced a bypass on the highest-traffic unauthenticated surface, and leak strictly less than
a `BYPASSRLS` client. But (c) presumes there are tenant-independent *branches* to escape through, and
**the literal-branch population is ONE policy** — `AutomationRule`'s SELECT `scope = 'SYSTEM'` arm,
already routed by quick-613. The other 95 have no branch. So (c) is not "one function per branch", it
is one function per *statement*: 48 definer functions, each a reviewable privilege grant, each a new
name in the schema, to replace a routing change whose mechanism already exists and is already gated
by a test. Cost far exceeds (d) for the same outcome.

**(d) Route no-tenant paths to `getAdminDb` — ADOPTED.** It already works, it is already the answer
for 23 files and 48 calls, it is already fenced by
`tests/security/admin-connection-allowlist.test.ts` (import-by-module-path so an alias cannot dodge
it, per-file call counts so a new call inside an allowlisted file is still a reviewable diff, and an
assertion that `adminPrisma` is never exported), and quick-613 proved the gate fires red on a scratch
import. It needs no new database object and no new mechanism.

**Its costs, named:**

- **Allowlist growth: 23 → roughly 33 entries, and 48 → roughly 96 calls.** Ten new files, most of
  them the sysadmin surfaces in §5.1. Each is a deliberate diff, which is the design.
- **`app_admin` GRANTs must be extended per routed site**, least-privilege, as quick-600 §2 requires
  — `app_admin` bypasses RLS so grants are the only remaining control. At minimum
  `NotificationSendLog`, `SysAdminInvoice`, `DriverInvitation`, `Load`, `ActivationProgress`,
  `Subscription`, `AppEvent`, `AutomationRun` need checking; quick-600 §5 is the precedent that the
  grant list is discovered by running the both-directions matrix, not by reading application code.
- **Four MIXED files need statement-level care, not a file-level swap**
  (`sysadmin-invoices.ts`, `tenants.ts`, `actions/support-tickets.ts`,
  `auto-close-tickets/route.ts`). These are exactly quick-602's warning: a route can carry
  `getAdminDb` for one statement and the tenant client for another, and `auto-close-tickets` is the
  recorded example of a file that looks routed and still raised.
- **Two statements are not (d)'s to fix.** `support-tickets.ts:292` (`auth.users`) needs a schema
  grant, not a connection. `support-tickets.ts:563` needs a tenant acquisition, not an admin one.
- **The standing gap (d) does NOT close, and cannot:** the ~86 bypass-flagged sites, including B7
  and B8, are invisible to the tripwire by construction (quick-602 decision D2, whose recorded cost
  this is). They remain owned by the Phase 0 bypass programme, and they will fail — silently, in the
  D3 sense — at the bypass-policy drop rather than at the `app_user` cutover. **Routing everything in
  §5.1 and declaring victory would leave the two items §9 names by name untouched.**

---

## 7. What remains before the `app_user` cutover

quick-613 §12's table, updated, with this task's rows appended.

| # | item | status after 614 |
|---|---|---|
| 1 | ~~`AutomationRule` DELETE + CAPTURE policy split — production awaiting deploy~~ | **~~awaiting deploy~~ → CLOSED EVERYWHERE.** Applied to production, `applied_steps_count=1, checksum='manual'`. §1. |
| 2 | The 17 `25P02` sites | **CLOSED** by quick-611 (0 live, 16 dormant, 1 impossible; gated by a test). Unchanged. |
| 3 | `app_admin` LOGIN on production | **OPEN, untouched.** Role created `NOLOGIN`; LOGIN + password minted for staging only. Production was never connected to for a write. **This is now a harder prerequisite than it was**, because §6 recommends routing ten more files onto that connection. |
| 4 | The bypass policy drop | **OPEN and not begun.** 86 `bypass_rls_policy` rows, identical on both databases. **614 adds: this is where B7 and B8 actually fail**, and the tripwire will not warn about either. |
| 5 | `toggleRuleActive` on the bare client | **CLOSED** by quick-613, and its grant is now live on production too. |
| 6 | `app_user` grants on `AutomationRule` | **ANALYSED, deliberately not applied** (quick-613 §8). Unchanged. |
| 7 | ~~Production deploy of both migrations~~ | **~~named prerequisite~~ → DONE.** All three migrations carry the executed signature on production. §1. |
| 8 | Sites 7 and 8 (`api/cron/automations/route.ts:170`, `lib/automations/evaluator.ts:73`) | **STILL OPEN, and BIGGER than recorded.** :170 is one of **seven** unflagged statements in that file and :73 is one of **four** in the evaluator. See B-11 / B-12. |
| 9 | A click-through for `/automations` | **OPEN** — blocked on staging Supabase auth credentials. Unchanged. |
| 10 | **NEW — 48 UNFLAGGED statements across 12 files** | **OPEN.** The cutover blocker list, §5.1. Recommended remedy: option (d), route to `getAdminDb`. Nothing was fixed by this task — it reports. |
| 11 | **NEW — `support-tickets.ts:292` reads `auth.users`** | **OPEN.** `app_user` has no grant and no `USAGE` on schema `auth`; fails `42501`, not `TC001`, and no tripwire will ever signal it. |
| 12 | **NEW — `support-tickets.ts:563`, a tenant path that never acquires a context** | **OPEN.** Its answer depends on what the pooled connection last carried. Not a no-tenant path; a latent wrong-answer site. |
| 13 | **NEW — `EXPLAIN` raises on an unscoped armed connection** | **RECORDED, no action.** A consequence of the plan-time mechanism, not a defect. Query-plan tooling pointed at an unscoped connection will fail rather than return a plan. |
| 14 | **NEW — three of the four subquery tables carry no `bypass_rls_policy`** | **RECORDED.** `carrier_documents`, `route_template_stops`, `stops` have no escape hatch of any kind; any future no-tenant path needing them has exactly one option. |
| 15 | **NEW — `ADMIN_ALLOWLIST` is 23 entries / 48 calls** | **CORRECTION**, not an action. Several briefs now say 24. |

---

## 8. What this task deliberately did NOT do

- **No write reached either database.** Read-only transactions throughout; the only mutation of any
  kind was a session GUC on the probe's own connection, which persists nothing.
- **The tripwire was not disarmed.** `TENANT_CONTEXT_TRIPWIRE` in `apps/web/.env.staging` reads `on`,
  the file is unmodified, and the probe read the armed session GUC back as `"on"` before every cell.
- **No code was changed.** Nothing under `apps/`, `scripts/`, `prisma/` or `packages/`. The probe
  scripts live in the scratchpad and are not in the repository.
- **No package was installed.** `pg` and `dotenv` were resolved out of the existing tree.
- **Nothing found here was fixed.** Twelve blocker files are named, not closed. A blocker found is a
  blocker named.
