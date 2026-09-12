# quick-593 — Make the migration chain replay from zero

**Date:** 2026-09-12
**Outcome:** **Blocked on a credential. Zero of the 10 repair cycles ran.**
One repair migration is written and its no-op property proven, but nothing was
applied, so the number of chain gaps remains unknown.

Log: [`docs/audits/migration-chain-repair.md`](../../../docs/audits/migration-chain-repair.md)

---

## Baseline confirmed

Staging had not drifted: **37** applied migrations, **0** unfinished ledger
rows, **38** tables, last applied `20260329000001_add_load_sequence`.

## What was produced

- **`20260330000001_repair_document_driver_id`** — adds `"Document"."driverId"`
  plus its foreign key. Sorts between the last applied migration and the
  failing one. Both halves are guarded, and both are **provably no-ops against
  production** because both objects were read back from production first:
  the column from `information_schema.columns` (`uuid`, nullable, no default)
  and the constraint from `pg_get_constraintdef`
  (`FOREIGN KEY ("driverId") REFERENCES "User"(id) ON UPDATE CASCADE ON DELETE SET NULL`).
  `ADD CONSTRAINT` has no `IF NOT EXISTS` in PostgreSQL, so the FK is guarded by
  a `DO` block testing `pg_constraint` rather than by a bare statement.
- **The repair log**, with cycle 1 recorded in full and the budget stated.
- **`apps/web/.env.staging`** (gitignored, not committed) — now persists both
  `postgres` keys with the right host, ports and pooler conventions.

## Why it blocked

Two credential failures in a row, neither of them a chain problem.

1. The password lived only in a scratchpad file outside the repo and was
   deleted between sessions.
2. The replacement was the literal text `PASTE_PASSWORD_HERE`, which failed
   authentication on both ports. Diagnosed without printing the secret: 19
   characters of `[A-Z_]` only, which is not the shape of a Supabase password,
   then an exact match against a known placeholder. A field-based connection
   bypassing URL encoding failed identically, ruling out an encoding fault.

## Judgement corrected from quick-592

quick-592 declined to write `.env.staging` on the grounds that a file with one
real key and two placeholders was worse than none. That was wrong in one
respect: it also discarded the key that did exist, and the cost appeared
immediately as a blocked session. The file now exists with the two knowable
keys; the unknown password is the literal token `PASSWORD_NOT_SET` so the
strings fail loudly rather than looking usable. `STAGING_DATABASE_URL_APP_USER`
is absent rather than tokenised, because that role genuinely does not exist.

## Safety check worth keeping

Project memory records a hook firing on every `migration.sql` write that runs
`prisma migrate deploy`. **No such hook is configured** — only a GSD
session-start update check. This was verified *before* writing any migration
file, since such a hook would have applied repair migrations to production.
The memory note is stale.

## Next

Supply the real password, either in the scratchpad handoff file or by replacing
`PASSWORD_NOT_SET` in `apps/web/.env.staging` directly, then re-run. Cycle 1 is
ready to apply and the loop continues from there.
