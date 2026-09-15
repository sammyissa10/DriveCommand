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
