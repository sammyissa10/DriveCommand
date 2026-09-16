# quick-614 evidence 05 — every raising table traced to the no-tenant paths that read it

Source analysis only. No database access in this file except the four catalog
reads quoted in §6, which were read-only on staging.

---

## 0. What "raising" means after Task 1, and why the population is bigger than the brief assumed

Task 1 measured that the `TC001` raise happens at **PLAN time**, before a single
row is touched (`evidence/04-explain.md` Part 3). So the question "which tables
raise" has a blunt answer:

> **Every table carrying a `current_tenant_id()` policy raises — all 90 of them —
> whenever a statement against it is planned on a connection with no tenant
> context and no `app.bypass_rls`.** Shape is irrelevant. Row count is irrelevant.

That makes the interesting axis not *which table* but *which statement*, and the
four states a statement can be in.

---

## 1. Method, stated per count (quick-607 discipline)

A name appearing in a file is not an import and not a usage. That rule cost this
repo a six-fold overstatement once (`_bootstrap-env` NAMED in 27 files, IMPORTED
by 4) and a 3-to-0 miscount (`withTenantContext`, all three matches in comments).

| what | how it was counted |
|---|---|
| "imports the bare client" | a real `import { … prisma … } from '<spec>'` STATEMENT, matched across newlines after stripping `//` and `/* */`, where `<spec>` ends in `db/prisma`. **Not** a substring search for `prisma`. |
| "imports `getAdminDb`" | the same, for the symbol `getAdminDb`. |
| "calls `getAdminDb`" | `getAdminDb(` after comment stripping. |
| "reads table T" | `<receiver>.<model>.` where `<receiver>` is `prisma`, `tx`, or a variable assigned from `await getAdminDb(`, and `<model>` maps to `T` via `schema.prisma` (`@@map`, else PascalCase). |
| "sets `app.bypass_rls`" | the literal `app.bypass_rls` inside the enclosing `$transaction` block, whose extent is found by brace balance from the opening line. |
| "sets the tenant GUC" | `app.current_tenant_id` **or** `setTransactionTenantId(` inside the same block. |

**One correction to my own first pass, reported rather than quietly fixed.** v1 of
the detector required the specifier `@/lib/db/prisma`. `lib/auth/supabase.ts`
imports `from '../db/prisma'`, so v1 reported the ENTIRE `lib/auth/**` category as
**0 files** — the single most important file in the brief. Matching any specifier
ending in `db/prisma` fixes it. Same family as the two miscounts above: the method
was wrong, not the tree.

### The four context states

| state | meaning | raises? |
|---|---|---|
| **ADMIN_CONN** | the receiver is a `getAdminDb` client, or the enclosing `$transaction` was opened on one | **No** — `app_admin` is `rolbypassrls`, no policy is consulted |
| **TENANT_GUC** | the enclosing block sets `app.current_tenant_id` first | **No** — there is a tenant context |
| **BYPASS** | the enclosing block sets `app.bypass_rls` | **No** — `tenant_context_required()` returns NULL on its own bypass arm. **NOT SIGNALLED** — owned by the Phase 0 bypass programme |
| **UNFLAGGED** | none of the above | **YES — `TC001`** |

**Three false-positive classes v1 of the classifier produced**, all corrected by
reading the source, all worth recording because each is a trap:

1. **A `tx` is not necessarily the tenant connection.** `actions/support-tickets.ts:477`
   opens `adminDb.$transaction(async (tx) => …)`; its `tx.supportTicket` (:478),
   `tx.$queryRaw` (:488), `tx.ticketMessage` (:494) and `tx.supportTicket` (:504)
   are all on `app_admin`. v1 called four blockers that are not.
2. **A block that sets the tenant GUC has a tenant context.** All five
   `lib/onboarding/*` files call `setTransactionTenantId(tx, tenantId)` (which is
   `tx.$executeRaw` + `set_config('app.current_tenant_id', …, TRUE)`) before their
   first statement, and `api/auth/login/route.ts` sets it inline at :74 and :113.
   v1 called 21 statements blockers; **none of them is one**. quick-601 closed the
   provisioning path and the whole directory followed.
3. **`set_config(...)` touches no relation, so it cannot raise.** `lib/context/tenant-context.ts`
   :179 and :210 are `prisma.$executeRawUnsafe("SELECT set_config('app.current_tenant_id', $1, false)", tenantId)`
   — the tenant-ACQUISITION helper itself. v1 flagged them because the SQL literal
   sits on the line after the call. Read, corrected, **not blockers**.

---

## 2. CUTOVER BLOCKERS — named, with file, line, statement and the surface that breaks

A **CUTOVER BLOCKER** is an UNFLAGGED statement, on the tenant connection, against
a table carrying a `current_tenant_id()` policy, on a path that has no tenant.

### 2.1 Sysadmin — `app/(admin)/**` and its server actions

| # | file : line | statement | table | surface that breaks |
|---|---|---|---|---|
| B-1 | `apps/web/src/app/(admin)/actions/notifications.ts` :250, :256, :346, :349, :352, :355, :360, :362, :369 | `prisma.notificationSendLog.*` ×9 | `NotificationSendLog` | SysAdmin → Notifications: the send log and every delivery statistic. Nine statements, zero routed. |
| B-2 | `apps/web/src/app/(admin)/actions/sysadmin-invoices.ts` :83 | `prisma.sysAdminInvoice.*` | `SysAdminInvoice` | SysAdmin → Invoicing. **The other 17 statements in this file are already on `getAdminDb`** — one straggler on a mixed file, which is exactly why a file-level marker is not a verdict (quick-602). |
| B-3 | `apps/web/src/app/(admin)/actions/tenants.ts` :32, :123, :198, :239, :271, :272, :278, :283, :297, :355, :364, :376, :472, :480 | `prisma.tenant` ×5, `prisma.user` ×4, `prisma.driverInvitation` ×3, `prisma.load`, `prisma.supportTicket` | `Tenant`, `User`, `DriverInvitation`, `Load`, `SupportTicket` | SysAdmin → Tenants: the list, the detail, the counts, the invitation admin. **14 unflagged statements beside 9 already on `getAdminDb`.** The most mixed file on the tree. |
| B-4 | `apps/web/src/app/(admin)/actions/users.ts` :41, :102, :115, :130, :144 | `prisma.user.*` ×5 | `User` | SysAdmin → Users. Nothing in this file is routed. |
| B-5 | `apps/web/src/app/(admin)/admin-support/page.tsx` :24 | `prisma.tenant.findMany` | `Tenant` | The SysAdmin support page's tenant filter. |
| B-6 | `apps/web/src/app/(admin)/tenants/[id]/activation-progress-section.tsx` :20 | `prisma.activationProgress.findUnique` | `ActivationProgress` | SysAdmin → Tenant detail → activation panel. |
| B-7 | `apps/web/src/app/(admin)/tenants/[id]/automation-runs-section.tsx` :10 | `prisma.automationRun.findMany` | `AutomationRun` | SysAdmin → Tenant detail → automation runs panel. **Note the asymmetry:** quick-613 routed the `/automations` screen's run list and this second, byte-similar run list on the tenant-detail page was never in that task's census. |
| B-8 | `apps/web/src/app/(admin)/tenants/[id]/page.tsx` :56 | `prisma.subscription.findUnique` | `Subscription` | SysAdmin → Tenant detail → billing summary. |
| B-9 | `apps/web/src/actions/support-tickets.ts` :271, :286, :290 | `prisma.$queryRawUnsafe` over `"SupportTicket"`; `prisma.$queryRaw` over `"User"`; `prisma.$queryRaw` over `"Tenant"` | `SupportTicket`, `User`, `Tenant` | SysAdmin → Support: the ticket LIST and the submitter/tenant name joins. Five of this file's statements are on `getAdminDb` and seven are bypass-flagged; these three are neither. |

### 2.2 Cron — `app/api/cron/**`

| # | file : line | statement | table | surface that breaks |
|---|---|---|---|---|
| B-10 | `apps/web/src/app/api/cron/auto-close-tickets/route.ts` :25 | `prisma.$queryRaw` — `SELECT … FROM "SupportTicket" st … NOT EXISTS (SELECT 1 FROM "TicketMessage" …)` | `SupportTicket`, `TicketMessage` | The stale-ticket sweep. **quick-602 measured this route raising `TC001` at runtime**, and the source says why: line 25 is on the bare client while line 57's `getAdminDb('auto-close stale ticket sweep')` covers only the write half. The recorded example of a two-mechanism file. |
| B-11 | `apps/web/src/app/api/cron/automations/route.ts` :53, :71, :89, :111, :170, **:187, :198** | `prisma.activationProgress.findMany` ×3, `prisma.subscription.findMany`, `prisma.automationRule.findUnique`, `prisma.automationRun.findFirst` ×2 | `ActivationProgress`, `Subscription`, `AutomationRule`, `AutomationRun` | Every cron-driven activation nudge and the trial-ending mail. §9 names the four `candidateQuery()` reads; quick-613 names :170 as its site 7. **:187 and :198 are named by NEITHER** — see §5. |
| B-12 | `apps/web/src/lib/automations/evaluator.ts` **:64**, :73, **:80**, **:131** | `prisma.appEvent.findMany`, `prisma.automationRule.findMany`, `prisma.automationRun.findFirst`, `prisma.automationRun.findMany` | `AppEvent`, `AutomationRule`, `AutomationRun` | The whole behavioural-email evaluator. quick-613 names :73 as its site 8. **:64, :80 and :131 are named by NEITHER §9 nor 613** — see §5. |

### 2.3 A blocker of a DIFFERENT class, on a blocker file

`apps/web/src/actions/support-tickets.ts:292` — `prisma.$queryRaw … FROM auth.users …`,
unflagged. Measured on staging: `auth.users` has RLS enabled with **0 policies**,
`app_user` holds **no grant** on it and **no `USAGE` on schema `auth`**
(`has_schema_privilege('app_user','auth','USAGE')` = **false**). So at cutover this
statement fails **`42501`, not `TC001`** — a grant problem wearing a policy
problem's clothes, on the same line block as B-9. Named separately because the
remedy is different and the tripwire will never signal it.

### 2.4 An ADJACENT finding — a TENANT path that never acquires a context

`apps/web/src/actions/support-tickets.ts:563` — `getUnreadAdminReplyCount`, an
OWNER-portal sidebar count. It has `session.tenantId` in hand and hardcodes it
into the SQL, but issues the query on the **bare** client with no `set_config`.
Under `app_user` that statement's fate depends on whatever the pooled connection
last had in `app.current_tenant_id` — quick-602's "the bare Prisma client is NOT
context-free". It is not a no-tenant path and so is not a cutover BLOCKER in this
audit's sense; it is a latent wrong-answer site, reported and not fixed.

---

## 3. LATENT — the policy raises, nothing reads the table without a tenant today

| file | why latent | what would make it live |
|---|---|---|
| `apps/web/src/app/(admin)/actions/plans.ts` (4 statements) | `Plan` has **no** `current_tenant_id()` policy — RLS is OFF on it (Section 4.12 allowlist). Nothing to raise. | adding a tenant policy to `Plan` |
| `apps/web/src/app/(admin)/actions/promos.ts` (2 statements) | same, `Promo` | same |
| `apps/web/src/app/(admin)/actions/notifications.ts` — the `NotificationTemplate` ×4 and `NotificationEmailConfig` ×4 statements | both tables RLS OFF | same |
| `apps/web/src/app/api/cron/digest-compliance-30day`, `digest-daily-driver`, `digest-weekly-owner` | each holds exactly one `getAdminDb` acquisition and does its per-tenant work on `getTenantPrismaForOrg`; the bare import is unused by any model statement | a new bare statement added to the sweep |
| `apps/web/src/lib/context/tenant-context.ts` :179, :210, :231 | `set_config` only — no relation is touched | the helper growing a table read before it sets the GUC |

---

## 4. ROUTED / NOT AFFECTED — already correct

| file | mechanism | allowlist entry |
|---|---|---|
| `app/(admin)/actions/automations.ts` | 7 `getAdminDb` calls, **zero** `prisma.` usages | `calls: 7` |
| `app/(admin)/billing/[id]/page.tsx` | 1 | `calls: 1` |
| `app/track/[token]/page.tsx` | 1 | `calls: 1` |
| `app/api/track/[token]/route.ts` | 1 admin + 1 bypass-flagged (the GPS lookup) | `calls: 1` |
| `app/api/auth/accept-invitation/route.ts` | 2 admin + 4 bypass-flagged | `calls: 2` |
| `app/api/cron/{carrier-auto-dispatch, carrier-compliance-alerts, mark-overdue-invoices, purge-deleted, send-reminders, trip-reminders, workflow-notifications}` | admin + `getTenantPrismaForOrg` | 1 or 2 each |
| `lib/db/repositories/tenant.repository.ts` | 2 admin + 1 tenant-GUC block | `calls: 2` |
| `lib/email/send-sysadmin-invoice.ts` | 1 | `calls: 1` |
| `lib/context/tenant-context.ts` | imports `assertRoleBootGuard` from the admin module, makes **0** `getAdminDb` calls | `calls: 0` — deliberate |
| all five `lib/onboarding/*` | `setTransactionTenantId` before the first statement (quick-601) | not on the allowlist, and does not need to be |
| `api/auth/login/route.ts` | tenant GUC inline at :74 and :113 (quick-423/424) | — |

### The `ADMIN_ALLOWLIST` figures, read off the real file — a correction

The orchestrator's brief says **"24 entries after 613"**. The file says otherwise,
and so does arithmetic over its own literal:

```
apps/web/tests/security/admin-connection-allowlist.test.ts:156
    expect(Object.keys(ADMIN_ALLOWLIST).length).toBe(23);
apps/web/tests/security/admin-connection-allowlist.test.ts:157
    expect(TOTAL_EXPECTED_CALLS).toBe(48); // quick-613: 44 + 4 in automations.ts
```

Parsing the literal independently of the assertion: **23 entries, 48 calls
summed.** The assertion and the data agree; the brief's 24 does not. quick-613
§6 is explicit that the entry count **stays 23** because no new FILE joined the
list — only `automations.ts`'s `calls` went 3 → 7. **The correct figure is 23 / 48.**

---

## 5. Reconciliation against `docs/audits/admin-connection.md` §9

§9 is "What still has no route after this lands". Starting from it, as instructed,
rather than from scratch.

| §9 item | §9's status | quick-614's measured status | correction? |
|---|---|---|---|
| Both `generateTicketNumber` copies — **B7** (`actions/support-tickets.ts:98`, `api/mobile/support/ticket/route.ts:39`) | unrouted; "break silently at the cutover" | **BOTH ARE BYPASS-FLAGGED.** `actions/support-tickets.ts:99` and `api/mobile/support/ticket/route.ts:39` each issue `tx.$executeRaw\`SELECT set_config('app.bypass_rls','on',TRUE)\`` immediately before the `supportTicket.findFirst`. So they are **EXEMPTED by `tenant_context_required()`'s bypass arm and will NOT raise.** §9's prediction — silent zero rows, `TKT-0001` forever — **remains exactly right**, and it will happen at the **bypass-policy drop** (cutover item 4), not at the `app_user` cutover. **CORRECTION: B7 is a bypass-programme item, NOT a tripwire blocker. The tripwire cannot see it.** |
| `lib/auth/supabase.ts:164` `getCurrentUser` sysadmin branch — **B8** | unrouted | **BYPASS-FLAGGED.** :164 is `prisma.$executeRaw\`SELECT set_config('app.bypass_rls','on',TRUE)\`` inside the same `$transaction` array as the `prisma.user.findUnique` at :165. Same conclusion as B7: **exempt, not signalled, still broken at the bypass drop.** **CORRECTION: B8 is not a tripwire blocker either.** Also worth recording: v1 of this audit's own grep reported `lib/auth/**` as zero files, because the import is relative (§1). |
| `provision-tenant.ts:36` + `tenant.repository.ts:33` — **B3** | already struck through, CLOSED by quick-601 | **CONFIRMED CLOSED**, and the closure is wider than §9 records: `setTransactionTenantId` is used by **all five** `lib/onboarding/*` files and by `tenant.repository.ts:44`. Zero unflagged statements across the whole provisioning path. |
| `api/track/[token]/route.ts`'s GPS lookup | unrouted, "filtered by `truckId` only" | **BYPASS-FLAGGED** (:50 sets the GUC, :51 is `tx.gPSLocation.findFirst`). Exempt, not signalled. §9's substantive point — that it carries no tenant predicate at all — is untouched and still correct. |
| `api/cron/automations/route.ts`'s four `candidateQuery()` reads | unrouted, "zero rows silently" | **CONFIRMED** at :53, :71, :89, :111 — and the prediction needs updating: they will not return zero rows silently, **they will raise `TC001`** (measured class; `ActivationProgress` and `Subscription` both carry `current_tenant_id()` policies). **Plus TWO statements §9 does not name: :187 and :198, `prisma.automationRun.findFirst`, in the shared `runCronRule` helper the four candidate queries all flow through.** quick-613 named :170 in the same function and stopped there. |
| The five DECORATIVE loop-body statements — `workflow-digest` (4) + `evaluator.ts` Path 1 (1) | bypass-flagged, owned by A2 | **CONFIRMED.** `workflow-digest` has **8** bypass-flagged model statements across 4 transaction blocks (§9's "4" counts blocks, not statements — worth stating so the two numbers are not read as a disagreement); `evaluator.ts:97` is the Path-1 one. All exempt. **But `evaluator.ts` ALSO carries four UNFLAGGED statements — :64, :80, :131 and quick-613's :73 — which §9 does not mention at all.** |

### Net corrections to §9

1. **B7 and B8 are not what the tripwire will catch.** Both are bypass-flagged.
   The tripwire's §3 exemption is precisely what makes them invisible, and that is
   the recorded cost of quick-602's decision D2 arriving on the two items §9 calls
   out by name.
2. **Two statements in `api/cron/automations/route.ts` (:187, :198) and three in
   `lib/automations/evaluator.ts` (:64, :80, :131) are unrouted, unflagged, on
   raising tables, and named by NO existing audit.** Five new blocker statements.
3. **Eight sysadmin files carrying 37 unflagged statements are not in §9 at all**,
   because §9 was scoped to what quick-600's routing left behind, not to everything
   the cutover will break. B-1 and B-3 to B-8 above.
4. §9's "zero rows silently" for the cron candidate queries should read "**raises
   `TC001`**" once the tripwire is armed in that environment — a strictly better
   failure than the one it predicted.

---

## 6. Step 4 — the INVERSE shape: a policy with only a tenant branch, on a table a no-tenant path MUST read

These never surface from an OR-shaped search, because there is no second branch to
look for. After Task 1's plan-time finding the distinction is moot for *whether*
they raise — everything does — but the list is what decides *what breaks*.

| table | policies | spelling | who must read it with no tenant | measured |
|---|---|---|---|---|
| **`Tenant`** | `tenant_self_read` (SELECT), `tenant_self_update` (UPDATE), `tenant_bootstrap_insert` (INSERT) | `id = current_tenant_id()` | sysadmin tenant list and detail (B-3, B-5); the login tenant check; provisioning | cell `BE-tenant`: EMPTY **RAISES TC001**, REAL **RETURNS 1** |
| `User` | `tenant_isolation_policy` | `"tenantId"` | sysadmin user admin (B-4), tenant detail (B-3), `getCurrentUser`'s sysadmin branch (bypass-flagged) | `BE-user`: EMPTY **RAISES**, REAL **RETURNS 6** |
| `NotificationSendLog` | 2 policies, RLS enabled **AND forced** | `"tenantId"` | SysAdmin → Notifications (B-1) | raises (class-measured) |
| `SysAdminInvoice` | `tenant_isolation_policy` | `"tenantId"` | SysAdmin → Invoicing (B-2) | raises |
| `SupportTicket`, `TicketMessage` | `tenant_isolation_policy`; `TicketMessage`'s is the subquery one | `"tenantId"` / `IN (SELECT …)` | sysadmin support list (B-9), the auto-close cron (B-10) | `SUB-tm`: EMPTY **RAISES**, with a 0-row outer AND a 0-row inner |
| `ActivationProgress`, `Subscription`, `AppEvent`, `AutomationRun`, `AutomationRule` | `tenant_isolation_policy` (+ the 4-way split on `AutomationRule`) | `"tenantId"` | the automations cron (B-11), the evaluator (B-12), tenant detail (B-6, B-7, B-8) | `OR-1a/1b`: EMPTY **RAISES**, REAL **RETURNS 6 / 0** |
| `Load`, `DriverInvitation` | `tenant_isolation_policy` | `"tenantId"` | sysadmin tenant detail (B-3) | raises |

**13 distinct tables** across the blocker list.

The `Tenant` row deserves its own sentence, because it is the one the brief singles
out and the measurement is unambiguous: `tenant_self_read` is
`USING (id = current_tenant_id())` with **no second branch of any kind**, and the
sysadmin tenant list, the sysadmin tenant detail page and the sysadmin support
page's tenant filter all read it with no tenant. There is nothing in that policy
that could ever have saved them.

---

## 7. Counts, with the method beside each

| count | value | method |
|---|---|---|
| tables carrying a `current_tenant_id()` policy | **90** | distinct `tablename` over the 96 policies in `01-enumeration-prod.json` |
| tables carrying `bypass_rls_policy` | **86** | distinct `tablename` where `policyname = 'bypass_rls_policy'` |
| files in `apps/web/src` importing the bare client | **165** | real import statement, specifier ending `db/prisma`, comments stripped. **Files MENTIONING the string `prisma` is a much larger and meaningless number and was not used.** |
| …of which touch at least one raising table | **142** | `prisma.`/`tx.` model access mapped via `schema.prisma` |
| …of which set `app.bypass_rls` anywhere | **86** | literal match after comment stripping |
| files analysed statement-by-statement | **31** | the four brief categories plus the B7 pair, `evaluator.ts` and `tenant.repository.ts` |
| **UNFLAGGED statements on a raising table** | **48** | §2.1 = 9+1+14+5+1+1+1+1+3 = **36**; §2.2 = 1+7+4 = **12**. Split by kind: **44 model statements** and **4 raw-SQL statements** (`support-tickets.ts` :271, :286, :290 and `auto-close-tickets` :25), each of whose literals was READ and confirmed to name a policy-bearing table. |
| CUTOVER BLOCKER files | **12** | B-1 … B-12 |
| …of which are MIXED (already partly on `getAdminDb`) | **4** | `sysadmin-invoices.ts`, `tenants.ts`, `actions/support-tickets.ts`, `auto-close-tickets/route.ts` |
| blocker statements of a DIFFERENT class (`42501`, not `TC001`) | **1** | `support-tickets.ts:292` over `auth.users` — §2.3 |
| `ADMIN_ALLOWLIST` entries / calls | **23 / 48** | parsed off the file's own literal and cross-checked against its two assertions. The brief's "24" is wrong. |
