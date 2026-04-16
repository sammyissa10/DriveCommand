# Quick Task 226 — Summary

## Completed: Replace fire-and-forget notification calls with after()

### What was done
Replaced all `.catch(() => {})` notification fire-and-forget calls across the
three remaining Carrier Ops lib files with `after()` from `next/server`.

### Files changed
- `apps/web/src/lib/carrier/loads.ts` — `sendInvoiceGeneratedNotification`
- `apps/web/src/lib/carrier/stop-completion.ts` — `sendLoadDeliveredNotification`
- `apps/web/src/lib/carrier/pay-calculator.ts` — `sendPayRecordReadyNotification`

### Bonus fix
`stop-completion.ts` had a latent `string | null` type error on `stop.loadId`
that was hidden by the `.catch()` pattern. Fixed with a null guard:
`if (stop.loadId) after(() => sendLoadDeliveredNotification(orgId, stop.loadId!))`

### Verification
- Zero `.catch(() => {})` notification calls remaining in carrier lib
- `tsc --noEmit` clean (only pre-existing e2e Playwright errors unrelated to this change)
- Commit: d95496e
