# quick-613 — route the sysadmin `AutomationRule` paths to `app_admin`

**Date:** 2026-09-15
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`). ADMIN lane as `app_admin`, TENANT lane as
`app_user` with the tripwire armed, counter-reads and DDL as `postgres`.
**Production: never written.** Every instrument refuses the production ref POSITIVELY — the string
must NAME staging, and naming `oqdhberkghtnszrkdvfm` is a hard stop — before any statement is issued.
The grant migration is committed and awaits a human's `vercel --prod`.

This is cutover item 5 from `612-SUMMARY.md` §9.

**Four commits:**

| commit | what |
|---|---|
| `6351378a` | the routing + the three `AdminReason` members + the allowlist entry |
| `739a6c7f` | the grant migration, applied to staging, ledger row written by hand and read back |
| `e196e877` | `613-routing-verify.ts`, the two matrices, the witnessed-red allowlist proof |
| *(this one)* | the gates and this summary |

---

## 1. The complete site census, and two counts in the record that are wrong

Grep over `apps/web/src`, excluding `src/generated`. **Eight sites**, five routed.

| # | site | client BEFORE | what the statement does | needs admin? | verdict |
|---|---|---|---|---|---|
| 1 | `app/(admin)/actions/automations.ts` `getAutomationRules` | bare `prisma` | `findMany` + `_count.runs` — the run count spans **every tenant** | **yes** — the count is all-tenant by intent | **ROUTED** |
| 2 | same file, `getRuleWithRuns` | bare `prisma` | `findUnique` + `include runs` joined to `Tenant.name` — last 10 runs **across all tenants**, with their tenant names | **yes** — both the runs and the names belong to tenants the sysadmin is not | **ROUTED** |
| 3 | same file, `toggleRuleActive` | bare `prisma` | `update { isActive }` on a `scope='SYSTEM'` platform rule (`tenantId` NULL) | **yes** — no tenant owns a platform rule | **ROUTED** |
| 4 | same file, inside `manualTriggerRule` | bare `prisma` | **`tenant.findUnique`** — validates an ARBITRARY operator-supplied tenant id | **yes** — see §3, argued separately | **ROUTED** |
| 5 | same file, inside `manualTriggerRule` | bare `prisma` | `automationRule.findUnique` by id | **yes** — see §5, the honest finding | **ROUTED** |
| 6 | same file, `automationRun.create` / `updateMany` ×2 | already `getAdminDb` | the manual trigger's writes | yes | untouched (quick-600) |
| 7 | `app/api/cron/automations/route.ts:170` | bare `prisma` | `automationRule.findUnique` by key | not decided here | **NOT ROUTED** |
| 8 | `lib/automations/evaluator.ts:73` | bare `prisma` | `automationRule.findMany` by `triggerEvent` | not decided here | **NOT ROUTED** |

### Two count corrections — reported, not silently fixed

quick-610's precedent (it corrected `app-user-failure-remediation.md`'s "Four" to SIX and said so):

- **CLAUDE.md says *"all five `automationRule.*` calls are on the bare client"*. That is wrong.**
  There were **FOUR** `automationRule.*` calls on the bare client in that file (lines 21, 43, 71, 98),
  plus **ONE `prisma.tenant.findUnique`** (line 95). Five bare `prisma.*` calls total, of which four
  are `automationRule.*`. Re-verified after routing: `grep -rn "automationRule\." src` now returns
  four hits in that file, all on an admin client, plus sites 7 and 8 on the bare client.
- **The brief's "six call sites" is wrong for the same reason** — it counts the file's `prisma.`
  usages and the cron site together, or the `automationRun` calls and the `automationRule` calls
  together, depending on how you read it. The number that survives inspection is **five routed
  statements in one file**, and they were *all* of that file's `prisma.` usages, which is why
  `import { prisma } from '@/lib/db/prisma';` is now **removed** — an unused import.

### Why sites 7 and 8 stay put, with the item that owns each

- **Site 7 — `api/cron/automations/route.ts:170`.** A cron entry point, not a sysadmin surface. It
  sits in the same file as the **four `candidateQuery()` reads** (`activationProgress.findMany` ×3,
  `subscription.findMany` ×1) that `docs/audits/admin-connection.md` §9 names explicitly and assigns
  to **A1/A7**. Routing one statement in that file and leaving its four siblings is quick-561's
  *"fixing one bell and leaving the other"*. Untouched.
- **Site 8 — `lib/automations/evaluator.ts:73`.** One of **the five DECORATIVE loop-body statements**
  §9 names, owned by **A2**, whose rule is that the bypass line goes in the same commit that wraps the
  unit of work in `withTenantContext` — and `getTenantPrismaForOrg` is the correct destination there,
  not the admin connection, because the tenant is already known. Untouched.

Neither file was opened for editing.

---

## 2. For each routed site: why this is cross-tenant / SYSTEM scope, and NOT a missing grant

**A grant problem gets a grant, not a `BYPASSRLS` connection.** That distinction is the whole reason
this section exists, and it cuts both ways here.

| site | what refuses it on the tenant connection | is a grant the fix? |
|---|---|---|
| 1 | `tenant_isolation_policy` on **`AutomationRun`** — `USING ("tenantId" = current_tenant_id())`. `app_user` already holds all four DML grants on both tables. The count is wrong by *arithmetic*, not by permission: measured **2 runs on the admin lane, 1 under tenant A's GUC**. | **No.** A grant cannot make a policy count rows it filters. |
| 2 | the same `AutomationRun` policy, plus **`tenant_self_read`** on `Tenant` (`USING (id = current_tenant_id())`) for the `runs.tenant.name` join. Measured **2 runs / 2 tenant names** admin vs **1 / 1** tenant. | **No.** Two policies, both correct; a sysadmin is simply not in either's scope. |
| 3 | `automation_rule_update_policy` — `USING ("tenantId" = current_tenant_id())`. A SYSTEM rule has `tenantId` NULL, so it matches no tenant. Measured **0 rows, silent**, with a counter-read proving the rule is unchanged. | **No.** `app_user` already holds `UPDATE`. The refusal is the policy, and it is the intended behaviour — a tenant connection writing a platform rule is exactly what quick-612 closed. |
| 4 | `tenant_self_read` on `Tenant`. Measured **0** for tenant B, paired with **1** for tenant A on the same connection. | **No.** The operator names a tenant that is not theirs; a sysadmin has no tenant at all. |
| 5 | `tenant_isolation_policy` (SELECT) on `AutomationRule` for a TENANT-scoped rule: measured **0** for tenant B's rule, paired with **1** for tenant A's. | **No.** See §5 for the honest half of this finding. |

**And the one genuine grant problem got a grant.** `app_admin` held **NO GRANT AT ALL** on
`"AutomationRule"` — measured against `information_schema.role_table_grants` before the migration was
written, where the only grantee row was `app_user: DELETE, INSERT, SELECT, UPDATE`. That is precisely
the separate, non-policy problem, and the answer to it is
`GRANT SELECT, UPDATE ON TABLE public."AutomationRule" TO app_admin` — **least privilege per routed
site, never `GRANT ALL`** (`admin-connection.md` §2: on a `BYPASSRLS` connection, GRANTs are the only
control left). No routed path creates a rule and none removes one, so INSERT and DELETE are excluded
and the header says so.

---

## 3. Site 4 argued separately — why a `Tenant` read is routed by an `AutomationRule` task

`prisma.tenant.findUnique` is not an `AutomationRule` statement. It is routed for three reasons, and
the third is the one that matters operationally:

1. **Unit-of-work coherence.** It is the first statement of `manualTriggerRule`, whose three
   `automationRun` writes quick-600 already routed. Half a function on one connection and half on
   another is the shape that makes a later reader guess.
2. **It is structurally cross-tenant.** The `tenantId` is supplied by the operator and names a tenant
   that is not theirs — a sysadmin belongs to a tenant row only because `User.tenantId` is NOT NULL,
   and never to the one they are triggering a rule for.
3. **At cutover it would return `null` for every real tenant**, so `manualTriggerRule` would answer
   **"Tenant not found"** always — a sentence that is false and that no operator could debug from the
   screen. Measured: **admin lane 1 row · tenant lane 0 rows, with own-tenant = 1 beside it · empty
   GUC `TC001`.**

**No migration was needed for it.** `app_admin` already holds `Tenant SELECT, INSERT, UPDATE, DELETE`
(`admin-connection.md` §2), which is why site 4's ADMIN cell is the **only** `ADMIN` cell that
succeeded in `--before`.

**One `AdminReason`, not a fourth.** Sites 4 and 5 reuse `'sysadmin manual automation trigger'`: the
contract's rule is one member per routed **unit of work**, not per call site.

---

## 4. The both-directions matrix — five sites, three lanes, `--before` → `--after`

`apps/web/scripts/audit/613-routing-verify.ts`. Every probe inside `BEGIN … ROLLBACK`; fixtures
COMMITTED on the privileged connection and torn down in a `finally` with an asserted `left === 0`;
SYSTEM platform rules asserted **6 at entry and 6 at exit** in both runs.

**Deviation from the brief's wording, stated rather than smoothed:** the brief asked for fixtures
"inside its transaction". That is impossible here — the probe runs on a **different connection** from
the fixture creator, so an uncommitted fixture is invisible to it. 612's shape (commit the fixtures,
roll back the probes, assert the teardown) is the correct pattern and is what shipped. Staging holds
**zero `AutomationRun` rows** and two tenants, so without fixtures the admin lane's *must-SUCCEED*
half would have been vacuous — quick-610's rule that an assertion over an empty set proves nothing on
the direction that must succeed.

Fixtures, all keyed `quick613_%`: one TENANT-scoped rule for tenant A, one for tenant B, and one
`AutomationRun` for each tenant attached to the SYSTEM rule `activation_celebration`.

### BEFORE (`evidence/01-before.md`) — grants: `app_user` ×4, **`app_admin` none**

| site | ADMIN (`app_admin`, no GUC) | TENANT (GUC = tenant A) | TENANT (GUC EMPTY) | counter-read / paired own-read |
|---|---|---|---|---|
| 1 listing | `ERROR [42501] permission denied for table AutomationRule` | `rules_visible = 7 · runs_counted = 1` | `ERROR [TC001]` | — |
| 2 detail read | `ERROR [42501]` | `runs_visible = 1 · tenant_names_visible = 1` | `ERROR [TC001]` | — |
| 3 toggle (UPDATE) | **`ERROR [42501]`** | **`0 rows`, silent** | `ERROR [TC001]` | rule still carries its original `isActive` = **1** on all three |
| 4 tenant lookup | `n = 1` ✅ | `n = 0` | `ERROR [TC001]` | own tenant A = **1** · under the empty GUC the own-read ALSO raised `TC001` |
| 5a rule by id (SYSTEM) | `ERROR [42501]` | `n = 1` — **visible, see §5** | `ERROR [TC001]` | — |
| 5b rule by id (tenant B's) | `ERROR [42501]` | `n = 0` | `ERROR [TC001]` | own tenant A's rule = **1** |

### AFTER (`evidence/03-after.md`) — grants: `app_admin: SELECT, UPDATE` added, `app_user` unchanged

| site | ADMIN (`app_admin`, no GUC) | TENANT (GUC = tenant A) | TENANT (GUC EMPTY) |
|---|---|---|---|
| 1 listing | **`rules_visible = 8 · runs_counted = 2`** ✅ | `rules_visible = 7 · runs_counted = 1` (unchanged) | `TC001` (unchanged) |
| 2 detail read | **`runs_visible = 2 · tenant_names_visible = 2`** ✅ | `1 · 1` (unchanged) | `TC001` (unchanged) |
| 3 toggle | **`1 row affected`** ✅ | `0 rows`, silent (unchanged) | `TC001` (unchanged) |
| 4 tenant lookup | `n = 1` (unchanged) | `n = 0`, own = 1 (unchanged) | `TC001` (unchanged) |
| 5a rule by id (SYSTEM) | **`n = 1`** ✅ | `n = 1` (unchanged) | `TC001` (unchanged) |
| 5b rule by id (tenant B's) | **`n = 1`** ✅ | `n = 0`, own = 1 (unchanged) | `TC001` (unchanged) |

**The plan predicted one cell would change. FIVE did, and that is the stronger result.** The plan's
verification item 4 says *"Nothing else in the two matrices differs except that one cell"*, expecting
only the routed UPDATE to move. It is wrong because `app_admin` had **no SELECT grant either** — the
four `AutomationRule` READS were 42501 on the admin lane too. Machine-diffed: **exactly 5 of 18 cells
differ, and all five are the ADMIN lane's `AutomationRule` statements.** Site 4's ADMIN cell and every
one of the twelve tenant-lane cells are byte-identical between the runs, which is what says the
migration changed the grant and nothing else.

### The counter-reads and the pairings are not decoration

- **Every zero carries a counter-read** (quick-599 D3 — an RLS-refused UPDATE/DELETE is a **silent 0
  rows**, not a 42501, so "0 rows" alone cannot distinguish REFUSED from ALREADY GONE). Site 3's three
  lanes each took a privileged counter-read **on a separate connection while the probe's transaction
  was still open**, each returning **1** for "the SYSTEM rule still carries its original `isActive`".
- **Every cross-tenant `foreign === 0` is paired with an `own > 0`** on the SAME connection in the
  SAME transaction (quick-610's inverse) — sites 4 and 5b both report `n = 0` beside an own-read of
  **1**. Without the pairing, a connection that could read nothing at all would pass identically.
- **For a `count(*)` probe the SCALAR is reported, never `rowCount`** — `rowCount` is 1 for every count
  query, so a refused read would render exactly like a successful one (612's `Probe.value` note).

---

## 5. The measured empty-GUC answer, and the honest site-5 finding

### `TC001` — measured, not assumed

The open question was whether PostgreSQL short-circuits the SELECT policy's OR
(`(scope = 'SYSTEM') OR ("tenantId" = current_tenant_id())`) past `current_tenant_id()` for a SYSTEM
row, which would make sites 1/2/5 silently under-read rather than hard-fail under the empty GUC a
sysadmin request actually carries.

**It does not.** All six probes under the empty GUC raised:

```
ERROR [TC001] tenant context is required: app.current_tenant_id is the EMPTY STRING
```

Recognised by **SQLSTATE walked off the cause chain** (`sqlstateOf` walks `err.cause` and accepts the
first 5-character code — raw `pg` carries it at the top level, Prisma buries it on a
`DriverAdapterError` whose own `code` is `undefined`), **never by message prose** (quick-602). The
message's "EMPTY STRING" branch is itself quick-602's recorded finding that a pooled connection can
essentially never reach the UNSET branch.

So at cutover these five statements do **not** fail quietly on a tenant connection — they raise, and
the sysadmin automation surface 500s. That is a better failure than a silent one, and it is still a
broken screen; routing is what fixes it.

### Site 5 does NOT under-read for a SYSTEM rule today — say it plainly

Pre-registered by the planner and confirmed by measurement: under a **real** tenant GUC,
`select … from "AutomationRule" where id = <SYSTEM rule>` returns **`n = 1`** on the tenant connection.
That is correct and deliberate — **quick-612's SELECT half keeps the SYSTEM branch** so tenants can
*read* the platform rules; only INSERT/UPDATE/DELETE lost it.

So site 5's routing does not rest on "it was broken". It rests on two other things, both measured:

1. **The structural cross-tenant case.** `manualTriggerRule` takes a rule id from the operator with no
   scope constraint, and a **TENANT-scoped** rule belonging to another tenant is invisible: `n = 0`,
   paired with `own = 1`. A sysadmin triggering a tenant-authored rule would get "Rule not found".
2. **Unit-of-work coherence** with sites 4 and 6 in the same function.

And under the empty GUC — the state a sysadmin request is actually in — it raises `TC001` like
everything else. This is *not* "all five were broken in the same way", and the summary does not claim
it was.

---

## 6. The allowlist gate, witnessed RED then GREEN from this task's own run

Full verbatim capture in `evidence/04-allowlist-gate-fires.md`. Not cited from quick-600 — re-proved,
because a guard asserted without a witnessed red is the quick-549 shape.

RED, with `src/lib/__probe-613.ts` importing `getAdminDb`:

```
 × allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST 203ms

AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST: lib/__probe-613.ts: expected [ 'lib/__probe-613.ts' ] to deeply equal []

 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

GREEN, after `rm src/lib/__probe-613.ts`, with quick-613's own edits in place:

```
 ✓ tests/security/admin-connection-allowlist.test.ts (9 tests) 764ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

Revert asserted, not assumed (quick-519 found a previous run's `__probe.ts` still sitting in
`src/lib/document-import/`): `git status --porcelain` shows no stray file and
`grep -rn "__probe" apps/web/src` returns nothing.

**The allowlist edits themselves, and what was NOT weakened:** `automations.ts` `calls: 3 → 7`
(3 existing + listing + detail + toggle + **one shared acquisition serving both site 4 and site 5**),
`TOTAL_EXPECTED_CALLS` `44 → 48`, entry count **stays 23** (no new file joins the list), `minBytes`
untouched. Note which assertion the scratch file tripped — **equality**, not the call count. The two
catch different things, and quick-613 exercised the second for real: had the entry not been updated
deliberately, the per-file count assertion would have failed on `automations.ts`.

---

## 7. The migration and its DEC-17 ledger row

`apps/web/prisma/migrations/20260915150000_grant_automation_rule_to_app_admin/migration.sql` — sorts
after quick-612's `20260915140000`. Header, then the `pg_roles`-guarded grant, so it is a no-op
wherever `app_admin` does not exist.

**The comment strip was load-bearing, exactly as predicted.** The header quotes the
`role_table_grants` row reading `DELETE, INSERT, SELECT, UPDATE` and explains *why* INSERT and DELETE
are excluded, so the apply guard strips `--` comments before every check. Without that, the guard
would have refused this migration on the prose describing the invariant it protects — quick-612 hit
this on `AS RESTRICTIVE` and quick-600 on `pool.on('connect'`; this is the third time. The guard
refuses policy DDL, `GRANT ALL`, `ALL TABLES IN SCHEMA`, `ALTER DEFAULT PRIVILEGES`, anything naming
`bypass_rls_policy`, and INSERT/DELETE inside a `GRANT … ON … "AutomationRule"`.

Grants, measured either side of the apply:

```
BEFORE : app_user: DELETE · app_user: INSERT · app_user: SELECT · app_user: UPDATE
AFTER  : app_admin: SELECT · app_admin: UPDATE · app_user: DELETE · app_user: INSERT · app_user: SELECT · app_user: UPDATE
```

`app_admin` holds exactly `SELECT, UPDATE` and nothing else; `app_user`'s four are untouched.

### The ledger row (`evidence/02-ledger-readback.md`)

Written **by hand** — neither MCP tool writes Prisma's `_prisma_migrations` ledger (DEC-17;
`apply_migration` records into **Supabase's own** ledger, a different table) — and read back **behind a
sentinel**, because that table has RLS enabled with zero policies and no `app_user` grant, so an empty
read from a non-owner role is indistinguishable from absence and would invite a duplicate write.

```
SENTINEL 20260915140000_automation_rule_per_command_policy_split
  visible: YES

newest 3 ledger rows BEFORE the write:
  20260915140000_automation_rule_per_command_policy_split
  20260915130000_grant_playbook_notification_to_app_admin
  20260915120000_document_column_drift_staging_parity

ledger row INSERTed BY HAND — no MCP tool and no DDL writes this (DEC-17)

READ BACK — newest 3 ledger rows:
  20260915150000_grant_automation_rule_to_app_admin | steps=0 | logs="" | started=finished:true | checksum=27619f74901178a04d6eaa3d10dc449e5882ec37b33369c8f5da630e9111d949
  …

HEAD IS OURS: true
checksum is a real SHA-256, not 'manual': true
applied_steps_count is 0 (mirrored, not executed by migrate.mjs): true
logs = '' : true
started_at = finished_at : true
staging _prisma_migrations rows AFTER: 160
```

**Production deploy is unaffected by this row.** `migrate.mjs` skips by `migration_name`, so staging
will skip (correct — the SQL is applied there) and production, where the row is absent, will apply the
file and write its own row with `checksum='manual'`, `applied_steps_count=1`. The `0` vs `1` is
exactly the documented signature distinguishing a mirrored row from an executed one.

---

## 8. The `app_user` grants verdict — ANALYSED AND RECOMMENDED, deliberately NOT applied

`app_user` still holds `DELETE, INSERT, SELECT, UPDATE` on `"AutomationRule"`. This was 612 §9 item 6.

**Recommendation: narrow to `SELECT`.**

```sql
REVOKE INSERT, UPDATE, DELETE ON TABLE public."AutomationRule" FROM app_user;
```

The case for it: after this task there is **exactly ONE `AutomationRule` write in the whole
repository** — `toggleRuleActive`, now on `app_admin` — and **zero TENANT-scoped rows exist on either
database** (6 SYSTEM rules, `tenantId` NULL, on staging and production alike). A grant should describe
what the application does, not what a data model might one day permit. With it revoked, quick-612's
SYSTEM capture and SYSTEM delete are refused by **two independent controls** instead of by the policy
alone — which is the defence in depth quick-599 added to `audit_log`.

**Three reasons it is deferred, and they are principled rather than timid:**

1. **It would have contaminated this task's own measurement.** The whole deliverable here is a
   both-directions matrix whose TENANT half must be refused **by the policy**. Revoking the grant
   mid-task makes every tenant-lane refusal ambiguous between grant and policy — a second change
   smuggled in beside the one being measured (quick-602's rule, and the reason quick-612 left
   `WITH CHECK` undeclared).
2. **It breaks a committed instrument and must move with it.** `612-policy-verify.ts`'s probes
   **I1**, **U1** and **D1** are *must-SUCCEED* own-tenant INSERT/UPDATE/DELETE. A REVOKE turns all
   three into `42501`, so the revoke and that script's expectations belong in one commit.
3. **It is reversible and deserves its own review.** One statement, stated above in full.

**The honest counter-argument, which must not be hidden.** Unlike `audit_log` — append-only *by
nature*, a structural property — `AutomationRule`'s tenant-write path is **unbuilt, not forbidden**.
The `AutomationScope.TENANT` enum member, the `tenantId` FK and quick-612's own
`automation_rule_insert_policy` / `update_policy` / `delete_policy` **all anticipate it**, and this
task's fixtures exercised it successfully (an own-tenant TENANT-scoped rule is readable and, per 612's
I1/U1/D1, writable). Revoking means that the day tenant-authored rules are built, they fail `42501` at
a layer nobody thinks to look at while the policy says yes — and a grant is not where anyone looks for
"why can't a tenant create a rule". That is the real cost of the recommendation.

---

## 9. The click-through harness — what was tried, and why no number exists

The summary brief asks for the click-through numbers and notes "the plan names the command". **The
plan's Task 4 does not name one** — its gates are tsc, `npm run build`, `audit:rls-policy-drift` and
vitest. So this is reported rather than invented.

The applicable instrument would be `scripts/audit/604-click-through.ts --surfaces2`, whose
`PASS2_SURFACES` contains exactly the surface this task routed:

```ts
{ path: '/automations', role: 'SYSADMIN', group: 'Automations' },
```

**It cannot be driven on this machine today.** What was checked, in order:

1. Pass 2 **reads what pass 1 wrote**, so both must run with the SAME `--out` (quick-610 — without
   the flag they overwrite quick-604's closed evidence, which carries byte offsets into its own server
   log). Solvable: the flag exists.
2. It needs a **running Next server pointed at staging as `app_user` with the tripwire armed**, and it
   obtains a real session over real HTTP via `POST /api/auth/login` → `signInWithPassword`. The session
   is deliberately **obtained, never forged**.
3. That login therefore resolves against whatever `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   the server is started with. **There is no staging Supabase auth configuration on this machine.**
   `apps/web/` holds exactly three env files (`.env.example`, `.env.local`, `.env.staging`);
   `.env.staging` carries **six keys, all of them database connection strings plus the seed password
   and the tripwire flag**, and `.env.local`'s Supabase URL/key name the **production** project
   (`oqdhberkghtnszrkdvfm` appears six times in it). `docs/audits/staging-environment.md` §"Why the
   existing helper was not reused" records the same fact from the other direction: on this machine
   those two variables "resolve to **production**".
4. The seeded staging logins exist in **staging's** `auth.users` (written directly as `postgres` by
   `scripts/seed-staging-auth.ts`, because staging's mailer cannot autoconfirm), so they are
   unreachable from a server configured for production auth — and starting one against production auth
   to make the harness run would have issued **writes to production** (`auth.sessions`,
   `auth.refresh_tokens`), which absolute limit 1 forbids outright.

**So: no click-through number, and no server was started.** Closing this needs the staging
`NEXT_PUBLIC_SUPABASE_URL` and anon key added to `.env.staging`, which is a credentials step for a
human, not something to work around. The end-to-end evidence that *does* exist for these five
statements is §4's matrix, driven against the real database as the real roles.

---

## 10. Gates

| gate | result |
|---|---|
| `npx tsc --noEmit` | **exit 0**, clean |
| **tsc blindness probe** | `const __probe613: number = 'y';` injected into `src/app/(admin)/actions/automations.ts` — **the file actually edited** — and tsc reported **that** error: `src/app/(admin)/actions/automations.ts(182,7): error TS2322: Type 'string' is not assignable to type 'number'.` Probe deleted, re-run clean, `grep -rn "__probe" src` empty. The gate is green, not blind. |
| `npm run build` | **exit 0** → `evidence/06-build.log` |
| `npm run audit:rls-policy-drift` | **exit 0** → `evidence/05-policy-drift-staging.txt` |
| which database drift measured | `[db-target] project : wyixpgunnjmzguhggocz (staging)` · `role : postgres` · `resolved : explicit DIRECT_URL (port fix within the explicitly-pinned project)` — both `DATABASE_URL` and `DIRECT_URL` pinned at the staging string (quick-607) |
| drift numbers | **186 live · 0 missing · 0 unexpected · 0 definition drift · 186 compared · none un-canonicalised** — unchanged from 612's post-state |
| `rls-policy-canonical.json` | **NOT regenerated** — `git status` clean for that file. Nothing about any policy changed; regenerating would be a change smuggled in beside the one being measured. |
| `bypass_rls_policy` | **86 before, 86 after**, compared as a **sorted TABLE LIST** (machine-diffed identical, 86 entries), not merely a count. `pg_policy` total **186 → 186**. The three relevant tables' policy definitions are byte-identical between the two runs. |
| vitest, SAME reporter both directions (`--reporter=json`) | **before 2129 tests · 2010 passed · 64 failed · 52 pending**; **after 2129 · 2010 · 64 · 52** |
| failing-FILE set | **25 files, byte-identical** — machine-diffed, `only before: []`, `only after: []` |
| `admin-connection-allowlist.test.ts` | **PASSES** in the after run (9/9) |

**Notes on the gates, so the numbers are readable rather than merely stated:**

- **The baseline was measured on THIS tree**, at `11146846`, with the working tree clean apart from the
  untracked plan directory — so no `git stash` and no `git worktree` was needed (quick-567: a worktree
  does not carry the gitignored `apps/web/.env.local`, and the skew reads exactly like a regression).
  It independently reproduced 612's published 2129/2010/64/25.
- **No `next dev` was running** at any point, so the Turbopack-cache trap was not in play.
- **`--reporter=basic` was never used** — it does not exist in vitest 4 and exits 0 having run zero
  tests. Counts here come from the JSON report's own `numTotalTests` / `numPassedTests` fields.
- The drift detector read **160 migration files** (159 in 612) while **statements parsed stayed 439**
  and **policies expected stayed 186** — which is the gate itself confirming the new migration
  contributes no policy statement.
- `tests/security/rls-policy-replay.test.ts` is in the failing set **both before and after**. It is
  pre-existing and untouched by this task.

### An unrelated finding the build surfaced — reported, reverted, NOT fixed here

`npm run build` runs `build:search-index` and `build:admin-search` before `next build`, and both
rewrote their **committed** artefacts:

```
 apps/web/.docs-data/admin-docs-search-index.json | 98 +++++++++++++++++++++---
 apps/web/src/lib/docs/search-index.json          | 74 +++++++++++++++++-
```

The diff is not noise and not a timestamp. It adds **eight feature-registry entries** that were never
regenerated into the indexes (`document-import`, `facility-matching` and their siblings — the Document
Import phases' registry work) and corrects one route in place,
`/carrier/route-templates` → `/carrier/templates`. So **the committed search indexes are stale against
the feature registry**, and the stale route is the legacy-vs-carrier route confusion that
`project_two_route_systems.md` exists to warn about.

Both files were **reverted** (`git checkout --`) rather than committed: they have nothing to do with
routing `AutomationRule`, and folding them in would be a second change smuggled in beside the one being
measured. The working tree is clean. This belongs with Phase 12's `check-doc-drift.ts` gate — anyone
who runs `npm run build` will keep seeing it until the artefacts are regenerated deliberately in their
own commit.

---

## 11. Deviations from the plan

| # | deviation | why |
|---|---|---|
| 1 | The new local in `manualTriggerRule` is named **`adminDbRead`**, not `adminDb` | The plan allowed the rename "if tsc complains". tsc does **not** complain — shadowing a block-scoped `const adminDb` inside the `try` is legal — which is precisely the problem: a reader would take the inner one for the outer. Distinct names, no shadow. The three existing locals are untouched. |
| 2 | Fixtures are **committed**, not created inside the probe transaction | Impossible as briefed: the probe runs on a different connection and cannot see an uncommitted row. 612's pattern (commit, roll back the probes, assert the teardown) is what shipped, and the reasoning is in the script header. |
| 3 | **Five** matrix cells changed between `--before` and `--after`, not the one the plan predicted | `app_admin` had no SELECT grant either, so all four `AutomationRule` reads were 42501 on the admin lane too. Reported in §4 rather than folded away; it makes the grant's necessity a stronger result, not a weaker one. |
| 4 | `--after` was run **twice** | The first run's stdout carried the matrix, the second was needed to capture the stderr banner separately. Both runs tore down cleanly (`runs deleted 2, left 0 · rules deleted 2, left 0`) and both reported SYSTEM rows 6 at entry and exit. The committed `03-after.{json,md}` is the second run's. |
| 5 | No click-through number | §9 — the harness needs a staging Supabase auth configuration that does not exist on this machine, and manufacturing one would have meant logging in against **production** auth. |

---

## 12. What remains before the `app_user` cutover

612 §9's table, updated:

| # | item | status after 613 |
|---|---|---|
| 1 | `AutomationRule` DELETE + CAPTURE policy split | **CLOSED on staging** (quick-612); production awaiting deploy |
| 2 | The 17 `25P02` sites | **CLOSED** by quick-611 (0 live, 16 dormant, 1 impossible; gated by a test) |
| 3 | `app_admin` LOGIN on production | **OPEN, untouched.** Role created `NOLOGIN`; LOGIN + password granted out of band, minted for staging only. Not re-verified live — production was never connected to for writes. |
| 4 | The bypass policy drop | **OPEN and not begun.** 86 `bypass_rls_policy` rows before and after, identical sorted table list. |
| 5 | `toggleRuleActive` on the bare client | **CLOSED by this task** — routed, and the grant that makes it work is applied to staging |
| 6 | `app_user` grants on `AutomationRule` | **ANALYSED** — §8. Recommendation stated with its exact SQL, three reasons for deferral, and its honest counter-argument. **Deliberately not applied.** |
| 7 | **NEW — production deploy of BOTH migrations** (612's policy split `20260915140000`, 613's grant `20260915150000`) | Named prerequisite. Both are committed and awaiting a human's `vercel --prod`. **Until then production carries neither**, so on production `toggleRuleActive` on the routed path would raise `42501` on `app_admin` for want of the grant — the failure this task measured on staging in `--before`. |
| 8 | **NEW — sites 7 and 8** (`api/cron/automations/route.ts:170`, `lib/automations/evaluator.ts:73`) | Enumerated with a NOT-ROUTED verdict and their owning items (`admin-connection.md` §9 A1/A7 and A2). Untouched by design. |
| 9 | **NEW — a click-through for `/automations`** | Blocked on staging Supabase auth credentials (§9). The surface is already in `PASS2_SURFACES`; only the environment is missing. |

---

## 13. Artefacts

| file | what |
|---|---|
| `apps/web/src/app/(admin)/actions/automations.ts` | five statements routed; zero `prisma.` usages; seven `getAdminDb(` calls |
| `apps/web/src/lib/db/admin-reasons.ts` | three new members, no fourth |
| `apps/web/tests/security/admin-connection-allowlist.test.ts` | `calls: 7`, `TOTAL_EXPECTED_CALLS` 48, entry count 23, `minBytes` untouched |
| `apps/web/prisma/migrations/20260915150000_grant_automation_rule_to_app_admin/migration.sql` | the grant — `SELECT, UPDATE`, `pg_roles`-guarded, no policy DDL |
| `apps/web/scripts/audit/613-routing-verify.ts` | `--before` / `--apply` / `--after`, counter-reads, pairings, fixtures, apply guards, ledger write-and-read-back |
| `evidence/00-suite-before.json` · `07-suite-after.json` | the two suite runs, same reporter |
| `evidence/01-before.{json,md}` · `03-after.{json,md}` | the two matrices |
| `evidence/02-ledger-readback.md` | DEC-17, sentinel first |
| `evidence/04-allowlist-gate-fires.md` | RED then GREEN, verbatim, from this run |
| `evidence/05-policy-drift-staging.txt` | drift clean, with the `[db-target]` banner naming staging |
| `evidence/06-build.log` | `npm run build`, exit 0 |

## Self-Check: PASSED

Files asserted present on disk: `automations.ts`, `admin-reasons.ts`,
`admin-connection-allowlist.test.ts`, `20260915150000_grant_automation_rule_to_app_admin/migration.sql`,
`613-routing-verify.ts`, and evidence `00`, `01`, `02`, `03`, `04`, `05`, `06`, `07`.
Commits asserted present in `git log`: `6351378a`, `739a6c7f`, `e196e877`.
No production write was issued at any point; `bypass_rls_policy` is 86 with an identical sorted table
list; no guard was weakened.
