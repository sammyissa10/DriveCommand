# quick-582 — `app_user` grant coverage audit (+ DEC-17 correction)

**Date:** 2026-09-02
**Type:** read-only diagnostic + one documentation fix. **No source code, no DDL, no DML.**

Report: [`docs/diagnostics/app-user-grant-coverage.md`](../../../docs/diagnostics/app-user-grant-coverage.md)

---

## What was asked vs what was found

The brief expected a grant audit. The grant gap turned out to be the *small* half.

| step | expected | found |
|---|---|---|
| 1–2 | unknown number of tables missing grants | **9 of 98**, zero partial |
| 3 | class (b) = `carrier_documents` (1 known) | **3** — `stops` and `route_template_stops` too |
| 4 | sequence grants may be a hidden failure | **0 sequences exist** — risk is structurally absent |
| 5 | one-time or ongoing? | **ongoing** — `app_user` is in no default ACL |
| 6–7 | find the rest of the silent-fallback sites | 7 that degrade silently; 2 are catastrophic |

## The finding that explains all nine

The correlation is exact, and no query in the brief would have surfaced it:

| RLS enabled | granted | tables |
|---|---|---|
| false | false | 8 |
| true | false | 1 (`_prisma_migrations`) |
| true | true | 89 |
| **false** | **true** | **0** |

**Not one table has RLS off and a grant.** The quick-419 sweep was driven off the
RLS-enabled table list, so **exempting a table from RLS silently exempted it from grants.**
Seven of the eight are exactly the Section 4.12 RLS-advisor allowlist; the eighth
(`route_matrix_cache`) was created after the sweep and inherited the same coupling.

quick-520 and quick-581 each found one of these and reported it as a one-off. It is not a
one-off — it is a rule that keeps producing them, and §5 of the report shows it is still
active: `app_user` appears in **no** default ACL, so every future table repeats the defect.

## The three class (b) tables — worse than the grant gap

`stops`, `route_template_stops`, `carrier_documents`: FORCE RLS, **zero policies**, and
**full CRUD grants**. A grant-only audit would have passed them.

Project memory records these three as having had broken `auth.jwt()` policies *rewritten* to
join-based expressions. **The rewrite is not in the database.** The old policies were dropped
and the replacements never landed. Confirmed against both `pg_policy` and `pg_policies`;
`facilities` in the same family correctly shows 2 policies, so the tooling reads right.

FORCE applies to the owner too — only `postgres`'s `BYPASSRLS` hides this today.

## The two sites that will lie rather than fail

Both convert a permission error into confident-looking success:

1. **`dispatcher.ts:87` → outer catch `:626`.** On cutover the template read throws
   `permission denied`; the catch logs to console, sets `failed++`, and **returns normally
   without rethrowing**. All 47 triggers stop delivering and callers see success. The audit
   trail is absent too — the failure precedes any audit push, so the `finally` writes an
   empty array. quick-548's lesson at system scale.
2. **`migrate.mjs:38`.** Reads `_prisma_migrations` to decide what to skip. That table is
   class (a)+(c), so to `app_user` the query returns **zero rows with no error** — every
   migration looks unapplied and all 141 re-run. Idempotent DDL survives; a seed `INSERT`
   does not.

The class distinction matters and is stated in the report: **class (a) throws** (loud unless
caught), **classes (b)/(c) return zero rows with no exception at all** — no `try/catch` can
help, because nothing is thrown.

Six further class (a) sites (`grid_preference`, `grid_view`, admin `Plan`/`Promo`,
notification settings pages) fail **loudly** with a 500. Listed as cutover breakage but
explicitly marked the *good* case.

## Method notes worth keeping

- **`has_table_privilege('app_user', c.oid, …)` is authoritative here**, not
  `information_schema.role_table_grants` (which shows only what the current role can see).
  Safe because `app_user` is a member of no role, so a privilege reaches it only directly or
  via `PUBLIC`.
- **Cross-checked with `aclexplode`** to separate direct grants from `PUBLIC` grants —
  `has_table_privilege` cannot tell them apart. Result: **89 direct, 0 via `PUBLIC`**; both
  methods agree exactly.
- **Identifiers resolved by `pg_class.oid`, never by casting a string to `regclass`.** This
  DB mixes PascalCase and snake_case and quick-581 §1.1 already lost a query to that.
- One `SELECT` per `execute_sql` call — the last-statement-only trap.
- A `trips` table does not exist (the model maps elsewhere); its apparent zero-policy count
  was an artefact of `GROUP BY` emitting no row, not a finding. Checked rather than assumed.

## Step 8 — DEC-17 corrected

`CLAUDE.md:398`, one line replaced, file length unchanged at 480 lines, `git diff --numstat`
= `1 1`. No other entry touched.

The old opening claim (`apply_migration` "does both") is replaced with what quick-581
observed: **neither MCP tool writes `_prisma_migrations`**; `apply_migration` writes
Supabase's own ledger, a different table. The procedural rule that caught it is kept
verbatim, and both consequences are added — a seed `INSERT` re-runs and duplicates, and
`_prisma_migrations` is itself class (c) so a read-back from a non-owner returns zero rows
and looks identical to "never written", prompting a duplicate write.

## Verification

- `git status` shows nothing under `apps/` or `packages/` — no source file touched.
- No `apply_migration` call. No grant, revoke, alter or create. No connection string changed.
- No silent-fallback site fixed — this is a diagnostic, as instructed.

## Assessment (short form; full version ends the report)

**Multi-session, not a single migration.** The grants themselves are nine statements plus an
`ALTER DEFAULT PRIVILEGES`. What makes it multi-session is what the audit uncovered: three
core carrier tables need tenant-isolation policies *authored* before `app_user` goes near
them, and the silent sites must be made loud *before* the cutover rather than after.
Suggested order: policies for class (b) → make the seven silent sites loud → grants +
default privileges → staging verification as `app_user`.

**Highest-risk table: `stops`.** Operationally central, ~50 access sites (34 of them nested
`stops: { … }` includes no table-name grep would find), reads return empty with nothing to
catch, writes fail loudly. A dispatcher sees an itinerary with no stops and cannot tell
whether the trip is empty or the database refused to answer.
