# quick-599 — BEFORE → AFTER, as `app_user` against staging

Generated from `before.json` (2026-09-14T17:19:03.264Z) and `after.json` (2026-09-14T17:22:46.480Z) by
`599-policy-verify.ts --diff`. Nothing here is typed by hand.

- `pg_policy` total: **180 -> 183**
- `bypass_rls_policy`: **86 -> 86** (identical table set: YES)

## `app_user` grants

| table | before | after |
| --- | --- | --- |
| `Tenant` | DELETE, INSERT, SELECT, UPDATE | DELETE, INSERT, SELECT, UPDATE |
| `audit_log` | DELETE, INSERT, SELECT, UPDATE | INSERT, SELECT |
| `AutomationRule` | DELETE, INSERT, SELECT, UPDATE | DELETE, INSERT, SELECT, UPDATE |

## Policies present on the target tables

| table | policy | before | after |
| --- | --- | --- | --- |
| `AutomationRule` | `bypass_rls_policy` | present | present |
| `AutomationRule` | `tenant_isolation_policy` | present | present |
| `Tenant` | `bypass_rls_policy` | present | present |
| `Tenant` | `tenant_bootstrap_insert` | — | present |
| `Tenant` | `tenant_self_read` | present | present |
| `Tenant` | `tenant_self_update` | — | present |
| `audit_log` | `audit_log_append_policy` | — | present |
| `audit_log` | `bypass_rls_policy` | present | present |
| `audit_log` | `tenant_isolation_policy` | present | present |

## Probe matrix

| probe | before | after |
| --- | --- | --- |
| `Tenant.update-cross.counter-read@postgres` | 1 | 1 |
| `Tenant.insert@guc-empty` | ERROR [42501] new row violates row-level security policy for table "Tenant" | 1 |
| `audit_log.insert@guc-empty` | ERROR [42501] new row violates row-level security policy for table "audit_log" | 1 |
| `AutomationRule.update-system@guc-empty` | 6 | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |
| `Tenant.insert@guc-A` | ERROR [42501] new row violates row-level security policy for table "Tenant" | ERROR [42501] new row violates row-level security policy for table "Tenant" |
| `Tenant.update-own@guc-A` | 0 | 1 |
| `Tenant.update-own.counter-read@guc-A` | 1 | 1 |
| `Tenant.update-cross@guc-A` | 0 | 0 |
| `Tenant.delete-own@guc-A` | 0 | 0 |
| `audit_log.insert-own@guc-A` | 1 | 1 |
| `audit_log.insert-cross@guc-A` | ERROR [42501] new row violates row-level security policy for table "audit_log" | 1 |
| `audit_log.select-own@guc-A` | 1 | 1 |
| `audit_log.select-cross@guc-A` | 0 | 0 |
| `audit_log.update-own@guc-A` | 1 | ERROR [42501] permission denied for table audit_log |
| `audit_log.delete-own@guc-A` | 1 | ERROR [42501] permission denied for table audit_log |
| `audit_log.delete-cross@guc-A` | 0 | ERROR [42501] permission denied for table audit_log |
| `AutomationRule.select-system@guc-A` | 6 | 6 |
| `AutomationRule.update-system@guc-A` | 6 | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |
| `AutomationRule.delete-system@guc-A` | 6 | 6 |
| `AutomationRule.insert-own@guc-A` | 1 | 1 |
| `AutomationRule.insert-system@guc-A` | 1 | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |
| `AutomationRule.insert-cross@guc-A` | ERROR [42501] new row violates row-level security policy for table "AutomationRule" | ERROR [42501] new row violates row-level security policy for table "AutomationRule" |

