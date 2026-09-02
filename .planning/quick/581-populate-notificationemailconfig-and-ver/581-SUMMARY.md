# quick-581 — Populate NotificationEmailConfig and verify the database-sourced sender

**Date:** 2026-09-02
**Type:** production data write + verification. **No source code written.**

Closes the one gap quick-580 named in its §8: `resolveSenderConfig`'s
`source: 'database'` branch had never executed anywhere, because the table it reads
held zero rows.

---

## 1. The table, before anything was written

**Three of the brief's literal instructions would have failed.** All three were found by
reading the schema and then confirmed against production.

### 1.1 The table is `public."NotificationEmailConfig"` — PascalCase

The Prisma model at `schema.prisma:3912` carries no `@@map`, so there is no snake_case
table. The brief's

```sql
conrelid = 'notification_email_config'::regclass
```

raises `relation "notification_email_config" does not exist`. The working form is
`'"NotificationEmailConfig"'::regclass`. Same family as DEC-14 and `stops."bolRequired"`:
never infer a name from the convention around it.

### 1.2 Columns

| # | column | type | null | default |
|---|---|---|---|---|
| 1 | `id` | uuid | NO | `gen_random_uuid()` |
| 2 | `singletonKey` | text | NO | `'singleton'::text` |
| 3 | `fromName` | text | NO | — |
| 4 | `fromEmail` | text | NO | — |
| 5 | `replyTo` | text | **YES** | — |
| 6 | `createdAt` | timestamptz | NO | `CURRENT_TIMESTAMP` |
| 7 | `updatedAt` | timestamptz | NO | **none** |

**`updatedAt` is NOT NULL with no DEFAULT** — Prisma's `@updatedAt` is applied in
application code, not by the database. A raw INSERT that omits it fails with a not-null
violation, so the migration supplies it explicitly.

### 1.3 Constraints — and the one a constraint query cannot see

`pg_constraint` for this table returns **exactly one row**:

```
NotificationEmailConfig_pkey   p   PRIMARY KEY (id)
```

No CHECK. No UNIQUE. **A `contype IN ('c','u')` query as the brief specified returns
nothing at all**, from which the natural conclusion — "there is no uniqueness guard" — is
wrong. `pg_indexes` carries the guard:

```sql
CREATE UNIQUE INDEX "NotificationEmailConfig_singleton_idx"
  ON public."NotificationEmailConfig" USING btree ("singletonKey")
  WHERE ("singletonKey" = 'singleton'::text);
```

A **partial unique index**, which creates no `pg_constraint` row. Two consequences:

- Exactly one row with `singletonKey = 'singleton'` is permitted; other values are
  unconstrained.
- A bare `ON CONFLICT ("singletonKey") DO NOTHING` **errors** — Postgres will not infer a
  partial index as an arbiter without its predicate restated. The migration uses
  `WHERE NOT EXISTS`, which is correct whichever guard is present.

**Generalises DEC-14: read `pg_indexes` alongside `pg_constraint`.** A uniqueness rule can
live in either, and only one of them is where people look. This partial index is also
absent from `schema.prisma`, so the model alone does not describe it either.

### 1.4 Scope and RLS posture

| property | value |
|---|---|
| tenant/org columns | **0** — the row is **GLOBAL**, not tenant-scoped |
| `relrowsecurity` | false |
| `relforcerowsecurity` | false |
| policies | 0 |
| starting row count | **0** — matches quick-580 §7 |

Global with RLS off is consistent with the memory note listing `NotificationEmailConfig`
in the Section 4.12 RLS-advisor allowlist, and with `sender-config.ts` reading it outside
any tenant context.

### 1.5 Reported, not fixed — `app_user` has no grant here

Grants exist for `anon`, `authenticated`, `postgres` and `service_role`. **`app_user` has
none.** This is the exact shape of the `route_matrix_cache` hazard (quick-520): when RLS
Phase 2 flips `DATABASE_URL` to `app_user`, this read raises a permission error,
`resolveSenderConfig` catches it, and the sender **silently reverts to the env fallback** —
logged, but otherwise invisible, and `source` would read `'env'` again. Out of scope here;
recorded so the Phase 2 cutover has it on the list.

---

## 2. The migration

`apps/web/prisma/migrations/20260902120000_seed_notification_email_config/migration.sql`,
LF line endings, applied via Supabase MCP **`apply_migration`**.

```sql
INSERT INTO "NotificationEmailConfig"
  ("singletonKey", "fromName", "fromEmail", "replyTo", "createdAt", "updatedAt")
SELECT 'singleton', 'DriveCommand', 'team@drivecommand.app', 'team@drivecommand.io',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "NotificationEmailConfig");
```

The three values are byte-identical to `sender-config.ts`'s `FALLBACK_FROM_NAME` /
`FALLBACK_FROM_EMAIL` / `FALLBACK_REPLY_TO`. **That equality is the experiment**: the only
thing permitted to change is the reported `source`. Any other value would alter the
delivered message and prove less.

### 2.1 The row

```
id            86ec25c6-fbcf-4a91-b735-39e8441e7a7d
singletonKey  singleton
fromName      DriveCommand
fromEmail     team@drivecommand.app
replyTo       team@drivecommand.io
createdAt     2026-09-02 17:56:02.148516+00
updatedAt     2026-09-02 17:56:02.148516+00
```

Exactly **1** row. No leading or trailing whitespace on any of the three values
(`resolveSenderConfig` trims, so whitespace would be invisible in the send but wrong in
the row).

### 2.2 DEC-17 — `apply_migration` did NOT write `_prisma_migrations`

**This corrects a claim in CLAUDE.md.** DEC-17 currently reads *"`execute_sql` applies DDL
but does NOT write the `_prisma_migrations` row; `apply_migration` does both."* The second
half is false. Queried immediately after a successful `apply_migration`, the newest
`_prisma_migrations` row was still Phase 10's
`20260825140000_notification_push_channel_and_categories`. `apply_migration` records into
Supabase's own migration ledger, which is a **different table** from Prisma's.

The rule that held is the procedural one: **query the table and read the newest row back**,
rather than trusting either tool's description. Here the cost of missing it would not have
been the harmless case Phase 10 got away with — this is a seed `INSERT`, the exact shape
DEC-17 names as duplicating data on re-run. (`WHERE NOT EXISTS` is a second line of
defence, not the mechanism.)

The resolved row was therefore written by hand:

```
migration_name         20260902120000_seed_notification_email_config
checksum               f9f796197a8f90cc9a84575aa79aedcd47811dfd4974636b07a9065e543578ec
applied_steps_count    0
logs                   ''
started_at             2026-09-02 17:56:43.605008+00
finished_at            2026-09-02 17:56:43.605008+00   (start_eq_finish = true)
rolled_back_at         NULL
checksum_matches_disk  true
```

All four assertions pass: `applied_steps_count = 0`, non-null `finished_at`, `logs = ''`,
`started_at = finished_at`.

**The checksum method was validated before use, not assumed.** Hashing
`20260825140000_…`'s and `20260825120000_…`'s `migration.sql` over LF bytes reproduced
their stored checksums exactly, so the same computation was trusted for the new file.

**The convention is real, and confirmed in the data.** Across all 140 rows:

| `applied_steps_count` | rows | checksum `'manual'` | checksum SHA-256 |
|---|---|---|---|
| **0** (mirrored) | 19 | 0 | **19** |
| 1 (run by `migrate.mjs`) | 121 | 47 | 74 |

Every count-0 row carries a real hash and none carries `'manual'` — `migrate.mjs:68` writes
the literal `'manual'` with count `1`. The count-0/SHA-256 pairing is the signature that
distinguishes a mirrored row from an executed one, and it is preserved.

---

## 3. The verification send

Same convention as quick-580 §4: local code at the deployed commit, production database,
production Resend key, one disposable tenant, one OWNER user at `sammy.issa21@gmail.com`,
trigger `truck.maintenance_due` (its `defaultRecipients` is `[{role:OWNER},{role:MANAGER}]`,
so no subscription is needed), identical payload, no `dedupWindowMs`.

The trigger was re-checked as unchanged since quick-580: active, `defaultHtmlCache`
present, same `defaultRecipients`.

### 3.1 The resolved source — the whole point

```json
{ "fromName": "DriveCommand", "fromEmail": "team@drivecommand.app",
  "replyTo": "team@drivecommand.io",
  "from": "DriveCommand <team@drivecommand.app>", "source": "database" }
```

**`source` is now `database`.** The script asserts this *before* dispatching and exits
without sending if it reads `'env'`, so an env-path send could not silently consume the
experiment. A fresh `tsx` process starts with an empty 60-second cache and read the row on
the first call; the cache was never touched — no TTL edit, no `__clearSenderConfigCache()`.

`dispatchNotification` returned `{"sent":2,"skipped":0,"failed":0}`, with EMAIL and IN_APP
`NotificationSendLog` rows both `SENT`, `recipientEmail sammy.issa21@gmail.com`,
subject `Maintenance due for Unit 42`, `errorMessage` null.

### 3.2 Delivered headers, verbatim

```
List-Unsubscribe: <mailto:team@drivecommand.io?subject=Unsubscribe>,
 <https://drivecommand.app/settings/my-notifications>
From: DriveCommand <team@drivecommand.app>
To: sammy.issa21@gmail.com
Reply-To: team@drivecommand.io
Subject: Maintenance due for Unit 42
```

`multipart/alternative` with both `text/plain` and `text/html` parts, each
`quoted-printable`. `dkim=pass header.i=@drivecommand.app`, `spf=pass`, `dmarc=pass`.
Rendered HTML **8,857 bytes** — identical to quick-580's figure.

### 3.3 Byte-identity against quick-580

Compared line-by-line against the block quick-580 §4 recorded:

| header | quick-580 | quick-581 | identical? |
|---|---|---|---|
| `From` | `DriveCommand <team@drivecommand.app>` | `DriveCommand <team@drivecommand.app>` | **yes** |
| `Reply-To` | `team@drivecommand.io` | `team@drivecommand.io` | **yes** |
| `To` | `sammy.issa21@gmail.com` | same | yes |
| `Subject` | `Maintenance due for Unit 42` | same | yes |
| `List-Unsubscribe` (both lines) | mailto first, then prefs URL | same | yes |
| rendered HTML length | 8,857 | 8,857 | yes |
| **`source`** | **`env`** | **`database`** | **differs — this is the result** |

**All six delivered header lines are byte-identical. The only change is the reported
`source`.** That is exactly the intended outcome: the row and the fallback agree, so a
recipient cannot tell the two runs apart.

Per the plan, `List-Unsubscribe` is reported for completeness but is **not evidence about
the row** — `UNSUBSCRIBE_MAILTO` is a hardcoded constant in `unsubscribe.ts`, identical
either way. Only `From` and `Reply-To` carry signal, and both are sourced from
`resolveSenderConfig`.

### 3.4 One divergence found, explained, and eliminated

The **first** send came back with `http://localhost:3000` in both the List-Unsubscribe URL
and the logo `src`, and a rendered HTML length of **8,851** — six bytes short of
quick-580's 8,857.

Cause: `getAppBaseUrl()` reads `NEXT_PUBLIC_APP_URL`, which is **unset in `.env.local`**
and falls back to `http://localhost:3000`. quick-580 set it to the production value; the
first run here did not. The arithmetic matches exactly — `https://drivecommand.app` (24
chars) → `http://localhost:3000` (21), −3 bytes × 2 occurrences = **−6**.

This was an operator-environment difference, **not** a config-row difference: it cannot
touch `From` or `Reply-To`, which were already byte-identical on that first send. Rather
than argue that from the code, the run was repeated with
`NEXT_PUBLIC_APP_URL=https://drivecommand.app` — quick-580's exact conditions — which
returned `html_length=8857`, confirming the explanation by prediction. §3.2 and §3.3 report
that second, canonical send.

---

## 4. Teardown — confirmed by independent re-query

Two disposable tenants were created (the run was repeated per §3.4); the script deleted
each, children before the tenant, per quick-549.

Script counts, both runs identical: `{"sendLog":2,"inApp":1,"prefs":0,"subs":0,"user":1,"tenant":1}`.

Re-queried independently afterwards, not trusting those counts:

| check | result |
|---|---|
| tenants matching `zz-email-verify-%` | **0** |
| tenants matching `zz-email-verify-581-%` | **0** |
| users with `sammy.issa21@gmail.com` | **1** — back to the pre-task count |
| orphaned `in_app_notifications` (`org_id` with no Tenant) | **0** |
| **`NotificationEmailConfig` rows** | **1 — the row survived. It is the deliverable.** |
| `NotificationTemplate` rows | **47** — none created, modified or deleted |

### 4.1 987 orphaned `NotificationSendLog` rows — pre-existing, reported not fixed

The leftover sweep found 987 `NotificationSendLog` rows whose `tenantId` no longer matches
any `Tenant`. **None are from this task**: the newest is `2026-09-02 17:10:38`, before the
first send here at 17:58, and zero rows match this recipient in the last two hours.

The cause is structural — **`NotificationSendLog` has no foreign keys at all**
(`pg_constraint … contype='f'` returns zero rows), so `tenantId` is an unconstrained uuid
and deleting a tenant strands its send logs. The contrast is the useful part:
`in_app_notifications.org_id` **is** a real FK, which is why it shows 0 orphans and why
quick-549's teardown ordering matters for that table and not this one. Out of scope;
recorded.

---

## 5. What was NOT touched

- No file under `apps/web/src` modified — `git status` clean apart from the new migration
  directory and these planning docs. `sender-config.ts` is the thing under test and was
  read only.
- No template, no other table. `apply_migration` and one bookkeeping `execute_sql` were the
  only writes.
- `EMAIL_FOOTER_ADDRESS` still unset. The footer's CAN-SPAM gap remains quick-580's open
  item, deliberately not closed here.
- The throwaway script `apps/web/__prod-email-verify-581.ts` was deleted.
- `prisma generate` was required to run the script and it touched the tracked
  `src/generated/prisma/` output. `git diff --numstat` showed **zero content change** —
  line-ending normalisation only, the known `core.autocrlf=true` / no-`.gitattributes`
  condition — and the files were restored, leaving the tree clean.

## 6. Honest limits

- The send executed from **local code against the production database and Resend key**, as
  quick-580's did. It did **not** run inside the Vercel lambda. That still needs an
  HTTP-triggerable path, and this task was scoped to write no code.
- `source: 'database'` is now verified, but only for the **all-three-fields-present** case.
  The field-by-field fallback (a row with, say, a blank `replyTo` contributing only its
  `fromName`) remains unexercised. It is unit-tested in `transport.test.ts`; it has not
  been seen in production.

## Follow-ups worth recording

1. **DEC-17 in CLAUDE.md is wrong about `apply_migration`** and should be corrected — it
   writes Supabase's ledger only, never `_prisma_migrations`.
2. **`app_user` has no grant on `NotificationEmailConfig`** — silently reverts the sender to
   env under RLS Phase 2 (§1.5).
3. **987 orphaned `NotificationSendLog` rows** and the missing FK that allows them (§4.1).

---

## 7. Post-hoc: the `_prisma_migrations` blind-read hazard, and why §2.2 still holds

The plan was amended after execution with a sixth preflight finding worth keeping:
**`_prisma_migrations` has RLS ENABLED with zero policies** (migration
`20260328000001_enable_rls_prisma_migrations_and_tenant`) and is never FORCED. The owner
bypasses it; **any non-owner role gets zero rows on SELECT with no error.**

That is dangerous in one specific way for this task: a blind read makes the resolved row
look *absent*, the operator writes it, and now there are **two**. Same shape as quick-520's
`route_matrix_cache` (RLS on, no `app_user` grant, returns zero rows and silently stops
caching), and the same family as the tsc-blind-gate rule — when a check comes back empty,
first ask whether the check can see anything at all.

**§2.2's conclusion was not reached from an empty result and is therefore unaffected.** The
read that established "`apply_migration` did not write the row" returned *three real rows*,
the newest being Phase 10's `20260825140000_notification_push_channel_and_categories` — the
sentinel itself. Verified explicitly afterwards:

| check | result |
|---|---|
| `current_user` | **postgres** — the owner, which bypasses RLS |
| rows visible in `_prisma_migrations` | **141** |
| sentinel (Phase 10 row) visible | **1** |
| rows for `20260902120000_seed_notification_email_config` | **1** — exactly one, no duplicate |
| `NotificationEmailConfig` rows | **1** |

So the read was demonstrably sighted, and the resolved row was written once.

## 8. Consequence worth stating plainly

**From this row forward, the SysAdmin `NotificationEmailConfig` editing screen is live in
effect.** Before it, that screen wrote a row nothing read — finding 7 of
`docs/diagnostics/email-rendering-inventory.md`, and the reason quick-574 exists. Now an
edit there changes the `From` and `Reply-To` that every recipient sees, on the next send
after the 60-second cache expires.

That is the intended outcome of quick-574, not a side effect of this task — but it is the
**first moment it becomes true in production**, and it is worth knowing before someone
edits that screen casually. The specific hazard: `fromEmail` must stay on a
Resend-**verified** domain. `drivecommand.app` is verified; `drivecommand.io` is not, so
setting `fromEmail` to an `@drivecommand.io` address makes every send fail with a 550.
`replyTo` on `drivecommand.io` is fine and is what the row uses.
