# quick-615 — DEC-17 ledger read-back

database  : wyixpgunnjmzguhggocz (staging), connected as postgres

## grants on the routed tables BEFORE

| table | needed | held by app_admin | missing |
|---|---|---|---|
| `ActivationProgress` | SELECT | SELECT | — |
| `AppEvent` | SELECT | INSERT, SELECT | — |
| `AutomationRule` | SELECT | SELECT, UPDATE | — |
| `AutomationRun` | SELECT | INSERT, SELECT, UPDATE | — |
| `DriverInvitation` | SELECT, INSERT, UPDATE | INSERT, SELECT, UPDATE | — |
| `Load` | SELECT | SELECT | — |
| `NotificationSendLog` | SELECT | SELECT | — |
| `Route` | SELECT | SELECT | — |
| `Subscription` | SELECT | SELECT, UPDATE | — |
| `SupportTicket` | SELECT | SELECT, UPDATE | — |
| `Tenant` | SELECT | DELETE, INSERT, SELECT, UPDATE | — |
| `TicketMessage` | SELECT | INSERT, SELECT | — |
| `Truck` | SELECT | SELECT | — |
| `User` | SELECT, UPDATE | SELECT, UPDATE | — |

`has_schema_privilege('app_admin','auth','USAGE')` BEFORE = **false**
`has_schema_privilege('app_user','auth','USAGE')`  BEFORE = **false**
auth column grants to app_user/app_admin BEFORE: **3**
`bypass_rls_policy` tables BEFORE: **86**

## 20260915160000_grant_cutover_routing_tables_to_app_admin

APPLIED to staging (single transaction, committed)
sha256 over LF bytes : `b2211f876b344b67bf560a80d9def55ebd2570deb9c301c671d6ba844448db2b`
SENTINEL `20260915150000_grant_automation_rule_to_app_admin` visible: **YES**
ledger row already present — checksum unchanged

READ BACK:
  `20260915160000_grant_cutover_routing_tables_to_app_admin` | steps=0 | logs="" | started=finished:true | checksum=`b2211f876b344b67bf560a80d9def55ebd2570deb9c301c671d6ba844448db2b`
  checksum is a real SHA-256, not 'manual': **true**
  applied_steps_count is 0 (mirrored, not executed by migrate.mjs): **true**
  logs = '' : **true**
  started_at = finished_at : **true**

## 20260915170000_auth_user_display_definer_function

APPLIED to staging (single transaction, committed)
sha256 over LF bytes : `ab04a89feeee3166984f0d15285ff25af846ed7726e83de970208919fd0ae464`
SENTINEL `20260915150000_grant_automation_rule_to_app_admin` visible: **YES**
ledger row INSERTed BY HAND — no MCP tool and no DDL writes this (DEC-17)

READ BACK:
  `20260915170000_auth_user_display_definer_function` | steps=0 | logs="" | started=finished:true | checksum=`ab04a89feeee3166984f0d15285ff25af846ed7726e83de970208919fd0ae464`
  checksum is a real SHA-256, not 'manual': **true**
  applied_steps_count is 0 (mirrored, not executed by migrate.mjs): **true**
  logs = '' : **true**
  started_at = finished_at : **true**

## RETIRED — `20260915170000_grant_auth_user_display_columns`

staging ledger row present BEFORE cleanup: **true** (applied_steps_count=0)
rows deleted: **1** · present AFTER: **false** (expected false)

## newest 3 ledger rows AFTER both writes

- `20260915170000_auth_user_display_definer_function`
- `20260915160000_grant_cutover_routing_tables_to_app_admin`
- `20260915150000_grant_automation_rule_to_app_admin`

HEAD IS OURS: **true**
staging `_prisma_migrations` rows AFTER: **162**

## grants on the routed tables AFTER

| table | needed | held by app_admin | still missing |
|---|---|---|---|
| `ActivationProgress` | SELECT | SELECT | **none** |
| `AppEvent` | SELECT | INSERT, SELECT | **none** |
| `AutomationRule` | SELECT | SELECT, UPDATE | **none** |
| `AutomationRun` | SELECT | INSERT, SELECT, UPDATE | **none** |
| `DriverInvitation` | SELECT, INSERT, UPDATE | INSERT, SELECT, UPDATE | **none** |
| `Load` | SELECT | SELECT | **none** |
| `NotificationSendLog` | SELECT | SELECT | **none** |
| `Route` | SELECT | SELECT | **none** |
| `Subscription` | SELECT | SELECT, UPDATE | **none** |
| `SupportTicket` | SELECT | SELECT, UPDATE | **none** |
| `Tenant` | SELECT | DELETE, INSERT, SELECT, UPDATE | **none** |
| `TicketMessage` | SELECT | INSERT, SELECT | **none** |
| `Truck` | SELECT | SELECT | **none** |
| `User` | SELECT, UPDATE | SELECT, UPDATE | **none** |

`has_schema_privilege('app_admin','auth','USAGE')` AFTER = **false**
`has_schema_privilege('app_user','auth','USAGE')`  AFTER = **false** (unchanged — app_user gets nothing)

auth column grants AFTER:

`bypass_rls_policy` tables: **86** before, **86** after — sorted list identical: **true**
