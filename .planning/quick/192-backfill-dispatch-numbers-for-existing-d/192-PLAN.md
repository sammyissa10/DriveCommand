# Quick Task 192 — Backfill Dispatch Numbers

## Objective
Rewrite the 12 existing auto-generated dispatches whose notes use the old
`[AUTO-GENERATED] dispatch_number=DC-YYYY-NNNNN` format to the new
`[DISPATCH_NUMBER=DC-YYYY-NNNNN] [AUTO-GENERATED]` format so the UI regex
`/\[DISPATCH_NUMBER=([^\]]+)\]/` can extract them.

## Root Cause
Quick-191 fixed the *generator* but existing rows were written before the fix.
No schema change needed — this is a pure data backfill.

## Plan

### Task 1 — Run backfill SQL against production DB
```sql
UPDATE dispatches
SET notes = regexp_replace(
  notes,
  '^\[AUTO-GENERATED\] dispatch_number=(DC-[0-9]+-[0-9]+)(.*)',
  '[DISPATCH_NUMBER=\1] [AUTO-GENERATED]\2'
)
WHERE notes ~ '^\[AUTO-GENERATED\] dispatch_number=DC-'
RETURNING id, notes;
```
Execute via Prisma `$queryRawUnsafe` with parameterized strings to avoid escape issues.

### Verify
Confirm all 12 dispatches now have `[DISPATCH_NUMBER=DC-2026-NNNNN]` prefix.
Spot-check with UI regex: `notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/)` returns DC number.
