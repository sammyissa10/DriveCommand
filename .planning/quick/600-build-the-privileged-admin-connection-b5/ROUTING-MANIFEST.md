# quick-600 — routing manifest (B5)

Every candidate `bypass-replacement-design.md` names, plus the two the design doc's own snapshot
missed, walked against today's `master` and given one of three verdicts:

- **ROUTE** — genuinely cross-tenant or pre-tenant. Goes on `getAdminDb(reason)`.
- **CORRECT** — the tenant is already in hand at that statement. Goes through
  `getTenantPrismaForOrg(tenantId)` instead. A correction to the design doc's classification, not a
  routing — it does not appear on the allowlist.
- **LEAVE** — out of B5's scope. Named checklist item, current bypass untouched.

Verified against `master` at the start of this task (2026-09-14), after quick-599
(`20260914120000_tenant_audit_automation_policy_closure`, the newest migration on staging).

---

## 1. The 21 CROSS_TENANT sites (design §1.2)

### All-tenant sweeps (11)

| # | File:line | What | Verdict | Reason string (ROUTE) | Tables (op) |
| - | --- | --- | --- | --- | --- |
| 1 | `api/cron/digest-compliance-30day/route.ts:42` | `tenant.findMany({isActive:true})` — sweep | **ROUTE** | `compliance digest tenant sweep` | Tenant (S) |
| 2 | `api/cron/digest-daily-driver/route.ts:42` | same shape | **ROUTE** | `daily driver digest tenant sweep` | Tenant (S) |
| 3 | `api/cron/digest-weekly-owner/route.ts:42` | same shape | **ROUTE** | `weekly owner digest tenant sweep` | Tenant (S) |
| 4 | `api/cron/send-reminders/route.ts:62` | same shape | **ROUTE** | `reminders cron tenant sweep` | Tenant (S) |
| 5 | `api/cron/workflow-digest/route.ts:50` | `playbookInstance.findMany({distinct:['tenantId']})` — sweep | **ROUTE** | `workflow digest active-tenant sweep` | PlaybookInstance (S) |
| 6 | `api/cron/workflow-notifications/route.ts:57` | `stepInstance.findMany` all tenants, `dueDate < now-24h` — sweep 1 | **ROUTE** | `workflow overdue-step sweep` | StepInstance (S) |
| 7 | `api/cron/workflow-notifications/route.ts:81` | `stepInstance.update({id})`, no-`dueWithinHours` branch | **CORRECT** — `step.playbookInstance.tenantId` already in hand from the row the sweep just read | n/a | — |
| 8 | `api/cron/workflow-notifications/route.ts:96` | `stepInstance.update({id})`, isOverdue mark | **CORRECT** — same tenant, same row | n/a | — |
| 9 | `api/cron/workflow-notifications/route.ts:121` | `playbookInstance.findMany({status:'BLOCKED'})` all tenants — sweep 2 | **ROUTE** | `workflow blocked-instance sweep` | PlaybookInstance (S) |
| 10 | `api/cron/auto-close-tickets/route.ts:53` | `supportTicket.updateMany({id:{in:ticketIds}})` — **batch across potentially many tenants in one statement**, no per-row loop to hang a single GUC off | **ROUTE** | `auto-close stale ticket sweep` | SupportTicket (U) |
| 11 | `lib/automations/evaluator.ts:204` (design's `:203`) | `automationRun.updateMany({id:run.id,status:'PENDING'})`, inside `for (const run of dueRuns)` | **CORRECT** — `run.tenantId` already in hand from the row `dueRuns` (the sweep) just read | n/a | — |

**Checked "the same shape" per the plan's instruction before routing:** `auto-close-tickets:53` is a
**set-based** `updateMany` over `ticketIds` collected from a raw cross-tenant scan — the ids can name
different tenants in the SAME statement, so there is no single tenant to set the GUC to. That is a
different shape from `workflow-notifications:81/:96` (one row, one known tenant) and stays **ROUTE**.
`evaluator.ts:204` (design's `:203`) IS that shape — `run.tenantId` is a field already loaded on the
row being updated — and is corrected to **CORRECT**.

### SysAdmin surfaces (8)

| # | File:line | What | Verdict | Reason string | Tables (op) |
| - | --- | --- | --- | --- | --- |
| 12 | `(admin)/actions/automations.ts:107` | `automationRun.create` on another tenant's rule | **ROUTE** | `sysadmin manual automation trigger` | AutomationRun (I) |
| 13 | `(admin)/actions/automations.ts:141` | `automationRun.updateMany` → SENT | **ROUTE** | `sysadmin manual automation trigger` | AutomationRun (U) |
| 14 | `(admin)/actions/automations.ts:151` | same, FAILED branch | **ROUTE** | `sysadmin manual automation trigger` | AutomationRun (U) |
| 15 | `(admin)/actions/tenants.ts:586` (`extendTrial`) | `subscription.update` + `appEvent.create` on an arbitrary tenant | **ROUTE** | `sysadmin trial extension` | Subscription (U), AppEvent (I) |
| 16 | `lib/db/repositories/tenant.repository.ts:87` (`listAllTenants`) | `tenant.findMany()`, every row, by design | **ROUTE** | `sysadmin tenant listing` | Tenant (S) |
| 17 | `actions/support-tickets.ts:341` (`updateTicketStatus`) | update on any tenant's ticket | **ROUTE** | `sysadmin ticket status update` | SupportTicket (U) |
| 18 | `actions/support-tickets.ts:475` (`addAdminReply`) | raw `SELECT email FROM "User"` + `ticketMessage.create` + `supportTicket.update` | **ROUTE** | `sysadmin ticket reply` | User (S), TicketMessage (I), SupportTicket (S,U) |
| 19 | `actions/support-tickets.ts:542` (`getTicketMessages`) | `ticketMessage.findMany` for any tenant's ticket | **ROUTE** | `sysadmin ticket thread read` | TicketMessage (S) |

**Extension found while routing #15, same function, not a new candidate:** `extendTrial` also opens
with a bare, unflagged `prisma.subscription.findUnique({where:{tenantId}})` (today's line ~573) —
the setup read for the exact transaction being routed. It was never given its own `@bypass_rls`
marker (out of the design doc's 211-site grep), but it reads an arbitrary tenant's `Subscription`
row and a tenant client cannot serve it either. Routed onto the SAME admin call
(`sysadmin trial extension`) in the same edit rather than left half-fixed — reported here rather
than counted as a 22nd CROSS_TENANT site, since it is the same unit of work as #15.

### A global sequence (2) — decision already taken, not relitigated

| # | File:line | What | Verdict |
| - | --- | --- | --- |
| 20 | `actions/support-tickets.ts:98` (`generateTicketNumber`) | global max `ticketNumber` scan | **LEAVE — B7.** An admin connection papers over a data-model problem (§3.3). The fix is `CREATE SEQUENCE support_ticket_number` + `GRANT USAGE` to `app_user`, not built here. **Still breaks at cutover — see "what still has no route" below.** |
| 21 | `api/mobile/support/ticket/route.ts:39` | byte-identical duplicate | **LEAVE — B7.** Same reasoning; the two copies keep racing each other until B7 lands. |

**21/21 walked.** Verdict tally: **16 ROUTE, 3 CORRECT (7, 8, 11), 2 LEAVE (20, 21).**

---

## 2. The 6 `"Tenant"` write sites — `(admin)/actions/tenants.ts` (design §4.4)

| # | File:line | Function | Verdict | Reason string | Table (op) |
| - | --- | --- | --- | --- | --- |
| T1 | `:98` | `createTenant` | **ROUTE** | `sysadmin tenant create` | Tenant (I) |
| T2 | `:190` | `suspendTenant` | **ROUTE** | `sysadmin tenant status change` | Tenant (U) |
| T3 | `:229` | `reactivateTenant` | **ROUTE** | `sysadmin tenant status change` | Tenant (U) |
| T4 | `:432` | `updateTenant` | **ROUTE** | `sysadmin tenant profile update` | Tenant (U) |
| T5 | `:542` | `updateTenantSettings` | **ROUTE** | `sysadmin tenant settings update` | Tenant (U) |
| T6 | `:625` | `deleteTenant` | **ROUTE** | `sysadmin tenant delete` | Tenant (D) |

All six confirmed present at exactly these line numbers (Fact #9). **All 6 verified ROUTE — 6/6.**
None is a bypass site; all six run on the bare client today and work only because `postgres` has
`BYPASSRLS`. No correction candidates in this group — a sysadmin managing an arbitrary tenant's
row can never be served by a tenant-scoped client by construction.

**Found, not routed — same file, out of the named 6:** `createTenant` (`:98`) also creates a
`DriverInvitation` two statements later (today's `:123`), on the same bare client, for the tenant
just created. Not one of the six named `Tenant`-write sites, not named anywhere in the 21
CROSS_TENANT list either. Left untouched — reported, not silently expanded into. It will break at
the `app_user` cutover exactly like its neighbours; B5 does not claim to have found every site,
only to have routed the ones this task's candidate set names.

**Counts: 6 expected, 6 found, 6 routed. No difference to explain.**

---

## 3. Sysadmin billing paths — expected **4 files**, real statement count reported

| File | Bare-`prisma` statements | Verdict | Reason string | Tables (op) |
| --- | --- | --- | --- | --- |
| `(admin)/actions/sysadmin-invoices.ts` | **18** (see breakdown) | **ROUTE**, all 18 | `sysadmin invoice management` | SysAdminInvoice (S,I,U), SysAdminInvoiceItem (I,D), User (S) |
| `(admin)/billing/[id]/page.tsx:36` | 1 (audit trail lookup, wrapped in `.catch(() => null)`) | **ROUTE** | `sysadmin invoice audit trail` | SysAdminInvoice (S) |
| `api/cron/mark-overdue-invoices/route.ts` | 1 (`updateMany`, batch across every tenant's SENT invoices — same batch shape as auto-close-tickets, cannot hang one GUC off it) | **ROUTE** | `overdue invoice sweep` | SysAdminInvoice (U) |
| `lib/email/send-sysadmin-invoice.ts` | 2 (`sysAdminInvoice.findUnique` by id, tenant unknown until read; `user.findFirst` for the owner, using the tenant the first read just found) | **ROUTE**, both, one reason | `sysadmin invoice email lookup` | SysAdminInvoice (S), User (S) |

**The "4" in the brief is FILE count, not statement count** — confirmed by re-reading the brief's
own wording ("the four *files* are …"). `sysadmin-invoices.ts` alone carries 18 bare-`prisma`
statements:

```
:26   sysAdminInvoice.findFirst        (generateInvoiceNumber)
:106  sysAdminInvoice.create           (+ nested SysAdminInvoiceItem create)
:151  sysAdminInvoice.findMany         (getSysAdminInvoices)
:166  sysAdminInvoice.findUnique       (getSysAdminInvoiceById, +items include)
:176  user.findFirst                   (owner lookup, getSysAdminInvoiceById)
:202  sysAdminInvoice.findUnique       (updateSysAdminInvoice, pre-check)
:242  sysAdminInvoiceItem.deleteMany   (updateSysAdminInvoice, $transaction[0])
:243  sysAdminInvoice.update           (updateSysAdminInvoice, $transaction[1], + nested item create)
:275  sysAdminInvoice.findUnique       (markInvoicePaid, pre-check)
:280  sysAdminInvoice.update           (markInvoicePaid)
:300  sysAdminInvoice.findUnique       (voidInvoice, pre-check)
:305  sysAdminInvoice.update           (voidInvoice)
:325  sysAdminInvoice.findUnique       (archiveInvoice, pre-check)
:331  sysAdminInvoice.update           (archiveInvoice)
:356  sysAdminInvoice.findUnique       (sendInvoiceAction, pre-check)
:366  sysAdminInvoice.update           (sendInvoiceAction, status -> SENT)
:399  sysAdminInvoice.updateMany       (markOverdueInvoices server action — a second,
                                        in-process copy of the cron's sweep, same shape)
```

That is 17 numbered lines but 18 statements (`:242`/`:243` are two statements inside one
`$transaction([...])` array). **All 18 are genuinely sysadmin-only** — every one operates on an
invoice or tenant selected by the sysadmin, never the session's own tenant — so all 18 route onto
one admin client under one reason, `sysadmin invoice management`.

`(owner)/actions/subscription.ts:getMySubscriptionInvoices` **also touches `SysAdminInvoice`** and
is the plan's named **CORRECT** candidate for this group: `requireOwnerOrManager()` already resolves
`session.tenantId` before the query runs, and `SysAdminInvoice` carries a live
`tenant_isolation_policy` (`tenantId = current_tenant_id()`) alongside the two `deny_*` permissive
policies from §2.6 — a tenant-scoped GUC is admitted by the isolation policy regardless of what the
deny policies say (permissive policies OR together). **Moved to `getTenantPrismaForOrg(tenantId)` —
never `ROUTE`.**

**Counts: 4 files expected, 4 files found, 4 files routed, real statement count 22 across those 4
files (18 + 1 + 1 + 2). Difference from "4" is a units mismatch (files vs statements), not a miss —
explained above, not silently reinterpreted.**

---

## 4. BOOTSTRAP — 7 sites / 5 files (design §1.1, corrected by §3.2)

| # | File:line | Function | Verdict | Reason string | Tables (op) |
| - | --- | --- | --- | --- | --- |
| B1 | `lib/onboarding/provision-tenant.ts:36` | `provisionTenant` (sign-up) | **LEAVE — §4.1.** See below. | — | — |
| B2 | `lib/db/repositories/tenant.repository.ts:33` | `provisionTenant` (repository twin) | **LEAVE — §4.1.** Same reasoning as B1; same transaction shape. | — | — |
| B3 | `lib/db/repositories/tenant.repository.ts:66` | `findTenantByUserId` | **ROUTE** | `tenant lookup by user id` | User (S, incl. Tenant relation → Tenant S) |
| B4 | `lib/auth/supabase.ts:164` | `getCurrentUser` | **LEAVE — B8.** Explicit in the plan; 9 call-chain units, needs the JWT-claim GUC restructuring, not this task's. | — | — |
| B5r | `api/auth/accept-invitation/route.ts:44` | `GET` | **ROUTE** | `invitation lookup by token` | DriverInvitation (S) |
| B6r | `api/auth/accept-invitation/route.ts:121` | `POST` | **ROUTE** | `invitation lookup by token` | DriverInvitation (S) |
| B7r | `api/track/[token]/route.ts:24` | `GET` | **ROUTE** | `public shipment tracking lookup` | Load (S), Truck (S, relation), User (S, `driver` relation) |

**4 ROUTE, 3 LEAVE — matches §3.2's own count exactly** ("Three of the seven do not need an admin
connection at all… four statements": `tenant.repository.ts:66` · `accept-invitation:44` ·
`accept-invitation:121` · `track/[token]:24`).

### Why B1/B2 are LEAVE, naming §4.1, rather than half-done

§3.2's own table calls for "New INSERT policy + a GUC set mid-transaction, with two probe reads
hoisted onto the admin path" for these two. The INSERT policy half (`tenant_bootstrap_insert`)
**already shipped** in quick-599. What remains is genuine transaction surgery, not a client swap:

1. Hoist step 1 (`tx.user.findFirst({where:{email}})`, a global email probe) and step 3
   (`while (await tx.tenant.findFirst({where:{slug}})) …`, the slug-uniqueness loop) OUT of the
   transaction and onto two admin reads run BEFORE it opens.
2. Leave the `tenant.create` itself on a GUC-less connection — `tenant_bootstrap_insert`'s
   `WITH CHECK` is satisfied by "no tenant GUC set", not by BYPASSRLS, so this step does **not**
   need `getAdminDb` at all once 1 is done — but that only works if the surrounding transaction is
   NOT the one opened by `getAdminDb` (an admin connection has no reason to run this insert; it
   would work, but it would silently widen what "needs admin" means, the opposite of the point of
   this task).
3. Add `set_config('app.current_tenant_id', tenant.id, TRUE)` **immediately after** the tenant
   insert, inside the SAME transaction, so steps 5/8/9 (`User`, `Subscription`,
   `ActivationProgress` creates) pass their own `WITH CHECK` on a tenant-scoped connection with no
   bypass and no admin client at all.
4. The ordering constraint is exact and unforgiving: the GUC must be unset before the `Tenant`
   insert and set immediately after it, in the same transaction, on the same connection — mixing an
   admin connection for steps 1/3 with a *different*, GUC-toggling connection for steps 4–9 is not
   "one unit of work at a time" in the sense Task 2 describes; it is a redesign of
   `provisionTenant`'s transaction boundary, touching the live sign-up path in production's twin
   flow.

This is exactly the shape the plan pre-authorises as LEAVE: **"if the two global probes … cannot
be hoisted onto admin without restructuring the transaction, that is a LEAVE naming §4.1, and say
so plainly rather than half-doing it."** Restructuring `provisionTenant` safely needs its own
staging-verified task — sign-up is the one flow this repo cannot afford to regress silently — and
is reported here as open, not attempted partially. `provision-tenant.ts` and
`tenant.repository.ts`'s `provisionTenant` method are **untouched** by this task.

### Not part of the 7, found in the same files, left alone

`api/auth/accept-invitation/route.ts` carries **two more** `@bypass_rls`-flagged transactions beyond
`:44`/`:121` — an `existingUser` check (today's `:157`, `tx.user.findFirst({email, tenantId:
invitation.tenantId})`) and the account-creation write (today's `:240`, `user.create` +
`driverInvitation.update` + `carrierDriver.updateMany`). Both already hold `invitation.tenantId`
from the `:121` read — DECORATIVE, not BOOTSTRAP, not named in the design doc's 7-site list, not
part of this task's candidate set. Left untouched, reported rather than silently swept in.

`api/track/[token]/route.ts` carries a **second** bypass transaction at today's `:49`
(`tx.gPSLocation.findFirst({where:{truckId:load.truckId}})`). **Design doc §1.1 is STALE here**: it
describes this site as reusing `load.tenantId` ("needs nothing"), but today's code filters by
`truckId` only — `GPSLocation` carries no tenant column and this read has no tenant predicate at
all. It is not one of the named 7 BOOTSTRAP sites (only `:24` was named) and is not part of this
task's candidate set. Left untouched. **Flagged as a design-doc correction, not fixed** — noted in
`docs/audits/bypass-replacement-design.md`'s §1.1 update.

---

## 5. `api/cron/automations/route.ts:179` — not in the design snapshot (Fact #9)

`scheduleCronDrivenRule`'s `tx.automationRun.create({data:{ruleId, tenantId, ...}})`, inside
`for (const {tenantId} of candidates)`. **CORRECT** — `tenantId` is the loop variable, already known
per candidate row, same shape as `workflow-notifications:81/:96` and `evaluator.ts:204`. Moves to
`getTenantPrismaForOrg(tenantId)`.

**Found, not routed, same file:** `candidateQuery()` itself (four call sites: `activationProgress
.findMany` x3, `subscription.findMany` x1) reads across every tenant with **no bypass flag at all**
— it is not part of the 211-site grep target and therefore not part of this task's candidate set,
but it will return **zero rows silently** under `app_user` with an empty GUC once RLS is live,
which would break every cron-driven nudge at cutover with no error. Reported here as a genuine gap
this task did not create and does not close — it needs the same "list is the cross-tenant part"
splitting `workflow-digest`/`digest-*` already received, and belongs with A1/A7's re-verification.

---

## 6. `generateTicketNumber` x2 — decision already taken (see §1, rows 20/21). LEAVE, B7.

## 7. The DECORATIVE loop bodies inside the cron sweep files — LEAVE, route only the sweep

Per-file audit of every `@bypass_rls` call beyond the sweep statement already routed in §1:

| File | Extra bypass-flagged statements (LEAVE) | Tenant already known from |
| --- | --- | --- |
| `api/cron/workflow-digest/route.ts` | 4 — dedup check (`playbookNotification.findFirst`), stats block (`stepInstance.count` x2, `playbookInstance.count`, `user.findMany`, `tenant.findUnique`), dedup pre-create read (`playbookInstance.findFirst`), dedup write (`playbookNotification.create`) | `tenantId`, the sweep's own loop variable |
| `lib/automations/evaluator.ts:95` | 1 — `automationRun.create` (Path 1, event-driven scheduling) | `event.tenantId`, the row Path 1's own sweep (`appEvent.findMany`) just read |
| `api/cron/digest-compliance-30day/route.ts`, `digest-daily-driver/route.ts`, `digest-weekly-owner/route.ts`, `send-reminders/route.ts` | 0 each | Their loop bodies use `prisma.$extends(withTenantRLS(tenant.id))` directly — no `app.bypass_rls` flag at all, so there is nothing to leave or route here |

**Measured count: 5** bypass-flagged decorative loop-body statements left untouched (4 +
1), against the design doc's prose estimate of "6" in §3.3's summary table row. Not forced to match
— the design doc's "6" is a rounded total across the whole "11 sweeps" group's surrounding code and
was never broken out site-by-site anywhere in the document; 5 is what this task's own per-file
`grep -n "bypass_rls"` walk actually finds, and it is reported as measured rather than reconciled
to an unstated breakdown. All 5 stay exactly as they are — **route only the sweep statement**, per
the plan's explicit instruction, which this manifest's §1 table already reflects (rows 1–6, 9, 10).

---

## Counts — reconciled against 4 / 6 / 21, every difference explained

| Category | Expected | Found | Routed | Corrected | Left |
| --- | --- | --- | --- | --- | --- |
| Sysadmin billing **files** | 4 | 4 | 4 | 0 (subscription.ts's `getMySubscriptionInvoices`, a 5th file touching the same table, corrected — see §3) | 0 |
| `"Tenant"` write **sites** | 6 | 6 | 6 | 0 | 0 |
| CROSS_TENANT **sites** | 21 | 21 | 16 | 3 (rows 7, 8, 11 — tenant already in hand) | 2 (rows 20, 21 — B7) |

**Every difference:**
- Sysadmin billing: the "4" was always files, not statements — 22 real statements across those 4
  files, reported in full in §3, not reinterpreted to force a match.
- Tenant writes: exact match, no difference.
- CROSS_TENANT: 21 found exactly where the design doc named them; **3 reclassified from ROUTE to
  CORRECT** (the design doc's own §3.2 pre-announced 2 of these — `workflow-notifications:81/:96` —
  as likely corrections and explicitly asked this task to check `evaluator.ts:203` and
  `auto-close-tickets:53` "for the same shape"; the check found `evaluator.ts:204` matches and
  `auto-close-tickets:53` does not, because it is a multi-tenant batch statement, not a single known
  row); **2 stay LEAVE** per the B7 decision the plan states outright, not relitigated.
- Additionally found, **not** in the original 21/6/4 counts, each given its own verdict: BOOTSTRAP's
  4 admin sites + 3 leaves (§4), `cron/automations/route.ts:179` (§5, CORRECT), and the
  `extendTrial` pre-read + `createTenant`'s DriverInvitation write + accept-invitation's two extra
  bypass calls + track/token's GPS call + evaluator.ts's Path-1 create + the 4 digest-crons'
  clean loop bodies (all named individually above, all reported, none silently swept in).

**At least one CORRECT verdict, with reasoning: rows 7, 8, 11 (workflow-notifications x2,
evaluator.ts), plus `cron/automations/route.ts:179` and `(owner)/actions/subscription.ts`. Five
total, all argued from "the tenant is already in hand at that statement," none of them appear on
the `getAdminDb` allowlist.**

---

## The grant table set — the union of every ROUTE row's "Tables (op)" column

Alphabetised, exactly what `apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql`
grants and nothing else:

```
AppEvent                     (I)
AutomationRun                (I, U)
DriverInvitation             (S)
GPSLocation                  (S)
Load                         (S)
NotificationTemplate         (S)   -- found via testing, see below
PlaybookInstance             (S)
Subscription                 (U)
StepInstance                 (S)
SupportTicket                (S, U)
SysAdminInvoice              (S, I, U)
SysAdminInvoiceItem          (I, D)
Tenant                       (S, I, U, D)
TenantNotificationSettings   (S, I)  -- found via testing, see below
TicketMessage                (S, I)
Truck                        (S)
User                         (S)
```

17 tables. `GRANT SELECT, INSERT, UPDATE, DELETE` is issued per-table only for the operations
actually used (documented per-table in the migration's comments) — the migration statement itself
grants the full four-verb set per table for simplicity and because every table here needs at least
one write-adjacent operation from *some* routed site except the pure-read set
(`DriverInvitation`, `GPSLocation`, `Load`, `NotificationTemplate`, `PlaybookInstance`,
`StepInstance`, `Truck`, `User`), which get `SELECT` only — see the migration file for the exact
per-table breakdown.

**Two tables were NOT in the original 15 and were found only by running Task 3's both-directions
matrix, not by reading application code.** `INSERT INTO "Tenant"` fires an existing `AFTER INSERT`
trigger, `trg_seed_tenant_notification_settings` (not `SECURITY DEFINER`, so it runs as the
invoking role), which reads `"NotificationTemplate"` and does an
`INSERT ... ON CONFLICT DO NOTHING` into `"TenantNotificationSettings"` — the `ON CONFLICT` clause
additionally requires `SELECT` on the conflict target, independent of `INSERT`. `app_admin` had
none of these three grants; `S10 — Tenant create` and `S12 — Tenant DELETE by id` (which also
creates a throwaway tenant to isolate the DELETE question from an unrelated FK constraint) both
failed with `42501 permission denied for table TenantNotificationSettings` on the first real run,
were fixed by adding the three grants, and re-verified green. See the migration file's §4 for the
full account and `evidence/03-routed-sites.json` for the measured failure and the fix.
