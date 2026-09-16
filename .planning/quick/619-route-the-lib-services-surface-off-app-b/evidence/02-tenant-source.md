# quick-619 — Step 2: where the tenant comes from, per statement

**Written before any source file was edited.** Every row below was read in the function body, not
inferred from the census label. Policies quoted from `pg_policies` on staging AND production
(`02-policies.txt`); where a recorded claim disagrees with the live policy, the policy wins and the
disagreement is named.

## Distribution — 44 statements, 15 files

| tenant source | statements | files |
|---|---:|---|
| **Caller's session** (server action / tRPC `ctx.tenantId` / Bearer-derived session) | **14** | doc-feedback 1 · support-tickets 4 · analytics 7 · instance 1 · require-driver 1 |
| **Function parameter** | **24** | send-geofence-alert 1 · geofence-check 8 · notifications/audit-log 1 · send-push (org) 2 · activation-tracker 2 · security/audit-log 1 · generatePlaybookInstance 1 · workflows/notifications 8 |
| **Job payload** (`event.tenantId` from the automations cron) | **1** | evaluator 1 |
| **Nowhere** — no tenant in scope in the function | **5** | supabase.ts `getCurrentUser` 1 · send-push `sendPushToUser` 2 · workflows `getUserName` 1 · workflows `loadStepInstance` 1 |
| **total** | **44** | 15 |

Two parameter origins worth naming because they are one hop removed: `geofence-check.ts` takes
`params.tenantId`, which `/api/gps/report` extracts from a verified device token; `send-geofence-alert.ts`
takes `data.tenantId`, which `geofence-check.ts` passes on.

## Decision per statement

### ROUTE — 33 statements, 11 files

| file | stmts | source | notes |
|---|---:|---|---|
| `actions/doc-feedback.ts` | 1 | session `requireTenantId()` | `DocFeedback` create |
| `lib/automations/evaluator.ts` | 1 | job payload `event.tenantId` | the same function already uses `getTenantPrismaForOrg(event.tenantId)` 20 lines up (quick-615) |
| `lib/email/send-geofence-alert.ts` | 1 | parameter `data.tenantId` | `User` findMany, `tenantId` already in the where |
| `lib/geofencing/geofence-check.ts` | 8 | parameter `params.tenantId` | `Load`, `Route`, `RouteStop` — `RouteStop.tenantId` is NOT NULL, so injection is valid |
| `lib/notifications/send-push.ts` `sendPushToOrg` | 2 | parameter `orgId` | **reclassified by measurement**, see below |
| `lib/onboarding/activation-tracker.ts` | 2 | parameter `tenantId` | keeps its `$transaction` — it is a real atomicity wrapper (quick-596) |
| `lib/security/audit-log.ts` | 1 | parameter `params.tenantId` | **reclassified by measurement**, see below |
| `server/api/routers/workflows/analytics.ts` | 7 | session `ctx.tenantId` | `StepTemplate.tenantId` is NOT NULL, so no platform-global template can be hidden by the injection |
| `server/api/routers/workflows/instance.ts` | 1 | session `ctx.tenantId` | `User` findMany by id list |
| `server/services/workflows/generatePlaybookInstance.ts` | 1 | parameter `args.tenantId` | instance + step instances created in one transaction; kept |
| `server/services/workflows/notifications.ts` | 8 | parameter `tenantId` | `getTenantName`, `getTruckLabel`, `findDispatchers`, `findAdminEmails`, `writeAuditRow`, and the three `sendStepOverdue` / `sendInstanceBlocked` / `sendInstanceBlockedEmail` reads |

### STOP AND REPORT — 11 statements, 7 files

| file:line | stmts | reason |
|---|---:|---|
| `actions/support-tickets.ts` :179 :227 :417 :456 | 4 | **BROKEN_POLICY, confirmed.** `SupportTicket.tenantId` is nullable and its only policy is `USING ("tenantId" = current_tenant_id())`. **Production holds 88 tickets, 7 with a null tenant** (staging: 0/0). `getMyTickets` filters on `submittedBy` alone, so routing would silently hide those 7 from the users who filed them. Needs a data-model decision on null-tenant tickets, then DDL — not a client swap. |
| `lib/auth/supabase.ts:164` | 1 | **BOOTSTRAP.** `getCurrentUser` reads the user *to learn* the tenant. No tenant exists to pass. |
| `lib/driver-pay/require-driver.ts:105` | 1 | **Deviation — the statement is here, its queries are not.** `withBypassRls(fn)` is a helper handed to six `api/driver-pay/me/**` route handlers, which supply the callbacks. Routing it changes the client for every query those six files define, on the `API_DRIVER_PAY` surface this task must not touch, and makes the helper's name a lie. Belongs with that surface. |
| `lib/notifications/audit-log.ts:47` | 1 | **Deviation — no single tenant is guaranteed.** `writeAuditLog(prisma, entries[])` takes a client from the caller and an array whose rows each carry their own `tenantId`. The sole caller (`dispatcher.ts:634`) passes one tenant today, but the signature does not; routing needs either a uniformity assertion (new logic) or a signature change. |
| `lib/notifications/send-push.ts` :44 :85 (`sendPushToUser`) | 2 | **No tenant in scope** — the function takes `userId` only. |
| `server/services/workflows/notifications.ts:62` (`getUserName`) | 1 | **No tenant in scope** — `(userId)` only. |
| `server/services/workflows/notifications.ts:149` (`loadStepInstance`) | 1 | **No tenant in scope** — `(stepInstanceId)` only. Every caller holds a `tenantId`, so threading it is mechanical — but the brief forbids threading a tenant through a signature, so it is reported, not done. |

## Two recorded claims contradicted by the live policy

1. **`send-push.ts`'s header (quick-596)** says `PushToken`'s policy is
   `USING ("userId"::text = current_setting('app.current_user_id', true))` and *"can never pass"*.
   **Live on both databases:** `tenant_isolation_policy ALL USING ("tenantId" = current_tenant_id())`.
   So the bypass is not load-bearing for `sendPushToOrg`, which has the tenant, and that function is
   routed. `sendPushToUser` stays stopped — for lack of a tenant, not for the reason its header gives.
2. **`security/audit-log.ts`'s header** says quick-599's policy split is on staging only and
   *"production is PENDING"*, and quick-616 classed the statement BROKEN_POLICY for `audit_log`'s cast.
   **Live on both databases, byte-identical:** `audit_log_append_policy INSERT CHECK (true)` +
   `tenant_isolation_policy SELECT USING (tenant_id = current_tenant_id())`. No cast, and the INSERT
   check admits the write under any GUC. Routed.

Both headers are corrected in the same edit that routes them — a comment asserting a policy that no
longer exists is the quick-547/548 class.

## Arithmetic

`92 remaining − 33 routed = 59 expected` after this task.
