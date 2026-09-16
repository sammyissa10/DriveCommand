---
phase: quick-621
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, layouts, census-blind-spot, error-boundary, tc001]
requires:
  - quick-616 census (flag-keyed)
  - quick-620 finding — (owner)/layout.tsx TC001 x3 behind HTTP 200, found by the in-process driver hook
provides:
  - a sweep of all 35 request-time special files; exactly one queries
  - (owner)/layout.tsx scoped, its three swallows removed, a root error boundary for layout failures
  - 621-bare-client-inventory.ts — the first measurement of the census's blind spot (125 BLIND_RLS units / 47 files after)
affects:
  - apps/web/src/app/(owner)/layout.tsx
  - apps/web/src/app/error.tsx (new)
  - apps/web/scripts/audit/wrapper-countdown.json (566 -> 567)
decisions:
  - "a failed layout read propagates; a missing row keeps its default — the two are no longer the same code path"
  - "root src/app/error.tsx added: a group's error.tsx cannot catch its own layout; without a root boundary a throw lands in global-error.tsx"
  - "the 125 blind units outside the swept class are reported, not fixed — they need a regenerated census and per-site tenant-source analysis"
  - "brief corrected by measurement: production connects as postgres (rolbypassrls), so the sidebar is not blank on production today"
metrics:
  swept_files: 35
  querying_special_files: 1
  statements_routed: 3
  census_blind_rls_units_after: 125
  completed: 2026-09-16
---

# quick-621 — the sweep found one layout; the census's blind spot is at least 125 units

Executed inline by the orchestrator rather than planner and executor subagents; `621-PLAN.md` records why.

## 0. Baseline and preconditions

**vitest from the working tree at `7473fbef`, before any edit:** `2143 · 2024 passed · 64 failed · 52 pending ·
25 failing files`, the same failing set as quick-620's close.

**Staging:** `app_user`, `rolbypassrls false`, tripwire armed (unscoped TC001 / scoped ok / disarmed silent 0),
`bypass_rls_policy` 86 on 86, sorted list identical to production (sha256 `315c31b0…`). **Stated ordering:** at
task start I read roles, policies and RLS state through read-only MCP queries, but `621-preconditions.ts` ran
after the layout commit and the `--throw-after-drop` rehearsal, not before them. Both of those restored or touched
no staging data, and every precondition passed when run.

## 1. Step 1: 35 request-time special files, one queries

11 `layout.tsx` · 0 `template.tsx` · 14 `loading.tsx` · 6 `error.tsx` · 1 `global-error.tsx` · 1 `not-found.tsx`
· 0 `default.tsx` · `src/middleware.ts` · `src/instrumentation.ts`.

- **`(owner)/layout.tsx` is the only one that issues a query.** The other 10 layouts call only `getSession` /
  `getRole` / `isSystemAdmin`, which read claims (`lib/auth/supabase.ts:42/73/120`).
- **Middleware** calls Supabase `auth.getUser()` over HTTP (`:112-113`). **Instrumentation** is Sentry-only.
- **Every provider and component the layouts render is client-side** with no database import (`OwnerShell`,
  `TRPCReactProvider`, `AuthProvider`, `DriverNotificationBell` and others). The one querying server component in
  `src/components` (`SuggestedTemplates.tsx:24`) is page-rendered and already scoped.
- **76 `after()` sites**, all in route handlers, server actions or library files.
- **None** of `sitemap`/`robots`/`manifest`/OG images/`generateMetadata` exist.

Evidence: `evidence/01-02-03-sweep.md`.

## 2. Step 2: the querying site, and what it swallowed

`(owner)/layout.tsx` before the fix. For all three reads the client is **bare `prisma`**, the tenant **is in
scope** (`session.tenantId` from `:27`), and **no GUC is set**:

| read | lines | swallowed at | rendered instead |
|---|---|---|---|
| `Tenant.name` | 40-42 | **`catch {}` :44-46** | `tenantName = null` → logo / "Workspace" |
| `ActivationProgress` | 53-55 | **`catch {}` :60-64** | `onboardingComplete = false` → ribbon forced on |
| `User.onboardingTourSeen` | 70-72 | **`catch {}` :74-76** | `tourSeen = true` → tour suppressed |

**All three swallow a failure behind a successful HTTP 200 render, with no log line.** No other request-time
special file queries, so these are the only swallowing sites in the swept class.

**Correction to the brief, measured.** On production, `postgres` has `rolbypassrls = true`, and
`pg_stat_activity` shows every application connection as `postgres` via Supavisor, with no `app_user` session. So
**production's sidebar is not blank today**: the reads skip RLS there and return data. The defect is live on
staging and any `app_user` environment, and was set to go live on production at the cutover. The fix is equally
necessary; the urgency framing was not accurate.

## 3. Step 3: reconciliation. The census's blind spot is the flag, not the file type

**The census counted 0 of the 3 layout statements.** Its surface rules include `src/app/(owner)/**`, so the file
was in scope by path. Its walker counts **the innermost call whose literals contain `app.bypass_rls`**, which makes
the flag its unit of account. **A tenant-table query on the bare client that never set the flag is invisible to
it in every file kind.** The layout is just where that surfaced first.

`621-bare-client-inventory.ts` counts the query instead: units rooted at the imported `prisma`, tables resolved via
`@@map` plus raw SQL, and RLS state measured on staging. It is witnessed red with `--break-visitor`, and its
positive witness is the layout's three reads.

| category | before | after |
|---|---:|---:|
| CENSUS_VISIBLE (what 616 counted) | 40 | 40 |
| GUC_SCOPED (unit sets `app.current_tenant_id` itself) | 9 | 9 |
| **BLIND_RLS** | **128 units / 48 files** | **125 / 47** |
| BLIND_NO_RLS | 32 | 32 |
| BLIND_UNRESOLVED | 8 | 8 |

BLIND_RLS after, by kind: **pages 62 units / 16 files**, **library 46 / 20**, server actions 9 / 4, route handlers
8 / 7, layouts 0. The heaviest are `lib/carrier/notifications.ts` (12), `carrier/loads/[id]/page.tsx` (10),
`carrier/templates/[id]/page.tsx` (9), `carrier/recently-deleted` and `carrier/trips/[id]` (8 each), plus admin API
routes that reach `User` on the tenant connection. The count is **a floor**: a bare client returned by a helper or
passed as a parameter is not followed.

**The remaining programme is scoped against 45 census statements. The measured blind spot is at least 125 units
beyond that.**

## 4. Step 4: `(owner)/layout.tsx` fixed (`37e0bb17`, 2 files / 135 lines)

- **Scoping.** One `getTenantPrismaForOrg(session.tenantId)`, with **userId not passed**, and one `$transaction`
  with `TX_OPTIONS`. The three raw SQL reads became typed model reads:
  - `ActivationProgress` keeps its `tenantId` predicate.
  - `Tenant` is extension-exempt, isolated by the id predicate plus `tenant_self_read`.
  - `User.findUnique` gets its tenant predicate from quick-618's findUnique fix.
- **Swallow, separately.** A **missing row** keeps its deliberate default, preserving the old row-absent
  semantics exactly. A **failed query** now propagates.
- **Root error boundary.** A group's own `error.tsx` cannot catch that group's layout; the parent segment's
  boundary does, and the app root had none, so a throw would have landed in `global-error.tsx`, which replaces the
  root layout. Added **`src/app/error.tsx`**: it logs with the error in slot 2 and renders a styled page with Try
  again / Go home, without echoing the raw message.
- **tsc** is clean and proven not blind (a TS2322 probe was reported, then removed). The inventory's positive
  witness went 3 → 0.

## 5. Step 5: the rest of the swept class

**Nothing else to fix.** No other layout, template, boundary, middleware, instrumentation or provider queries.

The 125 BLIND_RLS units are in pages, library, actions and routes. They are the census's blind spot, not this
sweep's class, so they are **stop-and-report**: each needs its own tenant-source analysis (several are admin
paths, which belong on `getAdminDb`, not a tenant client), and together they far exceed this task's commit caps.

## 6. Step 6: proof, with `bypass_rls_policy` dropped on `Tenant`, `ActivationProgress`, `User`

`621-layout-verify.ts` reuses 620's capture/drop/restore verbatim and has **no `process.kill`**. The
`--throw-after-drop` rehearsal went `86 → 83 → 86`, sorted list identical, exit 3.

**Run: 15/15 PASS** (`06-probe-cells.json`), each function cell in a cold process using the fixed dual-form
driver hook.

| cell | result |
|---|---|
| `hook-control` | caller TC001, hook recorded 1 |
| `control:old-layout-raw-read` | the pre-fix SQL raises TC001 at the driver: exactly what `catch {}` turned into a blank name |
| `fn:owner-layout:tenant-A` | **the real `OwnerLayout` returned `OwnerShell` props equal to a privileged read on all 4 fields**: `tenantName "Staging Alpha Carriers"`, `onboardingComplete false`, `congratsShownAt null`, `tourSeen false`; not tenant B's name; 0 TC001 |
| `fn:owner-layout:tenant-B` | same, `"Staging Beta Logistics"`; activation row absent → default `false`, as intended |
| `fn:owner-layout:failure-propagates` | an empty tenant claim now **rejects** (P2007); the old layout rendered defaults with 200 |
| `fn:owner-layout:cross-tenant-user` | tenant A session with tenant B's owner id → `tourSeen false`, 0 TC001. **UNPROVEN BY DATA:** B's owner also has `false` on staging, so a leaked read looks identical to the default |
| `table:Tenant` / `table:User` | unscoped TC001; cross-tenant **PROVEN** on real rows |
| `table:ActivationProgress` | unscoped TC001; own 1, foreign 0; cross-tenant **UNPROVEN BY NAME** — tenant B holds no row on staging |
| `http:{A,B}:{/help, /carrier/dashboard, /dashboard}` (6 cells) | **200; own tenant's name in the HTML; other tenant's name absent; no "Workspace" fallback; 0 `[q620-hook] TC001` lines** in each request's log slice. Sessions were logged in before the drop; pages were fetched during it. The first `/help` was a cold compile on a cold pool, which is exactly where quick-620 saw the raises |

**Restore:** re-created 3, live 86, sorted list identical, 0 body mismatches. **Against production:** identical,
sha256 `0fa356b9…`, md5 `29498ef6…`. Re-read at the end: 86, md5 `29498ef6…`.

## 7. Step 7: both click-throughs, in-process detector

Hook control **PASS in 4 server processes**. **Arming counter-assertion: all four parts PASS.**

| run | entries | pass | fail | not-reachable | TC001 (in-process) |
|---|---:|---:|---:|---:|---:|
| web (604 passes 1+2) | 66 | **60** | **0** | 6 | **0** |
| mobile (617) | 30 | 24 | 5 | 0 | **0** |

- **The web TC001 count moved from 12 to 0.** Exactly quick-620's four failing surfaces (`/dashboard`,
  `/carrier/dashboard`, `/carrier/trips`, `/crm`) went fail → pass, and no other entry changed. All 12 of 620's
  raises were the layout's three statements, so **no remainder.**
- **Mobile is identical to quick-620** entry for entry; its 5 failures are the known staging P2022 drift and the
  missing-parameter 400. The harness's own whole-log check reads 1: the only "TC001" text in the log is my launcher
  banner line (`07-tc001-by-range.txt`), and there are 0 hook lines anywhere.

**What 0 does not mean.** `carrier/loads/page.tsx:14` is a BLIND_RLS bare `carrierClient.findMany` on `clients`.
Both runs requested `/carrier/loads` and got 200 with 0 TC001, because the connection already carried a tenant GUC
(quick-610's pool inheritance). The in-process detector fires only on the first tenant-touching statement of a cold
connection. Since this fix sets the GUC at the start of every owner render, **the 62 page units are now *less*
likely than before to surface in a click-through.** The click-through result says the layout is fixed; it says
nothing about the pages.

## 8. Does the census need regenerating? Yes, keyed on the query, not the flag

Every remaining surface is sized against a census that cannot see the largest class of cutover hazard. The
replacement method:

1. **Unit of account = a tenant-table statement, not a flag.** Walk every call and tagged template rooted at *any*
   client acquisition: the bare `prisma` import, **plus** values returned by helpers and clients passed as
   parameters (the two flows `621-bare-client-inventory.ts` does not follow), resolved with a `ts.Program` and type
   checker so a receiver's origin is known rather than guessed from its name.
2. **Classify each by the tables it reaches**, via `@@map` and raw-SQL parsing, against **live `pg_class` /
   `pg_policies` read at census time**, and by client: bare / tenant client / GUC-scoped transaction / admin
   connection / flag-carrying.
3. **Record, per unit, the tenant source** (session / parameter / payload / none). This is what decides whether it
   routes or stops, and it is the step every batch has repeated by hand.
4. **Keep the flag census as a column, not the population.** The 45 flagged statements are a subset of the new
   total.
5. **Pair it with the in-process hook, never replace it.** The hook sees what static analysis misses (dynamic SQL,
   helper-returned clients); static analysis sees what inheritance hides from the hook.

`621-bare-client-inventory.ts` is a working first cut of 1–2 and gives the floor: **125 BLIND_RLS units in 47
files, in addition to the 45 flagged statements.**

## 9. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** |
| `npm run build` | **exit 0**; the two docs search-index files reverted as pre-existing drift |
| vitest after the last code/test commit (`0adbeb28`) | `2143 / 2024 / 64 / 52`, 25 failing files |
| vs step-0 baseline | **failing-file set IDENTICAL** |
| wrapper countdown | 566 → **567**, +1 unit in `(owner)/layout.tsx`, `filesScanned` +1 for `error.tsx`; regenerated, assertion untouched |

Commits: `37e0bb17` (fix, 2 files), `ae05c72b` (countdown), `0adbeb28` (scripts and evidence, over the file cap:
generated artefacts, stated).

## 10. Remaining surfaces

**Census (flag-keyed), unchanged by this task: 45 statements in 25 files.**

| surface | files | statements |
|---|---:|---:|
| LIB_SERVICES (stopped residue) | 6 | 11 |
| OWNER_PORTAL | 4 | 7 |
| DRIVER_PORTAL | 4 | 6 |
| API_DRIVER | 2 | 6 |
| API_CRON | 1 | 4 |
| API_AUTH | 2 | 3 |
| API_DRIVER_PAY | 1 | 2 |
| API_GPS | 1 | 2 |
| API_INTEGRATIONS | 2 | 2 |
| API_PUSH_TOKENS | 1 | 1 |
| API_TRACK | 1 | 1 |

**Added by this sweep: the census's blind spot, at least 125 BLIND_RLS units in 47 files** (pages 62/16, library
46/20, server actions 9/4, route handlers 8/7), plus 8 BLIND_UNRESOLVED units to classify by hand. The request-time
special-file class contributed 3 and is now 0.
