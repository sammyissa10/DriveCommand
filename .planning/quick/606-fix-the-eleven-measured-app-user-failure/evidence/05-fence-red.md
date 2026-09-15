# quick-606 · 05 — the tenant-mechanism fence, proven RED twice

`apps/web/tests/security/tenant-mechanism-fence.test.ts`. Green baseline: **8 passed (8)**.

`apps/web` has **no working lint entry point** (quick-562), so a vitest source scan is the only
enforcement available. This is stated rather than an ESLint rule being proposed.

## RED 1 — a new direct `withTenantRLS` importer under `src`

Added `apps/web/src/lib/db/__606-red-witness.ts`:

```ts
import { withTenantRLS } from './extensions/tenant-rls';
import { prisma } from './prisma';
export const bad = (t: string) => prisma.$extends(withTenantRLS(t));
```

Verbatim:

```
 FAIL  tests/security/tenant-mechanism-fence.test.ts > … > withTenantRLS: the set of referencing files equals the allowlist, in BOTH directions
AssertionError: expected [ …(7) ] to deeply equal [ …(6) ]

- Expected
+ Received

@@ -1,6 +1,7 @@
  [
+   "src/lib/db/__606-red-witness.ts",
    "src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts",
    "src/lib/db/extensions/tenant-rls.ts",
    "src/lib/db/tenant-client.ts",
    "tests/security/audit-log-isolation.test.ts",
    "tests/security/restricted-documents.test.ts",

 ❯ tests/security/tenant-mechanism-fence.test.ts:289:19
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

## RED 2 — the ALIAS ban, and it caught something set-equality did not

Replaced the witness with an aliased `createTenantClient`:

```ts
import { createTenantClient as scoped } from './tenant-client';
export const bad = (t: string) => scoped(t);
```

```
 FAIL  tests/security/tenant-mechanism-fence.test.ts > … > neither name is ever imported under an ALIAS
AssertionError: expected [ Array(1) ] to deeply equal []

- []
+ [
+   "src/lib/db/__606-red-witness.ts: createTenantClient as scoped",
+ ]

 ❯ tests/security/tenant-mechanism-fence.test.ts:328:21
 Test Files  1 failed (1)
      Tests  1 failed | 7 passed (8)
```

**Only the alias assertion fired.** The frozen-inventory test stayed green, because the call site now
reads `scoped(t)` and matches no call pattern. That is the whole argument for the alias ban being its
own assertion rather than an implied consequence of the path match: an alias is the obvious way round
a name-counted allowlist, and the count test cannot see it.

Witness deleted; `git status` clean of it; re-run **8 passed (8)**; `npx tsc --noEmit` exit 0.

## Three corrections to the plan's list, found by grep before the allowlist was written

| the plan says | measured |
|---|---|
| `lib/db/extensions/tenant-rls-bound.prototype.ts` imports `withTenantRLS` | **it does not** — it imports only `Prisma` and defines its own `withTenantRLSBound`. It is now the guard's **counter-assertion file**: read, >1000 bytes, zero matches |
| `src/__tests__/security/tenant-header-forgery.test.ts` imports `withTenantRLS` | **it does not** — it `vi.doMock`s `@/lib/db/tenant-client`, one layer up |
| `src/lib/db/extensions/tenant-rls.ts` is not listed | it must be — it is the definition |

Frozen counts, taken by grep and then confirmed by the test rather than copied from the plan:
`driver-pay-tenant-isolation.test.ts` **5** (the plan implies 4), `restricted-documents.test.ts` **1**
(2 was the first guess). Both corrected against the measurement.
