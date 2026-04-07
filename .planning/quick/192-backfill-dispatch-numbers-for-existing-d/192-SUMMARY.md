# Quick Task 192 — Summary

## Status: COMPLETE

## What was done
Ran a one-time SQL backfill against the production Supabase database to rewrite
all 12 existing auto-generated dispatch notes from the old format to the new format.

## Before
```
[AUTO-GENERATED] dispatch_number=DC-2026-00001
```
UI regex `/\[DISPATCH_NUMBER=([^\]]+)\]/` → no match → shows "—"

## After
```
[DISPATCH_NUMBER=DC-2026-00001] [AUTO-GENERATED]
```
UI regex → matches → shows "DC-2026-00001"

## Dispatches updated (12 total)
- DC-2026-00001 through DC-2026-00012
- All in QA Test Org

## Verification
- `regexp_replace` SQL confirmed: all 12 rows returned with correct new format
- UI regex spot-check: `'[DISPATCH_NUMBER=DC-2026-00001] [AUTO-GENERATED]'.match(/\[DISPATCH_NUMBER=([^\]]+)\]/)` → `['[DISPATCH_NUMBER=DC-2026-00001]', 'DC-2026-00001']` ✓

## No code changes
Pure data backfill — no files modified, no migration file needed.
The generator fix (quick-191) ensures all future dispatches are written correctly.
