# Quick Task 226 — Replace fire-and-forget notification calls with after()

## Objective
Replace all `.catch(() => {})` fire-and-forget notification calls in Carrier Ops
lib files with `after()` from `next/server` so Vercel does not kill the promise
before it writes to NotificationLog.

## Files
- `apps/web/src/lib/carrier/loads.ts`
- `apps/web/src/lib/carrier/stop-completion.ts`
- `apps/web/src/lib/carrier/pay-calculator.ts`

## Tasks

### Task 1 — Replace .catch() with after() in all three files
- Add `import { after } from 'next/server'` to each file
- Replace `sendXxx(...).catch(() => {})` with `after(() => sendXxx(...))`
- Add null guard on `stop.loadId` in stop-completion.ts (pre-existing latent type error)
