# quick-616 Task 2 — the named subset, re-resolved and routed by class

**2 statements routed. 11 classified and deliberately NOT routed, each with a named reason.**

---

## 1. The subset is 13, not ~20 — and every line number had drifted

`615-SUMMARY.md` §8 and `admin-connection.md` §9 were both re-resolved **by symbol**, with their
line numbers kept only as a hint (quick-611's rule). **The corrections are reported here rather than
silently applied.**

| prior claim | source | today | correction |
|---|---|---|---|
| "the 7 in `support-tickets.ts`" | 615 §8 | **5** | Three were routed onto `getAdminDb` by quick-600 `0c08a959` — `updateTicketStatus`, `addAdminReply`, `getTicketMessages`. §8's "7" counted the 2026-09-12 audit's 8 minus one, and was already stale when written. |
| "`evaluator.ts:95-96`" | 615 §8 | **1 statement, at `:127`** | `:95` and `:203` were the audit's two; quick-600 routed `:203`. The survivor is the Path-1 `automationRun.create`. Two line numbers were quoted for one statement. |
| "`workflow-digest`'s 8" | 615 §8 | **4**, at 82 / 102 / 181 / 190 | The audit had 5 in that file (one CROSS_TENANT at `:50`, four DECORATIVE); quick-600 took `:50`. "8" matches nothing in any prior count. |
| "today's **second** bypass statement in that file" (`track/[token]`) | admin-conn §9 | **the only one**, at `:50` | quick-600 routed the load lookup at `:24` onto `getAdminDb`. "Second" was true on 2026-09-14 and is not now. |
| `actions/support-tickets.ts:98` `generateTicketNumber` | admin-conn §9 / audit | **`:99`** | +1 |
| `api/mobile/support/ticket/route.ts:39` | admin-conn §9 / audit | **`:39`** | unchanged |
| `lib/auth/supabase.ts:164` | 615 §8 / design §1.1 | **`:164`** | unchanged |
| `support-tickets.ts` 169 / 217 / 371 / 410 | design §1.3(c) | **170 / 218 / 408 / 447** | +1, +1, **+37**, **+37** |

**Where the "extra ~7" went: they were never there.** 13 is the count that survives re-resolution;
the ~20 was §8's prose summing three already-stale sub-counts. The symbols are:
`generateTicketNumber` ×2 · `getCurrentUser` · `createSupportTicket` · `getMyTickets` ·
`getTicketById` · `addOwnerReply` · `runEvaluator`'s Path-1 create · four `workflow-digest` loop
bodies · the `track/[token]` GPS lookup.

---

## 2. Classified, then routed by class

| # | statement | class | receiver | outcome |
|---|---|---|---|---|
| 1 | `actions/support-tickets.ts:99` `generateTicketNumber` | CROSS_TENANT | sequence (DDL) | **ROUTED** |
| 2 | `api/mobile/support/ticket/route.ts:39` `generateTicketNumber` | CROSS_TENANT | sequence (DDL) | **ROUTED** |
| 3 | `lib/auth/supabase.ts:164` `getCurrentUser` | BOOTSTRAP | — | **STOP AND REPORT** (§4) |
| 4–7 | `support-tickets.ts` 170/218/408/447 | BROKEN_POLICY | migration + data-model decision | **STOP AND REPORT** (§5) |
| 8–13 | `evaluator.ts:127`, `workflow-digest` ×4, `track/[token]:50` | TENANT_KNOWN_UNSCOPED | `getTenantPrismaForOrg` | **NOT CONVERTED — wrapper programme** (§6) |

**No statement was routed to `getAdminDb`.** The allowlist
(`tests/security/admin-connection-allowlist.test.ts`) is **unchanged** and passes green unmodified
(9 tests). There was nothing to raise `TOTAL_EXPECTED_CALLS` for and nothing to witness red: adding
an entry to demonstrate a gate, for a call site that does not exist, would be theatre.

---

## 3. B7 — the sequence, weighed against `getAdminDb` in writing

### The choice

**`CREATE SEQUENCE public.support_ticket_number_seq`, not `getAdminDb`.**
Migration: `prisma/migrations/20260915180000_support_ticket_number_sequence/migration.sql`.

### The argument, point by point

1. **The sequence removes the LIVE RACE. `getAdminDb` does not.** Both copies did
   read-max-then-insert with no lock, from two entry points (a server action and
   `/api/mobile/*`) that can run concurrently. `SupportTicket_ticketNumber_key` is a **global**
   unique index, so the second writer's insert throws. An admin connection fixes the RLS problem and
   leaves that race exactly where it was.

2. **§9's predicted cutover symptom is a SILENT WRONG ANSWER, which is the worse failure mode.**
   Quoted:

   > They still break silently at the `app_user` cutover — reads under an empty GUC return zero
   > rows, not an error, so `generateTicketNumber` would issue `TKT-0001` for every new ticket,
   > colliding immediately.

   **Measured, not assumed** — see `03-proof.md` cell 2b: `count = 0, max = null` with a privileged
   counter-read showing 2 rows. §9 is right.

3. **An admin connection papers over a data-model problem.** §9's own words. A globally-unique
   per-tenant-invisible counter is what a sequence is for. Routing the read to a `BYPASSRLS` client
   would preserve a cross-tenant read forever in order to answer a question the database can answer
   in one statement.

4. **It is also strictly less privilege.** `getAdminDb` would hand the ticket-number path a
   `BYPASSRLS` connection with `SELECT` on `SupportTicket`. The sequence path needs `USAGE ON
   SEQUENCE` and nothing else — it cannot read a ticket at all.

### The start value is READ, not assumed

Computed inside the migration, per database:

```sql
SELECT COALESCE(MAX(CASE WHEN "ticketNumber" ~ '^TKT-[0-9]+$'
                         THEN substring("ticketNumber" from 5)::bigint END), 0)
  INTO v_max FROM public."SupportTicket";
PERFORM setval('public.support_ticket_number_seq', v_max + 1, false);
```

Staging holds **0 `SupportTicket` rows**, so `v_max = 0` and the first `nextval` returns 1 —
observed. Production held **87 rows** at the last count (`bypass-replacement-design.md` §1.3(c)), so
it will start at 88 when a human applies this. **A hardcoded number would have been wrong on one of
the two databases.** The whole block is guarded on the sequence's own absence, so re-application
cannot reset it.

### Accepted cost, stated rather than hidden

A sequence is **not transactional**: a rolled-back insert consumes its number and leaves a gap.
Ticket numbers are identifiers, not a count, and nothing in the product reads them as contiguous.
A gap beats a collision.

### The false annotation was fixed WITH the code

The mobile copy's docblock claimed `reason: mobile-api`, `SCOPE: Accesses only data belonging to
the authenticated user's tenant` and `SAFETY: Gated by validateMobileToken() above`. All three were
false (see `01-census.md` §7.2). The replacement header states what the function now does, records
that the annotation was false and why, and names the twin. **The annotation was not deleted quietly
— the correction is in the file.**

### Ledger row — DEC-17, hand-written and READ BACK

```
migration_name      : 20260915180000_support_ticket_number_sequence
checksum            : fa41210ce4a85d48dc3a3a25a74ce969b5420c5efc53307742efee155ff34e84   (sha256 over LF bytes)
applied_steps_count : 0        (the signature of a mirrored row; migrate.mjs writes 1 + 'manual')
logs                : ''
started_at = finished_at
```

**The sentinel was confirmed visible first.** `_prisma_migrations` runs RLS ENABLED with ZERO
POLICIES and no `app_user` grant, so an empty read-back from a non-owner role is indistinguishable
from "never written" — and would prompt a duplicate write. The instrument refuses to proceed unless
`20260915170000_auth_user_display_definer_function` is visible. It was, and the new row read back
with the matching checksum and `applied_steps_count = 0`.

### One finding from applying it, reported not acted on

Immediately after `CREATE SEQUENCE`, `information_schema.role_usage_grants` showed **USAGE for
`anon`, `authenticated` and `service_role`** as well as `app_user`, `app_admin` and `postgres`.
That is **not** something this migration granted. `pg_default_acl` carries
`ALTER DEFAULT PRIVILEGES … ON SEQUENCES` entries from Supabase's own platform roles giving those
three `rwU` on **every** sequence created in `public`:

```
{postgres=rwU/postgres, anon=rwU/postgres, authenticated=rwU/postgres, service_role=rwU/postgres}
```

`w` on a sequence permits `setval`. This is a pre-existing, database-wide platform posture that
applies to every sequence this project has or will create; narrowing it on this one sequence alone
would make it the odd one out and is a separate decision. **Reported, not fixed.**

---

## 4. B8 — `lib/auth/supabase.ts:164`. STOPPED AND REPORTED.

**Not routed. This is an acceptable outcome and the plan says so.**

Read from the file's own header and from `admin-connection.md` §9 / design §3.2:

- `set_config(..., TRUE)` is **transaction-local**, so the `$transaction` IS the bypass scope.
  Deleting it does not simplify anything — it **silently removes the bypass**, and `User` is
  FORCE-RLS, so the bootstrap read returns null and **nobody logs in**.
- `withTenantContext` is explicitly the **wrong** remedy: passing a caller's transaction in leaves
  `app.bypass_rls = on` for the remainder of that caller's unit of work, so every later query in the
  request stops being tenant-filtered. A deadlock is loud; that is silent.
- **Nine call-chain units** reach a transaction through this function
  (`wrapper-migration-scope.md` §1b).
- §3.2's actual remedy is a **branch**: set the GUC from `session.tenantId` (already in the JWT
  `app_metadata`, no database call) for **37 of 38** production accounts, and fall back to the admin
  connection **only** on `session.isSystemAdmin === true`. §9 calls that "a bigger, separate task".

**Sizing for the backlog:** 1 file, 1 statement, 9 call-chain units to re-verify, 1 new `AdminReason`,
1 allowlist entry, and a login-path proof on staging in both branches (a tenant account and the
sysadmin account). It is the highest-blast-radius single statement in the census — every
authenticated request reaches it — and a half-done auth path is worse than a named open item.

It uses the **`$transaction([ … ])` array form**, the one shape a callback-only walker drops. The
census carries a dedicated ARRAY-FORM witness for exactly this statement.

---

## 5. BROKEN_POLICY — the live policy, QUOTED, and what cannot satisfy it

Read from **staging `pg_policies`**, not from a migration file (DEC-14):

```sql
-- public."SupportTicket"   relrowsecurity = true, relforcerowsecurity = true
bypass_rls_policy        FOR ALL  TO public  USING (current_setting('app.bypass_rls'::text, true) = 'on'::text)
tenant_isolation_policy  FOR ALL  TO public  USING ("tenantId" = current_tenant_id())
                                             WITH CHECK -- none declared; PostgreSQL DERIVES it from USING
```

**What cannot satisfy it:** a row with `tenantId IS NULL`. The predicate becomes
`NULL = current_tenant_id()` → **NULL**, which is *not true*, at **every** value of the GUC —
including NULL, because `NULL = NULL` is NULL. `SupportTicket.tenantId` is `is_nullable = YES`
**deliberately** (`20260328000002_nullable_tenant_support_ticket`) so a sysadmin can file a ticket
with no tenant, and `bypass-replacement-design.md` §1.3(c) records **7 such rows out of 87 on
production**. Those 7 are readable by no policy and writable by none. With `bypass_rls_policy` gone
there is no second permissive policy to OR with.

The four statements that need them:

| statement | what it does with a null-tenant row |
|---|---|
| `support-tickets.ts:179` `createSupportTicket` | `create({ data: { tenantId: session.tenantId \|\| null } })` — the insert that PRODUCES such a row, rejected by the derived check |
| `support-tickets.ts:227` `getMyTickets` | `findMany({ where: { submittedBy } })`, deliberately no tenant predicate, deliberately includes them |
| `support-tickets.ts:417` `getTicketById` | `where: { id, tenantId: session.tenantId ?? undefined, … }` — `?? undefined` DELETES the predicate; must reach them |
| `support-tickets.ts:456` `addOwnerReply` | same lookup, then a `ticketMessage.create` that fails `TicketMessage`'s parent-join policy transitively |

**Not fixed here, and the reason is that the remedy is a product decision, not a migration.**
Design §3.1 item 5 offers two, and rejects the first:

> **(i)** widen the policy to `("tenantId" = current_tenant_id() OR ("tenantId" IS NULL AND
> "submittedBy" = current_setting('app.current_user_id', TRUE)::uuid))` — which needs a GUC that
> does not exist yet. … **(i) No, not today** — `app.current_user_id` is the very GUC §2.2 shows
> nothing sets, and inventing it here pre-empts the scoped work in §10 of the plan.
> **(ii)** give sysadmin tickets a real home: either a sentinel tenant row, or route all null-tenant
> ticket traffic onto the admin connection and leave the policy alone.

Option (ii)'s admin-connection half **cannot be applied wholesale here** without violating this
task's own prohibition — 80 of the 87 production rows carry a real tenant and a tenant client serves
them. It needs a per-request **branch** on session shape, which is a design change with its own
proof. The sentinel-tenant half is a data migration. Either way: **one task, not a line in this one.**

`lib/security/audit-log.ts:86` is the fifth BROKEN_POLICY statement in the named files' orbit and is
**already remediated at the database** — quick-599 shipped the SELECT/INSERT split and the REVOKE in
`20260914120000_tenant_audit_automation_policy_closure`. Its bypass line is now vestigial and is a
DECORATIVE-class deletion once someone confirms the split reached production.

---

## 6. The six wrapper-population statements — COUNTED, CLASSIFIED, NOT CONVERTED

Per the user's decision: *"Count and classify the `getTenantPrismaForOrg` population, but do NOT
convert them here — the countdown stays the single place tracking them."*

| statement | tenant it already holds |
|---|---|
| `lib/automations/evaluator.ts:127` | `event.tenantId`, from the row the sweep just read |
| `api/cron/workflow-digest/route.ts:82, 102, 181, 190` | the per-tenant loop variable |
| `api/track/[token]/route.ts:50` | `load.tenantId`, from the `getAdminDb` read at `:29` |

`admin-connection.md` §9 already reaches the same verdict for five of the six:

> **The five DECORATIVE loop-body statements** left deliberately untouched inside
> `workflow-digest/route.ts` (4) and `lib/automations/evaluator.ts` Path 1 (1) —
> `getTenantPrismaForOrg` is the correct destination for these (tenant already known), and A2's rule
> (delete the bypass line in the same commit that wraps the unit of work in `withTenantContext`)
> governs when, not this task.

**`track/[token]:50` is the sixth, and §9 is right that the design document is stale about it.**
Design §1.1 says its sibling "needs nothing — `load.tenantId` is in hand by then". Re-read at source:
the tenant IS in hand, and the query is `gPSLocation.findFirst({ where: { truckId: load.truckId } })`
with **no tenant predicate**. So it needs *two* things — a tenant client AND the missing predicate —
not nothing. **Both §9's correction and the correction to §9's own framing are recorded: its
receiver is a tenant client, NOT `getAdminDb`**, so routing it here would have broken this task's
own prohibition against putting a tenant-servable statement on the admin connection.

**Routing 13 down to 2 is the correct outcome, not a shortfall.** The plan says so explicitly.

---

## 7. Removed vs remaining, reconciled

Re-run of `scripts/audit/616-bypass-census.ts` after the edits:

```
PASS  ROUTED STATEMENTS ARE GONE  —  2 routed statements absent:
      src/actions/support-tickets.ts:99, src/app/api/mobile/support/ticket/route.ts:39
PASS  REMOVED + REMAINING RECONCILES  —  175 remaining + 2 routed = 177 (must be 177).
      Anything else means something ELSE changed.

statements: 175   files: 87
```

**177 − 2 = 175.** The file count is unchanged at 87, because both edited files still carry other
statements (`support-tickets.ts` 4, `mobile/support/ticket/route.ts` 1).

The reconciliation is asserted as a **MOVE**, not an absence: `ROUTED_AND_REMOVED` names both
statements and the census fails if either is still present **and** fails if the arithmetic does not
close. A merely shorter list would pass identically whether a statement was routed or simply deleted
along with the read it protected (quick-566 / quick-599's union rule).

**No routed path keeps a bypass flag.** Neither `generateTicketNumber` has a `$transaction` at all
any more — both are a single `$queryRaw` for `nextval`.

### The post-routing category totals

| category | before | after |
|---|---:|---:|
| BOOTSTRAP | 1 | 1 |
| BROKEN_POLICY | 9 | 9 |
| **CROSS_TENANT** | **2** | **0** |
| DECORATIVE | 13 | 13 |
| TENANT_KNOWN_UNSCOPED | 152 | 152 |
| **total** | **177** | **175** |

**CROSS_TENANT is now empty.** Every statement in `apps/web/src` that deliberately spans tenants is
either on `getAdminDb` (quick-600/613/615) or gone. What remains is entirely
tenant-known-but-unscoped, policy gaps, and one bootstrap.
