# The nuqs adapter render failure

**Task:** quick-605 · **Opened:** 2026-09-15 · **Branch:** `master`

`nuqs` throws at render time when a `useQueryState` call finds no `NuqsAdapter` above it in the React
tree:

```
⨯ Error: [nuqs] nuqs requires an adapter to work with your framework.
  See https://nuqs.dev/NUQS-404
    at useGridUrlState (src\components\data-grid\core\useGridUrlState.ts:43:46)
    at useDataGrid (src\components\data-grid\core\useDataGrid.ts:162:35)
```

Before this task the adapter was mounted in exactly one layout in the repository —
`src/app/(dev)/layout.tsx` — and `(dev)` contains no pages. **The only mount in the app served no
route at all.**

---

## 1. What this measured and what it deliberately did not

**Measured.** Every page in `apps/web/src/app` that transitively imports a `nuqs` hook, enumerated by
a committed source scan; a runtime verdict for each of those pages taken over real HTTP against
**staging** with a real session cookie, before and after the fix; the behaviour of `npm run build`
and of the three e2e specs that come closest to these routes.

**Not measured, and stated here rather than left to be inferred:**

- **Nothing was measured against production.** Production was never connected to, read or written by
  this task. Every runtime verdict below is a **staging** verdict, and §3 contains the standing proof
  that a staging 200 and a production 200 are different claims.
- `/carrier/imports/[id]/stops` was never rendered: staging holds **zero** `document_imports` rows, so
  there is no id to put in the segment. No request was issued for it at all — see §3.
- Client-side interactions (clicking a tab, sorting a column) were not driven. Every row is a first
  paint of a URL.
- `src/app/global-error.tsx` is outside the fix's coverage by construction; §5 states what that does
  and does not mean.

**The authority for every row in §3 and §6 is the literal string `nuqs requires an adapter`** in the
full response body or the correlated server-log slice — not the HTTP status. A 500 without that
string is a different defect and is not attributed here; a 200 with it would be a swallowed failure.

**Instruments.** `apps/web/scripts/audit/605-nuqs-coverage.ts` (the static trace, committed, and the
same code the vitest guard imports) and a new `--surfaces3` mode on quick-604's committed harness
`apps/web/scripts/audit/604-click-through.ts`. No third harness was written. quick-604's own
artefacts were not modified: `04-click-through.json` and `04-server.log` are byte-identical before and
after this task, and `--surfaces3` writes into quick-605's evidence directory and correlates against
its own server log.

---

## 2. The consumer trace

`grep -rn "from 'nuqs" apps/web/src` returns exactly two hits: the adapter mount and one consumer
module, `src/components/data-grid/core/useGridUrlState.ts:10`
(`parseAsInteger`, `parseAsString`, `parseAsJson`, `useQueryState`). There is no `useQueryStates`
anywhere. So the blast radius is entirely "what renders `useGridUrlState`".

`useDataGrid.ts:162` is `const urlState = useGridUrlState(enableUrlSync)` — an **unconditional** call,
because it is a hook. The flag only changes the derived values inside. **Any `useDataGrid` render
throws, whatever `enableUrlSync` says.** There is no configuration that explains which pages fail.

The scan walked **1,691** `.ts`/`.tsx` files under `apps/web/src`, BFS **up** the import graph from
that one seed module to every Next special file that can reach it. It found **7 pages in two route
groups**:

| route | route group | page file | import chain that reached it |
|---|---|---|---|
| `/carrier/driver-pay/settlements` | `(owner)` | `(owner)/carrier/driver-pay/settlements/page.tsx` | `useGridUrlState` → `useDataGrid` → `settlements/_components/SettlementListTable.tsx` → page |
| `/checklists/automation` | `(owner)` | `(owner)/checklists/automation/page.tsx` | `useGridUrlState` → `useDataGrid` → `automation/_components/CustomRulesTable.tsx` → `AutomationClient.tsx` → page |
| `/carrier/driver-pay/reports` | `(owner)` | `(owner)/carrier/driver-pay/reports/page.tsx` | `useGridUrlState` → `useDataGrid` → `reports/_components/AccessorialSpendReport.tsx` → page |
| `/carrier/driver-pay/reports/[driverId]` | `(owner)` | `(owner)/carrier/driver-pay/reports/[driverId]/page.tsx` | `useGridUrlState` → `useDataGrid` → `[driverId]/_components/SettlementsYtdTable.tsx` → page |
| `/carrier/imports/[id]/stops` | `(owner)` | `(owner)/carrier/imports/[id]/stops/page.tsx` | `useGridUrlState` → `components/data-grid/index.ts` → `carrier/imports/StopReviewScreen.tsx` → page |
| `/docs/features` | **`(admin)`** | `(admin)/docs/features/page.tsx` | `useGridUrlState` → `useDataGrid` → page |
| `/docs/database/[model]` | **`(admin)`** | `(admin)/docs/database/[model]/page.tsx` | `useGridUrlState` → `useDataGrid` → `[model]/_components/FieldsTable.tsx` → page |

**Two route groups is the decisive fact for the fix.** `(admin)/docs/*` is not under `(owner)`, so
mounting the adapter in `(owner)/layout.tsx` — the obvious move, matching the `(dev)` precedent —
could not have fixed the admin pages without a second mount.

### One of the seven is a barrel-only edge, and the trace over-reports it

`/carrier/imports/[id]/stops` reaches the seed through `src/components/data-grid/index.ts`, the
barrel. What `StopReviewScreen.tsx:69` actually imports is **`useGridSelection`**, which is
zustand-backed and touches no nuqs at all (`useGridSelection.ts` imports only `react`, `zustand` and
local types). `StopReviewScreen` renders no `<DataGrid>`. So the import edge is real — the barrel
re-exports `useGridUrlState`, so that module is evaluated — but **the hook is never called, and the
page would not have thrown.**

This is recorded rather than trimmed. The over-report is in the conservative direction: the trace
names a page that does not need the adapter, which costs one row of coverage and never hides one. A
scan that resolved barrels precisely would be a scan that could also miss a real consumer through a
barrel, and this is not the trade to take on a screen that answers 500 in production.

### Mounts found

| layout | route group | covers |
|---|---|---|
| `src/app/(dev)/layout.tsx` | `(dev)` | `(dev)` — which contains **zero pages** (`find src/app/(dev) -type f` returns one file, the layout itself) |

Coverage before the fix: **0 of 7 pages covered.**

---

## 3. The BEFORE verdicts

Taken against `http://localhost:3000` on 2026-09-15, server pointed at **staging**
(`wyixpgunnjmzguhggocz`) on the `app_user` role with the quick-602 tripwire armed, sessions obtained
from the real `POST /api/auth/login`. `(owner)` rows use the seeded OWNER_A fixture; `(admin)` rows
use the seeded `sysadmin@staging.test` fixture. Dynamic segments were resolved from staging by SQL and
**scoped to OWNER_A's tenant** — an earlier run took "the first row in the table", which belonged to
the other seeded tenant, and the page answered 404: a measurement of the id the script chose, not of
the page.

**Every row is its own verdict. There is no summary row.**

| route | HTTP | `nuqs requires an adapter` present | verdict | why |
|---|---|---|---|---|
| `/carrier/driver-pay/settlements` | **500** | **yes** | **BROKEN** | throws on first paint; `SettlementListTable` renders unconditionally |
| `/checklists/automation` | **500** | **yes** | **BROKEN** | throws on first paint; `CustomRulesTable` renders unconditionally |
| `/docs/features` | **500** | **yes** | **BROKEN** | throws on first paint. Not previously measured by any task |
| `/docs/database/[model]` (`?model=Tenant`) | **500** | **yes** | **BROKEN** | throws on first paint. Not previously measured by any task |
| `/carrier/driver-pay/reports?tab=settlement-history` | **500** | **yes** | **BROKEN** | the same page as the row below, with an explicit tab. `SettlementHistoryReport` has no data gate |
| `/carrier/driver-pay/reports` (default tab) | 200 | no | **LATENT** | the `isEmpty` data gate at `page.tsx:122` replaced the whole content block. The empty-state sentence *"No payroll activity in this period"* was **found in the response body** — positive evidence the grid branch was not taken |
| `/carrier/driver-pay/reports/[driverId]` | 200 | no | **LATENT** | `settlements.length === 0` at `page.tsx:124` replaced `SettlementsYtdTable` with a sentence. *"No finalized or paid settlements for"* was **found in the response body**. Staging holds **0** `driver_settlements` rows |
| `/carrier/imports/[id]/stops` | — | — | **NOT_MEASURED** | `public.document_imports` holds **zero** rows on staging, tenant-wide. **No request was issued.** Statically it is the barrel-only edge of §2, so it is also expected safe — but "expected safe" is not a verdict and it does not get one here |

### A LATENT row is not a safe row

**A LATENT row is not a safe row.** It is a row whose 500 is being held off by the contents of a
database, and databases change.

`/carrier/driver-pay/reports` measured 200 on staging. It will measure 500 on any tenant with payroll
activity in the selected period, **on the default tab, with no user interaction at all.** The page has
two entirely separate gates and they must not be conflated:

1. **The tab gates.** `reports/page.tsx` has eight branches, `tab === 'overview'` through
   `tab === 'settlement-history'` (lines 166, 250, 254, 258, 262, 266, 270, 274). All eight
   `_components` that call `useDataGrid` sit inside one branch or another, so seven of the eight tabs
   are one click away from the throw whatever the data says. This is why the explicit
   `?tab=settlement-history` row exists in the sweep, and it measured **500**.
2. **The data gate, which is the serious one.** Line 122:
   `const isEmpty = tab === 'overview' && kpis?.totalPayroll.current === '0.00'`. When true, line 168
   replaces the *entire* content block — KPI cards, charts, `SettlementsTable`, operational metrics —
   with an empty state. When false, `SettlementsTable` renders, `useDataGrid` is called, and the page
   throws.

Staging's seeded tenants have no payroll activity, so `totalPayroll.current` is `'0.00'`, so the empty
state renders and the page answers 200. **The 200 quick-604 recorded for this route is a property of
staging's fixture data, not a property of the page.** A production tenant with a single finalised
settlement in the selected period gets a 500 on the default tab of a route reached from the Driver Pay
nav.

`/carrier/driver-pay/reports/[driverId]` is the same shape and was **not anticipated by the plan**: its
`SettlementsYtdTable` sits behind `settlements.length === 0`. One finalised settlement for that driver
turns its 200 into a 500 as well.

**So the live production impact is larger than the two screens the task title names.** Counting what
this sweep actually establishes: **four routes are broken on first paint for every tenant**
(`settlements`, `automation`, `/docs/features`, `/docs/database/[model]` — the latter two never
measured by any previous task), **two more are broken for any tenant that has payroll data**, and one
is unmeasured. That is six live 500s, not two.

---

## 4. Why nothing caught it

Four gates. Each is blind for a **different** structural reason, and a route-group-scoped provider is
invisible to all four.

### 4.1 `npm run build` — the `(owner)` pages

`(owner)/layout.tsx:10` is `export const dynamic = 'force-dynamic'`, with the comment *"All owner-portal
pages require auth — force dynamic rendering so Next.js never attempts static pre-rendering (which has
no session context)."* That is correct and desirable; it is also, exactly, why the build cannot see
this.

`npm run build` exits **0**. All five `(owner)` routes in the trace print `ƒ` — *Dynamic —
server-rendered on demand* — in the route table (`evidence/02-build-route-table.txt`). A route Next
never renders is a route whose render-time throw Next never observes.

**Verdict: structurally blind. `force-dynamic` guarantees it.**

### 4.2 `npm run build` — the `(admin)` pages, which were the genuinely open question

`(admin)/layout.tsx` has no `dynamic` export — grepped across the whole group, the only
`force-dynamic` lines are on ten individual `(admin)` **pages**, and `(admin)/docs/` is not one of them.
`(admin)/docs/features/page.tsx` is `'use client'` with no `dynamic` of its own. And
`(admin)/docs/database/[model]/page.tsx` carries a **`generateStaticParams()`** at line 11 that returns
one entry per Prisma model — the clearest possible signal that Next is meant to prerender it.

It does not. Both print **`ƒ`** in the same route table.

The hypothesis the plan offered is **confirmed, by following the call rather than asserting it**:
`(admin)/layout.tsx:12` awaits `getSession()`; `getSession` (`lib/auth/supabase.ts:42`) dynamically
imports and awaits `createSupabaseServerClient()`; `lib/supabase/server.ts:2` imports `cookies` from
`next/headers` and `:5` does `await cookies()`. A `cookies()` read opts the whole segment out of
prerendering, so the layout drags both docs pages dynamic regardless of what the pages themselves say.

A consequence worth recording on its own: **`generateStaticParams` on `/docs/database/[model]` is dead
code.** It cannot produce a prerendered page while its parent layout reads cookies.

**Verdict: blind, and for a reason that is invisible in the page's own file — it lives two modules up
the layout chain.**

### 4.3 …and the honest headline, which is bigger than either

The whole-table census from that same build:

| marker | count |
|---|---|
| `ƒ` Dynamic | 437 |
| `○` Static | 5 real routes (`/_not-found`, `/accept-invitation`, `/forgot-password`, `/reset-password`, `/unauthorized`) |
| `●` SSG | **0** |

Five prerendered pages in the entire application, **all of them auth-free**, and no SSG at all. Every
route group that can hold a `useDataGrid` — `(owner)`, `(admin)`, `(driver)` — reads a session before
it renders anything. So it is not that these seven pages happened to be dynamic: **no nuqs consumer in
this repository can be prerendered under the current layout structure, and `npm run build` therefore
cannot catch this class of defect at all.**

One thing this build could not settle, stated rather than guessed: whether Next's prerender of a
*genuinely static* client page executes hooks deeply enough to hit the context throw. There is no
prerendered nuqs consumer to observe, and manufacturing one would be a product change outside this
task's scope. The question is open; **the operational answer for this repository does not depend on it.**

### 4.4 The three e2e specs — each came close, each was the wrong shape

`grep -rn "driver-pay/settlements\|checklists/automation\|docs/features\|docs/database" apps/web/e2e/`
returns **nothing**. Full working in `evidence/02-e2e-coverage.md`; the per-spec verdicts:

- **`e2e/carrier/reports.spec.ts`** visits `/carrier/reports/aging|driver-pay|performance|revenue`
  (`:13`, `:32`, `:72`, `:90`). **`/carrier/reports/driver-pay` is not `/carrier/driver-pay/reports`** —
  two real directories, no redirect between them (`next.config.ts:19` contains exactly two redirects,
  both `/carrier/dispatches*` → `/carrier/trips*`), and `grep` for `useDataGrid` under
  `(owner)/carrier/reports/driver-pay/` returns nothing, so the page this spec visits is not a nuqs
  consumer in the first place. **It was never near it**, despite looking one word away.
- **`e2e/carrier/access.spec.ts`** asserts `expect(page.url()).not.toContain(...)` under a DRIVER
  storage state (`:19`, `:25`, `:31`, `:37`, `:43`) and `toMatch(/\/login/)` anonymously (`:60`, `:69`,
  `:78`). A redirect assertion never renders the page. Its one owner-authorised block (`:87`–`:107`)
  reaches `/carrier/dashboard`, `/carrier/dispatches` and `/carrier/reports/driver-pay` — none a nuqs
  consumer. **The route name appearing in a file is not coverage.**
- **`e2e/owner/navigation-reachability.spec.ts`** does one `page.goto('/carrier/dashboard')` (`:96`),
  reads the sidebar's `href` attributes, and asserts membership (`:106`). **It never navigates to a
  destination.** And this is the spec whose header (`:4`–`:45`) documents seven consecutive phases that
  reported a nav entry as wired when it was not — the repo's own convention from quick-566/567 being
  that a nav claim is not done until a DOM query finds its link. **It proves the LINK, not the
  DESTINATION.** Four of the routes on the other end of links like these answer HTTP 500, and a spec
  built to stop "reported as wired, actually unreachable" cannot see unreachable-by-500.

  Separately: the seven trace routes are not in `REQUIRED_SIDEBAR_HREFS` at all, because the sidebar
  does not link them — they are reached from `/checklists` and from the Driver Pay pages. So even a
  navigating version of this spec would not have reached them.

**The suite is not excused by not running.** `.github/workflows/playwright.yml` runs the FULL chromium
suite (`npx playwright test --project=chromium`, no `@smoke` filter) on every push and PR to `master`,
and no spec file is skipped out of it — every `test.skip` in `e2e/` is data-conditional or a
mobile-project guard, inside a test body. All the files involved are present on `origin/master`
(tip `86d3a584`), so the branch the workflow watches has carried this defect. **Whether the workflow is
currently green could not be read from this machine** — `gh` is unauthenticated here and I did not
authenticate it; that is a stated limitation, not a pass. It does not change the answer, which is
structural: no spec navigates to any of these routes as an authorised user.

**Verdict: three near misses, three different shapes, zero coverage.**

### 4.5 `tsc`

A missing React context is a runtime error, not a type error. The type gate cannot see this by
construction. `npx tsc --noEmit` is clean and always was.

### 4.6 The shape that generalises

Four gates, four different structural blind spots:

| gate | why it is blind |
|---|---|
| `npm run build`, `(owner)` | `force-dynamic` — the page is never rendered at build |
| `npm run build`, `(admin)` | a `cookies()` read two modules up the layout chain does the same thing implicitly, and kills a `generateStaticParams` on the way |
| Playwright | no spec navigates to any of the routes as an authorised user; the one spec built to prove reachability proves links, not destinations |
| `tsc` | a missing context is not a type |

**A provider mounted in the wrong route group is invisible to all four.** It compiles, it type-checks,
it builds, it has a plausible-looking mount you can grep for, and the only thing that fails is a render
nobody automated. That is the class — not "we forgot to test these two pages".

---

## 5. The fix

Three lines of substance, in one file.

**`src/app/layout.tsx`** — `NuqsAdapter` imported from `nuqs/adapters/next/app` and wrapped as the
**outermost** child of `<body>`:

```tsx
<body className={inter.className}>
  <NuqsAdapter>
    <AuthProvider>
      {children}
      <SupportTicketModal />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  </NuqsAdapter>
</body>
```

The root layout is a server component and this is a client provider; that is ordinary and already
demonstrated two lines down by `AuthProvider`.

**Why the root and not `(owner)/layout.tsx`.** The consumers span two route groups (§2). A
group-scoped mount cannot cover a sibling group, so mounting in `(owner)` — the obvious move, and the
one the existing `(dev)` precedent invites — would have left `/docs/features` and
`/docs/database/[model]` answering 500 and would have required a second mount to fix them. One mount
at the root covers both, and covers `(driver)`, `(shared)`, `(auth)` and every root-level route as
well, so the next `useDataGrid` page cannot land outside it.

**Why outermost and not inside `AuthProvider`.** The adapter then covers `SupportTicketModal` and
`Toaster` — both rendered on every page in the app — as well as `{children}`, and its availability
stops depending on anything about `AuthProvider`'s internals. Nesting it inside would work today and
would couple two unrelated providers' order for no reason. The reason is written into a comment above
the mount, not left to be rediscovered.

**Nothing else changed.** No grid config, no page behaviour, no data, no query, no route. The two
broken screens render exactly what they were always meant to render.

**`src/app/(dev)/layout.tsx` — DELETED**, taking the now-empty `(dev)` route group with it. Nesting
adapters is harmless (`nuqs/dist/context-C4spomkL.js:99` — `createAdapterProvider` returns a plain
`context.Provider`; the one `error(303)` path at line 88 fires on two *different* context objects,
i.e. a duplicate install, is gated on `debugEnabled`, and has nothing to do with nesting), so this is
a clarity decision rather than a correctness one. It is made because **that file is what made this
defect survive**: a grep for `NuqsAdapter` returned a hit, in a file named `layout.tsx`, under a route
group — every signal a reader uses to conclude "the adapter is mounted" was present, and all of them
were wrong, because the group contains no pages. Leaving it would cost the next reader the same
investigation this task just did.

### The one thing this mount does NOT cover — checked, not assumed

`src/app/global-error.tsx` **replaces the root layout entirely** when a root-level error boundary
fires, so nothing rendered inside it is beneath the mount above.

Checked rather than stated: the file has **zero imports** — it is `'use client'` followed by one
component that renders literal `<html>`/`<body>`/`<div>`/`<button>` JSX with inline styles, reading
only `error.message`, `error.digest` and `reset`. It reaches no nuqs consumer, directly or
transitively. **So the gap is real and currently empty.** It becomes a live gap only if someone renders
a `useDataGrid` component inside the global error boundary — which would mean putting a data grid on
the screen that appears when the application has already crashed.

`error.tsx` files *below* the root, by contrast, ARE covered: they render inside the root layout, and
therefore inside the adapter.

### Type gate

`npx tsc --noEmit` in `apps/web`: **0 errors**, twice — once before the probe and once after removing
it.

**The gate was proven not blind.** `const __probe605: number = 'y';` was injected into
`src/app/layout.tsx` — the file actually edited — and tsc reported exactly one error and no others:

```
src/app/layout.tsx(9,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

The probe was then removed; `find . -name "__probe*"` outside `node_modules` returns nothing.

One real instance of the trap was hit on the way and is recorded because it is the standing shape:
the first `tsc` run after deleting `(dev)/layout.tsx` reported a single error inside
`.next/types/validator.ts` — a Next-generated file left behind by the earlier `npm run build`, still
referencing the deleted layout. Removing `apps/web/.next` and `tsconfig.tsbuildinfo` and re-running
gave the clean result above.

---

## 6. The AFTER verdicts

Same harness, same fixtures, same rows, same criterion — the literal string `nuqs requires an adapter`
in the full body or the correlated log slice. `apps/web/.next` was deleted and the dev server restarted
before measuring, because swapping files under a running Turbopack reports correct work as missing.

**Every row is its own verdict, beside its BEFORE verdict. There is no summary row.**

| route | BEFORE | AFTER | AFTER `nuqs requires an adapter` | grid branch actually taken? |
|---|---|---|---|---|
| `/carrier/driver-pay/settlements` | 500 **BROKEN** | **200** | **no** | yes — `SettlementListTable` is unconditional |
| `/checklists/automation` | 500 **BROKEN** | **200** | **no** | yes — `CustomRulesTable` is unconditional |
| `/docs/features` | 500 **BROKEN** | **200** | **no** | yes — unconditional |
| `/docs/database/[model]` (`Tenant`) | 500 **BROKEN** | **200** | **no** | yes — unconditional |
| `/carrier/driver-pay/reports?tab=settlement-history` | 500 **BROKEN** | **200** | **no** | yes — `SettlementHistoryReport` has no data gate |
| `/carrier/driver-pay/reports` (default tab) | 200 **LATENT** | **200** | **no** | **yes — exercised, see below** |
| `/carrier/driver-pay/reports/[driverId]` | 200 **LATENT** | **200** | **no** | **yes — exercised, see below** |
| `/carrier/imports/[id]/stops` | **NOT_MEASURED** | **NOT_MEASURED** | — | no request issued; staging still holds zero `document_imports` rows |

`/carrier/imports/[id]/stops` is recorded as unchanged deliberately. **The fix does not make an empty
table non-empty**, and reporting a `not-reachable` row as fixed would be exactly the kind of claim §4
is about. Its static position — the barrel-only edge of §2 — is unchanged too.

### The two LATENT rows were EXERCISED, not assumed

A LATENT row measured a second time on the same empty database proves nothing, so the branch was woken
for real. **One `driver_settlements` row was seeded on STAGING** — tenant `staging-alpha`, its own
`carrier_driver`, period yesterday→today, `status = 'PAID'`, `notes = '605-latent-probe'` — the sweep
was re-run, and the row was then deleted with a counter-read asserting the table is back to **zero**
rows. (The first attempt used `status = 'FINALIZED'`, which wakes the per-driver page but not the
overview: `countedSettlementsWhere`'s `payroll_out` scope is `['PAID']` only, while `approved` is
`['FINALIZED','PAID']`. Recorded because it is the difference between the two gates.)

With that row present, the empty-state markers flip and the verdicts hold:

| route | empty-state sentence in body, empty DB | …with one PAID settlement | AFTER status | `nuqs requires an adapter` |
|---|---|---|---|---|
| `/carrier/driver-pay/reports` | **present** | **absent** — the grid rendered | 200 | no |
| `/carrier/driver-pay/reports/[driverId]` | **present** | **absent** — `SettlementsYtdTable` rendered | 200 | no |

### The LATENT claim was then proven by MEASUREMENT, not left as prose

With that same row still seeded, the root mount was temporarily removed and the sweep re-run
(`evidence/01-latent-proof-mount-removed.json`). `/carrier/driver-pay/reports/[driverId]` — which had
answered **200** on the empty database, before the fix — answered **500** with
`nuqs requires an adapter` in its log slice. **The "a LATENT row is not a safe row" claim in §3 is
therefore a measurement here, not an inference.** The mount was restored immediately after and
`git diff` on `src/app/layout.tsx` is empty against the committed fix.

### A measurement that CONTRADICTS the plan, recorded rather than reconciled

The same mount-removed, data-present run says `/carrier/driver-pay/reports` on its **default tab**
answers **HTTP 200** — and the correlated log slice nevertheless carries:

```
⨯ Error: [nuqs] nuqs requires an adapter to work with your framework.
    at useGridUrlState (src\components\data-grid\core\useGridUrlState.ts:43:46)
    at useDataGrid (src\components\data-grid\core\useDataGrid.ts:162:35)
    at SettlementsTable (src\app\(owner)\carrier\driver-pay\reports\_components\SettlementsTable.tsx:243:53)
 GET /carrier/driver-pay/reports 200 in 1935ms
```

The plan predicted a **500** on the default tab for a tenant with payroll data. **It is a 200 with a
broken table region.** The mechanism is visible in the page's own source and is a real difference
between the two rows, not an artefact of the instrument:

- `reports/page.tsx:224` wraps `<SettlementsTable>` in `<Suspense fallback={<Skeleton …/>}>`. The shell
  streams first and the status line is already committed as 200 by the time the deferred boundary
  renders and throws; the table region is then replaced by the nearest error boundary.
- `reports/page.tsx:274` renders `{tab === 'settlement-history' && <SettlementHistoryReport …/>}`
  **with no Suspense**, so it throws before the shell flushes, and the response is HTTP 500.

Two consequences, both worth keeping:

1. **The defect on the default tab is real and is arguably worse than a 500, not better.** A 500 is
   loud and an owner reports it. A 200 with a missing settlements table looks like "no settlements this
   period" — which is what the empty state next to it says. The page fails quietly.
2. **This is the concrete reason the sweep's authority is the log string and not the status code.**
   Grading on status alone would have recorded that row as passing in both directions and reported a
   narrower blast radius than the one that exists.

Corrected count, superseding the last paragraph of §3: **five routes were outright HTTP 500 for every
tenant** (four on first paint, one on an explicit tab), **one renders a silently broken table region for
any tenant with payroll activity in the period**, **one 500s for any tenant with settlements for that
driver**, and one is unmeasured. Six live failures, not two — but one of them wears a 200.

---

## 7. Build and suite deltas

### `npm run build`

Exits **0** after the fix. Route markers compared entry by entry against
`evidence/02-build-before.log`:

| | before | after |
|---|---|---|
| entries in the route table | 443 | 443 |
| entries whose rendering marker changed | — | **0** |

Wrapping the tree in a client provider is exactly the kind of change that can flip a static route to
dynamic. Nothing moved. (`(dev)` had no route to lose — it contained only the layout.)

### vitest

Measured in the **main tree**, not a `git worktree` — a worktree does not carry the untracked
`apps/web/.env.local`, and the DB-dependent tests then move between passed and pending, which reads
exactly like a regression (quick-567). The baseline was taken by checking the touched source files back
to `49bf351d`, the commit before this task, then restoring them. `next dev` was stopped before both
runs. **Same reporter on both sides** (`--reporter=json`; `--reporter=basic` does not exist in vitest 4
and exits 0 having run zero tests).

| | tests | passed | failed | pending | failing FILES |
|---|---|---|---|---|---|
| before (`49bf351d` source) | 2086 | 1967 | 64 | 52 | 18 |
| after | 2086 | 1967 | 64 | 52 | 18 |

**Failing-file set compared BY NAME: identical.** Zero files only in before, zero only in after.

The quoted baseline of "~2086 tests / 64 failed / 18 failing files" was re-measured rather than
trusted, and it matched.

### One real regression was found this way, and it is worth recording

The first AFTER run had **19** failing files — `tests/security/wrapper-migration-countdown.test.ts`
was red and had been green in the baseline. It is a direct consequence of deleting
`src/app/(dev)/layout.tsx`: that test compares a live scan against the committed artefact
`scripts/audit/wrapper-countdown.json`, and one fewer file in the tree is one fewer file scanned.

```
- "filesScanned": 1691,
+ "filesScanned": 1690,
```

The artefact was regenerated with `npm run audit:wrapper-countdown`, and **the entire diff is that line
plus the `generatedAt` timestamp.** `unmigratedUnits` (456), `unmigratedCallSites` (459),
`filesWithUnmigratedUnits` (202) and `withTenantContextCallSites` (0) are unchanged, so this is
bookkeeping for a deleted file and not a countdown moving. Stated explicitly, because "regenerate the
artefact until the test is green" is the shape of weakening a guard, and the check that it is not is
that the guarded number did not move.

---

### Re-measured after the LAST commit, which is a different number

The table above was taken before the guards in §8 existed. quick-561's lesson is that a suite figure
published before a task writes its own test file is a baseline the next task inherits 11 tests short,
so here is the figure after everything this task adds:

| | tests | passed | failed | pending | failing FILES |
|---|---|---|---|---|---|
| before (`49bf351d` source) | 2086 | 1967 | 64 | 52 | 18 |
| final (everything committed) | **2097** | **1978** | **64** | 52 | **18** |

`+11` tests and `+11` passes are exactly `src/__tests__/nuqs-adapter-coverage.test.ts`. **Failing-file
set still identical by name.**

And `wrapper-countdown.json` needed regenerating a **second** time, for the mirror-image reason:
adding the guard file under `src/__tests__/` took `filesScanned` back from 1690 to **1691**, the
original value. The guarded numbers never moved in either direction (456 / 459 / 202 / 0). Worth
recording as a small standing fact: **any task that adds or deletes a file under `apps/web/src` will
turn `tests/security/wrapper-migration-countdown.test.ts` red until the artefact is regenerated**, and
the check that the regeneration is honest is that `unmigratedUnits` is unchanged.

---

## 8. The guards

Two, because neither is sufficient and both are cheap.

### 8.1 `apps/web/src/__tests__/nuqs-adapter-coverage.test.ts` — the primary guard

A source scan. It imports `findNuqsConsumerPages`, `findAdapterMounts` and `computeCoverage` from
`scripts/audit/605-nuqs-coverage.ts` — **the same code that produced §2's evidence, not a second
copy** — and asserts every consumer page is `covered`. The failure message names the uncovered pages
with route, route group and file, and names the fix location.

It asserts the recurrence shape directly: *a nuqs consumer reachable from a route with no adapter
above it*. No server, no session, no database.

Three assertions beyond coverage, each load-bearing:

- **the integrity block** — files scanned above a floor, seed set non-empty, seed modules non-empty
  after CRLF normalisation, mount set non-empty, page set ≥ 7, plus two counter-assertions that
  `assertScanIntegrity` **rejects** an empty page list and an empty mount list. Without these, "every
  page is covered" is satisfied by no pages at all, and **the failure mode of a source scan is GREEN**.
  The CRLF normalisation is not cosmetic: this repo is `core.autocrlf=true` with no `.gitattributes`,
  so an LF-anchored reader returns empty on a Windows checkout and the whole guard passes vacuously
  (quick-546).
- **`coveredBy` must be exactly `['src/app/layout.tsx']`** — this is what fails if a future
  recurrence is "fixed" by adding a second route-group mount instead of using the root one, which is
  the state this task found the repo in.
- **both `(owner)` and `(admin)` must appear among the traced groups** — so a scan that silently
  stopped covering one group fails rather than shrinking quietly.

**Witnessed RED.** `evidence/05-guard-fires-red.md` carries the captured failure. The revert was the
**exact pre-605 shape** — root mount removed AND `(dev)/layout.tsx` restored — so
`findAdapterMounts` returned a non-empty set and **all nine integrity tests stayed green while the
two coverage tests failed, naming all seven pages**. That is the anti-vacuity evidence: the guard
fails on the SHAPE, an adapter that exists but is scoped to a group its consumers do not live in, not
merely on "no adapter anywhere". Restored, re-confirmed green: 11 passed.

**What it does NOT prove**, stated in the test's own header: that an adapter is in the layout chain is
not that the page renders. A different missing provider, or any other render-time throw, passes it
untouched. It is also blind to a consumer whose page is reached by something the import scan cannot
follow.

### 8.2 `apps/web/e2e/owner/nuqs-grid-render.spec.ts` — the browser smoke

Four routes in a real browser, asserting 200 **and** the absence of `nuqs requires an adapter` in both
the rendered text and the markup, **and** the absence of Next's error dialog:

| route | storage state | why this one |
|---|---|---|
| `/carrier/driver-pay/settlements` | owner | unconditional grid; was 500 |
| `/checklists/automation` | owner | unconditional grid; was 500 |
| `/carrier/driver-pay/reports?tab=settlement-history` | owner | **the `?tab=` is load-bearing** — the default tab's grid is behind the `isEmpty` data gate, so visiting the bare URL against a tenant with no payroll asserts nothing, which is exactly how this route went unnoticed |
| `/docs/features` | sysadmin | the `(admin)` half a mount in `(owner)/layout.tsx` would have missed — the only browser evidence for why the mount is at the root |

**All four pass**, against a local server pointed at staging, with storage states minted by the repo's
own `e2e/auth.setup.ts` from the staging fixtures. Nothing skipped
(`evidence/05-playwright-green.txt`).

Two decisions in it were measurements, not preferences:

- **The error-overlay locator excludes `nextjs-portal`.** Probed in a real browser: on a healthy page
  `nextjs-portal` is 1 and `[data-nextjs-dialog]` is 0; on a genuinely failing page (`/carrier/trips`,
  HTTP 500 on staging) both dialog selectors are 1 while `nextjs-portal` is still 1.
  `nextjs-portal` and `[data-nextjs-toast]` are the dev-tools host and are present on **every** dev
  page — the first draft asserted their absence and failed all three `(owner)` rows while the pages
  were rendering perfectly. The dialog pair was witnessed in **both** directions before being used.
  (Role locators are the wrong instrument for an absence check regardless: the accessibility tree
  excludes `display:none` subtrees, so `getByRole` returns 0 for a hidden-but-present node — quick-559.)
- **The `(admin)` block's `test.use` is unconditional**, matching the five existing
  `e2e/sysadmin/*.spec.ts` files. A guarded `fs.existsSync` skip was written first and removed:
  Playwright collects every spec module **before** the `setup` project runs, so on a cold CI checkout
  `sysadmin.json` does not exist yet at module load and the block would skip itself on every run while
  looking deliberate. **A spec that can never run is worse than one that fails loudly.**

**What it does NOT prove**: it needs a server, a session, and data in the right branch; it cannot cover
the dynamic-segment routes (no stable id in CI, and a fabricated one measures the id — this task hit
exactly that and got a 404 that looked like a verdict); and it is blind to a consumer page nobody
thought to list in it. That last miss is precisely what 8.1 covers, and 8.1's miss is precisely what
8.2 covers.

**One honest wrinkle, characterised rather than hidden.** At the config's default `workers: 3`,
`/carrier/driver-pay/settlements` failed 2 of 3 runs with `timeout exceeded when trying to connect` at
`getTenantPrisma` — Postgres connection-pool exhaustion, which `playwright.config.ts` documents in its
own comment and which the staging `app_user` string's `connection_limit=1` amplifies. **Not a nuqs
failure**; no adapter error in the trace. At `--workers=1`, 3 for 3 green — and CI already runs
`workers: 1`.

---

## 9. What remains unmeasured

Stated plainly, because a gap named is a gap someone can close and a gap implied is a gap that comes
back.

1. **Every runtime verdict in this document is a STAGING verdict.** Production was never connected to.
   `/carrier/driver-pay/reports` is the standing proof that this matters: it measured a confident 200
   on staging in §3 and, on the same code with one database row present, throws
   `nuqs requires an adapter` from `SettlementsTable` while still answering 200 (§6). **A staging 200
   and a production 200 are different claims, and so are two staging 200s taken against different
   data.**

2. **`/carrier/imports/[id]/stops` was never rendered, before or after.** `public.document_imports`
   holds zero rows on staging, tenant-wide, so no request was issued — a fabricated id measures the id.
   Statically it is the barrel-only edge of §2 (`StopReviewScreen` imports `useGridSelection`, which is
   zustand-backed, and renders no `<DataGrid>`), so it is *expected* safe. **Expected safe is not a
   verdict.** Closing this needs a seeded `document_imports` row on staging or a CI fixture.

3. **`/carrier/driver-pay/reports/[driverId]` is not in the Playwright smoke**, and neither is
   `/carrier/imports/[id]/stops`, for the same reason: no stable id in CI. Both were exercised on
   staging in §6 (the first with a seeded settlement, in both the mount-present and mount-removed
   directions); neither has a standing browser guard.

4. **`src/app/global-error.tsx` is not covered by the root mount** and cannot be — it replaces the root
   layout. Checked, not assumed: it has zero imports and reaches no nuqs consumer, so the gap is real
   and currently empty. It becomes live if anyone renders a `useDataGrid` component inside the global
   error boundary.

5. **Whether `next build` can catch this class for a GENUINELY PRERENDERED page is unknown.** This
   build produced 437 dynamic routes, 5 static ones (all auth-free) and **zero** SSG, so there is no
   prerendered nuqs consumer to observe, and manufacturing one would be a product change outside this
   task. The operational answer for this repository does not depend on it: under the current layout
   structure no nuqs consumer can be prerendered, so the build cannot catch it here either way.

6. **Whether the Playwright workflow is currently green on `master` could not be read from this
   machine** — `gh` is unauthenticated and was not authenticated. The structural answer in §4 does not
   depend on it, but the CI colour itself is unverified.

7. **`TEST_SYSADMIN_EMAIL` / `TEST_SYSADMIN_PASSWORD` are unset in the local environment**, so
   `.playwright/auth/sysadmin.json` normally does not exist here and the new spec's `(admin)` block —
   like the five existing `e2e/sysadmin/*.spec.ts` files — will fail rather than skip. For this task
   they were supplied from the staging fixtures, which is why the `(admin)` row has a green result
   above. In CI they are secrets and should be present. Pre-existing, reported, not fixed.

8. **`TRPCReactProvider` has the same route-group shape and is not broken today** — zero pages outside
   `(owner)` reach a `useTRPC()` consumer — but two of its 17 consumers live in the shared
   `src/components` tree. §8's full enumeration is in
   `.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/05-provider-scan.md`.
   **Reported, not fixed.** Recommended follow-up is the guard rather than the hoist.

9. **`apps/web` has no working lint entry point** (quick-562): `next lint` no longer accepts `--dir` on
   this Next version, and ESLint 9 finds no `eslint.config.js` because the repo still carries
   `.eslintrc.*`. No lint was run for this task and none is claimed. `tsc` is the only type-level gate
   that actually runs, and it reports 0 errors with the probe recorded in §5.
