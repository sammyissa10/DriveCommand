---
phase: quick-586
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true

files_modified:
  - .planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/SITE-AUDIT.md
  - apps/web/src/app/(driver)/actions/driver-routes.ts
  - apps/web/src/app/(driver)/actions/driver-dashboard.ts
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx
  - apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts
  - apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts
  - apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts
  - apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts
  - apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts
  - apps/web/src/lib/carrier/trips.ts
  - apps/web/src/lib/carrier/dispatch-generator.ts
  - apps/web/src/lib/carrier/route-template-save.ts
  - apps/web/tests/security/tenant-client-stop-access.test.ts

forbidden_changes:
  - "No RLS policy created, altered or dropped. No migration file written or applied."
  - "No edit to apps/web/src/lib/db/extensions/tenant-rls.ts, EXEMPT_MODELS, tenant-context.ts, tenant-client.ts, or prisma/schema.prisma."
  - "No change to the session-scope GUC decision (set_config third arg stays false / TRUE exactly as written today)."
  - "No edit to the email _system module."
  - "No query rewrite. Same where, same select/include, same orderBy, same TX_OPTIONS, same return shape. Every set_config('app.bypass_rls', ...) statement is left byte-identical."
  - "No refactoring of surrounding code, no import reordering beyond the one import being added, no formatting sweeps."

must_haves:
  truths:
    - "Every three-table access path that currently runs through the bare prisma singleton in a request, cron or background context has been re-derived from the working tree, not copied from the diagnostic"
    - "Each site is reported with file, line, table, read-or-write, and execution context, and each divergence from docs/diagnostics/rls-policy-gap-stops.md is named explicitly"
    - "Every converted site routes its three-table access through a tenant client obtained from getTenantPrisma() or getTenantPrismaForOrg(), and no converted site changed its query, its includes or its return shape"
    - "The four sites the diagnostic missed are converted in their own commit, separately revertible from the diagnostic's ten"
    - "A Vitest guard asserts every converted site, and reverting any single conversion turns that guard red"
    - "The bypass_rls expectation sites are enumerated with line numbers so the policy work can decide deliberately whether these three tables get a bypass policy"
  artifacts:
    - path: ".planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/SITE-AUDIT.md"
      provides: "Re-derived site list, per-transaction model classification, divergences from the diagnostic, bypass_rls census, corrected access count"
      min_lines: 90
    - path: "apps/web/tests/security/tenant-client-stop-access.test.ts"
      provides: "Source-scanning guard over every converted site, with integrity floor, CRLF normalisation and expected-count assertion"
      min_lines: 80
  key_links:
    - from: "apps/web/tests/security/tenant-client-stop-access.test.ts"
      to: "the fourteen converted source files"
      via: "fs.readFileSync of each site path, CRLF-normalised, matched against per-site expected-present and expected-absent patterns"
      pattern: "readFileSync"
    - from: ".planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/SITE-AUDIT.md"
      to: "docs/diagnostics/rls-policy-gap-stops.md"
      via: "explicit divergence section naming what the diagnostic got wrong and what it missed"
      pattern: "rls-policy-gap-stops"
---

<objective>
Convert every bare-`prisma` access path to `stops`, `route_template_stops` and
`carrier_documents` onto a tenant-scoped Prisma client, so that when RLS policies are
finally written for those three tables a reused pool connection cannot serve one
tenant's rows to another tenant's request.

Purpose: the app connects as `postgres` with BYPASSRLS today, so these paths work.
The moment a policy exists, a bare-`prisma` query on a *fresh* connection fails closed
(annoying but safe) while the same query on a *reused* pool connection still carries the
previous request's session-scoped `app.current_tenant_id` GUC and returns that tenant's
rows (a live cross-tenant read). That is strictly worse than today, so the client swap
must land before any policy does.

Output: a re-derived site audit, fourteen converted access paths across three commits,
a Vitest guard with probe evidence, and a written hand-off to the policy work.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/diagnostics/rls-policy-gap-stops.md
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
</context>

<research_findings>
This section was verified against the working tree during planning. Do NOT re-derive it
from scratch — VERIFY it, and report any line that no longer holds.

## F1. `getTenantPrisma(session)` DOES NOT EXIST — the brief's premise is wrong

`apps/web/src/lib/context/tenant-context.ts` (path confirmed; it is under `src/`, not
`apps/web/lib/`) exports:

- `getTenantPrisma(): Promise<PrismaClient>` at line 47 — **takes NO arguments**. It calls
  `requireTenantId()`, which reads the `x-tenant-id` request header, and `getSession()`
  internally.
- `getTenantPrismaForOrg(tenantId: string, userId?: string | null)` at line 76 — for
  **header-less** contexts (cron, `/api/mobile/*`, background work).

So the conversion is `getTenantPrisma()` for header-bearing request contexts and
`getTenantPrismaForOrg(orgId, userId)` for header-less ones. **Never write
`getTenantPrisma(session)` anywhere in this task.**

Middleware does not inject `x-tenant-id` for `/api/mobile/*` or `/api/gps/*`
(`apps/web/src/middleware.ts:85`, DEC-11); corroborated by in-repo comments at
`lib/auth/mobile-auth.ts:20`, `lib/carrier/route-template-save.ts:18`,
`lib/carrier/inspection-service.ts:569`.

Both helpers fire the same statement before returning:
`SELECT set_config('app.current_tenant_id', $1, false)` on the bare client, then return
`createTenantClient(tenantId, userId)`. That is the entire behavioural delta being bought.

## F2. WHY THE SWAP IS SAFE FOR THE THREE TABLES — all three are EXEMPT_MODELS

`lib/db/extensions/tenant-rls.ts` `EXEMPT_MODELS` contains `RouteTemplateStop` (line 80),
`CarrierStop` (82) and `CarrierDocument` (83). For an exempt model the extension does
`return query(args)` — it injects nothing. None of the three has a tenant column at all;
tenancy is reached by FK join, which is why they are exempt and why the future policy work
is join-based.

Therefore, **for these three models specifically**, swapping the client changes exactly one
thing: the tenant GUC is set on the pooled connection first. Query, includes, args and
return shape are bit-identical by construction. This is the argument that the conversion is
a pure client swap, and it is also why no call site needs to change.

## F3. THE HAZARD F2 DOES NOT COVER — transaction roots carry other models

Most of these sites wrap their access in `prisma.$transaction(async (tx) => …, TX_OPTIONS)`,
so the swap happens at the **transaction root**, not at the `tx.model` call. That changes the
client for **every model inside that transaction**, not just the three exempt ones. Two
extensions then come into play for the non-exempt ones:

1. `withTenantRLS` injects `tenantId` into `where` and `data`.
2. the audit-columns extension populates `createdById`/`updatedById` on writes.

Model census inside the site files (verified):

| file | models reached through `tx.` |
|---|---|
| `(driver)/actions/driver-routes.ts` | carrierDriver, carrierStop, trip |
| `(driver)/actions/driver-dashboard.ts` | carrierDriver, carrierStop, trip |
| `(owner)/carrier/stops/[id]/page.tsx` | carrierDocument, carrierLoad, trip, **user** |
| `(owner)/carrier/trips/[id]/page.tsx` | **fleetMessage** |
| `(owner)/carrier/trips/[id]/stops/page.tsx` | **fleetMessage** |
| `api/driver/stops/[stopId]/documents/route.ts` | carrierDocument, carrierDriver, carrierStop |
| `api/driver/stops/[stopId]/messages/route.ts` | carrierDriver, carrierStop, **fleetMessage**, **user** |
| `api/mobile/.../dispatches/[id]/expenses/route.ts` | carrierDriver, carrierExpense, carrierStop, trip |
| `api/mobile/.../stops/[stopId]/documents/route.ts` | carrierDocument, carrierStop |
| `api/v1/carrier/stops/[id]/messages/route.ts` | carrierStop, **fleetMessage**, **user** |
| `lib/carrier/dispatch-generator.ts` | carrierLoad, carrierStop, trip |

`CarrierDriver`, `CarrierLoad`, `CarrierExpense`, `Trip`, `RouteTemplate` are all EXEMPT —
safe. **`User` and `FleetMessage` are NOT exempt**: both carry `tenantId`
(`schema.prisma`), and `FleetMessage` also carries `createdById`. Swapping a transaction root
that touches either is a real semantic change, not a pure client swap.

Task 1 must resolve this per transaction, not per file. A file may open several transactions;
only the ones whose body reaches one of the three tables are in scope, and a transaction that
touches only exempt models is provably safe by F2.

## F4. THE SITE LIST — the diagnostic's ten are all still bare, and there are FOUR MORE

**Group 1 — request context, `x-tenant-id` header present → `getTenantPrisma()`:**

| # | file (under `apps/web/src/`) | tx / access lines | tables | R/W | context |
|---|---|---|---|---|---|
| 1 | `app/(driver)/actions/driver-routes.ts` | tx at 280, 324 | CarrierStop | R | server action, `getSession` + `requireRole` |
| 2 | `app/(owner)/carrier/loads/[id]/page.tsx` | 133, 255 | CarrierStop | R | RSC, `getSession` |
| 3 | `app/(owner)/carrier/stops/[id]/page.tsx` | 74, 118 | CarrierStop, CarrierDocument | R | RSC |
| 4 | `app/(owner)/carrier/trips/[id]/page.tsx` | 92, 109, 114 | RouteTemplateStop, CarrierDocument | R | RSC |
| 5 | `app/(owner)/carrier/trips/[id]/stops/page.tsx` | 101 | CarrierDocument | R | RSC |
| 6 | `app/api/driver/stops/[stopId]/documents/route.ts` | 126, 177, 250, 263 | CarrierStop, CarrierDocument | R+W | API, session |
| 7 | `app/api/driver/stops/[stopId]/messages/route.ts` | 48, 188 | CarrierStop | R | API, session |
| 10 | `app/api/v1/carrier/stops/[id]/messages/route.ts` | 37, 168 | CarrierStop | R | API, session |

**Group 2 — `/api/mobile/*`, NO header → `getTenantPrismaForOrg(orgId, userId)`:**

| # | file | lines | tables | R/W | context |
|---|---|---|---|---|---|
| 8 | `app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts` | 127 | CarrierStop | R | `validateMobileToken` |
| 9 | `app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts` | 112, 158 | CarrierStop, CarrierDocument | R+W | `validateMobileToken` |

Read each mobile route and take the exact decoded-token field names carrying org/tenant id
and user id from the file itself — **do not guess them**.
`app/api/mobile/carrier/owner/dispatches/[id]/route.ts:44` is the in-repo precedent comment
for this pattern.

**Group 3 — FOUR SITES THE DIAGNOSTIC MISSED. This is the headline divergence.**

The diagnostic classified files as "uses getTenantPrisma" vs "uses bare prisma" at FILE
level, which is blind to a file that does both. In each of these the file already obtains a
correct tenant client and then performs the three-table access through the bare singleton
anyway:

| # | file:line | tables | R/W | tenant client ALREADY in scope |
|---|---|---|---|---|
| 11 | `app/(driver)/actions/driver-dashboard.ts:100` (`tx.carrierStop.count`, tx from `prisma.$transaction` at :83) | CarrierStop | R | `tenantPrisma` at :70 (`getTenantPrisma()`) |
| 12 | `lib/carrier/trips.ts:1035` (`prisma.carrierStop.update` inside array-form `prisma.$transaction` at :1033) | CarrierStop | **W** | `tenantPrisma` at :1025 (`getTenantPrisma()`) |
| 13 | `lib/carrier/dispatch-generator.ts:420` (`tx.carrierStop.create`, tx from `prisma.$transaction`) | CarrierStop | **W** | `tenantPrisma` at :217 (`getTenantPrismaForOrg(orgId)`) |
| 14 | `lib/carrier/route-template-save.ts:356, 358, 381` (`tx.routeTemplateStop.*`, tx roots at :348 and :371) | RouteTemplateStop | **W** | the `db: PrismaClient` **parameter** at :147 |

Site 14 is the sharpest. `saveRouteTemplateCore(db, orgId, data)` takes a pre-resolved tenant
client as its first parameter; the file's 27-line header explains at length that this exists
precisely because header-less callers must pass `getTenantPrismaForOrg(orgId, userId)`;
`db` IS used for six other reads (:196, 206, 217, 228, 240, 267) — and then the
`routeTemplateStop` writes go through the bare `prisma` import at :30, commented
`// kept for $transaction — see below`. The threaded client is accepted, documented, and
discarded for the writes. Both of its transactions touch only `routeTemplate` and
`routeTemplateStop`, **both EXEMPT**, so this one is provably safe by F2.

Every one of the fourteen has a correct tenant client already in lexical scope or trivially
obtainable in-function. None requires a call-site change. None requires fabricating a session.
The brief's stop-and-report condition therefore appears not to be triggered — but re-verify
that per site and STOP if any site turns out otherwise.

## F5. `after()` — the brief's premise is wrong, the set is EMPTY

Sites 7 and 10 do contain `after()` calls
(`app/api/driver/stops/[stopId]/messages/route.ts:243,250` and
`app/api/v1/carrier/stops/[id]/messages/route.ts:225,232`) but those blocks call **only**
`sendPushToUser(...)` and `createMessageNotification(...)`. Neither touches `stops`,
`route_template_stops` or `carrier_documents`. All three-table access in both files happens
in the request path, before the response, with a live session.

**Zero of the three-table accesses occur inside `after()`.** The brief's "two of them inside
after()" is false. Report that plainly rather than silently.

## F6. CRON — the diagnostic's "Cron: none" is TRANSITIVELY FALSE

True at file level, false through the call graph:
`app/api/cron/carrier-auto-dispatch/route.ts:108` calls
`generateDispatches(tenant.id, template.id, …)` in `lib/carrier/dispatch-generator.ts`, which
**creates `carrierStop` rows at :420**. Site 13 is therefore a cron-reachable write path.

It needs no fabricated session: the cron already threads an explicit `tenant.id`, and the
file already resolves `getTenantPrismaForOrg(orgId)` at :217. This is exactly the brief's
step-4 "explicit tenant id threaded from the caller" pattern — **already present and merely
unused** — so it is converted, not merely proposed. Say so and justify it in the audit.

## F7. bypass_rls EXPECTATION SITES (brief step 5) — 9 of the original 10

`app.bypass_rls` is a transaction-scoped GUC set via
`` tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)` ``, honoured by a
`bypass_rls_policy` whose `qual` is `current_setting('app.bypass_rls', true) = 'on'`. That
policy exists on control tables (`facilities`, `clients`, `carrier_trucks`,
`route_templates`) and is **absent on all three of these tables**.

Occurrence counts to confirm and expand to exact line numbers:

`(driver)/actions/driver-dashboard.ts` 2 · `(driver)/actions/driver-routes.ts` 7
(carries `@bypass_rls reason: driver-server-action`) · `(owner)/carrier/stops/[id]/page.tsx` 3 ·
`(owner)/carrier/trips/[id]/page.tsx` 1 · `(owner)/carrier/trips/[id]/stops/page.tsx` 1 ·
`api/driver/stops/[stopId]/documents/route.ts` 6 (`@bypass_rls reason: driver-web-api`) ·
`api/driver/stops/[stopId]/messages/route.ts` 9 ·
`api/mobile/.../dispatches/[id]/expenses/route.ts` 3 (`@bypass_rls reason: mobile-api`) ·
`api/mobile/.../stops/[stopId]/documents/route.ts` 4 ·
`api/v1/carrier/stops/[id]/messages/route.ts` 8
(`@bypass_rls reason: server-side session-authed web route`).

**The only one of the original ten that does NOT set it is
`app/(owner)/carrier/loads/[id]/page.tsx`.**

Leave every `set_config('app.bypass_rls', …)` statement exactly as-is — removing one is a
query rewrite and is out of scope. State in the audit that for these sites a future
`bypass_rls_policy` on the three tables would let them bypass tenant isolation *by design*,
so the conversion's value there is GUC hygiene and defence-in-depth, and the policy work must
decide deliberately whether these three tables get a bypass policy at all.

## F8. SITE-COUNT AND NESTED-INCLUDE NUMBERS (brief step 6) — verify, don't trust

- Files touching the three models by any accessor (`prisma.` / `tenantPrisma.` / `tx.` /
  `db.`): **32 today**. The diagnostic said 31 — drifted +1. Identify the extra file.
- Accessor census recorded during planning: `tenantPrisma.` 40+14+3 · `tx.` 19+6+3 ·
  `db.` 1+1. Total direct accessor occurrences today: **159**.
- Raw `^\s*stops:\s*\{` nested includes: **37 today**; the diagnostic said 34 — drifted +3.
  Four files reference `.routeStop`, which is the **legacy `RouteStop`, a different table**,
  and must be excluded. Produce the corrected count with the excluded files named.
- **Grep precision trap:** `carrierDocument` without a word boundary also matches
  `carrierDocumentType`, a different model and table (`lib/carrier/document-types.ts` is full
  of it). Always use `\.(carrierStop|carrierDocument|routeTemplateStop)\b`.
- Already verified tenant-scoped, no action: `lib/carrier/loads.ts` (tx from
  `tenantPrisma.$transaction` at :409), `lib/carrier/notifications.ts` (:364, :1060 both
  `tenantPrisma.`), `lib/carrier/document-types.ts:154` (one genuine
  `tenantPrisma.carrierDocument.count`).

## F9. SCOPE DECISION — Group 3 goes in its own commit

The brief's stated scope is "the ten". Group 3 is four more instances of the identical
defect, two of them writes, all fixable by the same one-line swap. Converting them serves the
brief's stated purpose; leaving them silently would defeat it. Commit Groups 1+2 first, then
Group 3 **separately and self-contained**, so the user can revert the scope expansion on its
own. Report it prominently as a scope decision, not buried.
</research_findings>

<tasks>

<task type="auto">
  <name>Task 1: Verify the fourteen sites, classify every swapped transaction, write SITE-AUDIT.md</name>
  <files>.planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/SITE-AUDIT.md</files>
  <action>
Read-only task. Change no source file.

1. Confirm F1 by reading `apps/web/src/lib/context/tenant-context.ts`. Record the exact
   signatures of `getTenantPrisma` and `getTenantPrismaForOrg` and the exact `set_config`
   statement each fires. If either signature differs from F1, STOP and report.

2. Re-derive the site list from the working tree. Run, from `apps/web/src`:
   - `grep -rnE "\.(carrierStop|carrierDocument|routeTemplateStop)\b" --include=*.ts --include=*.tsx .`
   - `grep -rlnE "\.(carrierStop|carrierDocument|routeTemplateStop)\b" --include=*.ts --include=*.tsx .`
   - `grep -rn "routeStop" --include=*.ts --include=*.tsx .` (the legacy `RouteStop` exclusion set)
   - `grep -rnE "^\s*stops:\s*\{" --include=*.ts --include=*.tsx .`
   Record the four counts. Compare against F8's 159 / 32 / 37 and against the diagnostic's
   31 / 34. Name every drifted file.

3. For each of the fourteen sites in F4, open the file and confirm: the line numbers, the
   table(s), read-or-write, the execution context, and that the access still runs through the
   bare `prisma` import. Record any site whose line numbers moved. If a site is already
   converted, say so and drop it from the conversion set.

4. **Per-transaction model classification — this is the load-bearing part.** For every
   transaction root that will be swapped, list every `tx.<model>` / `<client>.<model>` reached
   inside that specific transaction body (not the whole file), and mark each model
   EXEMPT or NON-EXEMPT against the `EXEMPT_MODELS` set in
   `apps/web/src/lib/db/extensions/tenant-rls.ts`. F3 already flags `User` and `FleetMessage`
   as non-exempt; confirm and look for others.
   For every transaction containing a NON-EXEMPT model, record:
   - what `tenantId` the existing `where` already filters on, and whether the injected
     `tenantId` would therefore be a semantic no-op;
   - for writes, whether the audit-columns extension would newly populate
     `createdById`/`updatedById` on a model that has those columns (`FleetMessage` has
     `createdById`).
   Classify each such transaction as SAFE-TO-SWAP (injection provably a no-op, no new column
   written) or NEEDS-DECISION. **Do not convert a NEEDS-DECISION transaction in Task 2 or 3.**
   List them in the audit under a heading the summary can lift verbatim.

5. Confirm F5: read both `after()` blocks and state, with line numbers, that neither touches
   the three tables. Record the correction to the brief.

6. Confirm F6: read `app/api/cron/carrier-auto-dispatch/route.ts` around :108 and the
   `generateDispatches` signature, and state that the cron threads an explicit tenant id and
   that `getTenantPrismaForOrg(orgId)` is already resolved at `dispatch-generator.ts:217`.

7. Confirm F7 and expand every count to exact line numbers of each
   `set_config('app.bypass_rls'` occurrence, per file. Add the hand-off paragraph for the
   policy work.

8. Write `.planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/SITE-AUDIT.md` with
   sections: Corrected helper signatures · Re-derived site table (14 rows: #, file, lines,
   tables, R/W, context, target helper) · Divergences from the diagnostic (the four missed
   sites, the after() correction, the cron correction, the drifted counts) · Per-transaction
   model classification with the SAFE-TO-SWAP / NEEDS-DECISION verdict · bypass_rls census
   with line numbers and the policy hand-off · Corrected access count excluding `RouteStop`
   with the excluded files named · Any STOP condition hit.

STOP and report instead of proceeding if: any site needs a call-site change; any site has no
tenant context obtainable in-function; or a conversion would change a return shape.
  </action>
  <verify>
`SITE-AUDIT.md` exists, is over 90 lines, contains a 14-row site table, an explicit
NEEDS-DECISION list (which may be empty, but must be present and stated), the four grep
counts, and the bypass_rls line numbers. No file under `apps/web/src` is modified —
confirm with `git status --porcelain apps/web`.
  </verify>
  <done>
A reader can, from SITE-AUDIT.md alone, name every site to convert, the helper each will
use, every transaction that is not provably a pure client swap, and every divergence from
docs/diagnostics/rls-policy-gap-stops.md.
  </done>
</task>

<task type="auto">
  <name>Task 2: Convert Groups 1 and 2 (the diagnostic's ten) and land the guard test</name>
  <files>apps/web/src/app/(driver)/actions/driver-routes.ts, apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx, apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx, apps/web/src/app/(owner)/carrier/trips/[id]/page.tsx, apps/web/src/app/(owner)/carrier/trips/[id]/stops/page.tsx, apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts, apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts, apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts, apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts, apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts, apps/web/tests/security/tenant-client-stop-access.test.ts</files>
  <action>
Convert only the sites Task 1 marked SAFE-TO-SWAP within Groups 1 and 2. Skip any
NEEDS-DECISION transaction and carry it into the summary instead.

**The mechanical change, per site:**
- Group 1 (sites 1-7, 10): add `import { getTenantPrisma } from '@/lib/context/tenant-context';`
  if absent, obtain `const tenantPrisma = await getTenantPrisma();` at the top of the
  function that owns the access, and change the transaction root
  `prisma.$transaction(` → `tenantPrisma.$transaction(`, or the direct access
  `prisma.carrierStop…` → `tenantPrisma.carrierStop…`.
- Group 2 (sites 8, 9): add
  `import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';`, read the decoded
  mobile token in that exact file to find the org/tenant id and user id field names, and use
  `const tenantPrisma = await getTenantPrismaForOrg(<orgIdField>, <userIdField>);`.
  Do not invent field names — take them from the file.
- Leave the bare `import { prisma } from '@/lib/db/prisma';` in place if any other statement
  in the file still uses it; remove it only if it becomes genuinely unused (tsc will say so).
- `TX_OPTIONS` stays exactly as passed today.

**What must not change:** every `where`, `select`, `include`, `orderBy`, `take`, `skip`, the
`TX_OPTIONS` argument, the returned value's shape, and every
`set_config('app.bypass_rls', …)` statement. This is a client swap only. Do not reorder,
reformat or tidy anything else in these files.

**Guard test.** Create `apps/web/tests/security/tenant-client-stop-access.test.ts` (Vitest,
node environment, already covered by `vitest.config.ts`'s `tests/**/*.test.ts` include —
install nothing). Design:

- A `SITES` array with one entry per converted site: `{ id, path, minBytes, mustContain: RegExp[], mustNotContain: RegExp[] }`.
- `readSite()` does `readFileSync(path, 'utf8').replace(/\r\n/g, '\n')`. **CRLF normalisation
  is mandatory** — `core.autocrlf=true` and there is no `.gitattributes`, so the working tree
  is CRLF and any pattern anchored on `\n` fails on an unmodified checkout.
- Integrity assertions, without which the whole file can pass vacuously:
  1. `expect(SITES.length).toBe(<n>)` — the exact converted-site count, so deleting a row fails.
  2. per site, `expect(source.length).toBeGreaterThan(site.minBytes)` — a per-site floor, not
     one blanket constant (a legitimate one-line re-export page is ~293 bytes; floor each file
     against its own real size, rounded down).
  3. per site, every `mustContain` pattern matched at least once — the "was it actually found"
     assertion.
- `mustContain` per site: the tenant-helper import and the converted accessor, e.g.
  `/getTenantPrisma\b/`, `/tenantPrisma\.\$transaction\(/`.
- `mustNotContain` per site: `/\bprisma\.(carrierStop|carrierDocument|routeTemplateStop)\b/`
  always; plus `/\bprisma\.\$transaction\(/` **only for files where Task 1 confirmed no other
  transaction legitimately remains on the bare client**. Do not apply that pattern blanket —
  a permanently red guard is a guard everyone learns to ignore.
- One counter-assertion so the file cannot be satisfied by deleting sites: assert that at
  least one site's source still contains `set_config('app.bypass_rls'`, proving the scan reads
  real, unmodified content.

**Anti-vacuity probe (record the evidence in the summary):**
1. Run the guard — green.
2. Revert exactly one conversion (e.g. change one `tenantPrisma.$transaction(` back to
   `prisma.$transaction(`), run the guard — must be RED, and the failure must name that site.
3. Restore the conversion, run the guard — green again.
Paste the red output into the summary. A conversion whose reversion does not turn the guard
red is not covered; add coverage for it.

Commit with `node C:/Users/sammy/.claude/get-shit-done/bin/gsd-tools.js commit` message
`fix(quick-586): route the ten bare-prisma stop/document access paths through a tenant client`.
Do not push.
  </action>
  <verify>
`npx vitest run tests/security/tenant-client-stop-access.test.ts` in `apps/web` passes, and
the probe run in step 2 above was observed RED. `git diff --stat` shows only client-swap
lines and the added imports — no `where`/`select`/`include` line appears in the diff. Confirm
with `git diff -U0 apps/web/src | grep -E "^[+-].*(where|select|include|orderBy|bypass_rls)"`
returning nothing.
  </verify>
  <done>
All SAFE-TO-SWAP sites in Groups 1 and 2 obtain their three-table access from a tenant
client, the guard covers each of them, reverting any one of them turns the guard red, and
the diff contains no query change.
  </done>
</task>

<task type="auto">
  <name>Task 3: Convert Group 3 in its own commit, extend the guard, run the verification battery</name>
  <files>apps/web/src/app/(driver)/actions/driver-dashboard.ts, apps/web/src/lib/carrier/trips.ts, apps/web/src/lib/carrier/dispatch-generator.ts, apps/web/src/lib/carrier/route-template-save.ts, apps/web/tests/security/tenant-client-stop-access.test.ts</files>
  <action>
**Part A — convert sites 11-14.** Each already has a correct tenant client in scope, so the
change is a one-line swap of the transaction root or the accessor, with no new import in
three of the four:

- Site 11 `app/(driver)/actions/driver-dashboard.ts:83` — `prisma.$transaction(` →
  `tenantPrisma.$transaction(` (`tenantPrisma` from `getTenantPrisma()` at :70).
- Site 12 `lib/carrier/trips.ts:1033` — the array-form `prisma.$transaction([...])` →
  `tenantPrisma.$transaction([...])`, and the `prisma.carrierStop.update` at :1035 →
  `tenantPrisma.carrierStop.update` (`tenantPrisma` from `getTenantPrisma()` at :1025).
  Array-form `$transaction` takes no `TX_OPTIONS`; do not add one.
- Site 13 `lib/carrier/dispatch-generator.ts` — the `prisma.$transaction` root whose body
  creates `carrierStop` at :420 → the `tenantPrisma` resolved by
  `getTenantPrismaForOrg(orgId)` at :217. If :217's client is not in lexical scope at the
  transaction, resolve it in-function from the same `orgId` — do NOT change the function
  signature; if the `orgId` is not in scope either, STOP and report.
- Site 14 `lib/carrier/route-template-save.ts:348, 371` — `prisma.$transaction(` →
  `db.$transaction(`, using the `db: PrismaClient` parameter at :147. Both transactions touch
  only `routeTemplate` and `routeTemplateStop`, both EXEMPT, so this is provably a pure client
  swap (F2). Update the `// kept for $transaction — see below` comment on the `prisma` import
  at :30 to reflect reality, and delete that import only if tsc shows it is now unused.

Same prohibitions as Task 2: no query change, no `TX_OPTIONS` change, no `set_config` change,
no surrounding refactor. Skip anything Task 1 marked NEEDS-DECISION.

**Part B — extend the guard.** Add sites 11-14 to the `SITES` array in
`apps/web/tests/security/tenant-client-stop-access.test.ts` as their own clearly-commented
block, bump the `SITES.length` expectation, and re-run the anti-vacuity probe against one
Group 3 site specifically (revert → red → restore → green). Keeping the Group 3 rows in the
same commit as the Group 3 code is what makes this commit independently revertible.

Commit Part A and Part B together, separately from Task 2, with message
`fix(quick-586): route four further bare-prisma stop access paths through the tenant client already in scope`.
Do not push.

**Part C — verification battery.** Run after the last commit, editing nothing while a run is
in flight.

1. `npx tsc --noEmit` in `apps/web`, **probed**. A clean unprobed run is not evidence: a parse
   error anywhere in the program silently suppresses semantic checking of everything. So:
   inject `const __probe586: number = 'y';` into a file you actually edited (e.g.
   `lib/carrier/trips.ts`), run tsc, and confirm it reports **that** error. Then delete the
   probe, re-run, and confirm zero errors. If the only errors are inside `.next/`, the gate is
   blind — delete `apps/web/.next/dev/types/validator.ts` and
   `apps/web/tsconfig.tsbuildinfo` and re-run. Paste both probe outputs into the summary.
2. `npx next build` in `apps/web`. Stop any running `next dev` first.
3. Full Vitest: `npx vitest run` in `apps/web` with the **default reporter**. Compare against
   the verified baseline of **63 failed / 1702 passed / 1829 total** measured today. Report
   the delta. `--reporter=basic` does not exist in vitest 4 and exits 0 having run zero tests
   — do not use it. If the numbers differ from baseline by more than the guard file's own new
   tests, investigate before claiming green; a cold run in `apps/web` imports for ~80s and a
   single isolated failure that passes on re-run is a cold-cache flake, so report warm and
   cold separately.

**Part D — the report.** The summary must carry, as its own sections: the re-derived site
list with divergences (pointing at SITE-AUDIT.md); the converted request-context sites; the
statement that the `after()` set is EMPTY and the cron path is site 13, already threading an
explicit tenant id, so it was converted rather than merely proposed; any NEEDS-DECISION
transaction left unconverted with the proposed pattern for it; the bypass_rls expectation
sites with the hand-off to the policy work; the corrected access count excluding `RouteStop`;
and the probe evidence.
  </action>
  <verify>
Two separate commits exist for Groups 1+2 and Group 3 (`git log --oneline -3`).
`npx vitest run tests/security/tenant-client-stop-access.test.ts` passes with the extended
`SITES` array; the Group 3 probe was observed RED. `npx tsc --noEmit` reports the injected
probe error, then zero errors after the probe is deleted. `npx next build` succeeds. Full
suite is at or better than 63 failed / 1702 passed, plus the guard's own tests. No RLS policy,
migration, `tenant-rls.ts`, `EXEMPT_MODELS`, `tenant-context.ts` or `schema.prisma` change
appears anywhere in `git diff master --stat`.
  </verify>
  <done>
All fourteen sites route their three-table access through a tenant client, Group 3 is
independently revertible, the guard covers every conversion and fails on any reversion, and
the verification battery is green with probe evidence recorded.
  </done>
</task>

</tasks>

<verification>
- `git diff master --name-only` lists only the fourteen source files, the guard test and
  SITE-AUDIT.md. No migration, no policy SQL, no `prisma/schema.prisma`, no
  `lib/db/extensions/tenant-rls.ts`, no `lib/context/tenant-context.ts`, no `_system` email
  module.
- `git diff -U0 apps/web/src | grep -E "^[+-].*(bypass_rls|TX_OPTIONS|where:|select:|include:|orderBy:)"` returns nothing.
- `grep -rn "getTenantPrisma(session" apps/web/src` returns nothing — that function signature
  does not exist.
- `grep -rnE "\bprisma\.(carrierStop|carrierDocument|routeTemplateStop)\b" apps/web/src`
  returns nothing.
- The guard test file normalises CRLF (`grep -n 'replace(/\\r\\n/g' apps/web/tests/security/tenant-client-stop-access.test.ts` matches).
</verification>

<success_criteria>
1. SITE-AUDIT.md re-derives the fourteen sites from the tree and names every divergence from
   the diagnostic: the four missed sites, the empty `after()` set, the transitively-true cron
   path, and the drifted 31→32 / 34→37 counts.
2. Every SAFE-TO-SWAP site obtains its `stops` / `route_template_stops` / `carrier_documents`
   access from `getTenantPrisma()` or `getTenantPrismaForOrg(...)`.
3. Any NEEDS-DECISION transaction is reported with a proposed pattern, not worked around.
4. Group 3 is a separate, self-contained, independently revertible commit.
5. The Vitest guard passes and reverting any single conversion turns it red, with the red
   output recorded.
6. `tsc --noEmit` is clean **and probed**, `next build` succeeds, and the full suite is at or
   better than the 63 failed / 1702 passed baseline.
</success_criteria>

<output>
After completion, create
`.planning/quick/586-fix-ten-bare-prisma-access-paths-on-stop/586-SUMMARY.md`.
</output>
