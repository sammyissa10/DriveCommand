# Quick 591 — Arm the policy drift gate at zero, close the recurrence path

**Date:** 2026-09-09
**Mode:** quick
**Source:** `.planning/phase-0-revised.md` §3.1, §3.5, §5, §7;
`docs/diagnostics/rls-policy-drop-forensics.md` §4, §5

## Problem

The drift detector reports CLEAN with 59 missing and 8 unexpected policies
suppressed against a 2026-09-03 baseline — a shrinking baseline that never
shrank. The 59 are JWT-based policies that were structurally inert on the Prisma
connection before they were removed; they are not being restored. The 8 are live
Document Import policies applied out of band and never mirrored (DEC-17).

## Tasks

1. Reconciliation migration: DROP the 59 (already absent), DROP+CREATE the 8
   (already present, verbatim from `pg_policies`), header stating why the 59 are
   not restored. No edits to applied migration files.
2. Remove the suppression baseline from the drift script entirely; prove it
   exits non-zero via a deliberate discrepancy, then revert.
3. Wire the check into CI on every pull request, failing on non-zero.
4. Guard refusing `prisma db push` against a production `DATABASE_URL`.
5. `sql_drop` event trigger recording DROP POLICY into a durable table.
6. Enable pgaudit with `pgaudit.log = 'ddl'`; document as manual if privileged.
7. Fix five documents that instruct `db push` / `migrate dev`, resolving the
   contradiction against `scripts/migrate.mjs`.

## Constraints

- Target a Supabase preview branch. Production is never written.
- Do not restore any of the 59. Do not edit an applied migration.
- Do not touch `bypass_rls_policy`, grants, or the three zero-policy tables.
- No new packages. No application code changes.
