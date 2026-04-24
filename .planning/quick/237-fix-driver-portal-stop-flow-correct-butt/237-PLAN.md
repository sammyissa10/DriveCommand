---
phase: quick-237
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(driver)/actions/driver-routes.ts
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/components/driver/route-detail-readonly.tsx
  - apps/web/src/components/driver/driver-dispatch-card.tsx
  - apps/web/src/components/driver/driver-dashboard.tsx
  - apps/web/src/app/(driver)/my-route/page.tsx
autonomous: true
must_haves:
  truths:
    - "Dispatch query returns in_progress dispatches before planned ones"
    - "Pickup stop arrived button says 'Start Route' and opens Google Maps to first delivery stop"
    - "Delivery stop arrived button says 'Complete Stop' and opens Google Maps to next pending stop"
    - "Dashboard CTA says 'Start Trip & Navigate' (planned) or 'Begin Navigation' (in_progress)"
    - "Dashboard CTAs open Google Maps and navigate to /my-route"
    - "Drivers can complete stops without BOL/POD"
    - "Stop addresses are tappable Google Maps links"
  artifacts:
    - path: "apps/web/src/app/(driver)/actions/driver-routes.ts"
      provides: "Fixed dispatch query priority, firstDeliveryStop in response, bypassDocumentCheck support"
    - path: "apps/web/src/lib/carrier/stop-completion.ts"
      provides: "bypassDocumentCheck parameter with DRIVER role guard"
    - path: "apps/web/src/components/driver/route-detail-readonly.tsx"
      provides: "Stop-type-aware button labels, Google Maps on completion, tappable addresses"
    - path: "apps/web/src/components/driver/driver-dispatch-card.tsx"
      provides: "Updated CTA labels and Google Maps + navigation behavior"
  key_links:
    - from: "route-detail-readonly.tsx"
      to: "driver-routes.ts completeCurrentStop"
      via: "completeAction prop, then window.open Google Maps"
    - from: "driver-dispatch-card.tsx"
      to: "driver-routes.ts startTrip"
      via: "server action call + window.open + router.push"
    - from: "driver-routes.ts completeCurrentStop"
      to: "stop-completion.ts completeStop"
      via: "bypassDocumentCheck parameter forwarded"
---

<objective>
Fix seven issues in the driver portal stop completion flow: dispatch query priority, stop-type-aware button labels, Google Maps navigation on stop completion, dashboard CTA labels and behavior, BOL/POD bypass for drivers, and tappable addresses.

Purpose: Make the driver stop flow intuitive — correct labels, auto-navigate after completing stops, remove document gates that block drivers.
Output: Updated server actions, stop-completion lib, route-detail component, and dispatch card component.
</objective>

<context>
@apps/web/src/app/(driver)/actions/driver-routes.ts
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/components/driver/route-detail-readonly.tsx
@apps/web/src/components/driver/driver-dispatch-card.tsx
@apps/web/src/components/driver/driver-dashboard.tsx
@apps/web/src/app/(driver)/my-route/page.tsx
@apps/web/src/app/(driver)/home/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix dispatch query priority, add firstDeliveryStop, and add bypassDocumentCheck to server actions + stop-completion lib</name>
  <files>
    apps/web/src/app/(driver)/actions/driver-routes.ts
    apps/web/src/lib/carrier/stop-completion.ts
  </files>
  <action>
**Fix 1 — dispatch query priority in `getMyActiveDispatch` (driver-routes.ts):**

The current query uses `findFirst` with `orderBy: { scheduledDeparture: 'asc' }` which doesn't prioritize in_progress over planned. Fix this:

Replace the single `findFirst` with two sequential queries inside the existing transaction:
1. First try: `findFirst` where `status: 'in_progress'`, ordered by `actualDeparture: 'desc'` (most recently started)
2. If null, second try: `findFirst` where `status: 'planned'`, ordered by `scheduledDeparture: 'asc'` (earliest scheduled)

Keep the same `include` block for both queries (truck, stops with facility, carrierLoads with client).

After getting the dispatch, compute `firstDeliveryStop` from the stops array:
```ts
const firstDeliveryStop = dispatch
  ? dispatch.stops.find(s => s.stopType === 'delivery' && s.status === 'pending') ?? null
  : null;
return dispatch ? { ...dispatch, firstDeliveryStop } : null;
```

Also remove the three `console.log` debug lines (lines 43, ~54, ~83) — replace with `logger.debug` or delete entirely.

**Fix 5 — bypassDocumentCheck in completeCurrentStop (driver-routes.ts):**

The driver server action always bypasses document checks. Update the `completeStop` call at the bottom of `completeCurrentStop`:
```ts
const result = await completeStop(session.tenantId, stopId, { bypassDocumentCheck: true });
```
No changes to the function signature of `completeCurrentStop` itself — it still accepts just `(stopId: string)`. The bypass is hardcoded because this action is already gated by `requireRole([UserRole.DRIVER])`.

**Fix 5 — bypassDocumentCheck in stop-completion.ts:**

Update `completeStop` signature to accept an optional 3rd parameter:
```ts
export async function completeStop(
  orgId: string,
  stopId: string,
  options?: { bypassDocumentCheck?: boolean }
): StopResult {
```

Wrap the BOL check (lines ~86-97) and POD check (lines ~101-110) with a guard:
```ts
if (!options?.bypassDocumentCheck) {
  // Step 1 — BOL check (existing code)
  if (bolRequired) { ... }
  // Step 2 — POD check (existing code)
  if (podRequired) { ... }
}
```

This preserves owner portal behavior (which calls completeStop without the flag). Do NOT add role checks inside stop-completion.ts — the role is enforced at the server action layer.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit 2>&1 | head -30` — no type errors in modified files.
Grep for `bypassDocumentCheck` to confirm it appears in both files.
Grep for `firstDeliveryStop` in driver-routes.ts.
  </verify>
  <done>
getMyActiveDispatch returns in_progress dispatches first, includes firstDeliveryStop.
completeCurrentStop passes bypassDocumentCheck: true.
completeStop skips BOL/POD checks when bypassDocumentCheck is true.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix stop card button labels, add Google Maps navigation on stop completion, tappable addresses</name>
  <files>
    apps/web/src/components/driver/route-detail-readonly.tsx
  </files>
  <action>
**Update `CarrierDispatchShape` interface** to include firstDeliveryStop:
```ts
firstDeliveryStop?: {
  id: string;
  sequenceOrder: number;
  stopType: string;
  facility: Facility;
} | null;
```

**Fix 2 — Stop-type-aware button labels in `StopActionButtons`:**

Add `allStops: CarrierStopShape[]` to StopActionButtonsProps.

Rewrite button rendering:

For `status === 'pending'` (all stop types): Label = "Mark Arrived", icon = MapPin. Currently says "Arrive" — change to "Mark Arrived".

For `status === 'arrived'`, labels depend on stopType:
- `pickup`: Label = "Start Route", icon = Play (already imported from lucide-react)
- `delivery`: Label = "Complete Stop", icon = CheckCircle (keep existing)
- `fuel_stop` / `layover` / any other: Label = "Complete Stop", icon = CheckCircle

**Fix 3 — Google Maps navigation on stop completion:**

Update `handleComplete` to:
1. Call `completeAction(stop.id)` and await result
2. Check result — if no error (`!(r?.error)`), find next stop:
   - If `stop.stopType === 'pickup'`: find first stop in `allStops` where `stopType === 'delivery'` AND `status === 'pending'`, lowest `sequenceOrder`
   - If `stop.stopType === 'delivery'`: find first stop in `allStops` where `sequenceOrder > stop.sequenceOrder` AND `status === 'pending'`, lowest `sequenceOrder`
   - If `stop.stopType === 'fuel_stop'` or `'layover'`: no navigation
3. If nextStop found, call `window.open(buildNavUrl(nextStop), '_blank')`

**Fix 6 — Tappable addresses on stop cards:**

Replace the plain-text address paragraph (around line 327-330):
```tsx
<p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
  <MapPin className="h-3 w-3" />
  {[stop.facility.city, stop.facility.state].filter(Boolean).join(', ')}
</p>
```

With a tappable link showing full address:
```tsx
<a
  href={buildNavUrl(stop)}
  target="_blank"
  rel="noopener noreferrer"
  className="text-xs text-blue-600 dark:text-blue-400 underline mt-0.5 flex items-center gap-1 hover:text-blue-700 dark:hover:text-blue-300"
>
  <Navigation className="h-3 w-3" />
  {[stop.facility.addressLine1, stop.facility.city, stop.facility.state].filter(Boolean).join(', ')}
</a>
```

**Update `buildNavUrl`** to append `&travelmode=driving` to both URL variants (lat/lng and address-based).

**Update `DispatchDetail`** to pass `allStops={dispatch.stops}` to each `StopActionButtons` instance.

**Remove the standalone "Navigate to Next Stop" link** (lines 279-291) — navigation is now handled by the stop action buttons directly. Remove the entire block including the `{activeStop && (...)}` wrapper.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit 2>&1 | head -30` — no type errors.
Confirm "Mark Arrived" for pending, "Start Route" for arrived pickup, "Complete Stop" for arrived delivery in source.
Confirm `window.open` call exists in handleComplete.
Confirm address `<a>` tags with blue styling and `buildNavUrl`.
  </verify>
  <done>
Pickup arrived shows "Start Route" and opens Maps to first delivery stop on completion.
Delivery arrived shows "Complete Stop" and opens Maps to next pending stop on completion.
fuel_stop/layover shows "Complete Stop" with no Maps navigation.
All pending stops show "Mark Arrived".
All facility addresses render as blue underlined tappable links opening Google Maps directions.
  </done>
</task>

<task type="auto">
  <name>Task 3: Fix dashboard dispatch card CTA labels and add Google Maps + navigation behavior</name>
  <files>
    apps/web/src/components/driver/driver-dispatch-card.tsx
    apps/web/src/components/driver/driver-dashboard.tsx
  </files>
  <action>
**Fix 7 + Fix 4 — Dashboard dispatch card (driver-dispatch-card.tsx):**

1. **Update DispatchData interface** to add:
```ts
firstDeliveryStop?: {
  id: string;
  sequenceOrder: number;
  stopType: string;
  facility: {
    name: string;
    addressLine1: string | null;
    city: string | null;
    state: string | null;
    latitude?: number | null;
    longitude?: number | null;
  };
} | null;
```

2. **Add new props** to `DriverDispatchCardProps`:
```ts
interface DriverDispatchCardProps {
  dispatch: DispatchData | null;
  startAction?: (dispatchId: string) => Promise<unknown>;
}
```

3. **Add imports:** `useRouter` from `next/navigation`, `useTransition` from React.

4. **Add Google Maps URL helper** inside the file:
```ts
function buildGoogleMapsUrl(facility: { name: string; addressLine1: string | null; city: string | null; state: string | null; latitude?: number | null; longitude?: number | null }): string {
  if (facility.latitude != null && facility.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}&travelmode=driving`;
  }
  const addr = [facility.addressLine1, facility.city, facility.state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr || facility.name)}&travelmode=driving`;
}
```

5. **Replace the `<Link>` CTA** with a `<button>` using `useTransition`:

For `dispatch.status === 'planned'` (label: "Start Trip & Navigate"):
```ts
async function handleStartTrip() {
  if (!startAction) return;
  startTransition(async () => {
    const result = await startAction(dispatch.id);
    const r = result as any;
    if (r?.error) { alert(r.error); return; }
    if (dispatch.firstDeliveryStop) {
      window.open(buildGoogleMapsUrl(dispatch.firstDeliveryStop.facility), '_blank');
    }
    router.push('/my-route');
  });
}
```

For `dispatch.status === 'in_progress'` (label: "Begin Navigation"):
```ts
function handleBeginNav() {
  startTransition(async () => {
    if (dispatch.firstDeliveryStop) {
      window.open(buildGoogleMapsUrl(dispatch.firstDeliveryStop.facility), '_blank');
    }
    router.push('/my-route');
  });
}
```

Button rendering:
```tsx
<button
  onClick={dispatch.status === 'planned' ? handleStartTrip : handleBeginNav}
  disabled={isPending}
  className="flex items-center justify-center w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold text-sm transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
>
  {isPending
    ? (dispatch.status === 'planned' ? 'Starting...' : 'Loading...')
    : (dispatch.status === 'planned' ? 'Start Trip & Navigate' : 'Begin Navigation')}
</button>
```

**Update driver-dashboard.tsx:**

1. Import `startTrip` from `@/app/(driver)/actions/driver-routes`
2. Pass to DriverDispatchCard: `startAction={startTrip}`

The `firstDeliveryStop` field already flows through since `dispatch` is spread from `getDriverDashboardData` which calls `getMyActiveDispatch` (updated in Task 1 to include it). The `dispatch` prop is typed as `any` in DriverDashboard already.
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit 2>&1 | head -30` — no type errors.
Confirm "Start Trip & Navigate" and "Begin Navigation" labels in source.
Confirm `window.open` calls for Google Maps exist.
Confirm `router.push('/my-route')` exists.
Confirm `startTrip` is imported in driver-dashboard.tsx and passed as prop.
  </verify>
  <done>
Dashboard planned dispatch shows "Start Trip & Navigate" that calls startTrip, opens Maps, navigates to /my-route.
Dashboard in_progress dispatch shows "Begin Navigation" that opens Maps and navigates to /my-route.
Both buttons show loading state during async operations.
  </done>
</task>

<task type="auto">
  <name>Task 4: TypeScript check, cleanup debug logs, verify end-to-end compilation</name>
  <files>
    apps/web/src/app/(driver)/actions/driver-routes.ts
    apps/web/src/app/(driver)/my-route/page.tsx
  </files>
  <action>
1. Remove the `console.log('ROUTE PAGE RENDER', ...)` from `my-route/page.tsx` (line 42). Delete entirely or replace with `logger.debug` if useful.

2. Verify the three `console.log` calls in `driver-routes.ts` were removed in Task 1 (lines 43, ~54, ~83). If any remain, remove them.

3. Run full TypeScript check: `cd apps/web && npx tsc --noEmit` and fix any remaining type errors across ALL modified files:
   - driver-routes.ts
   - stop-completion.ts
   - route-detail-readonly.tsx
   - driver-dispatch-card.tsx
   - driver-dashboard.tsx
   - my-route/page.tsx

4. Verify the prop chain works end-to-end:
   - `my-route/page.tsx` passes `completeCurrentStop` to DispatchDetail as `completeAction`
   - `DispatchDetail` passes it down to `StopActionButtons`
   - `StopActionButtons.handleComplete` calls `completeAction(stop.id)` — this calls `completeCurrentStop(stopId)` on the server which always passes `bypassDocumentCheck: true` to `completeStop`

5. Verify no `window.open` calls exist in server components — they should only be in `route-detail-readonly.tsx` (client) and `driver-dispatch-card.tsx` (client).

6. Verify `force-dynamic` export remains on `my-route/page.tsx` and `home/page.tsx` — do NOT remove it.
  </action>
  <verify>
`cd apps/web && npx tsc --noEmit` exits with code 0.
`grep -rn "console.log" apps/web/src/app/\(driver\)/actions/driver-routes.ts apps/web/src/app/\(driver\)/my-route/page.tsx` returns no results.
  </verify>
  <done>
All debug console.logs removed. Full TypeScript compilation passes with zero errors. The complete stop flow compiles end-to-end: server action -> stop-completion lib -> client components with Google Maps navigation. force-dynamic remains on all driver portal pages.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with no errors
2. All 7 fixes implemented across the modified files
3. No changes to owner portal code
4. `force-dynamic` remains on all driver portal pages
5. `window.open` only called in client component event handlers (never SSR)
6. BOL/POD bypass only applies when bypassDocumentCheck flag is explicitly true
7. No console.log statements remain in modified files
</verification>

<success_criteria>
- getMyActiveDispatch prioritizes in_progress over planned dispatches and returns firstDeliveryStop
- Stop buttons show correct labels per stop_type and status (Mark Arrived / Start Route / Complete Stop)
- Completing a stop auto-opens Google Maps to the next relevant stop
- Dashboard CTAs say "Start Trip & Navigate" / "Begin Navigation" and perform full async sequence
- Drivers bypass BOL/POD checks via bypassDocumentCheck (server-enforced DRIVER role gate)
- All facility addresses are tappable blue links opening Google Maps directions
- TypeScript compilation passes with zero errors
</success_criteria>
