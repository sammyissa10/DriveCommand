---
phase: quick-576
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/e2e/auth.setup.ts
  - apps/web/e2e/fixtures/auth-helpers.ts
  - apps/web/src/components/navigation/user-menu.tsx
  - apps/web/e2e/settings/user-menu-gating.spec.ts
autonomous: true

must_haves:
  truths:
    - "The Playwright suite authenticates driver@test.com and manager@test.com successfully (the 401 was a wrong password in quick-575's own defaults, not a broken account)."
    - "One failing login no longer skips every dependent spec — the sysadmin block with unset env vars leaves owner/driver/manager specs running."
    - "A broken account fails its own specs loudly: the setup run prints a per-role status table naming the account and the HTTP status."
    - "A DRIVER session's user menu renders Profile and My Notifications, and does NOT render the tenant-level Settings link or Help & Support."
    - "An OWNER session's user menu still renders all four links."
    - "The gating spec fails when the gate is removed — proven by actually removing it, not by reasoning."
    - "quick-575's four reachability specs execute against a running dev server and their pass/fail results are reported."
  artifacts:
    - path: "apps/web/e2e/auth.setup.ts"
      provides: "Per-role credential defaults corrected to TestPass123!; non-throwing per-role blocks; status manifest; loud summary"
      contains: "TestPass123!"
    - path: "apps/web/e2e/fixtures/auth-helpers.ts"
      provides: "AUTH_STATUS_PATH constant + readAuthStatus()/requireRoleAuth() so a spec can name its own broken account"
    - path: "apps/web/src/components/navigation/user-menu.tsx"
      provides: "Role gate on /settings/notifications and /help via PORTAL_ROLES.owner; data-testid on the trigger"
      contains: "PORTAL_ROLES"
    - path: "apps/web/e2e/settings/user-menu-gating.spec.ts"
      provides: "DOM assertion of menu link presence/absence for DRIVER and OWNER sessions"
  key_links:
    - from: "apps/web/src/components/navigation/user-menu.tsx"
      to: "src/lib/auth/roles.ts"
      via: "PORTAL_ROLES.owner membership test on the session role"
      pattern: "PORTAL_ROLES\\.owner"
    - from: "apps/web/e2e/settings/user-menu-gating.spec.ts"
      to: ".playwright/auth/driver.json + owner.json"
      via: "test.use({ storageState })"
      pattern: "storageState"
    - from: "apps/web/e2e/auth.setup.ts"
      to: ".playwright/auth/status.json"
      via: "per-role outcome written whether the login succeeded or failed"
      pattern: "status\\.json"
---

<objective>
Close Part B of quick-576: role-gate the user menu, and restructure `auth.setup.ts` so one broken
account fails its own specs instead of silently disabling the whole Playwright suite.

Purpose: DOM-based reachability verification is this project's primary defence against features that
exist in code but are unreachable in the UI. That defence has been offline because a single
`setup` project failure skips every dependent spec — and because quick-575 shipped a user menu that
links every DRIVER to two routes they are bounced off.

Output: corrected credentials, a failure-isolated setup, a role-gated menu, and a new gating spec
that has actually been run and proven red.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

@apps/web/e2e/auth.setup.ts
@apps/web/e2e/fixtures/auth-helpers.ts
@apps/web/src/components/navigation/user-menu.tsx
@apps/web/src/lib/auth/roles.ts
@apps/web/e2e/settings/my-notifications-reachability.spec.ts
</context>

<decisions_locked>
These were decided during planning against the real files. The executor implements them; it does not
re-open them. Each carries its justification because the reasoning is the load-bearing part.

**D1 — Part A is DONE. Do no diagnosis and provision nothing.**
All four QA accounts are healthy in the target database (project ref `oqdhberkghtnszrkdvfm`, reached
via the local dev server's `.env.local`). The 401 was quick-575 inventing `driver1234` /
`manager1234` as defaults instead of looking up the password quick-183 actually set:
**`TestPass123!`**, verified 200 against the Supabase token endpoint for driver, manager, owner and
owner_b. **No account is created, reset, re-confirmed or unbanned by this task.**

**D2 — The `auth.setup.ts` decoupling strategy is (c): non-throwing blocks + a status manifest +
a loud summary. `playwright.config.ts` is NOT modified.**
Option (b) — one setup project per role — was rejected on inspection of the real config: `chromium`
and `mobile` each declare a single `dependencies: ['setup']`, and Playwright dependencies are
per-PROJECT, not per-spec. Listing four setup projects there reproduces the identical all-or-nothing
coupling one level down. True isolation would need per-role browser projects with `testMatch`
partitioning, which would break the `test.use({ storageState })` convention that **43 spec files**
already rely on — a restructure far larger than this task. Option (a) was rejected because an
opaque `ENOENT .playwright/auth/driver.json` is exactly the "silently disabled" failure mode in a
new costume. (c) satisfies the brief's wording literally — "fail its own specs loudly, not silently
disable the suite" — and stays inside the brief's stated file scope.

**D3 — The owner default stays `demo@drivecommand.com` / `demo1234`. The cross-tenant split is
documented, not closed.**
Grep-verified blast radius: **33 spec files read `.playwright/auth/owner.json`** (all of
`e2e/owner/`, `e2e/carrier/`, `e2e/sysadmin/auth.spec.ts` and eight top-level specs) and were
authored against the `DriveCommand Demo` tenant's data. Switching the owner default to
`owner@test.com` would swap the tenant underneath all 33 at once, producing fixture-shaped failures
indistinguishable from real regressions. Separately established and worth recording: `LEGACY_AUTH`
in `auth-helpers.ts` is **exported and imported by zero specs** — so A5's worry about the legacy
`.playwright/auth.json` write is an empty set; the 33 `owner.json` consumers are the real reason,
not the legacy path. Leave the legacy write in place (deleting dead code is a separate, deliberate
cleanup) and comment that it has no importers.
Consequence to state in the summary: driver and manager sessions live in `QA Test Org`, the owner
session in `DriveCommand Demo`. The new gating spec is **immune** to this, because it asserts on
menu links derived from the session role only — it reads no tenant data.

**D4 — The gate is `PORTAL_ROLES.owner`, not a hand-written role array.**
Verified against the filesystem: `/settings/notifications` lives at `src/app/(owner)/settings/
notifications` and `/help` at `src/app/(owner)/help`, and `(owner)/layout.tsx` admits exactly
`OWNER | MANAGER` — which is precisely `PORTAL_ROLES.owner` in `src/lib/auth/roles.ts`. Import that
constant rather than restating `[OWNER, MANAGER]`, so a future change to who may enter the owner
portal moves the menu with it. This also settles SYSTEM_ADMIN, which mounts the same menu from
`(admin)/layout.tsx` and is likewise bounced by that layout: it correctly loses both links.

**D5 — The two gated links are blocked by TWO DIFFERENT mechanisms, and the code must say so.**
`/settings/notifications` is blocked by the bare `/settings` prefix in `OWNER_PATHS` (middleware).
`/help` is **not** in `OWNER_PATHS` at all — middleware lets a driver through and the `(owner)`
route-group layout redirects them to `/unauthorized`. A future reader who checks only `OWNER_PATHS`
would conclude `/help` is fine for drivers. One comment, both mechanisms named.

**D6 — `/profile` is a 404 for every role. Report it; do not delete the link.**
`find src/app -iname "*profile*"` returns nothing, `next.config.ts` has no rewrite or redirect for
it, and the only occurrence of the string in the whole of `src/` is the `href` in `user-menu.tsx:129`.
Gating cannot fix it — it is broken for OWNER too. Removing a nav entry is a product call the user
reserves (quick-566/567 are both explicit user decisions on exactly this), so it is reported at the
top of the summary as a follow-up, not silently deleted.

**D7 — The trigger gets a `data-testid`; the assertions use CSS scoping, not `getByRole`.**
Two reasons a role/text locator cannot work here. (i) `owner-shell.tsx` mounts `UserMenu` **twice**
— desktop lane and `lg:hidden` mobile lane — alongside `QuickActionsMenu`, `TopBarHelpButton` and
`NotificationBell`, so `button[aria-haspopup="menu"]` is ambiguous on every owner page (quick-559).
(ii) `compactOnMobile` puts the name/email behind `hidden sm:grid`, so below 640px the accessible
name collapses to the initials — and every spec runs in **both** the `chromium` and `mobile`
projects, so a name-based locator is viewport-dependent by construction. A `data-testid` plus a
visibility filter is the only locator stable across both. For the **absence** assertion use a CSS
query (`[role="menu"] a` hrefs), never `getByRole`: the accessibility tree excludes `display:none`
subtrees and would "prove" absence for a link that is merely hidden (quick-559).

**D8 — Scope extension, declared rather than smuggled.** The brief names `user-menu.tsx` and
`auth.setup.ts`. Two more files are necessarily implied: `e2e/fixtures/auth-helpers.ts` (the
existing and only home of the auth-path constants — the status-manifest path belongs beside them,
not duplicated into a spec) and the new spec file requirement 8 asks for. `playwright.config.ts`
is **not** touched (D2). The do-not-touch list — `middleware.ts`, `route-access.ts`, `src/emails/**`,
the notification dispatcher, `prisma/schema.prisma` — is untouched.
</decisions_locked>

<tasks>

<task type="auto">
  <name>Task 1: Correct the credentials and make each role's setup fail alone</name>
  <files>
    apps/web/e2e/auth.setup.ts
    apps/web/e2e/fixtures/auth-helpers.ts
  </files>
  <action>
Re-read both files before editing.

**1a. Fix the defaults.** In `auth.setup.ts`, change the DRIVER default password to `TestPass123!`
and the MANAGER default password to `TestPass123!`. Emails stay `driver@test.com` /
`manager@test.com`. Leave the owner block's `demo@drivecommand.com` / `demo1234` alone (D3). Update
the file's header block: the "Optional (defaults to demo/test accounts)" list currently advertises
`driver1234` / `manager1234`, and a stale doc comment is how the wrong password survived a whole
task. Also delete the now-false paragraph claiming "Neither default account is guaranteed to exist
in the database this suite points at" — replace it with the established fact: all four accounts
exist and are healthy; quick-575's defaults were simply the wrong password (cite quick-183 as the
source of `TestPass123!`).

**1b. Add the status manifest to `auth-helpers.ts`.** Export:
- `AUTH_STATUS_PATH` — `.playwright/auth/status.json`, alongside the existing path constants.
- A `RoleAuthStatus` type: `{ role: string; email: string | null; ok: boolean; status: number | null; error: string | null }`.
- `readAuthStatus(): Record<string, RoleAuthStatus>` — returns `{}` if the file is absent, never throws.
- `requireRoleAuth(role: string): void` — reads the manifest and throws an error that NAMES the
  role, the email attempted and the HTTP status when that role's entry is missing or `ok === false`.
  This is the "loudly" mechanism a spec opts into.

Also add a one-line comment on `LEGACY_AUTH` recording that it has zero importers (grep-verified,
quick-576) so a future task can delete it deliberately rather than wondering.

**1c. Restructure the four setup blocks so none can take the suite down.** Each block must:
  1. Resolve its email/password from env with the corrected defaults.
  2. If credentials are missing entirely (the live sysadmin case — `TEST_SYSADMIN_EMAIL` and
     `TEST_SYSADMIN_PASSWORD` are set nowhere, in `.env.local` or the ambient shell), skip the HTTP
     request altogether and record `ok:false, error:'no credentials configured'`. Do not POST
     `undefined` and collect a 400 schema error that reads like a broken account.
  3. POST `/api/auth/login`, and on a non-200 record `ok:false` with the status and the response
     body text.
  4. **On failure, delete any pre-existing storageState file for that role** before returning. This
     is load-bearing: a stale `driver.json` from an earlier green run would otherwise let a spec sail
     past a genuinely broken account on cookies that are no longer being verified — the same class
     of false green this task exists to remove.
  5. On success write the storageState exactly as today (owner additionally writes the legacy path).
  6. Record the outcome into the manifest and **return without throwing**, so the `setup` project
     stays green and `chromium` / `mobile` are not skipped.

Write the manifest with a read-modify-write helper (the four blocks run in the same project and may
interleave; a blind overwrite would lose entries).

**1d. Add a final `setup('auth setup summary', ...)` block** that reads the manifest and, for every
role with `ok:false`, emits a `console.error` line naming the role, the email and the reason,
prefixed so it is greppable (e.g. `AUTH SETUP FAILED —`). It must NOT throw: throwing would restore
exactly the coupling being removed. It must run last — give it a name that sorts last or rely on
declaration order, and verify empirically that it does.

Do NOT mark anything `.skip`, and do NOT add `test.skip()` guards to existing specs.
  </action>
  <verify>
Stop `next dev` first if a mass file operation is involved; otherwise leave it running for the
login POSTs.

1. `npx playwright test --project=setup --reporter=list` from `apps/web` with a dev server up.
   Expect: the project reports GREEN, `.playwright/auth/{owner,driver,manager}.json` all exist and
   are non-empty, `sysadmin.json` does NOT exist, and the summary block printed
   `AUTH SETUP FAILED — sysadmin ... no credentials configured`.
2. `cat .playwright/auth/status.json` — four entries, three `ok:true`, sysadmin `ok:false`.
3. Prove the isolation is real, not incidental: temporarily set `TEST_DRIVER_PASSWORD=wrong` and
   re-run `--project=setup` plus one OWNER spec (`e2e/owner/dashboard.spec.ts`). The owner spec must
   still EXECUTE (pass or fail on its own merits) rather than being skipped — that is the whole
   point of the task. Confirm `driver.json` was deleted rather than left stale. Restore the env.
  </verify>
  <done>
driver@test.com and manager@test.com authenticate; a missing-credential sysadmin and a
wrong-password driver each fail only their own specs; the failure is printed by name; a stale
storageState cannot mask a broken account.
  </done>
</task>

<task type="auto">
  <name>Task 2: Role-gate the user menu and audit every link in it</name>
  <files>apps/web/src/components/navigation/user-menu.tsx</files>
  <action>
Re-read the file first. It is 203 lines, has four links plus sign-out, and no role gating at all.

**2a. Gate by session role, not by mounting shell.** The component already has what it needs:
`useAuth()` at line 35 returns `user`, and `AuthUser.role` is a `UserRole` (set in
`auth-context.tsx` from `/api/auth/me`). Import `PORTAL_ROLES` from `@/lib/auth/roles` and derive a
single boolean — e.g. `const canSeeOwnerSettings = !!user && (PORTAL_ROLES.owner as readonly
UserRole[]).includes(user.role)`. Do not write `[OWNER, MANAGER]` by hand (D4). Do not add a prop,
a new context, or a per-shell branch — three shells mount this component and a prop would let one
of them pass the wrong value.

**2b. Gate exactly two items** — the `/settings/notifications` item (lines 155-167) and the `/help`
item (lines 169-181). Leave `/profile`, `/settings/my-notifications` and Sign out ungated.

Guard against the loading flicker: `user` is `null` until `/api/auth/me` resolves. The early
`if (!isLoaded)` return at line 48 already covers this — confirm it does, and if the gated items
could ever render before the role is known, treat unknown as NOT permitted (fail closed: briefly
missing a link is recoverable, briefly offering a driver a link that bounces them to
`/unauthorized` is the defect being fixed).

**2c. Comment the two mechanisms** (D5), in one short block above the gate:
`/settings/notifications` is blocked by the bare `/settings` prefix in `OWNER_PATHS` (middleware);
`/help` is NOT in `OWNER_PATHS` — it is blocked by `src/app/(owner)/layout.tsx`, which redirects any
role other than OWNER/MANAGER to `/unauthorized`. Say explicitly that checking `OWNER_PATHS` alone
would wrongly conclude `/help` is safe for drivers.

**2d. Add `data-testid="user-menu-trigger"`** to the `DropdownMenu.Trigger` button (D7), with a
one-line comment saying why a role/text locator is not usable (two mount lanes in `owner-shell.tsx`,
and `compactOnMobile` hides the accessible name below 640px).

**2e. Do NOT delete the `/profile` link** (D6). Instead add a brief comment marking it as a known
dead link with no route, no rewrite and no redirect — pending a product decision — so the next
reader does not have to rediscover it.

**2f. Produce the full audit table** for the summary (all five items, not just the two known):
`/profile`, `/settings/my-notifications`, `/settings/notifications`, `/help`, Sign out — each with
its gating decision, the mechanism enforcing it, and its reachability for DRIVER / MANAGER / OWNER /
SYSTEM_ADMIN. Verify `/profile`'s 404 **empirically** with a real request against the dev server
(e.g. `curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/profile` while signed out gives
a redirect; check it signed-in in the browser too) — a `find` that returns nothing is suggestive,
an HTTP status is evidence.
  </action>
  <verify>
1. With the dev server running, sign in as `driver@test.com / TestPass123!` in a real browser, open
   the user menu: Profile and My Notifications present; Settings and Help & Support ABSENT.
2. Sign in as `demo@drivecommand.com / demo1234`, open the menu: all four present.
3. Confirm the `/profile` 404 status and record it.
4. If a file swap or branch operation happened first, stop `next dev`, delete `apps/web/.next`,
   restart before believing any red browser result — a stale Turbopack bundle before a regression.
  </verify>
  <done>
A DRIVER's menu offers no link that bounces them; an OWNER's menu is unchanged; the gate reads
`PORTAL_ROLES.owner` once; both blocking mechanisms are named in a comment; the five-link audit
table exists with an HTTP status behind the `/profile` claim.
  </done>
</task>

<task type="auto">
  <name>Task 3: Write the gating spec, prove it red, and run quick-575's blocked specs</name>
  <files>apps/web/e2e/settings/user-menu-gating.spec.ts</files>
  <action>
**3a. New spec** at `e2e/settings/user-menu-gating.spec.ts`, mirroring the header style of
`my-notifications-reachability.spec.ts` (why it exists, what each test proves, what would make it
fail). Two describes:

- DRIVER session (`test.use({ storageState: .playwright/auth/driver.json })`): navigate to a driver
  page that mounts the menu — `(driver)/layout.tsx` mounts it on every driver page, `/my-route` is
  what the existing driver specs use. Open the menu via
  `page.locator('[data-testid="user-menu-trigger"]:visible')` (D7 — `:visible` disambiguates the two
  mount lanes). Then read the hrefs with a CSS query scoped to the open menu:
  `document.querySelectorAll('[role="menu"] a')`. Assert `/settings/my-notifications` and `/profile`
  are PRESENT and `/settings/notifications` and `/help` are ABSENT.
- OWNER session (`owner.json`): navigate to `/carrier/dashboard` (what
  `e2e/owner/navigation-reachability.spec.ts` uses), open the menu, assert all four hrefs present.

Rules this spec must obey:
- **Positive AND negative in the same describe** (quick-563/566). A bare absence assertion passes
  identically if the menu failed to open at all — so every absence assertion must be accompanied by
  an assertion that the menu DID open and DOES contain the ungated links. Without that counter-
  assertion the test proves nothing.
- Scope the query to `[role="menu"]`, never `document.querySelectorAll('a')` — an unrelated in-page
  link would satisfy or break it (quick-566).
- Use exact href matching, not `toContainText`, so a substring cannot make `/settings/notifications`
  look present because `/settings/my-notifications` is.
- Call `requireRoleAuth('driver')` / `requireRoleAuth('owner')` from Task 1 in a `beforeAll`, so a
  broken account reports "driver@test.com failed with 401" instead of an ENOENT on a JSON path.
- No `.skip`, anywhere, for any reason.

**3b. PROVE IT RED — by doing it, not by reasoning.** Temporarily remove the gate from
`user-menu.tsx` (render both items unconditionally), re-run the spec, and record the actual failure
output in the summary. Then restore the gate and re-run green. A gating spec that has never been
observed failing is not a guard. Also run the OWNER half against the gated build to confirm the gate
did not over-fire and strip an owner's links.

**3c. Run quick-575's four reachability specs**, which have been blocked since they were written:
`npx playwright test e2e/settings/my-notifications-reachability.spec.ts --reporter=list`. Report the
result for each of the four (DRIVER positive, MANAGER pin, OWNER pin, DRIVER negative). Note the
OWNER pin runs as `demo@drivecommand.com` in the `DriveCommand Demo` tenant per D3 — if it fails for
a tenant-data reason rather than a routing reason, say so explicitly and do not report it as a
routing regression.

**3d. State the headline answer the brief asks for**: whether quick-575's specs can now execute.
Per Part A they can, so "written but unexecuted" is not an acceptable outcome unless something NEW
blocks them — and if something does, name it precisely.
  </action>
  <verify>
`npx playwright test e2e/settings/ --reporter=list` from `apps/web` with a dev server running.
Both new gating tests pass in the `chromium` and `mobile` projects (the spec must be viewport-
agnostic — that is what the testid buys). The red-proof run is captured verbatim. The four
quick-575 tests have a stated per-test result.
  </verify>
  <done>
The gating spec exists, has been executed, has been observed FAILING with the gate removed and
PASSING with it restored, and quick-575's specs have real results rather than a status note.
  </done>
</task>

<task type="auto">
  <name>Task 4: Verification gates — probed tsc, next build, Vitest against the baseline</name>
  <files>apps/web/src/components/navigation/user-menu.tsx</files>
  <action>
**4a. tsc, PROBED — the gate is blind until proven otherwise.** Run `npx tsc --noEmit` in
`apps/web`. If the only errors are syntax errors, or all errors sit in files this task did not touch
(especially anything under `.next/`), the gate is BLIND, not green: delete
`apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, then re-run. Then prove
it is live — inject `const __probe576: number = 'x'` into `user-menu.tsx` (a file actually edited),
confirm tsc reports THAT error at THAT location, delete the probe, and re-run to a clean 0. Baseline
is 0 errors and it is a hard gate. Check `src/lib/document-import/` and the tree generally for a
leftover `__probe*.ts` from an earlier task before finishing.

**4b. `next build`.** tsc is necessary and not sufficient — it is blind to Tailwind classes, CSS and
fonts. Run the build and confirm it succeeds.

**4c. Full Vitest suite, same reporter both sides.** Baseline is **1806 / 1679 / 63 / 61 / 3**.
- `--reporter=basic` does not exist in vitest 4 and exits 0 having run ZERO tests. A run whose
  output carries no `Test Files … | Tests …` summary is not a green run — read the counts.
- Measure the baseline in the MAIN tree, via `git stash` or `git checkout <rev> -- <touched files>`,
  never a worktree: `.env.local` is untracked and gitignored, so a worktree measures a different
  thing (quick-567).
- Measure AFTER the last edit of the task, not before it (quick-561) — this task's own new files
  must be inside the number it publishes.
- Do not edit files while a run is in flight (quick-565).
This task touches only e2e files plus one client component, so the expectation is an unchanged
Vitest count. Any delta must be explained, not absorbed.

**4d. Do not push.** Commit only. The user pushes and deploys themselves.
  </action>
  <verify>
tsc reports 0 errors AND the injected probe was observed being reported and then removed;
`next build` succeeds; Vitest matches 1806 / 1679 / 63 / 61 / 3 or every difference is accounted
for by name.
  </verify>
  <done>
All three gates pass, the tsc gate is demonstrably live rather than assumed, and the Vitest numbers
were measured with the same reporter on both sides.
  </done>
</task>

</tasks>

<verification>
- `driver@test.com` and `manager@test.com` authenticate with `TestPass123!`; nothing was provisioned.
- Setting a wrong driver password leaves an OWNER spec executing rather than skipped.
- The sysadmin block's unset env vars no longer take the suite down.
- A DRIVER's user menu shows Profile + My Notifications only; an OWNER's shows all four.
- The gating spec was observed RED with the gate removed and GREEN with it restored.
- quick-575's four reachability specs have per-test results.
- tsc 0 with a probe that was seen firing; `next build` green; Vitest 1806 / 1679 / 63 / 61 / 3.
- `middleware.ts`, `route-access.ts`, `src/emails/**`, the dispatcher, `prisma/schema.prisma` and
  `playwright.config.ts` are untouched — confirm with `git status` / `git diff --stat`.
- No `.skip` was added anywhere.
</verification>

<success_criteria>
The Playwright suite is usable again: a broken account costs its own specs and nothing else. A
driver is no longer offered two links that bounce them. The gating is pinned by a spec that has been
proven to fail when the gate is removed. The summary carries the Part A findings table, the explicit
401 mechanism (wrong password invented by quick-575, not an outage), the five-link gating audit
including the `/profile` 404, and a plain statement that quick-575's specs now execute.
</success_criteria>

<output>
After completion, create
`.planning/quick/576-restore-qa-test-account-auth-diagnosis-r/576-SUMMARY.md`.

It must contain, in this order:
1. The Part A findings table and a one-sentence statement of the 401 mechanism.
2. The full five-link user-menu gating audit (link · gating decision · enforcing mechanism ·
   reachability per role), with the `/profile` 404 called out at the top as a follow-up.
3. The restructured `auth.setup.ts` design and the verbatim isolation proof (wrong-password driver,
   owner spec still executing).
4. The new gating spec and its verbatim RED output with the gate removed.
5. A clear statement of whether quick-575's four reachability specs now execute, with per-test
   results.
6. The verification numbers: tsc (with probe confirmation), `next build`, Vitest before/after.
7. Anything reported but not fixed — at minimum the `/profile` dead link and the driver/owner
   cross-tenant split from D3.
</output>
</content>
</invoke>
