# Replacing every `app.bypass_rls` site

**Date:** 2026-09-12
**Status:** DESIGN ONLY. No application file, policy, migration or database object was changed.
Production and staging were read with `SELECT` only; no DDL, no DML, no `set_config`.
**Predecessors:** `.planning/phase-0-revised.md` §3.8 and §9 · `docs/audits/bypass-call-classification.md` ·
`docs/audits/wrapper-migration-scope.md` · `.planning/quick/596-remove-unnecessary-transactions-from-fiv/`
**Answers:** Phase 0 step 2 — the blocking item.

---

## 0. Summary

| Category | Sites | Files | What it means | Replacement |
|---|---|---|---|---|
| **BOOTSTRAP** | **7** | 5 | No tenant is knowable at that point in the request | Admin connection (4) · a new INSERT policy + a mid-transaction GUC (2) · the GUC from a JWT claim (1) |
| **CROSS_TENANT** | **21** | 10 | Legitimately spans tenants | Admin connection (19) · a real sequence (2) |
| **BROKEN_POLICY** | **11** | 8 | A policy that cannot be satisfied, or none at all | DDL — four policies and one data-model decision |
| **DECORATIVE** | **172** | 88 | Tenant-scoped already; the bypass was never the mechanism | `withTenantContext` / `getTenantPrismaForOrg`, then delete the line |
| **Total** | **211** | **103** | | |

171 DECORATIVE sites are live today. The 172nd — `lib/email/sender-config.ts:135` — was removed by
quick-596 (`a7d52a8c`) after it was measured to be a verified no-op. **Today's live count is therefore
210 across 102 files**, and 210 + 1 removed = the 211 the earlier audit enumerated. The drift is
accounted for, not unexplained.

**The single most important finding is an ordering one, and it changes what "step 7" costs.**
`DATABASE_URL` resolves to `postgres`, which carries `rolbypassrls = true`. Measured directly:
as `postgres`, with no GUC set, `SELECT count(*) FROM stops` returns **791 rows** on a table that
runs `FORCE ROW LEVEL SECURITY` with **zero policies**. RLS is entirely inert on the runtime
connection. **Dropping `bypass_rls_policy` on its own therefore breaks nothing, on any surface.**
It becomes observable only at the `app_user` cutover. §6 answers both framings.

**Four corrections to inherited premises**, each measured rather than reasoned:

1. **`PushToken` is not a broken-policy table.** It carries three policies, and
   `tenant_isolation_policy` — `"tenantId" = current_tenant_id()` — is satisfiable. `tenantId` is
   `NOT NULL` with zero null rows. The *unsatisfiable* one, `user_isolation_policy`, sits beside it
   and is redundant, not load-bearing. §2.2.
2. **`getCurrentUser` is not a bootstrap read for 37 of 38 accounts.** `getSession()` reads
   `tenantId` out of the JWT's `app_metadata` with **no database call**. The tenant is in hand before
   the query runs. §3.2.
3. **`stops` is the real broken-policy table on production** — `FORCE RLS`, and **not one policy,
   not even `bypass_rls_policy`**. Four bypass sites read it and the bypass is already a no-op for
   all four. §2.3.
4. **Staging and production do not agree on policies or grants.** Staging carries four
   `tenant_isolation_policy` rows production does not, and seven `app_user` grants production does
   not. Step 1 was applied to staging only. §2.5. `.planning/phase-0-revised.md` §3.7's "policies,
   grants and RLS flags match exactly between the two databases" was true when written and is no
   longer true.

---

## 1. Reclassification — all 211 sites

### Method

```
cd apps/web
grep -rn "app.bypass_rls" src --include=*.ts --include=*.tsx | grep -v __tests__ \
  | awk -F: '{l=$0; sub(/^[^:]*:[0-9]*:/,"",l); gsub(/^[ \t]+/,"",l); if (l !~ /^(\*|\/\/|\/\*)/) print}'
```

→ **210 executable sites across 102 files.** Every one was then attributed to a category by the
test below, and the tables each bypass scope touches were extracted by a source scan
(`tx|prisma|db|client.<model>.<verb>` between each bypass line and the next one in the file, 400-line
cap), giving **46 distinct tables** — the input to §2.

### The test applied, in order

Precedence matters, because sites can satisfy more than one description. A site is assigned to the
**first** category it matches:

1. **BOOTSTRAP** — at the moment of the query, is there *any* verified value in the request that
   names a tenant? A JWT claim, a signed token payload, an argument the caller already validated all
   count. If there is none, the site is BOOTSTRAP. This is a stricter test than "runs before auth":
   several pre-auth paths hold a tenant and are not bootstrap.
2. **BROKEN_POLICY** — does at least one statement in the bypass scope address rows that **no policy
   on that table could ever admit**, whatever the application sets? Quoted policy required.
3. **CROSS_TENANT** — does the statement deliberately span tenants: an all-tenant list, a sysadmin
   acting on another tenant, a global sequence?
4. **DECORATIVE** — everything else. The tenant is in hand or reachable; the bypass was never the
   isolation mechanism, the application `where` clause was.

An unscoped `findUnique({ where: { id } })` that *could* carry a tenant predicate is **DECORATIVE**
under this axis, not CROSS_TENANT. The earlier audit's rule (d) grouped those with genuine
cross-tenant reads because it was calibrated against a different question ("does this need a
privileged connection"). Under this axis the answer for those sites is "thread the tenant the caller
already holds", which is the DECORATIVE remedy.

---

### 1.1 BOOTSTRAP — 7 sites / 5 files

*What is not yet known at that point in the request* is stated for each.

| File:line | Function | Not yet known | Evidence |
|---|---|---|---|
| `src/lib/onboarding/provision-tenant.ts:36` | `provisionTenant` (sign-up) | **The tenant does not exist.** It is created at line 59, inside this same transaction. Before that line there is no id to put in a GUC. | The scope also runs `tx.user.findFirst({ where: { email } })` — a deliberately **global** probe across every tenant — and `while (await tx.tenant.findFirst({ where: { slug } }))`, a global slug-uniqueness loop. Neither is answerable under `"tenantId" = current_tenant_id()` at any value of the GUC. |
| `src/lib/db/repositories/tenant.repository.ts:33` | `provisionTenant` (repository twin) | Same — `tx.tenant.create({ data: { …, users: { create: … } } })` at line 35. | `"Tenant"` has exactly two policies: `bypass_rls_policy` and `tenant_self_read` **FOR SELECT** `USING (id = current_tenant_id())`. There is **no INSERT policy**. Read from `pg_policy` on production and staging; both agree. |
| `src/lib/db/repositories/tenant.repository.ts:66` | `findTenantByUserId` | **Which tenant this user belongs to** — that is the question the function exists to answer. | `user.findUnique({ where: { id: userId }, include: { tenant: true } })`. `User.tenant_isolation_policy` is `"tenantId" = current_tenant_id()`; supplying the GUC requires the answer. |
| `src/lib/auth/supabase.ts:164` | `getCurrentUser` | **For a sysadmin session, the tenant.** Production has exactly **one** account with `isSystemAdmin = 'true'`, and it is the **only** one of 38 `auth.users` rows with no `tenantId` claim. | `User` is `relrowsecurity = true`, `relforcerowsecurity = true`, policies `bypass_rls_policy` + `tenant_isolation_policy`. **See §3.2 — for the other 37 accounts the tenant *is* known and this site does not need a bypass.** |
| `src/app/api/auth/accept-invitation/route.ts:44` | `GET` | **Everything.** No cookie, no Bearer token, no session. The invitation UUID in the URL is the only credential, and the tenant is a column on the row it identifies. | `driverInvitation.findUnique({ where: { id } })`. `DriverInvitation.tenant_isolation_policy` = `"tenantId" = current_tenant_id()`. Genuine chicken-and-egg: you must read the row to learn the tenant that would let you read the row. |
| `src/app/api/auth/accept-invitation/route.ts:121` | `POST` | Same. | Same lookup, same policy. |
| `src/app/api/track/[token]/route.ts:24` | `GET /api/track/[token]` | **Everything.** Public customer tracking. `Load.trackingToken` is the only credential and the tenant is a column on the row it finds. | `load.findUnique({ where: { trackingToken: token } })`. `Load.tenant_isolation_policy` = `"tenantId" = current_tenant_id()`. |

**Not BOOTSTRAP, though an earlier reading put them there** — each holds a verified tenant at the
moment of the query, so each is DECORATIVE:

| Site | The tenant it already holds |
|---|---|
| `api/auth/accept-invitation/route.ts:156, :240` | `invitation.tenantId`, read at :121 |
| `api/track/[token]/route.ts:49` | `load.tenantId`, read at :24 |
| `api/auth/login/route.ts:154` | `appMeta.tenantId` — the same value :74 and :113 already feed to `set_config('app.current_tenant_id', …, TRUE)` two transactions earlier in the same file |
| `(auth)/sign-up/actions.tsx:232` | `result.tenantId`, returned by `provisionTenant` |
| `lib/onboarding/hydrate-tenant.ts:13` | the function's own `tenantId` argument |
| `lib/driver-pay/require-driver.ts:106` | `session.tenantId` from the validated Bearer token |

---

### 1.2 CROSS_TENANT — 21 sites / 10 files

Genuinely spans tenants. Every one of these is *supposed* to see rows belonging to more than one
tenant, or to none.

#### All-tenant sweeps — 11 sites

| File:line | What spans tenants | Evidence |
|---|---|---|
| `api/cron/digest-compliance-30day/route.ts:42` | `tenant.findMany({ where: { isActive: true } })` — the tenant list that drives the whole sweep | `"Tenant"`'s only non-bypass policy is `tenant_self_read USING (id = current_tenant_id())`. In a cron the GUC is `''`; `current_tenant_id()` NULLIFs `''` to NULL → zero rows. |
| `api/cron/digest-daily-driver/route.ts:42` | identical | identical |
| `api/cron/digest-weekly-owner/route.ts:42` | identical | identical |
| `api/cron/send-reminders/route.ts:62` | identical | identical |
| `api/cron/workflow-digest/route.ts:50` | `playbookInstance.findMany({ distinct: ['tenantId'] })`, no tenant filter | `PlaybookInstance.tenant_isolation_policy` = `"tenantId" = current_tenant_id()` |
| `api/cron/workflow-notifications/route.ts:57` | `stepInstance.findMany` over all tenants for `dueDate < now-24h` | `StepInstance.tenant_isolation_policy` |
| ~~`api/cron/workflow-notifications/route.ts:81` | `stepInstance.update({ where: { id } })` on a row from that sweep | the row belongs to whichever tenant the sweep found~~ | **CORRECTED by quick-600 — not CROSS_TENANT.** `tenantId` is already in hand from the row the sweep read; routed to `getTenantPrismaForOrg`, not the admin connection. See `ROUTING-MANIFEST.md` §1 row 7. |
| ~~`api/cron/workflow-notifications/route.ts:96` | same, alert-sent branch | same~~ | **CORRECTED — same reasoning, row 8.** |
| `api/cron/workflow-notifications/route.ts:121` | `playbookInstance.findMany({ where: { status: 'BLOCKED' } })`, all tenants | `PlaybookInstance.tenant_isolation_policy` |
| `api/cron/auto-close-tickets/route.ts:53` | `supportTicket.updateMany({ where: { id: { in: ids } } })` where `ids` came from a raw all-tenant scan | `SupportTicket.tenant_isolation_policy` |
| ~~`lib/automations/evaluator.ts:203` | `automationRun.update` by id, over runs collected from an all-tenant `appEvent`/`automationRule` scan | `AutomationRun.tenant_isolation_policy`. This is the one whose failure is not "nothing happens": runs never leave `PENDING`, so the same automation re-fires every tick.~~ | **CORRECTED by quick-600 — not CROSS_TENANT.** `run.tenantId` is already in hand from the row `dueRuns` (the sweep) just read — same shape as the two rows above. Routed to `getTenantPrismaForOrg`. The "re-fires every tick" failure mode this row named is real and is exactly why quick-600 checked this site's shape before routing it, per the plan's explicit instruction. See `ROUTING-MANIFEST.md` §1 row 11. |

#### SysAdmin surfaces — 8 sites

| File:line | What spans tenants |
|---|---|
| `(admin)/actions/automations.ts:107` | `automationRun.create` on **another** tenant's rule |
| `(admin)/actions/automations.ts:141` | `automationRun.updateMany` → SENT, on that tenant |
| `(admin)/actions/automations.ts:151` | same, FAILED branch |
| `(admin)/actions/tenants.ts:586` | `extendTrial` — `subscription.update` + `appEvent.create` on an arbitrary tenant |
| `lib/db/repositories/tenant.repository.ts:87` | `listAllTenants` — `tenant.findMany()`, every row, by design |
| `actions/support-tickets.ts:341` | `updateTicketStatus` on any tenant's ticket, behind `requireAdminAccess()` |
| `actions/support-tickets.ts:475` | `addAdminReply` — includes a raw `SELECT email FROM "User" WHERE id = …`, which the Prisma injection layer never sees |
| `actions/support-tickets.ts:542` | `getTicketMessages` — `TicketMessage` has no tenant column; its policy is a subquery over `SupportTicket."tenantId"` |

#### A global sequence — 2 sites

| File:line | What spans tenants |
|---|---|
| `actions/support-tickets.ts:98` | `generateTicketNumber` — `supportTicket.findFirst({ orderBy: { ticketNumber: 'desc' } })` with **no `where` at all**. `SupportTicket_ticketNumber_key` is a global unique index (read from `pg_index`), so the sequence is genuinely shared across every tenant. |
| `api/mobile/support/ticket/route.ts:39` | a second, byte-identical copy of the same function. The two race against each other today. |

---

### 1.3 BROKEN_POLICY — 11 sites / 8 files

Each row quotes the policy and names the condition that cannot be met.

#### (a) `"Tenant"` has no UPDATE policy — 2 sites

Production and staging both hold exactly two policies on `"Tenant"`:

```sql
bypass_rls_policy  FOR ALL    USING (current_setting('app.bypass_rls', true) = 'on')
tenant_self_read   FOR SELECT USING (id = current_tenant_id())
```

There is no `FOR UPDATE`, no `FOR INSERT`, no `FOR DELETE`, and no `FOR ALL` other than the bypass.
With `relrowsecurity = true` and `relforcerowsecurity = true`, a non-`BYPASSRLS` role cannot update a
`Tenant` row **at any value of any GUC**. There is no condition to satisfy, because there is no
policy to satisfy it with.

| File:line | Statement | Note |
|---|---|---|
| `api/email-confirm/[token]/route.ts:54` | `tx.tenant.update({ where: { id: tenantId }, data: { emailConfirmedAt } })` at :67 | The *read* half is fine — `verifyEmailToken` returns a payload carrying `tenantId` (`generateEmailToken(tenant.id)` in `provision-tenant.ts`), so the GUC can be set and `tenant_self_read` admits the row. Only the write is unsatisfiable. |
| `lib/onboarding/hydrate-tenant.ts:36` | `tx.tenant.update({ provisioningPhase: HYDRATED })` at :41 | Same: the tenant is an argument. Only the write is unsatisfiable. Sample-data seeding would never be marked complete. |

**Seven more `Tenant` writers are not bypass sites and break identically.** They are outside the 211
and outside every prior count:

```
src/app/(admin)/actions/tenants.ts:98  190  229  432  542  625   (create / update x4 / delete)
src/app/(owner)/settings/operations/actions.ts:40                 (tenantPrisma.tenant.update)
```

`settings/operations/actions.ts:40` is the sharper one: it runs on a **tenant-scoped client with the
GUC correctly set**, and still fails, because `tenant_self_read` is `FOR SELECT`. That is the whole
`/settings/operations` page — both Document Import inspection settings, Phase 9's only UI.

#### (b) `audit_log` — the policy contradicts the function's stated contract, and raises on the default GUC — 1 site

```sql
audit_log.tenant_isolation_policy  FOR ALL
  USING ( tenant_id = (current_setting('app.current_tenant_id', true))::uuid )
  WITH CHECK  -- none declared; PostgreSQL derives it from USING
```

| File:line | Why it cannot be satisfied |
|---|---|
| `lib/security/audit-log.ts:68` | **Two independent reasons.** (i) The file's own contract is *"this call succeeds regardless of which tenant context the caller is operating under … the audit system must write even during RBAC-denied access attempts where the calling context may differ from the row being audited."* A derived `WITH CHECK` of `tenant_id = <the GUC>` forbids exactly that: the row being audited is, by the contract, allowed to belong to a different tenant than the connection. (ii) The expression is `(current_setting(…))::uuid` with **no `NULLIF`**, unlike `current_tenant_id()`. `prisma.ts:71` sets `app.current_tenant_id` to the **empty string** on every new physical connection, and `SELECT ''::uuid` raises **`22P02 invalid input syntax for type uuid: ""`** — verified against production. So on a GUC-less connection this is a hard error, not a filter, and `writeAuditLog` **rethrows**. PII-access and RBAC-denial auditing does not go quiet; it 500s the caller. |

`Tag.tenant_isolation_policy` and `TagAssignment.tenant_isolation_policy` inline the same GUC but
compare `("tenantId")::text = current_setting(…)` — text to text, no cast — so they filter silently
rather than raising. `audit_log` is the only one of the three that casts. That distinction is not in
`wrapper-migration-scope.md` §5, which groups all three as "rewrite to call the function".

#### (c) `SupportTicket` — no policy can admit a NULL-tenant row — 4 sites

```sql
SupportTicket.tenant_isolation_policy  FOR ALL
  USING ( "tenantId" = current_tenant_id() )
  WITH CHECK  -- none declared; derived from USING
```

`SupportTicket.tenantId` is `is_nullable = YES` — deliberately, per
`20260328000002_nullable_tenant_support_ticket`, so a sysadmin can file a ticket with no tenant.
**Production holds 7 such rows out of 87.** For every one of them the predicate is
`NULL = current_tenant_id()` → NULL → not true, at every GUC value including NULL, because
`NULL = NULL` is NULL. Those 7 rows are readable by no policy and writable by none.

| File:line | Statement |
|---|---|
| `actions/support-tickets.ts:169` | `supportTicket.create({ data: { tenantId: session.tenantId \|\| null, … } })` — the insert that produces such a row is rejected by the derived check |
| `actions/support-tickets.ts:217` | `getMyTickets` — `findMany({ where: { submittedBy: userId } })`, deliberately no tenant predicate, deliberately includes the caller's null-tenant tickets |
| `actions/support-tickets.ts:371` | `getTicketById` — `where: { id, tenantId: session.tenantId ?? undefined, submittedBy }`; must reach null-tenant tickets, and also reads `TicketMessage`, whose policy is a subquery over `SupportTicket."tenantId"` and therefore excludes them transitively |
| `actions/support-tickets.ts:410` | `addOwnerReply` — same lookup, then `ticketMessage.create`, which fails the same subquery |

#### (d) `stops` — production has no policy at all, not even the bypass — 4 sites

Read from `pg_class` / `pg_policy` on production:

| table | `relrowsecurity` | `relforcerowsecurity` | policies |
|---|---|---|---|
| `stops` | true | true | **0** |
| `carrier_documents` | true | true | **0** |
| `route_template_stops` | true | true | **0** |

Zero policies means zero — including `bypass_rls_policy`. **The bypass line at these four sites is
already a no-op on production**, and the table is unreachable by any role without `BYPASSRLS`,
whatever it sets. `CarrierStop` is also in `EXEMPT_MODELS`, so the application `where`-injection layer
does not scope it either: nothing filters it and nothing permits it.

| File:line | Statement on `stops` |
|---|---|
| `(driver)/actions/driver-dashboard.ts:86` | `tx.carrierStop.count(...)` — wrapped in an outer `catch {}` that returns defaults, so it fails silently |
| `(driver)/actions/driver-routes.ts:202` | `startTrip(dispatchId)` reads stops for the dispatch |
| `api/driver/stops/[stopId]/messages/route.ts:105` | the stop lookup behind the driver message thread |
| `api/v1/carrier/stops/[id]/messages/route.ts:89` | the same lookup on the owner surface |

**Staging already has the remedy.** Step 1 (`c360b35f`) added `tenant_isolation_policy` to all three,
plus `route_matrix_cache`:

```sql
stops:                USING (EXISTS (SELECT 1 FROM dispatches d
                                      WHERE d.id = stops.dispatch_id
                                        AND d.org_id = current_tenant_id()))
carrier_documents:    USING (EXISTS (SELECT 1 FROM "User" u
                                      WHERE u.id = carrier_documents.uploaded_by
                                        AND u."tenantId" = current_tenant_id()))
route_template_stops: USING (EXISTS (SELECT 1 FROM route_templates rt
                                      WHERE rt.id = route_template_stops.route_template_id
                                        AND rt.org_id = current_tenant_id()))
```

These four sites are BROKEN_POLICY **against production** and DECORATIVE **against staging**. The
work is not to design a policy; it is to ship the one that already exists.

---

### 1.4 DECORATIVE — 172 sites / 88 files (171 live, 1 already removed)

Every site here is confined to one already-known tenant by application code. The bypass is not what
isolates it — the `where` clause is. What is missing is that the tenant never reaches the database
session, which is precisely what `withTenantContext` fixes.

**Thirteen of the 171 already work and keep working**, because a `getTenantPrisma()` earlier in the
same request left the GUC set on the `max: 1` pool: `api/v1/carrier/stops/[id]/messages` x3,
`api/driver/stops/[stopId]/messages` x4, `(owner)/carrier/stops/[id]/page.tsx` x3,
`(owner)/carrier/trips/[id]/page.tsx` x1, `(owner)/carrier/trips/[id]/stops/page.tsx` x1,
`(driver)/actions/driver-dashboard.ts:74`. The earlier audit counted 15; two of those
(`driver/stops/…:105`, `v1/carrier/stops/…:89`) moved to BROKEN_POLICY above because they touch
`stops`.

#### D1 — `/api/mobile/owner/*` — 61 sites / 30 files

`validateMobileToken(req)` yields `auth.tenantId` from the JWT `app_metadata`; every `where`/`data`
carries it explicitly; neither `validateMobileToken` nor `withMobileAuth` calls `set_config`, and
`middleware.ts:100-102` skips `/api/mobile/*` entirely. The tenant discipline is complete in the
application and absent in the session.

| File | Sites | Lines |
|---|---|---|
| `src/app/api/mobile/owner/compliance/route.ts` | 1 | 45 |
| `src/app/api/mobile/owner/crm/[id]/route.ts` | 2 | 41, 194 |
| `src/app/api/mobile/owner/crm/route.ts` | 1 | 42 |
| `src/app/api/mobile/owner/customers/route.ts` | 2 | 41, 96 |
| `src/app/api/mobile/owner/dashboard/route.ts` | 1 | 30 |
| `src/app/api/mobile/owner/drivers/[id]/route.ts` | 2 | 83, 291 |
| `src/app/api/mobile/owner/drivers/active/route.ts` | 1 | 41 |
| `src/app/api/mobile/owner/drivers/invite/route.ts` | 4 | 68, 81, 106, 126 |
| `src/app/api/mobile/owner/drivers/route.ts` | 1 | 62 |
| `src/app/api/mobile/owner/fleet-positions/route.ts` | 1 | 40 |
| `src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts` | 7 | 50, 126, 143, 153, 164, 243, 286 |
| `src/app/api/mobile/owner/fleet/messages/route.ts` | 6 | 44, 93, 115, 129, 278, 303 |
| `src/app/api/mobile/owner/fuel/route.ts` | 2 | 37, 153 |
| `src/app/api/mobile/owner/invoices/[id]/route.ts` | 1 | 34 |
| `src/app/api/mobile/owner/invoices/route.ts` | 2 | 39, 160 |
| `src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts` | 1 | 55 |
| `src/app/api/mobile/owner/loads/[id]/route.ts` | 4 | 53, 177, 206, 243 |
| `src/app/api/mobile/owner/loads/route.ts` | 2 | 65, 185 |
| `src/app/api/mobile/owner/maintenance/route.ts` | 1 | 81 |
| `src/app/api/mobile/owner/map/vehicles/route.ts` | 1 | 44 |
| `src/app/api/mobile/owner/payroll/[id]/route.ts` | 1 | 41 |
| `src/app/api/mobile/owner/payroll/route.ts` | 2 | 38, 175 |
| `src/app/api/mobile/owner/profit-predictor/route.ts` | 1 | 66 |
| `src/app/api/mobile/owner/routes/[id]/route.ts` | 2 | 44, 140 |
| `src/app/api/mobile/owner/routes/route.ts` | 2 | 61, 208 |
| `src/app/api/mobile/owner/safety/route.ts` | 1 | 49 |
| `src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts` | 2 | 39, 157 |
| `src/app/api/mobile/owner/trucks/[id]/route.ts` | 2 | 40, 202 |
| `src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts` | 3 | 84, 206, 319 |
| `src/app/api/mobile/owner/trucks/route.ts` | 2 | 76, 143 |

Two are raw SQL (`fleet-positions:40`, `map/vehicles:44`) and their hand-written
`WHERE gps."tenantId" = $1` is the only isolation there — the injection layer never sees a
`$queryRaw`. `loads/[id]/route.ts:206` (`invoice.count({ where: { loadId } })`) and
`payroll/route.ts:175` (writes `driverId` from the request body unchecked) carry application-layer
gaps that the GUC would close as a side effect; both are worth fixing on their own account.

#### D2 — `/api/mobile/driver/*` and `/api/mobile/support/*` — 22 sites / 17 files

Same shape. `/api/mobile/carrier/*` was already converted to
`getTenantPrismaForOrg(auth.tenantId, auth.userId)` by quick-588 — these were left behind, and that
conversion is the in-repo precedent for the whole group.

| File | Sites | Lines |
|---|---|---|
| `src/app/api/mobile/driver/dashboard/route.ts` | 1 | 30 |
| `src/app/api/mobile/driver/documents/[id]/url/route.ts` | 1 | 48 |
| `src/app/api/mobile/driver/documents/route.ts` | 2 | 55, 201 |
| `src/app/api/mobile/driver/hos/route.ts` | 2 | 29, 174 |
| `src/app/api/mobile/driver/incidents/route.ts` | 2 | 38, 134 |
| `src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts` | 1 | 53 |
| `src/app/api/mobile/driver/loads/[id]/revert/route.ts` | 1 | 59 |
| `src/app/api/mobile/driver/loads/[id]/route.ts` | 1 | 48 |
| `src/app/api/mobile/driver/loads/[id]/status/route.ts` | 1 | 98 |
| `src/app/api/mobile/driver/loads/route.ts` | 1 | 55 |
| `src/app/api/mobile/driver/messages/route-thread/route.ts` | 2 | 45, 114 |
| `src/app/api/mobile/driver/messages/route.ts` | 2 | 31, 109 |
| `src/app/api/mobile/driver/messages/unread-count/route.ts` | 1 | 49 |
| `src/app/api/mobile/driver/route/route.ts` | 1 | 40 |
| `src/app/api/mobile/driver/tasks/route.ts` | 1 | 26 |
| `src/app/api/mobile/driver/tracking-token/route.ts` | 1 | 43 |
| `src/app/api/mobile/support/ticket/route.ts` | 1 | 97 |

`messages/route.ts:109` omits `tenantId` from a `load.findFirst` that every sibling query in the same
file includes — a latent cross-tenant read today that the GUC closes. `support/ticket:97` writes
`auth.tenantId` with no null check (`mobile-auth.ts:69`), and :123 uses `auth.tenantId ?? ''`; a JWT
missing the claim writes a null-tenant row that falls into the §1.3(c) hole.

#### D3 — session / Bearer API routes — 25 sites / 13 files

| File | Sites | Lines |
|---|---|---|
| `src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts` | 2 | 60, 108 |
| `src/app/api/driver/gps-ping/route.ts` | 1 | 69 |
| `src/app/api/driver/stops/[stopId]/messages/route.ts` | 4 | 66, 92, 209, 219 |
| `src/app/api/gps/report/route.ts` | 2 | 88, 120 |
| `src/app/api/integrations/motive/sync/route.ts` | 1 | 54 |
| `src/app/api/integrations/samsara/sync/route.ts` | 1 | 54 |
| `src/app/api/push-tokens/route.ts` | 1 | 54 |
| `src/app/api/v1/carrier/stops/[id]/messages/route.ts` | 3 | 49, 76, 201 |
| `src/app/api/v1/messages/[id]/audio-url/route.ts` | 1 | 36 |
| `src/app/api/v1/messages/broadcast/route.ts` | 1 | 54 |
| `src/app/api/v1/messages/conversations/route.ts` | 3 | 38, 74, 94 |
| `src/app/api/v1/messages/send/route.ts` | 2 | 64, 76 |
| `src/app/api/v1/messages/thread/route.ts` | 3 | 79, 105, 118 |

`driver/gps-ping/route.ts:69` is the trap worth naming: `getTenantPrisma()` exists in that file at
**line 93 — after** this transaction, and the block is wrapped in `try {} catch {}` that returns
`carrierTruckId = null` while the route still responds `{ saved: true }`.

#### D4 — server components and server actions — 12 sites / 8 files

| File | Sites | Lines |
|---|---|---|
| `src/actions/doc-feedback.ts` | 1 | 32 |
| `src/app/(driver)/actions/driver-dashboard.ts` | 1 | 74 |
| `src/app/(driver)/tasks/[id]/page.tsx` | 2 | 95, 207 |
| `src/app/(driver)/tasks/page.tsx` | 1 | 148 |
| `src/app/(owner)/carrier/dashboard/page.tsx` | 2 | 24, 30 |
| `src/app/(owner)/carrier/stops/[id]/page.tsx` | 3 | 91, 110, 153 |
| `src/app/(owner)/carrier/trips/[id]/page.tsx` | 1 | 137 |
| `src/app/(owner)/carrier/trips/[id]/stops/page.tsx` | 1 | 118 |

`doc-feedback.ts:32` is the easiest site in the codebase to misread as safe: `requireTenantId()` is
called at :20 and **does not set the GUC** — only `getTenantPrisma()` does.
`tasks/[id]/page.tsx:95` renders another tenant's creator name and email in the audit footer today,
for any driver who types a foreign `StepInstance` id into the URL; the GUC closes it.

#### D5 — cron work inside the per-tenant loop — 6 sites / 3 files

| File | Sites | Lines |
|---|---|---|
| `src/app/api/cron/automations/route.ts` | 1 | 179 |
| `src/app/api/cron/workflow-digest/route.ts` | 4 | 73, 93, 164, 173 |
| `src/lib/automations/evaluator.ts` | 1 | 95 |

The loop variable *is* the tenant. These want `getTenantPrismaForOrg(tenant.id)` per iteration, not
an admin connection. Note `workflow-digest:173` writes the dedup `playbookNotification` row: fix the
reads and not this, and the digest re-sends daily.

#### D6 — pre-auth or onboarding, but tenant-confined — 11 sites / 7 files

| File | Sites | Lines |
|---|---|---|
| `src/app/(auth)/sign-up/actions.tsx` | 1 | 232 |
| `src/app/api/auth/accept-invitation/route.ts` | 2 | 156, 240 |
| `src/app/api/auth/login/route.ts` | 1 | 154 |
| `src/app/api/track/[token]/route.ts` | 1 | 49 |
| `src/app/onboarding/welcome/page.tsx` | 3 | 27, 50, 70 |
| `src/lib/onboarding/activation-tracker.ts` | 2 | 69, 198 |
| `src/lib/onboarding/hydrate-tenant.ts` | 1 | 13 |

#### D7 — helpers and services — 34 sites / 9 files

| File | Sites | Lines |
|---|---|---|
| `src/lib/driver-pay/require-driver.ts` | 1 | 106 |
| `src/lib/email/send-geofence-alert.ts` | 1 | 52 |
| `src/lib/geofencing/geofence-check.ts` | 8 | 46, 81, 97, 138, 153, 184, 214, 230 |
| `src/lib/notifications/audit-log.ts` | 1 | 48 |
| `src/lib/notifications/send-push.ts` | 4 | 44, 85, 128, 175 |
| `src/server/api/routers/workflows/analytics.ts` | 7 | 26, 34, 42, 71, 110, 126, 142 |
| `src/server/api/routers/workflows/instance.ts` | 1 | 105 |
| `src/server/services/workflows/generatePlaybookInstance.ts` | 1 | 65 |
| `src/server/services/workflows/notifications.ts` | 10 | 49, 62, 80, 95, 106, 127, 149, 251, 329, 570 |

These are the ones that cannot be fixed by editing a route, because **one import site decides the
behaviour for every caller**. `send-push.ts` and `workflows/notifications.ts` are each reached from
both a tenant-scoped request and a cron sweep; `require-driver.ts` branches on `isMobile` and only the
Bearer branch takes the bypass. Each needs an explicit tenant argument threaded through its callers,
or a deliberate split into two entry points. `require-driver.ts` is the cheapest: the cookie branch
already uses `getTenantPrisma()`, so converting the mobile branch to
`getTenantPrismaForOrg(session.tenantId, session.userId)` lands both on the same guarantee.

`geofence-check.ts`'s eight sites have exactly **one** caller — `/api/gps/report:137` — so they
inherit that route's GUC state and move with it as a unit.

#### D8 — already removed — 1 site

`src/lib/email/sender-config.ts:135`, removed in `a7d52a8c`. quick-596 verified the bypass was a
no-op against **staging**: `NotificationEmailConfig` has `relrowsecurity = false`, zero policies,
`GRANT SELECT` to `app_user`. **On production the table has `relrowsecurity = false`, zero policies,
and no `app_user` grant at all** — so the removal is still correct with respect to the bypass, but
the query becomes `42501 permission denied` under `app_user` until step 1 is applied to production.
`resolveSenderConfig` catches and falls back to the env sender identity, so the symptom would be a
wrong `From`/`Reply-To` on production mail, not an error. Listed in §5 as a pre-cutover item.

---

## 2. RLS state of every table a bypass site reads

46 distinct tables, extracted from the bypass scopes themselves. Read from production `pg_class`,
`pg_policy` and `information_schema.role_table_grants`.

### 2.1 The 40 ordinary tables

`relrowsecurity = true`, `relforcerowsecurity = true`, 2 policies (`bypass_rls_policy` +
`tenant_isolation_policy` FOR ALL), full `SELECT/INSERT/UPDATE/DELETE` to `app_user`, and the
isolation policy keyed on `current_tenant_id()` — **which `getTenantPrisma`, `getTenantPrismaForOrg`
and the planned `withTenantContext` all set. Satisfiable.**

`ActivationProgress` · `AppEvent` · `AutomationRun` · `carrier_drivers` · `carrier_trucks` ·
`clients` · `contracts` · `Customer` · `dispatches` · `DocFeedback` · `Document` · `driver_disputes` ·
`driver_pay_audit_logs` · `DriverHOSEntry` · `DriverIncident` · `DriverInvitation` · `facilities` ·
`FleetMessage` · `FuelRecord` · `GPSLocation` · `Invoice` · `Load` · `loads` · `MaintenanceEvent` ·
`NotificationSendLog` · `PayrollRecord` · `Playbook` · `PlaybookInstance` · `PlaybookNotification` ·
`Route` · `RouteStop` · `ScheduledService` · `StepInstance` · `StepTemplate` · `Subscription` ·
`TenantIntegration` · `Truck` · `User` · `TicketMessage`¹ · `SupportTicket`²

¹ `TicketMessage` has no tenant column; its policy is
`"ticketId" IN (SELECT id FROM "SupportTicket" WHERE "tenantId" = current_tenant_id())`. Satisfiable
for any ticket with a tenant; unsatisfiable for the 7 null-tenant tickets, transitively.
² `SupportTicket` is satisfiable for 80 of its 87 production rows — see §2.4.

`"Tenant"` is the 41st table in this group for **reads only**: `tenant_self_read FOR SELECT
USING (id = current_tenant_id())` is satisfiable. Its writes are §1.3(a).

### 2.2 The two tables with a dead policy beside a live one

| Table | Policies | Verdict |
|---|---|---|
| `PushToken` | `bypass_rls_policy` · `tenant_isolation_policy` FOR ALL `USING/CHECK ("tenantId" = current_tenant_id())` · `user_isolation_policy` FOR ALL `USING (("userId")::text = current_setting('app.current_user_id', true))` | **`user_isolation_policy` is UNSATISFIABLE.** Nothing in the repository sets `app.current_user_id`; the sole occurrence of the string is a comment at `lib/auth/mobile-auth.ts:21` recording that it is *not* set. **But `tenant_isolation_policy` is satisfiable**: `PushToken.tenantId` is `is_nullable = NO`, with 0 null rows. The table is not broken — the *queries* are (`where: { userId }`, no tenant predicate, no GUC). |
| `UserNotificationPreference` | `bypass_rls_policy` · `tenant_isolation_policy` (satisfiable) · `user_isolation_policy` FOR ALL `USING/CHECK ("userId" = auth.uid())` | **`user_isolation_policy` is UNSATISFIABLE on the Prisma path.** `auth.uid()` is `coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), current_setting('request.jwt.claims', true)::jsonb ->> 'sub')::uuid` — read from `pg_proc`. PostgREST sets those GUCs; a `pg` connection never does, so it returns NULL and `"userId" = NULL` is never true. No bypass site touches this table; listed because §2 asked for every unsatisfiable policy. |

**Neither is load-bearing**, because in both cases a satisfiable tenant policy sits beside it and
policies are permissive (OR'd). Both are dead weight that should be dropped or rebuilt when
`app.current_user_id` actually exists — which `.planning/phase-0-revised.md` §10 already schedules as
"role-within-tenant and driver self-scoping at the DB layer".

### 2.3 The three tables with no policy at all on production

| Table | `relrowsecurity` | `relforcerowsecurity` | policies | `app_user` grant | Bypass sites |
|---|---|---|---|---|---|
| `stops` | true | true | **0** | full DML | **4** |
| `carrier_documents` | true | true | **0** | full DML | 0 |
| `route_template_stops` | true | true | **0** | full DML | 0 |

Zero policies, including no `bypass_rls_policy`. Unreachable by any role without `BYPASSRLS`.
Staging already carries a satisfiable `tenant_isolation_policy` on each (quoted in §1.3(d)).
`route_matrix_cache` is a fourth in the same position on production — `relrowsecurity = false`, zero
policies, **no `app_user` grant** — and CLAUDE.md's note that it "returns zero rows and silently stops
caching" when the role flips is wrong in the direction that matters: with no grant it raises
`42501 permission denied`, which the matrix cache read path does not catch.

### 2.4 Tables where the policy is satisfiable but some rows are not

| Table | Rows | Rows no policy can admit | Cause |
|---|---|---|---|
| `SupportTicket` | 87 | **7** | `tenantId` is nullable by design; `NULL = current_tenant_id()` is NULL at every GUC value |
| `TicketMessage` | — | messages on those 7 | its policy's subquery excludes them transitively |

### 2.5 Tables where the blocker is a missing GRANT, not a policy

Seven tables carry **no `app_user` privilege at all on production** while staging has `GRANT SELECT`
or full DML. Step 1 (`c360b35f`) was applied to staging only.

| Table | Production `app_user` | Staging `app_user` | RLS | Reached from a bypass site |
|---|---|---|---|---|
| `Plan` | **none** | SELECT | off | yes — `provision-tenant.ts:36` (`tx.plan.findFirst`) |
| `Promo` | **none** | SELECT | off | yes — `provision-tenant.ts:36` (`findFirst` + raw `UPDATE "Promo"`) |
| `NotificationEmailConfig` | **none** | SELECT | off | formerly — `sender-config.ts:135`, removed |
| `NotificationTemplate` | **none** | SELECT | off | no |
| `carrier_catalog_meta` | **none** | SELECT | off | no |
| `grid_view` | **none** | full DML | off | no |
| `route_matrix_cache` | **none** | full DML | off (prod) / on (staging) | no |
| `_prisma_migrations` | **none** | **none** | on, 0 policies, not forced | no — but `scripts/migrate.mjs` reads it |

`Promo` needs `UPDATE` as well as `SELECT`: `provision-tenant.ts:97` issues a raw
`UPDATE "Promo" SET "redemptionCount" = …`. Staging grants `SELECT` only, so **sign-up with a promo
code fails on staging under `app_user` even after step 1**. That is a live gap in the staging
verification target, not just in production.

### 2.6 Two policies that are satisfiable and should not be

Not bypass dependencies; found while enumerating, and both are isolation defects in the direction
that matters.

| Policy | Expression | Problem |
|---|---|---|
| `in_app_notifications_insert_policy` FOR INSERT | `WITH CHECK (true)` | Any grantee may insert a row naming **any** `org_id`. The sibling `in_app_notifications_select_policy` and `_update_policy` key on `auth.jwt() ->> 'org_id'` and are **UNSATISFIABLE** on the Prisma path for the same reason as `auth.uid()` — so the table has an open door in and a dead lock on the way out. `tenant_isolation_policy` covers reads correctly. |
| `SysAdminInvoice.sysadmin_invoices_deny_tenant_users` and `SysAdminInvoiceItem…` FOR ALL | `USING (current_setting('app.current_tenant_id', true) IS NULL OR … = '')` | Named "deny" but **permissive**, so it is OR'd with the tenant policy and *grants*. `prisma.ts:71` sets the GUC to `''` on every new physical connection, so **every GUC-less connection passes it and sees every tenant's sysadmin invoices.** Under transaction-scoped `withTenantContext` a tenant request sets the GUC and is correctly excluded; a cron or mobile request that never sets it is not. `wrapper-migration-scope.md` §5 says "leave them inline", which is right about the *rewrite* and should not be read as "leave them alone". |

---

## 3. Replacement per category

### 3.1 BROKEN_POLICY — what the policy should key on, and whether the application can supply it

| # | Gap | Proposed key | Can the application supply it? |
|---|---|---|---|
| 1 | `"Tenant"` has no INSERT policy | `CREATE POLICY tenant_bootstrap_insert ON "Tenant" FOR INSERT WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL)` — *only a connection with no tenant context may create a tenant* | **Yes, and it is self-enforcing.** Under transaction-scoped `withTenantContext` every tenant-scoped unit of work sets the GUC and is therefore **denied**; only a bootstrap transaction, which by definition has not set it, is allowed. It is the same shape the database already uses for `sysadmin_invoices_deny_tenant_users`, used in the direction that actually restricts. Trade-off: it does not authenticate *who* is creating the tenant — that stays an application concern (`provisionTenant` is reached only from the sign-up action and the sysadmin surface). It is a strictly smaller grant than "anyone may insert". |
| 2 | `"Tenant"` has no UPDATE policy | `CREATE POLICY tenant_self_update ON "Tenant" FOR UPDATE USING (id = current_tenant_id()) WITH CHECK (id = current_tenant_id())` — the exact twin of the existing `tenant_self_read` | **Yes, for 3 of the 4 callers.** `hydrate-tenant.ts:36` and `settings/operations/actions.ts:40` both hold the tenant. `email-confirm:54` holds it in the signed token payload. The fourth — `(admin)/actions/tenants.ts` x4 — is a sysadmin acting on another tenant and goes on the admin connection (§3.3). **Trade-off, stated:** this lets any authenticated tenant update any column of its own `Tenant` row that the application chooses to expose, including `status` and `provisioningPhase`. Column-level control is a `GRANT UPDATE (col, …)` question, not a policy question, and is worth doing separately — it is not a reason to keep the bypass. |
| 3 | `"Tenant"` has no DELETE policy | **Do not add one.** | Tenant deletion is `(admin)/actions/tenants.ts:625` only. Admin connection. A tenant must not be able to delete itself. |
| 4 | `audit_log.tenant_isolation_policy` contradicts the writer's contract and raises `22P02` on the pool's `''` default | Split the command. Keep `FOR SELECT USING (tenant_id = current_tenant_id())` — the cast replaced by `current_tenant_id()`, which `NULLIF`s. Add `FOR INSERT WITH CHECK (true)`. | **Yes.** The write must be admitted regardless of context *by design*; the read must not. ~~`audit_log` already carries `REVOKE UPDATE, DELETE`~~ **CORRECTED 2026-09-14 (quick-599) — this was MEASURED FALSE.** `app_user` held UPDATE and DELETE grants on staging, and both succeeded when probed directly (`evidence/before.md`, `audit_log.update-own@guc-A` = 1 row, `audit_log.delete-own@guc-A` = 1 row). This item's argument for `WITH CHECK (true)` assumed the revoke was already real; the revoke itself SHIPS in `20260914120000_tenant_audit_automation_policy_closure` alongside the SELECT/INSERT split proposed here — the design was sound, its premise was not. So an append-only table whose insert is unconditional and whose read is tenant-scoped is exactly the audit property wanted, once both the split AND the revoke are applied together. Trade-off: a compromised `app_user` could forge an audit row naming another tenant. That is already true today via the bypass, and the alternative — routing audit writes onto the admin connection — gives the same power with more plumbing. **The `::uuid` cast must go in the same migration as anything that touches `audit_log`**, because it is a hard error, not a filter, and the function rethrows. |
| 5 | `SupportTicket` cannot admit its 7 null-tenant rows | Two options, and the second is better. **(i)** widen the policy to `("tenantId" = current_tenant_id() OR ("tenantId" IS NULL AND "submittedBy" = current_setting('app.current_user_id', TRUE)::uuid))` — which needs a GUC that does not exist yet. **(ii)** give sysadmin tickets a real home: either a sentinel tenant row, or route all null-tenant ticket traffic onto the admin connection and leave the policy alone. | **(i) No, not today** — `app.current_user_id` is the very GUC §2.2 shows nothing sets, and inventing it here pre-empts the scoped work in §10 of the plan. **(ii) Yes** — `support-tickets.ts:217/371/410` already branch on session shape. Recommend (ii) now, (i) when `app.current_user_id` lands. |
| 6 | `stops`, `carrier_documents`, `route_template_stops` have no policy on production | **Nothing new to design.** Ship staging's step-1 policies to production. | **Yes** — all three key on `current_tenant_id()` through a join, and staging has been running them since `c360b35f`. |

**No new GUC is invented by any of this.** Every proposed policy keys on `app.current_tenant_id`,
which the application already sets in three places and will set in one after the wrapper migration.

### 3.2 BOOTSTRAP — admin connection, self-read policy, or something else

**Three of the seven do not need an admin connection at all, and a fourth needs it only for the
single sysadmin account.** The correction matters because it shrinks the privileged surface from
"every bootstrap read" to four statements:

| Replacement | Sites |
|---|---|
| Admin connection (or a `SECURITY DEFINER` function) | `tenant.repository.ts:66` · `accept-invitation:44` · `accept-invitation:121` · `track/[token]:24` |
| New INSERT policy + a GUC set mid-transaction, with two probe reads hoisted onto the admin path | `provision-tenant.ts:36` · `tenant.repository.ts:33` |
| The GUC from the JWT claim, admin only on the `isSystemAdmin` branch | `supabase.ts:164` |

| Site | Replacement | Why it works |
|---|---|---|
| `lib/auth/supabase.ts:164` `getCurrentUser` | **Set the GUC from the session claim.** `const session = await getSession()` already returns `tenantId`, read from the JWT `app_metadata` with **no database call**. Wrap the `findUnique` in one transaction that first runs `set_config('app.current_tenant_id', session.tenantId, TRUE)`. | This is not a new pattern: `api/auth/login/route.ts:74` and `:113` already do exactly this, with a comment naming `app_user`, and have since quick-423/424. Production has 38 `auth.users`; 37 carry a `tenantId` claim. **The one exception is the single `isSystemAdmin` account** — fall back to the admin connection on `session.isSystemAdmin === true`, which is a branch the function can take on a value it already has. |
| `lib/onboarding/provision-tenant.ts:36` | **Policy + a GUC set mid-transaction, plus two admin reads hoisted out.** See §4.1 — the full statement-by-statement answer. | |
| `lib/db/repositories/tenant.repository.ts:33` | Same as above; this is the repository twin of the same flow. | |
| `lib/db/repositories/tenant.repository.ts:66` `findTenantByUserId` | **Admin connection**, or a `SECURITY DEFINER` function `tenant_id_for_user(uuid) RETURNS uuid`. | The question is definitionally unanswerable under tenant scope. The `SECURITY DEFINER` variant leaks one uuid rather than a whole row and is preferable if the admin surface is to be kept minimal. |
| `api/auth/accept-invitation/route.ts:44, :121` | **Admin connection**, narrowed to one statement each. | The invitation UUID is the credential and the tenant is a column on the row it names. There is no way to state the tenant before reading it. A `SECURITY DEFINER` function `invitation_for_id(uuid)` is viable and narrower, but two sites do not justify a second mechanism when an admin connection is needed anyway. |
| `api/track/[token]/route.ts:24` | **Admin connection**, one statement. | Same shape. This is the clearest genuine cross-tenant read in the codebase. Its sibling at `:49` needs nothing — `load.tenantId` is in hand by then. |

#### The admin connection: what creates it, what it needs, how a reviewer sees it

There is no privileged connection today. `apps/web/src/lib/db/prisma.ts` is 92 lines and exports one
client from one connection string (`process.env.DATABASE_URL`, line 45). Introducing one means:

- **A second pool and client in `prisma.ts`**, built from a new `ADMIN_DATABASE_URL`, exported as
  `adminPrisma`. The existing `pool.on('connect')` tenant-GUC initialiser must **not** be copied onto
  it — a bypassing connection has no use for a tenant GUC, and copying it would make the two pools
  look interchangeable.
- **Env var:** `ADMIN_DATABASE_URL`, pointing at a role with `rolbypassrls = true`, on **port 5432
  session mode** (the same route migrations use), in Vercel Production and Preview and in
  `apps/web/.env.local`. There is no env-validation module in the repo, so a missing value surfaces
  as a `pg` connect error inside whichever request hits it first — which is why the boot guard below
  is not optional.
- **Boot-time guard, both directions, in `prisma.ts`:** assert `DATABASE_URL` resolves to a role with
  `rolbypassrls = false` **and** `ADMIN_DATABASE_URL` to one with `rolbypassrls = true`. Half a guard
  gives a "privileged" client that silently is not, and a "restricted" client that silently is.
  Flag-gate the assertion so a rollback to `postgres` is not blocked by a hard throw — that reversal
  is already recorded in `.planning/phase-0-revised.md` §5.
- **Capacity:** both pools are `max: 1`, so this doubles the Supabase pooler slot draw per warm
  lambda. Production's pool is 30 with `max_connections` 60. That is a capacity decision to take
  explicitly, not a side effect to discover.

**How a reviewer tells an admin call from a tenant call at a glance.** Not by the import name — a
`import { adminPrisma as prisma }` alias defeats that in one line, and §1 found fifteen mixed files
where both would coexist. Three mechanisms, and the third is the one that holds:

1. The client is named `adminPrisma` and is **never aliased** — a CI grep for
   `adminPrisma\s+as\s+` fails the build.
2. Every use sits inside a wrapper, `withAdminContext(reason, fn)`, whose first argument is a
   required string constant from a closed union (`'bootstrap:invitation'`, `'bootstrap:signup'`,
   `'cron:tenant-list'`, `'sysadmin:ticket'`, …). A new reason is a type change, so adding an admin
   call is a reviewable diff rather than an import.
3. A CI check enumerates `withAdminContext(` call sites and fails when the count changes without the
   allowlist changing — the same countdown shape `wrapper-migration-scope.md` §5 proposes for
   `getTenantPrisma` outside `withTenantContext`. **A count that can only go up by an explicit edit
   is the guarantee; a naming convention is not.**

The wrapper also gives the audit surface the bypass never had: one place to log every privileged
statement with its reason, which is what `pgaudit` would give if it were installed
(`.planning/phase-0-revised.md` §10).

### 3.3 CROSS_TENANT — the same admin path, or something narrower

**19 of 21 go on the admin connection.** They are irreducibly multi-tenant and no policy keyed on a
single tenant can express them.

| Group | Sites | Reason |
|---|---|---|
| All-tenant cron sweeps | 11 | The *list* is the cross-tenant part. **The work inside the loop is not** — those 6 sites are DECORATIVE (§1.4 D5) and want `getTenantPrismaForOrg(tenant.id)` per iteration. Splitting the sweep from the loop is what keeps the privileged surface at eleven statements instead of seventeen. |
| SysAdmin surfaces | 8 | Acting on another tenant by definition. Add the 6 non-bypass `Tenant` writers in `(admin)/actions/tenants.ts` to the same path — they break at cutover and are in no prior count. |

**2 of 21 want something narrower, and an admin connection would be the wrong fix.**
`generateTicketNumber` (`support-tickets.ts:98` and its duplicate at
`api/mobile/support/ticket/route.ts:39`) reads the global maximum `ticketNumber` so the next insert
can be `TKT-NNNN`. The two copies race against each other **today**, with the bypass in place —
`SupportTicket_ticketNumber_key` is a global unique index, so a collision is an exception at insert,
not a silent overwrite. A privileged connection papers over a data-model problem. The correct fix is a
`CREATE SEQUENCE support_ticket_number` with `GRANT USAGE` to `app_user`: it removes both the
cross-tenant read and the race in one change, and it needs no policy at all. That is DDL and belongs
with the §3.1 migration.

### 3.4 DECORATIVE — is removal safe, per site?

**Yes, for every one of the 172, and the condition is uniform and checkable rather than per-site
judgement.** A DECORATIVE site is safe to strip exactly when, at that statement, the connection's
`app.current_tenant_id` equals the tenant the application `where` clause already names. The
`withTenantContext` migration establishes that as an invariant of the enclosing unit of work, so the
per-site question collapses into one migration-order question:

> **Delete the `set_config('app.bypass_rls', …)` line in the same commit that wraps its unit of work
> in `withTenantContext`, never before and never after.**

Deleting earlier removes the only thing making the query work. Deleting later leaves a live bypass
inside a tenant-scoped transaction — the precise failure quick-596 refused to build, because
`TRUE`-scoped `set_config` inside the caller's transaction disables isolation for the **rest of that
unit of work**, silently and fail-open.

Three sub-groups need an edit beyond the wrap, and they are named rather than left to discovery:

| Sub-group | Sites | Extra edit |
|---|---|---|
| Helpers reached from both a tenant request and a cron sweep (`send-push.ts`, `workflows/notifications.ts`, `notifications/audit-log.ts`, `require-driver.ts`) | 16 | Thread an explicit `tenantId` argument, or split into two entry points. One import site decides the behaviour for every caller, so these **cannot** be fixed per-route. `sendPushToUser` is the largest resolver in the whole migration at 20 call-chain units (quick-596 §5). |
| Unscoped `findUnique({ where: { id } })` inside an otherwise-scoped path | 11 | Add the missing tenant predicate. The GUC would close these anyway, but the application should state a predicate it can state. `tasks/[id]/page.tsx:95` and `mobile/driver/messages:109` are live cross-tenant reads today. |
| Raw SQL | 5 | `$queryRaw` never enters the injection layer, so the hand-written `WHERE` is the only application-side isolation. Under the GUC, RLS becomes the second layer these have never had. No edit required, but they are the sites where the migration delivers the most and a test proves the least. |

**14 sites sit inside `.catch(() => …)` or a bare `catch {}`** — `gps-ping:69`,
`carrier/dashboard:24,30`, `driver-dashboard:86`, `tasks/[id]/page:95`, `login:154`,
`drivers/invite:126`, both `audit-log.ts` writers, `activation-tracker:198`, and every `send-push`
site (which logs at `info`). **A green smoke test proves very little about this set.** Verification
for them must be a row assertion or a log assertion, not the absence of an error.

---

## 4. The tenant-creation path, specifically

> **SUPERSEDED IN PART by quick-601 (2026-09-14).** §4.1's table below was a static read and three
> of its rows do not survive measurement. Corrections, each executed as `app_user` against staging:
>
> 1. **Step 4's failure is not the only one, and the ordering §4.1 prescribes is impossible.**
>    "Set the GUC immediately AFTER the insert" cannot work: the `AFTER INSERT FOR EACH ROW` trigger
>    runs inside the same statement and needs the GUC already set, and Prisma's `RETURNING` clause
>    makes `tenant_self_read` a second insert-time check with the same requirement. quick-601
>    replaced `tenant_bootstrap_insert`'s body with `id = current_tenant_id()` and mints the tenant
>    uuid in the application, so the GUC is set BEFORE the insert.
> 2. **Steps 6, 6b and 6c do NOT fail.** `app_user` holds `SELECT` on `"Plan"`, and `SELECT` +
>    `UPDATE` on `"Promo"`, on **both** databases — re-read from
>    `information_schema.role_table_grants`. The grants named in "What makes it work" item 3 were
>    applied and this table was not updated.
> 3. **Item 4's admin-connection hoist was NOT taken.** The two probes became `SECURITY DEFINER`
>    functions — the alternative the same item recommends — because sign-up is the product's
>    highest-traffic unauthenticated surface. A third global read the design never named
>    (`generateVehicleIds`, on the hydration path, with no `@bypass_rls` marker and therefore
>    outside the 211-site grep) got the same treatment.
>
> §4.2 and §4.3 were correct and are implemented as written. `docs/audits/provisioning-path.md` is
> the successor document.


`Tenant` has no INSERT, UPDATE or DELETE policy — verified live on both databases. Three flows write
to it before or around the moment a tenant exists. Here is what each does, statement by statement, and
exactly what makes it work under `app_user`.

### 4.1 Sign-up — `lib/onboarding/provision-tenant.ts:36`

One transaction, eleven steps. Against production's live schema and policy set:

| Step | Statement | Under `app_user`, no bypass |
|---|---|---|
| 1 | `tx.user.findFirst({ where: { email: normalizedEmail } })` — global cross-tenant email probe | Returns **zero rows** silently. **Not fatal, and the reason matters:** `User_email_tenantId_key` is `(email, "tenantId")`, *not* globally unique, so this probe is the only Prisma-side cross-tenant email guard — but the Supabase Auth user is created **before** `provisionTenant` runs and `auth.users.email` is globally unique, so the duplicate is already rejected upstream. The code's own comment says the probe is defensive. Losing it silently degrades a second line of defence, it does not open a hole. |
| 3 | `while (await tx.tenant.findFirst({ where: { slug } }))` — global slug loop | Returns zero rows at the first iteration → the loop exits immediately → the first colliding slug reaches the insert and hits `Tenant_slug_key`. **`ERROR 23505` on sign-up for any company whose name normalises to an existing slug.** |
| 4 | `tx.tenant.create(...)` | **`new row violates row-level security policy for table "Tenant"`.** No INSERT policy exists. |
| 5 | `tx.user.create({ data: { id: authUserId, tenantId: tenant.id, … } })` | Would pass `WITH CHECK ("tenantId" = current_tenant_id())` **if** the GUC were set to `tenant.id` — which is possible, because the row was created one statement earlier, in this transaction. |
| 6 | `tx.plan.findFirst({ where: { key: 'starter' } })` | **`42501 permission denied for table Plan`** — production has no `app_user` grant. |
| 6b | `tx.promo.findFirst` + raw `UPDATE "Promo" SET "redemptionCount" = …` | **`42501`** on both. Staging grants `SELECT` only, so the `UPDATE` fails there too even after step 1. |
| 8, 9 | `tx.subscription.create`, `tx.activationProgress.create` | Pass with the GUC set to `tenant.id`. |

**What makes it work:**

1. **`tenant_bootstrap_insert`** (§3.1 #1) admits step 4 — and admits it *only* from a connection with
   no tenant GUC set, which is exactly what this transaction is before step 4.
2. **`set_config('app.current_tenant_id', tenant.id, TRUE)` immediately after step 4**, inside the
   same transaction. Steps 5, 8 and 9 then pass their own `WITH CHECK` with no bypass and no admin
   connection. Note the ordering constraint this creates: the GUC must be set *after* the insert, and
   the insert policy requires it to be unset *before*. Those two facts are consistent, and the
   transaction is the only place they can both hold.
3. **`GRANT SELECT ON "Plan", "Promo" TO app_user` and `GRANT UPDATE ON "Promo" TO app_user`** — step
   1's grant sweep applied to production, with `Promo`'s `UPDATE` added on both.
4. **Steps 1 and 3 go on the admin connection**, hoisted **out of** the transaction and above it: two
   short reads (`emailTaken(email)`, `nextFreeSlug(base)`) executed before `provisionTenant` opens its
   transaction. They return one boolean and one string; neither returns a row to the caller. A
   `SECURITY DEFINER` function granted `EXECUTE` to `app_user` is the narrower alternative and works
   identically — recommend it if the admin connection is judged too broad a tool for two reads, since
   it leaks strictly less than a client that can read every table.

### 4.2 Email confirmation — `api/email-confirm/[token]/route.ts:54`

`verifyEmailToken(token)` returns `{ tenantId }` — the token is minted as `generateEmailToken(tenant.id)`
at the end of `provisionTenant`, so the tenant is in hand **before** any query. The route needs no
bootstrap at all:

1. `set_config('app.current_tenant_id', payload.tenantId, TRUE)` in the transaction.
2. `tenant.findUnique` is admitted by the existing `tenant_self_read`.
3. `tenant.update({ emailConfirmedAt })` is admitted by **`tenant_self_update`** (§3.1 #2) and by
   nothing that exists today.

**No admin connection. One new policy.**

### 4.3 Onboarding hydration — `lib/onboarding/hydrate-tenant.ts:13` and `:36`

`hydrateTenant(tenantId)` takes the tenant as an argument. Same shape as 4.2: set the GUC from the
argument; `:13`'s read is admitted by `tenant_self_read`; `:36`'s
`tenant.update({ provisioningPhase: HYDRATED })` is admitted by `tenant_self_update`.
`(auth)/sign-up/actions.tsx:232` (`appEvent.create` with `result.tenantId`) is the same again.

### 4.4 The sysadmin tenant surface

`(admin)/actions/tenants.ts` creates (`:98`), updates (`:190, :229, :432, :542`) and deletes (`:625`)
arbitrary tenants, and **none of those six is a bypass site** — they run on the bare client and work
only because `postgres` has `BYPASSRLS`. They go on the admin connection with the rest of §3.3. This
is the one tenant-write surface where no policy is the right answer: a tenant must not be able to
create, rename or delete another.

### 4.5 Summary of what the tenant-creation path needs

| Change | Kind |
|---|---|
| `tenant_bootstrap_insert` — INSERT, `WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL)` | DDL, one policy |
| `tenant_self_update` — UPDATE, `USING/WITH CHECK (id = current_tenant_id())` | DDL, one policy |
| `GRANT SELECT ON "Plan", "Promo"` + `GRANT UPDATE ON "Promo"` to `app_user`, on production **and** staging | DDL, grants |
| `set_config('app.current_tenant_id', tenant.id, TRUE)` after the `Tenant` insert | one line, `provision-tenant.ts` |
| Hoist the email and slug probes onto the admin connection (or two `SECURITY DEFINER` functions) | code + optional DDL |
| Route `(admin)/actions/tenants.ts` x6 and the two `tenant.repository.ts` bootstrap reads onto the admin connection | code |
| No DELETE policy on `"Tenant"`, deliberately | decision |

---

## 5. Order of operations — the checklist

Precedes `withTenantContext` unless marked otherwise. Steps map to
`.planning/phase-0-revised.md` §2 where noted.

### Before the wrapper migration starts

- [ ] **B1. Ship step 1's policies and grants to production.** ~~Staging has 183 policies to
      production's 179, and 7 tables carry `app_user` grants on staging that production lacks.~~
      **STALE — corrected by quick-599 (2026-09-14), the way quick-599 corrected its own
      predecessors.** Production and staging are now **ALIGNED at 183 policies, byte-identical**,
      digest `99abc8b7112e797944fe0df0855fd56a`, `bypass_rls_policy` 86 on both — quick-599's
      migration was applied to production out of band between that task closing and quick-600
      (this task) starting. Until this had landed, `stops` / `carrier_documents` /
      `route_template_stops` had **no policy at all** on production and four bypass sites were
      already no-ops there. *Blocked: everything. Was the largest single production/staging
      divergence; every verification on staging before this correction was measuring a database
      production did not have. No longer true — re-verify before relying on this being current.*
- [ ] **B2. Add `GRANT UPDATE ON "Promo" TO app_user` — on staging too.** Staging grants `SELECT`
      only and `provision-tenant.ts:97` issues a raw `UPDATE`. *Sign-up with a promo code fails on
      the verification target itself without this.*
- [ ] **B3. Create the policies of §3.1 and §4.5:** `tenant_bootstrap_insert`, `tenant_self_update`,
      `audit_log` INSERT (`WITH CHECK (true)`), and `audit_log`'s SELECT policy rewritten to
      `current_tenant_id()` so the `::uuid` cast on `''` stops raising `22P02`.
      *Blocks: sign-up, email confirmation, onboarding hydration, `/settings/operations`, and every
      PII-access audit write.*
- [ ] **B4. Rewrite the 3 inlined-GUC policies** (`Tag`, `TagAssignment`, `audit_log`) to route
      through `current_tenant_id()` — `.planning/phase-0-revised.md` step 3. B3 covers `audit_log`.
      Leave the two `SysAdminInvoice*` deny policies inline (they must pass on a null GUC) but
      **record §2.6's finding**: they are permissive and currently grant, not deny.
- [x] **B5. Build the admin connection — DONE on staging only, quick-600 (2026-09-14).** Names
      differ from this line deliberately, recorded in the task: the env var is
      `DATABASE_URL_ADMIN` (not `ADMIN_DATABASE_URL`), the accessor is `getAdminDb(reason)` (not
      `withAdminContext(reason, fn)`), and `reason` is typed over a closed `AdminReason`
      string-literal union rather than a plain `string`. A dedicated role, `app_admin`
      (`BYPASSRLS`, `NOLOGIN` until a human sets `LOGIN`/password out of band), not `postgres` — the
      decisive argument is the two-direction boot guard, which needs a role distinguishable from
      the tenant connection by `current_user`. `getAdminDb`'s second pool carries no tenant-GUC
      connect initialiser. The two-direction boot guard is flag-gated (`DB_ROLE_ASSERT`) and the
      CI call-site countdown is `tests/security/admin-connection-allowlist.test.ts`, proven to fire
      red on a deliberate out-of-allowlist import and a deliberate alias.
      Of the things this line said B5 blocks: **16 of the 21 CROSS_TENANT sites are routed** (3
      corrected to `getTenantPrismaForOrg` instead — the tenant was already in hand; 2 stay on the
      existing bypass, owned by B7); **4 of the 7 BOOTSTRAP sites are routed** (3 stay open — 2
      owned by B3/§4.1, 1 by B8); **all 6 `(admin)/actions/tenants.ts` writes are routed**; **the
      sysadmin `getCurrentUser` branch is NOT routed — still B8's**, unchanged by this task. Full
      accounting: `.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md`
      and `docs/audits/admin-connection.md`. **Not done: any part of the `app_user` cutover, and
      production has no `app_admin` role at all yet — see `admin-connection.md` §6 for the runbook.**
- [ ] **B6. Decide the `SupportTicket` null-tenant question** (§3.1 #5). Recommend routing the 4
      affected sites onto the admin connection now and revisiting when `app.current_user_id` exists.
      *Blocks: "My tickets", owner replies, and any ticket filed by the sysadmin.*
- [ ] **B7. Create `support_ticket_number` as a real sequence** and delete both copies of
      `generateTicketNumber`. *Blocks: nothing, but it removes 2 CROSS_TENANT sites and a live race
      that exists today.*
- [ ] **B8. Convert `getCurrentUser` to set the GUC from `session.tenantId`**, with the
      `session.isSystemAdmin` branch on the admin connection. Model on `api/auth/login/route.ts:74`.
      *Blocks: 9 call-chain units in the wrapper migration's group 1b — it is the cheapest deadlock
      removal available (`wrapper-migration-scope.md` §1b).*
- [ ] **B9. Split the four dual-caller helpers** — `send-push.ts`, `workflows/notifications.ts`,
      `notifications/audit-log.ts`, `require-driver.ts` — so each takes an explicit tenant or has two
      entry points. *Blocks: 57 call-chain units after quick-596. `sendPushToUser` alone is 20.*
- [ ] **B10. Fix the 17 `25P02` transaction-abort sites**
      (`wrapper-migration-scope.md` §3). Three swallow a **write** and continue —
      `createCarrierDriver`, `overrideInspection`, `transitionTripStatus` — and under one transaction
      they lose the row the user was told was created. *Blocks: group C of the wrapper migration, and
      this is the one item where getting the order wrong causes silent data loss rather than an
      outage.*

### Can follow the wrapper migration

- [ ] **A1. Split the 11 cron sweeps from the 6 per-tenant loop bodies**, so only the sweep is
      privileged. Needs B5 but not the whole migration.
- [ ] **A2. Migrate the 171 live DECORATIVE sites**, deleting each bypass line **in the same commit**
      that wraps its unit of work. Order by surface: D1 mobile owner (61) → D2 mobile driver (22) →
      D3 API (25) → D7 helpers (34, after B9) → D4/D5/D6 (29).
- [ ] **A3. Add the 11 missing tenant predicates** (§3.4). Independent of everything; closes two live
      cross-tenant reads.
- [ ] **A4. Arm the `RAISE` tripwire** in `current_tenant_id()` on staging and preview only, plus the
      CI countdown (`wrapper-migration-scope.md` §5). Neither signal alone is sufficient — the static
      gate cannot see a transaction reached through a call chain, and the runtime signal only fires on
      paths something exercises.
- [ ] **A5. Drop the two dead policies** — `PushToken.user_isolation_policy`,
      `UserNotificationPreference.user_isolation_policy` — or rebuild them when `app.current_user_id`
      lands. Neither is load-bearing.
- [ ] **A6. Fix `in_app_notifications_insert_policy`** (`WITH CHECK (true)` → `org_id =
      current_tenant_id()`) and drop or rebuild the two `auth.jwt()` policies beside it.
- [ ] **A7. Re-verify the whole classification** — the counts here are a snapshot of `master` at
      `aa38953c` and every commit can move them.

### The gate on step 7

**`bypass_rls_policy` may be dropped only when all of the following are true:**

1. B1–B10 are done on **both** databases, and a fresh `pg_policy` read shows staging and production
   agreeing.
2. The CI countdown reports **zero** `getTenantPrisma`/`getTenantPrismaForOrg` calls outside a
   `withTenantContext` callback.
3. The `withAdminContext` call-site count equals the allowlist, and every entry has a reason constant.
4. Staging has been running `DATABASE_URL` on `app_user` with the `RAISE` tripwire armed, with the
   cron routes, the sign-up flow, invitation acceptance, email confirmation, the public tracking page
   and the sysadmin portal all exercised — **by row assertion, not by absence of error**, because 14
   of the sites in scope swallow their own failures.
5. `grep -rn "app.bypass_rls" apps/web/src` returns only comments.

Step 8 (`app_user` cutover) may then follow. **It must not precede step 7**, for the reason in §6.

---

## 6. What breaks the day `bypass_rls_policy` is dropped

### The literal answer: nothing

`DATABASE_URL` resolves to `postgres`, and `postgres` carries `rolbypassrls = true`. Measured on
production: as `postgres`, with `app.current_tenant_id` unset and `app.bypass_rls` unset,
`SELECT count(*) FROM stops` returns **791 rows** from a table with `relrowsecurity = true`,
`relforcerowsecurity = true` and **zero policies**. RLS does not evaluate on the runtime connection at
all. Dropping all 86 `bypass_rls_policy` rows would change the behaviour of no request.

**That is the trap, not the reassurance.** A drop that changes nothing looks like a clean step in the
log and defers the entire cost to whoever runs step 8. `.planning/phase-0-revised.md` §2 orders the
drop (step 7) before the cutover (step 8), so the drop *is* inert — and the surfaces below break on
the day of the cutover, with no signal between the two events to say why.

### The answer that matters: the cutover, with this design not implemented

These fail. Each is a screen or a job a person notices, not a category.

**Fail hard, visibly**

| Surface | What a user sees | Cause |
|---|---|---|
| **Sign-up** (`/sign-up`) | The form submits and errors. A Supabase Auth user now exists with no Prisma `User` row. | `Tenant` has no INSERT policy; `Plan`/`Promo` have no `app_user` grant on production |
| **Email confirmation** (`/api/email-confirm/[token]`) | Every confirmation link redirects to `/sign-in?error=link-invalid` | `Tenant` has no UPDATE policy |
| **Driver invitation acceptance** (`/api/auth/accept-invitation`) | "Invitation not found" on every valid link. On `POST`, the Supabase Auth user is created before the failure, so the driver is left with a login and no `User` row. | `DriverInvitation.tenant_isolation_policy`, GUC unset |
| **Public customer tracking** (`/track/[token]`) | Every tracking link a customer has been sent 404s | `Load.tenant_isolation_policy`, unauthenticated request, GUC `''` |
| **`/settings/operations`** | Saving either Document Import inspection setting throws. Not a bypass site — it runs on a correctly-scoped tenant client and still fails. | `Tenant` has no UPDATE policy |
| **SysAdmin → Tenants** | Create, rename, suspend, extend trial and delete all fail | `(admin)/actions/tenants.ts` x6 on the bare client; `:586` the one bypass site |
| **SysAdmin → Support Tickets** | The tenant list is empty; no ticket can be resolved, closed or replied to; every thread renders blank | `tenant.findMany`, `supportTicket.update`, `TicketMessage`'s subquery |
| **Support ticket creation, both surfaces** | `generateTicketNumber` falls back to `TKT-0001`, which collides with the global unique index — ticket creation throws | `SupportTicket_ticketNumber_key` |
| **Driver "My Tickets" and owner replies** | Empty list; replies rejected | the 7 null-tenant rows, plus GUC |
| **Every PII-access and RBAC-denial audit write** | `22P02 invalid input syntax for type uuid: ""`, **rethrown** — callers that treat audit failure as fatal start returning 500 | `audit_log`'s uninsulated `::uuid` cast against the pool's `''` default |
| **Mobile driver-pay** (`/api/driver-pay/me/*`) | Every Bearer request 403s. The cookie branch keeps working, so it reads as a mobile-only regression. | `require-driver.ts:106`, `carrier_drivers.org_id = current_tenant_id()` |
| **Driver and owner message threads on a stop** | Threads 404 | `stops` has no policy on production |

**Fail silently — the worse half**

| Surface | What a user sees | What the logs say |
|---|---|---|
| **All four digest crons** (`digest-compliance-30day`, `digest-daily-driver`, `digest-weekly-owner`, `send-reminders`) | No email ever arrives again | `{ success: true }`, "Found 0 active tenant(s)" — indistinguishable from a quiet day |
| **`cron/workflow-notifications`** | `STEP_OVERDUE` alerts and the >48h blocked-instance escalation stop | `{ success: true }` |
| **`cron/auto-close-tickets`** | Nothing closes | `{ success: true, closed: N }` — reporting the count from the raw scan, i.e. **reporting work it did not do** |
| **`cron/automations`** | Runs never leave `PENDING`, so **the same automation re-fires on every tick**. Customers receive duplicates. | nothing |
| **Push notifications** | Nothing sends. Errors are logged at `info`. | `info` only. *Production currently holds **zero** `PushToken` rows, so the observable impact on the day is nil and the defect arrives with the first device registration.* |
| **Owner carrier dashboard** (`/carrier/dashboard`) | All KPI tiles read zero | `.catch(() => …)`, nothing logged |
| **Driver dashboard and `/tasks`** | Stat chips zero; `notFound()` on every task | `catch {}` |
| **`/onboarding/welcome`** | Counts zero, tenant name blank | nothing |
| **`/api/driver/gps-ping`** | Positions stop associating with a truck | responds `{ saved: true }` |
| **Notification send-log** | The audit trail stops | swallowed by design — "audit must never break the caller" |
| **Outbound mail `From`/`Reply-To`** | Wrong sender identity on production mail | `42501` on `NotificationEmailConfig`, caught, env fallback |

**The 61-site `/api/mobile/owner/*` surface and the 22-site `/api/mobile/driver/*` surface** are not
listed row by row because the failure is uniform: every read returns zero rows and every write is
rejected. That is the entire mobile app, both portals, on the day of the cutover — and it is the one
group where the remedy is purely mechanical (`getTenantPrismaForOrg`, already shipped for
`/api/mobile/carrier/*` by quick-588) and needs no policy, no grant and no admin connection.

---

## 7. Reproduction

Every count in this document traces to one of:

```bash
# the 210 live sites / 102 files
cd apps/web && grep -rn "app.bypass_rls" src --include=*.ts --include=*.tsx | grep -v __tests__ \
  | awk -F: '{l=$0; sub(/^[^:]*:[0-9]*:/,"",l); gsub(/^[ \t]+/,"",l); if (l !~ /^(\*|\/\/|\/\*)/) print}'
```

```sql
-- RLS state + policy count, per table
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, count(p.polname)
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE n.nspname = 'public' AND c.relkind = 'r' GROUP BY 1,2,3;

-- every non-bypass policy expression
SELECT c.relname, p.polname, p.polcmd,
       pg_get_expr(p.polqual, p.polrelid), pg_get_expr(p.polwithcheck, p.polrelid)
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND p.polname <> 'bypass_rls_policy';

-- app_user grants
SELECT table_name, string_agg(DISTINCT privilege_type, ',')
FROM information_schema.role_table_grants
WHERE grantee = 'app_user' AND table_schema = 'public' GROUP BY 1;

-- the two measurements the ordering argument rests on
SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user),
       (SELECT count(*) FROM stops);   -- postgres | true | 791
SELECT ''::uuid;                       -- ERROR 22P02
```

Production `oqdhberkghtnszrkdvfm`, staging `wyixpgunnjmzguhggocz`, both read-only, 2026-09-12.
The per-site model extraction script is in the session scratchpad and is not committed; its output —
46 tables — is reproduced in full in §2.
