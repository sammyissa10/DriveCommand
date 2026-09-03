# `app_user` Grant Coverage Audit

**Date:** 2026-09-02 · **Task:** quick-582 · **Type:** read-only diagnostic
**Project:** Supabase `oqdhberkghtnszrkdvfm` (Postgres 17.6)

Triggered by quick-581 §1.5 (`NotificationEmailConfig` has no grant to `app_user`) and
quick-520 (`route_matrix_cache`, same shape). The question this answers: **how many tables
are affected, and which code degrades silently rather than failing loudly, the moment
`DATABASE_URL` points at `app_user`.**

Nothing was granted, revoked, altered or created. No connection string was changed.

---

## 0. The connected role — read this before trusting anything below

| | |
|---|---|
| `current_user` / `session_user` | **`postgres`** |
| `current_setting('is_superuser')` | `off` |
| `rolbypassrls` on `postgres` | **`true`** |
| role memberships | `pg_read_all_data`, `pg_monitor`, `anon`, `authenticated`, `service_role`, `authenticator`, `app_user`, … |

**This connection bypasses RLS.** That is precisely what makes class (b) and class (c)
tables look healthy today, and it is why this audit had to be done through the catalogue
rather than by reading rows. Every defect below is invisible from this connection and
becomes live the instant the app connects as `app_user`.

### `app_user` itself

| attribute | value | consequence |
|---|---|---|
| exists | **yes** | the cutover target is real |
| `rolsuper` | `false` | no superuser escape |
| `rolbypassrls` | **`false`** | **RLS and FORCE RLS both apply to it** |
| `rolcanlogin` | `true` | usable as a connection role |
| `rolinherit` | `true` | but… |
| member of | **`{}` — nothing** | it inherits no privileges from any other role |

Because `app_user` belongs to no role, a privilege reaches it only by a **direct grant** or
a grant to `PUBLIC`. That makes `has_table_privilege('app_user', …)` both authoritative and
unambiguous here.

### Method

`has_table_privilege('app_user', c.oid, 'SELECT'|'INSERT'|'UPDATE'|'DELETE')` joined against
`pg_class`/`pg_namespace`, **not** `information_schema.role_table_grants`. Two reasons:

1. `role_table_grants` shows only grants the *current* role can see and misses privileges
   reaching a role indirectly. `has_table_privilege` answers the question the runtime will
   actually ask.
2. Identifiers are resolved by `pg_class.oid`, never by casting a string to `regclass`. This
   database mixes **PascalCase** (older Prisma models — `"NotificationTemplate"`, `"Plan"`)
   with **snake_case** (carrier models — `stops`, `route_matrix_cache`), and quick-581 §1.1
   already lost a query to exactly that (`'notification_email_config'::regclass` →
   relation-does-not-exist). Joining on `oid` makes the quoting question disappear.

Cross-checked with `aclexplode` to separate a direct grant from a `PUBLIC` grant, which
`has_table_privilege` alone cannot distinguish: **89 tables granted directly to `app_user`,
0 via `PUBLIC`.** The two methods agree exactly.

Scope: `relkind IN ('r','p')` — ordinary and partitioned tables. There are **0 partitioned
tables**.

---

## 1–2. The grant matrix

**98 tables in `public`.**

| category | count |
|---|---|
| **Full CRUD** (SELECT+INSERT+UPDATE+DELETE) | **89** |
| **Partial** (some but not all) | **0** |
| **Zero grants** | **9** |

There is no partial case. The split is perfectly binary, which is itself the clue to the
cause (§2.1).

### The 9 tables with zero grants

Sorted with the ungranted first, as required — they are the entire non-full set.

| table | SELECT | INSERT | UPDATE | DELETE | RLS | FORCE | policies | classes |
|---|---|---|---|---|---|---|---|---|
| `_prisma_migrations` | ✗ | ✗ | ✗ | ✗ | **on** | off | **0** | **(a) + (c)** |
| `"NotificationEmailConfig"` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |
| `"NotificationTemplate"` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |
| `"Plan"` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |
| `"Promo"` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |
| `carrier_catalog_meta` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |
| `grid_preference` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |
| `grid_view` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |
| `route_matrix_cache` | ✗ | ✗ | ✗ | ✗ | off | off | 0 | (a) |

The remaining **89 tables all hold full CRUD** and are not listed individually; the
interesting set is above.

### 2.1 Why these nine — the correlation is exact

| RLS enabled | granted to `app_user` | tables |
|---|---|---|
| `false` | `false` | **8** |
| `true` | `false` | **1** (`_prisma_migrations`) |
| `true` | `true` | **89** |
| `false` | **`true`** | **0** |

**Not one table has RLS off and a grant.** The quick-419 sweep that granted "all 83 tables"
was driven off the *RLS-enabled* table list, so **exempting a table from RLS silently
exempted it from grants.** Seven of the eight are precisely the Section 4.12 RLS-advisor
allowlist recorded in project memory — `Plan`, `Promo`, `carrier_catalog_meta`,
`NotificationTemplate`, `NotificationEmailConfig`, `grid_preference`, `grid_view` — and the
eighth, `route_matrix_cache`, was created later (Phase 7 / quick-520) and inherited the same
coupling.

That coupling is the actual defect. Neither quick-520 nor quick-581 could see it, because
each found a single table and reported it as a one-off. It is not a one-off: it is a rule
that will keep producing them (§5).

`_prisma_migrations` is the lone case in the other direction — RLS was switched on by
`20260328000001_enable_rls_prisma_migrations_and_tenant`, which ran outside the grant sweep,
so it received neither a grant nor a policy.

---

## 3. The three defect classes

Counts computed over **all 98 tables**, not only the ungranted ones — a full grant does not
rescue a table whose FORCE RLS has no policy.

| class | meaning | count |
|---|---|---|
| **(a)** | missing or partial grant to `app_user` | **9** |
| **(b)** | FORCE RLS enabled, **zero policies** | **3** |
| **(c)** | RLS enabled, zero policies, **not** forced | **1** |

`_prisma_migrations` is in both (a) and (c). Total distinct affected tables: **12**.

### Class (b) — 3 tables, and this is worse than the grant gap

| table | grants | RLS | FORCE | policies |
|---|---|---|---|---|
| **`stops`** | full CRUD | on | **on** | **0** |
| **`route_template_stops`** | full CRUD | on | **on** | **0** |
| **`carrier_documents`** | full CRUD | on | **on** | **0** |

Confirmed against both `pg_policy` (catalogue) and `pg_policies` (view); they agree. For
contrast, `facilities` in the same family has FORCE RLS **and 2 policies**, so the tooling
is reading correctly and these three genuinely have none.

Their grants are perfect, which is exactly why a grant-only audit would have missed them.
FORCE RLS with zero policies means **no row passes**: `SELECT` returns zero rows *with no
error*, and every `INSERT`/`UPDATE`/`DELETE` fails with a row-level-security violation. The
table owner is `postgres`, and FORCE applies to the owner too — only `postgres`'s
`BYPASSRLS` attribute is hiding this today.

Project memory records these three as having had broken `auth.jwt()` policies *rewritten* to
join-based `current_tenant_id()` expressions. **The rewrite is not present in the database.**
The old policies were dropped and the replacements never landed, leaving FORCE on with
nothing to satisfy it.

### Class (c) — 1 table

`_prisma_migrations`: RLS on, not forced, zero policies, no grant. To the owner it looks
perfectly normal. To any other role it returns **zero rows with no error** — indistinguishable
from "the table is empty". quick-581 §7 hit this and it is why step 8 below exists.

---

## 4. Sequences — a non-issue, structurally

**There are 0 sequences in the `public` schema.** Not "all granted" — none exist.

Every model keys on `gen_random_uuid()` rather than `serial`/`bigserial`, so there is no
sequence for an insert to depend on and the "grants look correct but inserts fail" failure
mode named in the brief **cannot occur here**. This risk can be struck from the cutover plan
rather than carried as an unknown.

---

## 5. Default privileges — the fix is ongoing, not one-time

`pg_default_acl` for schema `public`:

| granting role | object type | default grantees |
|---|---|---|
| `postgres` | table | `postgres`, `anon`, `authenticated`, `service_role` |
| `postgres` | sequence | `postgres`, `anon`, `authenticated`, `service_role` |
| `postgres` | function | `postgres`, `anon`, `authenticated`, `service_role` |
| `supabase_admin` | table / sequence / function | `postgres`, `anon`, `authenticated`, `service_role` |

**`app_user` appears in none of them.**

So **every table created from now on acquires this defect by default.** A one-time
`GRANT … ON ALL TABLES` fixes today's nine and leaves the mechanism intact; the next
migration re-opens it, exactly as `route_matrix_cache` did after quick-419. Closing it
permanently requires `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT … TO app_user`
alongside the catch-up grant. **Both halves, or this audit gets repeated in six months.**

---

## 6. Silent-fallback inventory

### How the search was run (so coverage is auditable)

Over `apps/web/src`, excluding `__tests__` and `src/generated`:

- `\.catch\(\(\)\s*=>` — **266 sites**
- `^\s*(return|=>)\s*(\[\]|null|\{\})` — 86 further candidate sites
- targeted reads of each affected table by Prisma model accessor
- nested relation reads: `^\s*stops:\s*\{` — 34 sites

`apps/mobile` was excluded: it reaches the database only through `/api/mobile/*` on the web
app, so it inherits these failures rather than owning any.

**The 266 figure is not the finding.** The overwhelming majority read fully-granted tables
and are unaffected by the cutover. What matters is the intersection with the 12 affected
tables, below.

### The critical distinction

The two shapes fail differently, and the difference decides whether you find out:

- **Class (a)** — missing grant → the query **throws** `permission denied for table X`.
  Loud *unless* a catch swallows it.
- **Classes (b) and (c)** — policy-less RLS → the query **returns zero rows, no exception**.
  Silent *always*, and no catch block is ever entered. A `try/catch` cannot help here; there
  is nothing to catch.

### Inventory

| # | file:line | table | class | shape | degrades to |
|---|---|---|---|---|---|
| 1 | `lib/notifications/dispatcher.ts:87` (throw caught at **:626**) | `NotificationTemplate` | (a) | caught exception | `failed++`, `console.error`, **returns normally** |
| 2 | `lib/email/sender-config.ts:~135` | `NotificationEmailConfig` | (a) | caught exception | env fallback, `source:'env'` (quick-581) |
| 3 | `lib/document-import/optimisation-matrix.ts:~173–194` | `route_matrix_cache` | (a) | caught exception → `return null` | treated as **cache miss** → paid provider call every time (quick-520) |
| 4 | `app/api/user/grid-preferences/[gridId]/route.ts:49` | `grid_preference` | (a) | throws (uncaught) | 500 — **loud**, see note |
| 5 | `app/api/user/grid-views/[gridId]/route.ts:30` | `grid_view` | (a) | throws (uncaught) | 500 — loud |
| 6 | `app/(owner)/actions/my-notifications.ts:65` | `NotificationTemplate` | (a) | throws (uncaught) | 500 — loud |
| 7 | `app/(owner)/actions/tenant-notification-settings.ts:145,187,307,397` | `NotificationTemplate` | (a) | throws (uncaught) | 500 — loud |
| 8 | `app/(admin)/actions/notifications.ts:33,130,169` | `NotificationTemplate`, `NotificationEmailConfig` | (a) | throws (uncaught) | 500 — loud |
| 9 | `app/(admin)/actions/plans.ts:16,21` · `promos.ts:16` | `Plan`, `Promo` | (a) | throws (uncaught) | 500 — loud |
| 10 | **~50 sites** on `CarrierStop` — 16 direct reads, 8 writes, 34 nested `stops: { … }` includes | `stops` | **(b)** | **zero rows, no error** | **every trip renders with no stops**; writes fail loudly |
| 11 | 2 sites on `RouteTemplateStop` | `route_template_stops` | **(b)** | zero rows, no error | templates render with no stops |
| 12 | 2 sites on `CarrierDocument` | `carrier_documents` | **(b)** | zero rows, no error | documents vanish from the UI |
| 13 | `apps/web/scripts/migrate.mjs:38` | `_prisma_migrations` | **(a)+(c)** | zero rows, no error | **every migration looks unapplied → re-runs** |

**Note on #4–#9:** these are class (a) with no catch, so they fail *loudly* with a 500. They
are listed because they are cutover breakage, but they are the **good** case — a 500 gets
noticed and fixed. They are not silent-degradation risks.

---

## 7. Cross-reference — what actually degrades silently on cutover day

Filtering the inventory to sites that will produce **wrong output rather than an error**:

| # | site | table | class | why it is silent |
|---|---|---|---|---|
| **1** | `dispatcher.ts:87` → outer catch `:626` | `NotificationTemplate` | (a) | catch logs to console, sets `failed++`, **returns `{sent,skipped,failed}` and never rethrows** |
| **2** | `sender-config.ts` | `NotificationEmailConfig` | (a) | designed never to throw; falls back to env |
| **3** | `optimisation-matrix.ts` | `route_matrix_cache` | (a) | catch → `null` → indistinguishable from a cache miss |
| **10** | ~50 `CarrierStop` sites | `stops` | **(b)** | policy-less FORCE returns empty; **no exception exists to catch** |
| **11** | `RouteTemplateStop` | `route_template_stops` | (b) | as above |
| **12** | `CarrierDocument` | `carrier_documents` | (b) | as above |
| **13** | `migrate.mjs:38` | `_prisma_migrations` | (a)+(c) | as above — and see below |

### The worst of these, in order

**`dispatcher.ts` is the highest-severity *silent* site.** Its outer catch was written to stop
one bad notification killing a request; on cutover it catches `permission denied for table
NotificationTemplate` on **every** trigger, logs to `console.error`, and returns a normal
result object. All 47 triggers — email, in-app and push — stop delivering, and every caller
that ignores the return value sees success. Worse, the audit trail that would reveal it is
also absent: the failure happens *before* any audit row is pushed, so the `finally` block
writes an empty array. Nothing in `NotificationSendLog`, nothing in `InAppNotification`, one
console line. This is quick-548's lesson at system scale — *the notification tables cannot
distinguish "never ran" from "ran and failed"*.

**`migrate.mjs:38` is the most dangerous single line in the repo on cutover day.** It reads
`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL` and skips any
migration already listed. `_prisma_migrations` is class (a)+(c): to `app_user` that query
returns **zero rows with no error**, so *every* migration appears unapplied and the runner
re-executes all 141 from the beginning. Idempotent `IF NOT EXISTS` DDL survives that; a seed
`INSERT` does not. This is precisely the hazard quick-581 §7 identified and step 8 records.

---

## 8. DEC-17 correction — the diff

**Before** (`CLAUDE.md:398`, opening claim):

> **DEC-17 — `execute_sql` applies DDL but does NOT write the `_prisma_migrations` row;
> `apply_migration` does both.**

**After:** rewritten to state what quick-581 actually observed — `apply_migration` writes
Supabase's *own* migration ledger, a different table from Prisma's, so **neither** MCP tool
writes `_prisma_migrations` and the resolved-not-run row must always be written by hand. The
procedural rule that caught it is kept verbatim ("query the table and read the newest row
back"), and the two practical consequences are added: a seed `INSERT` with no mirrored row
re-runs and duplicates, and `_prisma_migrations` is itself a class (c) table, so a read-back
from a non-owner role returns zero rows and looks identical to "the row was never written" —
which would prompt a *duplicate* write. No other entry was touched.

---

## Assessment

**This is a multi-session effort, not a single migration.** The grant half is genuinely
small — nine `GRANT` statements plus an `ALTER DEFAULT PRIVILEGES` to stop the tenth
appearing, and the absence of sequences removes a whole category of risk. That part is one
migration and perhaps an hour. What makes it multi-session is everything the grant audit
*uncovered*: three core carrier tables are running FORCE RLS with zero policies, meaning the
tenant-isolation policies that project memory records as "rewritten" do not exist in the
database and must be authored, reviewed and tested against real tenant data before `app_user`
can be allowed near them. Separately, the silent-fallback sites need to fail loudly *before*
the cutover, not after: `dispatcher.ts`'s outer catch and `migrate.mjs`'s skip query both
convert a permission error into confident-looking success, and flipping `DATABASE_URL` while
those stand means the first symptom is a customer asking why they stopped getting email.
Sequence the work as: policies for the three class (b) tables → make the seven silent sites
loud → grants and default privileges → cutover behind a staging verification as `app_user`.

**Single highest-risk table: `stops`.** It is the only affected table that is both
operationally central and silent in the read direction. It holds the running order of every
trip; it is FORCE RLS with zero policies, so `app_user` reads it as empty with no exception
anywhere to catch; and it has roughly fifty access sites, thirty-four of them nested relation
includes that no grep for a table name would surface. Its writes fail loudly while its reads
lie quietly, which is the worst possible combination — the dispatcher sees an itinerary with
no stops and cannot tell whether the trip is genuinely empty or the database just refused to
answer. `NotificationTemplate` is a close second on blast radius, but a fleet that cannot see
its own stops outranks a fleet that stops getting email.
