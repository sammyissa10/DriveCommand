# Quick Task 466 — Shorten DRIVER_NOT_DISPATCH_READY Toast Message

## Goal
Replace the verbose DRIVER_NOT_DISPATCH_READY toast message in LoadForm.tsx with a shorter version.

## Scope
- **File:** `apps/web/src/components/carrier/loads/LoadForm.tsx`
- **Only the string changes** — branch condition, duration, router.push, and all other logic unchanged

## Task

### Task 1: Replace toast message string

**File:** `apps/web/src/components/carrier/loads/LoadForm.tsx`

In the dispatch-failure block, find the DRIVER_NOT_DISPATCH_READY branch and replace:

```
"The load was created, but the selected driver isn't dispatch-ready yet (onboarding steps incomplete). The trip wasn't started. You can assign this load to a trip later once the driver completes onboarding."
```

With:

```
"Load saved. Driver isn't dispatch-ready yet, so the trip wasn't started — assign it to a trip later."
```

Keep unchanged:
- Branch condition (`error.message === 'DRIVER_NOT_DISPATCH_READY'` or equivalent)
- `duration: 6000`
- `router.push(...)` call
- Generic fallback message
- All other code

## Verification
- Confirm the old string is gone and new string is present in the file
- Confirm no TypeScript errors in the touched file
- Confirm raw error code DRIVER_NOT_DISPATCH_READY does not appear in any user-visible string
