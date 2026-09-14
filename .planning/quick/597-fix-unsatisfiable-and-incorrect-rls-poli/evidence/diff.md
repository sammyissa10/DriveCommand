# quick-597 — BEFORE → AFTER, as `app_user` against staging

Generated from `before.json` (2026-09-14T04:32:09.959Z) and `after.json` (2026-09-14T04:35:33.138Z) by
`597-policy-verify.ts --diff`. Nothing here is typed by hand.

- `pg_policy` total: **183 -> 180**
- `bypass_rls_policy`: **86 -> 86** (identical table set: YES)

## Policies present on the target tables

| table | policy | before | after |
| --- | --- | --- | --- |
| `PushToken` | `bypass_rls_policy` | present | present |
| `PushToken` | `tenant_isolation_policy` | present | present |
| `PushToken` | `user_isolation_policy` | present | — |
| `SysAdminInvoiceItem` | `bypass_rls_policy` | present | present |
| `SysAdminInvoiceItem` | `sysadmin_invoice_items_deny_tenant_users` | present | — |
| `SysAdminInvoiceItem` | `tenant_isolation_policy` | present | present |
| `SysAdminInvoice` | `bypass_rls_policy` | present | present |
| `SysAdminInvoice` | `sysadmin_invoices_deny_tenant_users` | present | — |
| `SysAdminInvoice` | `tenant_isolation_policy` | present | present |
| `audit_log` | `bypass_rls_policy` | present | present |
| `audit_log` | `tenant_isolation_policy` | present | present |
| `carrier_documents` | `tenant_isolation_policy` | present | present |
| `in_app_notifications` | `bypass_rls_policy` | present | present |
| `in_app_notifications` | `in_app_notifications_insert_policy` | present | present |
| `in_app_notifications` | `in_app_notifications_select_policy` | present | present |
| `in_app_notifications` | `in_app_notifications_update_policy` | present | present |
| `in_app_notifications` | `tenant_isolation_policy` | present | present |
| `route_template_stops` | `tenant_isolation_policy` | present | present |
| `stops` | `tenant_isolation_policy` | present | present |

## Read matrix

| table | GUC | A rows before -> after | B rows before -> after | all before -> after |
| --- | --- | --- | --- | --- |
| `audit_log` | unset | ERROR [22P02] invalid input syntax for type uuid: "" -> 0 | ERROR [22P02] invalid input syntax for type uuid: "" -> 0 | ERROR [22P02] invalid input syntax for type uuid: "" -> 0 |
| `audit_log` | tenantA | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `audit_log` | tenantB | 0 -> 0 | 1 -> 1 | 1 -> 1 |
| `audit_log` | '' | ERROR [22P02] invalid input syntax for type uuid: "" -> 0 | ERROR [22P02] invalid input syntax for type uuid: "" -> 0 | ERROR [22P02] invalid input syntax for type uuid: "" -> 0 |
| `in_app_notifications` | unset | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `in_app_notifications` | tenantA | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `in_app_notifications` | tenantB | 0 -> 0 | 1 -> 1 | 1 -> 1 |
| `in_app_notifications` | '' | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `PushToken` | unset | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `PushToken` | tenantA | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `PushToken` | tenantB | 0 -> 0 | 1 -> 1 | 1 -> 1 |
| `PushToken` | '' | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `SysAdminInvoice` | unset | 1 -> 0 | 1 -> 0 | 2 -> 0 |
| `SysAdminInvoice` | tenantA | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `SysAdminInvoice` | tenantB | 0 -> 0 | 1 -> 1 | 1 -> 1 |
| `SysAdminInvoice` | '' | 1 -> 0 | 1 -> 0 | 2 -> 0 |
| `SysAdminInvoiceItem` | unset | 1 -> 0 | 1 -> 0 | 2 -> 0 |
| `SysAdminInvoiceItem` | tenantA | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `SysAdminInvoiceItem` | tenantB | 0 -> 0 | 1 -> 1 | 1 -> 1 |
| `SysAdminInvoiceItem` | '' | 1 -> 0 | 1 -> 0 | 2 -> 0 |
| `stops` | unset | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `stops` | tenantA | 2 -> 2 | 0 -> 0 | 2 -> 2 |
| `stops` | tenantB | 0 -> 0 | 2 -> 2 | 2 -> 2 |
| `stops` | '' | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `carrier_documents` | unset | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `carrier_documents` | tenantA | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `carrier_documents` | tenantB | 0 -> 0 | 1 -> 1 | 1 -> 1 |
| `carrier_documents` | '' | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `route_template_stops` | unset | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `route_template_stops` | tenantA | 2 -> 2 | 0 -> 0 | 2 -> 2 |
| `route_template_stops` | tenantB | 0 -> 0 | 2 -> 2 | 2 -> 2 |
| `route_template_stops` | '' | 0 -> 0 | 0 -> 0 | 0 -> 0 |

## Write probes

| probe | before | after |
| --- | --- | --- |
| `audit_log.insert@guc-empty` | ERROR [22P02] invalid input syntax for type uuid: "" | ERROR [42501] new row violates row-level security policy for table "audit_log" |
| `audit_log.insert-own@guc-A` | 1 | 1 |
| `audit_log.insert-cross@guc-A` | ERROR [42501] new row violates row-level security policy for table "audit_log" | ERROR [42501] new row violates row-level security policy for table "audit_log" |
| `in_app_notifications.insert-cross@guc-A` | 1 | ERROR [42501] new row violates row-level security policy for table "in_app_notifications" |
| `in_app_notifications.insert-own@guc-A` | 1 | 1 |
| `Promo.select` | 1 | 1 |
| `Promo.update` | ERROR [42501] permission denied for table Promo | 1 |

