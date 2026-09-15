# quick-602 — step 4: EXECUTION sweep

Generated 2026-09-15T05:35:41.551Z against staging (`wyixpgunnjmzguhggocz`) as `app_user`, tripwire ON.

## 1. Safety-rail assertions

```
SAFETY: outbound email/push variables absent: YES
SAFETY: application pool connected as app_user / postgres (rolbypassrls=false)
SAFETY: tripwire flag on the application connection reads "on"
SAFETY: row-count snapshot taken over 16 tables
ENUMERATION: 14 directories under src/app/api/cron — equality assertion vs 14: PASS
FIXTURE: tenant 9034f751-31dc-456e-94ea-4b04a86c7176
SAFETY: row-count changes across the sweep: NONE
SAFETY: after the sweep, a fresh app_user connection reads the tripwire flag as null
```

## 2. Entry points INVOKED — by name

| entry point | population | mechanism | verdict | dbTouched | queries | detail |
|---|---|---|---|---|---|---|
| `api/cron/auto-close-tickets/route.ts:GET` | cron (in-process) | getAdminDb | **RAISED_TC001** | true | 1 | HTTP 500 {"success":false,"error":"PrismaClientKnownRequestError: \nInvalid `prisma.$queryRaw()` invocation:\n\n\nRaw query failed. Code: `TC001`. Message: `tenant context is required: app.current_tenant_id is the EMPTY STRING`"} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/automations/route.ts:GET` | cron (in-process) | getTenantPrisma* | **RAISED_TC001** | true | 1 | HTTP 500 {"ok":false,"error":"tenant context is required: app.current_tenant_id is the EMPTY STRING"} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/carrier-auto-dispatch/route.ts:GET` | cron (in-process) | app.bypass_rls + after() | **RAISED_TC001** | true | 1 | HTTP 500 {"success":false,"error":"Failed to fetch tenants"} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/carrier-compliance-alerts/route.ts:GET` | cron (in-process) | app.bypass_rls | **COMPLETED** | true | 1 | HTTP 500 {"success":false,"error":"Failed to initialize log table"} |
| `api/cron/cleanup-quarantine/route.ts:GET` | cron (in-process) | no DB import | **OTHER_FAILURE** | false | 0 |  S3_BUCKET environment variable is required |
| `api/cron/digest-compliance-30day/route.ts:GET` | cron (in-process) | app.bypass_rls + getAdminDb | **RAISED_TC001** | true | 2 | HTTP 200 {"success":true,"processedTenants":2,"sent":0,"skipped":0,"failed":2} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/digest-daily-driver/route.ts:GET` | cron (in-process) | app.bypass_rls + getAdminDb | **RAISED_TC001** | true | 2 | HTTP 200 {"success":true,"processedTenants":2,"sent":0,"skipped":0,"failed":2} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/digest-weekly-owner/route.ts:GET` | cron (in-process) | app.bypass_rls + getAdminDb | **RAISED_TC001** | true | 2 | HTTP 200 {"success":true,"processedTenants":2,"sent":0,"skipped":0,"failed":2} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/mark-overdue-invoices/route.ts:GET` | cron (in-process) | getAdminDb | **COMPLETED** | false | 0 | HTTP 200 {"success":true,"markedOverdue":0} |
| `api/cron/purge-deleted/route.ts:GET` | cron (in-process) | bare prisma | **RAISED_TC001** | true | 7 | HTTP 200 {"success":true,"totalPurged":0,"results":{"CarrierLoad":-1,"Trip":-1,"CarrierContract":-1,"CarrierClient":-1,"CarrierDriver":-1,"CarrierTruck":-1,"Route":-1}} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/send-reminders/route.ts:GET` | cron (in-process) | getAdminDb | **RAISED_TC001** | true | 6 | HTTP 200 {"success":true,"processedTenants":2,"maintenance":{"sent":0,"skipped":0,"failed":0},"documents":{"sent":0,"skipped":0,"failed":0},"driverDocuments":{"sent":0,"skipped":0,"failed":0}} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/trip-reminders/route.ts:GET` | cron (in-process) | getTenantPrisma* | **RAISED_TC001** | true | 1 | HTTP 500 {"ok":false,"error":"Trip reminder run failed"} \| TC001 SWALLOWED by the route (detectedVia: driver rejection) |
| `api/cron/workflow-digest/route.ts:GET` | cron (in-process) | app.bypass_rls + getAdminDb | **COMPLETED** | false | 0 | HTTP 200 {"ok":true,"tenantsSent":0,"tenantsSkipped":0,"tenantsErrored":0} |
| `api/cron/workflow-notifications/route.ts:GET` | cron (in-process) | getTenantPrisma* + getAdminDb | **COMPLETED** | false | 0 | HTTP 200 {"ok":true,"stats":{"overdueSent":0,"overdueErrors":0,"blockedEmailsSent":0,"blockedEmailErrors":0}} |
| `lib/db/prisma.ts:prisma (bare client) — tag.count() with NO tenant context` | lib/ (expected-to-raise) | bare client / no tenant context | **RAISED_TC001** | true | 1 | detectedVia: driver rejection |
| `lib/db/prisma.ts:prisma (bare client) — appEvent.findMany() with NO tenant context` | lib/ (expected-to-raise) | bare client / no tenant context | **RAISED_TC001** | true | 1 | detectedVia: driver rejection |
| `lib/auth/supabase.ts:getCurrentUser()` | lib/ (expected-to-raise) | bare client / no tenant context | **OTHER_FAILURE** | false | 0 |  `cookies` was called outside a request scope. Read more: https://nextjs.org/docs/messages/next-dynamic-api-wrong-context |
| `lib/notifications/dispatcher.ts:dispatchNotification(tenantId, …) — explicit tenantId, BARE client` | lib/ (expected-to-raise) | bare client / no tenant context | **OTHER_FAILURE** | false | 0 |  Cannot read properties of undefined (reading 'prismaClient') |
| `lib/automations/evaluator.ts:runEvaluator()` | lib/ (expected-to-raise) | bare client / no tenant context | **RAISED_TC001** | true | 1 | detectedVia: driver rejection |
| `app/api/auth/login/route.ts:POST` | lib/ (expected-to-raise) | bare client / no tenant context | **COMPLETED** | false | 0 | HTTP 500 {"error":"An error occurred during login"} |
| `lib/onboarding/onboarding-flags.ts:getOnboardingFlags(tenantId)` | lib/ (must-not-raise) | acquires a tenant client | **COMPLETED** | true | 7 | {"hasClient":false,"hasContract":false,"hasLoad":false,"hasTrip":false} |
| `lib/onboarding/hydrate-tenant.ts:hydrateTenant(tenantId)` | lib/ (must-not-raise) | acquires a tenant client | **OTHER_FAILURE** | true | 5 | P2025  Invalid `tx.user.findFirstOrThrow()` invocation in C:\Users\sammy\Projects\DriveCommand\apps\web\src\lib\onboarding\hydrate-tenant.ts:29:37    26 const { tenant, ownerUser } = await prisma.$transaction(async (tx) => {   27   await setTransactionTenantId(tx, tenantId);   28   const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: tenantId } }); → 29   const ownerUser = await tx.user.findF |
| `lib/onboarding/confirm-tenant-email.ts:confirmTenantEmail(tenantId)` | lib/ (must-not-raise) | acquires a tenant client | **COMPLETED** | true | 4 | status=already-confirmed |
| `lib/context/tenant-context.ts:getTenantPrismaForOrg(tenantId) + a model read` | lib/ (must-not-raise) | acquires a tenant client | **COMPLETED** | true | 4 | tag.count=1 |

### TC001 payloads, quoted

**api/cron/auto-close-tickets/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: \n      SELECT st.id, st.\"ticketNumber\"\n      FROM \"SupportTicket\" st\n      WHERE st.status = 'RESOLVED'\n        AND st.\"updatedAt\" < $1\n        AND NOT EXISTS (\n          SELECT 1 FROM \"TicketMessage\" tm\n          WHERE tm.\"ticketId\" = st.id\n            AND tm.\"senderType\" = 'OWNER'\n            AND tm.\"createdAt\" > $2\n        )\n    ",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/automations/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"AutomationRule\".\"id\", \"public\".\"AutomationRule\".\"isActive\" FROM \"public\".\"AutomationRule\" WHERE (\"public\".\"AutomationRule\".\"key\" = $1 AND 1=1) LIMIT $2 OFFSET $3",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/carrier-auto-dispatch/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"Tenant\".\"id\", \"public\".\"Tenant\".\"name\" FROM \"public\".\"Tenant\" WHERE (\"public\".\"Tenant\".\"isActive\" = $1 AND EXISTS(SELECT \"t0\".\"org_id\" FROM \"public\".\"route_templates\" AS \"t0\" WHERE (\"t0\".\"active\" = $2 AND (\"public\".\"Tenant\".\"id\") = (\"t0\".\"org_id\") AND \"t0\".\"org_id\" IS NOT NULL))) OFFSET $3",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/digest-compliance-30day/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"User\".\"id\", \"public\".\"User\".\"email\", \"public\".\"User\".\"firstName\" FROM \"public\".\"User\" WHERE (\"public\".\"User\".\"tenantId\" = $1 AND \"public\".\"User\".\"tenantId\" = $2 AND \"public\".\"User\".\"role\" = CAST($3::text AS \"public\".\"UserRole\") AND \"public\".\"User\".\"isActive\" = $4) OFFSET $5",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/digest-daily-driver/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"User\".\"id\", \"public\".\"User\".\"email\", \"public\".\"User\".\"firstName\" FROM \"public\".\"User\" WHERE (\"public\".\"User\".\"tenantId\" = $1 AND \"public\".\"User\".\"tenantId\" = $2 AND \"public\".\"User\".\"role\" = CAST($3::text AS \"public\".\"UserRole\") AND \"public\".\"User\".\"isActive\" = $4) OFFSET $5",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/digest-weekly-owner/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"User\".\"id\", \"public\".\"User\".\"email\", \"public\".\"User\".\"firstName\" FROM \"public\".\"User\" WHERE (\"public\".\"User\".\"tenantId\" = $1 AND \"public\".\"User\".\"tenantId\" = $2 AND \"public\".\"User\".\"role\" = CAST($3::text AS \"public\".\"UserRole\") AND \"public\".\"User\".\"isActive\" = $4) OFFSET $5",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/purge-deleted/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: DELETE FROM \"public\".\"loads\" WHERE (\"public\".\"loads\".\"deleted_at\" IS NOT NULL AND \"public\".\"loads\".\"deleted_at\" < $1)",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/send-reminders/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"ScheduledService\".\"id\", \"public\".\"ScheduledService\".\"tenantId\", \"public\".\"ScheduledService\".\"truckId\", \"public\".\"ScheduledService\".\"serviceType\", \"public\".\"ScheduledService\".\"intervalDays\", \"public\".\"ScheduledService\".\"intervalMiles\", \"public\".\"ScheduledService\".\"baselineDate\", \"public\".\"ScheduledService\".\"baselineOdometer\", \"public\".\"ScheduledService\".\"notes\", \"public\".\"ScheduledService\".\"isCompleted\", \"public\".\"ScheduledService\".\"completedAt\", \"public\".\"ScheduledService\".\"createdById\", \"public\".\"ScheduledService\".\"updatedById\", \"public\".\"ScheduledService\".\"createdAt\", \"public\".\"ScheduledService\".\"updatedAt\" FROM \"public\".\"ScheduledService\" WHERE (\"public\".\"ScheduledService\".\"tenantId\" = $1 AND \"public\".\"ScheduledService\".\"isCompleted\" = $2) OFFSET $3",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**api/cron/trip-reminders/route.ts:GET**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"Tenant\".\"id\" FROM \"public\".\"Tenant\" WHERE \"public\".\"Tenant\".\"isActive\" = $1 OFFSET $2",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**lib/db/prisma.ts:prisma (bare client) — tag.count() with NO tenant context**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"Truck\".\"id\", \"public\".\"Truck\".\"make\", \"public\".\"Truck\".\"model\", \"public\".\"Truck\".\"year\", \"public\".\"Truck\".\"documentMetadata\" FROM \"public\".\"Truck\" WHERE \"public\".\"Truck\".\"tenantId\" = $1 OFFSET $2",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**lib/db/prisma.ts:prisma (bare client) — appEvent.findMany() with NO tenant context**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"AppEvent\".\"id\", \"public\".\"AppEvent\".\"tenantId\", \"public\".\"AppEvent\".\"userId\", \"public\".\"AppEvent\".\"eventType\", \"public\".\"AppEvent\".\"properties\", \"public\".\"AppEvent\".\"createdAt\" FROM \"public\".\"AppEvent\" WHERE 1=1 ORDER BY \"public\".\"AppEvent\".\"id\" ASC LIMIT $1 OFFSET $2",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

**lib/automations/evaluator.ts:runEvaluator()**

```json
{
  "code": "TC001",
  "message": "tenant context is required: app.current_tenant_id is the EMPTY STRING",
  "detail": "statement: SELECT \"public\".\"AppEvent\".\"id\", \"public\".\"AppEvent\".\"tenantId\", \"public\".\"AppEvent\".\"userId\", \"public\".\"AppEvent\".\"eventType\", \"public\".\"AppEvent\".\"properties\", \"public\".\"AppEvent\".\"createdAt\" FROM \"public\".\"AppEvent\" WHERE \"public\".\"AppEvent\".\"createdAt\" > $1 ORDER BY \"public\".\"AppEvent\".\"createdAt\" ASC OFFSET $2",
  "hint": "This statement ran with no tenant context. Acquire one (getTenantPrisma / getTenantPrismaForOrg / withTenantContext) before querying, or SET app.tenant_context_tripwire = 'off' on this connection."
}
```

## 3. Entry points NOT INVOKED — by name, with the reason

| entry point | mechanism | reason |
|---|---|---|
| `api/cron/carrier-auto-dispatch/route.ts:GET — the after()-DEFERRED half` | after() | called outside the Next request lifecycle, after() may throw or no-op; whatever it defers is not executed by an in-process call. The route row above covers its SYNCHRONOUS body only. |

## 4. Counts

Counts below are counts **of what was invoked** (24). The not-invoked total sits
beside them and is never summed into them.

| verdict | count |
|---|---|
| RAISED_TC001 | 12 |
| COMPLETED | 8 |
| OTHER_FAILURE | 4 |
| **invoked total** | **24** |
| NOT_INVOKED (separate) | 1 |

## 5. Row-count snapshot

```json
{
  "before": {
    "CarrierLoad": -1,
    "Trip": -1,
    "CarrierContract": -1,
    "CarrierClient": -1,
    "CarrierDriver": -1,
    "CarrierTruck": -1,
    "Route": 0,
    "Load": 0,
    "Invoice": 0,
    "SupportTicket": 0,
    "SysAdminInvoice": 0,
    "Tenant": 2,
    "User": 0,
    "in_app_notifications": 0,
    "audit_log": 0,
    "Tag": 2
  },
  "after": {
    "CarrierLoad": -1,
    "Trip": -1,
    "CarrierContract": -1,
    "CarrierClient": -1,
    "CarrierDriver": -1,
    "CarrierTruck": -1,
    "Route": 0,
    "Load": 0,
    "Invoice": 0,
    "SupportTicket": 0,
    "SysAdminInvoice": 0,
    "Tenant": 2,
    "User": 0,
    "in_app_notifications": 0,
    "audit_log": 0,
    "Tag": 2
  },
  "changed": []
}
```

---

## 6. Narrative (appended by hand after the final sweep run)

### The mechanism classification, RE-DERIVED here, disagrees with the plan's table

The plan's cut was four disjoint classes. Grepped in this script, **the classes overlap**, and the
disagreement is the finding:

| route | plan's class | measured markers |
|---|---|---|
| `auto-close-tickets` | getAdminDb | `getAdminDb` — **and it still raised**, so at least one of its statements is on the tenant connection |
| `automations` | getTenantPrisma | `getTenantPrisma*` |
| `carrier-auto-dispatch` | app.bypass_rls | `app.bypass_rls + after()` |
| `carrier-compliance-alerts` | app.bypass_rls | `app.bypass_rls` |
| `cleanup-quarantine` | bare prisma | **no DB import at all** — S3 only |
| `digest-compliance-30day` | app.bypass_rls | `app.bypass_rls + getAdminDb` |
| `digest-daily-driver` | app.bypass_rls | `app.bypass_rls + getAdminDb` |
| `digest-weekly-owner` | app.bypass_rls | `app.bypass_rls + getAdminDb` |
| `mark-overdue-invoices` | getAdminDb | `getAdminDb` |
| `purge-deleted` | bare prisma | `bare prisma` |
| `send-reminders` | getAdminDb | `getAdminDb` |
| `trip-reminders` | getTenantPrisma | `getTenantPrisma*` |
| `workflow-digest` | app.bypass_rls | `app.bypass_rls + getAdminDb` |
| `workflow-notifications` | getTenantPrisma | `getTenantPrisma* + getAdminDb` |

Five routes carry **two** mechanisms and one carries none. A file-level marker says which mechanisms
a route *contains*, never which one a given statement used — which is why the verdict is taken from
execution and not from the grep.

### The counter-assertion holds: the tripwire does NOT fire on everything

Three entry points that acquire a tenant client ran to completion **with `dbTouched: true`**:

| entry point | verdict | queries |
|---|---|---|
| `lib/onboarding/onboarding-flags.ts:getOnboardingFlags(tenantId)` | COMPLETED | 7 |
| `lib/onboarding/confirm-tenant-email.ts:confirmTenantEmail(tenantId)` | COMPLETED | 4 |
| `lib/context/tenant-context.ts:getTenantPrismaForOrg(tenantId)` + `tag.count()` | COMPLETED | 4 |

Without these the sweep would prove only that *something* raises.

### `dbTouched` is INSTRUMENTED, not inferred — and its one blind spot is named

It counts queries through the **application pool** (`globalForPrisma.pool`), by wrapping both
`pool.query` and the `client.query` of every client `pool.connect()` hands out, restored afterwards.
It therefore does **not** see statements issued on the separate `getAdminDb` pool. A `queries=0`
row on an admin-routed route (`mark-overdue-invoices`, `workflow-digest`, `workflow-notifications`)
means "touched nothing on the tenant connection", which is exactly the structural exemption being
reported — not "did no database work".

### The first run of this sweep was WRONG in two ways, and both corrections matter

1. **A swallowed TC001 was being reported as COMPLETED.** `trip-reminders` caught its own raise and
   returned HTTP 500 with a generic body; a verdict built from what the handler rethrows scores that
   as a pass — under-reporting the signal exactly on the population `guc-binding.md` singled out for
   swallowing failures. Fixed by observing the **driver's own promise rejections** (`err.code ===
   'TC001'`, structural, never message prose). RAISED_TC001 went 1 → 12.
2. **The bare-client probes inherited a tenant context.** `getTenantPrismaForOrg` writes the GUC with
   `set_config(..., false)` — **session** scope — and the pool holds `max: 1`, so
   `prisma.tag.count()` run afterwards returned 1 row instead of raising. That is quick-413's pool
   leak, reproduced here as a side effect. Controlled for by ordering every `expected-to-raise`
   probe before every `must-not-raise` probe; recorded as a finding rather than hidden by the fix,
   because it means **the tripwire cannot see an unscoped statement that happens to run on a
   connection a scoped one has already touched.**

### Safety

Row counts over 16 tables: **NONE changed** across the whole sweep. No route returned 401 (a 401
would have been a harness failure, and the run refuses on one). A fresh `app_user` connection after
the sweep reads the tripwire flag as `null`.
