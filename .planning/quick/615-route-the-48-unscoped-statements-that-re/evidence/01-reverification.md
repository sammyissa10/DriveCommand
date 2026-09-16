# quick-615 evidence 01 — the 48 re-verified against current code, then classified

**Source analysis only. No source file is modified by this task. No database is
touched by this file.**

Input list: `.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/05-source-search.md` §2
(items B-1 … B-12) plus §2.3's single `42501`-class statement.

---

## 0. The arithmetic, stated before anything else

The brief says "48". 614 §7 counts **48 UNFLAGGED statements on a raising table**
(§2.1 = 36, §2.2 = 12) and counts `support-tickets.ts:292` **separately** as
"blocker statements of a DIFFERENT class (`42501`, not `TC001`) — 1".

> **48 = the TC001 statements. `support-tickets.ts:292` is the 49th, and it is a
> GRANT problem, not a context problem. The task addresses 49 statements in total.**

And one of the 48 is not a statement at all — see §2 below. So the running
arithmetic this document establishes is:

| | 614 said | measured here |
|---|---|---|
| runtime TC001 statements | 48 | **47** |
| …of which §2.1 (sysadmin) | 36 | **35** |
| …of which §2.2 (cron) | 12 | 12 |
| GRANT-class statements (§2.3) | 1 | 1 |
| **total addressed** | 49 | **48** |
| CUTOVER BLOCKER **files** | 12 | **11** |

---

## 1. Step A precondition — has anything moved since the audit?

```
$ git log --oneline 51f683eb..HEAD -- \
    "apps/web/src/app/(admin)/actions/notifications.ts" \
    "apps/web/src/app/(admin)/actions/sysadmin-invoices.ts" \
    "apps/web/src/app/(admin)/actions/tenants.ts" \
    "apps/web/src/app/(admin)/actions/users.ts" \
    "apps/web/src/app/(admin)/admin-support/page.tsx" \
    "apps/web/src/app/(admin)/tenants/[id]" \
    "apps/web/src/actions/support-tickets.ts" \
    "apps/web/src/app/api/cron/auto-close-tickets/route.ts" \
    "apps/web/src/app/api/cron/automations/route.ts" \
    "apps/web/src/lib/automations/evaluator.ts"
(no output)
```

**EMPTY.** `51f683eb` is `docs(614): enumerate the policies whose OR branch cannot
save them from the tripwire`; HEAD at the time of this measurement is `99330747`.

That is a starting point and not a verdict. Every line below was individually
re-read from current source. **Every one of the 48 still names the statement the
audit says it does — that is a measurement, and the measurement is "nothing
moved", not "nothing was checked".** No statement carries the verdict `MOVED` or
`ALREADY ROUTED`.

---

## 2. The correction 614 needs: B-2 is NOT A RUNTIME STATEMENT

`apps/web/src/app/(admin)/actions/sysadmin-invoices.ts`, every line matching
`prisma\.`:

```
26: * quick-600 (B5) — ROUTE. `lib/db/admin-prisma.ts`, reason:
83:}): Promise<{ success: true; invoice: Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>> } | { success: false; error: string }> {
```

- **Line 26 is a comment** — inside the `generateInvoiceNumber` doc block.
- **Line 83 is a return-type annotation.**
  `Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>>` is a *type query*.
  `typeof X` in type position never evaluates `X`; the whole annotation is erased
  by the compiler and emits no JavaScript, let alone SQL. It cannot raise
  `TC001`, `42501` or anything else.

`grep -c 'getAdminDb(' → 10`. **This file has ZERO runtime bare statements.**

**Verdict: `NOT A RUNTIME STATEMENT`. Remedy: NOTHING.** The annotation stays, the
`prisma` import stays (the type still needs it), and `sysadmin-invoices.ts` drops
off the blocker-file list.

**Correction to 614 §2.1:** item B-2 is not a cutover blocker. 48 → **47** runtime
TC001 statements; §2.1's 36 → **35**; the blocker file count 12 → **11**.

This is exactly the class of error a file-level marker produces and 614 itself
warned about ("a file-level marker is not a verdict" — quick-602). 614 read the
file, found one `prisma.` hit that was not on `getAdminDb`, and did not read what
kind of line it was.

---

## 3. The classification rule, stated once and applied consistently

Task 1 Step B's two decision rules, plus the boundary the brief does not spell out
and this file therefore must.

1. **Can a tenant client serve it?** → TENANT. `getTenantPrismaForOrg(tenantId)`,
   **no `userId`**.
2. **Would serving it require threading a tenant through a function signature?**
   → STOP-AND-REPORT. Route nothing.
3. Otherwise → ADMIN (or GRANT, where the failure is a privilege and not a
   context).

### The boundary, because several statements sit near it

Eleven of the 47 hold a `tenantId` **as a function argument or prop** and are
nevertheless classified ADMIN. The distinction is not "does a tenant id exist in
scope" — that would make the rule trivially satisfiable — it is **whose request
this is**:

> A statement is **TENANT** when the path is doing *per-tenant work inside that
> tenant's turn*: a cron loop iterating tenants, an evaluator handling one
> tenant's event. In every such case the code **already** uses
> `getTenantPrismaForOrg` for an adjacent statement in the same loop body, so a
> tenant client is *demonstrably* the right receiver — it is right there.
>
> A statement is **ADMIN** when the path is a **sysadmin surface administering an
> arbitrary tenant**. The operator is not in the tenant; the request carries no
> tenant; the `tenantId` is an *argument selecting which tenant to administer*;
> and the adjacent statements in the same unit of work are already on
> `getAdminDb` because no tenant client could ever serve them (`tenant.create`,
> `tenant.update` — `tenant_self_read`/`tenant_self_update` are
> `id = current_tenant_id()` with no second branch).

Two concrete costs of getting this wrong in the ADMIN direction, both measured
facts rather than preferences:

- `getTenantPrismaForOrg` writes a **session-scope** GUC
  (`set_config('app.current_tenant_id', …, false)`) on the tenant pool, and that
  pool is `max: 1`. Calling it from a sysadmin server action leaves the shared
  pooled connection carrying an **arbitrary customer's tenant id**, which
  quick-602 measured as inherited by any later bare statement in the process.
  Sysadmin request paths are precisely where bare statements still live after
  this task — `notifications.ts`'s eight RLS-OFF statements, `plans.ts`'s four,
  `promos.ts`'s two. In a cron loop the code already writes that GUC, so the
  TENANT-class routing introduces nothing new.
- Splitting one `Promise.all` or one read-then-write across two connections is
  quick-561's *fixing one bell and leaving the other*.

**The three statements F6 names are the whole TENANT class, and each was
re-checked against the test rather than inherited:** `cron/automations:187`,
`cron/automations:198`, `evaluator.ts:80`. In all three the **next statement in
the same loop body** is already `await getTenantPrismaForOrg(tenantId)`.

---

## 4. Per-statement verdicts

`receiver_today` is `bare prisma` for every row below unless stated. Tables are
mapped through `schema.prisma`; **none of these models carries an `@@map`**, so
the table name is the PascalCase model name (verified per model).

### B-1 — `app/(admin)/actions/notifications.ts` — 9 statements

| id | line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-1/:250 | 250 | `prisma.notificationSendLog.findMany({ where, orderBy, skip, take })` | `NotificationSendLog` | PRESENT | **ADMIN** | the send log is cross-tenant by definition; `where` is built from *optional* sysadmin filters and is `{}` by default |
| B-1/:256 | 256 | `prisma.notificationSendLog.count({ where })` | `NotificationSendLog` | PRESENT | **ADMIN** | same `Promise.all`, same unit of work as :250 |
| B-1/:346 | 346 | `.count({ status:'SENT', createdAt >= todayStart })` | `NotificationSendLog` | PRESENT | **ADMIN** | platform-wide delivery statistics; no tenant anywhere in the function |
| B-1/:349 | 349 | `.count({ status:'FAILED', >= todayStart })` | `NotificationSendLog` | PRESENT | **ADMIN** | as above |
| B-1/:352 | 352 | `.count({ status:'SENT', >= 30d })` | `NotificationSendLog` | PRESENT | **ADMIN** | as above |
| B-1/:355 | 355 | `.count({ status:'FAILED', >= 30d })` | `NotificationSendLog` | PRESENT | **ADMIN** | as above |
| B-1/:360 | 360 | `.count({ status:'FAILED' })` | `NotificationSendLog` | PRESENT | **ADMIN** | as above |
| B-1/:362 | 362 | `.groupBy(['triggerKey'], FAILED, >= 24h)` | `NotificationSendLog` | PRESENT | **ADMIN** | as above |
| B-1/:369 | 369 | `.groupBy(['triggerKey'], FAILED)` | `NotificationSendLog` | PRESENT | **ADMIN** | as above |

Two units of work, confirmed by reading: `listNotificationSendLog` (:250/:256, one
`Promise.all`) and the delivery-statistics block (:346–:369, one `Promise.all` of
seven).

**Not routed and named as not routed:** the other eight `prisma.` statements in
this file (:33, :49, :72, :100 on `NotificationTemplate`; :130, :169, :176, :185
on `NotificationEmailConfig`). Both tables are **RLS OFF** — the Section 4.12
allowlist — so nothing raises and `app_user`'s Phase 1 DML grants serve them after
the cutover. 614 §3 classifies them LATENT. The file stays MIXED.

### B-2 — `app/(admin)/actions/sysadmin-invoices.ts` — 1 "statement"

| id | line | statement | table(s) | verdict | class |
|---|---|---|---|---|---|
| B-2/:83 | 83 | `Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>>` in a return-type annotation | — (none) | **NOT A RUNTIME STATEMENT** | — |

Remedy: **nothing**. §2 above.

### B-3 — `app/(admin)/actions/tenants.ts` — 14 statements

| id | line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-3/:32 | 32 | `tenant.findMany` + `_count{users,trucks,routes}` + nested `users` | `Tenant`,`User`,`Truck`,`Route` | PRESENT | **ADMIN** | `getAllTenants` — lists *every* tenant; `tenant_self_read` is `id = current_tenant_id()` with no second branch |
| B-3/:123 | 123 | `driverInvitation.create` | `DriverInvitation` | PRESENT | **ADMIN** — *receiver swap*, `adminDb` from :100 is in scope | the owner invitation for a tenant that was created two statements earlier on the admin connection; quick-600 pre-reported this exact statement |
| B-3/:198 | 198 | `user.findMany({ where:{tenantId}, select:{id} })` | `User` | PRESENT | **ADMIN** — *receiver swap*, `adminDbSuspend` from :191 is in scope | `suspendTenant`; §3's boundary — sysadmin administering an arbitrary tenant, same unit of work as the `tenant.update` seven lines above |
| B-3/:239 | 239 | `user.findMany({ where:{tenantId}, select:{id} })` | `User` | PRESENT | **ADMIN** — *receiver swap*, `adminDbReactivate` from :232 is in scope | `reactivateTenant`; identical shape to :198 |
| B-3/:271 | 271 | `tenant.count()` | `Tenant` | PRESENT | **ADMIN** | `getSystemMetrics` — platform totals, no tenant exists at all |
| B-3/:272 | 272 | `load.count({ status in …, createdAt >= day })` | `Load` | PRESENT | **ADMIN** | same `Promise.all` |
| B-3/:278 | 278 | `tenant.count({ createdAt >= 7d })` | `Tenant` | PRESENT | **ADMIN** | same `Promise.all` |
| B-3/:283 | 283 | `supportTicket.count({ status:'OPEN' })` | `SupportTicket` | PRESENT | **ADMIN** | same `Promise.all` |
| B-3/:297 | 297 | `tenant.findUnique` + `_count` + nested `users` + nested `driverInvitations` | `Tenant`,`User`,`DriverInvitation`,`Truck`,`Route` | PRESENT | **ADMIN** | `getTenantById` — §3's boundary; the SysAdmin tenant-detail page |
| B-3/:355 | 355 | `tenant.findUnique({ select:{name} })` | `Tenant` | PRESENT | **ADMIN** | `resendOwnerInvitation` — §3's boundary |
| B-3/:364 | 364 | `driverInvitation.findFirst({ tenantId, role:'OWNER', … })` | `DriverInvitation` | PRESENT | **ADMIN** | same function, same unit of work |
| B-3/:376 | 376 | `driverInvitation.update({ id }, { status:'PENDING', expiresAt })` | `DriverInvitation` | PRESENT | **ADMIN** | same function; note this is an **UPDATE** |
| B-3/:472 | 472 | `user.findUnique({ id:userId }, select{email,firstName,lastName,tenantId})` | `User` | PRESENT | **ADMIN** | `updateOwnerEmail(userId, …)` — **no tenant is in hand at all**; the tenant is *derived from this very read*. A tenant client is impossible here by construction, not by policy |
| B-3/:480 | 480 | `user.update({ id:userId }, { email })` | `User` | PRESENT | **ADMIN** | same function; **UPDATE** |

### B-4 — `app/(admin)/actions/users.ts` — 5 statements

| id | line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-4/:41 | 41 | `user.findMany({ isSample:false, isSystemAdmin:false })` + `tenant{name}` | `User`,`Tenant` | PRESENT | **ADMIN** | `getAllUsers` — every user in every tenant |
| B-4/:102 | 102 | `user.findUnique({ id:userId })` read-before-write | `User` | PRESENT | **ADMIN** | `updateUserProfile(input)` — input is `{userId,…}`; **no tenant in hand, ever** |
| B-4/:115 | 115 | `user.update({ id:userId }, {firstName,lastName,role,isActive})` | `User` | PRESENT | **ADMIN** | same function; **UPDATE** |
| B-4/:130 | 130 | `user.update` — the compensating rollback | `User` | PRESENT | **ADMIN** | same function; **UPDATE**. Must share the receiver with :115 or a rollback could land on a different connection from the write it reverses |
| B-4/:144 | 144 | `user.findUnique` re-read + `tenant{name}` | `User`,`Tenant` | PRESENT | **ADMIN** | same function |

### B-5 … B-8 — the four one-statement sysadmin surfaces

| id | file : line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-5/:24 | `app/(admin)/admin-support/page.tsx` :24 | `tenant.findMany({ select:{id,name}, orderBy:{name} })` | `Tenant` | PRESENT | **ADMIN** | the sysadmin ticket filter's tenant dropdown — every tenant |
| B-6/:20 | `app/(admin)/tenants/[id]/activation-progress-section.tsx` :20 | `activationProgress.findUnique({ where:{tenantId} })` | `ActivationProgress` | PRESENT | **ADMIN** | §3's boundary — a sysadmin page rendering an arbitrary tenant's activation panel |
| B-7/:10 | `app/(admin)/tenants/[id]/automation-runs-section.tsx` :10 | `automationRun.findMany({ where:{tenantId}, take:10, rule:{key,id} })` | `AutomationRun`,`AutomationRule` | PRESENT | **ADMIN** | §3's boundary. 614 §2.1's asymmetry note stands: quick-613 routed the `/automations` screen's run list and this byte-similar one was never in that task's census |
| B-8/:56 | `app/(admin)/tenants/[id]/page.tsx` :56 | `subscription.findUnique({ where:{tenantId:id}, select:{trialEndsAt} })` | `Subscription` | PRESENT | **ADMIN** | §3's boundary — the sysadmin billing summary |

### B-9 + §2.3 — `actions/support-tickets.ts` — 3 TC001 + 1 GRANT

| id | line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-9/:271 | 271 | `$queryRawUnsafe('SELECT * FROM "SupportTicket" …')` | `SupportTicket` | PRESENT | **ADMIN** | `getAllTickets` — the sysadmin ticket list across every tenant; the `tenantId` filter is *optional* |
| B-9/:286 | 286 | ``$queryRaw`SELECT id,email,"firstName","lastName" FROM "User" WHERE id = ANY(…)` `` | `User` | PRESENT | **ADMIN** | same `Promise.all`; the submitter ids span tenants |
| B-9/:290 | 290 | ``$queryRaw`SELECT id,name FROM "Tenant" WHERE id = ANY(…)` `` | `Tenant` | PRESENT | **ADMIN** | same `Promise.all`; the ids are *many* tenants |
| §2.3/:292 | 292 | ``$queryRaw`SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ANY(…)` `` | `auth.users` | PRESENT | **GRANT** | fails `42501`, not `TC001`: `auth.users` has RLS enabled with **0 policies**, and the tenant role holds neither `USAGE` on schema `auth` nor any grant on the table. The tripwire can never signal it |

**A false comment found while reading, reported here and corrected in Task 3.**
Lines 240–242 read:

```
// Use $queryRaw — raw SQL bypasses RLS entirely, no set_config needed.
// SupportTicket has no RLS so this is safe for cross-tenant admin access.
```

**Both sentences are false.** Raw SQL does not bypass RLS — the policy is applied
by the planner regardless of how the statement reached it — and `SupportTicket`
carries `tenant_isolation_policy` (614 §6, measured). Same family as quick-610's
`NotificationSendLog` comment: *read `pg_class`/`pg_policy`, never a comment about
them.*

**Not routed and named as not routed:** the seven bypass-flagged statements in
this file (the `$transaction` blocks opening at :98, :169, :217, :370, :409, each
preceded by `set_config('app.bypass_rls','on',TRUE)`), the five already on
`getAdminDb` (:342/:343, :476/:477+the four `tx.*` inside it, :544/:545), and
`:563` (§6 below).

### B-10 — `app/api/cron/auto-close-tickets/route.ts` — 1 statement

| id | line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-10/:25 | 25 | ``$queryRaw`SELECT st.id, st."ticketNumber" FROM "SupportTicket" st WHERE … NOT EXISTS (SELECT 1 FROM "TicketMessage" tm …)` `` | `SupportTicket`,`TicketMessage` | PRESENT | **ADMIN** | an all-tenant stale-ticket scan with no tenant predicate. quick-602 **measured this route raising `TC001` at runtime** |

`:57`'s `getAdminDb('auto-close stale ticket sweep')` is **32 lines below** :25 and
therefore **not in scope** at :25. A second acquisition is needed; it is the same
unit of work, so it **reuses the existing reason** and mints no new member.

### B-11 — `app/api/cron/automations/route.ts` — 7 statements

| id | line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-11/:53 | 53 | `activationProgress.findMany({ completionPct:20, … })` | `ActivationProgress` | PRESENT | **ADMIN** | `no_progress_nudge` candidate sweep — finds *which* tenants; no tenant exists yet |
| B-11/:71 | 71 | `activationProgress.findMany({ firstRealTruckAt≠null, firstRealDriverAt=null })` | `ActivationProgress` | PRESENT | **ADMIN** | `add_driver_nudge` candidate sweep |
| B-11/:89 | 89 | `activationProgress.findMany({ firstRealDriverAt≠null, firstLoadInTransitAt=null })` | `ActivationProgress` | PRESENT | **ADMIN** | `dispatch_load_nudge` candidate sweep |
| B-11/:111 | 111 | `subscription.findMany({ trialEndsAt between, status:'TRIALING' })` | `Subscription` | PRESENT | **ADMIN** | `trial_ending_soon` candidate sweep |
| B-11/:170 | 170 | `automationRule.findUnique({ where:{key:ruleKey} })` | `AutomationRule` | PRESENT | **ADMIN** | the rule is platform-scope and is read **before any tenant is known** — it is what decides whether the sweep runs at all |
| B-11/:187 | 187 | `automationRun.findFirst({ ruleId, tenantId }, select{id})` | `AutomationRun` | PRESENT | **TENANT** | **inside `for (const {tenantId} of candidates)`.** `tenantId` is the loop variable and the next statement in the same body is already `await getTenantPrismaForOrg(tenantId)` (:212) |
| B-11/:198 | 198 | `automationRun.findFirst({ ruleId, tenantId, OR:[firedAt…, PENDING…] })` | `AutomationRun` | PRESENT | **TENANT** | the `else` branch of the same dedup, same loop, same variable |

### B-12 — `lib/automations/evaluator.ts` — 4 statements

| id | line | statement | table(s) | verdict | class | reason |
|---|---|---|---|---|---|---|
| B-12/:64 | 64 | `appEvent.findMany({ createdAt > 30d })` | `AppEvent` | PRESENT | **ADMIN** | scans **every** tenant's events; this read is what discovers the tenants |
| B-12/:73 | 73 | `automationRule.findMany({ triggerEvent, isActive })` | `AutomationRule` | PRESENT | **ADMIN** | rules are platform-scope; no tenant predicate. quick-613's site 8, unrouted |
| B-12/:80 | 80 | `automationRun.findFirst({ ruleId: rule.id, tenantId: event.tenantId })` | `AutomationRun` | PRESENT | **TENANT** | `event.tenantId` in hand, and :208 in the same file already uses `getTenantPrismaForOrg(run.tenantId)` |
| B-12/:131 | 131 | `automationRun.findMany({ PENDING, scheduledAt<=now }, include:{rule}, take:100)` | `AutomationRun`,`AutomationRule` | PRESENT | **ADMIN** | the due-run queue across every tenant |

**Not routed and named as not routed:** `:95-96` — the `$transaction` at :95 opens
with `set_config('app.bypass_rls','on',TRUE)` at :96. Exempted by
`tenant_context_required()`'s bypass arm; owned by the Phase 0 bypass programme.

---

## 5. Counts

### Per class

| class | statements | receiver |
|---|---|---|
| **ADMIN** | **44** | `getAdminDb(reason)` |
| **TENANT** | **3** | `getTenantPrismaForOrg(tenantId)`, no `userId` |
| **GRANT** | **1** | receiver unchanged in kind; the fix is a privilege |
| **NOT A RUNTIME STATEMENT** | **1** | nothing |
| STOP-AND-REPORT | **0** | — |
| input total | **49** | (48 TC001 + 1 GRANT) |

47 runtime TC001 statements = 44 ADMIN + 3 TENANT.

### Per file, with the planned delta

`swap` = the statement moves onto an admin client **already in scope** — no new
`getAdminDb(` call, no new reason, no allowlist `calls` change (F7).

| file | stmts | ADMIN | TENANT | GRANT | new `getAdminDb(` | swaps | new reasons | new to allowlist | tables × op |
|---|---|---|---|---|---|---|---|---|---|
| `(admin)/actions/notifications.ts` | 9 | 9 | 0 | 0 | **2** | 0 | 2 | **YES** | `NotificationSendLog` SELECT |
| `(admin)/actions/sysadmin-invoices.ts` | 1 | 0 | 0 | 0 | 0 | 0 | 0 | already on | — |
| `(admin)/actions/tenants.ts` | 14 | 14 | 0 | 0 | **5** | **3** | 4 (+1 reused) | already on (7→12) | `Tenant` S · `User` S,U · `DriverInvitation` S,I,U · `Truck` S · `Route` S · `Load` S · `SupportTicket` S |
| `(admin)/actions/users.ts` | 5 | 5 | 0 | 0 | **2** | 0 | 2 | **YES** | `User` S,U · `Tenant` S |
| `(admin)/admin-support/page.tsx` | 1 | 1 | 0 | 0 | **1** | 0 | 0 (reused) | **YES** | `Tenant` S |
| `(admin)/tenants/[id]/activation-progress-section.tsx` | 1 | 1 | 0 | 0 | **1** | 0 | 1 | **YES** | `ActivationProgress` S |
| `(admin)/tenants/[id]/automation-runs-section.tsx` | 1 | 1 | 0 | 0 | **1** | 0 | 1 | **YES** | `AutomationRun` S · `AutomationRule` S |
| `(admin)/tenants/[id]/page.tsx` | 1 | 1 | 0 | 0 | **1** | 0 | 1 | **YES** | `Subscription` S |
| `actions/support-tickets.ts` | 4 | 3 | 0 | 1 | **1** | 0 | 1 | already on (3→4) | `SupportTicket` S · `User` S · `Tenant` S · `auth.users` S(3 cols) |
| `api/cron/auto-close-tickets/route.ts` | 1 | 1 | 0 | 0 | **1** | 0 | 0 (reused) | already on (1→2) | `SupportTicket` S · `TicketMessage` S |
| `api/cron/automations/route.ts` | 7 | 5 | 2 | 0 | **2** | 0 | 1 | **YES** | `ActivationProgress` S · `Subscription` S · `AutomationRule` S · (`AutomationRun` S on the tenant lane) |
| `lib/automations/evaluator.ts` | 4 | 3 | 1 | 0 | **1** | 0 | 1 | **YES** | `AppEvent` S · `AutomationRule` S · `AutomationRun` S (+ tenant lane) |
| **total** | **49** | **44** | **3** | **1** | **18** | **3** | **14 new, 2 reused** | **8 new files** | |

Projected allowlist after Tasks 2–4: **31 entries** (23 + 8),
**`TOTAL_EXPECTED_CALLS` 66** (48 + 18). *Both numbers are re-derived from a grep
in Task 6 and the file carries the measured values, not these projections.*

### The 15 distinct tables the routed statements touch

`Tenant`, `User`, `DriverInvitation`, `Truck`, `Route`, `Load`, `SupportTicket`,
`TicketMessage`, `NotificationSendLog`, `ActivationProgress`, `Subscription`,
`AppEvent`, `AutomationRun`, `AutomationRule` — and `auth.users`.

`Truck` and `Route` are on this list **only** because `tenant.findMany`/
`findUnique` at :32 and :297 carry `_count: { select: { users, trucks, routes } }`.
Prisma emits real correlated sub-selects for those, so `app_admin` needs `SELECT`
on both. **A `_count` is a statement against another table** — it does not appear
in any `prisma.<model>.` grep and 614's table column does not name them.

---

## 6. Out of scope — enumerated with a verdict, touched by nothing

| item | verdict | why not here |
|---|---|---|
| `actions/support-tickets.ts:563` (`getUnreadAdminReplyCount`) | **REPORTED, NOT ROUTED** | It *has* `session.tenantId` and hardcodes it into the SQL, but issues it on the bare client with no `set_config`. 614 §2.4: a latent **wrong-answer** site, not a cutover blocker — its answer depends on whatever the pooled connection last held (quick-602). Not one of the 48. |
| B7 — both `generateTicketNumber` copies (`actions/support-tickets.ts:98`, `api/mobile/support/ticket/route.ts:39`) | out of scope | bypass-flagged; invisible to the tripwire; breaks at the **bypass drop**, not the cutover |
| B8 — `lib/auth/supabase.ts:164` | out of scope | bypass-flagged, same |
| the 8 RLS-OFF statements in `notifications.ts` | **NOT ROUTED, deliberately** | `NotificationTemplate`/`NotificationEmailConfig` are RLS OFF; `app_user` has Phase 1 DML. Routing them would move working reads onto a bypassing connection for nothing |
| `plans.ts` ×4, `promos.ts` ×2 | out of scope | same, LATENT (614 §3) |
| `evaluator.ts:95-96` | out of scope | bypass-flagged |
| the 7 bypass-flagged blocks in `actions/support-tickets.ts` | out of scope | bypass-flagged |

**Zero STOP-AND-REPORT statements.** No statement in the input list would need a
function signature changed to reach a tenant client — the two candidates that
came closest (`tenants.ts:472`, `users.ts:102`) have **no tenant at all** and are
ADMIN for a stronger reason than the boundary in §3.

---

## 7. Step 3 — why `tenants.ts` was only partly routed, from primary sources

F4's five claims, each verified.

### 7.1 The routing commit

```
$ git log --oneline -- "apps/web/src/app/(admin)/actions/tenants.ts"
…
0c08a959 feat(600-02): route the 9 sysadmin tenant-management sites to getAdminDb
```

**quick-600**, not a later partial pass. Nothing has touched the file's routing
since.

### 7.2 All seven acquisitions are MUTATIONS

The seven `getAdminDb(` call sites in the current file, and what each one's
statement does:

| line | reason | statement it serves |
|---|---|---|
| 100 | `sysadmin tenant create` | `tenant.create` |
| 191 | `sysadmin tenant status change` | `tenant.update { isActive:false }` |
| 232 | `sysadmin tenant status change` | `tenant.update { isActive:true }` |
| 437 | `sysadmin tenant profile update` | `tenant.update` (name/slug) |
| 549 | `sysadmin tenant settings update` | `tenant.update` (settings) |
| 586 | `sysadmin trial extension` | `subscription`/`tenant` trial write |
| 639 | `sysadmin tenant delete` | `tenant.delete` |

**Seven writes, zero reads.** The 14 unrouted statements are **12 reads**, plus
one `driverInvitation.create` (:123) and one `user.update` (:480) that ride inside
functions whose other statements are reads.

### 7.3 The candidate set was a design-doc census, not a file sweep

`.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md`,
verbatim:

> *"Every candidate `bypass-replacement-design.md` names, plus the two the design
> doc's own snapshot missed"*

and, in §2, covering the `"Tenant"` write sites:

> *"B5 does not claim to have found every site, only to have routed the ones this
> task's candidate set names."*

### 7.4 It pre-reported one of the 14 by name

Also verbatim from the same manifest:

> *"`createTenant` (`:98`) also creates a `DriverInvitation` two statements later
> (today's `:123`) … Left untouched — reported, not silently expanded into. It
> will break at the `app_user` cutover exactly like its neighbours."*

That is **B-3/:123**, named in advance, with the failure mode predicted correctly.

### 7.5 The sharpest evidence — an admin local in scope, seven lines above a bare read

```ts
191:  const adminDbSuspend = await getAdminDb('sysadmin tenant status change');
192:  await adminDbSuspend.tenant.update({ where: { id: tenantId }, data: { isActive: false } });
…
198:  const tenantUsers = await prisma.user.findMany({ where: { tenantId }, select: { id: true } });
```

and the identical shape in `reactivateTenant` at `:232` / `:239`. **A file sweep
could not produce that.** A census that routes one named statement per candidate
and then stops, can and did.

### 7.6 Conclusion, and the thing it does *not* imply

> **`tenants.ts` is partly routed because quick-600's candidate set was derived
> from a design document's list of named sites, not from a sweep of the file — a
> documented scope boundary, stated twice in its own manifest, with one of the
> survivors pre-reported by name. Not carelessness.**

**And that does not make the 14 ADMIN.** Each of the 14 carries its own verdict in
§4 above, reached by §3's rule; three of them (`:198`, `:239`, `:123`) are
receiver swaps onto a client already in scope, and eleven need a new acquisition.
The fact that quick-600's nine were mutations is an explanation of a historical
scope, not an argument about the fourteen.

---

## 8. What this file commits the later tasks to

- Task 2 routes 14 statements in `tenants.ts`: 5 new acquisitions, 3 swaps, 4 new
  reasons, 1 reused (`sysadmin tenant listing`, already a member and already used
  by `tenant.repository.ts:96` for the same job).
- Task 3 routes 30 ADMIN statements across 10 files: 13 new acquisitions, 10 new
  reasons, 2 reused, 8 new allowlist entries.
- Task 4 routes 3 TENANT statements.
- Task 5 grants. The table × operation set is §5's 15-table list; the **held** set
  is measured against the live catalog, never against `admin-connection.md` §2's
  prose.
