# quick-597 — RLS policy verification matrix (BEFORE)

- Captured: 2026-09-14T04:32:09.959Z
- Project: staging `wyixpgunnjmzguhggocz` (production `oqdhberkghtnszrkdvfm` was never connected to)
- Role: `app_user`, `rolbypassrls = false`
- `app.current_tenant_id` on a brand-new connection: `''`
- Total `pg_policy` rows: **183**
- `bypass_rls_policy` rows: **86**

## 1. Policy snapshot (verbatim from `pg_policies`)

### `PushToken` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `PushToken` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      ("tenantId" = current_tenant_id())
WITH CHECK ("tenantId" = current_tenant_id())
```

### `PushToken` — `user_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (("userId")::text = current_setting('app.current_user_id'::text, true))
WITH CHECK (none)
```

### `SysAdminInvoice` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `SysAdminInvoice` — `sysadmin_invoices_deny_tenant_users`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      ((current_setting('app.current_tenant_id'::text, true) IS NULL) OR (current_setting('app.current_tenant_id'::text, true) = ''::text))
WITH CHECK (none)
```

### `SysAdminInvoice` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      ("tenantId" = current_tenant_id())
WITH CHECK ("tenantId" = current_tenant_id())
```

### `SysAdminInvoiceItem` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `SysAdminInvoiceItem` — `sysadmin_invoice_items_deny_tenant_users`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      ((current_setting('app.current_tenant_id'::text, true) IS NULL) OR (current_setting('app.current_tenant_id'::text, true) = ''::text))
WITH CHECK (none)
```

### `SysAdminInvoiceItem` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      ("tenantId" = current_tenant_id())
WITH CHECK ("tenantId" = current_tenant_id())
```

### `audit_log` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `audit_log` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid)
WITH CHECK (none)
```

### `carrier_documents` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (EXISTS ( SELECT 1
   FROM "User" u
  WHERE ((u.id = carrier_documents.uploaded_by) AND (u."tenantId" = current_tenant_id()))))
WITH CHECK (EXISTS ( SELECT 1
   FROM "User" u
  WHERE ((u.id = carrier_documents.uploaded_by) AND (u."tenantId" = current_tenant_id()))))
```

### `in_app_notifications` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `in_app_notifications` — `in_app_notifications_insert_policy`

- permissive: `PERMISSIVE`  cmd: `INSERT`  roles: `public`

```sql
USING      (none)
WITH CHECK true
```

### `in_app_notifications` — `in_app_notifications_select_policy`

- permissive: `PERMISSIVE`  cmd: `SELECT`  roles: `public`

```sql
USING      (org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)
WITH CHECK (none)
```

### `in_app_notifications` — `in_app_notifications_update_policy`

- permissive: `PERMISSIVE`  cmd: `UPDATE`  roles: `public`

```sql
USING      (org_id = ((auth.jwt() ->> 'org_id'::text))::uuid)
WITH CHECK (none)
```

### `in_app_notifications` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (org_id = current_tenant_id())
WITH CHECK (org_id = current_tenant_id())
```

### `route_template_stops` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (EXISTS ( SELECT 1
   FROM route_templates rt
  WHERE ((rt.id = route_template_stops.route_template_id) AND (rt.org_id = current_tenant_id()))))
WITH CHECK (EXISTS ( SELECT 1
   FROM route_templates rt
  WHERE ((rt.id = route_template_stops.route_template_id) AND (rt.org_id = current_tenant_id()))))
```

### `stops` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (EXISTS ( SELECT 1
   FROM dispatches d
  WHERE ((d.id = stops.dispatch_id) AND (d.org_id = current_tenant_id()))))
WITH CHECK (EXISTS ( SELECT 1
   FROM dispatches d
  WHERE ((d.id = stops.dispatch_id) AND (d.org_id = current_tenant_id()))))
```

## 2. `current_tenant_id()`

```sql
CREATE OR REPLACE FUNCTION public.current_tenant_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE
AS $function$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$function$

```

## 3. Read matrix — as `app_user`, fresh connection per GUC case

Columns are row counts restricted to the seeded fixture ids, except `all` which is
`SELECT count(*)` over the whole table.

What each case ACTUALLY observed for `app.current_tenant_id` — measured, because
`STAGING_DATABASE_URL_APP_USER` is a Supavisor TRANSACTION-mode pooler string and a
fresh client is not a fresh backend (quick-413 pool leak):

| case | at connect | after set_config |
| --- | --- | --- |
| unset | `''` | `''` |
| tenantA | `''` | `a370f48f-51d1-4789-b451-9717c889b479` |
| tenantB | `''` | `0e25cf49-9ef1-45f2-a189-0e72ef677d2b` |
| empty | `''` | `''` |

Is a genuinely-unset GUC reachable on this connection at all? Measured:

- at connect: `''`
- after `set_config('app.current_tenant_id', NULL, false)`: `''`
- after `RESET "app.current_tenant_id"`: `''`

**No.** Once the placeholder GUC has been set on a backend its reset value is `''`, so the
`unset` row above is in practice a second reading of the `''` case. That is the
production-realistic one either way — `prisma.ts:71` writes `''` on every new physical
connection.

| table | GUC | A rows | B rows | all |
| --- | --- | --- | --- | --- |
| `audit_log` | unset | ERROR [22P02] invalid input syntax for type uuid: "" | ERROR [22P02] invalid input syntax for type uuid: "" | ERROR [22P02] invalid input syntax for type uuid: "" |
| `audit_log` | tenantA | 1 | 0 | 1 |
| `audit_log` | tenantB | 0 | 1 | 1 |
| `audit_log` | '' | ERROR [22P02] invalid input syntax for type uuid: "" | ERROR [22P02] invalid input syntax for type uuid: "" | ERROR [22P02] invalid input syntax for type uuid: "" |
| `in_app_notifications` | unset | 0 | 0 | 0 |
| `in_app_notifications` | tenantA | 1 | 0 | 1 |
| `in_app_notifications` | tenantB | 0 | 1 | 1 |
| `in_app_notifications` | '' | 0 | 0 | 0 |
| `PushToken` | unset | 0 | 0 | 0 |
| `PushToken` | tenantA | 1 | 0 | 1 |
| `PushToken` | tenantB | 0 | 1 | 1 |
| `PushToken` | '' | 0 | 0 | 0 |
| `SysAdminInvoice` | unset | 1 | 1 | 2 |
| `SysAdminInvoice` | tenantA | 1 | 0 | 1 |
| `SysAdminInvoice` | tenantB | 0 | 1 | 1 |
| `SysAdminInvoice` | '' | 1 | 1 | 2 |
| `SysAdminInvoiceItem` | unset | 1 | 1 | 2 |
| `SysAdminInvoiceItem` | tenantA | 1 | 0 | 1 |
| `SysAdminInvoiceItem` | tenantB | 0 | 1 | 1 |
| `SysAdminInvoiceItem` | '' | 1 | 1 | 2 |
| `stops` | unset | 0 | 0 | 0 |
| `stops` | tenantA | 2 | 0 | 2 |
| `stops` | tenantB | 0 | 2 | 2 |
| `stops` | '' | 0 | 0 | 0 |
| `carrier_documents` | unset | 0 | 0 | 0 |
| `carrier_documents` | tenantA | 1 | 0 | 1 |
| `carrier_documents` | tenantB | 0 | 1 | 1 |
| `carrier_documents` | '' | 0 | 0 | 0 |
| `route_template_stops` | unset | 0 | 0 | 0 |
| `route_template_stops` | tenantA | 2 | 0 | 2 |
| `route_template_stops` | tenantB | 0 | 2 | 2 |
| `route_template_stops` | '' | 0 | 0 | 0 |

## 4. Write probes — every one inside `BEGIN … ROLLBACK`

| probe | result |
| --- | --- |
| `audit_log.insert@guc-empty` | ERROR [22P02] invalid input syntax for type uuid: "" |
| `audit_log.insert-own@guc-A` | 1 |
| `audit_log.insert-cross@guc-A` | ERROR [42501] new row violates row-level security policy for table "audit_log" |
| `in_app_notifications.insert-cross@guc-A` | 1 |
| `in_app_notifications.insert-own@guc-A` | 1 |
| `Promo.select` | 1 |
| `Promo.update` | ERROR [42501] permission denied for table Promo |

## 5. `bypass_rls_policy` inventory

86 rows:

```
ActivationProgress
AppEvent
AutomationRule
AutomationRun
Customer
CustomerInteraction
DispatchOverrideAudit
DocFeedback
Document
DriverHOSEntry
DriverIncident
DriverInvitation
DriverRouteJoin
ExpenseCategory
ExpenseTemplate
ExpenseTemplateItem
FleetMessage
FuelRecord
GPSLocation
Invoice
InvoiceItem
Load
MaintenanceEvent
NotificationLog
NotificationSendLog
NotificationSubscription
PayrollRecord
Playbook
PlaybookInstance
PlaybookNotification
PlaybookStep
PlaybookTrigger
PushToken
Route
RouteDriver
RouteExpense
RoutePayment
RouteStop
SafetyEvent
ScheduledService
StepInstance
StepTemplate
Subscription
SupportTicket
SysAdminInvoice
SysAdminInvoiceItem
Tag
TagAssignment
Tenant
TenantHealthScore
TenantIntegration
TenantMetricsDaily
TenantNotificationSettings
TicketMessage
Truck
User
UserNotificationPreference
audit_log
carrier_compliance_alert_log
carrier_document_types
carrier_drivers
carrier_expenses
carrier_truck_defects
carrier_trucks
client_contacts
clients
contracts
dispatches
document_import_pages
document_imports
document_profiles
driver_bonuses
driver_compensation_templates
driver_deductions
driver_disputes
driver_pay_audit_logs
driver_pay_records
driver_settlements
facilities
facility_external_references
in_app_notifications
load_driver_assignments
load_pay_components
loads
pay_component_attachments
route_templates
```

## 6. Fixture row counts (from `evidence/fixture-ids.json`)

| table | A | B |
| --- | --- | --- |
| `audit_log` | 1 | 1 |
| `in_app_notifications` | 1 | 1 |
| `PushToken` | 1 | 1 |
| `SysAdminInvoice` | 1 | 1 |
| `SysAdminInvoiceItem` | 1 | 1 |
| `stops` | 2 | 2 |
| `carrier_documents` | 1 | 1 |
| `route_template_stops` | 2 | 2 |

