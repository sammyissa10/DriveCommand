# quick-617 — Task 6: the gates, the batch-size verdict, and the remainder measured

---

## 1. `tsc --noEmit` — clean, and PROVEN NOT BLIND

A parse error in **any** file in the program — including an untracked half-written file belonging to
work you are not doing — suppresses semantic checking of everything, and the gate then reports green
while checking nothing. `.next/dev/types/validator.ts` and `tsconfig.tsbuildinfo` were deleted first.

```
=== clean run ===
CLEAN_EXIT=0                                    (no output at all)

=== probe injected into a file THIS TASK edited ===
const __probe617: number = 'y';                 appended to api/mobile/driver/incidents/route.ts
src/app/api/mobile/driver/incidents/route.ts(163,7): error TS2322:
    Type 'string' is not assignable to type 'number'.
PROBE_EXIT=2

=== probe deleted, re-run ===
probe still present?              0
any __probe file left in the tree? 0
FINAL_TSC_EXIT=0
git status --short                (clean tree)
```

The gate reported **that** error, in **that** file, so it was semantically checking the code this task
changed. The probe was then deleted and the file restored byte-for-byte from the commit — quick-519
found a previous run's `__probe.ts` still sitting in `src/lib/document-import/`.

Also run **once per sub-surface** during Task 3, each clean.

## 2. `npm run build` — exit 0

```
BUILD_EXIT=0
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

## 3. `audit:rls-policy-drift` — ZERO, target NAMED, definition layer PROVEN TO HAVE RUN

quick-615 found the script does not print its own target; quick-607's `_db-target` now does. Both
`DATABASE_URL` and `DIRECT_URL` were pinned to the same project — rung 1 of the ladder.

**A method note worth recording.** Pinning them from a POSIX shell on Windows **corrupted the
connection string**: the banner's host line came back as `17.3.1] injecting env (8) from .env.staging
-- tip:5432`, dotenv's own output spliced into the URL, and the run died `P2010
DatabaseNotReachable`. The target ref resolved correctly the whole time, so a reader glancing at the
banner would have believed the run. `617-run-drift-on-staging.ts` sets `process.env` **in-process**
before the import, removing the shell from the path.

```
[audit-target] BOTH DATABASE_URL and DIRECT_URL pinned to wyixpgunnjmzguhggocz (staging)
               host aws-0-us-west-1.pooler.supabase.com:5432  role postgres.wyixpgunnjmzguhggocz
[db-target] project  : wyixpgunnjmzguhggocz (staging)
[db-target] resolved : explicit DIRECT_URL (port fix within the explicitly-pinned project)
[db-target] intent   : read-only

  Migration files read     : 163
  Statements parsed        : 439
  Policies expected (net)  : 186
  Policies live            : 186
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 0

DEFINITION LAYER (quick-598) — policy BODIES, not just names:
  Canonical artefact hash  : c2a7362e8f8f6f04d0a2ef3f1130ed8bccbcdc1ef9cd37c9c72efe05dc684e29
  Corpus hash (from disk)  : c2a7362e8f8f6f04d0a2ef3f1130ed8bccbcdc1ef9cd37c9c72efe05dc684e29
  Policies compared        : 186
  Definition drift         : 0
  NOT CANONICALISED        : none

RESULT: CLEAN (exit 0)
```

**Exit 0, not exit 3.** Exit 3 would mean the canonical artefact is stale and the definition layer did
not run — in which case a clean name-layer result is evidence of nothing. The two hashes match, so the
body layer genuinely ran. **No regeneration was needed and none was done**, which is consistent with
this task making no DDL change at all. Target ref recorded above, as quick-615 asks.

**Target: `wyixpgunnjmzguhggocz` (STAGING).** Production was independently read (read-only, one
`pg_policies` SELECT) in Task 4 and its `bypass_rls_policy` sorted list is byte-identical to staging's.

## 4. vitest AFTER — compared by failing-FILE SET, same reporter

`npx vitest run --reporter=json --outputFile=evidence/06-vitest-after.json`, after the last source
commit, on a clean tree, with `next dev` stopped. **Never `--reporter=basic`** — it does not exist in
vitest 4 and exits 0 having executed zero tests.

| | tests | passed | failed | pending | failing FILES |
|---|---:|---:|---:|---:|---:|
| BEFORE (pinned at `5437177a`) | 2129 | 2010 | 64 | 52 | 25 |
| AFTER | 2129 | 2008 | 66 | 52 | 26 |

```
only-in-before (fixed)        : []
only-in-after  (NEW FAILURES) : ["wrapper-migration-countdown.test.ts"]
driver-incident-report-persists.test.ts   before: true   after: true
```

### `driver-incident-report-persists.test.ts` — accounted for specifically

It is in the baseline failing set and it belongs to Task 2's proof file. **Its status did not change
in either direction**, so there is nothing to explain: it failed before this task and fails
identically after. Not fixed, not broken, not touched.

### The one new failure, and why regenerating was the right answer

```
AssertionError: expected { unmigratedUnits: 530, …} to deeply equal { unmigratedUnits: 475, …}
AssertionError: expected [ …(39) ] to deeply equal []
```

This is **quick-610's finding, in a new instance**. The wrapper countdown recognises
`getTenantPrisma`/`getTenantPrismaForOrg` as acquisitions and `prisma.$transaction` +
`set_config('app.bypass_rls')` as **nothing at all** — so the 67 most bypass-dependent statements on
the tree contributed **zero** to the metric tracking the migration. Routing them makes the number go
**UP**, and that is the honest direction.

quick-610's recorded rule is *"Regenerate the artefact; never weaken the assertion."* Done:

```
BEFORE: {"unmigratedUnits":475,"unmigratedCallSites":479,"filesWithUnmigratedUnits":214}
AFTER:  {"unmigratedUnits":530,"unmigratedCallSites":534,"filesWithUnmigratedUnits":253}
wrapper-migration-countdown.test.ts  ->  11 passed (11)
```

**The delta is attributed, not waved at:** 39 newly-routed non-carrier mobile files now carry 55
unmigrated units — exactly `530 − 475 = 55` — and `253 − 214 = 39` files. The 5 `api/mobile/carrier/*`
files quick-588 routed were already counted (5 units). Nothing else moved.

**No assertion was weakened anywhere in this task.** The one place it would have been tempting —
`617-mobile-inventory.ts --after`'s `=== 0` — was made *stronger* instead (set equality against the
named stopped files, failing in both directions) rather than relaxed to `<= 16`.

## 5. THE BATCH-SIZE VERDICT

```
956fe987  driver/incidents (Task 2)    1 file   +18   −13
4f868357  support                      1 file   +11    −2
ea5abef2  driver                      13 files +155  −164
8816b2ef  owner                       24 files +310  −348
────────────────────────────────────────────────────────────
combined source                       39 files +494  −527     (net −33 lines)
whole task incl. scripts + evidence   66 files +12,770 −527
```

### Did 47 files in one task produce a diff a human can actually review? — **Partly. The owner commit is at the edge, and I would not repeat it.**

The honest answer has three parts.

**What worked.** The per-sub-surface split was the right call and should be kept. The `support` and
`driver/incidents` commits are 1 file each and are genuinely reviewable line by line — and
`driver/incidents` is the one that establishes the pattern, so the reviewer who reads only that one
has read the important diff. The `driver` commit at 13 files is fine: the change is byte-identical in
shape 13 times and a reviewer confirms the shape once and then scans.

**What did not.** **The `owner` commit is 24 files / 658 changed lines and I do not think a human
reviews that honestly.** The failure mode is not that a reviewer misses a bad line — it is that after
the sixth identical hunk they stop reading and start pattern-matching, which is exactly the state in
which the two real defects this task produced would have survived. Both are worth naming here because
they are the evidence for the verdict, not decoration:

- a `.includes('@bypass_rls reason:')` deleted quick-616's entire 22-line `generateTicketNumber`
  header — caught **only** because the `support` commit was one file and I read its diff in full;
- a botched applier patch wrote the literal `undefined` into **all 13** driver files, and **`tsc`
  reported nothing** (`fooundefined` is a valid identifier) — caught **only** because I grepped the
  emitted line rather than trusting the gate.

Both were caught in the *small* batches. Neither would have been caught by reading the 24-file diff.

**What I would do instead, for the four remaining surfaces.** Cap a reviewable commit at **~10 files
or ~250 changed lines, whichever comes first**, and split a sub-surface across several commits when it
exceeds that — `owner` would have been three commits of eight. The task boundary can stay at one
surface; the *commit* boundary is what needs to shrink. And carry the two guards this task earned
(exact-emitted-line assertion, and an annotation-form rather than substring match) into any future
mechanical applier, because they are what actually caught the defects — not the review, and not tsc.

## 6. Prior tasks' evidence — byte-identical at open and close

```
ALL 92 PRIOR-TASK EVIDENCE FILES BYTE-IDENTICAL at open and close
git status over .planning/quick/{604,605,606,616}-*   (empty = untouched)
```

92 files across four closed tasks, hashed at open into `05-prior-evidence-hashes.txt` and at close
into `05-prior-evidence-hashes-close.txt`. Both click-through passes shared the same `--out`, pointed
at **this** task's evidence directory, so quick-604's `04-click-through.json` — the one carrying byte
offsets into its own server log — was never a candidate for being overwritten. `616-bypass-census.ts`
was **deliberately not re-run** for the same reason; `617-repo-remainder.ts` reimplements its method
and writes here instead.

## 7. THE REMAINDER — MEASURED, and it is 108, not 92

```
census live population (quick-616)                 177
  − routed by quick-616                             −2
  = live at quick-617 start                        175
  − routed by quick-617                            −67      <- 67, NOT 83
  = expected remaining                             108
```

Measured, repo-wide, by `617-repo-remainder.ts`:

```
repo-wide remainder: 108 statements in 48 files (tests: 5, excluded)
  PASS  FLOOR — total statements >= 50 — 108 >= 50
  PASS  POSITIVE CONTROL — lib/auth/supabase.ts still yields its ARRAY-FORM statement — 1 at line 164
  PASS  COUNTER-ASSERTION driver/incidents/route.ts WAS READ — bytes=5685 parsed=true acquires=true
  PASS  COUNTER-ASSERTION driver/incidents/route.ts YIELDS ZERO — 0 === 0
  PASS  ARITHMETIC — measured 108 vs expected 108
```

**The brief's expected figure was 92, and the difference is fully explained rather than a discrepancy:
92 assumed all 83 MOBILE_API statements would be routed. 16 were stopped and reported, so
`92 + 16 = 108`.** MOBILE_API remains on the list below with exactly those 16.

### The remaining surfaces, re-derived from the measured remainder

| surface | files | statements | of which NOT a `getTenantPrismaForOrg` conversion |
|---|---:|---:|---|
| `LIB_SERVICES` | 15 | 44 | **6** — `BROKEN_POLICY` + `BOOTSTRAP` members. Not a 15-file repeat of this task |
| **`MOBILE_API` (this task's residue)** | **8** | **16** | 0 — all blocked on the `findUnique` + `select` decision |
| `API_V1` | 6 | 14 | **4** |
| `OWNER_PORTAL` | 4 | 7 | **5** — mostly `DECORATIVE` |
| `DRIVER_PORTAL` | 4 | 6 | **3** |
| `API_DRIVER` | 2 | 6 | **5** |
| `API_CRON` | 1 | 4 | 0 |
| `API_AUTH` | 2 | 3 | 0 |
| `API_DRIVER_PAY` | 1 | 2 | 0 |
| `API_GPS` | 1 | 2 | 0 |
| `API_INTEGRATIONS` | 2 | 2 | 0 |
| `API_PUSH_TOKENS` | 1 | 1 | 0 |
| `API_TRACK` | 1 | 1 | 0 |
| **total** | **48** | **108** | |

Re-derived from `06-repo-remainder.json` joined to the census matrix, not transcribed from the plan.

## 8. THE BYPASS DROP IS STILL BLOCKED

**108 executable `app.bypass_rls` statements remain across 48 files.** `bypass_rls_policy` cannot be
dropped and the `app_user` cutover stays blocked. This task removed 67 of 175 — 38 % — and it is the
largest single reduction in the programme so far, but it is not the last one.

---

## 9. One thing `npm run build` changed that this task reverted

The build regenerated two docs search indexes:

```
apps/web/.docs-data/admin-docs-search-index.json  | 98 +++++++++++---
apps/web/src/lib/docs/search-index.json           | 74 ++++++++++-
```

The content is unrelated to anything here — a `/carrier/route-templates` → `/carrier/templates` route
correction and new `document-import` entries. It is **pre-existing drift between the committed indexes
and what the build generates**, surfaced by running the gate, not caused by it.

**Reverted, not committed.** Shipping it inside a routing commit would be a change wearing a routing
fix's clothes, which is the one thing this task exists to avoid. Reported here so the next person
knows the drift is there and that a `npm run build` on a clean tree will keep producing it until
somebody commits it deliberately.
