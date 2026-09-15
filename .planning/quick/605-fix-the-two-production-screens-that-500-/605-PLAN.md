---
phase: quick-605
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/src/app/layout.tsx
  - apps/web/src/app/(dev)/layout.tsx
  - apps/web/scripts/audit/605-nuqs-coverage.ts
  - apps/web/scripts/audit/604-click-through.ts
  - apps/web/src/__tests__/nuqs-adapter-coverage.test.ts
  - apps/web/e2e/owner/nuqs-grid-render.spec.ts
  - docs/audits/nuqs-adapter-render-failure.md
  - .planning/quick/605-fix-the-two-production-screens-that-500-/evidence/

must_haves:
  truths:
    - "Every page that transitively imports a nuqs hook has a runtime BEFORE verdict recorded individually — all seven, not only the two named in quick-604 §7g."
    - "A page whose grid is behind a conditional or a data-gated branch is recorded as LATENT, not as safe — the distinction survives into the report."
    - "Why `/carrier/driver-pay/reports` returned 200 while `/carrier/driver-pay/settlements` returned 500 is explained from the source, not guessed at."
    - "Why neither `npm run build`, nor `tsc`, nor the three e2e specs that touch these areas caught this is answered per-lead and concretely."
    - "`NuqsAdapter` is mounted once, at a point that covers BOTH `(owner)` and `(admin)`, and the one thing root mounting does NOT cover is named."
    - "Every one of the seven pages has a runtime AFTER verdict recorded individually."
    - "A committed guard fails RED when the mount is removed, and was witnessed doing so."
    - "Whether any OTHER provider/context has the same route-group mismatch shape is answered by an enumeration, reported and not fixed."
    - "`npm run build` succeeds and the vitest failing-file set is unchanged, compared BY NAME with the same reporter on both sides."
  artifacts:
    - path: "docs/audits/nuqs-adapter-render-failure.md"
      provides: "The report — consumer enumeration, before/after per-page verdicts, why-not-caught, the fix, the guard, the generalisation scan"
      contains: "## 1."
    - path: "apps/web/scripts/audit/605-nuqs-coverage.ts"
      provides: "BFS over the import graph from every nuqs hook import to consuming pages, plus the layout-chain adapter walk"
      exports: ["findNuqsConsumerPages", "findAdapterMounts", "computeCoverage"]
    - path: "apps/web/src/__tests__/nuqs-adapter-coverage.test.ts"
      provides: "The committed guard — every nuqs-consuming page has an adapter at or above it in its layout chain"
    - path: "apps/web/e2e/owner/nuqs-grid-render.spec.ts"
      provides: "Browser smoke — the grid-bearing routes render without the nuqs adapter error"
    - path: "apps/web/src/app/layout.tsx"
      provides: "The single NuqsAdapter mount"
      contains: "NuqsAdapter"
  key_links:
    - from: "apps/web/src/app/layout.tsx"
      to: "nuqs/adapters/next/app"
      via: "import + JSX wrap inside <body>"
      pattern: "NuqsAdapter"
    - from: "apps/web/src/__tests__/nuqs-adapter-coverage.test.ts"
      to: "apps/web/scripts/audit/605-nuqs-coverage.ts"
      via: "import of the same BFS used to produce the evidence"
      pattern: "605-nuqs-coverage"
    - from: "apps/web/scripts/audit/604-click-through.ts"
      to: ".planning/quick/605-.../evidence/"
      via: "a new --surfaces3 mode writing its OWN artefact, leaving pass1/pass2 untouched"
      pattern: "surfaces3"
---

<objective>
Two live production screens answer HTTP 500 on render because `NuqsAdapter` is mounted in exactly
one layout in the repo — `src/app/(dev)/layout.tsx` — and every page that renders a `useDataGrid`
table lives somewhere else. Mount it once where it covers every route group, establish a runtime
verdict for every affected page both before and after, answer why four separate gates all stayed
green, and leave behind a guard that fails when the mount goes away.

Purpose: `/carrier/driver-pay/settlements` and `/checklists/automation` are unusable in production
today. Five more pages are in the same import trace and have never been measured. The fix is three
lines; the value of the task is the enumeration, the "why did nothing catch this", and the guard.

Output: the adapter mounted, seven pages verdicted twice, one committed vitest guard proven red, one
Playwright smoke, and `docs/audits/nuqs-adapter-render-failure.md`.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@docs/audits/staging-app-user-end-to-end.md
@apps/web/src/app/layout.tsx
@apps/web/src/app/(dev)/layout.tsx
@apps/web/src/app/(owner)/layout.tsx
@apps/web/src/app/(admin)/layout.tsx
@apps/web/src/components/data-grid/core/useGridUrlState.ts
@apps/web/src/components/data-grid/core/useDataGrid.ts
@apps/web/scripts/audit/604-click-through.ts
@apps/web/scripts/seed-staging-auth.ts
@apps/web/e2e/carrier/reports.spec.ts
@apps/web/e2e/carrier/access.spec.ts
@apps/web/e2e/owner/navigation-reachability.spec.ts
@.github/workflows/playwright.yml
</context>

<given_do_not_re_derive>

Traced before planning. Re-confirm cheaply where a task says so; do not re-derive from scratch.

**One consumer module, one mount.** `grep -rn "from 'nuqs" apps/web/src` returns exactly two hits:
`src/app/(dev)/layout.tsx:1` (the adapter) and
`src/components/data-grid/core/useGridUrlState.ts:10` (`parseAsInteger`, `parseAsString`,
`parseAsJson`, `useQueryState`). No `useQueryStates` anywhere. The blast radius is entirely
"what renders `useGridUrlState`", reached through `DataGrid` → `useDataGrid` → `useGridUrlState`.

**nuqs is 2.8.9, declared `^2.8.9` in `apps/web/package.json`, installed at the repo root. DO NOT
UPGRADE IT.** If any task concludes an upgrade is needed, STOP and say why instead.

**`(dev)` contains ONLY `layout.tsx`. Zero pages.** `find "apps/web/src/app/(dev)" -type f` returns
one file. The single adapter mount in the repo therefore serves no route at all. That is not
decoration in the report — it is the sharpest statement of the defect.

**`enableUrlSync` does NOT gate the hook.** `useDataGrid.ts:162` is
`const urlState = useGridUrlState(enableUrlSync)` — an unconditional call, because it is a hook. The
flag only changes the derived values inside. So **any** `useDataGrid` render throws, whatever the
flag says. Do not look for a "URL state enabled" config to explain which pages fail.

**The transitive trace reaches 7 pages in TWO route groups:**

| route | file | group | quick-604 verdict |
|---|---|---|---|
| `/carrier/driver-pay/settlements` | `(owner)/carrier/driver-pay/settlements/page.tsx` | (owner) | **fail 500** |
| `/checklists/automation` | `(owner)/checklists/automation/page.tsx` | (owner) | **fail 500** |
| `/carrier/driver-pay/reports` | `(owner)/carrier/driver-pay/reports/page.tsx` | (owner) | **pass 200** |
| `/carrier/driver-pay/reports/[driverId]` | `(owner)/carrier/driver-pay/reports/[driverId]/page.tsx` | (owner) | not visited |
| `/carrier/imports/[id]/stops` | `(owner)/carrier/imports/[id]/stops/page.tsx` | (owner) | not visited |
| `/docs/features` | `(admin)/docs/features/page.tsx` | **(admin)** | not visited |
| `/docs/database/[model]` | `(admin)/docs/database/[model]/page.tsx` | **(admin)** | not visited |

**Two route groups is the decisive fact for the fix.** `(admin)/docs/*` is not under `(owner)`, so
"mount it in `(owner)/layout.tsx`, matching the `(dev)` precedent" **cannot fix the admin pages**
without a second mount. Root is one mount for both.

**Nesting adapters is safe — read from the installed source, not guessed.**
`node_modules/nuqs/dist/context-C4spomkL.js:99` — `createAdapterProvider` returns a plain
`context.Provider`. Nesting the same provider is ordinary React: the inner one wins, no error. The
only warning path (`error(303)`, line 88) fires on TWO DIFFERENT context objects — i.e. a duplicate
nuqs install — is gated on `debugEnabled`, and has nothing to do with nesting. So keeping the
`(dev)` mount would be harmless; the argument for removing it is not correctness.

**The `reports` puzzle is already half-solved, and the answer is worse than "behind a tab".**
`(owner)/carrier/driver-pay/reports/page.tsx` has EIGHT tab branches (`tab === 'overview'` … through
`tab === 'settlement-history'`), and all eight `_components` that use `useDataGrid`
(`SettlementsTable`, `AccessorialSpendReport`, `ComponentTypeReport`, `DeductionBalancesReport`,
`LoadProfitabilityReport`, `OverrideAuditReport`, `OvertimeExposureReport`,
`SettlementHistoryReport`) sit inside one branch or another. But the default `overview` tab DOES
render `SettlementsTable` — **unless** line 122's
`isEmpty = tab === 'overview' && kpis?.totalPayroll.current === '0.00'` is true, in which case the
whole content block is replaced by an empty state. **Staging has no payroll activity.** So the 200
quick-604 measured is a property of staging's FIXTURE DATA, not of the page: a production tenant
with a single settlement in the period renders the grid and 500s on the default tab with no user
interaction at all. Task 1 must confirm this against the source and record it — "in the trace" is a
candidate, "measured 200 on staging" is not a verdict for production, and a page that renders today
only because a branch is cold is a 500 waiting for a click or a row.

**`tsc` cannot catch this by construction** — a missing React context is a runtime error, not a type
error. Say it once in the report; do not dwell.

**Three leads for "why was it not caught", all pre-verified:**
1. `(owner)/layout.tsx:10` is `export const dynamic = 'force-dynamic'`, so Next never prerenders
   those pages at build time and a render-time crash is **structurally invisible to
   `npm run build`**. That is the core answer for the five `(owner)` pages.
2. `(admin)/layout.tsx` does NOT set `force-dynamic` — grepped, absent — and
   `(admin)/docs/features/page.tsx` is a `'use client'` page with no `dynamic` export of its own.
   The likely reason the build still passes is that the `(admin)` layout is an async server
   component calling `getSession()`, which reads `cookies()` and makes the whole segment dynamic.
   **That is a hypothesis, not a finding.** Task 2 must settle it from the actual build output.
3. `grep -rn "driver-pay/settlements\|checklists/automation\|docs/features\|docs/database" apps/web/e2e/`
   returns **nothing**. The three specs named in the brief are adjacent, not covering:
   `reports.spec.ts` visits `/carrier/reports/*` (a different directory from `/carrier/driver-pay/*`);
   `access.spec.ts` only asserts that a DRIVER or an anonymous user is redirected AWAY, so it never
   renders any of them as an owner; `navigation-reachability.spec.ts` asserts hrefs exist in the
   sidebar DOM and never navigates to a destination. Task 2 must state this per spec, with line
   references. **"Nothing covered it" is not the answer** — the answer is that three specs came
   close and each was the wrong shape.

**Playwright DOES run in CI** — `.github/workflows/playwright.yml`, on push and PR to `master`,
`npx playwright test --project=chromium`, with `PLAYWRIGHT_BASE_URL` and owner/sysadmin/driver
credentials from secrets. So "e2e is not run" is not available as an excuse either.

**Only three providers are mounted in any layout in the whole app:** `AuthProvider` (root),
`TRPCReactProvider` (`(owner)/layout.tsx:79`), `NuqsAdapter` (`(dev)`). The generalisation scan is
therefore small. First cut on tRPC: hooks appear in 15 files under `(owner)` and 2 under
`src/components` — the two shared components are the ones worth chasing.

</given_do_not_re_derive>

<tasks>

<task type="auto">
  <name>Task 1: Enumerate every nuqs consumer page and record a runtime BEFORE verdict for each</name>
  <files>
apps/web/scripts/audit/605-nuqs-coverage.ts
apps/web/scripts/audit/604-click-through.ts
docs/audits/nuqs-adapter-render-failure.md
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/01-consumer-trace.json
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/01-before-verdicts.json
  </files>
  <action>
Two halves: the static enumeration, then a runtime verdict for every page it names.

**(a) `605-nuqs-coverage.ts` — the committed BFS.** Export three functions so Task 5's vitest guard
imports the same code that produced this evidence rather than a second copy:

- `findNuqsConsumerPages(root)` — seed from every module under `apps/web/src` whose source imports a
  hook from `nuqs` (a hook, not `nuqs/server` and not `nuqs/adapters/*` — the adapter import is the
  MOUNT, and treating it as a consumer makes the graph circular). BFS **up** the import graph
  (who-imports-whom) over `.ts`/`.tsx`, resolving `@/` to `apps/web/src`, until it reaches files
  matching `src/app/**/page.tsx`, `layout.tsx`, `template.tsx`, `default.tsx` or `error.tsx`. Return
  `{ pageFile, route, routeGroup, chain }` where `chain` is the import path that reached it, so the
  report can show WHY a page is in the trace.
- `findAdapterMounts(root)` — every `src/app/**/layout.tsx` whose source imports `NuqsAdapter` from
  `nuqs/adapters/*` AND renders it. Return the file paths.
- `computeCoverage(pages, mounts)` — for each page, walk its layout chain upward
  (`src/app/(owner)/carrier/x/page.tsx` → `.../carrier/x/layout.tsx` → … → `src/app/layout.tsx`,
  every `layout.tsx` that exists on the way) and mark it `covered` iff at least one ancestor layout
  is in `mounts`.

Rules that are not optional (quick-546, quick-562): **normalise `\r\n` → `\n` on every read** —
this repo is `core.autocrlf=true` with no `.gitattributes`, so a regex anchored on `\n` matches
nothing in the working tree and the scan returns empty and green. Assert the seed set is non-empty
and that the scanned-file count is above a floor before believing any result. A bad scan fails
GREEN, so every "was it actually found" assertion is load-bearing.

Run it and write `evidence/01-consumer-trace.json`. **The trace should name the 7 pages in the given
table. If it names more or fewer, the extra/missing ones are the finding — report them, do not
trim the output to match the table.**

**(b) The runtime BEFORE verdicts.** Add a `--surfaces3` mode to
`apps/web/scripts/audit/604-click-through.ts` — reuse its `login()`/`visit()`/log-slice machinery,
do NOT write a third harness. It must:
  - write its OWN artefact to quick-605's evidence dir; **leave `04-click-through.json`'s pass-1 and
    pass-2 records untouched.**
  - keep every existing refusal (`.env.staging` only, refuse on the production ref).
  - use the existing OWNER_A fixture for the five `(owner)` routes and the existing
    `sysadmin@staging.test` fixture for the two `(admin)` routes. If the sysadmin row is absent,
    `npx tsx scripts/seed-staging-auth.ts --seed-sysadmin` first — do not mark the admin portal
    unreachable by default (quick-604's rule).
  - resolve the three dynamic segments from staging by SQL, the way `findTrackingToken()` does — a
    `CarrierDriver` id for `[driverId]`, a `document_imports` id for `[id]`, a real model name for
    `[model]`. If a table is empty, the row is `not-reachable` **with the reason committed as a
    string**, never a skip and never folded into pass.
  - for `/carrier/driver-pay/reports`, visit the default URL **and** `?tab=settlement-history`
    explicitly, as two rows. The default row is the one staging's empty-data branch makes green; the
    tab row is the one that actually exercises a grid.
  - record, per row: HTTP status, verdict, and whether the body/log slice contains
    `nuqs requires an adapter`. That string, not the status, is the authority for this task.

**(c) Classify and write §1–§3 of the report.** Create
`docs/audits/nuqs-adapter-render-failure.md` in the house style of `docs/audits/` — a stated scope,
per-row tables with no summary row, findings named rather than counted. Sections:
  - **§1 What this measured and what it deliberately did not.**
  - **§2 The consumer trace** — one row per page, with the import chain that reached it.
  - **§3 The BEFORE verdicts** — one row per page, individually. Every row carries one of:
    - `BROKEN` — 500 on first paint today;
    - `LATENT` — renders today only because a branch is cold, with the branch named and the exact
      condition that wakes it (for `reports`, the `isEmpty` data gate at line 122 AND the seven tab
      branches — name both, they are different mechanisms);
    - `NOT_MEASURED` — with the reason.
    **A `LATENT` row is not a safe row.** Say so in the section, in those words. The paragraph
    explaining why `reports` returned 200 on staging and would 500 on a production tenant with one
    settlement in the period is the most valuable prose in this task — write it properly.
  </action>
  <verify>
`npx tsx apps/web/scripts/audit/605-nuqs-coverage.ts` prints the consumer set and writes
`evidence/01-consumer-trace.json`; the file names >= 7 pages across at least the `(owner)` and
`(admin)` groups.
`npx tsx apps/web/scripts/audit/604-click-through.ts --surfaces3` (server up, staging env) writes
`evidence/01-before-verdicts.json` with one entry per traced route plus the extra `reports?tab=` row,
and `04-click-through.json` is byte-identical before and after (`git diff --stat` on it is empty).
`grep -c "^| " docs/audits/nuqs-adapter-render-failure.md` shows the §2 and §3 tables are populated.
  </verify>
  <done>
Every nuqs-consuming page has an individual BEFORE verdict of `BROKEN`, `LATENT` or `NOT_MEASURED`
with a stated reason; the two quick-604 500s reproduce; the `reports` 200-versus-500 discrepancy is
explained from the source with the `isEmpty` gate and the tab gates named separately; no quick-604
artefact was modified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Answer why four gates stayed green, per lead, with evidence</name>
  <files>
docs/audits/nuqs-adapter-render-failure.md
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/02-build-route-table.txt
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/02-e2e-coverage.md
  </files>
  <action>
No product code changes in this task. Four leads, each answered concretely; a generality is a
failure here.

**Lead 1 — `npm run build` and the `(owner)` pages.** `(owner)/layout.tsx:10` sets
`export const dynamic = 'force-dynamic'`. Run `npm run build` in `apps/web` and capture the route
table to `evidence/02-build-route-table.txt`. Quote the marker Next prints for each of the five
`(owner)` routes (`ƒ` dynamic vs `○` static vs `●` SSG) as the evidence that the build never
attempted to render them.

**Lead 2 — the `(admin)` pages, which is a genuinely open question.** `(admin)/layout.tsx` has no
`dynamic` export and `(admin)/docs/features/page.tsx` is `'use client'` with none either. Establish
from the SAME build output what Next did with `/docs/features` and `/docs/database/[model]`.
  - If they are marked dynamic, say **why** — the most likely reason is that `(admin)/layout.tsx` is
    an async server component awaiting `getSession()`, which reads `cookies()` and opts the whole
    segment out of prerendering. Confirm the `cookies()`/`headers()` read exists on that path rather
    than asserting it.
  - If either is marked static/prerendered **and the build still passed**, that is the more
    interesting result and it changes the story: it would mean prerendering a client page does not
    execute its hooks deeply enough to hit the context throw, i.e. **`next build` cannot catch this
    class at all, even for a prerendered page.** Record whichever answer the output gives; do not
    pick the tidier one.

**Lead 3 — the three e2e specs that come close.** Open each and state, with line references, the
concrete reason it did not fire. Write to `evidence/02-e2e-coverage.md`:
  - `e2e/carrier/reports.spec.ts` — visits `/carrier/reports/aging|driver-pay|performance|revenue`.
    Is `/carrier/reports/driver-pay` the same page as `/carrier/driver-pay/reports`? Check the
    directory listing and `next.config.ts` redirects before answering — two similarly-named routes
    is exactly the trap this repo has hit before, and the answer decides whether this spec was one
    character from catching it or was never near it.
  - `e2e/carrier/access.spec.ts` — every assertion is `expect(page.url()).not.toContain(...)` under
    a DRIVER or anonymous storage state. A redirect assertion never renders the page as an owner,
    so the route name appearing in the file is not coverage.
  - `e2e/owner/navigation-reachability.spec.ts` — asserts hrefs are present in the sidebar DOM and
    never navigates. Note the shape explicitly: **this repo already has a spec whose whole purpose
    is "a nav claim is not done until the destination is proven", and it proves the LINK, not the
    DESTINATION.** That is the useful generalisation and it belongs in the report.
  Also check whether any spec is `test.skip`/`describe.skip`/tagged out of the CI run, and whether
  `.github/workflows/playwright.yml` runs the full suite or a `@smoke` subset. State whether the
  workflow is actually passing on `master` (`gh run list --workflow=playwright.yml --limit 5`) — a
  suite that has been red for months is a different answer from a suite that is green and blind.

**Lead 4 — `tsc`.** One sentence: a missing React context is a runtime error, not a type error, so
the type gate cannot see this by construction. Do not dwell.

Write these as **§4 Why nothing caught it**, with a sub-heading per lead and a one-line verdict
each. End the section with the shape that generalises: four gates, each blind for a DIFFERENT
structural reason, and a route-group-scoped provider is invisible to all four.
  </action>
  <verify>
`npm run build` in `apps/web` exits 0 and `evidence/02-build-route-table.txt` contains the rendering
marker for all seven routes.
`evidence/02-e2e-coverage.md` names all three specs with file:line references and a per-spec verdict.
§4 of the report has four sub-headings, one per lead.
  </verify>
  <done>
Each of the four gates has a named, evidenced reason it stayed green; the `(admin)` prerender
question is settled from build output rather than left as a hypothesis; the three e2e specs are each
explained individually and "nothing covered it" appears nowhere in the report.
  </done>
</task>

<task type="auto">
  <name>Task 3: Mount NuqsAdapter once, in the root layout</name>
  <files>
apps/web/src/app/layout.tsx
apps/web/src/app/(dev)/layout.tsx
docs/audits/nuqs-adapter-render-failure.md
  </files>
  <action>
**The mount.** `src/app/layout.tsx` is a server component; a server layout may render a client
provider, which `AuthProvider` already demonstrates two lines down. Add
`import { NuqsAdapter } from 'nuqs/adapters/next/app'` and wrap **outside** `AuthProvider`, as the
outermost child of `<body>`:

```
<body className={inter.className}>
  <NuqsAdapter>
    <AuthProvider>
      {children}
      <SupportTicketModal />
      <Toaster … />
    </AuthProvider>
  </NuqsAdapter>
</body>
```

Outermost, and the reason goes in a comment above it: the adapter then covers `SupportTicketModal`
and `Toaster` as well as `{children}`, and its availability stops depending on anything about
`AuthProvider`'s internals. Nesting it inside would work today and would couple two unrelated
providers' order.

**Nothing else changes.** No grid config, no page behaviour, no data. The two broken screens must
render exactly what they were always meant to render.

**Decide the `(dev)` mount and state the reason in the report.** `(dev)` contains only
`layout.tsx` and zero pages, so its adapter serves no route. Nesting is harmless (see
`given_do_not_re_derive`), so this is a clarity decision, not a correctness one. **Recommended:
delete `src/app/(dev)/layout.tsx`.** A second mount in an empty route group is precisely the artefact
that makes a reader believe the adapter is mounted, and leaving it costs a future reader the same
investigation this task just did. If you keep it instead, the file's comment must say it is redundant
and name the root mount. Either way, record the decision and its reason.

**Write §5 The fix** — where the mount went, why outermost, what happened to `(dev)`, and the ONE
honest caveat: **`src/app/global-error.tsx` replaces the root layout entirely**, so anything rendered
inside a root error boundary is NOT covered by this mount. Check whether `global-error.tsx` reaches a
nuqs consumer (it almost certainly does not) and state the answer either way — a caveat stated
without being checked is the class of claim this repo keeps finding false.

Run `npx tsc --noEmit` in `apps/web`. **Probe the gate**: inject `const x: number = 'y';` into
`src/app/layout.tsx`, confirm tsc reports THAT error and that it is the only one, then delete the
probe and re-run clean. If the only errors reported are syntax errors or are in files you did not
touch, the gate is blind — delete `apps/web/.next/dev/types/validator.ts` and
`apps/web/tsconfig.tsbuildinfo` and re-run.
  </action>
  <verify>
`grep -n "NuqsAdapter" apps/web/src/app/layout.tsx` shows the import and the JSX wrap.
`npx tsc --noEmit` in `apps/web` reports 0 errors, AND the injected-probe run reported exactly one
error at the injected line (record both runs).
`git diff apps/web/src/app/layout.tsx` is the import, the wrap and a comment — nothing else.
  </verify>
  <done>
`NuqsAdapter` is mounted once, outermost inside `<body>` in the root layout; the `(dev)` mount is
resolved with a stated reason; `global-error.tsx` coverage is checked and stated; tsc is clean and
was demonstrably not blind; no page behaviour changed.
  </done>
</task>

<task type="auto">
  <name>Task 4: Runtime AFTER verdicts for every page, plus the build and suite deltas</name>
  <files>
docs/audits/nuqs-adapter-render-failure.md
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/04-after-verdicts.json
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/04-suite-before.json
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/04-suite-after.json
  </files>
  <action>
**(a) Re-run the same harness.** Stop the dev server, delete `apps/web/.next` (a file swap under a
running Turbopack poisons the cache and reports correct work as missing — quick-562 and Phase 12 both
lost time to this), restart against `.env.staging`, and run
`npx tsx scripts/audit/604-click-through.ts --surfaces3` again into
`evidence/04-after-verdicts.json`. Same fixtures, same rows, same criterion, including the extra
`/carrier/driver-pay/reports?tab=settlement-history` row.

**(b) Write §6 The AFTER verdicts — one row per page, individually**, beside its BEFORE verdict. A
row that was `LATENT` must now be exercised for real, not assumed: a `?tab=` row that renders a grid
is the proof for `reports`; for `settlements` and `automation`, the 200 plus the absence of
`nuqs requires an adapter` in the correlated log slice. For any row still `not-reachable` because
staging has no row to substitute into a dynamic segment, say so again — the fix does not make an
empty table non-empty, and reporting a `not-reachable` as fixed would be the exact kind of claim §4
is about.

**(c) `npm run build`.** Must exit 0. Diff the route table against
`evidence/02-build-route-table.txt` and state whether any route's rendering marker changed. Wrapping
the tree in a client provider is the sort of change that can flip a static route to dynamic; if
anything moved, name it rather than letting it pass.

**(d) The vitest delta, measured on both sides with the SAME reporter.** The quoted baseline
(2086 tests / 64 failed / 18 failing files) is **to be re-measured, not trusted**.
  - `--reporter=basic` does not exist in vitest 4 and exits 0 having run ZERO tests. Do not use it.
    A green run whose output has no `Test Files … | Tests …` summary is not a green run.
  - Do NOT use a `git worktree` for the baseline: it does not carry `apps/web/.env.local`, and the
    DB-dependent tests then move between passed and pending, which reads exactly like a regression
    (quick-567). Measure in the MAIN tree: `git stash` → run → `git stash pop` → run.
  - Stop `next dev` before either run. A cold vitest run in `apps/web` imports for ~80s; a single
    test that fails cold and passes in isolation is that, not a regression (quick-549).
  - Compare the **failing-file set BY NAME**, not the counts. Write both JSON artefacts and the
    by-name diff into §7.
  </action>
  <verify>
`evidence/04-after-verdicts.json` has one entry per row in `evidence/01-before-verdicts.json`; every
entry that was `BROKEN` is now 200 with no `nuqs requires an adapter` anywhere in its log slice.
`npm run build` exits 0.
`node -e` (or jq) diff of the two suite artefacts prints an empty failing-file-name delta.
§6 has one table row per page and §7 states both suite numbers and the by-name comparison.
  </verify>
  <done>
All seven pages (eight rows, counting the extra tab row) have an individual AFTER verdict; the two
production 500s render; the `LATENT` rows were exercised rather than assumed; `npm run build`
succeeds with no route-marker regressions; the vitest failing-file set is unchanged compared by name
with the same reporter on both sides.
  </done>
</task>

<task type="auto">
  <name>Task 5: The guard, the generalisation scan, and the finished report</name>
  <files>
apps/web/src/__tests__/nuqs-adapter-coverage.test.ts
apps/web/e2e/owner/nuqs-grid-render.spec.ts
apps/web/scripts/audit/605-nuqs-coverage.ts
docs/audits/nuqs-adapter-render-failure.md
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/05-guard-fires-red.md
.planning/quick/605-fix-the-two-production-screens-that-500-/evidence/05-provider-scan.md
  </files>
  <action>
**(a) The primary guard — a vitest source scan, `nuqs-adapter-coverage.test.ts`.** It imports
`findNuqsConsumerPages`, `findAdapterMounts` and `computeCoverage` from Task 1's script — the same
code that produced the evidence, not a second copy — and asserts every consumer page is `covered`.
The failure message must name the uncovered pages and point at the root layout.

  Why this one is primary: the recurrence shape is **a nuqs consumer reachable from a route with no
  adapter above it**, and that is exactly what this asserts, without a server, a session or a
  database. Note honestly in the test header what it does NOT prove: that an adapter is in the
  layout chain is not that the page renders — a different missing provider, or any other render-time
  throw, passes this test untouched. That is what (b) is for.

  Mandatory shape (quick-546, quick-549, quick-562):
  - **CRLF-normalise every file read.** A scan anchored on `\n` finds nothing in a `core.autocrlf`
    working tree, and the failure mode of a bad scan is GREEN.
  - Assert the scan actually found things before asserting what it found: consumer seed set
    non-empty, adapter mount set non-empty, scanned-file count above a floor. Without these the
    coverage assertion passes vacuously over an empty list.
  - The length floor is a **parameter**, not a blanket constant — a legitimate one-line re-export
    `page.tsx` is under 300 bytes, so a blanket floor fails on healthy source.
  - **Witness it RED.** Temporarily remove the root mount (and re-add the `(dev)` one if you deleted
    it, to prove the group-scoped shape is what fails), run the test, capture the actual failure
    output naming the seven pages into `evidence/05-guard-fires-red.md`, then restore and confirm
    green. A guard asserted without a witnessed red is the quick-549 shape.

**(b) The browser smoke — `e2e/owner/nuqs-grid-render.spec.ts`.** Visit the routes that can be
reached with the existing storage states and assert HTTP 200 plus **absence of the text
`nuqs requires an adapter`** and absence of Next's error overlay. Scope deliberately:
  - the two `(owner)` static routes, plus `/carrier/driver-pay/reports?tab=settlement-history` with
    an explicit tab so the grid actually renders — visiting the default URL against an empty-data
    tenant asserts nothing, which is precisely how this went unnoticed;
  - `/docs/features` under the sysadmin storage state (`TEST_SYSADMIN_EMAIL` is already a CI secret);
  - dynamic-segment routes are **out of scope for this spec** and the header must say so, with the
    reason (no stable id in CI). Do not fabricate an id and do not let a missing id become a silent
    pass — if you include one, resolve it from the page it is linked from and `test.skip` with a
    stated reason when there is none.
  Repo precedent applies: the sidebar and any auth-dependent chrome hydrate from `useAuth()`, so wait
  on a real selector, not `networkidle` (`navigation-reachability.spec.ts` header). And do not use
  `getByRole` to prove a node is absent — the accessibility tree excludes `display:none` subtrees, so
  a role query returns 0 for a hidden-but-present node (quick-559).

  Why both, not one: (a) is deterministic and catches a NEW consumer in a group with no adapter, but
  is satisfied by a mount that exists; (b) proves the page actually renders, but needs a server, a
  session, and data in the right branch — and cannot cover the dynamic routes. **State both misses
  in the report**, plainly.

**(c) The generalisation scan — answer with an enumeration, not an opinion.** Enumerate every
`layout.tsx` under `apps/web/src/app` and every provider/context/adapter it mounts; for each, BFS
the consumers of that context the same way Task 1 did and cross-reference which route groups they
live in. The whole app has three mounts, so this is tractable:
  - `AuthProvider` — root, covers everything;
  - `TRPCReactProvider` — `(owner)/layout.tsx:79`. First cut: tRPC hooks in 15 files under `(owner)`
    and 2 under `src/components`. **Chase the two shared components** — if either is rendered from
    `(admin)`, `(driver)`, `(shared)`, `(auth)` or a root-level route, that is the same defect
    waiting;
  - `NuqsAdapter` — fixed by this task.
  Write `evidence/05-provider-scan.md` and §8 of the report. **Report findings; do NOT fix them.**
  Widening an already-live fix is out of scope, and a named follow-up is worth more than a rushed
  second change.

**(d) Finish the report.** `docs/audits/nuqs-adapter-render-failure.md`, house style, sections §1–§9:
scope · consumer trace · BEFORE verdicts · why nothing caught it · the fix · AFTER verdicts · build
and suite deltas · the generalisation scan · what remains unmeasured. §9 must carry, at minimum: the
dynamic-segment routes that staging could not exercise, `global-error.tsx`, and the fact that every
verdict here is a STAGING verdict — the `reports` row is the standing proof that a staging 200 and a
production 200 are different claims.

Run `npx tsc --noEmit` in `apps/web` (probe it, then delete the probe) and `npx vitest run` for the
touched files.
  </action>
  <verify>
`npx vitest run src/__tests__/nuqs-adapter-coverage.test.ts` passes, and
`evidence/05-guard-fires-red.md` contains the captured FAILING output from the deliberate removal,
naming the uncovered pages.
`npx playwright test e2e/owner/nuqs-grid-render.spec.ts --project=chromium` passes against a local
server, or records a stated skip reason per skipped row.
`evidence/05-provider-scan.md` lists every layout mount with its consumers' route groups and an
explicit verdict per provider.
`docs/audits/nuqs-adapter-render-failure.md` has all nine sections; `grep -c "^## " ` >= 9.
`npx tsc --noEmit` clean, with the probe run recorded.
  </verify>
  <done>
A committed vitest guard that was witnessed failing red on the removed mount and green on restore; a
Playwright smoke that exercises a grid rather than an empty branch; an enumeration of every provider
mount cross-referenced against its consumers' route groups, reported and not fixed; and a finished
nine-section audit report whose §9 states what remains unmeasured.
  </done>
</task>

</tasks>

<verification>
- `grep -rn "from 'nuqs" apps/web/src` still returns the consumer module plus exactly the adapter
  mounts this task decided on — no new import, no upgraded version.
- `grep -n '"nuqs"' apps/web/package.json` is still `^2.8.9` and `node_modules/nuqs/package.json` is
  still `2.8.9`. Nothing was installed or upgraded.
- `git diff` touches no migration, no policy, no grant, no tenant-scoping file.
- `npm run build` in `apps/web` exits 0.
- `npx tsc --noEmit` in `apps/web` reports 0 errors, with a recorded probe run proving the gate was
  not blind, and no `__probe.ts` left behind.
- The vitest failing-file set is unchanged, compared BY NAME, same reporter both sides.
- `.planning/quick/604-.../evidence/04-click-through.json` is unmodified.
- Production was never written to; every runtime verdict came from staging.
</verification>

<success_criteria>
1. Every nuqs consumer page — all seven from the trace, not only the two named in quick-604 §7g —
   has an individual runtime BEFORE verdict, classified `BROKEN` / `LATENT` / `NOT_MEASURED`, and a
   `LATENT` row is explicitly stated not to be a safe row.
2. Why `/carrier/driver-pay/reports` measured 200 while `/carrier/driver-pay/settlements` measured
   500 is explained from the source — the `isEmpty` data gate and the eight tab branches named as
   two separate mechanisms — and the consequence for production is stated.
3. §4 answers all four gates individually: `force-dynamic` for `(owner)`; the `(admin)` prerender
   question settled from real build output; each of the three e2e specs explained with line
   references; `tsc` in one sentence. "Nothing covered it" appears nowhere.
4. `NuqsAdapter` is mounted once, covering both `(owner)` and `(admin)`, with the `(dev)` mount
   resolved and `global-error.tsx` named as the one thing root mounting does not cover.
5. Every page has an individual AFTER verdict; the two production 500s render; the `LATENT` rows
   were exercised, not assumed.
6. A committed guard exists, was witnessed RED with the output captured, and its blind spot is
   stated alongside the second guard that covers it.
7. Every provider mounted in any layout is enumerated and cross-referenced against its consumers'
   route groups; findings reported, none fixed.
8. `docs/audits/nuqs-adapter-render-failure.md` exists with §1–§9 and a §9 that states what remains
   unmeasured.
</success_criteria>

<output>
After completion, create
`.planning/quick/605-fix-the-two-production-screens-that-500-/605-SUMMARY.md`.
</output>
