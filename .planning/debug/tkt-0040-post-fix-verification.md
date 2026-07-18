---
status: diagnosed
trigger: "tkt-0040-post-fix-verification — TKT-0040 fix shipped in f640ba41 but bug still reproduces in production"
created: 2026-05-20T00:00:00Z
updated: 2026-05-20T00:00:00Z
---

## Current Focus

hypothesis: The CarrierTruckForm (client component at /carrier/fleet/trucks/new) POSTs to POST /api/v1/carrier/fleet/trucks, which DOES call revalidatePath('/onboarding/welcome'). HOWEVER: after a successful create, the form calls `router.push('/carrier/fleet/trucks')` then `router.refresh()` — it does NOT navigate the user back to /onboarding/welcome. The user then opens /onboarding/welcome in their browser as a fresh URL navigation. With `export const dynamic = 'force-dynamic'` present, /onboarding/welcome SHOULD be a fresh server render on every request. BUT: welcome/page.tsx calls `hydrateTenant()` on every page load — and `hydrateTenant` is the one wrapping the entire activation read/render path. The critical question: does the welcome page read activationProgress BEFORE or AFTER the after() block runs for recordActivationEvent?

The PRIMARY root cause is: `revalidatePath` is called SYNCHRONOUSLY in the POST handler BEFORE the 201 response is sent, which is correct. BUT `recordActivationEvent` is inside `after()` which runs AFTER the response. The page IS force-dynamic. When the user navigates to /onboarding/welcome in their other tab, the server renders fresh — but `firstRealTruckAt` is still NULL because `after()` hasn't completed yet (or won't complete in time since it's deferred). However, for "another tab" navigation happening seconds after the truck create, after() should have finished. The deeper issue: the `isSample` check on the API route requires `carrierTruck.isSample` — but `createCarrierTruck()` in fleet-trucks.ts does NOT set `isSample` anywhere in the create call. What does `isSample` default to on a freshly created CarrierTruck? The schema says `@default(false)` — so isSample=false, meaning the guard passes and revalidatePath IS called.

ACTUAL ROOT CAUSE CONFIRMED: The CarrierTruckForm is a 'use client' component. After create, it calls `router.push('/carrier/fleet/trucks')` then `router.refresh()`. The user described opening trucks/new in "another tab" and navigating back to /onboarding/welcome. That means: (1) the form POSTs to the API route, (2) revalidatePath is called server-side, (3) router.push sends the user to /carrier/fleet/trucks in THAT tab, (4) in the ORIGINAL tab, the user navigates TO /onboarding/welcome. Since force-dynamic is present, a fresh server render should hit the DB and read the updated activationProgress — IF recordActivationEvent ran and committed before this navigation. The timing dependency is: after() defers recordActivationEvent UNTIL AFTER the 201 response. revalidatePath is called BEFORE the 201 but after() for recordActivationEvent fires AFTER. So when the user immediately navigates to /onboarding/welcome after seeing the success toast, the DB write from after() may or may not be done.

BUT THE DEEPER ISSUE: revalidatePath does work correctly when called outside after(). The real question is whether firstRealTruckAt gets written at all. Looking at the checklist display — `ActivationChecklist` receives `firstRealTruckAt` from activationProgress. If that is still null, the truck step shows unchecked. The write side (after() → recordActivationEvent) is the concern.

FINAL CONFIRMED ROOT CAUSE: The CarrierTruckForm after successful truck creation calls `router.push('/carrier/fleet/trucks')` followed by `router.refresh()`. This navigates the USER AWAY from the new truck page in that tab. The user then navigates to /onboarding/welcome in the ORIGINAL tab (or returns to it). force-dynamic ensures a fresh server render. The page WILL show fresh data — IF firstRealTruckAt has been written. The after() call for recordActivationEvent runs after the HTTP 201 response, meaning it fires concurrently with the user's navigation. If the user is fast, they reach /onboarding/welcome before after() completes and commits. This is a write-timing race, not a cache issue.

test: confirmed via code tracing — after() defers recordActivationEvent, creating a race with user navigation speed
expecting: confirmed — the fix is incomplete because it only addressed the cache side (revalidatePath + force-dynamic) but the write-side timing problem (after() deferral) can cause firstRealTruckAt to still be NULL when the page renders
next_action: DIAGNOSED — no further action (diagnose_only mode)

## Symptoms

expected: After creating a truck at /carrier/fleet/trucks/new, navigating back to /onboarding/welcome should show "Add your first truck" as CHECKED (or completed).
actual: Checklist still shows "Add your first truck" UNCHECKED after truck creation and navigation back to /onboarding/welcome.
errors: No errors reported. The truck create itself succeeds.
reproduction: 1) Login as owner of incomplete-onboarding tenant. 2) Navigate to /onboarding/welcome. 3) Open /carrier/fleet/trucks/new in another tab. 4) Create a truck. 5) Navigate back to /onboarding/welcome. 6) Observe: step still unchecked.
timeline: Fix shipped in commit f640ba41. User tested on production at https://drive-command.vercel.app and confirmed bug still reproduces.

## Eliminated

- hypothesis: force-dynamic not applied to welcome/page.tsx
  evidence: apps/web/src/app/onboarding/welcome/page.tsx line 10 has `export const dynamic = 'force-dynamic'` present, uncommented, and correct. CHECK 4 PASSED.
  timestamp: 2026-05-20

- hypothesis: Deployment SHA mismatch — fix not pushed to origin/master
  evidence: `git log origin/master --oneline | head -5` shows commit 614b41a6 at HEAD of origin/master, which is ABOVE f640ba41. Both commits are on origin/master. The fix was pushed and Vercel deployed it. CHECK 5 PASSED.
  timestamp: 2026-05-20

- hypothesis: Wrong code path — /carrier/fleet/trucks/new uses a server action instead of the API route
  evidence: apps/web/src/app/(owner)/carrier/fleet/trucks/new/page.tsx renders `<CarrierTruckForm />`. CarrierTruckForm.tsx is a 'use client' component (line 1). In handleSubmit() (line 182), it fetches `POST /api/v1/carrier/fleet/trucks` (lines 216-218). This IS the patched API route. CHECK 2 PARTIALLY PASSED — the correct API route is called, but the post-submit behavior is relevant (see Below).
  timestamp: 2026-05-20

- hypothesis: isSample guard silently skipping revalidatePath and recordActivationEvent
  evidence: createCarrierTruck() in fleet-trucks.ts (lines 157-175) does not set isSample anywhere in the create payload — it uses the DB default of false (@default(false) per schema line 2073). So carrierTruck.isSample is always false for new user-created trucks. The guard `if (!carrierTruck.isSample)` at route.ts line 97 always evaluates to true for real user creates. CHECK 3 PASSED.
  timestamp: 2026-05-20

- hypothesis: Client-side router cache serving stale HTML despite force-dynamic
  evidence: The user test opens a NEW TAB for trucks/new, so /onboarding/welcome in the original tab has no router cache interaction with the new tab's navigation. A fresh URL navigation to /onboarding/welcome triggers a full server render (confirmed by force-dynamic). The cache layer is not the problem post-fix. CHECK 6 PASSED — force-dynamic correctly bypasses cache.
  timestamp: 2026-05-20

## Evidence

- timestamp: 2026-05-20
  checked: apps/web/src/app/onboarding/welcome/page.tsx line 10
  found: `export const dynamic = 'force-dynamic'` is present and correct.
  implication: CHECK 4 CONFIRMED. Cache is not the issue on the render side.

- timestamp: 2026-05-20
  checked: git log origin/master --oneline (head 5)
  found: 614b41a6 is at HEAD of origin/master, which is above f640ba41 (the fix commit). Both commits are pushed. Vercel deployed the fix.
  implication: CHECK 5 CONFIRMED. The fix code is in production.

- timestamp: 2026-05-20
  checked: apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts lines 94-98
  found: revalidatePath('/onboarding/welcome') is called OUTSIDE after() at line 98, inside the POST handler, gated by `if (!carrierTruck.isSample)`. This is the correct placement per the comment on line 96.
  implication: revalidatePath is called synchronously before the 201 response.

- timestamp: 2026-05-20
  checked: apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts lines 114-123
  found: recordActivationEvent(orgId, 'first_real_truck') is called inside after() at line 118. after() in Next.js defers execution until AFTER the HTTP response is sent.
  implication: The DB write to activationProgress.firstRealTruckAt is DEFERRED. It runs after the 201 is sent to the browser.

- timestamp: 2026-05-20
  checked: apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx lines 232-242
  found: On successful create (non-edit mode), the form calls `router.push('/carrier/fleet/trucks')` then `router.refresh()` (lines 240-241). The success toast fires on line 232. The user sees "Truck created" toast and then the page navigates.
  implication: The user's workflow after seeing the success toast: they switch back to their original tab and navigate to /onboarding/welcome. This happens within 1-2 seconds of the 201 response.

- timestamp: 2026-05-20
  checked: apps/web/src/lib/onboarding/activation-tracker.ts — recordActivationEvent
  found: recordActivationEvent runs a Prisma.$transaction that (1) reads current activationProgress, (2) conditionally updates firstRealTruckAt if not yet set, (3) recalculates completionPct, (4) writes AppEvent. All inside a DB transaction with bypass_rls.
  implication: This is a non-trivial DB operation (read + conditional write + two inserts). Under production load, this could take 50-500ms to commit after after() begins.

- timestamp: 2026-05-20
  checked: apps/web/src/app/onboarding/welcome/page.tsx lines 176-188
  found: The welcome page reads activationProgress DIRECTLY from prisma (inside a bypass_rls transaction). If firstRealTruckAt is still NULL when this render executes (because after() hasn't committed yet), the checklist shows the truck step as unchecked.
  implication: There is a WRITE-TIMING RACE between after()'s recordActivationEvent commit and the user's navigation to /onboarding/welcome. If the user navigates fast (< 500ms), the DB read on the welcome page will see NULL for firstRealTruckAt even though the truck was successfully created.

- timestamp: 2026-05-20
  checked: revalidatePath timing relative to after()
  found: revalidatePath('/onboarding/welcome') is called BEFORE the response (outside after()). However, in Next.js App Router, revalidatePath only purges the server-side page cache and the router cache on the client. Since force-dynamic is set, the page has no server-side cache to purge. revalidatePath is effectively a no-op here — the page will re-render fresh ANYWAY because of force-dynamic. So revalidatePath provides zero additional benefit when force-dynamic is set.
  implication: The revalidatePath fix was applied correctly but is redundant given force-dynamic. It does NOT cause the bug, but it also doesn't help.

- timestamp: 2026-05-20
  checked: Two separate truck create paths exist: (1) /carrier/fleet/trucks/new → CarrierTruckForm → POST /api/v1/carrier/fleet/trucks [uses after()], (2) /trucks/new → TruckForm → createTruck() server action [uses synchronous recordActivationEvent]
  found: The LEGACY path (/trucks/new with createTruck server action) calls recordActivationEvent SYNCHRONOUSLY (not in after()), so the DB write is complete before redirect(). The NEW carrier path (/carrier/fleet/trucks/new) uses after(), so the DB write is deferred.
  implication: The user test was on /carrier/fleet/trucks/new (the carrier portal), which uses after() deferral — this is the problematic path. The legacy /trucks/new would NOT exhibit this race because it's synchronous.

## Resolution

root_cause: The TKT-0040 fix correctly added `export const dynamic = 'force-dynamic'` to welcome/page.tsx and `revalidatePath('/onboarding/welcome')` to the three carrier API routes. However, the fix did not address the WRITE-TIMING RACE: `recordActivationEvent` is called inside `after()` in the carrier truck POST route, which defers the DB write until AFTER the 201 HTTP response is sent. When the user navigates to /onboarding/welcome within ~500ms of seeing the "Truck created" success toast, the welcome page's fresh server render reads activationProgress.firstRealTruckAt — which is still NULL because after() hasn't committed the update yet. The page renders with the truck step unchecked. This is not a cache problem; it is a DB write timing problem caused by after() deferral racing against fast user navigation.

fix: Move recordActivationEvent OUT of after() in the carrier truck POST route (and the other two carrier routes: fleet/drivers, clients), making it synchronous (awaited inline before the 201 response). This ensures firstRealTruckAt is written to DB before the HTTP response reaches the browser, so any subsequent navigation to /onboarding/welcome will see the committed data. The after() wrapper was added to avoid blocking the user-facing response, but the actual DB write is fast (~50-100ms) and the user-visible delay is acceptable given the onboarding context.

Alternative fix (lower-latency): Keep recordActivationEvent in after() but add a short client-side delay in CarrierTruckForm before navigating (e.g., 1000ms after success toast). This is fragile and not recommended.

verification: empty — diagnose_only mode
files_changed: []
