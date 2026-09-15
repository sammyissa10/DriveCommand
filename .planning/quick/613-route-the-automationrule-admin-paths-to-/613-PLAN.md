---
phase: quick-613
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/src/app/(admin)/actions/automations.ts
  - apps/web/src/lib/db/admin-reasons.ts
  - apps/web/tests/security/admin-connection-allowlist.test.ts
  - apps/web/prisma/migrations/20260915150000_grant_automation_rule_to_app_admin/migration.sql
  - apps/web/scripts/audit/613-routing-verify.ts
  - .planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/*

must_haves:
  truths:
    - "All five sysadmin `AutomationRule` statements in `app/(admin)/actions/automations.ts` run on the `app_admin` connection via `getAdminDb`, and the bare `prisma` import is gone from that file because nothing in it uses the tenant client any more."
    - "`app_admin` holds `SELECT, UPDATE` — and only those — on `\"AutomationRule\"` on staging, proven by a routed `UPDATE` that raises 42501 BEFORE the migration and affects 1 row AFTER it."
    - "Every routed statement is measured in BOTH directions: it succeeds on the admin connection and is refused, or silently under-reads, on the tenant connection — with a real tenant GUC AND with the empty GUC a sysadmin request actually carries."
    - "Every refusal or zero carries a privileged counter-read proving the target rows still exist unchanged, and every cross-tenant `foreign === 0` is paired with an `own > 0` on the same probe so the assertion is not vacuous."
    - "Whether a SELECT under an EMPTY GUC raises `TC001` or silently under-reads is MEASURED and reported, not assumed — recognised by SQLSTATE walked off the cause chain, never by message prose."
    - "The allowlist gate is proven to fire RED from this task's own run against a deliberate out-of-allowlist import, then reverted and re-run GREEN, with both outputs captured verbatim."
    - "The DEC-17 ledger row for the grant migration is hand-written to staging with `applied_steps_count = 0` and a real SHA-256 over LF bytes, and READ BACK after a sentinel of known-good rows is confirmed visible."
    - "Sites 7 (cron) and 8 (evaluator) are enumerated with a NOT-ROUTED verdict and their owning audit item, and are not touched."
    - "`bypass_rls_policy` is 86 before and after, compared as a sorted TABLE LIST; `npm run audit:rls-policy-drift` reports zero drift and names the database it measured."
    - "Production is never written. Every instrument refuses the production ref positively before issuing a statement."
  artifacts:
    - path: "apps/web/src/app/(admin)/actions/automations.ts"
      provides: "Five sysadmin statements on getAdminDb; query shapes byte-identical"
      contains: "getAdminDb('sysadmin automation rule activation toggle')"
    - path: "apps/web/src/lib/db/admin-reasons.ts"
      provides: "Three new AdminReason members under the existing sysadmin automation surface heading"
      contains: "sysadmin automation rule listing"
    - path: "apps/web/tests/security/admin-connection-allowlist.test.ts"
      provides: "automations.ts calls 3 -> 7; TOTAL_EXPECTED_CALLS 44 -> 48; entry count stays 23"
      contains: "TOTAL_EXPECTED_CALLS).toBe(48)"
    - path: "apps/web/prisma/migrations/20260915150000_grant_automation_rule_to_app_admin/migration.sql"
      provides: "GRANT SELECT, UPDATE ON \"AutomationRule\" TO app_admin — no INSERT, no DELETE, no policy DDL"
      contains: "GRANT SELECT, UPDATE ON TABLE public.\"AutomationRule\" TO app_admin"
    - path: "apps/web/scripts/audit/613-routing-verify.ts"
      provides: "--before / --apply / --after both-directions matrix over the five routed sites, with counter-reads and fixtures"
      contains: "ROLLBACK"
    - path: ".planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/"
      provides: "before/after matrices, allowlist red+green, ledger read-back, drift, build, suite before/after"
  key_links:
    - from: "apps/web/src/app/(admin)/actions/automations.ts"
      to: "apps/web/src/lib/db/admin-reasons.ts"
      via: "getAdminDb(reason: AdminReason) — a new reason is a type change in a reviewable file"
      pattern: "sysadmin automation rule"
    - from: "apps/web/src/app/(admin)/actions/automations.ts"
      to: "apps/web/tests/security/admin-connection-allowlist.test.ts"
      via: "per-file getAdminDb( call count assertion"
      pattern: "calls: 7"
    - from: "the routed UPDATE in toggleRuleActive"
      to: "GRANT UPDATE ON \"AutomationRule\" TO app_admin"
      via: "42501 before the migration, 1 row after — measured by 613-routing-verify --before/--after"
      pattern: "AutomationRule.*app_admin"
---

<objective>
Route the five sysadmin `AutomationRule` statements in `app/(admin)/actions/automations.ts` off the
bare (tenant) Prisma client and onto `getAdminDb`, and ship the `app_admin` grant that makes those
statements actually work.

Purpose: this is cutover item 5 from `612-SUMMARY.md` §9. `toggleRuleActive` is **already broken
under `app_user` today** — measured `42501` in 612 §3, with and without a tenant GUC — and quick-612
made it *quieter* (a silent 0 rows) rather than louder. The other four sites are cross-tenant or
SYSTEM-scope by intent and "work" today only because the data happens to be all-SYSTEM with zero
runs. That is data-dependent, not structural.

Output: five routed statements, three new `AdminReason` members, an updated allowlist entry, one
grant migration applied to staging with its DEC-17 ledger row written by hand, and a both-directions
verification matrix proving each routed statement succeeds on `app_admin` and is refused or
under-reads on `app_user`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/612-close-the-automationrule-delete-gap-with/612-SUMMARY.md
@docs/audits/admin-connection.md
@apps/web/src/app/(admin)/actions/automations.ts
@apps/web/src/lib/db/admin-reasons.ts
@apps/web/tests/security/admin-connection-allowlist.test.ts
@apps/web/scripts/audit/612-policy-verify.ts
@apps/web/prisma/migrations/20260915130000_grant_playbook_notification_to_app_admin/migration.sql
</context>

<established_facts>

**Do NOT re-derive these. They were measured by the orchestrator, not assumed.**

### The complete `AutomationRule` site census (grep over `apps/web/src`, excluding `src/generated`)

| # | site | client today | operation | scope of intent | verdict |
|---|---|---|---|---|---|
| 1 | `app/(admin)/actions/automations.ts:21` `getAutomationRules` | bare `prisma` | `findMany` + `_count.runs` | sysadmin lists ALL rules; the run count spans ALL tenants | **ROUTE** |
| 2 | `app/(admin)/actions/automations.ts:43` `getRuleWithRuns` | bare `prisma` | `findUnique` + `include runs.tenant.name` | last 10 runs ACROSS ALL TENANTS, with tenant names | **ROUTE** |
| 3 | `app/(admin)/actions/automations.ts:71` `toggleRuleActive` | bare `prisma` | **`update`** | writes a SYSTEM rule. **Measured 42501 under `app_user` TODAY** (612 §3) | **ROUTE** |
| 4 | `app/(admin)/actions/automations.ts:95` (in `manualTriggerRule`) | bare `prisma` | `tenant.findUnique` | validates an ARBITRARY operator-supplied tenant id | **ROUTE** |
| 5 | `app/(admin)/actions/automations.ts:98` (in `manualTriggerRule`) | bare `prisma` | `automationRule.findUnique` | reads any rule by id | **ROUTE** |
| 6 | `app/(admin)/actions/automations.ts:108/140/148` | already `getAdminDb` | `automationRun.create` / `updateMany` x2 | routed by quick-600 | untouched |
| 7 | `app/api/cron/automations/route.ts:170` | bare `prisma` | `automationRule.findUnique` by key | **cron, not a sysadmin surface** | **NOT ROUTED** — owned by `admin-connection.md` §9 A1/A7, alongside its four sibling `candidateQuery()` reads in the same file |
| 8 | `lib/automations/evaluator.ts:73` | bare `prisma` | `automationRule.findMany` | **evaluator Path 1, not a sysadmin surface** | **NOT ROUTED** — owned by `admin-connection.md` §9 A2 (one of the five decorative loop-body statements) |

**Two counts in the record are wrong and the summary must correct them explicitly** (quick-610's
precedent — it corrected `app-user-failure-remediation.md`'s "Four" to SIX and said so):

- CLAUDE.md says *"all five `automationRule.*` calls are on the bare client"*. There are **FOUR**
  `automationRule.*` calls on the bare client in that file, plus **one** `tenant.findUnique` — five
  bare `prisma.*` calls total, of which four are `automationRule.*`.
- The brief's *"six call sites"* is also wrong for the same reason.

**Verified by grep during planning:** `automations.ts` contains exactly five `prisma.` usages, at
lines 21, 43, 71, 95, 98 — i.e. **all of them are routed by this task**, so
`import { prisma } from '@/lib/db/prisma';` becomes unused and must be REMOVED.

### Why sites 7 and 8 stay put

Routing site 7 alone, while leaving the four `candidateQuery()` reads in the *same file* unrouted,
would be arbitrary — quick-561's *"fixing one bell and leaving the other"*. Both belong to named,
owned items in `admin-connection.md` §9. Enumerate them with the verdict and the owner; do not touch
them.

### Site 4 is adjacent and non-`AutomationRule` — argue it SEPARATELY and prominently

`prisma.tenant.findUnique` is not an `AutomationRule` statement. It is routed because:
1. it is part of the same `manualTriggerRule` unit of work as the three already-routed
   `automationRun` calls;
2. it is **structurally** cross-tenant — the operator names a tenant that is not theirs (a sysadmin
   has no tenant at all);
3. at cutover it returns `null` for every real tenant, so `manualTriggerRule` would answer
   **"Tenant not found"** always.

`app_admin` already holds `Tenant SELECT, INSERT, UPDATE, DELETE` (`admin-connection.md` §2), so no
grant is needed for it.

### `app_admin` has NO GRANT AT ALL on `AutomationRule` — the migration is MANDATORY

Measured on staging: `information_schema.role_table_grants` for `AutomationRule` returns ONLY
`app_user: DELETE, INSERT, SELECT, UPDATE`. There is no `app_admin` row. Routing without the grant
merely moves the `42501` from the tenant role to the admin role
(`admin-connection.md` §8 item 3, and §2 — *"GRANTs are the ONLY control left on that connection"*).

The correct grant is **`SELECT, UPDATE` and nothing else**. No routed path creates or deletes a rule,
and §2's rule is least privilege per routed site, never `GRANT ALL`. Every other table the routed
statements touch is already granted: `AutomationRun` (SELECT, INSERT, UPDATE), `Tenant` (SELECT,
INSERT, UPDATE, DELETE).

### Other measured facts

- `AutomationRule` has **zero non-internal triggers** (`pg_trigger`), so quick-600 §5's trigger-grant
  surprise is unlikely to recur — but §5's lesson is that only a REAL exercise of the statement
  proves a grant set complete. The verification must run the statements, not reason about them.
- `AutomationScope` enum = `SYSTEM, TENANT`. Staging AND production each hold **6 SYSTEM rules**,
  `tenantId` NULL, and **zero** TENANT-scoped rules.
- Staging holds **0 `AutomationRun` rows** and 2 tenants. The under-read on sites 1 and 2 therefore
  **cannot be demonstrated against live data** — fixtures are mandatory (quick-610: an assertion over
  an empty set proves nothing on the direction that must SUCCEED).
- `apps/web/.env.staging` (gitignored) provides `STAGING_DATABASE_URL_APP_USER`,
  `STAGING_DATABASE_URL_ADMIN`, `STAGING_DIRECT_URL`, `TENANT_CONTEXT_TRIPWIRE`. Both role
  connections exist on staging.
- Arming the tripwire on a connection is `SELECT set_config('app.tenant_context_tripwire','on',false)`
  — a session-level `SET` is the only arming mechanism there is (quick-602).
- Staging ref `wyixpgunnjmzguhggocz` · production ref `oqdhberkghtnszrkdvfm`.

</established_facts>

<tasks>

<task type="auto">
  <name>Task 1: Route the five sites — the three deliberate edits the contract requires</name>
  <files>
apps/web/src/lib/db/admin-reasons.ts
apps/web/src/app/(admin)/actions/automations.ts
apps/web/tests/security/admin-connection-allowlist.test.ts
  </files>
  <action>
`admin-connection.md` §8: a new admin call is **three deliberate edits, never one**. Edits 1 and 2
are here; edit 3 is the migration in Task 2.

**Edit 1 — `lib/db/admin-reasons.ts`.** The contract's rule is **ONE MEMBER PER ROUTED UNIT OF WORK,
not per call site**; the string says what the path DOES, never that it needs admin, and never
contains "bypass" or "cross-tenant" as the whole string. Add **exactly three** members under the
EXISTING `── SysAdmin automation surface ──` heading, beside `'sysadmin manual automation trigger'`:

```ts
  'sysadmin automation rule listing',            // site 1 — getAutomationRules
  'sysadmin automation rule detail read',        // site 2 — getRuleWithRuns
  'sysadmin automation rule activation toggle',  // site 3 — toggleRuleActive
```

Sites 4 and 5 **reuse the EXISTING `'sysadmin manual automation trigger'`** — they are the same unit
of work as the `automationRun` calls already in that function. **Do not mint a fourth reason.**

**Edit 2 — `app/(admin)/actions/automations.ts`.** Change ONLY which client each statement uses.
Query shape, `select`, `include`, `where`, ordering, error handling and return values stay
BYTE-IDENTICAL. No new behaviour, no error-handling changes.

- `getAutomationRules` (line 21): `const adminDb = await getAdminDb('sysadmin automation rule listing');`
  then `return adminDb.automationRule.findMany({ ...unchanged });`
- `getRuleWithRuns` (line 43): `const adminDb = await getAdminDb('sysadmin automation rule detail read');`
  then `adminDb.automationRule.findUnique({ ...unchanged })`.
- `toggleRuleActive` (line 71): `const adminDb = await getAdminDb('sysadmin automation rule activation toggle');`
  then `await adminDb.automationRule.update({ ...unchanged });`. `revalidatePath` unchanged.
- `manualTriggerRule`: add **exactly ONE** new acquisition,
  `const adminDb = await getAdminDb('sysadmin manual automation trigger');`, placed immediately
  **before** the tenant lookup (after the UUID-format guard), and use it for **BOTH** the
  `tenant.findUnique` (line 95) and the `automationRule.findUnique` (line 98).
  **Leave the three existing `getAdminDb` calls at lines 108/140/148 exactly as they are** — they sit
  inside try/catch branches and restructuring them would change what the site does. Name the new
  local `adminDb`; the existing locals are `adminDb`/`adminDbSent`/`adminDbFailed` inside their own
  block scopes, so check for a shadowing/redeclaration collision and rename the new one (e.g.
  `adminDbRead`) if tsc complains. Do not rename the existing three.
- Each routed function carries a one-line `// quick-613 — ROUTE.` comment stating *why that site is
  cross-tenant*, in the style of the existing `// quick-600 (B5) — ROUTE.` comments.
- **Remove `import { prisma } from '@/lib/db/prisma';`** — verified during planning that lines
  21/43/71/95/98 are the file's ONLY `prisma.` usages, so after routing it is unused. Confirm with a
  grep for `prisma.` in the file before deleting the import; an unused import is a lint/type smell.

**Edit 3 (here) — `tests/security/admin-connection-allowlist.test.ts`.** Update the allowlist entry
and BOTH integrity-floor constants. Do not weaken anything:

- `'app/(admin)/actions/automations.ts': { calls: 3, ... }` becomes `{ calls: 7, ... }`
  — 3 existing + 1 listing + 1 detail + 1 toggle + **1 shared call in `manualTriggerRule` serving
  BOTH site 4 and site 5**.
- Entry count **STAYS 23** (`expect(Object.keys(ADMIN_ALLOWLIST).length).toBe(23)`) — no new file
  joins the list.
- `expect(TOTAL_EXPECTED_CALLS).toBe(44)` becomes `.toBe(48)`.
- **Do not touch `minBytes`** unless the file shrinks below its floor (it will grow — 4000 floor,
  file is ~5.3 kB and growing).

Run `npx vitest run tests/security/admin-connection-allowlist.test.ts` in `apps/web` — it must pass.
  </action>
  <verify>
```bash
cd apps/web
grep -n "prisma\." "src/app/(admin)/actions/automations.ts"          # must print NOTHING
grep -c "getAdminDb(" "src/app/(admin)/actions/automations.ts"       # must print 7
grep -n "from '@/lib/db/prisma'" "src/app/(admin)/actions/automations.ts"  # must print NOTHING
npx vitest run tests/security/admin-connection-allowlist.test.ts     # must PASS
npx tsc --noEmit                                                     # see Task 4's blindness protocol
```
  </verify>
  <done>
All five statements run on `getAdminDb`; the file has zero `prisma.` usages and no `prisma` import;
exactly 7 `getAdminDb(` calls; three new `AdminReason` members and no fourth; allowlist entry
`calls: 7`, entry count 23, `TOTAL_EXPECTED_CALLS` 48; the allowlist test passes. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 2: The grant migration, applied to staging, with the DEC-17 ledger row written by hand and read back</name>
  <files>
apps/web/prisma/migrations/20260915150000_grant_automation_rule_to_app_admin/migration.sql
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/02-ledger-readback.md
  </files>
  <action>
**The file.** Path exactly
`apps/web/prisma/migrations/20260915150000_grant_automation_rule_to_app_admin/migration.sql` — the
timestamp must sort AFTER `20260915140000` (quick-612's policy split).

Body: a header comment explaining WHY, then the grant. Model the header on
`20260915130000_grant_playbook_notification_to_app_admin/migration.sql` — it is the established shape
for a grant migration in this repo. The header must state:
- the five routed sites this grant serves, by function name;
- that `app_admin` had **NO GRANT AT ALL** on this table, measured against
  `information_schema.role_table_grants` on staging before the file was written;
- **why SELECT and UPDATE only** — no routed path inserts or deletes a rule, and §2's rule is least
  privilege per routed site, never `GRANT ALL`;
- that this file WILL reach production on the next `vercel --prod` via `vercel.json`'s
  `scripts/migrate.mjs` build command, and that this is intended (the grant is missing on production
  too, and `toggleRuleActive` is broken there for the same reason).

The statement, guarded on `pg_roles` so it is a no-op wherever the role does not exist (a fresh local
database, a restored snapshot predating `20260914140000`) — same guard as the 130000 precedent:

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT, UPDATE ON TABLE public."AutomationRule" TO app_admin;
  END IF;
END
$$;
```

**No policy DDL in this file.** It changes no policy, so `rls-policy-drift` must report ZERO,
unchanged from 612's post-state. Do NOT regenerate `rls-policy-canonical.json`.

**Apply it via the `--apply` mode of `613-routing-verify.ts`** (built in Task 3 — build the script
first, or write the apply mode first and the probes after; either order, but the apply must go
through the guarded path, never a bare `execute_sql`). The apply guard must, **after stripping `--`
comments** (quick-612 refused its OWN migration on `AS RESTRICTIVE` matched inside the header
comment; quick-600 hit the identical trap on `pool.on('connect'`) — and this header will contain the
words INSERT and DELETE while *explaining why they are excluded*, so the comment strip is not
optional here, it is load-bearing — refuse on:
- any `CREATE POLICY` / `DROP POLICY` (this is a grant migration; policy DDL here is a second change
  smuggled in);
- `GRANT ALL` or `ALL TABLES IN SCHEMA`;
- `INSERT` or `DELETE` appearing in a `GRANT ... ON ... "AutomationRule"` statement;
- any connection string not naming the staging ref.

**The DEC-17 ledger row — this is the hard part.** Neither MCP tool writes Prisma's
`_prisma_migrations` ledger: `execute_sql` and `apply_migration` both apply SQL, and `apply_migration`
additionally records into **Supabase's own** ledger, a DIFFERENT table. The row is written **by hand**,
every time, with the repo convention:
- `checksum` = real **SHA-256 of `migration.sql` over LF bytes** (normalise CRLF → LF before hashing
  — `core.autocrlf=true` on this checkout);
- `logs = ''`;
- `started_at = finished_at`;
- **`applied_steps_count = 0`** — the signature distinguishing a hand-mirrored row from one
  `migrate.mjs` actually executed (which writes `1` with checksum `'manual'`).

Then **READ IT BACK**, and **FIRST confirm a sentinel of known-good existing rows is visible**:
`_prisma_migrations` has RLS enabled with zero policies and no `app_user` grant, so an empty read from
a non-owner role is indistinguishable from absence and would invite a duplicate write. Follow
`612-SUMMARY.md` §4's exact procedure: print the newest 3 rows, then the read-back, then assert
`checksum` is a real SHA-256 (not `'manual'`), `applied_steps_count === 0`, `started_at === finished_at`,
and HEAD IS OURS. Write all of it to `evidence/02-ledger-readback.md`.

**Production is NEVER written.** The migration file is committed and awaits a human's `vercel --prod`.
  </action>
  <verify>
```bash
cd apps/web
npx tsx scripts/audit/613-routing-verify.ts --apply   # guarded; staging only
# then, from the ledger read-back evidence:
#   sentinel: 3 known-good rows visible BEFORE the write
#   READ BACK: applied_steps_count = 0, checksum is a real SHA-256, started_at = finished_at
#   HEAD IS OURS: true
```
Grant confirmed live on staging:
`select grantee, privilege_type from information_schema.role_table_grants where table_name='AutomationRule' order by 1,2;`
must now show `app_admin: SELECT, UPDATE` **and nothing else for that role**, with `app_user`'s four
grants unchanged.
  </verify>
  <done>
The migration file exists at the stated path, contains only the guarded grant plus its header, is
applied to staging through the guarded `--apply`, and its `_prisma_migrations` row is written by hand
and read back with the sentinel confirmed first. `app_admin` holds exactly `SELECT, UPDATE` on
`"AutomationRule"`; `app_user`'s grants are untouched. Production unwritten. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 3: The both-directions verification instrument, the fixtures, and the witnessed-red allowlist proof</name>
  <files>
apps/web/scripts/audit/613-routing-verify.ts
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/01-before.{json,md}
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/03-after.{json,md}
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/04-allowlist-gate-fires.md
  </files>
  <action>
**Read `apps/web/scripts/audit/612-policy-verify.ts` first and model this closely on it** — reuse its
refusal guard, its `[db-target]` STDERR banner, its `BEGIN … ROLLBACK` discipline, its separate
privileged counter-read connection, and its asserted teardown.

**Hard requirements on the instrument:**

1. **It MUST NOT import `scripts/_bootstrap-env`** (quick-607 — that file used to repoint
   `DATABASE_URL` at `DIRECT_URL`, and every env file points `DIRECT_URL` at PRODUCTION). Load
   `apps/web/.env.staging` explicitly with `dotenv`. Refuse **POSITIVELY**: every connection string
   must contain the staging ref `wyixpgunnjmzguhggocz`, and refuse loudly on
   `oqdhberkghtnszrkdvfm`. Refuse BEFORE issuing any statement.
2. **Banner to STDERR, never stdout** (quick-585/607): script name, `project : wyixpgunnjmzguhggocz
   (staging)`, roles in use, mode, tenant A and B ids.
3. Three connections: `STAGING_DATABASE_URL_ADMIN` (the `app_admin` direction, **no tenant GUC**),
   `STAGING_DATABASE_URL_APP_USER` (the tenant direction, **tripwire armed** with
   `select set_config('app.tenant_context_tripwire','on',false)`), and `STAGING_DIRECT_URL` (the
   privileged counter-read / fixture connection). Modes `--before`, `--apply`, `--after`.

**Fixtures — mandatory, and note the deviation from the brief's wording.** The brief says "inside its
transaction"; that is impossible here and 612's actual precedent is the correct pattern. The probe
runs on a **different connection** from the fixture creator, so an uncommitted fixture is invisible to
it. Follow 612: create fixtures **committed** on the privileged connection, run every probe inside
`BEGIN … ROLLBACK`, tear down in a `finally` with an asserted `left === 0`. Record this reasoning in
the script header. Fixtures, all keyed `quick613_%`:
- one TENANT-scoped `AutomationRule` owned by **tenant B** (for site 5's cross-tenant demonstration);
- one `AutomationRun` for **tenant A** and one for **tenant B**, both attached to a SYSTEM rule, so
  sites 1 and 2 have cross-tenant content to under-read (staging has 0 runs — without these, the
  admin direction's "must SUCCEED" half is vacuous).

Assert the SYSTEM rule count is **6 at entry and 6 at exit** and hard-fail otherwise (612's
precedent). Assert teardown deleted the fixtures and `left === 0`; assert `AutomationRun` fixtures are
gone by id.

**The matrix — five routed sites, both directions, three GUC states.** For each site run the REAL
statement shape the routed code issues:

| site | statement | ADMIN (`app_admin`, no GUC) | TENANT, GUC = tenant A | TENANT, GUC EMPTY (what a sysadmin request actually has) |
|---|---|---|---|---|
| 1 `getAutomationRules` | rules + per-rule `AutomationRun` count | must SUCCEED: 6 rules, run count = **2** (both tenants) | under-reads: run count **≤ 1** | MEASURE |
| 2 `getRuleWithRuns` | rule + last 10 runs joined to `Tenant.name` | must SUCCEED: **2** runs, both tenant names | under-reads: tenant B's run + name invisible | MEASURE |
| 3 `toggleRuleActive` | `UPDATE "AutomationRule" SET "isActive" = ... WHERE id = <a SYSTEM rule>` | **`--before`: must be 42501 (no grant). `--after`: 1 row.** This IS the proof the migration is mandatory | must be REFUSED — **silent 0 rows** post-612 (was 42501 pre-612) | MEASURE |
| 4 `tenant.findUnique` | `SELECT id, name FROM "Tenant" WHERE id = <tenant B>` | must SUCCEED: 1 row | must be REFUSED: **0** — paired with an `own > 0` read of tenant A on the same connection | MEASURE |
| 5 `automationRule.findUnique` | by id, `select actionsJson` | must SUCCEED for both a SYSTEM rule and tenant B's rule | **SYSTEM rule IS visible** (the SELECT policy's SYSTEM branch) — report that honestly; **tenant B's TENANT-scoped rule is 0**, paired with `own > 0` | MEASURE |

**Site 5's honest finding must be stated, not smoothed over:** it does not under-read for a SYSTEM
rule today, because 612's SELECT half keeps the SYSTEM branch. Its routing justification is
unit-of-work coherence plus the structural cross-tenant case the fixture demonstrates. Say so.

**COUNTER-READS ARE MANDATORY on every zero and every refusal** (quick-599 D3 — an RLS-refused
UPDATE/DELETE is a SILENT 0 ROWS, not a 42501, so "0 rows" alone cannot distinguish REFUSED from
ALREADY GONE). Each refusal probe takes a privileged counter-read **on the separate connection**,
while the probe's transaction is still open, proving the target rows still exist and are unchanged.
And quick-610's inverse: **every `foreign === 0` is paired with an `own > 0`** on the same probe, or
the assertion is vacuous.

**For a `count(*)` probe, report the SCALAR, not `rowCount`** — 612's `Probe.value` comment: `rowCount`
is always 1 for a count query, so a refused cross-tenant read reads exactly like a successful one.

**Measure and REPORT, do not assume, whether SELECT under an EMPTY GUC raises `TC001`.** The SELECT
policy is `(scope='SYSTEM' OR "tenantId" = current_tenant_id())`; whether PostgreSQL short-circuits
the OR past `current_tenant_id()` for a SYSTEM row decides whether sites 1/2/5 silently under-read or
hard-fail today. This is a real open question and the answer belongs in the summary either way.
- **SQLSTATE is walked off the CAUSE CHAIN, never read from `err.code` alone** (quick-610 — Prisma
  surfaces a `DriverAdapterError` whose own `code` is `undefined`). Raw `pg` carries `code` at the top
  level, so **one walker serves both**; write the walker.
- Recognise `TC001` by **CODE, never by message prose** (quick-602).

**`bypass_rls_policy` assertion:** count and **sorted TABLE LIST** at `--before` and `--after`, both
86 and identical. A count alone is satisfied by two compensating changes (quick-599).

Write `evidence/01-before.{json,md}` and `03-after.{json,md}`, matching 612's shape.

---

**The witnessed-red allowlist proof — `evidence/04-allowlist-gate-fires.md`.** The brief is explicit:
**prove it from THIS task's own run, do not cite quick-600.** A guard asserted without a witnessed red
is the quick-549 shape.

1. Create a scratch file under `apps/web/src` (e.g. `src/lib/__probe-613.ts`) containing
   `import { getAdminDb } from '@/lib/db/admin-prisma';` and a trivial use.
2. Run `npx vitest run tests/security/admin-connection-allowlist.test.ts` — **capture the RED output
   verbatim**, including the failure message naming the file.
3. **Delete the scratch file** and re-run — capture the GREEN output verbatim.
4. **Verify the revert is complete**: `git status --porcelain` shows no stray probe file, and
   `grep -rn "__probe" apps/web/src` returns nothing. quick-519 found a previous run's `__probe.ts`
   still sitting in `src/lib/document-import/` — do not repeat it.

Both outputs go into `04-allowlist-gate-fires.md`, labelled RED and GREEN with the exact commands.
  </action>
  <verify>
```bash
cd apps/web
npx tsx scripts/audit/613-routing-verify.ts --before   # site 3 ADMIN must be 42501 here
npx tsx scripts/audit/613-routing-verify.ts --apply    # Task 2's grant
npx tsx scripts/audit/613-routing-verify.ts --after    # site 3 ADMIN must be 1 row here
git status --porcelain                                  # no stray probe file
grep -rn "__probe" src || echo "clean"
```
Evidence files 01/03/04 exist and are non-trivial. SYSTEM rows 6 at entry and exit in both runs;
teardown `left = 0`; bypass 86/86 with an identical sorted table list.
  </verify>
  <done>
`613-routing-verify.ts` exists, refuses production positively, prints its `[db-target]` banner to
stderr, and produces a five-site × two-direction × three-GUC-state matrix with a counter-read on every
zero and an `own > 0` beside every `foreign === 0`. Site 3 is `42501` in `--before` and `1 row` in
`--after`, which is the migration's proof. The empty-GUC `TC001` question is answered with a measured
result. The allowlist gate is captured RED then GREEN from this task's own run and the scratch file is
fully reverted. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 4: Gates, the app_user grants recommendation, and the cutover ledger</name>
  <files>
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/00-suite-before.json
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/05-policy-drift-staging.txt
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/06-build.log
.planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/07-suite-after.json
.planning/quick/613-route-the-automationrule-admin-paths-to-/613-SUMMARY.md
  </files>
  <action>
**Stop any running `next dev` BEFORE any `git stash` or mass file operation** — it poisons the
Turbopack cache and a restart does not fix it; delete `apps/web/.next` and restart if it happened.

**tsc — and check the gate is not blind.** `npx tsc --noEmit` in `apps/web`. If the only errors are
syntax errors, or are all in files you did not touch, or are under `.next/`, **the gate is BLIND, not
green**: delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, re-run.
Then **PROBE it**: inject `const x: number = 'y';` into
`src/app/(admin)/actions/automations.ts` — the file you actually edited — confirm tsc reports THAT
error, then **delete the probe** and re-run clean. Record both in the summary.

**`npm run build`** must exit 0 → `evidence/06-build.log`.

**`npm run audit:rls-policy-drift`** must report ZERO and **the evidence must name which database it
measured** — capture the `[db-target] project : <ref>` banner (quick-607). This migration changes no
policy, so drift must be **unchanged from 612's post-state: 186 live / 0 missing / 0 unexpected / 0
definition drift against staging**. **Do NOT regenerate `rls-policy-canonical.json`** — nothing about
any policy changed, and regenerating would be a change smuggled in beside the one being measured.
→ `evidence/05-policy-drift-staging.txt`.

**Vitest, SAME REPORTER BOTH DIRECTIONS.** `--silent` and `--reporter=json` disagree by ±4 on this
suite (quick-565), so a before/after measured with different reporters means nothing. **Never use
`--reporter=basic`** — it does not exist in vitest 4 and exits 0 having run ZERO tests. Read the
`Test Files … | Tests …` summary line.
- **Measure the baseline with `git stash` on THIS tree, not by trusting 612's published numbers.**
  quick-561/565/567: three consecutive tasks published a baseline measuring something other than the
  tree they thought. A baseline **worktree** does NOT carry `apps/web/.env.local` (quick-567), so use
  `git stash` in the main tree — never `git worktree`.
- Baseline → `evidence/00-suite-before.json`; after → `evidence/07-suite-after.json`.
- The **failing-FILE set must be byte-identical**, and `admin-connection-allowlist.test.ts` must PASS
  in the after run.

**The `app_user` grants decision — ANALYSE AND RECOMMEND, DO NOT APPLY.** Argue this in the summary
with the evidence:

- **The recommendation is to NARROW to `SELECT` only** — i.e.
  `REVOKE INSERT, UPDATE, DELETE ON "AutomationRule" FROM app_user` — because after this task there is
  **exactly ONE `AutomationRule` write in the whole repository** (`toggleRuleActive`, now on
  `app_admin`), and **zero** TENANT-scoped rows exist on either database. A grant should describe what
  the application does, not what a data model might one day permit; with it revoked, the SYSTEM
  capture and SYSTEM delete are refused by **two independent controls**.
- **But do NOT apply it in this task, and the deferral is principled, not timid:**
  1. this task's whole measurement is a both-directions matrix whose TENANT half must be refused **by
     the policy**; revoking the grant mid-task makes every refusal ambiguous between grant and policy
     — a second change smuggled in beside the one being measured (quick-602's rule);
  2. it would turn quick-612's committed `612-policy-verify.ts` probes **I1/U1/D1** from "must
     SUCCEED" to `42501`, so it needs that instrument updated in the same commit;
  3. it is reversible and belongs in its own task, with the exact SQL stated.
- **State the counter-argument honestly.** Unlike `audit_log` — append-only *by nature*, a structural
  property — `AutomationRule`'s tenant-write path is **unbuilt, not forbidden**: the `TENANT` enum
  member, the `tenantId` FK and the policy's own INSERT/UPDATE/DELETE clauses all anticipate it.
  Revoking means the day tenant-authored rules are built, it fails `42501` at a layer nobody thinks to
  look at, while the policy says yes. That is the real cost and it must not be hidden.

**The summary must also carry, explicitly:**
- The **count corrections**: CLAUDE.md's "all five `automationRule.*` calls" and the brief's "six call
  sites" are both wrong — four `automationRule.*` + one `tenant.findUnique` = five bare `prisma.*`
  calls (quick-610's precedent for reporting rather than silently fixing).
- **Site 4 argued separately and prominently** — why a `Tenant` read is routed by an
  `AutomationRule` task.
- **Sites 7 and 8 enumerated with a NOT-ROUTED verdict and the owning `admin-connection.md` §9 item.**
- The measured **empty-GUC `TC001`** answer.
- The **honest site-5 finding** (SYSTEM rules are visible to a tenant connection today).
- **What remains before cutover** — carry forward 612 §9's table, updated:

| # | item | status after 613 |
|---|---|---|
| 1 | `AutomationRule` DELETE + CAPTURE split | CLOSED on staging (612), production awaiting deploy |
| 2 | The 17 `25P02` sites | CLOSED by quick-611 |
| 3 | `app_admin` LOGIN on production | **OPEN, untouched** |
| 4 | The bypass policy drop | **OPEN and not begun** — 86 rows, untouched |
| 5 | `toggleRuleActive` on the bare client | **CLOSED by this task** |
| 6 | `app_user` grants on `AutomationRule` | **ANALYSED — recommendation stated, deliberately not applied** |
| 7 | **NEW: production deploy of BOTH migrations** (612's policy split, 613's grant) | named prerequisite — both are committed and awaiting a human's `vercel --prod` |

Write `613-SUMMARY.md` in the repo's established summary shape (see `612-SUMMARY.md`): numbered
sections, measured tables, the stated costs, and an artefacts table.
  </action>
  <verify>
```bash
cd apps/web
npx tsc --noEmit                      # clean, AND probed (inject-then-delete) so it is not blind
npm run build                          # exit 0
npm run audit:rls-policy-drift         # exit 0, 186/0/0/0, banner names wyixpgunnjmzguhggocz
```
Suite before and after measured with the SAME reporter; failing-FILE set byte-identical;
`admin-connection-allowlist.test.ts` PASSES after.
`select count(*) from pg_policy where polname='bypass_rls_policy'` = **86**, sorted table list
identical to 612's.
  </verify>
  <done>
tsc clean and proven non-blind by an injected-then-deleted probe; build exits 0; drift is zero against
a named database with `rls-policy-canonical.json` untouched; the suite's failing-FILE set is
byte-identical between two same-reporter runs and the allowlist test passes. `613-SUMMARY.md` carries
the count corrections, site 4's separate argument, sites 7/8's NOT-ROUTED verdicts, the measured
empty-GUC result, the honest site-5 finding, the `app_user` grants recommendation WITH its
counter-argument and its three reasons for deferral, and the updated cutover table. Committed.
  </done>
</task>

</tasks>

<verification>

1. `grep -c "getAdminDb(" "apps/web/src/app/(admin)/actions/automations.ts"` = **7**;
   `grep -n "prisma\." ` on the same file prints nothing.
2. `npx vitest run tests/security/admin-connection-allowlist.test.ts` passes, and
   `evidence/04-allowlist-gate-fires.md` contains a verbatim RED run from THIS task followed by a
   verbatim GREEN one.
3. `information_schema.role_table_grants` on staging: `app_admin` holds exactly `SELECT, UPDATE` on
   `"AutomationRule"`; `app_user` still holds its original four.
4. `evidence/01-before.md` shows site 3's ADMIN direction as `ERROR [42501]`; `03-after.md` shows it as
   `1 row(s) affected`. Nothing else in the two matrices differs except that one cell.
5. Every refusal/zero row in both matrices carries a counter-read value, and every cross-tenant
   `foreign = 0` has an `own > 0` beside it.
6. `_prisma_migrations` read-back: `applied_steps_count = 0`, real SHA-256 checksum, `logs = ''`,
   `started_at = finished_at`, sentinel rows confirmed visible first.
7. `bypass_rls_policy` = 86 before and after, sorted TABLE LIST identical.
8. `npm run audit:rls-policy-drift` exit 0, 186 live / 0 missing / 0 unexpected / 0 definition drift,
   banner naming `wyixpgunnjmzguhggocz`; `rls-policy-canonical.json` unmodified (`git status` clean for
   that file).
9. `npm run build` exit 0; `npx tsc --noEmit` clean AND probed.
10. Vitest before/after, same reporter, failing-FILE set byte-identical.
11. `git log` shows four atomic commits, none of them a `git push`.
12. **Production untouched**: no write statement was ever issued against `oqdhberkghtnszrkdvfm`, and
    every instrument refuses it positively before connecting.

</verification>

<success_criteria>

- The five sysadmin `AutomationRule` statements run on `app_admin`; nothing else about them changed.
- `app_admin` holds `SELECT, UPDATE` on `"AutomationRule"` — least privilege, no INSERT, no DELETE —
  and the grant's necessity is proven by a 42501→1-row transition on the routed UPDATE.
- Both directions are measured for all five sites across three GUC states, with counter-reads and
  non-vacuous pairings throughout.
- The allowlist gate is witnessed red and green from this task's own run.
- Sites 7 and 8 are enumerated and untouched; the bypass programme and the `app_user` cutover are not
  begun; `bypass_rls_policy` is 86 before and after.
- The `app_user` grants question is analysed with a stated recommendation, three stated reasons for
  deferring it, and its honest counter-argument — and is NOT applied.
- No guard was weakened to make any run green.

</success_criteria>

<output>
After completion, create
`.planning/quick/613-route-the-automationrule-admin-paths-to-/613-SUMMARY.md`.
</output>
