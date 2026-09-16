# quick-616 Task 5 — the gates, each with the database or tree it measured NAMED

---

## 5a. `tsc --noEmit` — **0, and PROVEN NOT BLIND**

**Tree measured:** the working tree at `d5fda366` + Task 5's edits, `apps/web`.

```
$ npx tsc --noEmit
TSC_EXIT=0
```

### The probe

`tsc` is blind when the only errors are syntax errors, or all in files this task did not touch, so a
clean run is not evidence on its own. A probe was injected into a file **this task actually edited**:

```
$ printf '\nconst __quick616_probe: number = %s;\n' "'y'" >> src/actions/support-tickets.ts
$ npx tsc --noEmit
src/actions/support-tickets.ts(642,7): error TS2322: Type 'string' is not assignable to type 'number'.
PROBE_EXIT=2
```

**That file, that line, that error.** The gate is looking at the code this task changed.

### The probe was deleted, and the deletion swept

```
$ grep -c "__quick616_probe" src/actions/support-tickets.ts      → 0
$ grep -rn "__quick616_probe|__probe" apps/web/{src,scripts,tests} → none
$ grep -rn "const x: number = 'y'" apps/web/{src,scripts,tests}    → none
$ npx tsc --noEmit                                                → TSC_EXIT=0
```

quick-519 found a previous run's `__probe.ts` still sitting in the tree; the sweep above is that
lesson applied. Nothing under `.next/dev/types/` needed deleting — no error was ever reported from
there, and the probe run proves semantic checking was live.

**One real TS error was found and fixed during the task**, not by the probe: `TS7022` in
`616-bypass-census.ts` (`const p = cur.parent` inside a `while` loop, inferred circularly). Annotated
`const p: ts.Node`.

---

## 5b. `npm run build` — **exit 0**

```
  Creating an optimized production build ...
✓ Compiled successfully in 35.6s
BUILD_EXIT=0
```

### One thing the build changed that this task did NOT commit

`npm run build` regenerates `apps/web/src/lib/docs/search-index.json` and
`apps/web/.docs-data/admin-docs-search-index.json` from `docs-content/`, and both came back
**modified** — 162 insertions across the two, including a route correction
(`/carrier/route-templates` → `/carrier/templates`) and nine new entries such as `document-import`.

**This is pre-existing drift between the committed indexes and what the build generates. It has
nothing to do with quick-616 and was REVERTED rather than swept into this task's diff.** Reported
here so it is not lost: someone should run the build and commit the regenerated indexes deliberately,
because the committed index is what `/help` reads and it currently names a route that does not exist.

---

## 5c. `npm run audit:rls-policy-drift` — **CLEAN, exit 0. Database: STAGING `wyixpgunnjmzguhggocz`**

quick-615 reported that this script **does not print its own target**. That is still true, so the
target was **pinned on the command line** and the ref resolved and printed by hand before the run:

```
$ export DATABASE_URL="<STAGING_DIRECT_URL, 6543→5432>"
$ export DIRECT_URL="$DATABASE_URL"
resolved ref: wyixpgunnjmzguhggocz
```

```
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

RESULT: CLEAN (exit 0)
DRIFT_EXIT=0
```

**The DEFINITION LAYER RAN** — 186 bodies compared, not exit 3. The canonical artefact is not stale,
so `rls-policy-canonical.json` was **not** regenerated: quick-616's migration creates a SEQUENCE and
two GRANTs and touches **no policy**, so there is nothing for the detector to have missed.

### A finding about the pinning itself, worth recording

The first attempt failed with `P2010 DatabaseNotReachable`, and the cause was not the database.
`dotenv` logs `[dotenv@17.3.1] injecting env (8) from .env.staging -- tip: …` **to stdout**, so a
`node -e "require('dotenv').config(...); process.stdout.write(url)"` used in a command substitution
puts that banner INTO the connection string. `{ quiet: true }` fixes it. Same family as quick-585's
"`--json` payloads pipe into `jq`": **a library that logs to stdout corrupts any value captured from
stdout.**

---

## 5d. vitest — **failing-FILE set IDENTICAL, measured with the same reporter both ways**

**Tree measured:** `apps/web`, `npx vitest run --reporter=json` in both directions. Never
`--reporter=basic`, which does not exist in vitest 4 and exits 0 having run zero tests.

| | suites | tests | passed | failed | pending | failing FILES |
|---|---:|---:|---:|---:|---:|---:|
| **BASELINE** (`3e08f6bc`) | 717 | 2129 | 2010 | 64 | 52 | **25** |
| **AFTER** (`d5fda366` + Task 5) | 717 | 2129 | 2010 | 64 | 52 | **25** |

**The failing-FILE sets are identical, element for element.** None fixed, none broken. The numbers
also match quick-615's published `717 · 2129 · 2010 · 64 · 52 / 25 files` exactly.

The AFTER run was taken **after this task's last source file was written** (quick-561's rule).
Task 6 writes only markdown, which cannot move a test.

### The baseline method, and the mistake it caught

`git stash` alone cannot produce this baseline — quick-616's work is **committed**, so there is
nothing to stash. quick-567's method was used instead: `git checkout <base> -- <the task-touched
files>` **in the main tree**, so the gitignored `apps/web/.env.local` stays present, then
`git checkout HEAD -- …` to restore. Never `git worktree`. `next dev` was stopped first.

Task-touched files restored: `src/actions/support-tickets.ts`,
`src/app/api/mobile/support/ticket/route.ts`, and the new migration directory (moved aside, because
`tests/security/rls-policy-replay.test.ts` parses `prisma/migrations/*/migration.sql` and would
otherwise have read a file the baseline does not have). The new `scripts/audit/616-*.ts` are imported
by no test and were left in place.

> **The first baseline used the WRONG revision, and the run caught it.** `11146846` was taken from
> the session-start context snapshot's "Recent commits" list. It is a real ancestor — quick-612 — but
> it is **fifteen commits older** than the true parent, because all of quick-615's commits sit
> between them. The run came back `2009 / 65 / 26 files`, with the extra failure being
> `admin-connection-allowlist.test.ts`: *"actions/support-tickets.ts: expected 4 getAdminDb( call(s),
> found 3"* — quick-615's own fourth `getAdminDb` call, absent at that revision.
>
> **A one-test, one-file difference is exactly what a real regression looks like**, and it would have
> been reported as one. `git log --oneline --graph` gave the true parent, `3e08f6bc`, and the
> corrected baseline matches the AFTER run exactly. **Take the baseline revision from `git log`,
> never from a context snapshot** — this is quick-561/565/567's baseline trap in its fourth distinct
> form.

---

## 5e. `bypass_rls_policy` — **86 before, 86 after, IDENTICAL SORTED TABLE LIST**

Measured **independently of Task 3's own instrument** — a separate script, reading the database
again, comparing against the list captured on disk before the drop.

```
[db-target] project : wyixpgunnjmzguhggocz (staging)  (credential MASKED)
BEFORE (captured, 2026-09-16T03:02:14.267Z) : 86
AFTER  (read now, independently)            : 86
only-in-before : none
only-in-after  : none
sorted list IDENTICAL : true
sha256(before) : 0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
sha256(after)  : 0fa356b932f1d8859d938883977c9e459fb477f7277957c22a59e176d443f8cd
VERDICT: PASS — 86 before, 86 after, identical sorted list
```

The two SHA-256s are of the sorted table list itself, so the comparison cannot be satisfied by a
count. Full output in `05-bypass-policy-count.txt`.

---

## 5f. Wrapper countdown — regenerated, **unchanged at 475 / 479**

```
wrapper-countdown
  files scanned              : 1691
  files with unmigrated units: 214
  UNMIGRATED UNITS           : 475
  unmigrated call sites      : 479
  withTenantContext( calls   : 0  <- anti-vacuity counter
```

Only the `generatedAt` timestamp changed in the artefact. **That is the correct result and it was
predicted:** quick-616 deliberately converted **no** wrapper-migration statement — the user's
decision, so the countdown stays the single place tracking them — and the sequence conversion adds
no `getTenantPrisma*` acquisition.

**No assertion was weakened.** quick-610's number went 469 → 475 and that was the honest direction;
here the honest direction is flat.

---

## 5g. The allowlist gate — unchanged, green, and nothing to witness red

`tests/security/admin-connection-allowlist.test.ts`: **9 tests, all passing, file unmodified.**

quick-616 added **no** `getAdminDb` call site, so there was no entry to add and no
`TOTAL_EXPECTED_CALLS` to raise. Adding one to demonstrate the gate, for a call site that does not
exist, would be theatre — and the gate was witnessed red by quick-600 and again by quick-615 on real
changes. It did fire for real during the botched baseline above, which is an incidental but genuine
demonstration that it still bites.

---

## Summary

| gate | result | measured against |
|---|---|---|
| `tsc --noEmit` | **0**, proven not blind (TS2322 at `support-tickets.ts:642`, probe deleted and swept) | the working tree, `apps/web` |
| `npm run build` | **exit 0**, `✓ Compiled successfully in 35.6s` | the working tree |
| `audit:rls-policy-drift` | **CLEAN exit 0** — 186/186, 0 missing, 0 unexpected, **definition layer RAN**, 0 body drift | **STAGING `wyixpgunnjmzguhggocz`**, pinned on the command line |
| vitest | **717 · 2129 · 2010 · 64 · 52, 25 failing FILES — IDENTICAL both ways** | `apps/web`, `--reporter=json` both directions, baseline `3e08f6bc` |
| `bypass_rls_policy` | **86 before, 86 after, identical sorted list**, hash-equal | **STAGING `wyixpgunnjmzguhggocz`**, independent instrument |
| wrapper countdown | **475 / 479 unchanged**, anti-vacuity counter still 0 | the working tree |
| allowlist gate | **9/9 green, unmodified** | the working tree |
