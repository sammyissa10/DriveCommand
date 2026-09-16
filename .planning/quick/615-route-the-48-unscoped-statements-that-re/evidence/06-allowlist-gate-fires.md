# quick-615 evidence 06 — the allowlist gate, witnessed RED then GREEN from this run

quick-615 raises `ADMIN_ALLOWLIST` from 23 entries / 48 calls to **31 / 66**. A
guard asserted without a witnessed red is the quick-549 shape, so the gate was
made to fail from THIS task's own tree, then reverted, then re-run.

---

## The injection

`apps/web/src/lib/logger.ts` — a file deliberately NOT on the allowlist, chosen
because it is imported almost everywhere and is obviously not an admin surface.
Appended verbatim:

```ts

// quick-615 TEMPORARY — deliberate out-of-allowlist import, reverted immediately.
import { getAdminDb } from '@/lib/db/admin-prisma';
export const __quick615_red = getAdminDb;
```

## RED — verbatim

```
 ❯ tests/security/admin-connection-allowlist.test.ts (9 tests | 1 failed) 683ms
     ✓ integrity floor: allowlist is non-trivial and internally consistent 1ms
     ✓ walked a real, non-trivial corpus (anti-vacuity) 53ms
     ✓ counter-assertion: a known NON-allowlisted file is read and contains zero getAdminDb( calls 0ms
     ✓ every allowlist entry exists on disk and clears its minBytes floor 3ms
     × allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST 202ms
     ✓ per-file call count matches exactly (quick-600 §3.2 countdown) 4ms
     ✓ no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src 201ms
     ✓ adminPrisma (the client) is never exported from any module 218ms
     ✓ the tenant-GUC connect initialiser lives only in prisma.ts 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/security/admin-connection-allowlist.test.ts > quick-600 (B5) — getAdminDb import allowlist > allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST
AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST: lib/logger.ts: expected [ 'lib/logger.ts' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "lib/logger.ts",
+ ]

 ❯ tests/security/admin-connection-allowlist.test.ts:243:7

 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
```

Note which assertion fired and which did not: **rule 1 (allowlist equality, both
directions)** caught it by MODULE PATH, exactly as designed. Rule 2 (per-file
call count) did not, because the injected file is not an allowlist entry — the
two rules cover different halves and only one of them could see this.

## Revert

```
$ git diff --stat -- src/lib/logger.ts
(no output)
```

Byte-identical to HEAD. The file was restored from a copy taken before the
append, not re-edited.

## GREEN — verbatim, immediately after the revert

```
 ✓ tests/security/admin-connection-allowlist.test.ts (9 tests) 668ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
```

---

## What the raised numbers are, and that none of them is a widening

| | before quick-615 | after | why |
|---|---|---|---|
| `ADMIN_ALLOWLIST` entries | 23 | **31** | 8 new FILES, all measured by the test's own walker |
| `TOTAL_EXPECTED_CALLS` | 48 | **66** | 18 new `getAdminDb(` calls, grep-measured |

The 18: 11 in the eight new files, 5 in `tenants.ts` (7 → 12), 1 in
`support-tickets.ts` (3 → 4), 1 in `auto-close-tickets` (1 → 2). Three further
routed statements added **no** call at all — `tenants.ts:123`, `:198` and `:239`
are receiver swaps onto an admin client already in scope in their own function.

**No floor was lowered and no assertion weakened.** Every new `minBytes` is set
below its file's measured size:

| new entry | measured bytes | `minBytes` |
|---|---|---|
| `app/(admin)/actions/notifications.ts` | 13 227 | 9 000 |
| `app/(admin)/actions/users.ts` | 6 315 | 4 000 |
| `app/(admin)/admin-support/page.tsx` | 4 608 | 3 000 |
| `app/(admin)/tenants/[id]/activation-progress-section.tsx` | 3 060 | 2 000 |
| `app/(admin)/tenants/[id]/automation-runs-section.tsx` | 3 688 | 2 500 |
| `app/(admin)/tenants/[id]/page.tsx` | 15 794 | 11 000 |
| `app/api/cron/automations/route.ts` | 11 118 | 7 000 |
| `lib/automations/evaluator.ts` | 10 795 | 7 000 |

`app/api/cron/auto-close-tickets/route.ts`'s floor moved **up**, 1 500 → 2 500,
because the file grew to 3 550 bytes. `tenants.ts` and `support-tickets.ts` kept
their existing 15 000 floors; both only grew.
