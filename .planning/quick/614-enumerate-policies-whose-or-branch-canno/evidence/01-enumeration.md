# quick-614 evidence 01 — the catalog enumeration, BOTH databases

Re-run in THIS task's run. Counts are not inherited from quick-602/612/613.

**Instrument.** A plain `pg` client on each database's privileged (`postgres`)
session-mode URL, every statement a catalog `SELECT`, the whole run inside
`BEGIN; SET TRANSACTION READ ONLY; ... ROLLBACK`. The script lives in the
scratchpad, never in the repo, and never imports `scripts/_bootstrap-env`
(quick-607). Each lane refuses POSITIVELY on the ref it must name.

**The Supabase MCP `execute_sql` tool the plan named is NOT AVAILABLE in this
session** (`No such tool available: mcp__claude_ai_Supabase__execute_sql`). The
production enumeration was taken with the same read-only `pg` instrument as
staging instead — which is strictly better evidence, because both databases are
then measured by one instrument rather than two.

```
[db-target] project : oqdhberkghtnszrkdvfm (PRODUCTION)
[db-target] role    : postgres
[db-target] intent  : READ-ONLY catalog enumeration

[db-target] project : wyixpgunnjmzguhggocz (STAGING)
[db-target] role    : postgres
[db-target] intent  : READ-ONLY catalog enumeration
```

Server: `PostgreSQL 17.6 on x86_64-pc-linux-gnu, compiled by gcc (GCC) 15.2.0, 64-bit`

## 1. Totals

| metric | PRODUCTION | STAGING |
|---|---|---|
| policies in `public` | 186 | 186 |
| named `bypass_rls_policy` | 86 | 86 |
| distinct tables carrying any policy | 90 | 90 |
| distinct tables carrying `bypass_rls_policy` | 86 | 86 |
| policies whose `qual`/`with_check` names `current_tenant_id` | 96 | 96 |

**The two databases agree on every count**, and on the full text of every policy:
a byte-comparison of the sorted `(table, policy, cmd, class, has_bypass, qual,
with_check)` tuples across the two enumerations is **identical — 0 prod-only,
0 staging-only**.

## 2. Class counts

Classification rule, applied to `qual || ' ' || with_check` in this PRIORITY
order, first match wins; every matching flag is also recorded so a policy that is
two shapes at once cannot hide (none is, in this run):

| class | test |
|---|---|
| subquery | `/\bEXISTS\b|\bIN \(| = ANY\(|\bSELECT\b/i` |
| CASE | `/\bCASE\b/i` |
| COALESCE | `/\bCOALESCE\b/i` |
| OR | `/\bOR\b/i` |
| bare equality | everything else |

| class | PRODUCTION | STAGING |
|---|---|---|
| literal `OR` | 1 | 1 |
| `CASE` | 0 | 0 |
| `COALESCE` | 0 | 0 |
| subquery | 4 | 4 |
| bare equality | 91 | 91 |
| **total** | **96** | **96** |

A note on the `CASE`/`COALESCE` zeroes: both keywords appear inside
`current_tenant_id()`'s own BODY, not in any policy expression. The classifier
reads `pg_policies.qual`, which stores the CALL, so the function's internals do
not leak into the count. That is the right boundary — the question is which
POLICY shapes exist, not what the function they all call looks like inside.

## 3. Every non-bare-equality policy, full expression, never elided

### `AutomationRule` — `tenant_isolation_policy` (SELECT, PERMISSIVE, TO public)

- class: **or**
- table also carries `bypass_rls_policy`: **YES**

```sql
-- USING
((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))

-- WITH CHECK
(undeclared — derived from USING)
```

### `TicketMessage` — `tenant_isolation_policy` (ALL, PERMISSIVE, TO public)

- class: **subquery**
- table also carries `bypass_rls_policy`: **YES**

```sql
-- USING
("ticketId" IN ( SELECT "SupportTicket".id
   FROM "SupportTicket"
  WHERE ("SupportTicket"."tenantId" = current_tenant_id())))

-- WITH CHECK
(undeclared — derived from USING)
```

### `carrier_documents` — `tenant_isolation_policy` (ALL, PERMISSIVE, TO public)

- class: **subquery**
- table also carries `bypass_rls_policy`: **NO**

```sql
-- USING
(EXISTS ( SELECT 1
   FROM "User" u
  WHERE ((u.id = carrier_documents.uploaded_by) AND (u."tenantId" = current_tenant_id()))))

-- WITH CHECK
(EXISTS ( SELECT 1
   FROM "User" u
  WHERE ((u.id = carrier_documents.uploaded_by) AND (u."tenantId" = current_tenant_id()))))
```

### `route_template_stops` — `tenant_isolation_policy` (ALL, PERMISSIVE, TO public)

- class: **subquery**
- table also carries `bypass_rls_policy`: **NO**

```sql
-- USING
(EXISTS ( SELECT 1
   FROM route_templates rt
  WHERE ((rt.id = route_template_stops.route_template_id) AND (rt.org_id = current_tenant_id()))))

-- WITH CHECK
(EXISTS ( SELECT 1
   FROM route_templates rt
  WHERE ((rt.id = route_template_stops.route_template_id) AND (rt.org_id = current_tenant_id()))))
```

### `stops` — `tenant_isolation_policy` (ALL, PERMISSIVE, TO public)

- class: **subquery**
- table also carries `bypass_rls_policy`: **NO**

```sql
-- USING
(EXISTS ( SELECT 1
   FROM dispatches d
  WHERE ((d.id = stops.dispatch_id) AND (d.org_id = current_tenant_id()))))

-- WITH CHECK
(EXISTS ( SELECT 1
   FROM dispatches d
  WHERE ((d.id = stops.dispatch_id) AND (d.org_id = current_tenant_id()))))
```

### Finding D — three of the four subquery tables have NO escape hatch at all

| table | carries `bypass_rls_policy` |
|---|---|
| `TicketMessage` | **yes** |
| `carrier_documents` | **NO** |
| `route_template_stops` | **NO** |
| `stops` | **NO** |

`carrier_documents`, `route_template_stops` and `stops` carry no
`bypass_rls_policy`, so neither the `@bypass_rls` escape nor the tripwire's own
bypass exemption is available to them. Only `TicketMessage` has one.

## 4. Bare-equality column spellings

The tenant column is spelled four different ways, which is why the probe sample
had to cover all four rather than pick six tables at random:

| spelling | policies |
|---|---|
| `"tenantId"` | 56 |
| `org_id` | 20 |
| `tenant_id` | 10 |
| `id` (on `Tenant` itself) | 2 |
| INSERT-only, `WITH CHECK` and no `USING` | 3 |

The three with no `USING` are `AutomationRule.automation_rule_insert_policy`,
`Tenant.tenant_bootstrap_insert` and
`in_app_notifications.in_app_notifications_insert_policy`.

## 5. RLS-enabled tables carrying NO `current_tenant_id` policy

- `_prisma_migrations` — 0 policies, forced=false

**Exactly one**, and it is `_prisma_migrations` — RLS enabled, zero policies, not
forced, and `app_user` holds no grant on it (DEC-17). That is why the plan's
requested control ("an RLS-enabled table with no `current_tenant_id()` policy,
must not raise and should return rows") **cannot be satisfied as specified**; it
was measured anyway (cell `CTL-migrations`, `RAISES 42501`) and `"Plan"`
(RLS OFF, 3 rows, `SELECT` granted) was substituted. The substitution is
recorded rather than silently made.

## 6. The state correction — the `_prisma_migrations` ledger

DEC-17 rule honoured: a known-good SENTINEL row was read back BEFORE any empty
result would have been treated as absence. All three rows below are present on
both databases, on a `postgres` connection (which is not subject to the
zero-policy RLS on that table).

### PRODUCTION

| migration | applied_steps_count | checksum |
|---|---|---|
| `20260914180000_tenant_context_tripwire` | **1** | `manual` |
| `20260915140000_automation_rule_per_command_policy_split` | **1** | `manual` |
| `20260915150000_grant_automation_rule_to_app_admin` | **1** | `manual` |

### STAGING

| migration | applied_steps_count | checksum |
|---|---|---|
| `20260914180000_tenant_context_tripwire` | **0** | `ad2f6892ede6f5c36e71f87b93c709e66ec37885f181aeb85dcce9a886f724dc` |
| `20260915140000_automation_rule_per_command_policy_split` | **0** | `546a2913715646cda77d3b0f942fd2f06a928721311895aa66877aa7df981b2d` |
| `20260915150000_grant_automation_rule_to_app_admin` | **0** | `27619f74901178a04d6eaa3d10dc449e5882ec37b33369c8f5da630e9111d949` |

Per DEC-17 the two signatures mean opposite things and they are the evidence for
the state correction:

- `applied_steps_count = 1` with `checksum = 'manual'` is what **`scripts/migrate.mjs`
  actually executing the file** writes. All three rows on PRODUCTION carry it.
- `applied_steps_count = 0` with a real SHA-256 is the repo's **hand-mirrored**
  resolved-not-run convention. All three rows on STAGING carry it, because
  quick-602/612/613 applied the DDL out of band and wrote the ledger row by hand.

So **production is no longer "awaiting deploy"** — a human ran `vercel --prod`
and `migrate.mjs` applied all three. This supersedes quick-612 §9 item 1 and
quick-613 §12 items 1 and 7.

### Production ledger head (5 newest by `finished_at`)

| migration | steps | checksum |
|---|---|---|
| `20260915150000_grant_automation_rule_to_app_admin` | 1 | `manual` |
| `20260915140000_automation_rule_per_command_policy_split` | 1 | `manual` |
| `20260915130000_grant_playbook_notification_to_app_admin` | 1 | `manual` |
| `20260915120000_document_column_drift_staging_parity` | 1 | `manual` |
| `20260914180000_tenant_context_tripwire` | 1 | `manual` |

## 7. The tripwire function is installed on BOTH databases

`public.tenant_context_required(text)` present: PRODUCTION **YES**,
STAGING **YES**.

Installed is not the same as ARMED. The flag `app.tenant_context_tripwire` is a
session GUC set only by `lib/db/prisma.ts`'s `pool.on('connect')` when
`shouldArmTripwire()` returns true, which requires the STAGING project ref in the
connection string. On production the function exists and its branch is never
taken. Both privileged sessions here read the flag as `NULL` (unset).
