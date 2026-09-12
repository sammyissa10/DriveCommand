# quick-593 — Make the migration chain replay from zero

**Date:** 2026-09-12
**Outcome: the chain now replays from zero.** `Migrations complete`, exit 0.
**7 of 10 repair cycles used.**

Log: [`docs/audits/migration-chain-repair.md`](../../../docs/audits/migration-chain-repair.md)

---

## The finding

**Seven defects, of four distinct kinds, stood between this repository and its
own database.**

| # | Kind | Object |
|---|---|---|
| 1 | missing column | `"Document"."driverId"` |
| 2 | **invalid SQL** | `20260417100001` — window function in `UPDATE … SET` |
| 3 | missing column | `"FleetMessage"."recipientId"` |
| 4 | missing table | `carrier_compliance_alert_log` |
| 5 | missing enum type | `"DocumentType"` |
| 6 | missing column | `"Document"."documentType"` |
| 7 | missing grant | `app_user` DML on `TicketMessage` |

Six were closed with new forward migrations, each `IF NOT EXISTS` or equivalently
guarded and each **proved a no-op against production by reading the object back
from production first**. Two needed a `DO` block rather than a bare guard,
because `ADD CONSTRAINT` and `CREATE TYPE` have no `IF NOT EXISTS` form.

## The one edited file

`20260417100001_add_vehicle_id_display_name` used `ROW_NUMBER() OVER (…)` inside
`UPDATE … SET`, which PostgreSQL rejects at parse-analysis. No forward migration
could repair it, because the error precedes any data access.

The exemption rested on production's ledger row, quoted in full in the file
header and the log: `applied_steps_count = 0`, empty logs, `started_at =
finished_at`, a real SHA-256 checksum. That is the hand-mirrored
**resolved-not-run** signature (DEC-17), so the file has never executed
anywhere; the real change reached production as
`20260418184001_...` through the Supabase MCP path.

The edit was the minimum that makes it valid: a correlated subquery, ordered on
`("created_at", "id")` rather than `created_at` alone, because `COUNT(*)` gives
ties equal ranks and the same file later creates a **unique** index on
`vehicle_id`. Nothing else in the file was touched.

## Final state

| | Production | Rebuilt staging |
|---|---|---|
| Ledger rows | 141 | **147** |
| Repo migration directories | — | **147** |
| Unfinished ledger rows | — | **0** |
| Tables in `public` | 98 | **98** |

147 = 141 + 6 repairs, and the repo directory count matches the ledger exactly,
so nothing was skipped and no ledger row was hand-inserted.

## Schema diff, by query

91 of 97 shared tables have identical column sets once audit columns of both
casings are excluded. What remains:

- **Missing from the rebuild:** the table `grid_preference` (an eighth
  out-of-band object — no migration creates it; it appears only inside an
  allowlist of *names*, which is why it never caused a failure), plus **21
  columns across 6 tables** (`ActivationProgress`, `Document`,
  `DriverInvitation`, `FleetMessage`, `PayrollRecord`, `SupportTicket`).
  `FleetMessage.isBroadcast` is notable: `CLAUDE.md` documents it as part of the
  messaging model and no migration creates it.
- **Extra in the rebuild:** `policy_drop_audit`, expected, from quick-591's
  migration which production's ledger does not contain. Plus the TKT-0015
  camelCase audit columns, which the chain applies and production largely lacks.

**The real conclusion is not that seven defects were fixed.** It is that
production and this repository describe **different databases, and neither is a
superset of the other.**

The 21 columns and `grid_preference` are reported, not fixed — closing them is
eight more repair migrations and was beyond the remit of making the chain
replay.

## Left for the owner

`apps/web/.env.staging` carries **different passwords** in its two keys.
`STAGING_DIRECT_URL` authenticates on both ports and is what this task used;
`STAGING_DATABASE_URL` is untested. Not touched, as instructed. It should be
reconciled before Prompt 2 uses the transaction-mode key.

## Correction to a standing note

Project memory records a hook firing on every `migration.sql` write that runs
`prisma migrate deploy`. **No such hook exists** — only a GSD session-start
check. Verified before writing the first migration, since such a hook would
have applied all six repairs straight to production. The note is stale.
