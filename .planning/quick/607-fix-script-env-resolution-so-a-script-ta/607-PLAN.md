# quick-607 — Fix script env resolution so a script targets the database the operator intends

## Problem

`apps/web/scripts/_bootstrap-env.ts:53-55`:

```ts
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
```

Unconditional. `.env`, `.env.local` and `apps/web/.env.local` all point `DIRECT_URL` at
PRODUCTION. So any script importing `_bootstrap-env` targets production whatever the operator
pinned, and reports success without ever naming the database it touched.

Two prior findings, one line:
- `app-user-failure-remediation.md` §8 item 8 — `npm run audit:rls-policy-drift` reads production
  regardless of `DATABASE_URL`. Read-only; the hazard is a false measurement.
- `phase-0-verification-gates.md` §"The choice: DELETED, not repaired" item 1 — a production-WRITE
  hazard; the only thing between a fixture suite and production tenants was a constructor that
  happened not to compile.

## Census (Step 1) — real imports only

`_bootstrap-env` is named in 27 files. **Only 4 actually import it.** The other 23 mention it in
prose while deliberately building their own `STAGING_*` pools — the quick-602 grep-vs-AST shape.

| # | script | what it does | writes? | targets now | operator expects |
|---|---|---|---|---|---|
| 1 | `scripts/audit/rls-policy-drift.ts` | replays migration corpus, diffs vs live `pg_policy` | **no** — SELECT on `pg_catalog` only | production always | whatever was pinned |
| 2 | `scripts/audit/app-user-connection-harness.ts` | measures what `app_user` can see/do | **no** — DML only inside `BEGIN`/`ROLLBACK`, never commits | production always | production (intended) |
| 3 | `scripts/test-extraction.ts` | live extraction + page-cache test via `beginImport()` | **YES** — inserts `document_imports` / `document_import_pages`, writes R2 | production always | a disposable DB |
| 4 | `scripts/test-pdf-import.ts` | live per-page PDF import via `putObjectBytes()` + `startImport()` | **YES** — same, plus R2 object puts | production always | a disposable DB |

Two further bare-`DATABASE_URL` writers do NOT import the bootstrap and already carry their own
hardcoded production refusal (quick-598): `tests/security/db-fixture-setup.ts`,
`tests-db/rls-isolation/env.ts`.

## Resolution rule (Step 2)

**Honour an explicitly-set `DATABASE_URL`; fall back to `DIRECT_URL` only when the operator set
nothing.** "Explicitly set" = present in `process.env` **before any dotenv load**, captured at
module top. dotenv is non-overriding, so a file-sourced value is indistinguishable from an inline
pin *after* the load — capturing first is what makes the distinction possible at all.

Full ladder:
1. Both pinned, **same project ref** → use pinned `DIRECT_URL` (keeps the 6543→5432 port fix
   within the project the operator chose). This is the documented "pin both" workflow.
2. Both pinned, **different project refs** → **REFUSE**. Silently picking one is the entire bug.
3. Only `DATABASE_URL` pinned → use it verbatim.
4. Only `DIRECT_URL` pinned → use it.
5. Neither pinned → file `DIRECT_URL` if present, else file `DATABASE_URL` (historical behaviour).

**What breaks for existing callers: nothing.** Every caller relying on the port fix reaches rung 5
and is unchanged. Rung 2 is new and only fires on an operator mistake.

Rejected: *require both explicitly* (breaks every bare `npm run audit:*`); *separate the migration
connection entirely* (`migrate.mjs` does not import the bootstrap — already separate).

## Tasks

### Task 1 — `scripts/_db-target.ts`, the pure resolver
`projectRefOf`, `maskConnectionString`, `resolveScriptDatabaseUrl` (the 5-rung ladder),
`formatTargetBanner`, `assertWriteTargetAllowed`. Production and staging refs named once. Unit
tests.

### Task 2 — rewire `_bootstrap-env` + the read-only door + banners
- `_bootstrap-env.ts` → applies the ladder, prints the banner **to stderr** (stdout carries `--json`
  payloads — quick-585), enforces intent **`writes`** (default-deny).
- `_bootstrap-env-readonly.ts` → same, intent `read-only`; production allowed freely.
- Scripts 1 and 2 switch to the read-only door. Scripts 3 and 4 keep the writer door and gain the
  guard. Writer override: `--allow-production`.
- Declaration + fail-safe: **the default is WRITER.** A new script that forgets to declare anything
  refuses production loudly instead of writing to it. Frozen by
  `tests/security/script-db-target-guard.test.ts`, which pins the importer census so adding one is
  a reviewable diff.

### Task 3 — prove it, and re-assess the prior claims
Run the drift detector pinned at staging; run a writer at the production ref without the flag.
Quote both. Then state which prior "drift CLEAN" claims measured production.

## Constraints
- No package installs.
- Never write to production from this session.
- No change to what any script *does* beyond connection resolution and the guard.
- `DIRECT_URL` stays privileged — `migrate.mjs` needs it (`_prisma_migrations` has RLS on, zero
  policies, no `app_user` grant).

## Gates
- `npm run build` exit 0.
- Suite failing-file set unchanged.
- `npx tsc --noEmit` exit 0, probed per R8.
