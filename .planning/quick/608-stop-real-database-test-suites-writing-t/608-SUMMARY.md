# quick-608 — SUMMARY

Stop the real-database suites writing to production, and add the assertion that would have caught
it. Full record: `docs/audits/production-test-writes.md` (Addendum).

## Census correction: TEN suites, not seven

quick-607's audit searched for `ZZ-THROWAWAY` and found seven. Three more create tenants named
`FI-Test-Tenant-…` / `MT-Test-OrgA/B-…` — invisible to any `ZZ-` sweep:
`financial-integrity`, `multi-tenancy`, `contracted-route-journey`. Production holds zero such
tenants, so they never fired — but only because they lack the hand-rolled `.env.local` loader, which
is an accident, not a control. **A name prefix is not a census.**

## 1-2. The guard, and why it is two mechanisms

| | mechanism | what it gives |
|---|---|---|
| **setup** | `tests/setup/production-db-guard.ts`, a global `setupFiles` entry in BOTH vitest configs | applied by the RUNNER, so a suite is covered without importing anything. Replaces a production `DATABASE_URL` with an unroutable sentinel |
| **helper** | `requireDisposableDatabase()` in `tests/support/real-db.ts`, called at module scope by all ten | **throws at IMPORT**, before `beforeAll`, therefore before any row exists. Re-checks the resolved string, which covers the file-sourced case |

- **Sentinel, not delete** — the ten loaders skip keys already defined, so a deleted `DATABASE_URL`
  would be re-read from `.env.local` and production restored one line later.
- **Only when already set** — the first draft also fired on an absent `DATABASE_URL` with production
  in `.env.local`. That invented a `DATABASE_URL` for the whole run and flipped six always-skipping
  suites to failing (16 newly red files, none a real defect). Measured, reverted, documented.
- **Bypass**: impossible to reach production (sentinel → 127.0.0.1:1); what is lost is the message.
  `tests/security/real-db-census.test.ts` pins the ten and the two config lines; **both halves
  witnessed red**.

## 3. Refusal and staging proofs

```
$ npx vitest run tests/carrier/document-import-commit-rollback.test.ts
❯ tests/carrier/document-import-commit-rollback.test.ts (0 test)

document-import-commit-rollback.test.ts REFUSING TO RUN — DATABASE_URL names the
PRODUCTION project (oqdhberkghtnszrkdvfm).
```

Production tenant count **32 before, 32 after, 0 created recently**. Zero tests collected — the
throw is at import.

```
$ DATABASE_URL="<staging>" npx vitest run tests/carrier/document-import-commit-rollback.test.ts
✓ tests/carrier/document-import-commit-rollback.test.ts (9 tests) 55464ms
  Test Files  1 passed (1)       Tests  9 passed (9)
```

Staging left with **0** `ZZ-THROWAWAY` tenants.

## 4. Cleanup — proven with a FORCED FAILURE, not a green run

`teardownThrowawayTenant()`: its **own single-connection pool**, FK-ordered deletes **outside a
transaction**, per-statement retry, then re-count and throw on survivors. Aimed at the diagnosed
cause — the old teardown ran on the pool the test had just exhausted, and one transaction meant a
failure deleted nothing, which is why every orphan still has all its child rows.

A deliberate `throw` injected into the first test (reverted after):

```
× starts from a clean database for this tenant
Error: FORCED FAILURE — quick-608 teardown proof
Test Files  1 failed (1)      Tests  1 failed | 8 passed (9)
```

Staging afterwards: **`throwaway_left = 0`, `imports = 0`.** The tenant was cleaned up despite the
failure.

## 5. The assertion

`scripts/audit/604-survey.ts` reads `Tenant` count + throwaway-name breakdown at `--open`/`--close`,
inside `checks`, so it **exits 1**. First run: `tenants=32 (throwaway=9)` — the audit's own numbers.

Proven to fail by tampering the recorded open value (no production write):

```
FAIL production "Tenant" row count: open=31 close=32
FAIL production throwaway-named tenants (ZZ-/FI-Test/MT-Test): open=8 close=9
604-survey --close: PRODUCTION BASELINE MOVED.     exit code: 1
```

## 6. Other record-not-database guards — reported, NOT fixed

**`scripts/cleanup-test-tenants.ts` is the same shape and it DELETES.** Connects to
`process.env.DATABASE_URL` with **no ref check at all**; its only guard is
`ALLOWED_PREFIXES = ['FI-Test-','MT-Test-']` — a check on the record's NAME, not on which database it
lives in. Then deletes tenants through ~15 child tables and Supabase Auth. Its prefixes are exactly
the two suites the original audit missed. It needs quick-607's `_db-target` treatment.

Lesser: `db-fixture-setup.ts`'s `cleanupTestData()` deletes by broad name prefix database-wide;
`assertDisposable()` stays in all seven, correctly, as a second record-level check beneath the new
database-level one.

## Gates

| gate | result |
|---|---|
| `npm run build` | **exit 0** |
| `npx tsc --noEmit` | **exit 0**, probed (`TS2322` injected into `604-survey.ts` reported at the injected line, removed, re-run clean). A TS1005 parse error was hit mid-task and fixed — the blind-gate trap, caught by probing rather than trusting the 0. |
| full suite | 2122 tests / 64 failed / **25 failing files** |
| failing-file set | **18 baseline + exactly the 7** loader-carrying suites that now refuse production. The other three correctly skip; the six I briefly broke are back to skipping. Fully accounted for. |
| `npx eslint` | **NOT RUN, NOT CLAIMED** — no working entry point (quick-562) |

**Behaviour change, stated plainly:** on a machine whose `.env.local` names production, those seven
suites now **FAIL** instead of silently writing there. That is the intended outcome. They go green
by pointing `DATABASE_URL` at staging.

## Answers to the closing questions

- **Ten suites carry the refusal.** No data-creating suite is without it, and the census test fails
  if a new one appears.
- **No ZZ- tenant was deleted.** Production still holds all nine; removal remains a separate task.
- **Nothing was written to production.** The only production access was SELECT-only (the survey and
  read-only verification queries).
