# quick-602 — `06-tripwire-matrix`

Generated 2026-09-15T05:26:57.463Z against staging (`wyixpgunnjmzguhggocz`).

```json
{
  "fixtures": {
    "tenantA": "9034f751-31dc-456e-94ea-4b04a86c7176",
    "tenantB": "3f14c1c7-bfc3-457c-92eb-7fb72b742467",
    "tagA": "9cd430c1-d87d-4c62-8f3a-4e2b76bca4cb",
    "tagB": "cc777296-165b-44d6-862d-0a8b54e68b33",
    "tags": 2,
    "assignments": 2,
    "events": 2
  },
  "matrix": {
    "S2 \"tenantId\" — NEWLY ROUTED by this migration | Tag | read": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1 {\"n\":1}",
      "flag=off guc=none": "rows=1 {\"n\":0}",
      "flag=off guc=tenantA": "rows=1 {\"n\":1}"
    },
    "S2 \"tenantId\" — NEWLY ROUTED by this migration | Tag | insert": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1",
      "flag=off guc=none": "42501",
      "flag=off guc=tenantA": "rows=1"
    },
    "S2 \"tenantId\" — NEWLY ROUTED by this migration | Tag | update": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1",
      "flag=off guc=none": "rows=0",
      "flag=off guc=tenantA": "rows=1"
    },
    "S2 \"tenantId\" — pre-existing, untouched by this migration | AppEvent | read": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1 {\"n\":1}",
      "flag=off guc=none": "rows=1 {\"n\":0}",
      "flag=off guc=tenantA": "rows=1 {\"n\":1}"
    },
    "S2 \"tenantId\" — pre-existing, untouched by this migration | AppEvent | insert": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1",
      "flag=off guc=none": "42501",
      "flag=off guc=tenantA": "rows=1"
    },
    "S2 \"tenantId\" — pre-existing, untouched by this migration | AppEvent | update": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1",
      "flag=off guc=none": "rows=0",
      "flag=off guc=tenantA": "rows=1"
    },
    "S10 org_id | carrier_drivers | read": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1 {\"n\":0}",
      "flag=off guc=none": "rows=1 {\"n\":0}",
      "flag=off guc=tenantA": "rows=1 {\"n\":0}"
    },
    "S12 tenant_id | audit_log | read": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1 {\"n\":0}",
      "flag=off guc=none": "rows=1 {\"n\":0}",
      "flag=off guc=tenantA": "rows=1 {\"n\":0}"
    },
    "S17 EXISTS join (stops -> dispatches.org_id) | stops | read": {
      "flag=on guc=none": "TC001",
      "flag=on guc=tenantA": "rows=1 {\"n\":0}",
      "flag=off guc=none": "rows=1 {\"n\":0}",
      "flag=off guc=tenantA": "rows=1 {\"n\":0}"
    }
  },
  "directionD": {
    "Tag": "rows=1 {\"n\":2}",
    "carrier_drivers": "rows=1 {\"n\":0}",
    "audit_log": "rows=1 {\"n\":0}"
  },
  "realPolicyPayload": {
    "raised": true,
    "code": "TC001",
    "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
    "detail": "statement: SELECT id, name FROM \"Tag\" ORDER BY name LIMIT 5",
    "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
  },
  "levers": {
    "postgres: ALTER ROLE app_user SET app.tenant_context_tripwire='on'": "42501 permission denied to set parameter \"app.tenant_context_tripwire\"",
    "postgres: ALTER DATABASE postgres SET app.tenant_context_tripwire='on'": "42501 permission denied to set parameter \"app.tenant_context_tripwire\"",
    "app_user: ALTER ROLE app_user SET app.tenant_context_tripwire='on'": "42501 permission denied to set parameter \"app.tenant_context_tripwire\"",
    "app_user: session SET app.tenant_context_tripwire='on'": "ACCEPTED"
  },
  "alterRoleLever": {
    "pgDbRoleSettingBefore": "{idle_in_transaction_session_timeout=30s}",
    "armedConnectionReads": "",
    "disarmedConnectionReads": "",
    "pgDbRoleSettingAfter": "{idle_in_transaction_session_timeout=30s}",
    "byteIdentical": true
  },
  "leftFlagState": ""
}
```

| direction | probe | result |
|---|---|---|
| observation | flag=on guc=none \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| read | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| insert | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| update | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| read | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| insert | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| update | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S10 org_id \| carrier_drivers \| read | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S12 tenant_id \| audit_log \| read | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | flag=on guc=none \| S17 EXISTS join (stops -> dispatches.org_id) \| stops \| read | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| legitimate | flag=on guc=tenantA \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| read | OK — rows=1 {"n":1} |
| legitimate | flag=on guc=tenantA \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| insert | OK — rows=1 |
| legitimate | flag=on guc=tenantA \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| update | OK — rows=1 |
| legitimate | flag=on guc=tenantA \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| read | OK — rows=1 {"n":1} |
| legitimate | flag=on guc=tenantA \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| insert | OK — rows=1 |
| legitimate | flag=on guc=tenantA \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| update | OK — rows=1 |
| legitimate | flag=on guc=tenantA \| S10 org_id \| carrier_drivers \| read | OK — rows=1 {"n":0} |
| legitimate | flag=on guc=tenantA \| S12 tenant_id \| audit_log \| read | OK — rows=1 {"n":0} |
| legitimate | flag=on guc=tenantA \| S17 EXISTS join (stops -> dispatches.org_id) \| stops \| read | OK — rows=1 {"n":0} |
| observation | flag=off guc=none \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| read | OK — rows=1 {"n":0} |
| observation | flag=off guc=none \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| insert | `42501` new row violates row-level security policy for table "Tag" |
| observation | flag=off guc=none \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| update | OK — rows=0 |
| observation | flag=off guc=none \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| read | OK — rows=1 {"n":0} |
| observation | flag=off guc=none \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| insert | `42501` new row violates row-level security policy for table "AppEvent" |
| observation | flag=off guc=none \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| update | OK — rows=0 |
| observation | flag=off guc=none \| S10 org_id \| carrier_drivers \| read | OK — rows=1 {"n":0} |
| observation | flag=off guc=none \| S12 tenant_id \| audit_log \| read | OK — rows=1 {"n":0} |
| observation | flag=off guc=none \| S17 EXISTS join (stops -> dispatches.org_id) \| stops \| read | OK — rows=1 {"n":0} |
| legitimate | flag=off guc=tenantA \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| read | OK — rows=1 {"n":1} |
| legitimate | flag=off guc=tenantA \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| insert | OK — rows=1 |
| legitimate | flag=off guc=tenantA \| S2 "tenantId" — NEWLY ROUTED by this migration \| Tag \| update | OK — rows=1 |
| legitimate | flag=off guc=tenantA \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| read | OK — rows=1 {"n":1} |
| legitimate | flag=off guc=tenantA \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| insert | OK — rows=1 |
| legitimate | flag=off guc=tenantA \| S2 "tenantId" — pre-existing, untouched by this migration \| AppEvent \| update | OK — rows=1 |
| legitimate | flag=off guc=tenantA \| S10 org_id \| carrier_drivers \| read | OK — rows=1 {"n":0} |
| legitimate | flag=off guc=tenantA \| S12 tenant_id \| audit_log \| read | OK — rows=1 {"n":0} |
| legitimate | flag=off guc=tenantA \| S17 EXISTS join (stops -> dispatches.org_id) \| stops \| read | OK — rows=1 {"n":0} |
| observation | DIRECTION D: bypass_rls=on, no tenant context, flag ON \| SELECT on Tag | OK — rows=1 {"n":2} |
| observation | DIRECTION D: bypass_rls=on, no tenant context, flag ON \| SELECT on carrier_drivers | OK — rows=1 {"n":0} |
| observation | DIRECTION D: bypass_rls=on, no tenant context, flag ON \| SELECT on audit_log | OK — rows=1 {"n":0} |
| observation | pg_db_role_setting for app_user is byte-identical after the ALTER ROLE lever was exercised and reset | OK — {idle_in_transaction_session_timeout=30s} |
| observation | staging is left FLAG-OFF: a fresh app_user connection reads the tripwire flag as | OK — "" |

---

## Narrative (appended by hand after the final `--after` run)

Everything below was measured as `app_user` (`rolbypassrls = false`) against the
**migrated** staging database, over the `RLS602` fixtures. The tripwire is armed with a
**session-level `SET`**, never `ALTER ROLE`, so the flag-off half of the matrix is measurable in
the same run and the rest of staging is unaffected while it runs.

### Direction A — the tripwire fires, loudly, across five policy shapes INCLUDING WRITES

Flag ON, no tenant context. Nine probes, nine `TC001`:

| shape (policy-satisfiability-sweep.md §1) | table | op | result |
|---|---|---|---|
| S2 `"tenantId"` — **newly routed by this migration** | `Tag` | read | `TC001` |
| S2 `"tenantId"` — **newly routed** | `Tag` | **insert** | `TC001` |
| S2 `"tenantId"` — **newly routed** | `Tag` | **update** | `TC001` |
| S2 `"tenantId"` — pre-existing | `AppEvent` | read | `TC001` |
| S2 `"tenantId"` — pre-existing | `AppEvent` | **insert** | `TC001` |
| S2 `"tenantId"` — pre-existing | `AppEvent` | **update** | `TC001` |
| S10 `org_id` | `carrier_drivers` | read | `TC001` |
| S12 `tenant_id` | `audit_log` | read | `TC001` |
| S17 `EXISTS` join (`stops` → `dispatches.org_id`) | `stops` | read | `TC001` |

The writes matter because `WITH CHECK` is a separate evaluation site, and both INSERT (check) and
UPDATE (`USING` on the existing row) raise.

The payload as a real policy produces it — the DETAIL names the statement, which is the deliverable:

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT id, name FROM \"Tag\" ORDER BY name LIMIT 5",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

On the UNSET-vs-EMPTY wording: both are reachable in the function and only the EMPTY branch is
reachable through Supavisor session mode — measured and explained in `02-mechanism.md` §4. Every
`TC001` in this run therefore reads "the EMPTY STRING".

### Direction B — a scoped statement is untouched

Flag ON with `app.current_tenant_id` = fixture tenant A, compared against the identical statement
with the flag off:

| shape | table | op | flag ON + tenant A | flag OFF + tenant A | equal? |
|---|---|---|---|---|---|
| S2 newly routed | `Tag` | read | `n=1` | `n=1` | yes |
| S2 newly routed | `Tag` | insert | 1 row | 1 row | yes |
| S2 newly routed | `Tag` | update | 1 row | 1 row | yes |
| S2 pre-existing | `AppEvent` | read | `n=1` | `n=1` | yes |
| S2 pre-existing | `AppEvent` | insert | 1 row | 1 row | yes |
| S2 pre-existing | `AppEvent` | update | 1 row | 1 row | yes |
| S10 | `carrier_drivers` | read | `n=0` † | `n=0` † | yes |
| S12 | `audit_log` | read | `n=0` † | `n=0` † | yes |
| S17 | `stops` | read | `n=0` † | `n=0` † | yes |

† **labelled honestly**: no `RLS602` fixture exists on these three tables, so the count is zero on
both sides and the row proves only *no raise*, not *the right rows*. The non-zero counter-assertion
is carried by `Tag`, `TagAssignment` and `AppEvent`, which do have fixtures.

### Direction C — with the flag off, behaviour is today's behaviour

Flag off (explicitly `'off'`), no tenant context:

| table | read | insert | update |
|---|---|---|---|
| `Tag` | `n=0` | `42501` | 0 rows |
| `AppEvent` | `n=0` | `42501` | 0 rows |
| `carrier_drivers` / `audit_log` / `stops` | `n=0` | — | — |

`Tag`'s row matches the Task-1 pre-migration matrix exactly (`03-tag-equivalence.md`, `''` case:
SELECT 0, INSERT own 42501). No raise anywhere. The silent-empty is still silent with the flag off —
which is the point: the migration is inert until somebody arms it.

### Direction D — the bypass interaction on REAL tables CONFIRMS decision D2

`app.bypass_rls = 'on'`, no tenant context, flag ON:

| table | result |
|---|---|
| `Tag` | `n=2` — no raise; the bypass arm admitted BOTH fixture tenants' rows |
| `carrier_drivers` | `n=0` — no raise |
| `audit_log` | `n=0` — no raise |

This is the exemption working on live policies, and `Tag`'s `n=2` is the clearest statement of what
it costs: a statement with no tenant context read across tenants and the tripwire said nothing,
because the bypass flag told it to. That is decision **D2** and its ~211-site cost, visible rather
than argued.

### A MEASUREMENT THAT OVERTURNS THE DESIGN: `ALTER ROLE` is REFUSED on this instance

The design named `ALTER ROLE app_user SET app.tenant_context_tripwire = 'on'` as the one-statement
lever. Attempted, with both obvious variants and both roles:

| attempt | result |
|---|---|
| `postgres`: `ALTER ROLE app_user SET app.tenant_context_tripwire='on'` | **`42501` permission denied to set parameter** |
| `postgres`: `ALTER DATABASE postgres SET app.tenant_context_tripwire='on'` | **`42501` permission denied to set parameter** |
| `app_user`: `ALTER ROLE app_user SET app.tenant_context_tripwire='on'` | **`42501` permission denied to set parameter** |
| `app_user`: `SET app.tenant_context_tripwire='on'` (session) | **ACCEPTED** |

Supabase's `postgres` is not a superuser, and PostgreSQL refuses `ALTER ROLE`/`ALTER DATABASE … SET`
on a **placeholder** GUC to a non-superuser. The pre-existing `pg_db_role_setting` rows — the
evidence the design leaned on — were written by the platform's own superuser roles, which is exactly
why they looked like proof and were not. **The arming mechanism is a session-level `SET` issued per
connection.** The migration header §4 is corrected in place to say so.

Consequences, stated rather than smoothed over:
- Arming staging is a per-environment change (the pool's `on('connect')`, a harness, a psql session),
  not one statement.
- It is **strictly safer for production**: there is no server-side switch anybody can flip by
  accident, and the flag cannot outlive the process that set it.
- `pg_db_role_setting` for `app_user` is byte-identical before and after the attempt —
  `{idle_in_transaction_session_timeout=30s}` — because every attempt was refused and both RESETs
  were issued anyway.

### Staging is left flag-off

A fresh `app_user` connection, opened after everything above, reads
`current_setting('app.tenant_context_tripwire', TRUE)` as `""` — not `'on'`.
