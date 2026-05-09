---
phase: quick-241
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/components/driver/route-detail-readonly.tsx
  - apps/web/src/app/(driver)/my-route/page.tsx
  - apps/web/src/app/(driver)/actions/driver-routes.ts
autonomous: true
must_haves:
  truths:
    - "Completing a pickup stop updates the associated load status to in_transit"
    - "Completing the last delivery stop updates the load to delivered (already works)"
    - "Google Maps opens for the next stop after every stop completion, not just the first"
    - "Active dispatch query returns correct dispatch scoped by driver + org + active statuses"
    - "All timestamps display in device local timezone with consistent formatting"
    - "Route tab has no Completed Dispatches section"
  artifacts:
    - path: "apps/web/src/lib/carrier/stop-completion.ts"
      provides: "Load in_transit cascade on pickup completion"
    - path: "apps/web/src/components/driver/route-detail-readonly.tsx"
      provides: "Pre-calculated next stop, local timezone formatting, mounted hydration guard"
    - path: "apps/web/src/app/(driver)/my-route/page.tsx"
      provides: "Route tab without completed dispatches history"
  key_links:
    - from: "apps/web/src/lib/carrier/stop-completion.ts"
      to: "prisma.carrierLoad"
      via: "status update on pickup completion"
      pattern: "status.*in_transit"
---

<objective>
Fix 5 driver portal issues found during stop flow testing: load status not syncing on pickup, Google Maps not opening on subsequent completions, dispatch query correctness, UTC timestamps, and Route tab cleanup.

Purpose: Make the driver stop completion flow work end-to-end without bugs.
Output: All 5 fixes applied and verified.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/components/driver/route-detail-readonly.tsx
@apps/web/src/app/(driver)/my-route/page.tsx
@apps/web/src/app/(driver)/actions/driver-routes.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix load status cascade and dispatch query in server-side code</name>
  <files>
    apps/web/src/lib/carrier/stop-completion.ts
    apps/web/src/app/(driver)/actions/driver-routes.ts
    apps/web/src/app/(driver)/my-route/page.tsx
  </files>
  <action>
**Fix 1 — Load status in_transit on pickup completion** in `apps/web/src/lib/carrier/stop-completion.ts`:

After the existing client pickup notification block (around line 165), add a new block that updates the load to `in_transit` when a pickup stop is completed. Logic:

```typescript
// After the pickup notification block, before the delivery cascade block:
if (stop.loadId && stop.stopType === 'pickup') {
  // Update load to in_transit if currently pending/booked/assigned
  await prisma.carrierLoad.updateMany({
    where: {
      id: stop.loadId,
      status: { in: ['pending', 'booked', 'assigned'] },
    },
    data: { status: 'in_transit' },
  });
  logger.info('completeStop: load marked in_transit on pickup', { orgId, loadId: stop.loadId });
}
```

Use `updateMany` with a status filter so it's idempotent — won't downgrade a load that's already in_transit or delivered. Place this BEFORE the existing delivery cascade (Step 5) so the flow is: pickup completion -> in_transit, delivery completion -> delivered.

The `bypassDocumentCheck` path already calls the same `completeStop` function (the driver-routes.ts server action passes `{ bypassDocumentCheck: true }` to this same function), so no separate fix needed there — the cascade will run for both paths.

**Fix 3 — Tighten dispatch query** in `apps/web/src/app/(driver)/actions/driver-routes.ts`:

The current two-query approach (lines 73-93) is already correct in intent but add the explicit `orgId` filter (already present) and ensure status filters are tight. The current code already does this correctly with separate findFirst calls for in_progress then planned. Add a comment clarifying the priority logic for future maintainers. No code change needed here unless you find the orgId or status filters are missing — they are already present.

**Fix 5 — Remove Completed Dispatches from Route tab** in `apps/web/src/app/(driver)/my-route/page.tsx`:

1. Remove the import of `getMyDispatchHistory` (line 4)
2. Remove the import of `CompletedRouteHistory` (line 8)
3. Remove the `history` variable and its try/catch block (lines 34-39)
4. Remove `<CompletedRouteHistory completedDispatches={history} />` from both the empty-state branch (line 54) and the active-dispatch branch (line 86)
5. Keep the empty-state UI for "No route assigned" but without the history section below it
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit 2>&1 | head -30` — no new TypeScript errors.

Grep for the new in_transit logic: `grep -n "in_transit" apps/web/src/lib/carrier/stop-completion.ts` should show the new updateMany.

Grep to confirm history removal: `grep -n "CompletedRouteHistory\|getMyDispatchHistory" apps/web/src/app/\(driver\)/my-route/page.tsx` should return nothing.
  </verify>
  <done>
- Completing a pickup stop updates load.status to in_transit (if currently pending/booked/assigned)
- Completing last delivery stop still marks load as delivered (existing logic unchanged)
- bypassDocumentCheck path uses the same cascade (same function)
- Route tab no longer shows Completed Dispatches section
- No TypeScript errors
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix Google Maps navigation and timestamp formatting in client component</name>
  <files>apps/web/src/components/driver/route-detail-readonly.tsx</files>
  <action>
**Fix 2 — Pre-calculate next stop for Google Maps** in `StopActionButtons` component:

The current code (lines 266-274) computes `nextStop` inside the `startTransition` async callback using `allStops` from props. After the server action completes and triggers revalidation, the closure still holds the old `allStops` where the current stop shows `status: 'pending'` — so the "next stop" calculation may return the wrong stop or the same stop.

Fix: Pre-calculate `nextStop` at render time and capture it in the closure. In `StopActionButtons`, compute the next stop OUTSIDE the click handler:

```typescript
export function StopActionButtons({ stop, allStops, navigatingStopId, setNavigatingStopId, arriveAction, completeAction }: StopActionButtonsProps) {
  const [isPending, startTransition] = useTransition();
  const action = getStopAction(stop, allStops, navigatingStopId);

  // Pre-calculate next stop at render time — avoids stale closure after revalidation
  const nextStop = allStops
    .filter((s) => s.sequenceOrder > stop.sequenceOrder && s.status === 'pending')
    .sort((a, b) => a.sequenceOrder - b.sequenceOrder)[0] ?? null;

  // Pre-build the URL so it's ready before any async work
  const nextStopNavUrl = nextStop ? buildNavUrl(nextStop) : null;
```

Then in the `complete_stop` / `start_route` handler, replace the inline nextStop logic with:

```typescript
onClick={() => {
  startTransition(async () => {
    const result = await completeAction(stop.id);
    const r = result as any;
    if (r?.error) {
      alert(r.error);
      return;
    }
    // Open navigation to pre-calculated next stop
    if (nextStopNavUrl) {
      window.open(nextStopNavUrl, '_blank');
    }
    if (nextStop) {
      setNavigatingStopId(nextStop.id);
    }
  });
}}
```

**Fix 4 — Local timezone formatting with hydration safety:**

Add a `formatLocalTime` helper and a `useMounted` pattern at the top of the file:

```typescript
import { useState, useTransition, useEffect } from 'react';

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function formatLocalTime(timestamp: string | Date) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatLocalDate(timestamp: string | Date) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
```

Create a small `<LocalTime>` component to handle hydration:

```typescript
function LocalTime({ date, format = 'datetime' }: { date: string | Date; format?: 'datetime' | 'date' | 'time' }) {
  const mounted = useMounted();
  if (!mounted) return <span>{new Date(date).toISOString().slice(0, 16).replace('T', ' ')}</span>;
  if (format === 'date') return <span>{formatLocalDate(date)}</span>;
  if (format === 'time') return <span>{new Date(date).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true })}</span>;
  return <span>{formatLocalTime(date)}</span>;
}
```

Replace ALL `new Date(...).toLocaleString()` and `new Date(...).toLocaleTimeString()` calls in `DispatchDetail` with `<LocalTime>`:

- Line 319: `{new Date(dispatch.scheduledDeparture).toLocaleString()}` → `<LocalTime date={dispatch.scheduledDeparture} />`
- Line 348: `{new Date(dispatch.actualDeparture).toLocaleString()}` → `<LocalTime date={dispatch.actualDeparture} />`
- Line 409: `{new Date(stop.appointmentStart).toLocaleString()}` → `<LocalTime date={stop.appointmentStart} />`
- Line 410: `{stop.appointmentEnd && \` – ${new Date(stop.appointmentEnd).toLocaleTimeString()}\`}` → `{stop.appointmentEnd && <> – <LocalTime date={stop.appointmentEnd} format="time" /></>}`
- Line 417: `{new Date(stop.arrivedAt).toLocaleString()}` → `<LocalTime date={stop.arrivedAt} />`
- Line 421: `{new Date(stop.departedAt).toLocaleString()}` → `<LocalTime date={stop.departedAt} />`
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit 2>&1 | head -30` — no new TypeScript errors.

Grep for stale pattern: `grep -n "allStops.filter" apps/web/src/components/driver/route-detail-readonly.tsx` — should only appear once (the pre-calculation), NOT inside any onClick handler.

Grep for old toLocaleString: `grep -n "toLocaleString\|toLocaleTimeString" apps/web/src/components/driver/route-detail-readonly.tsx` — should return NO matches (all replaced by LocalTime).

Grep for LocalTime usage: `grep -c "LocalTime" apps/web/src/components/driver/route-detail-readonly.tsx` — should show 6+ usages.
  </verify>
  <done>
- Google Maps opens correctly after every stop completion (pre-calculated URL, no stale closure)
- All timestamps render in device local timezone with consistent "MMM D, YYYY, H:MM AM/PM" format
- No hydration mismatches (mounted guard renders ISO string on server, local string on client)
- No TypeScript errors
  </done>
</task>

</tasks>

<verification>
After both tasks complete:
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. `grep -rn "in_transit" apps/web/src/lib/carrier/stop-completion.ts` shows the new pickup cascade
3. `grep -rn "CompletedRouteHistory" apps/web/src/app/\(driver\)/my-route/page.tsx` returns nothing
4. `grep -rn "toLocaleString" apps/web/src/components/driver/route-detail-readonly.tsx` returns nothing
5. The nextStop pre-calculation exists outside click handlers in StopActionButtons
</verification>

<success_criteria>
All 5 fixes applied:
1. Pickup stop completion updates load to in_transit
2. Google Maps opens after every stop completion (not just the first)
3. Dispatch query is correctly scoped (already was, verified)
4. Timestamps show in device local timezone with hydration-safe rendering
5. Route tab has no Completed Dispatches section
Zero TypeScript errors.
</success_criteria>

<output>
After completion, create `.planning/quick/241-fix-5-driver-portal-issues-load-status-s/241-SUMMARY.md`
</output>
