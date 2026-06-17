# Quick Task 466 — SUMMARY

## Description
Shorten DRIVER_NOT_DISPATCH_READY toast message in LoadForm.tsx

## What Changed
- **File:** `apps/web/src/components/carrier/loads/LoadForm.tsx` (line 491)
- Replaced verbose toast string with a shorter one
- All other logic (branch condition, duration: 6000, router.push, generic fallback) unchanged

## Before
```
"The load was created, but the selected driver isn't dispatch-ready yet (onboarding steps incomplete). The trip wasn't started. You can assign this load to a trip later once the driver completes onboarding."
```

## After
```
"Load saved. Driver isn't dispatch-ready yet, so the trip wasn't started — assign it to a trip later."
```

## Verification
- Raw error code `DRIVER_NOT_DISPATCH_READY` only appears in the branch condition comparison, not in any user-visible string
- `duration: 6000` preserved
- Generic fallback message unchanged
- Commit: bd7d7801
