---
phase: quick-615
plan: 01
subsystem: database / connection routing
tags: [rls, app_user-cutover, admin-connection, grants, auth-schema, tripwire]
requires: [quick-600, quick-602, quick-606, quick-610, quick-612, quick-613, quick-614]
provides:
  - "44 sysadmin/cron statements on getAdminDb, 3 on getTenantPrismaForOrg, 1 fixed by a grant"
  - "the measured app_admin grant delta (5 tables, 6 privileges)"
  - "public.auth_user_display(uuid[]) — a narrow SECURITY DEFINER replacement for a direct auth.users read"
  - "scripts/audit/615-routing-verify.ts — a --grants/--before/--apply/--after instrument"
affects:
  - "the app_user cutover: the sysadmin portal and the automations cron no longer break at it"
tech-stack:
  added: []
  patterns: ["per-FILE both-directions probe matrix", "definer function in place of a schema grant"]
key-files:
  created:
    - apps/web/prisma/migrations/20260915160000_grant_cutover_routing_tables_to_app_admin/migration.sql
    - apps/web/prisma/migrations/20260915170000_auth_user_display_definer_function/migration.sql
    - apps/web/scripts/audit/615-routing-verify.ts
  modified:
    - apps/web/src/app/(admin)/actions/tenants.ts
    - apps/web/src/app/(admin)/actions/notifications.ts
    - apps/web/src/app/(admin)/actions/users.ts
    - apps/web/src/app/(admin)/admin-support/page.tsx
    - apps/web/src/app/(admin)/tenants/[id]/page.tsx
    - apps/web/src/app/(admin)/tenants/[id]/activation-progress-section.tsx
    - apps/web/src/app/(admin)/tenants/[id]/automation-runs-section.tsx
    - apps/web/src/actions/support-tickets.ts
    - apps/web/src/app/api/cron/auto-close-tickets/route.ts
    - apps/web/src/app/api/cron/automations/route.ts
    - apps/web/src/lib/automations/evaluator.ts
    - apps/web/src/lib/db/admin-reasons.ts
    - apps/web/tests/security/admin-connection-allowlist.test.ts
    - apps/web/tests/cron/automations.test.ts
    - apps/web/scripts/audit/wrapper-countdown.json
decisions:
  - "48 -> 47: sysadmin-invoices.ts:83 is a type query, not a runtime statement"
  - "the TENANT class is exactly three statements; eleven more hold a tenantId and are ADMIN, argued per statement"
  - "the auth.users column grant is IMPOSSIBLE from the migrating role — a SECURITY DEFINER function instead"
  - "ONE tenant acquisition per cron candidate, inside the try — the plan's double acquisition broke quick-603's contract"
metrics:
  statements_addressed: 49
  routed_admin: 44
  routed_tenant: 3
  fixed_by_grant: 1
  not_a_statement: 1
  allowlist: "23 -> 31 entries, 48 -> 66 calls"
  probe_cells: 56
---

# quick-615: Route the unscoped statements that break at the `app_user` cutover — Summary

Routed 47 statements off the tenant-context-free client — 44 to `getAdminDb`,
3 to `getTenantPrismaForOrg` — shipped the measured 5-table `app_admin` grant
delta, replaced a direct `auth.users` read with a narrow `SECURITY DEFINER`
function after the intended column grant was **measured to be a silent no-op**,
and proved all of it per FILE in both directions on staging with the tripwire
armed.

---

## §1 — Step 1: the 48 re-verified, and the arithmetic

`git log 51f683eb..HEAD` over every blocker path is **EMPTY** — printed, not
assumed. Every one of the 48 lines was then individually re-read from current
source. The verdicts:

| verdict | count |
|---|---|
| `PRESENT` — still names the statement the audit says it does | **48** |
| `MOVED` | 0 |
| `ALREADY ROUTED` | 0 |
| `NOT A RUNTIME STATEMENT` | **1** |

### The arithmetic, stated so it does not look broken

The brief says "48". 614 §7 counts **48 UNFLAGGED TC001 statements** and counts
`support-tickets.ts:292` **separately** as "blocker statements of a DIFFERENT
class (`42501`, not `TC001`) — 1". So:

> **48 TC001 + 1 GRANT = 49 input statements.** The GRANT one is the 49th, not a
> 49th TC001.

### CORRECTION to 614 §2.1 — B-2 is not a statement

`app/(admin)/actions/sysadmin-invoices.ts:83`, read in full:

```ts
}): Promise<{ success: true; invoice: Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>> } | { success: false; error: string }> {
```

`typeof X` in **type position** never evaluates `X`. The annotation is erased by
the compiler and emits no JavaScript, let alone SQL. The file's only other
`prisma.` hit (line 26) is a comment, and it holds 10 `getAdminDb` calls.

**Remedy: NOTHING.** The annotation stays, the `prisma` import stays (the type
still needs it). Corrected counts:

| | 614 said | measured |
|---|---|---|
| runtime TC001 statements | 48 | **47** |
| §2.1 (sysadmin) | 36 | **35** |
| cutover blocker **files** | 12 | **11** |
| total addressed (TC001 + GRANT) | 49 | **48** |

This is the error class 614 itself warned about — a file-level marker is not a
verdict. It read the file, found one `prisma.` hit not on `getAdminDb`, and did
not read what kind of line it was.

Full per-statement record: `evidence/01-reverification.md`,
`evidence/01-classification.json`.

---

## §2 — The classification

| class | statements | receiver |
|---|---|---|
| **ADMIN** | **44** | `getAdminDb(reason)` |
| **TENANT** | **3** | `getTenantPrismaForOrg(tenantId)`, no `userId` |
| **GRANT** | **1** | receiver unchanged in kind; the fix is a privilege |
| **NOT A RUNTIME STATEMENT** | **1** | nothing |
| **STOP-AND-REPORT** | **0** | — |

### Per file

`swap` = the statement moves onto an admin client **already in scope** — no new
call, no new reason, no allowlist change.

| file | stmts | ADMIN | TENANT | GRANT | new `getAdminDb(` | swaps | new reasons | new to allowlist |
|---|---|---|---|---|---|---|---|---|
| `(admin)/actions/notifications.ts` | 9 | 9 | 0 | 0 | 2 | 0 | 2 | **YES** |
| `(admin)/actions/sysadmin-invoices.ts` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | already on |
| `(admin)/actions/tenants.ts` | 14 | 14 | 0 | 0 | 5 | **3** | 4 (+1 reused) | 7 → 12 |
| `(admin)/actions/users.ts` | 5 | 5 | 0 | 0 | 2 | 0 | 2 | **YES** |
| `(admin)/admin-support/page.tsx` | 1 | 1 | 0 | 0 | 1 | 0 | 0 (reused) | **YES** |
| `(admin)/tenants/[id]/activation-progress-section.tsx` | 1 | 1 | 0 | 0 | 1 | 0 | 1 | **YES** |
| `(admin)/tenants/[id]/automation-runs-section.tsx` | 1 | 1 | 0 | 0 | 1 | 0 | 1 | **YES** |
| `(admin)/tenants/[id]/page.tsx` | 1 | 1 | 0 | 0 | 1 | 0 | 1 | **YES** |
| `actions/support-tickets.ts` | 4 | 3 | 0 | 1 | 1 | 0 | 1 | 3 → 4 |
| `api/cron/auto-close-tickets/route.ts` | 1 | 1 | 0 | 0 | 1 | 0 | 0 (reused) | 1 → 2 |
| `api/cron/automations/route.ts` | 7 | 5 | 2 | 0 | 2 | 0 | 1 | **YES** |
| `lib/automations/evaluator.ts` | 4 | 3 | 1 | 0 | 1 | 0 | 1 | **YES** |
| **total** | **49** | **44** | **3** | **1** | **18** | **3** | **14 new, 2 reused** | **8 new files** |

### The boundary, because eleven statements sit near it

Eleven ADMIN statements hold a `tenantId` **as an argument or a prop**. The rule
applied, once and consistently:

> A statement is **TENANT** when the path is doing per-tenant work *inside that
> tenant's turn* — a cron loop iterating tenants, an evaluator handling one
> tenant's event — and the code **already** uses `getTenantPrismaForOrg` for an
> adjacent statement in the same loop body. A tenant client is *demonstrably*
> the right receiver; it is right there.
>
> A statement is **ADMIN** when the path is a **sysadmin surface administering an
> arbitrary tenant**: the operator is not in the tenant, the request carries no
> tenant, the `tenantId` merely *selects which tenant to administer*, and the
> adjacent statements in the same unit of work are already on `getAdminDb`
> because no tenant client could serve them (`tenant.create`, `tenant.update` —
> `tenant_self_read`/`tenant_self_update` are `id = current_tenant_id()` with no
> second branch).

The cost of getting it wrong in the ADMIN direction is concrete, not aesthetic:
`getTenantPrismaForOrg` writes a **session-scope** GUC on the `max: 1` tenant
pool, so calling it from a sysadmin server action would leave the shared pooled
connection carrying an arbitrary customer's tenant id — inherited by any later
bare statement (quick-602), and sysadmin request paths are exactly where bare
statements still live after this task.

**The three TENANT members are `cron/automations:187`, `:198` and
`evaluator.ts:80`** — in all three the next statement in the same loop body is
already `await getTenantPrismaForOrg(tenantId)`.

**Zero STOP-AND-REPORT statements at classification time.** The two candidates
that came closest (`tenants.ts:472`, `users.ts:102`) have **no tenant at all** —
their functions take `(userId, …)` — so they are ADMIN for a stronger reason
than the boundary.

---

## §3 — Why `tenants.ts` was only partly routed, from primary sources

1. **The routing commit is `0c08a959 feat(600-02)` — quick-600.** Not a later
   partial pass; nothing has touched the file's routing since.
2. **All seven of its acquisitions are MUTATIONS**: tenant create, status change
   ×2, profile update, settings update, trial extension, tenant delete. Seven
   writes, zero reads. The 14 survivors are 12 reads plus one
   `driverInvitation.create` and one `user.update` riding inside read-shaped
   functions.
3. **The candidate set was a DESIGN-DOC CENSUS, not a file sweep.**
   `ROUTING-MANIFEST.md`, verbatim: *"Every candidate
   `bypass-replacement-design.md` names, plus the two the design doc's own
   snapshot missed"*, and in §2: *"B5 does not claim to have found every site,
   only to have routed the ones this task's candidate set names."*
4. **It pre-reported one of the 14 by name.** Also verbatim: *"`createTenant`
   (`:98`) also creates a `DriverInvitation` two statements later (today's
   `:123`) … Left untouched — reported, not silently expanded into. It will
   break at the `app_user` cutover exactly like its neighbours."* That is
   B-3/:123, with the failure mode predicted correctly.
5. **The sharpest evidence:** `:191` acquires `adminDbSuspend`, `:192` uses it,
   and **`:198`** issues `prisma.user.findMany` on the bare client — *seven lines
   below an admin client still in scope*. `reactivateTenant` (`:232`/`:239`) is
   identical. A file sweep cannot produce that shape; a one-statement-per-named-
   candidate census can and did.

> **A documented scope boundary, stated twice in its own manifest, with one
> survivor named in advance. Not carelessness.**

**And that does not make the 14 ADMIN.** Each carries its own verdict in §4 of
`01-reverification.md`, reached by §2's rule. Three of them are receiver swaps
onto a client already in scope; eleven needed a new acquisition.

---

## §4 — What was routed where

**44 ADMIN statements** onto `getAdminDb`, with **14 new `AdminReason`
members**, one per unit of work, plus two reused:

| reason | what it serves |
|---|---|
| `sysadmin tenant listing` *(reused)* | `getAllTenants`, and the support page's tenant filter |
| `sysadmin platform metrics` | `getSystemMetrics` — 4 counts, one `Promise.all` |
| `sysadmin tenant detail read` | `getTenantById` |
| `sysadmin owner invitation resend` | `resendOwnerInvitation` — read, find, update |
| `sysadmin owner email change` | `updateOwnerEmail` — read then update |
| `sysadmin user listing` | `getAllUsers` |
| `sysadmin user profile update` | `updateUserProfile` — read / write / **rollback** / re-read |
| `sysadmin notification send log listing` | the send-log list+count pair |
| `sysadmin notification delivery statistics` | the 7-way statistics `Promise.all` |
| `sysadmin tenant activation progress read` | the tenant-detail activation panel |
| `sysadmin tenant automation run list` | the tenant-detail run list (614 B-7's asymmetry) |
| `sysadmin tenant billing summary read` | the tenant-detail trial date |
| `sysadmin ticket listing` | `getAllTickets` — the scan and all three joins |
| `auto-close stale ticket sweep` *(reused)* | the cron's read half |
| `automation cron candidate sweep` | the 4 candidate sweeps + the rule lookup |
| `automation evaluator scan` | `runEvaluator`'s 3 all-tenant reads |

**3 TENANT statements** onto `getTenantPrismaForOrg(tenantId)` with **no
`userId`** — passing one would forward `session.userId` into the audit-columns
extension and start writing `createdById`/`updatedById`, a behaviour change
wearing a routing fix's clothes (quick-610).

**3 receiver swaps minting nothing**: `tenants.ts:123` under `adminDb`, `:198`
under `adminDbSuspend`, `:239` under `adminDbReactivate`.

**Deliberately NOT routed, and named as not routed in the code:** the eight
RLS-OFF `NotificationTemplate`/`NotificationEmailConfig` statements (`app_user`
holds full DML; nothing raises), the seven bypass-flagged blocks in
`support-tickets.ts`, `evaluator.ts:95-96`, `support-tickets.ts:563`, B7/B8,
`plans.ts` ×4, `promos.ts` ×2.

**Only the receiver changed.** No `select`, `where`, `include`, `orderBy`,
`take`, `revalidatePath`, error handling or return value moved — proven by a
grep over the diff of every routed file. The **one** exception is
`support-tickets.ts:292`, §5.

### Two false comments corrected rather than left standing

- `support-tickets.ts:240-242` said *"raw SQL bypasses RLS entirely … SupportTicket
  has no RLS so this is safe for cross-tenant admin access."* **Both sentences
  false**: the policy is applied by the planner whatever route the statement
  took, and `SupportTicket` carries `tenant_isolation_policy` (614 §6, measured).
  The original text is preserved in the replacement, because it is *why* this was
  never routed. Same family as quick-610's `NotificationSendLog` comment.
- `users.ts` said *"uses bare Prisma client … intentional cross-tenant read"*.
  The intent was right and the mechanism was not.

### Reported and NOT fixed

`tenants/[id]/page.tsx:56` ends in `.catch(() => null)`, so before this change a
`TC001` rendered as "no trial" rather than as an error — the `/dashboard` swallow
shape quick-610 measured. Out of a receiver-only task's scope; named in the code.

---

## §5 — The grants, and the `auth.users` decision

### The delta, measured against the LIVE catalog

| table | needed | `app_admin` held | **missing** |
|---|---|---|---|
| `ActivationProgress` | SELECT | *(none)* | **SELECT** |
| `DriverInvitation` | SELECT, INSERT, UPDATE | SELECT | **INSERT, UPDATE** |
| `NotificationSendLog` | SELECT | *(none)* | **SELECT** |
| `Route` | SELECT | *(none)* | **SELECT** |
| `User` | SELECT, UPDATE | SELECT | **UPDATE** |

Nine further tables (`AppEvent`, `AutomationRule`, `AutomationRun`, `Load`,
`Subscription`, `SupportTicket`, `Tenant`, `TicketMessage`, `Truck`) were already
sufficient. Six privileges, five tables, one role —
`20260915160000_grant_cutover_routing_tables_to_app_admin`.

**Proven mandatory**, `--before` → `--after`, same probe, same connection:

| statement | BEFORE | AFTER |
|---|---|---|
| `NotificationSendLog` scan | `42501 permission denied for table NotificationSendLog` | `send_log_rows = 18` |
| `Tenant` + `_count{User,Truck,Route}` | `42501 permission denied for table Route` | `tenants=2 · users=10 · trucks=2 · routes=2` |
| `DriverInvitation` INSERT / UPDATE | `42501` | `1 row(s) affected` each |
| `User` UPDATE | `42501` | `1 row(s) affected` |
| `ActivationProgress` read | `42501` | `n = 1` |

**`Route` is the one nothing predicted.** It appears in no `prisma.<model>.` grep
of `tenants.ts`, and 614's table column does not list it. It is reached only
through `_count: { select: { users, trucks, routes } }`, which Prisma emits as
real correlated sub-selects. **A `_count` is a statement against another table.**
`Truck` is on the list for the same reason and happened to be granted already.

### CORRECTION — `admin-connection.md` §2's list is STALE, and CLAUDE.md repeats it

§2's 17-table list omits `AutomationRule` (quick-613 added it),
`ActivationProgress`, `NotificationSendLog` and `Route`, and understates
`DriverInvitation` and `User` as SELECT-only. **CLAUDE.md's quick-600 entry and
the brief for this task both repeat it.** The authority is
`information_schema.role_table_grants`; `615-routing-verify.ts --grants` prints
the live delta on demand, so the next task has an instrument rather than a list.

### `auth.users` — THE REVERSAL

Measured first: `auth.users` has RLS enabled with **0 policies** and 9 rows;
zero grants in schema `auth` for `app_user`, `app_admin` or `PUBLIC`;
`has_schema_privilege(…, 'auth', 'USAGE')` **false** for both roles. So it fails
**`42501`, never `TC001`**, and the tripwire can never signal it. And
`getAdminDb` does not fix it — `app_admin` bypasses RLS but holds no `auth`
privilege either, which `--before` shows: `42501` on **both** connections.

The intended remedy was a **column-level grant** on the three columns the
statement already reads, preceded by the required `USAGE ON SCHEMA auth`. It was
written, applied to staging — and **half of it did nothing**:

```
has_schema_privilege('app_admin','auth','USAGE') AFTER = false
auth column grants AFTER: app_admin -> auth.users.{id,email,raw_user_meta_data} : SELECT
```

Re-issued with the notice channel attached, the reason is verbatim:

```
WARNING:  no privileges were granted for "auth"
```

**A WARNING, not an ERROR** — the transaction committed, the migration
"succeeded", and the catalog showed three column privileges that could not be
exercised. `pg_namespace.nspacl` gives `postgres` — the role every migration here
runs as — `U` **without GRANT OPTION**, and `rolsuper = false`; it cannot borrow
the owner's authority either (`SET ROLE supabase_admin` → `42501`, measured; it
is not a member). The column grant landed for the mirror-image reason: `postgres`
holds `ar*wdDxtm` on `auth.users`, SELECT **with** grant option.

> **A column grant on a schema the grantee cannot enter is a privilege that reads
> correctly in the catalog and cannot be exercised.** Only the both-directions
> matrix could catch it — the `--after` lane would have shown `42501` on a
> statement whose grant the same report listed as present.

So the alternative that migration's own header **stated and rejected** becomes
the choice. Three options, measured not argued:

| # | option | verdict |
|---|---|---|
| 1 | column grant + schema USAGE | **IMPOSSIBLE** from the migrating role |
| 2 | `GRANT authenticated TO app_admin` (that role holds `U` on `auth`) | **REFUSED** — it would work, and hand `app_admin` everything that role can do, for ever, for three display columns. `admin-connection.md` §2 excludes role membership by name |
| 3 | `SECURITY DEFINER` function in `public` | **CHOSEN** — quick-601's precedent, and strictly narrower than option 1: `app_admin` gains **no** `auth` privilege at all |

`public.auth_user_display(uuid[])`: `STABLE`, pinned
`SET search_path = pg_catalog, auth`, `REVOKE ALL … FROM PUBLIC` **first**
(PostgreSQL grants EXECUTE to PUBLIC by default), `GRANT EXECUTE` to `app_admin`
alone, plus a `REVOKE` of the orphaned column grant so staging converges with
production, which never received it.

**Measured four ways, and rows 2–5 are what make row 1 mean something:**

| probe | connection | result |
|---|---|---|
| `public.auth_user_display($1::uuid[])`, 9 real ids | `app_admin` | **`n = 9 · emails = 9 · metas = 9`** |
| the same function | `app_user` | **`42501 permission denied for function auth_user_display`** |
| `SELECT id, email, raw_user_meta_data FROM auth.users` (the ORIGINAL) | `app_admin` | **`42501 permission denied for schema auth`** |
| `SELECT encrypted_password FROM auth.users` | `app_admin` | **`42501`** |
| `has_schema_privilege('app_admin','auth','USAGE')` | — | **`false`** |

**The `auth` exposure was enumerated from the catalog before anything was
granted** — all 27 `auth` tables by name, all four `auth` functions with their
real ACLs (all four carry a leading `=X/…`, i.e. **PUBLIC EXECUTE**; all four are
`prosecdef = false` and read only the caller's own JWT claims), and every
`auth.users` column including `encrypted_password` and the six credential-reset
tokens. Full enumeration: `evidence/03-grants-and-auth-exposure.md` §3.2.

**The cost of option 3, stated rather than discovered later:** a `SECURITY
DEFINER` function owned by a role that can read `auth.users` **is** a standing
capability, and its BODY is the only thing between `EXECUTE` and the rest of that
table. The column grant would have put that boundary in
`information_schema.column_privileges`; this puts it in `pg_proc.prosrc`, where
only a code review sees it. Not chosen — forced.

**`support-tickets.ts:292` is the ONE statement in quick-615 whose text
changed**, and only because no receiver on this database can execute the original.
Same three columns, same names, types, filter and rows.

### Two guards this earned, plus a third correction to the guard itself

1. `GRANT … ON SCHEMA auth` is **refused outright** by `--apply`, with the
   WARNING quoted in the refusal.
2. A `SECURITY DEFINER` migration is refused without `REVOKE ALL … FROM PUBLIC`
   and a pinned `SET search_path`.
3. **The guard's own false positive, third door on a familiar class.** Its
   per-statement parser read `GRANT OPTION` out of the *English sentence inside a
   `COMMENT ON FUNCTION` string literal* and refused the migration — the `--`
   stripper does not touch SQL strings. quick-612 hit this on `AS RESTRICTIVE` in
   a header comment, quick-600 on `pool.on('connect'` in prose; this is a string
   literal. The guard now blanks single-quoted literals and `AS $tag$ … $tag$`
   function bodies — and **deliberately not** an anonymous `DO $$ … $$` block,
   because that is where this repo's migrations put their real `GRANT`s and
   blanking it would disarm every check while still passing.

### Ledger

Both migrations' `_prisma_migrations` rows hand-written (DEC-17), each with a
real SHA-256 over LF bytes, `logs = ''`, `started_at = finished_at`,
`applied_steps_count = 0`, read back after the sentinel
`20260915150000_grant_automation_rule_to_app_admin` was confirmed visible. The
**retired** `…_grant_auth_user_display_columns` row was deleted with a
before/after read, because a ledger row naming a directory that does not exist is
drift; the script refuses to retire a name whose directory still exists.
`evidence/04-ledger-readback.md`.

---

## §6 — The per-FILE proof, every file present

`evidence/05-after.md` — **56 cells across all 12 files**, on staging, `app_user`
with the tripwire read back as **`on`**, ONE transaction per cell, SQLSTATE off
the cause chain, `TC001` by CODE.

| | BEFORE | AFTER |
|---|---|---|
| `TC001` (the old receiver, empty GUC) | **19** | **19** |
| `42501` | 11 | **4** — all deliberate counter-assertions |
| succeeded | 23 | **33** |

Three lanes per site: **NEW RECEIVER** (succeeds), **OLD RECEIVER ∅** (`TC001`),
**CROSS-TENANT** (`foreign === 0` **paired with `own > 0`** on the same connection
in the same transaction). Every write probe carries a **privileged counter-read**
taken on a separate connection while the probe's transaction is still open.

Every file appears, including the one that dropped off the list:

| file | verdict |
|---|---|
| `(admin)/actions/notifications.ts` | 42501 → 18 rows · `TC001` · cross 0 / own 2 |
| **`(admin)/actions/sysadmin-invoices.ts`** | **NO PROBE — NOT A RUNTIME STATEMENT**, with the reason in the cell |
| `(admin)/actions/tenants.ts` | 5 sites: listing+`_count`, metrics, invitation INSERT, invitation UPDATE, user UPDATE |
| `(admin)/actions/users.ts` | listing (10/10 with the `Tenant` join) + UPDATE |
| `(admin)/admin-support/page.tsx` | tenants = 2 · `TC001` · cross 0 / own 1 |
| `(admin)/tenants/[id]/activation-progress-section.tsx` | 42501 → n = 1 · `TC001` · cross 0 / own 1 |
| `(admin)/tenants/[id]/automation-runs-section.tsx` | runs 1 + rule keys 1 · `TC001` · cross 0 / own 1 |
| `(admin)/tenants/[id]/page.tsx` | n = 1 · `TC001` · cross 0 / own 1 |
| `actions/support-tickets.ts` | the scan + both joins, plus 4 `auth` cells |
| `api/cron/auto-close-tickets/route.ts` | the real `NOT EXISTS` scan · `TC001` · cross 0 / own 1 |
| `api/cron/automations/route.ts` | 42501 → sweeps live; rule lookup; **TENANT lane SUCCEEDS, ∅ lane `TC001`** |
| `lib/automations/evaluator.ts` | events 2 / rules 6 / runs 2; **TENANT lane SUCCEEDS, ∅ lane `TC001`** |

**Fixtures:** 16 created, 16 torn down, every `left = 0`; `Tenant` = 2 and SYSTEM
`AutomationRule` = 6 at entry and exit. Two deliberately skipped and reported
**UNPROVEN rather than fabricated**:

- **`Load`** — `Load_customerId_fkey` needs a `Customer` and `Customer` is
  zero-row on staging. Creating a customer to create a load to prove a grant
  that is **already held** is a chain of fabrication for no evidence. Its ADMIN
  cell succeeds with `loads = 0`; its `TC001` cell is still real, because the
  policy is evaluated at scan setup regardless of rows (quick-610).
- **`auth.users`** — **no identity is ever fabricated.** Staging holds 9 real
  rows, so the cell is not vacuous anyway.

**A probe bug found and fixed on the way**, because it produced a false negative
that looked exactly like the feature being broken: the first version of the
definer-function probe put a direct `auth.users` read inside the ARGUMENT,
evaluated as `app_admin`, and reported `42501` for the probe's own mistake. The
whole point of a definer function is that the caller never names `auth.users`, so
neither may the probe. The ids are now resolved privileged and passed as a
parameter.

---

## §7 — The gates

`evidence/07-gates.md` in full.

| gate | result |
|---|---|
| `tsc --noEmit` | **0**, and **proven not blind**: an injected `const x: number = 'y'` in `users.ts` was reported as TS2322 at that line; probe deleted, repo-wide sweep clean |
| `npm run build` | **exit 0** (`✓ Compiled successfully in 36.4s`), run after Task 5 and again after the Task 6 restructure |
| `audit:rls-policy-drift` | **CLEAN, exit 0** — 186 expected / 186 live / 0 missing / 0 unexpected, **definition layer RAN** (186 bodies compared, 0 drift, not exit 3). **Database measured: STAGING `wyixpgunnjmzguhggocz`**. `rls-policy-canonical.json` NOT regenerated — no policy changed |
| `bypass_rls_policy` | **86 before, 86 after**, compared as a **sorted table list**: identical, nothing only-in-before, nothing only-in-after |
| vitest, same reporter both ways | **717 suites · 2129 tests · 2010 passed · 64 failed · 52 pending — IDENTICAL**, and the failing-**FILE** set identical: **25 files**, none fixed, none broken |
| allowlist gate | **witnessed RED then GREEN**, verbatim, from this run |
| click-through harness | **DID NOT RUN — see below** |

**The drift script does not print its own target.** It had to be pinned on the
command line and the ref recorded by hand — a gap against quick-607's rule that
an operator must never infer the database. Named, not fixed; worth its own task.

### The click-through harness, plainly

`NEXT_PUBLIC_SUPABASE_URL` in `apps/web/.env.local` is
`https://oqdhberkghtnszrkdvfm.supabase.co` — **PRODUCTION**. The harness needs a
real signed-in session, which means authenticating against production auth and
starting a server pointed at it. Both are refused by this task's limits.

**So it did not run, and nothing weaker was put in its place** — no partial
harness, no unauthenticated fetch dressed up as a click-through. The statements
are proven at the SQL layer instead, which is a different and in some ways
stronger instrument, but it is **not** a substitute for exercising the rendered
surfaces and that gap is real. Closing it needs a staging Supabase project's URL
and anon key on this machine. quick-604's artefacts are untouched (`git status`
over `.planning/quick/604-*` is empty), so its `--out` hazard never arose.

---

## §8 — What is still unscoped, and what each needs

### Fully closed by this task

All **47** runtime TC001 statements 614 enumerated, plus the 1 GRANT-class one.
**Zero of the 48 remain unrouted.**

### Deliberately not touched, each with what it needs

| item | count | what it needs |
|---|---|---|
| **The bypass-flagged population** — B7's two `generateTicketNumber` copies, B8 (`lib/auth/supabase.ts:164`), the 7 in `support-tickets.ts`, `evaluator.ts:95-96`, `workflow-digest`'s 8, the `api/track/[token]` GPS lookup | **~20 statements across 86 tables' worth of policies** | The **Phase 0 bypass programme**. `tenant_context_required()` exempts them, so the tripwire cannot see them and they break at the **BYPASS DROP**, not at the cutover. §9 of `admin-connection.md` predicted `TKT-0001` forever for B7 and is still right about the symptom, wrong about the timing |
| **`actions/support-tickets.ts:563`** (`getUnreadAdminReplyCount`) | 1 | A **tenant** acquisition. It has `session.tenantId` and hardcodes it into the SQL but issues it on the bare client with no `set_config`, so its answer depends on what the pooled connection last held (quick-602). A latent **wrong-answer** site, not a cutover blocker (614 §2.4). One line, but it needs its own measurement |
| **The RLS-OFF latent set** — `notifications.ts` ×8, `plans.ts` ×4, `promos.ts` ×2 | 14 | **Nothing today.** `NotificationTemplate`, `NotificationEmailConfig`, `Plan` and `Promo` are RLS OFF under the Section 4.12 allowlist and `app_user` holds full DML. They become live the day a tenant policy is added to any of those tables |
| **`~211` bypass-exempt sites the tripwire cannot signal** | 211 | quick-602's stated cost, unchanged. Owned by the bypass programme |
| **The `withTenantContext` wrapper migration** | **475 units / 479 call sites** | Unrelated programme. quick-615 moved the number **UP by one** (478 → 479) because `runEvaluator` now holds two `getTenantPrismaForOrg` calls. Artefact regenerated, never weakened |

### Left UNPROVEN by the `--after` run, named

- **`Load`** — the ADMIN cell succeeds over zero rows. The grant was already held,
  so nothing is at risk; a row-bearing proof needs a `Customer` fixture chain.
- **The rendered sysadmin surfaces** — §7's click-through gap.

### Stopped and reported rather than guessed

1. **`sysadmin-invoices.ts:83` is not a statement** — reported as a correction to
   614 rather than "routed".
2. **The `auth` column grant is a silent no-op** — the plan's expected answer was
   measured impossible and the reversal is recorded in full, in the migration
   header, in evidence 03, and in the call site.
3. **The cron double acquisition broke quick-603's contract.** The plan's F6 said
   to prefer two acquisitions if that preserved control flow;
   `tests/cron/automations.test.ts` disproved the premise — it injects at
   `getTenantPrismaForOrg`, so the new outer acquisition became the unrecorded
   throw site, and the same test pins the acquisition count at `M * RULES`, which
   a double breaks. Collapsed to ONE acquisition inside the `try`, with the
   deviation and its residual (a dedup-read failure is now recorded and the loop
   continues, where before it 500'd) written into the code and into commit
   `5eaf7398`. **`evaluator.ts:80` needed no equivalent** and is unchanged: both
   the old read and the new acquisition sit outside its `try`.
4. **`Route` was missing from every prior audit's table list** — found only by
   the `_count` reading, and the `--before` lane names it out loud.
5. **`admin-connection.md` §2 and CLAUDE.md carry a stale grant list** —
   corrected in public rather than quietly worked around.
6. **`audit:rls-policy-drift` does not name its database** — reported.
7. **`tenants/[id]/page.tsx:56` swallows its own failure** — reported, not fixed.

---

## §9 — What this task deliberately did NOT do

- **No bypass drop.** `bypass_rls_policy` is 86 before and after, compared as a
  sorted table list.
- **No cutover.** `DATABASE_URL` is untouched; `DB_ROLE_EXPECT_TENANT_ROLE`
  remains unset.
- **No production write.** Every instrument refuses the production ref
  **positively** before issuing a statement and prints
  `[db-target] project : wyixpgunnjmzguhggocz (staging)` to stderr, credential
  masked. Both migrations are committed and reach production on the next
  `vercel --prod`, by a human, via `scripts/migrate.mjs`.
- **Nothing installed.**
- **No guard weakened.** The allowlist rose to real measured numbers and was
  witnessed red; no `minBytes` lowered; the countdown artefact regenerated
  upward; the drift detector untouched and the canonical artefact not
  regenerated; the two regressed tests fixed at the source, not suppressed.
- **The tripwire was never disarmed** — armed per connection with
  `set_config('app.tenant_context_tripwire','on',false)`, read back as `on`, and
  the script refuses to run if it reads back as anything else.
- **Nothing pushed.**
