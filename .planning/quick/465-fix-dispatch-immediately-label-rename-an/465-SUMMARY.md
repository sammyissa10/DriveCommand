---
phase: quick-465
plan: 465
subsystem: carrier-load-form
tags: [ux, copy, error-handling, dispatch]
dependency_graph:
  requires: []
  provides: [renamed-dispatch-toggle-label, friendly-dispatch-failure-toast]
  affects: [apps/web/src/components/carrier/loads/LoadForm.tsx]
tech_stack:
  added: []
  patterns: [branched-toast-on-error-code]
key_files:
  created: []
  modified:
    - apps/web/src/components/carrier/loads/LoadForm.tsx
decisions:
  - Raw DRIVER_NOT_DISPATCH_READY code never surfaced to user; branched into onboarding-specific copy at 6000ms duration
  - Generic fallback used for all other dispatch failures; consistent with prior pattern of redirecting to /carrier/loads on failure
metrics:
  duration: ~3min
  completed: 2026-06-16
---

# Quick-465 Summary

Rename dispatch toggle label to "Add to Trip immediately" and improve dispatch-failure error UX with branched friendly messages instead of raw error codes.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Rename visible label to "Add to Trip immediately" | b2f60436 | LoadForm.tsx |
| 2 | Branch dispatch-failure toast on error code | b2f60436 | LoadForm.tsx |

## Changes Made

**Label rename (line 732 area):**
- Changed JSX text node in `<label htmlFor="dispatch-toggle">` from `Dispatch immediately` to `Add to Trip immediately`
- Switch component, htmlFor, className, state variable name, and all handlers left unchanged
- Internal dev comments at lines ~182 and ~471 left unchanged

**Dispatch-failure toast branch (line 488 area):**
- Replaced single `toast.error(dispatchJson.error ?? '...')` with an if/else on `dispatchJson.error === 'DRIVER_NOT_DISPATCH_READY'`
- DRIVER_NOT_DISPATCH_READY branch: shows onboarding-specific message with `{ duration: 6000 }` (6 seconds, longer for actionable guidance)
- All other failures: shows generic friendly fallback message
- Raw error code string never passed to user in either branch
- `const dispatchJson`, `router.push('/carrier/loads')`, and `return` unchanged

## Deviations from Plan

None - plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/components/carrier/loads/LoadForm.tsx` modified — FOUND
- [x] Commit b2f60436 — FOUND
- [x] "Add to Trip immediately" appears once in JSX label — CONFIRMED
- [x] "Dispatch immediately" only in dev comments (lines 182, 471), not in JSX — CONFIRMED
- [x] DRIVER_NOT_DISPATCH_READY branch present — CONFIRMED
- [x] `tsc --noEmit` clean (no new errors) — CONFIRMED

## Self-Check: PASSED
