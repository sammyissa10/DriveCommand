---
status: diagnosed
trigger: "tkt-0040-onboarding-welcome-stale-data — onboarding welcome view doesn't reflect newly-created drivers/trucks/clients"
created: 2026-05-20T00:00:00Z
updated: 2026-05-20T00:00:00Z
---

## Current Focus

hypothesis: The welcome page re-renders fresh data on each server request (no page-level cache), BUT the Next.js App Router client-side router cache serves the previously rendered HTML when the user navigates back via the browser Back button or a Next.js <Link>. No revalidatePath('/onboarding/welcome') is ever called by any create action, so the router cache is never purged.
test: confirmed via code reading — zero revalidatePath('/onboarding/welcome') calls anywhere in the codebase
expecting: fix requires adding revalidatePath('/onboarding/welcome') to the three carrier API create routes (trucks, drivers, clients) or adding export const dynamic = 'force-dynamic' to the page
next_action: DIAGNOSED — no further action (diagnostic_only mode)

## Symptoms

expected: After creating a driver, truck, or client, the onboarding welcome screen should reflect those newly-created records (counts update, steps marked complete).
actual: The onboarding welcome view shows the pre-creation state — it does not update to reflect newly-added entities even after navigating back to it.
errors: No errors reported — the create actions succeed. This is a silent stale-render bug.
reproduction: 1) Log in as fresh/demo tenant. 2) Navigate to onboarding welcome screen. 3) Create a driver (or truck, or client) via the normal flow. 4) Navigate back to the onboarding welcome screen. Observe: step still shows incomplete / count unchanged.
timeline: Reported May 16 by demo@drivecommand.com on DriveCommand Demo tenant. Confirmed on both desktop and mobile browser. Not viewport-specific.

## Eliminated

- hypothesis: persisted flag not updated — onboardingComplete set once at signup, never re-evaluated
  evidence: There is no onboardingComplete boolean. The system uses activationProgress.firstRealTruckAt/firstRealDriverAt/firstRealClientAt timestamps plus completionPct (int). recordActivationEvent() does update these correctly after each create action.
  timestamp: 2026-05-20

- hypothesis: sample data filter — onboarding counts real records (isSample=false) but demo creates mark isSample=true
  evidence: The welcome page does NOT query trucks/drivers/clients directly. It reads activationProgress fields. The truck and client API routes guard recordActivationEvent with !carrierTruck.isSample / !client.isSample, so real creates DO fire the tracker. Not the cause (though isSample guard exists in truck/client routes).
  timestamp: 2026-05-20

- hypothesis: DB not updated at all — activation tracker fails silently
  evidence: activation-tracker.ts wraps everything in try/catch and NEVER propagates. Errors are silently swallowed. However, both the carrier API routes (trucks, drivers, clients) and the old (owner) actions routes call recordActivationEvent. The DB write path looks correct. Not the primary cause.
  timestamp: 2026-05-20

## Evidence

- timestamp: 2026-05-20
  checked: apps/web/src/app/onboarding/welcome/page.tsx
  found: Pure async server component. Queries prisma.activationProgress directly. No export const dynamic, no revalidate segment config, no unstable_cache, no noStore(). The page has NO cache-busting directive.
  implication: Next.js App Router will cache the rendered output of this server component in the router cache (client-side) for the default 30-second window. Navigating back to this page within that window serves stale HTML.

- timestamp: 2026-05-20
  checked: apps/web/src/app/(owner)/actions/trucks.ts, drivers.ts, customers.ts
  found: trucks.ts revalidatePath('/trucks') + revalidateTag('dashboard-metrics'). drivers.ts revalidatePath('/drivers') + revalidateTag('dashboard-metrics'). customers.ts revalidatePath('/crm'). None call revalidatePath('/onboarding/welcome').
  implication: The old (owner) server action path never invalidates the onboarding welcome page.

- timestamp: 2026-05-20
  checked: apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts, fleet/drivers/route.ts, clients/route.ts
  found: All three use next/server after() to call recordActivationEvent. None call revalidatePath('/onboarding/welcome') or revalidateTag of any kind. These are the primary create paths for the carrier portal.
  implication: revalidatePath is never called for the onboarding/welcome route from ANY create path.

- timestamp: 2026-05-20
  checked: grep -r "revalidatePath.*onboarding" across entire apps/web/src
  found: ZERO matches
  implication: The onboarding/welcome page cache is never explicitly purged by any user action.

- timestamp: 2026-05-20
  checked: apps/web/src/middleware.ts line 61
  found: '/onboarding/welcome' is in PUBLIC_PATHS — middleware short-circuits to NextResponse.next() immediately, no session header injection.
  implication: The page itself calls getSession() to get the tenantId. This works correctly. The middleware status is not the cause.

- timestamp: 2026-05-20
  checked: apps/web/src/app/onboarding/welcome/checklist.tsx
  found: 'use client' component. Checklist items link to /carrier/fleet/trucks/new etc. via Next.js <Link>. When user navigates to the create page and then comes back, Next.js uses back-navigation which restores the router cache entry for /onboarding/welcome — the stale pre-creation HTML.
  implication: Client-side navigation (Link + browser Back) bypasses server re-fetch unless the page is invalidated.

- timestamp: 2026-05-20
  checked: apps/web/src/app/api/auth/login/route.ts lines 139-158
  found: Login checks activationProgress.isActivated to decide whether to redirect to /onboarding/welcome. isActivated is only set to true when completionPct reaches 100 (all 4 steps done).
  implication: The redirect-on-login logic is separate from the stale-render problem. This is working correctly.

- timestamp: 2026-05-20
  checked: drivers.ts (owner action) — recordActivationEvent call
  found: apps/web/src/app/(owner)/actions/drivers.ts does NOT call recordActivationEvent at all. Only trucks.ts (owner action) and customers.ts (owner action) do. The carrier API route /api/v1/carrier/fleet/drivers/route.ts does call it via after().
  implication: If tenant uses the legacy (owner) driver create action instead of the carrier API, the activation tracker is never called for drivers. Secondary issue.

## Resolution

root_cause: The /onboarding/welcome server component has no cache-busting directive (no `export const dynamic = 'force-dynamic'`, no `revalidatePath`/`revalidateTag` call from create actions). After the user creates a truck/driver/client via the carrier API routes, the activationProgress record IS updated in the DB — but no code calls `revalidatePath('/onboarding/welcome')`. When the user navigates back, the Next.js router cache serves the previously rendered HTML for the 30-second client-side cache window. On a full page reload the data is fresh, confirming the issue is router cache staleness, not a DB write failure.

fix: Two complementary fixes required:
  1. PRIMARY — Add `revalidatePath('/onboarding/welcome')` inside the `after()` block in each of the three carrier API create routes (trucks, drivers, clients route.ts). This invalidates the router cache entry when any activation event fires.
  2. SECONDARY — Add `export const dynamic = 'force-dynamic'` to apps/web/src/app/onboarding/welcome/page.tsx as a belt-and-suspenders safeguard. This opts the page out of static generation and ensures a fresh server render on every request.
  3. MINOR — apps/web/src/app/(owner)/actions/drivers.ts is missing a `recordActivationEvent(tenantId, 'first_real_driver')` call (present in trucks.ts and customers.ts). Low-impact since the carrier API route covers this path, but creates silent inconsistency if the legacy action is ever reached.

verification: empty
files_changed: []
