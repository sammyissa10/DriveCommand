---
phase: quick-605
plan: 01
status: complete
date: 2026-09-15
branch: master
commits: [a65b7897, b9089d4f, 408a84ec, 0e517e40, 07516c8f]
---

# quick-605 — Fix the two production screens that 500, and find out why nothing caught it

## The one-liner

`NuqsAdapter` was mounted in exactly one layout in the repository — `src/app/(dev)/layout.tsx`, a
route group containing **zero pages** — while every `useDataGrid` page lived in `(owner)` or
`(admin)`. The fix is three lines at the root; the value is the enumeration, the "why did four gates
stay green", and two guards, one of which was witnessed red.

**Nothing was installed or upgraded. `nuqs` is still `^2.8.9` declared and `2.8.9` installed.**
Production was never connected to, read or written. No migration, policy, grant or tenant-scoping
file was touched.

---

## 1. The live impact is larger than the task title says

The title names two screens. The sweep found **six live failures**, and the count only holds if you
grade on the log string rather than the HTTP status.

| route | route group | state before the fix |
|---|---|---|
| `/carrier/driver-pay/settlements` | `(owner)` | **HTTP 500** on first paint, every tenant |
| `/checklists/automation` | `(owner)` | **HTTP 500** on first paint, every tenant |
| `/docs/features` | **`(admin)`** | **HTTP 500** on first paint — **never measured by any previous task** |
| `/docs/database/[model]` | **`(admin)`** | **HTTP 500** on first paint — **never measured by any previous task** |
| `/carrier/driver-pay/reports?tab=settlement-history` | `(owner)` | **HTTP 500** — seven of the eight tabs are one click from it |
| `/carrier/driver-pay/reports` (default tab) | `(owner)` | **HTTP 200 with a silently broken settlements table**, for any tenant with payroll in the period |
| `/carrier/driver-pay/reports/[driverId]` | `(owner)` | **HTTP 500** for any tenant with settlements for that driver |
| `/carrier/imports/[id]/stops` | `(owner)` | **NOT_MEASURED** — staging holds zero `document_imports` rows |

**A LATENT row is not a safe row**, and that is written in those words in §3 of the report. Two rows
measured 200 on staging only because staging has no payroll data: `reports` behind the `isEmpty` gate
at `page.tsx:122`, and `reports/[driverId]` behind `settlements.length === 0` at `page.tsx:124` — a
second data gate the plan did not anticipate. Both were proven, not asserted: one `PAID`
`driver_settlements` row seeded on **staging** flipped both empty-state markers off; with that row
present and the mount removed, `reports/[driverId]` went **200 → 500**.

---

## 2. A measurement that contradicts the plan

The plan predicted `/carrier/driver-pay/reports` would answer **500** on its default tab for a tenant
with payroll data. **Measured, it answers 200** — and the correlated log slice still carries
`nuqs requires an adapter … at SettlementsTable (…/reports/_components/SettlementsTable.tsx:243:53)`.

`reports/page.tsx:224` wraps `<SettlementsTable>` in `<Suspense>`, so the status line is already
committed as 200 by the time the deferred segment renders and throws; the table region is replaced by
the nearest error boundary. `reports/page.tsx:274` renders `SettlementHistoryReport` with **no**
Suspense, which is why that row is a genuine 500.

Recorded as a contradiction, not reconciled in prose. Two things follow:

1. The default-tab defect is arguably **worse** than a 500 — a missing settlements table reads as "no
   settlements this period", which is what the empty state beside it says. The page fails quietly.
2. It is the concrete justification for the sweep's rule that **the authority is the log string, not
   the status code.** Grading on status would have recorded that row as passing in both directions.

---

## 3. Why four gates stayed green — each for a different structural reason

| gate | why it was blind |
|---|---|
| `npm run build`, the five `(owner)` pages | `(owner)/layout.tsx:10` is `export const dynamic = 'force-dynamic'`. All five print `ƒ` in the route table. Next never rendered them |
| `npm run build`, the two `(admin)` pages | No `dynamic` export anywhere in `(admin)/docs/`. But `(admin)/layout.tsx:12` awaits `getSession()` → `createSupabaseServerClient()` → `await cookies()` (`lib/supabase/server.ts:5`), which opts the whole segment out of prerendering. **`generateStaticParams` on `/docs/database/[model]` is therefore dead code** |
| Playwright | `grep` for any of the seven routes over `apps/web/e2e/` returns **nothing** |
| `tsc` | A missing React context is a runtime error, not a type error. Blind by construction |

**The honest headline is bigger than any of the four.** The build census: **437 dynamic, 5 static (all
auth-free), zero SSG.** Every route group that can hold a `useDataGrid` reads a session before it
renders. **No nuqs consumer in this repository can be prerendered, so `npm run build` cannot catch
this class at all.**

"Nothing covered it" appears nowhere in the report. Three specs came close, each the wrong shape:

- **`e2e/carrier/reports.spec.ts`** visits `/carrier/reports/driver-pay`, which is **not**
  `/carrier/driver-pay/reports`. Two real directories, no redirect between them (`next.config.ts:19`
  has exactly two redirects, both `/carrier/dispatches*`), and the page it does visit has no
  `useDataGrid` at all. It was never near it.
- **`e2e/carrier/access.spec.ts`** asserts `not.toContain(...)` under a DRIVER or anonymous state. A
  redirect assertion never renders the page. Its owner-authorised block reaches three pages, none a
  consumer.
- **`e2e/owner/navigation-reachability.spec.ts`** — the irony the plan identified. It does one
  `goto('/carrier/dashboard')`, reads sidebar hrefs, and never navigates. **It proves the LINK, not
  the DESTINATION**, in the one spec whose header documents seven phases of "reported as wired,
  actually unreachable" and in a repo whose convention (quick-566/567) is that a nav claim is not done
  until a DOM query finds its link. Unreachable-by-500 is not the failure mode it was written for.

The suite is not excused by not running: `playwright.yml` runs the **full** chromium suite on every
push and PR to `master`, nothing is skipped out of it, and all the files involved are on
`origin/master`. **Whether that workflow is currently green could not be read from this machine** —
`gh` is unauthenticated here and I did not authenticate it. Stated as a limitation, not a pass.

---

## 4. The fix

`apps/web/src/app/layout.tsx` — `NuqsAdapter` imported from `nuqs/adapters/next/app`, wrapped as the
**outermost** child of `<body>`, around `AuthProvider`.

- **Root, not `(owner)`**, because the consumers span two route groups and a group-scoped mount cannot
  cover a sibling group. That is the entire defect, and mounting in `(owner)` would have reproduced it
  for `(admin)`.
- **Outermost**, so it also covers `SupportTicketModal` and `Toaster`, and its availability does not
  depend on `AuthProvider`'s internals. The reason is a comment above the mount.

`apps/web/src/app/(dev)/layout.tsx` — **deleted**, taking the empty route group with it. Nesting
adapters is harmless (`createAdapterProvider` returns a plain `context.Provider`), so this is a clarity
decision: that file is *what made the defect survive*. A grep for `NuqsAdapter` returned a hit, in a
file named `layout.tsx`, under a route group — every signal a reader uses to conclude "it is mounted",
all of them wrong.

**Nothing else changed.** No grid config, no page behaviour, no data, no query, no route.

**The one thing root mounting does not cover**, checked rather than asserted: `src/app/global-error.tsx`
replaces the root layout entirely. It has **zero imports** and reaches no nuqs consumer, so the gap is
real and currently empty. `error.tsx` files below the root ARE covered.

---

## 5. The guards

**`apps/web/src/__tests__/nuqs-adapter-coverage.test.ts`** — imports the same BFS that produced the
evidence, and asserts every consumer page has an adapter above it. Nine integrity and counter-assertions
sit in front of the coverage claim, because **the failure mode of a source scan is GREEN**: CRLF
normalisation on every read, a file-count floor, non-empty seed and mount sets, and two counter-assertions
that `assertScanIntegrity` rejects an empty page list and an empty mount list.

**Witnessed RED** (`evidence/05-guard-fires-red.md`) against the **exact pre-605 shape** — root mount
removed *and* `(dev)/layout.tsx` restored — so `findAdapterMounts` returned a non-empty set and **all
nine integrity tests stayed green while the two coverage tests failed, naming all seven pages**. The
guard fails on the *shape*, not on "no adapter anywhere". Restored; 11 passed.

**`apps/web/e2e/owner/nuqs-grid-render.spec.ts`** — four routes in a real browser, asserting 200, the
absence of `nuqs requires an adapter` in text and markup, and the absence of Next's error dialog. All
four pass, nothing skipped, including `/docs/features` under the sysadmin state — the `(admin)` half
that is the only browser evidence for *why* the mount is at the root. The
`/carrier/driver-pay/reports?tab=settlement-history` row uses an explicit tab deliberately: the bare URL
against an empty-data tenant asserts nothing, which is exactly how this went unnoticed.

Two of its decisions were measurements: `nextjs-portal` is present on **healthy and failing pages
alike** (the first draft asserted its absence and failed all three `(owner)` rows while they rendered
perfectly), so the locator is `[data-nextjs-dialog], [data-nextjs-dialog-overlay]`, witnessed in both
directions; and the `(admin)` block's `test.use` is unconditional because Playwright collects spec
modules before the `setup` project runs, so an `fs.existsSync` guard would skip it on every CI run while
looking deliberate.

**Both misses are stated in the report.** (a) is satisfied by a mount that merely exists. (b) needs a
server, a session, data in the right branch, and cannot cover dynamic segments.

---

## 6. The generalisation scan — reported, not fixed

Eleven `layout.tsx` files under `src/app`; **three** provider mounts in the whole application.

- **`AuthProvider`** — root. Safe by construction.
- **`TRPCReactProvider`** — `(owner)/layout.tsx:79`. **The same route-group shape.** 17 `useTRPC()`
  consumers; 15 under `(owner)`, **2 in the shared `src/components` tree**
  (`carrier/dispatches/NewDispatchForm.tsx`, `carrier/loads/DispatchLoadModal.tsx`). BFS from all 17
  reaches 7 pages and **every one is in `(owner)` — 0 outside.** Not broken today, structurally
  exposed: the day either shared component is rendered from `(driver)`, `(admin)`, `(shared)`, `(auth)`
  or a root-level route, that page throws the tRPC equivalent, invisibly to all four gates.
- **`NuqsAdapter`** — fixed by this task.

**Not fixed, deliberately** — widening a live fix is how this goes wrong. Recommended follow-up is the
**guard**, not the hoist: hoisting a React Query client to the root changes it for `(auth)` and
`(driver)` too and needs its own review; a guard costs nothing and fails red the moment the exposure
becomes real.

---

## 7. Verification

| check | result |
|---|---|
| `grep -rn "from 'nuqs" apps/web/src` | exactly two hits — the root mount and `useGridUrlState.ts` |
| `nuqs` version | `^2.8.9` in `package.json`, `2.8.9` installed. **Nothing installed or upgraded** |
| migration / policy / grant / tenant-scoping files | **none touched** |
| `npm run build` | **exit 0**, 443 route entries, **zero rendering-marker changes** |
| `npx tsc --noEmit` | **0 errors**, probed in **all three** files this task added or edited (`layout.tsx`, the e2e spec, the vitest guard) — each reported exactly one error at its injected line. Probes removed, `find __probe*` clean |
| vitest, same reporter both sides, compared BY NAME | before 2086/1967/64/52, 18 failing files → final **2097/1978/64/52, 18 failing files. Zero only-in-before, zero only-in-after** |
| `.planning/quick/604-.../evidence/` | **byte-identical**, including `04-click-through.json` and `04-server.log` |
| production writes | **none.** Production was never connected to at all |
| lint | **not run and not claimed** — `apps/web` has no working lint entry point (quick-562) |

---

## 8. Deviations and things worth carrying forward

- **`--surfaces3` was added to quick-604's harness rather than writing a third one**, as instructed. It
  writes its own artefact and correlates against its own server log via a new optional
  `CLICK_THROUGH_LOG` env var — appending a later task's requests to a closed task's log would have
  corrupted the byte offsets already recorded in `04-click-through.json`.
- **A dynamic segment that cannot be resolved gets NO REQUEST**, not a fabricated id. The first draft
  substituted a placeholder and got a 500 with SQLSTATE `P2007` (invalid UUID) that read exactly like
  an application defect. The row still exists, with status `null` and the reason committed as a string.
- **Resolve a dynamic segment scoped to the session's tenant.** "The first row in the table" belonged
  to the other seeded tenant and the page answered 404 — a measurement of the id, not the page.
- **One of the seven traced pages is a barrel-only false positive**, recorded rather than trimmed.
  `/carrier/imports/[id]/stops` reaches the seed through `components/data-grid/index.ts`; what
  `StopReviewScreen` actually imports is `useGridSelection`, which is zustand-backed. The over-report is
  in the conservative direction.
- **`wrapper-countdown.json` had to be regenerated TWICE**, and this generalises: **any task that adds
  or deletes a file under `apps/web/src` turns `tests/security/wrapper-migration-countdown.test.ts` red
  until the artefact is regenerated.** Deleting `(dev)/layout.tsx` took `filesScanned` 1691 → 1690;
  adding the guard file took it back to 1691. The check that the regeneration is honest, and the reason
  it is not "weakening a guard to go green", is that `unmigratedUnits` (456), `unmigratedCallSites`
  (459), `filesWithUnmigratedUnits` (202) and `withTenantContextCallSites` (0) never moved.
- **The Playwright spec is concurrency-sensitive against staging.** At the config's default
  `workers: 3`, `/carrier/driver-pay/settlements` failed 2 of 3 runs with `timeout exceeded when trying
  to connect` at `getTenantPrisma` — pool exhaustion, which `playwright.config.ts` documents itself and
  which the staging `app_user` string's `connection_limit=1` amplifies. Not a nuqs failure. `--workers=1`:
  3 for 3 green, and CI already uses 1.
- **The tsc "blind gate" trap fired once, for real.** The first run after deleting `(dev)/layout.tsx`
  reported a single error inside `.next/types/validator.ts`, a Next-generated file left by the earlier
  build still referencing the deleted layout. Delete `apps/web/.next` and `tsconfig.tsbuildinfo`, re-run.
- **Two build-generated index files drift on every `npm run build`** and were reverted twice rather than
  shipped: `apps/web/.docs-data/admin-docs-search-index.json` and `apps/web/src/lib/docs/search-index.json`
  are committed but stale relative to the docs content. Pre-existing, unrelated, reported here.

---

## 9. What remains unmeasured

Full list in §9 of `docs/audits/nuqs-adapter-render-failure.md`. The four that matter most:

1. **Every runtime verdict is a STAGING verdict.** `/carrier/driver-pay/reports` is the standing proof
   that this matters — a confident 200 on staging, and a broken table with one row present.
2. **`/carrier/imports/[id]/stops` was never rendered**, before or after. Expected safe is not a verdict.
3. **`global-error.tsx` is outside the mount** and always will be. Currently empty; live the day a
   `useDataGrid` component is rendered inside the global error boundary.
4. **`TRPCReactProvider` has the same shape**, reported and not fixed.

---

## Commits

| hash | message |
|---|---|
| `a65b7897` | `test(605-01)` trace every nuqs consumer page and verdict all seven BEFORE the fix |
| `b9089d4f` | `docs(605-02)` answer all four gates per lead, with evidence |
| `408a84ec` | `fix(605-03)` mount NuqsAdapter once at the root, delete the empty `(dev)` group |
| `0e517e40` | `test(605-04)` AFTER verdicts for all eight rows, plus build and suite deltas |
| `07516c8f` | `test(605-05)` the two guards, the provider enumeration, and the finished report |

**Not pushed.** The user pushes and deploys themselves.
