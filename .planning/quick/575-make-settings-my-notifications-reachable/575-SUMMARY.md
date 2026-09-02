---
phase: quick-575
plan: 01
subsystem: auth-middleware, email-transport
tags: [middleware, route-access, notifications, email, plain-text, playwright, vitest]
dependency-graph:
  requires: [quick-574]
  provides: [route-access-classifier, my-notifications-reachable-for-drivers, footer-wrap-fix]
  affects: [src/middleware.ts, settings/my-notifications, email plain-text part]
tech-stack:
  added: []
  patterns: ["prefix-array exception list evaluated before the DRIVER role guard"]
key-files:
  created:
    - apps/web/src/lib/auth/route-access.ts
    - apps/web/tests/unit/auth/route-access.test.ts
    - apps/web/e2e/settings/my-notifications-reachability.spec.ts
    - apps/web/src/lib/email/__tests__/html-to-text-wrap.test.ts
  modified:
    - apps/web/src/middleware.ts
    - apps/web/e2e/auth.setup.ts
    - apps/web/src/lib/email/html-to-text.ts
decisions:
  - "ANY_AUTHENTICATED_PATHS is a fourth prefix-array mechanism (same shape as PUBLIC_PATHS/OWNER_ONLY_PATHS/ADMIN_ALLOWED_PATHS), not a new auth system"
  - "isManagerBlockedPath deliberately does NOT consult the exception list — OWNER_ONLY must win if a path is ever in both lists"
  - "hardWrap keeps a parenthesised-URL word attached to its current line unconditionally, rather than checking whether the pair happens to fit"
metrics:
  duration: "~1.5h"
  completed: "2026-09-01"
---

# Phase quick-575: Make /settings/my-notifications reachable Summary

One-liner: Carved a single any-authenticated-role exception out of the DRIVER
route guard for `/settings/my-notifications`, and fixed `hardWrap` so the
plain-text footer's "Notification preferences" label can never be orphaned
from its URL by the 78-column wrap.

## 1. The guard structure — before and after

**Before** (`apps/web/src/middleware.ts`, verified against the file at the
start of this task):

```ts
// Paths that belong to the owner portal — drivers navigating here get redirected to /home
const OWNER_PATHS = [
  '/dashboard', '/trucks', '/drivers', '/routes', '/loads', '/invoices',
  '/payroll', '/crm', '/settings', '/compliance', '/ai-documents',
  '/profit-predictor', '/lane-analytics', '/ifta', '/live-map', '/fuel',
  '/safety', '/tags', '/subscription', '/carrier',
];

// Owner-only pages — MANAGER is always blocked, redirect to /carrier/dashboard
const OWNER_ONLY_PATHS = ['/settings/team-permissions', '/subscription'];

// ...

// Driver guard: redirect DRIVER role away from owner-only paths
if (appMeta.role === 'DRIVER' && OWNER_PATHS.some((p) => pathname.startsWith(p))) {
  return NextResponse.redirect(new URL('/home', request.url));
}
```

`/settings/my-notifications` was never its own entry — it fell under the bare
`/settings` prefix in `OWNER_PATHS`, so there was no line to delete.

**After** — the arrays moved verbatim into a new pure module,
`apps/web/src/lib/auth/route-access.ts`, plus one new exception list:

```ts
// route-access.ts (new, pure, no next/server import)
export const OWNER_PATHS = [ /* same 20 entries, same order */ ];
export const OWNER_ONLY_PATHS = ['/settings/team-permissions', '/subscription'];
export const ANY_AUTHENTICATED_PATHS = ['/settings/my-notifications'];

export function isAnyAuthenticatedPath(pathname: string): boolean {
  return ANY_AUTHENTICATED_PATHS.some((p) => pathname.startsWith(p));
}

export function isDriverBlockedPath(pathname: string): boolean {
  if (isAnyAuthenticatedPath(pathname)) return false;
  return OWNER_PATHS.some((p) => pathname.startsWith(p));
}

export function isManagerBlockedPath(pathname: string): boolean {
  return OWNER_ONLY_PATHS.some((p) => pathname.startsWith(p));
}
```

`middleware.ts` now reads:

```ts
import { isDriverBlockedPath, isManagerBlockedPath } from '@/lib/auth/route-access';
// ...
if (appMeta.role === 'DRIVER' && isDriverBlockedPath(pathname)) {
  return NextResponse.redirect(new URL('/home', request.url));
}
// ...
if (isManagerBlockedPath(pathname)) {
  return NextResponse.redirect(new URL('/carrier/dashboard', request.url));
}
```

`middleware.ts` no longer holds any path array other than `PUBLIC_PATHS` and
the inline `ADMIN_ALLOWED_PATHS` (system-admin guard, untouched). The exception
is checked FIRST inside `isDriverBlockedPath`, before consulting `OWNER_PATHS`,
so it cannot be shadowed by the bare `/settings` prefix.
`isManagerBlockedPath` deliberately does **not** consult the exception list —
`/settings/my-notifications` was never in `OWNER_ONLY_PATHS`, so applying the
exception there would be a second widening mechanism for a case that does not
exist. If a future path is ever in both lists, `OWNER_ONLY` must win.

## 2. The single route reclassification — exact diff shape

```
git diff --stat 5bc73f93 HEAD -- apps/web
 apps/web/e2e/auth.setup.ts                                     |  33 ++--
 apps/web/e2e/settings/my-notifications-reachability.spec.ts    | 108 ++++++++
 apps/web/src/lib/auth/route-access.ts                          |  79 +++++++
 apps/web/src/lib/email/__tests__/html-to-text-wrap.test.ts     | 103 +++++++++
 apps/web/src/lib/email/html-to-text.ts                         |  21 ++
 apps/web/src/middleware.ts                                     |  32 +-----
 apps/web/tests/unit/auth/route-access.test.ts                  |  95 ++++++++
 7 files changed, 436 insertions(+), 35 deletions(-)
```

`OWNER_PATHS` and `OWNER_ONLY_PATHS` are carried across **verbatim** — same 20
and 2 entries, same order — confirmed by the passing regression matrix (below).
`ANY_AUTHENTICATED_PATHS` holds exactly one entry:
`['/settings/my-notifications']`. No other route's classification changed.
No file under `src/emails/**`, the notification dispatcher, `sender-config.ts`,
`prisma/schema.prisma`, or any other settings route appears in the diff.

## 3. Page/layout audit — no code change needed

Re-read at the start of this task, confirming established findings C and D
still hold on the real files:

- `apps/web/src/app/(shared)/layout.tsx` (9 lines): `getSession()` →
  `redirect('/sign-in')` if absent → `return <>{children}</>`. No role check,
  no owner-only shell, no sidebar.
- `apps/web/src/app/(shared)/settings/my-notifications/page.tsx`: `export const
  dynamic = 'force-dynamic'`, calls `getMyPreferences()`, renders
  `<PreferencesForm>` inside a plain `container mx-auto py-8` div. No
  `requireRole`, no owner nav.
- `preferences-form.tsx` is a client component driven entirely by the rows it
  is handed as props; it contains no role branching.

**No page or layout change was required.** The screen was already
driver-safe; the only thing standing between a driver and this screen was the
middleware guard fixed in section 1.

`apps/web/src/app/(owner)/actions/my-notifications.ts` was deliberately **left
under `(owner)/actions/`** rather than relocated. That is a directory name,
not a route — there is no `page.tsx` there, so middleware never sees that
path; a server-action `POST` targets the rendering page's own URL,
`/settings/my-notifications`, which this task unblocks. Relocating the file
would be import churn (used by one client component, `preferences-form.tsx`)
with no behavioral effect, and the brief does not ask for it.

## 4. A driver session cannot read or write another user's preferences

All three server actions in `apps/web/src/app/(owner)/actions/my-notifications.ts`
call `requireAuth()` then `getSession()` and derive `userId`/`tenantId` from
the **session**, never from a caller-supplied argument:

- `getMyPreferences()` — no parameters at all. Reads:
  ```ts
  const preferences = await prisma.userNotificationPreference.findMany({
    where: { userId: session.userId },
  });
  ```
  and, for subscriptions:
  ```ts
  await prisma.notificationSubscription.findMany({
    where: { tenantId: session.tenantId, userId: session.userId },
    select: { triggerKey: true },
  });
  ```

- `updateMyPreference(triggerKey, field, value)` — takes only `triggerKey`,
  `field` and `value`. The upsert key is `userId_triggerKey: { userId, triggerKey }`
  where `const userId = session.userId;` — the caller cannot name a different
  user's row because there is no such parameter to supply.

- `updateMySubscription(triggerKey, subscribed)` — same shape:
  `tenantId_triggerKey_userId: { tenantId, triggerKey, userId }` with both
  `tenantId` and `userId` taken from `session`, never from the argument list.

Because none of the three actions accepts an identity argument, a driver's
session can only ever read or mutate rows keyed to `session.userId` /
`session.tenantId` — there is no code path by which one authenticated user's
request can address another user's `UserNotificationPreference` or
`NotificationSubscription` row. This was true before this task and is
unchanged by it; the only thing this task changed is whether the middleware
lets a DRIVER session *reach* the page that calls these actions.

## 5. The four specs — written and PARTIALLY EXECUTED (setup blocked)

`apps/web/e2e/settings/my-notifications-reachability.spec.ts` — 4 tests:

- **DRIVER positive** — `/settings/my-notifications` renders, no redirect.
  This is **the fix**; it fails against pre-575 middleware.
- **MANAGER positive** — same assertion. **Regression pin, not a fix** —
  Finding E (`PERMISSION_GATED_PATHS` has no `/settings` entry, and this path
  was never in `OWNER_ONLY_PATHS`) means a MANAGER already reached this screen
  before this task touched anything.
- **OWNER positive** — same assertion. Also a regression pin.
- **DRIVER negative** — `/settings/notifications` (tenant-level) still
  redirects a driver to `/home`. Proves this task did not widen the whole
  `/settings` prefix.

`apps/web/e2e/auth.setup.ts` gained a manager block
(`.playwright/auth/manager.json`) copying the existing driver block's shape,
and the driver block gained a default account
(`driver@test.com` / `driver1234`) matching the manager/owner pattern.
`playwright.config.ts` needed no change — the `setup` project globs the whole
setup file, so new `setup(...)` blocks run automatically.

**Execution status, stated plainly and not fabricated.** A local dev server
was started (`http://localhost:3001` — port 3000 was occupied by something
outside this task) and each login was probed directly against
`POST /api/auth/login`:

```
demo@drivecommand.com / demo1234   -> 200 (owner — succeeds)
driver@test.com / driver1234       -> 401 "Invalid email or password"
manager@test.com / manager1234     -> 401 "Invalid email or password"
(TEST_SYSADMIN_EMAIL unset)        -> 400 (schema validation — no such env var)
```

Then run for real via Playwright:

```
npx playwright test e2e/settings/my-notifications-reachability.spec.ts --project=chromium
  x [setup] authenticate as driver    (401)
  x [setup] authenticate as manager   (401)
  ok [setup] authenticate as owner    (200)
  x [setup] authenticate as sysadmin  (400)
  3 failed, 4 did not run, 1 passed (6.6s)
```

**All four reachability tests were blocked**, including the OWNER-only one —
`playwright.config.ts`'s `chromium`/`mobile` projects declare
`dependencies: ['setup']` against the whole `auth.setup.ts` file (one project,
four `setup(...)` tests), and a failure anywhere in that dependency project
skips every dependent test, not just the ones whose storageState failed to
write. This is a pre-existing property of the test harness, not something
introduced or fixed by this task, and it is reported here rather than
silently worked around (no accounts were created against the target
database, and no test was marked `.skip` to manufacture a green run).

**Missing accounts, named:** `driver@test.com` and `manager@test.com` (the
new defaults this task added) do not exist in the database this dev server
points at, and no `TEST_SYSADMIN_EMAIL`/`TEST_SYSADMIN_PASSWORD` env vars are
set. **The specs are written but unexecuted.** The deterministic half of the
same claim — `tests/unit/auth/route-access.test.ts` — **did** run and pass
(see section 7), which per quick-549's rule is a different class of evidence,
not a substitute.

## 6. Footer wrap fix — before / after, three base-URL lengths

Reproduced against the real `htmlToPlainText` with the footer's actual anchor
pair (`Notification preferences` linking to `{BASE}/settings/my-notifications`,
then `· Support`):

**Before** (pre-575 `hardWrap`):

```
BASE=https://drivecommand.app
[77] Notification preferences (https://drivecommand.app/settings/my-notifications)
[39] · Support (mailto:team@drivecommand.io)

BASE=https://drive-command.vercel.app
[24] Notification preferences                                    <- ORPHANED
[70] (https://drive-command.vercel.app/settings/my-notifications) · Support
[29] (mailto:team@drivecommand.io)

BASE=http://localhost:3000
[76] Notification preferences (http://localhost:3000/settings/my-notifications) ·
[37] Support (mailto:team@drivecommand.io)
```

**After** (this task's `hardWrap`):

```
BASE=https://drivecommand.app
[77] Notification preferences (https://drivecommand.app/settings/my-notifications)
[39] · Support (mailto:team@drivecommand.io)

BASE=https://drive-command.vercel.app
[85] Notification preferences (https://drive-command.vercel.app/settings/my-notifications)
[39] · Support (mailto:team@drivecommand.io)

BASE=http://localhost:3000
[76] Notification preferences (http://localhost:3000/settings/my-notifications) ·
[37] Support (mailto:team@drivecommand.io)
```

The production and localhost cases were already fitting by coincidence and are
unchanged. The Vercel preview case — previously orphaned across two lines — now
stays on one 85-character line, over `WRAP_COLUMN` (78) but with the label and
its URL never separated. The fix (`isParenthesisedUrl` check in `hardWrap`)
keeps a `(...://...)` word on the current line unconditionally once it is
encountered, rather than checking whether the pair happens to fit — proven
against a base URL almost 100 characters long (well past any coincidental fit)
in `html-to-text-wrap.test.ts`.

**Pre-fix RED, quoted:**

```
✗ keeps "Notification preferences" with its URL at base "https://drive-command.vercel.app"
  AssertionError: expected 'Notification preferences' to contain '/settings/my-notifications'
✗ keeps the pair together even when the base URL is far past 78 characters
  AssertionError: expected 'Notification preferences' to contain '/settings/my-notifications'
Test Files  1 failed (1)
     Tests  2 failed | 5 passed (7)
```

**Post-fix green:**

```
✓ src/lib/email/__tests__/html-to-text-wrap.test.ts (7 tests)
✓ src/lib/email/__tests__/transport.test.ts (16 tests)
Test Files  2 passed (2)
     Tests  23 passed (23)
```

No hardcoded `"Notification preferences"` literal was introduced —
`html-to-text-wrap.test.ts` asserts its absence from the source file, and the
fix (`isParenthesisedUrl`) is a structural predicate (`starts with '(' and
contains '://'`) applying to every anchor the module ever converts.

## 7. Verification gate

**Probed tsc** — injected `const __probe575: number = 'x';` into
`src/lib/auth/route-access.ts` (a file this task actually edited):

```
src/lib/auth/route-access.ts(81,7): error TS2322: Type 'string' is not assignable to type 'number'.
```

Probe deleted; grep for stray `__probe*` files found none. Clean re-run:

```
npx tsc --noEmit
(no output — 0 errors)
```

**`next build`:**

```
✓ Compiled successfully in 81s
[exited with code 0]
```
`/settings/my-notifications` and the Proxy/Middleware bundle both built
successfully — the two Turbopack warnings present (`pdfjs-dist can't be
external`, an NFT-list trace warning on `next.config.ts`) are pre-existing and
unrelated to any file this task touched.

**Vitest, same reporter (`--reporter=default`) before and after**, measured in
the main tree by checking the task's own touched files back to the pre-task
commit (`5bc73f93`, `docs(quick-574)`) rather than a `git worktree` (which
would not carry the untracked `.env.local`, per quick-567):

| | Test Files | Tests total | Passed | Failed | Skipped | Todo |
|---|---|---|---|---|---|---|
| Before (5bc73f93) | 160 (17 failed / 135 passed / 8 skipped) | 1777 | 1650 | 63 | 61 | 3 |
| After (HEAD) | 162 (17 failed / 137 passed / 8 skipped) | 1806 | 1679 | 63 | 61 | 3 |
| Delta | +2 files | +29 | +29 | 0 | 0 | 0 |

The delta is exactly the tests this task added:
`tests/unit/auth/route-access.test.ts` (22 tests) +
`src/lib/email/__tests__/html-to-text-wrap.test.ts` (7 tests) = 29. Failed
(63), skipped (61) and todo (3) counts are byte-identical before and after —
confirmed the same failing file (`stepTemplate.test.ts`, a pre-existing
tenant-isolation test failure unrelated to this task) appears in both runs.
No other movement occurred.

## Deviations from Plan

None — plan executed as written. Task 2's execution status (specs written but
blocked by the shared `auth.setup.ts` dependency-project design and missing
test accounts) was an anticipated outcome the plan explicitly asked to be
reported honestly rather than treated as a defect to silently fix.

## Not done / deferred

- The three positive reachability specs and the one negative spec in
  `my-notifications-reachability.spec.ts` were **not executed** — no
  `driver@test.com` or `manager@test.com` account exists in the database the
  local dev server points at, and no `TEST_SYSADMIN_EMAIL`/`PASSWORD` are set,
  which (given the shared single-project `auth.setup.ts` dependency) blocks
  every dependent test in the file, including the ones for accounts that do
  work (owner). Creating test accounts against the target database was judged
  out of scope for this task. The deterministic half of the same claim
  (`tests/unit/auth/route-access.test.ts`) is executed and green.
- The pre-existing gap where a single failing `setup` test blocks every
  dependent Playwright test in the project — even ones unrelated to the
  failing account — is a property of `playwright.config.ts`'s
  `dependencies: ['setup']` model against one shared `auth.setup.ts` file. Not
  fixed here; out of scope for a route-reachability task and not named in the
  brief.

## Self-Check

FOUND: apps/web/src/lib/auth/route-access.ts
FOUND: apps/web/tests/unit/auth/route-access.test.ts
FOUND: apps/web/e2e/settings/my-notifications-reachability.spec.ts
FOUND: apps/web/src/lib/email/__tests__/html-to-text-wrap.test.ts
FOUND: commit 08d63619 (feat(quick-575): make /settings/my-notifications reachable...)
FOUND: commit 8afdad4b (test(quick-575): manager auth setup + reachability specs)
FOUND: commit 86340a0b (fix(quick-575): keep a plain-text footer label glued to its URL...)

## Self-Check: PASSED

---

## 8. Orchestrator verification pass (post-execution)

Re-verified independently rather than taken from the executor's report:

- `git status` clean; four commits present (`08d63619`, `8afdad4b`, `86340a0b`, `6a2a8f45`).
- `middleware.ts` diff reviewed line by line: the ONLY behavioural change is
  `OWNER_PATHS.some(...)` → `isDriverBlockedPath(pathname)` and
  `OWNER_ONLY_PATHS.some(...)` → `isManagerBlockedPath(pathname)`. Both arrays moved
  verbatim. `PUBLIC_PATHS`, `ADMIN_ALLOWED_PATHS`, the CSRF branch, the onboarding
  branch, the sysadmin branch and the `PERMISSION_GATED_PATHS` branch are untouched.
- `npx vitest run` over the three affected files: **45/45 passed**
  (route-access 22, html-to-text-wrap 7, transport 16 — transport is the
  pre-existing suite that also imports `htmlToPlainText`, run to prove the wrap
  change did not regress it).
- `npx tsc --noEmit` **probed**: `const __probe575: number = 'x';` appended to
  `src/lib/email/unsubscribe.ts` produced exactly
  `src/lib/email/unsubscribe.ts(84,7): error TS2322` and nothing else — the gate
  is reporting semantic errors in the files this task edited, so it is not blind.
  Probe removed; clean run exits 0.

### Two findings the execution pass missed

**8a. The defect had a SECOND live entry point, not just the email footer.**
`src/components/navigation/user-menu.tsx:143` links to `/settings/my-notifications`,
and the component has **no role gating at all** (grep for `role`/`OWNER`/`DRIVER` in
that file returns only the three `href` lines). It is mounted by
`src/app/(driver)/layout.tsx`. So every driver's own account dropdown has carried a
`My Notifications` item that bounced them to `/home`. The brief framed this as a
quick-574 email-footer regression; it was in fact broken from whenever that menu item
shipped, and the footer link only made it reachable by a second route. This task fixes
both at once, because both go through the same middleware guard.

**8b. `unsubscribe.ts` documented the defect as live, and that comment is now false.**
Its header block listed two limitations on the app-level https URL, the second being
*"It sits under `OWNER_PATHS` in middleware.ts, so a DRIVER who follows it is
redirected to `/home` and never reaches a preferences screen at all."* That sentence
is what motivated this whole task, and leaving it in place would be the exact failure
mode CLAUDE.md records from quick-547/548/549/562 — a comment asserting an invariant
that no longer holds, believed by the next reader. Corrected in place: limitation 2 is
struck and replaced with a note that quick-575 closed it, naming
`ANY_AUTHENTICATED_PATHS`. Limitation 1 (the page requires a login) still stands, and
the `mailto:` entry stays listed FIRST — that ordering was always justified by
limitation 1 and by the RFC 8058 reason in the same file, not only by the DRIVER
redirect, so the ordering is unchanged. No behaviour changed; comment only.

### Still-broken link deliberately NOT fixed (out of scope, reported)

The same ungated `user-menu.tsx` also renders `/settings/notifications` — the
TENANT-level page — at line 157. A DRIVER who taps it is still redirected to `/home`,
and after this task that is *correct guard behaviour*: the brief's constraint is
"Do not widen any other route's role access. One route moves, nothing else", and the
negative spec exists specifically to prove that route still redirects. The defect is
therefore in the MENU, not the guard — an item offered to a viewer who cannot open it.
Fixing it means role-gating `user-menu.tsx`, which touches a component shared by the
admin, driver and owner shells. Left for its own task.
