# quick-615 evidence 03 — the `app_admin` grant delta, and the `auth.users` decision

All measurements on STAGING `wyixpgunnjmzguhggocz`, read as `postgres`.
Production `oqdhberkghtnszrkdvfm` is never touched.
Produced by `scripts/audit/615-routing-verify.ts --grants` / `--apply`.

---

## 1. The delta, measured against the LIVE catalog

The **required** set comes from Task 1's per-statement table × operation record
(`01-classification.json`). The **held** set comes from
`information_schema.role_table_grants` on staging, read before the migration was
written. Not from `admin-connection.md` §2's prose list — see §2.

| table | needed by a routed statement | `app_admin` held | **missing** |
|---|---|---|---|
| `ActivationProgress` | SELECT | *(none)* | **SELECT** |
| `AppEvent` | SELECT | INSERT, SELECT | — |
| `AutomationRule` | SELECT | SELECT, UPDATE | — |
| `AutomationRun` | SELECT | INSERT, SELECT, UPDATE | — |
| `DriverInvitation` | SELECT, INSERT, UPDATE | SELECT | **INSERT, UPDATE** |
| `Load` | SELECT | SELECT | — |
| `NotificationSendLog` | SELECT | *(none)* | **SELECT** |
| `Route` | SELECT | *(none)* | **SELECT** |
| `Subscription` | SELECT | SELECT, UPDATE | — |
| `SupportTicket` | SELECT | SELECT, UPDATE | — |
| `Tenant` | SELECT | DELETE, INSERT, SELECT, UPDATE | — |
| `TicketMessage` | SELECT | INSERT, SELECT | — |
| `Truck` | SELECT | SELECT | — |
| `User` | SELECT, UPDATE | SELECT | **UPDATE** |

**Six privileges across five tables** →
`20260915160000_grant_cutover_routing_tables_to_app_admin`.

**`Route` is the one nothing predicted.** It appears in no `prisma.<model>.`
grep of `tenants.ts`, and 614's table column does not list it. It is reached
only through `_count: { select: { users, trucks, routes } }` on `:32` and
`:297`, which Prisma emits as real correlated sub-selects. **A `_count` is a
statement against another table.** `Truck` is on the list for the same reason
and happened to be granted already. The `--before` lane names it out loud:

```
getAllTenants / getTenantById — Tenant + the _count sub-selects (User, Truck, Route)
  ADMIN  ->  ERROR [42501] permission denied for table Route
```

### Proof the grants were mandatory, not decorative

`--before` → `--after`, same probe, same connection:

| routed statement | BEFORE (`app_admin`) | AFTER (`app_admin`) |
|---|---|---|
| `NotificationSendLog` scan | `ERROR [42501] permission denied for table NotificationSendLog` | `send_log_rows = 18` |
| `Tenant` + `_count{User,Truck,Route}` | `ERROR [42501] permission denied for table Route` | `tenants=2 · users=10 · trucks=2 · routes=2` |
| `DriverInvitation` INSERT (`:123`) | `ERROR [42501] permission denied for table DriverInvitation` | `1 row(s) affected` |
| `DriverInvitation` UPDATE (`:376`) | `ERROR [42501] permission denied for table DriverInvitation` | `1 row(s) affected` |
| `User` UPDATE (`:480`, `users.ts:115/:130`) | `ERROR [42501] permission denied for table User` | `1 row(s) affected` |
| `ActivationProgress` read | `ERROR [42501] permission denied for table ActivationProgress` | `n = 1` |
| cron candidate sweeps | `ERROR [42501] permission denied for table ActivationProgress` | `activation_rows=2 · subscription_rows=2` |

Every write probe is inside `BEGIN … ROLLBACK` and carries a privileged
counter-read taken while that transaction is still open.

---

## 2. CORRECTION — `admin-connection.md` §2's grant list is STALE, and CLAUDE.md repeats it

§2 publishes a 17-table list as "the grant scope". Measured against the live
catalog, it is wrong in five places:

| table | §2 says | live catalog says | why it matters here |
|---|---|---|---|
| `AutomationRule` | **absent** | SELECT, UPDATE | quick-613 added it; §2 was never updated |
| `ActivationProgress` | **absent** | *(none)* → now SELECT | quick-615 needs it |
| `NotificationSendLog` | **absent** | *(none)* → now SELECT | quick-615 needs it |
| `Route` | **absent** | *(none)* → now SELECT | reached only via `_count` |
| `DriverInvitation` | SELECT | SELECT → now + INSERT, UPDATE | `:123` creates, `:376` updates |
| `User` | SELECT | SELECT → now + UPDATE | three routed UPDATEs |
| `NotificationTemplate`, `PlaybookInstance`, `StepInstance`, `GPSLocation`, `SysAdminInvoice*`, `TenantNotificationSettings` | listed | still held | unaffected — listed for completeness |

**CLAUDE.md's Phase-History entry for quick-600 repeats §2's list, and the
orchestrator brief for this task repeated it again.** A prose list of grants
drifts the moment anyone adds one; the catalog does not. Same family as DEC-14
(`read pg_constraint, never a comment about them`) and quick-610's false
`NotificationSendLog` RLS comment.

`615-routing-verify.ts --grants` prints the live delta on demand, so the next
task has an instrument rather than a list to trust.

---

## 3. The `auth.users` statement — measured first, argued second

### 3.1 What was measured, before anything was granted

```
auth.users        relrowsecurity = true · relforcerowsecurity = false · POLICIES = 0 · 9 rows
role_table_grants   schema auth, grantee in (app_user, app_admin, PUBLIC)  -> ZERO ROWS
column_privileges   schema auth, grantee in (app_user, app_admin)          -> ZERO ROWS
has_schema_privilege('app_user' ,'auth','USAGE')  = false
has_schema_privilege('app_admin','auth','USAGE')  = false
```

RLS with **zero policies** denies everything to a non-bypassing role, so this is
not a tenant-context problem at all: it fails **`42501`, never `TC001`**, and
the tripwire can never signal it. That is why 614 §2.3 counts it separately from
the 48.

**`getAdminDb` does not fix it, and that was measured rather than assumed.**
`app_admin` is `rolbypassrls = true`, so the zero-policy RLS is irrelevant to
it — but it held no `auth` privilege either. The `--before` lane:

```
:292 direct read of auth.users   ADMIN        -> ERROR [42501] permission denied for schema auth
:292 direct read of auth.users   TENANT (∅)   -> ERROR [42501] permission denied for schema auth
```

Note the second row: `42501`, **not** `TC001`, on the very connection where every
other probe in this matrix raises `TC001`. That is the class distinction, shown
rather than asserted.

### 3.2 The full `auth` exposure, enumerated from the catalog

Because `USAGE ON SCHEMA auth` was about to be granted, here is what it opens —
read from the catalog, not from memory.

**The 27 tables in schema `auth`** (`information_schema.tables`):

```
audit_log_entries       custom_oauth_providers  flow_state          identities
instances               mfa_amr_claims          mfa_challenges      mfa_factors
mfa_recovery_code_sets  mfa_recovery_codes      oauth_authorizations
oauth_client_states     oauth_clients           oauth_consents      one_time_tokens
refresh_tokens          saml_providers          saml_relay_states   schema_migrations
scim_tokens             scim_users              sessions            sso_domains
sso_providers           users                   webauthn_challenges webauthn_credentials
```

USAGE makes all 27 **nameable**, not readable — `app_admin` holds no table grant
on any of them. But USAGE is the **gate**: a future accidental table grant in
that schema takes effect where today it cannot.

**The four functions in `auth`, with their real ACLs** (`pg_proc.proacl`):

| function | owner | `prosecdef` | ACL |
|---|---|---|---|
| `auth.email()` | `supabase_auth_admin` | false | `=X/supabase_auth_admin, supabase_auth_admin=X/…, dashboard_user=X/…` |
| `auth.jwt()` | `supabase_auth_admin` | false | `=X/supabase_auth_admin, postgres=X/…, supabase_auth_admin=X/…, dashboard_user=X/…` |
| `auth.role()` | `supabase_auth_admin` | false | `=X/supabase_auth_admin, …` |
| `auth.uid()` | `supabase_auth_admin` | false | `=X/supabase_auth_admin, …` |

The leading `=X/…` on all four **is PUBLIC EXECUTE**. So USAGE makes all four
callable by the role. All four are `prosecdef = false` and read only from
`current_setting('request.jwt.claims')` — they report the CALLER's own PostgREST
claims and nothing about any other user, and on a direct `pg` connection there
is no such setting, so they return null. Named because USAGE is what makes them
callable, not because they disclose anything.

**Every `auth.users` column**, so "what an unqualified table-level SELECT would
expose" is a list a reader can see. The seven in **bold** are why an unqualified
grant is forbidden:

```
instance_id · id · aud · role · email · ENCRYPTED_PASSWORD · email_confirmed_at ·
invited_at · CONFIRMATION_TOKEN · confirmation_sent_at · RECOVERY_TOKEN ·
recovery_sent_at · EMAIL_CHANGE_TOKEN_NEW · email_change · email_change_sent_at ·
last_sign_in_at · raw_app_meta_data · raw_user_meta_data · is_super_admin ·
created_at · updated_at · phone · phone_confirmed_at · phone_change ·
PHONE_CHANGE_TOKEN · phone_change_sent_at · confirmed_at ·
EMAIL_CHANGE_TOKEN_CURRENT · email_change_confirm_status · banned_until ·
REAUTHENTICATION_TOKEN · reauthentication_sent_at · is_sso_user · deleted_at ·
is_anonymous
```

An unqualified `GRANT SELECT ON auth.users` hands over the password hash and six
credential-reset tokens for a display-name fallback.
`615-routing-verify.ts --apply` refuses that shape before it can be applied.

### 3.3 THE REVERSAL — the column-level grant was written, applied, and MEASURED TO BE HALF A NO-OP

The first remedy shipped as
`20260915170000_grant_auth_user_display_columns`:

```sql
GRANT USAGE ON SCHEMA auth TO app_admin;
GRANT SELECT (id, email, raw_user_meta_data) ON TABLE auth.users TO app_admin;
```

It applied **without error**. The `--apply` report then printed:

```
has_schema_privilege('app_admin','auth','USAGE') AFTER = false
auth column grants AFTER:
- app_admin -> auth.users.email              : SELECT
- app_admin -> auth.users.id                 : SELECT
- app_admin -> auth.users.raw_user_meta_data : SELECT
```

**The column grant landed and the schema grant did not.** Re-issuing it with the
`pg` notice channel attached, inside a rolled-back transaction, gives the reason
verbatim:

```
NOTICE/WARNING: WARNING no privileges were granted for "auth"
```

A **WARNING, not an ERROR** — so the transaction commits, the migration
"succeeds", and the catalog shows three column privileges that cannot be
exercised.

**Why.** `pg_namespace.nspacl` for `auth`:

```
supabase_admin=UC/supabase_admin, anon=U/…, authenticated=U/…, service_role=U/…,
supabase_auth_admin=UC/…, dashboard_user=UC/…, postgres=U/supabase_admin
```

`postgres` — the role every migration in this repo runs as, via
`scripts/migrate.mjs` on `DIRECT_URL` — holds `U` **with no `*`**: USAGE WITHOUT
GRANT OPTION. And `rolsuper = false`. It cannot pass USAGE on, and it cannot
borrow the owner's authority either:

```
SET LOCAL ROLE supabase_admin  ->  ERR 42501 permission denied to set role "supabase_admin"
```

`postgres`'s memberships, measured: `anon, app_admin, app_user, authenticated,
authenticator, pg_create_subscription, pg_monitor, pg_read_all_data,
pg_signal_backend, service_role, supabase_privileged_role`. **`supabase_admin` is
not among them.**

The column grant worked for the mirror-image reason — `pg_class.relacl` on
`auth.users` reads `postgres=ar*wdDxtm/supabase_auth_admin`, SELECT **WITH GRANT
OPTION**. So `postgres` can hand out a column SELECT it can never make reachable.

> **A column grant on a schema the grantee cannot enter is a privilege that
> reads correctly in the catalog and cannot be exercised.** Only the
> both-directions matrix could catch that: the `--after` lane would have shown
> `42501` on a statement whose grant the same report listed as present.

### 3.4 The three options, and the one the measurement left

| # | option | verdict |
|---|---|---|
| 1 | column grant + `USAGE ON SCHEMA auth` | **IMPOSSIBLE** from the migrating role, measured in §3.3. Not a preference. |
| 2 | `GRANT authenticated TO app_admin` (role membership — `authenticated` holds `U` on `auth`) | **REFUSED.** It would work, and it would hand `app_admin` everything that role can do, for ever, for three display columns. `admin-connection.md` §2 excludes role membership by name. |
| 3 | `SECURITY DEFINER` function in `public`, owned by the migrating role, EXECUTE to `app_admin` | **CHOSEN** — and strictly narrower than option 1 ever was: `has_schema_privilege('app_admin','auth','USAGE')` stays **false**. This is the quick-601 precedent. |

`20260915170000_auth_user_display_definer_function` ships:

```sql
CREATE OR REPLACE FUNCTION public.auth_user_display(user_ids uuid[])
RETURNS TABLE (id uuid, email varchar, raw_user_meta_data jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, auth
AS $fn$ SELECT u.id, u.email, u.raw_user_meta_data FROM auth.users u WHERE u.id = ANY(user_ids) $fn$;
REVOKE ALL ON FUNCTION public.auth_user_display(uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_user_display(uuid[]) TO app_admin;
REVOKE SELECT (id, email, raw_user_meta_data) ON TABLE auth.users FROM app_admin;
```

The trailing REVOKE converges staging with production, which never received the
orphaned column grant. `auth column grants AFTER` is now **empty**.

**The call site changed, and it is the ONLY statement in quick-615 whose text
did.** `support-tickets.ts:292`:

```
- SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ANY(${userIds}::uuid[])
+ SELECT id, email, raw_user_meta_data FROM public.auth_user_display(${userIds}::uuid[])
```

Same three columns, same names, same types, same filter, same rows. It changed
only because no receiver on this database can execute the original.

### 3.5 The cost of option 3, stated rather than discovered later

A `SECURITY DEFINER` function owned by a role that can read `auth.users` **is** a
standing capability, and its BODY is the only thing between `EXECUTE` and the
rest of that table. Widening its `SELECT` list is a one-line change with no grant
for a reviewer to notice. The column grant would have put that boundary in
`information_schema.column_privileges`, where a catalog query enumerates it; this
puts it in `pg_proc.prosrc`, where only a code review does. That trade was not
chosen — it was forced.

Three things reduce it and all three are in the migration:
`SET search_path = pg_catalog, auth` (pinned, so nothing a caller puts on its own
path changes what the body resolves to); `REVOKE ALL … FROM PUBLIC` **first**
(PostgreSQL grants EXECUTE to PUBLIC by default on every new function — without
this line `app_user` and every other role could call it); and `STABLE` with no
dynamic SQL and a fixed projection no caller can influence.

And one dependency, recorded rather than assumed: **a `SECURITY DEFINER`
function runs as its OWNER, and the owner is whichever role applies the
migration.** On staging and production that is `postgres`, which holds `U` on
`auth` and `ar*wdDxtm` on `auth.users`. If a future deploy applies migrations as
a role without those, the function will exist and raise at call time rather than
silently returning nothing — the right failure direction, but a dependency.

### 3.6 The remedy, measured in four directions

From `05-after.md`, all on staging with the tripwire armed:

| probe | connection | result |
|---|---|---|
| `public.auth_user_display($1::uuid[])`, 9 real ids | `app_admin` | **`n = 9 · emails = 9 · metas = 9`** |
| the same function | `app_user` | **`ERROR [42501] permission denied for function auth_user_display`** |
| `SELECT id, email, raw_user_meta_data FROM auth.users` (the ORIGINAL text) | `app_admin` | **`ERROR [42501] permission denied for schema auth`** |
| `SELECT encrypted_password FROM auth.users` | `app_admin` | **`ERROR [42501] permission denied for schema auth`** |
| `has_schema_privilege('app_admin','auth','USAGE')` | `app_admin` | **`false`** |

Row 1 alone would be satisfied by a table grant or a role membership. **Rows 2–5
are what make it mean something**: the tenant role cannot call the function, the
admin role still cannot touch `auth.users` directly, the password hash is still
refused on the very connection that reads the display columns, and the schema
gate never opened.

**A probe bug found and fixed on the way, because it produced a false negative
that looked exactly like the feature being broken.** The first version of the
function probe wrote
`auth_user_display((select array_agg(id) from auth.users …))` — a direct
`auth.users` read inside the ARGUMENT, evaluated as `app_admin`, which has no
`auth` privilege by design. It reported `42501` for the probe's own mistake. The
whole point of a definer function is that the caller never names `auth.users`, so
neither may the probe: the ids are now resolved on the privileged connection and
passed as a parameter.

---

## 4. Two guards this episode earned, both now in `--apply`

1. **`GRANT … ON SCHEMA auth` is refused outright**, with the WARNING quoted in
   the refusal message. It is a silent no-op from the migrating role, and this
   task shipped exactly that file.
2. **A `SECURITY DEFINER` migration is refused** unless it also contains
   `REVOKE ALL ON FUNCTION … FROM PUBLIC` and a pinned `SET search_path =`.

And a third correction, to the guard itself — **the same false-positive class
that has now bitten this repo three times.** The per-statement GRANT parser read
`GRANT OPTION` out of the *English sentence inside a `COMMENT ON FUNCTION`
string literal* and refused the migration. The `--` stripper does not touch SQL
string literals. quick-612 hit this on `AS RESTRICTIVE` in a header comment,
quick-600 on `pool.on('connect'` in explanatory prose; this is the third door:
**a string literal.** The guard now blanks single-quoted literals and
`AS $tag$ … $tag$` function bodies before parsing — and **deliberately does NOT
blank an anonymous `DO $$ … $$` block**, because that is where this repo's
migrations put their actual `GRANT` statements and blanking it would disarm every
check while still passing. The parser also now looks for `ON` **after** the
`GRANT`, not anywhere in the fragment; the old version produced a backwards slice
and an empty verb list.

---

## 5. Ledger and invariants

- Both migrations' `_prisma_migrations` rows were written **BY HAND** (DEC-17 —
  neither MCP tool writes Prisma's ledger), each with a real SHA-256 over LF
  bytes, `logs = ''`, `started_at = finished_at`, `applied_steps_count = 0`, and
  each READ BACK after the sentinel
  `20260915150000_grant_automation_rule_to_app_admin` was confirmed visible.
  Full transcript: `04-ledger-readback.md`.
- The retired `20260915170000_grant_auth_user_display_columns` ledger row was
  **deleted** from staging, with a before/after read-back, because a
  `_prisma_migrations` row naming a directory that does not exist in the repo is
  drift. The script refuses to retire a name whose directory still exists.
- `bypass_rls_policy`: **86 before, 86 after**, compared as a **sorted table
  list** — identical.
- Staging invariants at entry and exit: `Tenant` = 2, SYSTEM `AutomationRule` = 6.
- Fixtures: 16 created, 16 torn down, every `left = 0`. `Load` and `auth.users`
  were deliberately NOT fixtured — see `05-after.md`.
- **Production was never written.** Every instrument refuses the production ref
  positively before issuing a statement; both migrations reach production on the
  next `vercel --prod`, by a human, via `scripts/migrate.mjs`.
