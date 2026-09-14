# quick-600 — the allowlist gate, proven to fire

Two deliberate violations, each captured red, reverted, and re-confirmed green. Command in both
cases: `npx vitest run tests/security/admin-connection-allowlist.test.ts --no-color` from
`apps/web`.

---

## 1. Deliberate out-of-allowlist import

Added to `apps/web/src/lib/logger.ts` (not on the allowlist):

```ts
import { getAdminDb } from '@/lib/db/admin-prisma';

async function __quick600_probe_violation() {
  return getAdminDb('sysadmin tenant listing');
}
void __quick600_probe_violation;
```

### Verbatim failure output

```
npm warn config ignoring workspace config at C:\Users\sammy\Projects\DriveCommand\apps\web/.npmrc

 RUN  v4.0.18 C:/Users/sammy/Projects/DriveCommand/apps/web

 ❯ tests/security/admin-connection-allowlist.test.ts (9 tests | 1 failed) 3358ms
     ✓ integrity floor: allowlist is non-trivial and internally consistent 3ms
     ✓ walked a real, non-trivial corpus (anti-vacuity) 300ms
     ✓ counter-assertion: a known NON-allowlisted file is read and contains zero getAdminDb( calls 2ms
     ✓ every allowlist entry exists on disk and clears its minBytes floor 8ms
     × allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST 1148ms
     ✓ per-file call count matches exactly (quick-600 §3.2 countdown) 16ms
     ✓ no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src  1006ms
     ✓ adminPrisma (the client) is never exported from any module  868ms
     ✓ the tenant-GUC connect initialiser lives only in prisma.ts 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/security/admin-connection-allowlist.test.ts > quick-600 (B5) — getAdminDb import allowlist > allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST
AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST: lib/logger.ts: expected [ 'lib/logger.ts' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "lib/logger.ts",
+ ]

 ❯ tests/security/admin-connection-allowlist.test.ts:180:7
    178|       missingFromAllowlist,
    179|       `these files import lib/db/admin-prisma but are NOT in ADMIN_ALL…
    180|     ).toEqual([]);
       |       ^
    181|     expect(
    182|       extraInAllowlist,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
   Start at  13:42:16
   Duration  4.11s (transform 115ms, setup 0ms, import 167ms, tests 3.36s, environment 0ms)
```

### Reverted, re-confirmed green

`logger.ts` restored to its original content (the two added lines removed). Re-run:

```
 ✓ tests/security/admin-connection-allowlist.test.ts (9 tests) 2937ms
     ✓ allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST  856ms
     ✓ no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src  918ms
     ✓ adminPrisma (the client) is never exported from any module  892ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  13:42:35
   Duration  3.58s (transform 95ms, setup 0ms, import 138ms, tests 2.94s, environment 0ms)
```

---

## 2. Deliberate alias

Added a second import line to `apps/web/src/app/api/cron/mark-overdue-invoices/route.ts` (already
on the allowlist — proves rule 3 fires independently of rule 1, not merely as a side effect of it):

```ts
import { getAdminDb as __quick600_aliased } from '@/lib/db/admin-prisma';
void __quick600_aliased;
```

### Verbatim failure output

```
npm warn config ignoring workspace config at C:\Users\sammy\Projects\DriveCommand\apps\web/.npmrc

 RUN  v4.0.18 C:/Users/sammy/Projects/DriveCommand/apps/web

 ❯ tests/security/admin-connection-allowlist.test.ts (9 tests | 1 failed) 2897ms
     ✓ integrity floor: allowlist is non-trivial and internally consistent 3ms
     ✓ walked a real, non-trivial corpus (anti-vacuity) 263ms
     ✓ counter-assertion: a known NON-allowlisted file is read and contains zero getAdminDb( calls 2ms
     ✓ every allowlist entry exists on disk and clears its minBytes floor 9ms
     ✓ allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST  841ms
     ✓ per-file call count matches exactly (quick-600 §3.2 countdown) 9ms
     × no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src 857ms
     ✓ adminPrisma (the client) is never exported from any module  905ms
     ✓ the tenant-GUC connect initialiser lives only in prisma.ts 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/security/admin-connection-allowlist.test.ts > quick-600 (B5) — getAdminDb import allowlist > no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src
AssertionError: app/api/cron/mark-overdue-invoices/route.ts: getAdminDb aliased: expected [ Array(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "app/api/cron/mark-overdue-invoices/route.ts: getAdminDb aliased",
+ ]

 ❯ tests/security/admin-connection-allowlist.test.ts:205:45
    203|       if (/adminPrisma\s+as\s+/.test(src)) aliasHits.push(`${f}: admin…
    204|     }
    205|     expect(aliasHits, aliasHits.join('\n')).toEqual([]);
       |                                             ^
    206|   });
    207| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
   Start at  13:42:51
   Duration  3.70s (transform 136ms, setup 0ms, import 184ms, tests 2.90s, environment 0ms)
```

Note the middle run's `allowlist equality` assertion stayed **green** (the file was already
allowlisted) while the `no aliasing` assertion went **red** on its own — proof the two rules are
independent, not the same check firing twice.

### Reverted, re-confirmed green

`mark-overdue-invoices/route.ts` restored to its original content. Re-run:

```
     ✓ no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src  878ms
     ✓ adminPrisma (the client) is never exported from any module  871ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  13:43:08
   Duration  3.53s (transform 103ms, setup 0ms, import 145ms, tests 2.87s, environment 0ms)
```

Both reverts were confirmed with `git status` showing no diff against the routed versions of these
two files before continuing.
