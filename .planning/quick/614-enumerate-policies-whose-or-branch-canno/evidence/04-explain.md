# quick-614 evidence 04 — EXPLAIN plans, and the finding-F / mechanism probes

## Part 1 — `EXPLAIN (ANALYZE, VERBOSE)` for the four subquery policies, REAL lane

Read-only. Taken in the REAL lane because the EMPTY lane cannot produce a plan at
all — see Part 3, which is the headline result.

### `SUB-cd` — `carrier_documents` (REAL lane)

```sql
select count(*)::int as n from carrier_documents
```

```
Aggregate (actual rows=1 loops=1)
  Output: (count(*))::integer
  ->  Seq Scan on public.carrier_documents (actual rows=1 loops=1)
        Output: carrier_documents.id, carrier_documents.parent_type, carrier_documents.parent_id, carrier_documents.stop_id, carrier_documents.client_id, carrier_documents.document_type, carrier_documents.file_url, carrier_documents.filename, carrier_documents.file_size_bytes, carrier_documents.uploaded_by, carrier_documents.verified, carrier_documents.verified_by, carrier_documents.verified_at, carrier_documents.notes, carrier_documents.created_at, carrier_documents.document_type_id, carrier_documents.load_id, carrier_documents.dispatch_id, carrier_documents.contract_id
        Filter: EXISTS(SubPlan 1)
        Rows Removed by Filter: 1
        SubPlan 1
          ->  Index Scan using "User_pkey" on public."User" u (actual rows=0 loops=2)
                Index Cond: (u.id = carrier_documents.uploaded_by)
                Filter: (((u."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text)) AND (u."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)))
                Rows Removed by Filter: 0
Query Identifier: -3419228599179580813
```

### `SUB-st` — `stops` (REAL lane)

```sql
select count(*)::int as n from stops
```

```
Aggregate (actual rows=1 loops=1)
  Output: (count(*))::integer
  ->  Seq Scan on public.stops (actual rows=2 loops=1)
        Filter: (ANY (stops.dispatch_id = (hashed SubPlan 2).col1))
        Rows Removed by Filter: 2
        SubPlan 2
          ->  Seq Scan on public.dispatches d (actual rows=1 loops=1)
                Output: d.id
                Filter: (((d.org_id = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text)) AND (d.org_id = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)))
                Rows Removed by Filter: 1
Query Identifier: 8046268033896799561
```

### `SUB-rts` — `route_template_stops` (REAL lane)

```sql
select count(*)::int as n from route_template_stops
```

```
Aggregate (actual rows=1 loops=1)
  Output: (count(*))::integer
  ->  Seq Scan on public.route_template_stops (actual rows=2 loops=1)
        Output: route_template_stops.id, route_template_stops.route_template_id, route_template_stops.sequence_order, route_template_stops.stop_type, route_template_stops.facility_id, route_template_stops.contact_name, route_template_stops.contact_phone, route_template_stops.appt_window_start_offset_min, route_template_stops.appt_window_end_offset_min, route_template_stops.expected_dwell_minutes, route_template_stops.commodity_description, route_template_stops.bol_required, route_template_stops.pod_required, route_template_stops.special_instructions, route_template_stops.created_at, route_template_stops.created_by_id
        Filter: (ANY (route_template_stops.route_template_id = (hashed SubPlan 2).col1))
        Rows Removed by Filter: 2
        SubPlan 2
          ->  Seq Scan on public.route_templates rt (actual rows=1 loops=1)
                Output: rt.id
                Filter: (((rt.org_id = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text)) AND (rt.org_id = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)))
                Rows Removed by Filter: 1
Query Identifier: 7721758030383192195
```

### `SUB-tm` — `TicketMessage` (REAL lane)

```sql
select count(*)::int as n from "TicketMessage"
```

```
Aggregate (actual rows=1 loops=1)
  Output: (count(*))::integer
  ->  Seq Scan on public."TicketMessage" (actual rows=0 loops=1)
        Output: "TicketMessage".id, "TicketMessage"."ticketId", "TicketMessage"."senderType", "TicketMessage"."senderLabel", "TicketMessage".body, "TicketMessage"."createdAt"
        Filter: ((ANY ("TicketMessage"."ticketId" = (hashed SubPlan 1).col1)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text))
        SubPlan 1
          ->  Seq Scan on public."SupportTicket" (never executed)
                Output: "SupportTicket".id
                Filter: ((("SupportTicket"."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text)) AND ("SupportTicket"."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)))
Query Identifier: -2905226352301673149
```

### `F-empty-inner` — `"Plan" x "Promo"` (EMPTY lane)

```sql
select count(*)::int as n from "Plan" p where exists (select 1 from "Promo" pr where pr.id = p.id and pr.id = current_tenant_id())
```

```
EXPLAIN RAISED TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
```

### `F-nonempty-inner` — `"Plan" x "Plan"` (EMPTY lane)

```sql
select count(*)::int as n from "Plan" p where exists (select 1 from "Plan" q where q.id = p.id and q.id = current_tenant_id())
```

```
EXPLAIN RAISED TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
```

### What the four plans show

- `carrier_documents` — correlated `SubPlan 1`, an **Index Scan on `"User"`
  per outer row** (`loops=2`). `current_tenant_id()` is inlined into the inner
  scan's `Filter`, so on the face of it it is a PER-ROW evaluation.
- `stops` and `route_template_stops` — the planner **de-correlated** both into
  a **hashed SubPlan**: one Seq Scan of the inner table with
  `current_tenant_id()` in its filter, hashed once, then `ANY (outer.key =
  (hashed SubPlan).col1)` on the outer scan.
- `TicketMessage` — an uncorrelated hashed SubPlan over `"SupportTicket"`,
  reported **`(never executed)`** because the outer table has 0 rows.

That last line is exactly the confound the plan warned about, and it is why Part
3 exists: `TicketMessage` in the EMPTY lane **still raised**, with a 0-row outer
AND a 0-row inner. A plan in which the function is never reached, and a statement
that raises anyway, cannot both be describing the same moment.

## Part 2 — finding F, the isolation and emptiness cells

Every cell STAGING / `app_user` / tripwire armed / `BEGIN … ROLLBACK`.

| cell | question | lane | verdict |
|---|---|---|---|
| `Q1-tm-plainexplain` | Q1 | EMPTY | **RAISES TC001** |
| `Q1-tm-analyze` | Q1 | EMPTY | **RAISES TC001** |
| `Q1-tm-plain-real` | Q1 | REAL | **RETURNS 1 ROWS** |
| `Q1-tm-exec` | Q1 | EMPTY | **RAISES TC001** |
| `Q1-tag-empty` | Q1 | EMPTY | **RAISES TC001** |
| `Q2-empty-inner` | Q2 | EMPTY | **RAISES TC001** |
| `Q2-empty-inner-explain` | Q2 | EMPTY | **RAISES TC001** |
| `Q2-nonempty-inner` | Q2 | EMPTY | **RAISES TC001** |
| `Q2-nonempty-inner-explain` | Q2 | EMPTY | **RAISES TC001** |
| `Q3-empty-outer` | Q3 | EMPTY | **RAISES TC001** |
| `Q3-empty-outer-uncorrelated` | Q3 | EMPTY | **RAISES TC001** |
| `Q3-empty-outer-uncorr-explain` | Q3 | EMPTY | **RAISES TC001** |
| `Q3-empty-outer-uncorr-empty-inner` | Q3 | EMPTY | **RAISES TC001** |

#### `Q1-tm-plainexplain` — **RAISES TC001**

EXPLAIN (no ANALYZE) — PLANS the statement, executes nothing

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "TicketMessage"
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "TicketMessage"
```

#### `Q1-tm-analyze` — **RAISES TC001**

EXPLAIN (ANALYZE) — plans AND executes

```sql
EXPLAIN (ANALYZE, VERBOSE, COSTS OFF, TIMING OFF, SUMMARY OFF) select count(*)::int as n from "TicketMessage"
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: EXPLAIN (ANALYZE, VERBOSE, COSTS OFF, TIMING OFF, SUMMARY OFF) select count(*)::int as n from "TicketMessage"
```

#### `Q1-tm-plain-real` — **RETURNS 1 ROWS**

EXPLAIN (no ANALYZE), REAL lane — the control: the same plan must be producible

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "TicketMessage"
```

```
Aggregate
  Output: (count(*))::integer
  ->  Seq Scan on public."TicketMessage"
        Output: "TicketMessage".id, "TicketMessage"."ticketId", "TicketMessage"."senderType", "TicketMessage"."senderLabel", "TicketMessage".body, "TicketMessage"."createdAt"
        Filter: ((ANY ("TicketMessage"."ticketId" = (hashed SubPlan 1).col1)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text))
        SubPlan 1
          ->  Seq Scan on public."SupportTicket"
                Output: "SupportTicket".id
                Filter: ((("SupportTicket"."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)) OR (current_setting('app.bypass_rls'::text, true) = 'on'::text)) AND ("SupportTicket"."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END)))
Query Identifier: -2905226352301673149
```

#### `Q1-tm-exec` — **RAISES TC001**

the bare statement again, for the record

```sql
select count(*)::int as n from "TicketMessage"
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: select count(*)::int as n from "TicketMessage"
```

#### `Q1-tag-empty` — **RAISES TC001**

quick-610 rule re-measured: an EMPTY table with a bare-equality policy

```sql
select count(*)::int as n from "Tag"
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: select count(*)::int as n from "Tag"
```

#### `Q2-empty-inner` — **RAISES TC001**

inner relation "Promo" is EMPTY (0 rows); tenant fn on a NON-join column (code)

```sql
select count(*)::int as n from "Plan" p where exists (select 1 from "Promo" pr where pr.id = p.id and pr.code = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: select count(*)::int as n from "Plan" p where exists (select 1 from "Promo" pr where pr.id = p.id and pr.code = current_tenant_id()::text)
```

#### `Q2-empty-inner-explain` — **RAISES TC001**

its plan, un-executed

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Plan" p where exists (select 1 from "Promo" pr where pr.id = p.id and pr.code = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Plan" p where exists (select 1 from "Promo" pr where pr.id = p.id and pr.code = current_tenant_id()::text)
```

#### `Q2-nonempty-inner` — **RAISES TC001**

THE COUNTER-ASSERTION — same shape, inner "Plan" has 3 rows. Must RAISE, or the cell above says nothing.

```sql
select count(*)::int as n from "Plan" p where exists (select 1 from "Plan" q where q.id = p.id and q.key = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: select count(*)::int as n from "Plan" p where exists (select 1 from "Plan" q where q.id = p.id and q.key = current_tenant_id()::text)
```

#### `Q2-nonempty-inner-explain` — **RAISES TC001**

its plan, un-executed

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Plan" p where exists (select 1 from "Plan" q where q.id = p.id and q.key = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Plan" p where exists (select 1 from "Plan" q where q.id = p.id and q.key = current_tenant_id()::text)
```

#### `Q3-empty-outer` — **RAISES TC001**

outer "Promo" is EMPTY (0 rows), inner "Plan" has 3 — does an empty outer suppress the raise?

```sql
select count(*)::int as n from "Promo" p where exists (select 1 from "Plan" q where q.id = p.id and q.key = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: select count(*)::int as n from "Promo" p where exists (select 1 from "Plan" q where q.id = p.id and q.key = current_tenant_id()::text)
```

#### `Q3-empty-outer-uncorrelated` — **RAISES TC001**

the TicketMessage shape reproduced: EMPTY outer, UNCORRELATED IN over a NON-empty inner

```sql
select count(*)::int as n from "Promo" p where p.id in (select q.id from "Plan" q where q.key = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: select count(*)::int as n from "Promo" p where p.id in (select q.id from "Plan" q where q.key = current_tenant_id()::text)
```

#### `Q3-empty-outer-uncorr-explain` — **RAISES TC001**

its plan, un-executed

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Promo" p where p.id in (select q.id from "Plan" q where q.key = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Promo" p where p.id in (select q.id from "Plan" q where q.key = current_tenant_id()::text)
```

#### `Q3-empty-outer-uncorr-empty-inner` — **RAISES TC001**

BOTH empty — the exact TicketMessage/SupportTicket configuration, outside RLS

```sql
select count(*)::int as n from "Promo" p where p.id in (select q.id from "Promo" q where q.code = current_tenant_id()::text)
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL: statement: select count(*)::int as n from "Promo" p where p.id in (select q.id from "Promo" q where q.code = current_tenant_id()::text)
```

## Part 3 — the MECHANISM. The raise is at PLAN TIME, and it has nothing to do with RLS.

| cell | what | lane | verdict |
|---|---|---|---|
| `M1-rlsoff-var-eq` | RLS-OFF table, `Var = current_tenant_id()`, PLAIN EXPLAIN (nothing executed) | EMPTY | **RAISES TC001** |
| `M1-rlsoff-var-eq-exec` | the same, EXECUTED | EMPTY | **RAISES TC001** |
| `M1-control-real` | THE CONTROL for M1 — same statement, REAL lane. Must NOT raise. | REAL | **RETURNS 1 ROWS** |
| `M2-norelation-plan` | NO relation, no Var to estimate against, PLAIN EXPLAIN | EMPTY | **RETURNS 1 ROWS** |
| `M3-norelation-exec` | THE COUNTER-ASSERTION for M2 — the same statement EXECUTED. Must raise. | EMPTY | **RAISES TC001** |
| `M4-empty-relation-plan` | RLS-OFF EMPTY relation (0 rows), `Var = current_tenant_id()`, PLAIN EXPLAIN | EMPTY | **RAISES TC001** |
| `M5-prepared-generic` | does a GENERIC plan avoid it? EXPLAIN (GENERIC_PLAN) on a parameterised statement | EMPTY | **RAISES TC001** |
| `M6-server-version` | server version, for the record | EMPTY | **RETURNS PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit ROWS** |

#### `M1-rlsoff-var-eq` — **RAISES TC001**

RLS-OFF table, `Var = current_tenant_id()`, PLAIN EXPLAIN (nothing executed)

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Plan" p where p.id = current_tenant_id()
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
```

#### `M1-rlsoff-var-eq-exec` — **RAISES TC001**

the same, EXECUTED

```sql
select count(*)::int as n from "Plan" p where p.id = current_tenant_id()
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
```

#### `M1-control-real` — **RETURNS 1 ROWS**

THE CONTROL for M1 — same statement, REAL lane. Must NOT raise.

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Plan" p where p.id = current_tenant_id()
```

```
Aggregate
  Output: (count(*))::integer
  ->  Index Only Scan using "Plan_pkey" on public."Plan" p
        Output: id
        Index Cond: (p.id = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END))
Query Identifier: -4013282776161284995
```

#### `M2-norelation-plan` — **RETURNS 1 ROWS**

NO relation, no Var to estimate against, PLAIN EXPLAIN

```sql
EXPLAIN (VERBOSE, COSTS OFF) select 1 as n where current_tenant_id() is not null
```

```
Result
  Output: 1
  One-Time Filter: (COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid, CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text) THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true)) ELSE NULL::uuid END) IS NOT NULL)
Query Identifier: -7483175894299388954
```

#### `M3-norelation-exec` — **RAISES TC001**

THE COUNTER-ASSERTION for M2 — the same statement EXECUTED. Must raise.

```sql
select 1 as n where current_tenant_id() is not null
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
```

#### `M4-empty-relation-plan` — **RAISES TC001**

RLS-OFF EMPTY relation (0 rows), `Var = current_tenant_id()`, PLAIN EXPLAIN

```sql
EXPLAIN (VERBOSE, COSTS OFF) select count(*)::int as n from "Promo" p where p.id = current_tenant_id()
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
```

#### `M5-prepared-generic` — **RAISES TC001**

does a GENERIC plan avoid it? EXPLAIN (GENERIC_PLAN) on a parameterised statement

```sql
EXPLAIN (GENERIC_PLAN, VERBOSE, COSTS OFF) select count(*)::int as n from "Plan" p where p.id = current_tenant_id() and p.key = $1
```

```
TC001: tenant context is required: app.current_tenant_id is the EMPTY STRING
```

#### `M6-server-version` — **RETURNS PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit ROWS**

server version, for the record

```sql
select version() as n
```

```
PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit
```

