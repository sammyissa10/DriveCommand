# quick-602 — `02-mechanism`

Generated 2026-09-15T05:06:39.132Z against staging (`wyixpgunnjmzguhggocz`).

```json
{
  "gucPresenceOnFreshClients": [
    {
      "tenant_raw": "",
      "tenant_is_null": false,
      "control_is_null": true,
      "tripwire_raw": "",
      "pid": 566368
    },
    {
      "tenant_raw": "",
      "tenant_is_null": false,
      "control_is_null": true,
      "tripwire_raw": "",
      "pid": 566368
    },
    {
      "tenant_raw": "",
      "tenant_is_null": false,
      "control_is_null": true,
      "tripwire_raw": "",
      "pid": 566368
    },
    {
      "tenant_raw": "",
      "tenant_is_null": false,
      "control_is_null": true,
      "tripwire_raw": "",
      "pid": 566368
    },
    {
      "tenant_raw": "",
      "tenant_is_null": false,
      "control_is_null": true,
      "tripwire_raw": "",
      "pid": 566368
    }
  ],
  "explainFastPath": [
    "Seq Scan on public.tripwire_probe_602",
    "  Output: id, \"tenantId\"",
    "  Filter: ((tripwire_probe_602.\"tenantId\" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN probe_tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text))",
    "Query Identifier: -2676288534328381413"
  ],
  "explainBypass": {
    "tenant policy created FIRST": [
      "EXPLAIN raised: tenant context is required: app.current_tenant_id is the EMPTY STRING"
    ],
    "bypass policy created FIRST": [
      "EXPLAIN raised: tenant context is required: app.current_tenant_id is the EMPTY STRING"
    ]
  },
  "bypassResults": {
    "tenant policy created FIRST": {
      "select": "TC001",
      "update": "TC001",
      "delete": "TC001"
    },
    "bypass policy created FIRST": {
      "select": "TC001",
      "update": "TC001",
      "delete": "TC001"
    }
  },
  "tc001Payload": {
    "UNSET": {
      "raised": true,
      "code": "TC001",
      "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
      "detail": "statement: SELECT id FROM public.tripwire_probe_602 WHERE \"tenantId\" IS NOT NULL",
      "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
    },
    "EMPTY": {
      "raised": true,
      "code": "TC001",
      "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
      "detail": "statement: SELECT id FROM public.tripwire_probe_602 WHERE \"tenantId\" IS NOT NULL",
      "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
    }
  },
  "tripwireFlagBleedWithoutReset": {
    "setterPid": 566368,
    "pid": 566368,
    "flag": ""
  },
  "tripwireFlagBleed": [
    {
      "pid": 566368,
      "flag": ""
    },
    {
      "pid": 566368,
      "flag": ""
    },
    {
      "pid": 566368,
      "flag": ""
    },
    {
      "pid": 566368,
      "flag": ""
    },
    {
      "pid": 566368,
      "flag": ""
    },
    {
      "pid": 566368,
      "flag": ""
    }
  ],
  "leftovers": {
    "tables": 0,
    "fns": 0
  }
}
```

| direction | probe | result |
|---|---|---|
| observation | CONTROL: a name this repo never sets (app.never_set_602_control) reads NULL on every fresh client | OK — allControlNull=true |
| observation | app.current_tenant_id reads NULL (truly UNSET) on at least one fresh app_user client through the session pooler | OK — anyNull=false readings=["","","","",""] |
| legitimate | FAST PATH: probe_current_tenant_id() with flag ON and a real uuid | OK — rows=1 {"v":"602a0000-0000-4000-8000-000000000001"} |
| legitimate | FAST PATH: SELECT through a tenant policy that calls it, flag ON, real uuid | OK — rows=1 {"n":1} |
| observation | a fresh app_user connection has app.current_tenant_id UNSET (current_setting(..,TRUE) IS NULL) | `ASSERT` is_null=false |
| legitimate | UNSET: probe_current_tenant_id(), flag ON | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| legitimate | UNSET: SELECT through the tenant policy, flag ON | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| legitimate | EMPTY STRING: probe_current_tenant_id(), flag ON | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| legitimate | EMPTY STRING: SELECT through the tenant policy, flag ON | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| legitimate | FLAG OFF (flag unset), tenant UNSET: probe_current_tenant_id() returns NULL | OK — rows=1 {"is_null":true} |
| legitimate | FLAG OFF (flag unset), tenant UNSET: SELECT filters silently | OK — rows=1 {"n":0} |
| legitimate | FLAG explicitly 'off', tenant UNSET: SELECT filters silently | OK — rows=1 {"n":0} |
| observation | BYPASS OR (tenant policy created FIRST): SELECT on tripwire_probe_602 | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | BYPASS OR (tenant policy created FIRST): UPDATE on tripwire_probe_602 | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | BYPASS OR (tenant policy created FIRST): DELETE on tripwire_probe_602 | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | BYPASS OR (bypass policy created FIRST): SELECT on tripwire_probe_602_rev | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | BYPASS OR (bypass policy created FIRST): UPDATE on tripwire_probe_602_rev | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | BYPASS OR (bypass policy created FIRST): DELETE on tripwire_probe_602_rev | `TC001` tenant context is required: app.current_tenant_id is the EMPTY STRING |
| observation | HAZARD: a session SET of the tripwire flag, with the client closed and NO RESET, is still readable from the next client | OK — setterPid=566368 readerPid=566368 flag="" |
| observation | after the probe sessions closed, how many fresh app_user clients still read the tripwire flag as ON (session-pooler bleed) | OK — stillOn=0 of 6; each was RESET after reading |

---

## Narrative (appended by hand after the final `--mechanism` run)

All three measurements were made as `app_user` (`rolbypassrls = false`) against committed throwaway
objects: `tripwire_probe_602`, `tripwire_probe_602_rev`, `probe_current_tenant_id()`,
`probe_tenant_context_required(text)`. Leftovers after teardown: **tables 0, functions 0.**

### 1. The COALESCE fast path does NOT raise — measured, not reasoned about

With `app.tenant_context_tripwire = 'on'` **and** a real uuid in `app.current_tenant_id`:

```
FAST PATH: probe_current_tenant_id()                 -> {"v":"602a0000-0000-4000-8000-000000000001"}
FAST PATH: SELECT through a policy that calls it     -> {"n":1}
```

and the plan, showing the whole expression inlined into the scan filter — the raiser is present in
the plan node and is simply not reached:

```
Seq Scan on public.tripwire_probe_602
  Output: id, "tenantId"
  Filter: ((tripwire_probe_602."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid,
           CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text)
                THEN probe_tenant_context_required(current_setting('app.current_tenant_id'::text, true))
                ELSE NULL::uuid END)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text))
```

With the flag off (unset **and** explicitly `'off'`) and no tenant context, the function returns NULL
and the SELECT returns 0 rows — today's behaviour, unchanged.

### 2. A permissive `bypass_rls_policy` does NOT suppress the raise — in EITHER creation order

`app.bypass_rls = 'on'`, no tenant context, tripwire on:

| policy creation order | SELECT | UPDATE | DELETE |
|---|---|---|---|
| tenant policy created FIRST (`tripwire_probe_602`) | `TC001` | `TC001` | `TC001` |
| bypass policy created FIRST (`tripwire_probe_602_rev`) | `TC001` | `TC001` | `TC001` |

Six probes, six raises. The `OR` of a permissive policy set does not short-circuit away from the
tenant arm, and the arm order the catalogue happens to hold makes no difference. `EXPLAIN` could not
even be produced for these — the planner reaches the same expression, so the raise fires during
`EXPLAIN` too (recorded in `explainBypass`).

### 3. The `TC001` payload — quoted verbatim as the client receives it

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT id FROM public.tripwire_probe_602 WHERE \"tenantId\" IS NOT NULL",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

The server accepted the non-standard `ERRCODE = 'TC001'` and returned it verbatim as the driver's
`code`, which is the only property the detection rule needs — and `DETAIL` carries the full statement
text from `current_query()`, which is how a policy expression (with no `TG_TABLE_NAME` available)
names what it refused.

### 4. A MEASUREMENT THAT CONTRADICTS THE PLAN: the UNSET branch is not observable from here

The plan asks for UNSET and EMPTY STRING to be shown producing different MESSAGEs. **They do not, and
the reason is the connection path, not the function.** Every staging URL in `.env.staging` is
Supavisor **session mode** (`aws-0-us-west-1.pooler.supabase.com:5432`). Five successive
`new Client()` connections all landed on **backend pid 566368**, and on that backend:

| read, as the first statement of a "fresh" client | value |
|---|---|
| `current_setting('app.current_tenant_id', TRUE)` | `''` — **not NULL**, on all five |
| `current_setting('app.never_set_602_control', TRUE)` (control) | NULL on all five |
| `current_setting('app.tenant_context_tripwire', TRUE)` | `''` |

The control proves the reading is real: a placeholder this repo has **never** set reads NULL, while
`app.current_tenant_id` reads `''`. Once a placeholder name has been assigned on a backend, the name
stays defined for the backend's lifetime and a session reset returns it to `''`, not to undefined. So
through the pooler — which is also how production runs, and on top of which `prisma.ts`'s
`pool.on('connect')` writes `''` explicitly — **the observable no-context state is the EMPTY STRING**.

Consequence, stated rather than smoothed over: the `p_raw IS NULL` branch of the MESSAGE is correct
code and is retained (a direct, non-pooled connection would hit it), but **in this environment every
TC001 will read "the EMPTY STRING"**, including the probe labelled `UNSET` above. That label records
what was attempted, not what was observed.

### 5. A second measurement the plan did not ask for: the flag does NOT bleed across the pooler

Because the tripwire is armed with a session `SET` on a pooled backend, "staging is left flag-off"
had to be measured rather than assumed:

| probe | result |
|---|---|
| `SET app.tenant_context_tripwire='on'`, close the client with **no RESET**, read from the next client | `flag=""` — setter pid 566368, reader pid 566368 |
| 6 further fresh clients, each read then `RESET` | `stillOn = 0 of 6` |

Supavisor discards session state on release, so a session `SET` does not survive the client that made
it even on the same backend. The harness still issues an explicit `RESET` everywhere, because relying
on a pooler's cleanup for a safety-relevant flag is the kind of premise quick-599 was burned by.

---

## DECISIONS

**D1 — `current_tenant_id()` stays `LANGUAGE sql STABLE`.**
*Measurement:* §1 above. With the flag ON and a real uuid the function returned the uuid and the
policy scan returned its row, with the whole expression inlined into the scan filter and the raiser
unreached. The fallback the plan pre-authorised (rewrite as plpgsql with an explicit `IF`, losing
inlining on 91 policies) is **not taken**, because the condition that would have triggered it — the
fast path raising under inlining or constant folding — did not occur.

**D2 — bypass-flagged statements ARE exempted, and the cost is stated.**
*Measurement:* §2 above — six probes across two policy-creation orders, all `TC001`. So without an
exemption the tripwire fires on every statement that sets `app.bypass_rls = 'on'`.

*Decision:* `tenant_context_required()` returns NULL instead of raising when
`current_setting('app.bypass_rls', TRUE) = 'on'`.

*Why:* a bypass-flagged statement is **admitted** by the bypass arm — it does not produce the silent
empty result this tripwire exists to convert into an error. Signalling it would turn ~211 working
call sites into hard failures at once, which is noise that would drown the signal on the paths that
do fail silently.

*Cost, recorded rather than buried:* **~211 bypass call sites are not signalled by this tripwire.**
They remain enumerated by the Phase 0 bypass programme (`docs/audits/bypass-call-classification.md`,
`bypass-replacement-design.md`), which is the mechanism that owns them. Task 4 makes the cost visible
on real paths: the bypass-carrying cron routes will come back `COMPLETED`, not `RAISED_TC001`, and
that is this decision showing up in the measurement rather than in prose.
