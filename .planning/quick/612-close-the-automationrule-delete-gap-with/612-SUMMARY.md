# quick-612 — `AutomationRule` per-command policy split

**Date:** 2026-09-15
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`), probes as `app_user`, tripwire armed.
**Production: never written.** It was READ once, at open, inside
`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY` + `BEGIN READ ONLY … ROLLBACK`, so a write
would have been refused by the server rather than by intent.

**No application code was changed.** The deliverable is
`apps/web/prisma/migrations/20260915140000_automation_rule_per_command_policy_split/migration.sql`,
applied to staging and awaiting a human's production deploy.

---

## 1. The live policy at open — both databases, and they matched

```
STAGING (wyixpgunnjmzguhggocz)    pg_policy total = 183   bypass_rls_policy = 86
PRODUCTION (oqdhberkghtnszrkdvfm) pg_policy total = 183   bypass_rls_policy = 86
```

Identical on both, `relrowsecurity=true`, `relforcerowsecurity=true`, 6 rows all `scope='SYSTEM'`
with **`tenantId = NULL`**:

```
[ALL] bypass_rls_policy  (PERMISSIVE)
    USING      : (current_setting('app.bypass_rls'::text, true) = 'on'::text)
    WITH CHECK : (none)
[ALL] tenant_isolation_policy  (PERMISSIVE)
    USING      : ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
    WITH CHECK : ("tenantId" = current_tenant_id())
```

### A SECOND hole, found here and in no prior audit

The brief described one gap (DELETE). There were **two**:

```
UPDATE system (touch name only)                -> ERROR [42501]   <- what quick-599 tested
UPDATE system SET tenantId = MINE  <-- CAPTURE -> 6 row(s)        <- never tested
DELETE system                                  -> 6 row(s)        <- the known gap
```

**A tenant-scoped connection could TAKE OWNERSHIP of all six platform rules.** `USING` admits the row
through its `SYSTEM` branch, and `WITH CHECK` inspects only the **NEW** row — which now carries the
caller's own `tenantId` and passes. quick-599 tested an UPDATE touching a *non-*`tenantId` column,
which returns 42501 precisely because `tenantId` stays NULL, and so never saw this.

The capture is arguably worse than the delete: the rules keep running, now owned by one tenant, and
nothing looks broken.

---

## 2. The design

Four per-command policies replace the one `FOR ALL`:

| policy | command | `USING` | `WITH CHECK` |
|---|---|---|---|
| `tenant_isolation_policy` *(name retained)* | SELECT | `((scope = 'SYSTEM') OR ("tenantId" = current_tenant_id()))` | — |
| `automation_rule_insert_policy` | INSERT | — | `("tenantId" = current_tenant_id())` |
| `automation_rule_update_policy` | UPDATE | `("tenantId" = current_tenant_id())` | `("tenantId" = current_tenant_id())` |
| `automation_rule_delete_policy` | DELETE | `("tenantId" = current_tenant_id())` | — |

**Only SELECT keeps the SYSTEM branch.** That branch exists so tenants can *read* the platform rules;
it was never meant to authorise writing or deleting them. Putting it on one command instead of all
four is the entire fix.

**`USING` is the only lever on the OLD row**, which is why closing the capture *requires* dropping
SYSTEM from UPDATE's `USING`. No `WITH CHECK` formulation can do it — `WITH CHECK` cannot see the row
being replaced.

**The name `tenant_isolation_policy` stays on the SELECT half** (quick-599 §6). `coverage.test.ts`
enumerates tenant-scoped tables by querying `pg_policy` for that literal name, and the drift detector
keys on `(table, policy_name)`. Renaming all four would not have made the table "NOT COVERED" — it
would have **vanished** from the enumeration, and a test filtering by target key then passes
*vacuously* over an empty set.

**No `AS RESTRICTIVE`.** A restrictive policy ANDs with every permissive policy including
`bypass_rls_policy`, silently neutering the bypass on this table (quick-597 §8). All four are
PERMISSIVE.

### What the split FORBIDS that the current policy allows

1. **DELETE of a SYSTEM rule by a tenant connection** — 6 rows → 0.
2. **CAPTURE of SYSTEM rules via `UPDATE … SET "tenantId" = own`** — 6 rows → 0.

### What the split PERMITS that the current policy does not

**Nothing.** Stated plainly rather than invented: every clause is the same or narrower. The one
plausible widening route was checked rather than argued — whether the wider SELECT half could leak
back into the narrowed commands, since SELECT policies also apply to `UPDATE`/`DELETE … RETURNING`
(which is the shape Prisma emits). Measured:

```
UPDATE SYSTEM ... RETURNING *  (Prisma update shape)     -> 0 row(s)
DELETE SYSTEM ... RETURNING *  (Prisma delete shape)     -> 0 row(s)
UPDATE ... FROM a SELECT of SYSTEM rows                  -> 0 row(s)
```

The command policies **AND** with SELECT; they do not OR. `(SYSTEM OR own) AND (own)` = `own`.

### The stated cost

`UPDATE … SET <non-tenantId column> WHERE scope='SYSTEM'` changes from a **loud 42501** to a
**silent 0 rows**, because the row is now filtered by `USING` before `WITH CHECK` is reached. That is
a real loss of observability, accepted deliberately: a silent refusal beats an open capture, and it
is unavoidable — see "USING is the only lever" above.

---

## 3. The admin path — the brief's premise was wrong, and it matters

The brief stated: *"All six call sites are on the bare client behind `requireAdminAccess()`, and
`app_admin` bypasses RLS entirely, so no policy is consulted there."*

**The first half is right and the second does not follow.** Read from the code
(`app/(admin)/actions/automations.ts`): the call sites use the **bare `prisma` client**, which is the
*tenant* connection — `app_user` after cutover, which has `rolbypassrls = false`. `getAdminDb` (the
`app_admin` connection, which does bypass) is imported in that file but used only for the
manual-trigger side effects (`automationRun.create`), never for `AutomationRule`.

| call site | client | operation | under `app_user` |
|---|---|---|---|
| `automations.ts:21` `getAutomationRules` | bare `prisma` | `findMany` | works — SELECT keeps the SYSTEM branch |
| `automations.ts:43` `getAutomationRule` | bare `prisma` | `findUnique` | works |
| `automations.ts:71` `toggleRuleActive` | bare `prisma` | **`update`** | **BROKEN** |
| `automations.ts:98` (manual trigger) | bare `prisma` | `findUnique` | works |
| `api/cron/automations/route.ts:170` | bare `prisma` | `findUnique` | works |
| `automations.ts:108/140/148` | `getAdminDb` | `automationRun.*` | bypasses RLS — unaffected |

**`toggleRuleActive` is ALREADY broken under `app_user`, before this migration** — measured:

```
toggleRuleActive, sysadmin (no tenant, GUC = "")   -> ERROR [42501] new row violates RLS policy
toggleRuleActive, with a real tenant GUC           -> ERROR [42501] new row violates RLS policy
```

This migration does not break it. It changes the failure from `42501` to a silent 0 rows, which is
*quieter* and therefore worse to diagnose. **Routing that one call to `getAdminDb` is a cutover
prerequisite** — reported, not done, because the brief forbids application changes.

**What breaks if a SYSTEM rule ever needs writing through a tenant client:** it is refused, and there
is no in-policy escape hatch. The only two routes are `getAdminDb` (the `app_admin` connection, which
bypasses RLS) or a `bypass_rls` GUC statement. That is by design — a tenant connection writing a
platform rule is the thing being prevented.

---

## 4. The migration

`apps/web/prisma/migrations/20260915140000_automation_rule_per_command_policy_split/migration.sql`

Policy DDL at **column zero**, **no `DO` block** (`rls-policy-replay.test.ts`'s parser is
line-anchored and cannot see inside one), names stable, `bypass_rls_policy` untouched.

The apply path carries its own refusals — and **one of them fired on this task's own migration**: the
first `--apply` refused with `migration contains AS RESTRICTIVE`, matching the header comment that
says *"No AS RESTRICTIVE anywhere"*. Exactly the quick-600 trap — a bare substring check
false-positives on the prose describing the invariant it protects. The guard now strips `--` comments
before every check, and additionally refuses indented policy DDL.

### The ledger row (DEC-17)

Written **by hand** to staging and **read back**, because neither MCP tool writes Prisma's ledger and
"the DDL is live" is evidence of the half that was never in doubt:

```
sentinel (newest 3 rows visible to this role):
   20260915130000_grant_playbook_notification_to_app_admin
   20260915120000_document_column_drift_staging_parity
   20260914180000_tenant_context_tripwire

READ BACK:
  {"migration_name":"20260915140000_automation_rule_per_command_policy_split",
   "applied_steps_count":0,"checksum":"546a2913…","logs":"","started_eq_finished":true}
  checksum is a real SHA-256 (not 'manual'): true
  applied_steps_count is 0 (mirrored, not executed): true
  HEAD IS OURS: true
  staging ledger rows: 159
```

The **sentinel check is not decoration**: `_prisma_migrations` has RLS enabled with zero policies and
no `app_user` grant, so an empty read from a non-owner role is indistinguishable from absence and
would invite a duplicate write. Three real rows were visible first.

**Production deploy is unaffected by this row.** `migrate.mjs:137` skips by `migration_name` where
`finished_at IS NOT NULL`, so on staging it will skip (correct — the SQL is applied there), and on
production, where the row is absent, it will apply the file and write its own row (`checksum='manual'`,
`applied_steps_count=1`). Both correct, and the `0` vs `1` is exactly the documented signature
distinguishing a hand-mirrored row from an executed one.

---

## 5. The proof on staging — all four commands, both directions

Probes as `app_user` under tenant A's GUC. **Every probe runs inside `BEGIN … ROLLBACK`**, which is
what makes it safe to aim a `DELETE … WHERE scope='SYSTEM'` at real platform rules at all. Each
destructive probe carries a **privileged counter-read on a separate connection**, because an
RLS-refused UPDATE/DELETE is a *silent zero* (quick-599 D3) and "refused" and "already gone" are
otherwise the same observation.

### BEFORE

| # | cmd | direction | probe | result | counter-read |
|---|---|---|---|---|---|
| S1 | SELECT | must SUCCEED | reads the 6 SYSTEM rules | **6** visible | — |
| S2 | SELECT | must SUCCEED | reads its OWN rule | **1** visible | — |
| S3 | SELECT | must be REFUSED | tenant B's rules | **0** visible | — |
| I1 | INSERT | must SUCCEED | own tenant | 1 row | — |
| I2 | INSERT | must be REFUSED | cross-tenant | `ERROR [42501]` | — |
| I3 | INSERT | must be REFUSED | new SYSTEM rule | `ERROR [42501]` | — |
| U1 | UPDATE | must SUCCEED | own rule | 1 row | — |
| U2 | UPDATE | must be REFUSED | SYSTEM, non-`tenantId` column | `ERROR [42501]` | SYSTEM rows present = **6** |
| **U3** | UPDATE | must be REFUSED | **CAPTURE: SET tenantId = own** | **6 rows** ❌ | SYSTEM still NULL-owned = **6** |
| U4 | UPDATE | must be REFUSED | another tenant's rule | 0 rows | — |
| D1 | DELETE | must SUCCEED | own rule | 1 row | own rule present = **1** |
| **D2** | DELETE | must be REFUSED | **the 6 SYSTEM rules** | **6 rows** ❌ | SYSTEM rows present = **6** |
| D3 | DELETE | must be REFUSED | another tenant's rules | 0 rows | — |

### AFTER

| # | cmd | direction | probe | result | counter-read |
|---|---|---|---|---|---|
| S1 | SELECT | must SUCCEED | reads the 6 SYSTEM rules | **6** visible ✅ | — |
| S2 | SELECT | must SUCCEED | reads its OWN rule | **1** visible ✅ | — |
| S3 | SELECT | must be REFUSED | tenant B's rules | **0** visible ✅ | — |
| I1 | INSERT | must SUCCEED | own tenant | 1 row ✅ | — |
| I2 | INSERT | must be REFUSED | cross-tenant | `ERROR [42501]` ✅ | — |
| I3 | INSERT | must be REFUSED | new SYSTEM rule | `ERROR [42501]` ✅ | — |
| U1 | UPDATE | must SUCCEED | own rule | 1 row ✅ | — |
| U2 | UPDATE | must be REFUSED | SYSTEM, non-`tenantId` column | 0 rows ✅ *(was 42501)* | SYSTEM rows present = **6** |
| **U3** | UPDATE | must be REFUSED | **CAPTURE: SET tenantId = own** | **0 rows** ✅ | SYSTEM still NULL-owned = **6** |
| U4 | UPDATE | must be REFUSED | another tenant's rule | 0 rows ✅ | — |
| D1 | DELETE | must SUCCEED | own rule | 1 row ✅ | own rule present = **1** |
| **D2** | DELETE | must be REFUSED | **the 6 SYSTEM rules** | **0 rows** ✅ | **SYSTEM rows present = 6** |
| D3 | DELETE | must be REFUSED | another tenant's rules | 0 rows ✅ | — |

Live policies after:

```
[SELECT] tenant_isolation_policy        USING ((scope='SYSTEM') OR ("tenantId"=current_tenant_id()))
[INSERT] automation_rule_insert_policy                                WITH CHECK ("tenantId"=current_tenant_id())
[UPDATE] automation_rule_update_policy  USING ("tenantId"=current_tenant_id())  WITH CHECK ("tenantId"=current_tenant_id())
[DELETE] automation_rule_delete_policy  USING ("tenantId"=current_tenant_id())
[ALL]    bypass_rls_policy              USING (current_setting('app.bypass_rls', true) = 'on')
```

Teardown asserted both ways: `deleted 1, left 0` and `SYSTEM rows at exit: 6`. The probe hard-fails
if the SYSTEM count is ever not 6.

---

## 6. `bypass_rls_policy` untouched

```
bypass count  before=86  after=86
bypass TABLE LIST identical: true
pg_policy total  before=183  after=186  net=+3
```

Compared as a **sorted table list**, not merely a count — quick-599's precedent, because two
compensating changes keep a count identical. Net +3 is one policy becoming four on one table.

---

## 7. Gates

| gate | result |
|---|---|
| `npm run audit:rls-policy-drift` | **CLEAN (exit 0)** — 186 live, missing 0, unexpected 0, **definition drift 0**, 186 compared, none un-canonicalised |
| which database it measured | `[db-target] project : wyixpgunnjmzguhggocz (staging)` · `resolved : explicit DIRECT_URL` — both `DATABASE_URL` and `DIRECT_URL` were pinned at the staging string |
| staging policy counts | **183 → 186**, bypass **86 → 86** |
| `npm run build` | **exit 0** |
| vitest, same reporter both directions | **2129 tests · 2010 passed · 64 failed** both directions; **failing-FILE set byte-identical (25)** — expected, since no application code changed |

**The body layer proved it covers these policies**, rather than being assumed to: run *before*
regenerating the artefact, it refused —
`DEFINITION LAYER DID NOT RUN (exit 3) … the canonical artefact is STALE`. `rls-policy-canonical.json`
was then regenerated against staging (183 → 186 entries) and the re-run is clean. A body change is
visible to this gate.

**Expected and recorded:** the regenerated artefact describes staging (186). Until a human deploys
this migration, running the drift detector against **production** (183) will report drift. Same
situation quick-606 §8 item 9 recorded for the tripwire migration; it resolves on the next
`vercel --prod`.

---

## 8. Is `AutomationRule` fully closed?

**Closed for tenant isolation. Still carrying two items that are not policy bugs.**

| | status |
|---|---|
| SELECT | ✅ tenant sees own + the 6 SYSTEM rules |
| INSERT | ✅ own accepted; cross-tenant and new-SYSTEM both 42501 |
| UPDATE | ✅ own accepted; SYSTEM refused; **capture refused** |
| DELETE | ✅ own accepted; **SYSTEM refused, counter-read confirms all 6 survive** |

Every command is now correct in both directions, so the **PARTIAL** verdict quick-599 recorded is
discharged. Two things remain, and neither is a hole in the policy:

1. **`app_user` still holds `DELETE, INSERT, SELECT, UPDATE` grants on the table.** The policy is the
   only thing refusing those writes; there is no defence in depth. This is the exact shape quick-599
   found on `audit_log`, where it added a `REVOKE`. **Recommended, not built** — a `REVOKE` here
   would also block the legitimate tenant-scoped INSERT/UPDATE/DELETE that I1/U1/D1 prove must work,
   so it is not the same one-line fix and needs its own decision.
2. **`toggleRuleActive` must be routed to `getAdminDb` before cutover** (§3). Pre-existing, measured
   broken today, and made quieter rather than worse by this change.

**Production is unchanged** — still `183` policies and both holes open there until a human deploys
this migration. That is the intended state; the deliverable is the migration.

---

## 9. What remains before the `app_user` cutover

| # | item | status | changed by 612? |
|---|---|---|---|
| 1 | **`AutomationRule` DELETE split** | ✅ **CLOSED on staging**, migration committed, production awaiting deploy. The CAPTURE hole was closed with it. | **yes — this task** |
| 2 | The 17 `25P02` sites | CLOSED by quick-611 (0 live, 16 dormant, 1 impossible; gated) | no |
| 3 | **`app_admin` LOGIN on production** | OPEN. Role created `NOLOGIN`; LOGIN + password granted out of band, minted for staging only. **Not re-verified live — production was never connected to for writes.** | no |
| 4 | **The bypass policy drop** | OPEN and not begun. 86 `bypass_rls_policy` rows, untouched. | no |
| 5 | **`toggleRuleActive` on the bare client** | **NEW — reported here.** Fails 42501 under `app_user` today. Must be routed to `getAdminDb`. | reported |
| 6 | **`app_user` grants on `AutomationRule`** | **NEW — reported here.** No defence in depth behind the policy. | reported |

---

## 10. Artefacts

| file | what |
|---|---|
| `apps/web/prisma/migrations/20260915140000_automation_rule_per_command_policy_split/migration.sql` | the deliverable |
| `apps/web/scripts/audit/612-policy-verify.ts` | `--before` / `--apply` / `--after`, with the counter-reads and the apply-time refusals |
| `evidence/01-before.{json,md}` · `03-after.{json,md}` | the two matrices |
| `evidence/04-policy-drift-staging.txt` | drift CLEAN, with the `[db-target]` banner |
| `evidence/00-suite-before.json` · `06-suite-after.json` | the two suite runs |
