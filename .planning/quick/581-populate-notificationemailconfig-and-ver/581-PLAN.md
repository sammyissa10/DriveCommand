---
phase: quick-581
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260902120000_seed_notification_email_config/migration.sql
  - .planning/quick/581-populate-notificationemailconfig-and-ver/581-SUMMARY.md
autonomous: false
executor: orchestrator          # NOT a gsd-executor subagent — needs Supabase MCP + Gmail MCP
user_setup: []

must_haves:
  truths:
    - "The live constraints AND indexes on NotificationEmailConfig are reported before anything is written"
    - "Exactly one NotificationEmailConfig row exists in production after this task"
    - "A verification send reports resolveSenderConfig().source === 'database'"
    - "The delivered From and Reply-To lines are byte-identical to quick-580's"
    - "The disposable tenant and every child row it created are gone, confirmed by re-query"
    - "No source file under apps/web/src is modified"
  artifacts:
    - path: "apps/web/prisma/migrations/20260902120000_seed_notification_email_config/migration.sql"
      provides: "Repo mirror of the production INSERT, idempotent for fresh environments"
      contains: "NotificationEmailConfig"
  key_links:
    - from: "NotificationEmailConfig row (production)"
      to: "apps/web/src/lib/email/sender-config.ts resolveSenderConfig()"
      via: "prisma.notificationEmailConfig.findFirst inside a bypass_rls transaction"
      evidence: "source flips 'env' -> 'database' while From/Reply-To stay identical"
    - from: "migration.sql on disk"
      to: "_prisma_migrations row"
      via: "resolved-not-run row, applied_steps_count = 0 (DEC-17)"
---

<objective>
quick-574 built `resolveSenderConfig` to prefer a `NotificationEmailConfig` row and fall
back to env. quick-580 verified the fallback in production but **could not** verify the
database path — the table has zero rows, so `source` resolved to `'env'`.

This task writes that one row and proves the sender flips to `source: 'database'` **while
delivering a byte-identical message**, because the row's values are chosen to match the
hardcoded fallbacks exactly. That equality is the whole design of the test: the only thing
allowed to change is the reported `source`.

Purpose: close the one honest gap quick-580 named in its §8.
Output: one production row, one mirrored resolved-not-run migration, one verification
send with headers, one confirmed-clean teardown.

**No production source code is written by this task.** `sender-config.ts` is the thing
under test — do not modify it, or any template, or any other table.
</objective>

<execution_context>
Executed by the **orchestrator directly**, not a `gsd-executor` subagent: the work needs
Supabase MCP (schema reads, `apply_migration`, `execute_sql`) and Gmail MCP (reading the
delivered MIME), which the executor does not have. Treat the tasks below as an operator
checklist — the SQL is given verbatim and the assertions are given as pass/fail.
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/580-push-and-verify-the-email-convergence-ch/580-SUMMARY.md
@apps/web/src/lib/email/sender-config.ts
@apps/web/prisma/migrations/20260514200001_add_notification_system/migration.sql
</context>

<preflight_findings>
Read off the repo before planning, because three of them make the brief's literal
instructions fail. **Verify each against the live database in Task 1 rather than trusting
this list** — that is the point of Task 1.

1. **The table is `"NotificationEmailConfig"`, PascalCase and quoted.** The model at
   `schema.prisma:3912` carries no `@@map`, and the CREATE TABLE at
   `20260514200001_add_notification_system/migration.sql:92` confirms it. The brief's
   `conrelid = 'notification_email_config'::regclass` will raise
   `relation "notification_email_config" does not exist`. Use
   `'"NotificationEmailConfig"'::regclass`. Same family as DEC-14 and the camelCase
   `stops."bolRequired"` rule: never infer a name from the convention around it.

2. **The singleton guard is a PARTIAL UNIQUE INDEX, not a constraint.**
   ```sql
   CREATE UNIQUE INDEX "NotificationEmailConfig_singleton_idx"
     ON "NotificationEmailConfig" ("singletonKey")
     WHERE "singletonKey" = 'singleton';
   ```
   `pg_constraint` with `contype IN ('c','u')` returns **nothing** for it, so a
   constraint-only query reports "no unique constraint" and is wrong. Task 1 queries
   `pg_indexes` as well. Two consequences:
   - A bare `ON CONFLICT ("singletonKey") DO NOTHING` **errors** — Postgres cannot infer a
     partial index as arbiter without the matching predicate.
   - Therefore the INSERT below uses `WHERE NOT EXISTS`, which is unambiguous, idempotent,
     and independent of which guard actually exists.

3. **`updatedAt` is `NOT NULL` with no DEFAULT** (Prisma manages it in app code). A raw
   INSERT that omits it fails with a not-null violation. Supply it explicitly.

4. **`List-Unsubscribe` is NOT sourced from the config row.** `UNSUBSCRIBE_MAILTO` is a
   hardcoded `'team@drivecommand.io'` in `unsubscribe.ts:51`. It will be identical to
   quick-580's whatever happens, so **it is not evidence about the row** — do not cite it
   as such in the summary. Only `From` and `Reply-To` are.

5. **`apply_migration` records into Supabase's own ledger; the repo's mirror is
   `_prisma_migrations`, and they are different tables.** DEC-17's rule is the one that
   binds: *query the table and read the newest row back*. Task 2 does exactly that and
   writes the resolved row if `apply_migration` did not. Do not assume it did.
</preflight_findings>

<tasks>

<task type="auto">
  <name>Task 1: Report the live table shape BEFORE writing anything</name>
  <files>none (read-only Supabase MCP)</files>
  <action>
Run these read-only queries via Supabase MCP `execute_sql`, **one result set per call**
(per `feedback_execute_sql_last_statement` — `execute_sql` returns only the last
statement's result, so bundling diagnostics silently discards all but the last).

(a) Columns, types, nullability, defaults:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'NotificationEmailConfig'
ORDER BY ordinal_position;
```

(b) CHECK and UNIQUE **constraints** (DEC-14 — read `pg_constraint` before writing any
enum-ish or vocabulary-bearing column):
```sql
SELECT conname, contype, pg_get_constraintdef(oid) AS def
FROM pg_constraint
WHERE conrelid = '"NotificationEmailConfig"'::regclass
  AND contype IN ('c','u','p');
```

(c) **Indexes** — the half a `pg_constraint` query cannot see (preflight finding 2):
```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'NotificationEmailConfig';
```

(d) Tenant scoping and RLS posture — settle "global or tenant-scoped" from the schema, not
from memory:
```sql
SELECT c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced,
       (SELECT count(*) FROM pg_policies p
         WHERE p.tablename = 'NotificationEmailConfig') AS policy_count,
       (SELECT count(*) FROM information_schema.columns
         WHERE table_name = 'NotificationEmailConfig'
           AND column_name IN ('tenantId','tenant_id','orgId','org_id')) AS tenant_columns
FROM pg_class c WHERE c.oid = '"NotificationEmailConfig"'::regclass;
```

(e) Current row count — must be 0, matching quick-580 §7:
```sql
SELECT count(*) AS rows FROM "NotificationEmailConfig";
```

Record every result verbatim. If (e) is not 0, **STOP** — something wrote a row between
quick-580 and now, and the identity test in Task 3 is no longer a clean experiment.
If (b) reveals a CHECK constraint nobody knew about, report it and confirm the three
values below satisfy it before proceeding.
  </action>
  <verify>All five result sets captured; row count is 0; the singleton guard is identified as an index, a constraint, or both, and stated as such.</verify>
  <done>The table's columns, constraints, indexes, RLS posture, tenant scoping and starting row count are written down, and any divergence from the five preflight findings is called out.</done>
</task>

<task type="auto">
  <name>Task 2: Write the row via apply_migration, then mirror it as resolved-not-run</name>
  <files>apps/web/prisma/migrations/20260902120000_seed_notification_email_config/migration.sql</files>
  <action>
**Step 2.1 — write the migration file first**, so the SHA-256 in step 2.4 is computed over
bytes that already exist on disk. Create
`apps/web/prisma/migrations/20260902120000_seed_notification_email_config/migration.sql`
with **LF line endings** (quick-530: every checksum in `_prisma_migrations` is the SHA-256
of the LF bytes; `core.autocrlf=true` with no `.gitattributes` is a known repo-wide
condition, and matching the existing convention is the only consistent choice):

```sql
-- quick-581 — seed the NotificationEmailConfig singleton.
--
-- APPLIED TO PRODUCTION VIA SUPABASE MCP on 2026-09-02, then mirrored here and
-- marked resolved-not-run, per DEC-3: there is no local database, so a migration
-- file is a record of a change already made, never the thing that makes it.
--
-- WHY THESE EXACT VALUES
-- They are byte-identical to sender-config.ts's FALLBACK_FROM_NAME /
-- FALLBACK_FROM_EMAIL / FALLBACK_REPLY_TO. quick-580 verified the env path in
-- production and could not verify the database path, because the table was
-- empty. Choosing values that match the fallback makes the flip observable in
-- exactly one field -- `source` -- and in nothing a recipient sees. Any other
-- value would change the delivered message and the test would prove less.
--
-- team@drivecommand.app is the only Resend-VERIFIED sending domain.
-- drivecommand.io is NOT verified (its DNS sits on an inaccessible Vercel
-- account), so it may appear as Reply-To and must never appear as From.
--
-- IDEMPOTENT BY `WHERE NOT EXISTS`, deliberately not by ON CONFLICT.
-- The singleton guard is a PARTIAL unique index
-- (`... WHERE "singletonKey" = 'singleton'`), and Postgres cannot infer a
-- partial index as an ON CONFLICT arbiter without restating its predicate.
-- NOT EXISTS is correct whichever guard is present, and DEC-17 names an
-- unguarded seed INSERT as one of the shapes that duplicates data when
-- scripts/migrate.mjs re-runs a migration whose _prisma_migrations row is
-- missing.
--
-- `updatedAt` is NOT NULL with no DEFAULT (Prisma manages it in app code), so a
-- raw INSERT must supply it.
INSERT INTO "NotificationEmailConfig"
  ("singletonKey", "fromName", "fromEmail", "replyTo", "createdAt", "updatedAt")
SELECT 'singleton', 'DriveCommand', 'team@drivecommand.app', 'team@drivecommand.io',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "NotificationEmailConfig");
```

**Step 2.2 — apply it.** Use Supabase MCP **`apply_migration`** (not `execute_sql`) with
name `20260902120000_seed_notification_email_config` and the SQL above verbatim.

**Step 2.3 — read the row back:**
```sql
SELECT "id", "singletonKey", "fromName", "fromEmail", "replyTo", "createdAt", "updatedAt"
FROM "NotificationEmailConfig";
```
Assert: exactly **one** row; `fromName = 'DriveCommand'`;
`fromEmail = 'team@drivecommand.app'`; `replyTo = 'team@drivecommand.io'`; no trailing
whitespace on any of the three (`resolveSenderConfig` trims, so whitespace would be
invisible in the send but wrong in the row).

**Step 2.4 — DEC-17: verify the mirror half, do not assume it.**
`apply_migration` records into Supabase's own migration ledger. The repo's ledger is
`_prisma_migrations`, which `scripts/migrate.mjs` reads and skips by `migration_name`.
Query it:
```sql
SELECT migration_name, checksum, applied_steps_count, logs,
       started_at, finished_at, rolled_back_at
FROM "_prisma_migrations"
ORDER BY finished_at DESC NULLS LAST
LIMIT 3;
```

If the newest row is **not** `20260902120000_seed_notification_email_config` (the expected
outcome — before this task it is `20260825140000_notification_push_channel_and_categories`),
write the resolved row by hand, matching the repo convention exactly:

| column | value |
|---|---|
| `id` | `gen_random_uuid()::text` |
| `checksum` | **real SHA-256 of `migration.sql`'s LF bytes** |
| `migration_name` | `20260902120000_seed_notification_email_config` |
| `logs` | `''` |
| `started_at` / `finished_at` | identical timestamps |
| `rolled_back_at` | `NULL` |
| `applied_steps_count` | **`0`** |

Compute the checksum from disk, never by hand:
```bash
node -e "const fs=require('fs'),c=require('crypto');const b=fs.readFileSync('apps/web/prisma/migrations/20260902120000_seed_notification_email_config/migration.sql','utf8').replace(/\r\n/g,'\n');console.log(c.createHash('sha256').update(b,'utf8').digest('hex'))"
```

Then:
```sql
INSERT INTO "_prisma_migrations"
  ("id","checksum","migration_name","logs","started_at","finished_at",
   "rolled_back_at","applied_steps_count")
VALUES (gen_random_uuid()::text, '<sha256>',
        '20260902120000_seed_notification_email_config', '',
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, 0);
```
(`started_at` and `finished_at` must be the *same* value — issue them in one statement so
`CURRENT_TIMESTAMP` resolves once.)

Re-run the SELECT and assert: the row exists, `applied_steps_count = 0`, `finished_at`
is **non-null** (`migrate.mjs` deletes rows with a null `finished_at` as failed attempts,
so a null there would silently un-resolve the migration on the next deploy), and
`rolled_back_at` is null. `applied_steps_count = 0` is the signature that distinguishes a
mirrored row from one `migrate.mjs` actually executed, which writes `1` — preserve that
distinction rather than normalising it away.
  </action>
  <verify>Exactly one NotificationEmailConfig row with the three expected values; a `_prisma_migrations` row for this migration with `applied_steps_count = 0`, `logs = ''`, `started_at = finished_at`, non-null `finished_at`, null `rolled_back_at`; the on-disk checksum matches the stored one.</verify>
  <done>The production row exists and the repo mirror is complete in BOTH halves — the DDL/DML ledger and the `_prisma_migrations` row — with the resolved-row signature intact.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Verification send, byte-identity comparison, teardown</name>
  <files>apps/web/__prod-email-verify-581.ts (throwaway — created, run, then DELETED, never committed)</files>
  <action>
Repeat quick-580 §4 exactly, changing nothing but the fact that a row now exists. **No
source file changes** — the code path is byte-identical to quick-580's, so any difference
in the delivered message is attributable to the row and to nothing else.

**Step 3.1 — rebuild the throwaway script.** quick-580's `apps/web/__prod-email-verify.ts`
was deleted per its §7. Recreate an equivalent as
`apps/web/__prod-email-verify-581.ts`, run with
`npx tsx --env-file=.env.local __prod-email-verify-581.ts` from `apps/web`. It must:

1. **Print `await resolveSenderConfig()` BEFORE dispatching, and assert
   `source === 'database'`.** If it reports `'env'`, do **not** send — a send on the env
   path proves nothing and consumes the experiment. `resolveSenderConfig` caches for 60s
   *per process*, and a fresh `tsx` process starts with an empty cache, so this should read
   the row on the first call. If it nonetheless says `'env'`, wait 60s and re-run the
   script — **do not edit `CACHE_TTL_MS` or call `__clearSenderConfigCache()` from the
   script**; the brief forbids editing around the cache, and a second cold process is the
   honest way through it.
2. Create a **disposable tenant** (quick-549 convention): name/slug `zz-email-verify-581-…`,
   plus one OWNER `User` at `sammy.issa21@gmail.com`. Note the tenant insert fires the
   trigger that auto-populates `TenantNotificationSettings` (cascade-deleted with the
   tenant, so it needs no explicit teardown step — but check for it, see 3.4).
3. Dispatch the **same trigger as quick-580**: `truck.maintenance_due`, chosen because its
   `defaultRecipients` is `[{role:OWNER},{role:MANAGER}]` so no `NotificationSubscription`
   is needed. Use the **same payload values** so the subject and body are comparable:
   `{ truckId: 'truck_verify', unitNumber: 'Unit 42', maintenanceType: 'Oil Change',
   dueAt: '2026-09-09' }`. Do **not** pass `dedupWindowMs` — quick-580 did not, and the
   5-minute rolling window would suppress a re-run.
4. Print the `dispatchNotification` return (`{sent,skipped,failed}`) and the resulting
   `NotificationSendLog` EMAIL row (status, channel, recipientEmail, subject, triggerKey).

**Step 3.2 — read the delivered message** via Gmail MCP. Capture verbatim: `From`,
`Reply-To`, `Subject`, `Content-Type`, `List-Unsubscribe`, and confirm both
`multipart/alternative` parts are present.

**Step 3.3 — the byte-identity comparison.** Build this table against quick-580 §4:

| header | quick-580 | quick-581 | identical? |
|---|---|---|---|
| `From` | `DriveCommand <team@drivecommand.app>` | | |
| `Reply-To` | `team@drivecommand.io` | | |
| `source` | `env` | expected `database` | **must differ — this is the point** |

`From` and `Reply-To` are the only two headers that carry evidence about the row.
`List-Unsubscribe` is built from a hardcoded constant in `unsubscribe.ts` and is identical
either way — report it for completeness, but do not present it as proof.

**If `From` or `Reply-To` differs from quick-580's, STOP and report.** Do not adjust the
row to make them match. A difference means the row and the fallback disagree, and the
interesting question is *why* — which of the two is wrong, and what else reads the one that
is. Adjusting the row destroys the evidence.

**Step 3.4 — teardown, children before the tenant** (quick-549: `in_app_notifications.org_id`
is a real FK, and the failure mode is every assertion passing while the run fails in
teardown). Order:
1. `NotificationSendLog` (tenantId)
2. `InAppNotification` (org_id) — **must precede the tenant**
3. `UserNotificationPreference`, `NotificationSubscription`
4. `User`
5. `Tenant` (`TenantNotificationSettings` cascades with it)

Print the deletion counts, as quick-580 did.

**Step 3.5 — independently re-query afterwards**, do not trust the script's own counts:

| check | expected |
|---|---|
| tenants matching `zz-email-verify-581-%` | 0 |
| users with `sammy.issa21@gmail.com` | back to the pre-task count (quick-580: 1) |
| orphaned `in_app_notifications` (org_id with no Tenant) | 0 |
| **`NotificationEmailConfig` rows** | **1 — the row STAYS. It is the deliverable, not test litter. Do not delete it.** |
| `NotificationTemplate` rows | 47 — unchanged |

**Step 3.6 — delete the throwaway script** and confirm `git status` shows only the new
migration directory (plus planning docs). `git status` before any deploy is a standing rule
— `vercel --prod` ships the working directory, not git HEAD.
  </action>
  <how-to-verify>
1. The script printed `source: "database"` before sending.
2. Gmail shows the message; `From` is `DriveCommand <team@drivecommand.app>` and `Reply-To` is `team@drivecommand.io`, byte-identical to quick-580.
3. The comparison table shows `source` as the only field that changed.
4. Re-queried leftovers are zero; `NotificationEmailConfig` still holds exactly 1 row.
5. `git status` is clean apart from the migration directory and planning docs.
  </how-to-verify>
  <resume-signal>Type "approved" once the received headers and the teardown re-query are confirmed, or describe what differed.</resume-signal>
</task>

</tasks>

<failure_modes>
Named explicitly so they are checked rather than discovered.

- **DEC-17 — `execute_sql` applies but does not mirror; `apply_migration` writes Supabase's
  ledger, which is not `_prisma_migrations`.** "The row is live" is evidence of the half
  that was never in doubt. Query `_prisma_migrations` and read the newest row back
  (Task 2.4). Convention: real SHA-256 of `migration.sql`, `logs = ''`,
  `started_at = finished_at`, `applied_steps_count = 0`, `rolled_back_at` null. Here the
  cost of missing it is **not** the usual harmless one — this migration is a seed `INSERT`,
  exactly the shape DEC-17 names as duplicating data on a re-run. The `WHERE NOT EXISTS`
  guard is a second line of defence, not the mechanism.
- **DEC-14 — read `pg_constraint` before writing any vocabulary-bearing column.** Task 1
  does. And read `pg_indexes` alongside it: this table's singleton guard is a *partial
  unique index*, invisible to a constraint-only query, and the reason a bare `ON CONFLICT`
  would error.
- **The table name is PascalCase.** `'notification_email_config'::regclass` errors. Same
  class as `stops."bolRequired"` and `Tenant."autoCreateRouteTemplatesFromImports"`.
- **quick-549 teardown ordering** — children before the tenant; `in_app_notifications.org_id`
  is a real FK. A file whose tests all pass but which fails afterwards is this.
- **The 60-second sender cache.** A fresh `tsx` process has an empty cache. If it still
  reports `'env'`, wait and re-run — never edit the TTL or reach for the test seam.
- **Do not delete the config row during cleanup.** It is the deliverable. Only the
  disposable tenant is litter.
- **`EMAIL_FOOTER_ADDRESS` stays unset.** Out of scope; the footer's CAN-SPAM gap remains
  quick-580's open item and is not this task's to close.
- **The send runs from local code against production**, as quick-580's did. State that
  limit again in the summary rather than implying an in-lambda verification.
</failure_modes>

<verification>
- Task 1's five result sets are recorded, and any divergence from the preflight findings is called out.
- `NotificationEmailConfig` holds exactly one row with the three expected values.
- `_prisma_migrations` carries the resolved row: `applied_steps_count = 0`, non-null `finished_at`, `logs = ''`, `started_at = finished_at`, `rolled_back_at` null, checksum matching the on-disk LF bytes.
- The verification send reported `source: 'database'`.
- `From` and `Reply-To` are byte-identical to quick-580's.
- Disposable tenant and all children gone; config row and 47 templates untouched.
- No file under `apps/web/src` modified; the throwaway script is deleted.
</verification>

<success_criteria>
`source: 'database'` is verified in production, with a delivered message a recipient cannot
distinguish from quick-580's, and the repo mirror complete in both halves.
</success_criteria>

<output>
Create `.planning/quick/581-populate-notificationemailconfig-and-ver/581-SUMMARY.md` containing:
1. The table structure — columns, constraints, indexes, RLS posture, tenant scoping, starting row count.
2. The migration as applied, plus the `_prisma_migrations` verification output.
3. The resolved `source`.
4. The `From` and `Reply-To` lines verbatim from the delivered MIME.
5. The byte-identity comparison table against quick-580.
6. Teardown confirmation, including the re-query showing the config row survived.
7. Anything that diverged from the preflight findings, and anything reported-not-fixed.

Then commit: the migration directory + the planning docs. Nothing else should be in the diff.
