---
phase: quick-576
plan: 01
subsystem: testing
tags: [playwright, e2e, auth, rbac, next-auth-middleware]

requires:
  - phase: quick-575
    provides: "/settings/my-notifications ANY_AUTHENTICATED_PATHS exception, the 4-role auth.setup.ts skeleton, my-notifications-reachability.spec.ts"
provides:
  - "Corrected TestPass123! defaults for driver@test.com / manager@test.com in auth.setup.ts"
  - "Failure-isolated auth.setup.ts: a status manifest (.playwright/auth/status.json) + requireRoleAuth() so one broken role's login never skips unrelated specs"
  - "Role-gated user menu (PORTAL_ROLES.owner) hiding /settings/notifications and /help from DRIVER sessions"
  - "e2e/settings/user-menu-gating.spec.ts, proven RED with the gate removed and GREEN restored"
  - "quick-575's 4 reachability specs now execute (they were written-but-unexecuted before this task)"
affects: [e2e-suite, user-menu, rbac-gating]

tech-stack:
  added: []
  patterns:
    - "Playwright setup blocks record ok/status/error into a JSON manifest and never throw, so `setup.describe.serial` + a trailing summary test replace 'one failure skips the whole dependent project' with 'a broken role costs only its own specs'"
    - "requireRoleAuth(role) in a spec's beforeAll turns a stale/missing storageState ENOENT into a named diagnosis"

key-files:
  created:
    - apps/web/e2e/settings/user-menu-gating.spec.ts
  modified:
    - apps/web/e2e/auth.setup.ts
    - apps/web/e2e/fixtures/auth-helpers.ts
    - apps/web/src/components/navigation/user-menu.tsx

key-decisions:
  - "Driver/manager password defaults corrected to TestPass123! (quick-183's real password); owner default left at demo@drivecommand.com/demo1234 because 33 spec files depend on the DriveCommand Demo tenant's fixture data (D3)"
  - "auth.setup.ts decoupling is non-throwing blocks + a status manifest + a loud summary (D2) — not per-role Playwright projects, which would reproduce the same all-or-nothing coupling one level down given `dependencies` is per-project, not per-spec"
  - "Gate is PORTAL_ROLES.owner, not a hand-written [OWNER, MANAGER] array (D4)"
  - "/profile is left in place and commented as a known 404 dead link for every role, not deleted (D6) — removing a nav entry is a product call the user reserves"

metrics:
  duration: 41min
  completed: 2026-09-02
---

# Quick-576 Part B: Auth Setup Isolation + User Menu Gating Summary

**Corrected the QA test account passwords Part A diagnosed as wrong (not missing), restructured `auth.setup.ts` so one broken role no longer takes down the whole Playwright suite, and role-gated two links a DRIVER's user menu was offering that bounce them off the page.**

## Part A Findings (carried forward, not redone)

| account | app_meta role | tenant | app User row |
|---|---|---|---|
| owner@test.com | OWNER | QA Test Org (`73c69018-9047-40d0-9203-631985ca1ccd`) | yes, id matches auth id |
| driver@test.com | DRIVER | QA Test Org | yes, id matches auth id |
| manager@test.com | MANAGER | QA Test Org | yes, id matches auth id |
| owner_b@test.com | OWNER | QA Test Org B (`2bad9011-…`) | yes, id matches auth id |

Database reached is Supabase project ref `oqdhberkghtnszrkdvfm` (production — there is no separate test DB), via `apps/web/.env.local`. `QA Test Org` exists and is active. All four accounts are healthy: auth row present, email confirmed, not banned, not deleted, password set, correct `app_metadata` role/tenantId, matching app `User` row, `isActive = true`.

**The 401 mechanism, in one sentence:** quick-183 set the real password for all four QA accounts to `TestPass123!`, and quick-575 invented `driver1234`/`manager1234` as `auth.setup.ts` defaults without ever looking the real password up, then reported the resulting 401 as "the accounts don't exist" — verified in this task by re-running `auth.setup.ts` unmodified except for the password strings and watching driver/manager go from 401 to 200.

`TEST_*` env vars are set nowhere (confirmed again: zero in `.env.local`, zero in the ambient shell this session), which is why `TEST_SYSADMIN_EMAIL`/`PASSWORD` being unset is a second, live instance of the same coupling fault — it takes the whole suite down with it under the old throwing design.

## User Menu Link Gating Audit

| Link | Gating decision | Enforcing mechanism | DRIVER | MANAGER | OWNER | SYSTEM_ADMIN |
|---|---|---|---|---|---|---|
| `/profile` | **Not gated — reported as a 404 dead link for everyone.** No route exists (`find src/app -iname "*profile*"` returns nothing, no rewrite/redirect in `next.config.ts`, the href is the only occurrence of the string in `src/`). Left in the menu with a comment; removing a nav entry is a product decision the user reserves (D6), and gating cannot fix a route that doesn't exist. | N/A (route absent) | 404 | 404 | 404 (verified: signed-out `curl` gives `307` to `/sign-in` via the auth guard; signed in as OWNER it is a real `404`, confirmed with `curl -sI -b <owner-cookie>` → `HTTP/1.1 404 Not Found`) | 404 |
| `/settings/my-notifications` | Ungated — deliberately reachable by every authenticated role (quick-575's fix) | `ANY_AUTHENTICATED_PATHS` exception in `route-access.ts`, carved out of the `/settings` prefix | reachable | reachable | reachable | reachable |
| `/settings/notifications` | **Gated to `PORTAL_ROLES.owner`** | Bare `/settings` prefix in `OWNER_PATHS` (middleware, `src/lib/auth/route-access.ts`) | link now hidden (previously: bounced to `/home`) | reachable | reachable | link hidden (bounced to `/unauthorized` via `(admin)/layout.tsx`, unaffected by this task) |
| `/help` | **Gated to `PORTAL_ROLES.owner`** | **Not** in `OWNER_PATHS` at all — middleware lets a DRIVER straight through; `src/app/(owner)/layout.tsx` redirects any role other than OWNER/MANAGER to `/unauthorized` | link now hidden (previously: bounced to `/unauthorized`) | reachable | reachable | link hidden (bounced to `/unauthorized`, unaffected) |
| Sign out | Ungated | Client-side POST to `/api/auth/logout`, no role check needed | works | works | works | works |

`/profile`'s 404 is evidence, not inference: `curl -sI --max-redirs 0 http://localhost:3000/profile` signed out → `307` to `/sign-in?redirect_url=...` (the global auth guard, not a 404); the same request with an OWNER session cookie → `HTTP/1.1 404 Not Found`.

## `auth.setup.ts` Restructure

Previously each of the four role blocks called `expect(res.status()).toBe(200)`, which throws inside the shared `setup` Playwright project. Because `chromium` and `mobile` both declare `dependencies: ['setup']`, one throw (in practice: the sysadmin block, whose env vars have never been set anywhere) failed the whole `setup` project and skipped every dependent spec for every role — including roles that authenticated fine.

Each of the four blocks (owner/sysadmin/driver/manager) now goes through a shared `authenticateRole()` helper that:
1. Resolves email/password from env with corrected defaults (driver/manager now default to `TestPass123!`).
2. If credentials are missing entirely (the sysadmin case today), skips the HTTP call and records `ok:false, error:'no credentials configured'` rather than POSTing `undefined` and reading a schema 400 as a broken account.
3. POSTs `/api/auth/login`; on non-200 records `ok:false` with the status and response body.
4. **Deletes any pre-existing storageState file for that role on failure** — a stale `driver.json` from an earlier green run can no longer mask a now-broken account.
5. On success writes storageState (owner also writes the legacy `.playwright/auth.json`, which has zero importers — grep-verified — and is left in place per D3/D8 as a deliberate non-cleanup).
6. Records the outcome into `.playwright/auth/status.json` (a read-modify-write helper) and **never throws**.

All five tests (four role blocks + a trailing summary) are wrapped in `setup.describe.serial(...)` so the summary is *guaranteed* to run last despite `playwright.config.ts`'s `fullyParallel: true`, which would otherwise let Playwright spread same-file tests across workers with no ordering guarantee. Verified empirically — every `--project=setup` run in this task used exactly 1 worker and printed results in declared order.

**Isolation proof, captured verbatim** (dev server clean-restarted first):

```
$ npx playwright test --project=setup --reporter=list   (TEST_DRIVER_PASSWORD=wrong)
  ok 1 [setup] › authenticate as owner (1.6s)
  ok 2 [setup] › authenticate as sysadmin (4ms)
  ok 3 [setup] › authenticate as driver (224ms)
  ok 4 [setup] › authenticate as manager (821ms)
AUTH SETUP FAILED — sysadmin (no email configured): status=n/a reason=no credentials configured
AUTH SETUP FAILED — driver (driver@test.com): status=401 reason={"error":"Invalid email or password"}
  ok 5 [setup] › auth setup summary (1ms)
  5 passed (3.8s)
=== driver.json exists? === (no) — confirmed deleted

$ npx playwright test e2e/owner/dashboard.spec.ts --project=chromium   (same wrong password, same shell)
  ok  1-5 [setup] ...  (driver AUTH SETUP FAILED printed again)
  x   6-9 [chromium] › dashboard.spec.ts › ... (4 failed, 6 passed)
```

The owner dashboard spec **executed** (ran to completion, 6 passed / 4 failed) rather than being skipped — the 4 failures are pre-existing UI/fixture issues in that spec (sidebar links / headings not matching current markup), unrelated to auth, and are not part of this task's scope. The point proven is isolation: a broken DRIVER credential no longer prevented the OWNER spec from running at all.

## New Gating Spec + Red Proof

`e2e/settings/user-menu-gating.spec.ts` — two describes:
- **DRIVER session** (`/my-route`): asserts `/profile` and `/settings/my-notifications` are present (positive half — proves the menu genuinely opened with real content) AND `/settings/notifications`/`/help` are absent (negative half).
- **OWNER session** (`/carrier/dashboard`): asserts all four are present, confirming the gate doesn't over-fire.

Both use `[data-testid="user-menu-trigger"]:visible` to open the menu (two mount lanes in `owner-shell.tsx`, `compactOnMobile` collapsing the accessible name below 640px) and scope hrefs to `[role="menu"] a` with exact-match assertions, never `toContainText`. `requireRoleAuth('driver'|'owner')` runs in `beforeAll` so a broken account reports its own diagnosis instead of an ENOENT.

**Red proof, captured verbatim** (gate physically removed — `{canSeeOwnerSettings && (` replaced with `{true && (` in both spots, dev server clean-restarted, then re-run):

```
x  [chromium] DRIVER session — user menu omits owner-only links › shows Profile and My Notifications, omits Settings and Help & Support (2.9s)

  Error: expected /settings/notifications to be ABSENT for DRIVER
  Expected value: not "/settings/notifications"
  Received array:     ["/profile", "/settings/my-notifications", "/settings/notifications", "/help"]

ok  [chromium] OWNER session — user menu carries all four links › ... (9.0s)

  1 failed, 6 passed
```

Gate restored (`cp` from the pre-edit backup); re-ran both projects: **9/9 passed** (chromium + mobile, driver + owner). Final full `e2e/settings/` suite after a clean dev-server restart: **17/17 passed**.

## quick-575's Four Reachability Specs: Now Execute

**Yes — all four ran and all four passed**, against the corrected credentials, with a live dev server:

```
ok [chromium] DRIVER reaches /settings/my-notifications — this is the fix (2.9s)
ok [chromium] MANAGER still reaches /settings/my-notifications — regression pin (3.0s)
ok [chromium] OWNER still reaches /settings/my-notifications — regression pin (2.9s)
ok [chromium] DRIVER is still blocked from /settings/notifications (tenant-level) (8.9s)
4 passed
```

Also passed identically on the `mobile` project. The OWNER pin ran as `demo@drivecommand.com` against the `DriveCommand Demo` tenant per D3; it passed cleanly, so there is no tenant-data caveat to report here. "Written but unexecuted" is retired for these four specs.

## Verification

- **tsc — probed.** Baseline clean (`npx tsc --noEmit` → 0 errors). Injected `const __probe576: number = "x";` into `user-menu.tsx` (a file this task edited); tsc reported `src/components/navigation/user-menu.tsx(11,7): error TS2322: Type 'string' is not assignable to type 'number'.` at the exact injected line, proving the gate is live rather than blind. Probe removed; re-ran to a clean 0. Swept `src/` for leftover `__probe*.ts` — none found.
- **`next build`** — succeeded (exit 0), full static/dynamic route manifest printed with no errors. (One pre-existing, unrelated warning: `The package seems invalid. require() resolves to a EcmaScript module...` — present in dependency resolution, not caused by this task's files.)
- **Vitest, `--reporter=default` both sides**, measured in the main tree (not a worktree) before any edit and again after the last edit:
  - **Before:** `17 failed | 137 passed | 8 skipped (162 files)` · `63 failed | 1679 passed | 61 skipped | 3 todo (1806 tests)`
  - **After:** `17 failed | 137 passed | 8 skipped (162 files)` · `63 failed | 1679 passed | 61 skipped | 3 todo (1806 tests)`
  - **Identical, as expected** — this task touched only `e2e/*` files (outside Vitest's scope) and one client component with no unit test coverage.
- **`git diff --stat` across all three task commits** (`6aa3f5b2~1..HEAD`):
  ```
  apps/web/e2e/auth.setup.ts                       | 219 ++++++++++++++++++-----
  apps/web/e2e/fixtures/auth-helpers.ts            |  69 ++++++-
  apps/web/e2e/settings/user-menu-gating.spec.ts   | 117 ++++++++++++
  apps/web/src/components/navigation/user-menu.tsx |  95 +++++++---
  4 files changed, 426 insertions(+), 74 deletions(-)
  ```
  Exactly the four files the plan scoped. `git diff HEAD~3 -- src/middleware.ts src/lib/auth/route-access.ts src/emails prisma/schema.prisma playwright.config.ts` returned empty — do-not-touch list confirmed untouched. No `.skip` was added anywhere (grep-verified: `git diff` contains no `.skip(` addition).

## Deviations from Plan

**1. [Rule 3 - Blocking] Dev-server Turbopack cache corruption from `.next` deletion while `next dev` was live, twice.**
- **Found during:** Task 3's red-proof and Task 4's Vitest re-run.
- **Issue:** Deleted `apps/web/.next` while the background dev server was still running (the documented hazard in CLAUDE.md), which produced genuine 500s on every `/api/auth/login` call — indistinguishable from a real auth outage until traced back to the cache.
- **Fix:** Stopped the dev server (`taskkill` on the listening PID), deleted `.next` and `tsconfig.tsbuildinfo`, restarted `next dev`, and re-ran the affected verification (setup project, gating spec, quick-575 specs, final `e2e/settings/` sweep) from a clean state before trusting any result.
- **Files modified:** none (operational only).
- **Commit:** none (no source change; documented here per the "report, don't hide" convention).

**2. [Rule 1 - Bug] Gating spec's default `toBeVisible()` timeout (5s) was too short for a cold Turbopack compile.**
- **Found during:** Task 3, first run of the OWNER half of `user-menu-gating.spec.ts` against `/carrier/dashboard`.
- **Issue:** The first hit against an uncompiled dev-server route (plus its `mobile`-specific `DashboardMobile.tsx` chunk) can take well over 15s under concurrent Playwright workers — unrelated to the gate under test, but it produced a locator-timeout failure that looked like a real defect.
- **Fix:** Raised the trigger's `toBeVisible` timeout to 30s with a comment explaining the measured cause (an isolated single-page debug run resolved in <8s; the contended 3-worker run needed >15s). A genuine "menu never opened" failure still fails loudly via the positive-half assertions regardless of this timeout.
- **Files modified:** `apps/web/e2e/settings/user-menu-gating.spec.ts`.
- **Commit:** `7f567cf2` (part of Task 3's commit).

**Total deviations:** 2 (1 operational/no-commit, 1 auto-fixed test flake). Neither reflects a defect in the shipped gating logic or the auth isolation design — both were artifacts of the local dev-server environment surfaced while proving the work, not the work itself.

## Not Done / Deferred

- **`TEST_SYSADMIN_EMAIL` / `TEST_SYSADMIN_PASSWORD` remain unset.** The sysadmin `auth.setup.ts` block will continue to record `ok:false, error:'no credentials configured'` on every run until someone provisions a sysadmin QA account and sets these env vars. This is now loud (printed by name in the setup summary) and isolated (costs only sysadmin specs), which was this task's job — provisioning the account itself is out of scope (D1: Part A provisions nothing, and Part B's brief is isolation + gating, not new credentials).
- **The driver/manager vs. owner cross-tenant split is documented, not closed (D3).** Driver and manager sessions live in `QA Test Org`; the owner session used by 33 existing spec files lives in `DriveCommand Demo`. Switching the owner default would break all 33 at once with fixture-shaped failures. The new gating spec is immune to this (it asserts on menu links derived from session role only, reading no tenant data), but any future spec that needs an OWNER session in `QA Test Org` (e.g. to test against `owner_b@test.com`) will need its own explicit `storageState`, not the shared `owner.json`.
- **`/profile` is a real, unfixed 404 for every role**, including OWNER. It is commented in `user-menu.tsx` as a known dead link. Removing the nav entry (or building the route) is a product decision the user reserves — not made here.
- **`LEGACY_AUTH` / the legacy `.playwright/auth.json` write have zero importers** (grep-verified again this task). Deleting the write is a separate, deliberate cleanup left for its own task, per D3/D8.
- **`e2e/owner/dashboard.spec.ts` has 4 pre-existing failures** unrelated to auth or the user menu (sidebar link/heading mismatches against current markup), surfaced incidentally while proving the isolation fix. Not investigated or fixed — out of this task's scope, reported so it isn't mistaken for a regression this task introduced.
- **`next build`'s pre-existing "package seems invalid... EcmaScript module" warning** was present before this task's changes and is unrelated to any file this task touched; not investigated further.

## Self-Check: PASSED

All four modified/created source files confirmed present on disk (`apps/web/e2e/auth.setup.ts`, `apps/web/e2e/fixtures/auth-helpers.ts`, `apps/web/src/components/navigation/user-menu.tsx`, `apps/web/e2e/settings/user-menu-gating.spec.ts`), and all three task commits (`6aa3f5b2`, `11f0895c`, `7f567cf2`) confirmed present in `git log --oneline --all`.

---

## Orchestrator verification pass (post-execution)

Every claim below was re-run independently rather than taken from the execution report.

**Playwright, both spec files, both projects: 17/17 passed (48.5s).** Includes quick-575's
four reachability tests, which are now EXECUTED and GREEN — the outcome that task could
not reach.

**Requirement 7 proven live, not asserted.** Two independent demonstrations:

1. In the clean 17/17 run the **sysadmin login still fails** (`TEST_SYSADMIN_EMAIL` is
   unset), the summary prints
   `AUTH SETUP FAILED — sysadmin (no email configured): status=n/a reason=no credentials configured`,
   and all 12 dependent tests still ran. Under the old single-project design that one
   unset env var took the whole suite down on its own.
2. Forced a broken account with `TEST_DRIVER_PASSWORD=deliberately-wrong`:

```
2 failed
  ... DRIVER reaches /settings/my-notifications ...
  ... DRIVER is still blocked from /settings/notifications ...
    Error: requireRoleAuth('driver') failed — auth.setup.ts could not authenticate
    driver@test.com (status: 401, reason: {"error":"Invalid email or password"}).
    See .playwright/auth/status.json.
7 passed
```

   The driver's own specs fail with a **named diagnosis**; the seven owner/manager specs
   pass regardless. That is exactly "fail its own specs loudly, not silently disable the
   suite", demonstrated rather than described.

**`/profile` 404 confirmed independently** — replayed the owner storageState cookies
against the running dev server: `GET /profile -> 404`. Dead for every role, gating cannot
fix it, left in place as the plan decided.

**Gate shape checked by reading, not by the diff summary.**
`canSeeOwnerSettings = !!user && PORTAL_ROLES.owner.includes(user.role)` gates
`/settings/notifications` and `/help`; `/profile` and `/settings/my-notifications` are
ungated. The `!!user` term means the owner-only links are hidden while the role is still
unknown — fail-closed, which is the correct direction.

**Do-not-touch list verified:** `git diff --name-only ed00d95e..HEAD` matches none of
`middleware.ts`, `route-access.ts`, `src/emails/`, the dispatcher, or `schema.prisma`.
Four files changed, all in scope.

### One gap closed by the orchestrator

`my-notifications-reachability.spec.ts` (quick-575's) did not call `requireRoleAuth`, so a
broken account there would still have failed on an opaque `ENOENT` on the storageState
path — the exact failure mode requirement 7 exists to remove, left live in the one spec
file this whole task was undertaken to unblock. Added a
`test.beforeAll(() => requireRoleAuth('<role>'))` to each of its four `describe` blocks,
naming the role that block's `storageState` consumes. The forced-failure run above is that
change working.

### Verification after the orchestrator's edit

- `npx tsc --noEmit` **probed** — `const __probe576: number = 'x'` in the edited spec
  produced exactly `my-notifications-reachability.spec.ts(127,7): error TS2322` and nothing
  else, so the gate is live. Probe removed; clean run exits **0**.
- Playwright re-run after the edit: **17/17 passed**.
- Vitest `--silent`: **1806 total / 1679 passed / 63 failed / 61 skipped / 3 todo** —
  byte-identical to the quick-575 baseline. Correct: Playwright specs are not in the
  Vitest suite, so this change should move nothing, and it moved nothing. The 63 failures
  are the pre-existing `stepTemplate.test.ts` tenant-isolation set, unrelated.

### Still open, and it is the user's call

`TEST_SYSADMIN_EMAIL` / `TEST_SYSADMIN_PASSWORD` are set nowhere, so `sysadmin.json` is
never written and any sysadmin-scoped spec cannot run. This is now correctly isolated —
it no longer harms other roles — but it is still an unusable role. quick-183 seeded only
owner/manager/driver; the sysadmin account was never part of that seed. Not fixed here:
Part A was scoped read-only and account provisioning is the user's decision.
