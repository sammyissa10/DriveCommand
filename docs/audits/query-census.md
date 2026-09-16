# Query census — every database statement, keyed on the query

> **This document SUPERSEDES the quick-616 census**
> (`.planning/quick/616-route-the-bypass-flagged-statements-befo/evidence/01-census.md` / `01-census.json`,
> and the "45 remaining" figure carried forward from it through quick-621).
> That census counted statements carrying `app.bypass_rls`. The flag was its unit of account, so a
> bare-client query without the flag was invisible to it in every kind of file. This census counts
> **queries**. The flag survives as a column, not as the population.
>
> quick-622 · 2026-09-16 · tree `637a5f61` · RLS state read-only from **production** `oqdhberkghtnszrkdvfm`

| artefact | what |
|---|---|
| `apps/web/scripts/audit/622-query-census.ts` | the scanner (`ts.Program` + type checker) |
| `apps/web/scripts/audit/622-ground-truth.ts` | ground-truth checks + reconciliation |
| `.planning/quick/622-query-census-keyed-on-queries/evidence/01-query-census.json` | **one row per statement** (1,825) — every total below is a filter over it |
| `…/evidence/00-production-rls-tables.json` | `pg_class` / `pg_policy` / grant state for all 99 public tables, production, read-only |
| `…/evidence/02-ground-truth.{txt,json}` | 20 checks PASS, exit 0; reconciliation R1–R4 |
| `…/evidence/04-break-resolver-*.txt` | the same checks against a deliberately broken resolver: 5 FAIL, exit 1 |

Reproduce: `cd apps/web && npx tsx scripts/audit/622-query-census.ts` (≈35 s), then
`npx tsx scripts/audit/622-query-census.ts --override "src/app/(owner)/layout.tsx=37e0bb17^" --out <tmp>` and
`npx tsx scripts/audit/622-ground-truth.ts --census <evidence>/01-query-census.json --prefix <tmp>`.

---

## 0. The answer first

| | statements | files |
|---|---:|---:|
| database statements in `apps/web/src` (shipping, non-test) | **1,825** | 363 |
| … of which GUC plumbing (`set_config` only, no table) | 55 | — |
| **queries** | **1,770** | 363 |
| **SILENT_ZERO_AT_CUTOVER, as scanned** (path-insensitive) | **180** | **53** |
| **SILENT_ZERO_AT_CUTOVER, after hand-crediting the 11 driver-pay statements (§3.1)** | **169** | **46** |
| SILENT_ZERO_AT_BYPASS_DROP (flag-carrying; works until `bypass_rls_policy` is dropped) | 56 (67 with the 11) | 24 (31) |
| unresolved client | **0** | — |

**The number that gates the cutover is 169 statements in 46 files** (180 / 53 as the scanner reports it; §3.1 names
the 11-statement difference). Under `app_user` each of these returns zero rows, or raises `42501` on INSERT, with no
error; with the tripwire armed they raise `TC001`. **It is not 45, and it is not 125 + 45.**

---

## 1. Step 1 — the scanner, and what it cannot resolve

`622-query-census.ts` builds one `ts.createProgram` over all 1,554 shipping source files with the app's
`tsconfig.json`, and uses the checker for three jobs.

**What counts as a statement.** A call `X.<delegate>.<op>(…)` or `X.$queryRaw/$executeRaw[Unsafe]` is counted when
the op's symbol is **declared in `src/generated/prisma`**. A same-named method on anything else is rejected by
declaration, not by name. When the receiver is `any` (e.g. `tenantRawQuery`'s `(tx: any)`), the model name and op
are matched syntactically and the row is marked `typed: false` (55 rows). `$transaction` is not a statement; the
statements inside it are, and they inherit the transaction's flags.

**Which client a statement runs on.** `originsOf()` resolves by symbol and declaration, not by name. It handles:

| shape | how it is followed |
|---|---|
| the `prisma` export of `lib/db/prisma.ts` | `BARE`, identified by its **declaration**, so a local `const prisma = await getTenantPrisma()` shadow is not mistaken for it (quick-621 got this wrong twice, §4) |
| `getTenantPrisma()` / `getTenantPrismaForOrg()` / `getAdminDb()` / `createTenantClient()` / `$extends(withTenantRLS…)` | sources, matched by the **resolved declaration's file** |
| a helper that **returns** a client | union of the origins of every `return` in its body (`this.client()`, `getDb()`, `cache(fn)`) |
| a client **passed as a parameter** | every resolved call site's argument at that index, including a function passed *as a value* to another user function that invokes it (`withBypassRls(fetchBonuses)`) |
| **destructuring** — object and array | `const { getPrisma } = ctx` walks into the object that built `ctx`; `const [prisma, t] = await Promise.all([getTenantPrisma(), …])` takes the element |
| function **values** | `await getPrisma()` where `getPrisma` is a closure returned inside an object: `fnValues()` finds the arrow, then its returns |
| `$transaction(async tx => …)` | `TX(receiver)`, with `bypass` / `guc` read from the callback **and from helpers the tx is handed to** (≤ 2 hops): `setTransactionTenantId(tx, id)` sets the GUC in another file |
| array-form `$transaction([…])` | every element is a `TX` sharing the array's literals, so B8's `[set_config bypass, user.findUnique]` is flagged |
| class properties, interface properties, `??` / `||` / `?:`, `let` + assignment | property initialisers, `this.x =` assignments, object literals whose contextual type owns the property, and unions |

**Which tables a statement reaches.** Model → `@@map`, **plus every relation named anywhere in the argument
literal**, recursively: `select`, `include`, `_count`, relation filters, nested writes. That is quick-615's lesson
that a `_count` is a statement against another table. Raw SQL is parsed for `FROM/JOIN/INTO/UPDATE`, including the
literals of `const` fragments interpolated into it (`Prisma.sql\`${selectBlock} WHERE …\``).

### What it still cannot resolve

| category | count | disposition |
|---|---:|---|
| **statements whose client is UNRESOLVED** | **0** | — |
| statements resting on an `ABSENT` flow (a flow proven to contribute no value) | **18** | listed per row in `absentFlows`. 13 × `dispatchNotification`'s optional `options.prismaClient`, which **no object literal in `src` supplies**. 3 × `computeDispatchReadiness`'s optional 2nd parameter, which **none of its 5 call sites passes**. 2 × `resolveStopCounts`, which has **no call site in `src`** (dead export). Each assumption is visible per row, not hidden |
| statements whose arms **disagree** (path-insensitive) | **11** | all in `api/driver-pay/me/*` — §3.1 |
| raw statements naming **no table** (`RAW_NO_TABLE_NAMED`) | **8** | classified by hand, §1.1 |
| model statements with a **partially** resolved argument (a spread or helper-built `where`/`select`) | 370 | the base table is always known. `tablesPartial` only means a *relation* reached through a non-literal argument could be missing. **367 of the 370 already reach an RLS table, so the verdict cannot change.** The other 3 are `(admin)/actions/plans.ts:45/:71` and `promos.ts:35` on RLS-free `Plan`/`Promo`. Their only relation is `subscriptions`, and I checked by hand that neither file's zod schema carries that key |

**Unresolvable-client count: 0 of 1,770.** Break the resolver (`--break-resolver`) and 1,726 become UNCLASSIFIED;
the ground-truth run then exits 1 (§5).

**What static analysis cannot see at all**, stated rather than implied: queries built from SQL strings assembled at
runtime from non-`const` pieces; a client stored in a module-level mutable variable assigned in another module; any
call through `eval` or a dynamic `import()` whose target is computed. The walk found none of these shapes on the tree.
§7 covers the runtime instrument that would catch them.

### 1.1 The 8 raw statements that name no table (by hand)

| statement | what it runs | RLS-relevant? |
|---|---|---|
| `actions/support-tickets.ts:125`, `api/mobile/support/ticket/route.ts:54` | `nextval('support_ticket_number_seq')` | no (quick-616's sequence) |
| `actions/support-tickets.ts:338` | `auth_user_display(uuid[])` on `getAdminDb` | no |
| `api/warmup/route.ts:15` | `SELECT 1` | no |
| `lib/carrier/fleet-trucks.ts:104` | `carrier_max_vehicle_id()`, SECURITY DEFINER | no (function owner) |
| `lib/onboarding/provision-tenant.ts:77`, `:98` | `provisioning_email_taken()` / `provisioning_next_slug()`, SECURITY DEFINER | no |
| `lib/db/admin-prisma.ts:151` | boot-guard role-shape query | no (catalog only) |

---

## 2. Step 2 — the enumeration

Every row in `01-query-census.json` carries all of the following fields:

| field | values |
|---|---|
| `client` | `BARE` · `TENANT_SESSION` (getTenantPrisma) · `TENANT_ORG` (getTenantPrismaForOrg) · `ADMIN` (getAdminDb) · `WITH_TENANT_RLS` · `CREATE_TENANT_CLIENT` · `TX(…)` of any of those · `MIXED(…)` |
| `tables`, `rlsTables`, `noBypassPolicyTables`, `noPolicyRlsTables` | against **production** `pg_class`: 91 of 99 public tables have RLS enabled |
| `bypassFlag` | **a column**: `app.bypass_rls` set on this statement's transaction. `decorativeBypass` marks the flag on a tenant-scoped arm, where it changes nothing |
| `tenantSource` | `SESSION` · `PARAMETER` · `JOB_PAYLOAD` · `NONE`, with `tenantSourceEvidence` naming the token that decided it |
| `failure` | `THROWN` · `LOGGED` · `SWALLOWED` · `ERROR_RESPONSE` · `DEFERRED`, followed **through callers** (≤ 4 hops, most silent wins), with `failureEvidence` |
| `verdict`, `armVerdicts`, `armsDisagree` | §3 |

**Two classifications are heuristics, and are stated as such.**

- **Tenant source** is read off the outermost enclosing function. It is `SESSION` if that function calls a
  session/token resolver (`getSession`, `requireAuth`, `validateMobileToken`, `requireRole`, …) or reads
  `session.tenantId`. It is `PARAMETER` if a parameter is named `tenantId`/`orgId` or its type carries `tenantId`.
  It is `JOB_PAYLOAD` for `api/cron`/webhook paths. Otherwise it is `NONE`.
- **Failure handling** classifies the first handler above the statement. A handler that returns `{ error }` or
  `{ success: false }` counts as `ERROR_RESPONSE`, not a swallow. "Thrown" means *propagates out of the entry
  point*.

**Under an unarmed `app_user` (production's configuration after the cutover) a read that RLS filters does not throw
at all.** So the failure column decides what happens **only when a raise occurs**: `TC001` with the tripwire armed,
or `42501` on an INSERT.

`ERROR_RESPONSE`: an error the caller can see — an HTTP 4xx/5xx, or an ActionState `{ error }`. Added as a
fourth value because a catch that returns an error to its caller is neither a throw nor a swallow.

---

## 3. Step 3 — totals

### Verdict

| verdict | meaning under `app_user` | statements |
|---|---|---:|
| `SCOPED` | tenant client, or a transaction that sets the tenant GUC | **1,383** |
| `ADMIN_CONNECTION` | `app_admin`, BYPASSRLS; grants are the control | 107 |
| `NO_RLS_TABLE` | reaches only RLS-off tables (`NotificationTemplate`, `grid_view`, `Plan`, `Promo`, …) | 36 |
| `RAW_NO_TABLE_NAMED` | §1.1 | 8 |
| **`SILENT_ZERO_AT_CUTOVER`** | bare / GUC-less client, no flag, RLS table | **180** |
| `SILENT_ZERO_AT_BYPASS_DROP` | flag-carrying, on tables that all have `bypass_rls_policy` | 56 |
| `BROKEN_UNDER_APP_USER` | flag on a table **without** `bypass_rls_policy` (e.g. `stops`) | **0** — quick-616's four `stops` sites have all been routed since |
| `NO_POLICY_TABLE` | RLS on, zero policies (`_prisma_migrations`) | 0 |
| `UNCLASSIFIED` | — | 0 |

### By client

| client | statements / files | SCOPED | ADMIN | NO_RLS | RAW_NO_TABLE | **CUTOVER** | BYPASS_DROP |
|---|---|---:|---:|---:|---:|---:|---:|
| `getTenantPrisma` | 793 / 155 | 793 | | | | | |
| tx of `getTenantPrismaForOrg` | 224 / 71 | 224 | | | | | |
| `getTenantPrismaForOrg` | 194 / 52 | 194 | | | | | |
| **tx of bare** | 167 / 45 | 64 (GUC set in tx) | | 3 | 2 | **42** | 56 |
| **bare** | 165 / 53 | | | 33 | 5 | **127** | |
| `getAdminDb` | 100 / 30 | | 99 | | 1 | | |
| tx of `getTenantPrisma` | 73 / 20 | 73 | | | | | |
| MIXED (path-insensitive) | 46 / 16 | 35 | | | | **11** | |
| tx of `getAdminDb` | 8 / 3 | | 8 | | | | |

`withTenantRLS` and `createTenantClient` as a **direct** source: **0** statements. quick-610 closed the last
`createTenantClient` callers, and nothing constructs `$extends(withTenantRLS)` outside `tenant-client.ts`.

### By surface

| surface | statements / files | SCOPED | ADMIN | NO_RLS | RAW_NO_TABLE | **CUTOVER** | BYPASS_DROP |
|---|---|---:|---:|---:|---:|---:|---:|
| `LIB_SERVICES` (`lib/`, `server/`, `actions/`) | 770 / 110 | 639 | 16 | 5 | 6 | **91** | 13 |
| `OWNER_PORTAL` | 425 / 83 | 343 | | 5 | | **67** | 10 |
| `MOBILE_API` | 156 / 52 | 155 | | | 1 | 0 | 0 |
| `API_DRIVER_PAY` | 96 / 28 | 85 | | | | **11** | 0 |
| `API_V1` | 88 / 29 | 80 | | | | **8** | 0 |
| `ADMIN_PORTAL` | 81 / 12 | | 67 | 14 | | 0 | 0 |
| `DRIVER_PORTAL` | 52 / 14 | 46 | | | | 0 | 6 |
| `API_CRON` | 38 / 13 | 11 | 19 | | | 0 | 8 |
| `API_DRIVER` | 22 / 5 | 15 | | | | 0 | 7 |
| `API_USER` | 12 / 3 | | | 12 | | 0 | 0 |
| `API_AUTH` | 9 / 2 | 2 | 2 | | | 0 | 5 |
| `API_REPORTS` | 5 / 1 | 5 | | | | 0 | 0 |
| `API_ADMIN` | 3 / 2 | | | | | **3** | 0 |
| `API_GPS` | 3 / 1 | | | | | 0 | 3 |
| `API_INTEGRATIONS` | 2 / 2 | | | | | 0 | 2 |
| `API_TRACK` · `APP_TRACK` · `API_PUSH_TOKENS` · `API_WARMUP` · `GROUP_AUTH` · `COMPONENTS` | 8 / 6 | 2 | 3 | 2 | 1 | 0 | 2 |

By file kind, cutover-gating: **library 90**, **page 62**, route handler 22, server action 6, layout 0.

### By tenant source

| tenant source | all queries | **CUTOVER** | BYPASS_DROP |
|---|---:|---:|---:|
| `SESSION` | 1,200 | **98** | 35 |
| `PARAMETER` | 367 | **75** | 2 |
| `NONE` | 165 | **7** | 11 |
| `JOB_PAYLOAD` | 38 | 0 | 8 |

**173 of the 180 have a tenant in hand**, so they need a tenant client acquired, not a design. The **7 `NONE`** need
per-site analysis before routing:

- `notification-deduplication.ts` ×3 and `idempotency.ts` ×2 look up by an idempotency key.
- `carrier/notifications.ts:60`.
- `checklists/instances/[id]/page.tsx:10`.

### By failure handling

| failure | all queries | **CUTOVER** | BYPASS_DROP |
|---|---:|---:|---:|
| `LOGGED` | 992 | **96** | 25 |
| `THROWN` | 454 | **67** | 11 |
| `SWALLOWED` | 225 | **16** | 20 |
| `ERROR_RESPONSE` | 99 | **1** | 0 |

The 16 swallowed cutover statements are the worst of the population.

- **12 on owner pages** sit behind `.catch(() => null)` / `.catch(() => [])` and render **"not found"** or an
  empty picker for rows that exist: `carrier/clients/[id]:27`, `contracts/[id]:25,:36`, `contracts/new:20`,
  `facilities/[id]:30`, `fleet/trucks/[id]:46,:72`, `loads/[id]:81`, `templates/[id]:45`, `trips/[id]:40`,
  `checklists/instances/[id]:10`, `settings/account:29`.
- **4 in libraries:** `support-tickets.ts:609` returns 0; `facilities.ts:72` is swallowed by its page caller;
  `fleet-drivers.ts:321,:503` fall back to a default tenant name.

Reads vs writes among the 180: **126 reads, 50 writes.** The writes raise `42501` on INSERT or silently affect
0 rows on UPDATE/DELETE (quick-599). 24 of the 50 writes are `seedStarterPlaybooks`.

### 3.1 The 11 path-insensitive statements (why 180 becomes 169)

`api/driver-pay/me/*` (7 files) run `isMobile ? withBypassRls(fn) : fn(await getPrisma())`. `getPrisma()`
(`lib/driver-pay/require-driver.ts:96`) returns the **bare** client when `isMobile` and `getTenantPrisma()`
otherwise. The scanner does not track the branch, so it sees three arms: bare (cutover), tx-of-bare with the flag
(bypass drop) and tenant (scoped), and takes the worst. **The bare arm is reached only when `isMobile` is true, and
every caller has already sent the mobile branch to `withBypassRls` by then.** So these 11 are bypass-drop class, not
cutover class: **cutover 169 / 46 files, bypass drop 67 / 31 files.** The scanner's number stays 180 because a static
tool must not credit a branch it cannot prove, and each row carries `armsDisagree: true` so it can be found.

---

## 4. Step 4 — reconciliation, never averaged

| method | its number | unit | what it can see | what it cannot see |
|---|---|---|---|---|
| **quick-616 flag census** | **177** (175 after its own routing) | a `set_config('app.bypass_rls')` **call** | statements carrying the flag, in any file | **every query without the flag**; and a flag is not a query — one flag protects 1–5 queries |
| **"45 remaining"** (quick-621 §10) | **45 / 25 files** | same method at today's tree | same | same |
| **quick-621 bare-client inventory** | **125 BLIND_RLS units / 47 files** | a call rooted at the file-locally imported `prisma` **identifier text**, or a whole `$transaction` | bare queries written against the import in the same file | helper-returned / parameter / destructured clients · helpers the tx is passed into · interpolated SQL · shadowed names (overcount) · GUC set via helper (overcount) · staging RLS, not production |
| **this census** | **1,770 queries; 180 (169) cutover; 56 (67) bypass drop** | one Prisma statement | §1 | §1's list; runtime-only shapes |

### R1 — the 45 (and the 177)

- **The replica reproduces the published number exactly: 45 statements / 25 files.** It uses the same rule: the
  innermost call or tagged template whose own literal children contain `app.bypass_rls`. This census's `set_config`
  plumbing rows match it **one for one** (45 = 45, 0 only-in-either).
- **The 45 flags protect 69 queries**: 56 `SILENT_ZERO_AT_BYPASS_DROP`, 11 path-insensitive driver-pay (§3.1), and 2
  `SCOPED` (`driver-dashboard.ts:88/100`, a flag on a tenant-client transaction: decorative).
- **177 → 45 is routing, file by file.** By the same method today there are 45 flags in 25 files, against 175 in 87
  at quick-616's close. **No file's flag count went up** (R4, `02-ground-truth.json`); every decrease is one of
  quick-617 to quick-620's routed files.
- **What the flag method could not see: 169 of the 169 cutover-gating statements.** None carries a flag. That
  includes `(owner)/layout.tsx`'s 3 before quick-621 (GT1).

### R2 — quick-621's 125 units

- **All 125 map to census statements** (0 unmatched). The 125 units contain **149 statements**: a `$transaction`
  unit holds several, and one unit is not one query.
- **116 units contain the 127 cutover-gating statements** that fall inside them.
- **9 units are not hazards, and quick-621 over-counted them:**
  - `(driver)/actions/driver-dashboard.ts:168`, `:174`. `getRecentUnreadMessages` declares
    `const prisma = await getTenantPrisma()`. 621's walker matched the identifier **text** `prisma` against the
    import, so a scoped local shadow was scored bare. This census resolves by declaration and scores them `SCOPED`.
  - `sign-up/actions.tsx:237` and `onboarding/{confirm-tenant-email:36, hydrate-tenant:26, hydrate-tenant:55,
    onboarding-flags:30, onboarding-flags:57, provision-tenant:74}`. Each transaction sets the GUC through
    `setTransactionTenantId(tx, …)` (`lib/db/tenant-guc.ts:47`). 621's `GUC_SCOPED` looked for the literal inside
    the unit only.

### R3 — cutover-gating statements quick-621 could not see: 53

`127 + 53 = 180`, exact.

| file | stmts | why 621 could not see them |
|---|---:|---|
| `server/services/workflows/seedStarterPlaybooks.ts` | **23** | the `tx` is **passed as a parameter** to `createCDLDriverOnboarding` / `createPreTripInspection` / `createPartnerSetup`. 621 counted only the `$transaction` unit at `:477` and the sentinel read at `:468` |
| `lib/notifications/recipient-resolver.ts` | 6 | client arrives as a **parameter** from `dispatcher.ts` (`options.prismaClient ?? defaultPrisma`, an **aliased** import) |
| `lib/notifications/notification-deduplication.ts` | 4 | parameter |
| `lib/carrier/reports.ts` | 4 | 621 **did** count these units, as `BLIND_UNRESOLVED`: their `FROM` lives in an interpolated `selectBlock`. They reach `dispatches`, `carrier_drivers`, `stops`, `carrier_expenses`: **the owner performance report** |
| `api/driver-pay/me/*` (7 files) | 11 | **destructured function value** `getPrisma` from `requireDriverContext`'s returned object (§3.1) |
| `lib/notifications/idempotency.ts`, `in-app-writer.ts` | 2 + 2 | parameter |
| `lib/notifications/dispatcher.ts` | 1 | aliased import `defaultPrisma` |

**The shape quick-621 named as its blind spot (helper-returned or parameter-passed clients) accounts for 49 of the
53.** The other 4 are table resolution.

### R4 — per file

Committed as `r4.perFile` in `02-ground-truth.json`: 87 files at quick-616 → 25 today; 0 files increased.

---

## 5. Step 5 — ground truth, per item

`02-ground-truth.txt`: **20 checks, 20 PASS, exit 0.** Against a `--break-resolver` census: **5 FAIL, exit 1**
(`04-break-resolver-ground-truth.txt`).

| item | a previous method missed it because | result |
|---|---|---|
| **`(owner)/layout.tsx`'s 3** | quick-616 counted flags; these had none (0 of 3) | **FOUND.** At HEAD: 3 statements, all `TX(TENANT_ORG)` / `SCOPED`, reaching `Tenant`, `ActivationProgress`, `User` (GT1a–c). Against the **pre-fix file** (`--override "src/app/(owner)/layout.tsx=37e0bb17^"`): exactly 3, all `BARE` / `SILENT_ZERO_AT_CUTOVER`, same three tables, all `SWALLOWED` — the three `catch {}` quick-621 removed (GT1d–g). The override changes nothing else (GT1h: 1,767 = 1,767) |
| **quick-618's 56 `findUnique` hazards** | quick-617's scan seeded receivers from local declarations only; three digest payloads receive the client as a **parameter** | **56 / 56 FOUND** (GT2b). **Receiver class agrees on 56 / 56** (GT2c): 618's LIVE → tenant client, LATENT → bare, N/A → `ADMIN`. 3 LATENT sites (`activation-tracker.ts:74`, `:96`, `workflows/notifications.ts:252`) now resolve to a tenant client. They are accepted as agreeing **only because** their files changed after 618's close `d456c08b`; both files were in quick-619's routing. **The three parameter-passed digest sites resolve to `TENANT_ORG`** (GT2d): `compliance-30day-payload.ts:79`, `daily-driver-payload.ts:63`, `weekly-owner-payload.ts:68` |
| **quick-615's Route `_count` site** | no `.route.` delegate appears in the file, so a grep of `prisma.<model>` cannot see `Route` (GT3d) | **FOUND.** `(admin)/actions/tenants.ts:329` `tenant.findUnique` with `_count: { select: { users, trucks, routes } }` at `:347` reaches `Tenant, User, Truck, Route, DriverInvitation` (GT3a–b); client `ADMIN` (GT3c) |

**Not found: none.**

The break witness reports honestly what stays green when the resolver is broken:

- **AV1**: the statement count doesn't depend on the resolver.
- **GT1c/f**, **GT2b**, **GT3a/b**: tables and site discovery don't depend on the resolver either.
- **GT1d–h**: the pre-fix run passed in was intact.

What goes red is everything that depends on client resolution: AV2, GT1b, GT2c, GT2d, GT3c.

---

## 6. Step 6 — sizing, and a batch per task

**Cutover class: 180 statements, 6 batches.** Batch sums: 34 + 33 + 31 + 35 + 24 + 23 = 180.

| # | batch | stmts / files | tenant source | reads / writes | what it needs | cautions |
|---:|---|---|---|---|---|---|
| C1 | **owner carrier load + template editors** (`carrier/loads/{[id],new,page}`, `carrier/templates/{[id],new}`) | 34 / 5 | SESSION 22 · PARAMETER 12 | 34 / 0 | one `getTenantPrismaForOrg(session.tenantId)` per page; the helpers take `orgId`. Mechanical | 32 THROWN: reaches the error boundary quick-621 added. Good |
| C2 | **owner portal remainder**: `recently-deleted` 8 · `trips/[id]` 8 · `my-notifications` 5 · `contracts` 3 · `fleet/trucks/[id]` 2 · `trips/[id]/plan` 2 · 5 single-statement pages | 33 / 12 | SESSION 24 · PARAMETER 8 · **NONE 1** | 30 / 3 | same | **10 SWALLOWED** behind `.catch(() => null)`: separate "missing row" from "failed read" as quick-621 did for the layout, or the fix leaves the silent path in place |
| C3 | **notifications pipeline**: `carrier/notifications.ts` 12 · `recipient-resolver` 6 · `notification-deduplication` 4 · `automations/actions/send-email` 4 · `idempotency` 2 · `in-app-writer` 2 · `dispatcher` 1 | 31 / 7 | PARAMETER 18 · SESSION 7 · **NONE 6** | 25 / 6 | **design, not edits.** `dispatchNotification` already has an `options.prismaClient` that **no caller supplies** (§1). Thread a tenant client through it rather than adding acquisitions in six helpers | shared by every trigger; quick-616 §10 row 3 called it "the hard one" and that holds |
| C4 | **workflow engine**: `seedStarterPlaybooks` 25 · `generatePlaybookInstance` 2 · `playbookStepService` 2 · `routers/workflows/playbook` 2 · `trigger`, `stepInstance`, `computeDispatchReadiness`, `failInspectionItem` 1 each | 35 / 8 | PARAMETER 28 · SESSION 7 | 6 / 29 | `seedStarterPlaybooks(tenantId)` is called from the **admin** tenant-create path (`(admin)/actions/tenants.ts:120`) right after a `getAdminDb` insert: the tenant is known, so open the transaction on `getTenantPrismaForOrg(tenant.id)`, **not** the admin connection. **One acquisition in one function covers its 25** (24 writes in the tx helpers + the sentinel read) | 29 writes; the call site LOGS and continues, so today a sysadmin-created tenant would silently get **no starter playbooks** under `app_user` |
| C5 | **lib/carrier + security**: `fleet-drivers` 12 · `reports` 7 · `trips` 2 · `document-types`, `facilities`, `restricted-document-access` 1 each | 24 / 6 | SESSION 15 · PARAMETER 9 | 18 / 6 | `reports.ts` is raw SQL on the bare client: `tenantRawQuery` or a tenant client's `$queryRaw` | `document-types.ts:29` is an **array-form** transaction of upserts: keep it one transaction |
| C6 | **API remainder**: `driver-pay/me/*` 11 (7 files) · `v1/carrier/pay-records/{approve,mark-paid,void}` 6 · `admin/users/[id]/role` 2 · `admin/tenants/[id]/users` 1 · `v1/carrier/dashboard/{drivers-status,messages}` 2 · `support-tickets.ts:609` 1 | 23 / 15 | SESSION 23 | 17 / 6 | `require-driver.ts`'s `getPrisma()` bare arm is **one line** that removes the 11 from cutover class (§3.1); the rest are one acquisition each | `api/admin/*` runs on the tenant connection behind an admin guard: decide per route whether the tenant or `getAdminDb` is right (quick-612's rule: check the client, not the guard) |

**Bypass-drop class: 56 statements (67 with §3.1's 11), 4 batches.** These work today under `app_user` and stop at
the policy drop, so they go after the cutover class.

| # | batch | stmts / files | what it needs |
|---:|---|---|---|
| D4 | **request paths**: owner `carrier/dashboard` 5, `stops/[id]` 3, `trips/[id]`, `trips/[id]/stops`; driver `driver-routes` 2, `tasks` ×3, `driver-dashboard` 1; `api/driver/stops/[stopId]/messages` 5, `gps-ping` 2, `api/gps/report` 3, `integrations/{motive,samsara}`, `push-tokens`, `track/[token]` | 30 / 15 | `getTenantPrismaForOrg` + delete the flag, one per route |
| D3 | **background**: `cron/workflow-digest` 8 · `send-push` 2 · `workflows/notifications` 2 · `notifications/audit-log` 1 | 13 / 4 | `JOB_PAYLOAD` / `NONE` tenant sources; shares C3's threading design |
| D2 | **auth + bootstrap**: B8 `lib/auth/supabase.ts:165` · `api/auth/login` · `api/auth/accept-invitation` 4 · `require-driver.ts:119` | 7 / 4 | **restructuring**, not routing: quick-616 §5's B8 analysis stands (every request reaches it) |
| D1 | **`SupportTicket`** (`actions/support-tickets.ts`) | 6 / 1 | **product decision** on null-tenant tickets (quick-616 §5), not a routing edit |

**Recommended order:**

1. **C4 first.** 25 of its 35 are one edit, and its failure is invisible.
2. Then C1 and C6.
3. Then C5 and C2.
4. C3 last of the cutover class, because it is the only design task.
5. The D batches after the cutover class.

Each batch fits one task at quick-617's demonstrated rate (up to 47 statements across 24 files).

---

## 7. Step 7 — what the in-process TC001 detector can and cannot see

**The detector** is `apps/web/scripts/audit/620-tc001-driver-hook.js`, preloaded into `next dev`. It patches
`pg.Client.prototype.query` in both call forms and prints one line per statement whose SQLSTATE (walked through
`.cause`) is `TC001`.

**`TC001` is raised by the database only when all three hold:**

1. the tripwire is armed on that connection (staging's `pool.on('connect')`);
2. a policy evaluates `current_tenant_id()` while `app.current_tenant_id` is **empty on that connection at that
   moment**;
3. the statement is not bypass-flagged (bypass is exempted inside `tenant_context_required`).

**What it can see:**

- every raise, including those a route swallows (quick-620's reason for moving it into the server);
- dynamic SQL, runtime-built clients, anything static analysis misses, *provided the statement runs on a cold
  connection*.

**What it cannot see, and why `carrier/loads/page.tsx:14` returned 200 with 0 TC001.** The GUC is **session-scoped
on a `max: 1` pool.** `getTenantPrisma*()` issues `set_config(…, false)` on the bare client, and the value stays on
the physical connection until something overwrites it. A bare statement that runs after any scoped call in the same
process inherits that value, satisfies condition 2 and raises nothing. quick-621 made this *more* likely: the owner
layout now scopes at the start of every render, so every owner page's bare statements run warm. Three consequences:

- **The detector is blind to the whole cutover class** whenever a scoped statement ran earlier on that connection,
  which in a click-through is nearly always. 62 of the 180 are on pages.
- **"0 TC001" in a click-through is evidence about the layout, not the pages.** quick-621 §7 already said so; this
  census shows how much it covers: 180 statements.
- **Inheritance is not only same-request.** The first bare statement of a request inherits **the previous
  request's tenant**. Under `app_user` that is not a silent zero but a **wrong-tenant read**. Staging's click-through
  logs in one tenant at a time, so it cannot show this.

**Should the detector change?** Its SQLSTATE matching is correct; keep it. Change what it runs against: **reset the
GUC at the request boundary in the staging harness.** An `AsyncLocalStorage`-scoped hook issues
`set_config('app.current_tenant_id', '', false)` when a request starts. This removes **cross-request** inheritance
so the first bare statement of every request raises. It is safe because `getTenantPrisma*` re-sets the GUC
immediately before returning a client.

**Do not reset on every pool checkout.** The mechanism relies on inheritance between the `set_config` statement and
the next query, so that would make every scoped statement raise.

**Can any runtime instrument see this class at all?**

- **At the database or driver layer: no, not completely.** A bare statement that runs after a scoped statement in
  the same request is byte-identical SQL on a connection whose GUC names the correct tenant. The database answers
  it correctly, and nothing at that layer can tell it apart from a scoped statement. The request-boundary reset
  catches everything *before* the request's first scoped acquisition, and nothing after it.
- **At the application layer: yes.** Client identity exists only in the application. A staging-only
  **client-identity tracer** can see it: a Prisma `$extends` query extension on the exported bare `prisma` that
  logs model ops and `$queryRaw`/`$executeRaw` with a stack, while `createTenantClient` and the admin client extend
  an **un-traced** base. That flags every bare statement at runtime regardless of GUC state, including shapes static
  analysis cannot reach.
- **Recommendation:** pair the three instruments, because each sees what the others cannot:
  - this census: static, complete over the source, blind to runtime-built SQL;
  - the request-boundary-reset TC001 hook: database truth, blind to same-request inheritance;
  - the client-identity tracer: runtime truth about the client, blind to paths no click-through reaches.

  None of the three is built by this task.

---

## 8. What this task did not do

- **No call site fixed.** The 180 are listed, not changed.
- **No write** to production or staging. Production was read once, read-only, through a single `pg_class` /
  `pg_policy` / `has_table_privilege` query, captured verbatim in `00-production-rls-tables.json`.
- **No policy, grant or migration** touched. Nothing installed.
- quick-616, quick-618 and quick-621's evidence files are **read, not modified**.
- **Every total above is a filter over `01-query-census.json`**, one row per statement.
