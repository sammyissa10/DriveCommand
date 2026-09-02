---
phase: quick-575
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/src/lib/auth/route-access.ts
  - apps/web/src/middleware.ts
  - apps/web/tests/unit/auth/route-access.test.ts
  - apps/web/e2e/auth.setup.ts
  - apps/web/e2e/settings/my-notifications-reachability.spec.ts
  - apps/web/src/lib/email/html-to-text.ts
  - apps/web/src/lib/email/__tests__/html-to-text-wrap.test.ts

must_haves:
  truths:
    - "An authenticated DRIVER requesting /settings/my-notifications renders the preferences screen instead of being redirected to /home"
    - "An authenticated DRIVER requesting /settings/notifications is still redirected to /home"
    - "A MANAGER and an OWNER still reach /settings/my-notifications (regression pin, not a fix)"
    - "MANAGER is still blocked from /settings/team-permissions"
    - "The plain-text email footer never separates the 'Notification preferences' label from its URL, at any base-URL length"
    - "A long ordinary sentence still wraps at 78 columns"
    - "The Vitest suite fails if /settings/my-notifications is returned to driver-blocked classification"
  artifacts:
    - path: "apps/web/src/lib/auth/route-access.ts"
      provides: "Pure, exported path classification: OWNER_PATHS, OWNER_ONLY_PATHS, ANY_AUTHENTICATED_PATHS, isDriverBlockedPath, isManagerBlockedPath"
      exports: ["OWNER_PATHS", "OWNER_ONLY_PATHS", "ANY_AUTHENTICATED_PATHS", "isDriverBlockedPath", "isManagerBlockedPath"]
    - path: "apps/web/tests/unit/auth/route-access.test.ts"
      provides: "Role x path matrix + source scan of middleware.ts with counter-assertion"
    - path: "apps/web/e2e/settings/my-notifications-reachability.spec.ts"
      provides: "3 positive DOM reachability specs (driver/manager/owner) + 1 negative (driver -> /settings/notifications redirects)"
    - path: "apps/web/src/lib/email/__tests__/html-to-text-wrap.test.ts"
      provides: "label-and-URL cohesion tests across three base-URL lengths + bare URL + wrapping-still-works"
  key_links:
    - from: "apps/web/src/middleware.ts"
      to: "apps/web/src/lib/auth/route-access.ts"
      via: "import { isDriverBlockedPath, isManagerBlockedPath }"
      pattern: "isDriverBlockedPath"
    - from: "apps/web/src/app/(shared)/settings/my-notifications/page.tsx"
      to: "apps/web/src/app/(owner)/actions/my-notifications.ts"
      via: "getMyPreferences() — session-scoped, no userId parameter"
      pattern: "getMyPreferences"
---

<objective>
Make `/settings/my-notifications` reachable by every authenticated role (DRIVER, MANAGER, OWNER)
without widening access to any other route, and fix the plain-text email footer so the
"Notification preferences" label is never orphaned from its URL.

Purpose: quick-574 shipped a footer link and a `List-Unsubscribe` header pointing at a route that
redirects DRIVERs — the highest-volume recipient class — to `/home`. The link is broken for most
recipients today. This is a live defect against paying customers.

Output: one route reclassification behind a pure, unit-testable classifier; four DOM reachability
specs; a general wrap fix in `html-to-text.ts`; and a verified clean tsc / next build / Vitest run.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

apps/web/src/middleware.ts
apps/web/src/lib/email/html-to-text.ts
apps/web/src/emails/_system/Footer.tsx
apps/web/e2e/auth.setup.ts
apps/web/e2e/owner/navigation-reachability.spec.ts
apps/web/src/app/(shared)/layout.tsx
apps/web/src/app/(shared)/settings/my-notifications/page.tsx
apps/web/src/app/(owner)/actions/my-notifications.ts
</context>

<established_findings>
These were verified against real source by the orchestrator AND re-verified while writing this plan.
Do NOT re-derive them. DO re-read every file before you edit it.

**A. The guard is `apps/web/src/middleware.ts`.** Three prefix arrays matched with `startsWith`:
`PUBLIC_PATHS` (line 47, unauthenticated bypass), `OWNER_PATHS` (line 70, 20 entries),
`OWNER_ONLY_PATHS` (line 94, `['/settings/team-permissions', '/subscription']`), plus an inline
`ADMIN_ALLOWED_PATHS` const at line 154. The DRIVER guard, lines 162-165 verbatim:

```ts
  // Driver guard: redirect DRIVER role away from owner-only paths
  if (appMeta.role === 'DRIVER' && OWNER_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/home', request.url));
  }
```

**B. THE KEY STRUCTURAL FACT — there is no line to delete.** `/settings/my-notifications` is not an
entry in `OWNER_PATHS`. The entry is the bare prefix `'/settings'` (line 79). The brief's "move it
out of OWNER_PATHS" must therefore be implemented as an EXCEPTION list evaluated BEFORE the DRIVER
guard. There is no existing any-authenticated-role list: `PUBLIC_PATHS` is unauthenticated,
`OWNER_ONLY_PATHS` is manager-blocked, `ADMIN_ALLOWED_PATHS` is sysadmin. A fourth prefix array is
required. It is the SAME mechanism (a prefix array consumed by the existing role guard), NOT a new
auth mechanism, so the "do not add a new auth mechanism" constraint holds.

**C. The page and layout are ALREADY driver-safe — no restructure, the stop-and-report clause does
not fire.** `src/app/(shared)/layout.tsx` is nine lines: `getSession()`, `redirect('/sign-in')` if
absent, `return <>{children}</>`. No role check, no owner shell.
`src/app/(shared)/settings/my-notifications/page.tsx` is `export const dynamic = 'force-dynamic'`,
`getMyPreferences()`, and `<PreferencesForm>` inside a plain `container mx-auto py-8` div. No
`requireRole`, no sidebar, no owner nav. `(shared)` is a sibling route group to `(owner)`; the
tenant-level page is `(owner)/settings/notifications/` — different leaf segment, no collision.

**D. Data access is already session-scoped.** `src/app/(owner)/actions/my-notifications.ts` exports
`getMyPreferences()`, `updateMyPreference(triggerKey, field, value)` and
`updateMySubscription(triggerKey, subscribed)`. **None takes a userId parameter.** All three call
`requireAuth()` then `getSession()` and use `session.userId` / `session.tenantId`; both writers
return `{success:false}` when `!session.tenantId`. The file lives under `(owner)/actions/`, which is
a directory name and not a route (no `page.tsx`), so middleware never sees that path; server-action
POSTs go to the rendering page's URL — `/settings/my-notifications` — which this fix unblocks.

**E. MANAGER already passes.** `PERMISSION_GATED_PATHS` (`src/lib/auth/permissions.ts`) has no
`/settings` entry, and `/settings/my-notifications` is not in `OWNER_ONLY_PATHS`. The manager spec is
a REGRESSION PIN, not a fix. Do not claim to have fixed manager access.

**F. The footer wrap defect is REAL but domain-length dependent.** `WRAP_COLUMN = 78`; `hardWrap` is
a greedy space-delimited fill that never breaks a long token. Step 4 of `htmlToPlainText` flattens
every anchor to `` `${text} (${href})` ``. `Footer.tsx` renders the preferences anchor then `' · '`
then a support mailto (`mailto:team@drivecommand.io`). Driven through the real `hardWrap`:

```
BASE=https://drivecommand.app          -> label+URL survive on one line at 77 chars (2 to spare)
BASE=https://drive-command.vercel.app  -> |Notification preferences| ORPHANED on its own line,
                                          URL starts the next line
BASE=http://localhost:3000             -> label+URL together at 76 chars
```

State this honestly in the summary: on today's production domain it survives by two characters; on
the Vercel preview domain the label is already orphaned. It is a latent defect that fires on a
longer base URL, not one currently firing on prod. `hardWrap`'s own doc comment already argues the
fix direction — it never breaks a long token because "a URL must stay clickable, so an over-long
line is the lesser evil". Keeping a `label (url)` pair together is that same policy one token wider.

**G. Test infrastructure.** Playwright: `apps/web/playwright.config.ts`, `testDir: './e2e'`,
projects `setup` -> `chromium` + `mobile`, `baseURL` from `PLAYWRIGHT_BASE_URL || http://localhost:3000`.
Specs declare their own `test.use({ storageState })`. `e2e/auth.setup.ts` authenticates owner,
sysadmin and driver via `POST /api/auth/login` and writes `.playwright/auth/{owner,sysadmin,driver}.json`.
**There is NO manager setup** — one must be added following the identical pattern. House precedent
for a positive+negative DOM reachability spec: `e2e/owner/navigation-reachability.spec.ts`.
Vitest unit tests live in `src/**/__tests__/`, `src/__tests__/` and `tests/{unit,security,carrier,isolation}/`;
`tests/unit/auth/` already holds `require-auth.test.ts` and `require-role.test.ts`.
</established_findings>

<tasks>

<task type="auto">
  <name>Task 1: Extract path classification into a pure module and let any authenticated role reach /settings/my-notifications</name>
  <files>
apps/web/src/lib/auth/route-access.ts (new)
apps/web/src/middleware.ts
apps/web/tests/unit/auth/route-access.test.ts (new)
  </files>
  <action>
Re-read `apps/web/src/middleware.ts` before editing.

**1. Create `apps/web/src/lib/auth/route-access.ts`** — pure, no imports from `next/server`, no I/O,
so it is importable by a Vitest unit test with no server and no mocking. Move `OWNER_PATHS` and
`OWNER_ONLY_PATHS` here verbatim (same entries, same order) and export them. Add:

```ts
/**
 * Paths any AUTHENTICATED user reaches regardless of role.
 *
 * Distinct from PUBLIC_PATHS, which is the UNAUTHENTICATED bypass and lives in
 * middleware.ts. A path listed here still requires a session; it is exempt only
 * from the DRIVER role guard.
 *
 * quick-575: `/settings/my-notifications` is a per-user screen reached from the
 * "Notification preferences" link in every email footer and from the
 * List-Unsubscribe header (quick-574). It is NOT an OWNER_PATHS entry to delete —
 * the entry is the bare prefix '/settings', so an exception list is the only way
 * to carve one leaf out of it.
 *
 * ONE ENTRY. Adding a second is widening a route's access and needs its own task.
 */
export const ANY_AUTHENTICATED_PATHS = ['/settings/my-notifications'];

export function isAnyAuthenticatedPath(pathname: string): boolean;
export function isDriverBlockedPath(pathname: string): boolean;
export function isManagerBlockedPath(pathname: string): boolean;
```

- `isDriverBlockedPath(p)` = `!isAnyAuthenticatedPath(p) && OWNER_PATHS.some(x => p.startsWith(x))`.
  The exception is checked FIRST so it cannot be shadowed by the bare `/settings` prefix.
- `isManagerBlockedPath(p)` = a straight `OWNER_ONLY_PATHS.some(x => p.startsWith(x))`, deliberately
  WITHOUT the exception. Comment why: applying the exception here would be a second widening
  mechanism for a case that does not exist today (`/settings/my-notifications` is not in
  `OWNER_ONLY_PATHS`), and the constraint is that exactly one route changes. If a future path is
  ever in both lists, OWNER_ONLY must win.

**2. Rewrite the two guards in `middleware.ts`** to call the imported functions. The DRIVER guard
becomes `if (appMeta.role === 'DRIVER' && isDriverBlockedPath(pathname))`; the MANAGER
owner-only check becomes `if (isManagerBlockedPath(pathname))`. Delete the now-moved array literals
from `middleware.ts`. Change NOTHING else: `PUBLIC_PATHS`, `isPublicPath`, `ADMIN_ALLOWED_PATHS`,
the CSRF block, the `PERMISSION_GATED_PATHS` branch, the tenant-header injection and the `config`
matcher are all untouched.

**3. Audit and confirm (expected: no code change).** Re-read `(shared)/layout.tsx`,
`(shared)/settings/my-notifications/page.tsx`, `preferences-form.tsx` and
`(owner)/actions/my-notifications.ts`. Confirm findings C and D still hold on the real files. If any
owner-only assumption exists that the findings missed, fix it here and say so. Confirm no action
takes a `userId` argument. **Explicitly state in the summary** that `my-notifications.ts` was left
under `(owner)/actions/` — a directory name, not a route — rather than relocated, because the brief
does not ask for it and moving it is import churn with no behavioural effect.

**4. Write `apps/web/tests/unit/auth/route-access.test.ts`** with two parts.

Part A — the classification matrix, driving the real exported functions:

| pathname | DRIVER blocked | MANAGER owner-only blocked |
|---|---|---|
| `/settings/my-notifications` | **false** | false |
| `/settings/notifications` | **true** | false |
| `/settings/team-permissions` | true | **true** |
| `/settings/account` | true | false |
| `/settings` | true | false |
| `/carrier/dashboard` | true | false |
| `/home` | false | false |
| `/subscription` | true | true |

Assert both directions explicitly — a suite that only asserts `false` for the new route passes
identically if the whole guard is deleted.

Part B — a narrow source scan of `middleware.ts`, following the quick-546/549 rules:
- Read the file from disk and **normalise line endings** (`.replace(/\r\n/g, '\n')`). This repo is
  `core.autocrlf=true` with no `.gitattributes`; a source-reading test that skips this passes
  vacuously on Windows.
- Assert the read succeeded: file length > 3000 characters (a "was it actually found" floor).
- Assert `middleware.ts` imports and calls `isDriverBlockedPath`.
- Assert `middleware.ts` contains no inline `OWNER_PATHS.some(` — i.e. the classifier was not
  re-inlined.
- **Counter-assertion** so the scan cannot be satisfied by deleting the guard wholesale: assert the
  file still contains both `role === 'DRIVER'` and `new URL('/home'`.

Add a header comment naming quick-575 and stating that this file FAILS if
`/settings/my-notifications` is returned to driver-blocked classification — that is the contract the
brief's step 5 asks for in a form that runs in the standing suite with no server.
  </action>
  <verify>
`npx vitest run tests/unit/auth/route-access.test.ts` in `apps/web` — all pass, and the summary line
shows a non-zero `Tests` count. Then temporarily set `ANY_AUTHENTICATED_PATHS = []`, re-run, and
confirm the suite goes RED; restore. Prove the guard red rather than reasoning about it.
  </verify>
  <done>
`route-access.ts` exists and is pure; `middleware.ts` imports from it and holds no path arrays other
than `PUBLIC_PATHS` and the inline `ADMIN_ALLOWED_PATHS`; the matrix and source-scan tests pass and
were demonstrated to fail when the exception list is emptied.
  </done>
</task>

<task type="auto">
  <name>Task 2: Manager auth setup + four DOM reachability specs</name>
  <files>
apps/web/e2e/auth.setup.ts
apps/web/e2e/settings/my-notifications-reachability.spec.ts (new)
  </files>
  <action>
Re-read `e2e/auth.setup.ts` and `e2e/owner/navigation-reachability.spec.ts` first — match the latter's
tone and structure (a header explaining WHY the spec exists, and assertions scoped so they cannot
pass vacuously).

**1. Add a manager setup block to `e2e/auth.setup.ts`**, copying the existing driver block exactly:
`POST /api/auth/login` with `process.env.TEST_MANAGER_EMAIL ?? 'manager@test.com'` /
`process.env.TEST_MANAGER_PASSWORD ?? 'manager1234'`, expect 200, write
`.playwright/auth/manager.json`. Also give the DRIVER block the default `'driver@test.com'` /
`'driver1234'` (it currently uses `process.env.TEST_DRIVER_EMAIL!` with no default). **Do NOT change
the owner default** — it is `demo@drivecommand.com` / `demo1234` and other specs depend on it.
Update the env-var doc comment at the top of the file to list the manager vars. Verify
`playwright.config.ts` needs no change (the `setup` project globs the whole setup file, so the new
block runs automatically) and say so.

**2. Create `e2e/settings/my-notifications-reachability.spec.ts`** with four tests, using
`test.describe` blocks each carrying their own `test.use({ storageState })`:

Positive, once per role (driver, manager, owner):
- `page.goto('/settings/my-notifications')`
- assert `page.url()` still ends `/settings/my-notifications` — **no redirect occurred**. Assert the
  URL does NOT contain `/home` or `/sign-in`.
- assert the preferences UI actually rendered: the `My Notification Preferences` heading is visible
  AND at least one control from `preferences-form.tsx` is present. Read that component and pick a
  stable selector (a checkbox/switch role, or a trigger-key row) — do not assert on the heading
  alone, since a redirect to a page that happens to have a similar heading would satisfy it.

Negative (driver only), proving step 2 did not over-widen:
- `page.goto('/settings/notifications')` (the tenant-level page)
- assert the driver was redirected: `page.url()` contains `/home` and does NOT contain
  `/settings/notifications`.

Header comment must state:
- the driver test is the FIX (it fails today);
- the manager and owner tests are REGRESSION PINS — finding E, manager already passes, this does not
  claim to have fixed manager access;
- the negative test is what stops a future edit from widening the whole `/settings` prefix;
- and that this spec pairs with `tests/unit/auth/route-access.test.ts`, which is the deterministic
  server-free half (quick-549: row/DOM assertions and source scans catch different classes).

**3. Run the specs if — and only if — a dev server and real accounts are available.** Start
`next dev`, run `npx playwright test e2e/settings/my-notifications-reachability.spec.ts`. If the
manager/driver accounts do not exist in the database, the setup project will fail with a non-200
login. In that case **say plainly in the summary that the specs were written but not executed, and
name the missing accounts.** Do NOT invent passing results. Do not mark them `.skip` to make a run
look green.
  </action>
  <verify>
Either: the four tests run green against a live dev server and the output is quoted; or: the exact
login failure is quoted and the summary states the specs are written-but-unexecuted with the missing
account emails named.
  </verify>
  <done>
`auth.setup.ts` writes `.playwright/auth/manager.json`; the spec file exists with three positive and
one negative test; execution status is reported truthfully either way.
  </done>
</task>

<task type="auto">
  <name>Task 3: Keep a label and its URL on one line in the plain-text footer</name>
  <files>
apps/web/src/lib/email/html-to-text.ts
apps/web/src/lib/email/__tests__/html-to-text-wrap.test.ts (new)
  </files>
  <action>
Re-read `html-to-text.ts` first. `grep -rn "htmlToPlainText" apps/web/src apps/web/tests` before
creating the new test file, to find any existing coverage you must not duplicate or break
(`src/lib/email/__tests__/transport.test.ts` already imports it).

**Fix `hardWrap` generally.** The rule to implement: when the word that would start a new line is a
parenthesised URL belonging to the preceding label, keep it on the current line even though the line
then exceeds `WRAP_COLUMN`. Suggested predicate — the executor may choose a different one provided
it meets the constraints below: the incoming word starts with `(` and contains `://`. Consider the
bare-URL case too (step 4 of `htmlToPlainText` returns a bare `href` with no parens when the anchor
text already IS the URL) — a bare URL is a single unbreakable token and already survives, so confirm
that rather than adding a branch for it.

Hard constraints on the fix:
- **General, no hardcoded label string.** `"Notification preferences"` must not appear in
  `html-to-text.ts`. A test asserts its absence.
- **Do not disable wrapping.** Ordinary prose still wraps at 78.
- Extend the `hardWrap` doc comment to record the reason, in the file's own existing vocabulary: the
  function already refuses to break a long token because "a URL must stay clickable, so an over-long
  line is the lesser evil"; keeping a `label (url)` pair together is that policy applied one token
  wider, because a label orphaned from its destination is a link the recipient cannot act on.

**Write `src/lib/email/__tests__/html-to-text-wrap.test.ts`**, driving the REAL `htmlToPlainText`
(not a reimplementation of `hardWrap`) over footer-shaped HTML:

1. For each of the three base URLs — `https://drivecommand.app`, `https://drive-command.vercel.app`
   (the case that is orphaned today), `http://localhost:3000` — build the footer anchor pair
   (`<a href="{BASE}/settings/my-notifications">Notification preferences</a> · <a href="mailto:team@drivecommand.io">Support</a>`),
   run it through `htmlToPlainText`, split on `\n`, and assert that the line containing
   `Notification preferences` **also contains** `/settings/my-notifications`. Do not assert exact
   line lengths — they are domain-dependent and would pin the test to today's domain.
2. A very long base URL well past 78 characters, to prove the fix does not depend on the pair
   happening to fit.
3. The bare-URL case: an anchor whose text equals its href — assert the URL is emitted once, intact,
   and not doubled.
4. **Wrapping still works**: a single long ordinary sentence with no links produces multiple lines,
   each `<= 78` characters. Without this the fix could silently become "never wrap".
5. Assert `html-to-text.ts` source contains no `Notification preferences` literal (read from disk,
   normalise CRLF, assert file length > 1000 first — the quick-546 "was it actually found" floor).

Before writing the fix, run the new tests against the UNCHANGED file and confirm cases 1
(vercel.app) and 2 are RED. A wrap fix that was green before it was written is a fix for nothing.
  </action>
  <verify>
`npx vitest run src/lib/email/` in `apps/web` — the new file and the existing `transport.test.ts`
both pass, and the `Test Files … | Tests …` summary shows non-zero counts. Quote the pre-fix red run
for the vercel.app case.
  </verify>
  <done>
`hardWrap` keeps a parenthesised URL with its label at any base-URL length; ordinary prose still
wraps at 78; no label string is hardcoded; the tests were demonstrated red before the fix.
  </done>
</task>

<task type="auto">
  <name>Task 4: Full verification gate — probed tsc, next build, before/after Vitest</name>
  <files>
(no source changes expected; fix anything the gate surfaces)
  </files>
  <action>
Stop any running `next dev` before doing anything here (CLAUDE.md — a live dev server poisons the
Turbopack cache across file changes).

**1. `npx tsc --noEmit` in `apps/web`, WITH A PROBE.** Inject `const __probe575: number = 'x';` into
a file this task actually edited (`src/lib/auth/route-access.ts` is the natural choice), run tsc, and
confirm it reports THAT error. Then delete the probe and re-run to clean. Per CLAUDE.md: if the only
errors reported are syntax errors, or are all in files you did not touch, **the gate is blind, not
green** — delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and
re-run. Grep for stray `__probe*` files afterwards; a previous task left one behind.

**2. `next build` in `apps/web`.** tsc alone does not catch Turbopack module-resolution errors, and
this task moved a module (`route-access.ts`) that `middleware.ts` now imports — middleware runs in
the Edge runtime, so an import that type-checks can still fail to bundle. This step is the one that
proves the extraction is real.

**3. Full Vitest suite, before and after, with the SAME reporter.** Rules that have burned three
consecutive tasks:
- `--reporter=basic` does not exist in vitest 4: it exits 0 having run ZERO tests.
- `--silent` and `--reporter=json` disagree by ±4 on this suite — so measure both sides with one
  reporter or the delta means nothing.
- A run whose output has no `Test Files … | Tests …` counts is **not a green run**.
- Do NOT start a baseline run and then edit files while it is running.
- For the baseline, restore this task's touched files in the MAIN tree
  (`git stash` or `git checkout HEAD -- <files>`), measure, then restore your work. Do **not** use a
  `git worktree`: it does not carry the untracked `apps/web/.env.local`, which skews DB-dependent
  tests and produces a baseline that reads as a regression (quick-567).

The quick-574 published baseline is **1777 files / 1650 passed / 63 skipped / 61 pending**. Treat it
as a reference to re-measure against, never as truth. Report before and after side by side, and
account for every moved test: the expected delta is exactly the tests added by tasks 1 and 3. Any
other movement is a regression and must be explained or fixed.

**4. Confirm the security claim the brief asks for as explicit output:** re-read
`(owner)/actions/my-notifications.ts` one final time and state, with the line evidence, that all
three server actions derive `userId` from `getSession()` and never from an argument — so a driver
session cannot read or write another user's `UserNotificationPreference` rows.
  </action>
  <verify>
Quoted output of: the probed tsc run (error present), the clean tsc run (0 errors), a successful
`next build`, and the before/after Vitest summary lines with the delta accounted for.
  </verify>
  <done>
tsc is clean AND was proven non-blind by a probe; `next build` succeeds; the Vitest delta equals the
tests this task added, with no other movement; the session-scoping claim is stated with evidence.
  </done>
</task>

</tasks>

<verification>
- `/settings/my-notifications` is the ONLY route whose access changed. `git diff` on
  `route-access.ts` shows `OWNER_PATHS` and `OWNER_ONLY_PATHS` carried across verbatim, with
  `ANY_AUTHENTICATED_PATHS` holding exactly one entry.
- `tests/unit/auth/route-access.test.ts` goes red when `ANY_AUTHENTICATED_PATHS` is emptied
  (demonstrated, not reasoned about).
- A DRIVER is still redirected from `/settings/notifications` and `/settings/account`; a MANAGER is
  still redirected from `/settings/team-permissions`.
- `html-to-text.ts` contains no `Notification preferences` literal, and ordinary prose still wraps
  at 78.
- No file under `src/emails/**`, the notification dispatcher, `sender-config.ts`,
  `prisma/schema.prisma`, or any settings route other than `(shared)/settings/my-notifications/`
  appears in the diff. `html-to-text.ts` IS in scope — step 7 of the brief overrides the do-not-touch
  line for that one file only.
</verification>

<success_criteria>
- A DRIVER following the email footer's "Notification preferences" link reaches the preferences
  screen instead of `/home`.
- Access to every other route is unchanged, proven by both a unit matrix and a DOM negative spec.
- The plain-text footer never orphans a label from its URL at any base-URL length.
- tsc (probed), `next build`, and the full Vitest suite are green, with the test delta accounted for.
- The summary states honestly: which specs ran vs were written-but-unexecuted; that manager access
  was already working and is only pinned; that the wrap defect is latent on today's prod domain and
  live on the Vercel preview domain; and that `my-notifications.ts` was deliberately left under
  `(owner)/actions/`.
</success_criteria>

<output>
After completion, create
`.planning/quick/575-make-settings-my-notifications-reachable/575-SUMMARY.md`,
including the quoted guard structure before and after, the single route reclassification, the
page/layout audit result, the four specs, the footer wrap fix, and the confirmation that a driver
session cannot read or write another user's preferences.
</output>
