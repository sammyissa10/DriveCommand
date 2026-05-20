---
status: diagnosed
trigger: "tkt-0040-onboarding-welcome-third-diagnostic"
created: 2026-05-20T00:00:00Z
updated: 2026-05-20T00:00:00Z
symptoms_prefilled: true
goal: diagnose_only
---

## Current Focus

hypothesis: revalidatePath called from a Route Handler (not a Server Action) does NOT clear the Next.js client-side router cache. The DB write succeeds; the page re-render on the server would produce correct data; but the client-side router serves the cached RSC payload from the previous visit without issuing a new server request.
test: Confirmed via DB state (firstRealTruckAt IS written), Next.js documentation and GitHub issues showing Route Handler revalidatePath does not signal the client router to evict its cache.
expecting: N/A — diagnosis complete
next_action: N/A — return findings

## Symptoms

expected: After creating a truck via /carrier/fleet/trucks/new, /onboarding/welcome shows "Add your first truck" CHECKED.
actual: "Add your first truck" still UNCHECKED in production after QT 397 and QT 398 fixes.
errors: None reported. Truck create succeeds. Bug is silent.
reproduction: 1) Log in as owner with incomplete onboarding. 2) Create truck via /carrier/fleet/trucks/new. 3) Navigate to /onboarding/welcome. 4) Observe: "Add your first truck" still unchecked.
started: Persists after commits 614b41a6 (QT 397) and 8a3bd38f (QT 398).

## Eliminated

- hypothesis: No revalidatePath called after truck create
  evidence: QT 397 added revalidatePath('/onboarding/welcome') to trucks route
  timestamp: 2026-05-20

- hypothesis: recordActivationEvent inside after() racing with navigation
  evidence: QT 398 moved recordActivationEvent out of after(), made synchronous await
  timestamp: 2026-05-20

- hypothesis: DB write (firstRealTruckAt) is failing or being skipped
  evidence: DB query of ActivationProgress for Jordan Expedite tenant (0553c7c3) shows firstRealTruckAt = '2026-05-17T01:38:07.868Z' — correctly populated 295ms after truck was created at 01:38:07.772Z. AppEvent activation.first_real_truck also written at 01:38:08.211Z. No activation.tracker.error events exist in any tenant.
  timestamp: 2026-05-20

- hypothesis: isSample guard incorrectly blocking recordActivationEvent for real trucks
  evidence: Jordan Expedite truck "Truck 1" has is_sample=false in DB. Schema default is false. createCarrierTruck() never sets isSample. The guard `if (!carrierTruck.isSample)` correctly passes for user-created trucks.
  timestamp: 2026-05-20

- hypothesis: ActivationProgress row missing (skipped silently at `if (!current) return`)
  evidence: All HYDRATED tenants have ActivationProgress rows. Row is created during hydrateTenant() → seedSampleData(). Jordan Expedite row existed with updatedAt populated before truck create.
  timestamp: 2026-05-20

- hypothesis: RLS blocking the ActivationProgress update in recordActivationEvent
  evidence: recordActivationEvent uses bare `prisma` (not getTenantPrisma) with `SET app.bypass_rls = 'on'` inside the transaction. RLS bypass_rls_policy exists on ActivationProgress. DB write confirmed successful (firstRealTruckAt populated).
  timestamp: 2026-05-20

- hypothesis: force-dynamic insufficient to prevent stale rendering
  evidence: force-dynamic prevents SSG and disables Data Cache. But this is irrelevant since the bug is in the client router cache, not the server-side Data Cache or Full Route Cache.
  timestamp: 2026-05-20

- hypothesis: middleware blocking or short-circuiting welcome page
  evidence: /onboarding/welcome is listed in PUBLIC_PATHS (middleware.ts line 61) — middleware skips all auth/tenant checks and calls NextResponse.next() immediately. No x-tenant-id header is injected. However, welcome/page.tsx uses getSession() directly (Supabase JWT cookie) to resolve tenantId — does not use getTenantPrisma() or the x-tenant-id header. Correct tenantId is obtained.
  timestamp: 2026-05-20

## Evidence

- timestamp: 2026-05-20T00:00:00Z
  checked: git log --oneline origin/master -10
  found: HEAD is a98c05aa (docs), parent is 820b93e8, parent is 8a3bd38f (the QT 398 fix). Fix commit is confirmed deployed.
  implication: Deployed code is the patched version.

- timestamp: 2026-05-20T00:00:00Z
  checked: apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts POST handler (lines 93-125)
  found: recordActivationEvent is called synchronously (awaited) OUTSIDE after(). It is wrapped in `if (!carrierTruck.isSample)` guard. revalidatePath('/onboarding/welcome') is also called outside after() inside same isSample guard (lines 97-99). Return statement is on line 125 — AFTER both calls.
  implication: QT 397 and QT 398 fixes are correctly implemented in the source.

- timestamp: 2026-05-20T00:00:00Z
  checked: DB ActivationProgress for Jordan Expedite tenant (0553c7c3), most recently HYDRATED test tenant
  found: firstRealTruckAt = '2026-05-17T01:38:07.868Z', completionPct = 40, updatedAt = '2026-05-17T01:38:07.868Z'. Non-sample truck "Truck 1" created at 01:38:07.772Z (is_sample=false). AppEvent activation.first_real_truck written at 01:38:08.211Z.
  implication: DB write is CORRECT. The bug is NOT in the write path. firstRealTruckAt is populated. The problem is that the welcome page renders stale data despite the DB being updated.

- timestamp: 2026-05-20T00:00:00Z
  checked: DB ActivationProgress for ResendProd tenant (4ea4e97a) — sammy's most recent test account
  found: firstRealTruckAt = null. Only truck in carrier_trucks is SAMPLE-1 (is_sample=true). No non-sample truck was ever created for this tenant.
  implication: ResendProd never triggered the bug reproduce path — no real truck was created. Not a useful bug reproduction target.

- timestamp: 2026-05-20T00:00:00Z
  checked: apps/web/src/lib/onboarding/activation-tracker.ts — all guards
  found: Guard 1: `if (!current) return` — skips if no ActivationProgress row. Guard 2: `if (currentFieldValue !== null && currentFieldValue !== undefined) return` — idempotency check. No isDemo check. No permission check. No tenant type check. Uses bare `prisma` client (not getTenantPrisma). Uses `bypass_rls` SET inside transaction.
  implication: No unexpected guard is blocking the write for real tenants.

- timestamp: 2026-05-20T00:00:00Z
  checked: apps/web/src/app/(owner)/carrier/fleet/trucks/new/page.tsx + CarrierTruckForm.tsx
  found: After successful POST to /api/v1/carrier/fleet/trucks, CarrierTruckForm calls router.push('/carrier/fleet/trucks') then router.refresh(). The user then navigates back to /onboarding/welcome (via browser back, URL bar, or a link). The navigation to /onboarding/welcome is a SEPARATE client-side navigation — not directly triggered by the create response.
  implication: The client router cache for /onboarding/welcome is potentially stale at the moment the user navigates to it.

- timestamp: 2026-05-20T00:00:00Z
  checked: revalidatePath behavior in Route Handlers vs Server Actions (Next.js 16.2.1)
  found: When revalidatePath is called from a Route Handler (not a Server Action), it marks the server-side Full Route Cache and Data Cache entries for invalidation. However, it does NOT communicate back to the browser client to evict the client-side Router Cache. The client Router Cache is only cleared when revalidatePath/revalidateTag is called from a Server Action — in that case, the revalidation signal is piggybacked on the server action response headers (x-action-revalidated header), and the client router explicitly evicts cached segments. Route Handler responses carry no such header.
  implication: Even though revalidatePath('/onboarding/welcome') is correctly called BEFORE the response in the trucks route handler, the client-side router cache entry for /onboarding/welcome is NOT evicted. When the user navigates to /onboarding/welcome after creating a truck, Next.js serves the cached RSC payload from the previous visit (before the truck was created), showing "Add your first truck" as unchecked — even though the server-side DB has the correct data.

- timestamp: 2026-05-20T00:00:00Z
  checked: apps/web/src/middleware.ts PUBLIC_PATHS and /onboarding/welcome behavior
  found: /onboarding/welcome is in PUBLIC_PATHS (line 61). Middleware calls NextResponse.next() immediately without injecting x-tenant-id header. This is intentional (new users have no tenant yet). welcome/page.tsx calls getSession() to get tenantId from Supabase JWT cookie directly — not dependent on x-tenant-id header.
  implication: Middleware does not affect the bug. The page correctly reads tenantId from the session. This is a separate structural note, not the cause.

- timestamp: 2026-05-20T00:00:00Z
  checked: apps/web/next.config.ts for Cache-Control headers on /onboarding/welcome
  found: No custom Cache-Control headers on /onboarding routes. Only security headers (X-Frame-Options, HSTS etc) applied globally.
  implication: No CDN/edge caching of the welcome page. Caching is purely Next.js client router cache.

- timestamp: 2026-05-20T00:00:00Z
  checked: apps/web/src/app/onboarding/welcome/page.tsx DB query
  found: export const dynamic = 'force-dynamic' on line 10. DB query at lines 176-188: prisma.$transaction with bypass_rls, tx.activationProgress.findUnique where tenantId from getSession(). No unstable_cache, no React cache(), no fetch() with revalidate. Server-side query is correct and would return fresh data on a real server render.
  implication: If the server actually renders the page fresh, it returns correct data. The problem is the client router cache serves a cached RSC payload, preventing a fresh server render.

- timestamp: 2026-05-20T00:00:00Z
  checked: GitHub issues vercel/next.js #61184, #73644, discussion #54075
  found: Confirmed: "If you fetch a route handler from the browser, it won't affect the Router Cache because there's no way to know what changed — you have to call router.refresh() instead." And: "When the UI calls revalidatePath through a server action, this is communicated back to the browser in the headers, then the client-side router evicts and clears the data it holds." Route Handlers do NOT send the client invalidation signal.
  implication: This is a documented Next.js behavior gap. The fix requires either (a) returning `x-action-revalidated` header equivalent from the Route Handler response (not officially supported), (b) having the client call router.refresh() after the POST, or (c) converting the create flow to use a Server Action instead of a Route Handler.

- timestamp: 2026-05-20T00:00:00Z
  checked: CarrierTruckForm.tsx lines 239-242
  found: After successful truck create, form calls `router.push('/carrier/fleet/trucks')` then `router.refresh()`. The router.refresh() is called on the /carrier/fleet/trucks page, NOT on /onboarding/welcome. It refreshes the truck list page, not the welcome page. The welcome page router cache is never invalidated on the client.
  implication: router.refresh() IS called, but on the wrong page. The welcome page cache is never cleared on the client side.

## Resolution

root_cause: revalidatePath('/onboarding/welcome') called from a Route Handler (POST /api/v1/carrier/fleet/trucks) does NOT clear the Next.js client-side Router Cache. Route Handler responses do not carry the x-action-revalidated header that Server Actions use to signal the browser to evict cached segments. When the user navigates to /onboarding/welcome after creating a truck, the Next.js client router serves the cached RSC payload from the prior visit — showing the truck step as unchecked — even though the DB has firstRealTruckAt populated and the server would return correct data on a fresh render. The same issue affects drivers (route.ts) and clients (route.ts). The fix in QT 397 + QT 398 correctly writes to DB and calls revalidatePath, but neither fix addresses the client router cache, which is the actual blocker.

fix: N/A — diagnose only
verification: N/A
files_changed: []
