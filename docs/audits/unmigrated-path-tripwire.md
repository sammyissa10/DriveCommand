# The unmigrated-path tripwire

**Date:** 2026-09-15 (quick-602)
**Target:** STAGING `wyixpgunnjmzguhggocz` only. **Production `oqdhberkghtnszrkdvfm` was never
written** — it was read twice, at open and at close, and both readings are quoted in §7.
**Scope:** build the signal `wrapper-migration-scope.md` §5 designed, measure the three things that
design assumed, route the last two inline policies through the function, and then **run the
application against staging as `app_user` with the tripwire on and report every path by name**.
**Not in scope, and not done:** no call site was migrated, `withTenantContext` still does not exist,
nothing was installed, and the flag is set nowhere.

Every number below cites the evidence file it came from:
`.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/`.

---

## 0. The problem, in one paragraph

Today an unmigrated path fails **silently**. The GUC is unset, `current_tenant_id()` returns NULL,
`"tenantId" = NULL` is unknown, the row is filtered, and the caller gets an empty result with no
error. That silence is the only reason the `withTenantContext` cutover has to be all-or-nothing: you
cannot ship half a migration when the other half degrades invisibly. This task converts that silence
into a loud, attributable, **flag-gated** database error, and adds a static countdown for the paths
no test exercises.

---

## 1. Step 1 — the counts, against the audit's 87 / 5 / 86 / 5

`wrapper-migration-scope.md` §5 recorded **87 covered / 5 inline / 86 bypass / 5 neither = 183**.
Re-measured on **both** databases (`evidence/01-baseline.md`), today's figure is **91 / 2 / 86 / 4 =
183**, identical on staging and production, with an **empty policy-name set difference in both
directions** and a byte-identical `current_tenant_id()`.

The delta is derived **per policy from the SQL** of the three intervening migrations, not by
subtraction:

| # | migration | policy | what the SQL does | bucket move |
|---|---|---|---|---|
| — | audit baseline, 2026-09-12 | — | — | 87 / 5 / 86 / 5 |
| 1 | `20260913120000` (quick-597) | `audit_log.tenant_isolation_policy` | `DROP` + `CREATE … USING (tenant_id = current_tenant_id())` | inline → covered |
| 2 | `20260913120000` | `"PushToken".user_isolation_policy` | `DROP`, no recreate | neither −1 |
| 3 | `20260913120000` | `"SysAdminInvoice".sysadmin_invoices_deny_tenant_users` | `DROP`, no recreate | inline −1 |
| 4 | `20260913120000` | `"SysAdminInvoiceItem".sysadmin_invoice_items_deny_tenant_users` | `DROP`, no recreate | inline −1 |
| 5 | `20260913120000` | `in_app_notifications_insert_policy` | `WITH CHECK (true)` → `WITH CHECK (org_id = current_tenant_id())` | neither → covered |
| | **after 597** | | | **89 / 2 / 86 / 3 = 180** |
| 6 | `20260914120000` (quick-599) | `"Tenant".tenant_bootstrap_insert` | new, inline `NULLIF(current_setting(…)) IS NULL` | inline +1 |
| 7 | `20260914120000` | `"Tenant".tenant_self_update` | new, `current_tenant_id()` | covered +1 |
| 8 | `20260914120000` | `audit_log.tenant_isolation_policy` | split; the SELECT half keeps the original name and predicate | covered ±0 |
| 9 | `20260914120000` | `audit_log.audit_log_append_policy` | new, `FOR INSERT WITH CHECK (true)` | neither +1 |
| 10 | `20260914120000` | `"AutomationRule".tenant_isolation_policy` | adds an explicit `WITH CHECK`; still `current_tenant_id()` | covered ±0 |
| | **after 599** | | | **90 / 3 / 86 / 4 = 183** |
| 11 | `20260914160000` (quick-601) | `"Tenant".tenant_bootstrap_insert` | → `WITH CHECK (id = current_tenant_id())` | inline → covered |
| | **today** | | | **91 / 2 / 86 / 4 = 183** |

**After this task's migration: 93 / 0 / 86 / 4 = 183.** Coverage of the signal goes 91 → 93 of 183,
and **no policy reads the GUC inline any more.**

Two disagreements with the plan's own fact table are recorded in `evidence/01-baseline.md` rather
than adopted quietly: `pg_db_role_setting` carries more rows than the plan lists (including
`app_admin → statement_timeout=30s` from quick-600), and staging and production differ from each
other in three Supabase *platform* rows. Neither is application configuration and neither is touched.

---

## 2. Before and after, quoted, for every object this migration changed

### `Tag.tenant_isolation_policy` and `TagAssignment.tenant_isolation_policy`

```sql
-- BEFORE (pg_get_expr, identical on both databases; ALL, PERMISSIVE, roles {}, WITH CHECK null)
USING ((("tenantId")::text = current_setting('app.current_tenant_id'::text, true)))

-- AFTER (staging; same policy NAME, same command, same permissiveness, WITH CHECK still derived)
USING (("tenantId" = current_tenant_id()))
```

The names are deliberately unchanged: `rls-policy-canonical.json` and the replay drift detector find
policies BY NAME, so a rename makes a policy **vanish** from the enumeration rather than show up as
changed (quick-599's rule).

### `public.current_tenant_id()`

```sql
-- BEFORE
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$;

-- AFTER
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid,
    CASE WHEN COALESCE(current_setting('app.tenant_context_tripwire', TRUE), 'off') = 'on'
         THEN public.tenant_context_required(current_setting('app.current_tenant_id', TRUE))
         ELSE NULL::uuid END
  );
$$;
```

### `public.tenant_context_required(text)` — new

Raises SQLSTATE `TC001`, naming the statement via `current_query()` in DETAIL, and returns NULL
without raising when `app.bypass_rls = 'on'` (§4). `LANGUAGE plpgsql`, `STABLE`, `SECURITY INVOKER`,
`SET search_path = public, pg_catalog`. ACL, read back after the apply
(`evidence/04-ledger-readback.txt`):

```
EXECUTE on tenant_context_required(text): app_user = true
                                          anon = false
                                          authenticated = false
                                          service_role = false
```

Both revokes are required. quick-601 measured `ALTER DEFAULT PRIVILEGES … GRANT EXECUTE ON FUNCTIONS
TO anon, authenticated, service_role` from two grantors on both databases, which a PUBLIC revoke does
not touch, and PostgREST exposes `public` functions to `anon` over `/rpc/`. The existing
`current_tenant_id()` still carries exactly those three grants — which is what the new function must
not inherit.

---

## 3. The three measurements the design assumed

### 3.1 The COALESCE fast path does not raise — so the function stays `LANGUAGE sql`

91 policies call `current_tenant_id()`, many per row, so inlinability matters.
`evidence/02-mechanism.md` §1: as `app_user`, flag ON, real uuid in the GUC, the function returned
the uuid and a policy scan calling it returned its row. `EXPLAIN (VERBOSE)` shows the whole
expression inlined into the scan filter with the raiser present and unreached. **DECISION D1: keep
`LANGUAGE sql STABLE`.** The plpgsql fallback the plan pre-authorised was not taken because its
trigger condition did not occur.

### 3.2 A permissive `bypass_rls_policy` does NOT suppress the raise

`evidence/02-mechanism.md` §2, on two probe tables carrying a tenant policy and a bypass policy in
**both** creation orders, with `app.bypass_rls = 'on'` and no tenant context:

| creation order | SELECT | UPDATE | DELETE |
|---|---|---|---|
| tenant policy first | `TC001` | `TC001` | `TC001` |
| bypass policy first | `TC001` | `TC001` | `TC001` |

**DECISION D2: bypass-flagged statements are EXEMPTED**, implemented inside
`tenant_context_required()` as a NULL return when `app.bypass_rls = 'on'`.

*Why:* such a statement is **admitted** by the bypass arm — it does not produce the silent empty
this tripwire exists to convert into an error. Firing on it would turn ~211 working call sites into
hard failures at once and drown the signal on the paths that do fail silently.

*Cost, stated rather than buried:* **~211 bypass call sites are not signalled.** They stay owned by
the Phase 0 bypass programme (`bypass-call-classification.md`, `bypass-replacement-design.md`).
`evidence/06-tripwire-matrix.md` Direction D shows the cost on live tables: with `app.bypass_rls =
'on'` and no tenant context, `SELECT count(*) FROM "Tag"` returned **2** — rows belonging to two
different tenants — and the tripwire said nothing.

### 3.3 The `TC001` payload, and how it must be detected

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT id, name FROM \"Tag\" ORDER BY name LIMIT 5",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

`TC` is not one of PostgreSQL's own SQLSTATE classes; the server accepted the ERRCODE and returned it
verbatim to the client as `code`. **Detect by CODE, never by message prose.** `current_query()` in
DETAIL is how a policy expression — which has no `TG_TABLE_NAME` — names the statement it refused.

**A measured caveat that contradicts the design.** The MESSAGE distinguishes an UNSET GUC from an
EMPTY one, and only the EMPTY branch is reachable here. Every staging URL is Supavisor **session
mode**; five successive `new Client()` connections all landed on backend pid 566368, where
`current_setting('app.current_tenant_id', TRUE)` reads `''` while a control name this repo has never
set reads NULL. Once a placeholder name exists on a backend it stays defined for that backend's
lifetime and a reset returns it to `''`. Production connects the same way, and `prisma.ts`'s
`pool.on('connect')` writes `''` explicitly. **In practice every TC001 will say "the EMPTY STRING".**

---

## 4. The flag: a GUC read at call time, and how it is actually armed

A settings-table read inside `current_tenant_id()` would put a query inside every policy evaluation
on 93 policies; that query would itself be subject to RLS (a recursion hazard) and would need its own
grant. A GUC costs nothing.

**The design's one-statement lever does not exist on this instance.** Measured
(`evidence/06-tripwire-matrix.md`):

| attempt | result |
|---|---|
| `postgres`: `ALTER ROLE app_user SET app.tenant_context_tripwire='on'` | **`42501` permission denied to set parameter** |
| `postgres`: `ALTER DATABASE postgres SET app.tenant_context_tripwire='on'` | **`42501`** |
| `app_user`: `ALTER ROLE app_user SET …` | **`42501`** |
| `app_user`: `SET app.tenant_context_tripwire='on'` (session) | **ACCEPTED** |
| connection-string `options=-c app.tenant_context_tripwire=on`, three spellings | **silently dropped by Supavisor** — connects, flag reads `''` |

Supabase's `postgres` is not a superuser, and PostgreSQL refuses `ALTER ROLE`/`ALTER DATABASE … SET`
on a **placeholder** GUC to a non-superuser. The pre-existing `pg_db_role_setting` rows were written
by platform superuser roles, which is exactly why they looked like proof and were not.

**So the arming mechanism is a session-level `SET`, issued per connection by whatever opens it.**
That is a per-environment change rather than one statement, and it is strictly safer for production:
there is no server-side switch anyone can flip by accident, and the flag cannot outlive the process
that set it (measured: Supavisor discards session state on release, `stillOn = 0 of 6`).

**Production no-op on the next deploy.** This migration file is committed, so `scripts/migrate.mjs`
will apply it to production on the next `vercel --prod`. That is intended and safe **because the flag
is set nowhere**: with the flag off — unset or explicitly `'off'`, both measured — `current_tenant_id()`
returns NULL exactly as today. The only production-visible behaviour change is the
`Tag`/`TagAssignment` predicate:

- a **non-canonical (uppercase) uuid** in the GUC now **admits** where text comparison filtered — a
  widening, arguably a fix, and no application path writes one;
- **non-uuid garbage** now raises `22P02` instead of filtering — the class quick-597 removed from
  `audit_log`, putting these two policies on the footing the other 91 have always had.

Ten of the twelve GUC cases in `evidence/03-tag-equivalence.md` are identical across SELECT,
INSERT-own and INSERT-foreign.

---

## 5. Step 4 — PATHS BY NAME, from EXECUTION

**This is a count of executions, not of call sites.** `wrapper-migration-scope.md` counted 449 call
sites across 456 units; it never ran any of them. `evidence/10-execution-sweep.md` invoked real entry
points in-process against staging as `app_user` (`rolbypassrls=false`, asserted through the
application's own client) with the tripwire armed on the application's own pool.

**Counts, of what was invoked (24). The not-invoked total sits beside them and is never summed in.**

| verdict | count |
|---|---|
| RAISED_TC001 | **12** |
| COMPLETED | 8 |
| OTHER_FAILURE | 4 |
| **invoked total** | **24** |
| NOT_INVOKED (separate) | 1 |

### All 14 `/api/cron/*` routes, individually

The enumeration is taken from the directory, not a hardcoded list, and asserted equal to 14.
Mechanism classes are re-derived by grep in the sweep itself.

| route | mechanism (measured) | verdict | dbTouched | queries |
|---|---|---|---|---|
| `auto-close-tickets` | getAdminDb | **RAISED_TC001** | true | 1 |
| `automations` | getTenantPrisma* | **RAISED_TC001** | true | 1 |
| `carrier-auto-dispatch` | app.bypass_rls + after() | **RAISED_TC001** | true | 1 |
| `carrier-compliance-alerts` | app.bypass_rls | COMPLETED (HTTP 500, no TC001) | true | 1 |
| `cleanup-quarantine` | **no DB import at all** | OTHER_FAILURE (`S3_BUCKET` missing) | false | 0 |
| `digest-compliance-30day` | app.bypass_rls + getAdminDb | **RAISED_TC001** ×2, swallowed, HTTP 200 | true | 2 |
| `digest-daily-driver` | app.bypass_rls + getAdminDb | **RAISED_TC001** ×2, swallowed, HTTP 200 | true | 2 |
| `digest-weekly-owner` | app.bypass_rls + getAdminDb | **RAISED_TC001** ×2, swallowed, HTTP 200 | true | 2 |
| `mark-overdue-invoices` | getAdminDb | COMPLETED | false | 0 |
| `purge-deleted` | bare prisma | **RAISED_TC001** ×7, swallowed, HTTP 200 | true | 7 |
| `send-reminders` | getAdminDb | **RAISED_TC001** ×2 | true | 6 |
| `trip-reminders` | getTenantPrisma* | **RAISED_TC001** | true | 1 |
| `workflow-digest` | app.bypass_rls + getAdminDb | COMPLETED | false | 0 |
| `workflow-notifications` | getTenantPrisma* + getAdminDb | COMPLETED | false | 0 |

**The mechanism classes overlap, which the plan's table did not anticipate.** Five routes carry two
mechanisms and one carries none. A file-level marker says which mechanisms a route *contains*, never
which one a given statement used — `auto-close-tickets` is marked `getAdminDb` and still raised,
because at least one of its statements runs on the tenant connection.

### `lib/` entry points — both shapes, deliberately

| entry point | shape | verdict | dbTouched | queries |
|---|---|---|---|---|
| `lib/db/prisma.ts` — `prisma.tag.count()` | bare client | **RAISED_TC001** | true | 1 |
| `lib/db/prisma.ts` — `prisma.appEvent.findMany()` | bare client | **RAISED_TC001** | true | 1 |
| `lib/automations/evaluator.ts:runEvaluator()` | bare client | **RAISED_TC001** | true | 1 |
| `lib/auth/supabase.ts:getCurrentUser()` | bare client | OTHER_FAILURE (`cookies` outside a request scope) | false | 0 |
| `lib/notifications/dispatcher.ts:dispatchNotification` | bare client | OTHER_FAILURE (argument shape) | false | 0 |
| `app/api/auth/login/route.ts:POST` | writes the GUC | COMPLETED (HTTP 500 — `cookies` outside a request scope, caught by the route) | false | 0 |
| `lib/onboarding/onboarding-flags.ts:getOnboardingFlags` | **acquires a tenant client** | **COMPLETED** | **true** | 7 |
| `lib/onboarding/confirm-tenant-email.ts:confirmTenantEmail` | **acquires a tenant client** | **COMPLETED** | **true** | 4 |
| `lib/context/tenant-context.ts:getTenantPrismaForOrg` + `tag.count()` | **acquires a tenant client** | **COMPLETED** | **true** | 4 |
| `lib/onboarding/hydrate-tenant.ts:hydrateTenant` | acquires a tenant client | OTHER_FAILURE (`P2025`, no `User` row on the fixture tenant) | true | 5 |

**The counter-assertion holds.** Three tenant-acquiring entry points completed with `dbTouched: true`,
so the sweep is reporting a signal that fires on unscoped paths — not one that fires on everything.

### A quoted `TC001` DETAIL naming a real application statement

```
statement:
      SELECT st.id, st."ticketNumber"
      FROM "SupportTicket" st
      WHERE st.status = 'RESOLVED'
        AND st."updatedAt" < $1
        AND NOT EXISTS (
          SELECT 1 FROM "TicketMessage" tm
          WHERE tm."ticketId" = st.id
            AND tm."senderType" = 'OWNER'
            AND tm."createdAt" > $2
        )
```

That is `api/cron/auto-close-tickets`'s raw query, named by the database itself.

### NOT_INVOKED — its own list, with reasons

| entry point | reason |
|---|---|
| `api/cron/carrier-auto-dispatch/route.ts:GET` — the `after()`-DEFERRED half | called outside the Next request lifecycle, `after()` may throw or no-op; the route's row covers its synchronous body only. Under the HTTP pass the synchronous body raised first, so the deferred work was not reached either. |

### The HTTP pass RAN, under its triple guard

`evidence/11-execution-http.md`. Guard 1: the resolved project ref in the server's shell was the
staging ref. Guard 2: `pg_stat_activity` showed a new `app_user` backend on **staging** (0 → 1 → 0)
and **zero** `app_user` connections on **production** at every reading. Guard 3: outbound email/push
neutralised in that shell. Arming needed a **temporary, uncommitted** `TRIPWIRE_ARM`-guarded
`pool.on('connect')` in `lib/db/prisma.ts`, reverted immediately (`grep -c TRIPWIRE_ARM` = 0), because
no server-side lever exists (§4).

Twelve of fourteen routes agreed with the in-process verdict. The two disagreements:

1. **`purge-deleted` — seven TC001 raises that nothing outside the process could see.** Over HTTP the
   route returned `200 {"success":true,"totalPurged":0}` with every model `-1`, and the server log
   recorded each failure as `Error: [object Object]` — the `logger.error(message, error, context)`
   arity bug CLAUDE.md already records. **The tripwire fired seven times and an operator watching
   logs and status codes would have learned nothing.** The in-process pass saw it only because it
   observes the driver's own promise rejections.
2. **`cleanup-quarantine`** — an environment difference (`.env.local` supplies `S3_BUCKET` to the dev
   server), not a lifecycle one.

No disagreement was caused by the request lifecycle itself.

---

## 6. Step 5 — the static countdown (a DIFFERENT instrument)

`scripts/audit/wrapper-countdown.ts` + the committed `wrapper-countdown.json` + the CI gate at
`tests/security/wrapper-migration-countdown.test.ts`.

| figure | value |
|---|---|
| unmigrated **units**, each named `function:line` | **456** |
| files containing them | 202 |
| unmigrated call sites | 459 |
| files scanned | 1,689 |
| **`withTenantContextCallSites`** (the anti-vacuity counter) | **0** |

The classifier is purely syntactic (`ts.createSourceFile`, no `Program`, no checker), which is how it
recognises the migrated shape although `withTenantContext` does not exist yet. **The counter must be
AST-based:** `withTenantContext` already appears in three files — `lib/auth/supabase.ts`,
`lib/email/sender-config.ts`, `lib/onboarding/activation-tracker.ts` — and all three are **prose
inside comments**, so a string match would report 3 migrated call sites on a tree that has none.
Without the counter, "the countdown reached zero" and "somebody deleted the acquisitions" are
indistinguishable.

Reconciliation with the audit's 456 / 198 / 449: **units agree exactly**; call sites differ by 10
because the audit counted `await …` occurrences and this counts call expressions (the audit says so
itself); the 4-file and 5-file corpus differences are **reported unreconciled** — the audit's walker
lives in an uncommitted scratchpad, and both figures moving together is consistent with `src` having
changed across quick-597…601.

The gate was **proven RED three ways** (`evidence/08-countdown-red.md`), each reverted and
re-confirmed green: an artefact count decremented; a new unmigrated file added under `src`; the
classifier's wrapper detection disabled (which is what proves the synthetic assertions *distinguish*
the shapes rather than passing vacuously). 11 tests, 7.3 s.

**The overlap with step 4 is the number that matters here.** Of the 23 source files step 4 invoked,
**4 appear in the countdown, covering 4 of 456 units — 0.88 %.** The two instruments see *different*
populations: most of the 12 runtime raises came from bare-client paths the countdown does not name at
all, because they never call `getTenantPrisma`.

---

## 7. Can group A (336 units / 154 files) now ship incrementally?

**Yes — provided the four conditions below hold.**

The justification, entirely from measurements: the signal now covers **93 of 183 policies** and no
policy reads the GUC inline; an unmigrated statement raises **`TC001` naming itself** via
`current_query()`, proven across five policy shapes including writes; step 4 proved it fires on
**real executions** (12 raises across 24 invoked entry points) and **does not fire on scoped ones**
(three tenant-acquiring entry points completed with `dbTouched: true`); the flag is **off by
default**, so the signal is a 500 you can see on staging rather than one a customer sees; and the
countdown gives an exact remaining count, **by name**, per commit.

Conditions that must hold for that answer to stay true:

1. **The flag stays set nowhere on production.** There is no server-side lever (§4), so arming is a
   deliberate per-environment change — but that also means arming staging requires application code
   that does not exist yet, and shipping it is a decision in its own right.
2. **Staging must be run as `app_user`.** The sweep pointed one process at staging-as-`app_user`; it
   did not change any standing configuration. A partial migration validated against a `postgres`
   connection validates nothing — `rolbypassrls` makes every policy inert.
3. **The countdown's number must come down in the same commits as the work**, which the gate enforces
   in both directions, and `withTenantContextCallSites` must rise as it falls.
4. **The bypass exemption must be understood as a hole, not a fix.** Until the Phase 0 bypass
   programme lands, ~211 sites are outside the signal by construction.

---

## 8. What the TRIPWIRE misses

1. **The 86 `bypass_rls` policies, and every bypass-flagged statement** — ~211 call sites, exempted
   by decision D2 with its cost recorded. Worked example: the six bypass-carrying cron routes.
   `carrier-compliance-alerts` and `workflow-digest` came back COMPLETED rather than RAISED.
2. **Every path routed to `getAdminDb`** — `app_admin` carries `rolbypassrls`, so **no policy is
   consulted at all** and the tripwire is structurally invisible to it. This is a real interaction
   between quick-600 and this task that nothing else records: **routing a path to the admin
   connection removes it from the tripwire's reach.** The three cron routes quick-600 moved there are
   `auto-close-tickets`, `mark-overdue-invoices` and `send-reminders` — and note that two of them
   *still* raised, because they also issue statements on the tenant connection. The exemption is
   per-statement, not per-route.
3. **The 4 "neither" policies** — `UserNotificationPreference.user_isolation_policy`,
   `audit_log.audit_log_append_policy`, and the two `in_app_notifications` JWT policies. Three are
   dead on the Prisma path (sweep §3); none consults `current_tenant_id()`.
4. **The 8 RLS-off public tables and `_prisma_migrations`** — no policy, so nothing to signal.
5. **`after()`-deferred work** — not executed by an in-process call, and in the HTTP pass the
   synchronous body raised first. One entry, named, in the NOT_INVOKED list.
6. **A swallowed raise, from outside the process.** `purge-deleted` proves this: seven raises,
   HTTP 200, and `Error: [object Object]` in the log. The signal exists; the *observability* of it
   depends on the caller's error handling.
7. **An unscoped statement on a connection a scoped one already touched.** `getTenantPrismaForOrg`
   writes the GUC at **session** scope and the pool holds `max: 1`, so a later bare-client query
   inherits the context and does not raise. Reproduced during this task (quick-413's pool leak).
8. **Every path nobody exercises** — quantified rather than asserted: step 4 invoked **24** entry
   points, which touch **4 of the 456** units the countdown names (**0.88 %**).

## 9. What the COUNTDOWN misses

1. **A transaction reached through a call chain** — `wrapper-migration-scope.md` §1b: 64 units / 38
   files whose deadlock risk is invisible to any static scan of call sites, and that is the *larger*
   half of the risk.
2. **Raw `$queryRaw` / `$executeRaw` sites that never call `getTenantPrisma`** — 350 occurrences
   across 134 files. They are exactly the paths that raised most loudly in step 4, and the countdown
   does not name one of them.
3. **Dynamic dispatch and renamed imports.** The classifier matches the callee's identifier text; an
   aliased or indirectly-dispatched acquisition is invisible to it.
4. **"Zero" means "no unwrapped acquisitions", not "the migration is correct."** A unit that keeps the
   wrapper *and* the inner acquisition also scores zero; that is why the artefact carries the second
   number.

---

## 10. What this task did not measure

- Any authenticated browser path. The sweep covers entry points reachable without a session, which is
  a small minority of the 456 units.
- Performance. `current_tenant_id()` stays inlinable, and no timing was taken.
- Production behaviour of anything. Production was read twice and never written.
- The `UNSET` half of the TC001 message, which is unreachable through a session pooler (§3.3).

---

## 11. Production, read at close, field by field

| field | production, at close |
|---|---|
| policies in `public` | **183** |
| classification | **91 covered / 2 inline / 86 bypass / 4 neither** — unchanged |
| `Tag`/`TagAssignment` bodies | still `(("tenantId")::text = current_setting('app.current_tenant_id'::text, true))` |
| `current_tenant_id()` | still the one-line `NULLIF(...)::UUID` body |
| `tenant_context_required` | **absent from `pg_proc`** |
| `_prisma_migrations` head | still `20260914170000_activation_progress_congrats_shown_at` |
| `pg_db_role_setting` | unchanged |
| `pg_stat_activity` during the execution sweep | **0 `app_user` connections, at every reading** |
