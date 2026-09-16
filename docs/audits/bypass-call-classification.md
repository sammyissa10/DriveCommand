# `app.bypass_rls` call classification

> ## ⚠ SUPERSEDED — 2026-09-15 (quick-616)
>
> **This document's 211 / 103 and its two-category DECORATIVE/CROSS_TENANT split are both stale.**
> Read `.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.md` and its
> machine-readable companion `01-census.json` for the current population. Nothing below has been
> deleted — **§3 and §4's per-file tables are the reconciliation's INPUT** and are transcribed
> verbatim into `apps/web/scripts/audit/616-audit211-transcription.json`, which the census refuses
> to run unless it still adds to exactly 211 / 103.
>
> **What changed, and why:**
>
> | | this document (2026-09-12) | quick-616 (2026-09-15) |
> |---|---|---|
> | executable statements / files | **211 / 103** | **177 / 87**, and **175** after quick-616's own routing |
> | method | `grep` + an `awk` comment heuristic | `ts.createSourceFile`, innermost-candidate filter, comments excluded by construction |
> | categories | DECORATIVE 161 · CROSS_TENANT 50 | BOOTSTRAP 1 · BROKEN_POLICY 9 · CROSS_TENANT 2 → **0** · DECORATIVE 13 · **TENANT_KNOWN_UNSCOPED 152** |
>
> **The 34 disappearances are all attributed** — quick-600 `0c08a959` (24), quick-601 `a30de408` (9),
> quick-596 `a7d52a8c` (1). None unaccounted. Two of them needed `git blame` rather than
> `git log -S`, which is blind to a statement that became a comment.
>
> **The category axis changed on purpose, and this document's own calibration is why.** §2 states it:
> *"A wrong DECORATIVE is a production outage at cutover; a wrong CROSS_TENANT is wasted effort."*
> That bias is correct for the question this document was asked — *does this need a privileged
> connection* — and it is why its CROSS_TENANT count is 50 where quick-616's is 2.
> `docs/audits/bypass-replacement-design.md` §1 re-asked the question as *what replaces the bypass*
> and quick-616 uses that precedence, adding a fifth category for the split **this document already
> measured and named** in §2 under "the number that actually matters": 15 sites survive the cutover,
> 145 do not. Those 145 became `TENANT_KNOWN_UNSCOPED`, because "delete one line" and "acquire a
> tenant client where none is acquired today" are different jobs with different owners.
>
> **Its §5 cost estimate is also stale** in one specific way worth naming: the privileged connection
> it describes as "plumbing that does not exist" was built by quick-600 as `getAdminDb` /
> `app_admin`, and quick-600/613/615 routed the genuinely cross-tenant population onto it.

**Date:** 2026-09-12
**Status:** ANALYSIS ONLY. No application code, configuration, migration or database object was changed by the work that produced this document. No database connection was opened; every claim below is derived from source files and migration SQL in the repository.
**Scope:** `apps/web/src`, excluding `__tests__`.
**Purpose:** input to the `app_user` cutover (`.planning/phase-0-revised.md`, Prompt 1), which drops `bypass_rls_policy` from every table and moves `DATABASE_URL` off the `postgres` role. Every call classified here becomes a permanent no-op at that moment.

---

## 1. Counts, and how they were measured

Enumeration command (run from `apps/web`):

```
grep -rn "app.bypass_rls" src --include=*.ts --include=*.tsx | grep -v __tests__
```

| Measure | Value |
|---|---|
| Raw grep matches | **213** across **104** files |
| …of which are prose inside a comment, not a call | **2** across 2 files |
| **Executable call sites** | **211** across **103** files |

### The drift against the source audit is zero — it is a grep artefact

`.planning/phase-0-revised.md` §5 recorded **211 calls across 103 files** on 2026-09-09. The grep above returns 213/104 today. The difference is **not** new code. Two matches are sentences in documentation comments that happen to quote the statement:

| File | Line | Text |
|---|---|---|
| `apps/web/src/lib/auth/mobile-auth.ts` | 24 | `*      sets set_config('app.bypass_rls', 'on') inside each transaction and uses` |
| `apps/web/src/lib/security/audit-log.ts` | 13 | `* bypass_rls file-level check (set_config('app.bypass_rls', 'on', TRUE) is present).` |

`mobile-auth.ts` contains **no** executable call, so it drops out of the file count entirely (104 − 1 = 103). `security/audit-log.ts` has one real call at line 68 plus this comment (213 − 2 = 211). 211/103 is confirmed unchanged since 2026-09-09.

A grep that distinguishes them:

```
grep -rn "app.bypass_rls" src --include=*.ts --include=*.tsx | grep -v __tests__ \
  | awk -F: '{l=$0; sub(/^[^:]*:[0-9]*:/,"",l); gsub(/^[ \t]+/,"",l); if (l !~ /^(\*|\/\/|\/\*)/) print}'
```

Every real call is byte-identical in shape: `` await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)` `` (one uses `$executeRawUnsafe` with the same SQL, one uses the `$transaction([...])` array form). There are no variants to hunt for.

---

## 2. Summary

| Verdict | Sites | Files containing ≥1 |
|---|---|---|
| **DECORATIVE** | **161** | 84 |
| **CROSS_TENANT** | **50** | 26 |
| **UNKNOWN** | **0** | 0 |
| *(non-sites: comment prose)* | *2* | *2* |
| **Total executable** | **211** | **103** |

Files are counted by containment, so the two file columns overlap: **7 files contain both kinds** — `api/cron/workflow-digest/route.ts`, `lib/automations/evaluator.ts`, `lib/notifications/send-push.ts`, `server/services/workflows/notifications.ts`, `api/mobile/driver/messages/route.ts`, `api/mobile/support/ticket/route.ts`, `(driver)/tasks/[id]/page.tsx`. So: **77 files purely DECORATIVE + 19 purely CROSS_TENANT + 7 mixed = 103**.

### The number that actually matters

DECORATIVE means *the transaction's rows are confined to one already-known tenant*. It does **not** by itself mean *this path survives the cutover*, because PostgreSQL does not read the tenant out of your Prisma `where` clause — it reads it out of the `app.current_tenant_id` session GUC. Splitting DECORATIVE by whether that GUC is actually set on the connection for that request:

| DECORATIVE sub-state | Sites |
|---|---|
| GUC **is** set (a `getTenantPrisma()` / `getTenantPrismaForOrg()` was awaited earlier in the same request) → survives cutover | **15** |
| GUC is set but the table has FORCE RLS and **zero policies** → fails anyway | **1** |
| GUC is **never** set for the request → returns zero rows on read, raises `new row violates row-level security policy` on write | **145** |

**So 15 of 211 sites sit on a path that works today and still works after cutover.** The other 196 need action of one kind or the other. That is the headline; the DECORATIVE/CROSS_TENANT split tells you *which* action.

### The classification rules used

**CROSS_TENANT** — the transaction's row set is not confined to a single tenant *by the code itself*. Any one of:
- **(a)** it deliberately scans or mutates across tenants (`tenant.findMany()`, an all-tenant sweep, a sysadmin surface);
- **(b)** it runs before any tenant is known (pre-auth: login bootstrap, invitation acceptance, sign-up provisioning, the public tracking page);
- **(c)** it queries a global table that has no tenant column at all;
- **(d)** it addresses rows by `id`/unique key with **no tenant predicate in any layer**, so which tenant's row comes back is decided by the row, not by the caller. (Rule (d) is the one that catches accidental cross-tenant reads. Several sites are here because of a bug, not a design choice — they are called out individually.)

**DECORATIVE** — every query in the transaction is confined to one already-known tenant, either by an explicit `tenantId`/`orgId` predicate, or transitively by ids that came from a tenant-scoped read earlier in the same request.

**Two orthogonal flags** are carried alongside the verdict, because they determine whether the site breaks regardless of bucket:
- `GUC` — `app.current_tenant_id` is not set on this connection for this request.
- `NO_POLICY` — the table has RLS forced with no policy that could ever admit `app_user`.

### The trade-off this document is calibrated against

A wrong DECORATIVE is a production outage at cutover; a wrong CROSS_TENANT is wasted effort. Everything below is therefore biased toward CROSS_TENANT and toward flagging: any site whose tenant predicate can *vanish at runtime* (e.g. `tenantId: session.tenantId ?? undefined`, where `undefined` deletes the predicate rather than matching nothing) is classified CROSS_TENANT even though the common case is single-tenant. Nothing is recorded as DECORATIVE on the strength of an author's `@bypass_rls reason:` comment; those comments were treated as hints and verified against the code, and in several places they are wrong (see §6).

---

## 3. Every CROSS_TENANT site — 50 sites, 26 files

Sub-reason keys: **(a)** deliberate multi-tenant scan/write · **(b)** pre-tenant (no tenant known yet) · **(c)** global table, no tenant column · **(d)** addressed by id with no tenant predicate anywhere.

### 3.1 Cron and system sweeps

| File | Line | Function / route | What it reads or writes across tenants | Breakage under `app_user` once `bypass_rls_policy` is gone | Sub |
|---|---|---|---|---|---|
| `src/app/api/cron/digest-compliance-30day/route.ts` | 42 | `GET` | `tenant.findMany({ where: { isActive: true } })` — the list of every active tenant, which drives the whole sweep | `"Tenant"` has **no `tenant_isolation_policy`**. Its only policies are `bypass_rls_policy` and `tenant_self_read FOR SELECT USING (id = current_tenant_id())` (`20260527000001_quick410_advisor_rls_fix`). In a cron the GUC is `''` → `current_tenant_id()` is NULL → **zero tenants returned**. The digest sends to nobody and logs "Found 0 active tenant(s)" as if that were true. | a |
| `src/app/api/cron/digest-daily-driver/route.ts` | 42 | `GET` | identical `tenant.findMany` | identical — daily driver digest silently stops | a |
| `src/app/api/cron/digest-weekly-owner/route.ts` | 42 | `GET` | identical `tenant.findMany` | identical — weekly owner digest silently stops | a |
| `src/app/api/cron/send-reminders/route.ts` | 62 | `GET` | `tenant.findMany({ where: { isActive: true }, select: { id, name } })` | identical — all document-expiry reminders stop, cron returns `success: true` with zero tenants | a |
| `src/app/api/cron/workflow-digest/route.ts` | 50 | `GET` | `playbookInstance.findMany({ distinct: ['tenantId'] })` with no tenant filter — the tenant list for the sweep | `PlaybookInstance` policy is `"tenantId" = current_tenant_id()`; GUC unset → zero rows → `activeTenantIds` empty, sweep does nothing | a |
| `src/app/api/cron/workflow-notifications/route.ts` | 57 | `GET` sweep 1 | `stepInstance.findMany` over **all tenants** for `dueDate < now-24h` | zero rows → no STEP_OVERDUE notification is ever sent again | a |
| `src/app/api/cron/workflow-notifications/route.ts` | 81 | `GET` sweep 1 loop | `stepInstance.update({ where: { id: step.id } })` — no tenant predicate, on a row from a cross-tenant scan | `UPDATE … WHERE id = …` matches zero rows under the policy; `isOverdue` never flips, so if the read were ever fixed the same step would re-alert forever | a,d |
| `src/app/api/cron/workflow-notifications/route.ts` | 96 | `GET` sweep 1 loop | same `stepInstance.update({ where: { id } })` on the alert-sent path | same | a,d |
| `src/app/api/cron/workflow-notifications/route.ts` | 121 | `GET` sweep 2 | `playbookInstance.findMany({ where: { status: 'BLOCKED', … } })` over **all tenants** | zero rows → the >48h blocked-instance email escalation stops entirely | a |
| `src/app/api/cron/auto-close-tickets/route.ts` | 53 | `GET` | `supportTicket.updateMany({ where: { id: { in: ticketIds } } })` where `ticketIds` came from a preceding raw SQL scan of **all tenants'** tickets | `SupportTicket` policy is `"tenantId" = current_tenant_id()`; GUC unset → zero rows updated. The route still returns `{ success: true, closed: N }` using the *count from the raw query*, so it reports closing tickets it did not close. | a,d |
| `src/lib/automations/evaluator.ts` | 203 | `runDueRuns` (called from `GET /api/cron/automations`) | `automationRun.update` by run id, on runs collected from an all-tenant `appEvent` / `automationRule` scan | zero rows updated → runs never leave `PENDING` → **the same automation re-fires on every cron tick**. This is the one site here whose failure is not "nothing happens". | a,d |

> Note on the digest crons: each one then does `prisma.$extends(withTenantRLS(tenant.id))` inside the loop. `withTenantRLS` injects `tenantId` into Prisma args and **does not set the GUC** (its own header comment says so, `tenant-rls.ts:25-33`). Those per-tenant queries are therefore also GUC-less — but they are not `bypass_rls` sites, so they are outside this document's count. They break for the same reason and are listed in §6.

### 3.2 Pre-auth and public paths

| File | Line | Function / route | What it reads or writes across tenants | Breakage under `app_user` | Sub |
|---|---|---|---|---|---|
| `src/lib/auth/supabase.ts` | 147 | `getCurrentUser()` | `user.findUnique({ where: { id: session.userId } })` — session bootstrap, runs *in order to* establish tenant context | `User` policy is `"tenantId" = current_tenant_id()` **with** `WITH CHECK`. GUC is not yet set, by definition of what this function is for → returns `null`. Every caller that treats `null` as "not authenticated" starts rejecting authenticated users. | b,d |
| `src/lib/db/repositories/tenant.repository.ts` | 33 | `provisionTenant()` | `tenant.create({ data: { …, users: { create: { … } } } })` — creates a Tenant that does not exist yet plus its first Owner | **`"Tenant"` has no INSERT policy at all** (only `bypass_rls_policy` FOR ALL and `tenant_self_read` FOR SELECT). With FORCE RLS on and the bypass policy dropped, `INSERT INTO "Tenant"` is rejected outright. Tenant provisioning stops working. | b |
| `src/lib/db/repositories/tenant.repository.ts` | 66 | `findTenantByUserId()` | `user.findUnique({ where: { id: userId }, include: { tenant: true } })` — no tenant predicate; also used by the sysadmin portal for *any* user id | zero rows; both the onboarding bootstrap and the sysadmin lookup return `null` | b,d |
| `src/lib/db/repositories/tenant.repository.ts` | 87 | `listAllTenants()` | `tenant.findMany()` — every tenant row, by design | `tenant_self_read` admits at most the caller's own tenant, and the GUC is unset in the sysadmin context → empty tenant list in the sysadmin portal | a |
| `src/lib/onboarding/provision-tenant.ts` | 36 | `provisionTenant(input, authUserId)` (sign-up) | one transaction covering `user.findFirst({ where: { email } })` (global email-uniqueness probe across all tenants), Tenant creation, Owner User creation, subscription/plan rows | the global email probe returns zero rows (so it stops catching cross-tenant collisions) **and** the `Tenant` insert is rejected for want of a policy. **Sign-up fails.** | a,b |
| `src/app/api/auth/accept-invitation/route.ts` | 44 | `GET` | `driverInvitation.findUnique({ where: { id } })` — an unauthenticated visitor with an invite link; no session, no tenant | `DriverInvitation` policy is `"tenantId" = current_tenant_id()`; GUC unset → 404 "Invitation not found" on every valid invitation link | b,d |
| `src/app/api/auth/accept-invitation/route.ts` | 121 | `POST` | same `driverInvitation.findUnique({ where: { id: invitationId } })` | same → acceptance is impossible | b,d |
| `src/app/api/auth/accept-invitation/route.ts` | 156 | `POST` | `user.findFirst({ where: { email, tenantId: invitation.tenantId } })` — the tenant is known only from the invitation row just read | the read at :121 already returned null, so this is unreachable; on its own it would also return zero rows (GUC unset) and silently skip the duplicate-email guard | b |
| `src/app/api/auth/accept-invitation/route.ts` | 240 | `POST` | `user.create({ … tenantId: invitation.tenantId })` + `driverInvitation.update({ where: { id } })` | both fail `WITH CHECK` / match zero rows. The Supabase Auth user has already been created by this point (line ~176), so a failure here leaves an auth user with no Prisma `User` row. | b |
| `src/app/api/email-confirm/[token]/route.ts` | 54 | `GET` | `tenant.findUnique({ where: { id: tenantId } })` then `tenant.update({ … emailConfirmedAt })`, driven by a signed token, no session | the read needs the GUC (unset → null → "TENANT_NOT_FOUND"), and **`"Tenant"` has no UPDATE policy at all**, so the write is rejected even if the read were fixed. Email confirmation breaks in two independent ways. | b |
| `src/app/api/track/[token]/route.ts` | 24 | `GET /api/track/[token]` | `load.findUnique({ where: { trackingToken: token } })` — the **public** customer tracking page. No auth, no session, no tenant; the token is the only credential and the row it finds belongs to whichever tenant issued it. | `Load` policy is `"tenantId" = current_tenant_id()`; unauthenticated request, GUC `''` → zero rows → every tracking link 404s. This is the clearest genuine cross-tenant read in the codebase. | b,d |
| `src/app/api/track/[token]/route.ts` | 49 | `GET` (GPS block) | `gPSLocation.findFirst({ where: { truckId } })` — no tenant predicate, truck id taken from the load above | zero rows → the public map loses the live position even if the load lookup were fixed | b,d |

### 3.3 SysAdmin / `(admin)` surfaces

| File | Line | Function | What it reads or writes across tenants | Breakage under `app_user` | Sub |
|---|---|---|---|---|---|
| `src/app/(admin)/actions/automations.ts` | 107 | `fireAutomationNow(ruleId, tenantId)` | `automationRun.create({ data: { ruleId, tenantId, triggeredBy: 'manual:sysadmin' } })` — a sysadmin acting on **another** tenant's automation | the sysadmin's own GUC (if any) is their own tenant, not the target's → `WITH CHECK` fails, manual fire is rejected | a |
| `src/app/(admin)/actions/automations.ts` | 141 | same | `automationRun.updateMany({ where: { id: newRunId, status: 'PENDING' }, data: { status: 'SENT' } })` | zero rows → the run is left `PENDING` after the email was already sent; the next cron tick re-sends it | a,d |
| `src/app/(admin)/actions/automations.ts` | 151 | same | same `updateMany` on the FAILED branch | zero rows → failure is never recorded | a,d |
| `src/app/(admin)/actions/tenants.ts` | 586 | `extendTrial(tenantId, additionalDays)` | `subscription.update({ where: { tenantId } })` + `appEvent.create({ data: { tenantId, eventType: 'trial.extended' } })` on an **arbitrary** tenant | both scoped by `current_tenant_id()`; the sysadmin is not that tenant → zero rows updated and the event insert fails. Trial extension silently does nothing. | a |
| `src/actions/support-tickets.ts` | 341 | `updateTicketStatus(ticketId, …)` — `requireAdminAccess()` | `supportTicket.update({ where: { id: ticketId } })` on any tenant's ticket | zero rows → admin cannot resolve or close any ticket | a,d |
| `src/actions/support-tickets.ts` | 475 | `addAdminReply(ticketId, body)` — admin | `supportTicket.findFirst({ where: { id } })` (no tenant), a raw `SELECT email FROM "User" WHERE id = …` (raw SQL is **never** touched by the Prisma injection layer — RLS is its only filter), `ticketMessage.create`, `supportTicket.update` | every statement matches zero rows / fails `WITH CHECK`. Admin replies become impossible. | a,d |
| `src/actions/support-tickets.ts` | 542 | `getTicketMessages(ticketId)` — admin | `ticketMessage.findMany({ where: { ticketId } })` across tenants | `TicketMessage` has no tenant column; its policy is a subquery `ticketId IN (SELECT id FROM "SupportTicket" WHERE "tenantId" = current_tenant_id())` — so with the GUC unset the subquery is empty and the thread renders blank in the admin dashboard | a,c |

### 3.4 Global / null-tenant tables and deliberate global scans

| File | Line | Function | What it reads or writes across tenants | Breakage under `app_user` | Sub |
|---|---|---|---|---|---|
| `src/actions/support-tickets.ts` | 98 | `generateTicketNumber()` | `supportTicket.findFirst({ orderBy: { ticketNumber: 'desc' } })` with **no `where` at all** — deliberately the global maximum, because `TKT-NNNN` is a single sequence shared by every tenant | returns the caller's own tenant's max, or (GUC unset) nothing → the function falls back to `TKT-0001`. `SupportTicket.ticketNumber` is `@unique`, so the insert that follows **collides** and ticket creation starts throwing. This one is not fixed by a client swap — it needs a real sequence or per-tenant numbering. | a |
| `src/app/api/mobile/support/ticket/route.ts` | 39 | `generateTicketNumber()` (second copy, mobile) | identical unfiltered `supportTicket.findFirst` | identical — and the two copies race against each other | a |
| `src/actions/support-tickets.ts` | 169 | `createSupportTicket(...)` | `supportTicket.create({ data: { tenantId, … } })` where `const tenantId = session.tenantId \|\| null`. `SupportTicket.tenantId` is **nullable** precisely so sysadmins can file tickets with no tenant (`20260328000002_nullable_tenant_support_ticket`). | the policy is `USING ("tenantId" = current_tenant_id())` with no explicit `WITH CHECK`, so PostgreSQL derives the check from `USING`. `NULL = anything` → NULL → **not true** → a null-tenant ticket can never be inserted, and once inserted could never be read. | c |
| `src/actions/support-tickets.ts` | 217 | `getMyTickets()` | `supportTicket.findMany({ where: { submittedBy: userId } })` — **no tenant predicate**; deliberately includes the caller's null-tenant tickets | zero rows (GUC unset here — `requireAuth()` does not set it) → "My tickets" is empty for everyone | c,d |
| `src/actions/support-tickets.ts` | 371 | `getTicketById(ticketId)` | `supportTicket.findFirst({ where: { id, tenantId: session.tenantId ?? undefined, submittedBy } })` — **`?? undefined` deletes the predicate** rather than matching nothing, so for a tenant-less session this is an unscoped lookup by id. Also reads `ticketMessage` (no tenant column). | zero rows; and the `?? undefined` shape means the code's own isolation guarantee is conditional today | c,d |
| `src/actions/support-tickets.ts` | 410 | `addOwnerReply(ticketId, body)` | same `?? undefined` lookup, then `ticketMessage.create({ data: { ticketId, … } })` | same, plus the `TicketMessage` insert fails its parent-join policy | c,d |
| `src/lib/email/sender-config.ts` | 135 | `resolveSenderConfig()` | `notificationEmailConfig.findFirst({ orderBy: { updatedAt: 'desc' } })` — **`NotificationEmailConfig` is a global singleton with no tenant column**, and the function's own comment says "the send path runs outside any tenant context" | this is exactly the §4.12 allowlist class. If the table keeps no policy admitting `app_user`, every outbound email silently falls back to the env-var sender identity — a wrong `From`/`Reply-To` on production mail rather than a visible error. | c |
| `src/lib/notifications/audit-log.ts` | 48 | `writeAuditLog(prisma, entries)` | `notificationSendLog.createMany(...)` with per-entry `tenantId`. The client is whatever the caller passed; `dispatcher.ts:76` defaults it to the **bare** singleton (`options.prismaClient ?? defaultPrisma`), and the digest crons call the dispatcher once per tenant in a loop. | `WITH CHECK` fails for every row → the notification audit trail stops being written. The function **swallows all errors by design** ("audit must never break the caller"), so this fails completely silently. | a |
| `src/lib/security/audit-log.ts` | 68 | `writeAuditLog(params)` | `auditLog.create({ data: { tenantId, … } })`. The file's own comment states the intent: *"this call succeeds regardless of which tenant context the caller is operating under … the audit system must write even during RBAC-denied access attempts where the calling context may differ from the row being audited."* | that stated requirement is exactly what a tenant `WITH CHECK` forbids. `audit_log` is FORCE RLS + REVOKE UPDATE/DELETE. PII-access and RBAC-denial auditing stops. The function logs and rethrows, so callers that treat audit failure as fatal will start 500-ing. | a |

### 3.5 Dual-caller helpers — reached from both tenant-scoped requests and cron

These are the dangerous ones: **one import site decides the behaviour for every caller**, so they cannot be fixed per-route.

| File | Line | Function | What it reads or writes across tenants | Breakage under `app_user` | Sub |
|---|---|---|---|---|---|
| `src/lib/notifications/send-push.ts` | 27 | `sendPushToUser(userId, …)` | `pushToken.findMany({ where: { userId } })` — **no tenant predicate**. `PushToken` *does* carry `tenantId` (quick-327), so the policy filters it. Callers span `(owner)/actions/*`, `/api/v1/messages/*`, `lib/carrier/*`, the tRPC workflow routers **and** `lib/notifications/dispatcher.ts` (reached from the three digest crons) and `server/services/workflows/notifications.ts` (reached from `cron/workflow-notifications`). | zero tokens returned → the function returns early and every push notification stops. Errors are swallowed and logged at `info`, so nothing surfaces. | a,d |
| `src/lib/notifications/send-push.ts` | 68 | `sendPushToUser` cleanup | `pushToken.deleteMany({ where: { token } })` — by token string, no tenant | zero rows → expired Expo tokens are never reaped | a,d |
| `src/lib/notifications/send-push.ts` | 158 | `sendPushToOrg` cleanup | same `deleteMany({ where: { token } })` | same | a,d |
| `src/server/services/workflows/notifications.ts` | 62 | `getUserName(userId)` | `user.findUnique({ where: { id: userId } })` — no tenant predicate. Reached from tRPC (request context) and from `cron/workflow-notifications` (no context). | zero rows → names degrade to a fallback string in every workflow notification | a,d |
| `src/server/services/workflows/notifications.ts` | 149 | `loadStepInstance(stepInstanceId)` | `stepInstance.findUnique({ where: { id } })` + nested `playbookInstance` — no tenant predicate | null → `sendStepAssigned` / `sendStepFailed` return early; assignment and failure notifications stop | a,d |
| `src/server/services/workflows/notifications.ts` | 251 | `sendStepOverdue(...)` | `stepInstance.findUnique({ where: { id: stepInstanceId }, select: { dueDate } })` — no tenant predicate; called directly from the cron sweep | null → `daysOverdue` silently defaults to `1` in the email body (wrong number, no error) | a,d |
| `src/server/services/workflows/notifications.ts` | 316 | `sendInstanceBlocked(...)` | `playbookInstance.findUnique({ where: { id: playbookInstanceId } })` — no tenant predicate | null → in-app blocked notification never sent | a,d |
| `src/server/services/workflows/notifications.ts` | 557 | `sendInstanceBlockedEmail(...)` | same `playbookInstance.findUnique({ where: { id } })`; this is the function `cron/workflow-notifications` sweep 2 calls | null → the >48h escalation email is never sent | a,d |
| `src/lib/driver-pay/require-driver.ts` | 106 | `withBypassRls()` inside `requireDriverContext(req)` | `carrierDriver.findFirst({ where: { userId } })` — **no `orgId` predicate**. This helper is the auth gate for the whole `/api/driver-pay/me/*` surface, and it takes the bypass branch **only for Bearer (mobile) requests**; the cookie branch uses `getTenantPrisma()` and is fine. | `carrier_drivers` policy is `org_id = current_tenant_id()`; the mobile branch never sets the GUC → `driver` is null → **every mobile driver-pay request 403s**. The web branch keeps working, so this will look like a mobile-only regression. | d |

### 3.6 Accidental unscoped reads (rule (d) only — these are latent isolation bugs today)

| File | Line | Function | What it does | Breakage under `app_user` | Sub |
|---|---|---|---|---|---|
| `src/app/(driver)/tasks/[id]/page.tsx` | 95 | `DriverTaskDetailPage` (audit footer) | `stepInstance.findFirst({ where: { id } })` selecting `creator { firstName, lastName, email }, createdAt, updatedAt` — **no tenant predicate in either layer**. Today, with the bypass live, a driver who types another tenant's StepInstance id into the URL gets that tenant's creator name and email rendered in the audit footer. The sibling `fetchTask` call in the same `Promise.all` *is* scoped, so the page body 404s — but this query runs regardless and its result is rendered. | zero rows → the audit footer goes blank. Wrapped in `.catch(() => null)`, so it fails silently. **RLS would actually close this hole** once the GUC is set — worth fixing the query anyway, since the app layer should not depend on RLS for a predicate it could state itself. | d |
| `src/app/api/mobile/driver/messages/route.ts` | 109 | `POST` (send message) | `load.findFirst({ where: { id: resolvedLoadId, driverId } })` — `tenantId` is omitted, unlike every sibling query in the same file. Ownership rests entirely on `driverId` being a globally unique Supabase user id. | zero rows → "load not found", message send fails. Again RLS closes the latent hole, but the missing predicate should be restored. | d |

---

## 4. DECORATIVE files — 161 sites across 84 files

Every site below is confined to a single already-known tenant. The **Blocker** column is what matters for the cutover: `—` means the path survives as-is; `GUC` means `app.current_tenant_id` is never set for that request so it returns zero rows / fails `WITH CHECK` anyway; `NO_POLICY` means the table admits `app_user` under no circumstances today.

### 4.1 Survives the cutover as-is — 15 sites, 6 files

These call `getTenantPrisma()` earlier in the same request. The GUC is `set_config(..., false)` (session scope) on a `max: 1` pool, so it remains set for the bare-client transactions that follow within that request.

| File | Sites | Lines | Why it is safe | Blocker |
|---|---|---|---|---|
| `src/app/api/v1/carrier/stops/[id]/messages/route.ts` | 4 | 49, 76, 89, 201 | `await getTenantPrisma()` at L38 (`GET`) and L171 (`POST`); every query additionally carries `tenantId` | — |
| `src/app/api/driver/stops/[stopId]/messages/route.ts` | 5 | 66, 92, 105, 209, 219 | `await getTenantPrisma()` at L41 (`GET`) and L184 (`POST`) | — |
| `src/app/(owner)/carrier/stops/[id]/page.tsx` | 3 | 91, 110, 153 | `await getTenantPrisma()` at L73; `where: { id, orgId }` on the first two. L153 (`User` by id set) has no app-layer predicate but RLS holds it. | — |
| `src/app/(owner)/carrier/trips/[id]/page.tsx` | 1 | 137 | `await getTenantPrisma()` at L36; `where: { stopId: { in }, tenantId: orgId }` | — |
| `src/app/(owner)/carrier/trips/[id]/stops/page.tsx` | 1 | 118 | `await getTenantPrisma()` at L68; `tenantId: orgId` | — |
| `src/app/(driver)/actions/driver-dashboard.ts` | 1 | 74 | `await getTenantPrisma()` at L70, one line above | — |

### 4.2 Blocked by a policy-less table, not by the bypass drop — 1 site

| File | Sites | Lines | Note | Blocker |
|---|---|---|---|---|
| `src/app/(driver)/actions/driver-dashboard.ts` | 1 | 86 | Runs on the tenant-scoped client (GUC set) and is correctly scoped, but `tx.carrierStop.count` hits `stops`, which runs **FORCE RLS with zero policies** (`20260909120000_reconcile_rls_policy_drift`). `CarrierStop` is also in `EXEMPT_MODELS`, so nothing filters it and nothing permits it. Count is always 0 post-cutover; the outer `catch {}` returns defaults, so it fails silently. | NO_POLICY |

### 4.3 Blocked by the GUC gap — 145 sites, 78 files

All confined to one tenant in application code; none of them ever pushes that tenant into the DB session. Grouped by surface.

#### `/api/mobile/owner/*` — 61 sites, 30 files (`GUC`)

Uniform shape across all 30 files: `validateMobileToken(req)` (or `withMobileAuth`) yields `auth.tenantId` from the Supabase JWT `app_metadata`, then a bare `prisma.$transaction` with the bypass line and an explicit `tenantId` in every `where`/`data`. Neither `validateMobileToken` nor `withMobileAuth` sets `app.current_tenant_id`, and middleware skips `/api/mobile/*` entirely (`middleware.ts:100-102`). The tenant discipline is genuinely complete; the DB just never learns about it.

| File | Sites | Lines |
|---|---|---|
| `src/app/api/mobile/owner/compliance/route.ts` | 1 | 45 |
| `src/app/api/mobile/owner/crm/route.ts` | 1 | 42 |
| `src/app/api/mobile/owner/crm/[id]/route.ts` | 2 | 41, 194 |
| `src/app/api/mobile/owner/customers/route.ts` | 2 | 41, 96 |
| `src/app/api/mobile/owner/dashboard/route.ts` | 1 | 30 |
| `src/app/api/mobile/owner/drivers/route.ts` | 1 | 62 |
| `src/app/api/mobile/owner/drivers/active/route.ts` | 1 | 41 |
| `src/app/api/mobile/owner/drivers/[id]/route.ts` | 2 | 83, 291 |
| `src/app/api/mobile/owner/drivers/invite/route.ts` | 4 | 68, 81, 106, **126** — L126 is the only mobile site touching `"Tenant"`; it survives *if* the GUC is set (`tenant_self_read`), and fails soft to `organizationName = 'your fleet'` |
| `src/app/api/mobile/owner/fleet/messages/route.ts` | 6 | 44, 93, 115, 129, 278, 303 |
| `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts` | 7 | 50, 126, 143, 153, 164, 243, 286 |
| `src/app/api/mobile/owner/fleet-positions/route.ts` | 1 | 40 — raw `$queryRaw`; the Prisma injection layer never sees it, so `WHERE gps."tenantId" = $1` is today's only guard and the `Truck`/`User` joins carry none |
| `src/app/api/mobile/owner/fuel/route.ts` | 2 | 37, 153 |
| `src/app/api/mobile/owner/invoices/route.ts` | 2 | 39, 160 |
| `src/app/api/mobile/owner/invoices/[id]/route.ts` | 1 | 34 |
| `src/app/api/mobile/owner/loads/route.ts` | 2 | 65, 185 |
| `src/app/api/mobile/owner/loads/[id]/route.ts` | 4 | 53, 177, **206**, 243 — L206 `invoice.count({ where: { loadId } })` has no tenant predicate; it is confined only transitively, by the `{ id, tenantId }` load check in a *separate earlier transaction* |
| `src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts` | 1 | 55 |
| `src/app/api/mobile/owner/maintenance/route.ts` | 1 | 81 |
| `src/app/api/mobile/owner/map/vehicles/route.ts` | 1 | 44 — raw `$queryRaw`, same note as fleet-positions |
| `src/app/api/mobile/owner/payroll/route.ts` | 2 | 38, **175** — L175 writes `driverId` from the request body without checking it belongs to the tenant (app-layer gap, unrelated to RLS; an FK check runs as table owner and does not consult RLS) |
| `src/app/api/mobile/owner/payroll/[id]/route.ts` | 1 | 41 |
| `src/app/api/mobile/owner/profit-predictor/route.ts` | 1 | 66 |
| `src/app/api/mobile/owner/routes/route.ts` | 2 | 61, 208 |
| `src/app/api/mobile/owner/routes/[id]/route.ts` | 2 | 44, 140 |
| `src/app/api/mobile/owner/safety/route.ts` | 1 | 49 |
| `src/app/api/mobile/owner/trucks/route.ts` | 2 | 76, 143 |
| `src/app/api/mobile/owner/trucks/[id]/route.ts` | 2 | 40, 202 |
| `src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts` | 2 | 39, 157 |
| `src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts` | 3 | 84, 206, 319 |

#### `/api/mobile/driver/*` and `/api/mobile/support/*` — 21 sites, 17 files (`GUC`)

Same shape and same root cause. The `/api/mobile/carrier/*` siblings were already converted to `getTenantPrismaForOrg(auth.tenantId, auth.userId)` by quick-588 — these were left behind.

| File | Sites | Lines |
|---|---|---|
| `src/app/api/mobile/driver/dashboard/route.ts` | 1 | 30 |
| `src/app/api/mobile/driver/documents/route.ts` | 2 | 55, 201 |
| `src/app/api/mobile/driver/documents/[id]/url/route.ts` | 1 | 48 |
| `src/app/api/mobile/driver/hos/route.ts` | 2 | 29, 174 (the `update({ where: { id: openEntry.id } })` inside L174 has no tenant predicate but follows a scoped `findFirst` in the same tx) |
| `src/app/api/mobile/driver/incidents/route.ts` | 2 | 38, 134 |
| `src/app/api/mobile/driver/loads/route.ts` | 1 | 55 |
| `src/app/api/mobile/driver/loads/[id]/route.ts` | 1 | 48 |
| `src/app/api/mobile/driver/loads/[id]/status/route.ts` | 1 | 98 (update by id after a scoped `findUnique` in the same tx) |
| `src/app/api/mobile/driver/loads/[id]/revert/route.ts` | 1 | 59 (same pattern) |
| `src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts` | 1 | 53 |
| `src/app/api/mobile/driver/messages/route.ts` | 1 | 31 (L109 is CROSS_TENANT — see §3.6) |
| `src/app/api/mobile/driver/messages/route-thread/route.ts` | 2 | 45, 114 |
| `src/app/api/mobile/driver/messages/unread-count/route.ts` | 1 | 49 |
| `src/app/api/mobile/driver/route/route.ts` | 1 | 40 |
| `src/app/api/mobile/driver/tasks/route.ts` | 1 | 26 (scoped indirectly via `playbookInstance: { tenantId }`; `StepInstance`'s own policy keys on its own `tenantId`) |
| `src/app/api/mobile/driver/tracking-token/route.ts` | 1 | 43 |
| `src/app/api/mobile/support/ticket/route.ts` | 1 | 97 (`data.tenantId = auth.tenantId`; note `auth.tenantId` is read with no null check — `mobile-auth.ts:69` — and line 123 of the route uses `auth.tenantId ?? ''`, so a JWT missing the claim writes a null-tenant row that no policy admits) |

#### `/api/v1/messages/*` and other Bearer/session API routes — 18 sites, 11 files (`GUC`)

None of these files ever calls `getTenantPrisma()`. `session.tenantId` in a Prisma `where` is not a tenant pin at the database layer.

| File | Sites | Lines | Note |
|---|---|---|---|
| `src/app/api/v1/messages/broadcast/route.ts` | 1 | 54 | `fleetMessage.create({ data: { tenantId, … } })` → `WITH CHECK` fails |
| `src/app/api/v1/messages/conversations/route.ts` | 3 | 38, 74, 94 | all three carry `tenantId` / `orgId: tenantId` |
| `src/app/api/v1/messages/send/route.ts` | 2 | 64, 76 | recipient verify returns zero rows → every send 404s |
| `src/app/api/v1/messages/thread/route.ts` | 3 | 79, 105, 118 | L105 `updateMany({ where: { id: { in: unreadIds } } })` is confined transitively by the scoped read at L79 |
| `src/app/api/v1/messages/[id]/audio-url/route.ts` | 1 | 36 | `where: { id, tenantId }` → zero rows → every voice message 404s |
| `src/app/api/gps/report/route.ts` | 2 | 88, 120 | `validateMobileToken` **or** cookie session; neither sets the GUC → L88 returns zero rows → 404 "No active load or route" for every driver on both surfaces |
| `src/app/api/driver/gps-ping/route.ts` | 1 | 69 | `getTenantPrisma()` exists in this file at **L93 — after** this transaction. Wrapped in `try {} catch {}`, returns `carrierTruckId = null`, and the route still responds `{ saved: true }`. |
| `src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts` | 2 | 60, 108 | only on the `isMobile` branch (`require-driver.ts:96-101` hands back the global client); the cookie branch uses `getTenantPrisma()` and is fine |
| `src/app/api/push-tokens/route.ts` | 1 | 54 | `pushToken.upsert` — the `where` is the `userId_platform` compound unique with no tenant predicate; the `create` carries `tenantId` |
| `src/app/api/integrations/samsara/sync/route.ts` | 1 | 54 | `tenantIntegration.findFirst({ where: { tenantId, provider, enabled } })` |
| `src/app/api/integrations/motive/sync/route.ts` | 1 | 54 | same |

#### Server components and server actions — 9 sites, 6 files (`GUC`)

| File | Sites | Lines | Note |
|---|---|---|---|
| `src/app/(owner)/carrier/dashboard/page.tsx` | 2 | 24, 30 | L24 reads `"Tenant"` (needs the GUC for `tenant_self_read`); L30 counts `carrier_trucks`/`carrier_drivers`/`loads`/`clients`, all `org_id = current_tenant_id()`. Both `.catch(() => …)` → silent. |
| `src/app/(driver)/actions/driver-routes.ts` | 1 | 202 | `startTrip(dispatchId)` — `requireRole` + `getSession` only. The `getTenantPrisma()` calls at L49/131/282/326 are in *other* functions. `owned` becomes `false` → every driver gets "Dispatch not found or not assigned to you". |
| `src/app/(driver)/tasks/page.tsx` | 1 | 148 | scoped via `playbookInstance: { tenantId }`; `"StepInstance"`'s own policy keys on its own `tenantId` → zero rows |
| `src/app/(driver)/tasks/[id]/page.tsx` | 1 | 207 | `fetchTask` — properly scoped at the app layer; zero rows → `notFound()` on every driver task |
| `src/app/onboarding/welcome/page.tsx` | 3 | 27, 50, 70 | L27 counts carrier tables by `orgId`; L50/L70 read `"Tenant"`. A session exists but `getTenantPrisma()` is never called. |
| `src/actions/doc-feedback.ts` | 1 | 32 | **`requireTenantId()` is called at L20 and does not set the GUC** — only `getTenantPrisma()` does. This is the easiest site in the codebase to misread as safe. |

#### Pre-auth and onboarding writes that are nonetheless tenant-confined — 4 sites, 3 files (`GUC`, one also `NO_POLICY`)

| File | Sites | Lines | Note |
|---|---|---|---|
| `src/app/(auth)/sign-up/actions.tsx` | 1 | 232 | `appEvent.create({ data: { tenantId: result.tenantId, eventType: 'tenant.created' } })` — the tenant exists by now, but there is no session to derive it from. Remedy is `getTenantPrismaForOrg(result.tenantId)`, not a privileged connection. |
| `src/lib/onboarding/hydrate-tenant.ts` | 2 | 13, 36 | L13 reads `"Tenant"` + the Owner `User`. **L36 calls `tenant.update({ provisioningPhase: HYDRATED })` — `"Tenant"` has no UPDATE policy at all**, so this is `NO_POLICY`, not merely `GUC`. Sample-data seeding would then never be marked complete. |
| `src/app/api/auth/login/route.ts` | 1 | 154 | The same file already does this correctly twice — L74 and L113 wrap `set_config('app.current_tenant_id', …, TRUE)` in the transaction with an explicit comment about app_user. L154 was not given the same treatment. Because those two use **transaction** scope (`TRUE`), the value does not carry into this third transaction. Non-fatal today (`catch` defaults `ownerIsActivated = true`), so an OWNER would simply always be routed to the dashboard. |

#### Cron work *inside* the per-tenant loop — 6 sites, 3 files (`GUC`)

Confined to the tenant the loop is currently on, per the brief's own rule. They are still GUC-less, because nothing in the loop sets the GUC.

| File | Sites | Lines | Note |
|---|---|---|---|
| `src/app/api/cron/workflow-digest/route.ts` | 4 | 73, 93, 164, 173 | all four carry `tenantId` from the loop variable; L173 writes the dedup `playbookNotification` row (`WITH CHECK` fails → the digest would re-send daily if the reads were fixed but this were not) |
| `src/app/api/cron/automations/route.ts` | 1 | 179 | `automationRun.create({ data: { ruleId, tenantId, triggeredBy: 'cron:…' } })` |
| `src/lib/automations/evaluator.ts` | 1 | 95 | `automationRun.create({ data: { tenantId: event.tenantId, … } })` (L203, the update, is CROSS_TENANT — see §3.1) |

#### Helpers and services, tenant-confined — 26 sites, 8 files (`GUC`)

| File | Sites | Lines | Note |
|---|---|---|---|
| `src/lib/geofencing/geofence-check.ts` | 8 | 46, 81, 97, 138, 153, 184, 214, 230 | Exactly **one** caller: `/api/gps/report:137`. L46/L184 carry `{ tenantId, driverId, truckId }`; the six updates address rows by id obtained from those scoped reads. GUC-less because the GPS route is GUC-less. |
| `src/lib/email/send-geofence-alert.ts` | 1 | 52 | `legacySendGeofenceAlert` — `user.findMany({ where: { tenantId: data.tenantId, role: { in: ['OWNER','MANAGER'] } } })`; reached only from the geofence path |
| `src/lib/onboarding/activation-tracker.ts` | 2 | 48, 177 | `activationProgress` by `tenantId`, plus an `appEvent.create` on the error path. Callers include `accept-invitation`, which has no session at all. |
| `src/lib/notifications/send-push.ts` | 1 | 111 | `sendPushToOrg` — `pushToken.findMany({ where: { user: { tenantId: orgId, … } } })`. Confined; the other three sites in this file are CROSS_TENANT. |
| `src/server/services/workflows/notifications.ts` | 5 | 49, 80, 95, 106, 127 | L49 `tenant.findUnique({ where: { id: tenantId } })` (the tenant *is* the scope; needs the GUC for `tenant_self_read`), L80 `{ id, tenantId }`, L95/L106 `{ tenantId, role in (OWNER,MANAGER) }`, L127 `playbookNotification.create({ tenantId })`. The other five sites in this file are CROSS_TENANT. |
| `src/server/api/routers/workflows/analytics.ts` | 7 | 26, 34, 42, 71, 110, 126, 142 | all seven use `ctx.tenantId` from `tenantMemberProcedure`, directly (26/34/42/71/110) or transitively via ids from a tenant-scoped read (126/142). **The tRPC context (`server/api/trpc.ts`) reads the session but never calls `getTenantPrisma()`, so no tRPC procedure has the GUC set.** |
| `src/server/api/routers/workflows/instance.ts` | 1 | 105 | `user.findMany({ where: { id: { in: skippedUserIds } } })` — ids derived from a tenant-scoped instance read; no tenant predicate of its own |
| `src/server/services/workflows/generatePlaybookInstance.ts` | 1 | 65 | `playbookInstance.create({ data: { tenantId, … } })` plus its step instances |

---

## 5. What moving these to a privileged connection requires

### There is no privileged connection today

`apps/web/src/lib/db/prisma.ts` is 92 lines and exports exactly **one** Prisma client, built from exactly **one** connection string:

- **line 45** — `connectionString: process.env.DATABASE_URL` (inside the single `new Pool({ … })`, guarded by a `globalThis` singleton, `max: 1`)
- **line 83** — `export const prisma = globalForPrisma.prisma || new PrismaClient({ adapter })`

`process.env.DATABASE_URL` appears in **one** runtime source location in all of `apps/web/src` — that line 45. (The only other hits are prose inside `src/generated/prisma/index.d.ts` and two comments.) There is no `DIRECT_URL`, no `ADMIN_DATABASE_URL`, no second pool, no env-validation schema, and nothing that selects a connection per call site.

So **"move these calls to the privileged connection" is not a refactor of existing plumbing — it is the introduction of plumbing that does not exist.** Concretely it means: a second `pg.Pool` + `PrismaPg` adapter + `PrismaClient`, bound to a new environment variable (say `PRIVILEGED_DATABASE_URL`) that continues to point at a `BYPASSRLS` role after `DATABASE_URL` moves to `app_user`, exported alongside `prisma`, and imported by exactly the call sites that need it.

### Files that would have to change

| Change | Files | Notes |
|---|---|---|
| Add the second client | `apps/web/src/lib/db/prisma.ts` | one new `Pool` (the existing `pool.on('connect')` GUC initialiser must **not** be copied onto it — a BYPASSRLS connection has no use for the tenant GUC), one new adapter, one new `export const privilegedPrisma`. Both pools are `max: 1`, so this doubles the Supabase session-pooler slot draw per warm lambda; that is a capacity decision, not just a code one. |
| Swap the import at genuinely cross-tenant sites | the **26 files** in §3 | mechanical: `import { prisma }` → `import { privilegedPrisma as prisma }` in the 11 purely-CROSS_TENANT files; in the 15 mixed files the two clients must coexist and each of the 50 call sites picked individually |
| Environment | `apps/web/.env.local`, Vercel project env (Production + Preview), `.env.example` if one is added, and the `apps/web/scripts/audit/*` harnesses that read `DATABASE_URL` | there is no env-validation module to update, which is itself a risk — a missing `PRIVILEGED_DATABASE_URL` would surface as a `pg` connect error at first use, in whatever request happens to hit it first |
| Boot-time guard | `apps/web/src/lib/db/prisma.ts` | Phase 0 already plans a startup assertion that `DATABASE_URL` resolves to a role with `rolbypassrls = false`. The mirror assertion — that `PRIVILEGED_DATABASE_URL` resolves to one with `rolbypassrls = true` — belongs in the same place, or the "privileged" client silently is not. |

**Blast radius: 27 files** (26 + `prisma.ts`), 50 call sites, 1 new env var across ≥2 Vercel environments. That is the *upper* bound for the privileged-connection route, and it is deliberately an over-estimate, because a meaningful fraction of the 50 does not want a privileged connection at all:

- **7 sites** (§3.4 `support-tickets.ts:169/217/371/410`, `mobile/support/ticket.ts:97` and the two `generateTicketNumber` copies) are really a data-model problem — a nullable `tenantId` and a globally-unique ticket sequence. A privileged connection papers over both.
- **11 sites** flagged with rule (d) alone (the `findUnique({ where: { id } })` shapes in `send-push.ts`, `workflows/notifications.ts`, `require-driver.ts`, `tasks/[id]/page.tsx:95`, `mobile/driver/messages:109`) would be better served by **adding the missing tenant predicate** and moving to `getTenantPrismaForOrg(tenantId)`, since the caller already holds the tenant. Giving them a BYPASSRLS connection preserves a latent isolation hole that RLS would otherwise close.
- The genuinely irreducible set — where a privileged connection is the right answer — is the pre-auth paths (§3.2, 12 sites), the sysadmin surfaces (§3.3, 7 sites), the all-tenant cron listings (§3.1), and the global singleton (`sender-config.ts:135`).

**No change has been made.** This section is a cost estimate, not a plan.

### And the other 145 DECORATIVE sites need a different fix entirely

They need `getTenantPrismaForOrg(tenantId, userId)` — the tenant is already in hand, it just never reaches the DB session. The repo already contains the precedent: quick-588 converted `/api/mobile/carrier/*` to exactly this (`src/app/api/mobile/carrier/driver/dispatches/route.ts:38`). Giving these a privileged connection instead would preserve the current, correct-but-undefended posture and throw away the entire security benefit of the cutover on the largest surface in the app. **Do not let "move it to the privileged connection" become the default remedy for a GUC-flagged site.**

---

## 6. Risks and edge cases

**UNKNOWN count: 0.** Every one of the 211 executable sites was classified from source. Two matches were determined not to be sites at all (§1). If any site had resisted a confident call it would be listed here by file and line; none did. The residual uncertainty is not in *which bucket a site is in* — it is in the two items below, both of which are facts about the database that this document deliberately did not verify by connecting to it.

**1. Two claims here rest on migration SQL, not on live `pg_catalog`.** Per DEC-14, migration files are not proof of production state. Before acting on this document, read back from `pg_policies` / `pg_constraint`: (i) that `"Tenant"` still has only `bypass_rls_policy` + `tenant_self_read` and therefore **no INSERT/UPDATE/DELETE policy of any kind** — five CROSS_TENANT sites and one DECORATIVE site (`hydrate-tenant.ts:36`) hinge on this; (ii) that `stops`, `carrier_documents` and `route_template_stops` still run FORCE RLS with zero policies. If (i) is true, `NO_POLICY` is a harder blocker than the bypass drop, and tenant provisioning, email confirmation and onboarding hydration break the moment `app_user` is used **whether or not `bypass_rls_policy` is dropped**.

**2. Helpers reached from both tenant-scoped and cron callers — 9 sites, 4 files. These are the dangerous ones, because a single import site decides the behaviour for every caller.**

| Helper | Sites | Tenant-scoped callers | Context-free callers |
|---|---|---|---|
| `src/lib/notifications/send-push.ts` (`sendPushToUser`, cleanup) | 27, 68, 158 | `(owner)/actions/fleet-messages.ts`, `(owner)/actions/loads.ts`, `/api/v1/messages/*`, `/api/driver/stops/*`, `lib/carrier/{trips,notifications,inspection-service}.ts`, `server/api/routers/workflows/stepInstance.ts` | `lib/notifications/dispatcher.ts` (reached from all three digest crons), `server/services/workflows/notifications.ts` (reached from `cron/workflow-notifications`) |
| `src/server/services/workflows/notifications.ts` | 62, 149, 251, 316, 557 | tRPC `workflows.*` procedures | `cron/workflow-notifications` sweeps 1 and 2 |
| `src/lib/notifications/audit-log.ts` | 48 | any dispatcher call that passes `options.prismaClient` | every call that does not — `dispatcher.ts:76` defaults to the bare singleton |
| `src/lib/driver-pay/require-driver.ts` | 106 | cookie branch uses `getTenantPrisma()` (not a bypass site) | Bearer branch takes the `withBypassRls` path |

None of these can be fixed by editing a route. Each needs either an explicit tenant argument threaded through every caller, or a deliberate split into two entry points. `require-driver.ts` is the clearest case: the same function already branches on `isMobile`, and only one branch is broken — so a fix that converts the mobile branch to `getTenantPrismaForOrg(session.tenantId, session.userId)` lands both branches on the same guarantee.

**3. Silent failure is the dominant failure mode, and it is worse than an outage for a migration you are trying to verify.** At least 14 sites sit inside `.catch(() => null)`, `.catch(() => false)` or a bare `catch {}` that returns a default — `gps-ping:69`, `(owner)/carrier/dashboard:24,30`, `driver-dashboard:86`, `tasks/[id]/page:95`, `login:154`, `drivers/invite:126`, `sender-config:135`, both `audit-log.ts` writers, `activation-tracker:177`, and every `send-push` site (which logs at `info`). They will not raise errors at cutover; they will start returning empty, defaulting, or sending nothing. **A green smoke test proves very little about this set.** The cron routes are worse still: `send-reminders`, all three digests and `auto-close-tickets` return `{ success: true }` with a zero count, which is indistinguishable in the logs from a quiet day.

**4. The GUC is session-scoped on a `max: 1` pool, so "broken" is intermittent, not deterministic.** `getTenantPrisma()` uses `set_config(..., false)` — session scope — on a pool pinned to `globalThis`. A warm Vercel worker that has just served a cookie request leaves **that tenant's** id on the connection. A subsequent mobile or cron request on the same worker therefore runs with a foreign tenant in the GUC rather than an empty one. Reads still fail closed (the app-layer `where tenantId` and the RLS predicate intersect to nothing), so this is not a leak — but it means the same request can pass on one invocation and return zero rows on the next. **Do not read a passing test on a warm worker as evidence that a GUC-flagged path works.** It also means the remedy for the mobile surface should prefer transaction scope (`TRUE`) over session scope, which removes the stale-GUC hazard as a side effect.

**5. Two sites are latent cross-tenant reads *today*, and RLS would close them.** `(driver)/tasks/[id]/page.tsx:95` renders a creator's name and email from a `stepInstance.findFirst({ where: { id } })` with no tenant predicate in any layer; `mobile/driver/messages/route.ts:109` omits `tenantId` from a load lookup that every sibling query in the same file includes. Both are classified CROSS_TENANT under rule (d) because the code does not confine them — but the correct remedy is to add the predicate, not to hand them a bypass. Related, and not a bypass site: `support-tickets.ts:371/410` use `tenantId: session.tenantId ?? undefined`, where `undefined` **removes** the predicate from the query rather than matching nothing. That is an isolation guarantee that is conditional on a session field being populated.

**6. Raw SQL is invisible to the application-layer defence.** `mobile/owner/fleet-positions:40` and `mobile/owner/map/vehicles:44` use `$queryRaw`; `support-tickets.ts:475` runs a raw `SELECT email FROM "User"`; `support-tickets.ts:560`+ and `cron/auto-close-tickets` use raw queries next to their bypass sites. `withTenantRLS` never intercepts raw SQL, so for these the DB-level bypass is currently the *only* reason the rows are visible on a non-superuser role, and the hand-written `WHERE` is the only isolation. Their `INNER JOIN "Truck"` / `LEFT JOIN "User"` carry no tenant predicate at all.

**7. Two counts in this document are deliberately conservative.** `support-tickets.ts:169` is counted CROSS_TENANT because `tenantId` can legitimately be `NULL`, even though the overwhelming majority of calls carry a real tenant; and the six rule-(d) update-by-id sites inside cron sweeps are counted CROSS_TENANT rather than "transitively confined", because the row they address came from a scan that was itself cross-tenant. If a reviewer disagrees with either, the effect is at most 7 sites moving from CROSS_TENANT to DECORATIVE — which would *reduce* the work, not increase the risk. The reverse direction is what this document is calibrated to avoid.

---

## Branch decision (appended by quick-595, 2026-09-12)

This document was the input to quick-595's Task 1 Step 1 branch decision. The tripwire was
"more than 20 CROSS_TENANT". **§2 reports 50 CROSS_TENANT across 26 files, so the tripwire
FIRED and quick-595 executed BRANCH A.**

Branch A means, and quick-595 confirms by verification against staging `pg_policies`:

- `bypass_rls_policy` was **NOT** dropped. All **86** live instances remain.
- **No application code was moved to a privileged connection** — not one file, not one site.
- **None of the 211 executable `app.bypass_rls` calls were deleted or edited.**
- The prepared, **unapplied** drop of all 86 is staged at
  `apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/deferred-bypass-drop.sql`,
  which neither `scripts/migrate.mjs` nor the drift detector can read (both resolve only
  `migration.sql`).

The §1 counts were re-confirmed unchanged: **211 executable sites / 103 files**.

§1's split of DECORATIVE by whether the GUC is actually set — **15 survive the cutover, 145 do
not** — is carried into `docs/audits/rls-policy-grant-closure.md` §7(g) as the largest single
item standing between here and Prompt 2. The remedy for those 145 is `getTenantPrismaForOrg`,
**not** a privileged connection: handing them one would convert 145 correctly-scoped queries
into 145 unscoped ones.

Nothing else in this document was changed. No classification was revised.
