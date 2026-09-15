# Script connection resolution — quick-607

How a terminal script decides which database it is talking to, what that decision used to be,
and which previously-published measurements are affected by the change.

---

## 1. The defect

`apps/web/scripts/_bootstrap-env.ts`, lines 53-55 at HEAD~1:

```ts
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
```

Unconditional. `.env`, `.env.local` and `apps/web/.env.local` all point `DIRECT_URL` at
**production**. So `DATABASE_URL=<staging> npx tsx scripts/audit/rls-policy-drift.ts` read
production, and said nothing about it.

Measured directly, running HEAD's bootstrap verbatim with a staging pin
(`evidence/03-old-rule-BEFORE.txt`):

```
Operator pins DATABASE_URL at staging (wyixpgunnjmzguhggocz) and runs the script.

-- OLD rule (HEAD's _bootstrap-env.ts, verbatim) --
OLD RULE resolved DATABASE_URL to project ref: oqdhberkghtnszrkdvfm
```

Two audits had recorded consequences of this line separately, and neither connected them:

- `app-user-failure-remediation.md` §8 item 8 — the drift detector measures production while
  reporting as though it measured whatever was configured. Read-only; a false measurement.
- `phase-0-verification-gates.md` — `createTestTenant()` writes into whatever `DATABASE_URL`
  names, and "the only thing standing between this file and tenants written into the production
  database was a constructor that happens not to compile". A production-write hazard.

**Neither of those is the thing that makes it dangerous.** A read against the wrong database is
survivable and the write hazard never fired. What made both possible is that a script could run
to completion, print `RESULT: CLEAN`, and never state which database produced that answer.

---

## 2. The census

`_bootstrap-env` is NAMED in 27 files and IMPORTED by **four**. The other 23 mention it in prose
while deliberately building their own `STAGING_*` pools — they are documenting the hazard, not
exposed to it. A substring grep reports the exposure as six times larger than it is, the same
shape as quick-602's `withTenantContext` count (3 matches, all comments, on a tree with zero call
sites).

| # | script | what it does | writes? | targeted BEFORE | operator expected |
|---|---|---|---|---|---|
| 1 | `scripts/audit/rls-policy-drift.ts` | replays the migration corpus, diffs against live `pg_policy` | **no** — `SELECT` on `pg_catalog` only | production, always | whatever was pinned |
| 2 | `scripts/audit/app-user-connection-harness.ts` | measures what `app_user` can see and do | **no** — DML only inside `BEGIN`/`ROLLBACK`, no commit statement anywhere | production, always | production (intended) |
| 3 | `scripts/test-extraction.ts` | live extraction + page-cache test via `beginImport()` | **YES** — inserts `document_imports`, `document_import_pages` | production, always | a disposable database |
| 4 | `scripts/test-pdf-import.ts` | live per-page PDF import via `putObjectBytes()` + `startImport()` | **YES** — the same, plus R2 object puts | production, always | a disposable database |

**The writers are #3 and #4.** Both were one command away from writing to production, with no
flag, no prompt and no statement of target.

Two further bare-`DATABASE_URL` writers do **not** import the bootstrap and already carried their
own hardcoded production refusal from quick-598: `tests/security/db-fixture-setup.ts` and
`tests-db/rls-isolation/env.ts`. Left in place — they are defensive duplicates that agree with
the new central rule.

---

## 3. The resolution rule

**Honour an explicitly-set `DATABASE_URL`; fall back to `DIRECT_URL` only when the operator
pinned nothing.**

"Explicitly set" means present in `process.env` **before any dotenv load**, captured at module
top in `_bootstrap-core.ts`. This is the whole mechanism: dotenv is non-overriding, so *after* the
load an inline pin and a file value are byte-identical. The distinction exists only before the
first load, so it is taken before the first load.

`resolveScriptDatabaseUrl` in `scripts/_db-target.ts`, five rungs:

| rung | condition | result |
|---|---|---|
| 1 | both pinned, **same** project ref | the pinned `DIRECT_URL` — keeps the 6543→5432 port fix inside the operator's chosen project |
| 2 | both pinned, **different** project refs | **REFUSE** |
| 3 | only `DATABASE_URL` pinned | used **verbatim** |
| 4 | only `DIRECT_URL` pinned | used |
| 5 | nothing pinned | file `DIRECT_URL`, else file `DATABASE_URL` |

**What breaks for existing callers: nothing.** Every caller that relies on the port fix pinned
nothing and lands on rung 5, which is the historical behaviour exactly. The documented "export
both variables" workaround lands on rung 1 and still works. CI (`.github/workflows/rls-policy-drift.yml`)
sets `DATABASE_URL` and deliberately leaves `DIRECT_URL` unset — rung 3 — so it keeps working, and
now for a principled reason instead of a quirk it was relying on.

Rung 2 is the only new refusal, and it fires only on an operator mistake. Silently picking one of
two conflicting pins is the defect itself.

**Rejected alternatives.** *Require both explicitly*: breaks every bare `npm run audit:*`.
*Separate the migration connection from the script connection entirely*: already separate —
`scripts/migrate.mjs` does not import the bootstrap, and `DIRECT_URL` is deliberately left
untouched by the resolver because `_prisma_migrations` has RLS enabled, zero policies and no
`app_user` grant, so a de-privileged migration connection reads zero rows with no error.

---

## 4. The banner

Every bootstrapping script now prints its resolved target **to stderr** before doing anything.
stderr, not stdout, because `--json` payloads are piped into `jq` and quick-585 already had to
remove three non-JSON stdout lines for exactly that reason.

Quoted from a real run, `DATABASE_URL` pinned at staging (`evidence/02-drift-staging-AFTER.txt`):

```
[db-target] script   : rls-policy-drift.ts
[db-target] project  : wyixpgunnjmzguhggocz (staging)
[db-target] host     : aws-0-us-west-1.pooler.supabase.com:5432
[db-target] role     : postgres
[db-target] resolved : explicit DATABASE_URL
[db-target] intent   : read-only
```

`resolved : explicit DATABASE_URL` is rung 3 — the rung the old code discarded.

---

## 5. The writer guard

**A script does not declare itself a writer. It declares itself READ-ONLY, by importing
`_bootstrap-env-readonly` instead of `_bootstrap-env`. Everything else is a writer.**

The direction of that default is the entire safety property. A new script whose author thinks
about none of this refuses production loudly. The inverse — writers opting in — cannot work,
because the failure mode of forgetting is a silent production write and nothing downstream can
distinguish "declared read-only" from "never considered it". Same idiom as the T3/T4 facility
verdict union: make the wrong state unrepresentable rather than adding a check an edit can drop.

Read-only scripts may target production freely; `audit:rls-policy-drift` and
`audit:app-user-harness` exist to measure it.

A writer that resolves production refuses with exit 1 unless `--allow-production` (or
`ALLOW_PRODUCTION_WRITES=1`) is passed. `evidence/04-writer-refuses-production.txt`:

```
$ npx tsx scripts/test-extraction.ts
[db-target] script   : test-extraction.ts
[db-target] project  : oqdhberkghtnszrkdvfm (PRODUCTION)
[db-target] resolved : file DIRECT_URL (port fix; nothing pinned)
[db-target] intent   : writes

[db-target] test-extraction.ts REFUSING TO RUN - it resolved the PRODUCTION project
(oqdhberkghtnszrkdvfm) and it is not declared read-only.

  resolved via : file DIRECT_URL (port fix; nothing pinned)
  connection   : postgresql://postgres.oqdhberkghtnszrkdvfm:***@aws-1-us-west-1.pooler.supabase.com:5432/postgres
```

exit code 1, measured directly. The password is masked; the ref is not.

### What stops a new script forgetting

1. **The default is the writer door.** Forgetting is safe.
2. **`tests/security/script-db-target-guard.test.ts` pins the census both directions.** The set of
   files importing each door must equal a declared list exactly, so moving a script onto the
   read-only door is a reviewable one-line diff rather than an invisible change of posture.
3. **The default itself is asserted.** If `_bootstrap-env.ts` is ever switched to `read-only`,
   every unexamined script in the repo silently gains production-write access — so a test asserts
   it says `bootstrapScriptEnv('writes')`.
4. **The literal defect is asserted absent** — `process.env.DATABASE_URL = process.env.DIRECT_URL`
   must not reappear in the core.

All four were proven to fire red before being trusted (`evidence/01-guard-fires-red.txt`):
flipping the default to `read-only` fails 1 test; moving a writer onto the read-only door without
declaring it fails 2.

**The read-only claim is checked by a human, not by the runtime.** Nothing here can prove a script
issues no writes. The census is what makes that review possible; it is not a substitute for it.

---

## 6. Which previously-published claims are affected

The question: every task in this phase that cited "drift CLEAN against staging" may have measured
production instead. Which claims survive?

### 6.1 The divergence window, measured

Read off `_prisma_migrations` on both projects:

| migration | staging | production |
|---|---|---|
| `20260914170000_activation_progress_congrats_shown_at` | 2026-09-14 20:25Z | 2026-09-14 20:50Z |
| `20260914180000_tenant_context_tripwire` | 2026-09-15 **05:22Z** | 2026-09-15 **19:41:50Z** |
| `20260915120000_document_column_drift_staging_parity` | 2026-09-15 18:40Z | 2026-09-15 19:41:50Z |
| `20260915130000_grant_playbook_notification_to_app_admin` | 2026-09-15 18:44Z | 2026-09-15 19:41:51Z |

- **Before 2026-09-15 05:22Z** — aligned at head `20260914170000`.
- **05:22Z → 19:41:51Z** — **DIVERGED.** Staging carried the tripwire migration and production did
  not, so their `Tag` / `TagAssignment` policy bodies differed. This is the window in which a
  mis-targeted run would have produced a materially different answer.
- **After 19:41:51Z** — aligned again at `20260915130000`.

That last alignment is why a production run today is byte-identical to a staging one
(`evidence/06-drift-production-discriminator.txt`: 183 live, 0 missing, 0 unexpected, 0 definition
drift, `RESULT: CLEAN`). **The output alone cannot distinguish the two databases right now**, which
is precisely why the banner had to be added rather than a heuristic.

### 6.2 Claim by claim

**Confirmed to have measured staging by an independent signal — not merely by their own label:**

- **quick-602** (`602-SUMMARY.md:138`, `RESULT: CLEAN`, 0 definition drift). Ran just after
  applying the tripwire migration to staging only. Production at that moment lacked it, so against
  the freshly regenerated `rls-policy-canonical.json` production would have reported definition
  drift on `Tag` / `TagAssignment`. It reported **0**. Only staging can produce that.
- **quick-606** (`app-user-failure-remediation.md` §9, `evidence/10-rls-policy-drift-staging.txt`).
  Ran at ~18:4xZ, inside the diverged window, and reported 183 live with **0 definition drift**.
  quick-606's own §8 item 9 records that production's `Tag` bodies differed and that the gate
  "reports it as DRIFT DETECTED against production". 0 drift therefore means staging.

**Confirmed by documented invocation (both variables pinned, quoted in their own artefacts):**

- **quick-595** — the plan said to pin only `DATABASE_URL`; the executor **caught this at execution
  time**, pinned both, and wrote the correction into `rls-policy-grant-closure.md` §5.1 verbatim
  ("that is only half true and would have pointed the detector at **production**"). This is the
  origin of the "pin both, every time" convention every later task followed.
- **quick-597** (`597-SUMMARY.md:325`, "both vars pinned to staging"), **quick-598**,
  **quick-599** (`599-PLAN.md:577`), **quick-600** (`600-PLAN.md:617`) — each quotes
  `DIRECT_URL="<staging>" DATABASE_URL="<staging>"`. All ran before 05:22Z, when the two databases
  were aligned anyway, so even a mis-target would not have changed the numbers.

**Affected claims: none found.** No published drift result in this phase pinned only
`DATABASE_URL` and was left uncorrected. The one plan that specified the unsafe invocation
(quick-595) was corrected before it ran.

### 6.3 What is genuinely weakened

Not a wrong number — a **missing provenance**. Every drift transcript committed before quick-607
records what was measured and not *where*, so each rests on the surrounding prose rather than on
the artefact. The two forensic confirmations above exist because a definition-layer signal happened
to be available in that window; before 05:22Z no such signal exists, and those claims rest on their
documented invocation alone. That is thin, though in their case harmless, because the databases
were aligned.

From quick-607 onward every transcript carries its own `[db-target] project :` line, so the
question is answerable from the artefact.

### 6.4 Not affected at all

The 23 scripts that name `_bootstrap-env` in prose and build their own `STAGING_*` pools —
`597-policy-verify`, `599-policy-verify`, `600-admin-verify`, `601-provisioning-verify`,
`602-tripwire-verify`, `602-apply-staging`, the `604-*` and `606-*` families. Their targets were
never in doubt: they read `STAGING_DIRECT_URL` directly and refuse on the production ref.

---

## 7. What this task did NOT do

- **Did not touch what any script does** beyond connection resolution and the guard.
- **Did not de-privilege `DIRECT_URL`.** `migrate.mjs` needs it privileged; the resolver never
  assigns to it, and a test asserts that.
- **Did not unify the 26 files that hardcode the production ref.** `_db-target.ts` names it once
  for new code; the existing per-file constants all agree, and rewriting 26 files is risk without
  benefit. Recorded as known duplication rather than silently left.
- **Did not install anything.**

## 8. One thing went wrong, and it was mine

While demonstrating the `--allow-production` escape hatch I ran `test-extraction.ts` against
production with the flag set, twice. It did what the flag says: two `document_imports` rows and
eight `document_import_pages` rows were written to production, and the second run superseded the
first. Neither was committed (`committed_at` null, `created_trip_id` null), no pre-existing record
was touched, and no R2 objects were written. All ten rows were deleted; `document_imports` is back
to its pre-existing count of 26, with zero orphan pages. Full detail, including the verification
queries, in `evidence/05-production-write-incident.md`.

The guard itself behaved correctly — the plain invocation refused with exit 1. The lesson is about
the override: **do not run a writer with `--allow-production` to demonstrate `--allow-production`.**
The banner alone was sufficient evidence of the warning line.
