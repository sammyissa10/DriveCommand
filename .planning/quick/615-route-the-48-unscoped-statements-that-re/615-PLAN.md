---
phase: quick-615
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/src/app/(admin)/actions/tenants.ts
  - apps/web/src/app/(admin)/actions/notifications.ts
  - apps/web/src/app/(admin)/actions/users.ts
  - apps/web/src/app/(admin)/admin-support/page.tsx
  - apps/web/src/app/(admin)/tenants/[id]/activation-progress-section.tsx
  - apps/web/src/app/(admin)/tenants/[id]/automation-runs-section.tsx
  - apps/web/src/app/(admin)/tenants/[id]/page.tsx
  - apps/web/src/actions/support-tickets.ts
  - apps/web/src/app/api/cron/auto-close-tickets/route.ts
  - apps/web/src/app/api/cron/automations/route.ts
  - apps/web/src/lib/automations/evaluator.ts
  - apps/web/src/lib/db/admin-reasons.ts
  - apps/web/tests/security/admin-connection-allowlist.test.ts
  - apps/web/prisma/migrations/20260915160000_grant_cutover_routing_tables_to_app_admin/migration.sql
  - apps/web/prisma/migrations/20260915170000_grant_auth_user_display_columns/migration.sql
  - apps/web/scripts/audit/615-routing-verify.ts
  - .planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/*

must_haves:
  truths:
    - "Every one of the 48 input statements is re-verified against current code by FILE:LINE:SHAPE and given a verdict — PRESENT / MOVED / ALREADY ROUTED / NOT A RUNTIME STATEMENT — with the commit named for anything that moved, before a single edit is made."
    - "Every surviving statement is classified TENANT / ADMIN / GRANT with a one-line reason, and the per-class counts and per-file breakdown are reported."
    - "Why `tenants.ts` was partly routed is answered from PRIMARY SOURCES — the routing commit, quick-600's own ROUTING-MANIFEST scope sentence, and the fact that two of the 14 sit inside functions that already hold an `adminDb` local — not inferred from the shape of the 14."
    - "No statement is routed to `getAdminDb` that a tenant client can serve: the statements holding a `tenantId` in hand go to `getTenantPrismaForOrg(tenantId)`, and the argument is recorded per statement."
    - "`app_admin` holds exactly the per-table, per-operation grants the routed statements need on staging — the delta measured against the LIVE `information_schema.role_table_grants`, never against `admin-connection.md` §2's prose list, and proven by a routed statement that is refused BEFORE the migration and succeeds AFTER it."
    - "The `auth.users` statement is fixed with a GRANT, not a BYPASSRLS connection, and what `USAGE ON SCHEMA auth` exposes is ENUMERATED from the catalog — the `auth` table list, the `PUBLIC` EXECUTE defaults on `auth` functions — before anything is granted; the narrower `SECURITY DEFINER` alternative is stated and the choice argued."
    - "Every routed statement is proven on staging as `app_user` with the tripwire ARMED, in BOTH directions, batched per FILE with every file appearing: it succeeds on its new receiver and is refused or under-reads on the old one."
    - "Every zero carries a privileged counter-read proving the rows still exist, and every cross-tenant `foreign === 0` is paired with an `own > 0` on the same connection in the same transaction."
    - "Each probe cell runs in its OWN transaction, so a `TC001` cannot abort the matrix into a run of `25P02`s; SQLSTATE is read off the cause chain, never `err.code`, and `TC001` is recognised by CODE, never by message prose."
    - "The allowlist gate is proven to fire RED from this task's own run against a deliberate out-of-allowlist import, then reverted and re-run GREEN, with both outputs captured verbatim; entry count and `TOTAL_EXPECTED_CALLS` are raised to the real measured numbers and no floor is weakened."
    - "The DEC-17 ledger row for every migration applied to staging is hand-written with `applied_steps_count = 0` and a real SHA-256 over LF bytes, and READ BACK after a sentinel of known-good rows is confirmed visible."
    - "`bypass_rls_policy` is 86 before and after, compared as a sorted TABLE LIST; `npm run audit:rls-policy-drift` reports zero and NAMES the database it measured."
    - "`npm run build` exits 0 and the vitest failing-FILE set is unchanged, measured with the SAME reporter in both directions."
    - "The remaining count of unscoped statements is stated with what each needs, including the ones this task deliberately did not touch."
    - "Production is never written. Every instrument refuses the production ref positively before issuing a statement."
  artifacts:
    - path: ".planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/01-reverification.md"
      provides: "The 48 re-verified per statement, the TENANT/ADMIN/GRANT classification, the per-class counts, and the tenants.ts partial-routing answer"
      contains: "ALREADY ROUTED"
    - path: ".planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/01-classification.json"
      provides: "Machine-readable per-statement verdict + class, consumed by Tasks 2-5 and by the verifier"
    - path: "apps/web/src/lib/db/admin-reasons.ts"
      provides: "New AdminReason members — one per routed UNIT OF WORK, not per call site"
      contains: "sysadmin"
    - path: "apps/web/tests/security/admin-connection-allowlist.test.ts"
      provides: "New file entries and raised per-file call counts; both integrity floors updated to real measured numbers"
      contains: "TOTAL_EXPECTED_CALLS"
    - path: "apps/web/prisma/migrations/20260915160000_grant_cutover_routing_tables_to_app_admin/migration.sql"
      provides: "The measured per-table/per-operation app_admin grant delta, pg_roles-guarded, never GRANT ALL"
      contains: "app_admin"
    - path: "apps/web/scripts/audit/615-routing-verify.ts"
      provides: "--before / --apply / --after per-file both-directions matrix with counter-reads, fixtures and one transaction per cell"
      contains: "ROLLBACK"
    - path: ".planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/05-after.md"
      provides: "The per-FILE both-directions proof, every file present"
    - path: ".planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/06-allowlist-gate-fires.md"
      provides: "Witnessed red then green on the allowlist gate, verbatim"
  key_links:
    - from: "the routed statements"
      to: "apps/web/src/lib/db/admin-reasons.ts"
      via: "getAdminDb(reason: AdminReason) — a new reason is a type change in a reviewable file"
      pattern: "getAdminDb\\('"
    - from: "the routed statements"
      to: "apps/web/tests/security/admin-connection-allowlist.test.ts"
      via: "per-file getAdminDb( call count assertion"
      pattern: "calls:"
    - from: "the newly-reached tables"
      to: "the grant migration"
      via: "42501 before the migration, rows after — measured by 615-routing-verify --before/--after"
      pattern: "GRANT .* TO app_admin"
    - from: "apps/web/src/app/api/cron/automations/route.ts"
      to: "getTenantPrismaForOrg(tenantId)"
      via: "the loop variable already in hand — a tenant client can serve it, so getAdminDb must not"
      pattern: "getTenantPrismaForOrg"
---

<objective>
Route the 48 unscoped statements that will return silent zeros after the `app_user` cutover — after
re-verifying every one of them against current code and classifying each TENANT, ADMIN or GRANT.

Purpose: `current_tenant_id()` raises at PLAN time (quick-614 Task 1, `evidence/04-explain.md`
Part 3), before a single row is processed, so no `OR` branch, `CASE`, `COALESCE` or empty subquery
can save a statement issued with no tenant context. With `TENANT_CONTEXT_TRIPWIRE` armed these
statements raise `TC001`. With it off — production's default — they return **zero rows, silently**,
after the cutover: a SysAdmin tenant list showing no tenants, a notification send log showing no
sends, a cron sweep reporting `ok: true` having swept nothing.

Output: every survivor on a receiver that can actually serve it, the `app_admin` grant delta that
makes the ADMIN half work, one real grant for the `auth.users` statement, and a per-FILE
both-directions proof on staging as `app_user` with the tripwire armed.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/05-source-search.md
@.planning/quick/614-enumerate-policies-whose-or-branch-canno/614-SUMMARY.md
@.planning/quick/613-route-the-automationrule-admin-paths-to-/613-SUMMARY.md
@docs/audits/admin-connection.md
@docs/audits/policy-or-shortcircuit.md
@.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md
@apps/web/src/lib/db/admin-reasons.ts
@apps/web/tests/security/admin-connection-allowlist.test.ts
@apps/web/scripts/audit/613-routing-verify.ts
@apps/web/prisma/migrations/20260915150000_grant_automation_rule_to_app_admin/migration.sql
</context>

<established_facts>

**Measured during planning. Do NOT re-derive — but step 1 still requires each of the 48 to be
CHECKED against current code and the check REPORTED as a measurement, not assumed.**

### F1 — No commit has touched any blocker file since the audit

`git log 51f683eb..HEAD -- <the twelve blocker paths>` is **EMPTY**. The input list is expected to
re-verify intact at file level. Every line number in §2 of
`614/evidence/05-source-search.md` was re-grepped during planning and **every one still names the
statement the audit says it does**. That is a starting point for Task 1, not a substitute for it.

### F2 — The input list is 48 + 1, and the "+1" is the GRANT class

614 §7 counts **48 UNFLAGGED statements on a raising table** (§2.1 = 36, §2.2 = 12) and then counts
`support-tickets.ts:292` **separately** as "blocker statements of a DIFFERENT class (`42501`, not
`TC001`) — **1**". The brief's "48" therefore addresses 48 TC001 statements, and step 6's GRANT class
is the 49th. **Say this in the summary rather than letting the arithmetic look wrong.**

### F3 — A planning-time finding that changes the count: B-2 is NOT A RUNTIME STATEMENT

`app/(admin)/actions/sysadmin-invoices.ts:83`, read in full:

```ts
}): Promise<{ success: true; invoice: Awaited<ReturnType<typeof prisma.sysAdminInvoice.create>> } | { success: false; error: string }> {
```

It is a `typeof` in a **return-type annotation**. It is erased by the compiler, issues no SQL and can
never raise anything. 614 §2.1 B-2 counts it as a cutover blocker and it is not one — which is
exactly what step 1 exists to catch. **Verify this reading, then report it as a correction to 614
§2.1 and to the 48 (→ 47 runtime TC001 statements, §2.1 → 35).** The remedy is **NOTHING**: leave the
annotation alone, leave the `prisma` import alone (it is still used by the type), and record
`sysadmin-invoices.ts` as dropping off the blocker list. Do not "route" a type.

### F4 — Why `tenants.ts` is partly routed (step 3), from primary sources

- The routing commit is **`0c08a959 feat(600-02)` — quick-600**, not a later partial pass.
- All **seven** of its acquisitions are **MUTATIONS**: tenant create, status change ×2, profile
  update, settings update, trial extension, tenant delete. The 14 unrouted are **READS**, plus one
  `driverInvitation.create` and one `user.update` that ride inside read-shaped functions.
- quick-600's own `ROUTING-MANIFEST.md` states its candidate set explicitly: *"Every candidate
  `bypass-replacement-design.md` names, plus the two the design doc's own snapshot missed"*, and §2
  covers *"The 6 `"Tenant"` WRITE sites"* with *"B5 does not claim to have found every site, only to
  have routed the ones this task's candidate set names."* **It was a design-doc-derived census, not a
  file sweep.**
- It even **pre-reported one of the 14**: *"`createTenant` (`:98`) also creates a `DriverInvitation`
  two statements later (today's `:123`) … Left untouched — reported, not silently expanded into. It
  will break at the `app_user` cutover exactly like its neighbours."*
- **The sharpest evidence, measured during planning:** at `:191` `suspendTenant` acquires
  `adminDbSuspend`, uses it at `:192`, and then at **`:198`** issues `prisma.user.findMany` on the
  BARE client — *seven lines below an admin client that is still in scope*. `reactivateTenant`
  (`:232` / `:239`) is the identical shape. A file sweep could not produce that; a
  one-statement-per-named-candidate census does.

**So the answer is: a documented scope boundary, not carelessness — and one of the 14 was named in
advance.** Task 1 must verify each of these five claims and cite them. **It does NOT follow that the
14 are ADMIN**; that is precisely the assumption the brief forbids. Classify each on its own merits.

### F5 — The current per-file bare-statement counts, measured

| file | bare `prisma.` | `getAdminDb(` | blockers per 614 |
|---|---|---|---|
| `(admin)/actions/notifications.ts` | 17 | 0 | **9** — the `NotificationSendLog` ones only |
| `(admin)/actions/sysadmin-invoices.ts` | 1 | 10 | **0** after F3 |
| `(admin)/actions/tenants.ts` | 14 | 7 | 14 |
| `(admin)/actions/users.ts` | 5 | 0 | 5 |
| `(admin)/admin-support/page.tsx` | 1 | 0 | 1 |
| `(admin)/tenants/[id]/activation-progress-section.tsx` | 1 | 0 | 1 |
| `(admin)/tenants/[id]/automation-runs-section.tsx` | 1 | 0 | 1 |
| `(admin)/tenants/[id]/page.tsx` | 1 | 0 | 1 |
| `actions/support-tickets.ts` | 10 | 3 | 3 (+1 GRANT, +1 out-of-scope) |
| `api/cron/auto-close-tickets/route.ts` | 1 | 1 | 1 |
| `api/cron/automations/route.ts` | 7 | 0 | 7 |
| `lib/automations/evaluator.ts` | 5 | 0 | 4 |

**The bare count is not the blocker count.** `notifications.ts`'s other eight statements are on
`NotificationTemplate` / `NotificationEmailConfig`, both **RLS-OFF** (the Section 4.12 allowlist),
classified LATENT by 614 §3. `app_user` holds full DML on them from the Phase 1 grants, so they work
after the cutover. **Do not route the eight.** `evaluator.ts:95-96` and seven of
`support-tickets.ts`'s statements are **bypass-flagged** and exempted by
`tenant_context_required()`'s bypass arm — owned by the Phase 0 bypass programme, **not this task**.

### F6 — There IS a real TENANT class, and it is the "do not route what a tenant client can serve" rule biting

Read during planning:

- **`api/cron/automations/route.ts:187` and `:198`** are the dedup reads inside
  `for (const { tenantId } of candidates) {` — **`tenantId` is the loop variable**, and the very next
  statement in that loop is already `const tenantDb = await getTenantPrismaForOrg(tenantId);`
  (quick-600's own comment there reads *"CORRECT, not ROUTE. `tenantId` is the loop variable"*).
  A tenant client demonstrably serves them; `getAdminDb` must not.
- **`lib/automations/evaluator.ts:80`** is `automationRun.findFirst({ where: { ruleId, tenantId: event.tenantId } })`
  — `event.tenantId` in hand, and `:208` in the same file already uses
  `getTenantPrismaForOrg(run.tenantId)`.
- Their siblings are NOT in this class: `:53/:71/:89/:111` sweep `ActivationProgress`/`Subscription`
  across all tenants, `:170` reads a SYSTEM-scope rule before any tenant is known, `evaluator.ts:64`
  reads every `AppEvent`, `:73` every matching rule, `:131` every due run.

**The hazard to handle, and the reason this is its own task:** the acquisition currently sits INSIDE
the loop's `try`, whose `catch` calls `failures.record(...)` and lets the loop continue. Moving it
above the dedup read changes which failures that recorder attributes. **Prefer the smallest edit that
leaves control flow byte-identical — if that means acquiring the tenant client twice per candidate
(once for the dedup read, once for the create), take it and SAY SO in the summary.** Restructuring
the try/catch to share one acquisition changes error attribution and is out of scope. If neither
option leaves control flow identical, **STOP AND REPORT**.

### F7 — Several of the 14 need NO new acquisition

`:198` sits inside `suspendTenant`, where `adminDbSuspend` is already in scope; `:239` inside
`reactivateTenant` with `adminDbReactivate`. Per `admin-reasons.ts`'s own rule — **ONE MEMBER PER
ROUTED UNIT OF WORK, not one per call site** — these **reuse the existing local**, mint **no** new
reason and add **no** `getAdminDb(` call, so `tenants.ts`'s allowlist `calls` does not move for them.
The same test applies everywhere: a statement in a function that already holds an admin client is a
receiver swap, not a new acquisition.

### F8 — The grant delta is real, and `admin-connection.md` §2's list is already STALE

§2 lists 17 tables. It does **not** list `AutomationRule` (added by quick-613), nor
`NotificationSendLog`, nor `ActivationProgress`. And several listed grants are too narrow for what
this task routes:

| table | §2 says | what this task's routed statements need |
|---|---|---|
| `User` | SELECT | **+ UPDATE** (`users.ts:115`, `:130`; `tenants.ts:480`) |
| `DriverInvitation` | SELECT | **+ INSERT** (`tenants.ts:123`), **+ UPDATE** (`:376`) |
| `NotificationSendLog` | *absent* | **SELECT** (9 statements, incl. `count`/`groupBy`) |
| `ActivationProgress` | *absent* | **SELECT** (cron `:53/:71/:89`, section component `:20`) |
| `Tenant`, `Load`, `SupportTicket`, `TicketMessage`, `Subscription`, `AppEvent`, `AutomationRun` | present | verify each operation against the routed statement |

**CLAUDE.md and the orchestrator brief both repeat §2's list and both are stale.** The AUTHORITY is
the live `information_schema.role_table_grants` on staging — the same family as *"read
`pg_constraint`, never a comment about them"*. **Measure the delta; do not copy a list.**
And quick-600 §5: a **trigger fired by a granted statement needs its own grants**, and only a REAL
exercise of the statement proves the grant set complete.

### F9 — The `auth.users` statement, read in full

`actions/support-tickets.ts:290-292`, the third element of a `Promise.all` whose other two elements
are `:286` (`"User"`) and `:288` (`"Tenant"`), inside the sysadmin ticket-list function that also
owns `:271`:

```ts
prisma.$queryRaw<RawAuthUser[]>`
  SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ANY(${userIds}::uuid[])
`,
```

**Exactly three columns**, used as a display-name/email fallback. 614 §2.3 measured on staging:
`auth.users` has RLS enabled with **0 policies**, `app_user` holds **no grant** on it and
`has_schema_privilege('app_user','auth','USAGE')` is **false** — so at cutover it fails **`42501`,
not `TC001`**, and the tripwire will never signal it.

**Routing it to `getAdminDb` does not fix it.** `app_admin` has `BYPASSRLS` but
`admin-connection.md` §2 is explicit that **GRANTs are the only remaining control** on that
connection — verify whether `app_admin` holds any `auth` privilege; the expectation is that it does
not. Either way the remedy is a grant.

### F10 — Environment and instrument

- Staging ref **`wyixpgunnjmzguhggocz`** · production ref **`oqdhberkghtnszrkdvfm`**.
- `apps/web/.env.staging` (gitignored) carries `STAGING_DATABASE_URL_APP_USER`,
  `STAGING_DATABASE_URL_ADMIN`, `STAGING_DIRECT_URL`, `TENANT_CONTEXT_TRIPWIRE=on`.
  **It contains a live credential — never echo its contents; mask every connection string printed
  anywhere.**
- `app_user`: `rolbypassrls=false, rolcanlogin=true`. `app_admin`: `rolbypassrls=true`.
- Arming the tripwire on a connection is
  `SELECT set_config('app.tenant_context_tripwire','on',false)` — a session-level `SET` is the only
  arming mechanism there is (quick-602). **Never disarm it.**
- `ADMIN_ALLOWLIST` today: **23 entries, `TOTAL_EXPECTED_CALLS = 48`** (read off the file's own
  literal and both assertions). The brief's "24" is wrong; 614 §4 already corrected it.
- `getTenantPrismaForOrg(tenantId)` = `assertRoleBootGuard()` + a session-scope
  `set_config('app.current_tenant_id', …, false)` + `createTenantClient(tenantId, userId ?? null)`.
  **Call it with NO `userId`** unless audit columns are wanted — `getTenantPrisma()` forwards
  `session.userId` into the audit-columns extension and would start writing
  `createdById`/`updatedById`, *a behaviour change wearing a routing fix's clothes* (quick-610).

### F11 — Out of scope, enumerate with a verdict, do not touch

- **`actions/support-tickets.ts:563`** (`getUnreadAdminReplyCount`) — an OWNER-portal count that has
  `session.tenantId` in hand, hardcodes it into the SQL, and issues it on the **bare** client with no
  `set_config`. 614 §2.4 classifies it a **latent wrong-answer site, not a cutover blocker** (its
  fate depends on whatever the pooled connection last held — quick-602's *"the bare Prisma client is
  NOT context-free"*). It is not one of the 48. **Report it; do not route it.**
- **B7 / B8** (both `generateTicketNumber` copies, `lib/auth/supabase.ts:164`) — bypass-flagged,
  invisible to the tripwire, broken at the **bypass drop**, not at the cutover.
- The eight RLS-OFF statements in `notifications.ts`, the four in `plans.ts`, the two in `promos.ts`.

</established_facts>

<constraints>

**Repeated because each has cost this repo a task.**

- **NEVER write to production** (`oqdhberkghtnszrkdvfm`). Staging writes are permitted for migrations
  and probe fixtures only. Every instrument refuses POSITIVELY — the string must contain the staging
  ref — and hard-stops on the production ref before issuing any statement.
- **Install nothing.**
- **Do not route a statement to `getAdminDb` that a tenant client can serve** (F6).
- **Do not change what any statement returns on success.** `select` / `include` / `where` / ordering
  / error handling / return values stay byte-identical. **Only the receiver changes.**
- **Do not grant `auth` schema USAGE without enumerating what it exposes.** No unqualified
  `GRANT SELECT ON auth.users` — column-level, or a definer function, or nothing.
- **Do not begin the bypass drop or the cutover.** `bypass_rls_policy` must be **86** before and
  after, compared as a **sorted TABLE LIST**, never as a count alone.
- **Do not weaken any guard to go green** — not the allowlist, not a `minBytes` floor, not an
  integrity floor, not the drift detector.
- **Never import `scripts/_bootstrap-env`** (quick-607): it used to repoint `DATABASE_URL` at
  `DIRECT_URL`, and every env file here points `DIRECT_URL` at PRODUCTION. Load
  `apps/web/.env.staging` explicitly. Print the resolved project ref to **STDERR** (stdout carries
  JSON that gets piped), credential MASKED.
- **ONE TRANSACTION PER PROBE CELL.** A `TC001` aborts its transaction and every later statement on
  it returns `25P02`, silently corrupting the rest of the matrix.
- **SQLSTATE off `err.cause.code`, never `err.code`** — Prisma surfaces a `DriverAdapterError` whose
  own `code` is `undefined`; walk the cause chain (a raw `pg` error carries `code` at top level, so
  one walker serves both). Recognise `TC001` by **CODE, never by message prose**.
- **Every zero needs a counter-read** (quick-599 D3 — an RLS-refused UPDATE/DELETE is a silent 0
  rows, indistinguishable from "the row does not exist"), and **every `foreign === 0` is paired with
  an `own > 0`** on the same connection in the same transaction (quick-610 — a cross-tenant
  assertion over an empty set is worse than nothing).
- For a `count(*)` probe report the **SCALAR**, never `rowCount` (which is 1 for every count query).
- **Do not disarm the tripwire.** Read it back and report its value.
- **Do not `git push`.**
- **If a statement cannot be classified confidently, STOP AND REPORT it** rather than guessing.

</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Re-verify all 48 against current code and classify every survivor — NO EDITS</name>
  <files>
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/01-reverification.md
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/01-classification.json
  </files>
  <action>
**This task makes no source edits.** It produces the input every later task consumes.

**Step A — re-verify each of the 48.** Take §2 of
`.planning/quick/614-enumerate-policies-whose-or-branch-canno/evidence/05-source-search.md` as the
input list, statement by statement (B-1 … B-12), and for EACH one record:

| field | how |
|---|---|
| `id` | `B-3/:198` style — audit item plus line |
| `file`, `line` | current, re-grepped |
| `statement` | the actual text, read — not the audit's paraphrase |
| `verdict` | `PRESENT` · `MOVED` (with the commit that moved it) · `ALREADY ROUTED` (with the commit) · `NOT A RUNTIME STATEMENT` |
| `receiver_today` | `bare prisma` · `tx (admin)` · `tx (tenant GUC)` · `tx (bypass)` · `adminDb` |
| `table(s)` | mapped through `schema.prisma` (`@@map`, else PascalCase) |

Start from `git log 51f683eb..HEAD -- <path>` per blocker file (F1 says it is empty — **confirm it,
print it, and say so**), then confirm each line individually. A line that still matches is a
measurement; record it as one.

**F3 is the one you are expected to find.** `sysadmin-invoices.ts:83` is a `typeof` inside a return
type annotation. Verify by reading the line, classify it `NOT A RUNTIME STATEMENT`, remedy
**NOTHING**, and report the correction to 614 §2.1 explicitly: **48 → 47 runtime TC001 statements,
§2.1 36 → 35, and `sysadmin-invoices.ts` drops off the blocker file list (12 → 11 files).** If the
reading is wrong, say so and keep the 48.

Also reconcile F2 in writing: the brief's "48" is 614's 48 TC001 statements; `support-tickets.ts:292`
is a **49th** statement of a different class. The summary must not leave that arithmetic looking
broken.

**Step B — classify every survivor.** Exactly one of:

- **TENANT** — a tenant id is available AT THAT POINT, in scope, without changing a function
  signature. Receiver: `getTenantPrismaForOrg(tenantId)` with **no `userId`**.
- **ADMIN** — genuinely cross-tenant, or runs with no tenant by design (sysadmin surfaces reading
  arbitrary tenants; all-tenant cron sweeps). Receiver: `getAdminDb(reason)`.
- **GRANT** — the failure is a missing privilege, not a missing context (`:292`).

Two decision rules, applied in this order:
1. **Can a tenant client serve it?** If yes it is TENANT, full stop — that is the brief's explicit
   prohibition. F6 names the three expected members (`cron/automations:187`, `:198`,
   `evaluator.ts:80`); check every other statement against the same test rather than assuming the
   list is complete.
2. **Would serving it require threading a tenant through a function signature?** Then it is a
   **STOP-AND-REPORT**: list it in its own section with what the signature change would be, and
   route NOTHING.

Record per statement a **one-line reason**, and note where a statement sits inside a function that
already holds an admin client (F7) — those are receiver swaps needing no new acquisition, no new
reason and no allowlist count change. Flag them, because Tasks 2 and 3 depend on the distinction.

**Step C — report the counts.** Per class, and per file. Also produce, per file, the planned
delta: new `getAdminDb(` acquisitions, reuses of an existing local, new `AdminReason` members, new
`getTenantPrismaForOrg` calls, whether the file is new to `ADMIN_ALLOWLIST`, and every table it
touches with the operation needed.

**Step D — answer step 3 (`tenants.ts`).** Verify each of F4's five claims against primary sources
and quote them:
- `git log --oneline -- "apps/web/src/app/(admin)/actions/tenants.ts"` → name the routing commit;
- `git show <commit> -- <path>` → confirm all seven acquisitions are MUTATIONS;
- quote `ROUTING-MANIFEST.md`'s candidate-set sentence and its §2 "does not claim to have found every
  site" sentence;
- quote its pre-report of `:123`'s `DriverInvitation`;
- show `:191/:192/:198` and `:232/:239` — an admin local in scope seven lines above a bare read.

State the conclusion plainly: **a documented scope boundary, not carelessness.** Then state, equally
plainly, that this **does not** make the 14 ADMIN, and point at Step B's per-statement verdicts.

Write `01-reverification.md` (prose + tables) and `01-classification.json` (the machine-readable
per-statement record). Commit both.
  </action>
  <verify>
```bash
cd "C:/Users/sammy/Projects/DriveCommand"
git log --oneline 51f683eb..HEAD -- \
  "apps/web/src/app/(admin)/actions/notifications.ts" \
  "apps/web/src/app/(admin)/actions/sysadmin-invoices.ts" \
  "apps/web/src/app/(admin)/actions/tenants.ts" \
  "apps/web/src/app/(admin)/actions/users.ts" \
  "apps/web/src/app/(admin)/admin-support/page.tsx" \
  "apps/web/src/app/(admin)/tenants/[id]" \
  "apps/web/src/actions/support-tickets.ts" \
  "apps/web/src/app/api/cron/auto-close-tickets/route.ts" \
  "apps/web/src/app/api/cron/automations/route.ts" \
  "apps/web/src/lib/automations/evaluator.ts"      # expected: EMPTY — print it either way
node -e "const j=require('./.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/01-classification.json');console.log(j.statements.length, JSON.stringify(j.counts))"
git diff --stat HEAD~1 -- apps/web/src   # MUST be empty — this task edits no source
```
  </verify>
  <done>
All 48 input statements carry a verdict against current code, with the commit named for anything that
moved; `sysadmin-invoices.ts:83` is classified `NOT A RUNTIME STATEMENT` with the corrected counts
stated; every survivor is classified TENANT / ADMIN / GRANT with a one-line reason; per-class and
per-file counts are reported; STOP-AND-REPORT statements are listed separately and routed nowhere;
step 3 is answered from primary sources with quotes. No source file is modified. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 2: tenants.ts FIRST — route its 14 on their own merits</name>
  <files>
apps/web/src/app/(admin)/actions/tenants.ts
apps/web/src/lib/db/admin-reasons.ts
apps/web/tests/security/admin-connection-allowlist.test.ts
  </files>
  <action>
The brief orders this file first. Use Task 1's per-statement verdicts — **do not re-decide them here,
and do not apply a file-level verdict**.

**Edit 1 — `admin-reasons.ts`.** Add members **only** for units of work that have none, under the
existing `── SysAdmin tenant management ──` heading. **ONE PER UNIT OF WORK.** Expect reads to
cluster: the tenant list, the platform stats block (`:271/:272/:278/:283` are one `Promise.all`, one
unit of work, **one** reason and **one** acquisition), the tenant detail read, the invitation admin
(`:355/:364/:376` — one function, one unit of work), the user detail+update pair (`:472/:480`).
Reason strings say what the path DOES; never "bypass", never "cross-tenant" as the whole string,
never that it needs admin. Carry a short `// quick-615 —` comment block in the style of the existing
quick-606/613 ones, stating why these are cross-tenant.

**`:198` and `:239` mint NOTHING** (F7): `adminDbSuspend` / `adminDbReactivate` are already in scope.
Swap the receiver only. Verify the local is genuinely in scope at that line before relying on it.

**`:123`** is the `DriverInvitation` create inside `createTenant`, which already holds `adminDb` from
`:100` — check scope; if it is in scope, reuse it and mint nothing. Quote quick-600's pre-report of
this exact statement in the code comment.

**Edit 2 — `tenants.ts`.** Change only which client each statement uses. Every `select`, `where`,
`include`, `orderBy`, return value and `revalidatePath` stays byte-identical. Place each new
acquisition immediately before the first statement of its unit of work, after any guard
(`requireAdminAccess()` stays exactly where it is). Name new locals distinctly — `adminDbSuspend`,
`adminDbReactivate`, `adminDb` already exist in their own block scopes, so check for shadowing and
rename the NEW one if tsc complains. **Do not rename an existing local.**

**Do NOT remove `import { prisma } from '@/lib/db/prisma';`** unless a grep proves zero remaining
`prisma.` usages in the file after the edits. Check, then decide.

**Edit 3 — the allowlist.** `'app/(admin)/actions/tenants.ts': { calls: 7, … }` rises by the number
of NEW `getAdminDb(` calls — count them with a grep, do not compute from intent. Update
`TOTAL_EXPECTED_CALLS` to the new real sum. Entry count stays 23 (this file is already on the list).
`minBytes` stays at 15000 (the file only grows). **Never widen anything to make a run green.**

If any of the 14 came out **TENANT** in Task 1, route it to `getTenantPrismaForOrg(tenantId)` with no
`userId` and say so here rather than forcing it onto the admin connection.

Grants are **Task 5**. This commit leaves the file routed-but-possibly-ungranted on staging; that is
intentional and is exactly what Task 5's `--before` lane measures.
  </action>
  <verify>
```bash
cd apps/web
grep -n "prisma\." "src/app/(admin)/actions/tenants.ts"       # every survivor must be intentional; list them
grep -c "getAdminDb(" "src/app/(admin)/actions/tenants.ts"    # must equal the new allowlist `calls`
npx vitest run tests/security/admin-connection-allowlist.test.ts   # must PASS
npx tsc --noEmit                                              # Task 6 owns the blindness protocol
git diff -- "src/app/(admin)/actions/tenants.ts" | grep -E "^[-+].*(select|where|include|orderBy|revalidatePath)" || echo "NO QUERY-SHAPE LINES CHANGED"
```
  </verify>
  <done>
All 14 `tenants.ts` statements are on a receiver that can serve them, each per its own Task 1 verdict;
`:198`/`:239` (and `:123` if in scope) reuse the existing admin local and mint no reason; new
`AdminReason` members are one-per-unit-of-work; the allowlist `calls` and `TOTAL_EXPECTED_CALLS`
match a grep; no query shape, return value or error handling changed. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 3: The rest of the ADMIN class — per file</name>
  <files>
apps/web/src/app/(admin)/actions/notifications.ts
apps/web/src/app/(admin)/actions/users.ts
apps/web/src/app/(admin)/admin-support/page.tsx
apps/web/src/app/(admin)/tenants/[id]/activation-progress-section.tsx
apps/web/src/app/(admin)/tenants/[id]/automation-runs-section.tsx
apps/web/src/app/(admin)/tenants/[id]/page.tsx
apps/web/src/actions/support-tickets.ts
apps/web/src/app/api/cron/auto-close-tickets/route.ts
apps/web/src/app/api/cron/automations/route.ts
apps/web/src/lib/automations/evaluator.ts
apps/web/src/lib/db/admin-reasons.ts
apps/web/tests/security/admin-connection-allowlist.test.ts
  </files>
  <action>
Same three deliberate edits (`admin-connection.md` §8), applied per file, driven by Task 1's verdicts.
**Route only the ADMIN-class statements. The TENANT class is Task 4. The GRANT class is Task 5.**

**Per-file notes — verify each before acting:**

- **`notifications.ts`** — route the **NINE** `NotificationSendLog` statements (`:250`, `:256`,
  `:346`, `:349`, `:352`, `:355`, `:360`, `:362`, `:369`) and **NOT** the eight
  `NotificationTemplate` / `NotificationEmailConfig` ones (F5 — RLS-OFF, LATENT, they work after the
  cutover). Expect **two** units of work: the send-log list+count pair (`:250`/`:256`, one
  `Promise.all`) and the delivery-statistics block (`:346`–`:369`, one `Promise.all`) — confirm by
  reading, then mint accordingly. The file stays MIXED and keeps its `prisma` import; say so in a
  comment so the next reader does not "finish the job".
- **`users.ts`** — all five. `:102`/`:115`/`:130` and `:144` may be one unit of work; read the
  functions. Note `:115`/`:130` are **UPDATEs** — record `User: UPDATE` for Task 5.
- **`admin-support/page.tsx`**, **`tenants/[id]/page.tsx`**, **`activation-progress-section.tsx`**,
  **`automation-runs-section.tsx`** — one statement each, each a new `ADMIN_ALLOWLIST` **file entry**.
  Precedent for `.tsx` entries: `app/track/[token]/page.tsx`, `app/(admin)/billing/[id]/page.tsx`.
  For `automation-runs-section.tsx`, state 614 §2.1 B-7's asymmetry in the comment: quick-613 routed
  the `/automations` screen's run list and this byte-similar one was never in that task's census.
- **`actions/support-tickets.ts`** — the three raw reads `:271` (`$queryRawUnsafe` over
  `"SupportTicket"`), `:286` (`"User"`) and `:288` (`"Tenant"`). They are one unit of work with
  `:292`; add **ONE** acquisition covering all of them and use it for `:292` too, **for the reason
  argued in Task 5** — splitting a single `Promise.all` across two connections is quick-561's *fixing
  one bell and leaving the other*. `calls: 3 → 4`. **Do not touch the seven bypass-flagged statements
  and do not touch `:563`** (F11).
- **`auto-close-tickets/route.ts`** — `:25`, the read half of the two-mechanism file quick-602
  measured raising. `:57` already holds `getAdminDb('auto-close stale ticket sweep')` — **check
  whether it is in scope at `:25`**; if not, add one acquisition **reusing that same reason** (same
  unit of work, no new member) and raise `calls: 1 → 2`.
- **`api/cron/automations/route.ts`** — ADMIN for `:53`, `:71`, `:89`, `:111` (all-tenant candidate
  sweeps) and `:170` (SYSTEM-scope rule lookup before any tenant is known). The four candidate
  queries are four separate `candidateQuery` closures — decide whether they are one unit of work
  (they are four spellings of the same sweep) and prefer ONE reason. `:187`/`:198` are **Task 4**.
- **`lib/automations/evaluator.ts`** — ADMIN for `:64`, `:73`, `:131`. `:80` is **Task 4**. `:95-96`
  is bypass-flagged — **do not touch it**.

**Rules that bind every file here:**
- Receiver changes only. `select`/`where`/`include`/`orderBy`/`take`/error handling/return values
  byte-identical.
- One `AdminReason` per unit of work; reuse an existing member when the unit of work already has one.
- Remove the `prisma` import **only** when a grep proves zero remaining `prisma.` usages.
- Every new file joins `ADMIN_ALLOWLIST` with a `minBytes` floor set **below** its measured size
  (measure with `wc -c`; pick a round number ~20-30% under, never above).
- Entry count and `TOTAL_EXPECTED_CALLS` both rise to the **real measured** numbers; update the two
  integrity-floor assertions to match. Never widen to go green.

Commit per file or in one commit — either is fine, but the allowlist must be green at every commit.
  </action>
  <verify>
```bash
cd apps/web
for f in "src/app/(admin)/actions/notifications.ts" "src/app/(admin)/actions/users.ts" \
         "src/app/(admin)/admin-support/page.tsx" "src/app/(admin)/tenants/[id]/page.tsx" \
         "src/app/(admin)/tenants/[id]/activation-progress-section.tsx" \
         "src/app/(admin)/tenants/[id]/automation-runs-section.tsx" \
         "src/actions/support-tickets.ts" "src/app/api/cron/auto-close-tickets/route.ts" \
         "src/app/api/cron/automations/route.ts" "src/lib/automations/evaluator.ts"; do
  echo "== $f  getAdminDb=$(grep -c 'getAdminDb(' "$f")  bare=$(grep -c 'prisma\.' "$f")  bytes=$(wc -c <"$f")"
done
grep -c "notificationTemplate\|notificationEmailConfig" "src/app/(admin)/actions/notifications.ts"   # the 8 must still be on `prisma.`
npx vitest run tests/security/admin-connection-allowlist.test.ts   # must PASS
npx tsc --noEmit
```
  </verify>
  <done>
Every ADMIN-class statement outside `tenants.ts` is on `getAdminDb`; the eight RLS-OFF statements in
`notifications.ts`, the seven bypass-flagged ones in `support-tickets.ts`, `:563`, and
`evaluator.ts:95-96` are untouched and named as untouched; new files are on the allowlist with real
`minBytes` floors; entry count and `TOTAL_EXPECTED_CALLS` match a grep; the allowlist test passes.
Committed.
  </done>
</task>

<task type="auto">
  <name>Task 4: The TENANT class — the statements a tenant client can serve</name>
  <files>
apps/web/src/app/api/cron/automations/route.ts
apps/web/src/lib/automations/evaluator.ts
  </files>
  <action>
Route Task 1's TENANT-class statements — expected to be `cron/automations:187`, `:198` and
`evaluator.ts:80` (F6), plus anything else Task 1 found. **A statement whose tenant would have to be
threaded through a function signature is NOT routed here — it is a STOP-AND-REPORT.**

Receiver: **`getTenantPrismaForOrg(tenantId)` with NO `userId`** (F10 / quick-610 — passing a userId
starts writing `createdById`/`updatedById`, a behaviour change wearing a routing fix's clothes).
`evaluator.ts` already imports it; `cron/automations/route.ts` already imports it.

**Control flow is the constraint, and it is why this is its own task** (F6). The existing acquisition
sits inside the loop's `try`, whose `catch` calls `failures.record(...)` and continues. Take the
smallest edit that leaves control flow **byte-identical**:

1. Preferred: acquire a client for the dedup read where the dedup read is, and **leave the existing
   in-`try` acquisition exactly as it is** — two acquisitions per candidate, one extra `set_config`
   round trip per candidate iteration. `getTenantPrismaForOrg` is a `set_config` plus a client
   wrapper, so the cost is one statement, and **correct error attribution is worth one statement**.
   **Say so explicitly in a code comment and in the summary** — do not let it look accidental.
2. Rejected, and record the rejection: hoisting one shared acquisition above the `try` changes which
   failures `failures.record` attributes and which iteration `continue`s. That is a behaviour change.
3. If neither leaves control flow identical, **STOP AND REPORT**.

Same for `evaluator.ts:80` — it sits in the `for (const rule of rules)` loop with `event.tenantId` in
hand, above a `try` that already has its own error handling. Acquire where the statement is.

**A GUC-ordering note to record, not to fix:** `getTenantPrismaForOrg` writes a SESSION-scope GUC on
the `max: 1` tenant pool, so after these loops the pooled connection carries the last candidate's
tenant. Any BARE statement running afterwards inherits it (quick-602). After Tasks 2-4 there should
be **no** bare statement left on these paths — **verify that with a grep and state it**, because the
inheritance is only harmless if nothing is left to inherit it.

Query shapes stay byte-identical. No new `AdminReason`, no allowlist change (these files' `calls`
change only from Task 3's ADMIN routing).
  </action>
  <verify>
```bash
cd apps/web
grep -n "getTenantPrismaForOrg\|prisma\." "src/app/api/cron/automations/route.ts"
grep -n "getTenantPrismaForOrg\|prisma\." "src/lib/automations/evaluator.ts"   # only :95-96 bypass-flagged should remain bare
git diff -- src/app/api/cron/automations/route.ts src/lib/automations/evaluator.ts | grep -E "^[-+].*(try|catch|continue|failures\.record)" || echo "CONTROL FLOW UNCHANGED"
npx tsc --noEmit
```
  </verify>
  <done>
Every TENANT-class statement runs on `getTenantPrismaForOrg(tenantId)` with no `userId`; control flow
— `try`, `catch`, `continue`, `failures.record` attribution — is unchanged and the diff proves it; the
double-acquisition trade is stated in a comment; any statement needing a signature change is reported
and routed nowhere; the residual-bare-statement grep is recorded. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 5: The grants — the app_admin delta, the auth.users decision, applied to staging with hand-written ledger rows</name>
  <files>
apps/web/scripts/audit/615-routing-verify.ts
apps/web/prisma/migrations/20260915160000_grant_cutover_routing_tables_to_app_admin/migration.sql
apps/web/prisma/migrations/20260915170000_grant_auth_user_display_columns/migration.sql
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/02-before.md
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/02-before.json
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/03-grants-and-auth-exposure.md
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/04-ledger-readback.md
  </files>
  <action>
**Read `apps/web/scripts/audit/613-routing-verify.ts` first and model `615-routing-verify.ts` closely
on it** — its env loading, its positive staging refusal, its masked STDERR banner, its
`sqlstateOf(e)` cause-chain walker, its `BEGIN … ROLLBACK` per probe, its committed-fixture/teardown
shape, its guarded `--apply`, its ledger writer. Modes: `--before`, `--apply`, `--after`.

**Step A — measure the live grant state, then the delta.**

```sql
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('app_admin','app_user')
order by table_name, grantee, privilege_type;
```

Build the required set from Task 1's per-file table×operation record — **the routed statements are
the authority, not `admin-connection.md` §2's prose list, which F8 shows is already stale** (missing
`AutomationRule`, `NotificationSendLog`, `ActivationProgress`; `User` SELECT-only against two routed
UPDATEs; `DriverInvitation` SELECT-only against a routed create and update). Report the delta as a
table: table · needed · held · missing. **Report §2's staleness as a correction** — quick-610's
precedent of correcting a document's own count in public.

**Step B — capture `--before`.** Run every ADMIN-class statement's SQL shape on the `app_admin`
connection, in its own transaction, and record the SQLSTATE. Expect `42501` on every ungranted table.
Also capture the tenant lane's pre-state. This is the half that proves the grant was mandatory rather
than decorative. Write `02-before.{md,json}`.

**Step C — the `auth.users` decision (step 6 of the brief). Measure before arguing.**

```sql
select has_schema_privilege('app_user','auth','USAGE'),
       has_schema_privilege('app_admin','auth','USAGE');
select table_name from information_schema.tables where table_schema='auth' order by 1;
select grantee, table_name, privilege_type from information_schema.role_table_grants
  where table_schema='auth' and grantee in ('app_user','app_admin','PUBLIC') order by 1,2,3;
select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, array_to_string(p.proacl,',') as acl
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='auth' order by 1;
select column_name from information_schema.columns where table_schema='auth' and table_name='users' order by ordinal_position;
```

Then **ENUMERATE, in writing, what `USAGE ON SCHEMA auth` exposes** before granting anything:
- the full `auth` table list as measured (GoTrue typically carries `users`, `sessions`,
  `refresh_tokens`, `identities`, `mfa_factors`, `one_time_tokens`, `sso_providers`,
  `saml_relay_states` and more) — **name them from the catalog, not from memory**;
- that USAGE is the **gate**: it makes any `auth` function whose ACL grants `PUBLIC EXECUTE` callable
  by the role, and it makes any FUTURE accidental table grant in that schema take effect. Report the
  `PUBLIC EXECUTE` findings from `pg_proc.proacl` explicitly;
- the full `auth.users` column list, so "what a table-level SELECT would expose" is a list a reader
  can see — including `encrypted_password`, `confirmation_token`, `recovery_token`.

**An unqualified `GRANT SELECT ON auth.users` is forbidden.** Choose between, and argue:

1. **Column-level grant (the expected answer):**
   `GRANT USAGE ON SCHEMA auth TO <role>; GRANT SELECT (id, email, raw_user_meta_data) ON auth.users TO <role>;`
   — exactly the three columns the statement already reads. **State plainly that USAGE is a
   PREREQUISITE** of the column grant: without it the role cannot reference the object at all. Verify
   with `has_schema_privilege` after applying, and **MEASURE that the real statement now runs** —
   `SELECT id, email, raw_user_meta_data FROM auth.users WHERE id = ANY($1::uuid[])` — and that
   `SELECT encrypted_password FROM auth.users` is **refused 42501** on the same connection. The
   second half is the one that makes the first half mean something.
2. **A `SECURITY DEFINER` function in `public`** returning only those three columns for an id array,
   with `EXECUTE` granted to the role and **no `auth` USAGE at all** — the narrower answer, and the
   **quick-601 precedent** (which replaced a bypass on the sign-up path with narrow definer functions
   for exactly this reason). Its cost: it changes the call site's SQL, which brushes against *"do not
   change what any statement returns on success"* — the returned rows would be identical but the
   statement would not.

**State both, choose one, and give the reason.** Grant to the **narrowest role that needs it** — i.e.
the role that will actually issue the statement after Task 3 routed its three `Promise.all` siblings.
`getAdminDb` is NOT the fix (F9: `app_admin` has `BYPASSRLS` but grants are its only remaining
control, and it has no `auth` privilege either) — **verify that and quote the measurement**, because
it is the whole reason the brief separates this class.

**Step D — the migration files.** Two files, each with a header explaining WHY, modelled on
`20260915150000_grant_automation_rule_to_app_admin/migration.sql`:

- `20260915160000_grant_cutover_routing_tables_to_app_admin/migration.sql` — the measured
  per-table/per-operation delta, alphabetised, **never `GRANT ALL`, never `ALL TABLES IN SCHEMA`,
  never `ALTER DEFAULT PRIVILEGES`**, each statement wrapped in the `pg_roles` guard so it is a no-op
  where the role does not exist.
- `20260915170000_grant_auth_user_display_columns/migration.sql` — the chosen `auth` remedy, same
  guard, with the exposure enumeration reproduced in the header. **Omit this file entirely if the
  definer-function route is chosen instead** and put that object in a correspondingly-named migration.

Headers must state: the routed sites each grant serves, by function name; that the held set was
measured against `information_schema.role_table_grants` on staging BEFORE the file was written; why
each operation and no more; and that the file reaches production on the next `vercel --prod` via
`scripts/migrate.mjs`, which is intended.

**No policy DDL in either file.** Neither changes a policy, so `rls-policy-drift` must stay ZERO and
`rls-policy-canonical.json` must NOT be regenerated.

**Step E — apply through the guarded `--apply`.** Never a bare `execute_sql`. The guard must
**strip `--` comments first** (quick-612 refused its own migration on a phrase inside its header;
quick-600 hit the identical trap) — and these headers will contain the words `ALL`, `INSERT` and
`DELETE` while explaining why they are excluded, so the strip is load-bearing. After stripping,
refuse on: any `CREATE POLICY`/`DROP POLICY`; `GRANT ALL`; `ALL TABLES IN SCHEMA`;
`ALTER DEFAULT PRIVILEGES`; any `GRANT` naming an operation not in the measured delta; any connection
string not naming the staging ref.

**Step F — the DEC-17 ledger rows, one per migration.** Neither MCP tool writes Prisma's
`_prisma_migrations`; `apply_migration` records into **Supabase's own, different** ledger. Write each
row by hand: `checksum` = real **SHA-256 of `migration.sql` over LF bytes** (normalise CRLF → LF;
`core.autocrlf=true` here), `logs = ''`, `started_at = finished_at`, **`applied_steps_count = 0`**.
Then **confirm a SENTINEL of known-good existing rows is visible FIRST** — `_prisma_migrations` has
RLS enabled with zero policies and no `app_user` grant, so an empty read from a non-owner role is
indistinguishable from absence and would invite a duplicate write — then read back and assert the
checksum is a real SHA-256 (not `'manual'`), `applied_steps_count === 0`,
`started_at === finished_at`, and HEAD IS OURS. Write `04-ledger-readback.md` following
`613-SUMMARY.md` §4's procedure.

**Production is NEVER written.** Both files are committed and await a human's `vercel --prod`.
  </action>
  <verify>
```bash
cd apps/web
npx tsx scripts/audit/615-routing-verify.ts --before    # staging only; refuses production positively
npx tsx scripts/audit/615-routing-verify.ts --apply     # guarded; comments stripped before the checks
# then, on staging:
#   role_table_grants for app_admin shows exactly the measured delta and nothing more
#   has_schema_privilege('<role>','auth','USAGE')  -> as chosen, and REPORTED
#   SELECT id,email,raw_user_meta_data FROM auth.users ... -> succeeds
#   SELECT encrypted_password FROM auth.users ...          -> 42501
#   ledger: sentinel visible, both rows read back, applied_steps_count = 0
```
  </verify>
  <done>
The `app_admin` grant delta is measured against the live catalog (not §2's prose), shipped as one
guarded migration, and proven mandatory by a `--before` lane of `42501`s; §2's staleness is reported
as a correction. The `auth` remedy is a grant, chosen between a column-level grant and a definer
function with both stated, preceded by a catalog enumeration of every `auth` table, the `PUBLIC
EXECUTE` function ACLs and every `auth.users` column, and proven by a positive read of the three
columns AND a 42501 on `encrypted_password`. Ledger rows hand-written with `applied_steps_count = 0`
and read back after a sentinel. Production unwritten. Committed.
  </done>
</task>

<task type="auto">
  <name>Task 6: Prove per FILE on staging, witness the allowlist red, run every gate, write up</name>
  <files>
apps/web/scripts/audit/615-routing-verify.ts
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/05-after.md
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/05-after.json
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/06-allowlist-gate-fires.md
.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/07-gates.md
.planning/quick/615-route-the-48-unscoped-statements-that-re/615-SUMMARY.md
  </files>
  <action>
**Step A — the per-FILE both-directions proof (`--after`), tripwire ARMED.**

Batch by FILE, as the brief asks — **but EVERY FILE MUST APPEAR**, including the ones that dropped off
the list, each with its verdict. Per file, per routed statement, three lanes:

| lane | connection | context | expectation |
|---|---|---|---|
| **NEW RECEIVER** | `app_admin`, or `app_user` under a REAL tenant GUC for the TENANT class | as routed | **SUCCEEDS, rows > 0** |
| **OLD RECEIVER (∅)** | `app_user`, EMPTY GUC — what a sysadmin request actually carries | tripwire ARMED | **`TC001`**, measured by code |
| **CROSS-TENANT** | `app_user` under tenant B's GUC | tripwire ARMED | **`foreign === 0` PAIRED with `own > 0`** in the same transaction |

Mechanics that are not negotiable:
- Arm with `SELECT set_config('app.tenant_context_tripwire','on',false)` and **read it back and
  report the value**. Never disarm it.
- **ONE TRANSACTION PER CELL** — a `TC001` aborts its transaction and turns every later statement on
  it into `25P02`, silently corrupting the matrix.
- SQLSTATE off `err.cause.code` via a cause-chain walker; `TC001` by CODE, never prose.
- Every zero gets a **privileged counter-read on a separate connection while the probe transaction is
  still open**, proving the rows exist unchanged.
- `count(*)` probes report the **SCALAR**, never `rowCount`.
- **Fixtures where staging is sparse** (quick-610: a must-SUCCEED half over an empty set is vacuous;
  quick-613 needed them for `AutomationRun`). Create them COMMITTED on the privileged connection,
  probe inside `BEGIN … ROLLBACK`, tear down in a `finally` with an asserted `left === 0`. **Do not
  create `auth.users` rows** — if staging holds none, mark that cell **UNPROVEN and say so** rather
  than fabricating an identity.
- Assert an invariant at entry and exit that this task must never destroy — e.g. the SYSTEM
  `AutomationRule` count, and the staging tenant count.

**Step B — the allowlist witnessed red.** From THIS task's own run: add a deliberate
`import { getAdminDb } from '@/lib/db/admin-prisma';` to a file **not** on the allowlist, run
`npx vitest run tests/security/admin-connection-allowlist.test.ts`, capture the RED verbatim, revert,
re-run GREEN, capture that verbatim. `06-allowlist-gate-fires.md`. **A guard asserted without a
witnessed red is the quick-549 shape.**

**Step C — the gates.**

1. **`npx tsc --noEmit` AND PROVE IT IS NOT BLIND.** Inject `const x: number = 'y';` into a file you
   actually edited, confirm tsc reports **THAT** error, then **DELETE THE PROBE** (quick-519 found a
   previous run's `__probe.ts` still in the tree). If the only errors are syntax errors, or all in
   files you did not touch, the gate is blind — delete `apps/web/.next/dev/types/validator.ts` and
   `apps/web/tsconfig.tsbuildinfo` and re-run.
2. **`npm run build`** — exit 0.
3. **`npm run audit:rls-policy-drift`** — must report **ZERO** and **NAME the database it measured**
   (quick-607: a run that does not name its target cannot be audited later). Exit 3 means the
   canonical artefact is stale — report it rather than regenerating; no policy was changed here.
4. **`bypass_rls_policy` = 86 before and after, compared as a SORTED TABLE LIST**, not a count.
5. **The vitest suite, SAME reporter both directions.** Stop any running `next dev` first. Baseline
   by `git stash` on **THIS tree** (never `git worktree` — it does not carry the gitignored
   `apps/web/.env.local` and the skew reads like a regression, quick-567). **Never `--reporter=basic`**
   — it does not exist in vitest 4 and exits 0 having run ZERO tests. Read the
   `Test Files … | Tests …` summary; a run with no test counts is not a green run. Compare the
   failing-**FILE** set, and run the after-measurement **after the last commit** (quick-561).
6. **The click-through harness.** Re-check quick-614's finding that it cannot run because
   `NEXT_PUBLIC_SUPABASE_URL` / the anon key resolve to **PRODUCTION** on this machine and obtaining a
   session would mean writing to production auth. If that is still true, **SAY SO PLAINLY** — do not
   substitute a weaker check and do not start a server against production auth. If it can run, run it
   and report the numbers; `604-click-through.ts` passes 1 and 2 honour `--out` and **overwrite
   quick-604's closed evidence without it** — pass the SAME `--out` to both, and hash quick-604's
   artefacts at open and close to prove they are byte-identical.

**Step D — the summary**, `615-SUMMARY.md`, covering the brief's checklist in order:
- **§1** the re-verification against the input list of 48 — present / moved / already routed / not a
  runtime statement, with the F2 reconciliation (48 TC001 + 1 GRANT) and the F3 correction stated as
  corrections to 614.
- **§2** the classification: per-class counts and the per-file breakdown.
- **§3** why `tenants.ts` was partly routed, from primary sources.
- **§4** what was routed where, per class, and what each new `AdminReason` says.
- **§5** the grants — the delta, the §2 staleness correction, and the `auth` decision with the
  exposure enumeration and the rejected alternative.
- **§6** the per-FILE proof, every file present.
- **§7** the gates: tsc (with the blindness probe result), build, drift **and which database**,
  bypass list, suite before/after with the reporter named, click-through.
- **§8** **the remaining count of unscoped statements and what each needs** — the STOP-AND-REPORT
  items, `support-tickets.ts:563`, B7/B8 and the bypass-flagged population (owned by the bypass
  drop), the RLS-OFF latent set, and anything the `--after` run left unproven.
- **§9** what this task deliberately did NOT do: no bypass drop, no cutover, no production write.

Do **not** `git push`.
  </action>
  <verify>
```bash
cd apps/web
npx tsx scripts/audit/615-routing-verify.ts --after      # tripwire armed; one tx per cell; every file present
npx vitest run tests/security/admin-connection-allowlist.test.ts
npx tsc --noEmit                                         # after the probe injection + deletion
npm run build                                            # exit 0
npm run audit:rls-policy-drift                           # ZERO, and it must NAME the database
npx vitest run --reporter=json --outputFile=../../.planning/quick/615-route-the-48-unscoped-statements-that-re/evidence/suite-after.json
grep -rn "__probe\|const x: number = 'y'" src/ || echo "NO PROBE LEFT IN THE TREE"
```
  </verify>
  <done>
Every routed file appears in the `--after` matrix with all three lanes, the tripwire armed and its
value reported, one transaction per cell, counter-reads on every zero and `own > 0` beside every
`foreign === 0`; fixtures torn down with `left === 0`; any unprovable cell marked UNPROVEN rather than
faked. The allowlist gate is witnessed red then green, verbatim. tsc is proven non-blind and the probe
is deleted; `npm run build` exits 0; drift is zero and names its database; `bypass_rls_policy` is 86
both sides as a sorted table list; the suite's failing-FILE set is unchanged with the same reporter
both directions; the click-through harness is run or its blocker stated plainly. The summary answers
all nine sections including the remaining unscoped count. Nothing pushed. Committed.
  </done>
</task>

</tasks>

<verification>

Phase-level checks, all of which must hold at the end:

1. **Step 1 is a measurement.** `evidence/01-classification.json` carries one record per input
   statement with a verdict against current code — not an assumption that F1 makes the check
   unnecessary.
2. **Step 3 is answered from primary sources** with the commit, the manifest quotes and the
   `:191/:198` scope evidence.
3. **Step 7 covers every file.** Cross-check `05-after.json`'s file list against
   `01-classification.json`'s — every file appears, including the ones with a NOT-ROUTED verdict.
4. **Nothing is on `getAdminDb` that a tenant client can serve** — the TENANT class is non-empty and
   argued per statement.
5. **No query shape changed.** `git diff` over every routed file shows receiver changes and comments
   only; `select`/`where`/`include`/`orderBy`/`take`/`revalidatePath`/`catch` lines are untouched.
6. **No guard weakened.** Allowlist entry count and `TOTAL_EXPECTED_CALLS` match a grep; no `minBytes`
   lowered; no fixture-free assertion left vacuous.
7. **`bypass_rls_policy` = 86**, sorted table list identical before and after.
8. **Drift reports zero and names its database.**
9. **`npm run build` exits 0** and the failing-FILE set is unchanged, same reporter both directions.
10. **Production is untouched** — every instrument's banner names `wyixpgunnjmzguhggocz`, and no
    production ref appears in any applied statement.

</verification>

<success_criteria>

- Every one of the 48 input statements has a verdict; corrections to 614's count are stated, not
  silently applied.
- Every survivor is classified and routed per its class, or is a named STOP-AND-REPORT.
- `app_admin` holds exactly the measured grant delta; `admin-connection.md` §2's staleness is
  corrected in public.
- The `auth.users` statement is fixed with a grant whose exposure is enumerated from the catalog, and
  the narrower alternative is stated and decided.
- Both-directions proof per file on staging as `app_user` with the tripwire armed, every file present.
- All gates green, the allowlist witnessed red, production unwritten, nothing pushed.
- The remaining unscoped count is stated with what each item needs.

</success_criteria>

<output>
After completion, create
`.planning/quick/615-route-the-48-unscoped-statements-that-re/615-SUMMARY.md`
following the nine-section shape in Task 6 Step D.
</output>
