# Auth guard test triage

**Investigation only.** No source, test, or configuration file was modified. No
package was installed.

- **Date:** 2026-09-09
- **Run from:** `apps/web`
- **Tree:** `b10e9020`
- **Scope:** the three auth-guard test files Phase 0's cross-tenant attack suite
  depends on. The workflow-engine, driver-pay exporter and validation-schema
  failures were not touched.

---

## Verdict up front

| File | Failing | Classification | Breaking commit | Last passed |
|---|---|---|---|---|
| `tests/unit/auth/require-auth.test.ts` | 3 of 3 | **TEST_STALE** | `de01979f` | `d209ebe3` |
| `tests/unit/auth/require-role.test.ts` | 5 of 5 | **TEST_STALE** | `de01979f` | `d209ebe3` |
| `tests/unit/auth/validate-mobile-token.test.ts` | 2 of 6 | **TEST_STALE** | `d405e6d5` | `0a661285` |

**No file classifies as GUARD_BROKEN. No file classifies as ENV.** All three
guards are intact; the tests describe an auth module layout and a claims location
that both changed on 2026-03-31 during Phase 37.6.

The hypothesis in the brief — "whole files failing suggests a broken import, mock,
or environment assumption rather than a real regression" — is correct for files 1
and 2 and correct in spirit for file 3, but it is now proven rather than assumed:
the guard bodies are byte-identical across the breaking commit, and all three
files pass when checked out at the commit before the break.

**The most important finding is in file 3 and it is a trap.** Its two failing
assertions describe the *insecure* behaviour. Making them pass by editing the
guard would reintroduce the privilege-escalation hole that `d405e6d5` closed. See
§3.

---

## 1. Raw failure output

Run individually, from `apps/web`, with `DATABASE_URL` explicitly unset so the
conditions match a default `npm test` run. ANSI colour codes stripped; nothing
else altered.

### 1.1 `tests/unit/auth/require-auth.test.ts` — 3 of 3 failed

```
$ env -u DATABASE_URL npx vitest run tests/unit/auth/require-auth.test.ts

 RUN  v4.0.18 C:/Users/sammy/Projects/DriveCommand/apps/web

 ❯ tests/unit/auth/require-auth.test.ts (3 tests | 3 failed) 4ms
     × returns userId when session exists 2ms
     × throws Unauthorized when session is null 0ms
     × throws with descriptive message when session is null 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/auth/require-auth.test.ts > requireAuth > returns userId when session exists
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-auth.test.ts:18:20
     16|
     17|   it('returns userId when session exists', async () => {
     18|     mockGetSession.mockResolvedValue({
       |                    ^
     19|       userId: 'user-123',
     20|       tenantId: 'tenant-456',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  tests/unit/auth/require-auth.test.ts > requireAuth > throws Unauthorized when session is null
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-auth.test.ts:31:20
     29|
     30|   it('throws Unauthorized when session is null', async () => {
     31|     mockGetSession.mockResolvedValue(null);
       |                    ^
     32|
     33|     await expect(requireAuth()).rejects.toThrow('Unauthorized');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  tests/unit/auth/require-auth.test.ts > requireAuth > throws with descriptive message when session is null
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-auth.test.ts:37:20
     35|
     36|   it('throws with descriptive message when session is null', async () …
     37|     mockGetSession.mockResolvedValue(null);
       |                    ^
     38|
     39|     await expect(requireAuth()).rejects.toThrow('Authentication requir…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed (3)
   Start at  14:36:19
   Duration  356ms (transform 73ms, setup 0ms, import 218ms, tests 4ms, environment 0ms)
```

### 1.2 `tests/unit/auth/require-role.test.ts` — 5 of 5 failed

```
$ env -u DATABASE_URL npx vitest run tests/unit/auth/require-role.test.ts

 RUN  v4.0.18 C:/Users/sammy/Projects/DriveCommand/apps/web

 ❯ tests/unit/auth/require-role.test.ts (5 tests | 5 failed) 4ms
     × returns matched role when role is in allowedRoles 2ms
     × returns MANAGER role when allowed 0ms
     × throws Unauthorized when role is not in allowedRoles 0ms
     × throws with role info when not authorized 0ms
     × throws Unauthorized when session is null 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/auth/require-role.test.ts > requireRole > returns matched role when role is in allowedRoles
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-role.test.ts:18:20
     16|
     17|   it('returns matched role when role is in allowedRoles', async () => {
     18|     mockGetSession.mockResolvedValue({
       |                    ^
     19|       userId: 'user-123',
     20|       tenantId: 'tenant-456',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  tests/unit/auth/require-role.test.ts > requireRole > returns MANAGER role when allowed
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-role.test.ts:31:20
     29|
     30|   it('returns MANAGER role when allowed', async () => {
     31|     mockGetSession.mockResolvedValue({
       |                    ^
     32|       userId: 'user-123',
     33|       tenantId: 'tenant-456',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  tests/unit/auth/require-role.test.ts > requireRole > throws Unauthorized when role is not in allowedRoles
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-role.test.ts:44:20
     42|
     43|   it('throws Unauthorized when role is not in allowedRoles', async () …
     44|     mockGetSession.mockResolvedValue({
       |                    ^
     45|       userId: 'user-123',
     46|       tenantId: 'tenant-456',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  tests/unit/auth/require-role.test.ts > requireRole > throws with role info when not authorized
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-role.test.ts:56:20
     54|
     55|   it('throws with role info when not authorized', async () => {
     56|     mockGetSession.mockResolvedValue({
       |                    ^
     57|       userId: 'user-123',
     58|       tenantId: 'tenant-456',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  tests/unit/auth/require-role.test.ts > requireRole > throws Unauthorized when session is null
TypeError: mockGetSession.mockResolvedValue is not a function
 ❯ tests/unit/auth/require-role.test.ts:68:20
     66|
     67|   it('throws Unauthorized when session is null', async () => {
     68|     mockGetSession.mockResolvedValue(null);
       |                    ^
     69|
     70|     await expect(requireRole([UserRole.OWNER])).rejects.toThrow('Unaut…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/5]⎯


 Test Files  1 failed (1)
      Tests  5 failed (5)
   Start at  14:36:24
   Duration  573ms (transform 72ms, setup 0ms, import 214ms, tests 4ms, environment 0ms)
```

### 1.3 `tests/unit/auth/validate-mobile-token.test.ts` — 2 of 6 failed

```
$ env -u DATABASE_URL npx vitest run tests/unit/auth/validate-mobile-token.test.ts

 RUN  v4.0.18 C:/Users/sammy/Projects/DriveCommand/apps/web

 ❯ tests/unit/auth/validate-mobile-token.test.ts (6 tests | 2 failed) 8ms
     ✓ returns null when no Authorization header is present 1ms
     ✓ returns null when Authorization header does not start with Bearer 0ms
     × returns MobileAuthContext when token is valid (OWNER role) 5ms
     × returns MobileAuthContext with driverId when role is DRIVER 1ms
     ✓ returns null when Supabase returns an error 0ms
     ✓ returns null when Supabase returns null user 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/unit/auth/validate-mobile-token.test.ts > validateMobileToken > returns MobileAuthContext when token is valid (OWNER role)
AssertionError: expected { userId: 'user-123', …(2) } to deeply equal { userId: 'user-123', …(2) }

- Expected
+ Received

  {
-   "role": "OWNER",
-   "tenantId": "tenant-456",
+   "role": undefined,
+   "tenantId": undefined,
    "userId": "user-123",
  }

 ❯ tests/unit/auth/validate-mobile-token.test.ts:65:20
     63|     const result = await validateMobileToken(req);
     64|
     65|     expect(result).toEqual({
       |                    ^
     66|       userId: 'user-123',
     67|       tenantId: 'tenant-456',

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  tests/unit/auth/validate-mobile-token.test.ts > validateMobileToken > returns MobileAuthContext with driverId when role is DRIVER
AssertionError: expected undefined to be 'driver-789' // Object.is equality

- Expected:
"driver-789"

+ Received:
undefined

 ❯ tests/unit/auth/validate-mobile-token.test.ts:97:30
     95|     const result = await validateMobileToken(req);
     96|
     97|     expect(result?.driverId).toBe('driver-789');
       |                              ^
     98|     expect(result?.userId).toBe('driver-789');
     99|     expect(result?.role).toBe('DRIVER');

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 4 passed (6)
   Start at  14:36:30
   Duration  248ms (transform 48ms, setup 0ms, import 107ms, tests 8ms, environment 0ms)
```

---

## 2. Classification, with proof

### 2.1 `require-auth.test.ts` and `require-role.test.ts` — **TEST_STALE**

Both files mock a module that **no longer exists**, then import the function under
test from a **different** module.

```
tests/unit/auth/require-auth.test.ts:4-8
vi.mock('@/lib/auth/session', () => ({      <-- mocks a deleted module
  getSession: vi.fn(),
}));

import { requireAuth, getSession } from '@/lib/auth/supabase';   <-- real module
```

```
tests/unit/auth/require-role.test.ts:3-7
vi.mock('@/lib/auth/session', () => ({
  getSession: vi.fn(),
}));

import { requireRole, getSession } from '@/lib/auth/supabase';
```

**The proof that the mock is inert:**

- `src/lib/auth/session.ts` does not exist. `ls` reports "No such file or
  directory"; the directory contains only `auth-context.tsx`, `display-name.ts`,
  `email-token.ts`, `guards.tsx`, `mobile-auth.ts`, `permissions.ts`, `roles.ts`,
  `route-access.ts`, `supabase.ts`.
- `src/lib/auth/supabase.ts` contains no import of `./session` (grep returns
  nothing), so nothing under test resolves through the mocked specifier.
- `getSession` at `src/lib/auth/supabase.ts:42` is a real `cache()`-wrapped
  function, not a `vi.fn()`.

`vi.mock()` with a factory does not error on a specifier nothing imports — it is
simply registered and never used. So `vi.mocked(getSession)` at
`require-auth.test.ts:10` / `require-role.test.ts:10` returns the genuine
function unchanged, and `.mockResolvedValue` is `undefined` on it. That is the
`TypeError` at `require-auth.test.ts:18` and `require-role.test.ts:18`.

**The guards did not change — they moved.** `requireAuth` and `requireRole` are
byte-identical before and after the breaking commit:

```
d209ebe3:apps/web/src/lib/auth/server.ts        HEAD:apps/web/src/lib/auth/supabase.ts:92-113
export async function requireAuth(): Promise<string> {          (identical)
  const session = await getSession();
  if (!session) {
    throw new Error('Unauthorized: Authentication required');
  }
  return session.userId;
}
export async function requireRole(allowedRoles: UserRole[]): Promise<UserRole> {
  const role = await getRole();
  if (!role || !allowedRoles.includes(role)) {
    throw new Error(
      `Unauthorized: Required roles: ${allowedRoles.join(', ')}. Current role: ${role || 'none'}`
    );
  }
  return role;
}
```

Not ENV: the failure is a `TypeError` on a mock helper, thrown before any guard
code runs. It reproduces identically with and without `DATABASE_URL`, and neither
file reads any environment variable.

**These two are the only files in the repo still mocking the dead path.** `rg -l
"vi.mock\('@/lib/auth/session'"` over `tests/` and `src/` returns exactly these
two.

### 2.2 `validate-mobile-token.test.ts` — **TEST_STALE**

The test supplies its claims in `user_metadata`:

```
tests/unit/auth/validate-mobile-token.test.ts:47-54
            user: {
              id: 'user-123',
              user_metadata: {          <-- test writes here
                tenantId: 'tenant-456',
                role: 'OWNER',
                isSystemAdmin: false,
              },
            },
```

The guard reads `app_metadata`:

```
src/lib/auth/mobile-auth.ts:65-75
    // Security claims from app_metadata (tamper-proof, admin-only writes)
    const appMeta = user.app_metadata || {};
      ...
      tenantId: appMeta.tenantId,
      role: appMeta.role as UserRole,
    // For DRIVER role, driverId is the same as userId (drivers are User records)
    if (appMeta.role === 'DRIVER') {
      ctx.driverId = user.id;
```

`user.app_metadata` is absent from the fixture, so `appMeta` is `{}` and both
claims resolve to `undefined` — exactly the `role: undefined, tenantId: undefined`
in the diff at §1.3, with `userId` still correct because it is read from
`user.id`, not from metadata.

**The guard is right and the test is wrong**, and the guard's own header says why:

```
src/lib/auth/mobile-auth.ts:8-9
 * Security claims (role, tenantId) are stored in app_metadata (admin-only,
 * tamper-proof) — not user_metadata, which is user-writable via updateUser().
```

Not ENV: no environment variable is read on this path, and the 4 passing tests in
the same file share the same environment.

**Why only 2 of 6 fail.** The 4 passing tests exercise early returns that never
reach the metadata read — no `Authorization` header, a non-`Bearer` scheme, a
Supabase error, and a null user. Only the two happy-path tests get as far as
line 65.

---

## 3. GUARD_BROKEN consequences — **not applicable**

No file classified as GUARD_BROKEN, so there is nothing an unauthenticated or
under-privileged caller can currently do as a result of these three failures.
Stated positively rather than by omission:

- `requireAuth` / `requireRole` are byte-identical to their last-passing version
  (§2.1). 26 files call `requireAuth`, 66 call `requireRole`; none is affected,
  because the functions did not change.
- `validateMobileToken` reads the tamper-proof claims location. 90 route files
  under `src/app/api` use it directly or through `withMobileAuth`; all are
  correct.

**The one thing that matters here is the direction of the file-3 fix.** Its two
failing assertions encode the pre-`d405e6d5` behaviour, in which security claims
were read from `user_metadata`. That field is writable by the end user through
Supabase's `updateUser()`. Editing the guard to satisfy the test would let any
authenticated mobile user set their own `role` and `tenantId` — full privilege
escalation and full cross-tenant access across all 90 mobile routes. **The
correct repair is to move the fixture from `user_metadata` to `app_metadata`, and
never the reverse.** The test as written is a live invitation to reintroduce the
hole Phase 37.6 closed.

Worth recording for the Phase 0 attack suite: the current failure mode is
**fail-closed**, not fail-open. With `role` undefined, `withMobileAuth` evaluates
`options.allowedRoles.includes(auth.role)` (`src/lib/api/with-mobile-auth.ts:55`)
as false and returns 403. That is only true of the test fixture in any case —
production `app_metadata` is populated.

---

## 4. When they last passed — determined, and verified by running them

Determined from `git log --follow` on the test files and the guard sources, then
**proved by checking out the commits into throwaway worktrees and running the
tests**, rather than inferred from the history alone.

### The two breaking commits, both from Phase 37.6 on 2026-03-31

**`d405e6d5` — `feat(37.6-01): migrate security claims to app_metadata across all auth files`**

Changed `mobile-auth.ts` from `user_metadata` to `app_metadata`:

```
- * and returns the authenticated user context (from user_metadata — no DB lookup).
+ * and returns the authenticated user context (from app_metadata — no DB lookup).
-    const meta = user.user_metadata || {};
+    const appMeta = user.app_metadata || {};
-      tenantId: meta.tenantId,
-      role: meta.role as UserRole,
+      tenantId: appMeta.tenantId,
+      role: appMeta.role as UserRole,
-    if (meta.role === 'DRIVER') {
+    if (appMeta.role === 'DRIVER') {
```

It touched 6 files — `accept-invitation/route.ts`, `login/route.ts`,
`me/route.ts`, `mobile-auth.ts`, `session.ts`, `middleware.ts` — and **no test
files at all**. `validate-mobile-token.test.ts` has only ever been touched by
`806df53c`, the commit that created it.

**`de01979f` — `feat(37.6-02): consolidate auth helpers into single supabase.ts`**

Deleted `session.ts` (42 lines) and rewrote the imports in both guard tests, but
left the `vi.mock()` specifier pointing at the module it had just deleted:

```
diff --git a/apps/web/tests/unit/auth/require-auth.test.ts
@@ -5,8 +5,7 @@ vi.mock('@/lib/auth/session', () => ({      <-- untouched, now dead
   getSession: vi.fn(),
 }));

-import { requireAuth } from '@/lib/auth/server';
-import { getSession } from '@/lib/auth/session';
+import { requireAuth, getSession } from '@/lib/auth/supabase';
```

Its own message says "Update all ~72 import paths across src/ and tests/". It did
— `vi.mock()` takes a **string literal**, not an import statement, so a sweep over
import paths passes straight over it. `npx tsc --noEmit` also passed, as the
message notes, because a string argument is not a module reference TypeScript
checks.

### Verification runs

At **`0a661285`** (`docs(37.6): create phase plan…`, the commit before
`d405e6d5`) — all three files pass:

```
 ✓ tests/unit/auth/validate-mobile-token.test.ts (6 tests) 5ms
 ✓ tests/unit/auth/require-auth.test.ts (3 tests) 3ms
 ✓ tests/unit/auth/require-role.test.ts (5 tests) 4ms

 Test Files  3 passed (3)
      Tests  14 passed (14)
```

At **`d209ebe3`** (`docs(37.6-01): complete app_metadata migration plan…`, the
commit before `de01979f`) — the two guard tests still pass, the mobile one is
already broken:

```
 ❯ tests/unit/auth/validate-mobile-token.test.ts:97:30
     97|     expect(result?.driverId).toBe('driver-789');

 Test Files  1 failed | 2 passed (3)
      Tests  2 failed | 12 passed (14)
```

### Answer

| File | Last commit at which it passed | Broken by |
|---|---|---|
| `require-auth.test.ts` | **`d209ebe3`** (2026-03-31) | `de01979f` |
| `require-role.test.ts` | **`d209ebe3`** (2026-03-31) | `de01979f` |
| `validate-mobile-token.test.ts` | **`0a661285`** (2026-03-31) | `d405e6d5` |

All three have been failing for a little over five months, since 2026-03-31.

Note on method: these are pure unit tests with mocked dependencies and read no
environment variables, so the worktree baseline skew recorded in quick-567 —
`git worktree add` not carrying the untracked `.env.local` — does not apply here.
Both worktrees were created inside the repository and removed afterwards; `git
worktree list` shows only the main checkout.

---

## 5. Notes for whoever fixes these

Not fixes, since this is investigation only — just the two things a repair must
not get wrong.

1. **File 3's fixture must move to `app_metadata`, not the guard to
   `user_metadata`.** See §3.
2. **Files 1 and 2 need the `vi.mock()` specifier changed to
   `@/lib/auth/supabase`**, which is a different edit from the one `de01979f`
   performed. A repair should also consider whether `vi.mock()` specifiers ought
   to be covered by whatever sweep renames modules in future, since a string
   literal is invisible to both an import-path sweep and to `tsc`.

An unrelated stray file is present in the working tree and was left alone:
`apps/web/vitest-out.txt`, an untracked UTF-16 PowerShell redirect dump of an
earlier vitest run. It is not mine and not part of this triage; it is flagged here
because it makes `git status` non-empty.
