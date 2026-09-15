# quick-613 — the allowlist gate, witnessed RED then GREEN from THIS task's run

The brief is explicit: **prove it from this task's own run, do not cite quick-600.** A guard asserted
without a witnessed red is the quick-549 shape — it may be passing because it says nothing.

The scratch file is a DELIBERATE out-of-allowlist import: `apps/web/src/lib/__probe-613.ts`, importing
`getAdminDb` from `@/lib/db/admin-prisma` and calling it once. It is not collected by vitest (the
config's globs are `tests/**/*.test.ts` and `src/**/*.test.ts`), so the only thing that can notice it
is the source scan itself.

---

## 1. RED — the scratch file present

```
$ cat > src/lib/__probe-613.ts <<'PROBE'
// quick-613 — DELIBERATE, TEMPORARY out-of-allowlist import. Proves the gate
// fires red from this task's own run. Deleted immediately after capture.
import { getAdminDb } from '@/lib/db/admin-prisma';

export async function probe613() {
  const db = await getAdminDb('sysadmin automation rule listing');
  return db;
}
PROBE

$ npx vitest run tests/security/admin-connection-allowlist.test.ts
```

```
 ❯ tests/security/admin-connection-allowlist.test.ts (9 tests | 1 failed) 669ms
     ✓ integrity floor: allowlist is non-trivial and internally consistent 1ms
     ✓ walked a real, non-trivial corpus (anti-vacuity) 53ms
     ✓ counter-assertion: a known NON-allowlisted file is read and contains zero getAdminDb( calls 1ms
     ✓ every allowlist entry exists on disk and clears its minBytes floor 2ms
     × allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST 203ms
     ✓ per-file call count matches exactly (quick-600 §3.2 countdown) 3ms
     ✓ no aliasing — import { getAdminDb as x } or { adminPrisma as x } anywhere in src 197ms
     ✓ adminPrisma (the client) is never exported from any module 208ms
     ✓ the tenant-GUC connect initialiser lives only in prisma.ts 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/security/admin-connection-allowlist.test.ts > quick-600 (B5) — getAdminDb import allowlist > allowlist equality, BOTH directions — importers of admin-prisma exactly equal ADMIN_ALLOWLIST
AssertionError: these files import lib/db/admin-prisma but are NOT in ADMIN_ALLOWLIST: lib/__probe-613.ts: expected [ 'lib/__probe-613.ts' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "lib/__probe-613.ts",
+ ]

 ❯ tests/security/admin-connection-allowlist.test.ts:193:7
    191|       missingFromAllowlist,
    192|       `these files import lib/db/admin-prisma but are NOT in ADMIN_ALL…
    193|     ).toEqual([]);
       |       ^
    194|     expect(
    195|       extraInAllowlist,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 passed (9)
   Start at  18:29:41
   Duration  1.28s (transform 52ms, setup 79ms, import 18ms, tests 669ms, environment 0ms)
```

Exit code **1**. The failure NAMES the offending file (`lib/__probe-613.ts`) rather than merely
reporting a count, which is what makes the gate usable in a review.

Note which assertion fired: **allowlist equality**, not the per-file call count. The two catch
different things — equality catches a NEW file reaching the module, and the call count catches a NEW
call inside a file that is already on the list. quick-613 exercised the second one for real:
`automations.ts` went 3 → 7 and would have failed that assertion had the entry not been updated
deliberately.

---

## 2. GREEN — the scratch file deleted, nothing else changed

```
$ rm src/lib/__probe-613.ts
$ npx vitest run tests/security/admin-connection-allowlist.test.ts
```

```
 ✓ tests/security/admin-connection-allowlist.test.ts (9 tests) 764ms

 Test Files  1 passed (1)
      Tests  9 passed (9)
   Start at  18:29:50
   Duration  986ms (transform 43ms, setup 71ms, import 17ms, tests 764ms, environment 0ms)
```

Exit code **0**, with quick-613's own edits in place (`calls: 7`, `TOTAL_EXPECTED_CALLS` 48, entry
count still 23).

---

## 3. The revert is complete

quick-519 found a previous run's `__probe.ts` still sitting in `src/lib/document-import/`, so the
revert is asserted rather than assumed:

```
$ git status --porcelain
?? .planning/quick/613-route-the-automationrule-admin-paths-to-/613-PLAN.md
?? .planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/00-suite-before.json
?? .planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/00-suite-before.log
?? .planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/01-before.json
?? .planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/01-before.md
?? .planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/03-after.json
?? .planning/quick/613-route-the-automationrule-admin-paths-to-/evidence/03-after.md
?? apps/web/scripts/audit/613-routing-verify.ts

$ grep -rn "__probe" apps/web/src
grep: no __probe anywhere in apps/web/src
```

No stray probe file under `src`; the only untracked paths are this task's own evidence and its audit
script. The `tsc` blindness probe (`const __probe613: number = 'y';` injected into
`src/app/(admin)/actions/automations.ts`) was reverted the same way and is likewise absent — see
§7 of the summary.
