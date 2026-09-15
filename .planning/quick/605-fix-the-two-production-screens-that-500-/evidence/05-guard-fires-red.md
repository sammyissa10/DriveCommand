# quick-605 · 05 — the guard witnessed RED

A guard asserted without a witnessed red is the quick-549 shape. This is the captured failing output.

## What was reverted to produce it

The **exact pre-605 shape**, not merely "the mount deleted":

- `src/app/layout.tsx` restored from `49bf351d` — no `NuqsAdapter`.
- `src/app/(dev)/layout.tsx` restored from `49bf351d` — the group-scoped mount put **back**.

That second half is the point. The `(dev)` mount is present and rendering, so
`findAdapterMounts` returns a non-empty set and the integrity assertions all stay
green. **The guard fails on the SHAPE — an adapter that exists but is scoped to a
route group its consumers do not live in — not on "no adapter anywhere".** A red
that only fires when every mount is gone would not have caught the state this repo
was actually in.

Confirmed at the moment of the run:

```
$ grep -c NuqsAdapter src/app/layout.tsx "src/app/(dev)/layout.tsx"
src/app/layout.tsx:0
src/app/(dev)/layout.tsx:3
```

## The captured output

```
     × every page that transitively renders a nuqs hook has an adapter above it 5ms
     × the mount that covers them is the ROOT layout, not a route-group one 1ms
     ✓ both route groups that hold consumers are represented, so this is not a one-group scan 0ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/__tests__/nuqs-adapter-coverage.test.ts > nuqs adapter coverage — every consumer page is covered > every page that transitively renders a nuqs hook has an adapter above it
AssertionError: 7 page(s) render a nuqs hook with NO NuqsAdapter in their layout chain. Every one of these answers HTTP 500 — or streams a broken region behind a 200 — on first paint. The mount belongs in apps/web/src/app/layout.tsx, wrapping <AuthProvider> inside <body>, because a route-group layout cannot cover a sibling group and the consumers span more than one. See docs/audits/nuqs-adapter-render-failure.md.: expected [ …(7) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "/docs/database/[model]  ((admin))  src/app/(admin)/docs/database/[model]/page.tsx",
+   "/docs/features  ((admin))  src/app/(admin)/docs/features/page.tsx",
+   "/carrier/driver-pay/reports/[driverId]  ((owner))  src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx",
+   "/carrier/driver-pay/reports  ((owner))  src/app/(owner)/carrier/driver-pay/reports/page.tsx",
+   "/carrier/driver-pay/settlements  ((owner))  src/app/(owner)/carrier/driver-pay/settlements/page.tsx",
+   "/carrier/imports/[id]/stops  ((owner))  src/app/(owner)/carrier/imports/[id]/stops/page.tsx",
+   "/checklists/automation  ((owner))  src/app/(owner)/checklists/automation/page.tsx",
+ ]

 ❯ src/__tests__/nuqs-adapter-coverage.test.ts:121:7
    119|           `because a route-group layout cannot cover a sibling group a…
    120|           `See docs/audits/nuqs-adapter-render-failure.md.`,
    121|     ).toEqual([]);
       |       ^
    122|   });
    123| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/__tests__/nuqs-adapter-coverage.test.ts > nuqs adapter coverage — every consumer page is covered > the mount that covers them is the ROOT layout, not a route-group one
AssertionError: expected [ null ] to deeply equal [ 'src/app/layout.tsx' ]

- Expected
+ Received

  [
-   "src/app/layout.tsx",
+   null,
  ]

 ❯ src/__tests__/nuqs-adapter-coverage.test.ts:129:34
    127|     // which is precisely the state quick-605 found the repo in.
    128|     const coveringLayouts = new Set(coverage.map((c) => c.coveredBy));
    129|     expect([...coveringLayouts]).toEqual(['src/app/layout.tsx']);
       |                                  ^
    130|   });
    131| 

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 9 passed (11)
   Start at  12:14:54
   Duration  834ms (transform 39ms, setup 0ms, import 462ms, tests 10ms, environment 0ms)

```

## Notes on what the red does and does not say

- **All nine integrity tests passed while the two coverage tests failed.** That is the
  anti-vacuity evidence: the scan walked 1,690 files, found the seed module, found a
  mount, and traced seven pages — and *then* said none of them was covered. A red
  produced by an empty scan would have shown the integrity tests failing instead.
- **Seven pages are named individually in the failure message**, with route, route group
  and file. The message also names the fix location, so the next person to hit it does
  not have to re-derive it.
- The second failure — `expected [ null ] to deeply equal [ 'src/app/layout.tsx' ]` —
  is the one that would fire if somebody "fixed" a future recurrence by adding a second
  route-group mount instead of using the root one.

## Restored and re-confirmed green

```
$ npx vitest run src/__tests__/nuqs-adapter-coverage.test.ts
 Test Files  1 passed (1)
      Tests  11 passed (11)
```

`git status` after restoring shows only the new test file — the revert left nothing behind.
