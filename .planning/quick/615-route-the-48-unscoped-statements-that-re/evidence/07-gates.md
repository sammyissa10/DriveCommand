# quick-615 evidence 07 — every gate, with what it measured

---

## 1. `tsc --noEmit` — and the PROOF it is not blind

```
$ npx tsc --noEmit
(no output)          EXIT 0
```

A clean run is worth nothing on its own (CLAUDE.md: a parse error anywhere in
the program suppresses semantic checking of everything, and `.next/dev/types`
has done exactly that before). So the gate was **probed**:

```
$ printf "\nconst __quick615_probe: number = 'y';\n" >> "src/app/(admin)/actions/users.ts"
$ npx tsc --noEmit
src/app/(admin)/actions/users.ts(171,7): error TS2322: Type 'string' is not assignable to type 'number'.
EXIT 2
```

tsc reported **THAT** error, in a file quick-615 actually edited. The gate sees
this task's source. The probe was then removed from a copy taken before the
append:

```
$ git diff --stat -- "src/app/(admin)/actions/users.ts"
(no output — byte-identical)

$ grep -rn "__quick615_probe|__probe|const x: number = 'y'" src/ scripts/ tests/
NO PROBE LEFT IN THE TREE

$ npx tsc --noEmit
EXIT 0
```

(quick-519 found a previous run's `__probe.ts` still sitting in the tree. The
sweep above is why this one does not.)

Re-run and still 0 after the Task 6 cron restructure.

---

## 2. `npm run build`

```
✓ Compiled successfully in 36.4s
BUILD EXIT: 0
```

Run twice — once after Task 5, once after the Task 6 restructure. Both exit 0.

The build rewrites `apps/web/.docs-data/admin-docs-search-index.json` and
`apps/web/src/lib/docs/search-index.json` as a side effect; both were reverted
to HEAD so the tree is clean.

---

## 3. `npm run audit:rls-policy-drift` — CLEAN, and the database it measured

**Database measured: STAGING `wyixpgunnjmzguhggocz`**, pinned explicitly on the
command line (`DATABASE_URL=postgresql://postgres.wyixpgunnjmzguhggocz:***@aws-0-us-west-1.pooler.supabase.com:6543/postgres?pgbouncer=true`,
credential masked). **The script does not print its own target** — a gap against
quick-607's rule that an operator must never have to infer the database, and
worth its own task; it is named here so this transcript is auditable.

```
  Migration files read     : 162
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

RESULT: CLEAN (exit 0) — repo and database agree on policy NAMES and BODIES.
```

**Exit 0, not exit 3.** Exit 3 would mean the definition layer did not run
because the canonical artefact is stale, and a clean NAME layer alone would then
be evidence of nothing. It ran: 186 policies compared, 0 drift.
`rls-policy-canonical.json` was **NOT** regenerated, correctly — quick-615 ships
two GRANT migrations and changes no policy.

The `162 migration files read` matches staging's 162 `_prisma_migrations` rows
exactly, which is a second, independent check that the two ledger rows this task
wrote and the one it retired all landed.

---

## 4. `bypass_rls_policy` — 86 before and after, as a SORTED TABLE LIST

Not as a count. Taken from `02-before.json` and `05-after.json`, both read from
`pg_policy` joined to `pg_class`:

```
bypass_rls_policy tables BEFORE: 86   AFTER: 86
sorted lists identical: true
only in BEFORE: []
only in AFTER : []
```

The `--apply` run asserts the same thing across the migration itself:
`86 before, 86 after — sorted list identical: true`.

**The bypass drop was not begun, and neither was the cutover.**

---

## 5. The vitest suite — SAME reporter both directions, failing-FILE set compared

Both runs `npx vitest run --reporter=json`. **Never `--reporter=basic`** — it
does not exist in vitest 4 and exits 0 having run zero tests.

Baseline method: **`git checkout 99330747 -- <the 13 tracked files quick-615
modified>` in the MAIN tree**, with the three NEW files moved aside, then
`git checkout HEAD -- apps/web` to restore. Not a `git worktree`: that does not
carry the gitignored `apps/web/.env.local` and the skew reads like a regression
(quick-567). No `next dev` was running. The AFTER measurement was taken **after
the last code commit** (quick-561).

| | suites | tests | passed | failed | pending | failing FILES |
|---|---|---|---|---|---|---|
| **BEFORE** (`99330747`) | 717 (662 / 55) | 2129 | 2010 | 64 | 52 | **25** |
| **AFTER** (`1dbc11c7`) | 717 (662 / 55) | 2129 | 2010 | 64 | 52 | **25** |

```
failing-FILE set identical: true
fixed by 615   (failing BEFORE, not AFTER): none
BROKEN by 615  (failing AFTER, not BEFORE): none
```

Every number identical, and the failing-FILE SET identical, not merely its size.

The 25 pre-existing failures are unrelated to this task and predate it — the
`workflows-*`, `driver-pay` golden, `document-import-commit-*`, `carrier/*`,
`rls-policy-replay` and `unit/auth` files. Most are the real-database suites the
test guard refuses because `DATABASE_URL` on this machine resolves to
production (`[test-db-guard] Real-database suites will REFUSE to run`) — an
environment fact, not a regression.

### The intermediate run that found two REAL regressions

A first AFTER measurement, taken before the Task 6 fixes, reported **27** failing
files — `tests/cron/automations.test.ts` and
`tests/security/wrapper-migration-countdown.test.ts` newly red. Both were real
and both were fixed rather than suppressed:

1. **`tests/cron/automations.test.ts`** disproved Task 4's own reasoning. It
   injects its failure AT `getTenantPrismaForOrg`, so the SECOND acquisition the
   plan recommended — placed above the `try` to "preserve attribution" — became
   the one that threw, outside the recorder's reach, silently turning quick-603's
   contract into a 500 for the whole run. The same test pins the acquisition
   count at `M * RULES`, which a double acquisition breaks outright. Fixed by
   collapsing to ONE acquisition inside the `try`, with the dedup block moved in
   beside it; the test's double moved with the receiver and **only** the
   receiver, every assertion byte-identical. Full account in commit `5eaf7398`.
2. **`tests/security/wrapper-migration-countdown.test.ts`** — the artefact went
   stale. `unmigratedCallSites` **478 → 479**, because `runEvaluator` now holds
   two `getTenantPrismaForOrg` calls (`:80`'s new one and `:227`'s existing).
   `unmigratedUnits` stays **475** — the unit is the FUNCTION, already counted.
   `app/api/cron/automations/route.ts` stayed at 1 call site; only its line moved,
   164 → 184. **Regenerated with `npm run audit:wrapper-countdown`, never
   weakened.** The number going UP is the honest direction (quick-610's finding,
   reproduced).

---

## 6. The allowlist gate — witnessed RED, then GREEN

`06-allowlist-gate-fires.md`, verbatim both ways. 23 → 31 entries,
48 → 66 calls, all grep-measured. No `minBytes` lowered.

---

## 7. The click-through harness — WHY IT DID NOT RUN

quick-614 recorded that it cannot run on this machine. **Re-checked, and the
blocker still holds:**

```
$ grep -m1 '^NEXT_PUBLIC_SUPABASE_URL=' apps/web/.env.local
NEXT_PUBLIC_SUPABASE_URL=https://oqdhberkghtnszrkdvfm.supabase.co
```

That is the **PRODUCTION** project ref. `scripts/audit/604-click-through.ts`
needs a real signed-in session, and obtaining one means authenticating against
**production auth** — a write to production's auth subsystem, and it would mean
starting a dev server pointed at production auth. Both are refused by this
task's absolute limits.

**So it did not run, and nothing weaker was substituted in its place.** No
partial harness, no unauthenticated page fetch dressed up as a click-through.
The statements are instead proven at the SQL layer by the 56-cell per-file
matrix in `05-after.md`, which is a different and in some ways stronger
instrument — it measures both directions on the real roles with the tripwire
armed — but it is **not** a substitute for exercising the rendered surfaces, and
that gap is real.

Closing it needs a staging Supabase project's `NEXT_PUBLIC_SUPABASE_URL` and
anon key on this machine. That is its own task.

**quick-604's evidence is untouched** — the harness was never invoked, so
`604-click-through.ts`'s `--out` hazard (passes 1 and 2 overwrite quick-604's
artefacts without it) never arose. `git status` over
`.planning/quick/604-*` is empty.

---

## 8. Production

Never written. Every instrument refuses the production ref **positively** before
issuing a statement — the connection string must contain `wyixpgunnjmzguhggocz`
and naming `oqdhberkghtnszrkdvfm` is a hard stop. Every run printed
`[db-target] project : wyixpgunnjmzguhggocz (staging)` to **stderr**, credential
masked, before opening a connection.

Both migrations are committed and reach production on the next `vercel --prod`,
by a human, via `scripts/migrate.mjs`.

**A bonus verification that fell out of the baseline restore:** the SHA-256 of
each migration over LF bytes, computed from the temporarily-moved-aside copies,
matches the checksum written into staging's `_prisma_migrations` exactly —
`b2211f87…` and `ab04a89f…`. The committed file and the ledger row agree.
