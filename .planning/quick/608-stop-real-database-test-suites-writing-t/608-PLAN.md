# quick-608 — Stop the real-database test suites writing to production

## Problem

`docs/audits/production-test-writes.md`: ten suites create tenants in whatever `.env.local` names,
which is production. Their guard (`assertDisposable` + `PROTECTED_TENANT_ID`) protects a TENANT, not
a DATABASE, so it held perfectly while every run wrote to production.

## Census correction — TEN, not seven

The audit found seven `ZZ-THROWAWAY` suites. Three more create tenants and were missed because
their names are not `ZZ-`-prefixed, so no `LIKE 'ZZ-%'` sweep would ever surface them:

| file | tenant name | reaches prod today? |
|---|---|---|
| `tests/carrier/financial-integrity.test.ts:50` | `FI-Test-Tenant-${Date.now()}` | only if `DATABASE_URL` is exported |
| `tests/carrier/multi-tenancy.test.ts:47,54` | `MT-Test-OrgA/B-${Date.now()}` | same |
| `tests/carrier/contracted-route-journey.test.ts` | (creates via journey) | same |

They survive today only because they lack the hand-rolled `.env.local` loader — an accident, not a
guard. Production carries zero `FI-Test`/`MT-Test` tenants, confirming they have not yet fired.

## Design

### The guard is TWO mechanisms, deliberately

1. **`tests/setup/production-db-guard.ts` — a global `setupFiles` entry** in `vitest.config.ts` and
   `vitest.db.config.ts`. Runs in every worker before every test file. If the resolved
   `DATABASE_URL` names the production ref and `ALLOW_PRODUCTION_TEST_WRITES` is not `1`, it
   replaces `process.env.DATABASE_URL` with a **defined** refusal sentinel.

   **Defined, not deleted.** The seven hand-rolled loaders skip any key already present
   (`if (process.env[key] !== undefined) continue`), so deleting it would let them re-read
   `.env.local` and restore production. A sentinel is the only value the existing loaders honour.

2. **`tests/support/real-db.ts` — `requireDisposableDatabase()`**, which every data-creating suite
   calls instead of `const hasDatabase = !!process.env.DATABASE_URL`. It turns the sentinel into a
   **throw at import**, before any row exists.

**Why both.** The setup file is what a new suite cannot bypass — it is applied by the runner, not
by the file. The helper is what makes the block LOUD rather than a silent skip, and the audit's
whole complaint about `tests/isolation/` was a suite that reported green having never run.

**What happens if someone bypasses the helper.** They read `process.env.DATABASE_URL`, get the
sentinel, and their connection fails — they cannot reach production. They lose the good error
message, not the protection. `tests/security/real-db-census.test.ts` closes that gap at review time
by pinning the list of data-creating suites and asserting each calls the helper.

**Refusal semantics** (the three cases, stated so the skip/throw split is deliberate):
- `DATABASE_URL` absent → **skip**, unchanged. This is CI, and it must stay a skip.
- `DATABASE_URL` = production → **THROW**. A refusal, not a skip.
- anything else → run.

### Cleanup — a reserved teardown connection

`afterAll` deletes inside one `$transaction` on the app pool. Pool contention kills the test, then
kills the cleanup, and the all-or-nothing transaction means nothing is removed.

`teardownThrowawayTenant()` in `tests/support/real-db.ts`: its **own `pg.Pool`**, created at teardown
time, deletes in FK order **outside a transaction**, each statement retried with backoff, then
verifies and throws on survivors.

Chosen over "retry the transaction" because the diagnosed cause is *the pool*, and a retry on the
same exhausted pool retries into the same wall. Outside a transaction so a partial delete still
reduces the orphan instead of rolling back to nothing.

### The assertion that would have caught it

`scripts/audit/604-survey.ts` already reads production at `--open` and `--close` and diffs three
counts. Add total tenants + a name-pattern breakdown, and **fail the run** on any change.

## Tasks

1. `tests/support/real-db.ts` + `tests/setup/production-db-guard.ts`, wired into both vitest configs.
2. Convert all ten suites to `requireDisposableDatabase()`; move the seven `afterAll` bodies to
   `teardownThrowawayTenant()`. **No assertion changes** — only where a suite runs and how it cleans up.
3. `tests/security/real-db-census.test.ts` — the census gate.
4. Tenant-count assertion in `604-survey.ts`, proven to fail on a count change.
5. Proofs: refusal at the production ref (zero rows created); a normal staging run; a FORCED failure
   with the tenant confirmed gone.
6. Survey for other record-not-database guards. Report only.

## Constraints
- No installs. No production writes. No ZZ- tenant deleted. No assertion weakened.

## Gates
- `npm run build` exit 0, `tsc` 0 probed, suite failing-file set accounted for.
