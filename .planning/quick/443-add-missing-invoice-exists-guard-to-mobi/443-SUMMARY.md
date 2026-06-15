# Quick Task 443 — SUMMARY

**Task:** Add missing Invoice-exists guard to mobile owner load-status PATCH for INVOICED transition
**Date:** 2026-06-15
**Commit:** f7d2c9da

## What was done

Inserted the INVOICED guard into `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts`
(after line 199, before the geocoding block). The guard mirrors the web action's check
at `apps/web/src/app/(owner)/actions/loads.ts:591-597` exactly:

- Runs `tx.invoice.count({ where: { loadId: id, status: { not: 'CANCELLED' } } })` inside
  a bypass_rls transaction (same pattern as the rest of the file)
- Returns `422` with the identical error message:
  `"An invoice must be created and linked to this load before it can be marked as Invoiced."`
- Only activates when `body.status === 'INVOICED'` — all other transitions untouched
- Fails fast before geocoding (no wasted I/O on rejected requests)

## Verification

- `git diff` confirms only `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts` changed (22 lines added)
- `next build` → `✓ Compiled successfully in 24.5s` — no new TypeScript errors
- CarrierLoad code NOT touched (independent by design per Diag 442)

## Production impact

**Zero rows affected.** Per Diagnostic 442 data counts: 0 Loads are currently in INVOICED
status, and 0 Invoice records exist in production. No data backfill required. This is a
latent-correctness fix closing a web/mobile parity gap while it is harmless.
