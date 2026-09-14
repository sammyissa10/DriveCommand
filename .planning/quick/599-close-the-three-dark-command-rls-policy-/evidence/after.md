# quick-599 — RLS policy verification matrix (AFTER)

- Captured: 2026-09-14T17:22:46.480Z
- Project: staging `wyixpgunnjmzguhggocz` (production `oqdhberkghtnszrkdvfm` was never connected to)
- Total `pg_policy` rows: **183**
- `bypass_rls_policy` rows: **86**

## 1. Policy snapshot (verbatim from `pg_policies`)

### `AutomationRule` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `AutomationRule` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
WITH CHECK ("tenantId" = current_tenant_id())
```

### `Tenant` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `Tenant` — `tenant_bootstrap_insert`

- permissive: `PERMISSIVE`  cmd: `INSERT`  roles: `public`

```sql
USING      (none)
WITH CHECK (NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text) IS NULL)
```

### `Tenant` — `tenant_self_read`

- permissive: `PERMISSIVE`  cmd: `SELECT`  roles: `public`

```sql
USING      (id = current_tenant_id())
WITH CHECK (none)
```

### `Tenant` — `tenant_self_update`

- permissive: `PERMISSIVE`  cmd: `UPDATE`  roles: `public`

```sql
USING      (id = current_tenant_id())
WITH CHECK (id = current_tenant_id())
```

### `audit_log` — `audit_log_append_policy`

- permissive: `PERMISSIVE`  cmd: `INSERT`  roles: `public`

```sql
USING      (none)
WITH CHECK true
```

### `audit_log` — `bypass_rls_policy`

- permissive: `PERMISSIVE`  cmd: `ALL`  roles: `public`

```sql
USING      (current_setting('app.bypass_rls'::text, true) = 'on'::text)
WITH CHECK (none)
```

### `audit_log` — `tenant_isolation_policy`

- permissive: `PERMISSIVE`  cmd: `SELECT`  roles: `public`

```sql
USING      (tenant_id = current_tenant_id())
WITH CHECK (none)
```

## 2. `app_user` grants on the three tables

| table | privileges |
| --- | --- |
| `Tenant` | DELETE, INSERT, SELECT, UPDATE |
| `audit_log` | INSERT, SELECT |
| `AutomationRule` | DELETE, INSERT, SELECT, UPDATE |

## 3. `bypass_rls_policy` inventory (sorted table list)

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

## 4. `"AutomationRule"` census

| when | total | scope=SYSTEM | tenantId IS NULL |
| --- | --- | --- | --- |
| before probes | 6 | 6 | 6 |
| after probes (rolled back) | 6 | 6 | 6 |

## 5. Probe matrix — every write probe inside `BEGIN … ROLLBACK`

| probe | result |
| --- | --- |
| `Tenant.update-cross.counter-read@postgres` | 1 |
| `Tenant.insert@guc-empty` | 1 |
| `audit_log.insert@guc-empty` | 1 |
| `AutomationRule.update-system@guc-empty` | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |
| `Tenant.insert@guc-A` | ERROR [42501] new row violates row-level security policy for table "Tenant" |
| `Tenant.update-own@guc-A` | 1 |
| `Tenant.update-own.counter-read@guc-A` | 1 |
| `Tenant.update-cross@guc-A` | 0 |
| `Tenant.delete-own@guc-A` | 0 |
| `audit_log.insert-own@guc-A` | 1 |
| `audit_log.insert-cross@guc-A` | 1 |
| `audit_log.select-own@guc-A` | 1 |
| `audit_log.select-cross@guc-A` | 0 |
| `audit_log.update-own@guc-A` | ERROR [42501] permission denied for table audit_log |
| `audit_log.delete-own@guc-A` | ERROR [42501] permission denied for table audit_log |
| `audit_log.delete-cross@guc-A` | ERROR [42501] permission denied for table audit_log |
| `AutomationRule.select-system@guc-A` | 6 |
| `AutomationRule.update-system@guc-A` | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |
| `AutomationRule.delete-system@guc-A` | 6 |
| `AutomationRule.insert-own@guc-A` | 1 |
| `AutomationRule.insert-system@guc-A` | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |
| `AutomationRule.insert-cross@guc-A` | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |

