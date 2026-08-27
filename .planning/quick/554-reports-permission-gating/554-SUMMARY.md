# quick-554 — Reports permission gating: UI-only, with more holes than reported

**Commits:** `b12bea8a`, `37e31207`, `d3e38dd3` (pre-task HEAD `1bfe9f63`)

---

## 1. The table

Two layers matter and the brief's framing hides one. The **pages** sit under
`(owner)/layout.tsx` (role `OWNER|MANAGER`, else `/unauthorized`) and
`carrier/layout.tsx` (DRIVER → `/home`). The **APIs** sit under `/api/...` and
were covered by neither.

| Route | Sidebar gate | Mobile More gate | In `PERMISSION_GATED_PATHS`? | Server-side check |
|---|---|---|---|---|
| `/carrier/reports/revenue` | `revenueReport` | **none** | yes | page: role only (layouts) · **API: session-only** |
| `/carrier/reports/driver-pay` | `driverPayReport` | **none** | yes | page: role only (layouts) · **API: session-only** |
| `/carrier/reports/aging` | `arAgingReport` | not in menu | yes | page: role only (layouts) · **API: session-only** |
| `/carrier/reports/performance` | `performanceReport` | **none** | yes | page: role only (layouts) · **API: session-only** |
| `/carrier/reports/todays-trips` | `performanceReport` | **none** | **NO** | page: `requireRole([OWNER,MANAGER])` · **API: session-only** |
| `/carrier/driver-pay/reports` | not in sidebar | not in menu | no | page: `getSession` + role · API: role via `ALLOWED` — **no permission check either side** |

### Holes

**H1 — the reported one.** `PERMISSION_GATED_PATHS` had no `todays-trips` entry.
Confirmed mechanically against the real constant:
`PERMISSION_GATED_PATHS.find(g => '/carrier/reports/todays-trips'.startsWith(g.path))`
→ `undefined`.

**H2 — bigger, and the one that mattered.** All five `/api/v1/carrier/reports/*`
handlers were exactly `getSession()` + `if (!session) return 401`. No role check,
no permission check. Middleware does not cover them: **both** its guards are
prefix matches on `/carrier` — the DRIVER redirect via `OWNER_PATHS` and the
MANAGER gate via `PERMISSION_GATED_PATHS` — while these paths begin
`/api/v1/carrier/…`. Verified against the real constants:

```
/api/v1/carrier/reports/revenue       | MANAGER gated: false | DRIVER blocked: false
/api/v1/carrier/reports/todays-trips  | MANAGER gated: false | DRIVER blocked: false
```

**Any authenticated user of any role, a driver included, could read every carrier
report's data.** Closing H1 alone would have fixed the page and left the data open.

**H3 — the More menu, and not only Reports.** `owner-more-menu.tsx` imported no
auth at all. Every item was ungated, including Clients, Contracts, Templates,
Carrier Drivers, Carrier Trucks and Facilities. It also offered **Team
Permissions**, which `OWNER_ONLY_PATHS` bounces a MANAGER off.

**H4 — `/carrier/driver-pay/reports` has a role gate and no permission gate**,
either side. No UI entry, so no UI/server *mismatch* — but no RBAC.

### Root cause

**Five hand-written copies of the manager-permission predicate; three disagreed
with the two the design documents as correct.**

| Implementation | Honours `fullAccess`? |
|---|---|
| `hasPermission()` — `permissions.ts:246` | yes |
| `middleware.ts:177` | yes |
| `requirePermission()` — `supabase.ts:177` | **no** |
| `managerHasPermission()` — `Sidebar/index.tsx` | **no** |
| `PermissionGuard` — `guards.tsx:72` | **no** (zero consumers) |

`fullAccess: true` + a stale explicit `revenueReport: false` is a **normal**
stored state: the team-permissions UI greys the granular toggles out when Full
Access is on and never clears their values.

## 2. `performanceReport` for Today's Trips — keep it, add no key

1. **A new key would ship granting nothing.** `getPermissions()` merges stored
   permissions over `DEFAULT_MANAGER_PERMISSIONS` and `hasPermission` is
   default-all-true, so every existing manager in every tenant would read as
   permitted on the deploy that added it — while three hand-written pickers
   gained a row and only one is type-checked. DEC-16's failure mode exactly.
2. The middleware gate is prefix-based; a uniform `/carrier/reports/*` family
   keyed by reports permissions is what makes it auditable.
3. It is the report page's own documented decision, and nothing found here is
   new evidence against it.

**Counter-argument, recorded rather than buried:** by content Today's Trips is
closer to `dispatches` than to `performanceReport` — an operational board ranked
by attention, not a financial report. Not acted on, because it would *widen*
access on my reading rather than a product decision. If revisited, the candidate
is `dispatches`, **never a new key**.

## 3. What changed

- `PERMISSION_GATED_PATHS` += `/carrier/reports/todays-trips` → `performanceReport`.
- New `lib/carrier/report-access.ts`; all five report handlers call
  `resolveReportAccess(key)` → 401 / 403 / 403-no-tenant. **One call closes both
  halves of H2**: `hasPermission` is false for every role that is neither OWNER
  nor MANAGER, so the DRIVER exposure and the MANAGER gap cannot drift apart.
  A shared helper, not five pasted copies — five copies is the defect being fixed.
- `requirePermission()` and the sidebar's `managerHasPermission()` delegate to
  `hasPermission()`.

**Behaviour change, stated:** a `fullAccess` MANAGER with an explicit
`aiDocuments: false` previously got `PERMISSION_DENIED` from `ai-documents.ts`
(`requirePermission`'s only caller). They are now allowed — what the master
toggle claims and what the middleware guarding that page already did.

## 4. Mobile More menu

Aligned per route with the sidebar, **all five sections**. Two deliberate changes:
**AR Aging added** (the only legitimate difference between the surfaces — removed
rather than preserved) and **Team Permissions marked `ownerOnly`**. Invoices,
Payroll and Support stay ungated because they have no key in `UserPermissions`
and `/support` is documented there as always accessible to managers.

**The filter fails OPEN, and this was found in a browser, not reasoned about.**
`useAuth()` starts `{ user: null, isLoaded: false }` and `hasPermission(null, key, '')`
is false, so the first build showed a real OWNER a More menu containing Invoices,
Payroll and Support **and nothing else** — on a phone, that menu *is* the
navigation. "Not loaded yet" and "you may not see this" are different facts; the
same conflation as Phase 11's `.catch(() => [])` rendering a failed query as
"No trucks yet". Failing open is safe **only because** H2 is now closed: an
unfiltered link leads to a redirect, not to data.

While diagnosing this I found that **`/api/auth/me` never returns on the
Playwright `mobile` (iPhone 14) project in this dev environment** — the request
fires and no response arrives in 6s+, so `isLoaded` stays false forever. The
untouched sidebar sees the same null user there, and chromium resolves normally,
so it predates this task. **Flagged as possibly a stale-Turbopack artifact of
this session's many file swaps rather than asserted as a product defect** — it
needs a clean re-check after a dev-server restart. It is not load-bearing for the
fix: the fail-open makes the component correct either way.

## 5. The tests, and how they fail

Two files, 64 tests.

`lib/carrier/__tests__/reports-permission-gating.test.ts` — three suites:
- **Real `Response` objects from the real exported handlers.** Only `getSession`
  and the query layer are stubbed, and the query layer deliberately: a 200 must
  prove the *gate* let the request through, not that a database answered. Per
  route: 401 no session · **403 DRIVER** · 403 restricted MANAGER · 200 permitted
  MANAGER · 200 `fullAccess` MANAGER with a stale false · 200 OWNER · 403 no tenant.
- **No mocks at all** over the real `PERMISSION_GATED_PATHS`.
- A source scan so a handler cannot quietly go back to resolving its own session.

`components/navigation/__tests__/owner-more-menu-permissions.test.ts` — the
MANAGER cases, which **cannot be reached from a browser here**: proving them
needs a restricted manager and this task may not change data. The filter is a
pure exported function, so it is asserted directly — stronger evidence than a
browser check that can only ever exercise an owner.

**How it fails if `PERMISSION_GATED_PATHS` loses an entry** — proven by actually
removing the `todays-trips` row:

```
AssertionError: /carrier/reports/todays-trips is reachable by URL without a
permission check. It has no entry in PERMISSION_GATED_PATHS, so middleware waves
a restricted MANAGER straight through while the sidebar hides the link — UI
enforcement with nothing behind it.: expected undefined to be defined
```

It resolves each route the way `middleware.ts:179` actually does
(`pathname.startsWith` over the real array), so a deletion, a typo in the path
and a renamed route folder all fail — not merely a missing literal string. A
second assertion fails if middleware and the UI gate the same route on different
keys.

**Also proven red**, not reasoned about: reverting one handler to session-only
gave `expected 200 to be 403` **twice** — the DRIVER case and the restricted
MANAGER case, exactly the two holes; and un-gating two menu items reddened three
menu assertions.

## 6. `/carrier/driver-pay` — reported, not fixed

**`src/app/(owner)/carrier/driver-pay/` has no `page.tsx`.** It contains only
`pending/`, `reports/` and `settlements/`. Two breadcrumbs link to it:

- [`driver-pay/reports/page.tsx:137`](../../../apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx) — `<Link href="/carrier/driver-pay">`
- [`driver-pay/reports/[driverId]/page.tsx:78`](../../../apps/web/src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx) — same

Both render a navigation element pointing at a 404.

**What they should point at instead.** The subtree has no hub, and inventing one
is out of scope, so the honest options are:

1. **`/carrier/reports/driver-pay`** — the existing, linked, permission-gated
   Driver Pay report. Best fit: it is what a user clicking "Driver Pay" expects,
   and it is reachable from both the sidebar and the More menu.
2. **`/carrier/driver-pay/settlements`** — closer to the subtree's own content
   (these pages are settlement reports), but itself has no nav entry, so it moves
   the dead end rather than removing it.
3. Build a real `/carrier/driver-pay/page.tsx` hub. A product decision, not a fix.

**Recommendation: (1).** It is the only target that is both live and reachable
from navigation. Note the whole subtree has no nav entry of its own — the only
inbound link anywhere is `components/driver-pay/assignment-card.tsx:225` →
`/carrier/driver-pay/pending`.

## Gates

- **tsc apps/web: 0 errors — PROBED** (`TS2322` reported in `report-access.ts`
  and again in `owner-more-menu.tsx`, the files actually edited; both removed,
  diffstat checked for residue).
- **tsc apps/mobile: 0 errors — PROBED** (`TS2322` in `lib/api-with-queue.ts`;
  removed, `git status apps/mobile` clean).
- **vitest diffed against `1bfe9f63`:** baseline `18 failed | 121 passed (147
  files)`, `66 failed | 1465 passed (1595)`. Final `18 failed | 123 passed (149)`,
  `66 failed | 1529 passed (1659)`. **+2 files, +64 tests, all passing; identical
  66 failures. Zero regressions.**
- **Real browser, owner session:** sidebar unchanged after the `hasPermission`
  swap (4 groups, 23 hrefs, Reports present); all five report APIs answer an
  OWNER **200** through the new gate; the More menu renders 15 hrefs across 5
  sections when loaded, and the same 15 when auth has not loaded (fail-open).

## Files

```
apps/web/src/lib/auth/supabase.ts                                   |  49 +++--
apps/web/src/components/Sidebar/index.tsx                           |  50 +++--
apps/web/src/lib/auth/permissions.ts                                |  17 ++
apps/web/src/lib/carrier/report-access.ts                           |  NEW
apps/web/src/app/api/v1/carrier/reports/{5 routes}/route.ts         |  11 each
apps/web/src/components/navigation/owner-more-menu.tsx              | 135 ++++--
apps/web/src/lib/carrier/__tests__/reports-permission-gating.test.ts        |  NEW
apps/web/src/components/navigation/__tests__/owner-more-menu-permissions.test.ts | NEW
```

No DDL, no data changes, no new roles, no new permission key. No report's display
or queries touched.

## Found, reported, NOT changed

1. **`/carrier/driver-pay` breadcrumbs → 404** (step 6 above).
2. **H4:** `/carrier/driver-pay/reports` has a role gate and no permission gate
   either side. No UI entry, so no UI/server mismatch; choosing a key is a
   product decision.
3. **`PermissionGuard` and `RoleGuard` in `lib/auth/guards.tsx` have ZERO
   consumers** — orphaned when quick-552 deleted `navigation/sidebar.tsx`. The
   orphan scanner walks only `navigation/` and `Sidebar/`, so `lib/auth/` is
   outside it. `PermissionGuard` is also the last copy of the predicate that
   ignores `fullAccess`; left alone precisely because nothing renders it.
4. **`/api/auth/me` hangs on the Playwright `mobile` project** in this dev
   environment (section 4). Possibly a stale-bundler artifact; needs a clean
   re-check after a dev-server restart.
5. The session's stored permissions on the demo owner are **legacy keys**
   (`canViewPayroll`, `canViewCRM`, …), not the `UserPermissions` keys this
   system gates on. Harmless for OWNER (short-circuited before the lookup), but
   it means no production record was available to exercise the MANAGER paths —
   which is why those are unit-tested rather than browser-tested.
