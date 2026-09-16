# quick-614 evidence 03 — the probe matrix, VERBATIM

**Target.** STAGING `wyixpgunnjmzguhggocz`, role `app_user`, `rolbypassrls=false`.
**Tripwire.** Session GUC `app.tenant_context_tripwire` armed by the probe itself and
**read back**: `"on"`. The env var
`TENANT_CONTEXT_TRIPWIRE` in `apps/web/.env.staging` reads
`"on"`. **Neither was changed.**

> **`set_config(...)` is a SESSION GUC, not a database write.** It alters this
> backend's session state, persists no row, touches no catalog and dies with the
> connection. The same is true of the bypass cells' `app.bypass_rls`. Nothing on
> either database was written by this task.

**Isolation.** One transaction PER CELL — `BEGIN; SET TRANSACTION READ ONLY; …;
ROLLBACK`. Never one transaction for the run: a `TC001` aborts the transaction
and the next statement on it would return `25P02`, silently misreporting every
subsequent cell as a different failure (quick-611's class).

**SQLSTATE** is walked off the **cause chain** (quick-610) and `TC001` is
recognised by **CODE, never by message prose** (quick-602). On this raw `pg`
client the code happens to sit at the top level too, and the record below prints
`err.code` alongside the walked value so the two can be compared.

**Scalars, not `rowCount`.** Every cell is a `count(*)`; the reported value is
the SCALAR. `rowCount` is 1 for every count query, so a refused read would
render exactly like a good one.

**REAL lane tenant:** `b5623cdd-dc19-4900-b75d-0ecfcaf191b8` (Staging Alpha Carriers) —
discovered from the privileged connection, never hardcoded.

## Privileged row counts (read on the `postgres` connection)

| table | rows |
|---|---|
| `carrier_documents` | 2 |
| `User` | 10 |
| `stops` | 4 |
| `dispatches` | 2 |
| `route_template_stops` | 4 |
| `route_templates` | 2 |
| `TicketMessage` | 0 |
| `SupportTicket` | 0 |
| `AutomationRule` | 6 |
| `Tenant` | 2 |
| `carrier_trucks` | 3 |
| `carrier_drivers` | 5 |
| `audit_log` | 0 |
| `Tag` | 0 |
| `Plan` | 3 |
| `Promo` | 0 |
| `_prisma_migrations` | 160 |

## The matrix

| cell | table | shape | lane | outer rows | inner rows | verdict |
|---|---|---|---|---|---|---|
| `OR-1a` | `AutomationRule` | literal OR | EMPTY | — | — | **RAISES TC001** |
| `OR-1a` | `AutomationRule` | literal OR | REAL | — | — | **RETURNS 6 ROWS** |
| `OR-1b` | `AutomationRule` | literal OR | EMPTY | — | — | **RAISES TC001** |
| `OR-1b` | `AutomationRule` | literal OR | REAL | — | — | **RETURNS 0 ROWS** |
| `SUB-cd` | `carrier_documents` | correlated EXISTS over "User" | EMPTY | 2 | 10 | **RAISES TC001** |
| `SUB-cd` | `carrier_documents` | correlated EXISTS over "User" | REAL | 2 | 10 | **RETURNS 1 ROWS** |
| `SUB-st` | `stops` | correlated EXISTS over dispatches | EMPTY | 4 | 2 | **RAISES TC001** |
| `SUB-st` | `stops` | correlated EXISTS over dispatches | REAL | 4 | 2 | **RETURNS 2 ROWS** |
| `SUB-rts` | `route_template_stops` | correlated EXISTS over route_templates | EMPTY | 4 | 2 | **RAISES TC001** |
| `SUB-rts` | `route_template_stops` | correlated EXISTS over route_templates | REAL | 4 | 2 | **RETURNS 2 ROWS** |
| `SUB-tm` | `TicketMessage` | UNCORRELATED IN (SELECT ...) over "SupportTicket" | EMPTY | 0 | 0 | **RAISES TC001** |
| `SUB-tm` | `TicketMessage` | UNCORRELATED IN (SELECT ...) over "SupportTicket" | REAL | 0 | 0 | **RETURNS 0 ROWS** |
| `F-empty-inner` | `"Plan" x "Promo"` | correlated EXISTS, INNER RELATION EMPTY | EMPTY | — | — | **RAISES TC001** |
| `F-nonempty-inner` | `"Plan" x "Plan"` | correlated EXISTS, INNER RELATION NON-EMPTY | EMPTY | — | — | **RAISES TC001** |
| `BE-tenant` | `Tenant` | id = current_tenant_id() | EMPTY | — | — | **RAISES TC001** |
| `BE-tenant` | `Tenant` | id = current_tenant_id() | REAL | — | — | **RETURNS 1 ROWS** |
| `BE-user` | `User` | "tenantId" = current_tenant_id() | EMPTY | — | — | **RAISES TC001** |
| `BE-user` | `User` | "tenantId" = current_tenant_id() | REAL | — | — | **RETURNS 6 ROWS** |
| `BE-trucks` | `carrier_trucks` | org_id = current_tenant_id() | EMPTY | — | — | **RAISES TC001** |
| `BE-trucks` | `carrier_trucks` | org_id = current_tenant_id() | REAL | — | — | **RETURNS 2 ROWS** |
| `BE-drivers` | `carrier_drivers` | org_id = current_tenant_id() | EMPTY | — | — | **RAISES TC001** |
| `BE-drivers` | `carrier_drivers` | org_id = current_tenant_id() | REAL | — | — | **RETURNS 3 ROWS** |
| `BE-audit` | `audit_log` | tenant_id = current_tenant_id() | EMPTY | — | — | **RAISES TC001** |
| `BE-audit` | `audit_log` | tenant_id = current_tenant_id() | REAL | — | — | **RETURNS 0 ROWS** |
| `BE-tag` | `Tag` | "tenantId" = current_tenant_id()  [rewritten by quick-602] | EMPTY | — | — | **RAISES TC001** |
| `BE-tag` | `Tag` | "tenantId" = current_tenant_id()  [rewritten by quick-602] | REAL | — | — | **RETURNS 0 ROWS** |
| `BYP-on` | `carrier_trucks` | top-level permissive OR, bypass ON | BYPASS | — | — | **RETURNS 3 ROWS** |
| `BYP-on-tag` | `Tag` | top-level permissive OR, bypass ON | BYPASS | — | — | **RETURNS 0 ROWS** |
| `CTL-1` | `(none)` | no relation at all | EMPTY | — | — | **RETURNS 1 ROWS** |
| `CTL-plan` | `Plan` | no RLS | EMPTY | — | — | **RETURNS 3 ROWS** |
| `CTL-migrations` | `_prisma_migrations` | RLS on / no current_tenant_id policy | EMPTY | — | — | **RAISES 42501** |

**15 RAISES · 16 RETURNS · 31 cells.**

## Every cell, verbatim

### `OR-1a` — EMPTY lane — **RAISES TC001**

- table: `AutomationRule` · policy: tenant_isolation_policy (SELECT) · shape: literal OR
- note: SYSTEM-scoped rows — the rows the tenant-independent branch would have to save
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "AutomationRule" where scope = 'SYSTEM'
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "AutomationRule" where scope = 'SYSTEM'
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `OR-1a` — REAL lane — **RETURNS 6 ROWS**

- table: `AutomationRule` · policy: tenant_isolation_policy (SELECT) · shape: literal OR
- note: SYSTEM-scoped rows — the rows the tenant-independent branch would have to save
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "AutomationRule" where scope = 'SYSTEM'
```

```
SCALAR returned: 6   (rowCount was 1 — NOT the answer)
```

### `OR-1b` — EMPTY lane — **RAISES TC001**

- table: `AutomationRule` · policy: tenant_isolation_policy (SELECT) · shape: literal OR
- note: tenant-scoped rows
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "AutomationRule" where scope <> 'SYSTEM'
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "AutomationRule" where scope <> 'SYSTEM'
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `OR-1b` — REAL lane — **RETURNS 0 ROWS**

- table: `AutomationRule` · policy: tenant_isolation_policy (SELECT) · shape: literal OR
- note: tenant-scoped rows
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "AutomationRule" where scope <> 'SYSTEM'
```

```
SCALAR returned: 0   (rowCount was 1 — NOT the answer)
```

### `SUB-cd` — EMPTY lane — **RAISES TC001**

- table: `carrier_documents` · policy: tenant_isolation_policy (ALL) · shape: correlated EXISTS over "User"
- **outer `carrier_documents` = 2 rows · inner `"User"` = 10 rows**
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from carrier_documents
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from carrier_documents
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `SUB-cd` — REAL lane — **RETURNS 1 ROWS**

- table: `carrier_documents` · policy: tenant_isolation_policy (ALL) · shape: correlated EXISTS over "User"
- **outer `carrier_documents` = 2 rows · inner `"User"` = 10 rows**
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from carrier_documents
```

```
SCALAR returned: 1   (rowCount was 1 — NOT the answer)
```

### `SUB-st` — EMPTY lane — **RAISES TC001**

- table: `stops` · policy: tenant_isolation_policy (ALL) · shape: correlated EXISTS over dispatches
- **outer `stops` = 4 rows · inner `dispatches` = 2 rows**
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from stops
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from stops
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `SUB-st` — REAL lane — **RETURNS 2 ROWS**

- table: `stops` · policy: tenant_isolation_policy (ALL) · shape: correlated EXISTS over dispatches
- **outer `stops` = 4 rows · inner `dispatches` = 2 rows**
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from stops
```

```
SCALAR returned: 2   (rowCount was 1 — NOT the answer)
```

### `SUB-rts` — EMPTY lane — **RAISES TC001**

- table: `route_template_stops` · policy: tenant_isolation_policy (ALL) · shape: correlated EXISTS over route_templates
- **outer `route_template_stops` = 4 rows · inner `route_templates` = 2 rows**
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from route_template_stops
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from route_template_stops
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `SUB-rts` — REAL lane — **RETURNS 2 ROWS**

- table: `route_template_stops` · policy: tenant_isolation_policy (ALL) · shape: correlated EXISTS over route_templates
- **outer `route_template_stops` = 4 rows · inner `route_templates` = 2 rows**
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from route_template_stops
```

```
SCALAR returned: 2   (rowCount was 1 — NOT the answer)
```

### `SUB-tm` — EMPTY lane — **RAISES TC001**

- table: `TicketMessage` · policy: tenant_isolation_policy (ALL) · shape: UNCORRELATED IN (SELECT ...) over "SupportTicket"
- **outer `"TicketMessage"` = 0 rows · inner `"SupportTicket"` = 0 rows**
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "TicketMessage"
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "TicketMessage"
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `SUB-tm` — REAL lane — **RETURNS 0 ROWS**

- table: `TicketMessage` · policy: tenant_isolation_policy (ALL) · shape: UNCORRELATED IN (SELECT ...) over "SupportTicket"
- **outer `"TicketMessage"` = 0 rows · inner `"SupportTicket"` = 0 rows**
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "TicketMessage"
```

```
SCALAR returned: 0   (rowCount was 1 — NOT the answer)
```

### `F-empty-inner` — EMPTY lane — **RAISES TC001**

- table: `"Plan" x "Promo"` · policy: (none — RLS off on both) · shape: correlated EXISTS, INNER RELATION EMPTY
- note: does an EXISTS evaluate current_tenant_id() when the inner scan yields nothing?
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Plan" p where exists (select 1 from "Promo" pr where pr.id = p.id and pr.id = current_tenant_id())
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "Plan" p where exists (select 1 from "Promo" pr where pr.id = p.id and pr.id = current_tenant_id())
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `F-nonempty-inner` — EMPTY lane — **RAISES TC001**

- table: `"Plan" x "Plan"` · policy: (none — RLS off) · shape: correlated EXISTS, INNER RELATION NON-EMPTY
- note: the counter-assertion: without it, "no raise" above is satisfied by a shape that never raises
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Plan" p where exists (select 1 from "Plan" q where q.id = p.id and q.id = current_tenant_id())
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "Plan" p where exists (select 1 from "Plan" q where q.id = p.id and q.id = current_tenant_id())
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `BE-tenant` — EMPTY lane — **RAISES TC001**

- table: `Tenant` · policy: tenant_self_read (SELECT) · shape: id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Tenant"
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "Tenant"
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `BE-tenant` — REAL lane — **RETURNS 1 ROWS**

- table: `Tenant` · policy: tenant_self_read (SELECT) · shape: id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Tenant"
```

```
SCALAR returned: 1   (rowCount was 1 — NOT the answer)
```

### `BE-user` — EMPTY lane — **RAISES TC001**

- table: `User` · policy: tenant_isolation_policy (ALL) · shape: "tenantId" = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "User"
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "User"
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `BE-user` — REAL lane — **RETURNS 6 ROWS**

- table: `User` · policy: tenant_isolation_policy (ALL) · shape: "tenantId" = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "User"
```

```
SCALAR returned: 6   (rowCount was 1 — NOT the answer)
```

### `BE-trucks` — EMPTY lane — **RAISES TC001**

- table: `carrier_trucks` · policy: tenant_isolation_policy (ALL) · shape: org_id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from carrier_trucks
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from carrier_trucks
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `BE-trucks` — REAL lane — **RETURNS 2 ROWS**

- table: `carrier_trucks` · policy: tenant_isolation_policy (ALL) · shape: org_id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from carrier_trucks
```

```
SCALAR returned: 2   (rowCount was 1 — NOT the answer)
```

### `BE-drivers` — EMPTY lane — **RAISES TC001**

- table: `carrier_drivers` · policy: tenant_isolation_policy (ALL) · shape: org_id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from carrier_drivers
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from carrier_drivers
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `BE-drivers` — REAL lane — **RETURNS 3 ROWS**

- table: `carrier_drivers` · policy: tenant_isolation_policy (ALL) · shape: org_id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from carrier_drivers
```

```
SCALAR returned: 3   (rowCount was 1 — NOT the answer)
```

### `BE-audit` — EMPTY lane — **RAISES TC001**

- table: `audit_log` · policy: tenant_isolation_policy (SELECT) · shape: tenant_id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from audit_log
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from audit_log
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `BE-audit` — REAL lane — **RETURNS 0 ROWS**

- table: `audit_log` · policy: tenant_isolation_policy (SELECT) · shape: tenant_id = current_tenant_id()
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from audit_log
```

```
SCALAR returned: 0   (rowCount was 1 — NOT the answer)
```

### `BE-tag` — EMPTY lane — **RAISES TC001**

- table: `Tag` · policy: tenant_isolation_policy (ALL) · shape: "tenantId" = current_tenant_id()  [rewritten by quick-602]
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Tag"
```

```
SQLSTATE (walked off cause chain): TC001
err.code (top level, for comparison): TC001
MESSAGE: tenant context is required: app.current_tenant_id is the EMPTY STRING
DETAIL : statement: select count(*)::int as n from "Tag"
HINT   : This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection.
```

### `BE-tag` — REAL lane — **RETURNS 0 ROWS**

- table: `Tag` · policy: tenant_isolation_policy (ALL) · shape: "tenantId" = current_tenant_id()  [rewritten by quick-602]
- GUCs seen inside the transaction: `app.current_tenant_id="b5623cdd-dc19-4900-b75d-0ecfcaf191b8"` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Tag"
```

```
SCALAR returned: 0   (rowCount was 1 — NOT the answer)
```

### `BYP-on` — BYPASS lane — **RETURNS 3 ROWS**

- table: `carrier_trucks` · policy: bypass_rls_policy OR tenant_isolation_policy · shape: top-level permissive OR, bypass ON
- note: tenant GUC EMPTY, app.bypass_rls = on
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="on"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from carrier_trucks
```

```
SCALAR returned: 3   (rowCount was 1 — NOT the answer)
```

### `BYP-on-tag` — BYPASS lane — **RETURNS 0 ROWS**

- table: `Tag` · policy: bypass_rls_policy OR tenant_isolation_policy · shape: top-level permissive OR, bypass ON
- note: the quick-602-rewritten policy, tenant GUC EMPTY, app.bypass_rls = on
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="on"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Tag"
```

```
SCALAR returned: 0   (rowCount was 1 — NOT the answer)
```

### `CTL-1` — EMPTY lane — **RETURNS 1 ROWS**

- table: `(none)` · policy: (none) · shape: no relation at all
- note: MUST NOT RAISE — rules out a connection that raises on everything
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select 1::int as n
```

```
SCALAR returned: 1   (rowCount was 1 — NOT the answer)
```

### `CTL-plan` — EMPTY lane — **RETURNS 3 ROWS**

- table: `Plan` · policy: (none — RLS OFF) · shape: no RLS
- note: MUST NOT RAISE and MUST RETURN ROWS under the EMPTY tenant GUC
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from "Plan"
```

```
SCALAR returned: 3   (rowCount was 1 — NOT the answer)
```

### `CTL-migrations` — EMPTY lane — **RAISES 42501**

- table: `_prisma_migrations` · policy: (RLS ENABLED, ZERO policies) · shape: RLS on / no current_tenant_id policy
- note: the plan asked for an RLS-enabled table with no current_tenant_id policy; this is the ONLY one, and app_user holds NO GRANT on it (DEC-17). Measured so the substitution is evidenced.
- GUCs seen inside the transaction: `app.current_tenant_id=""` · `app.bypass_rls="off"` · `app.tenant_context_tripwire="on"`

```sql
select count(*)::int as n from _prisma_migrations
```

```
SQLSTATE (walked off cause chain): 42501
err.code (top level, for comparison): 42501
MESSAGE: permission denied for table _prisma_migrations
DETAIL : (none)
HINT   : (none)
```

