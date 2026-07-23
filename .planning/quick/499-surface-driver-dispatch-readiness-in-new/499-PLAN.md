---
phase: quick-499
plan: 499
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
  - apps/web/src/components/carrier/loads/LoadForm.tsx
  - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  - apps/web/src/components/carrier/loads/DispatchFailedBanner.tsx
autonomous: true

must_haves:
  truths:
    - "In the New Load dispatch section, drivers whose CDL onboarding is incomplete show a 'Not dispatch-ready' tag in the Primary Driver dropdown"
    - "Selecting a not-ready primary driver shows an inline amber warning under the field, but the submit button stays enabled"
    - "When Create & Dispatch fails with DRIVER_NOT_DISPATCH_READY, the user lands on the created load's detail page (not the list) with a persistent dismissible banner explaining why"
    - "Any other dispatch failure also lands on the load detail page (keeping today's toast) instead of the list"
    - "The readiness gate in trips.ts is unchanged; no DB schema/state added"
  artifacts:
    - path: "apps/web/src/app/(owner)/carrier/loads/new/page.tsx"
      provides: "driverOptions payload including isDispatchReady derived from linked User"
      contains: "isDispatchReady"
    - path: "apps/web/src/components/carrier/loads/LoadForm.tsx"
      provides: "DriverOption.isDispatchReady, dropdown tag, inline amber warning, redirect-to-detail on dispatch failure"
      contains: "isDispatchReady"
    - path: "apps/web/src/components/carrier/loads/DispatchFailedBanner.tsx"
      provides: "Client component reading useSearchParams, dismissible banner"
      contains: "useSearchParams"
    - path: "apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx"
      provides: "DispatchFailedBanner rendered above ResponsiveSwitch"
      contains: "DispatchFailedBanner"
  key_links:
    - from: "new/page.tsx carrierDriver.findMany"
      to: "User.isDispatchReady"
      via: "user: { select: { isDispatchReady: true } } relation select"
      pattern: "user:\\s*\\{\\s*select:\\s*\\{\\s*isDispatchReady"
    - from: "LoadForm submit dispatch-failure branch"
      to: "/carrier/loads/{savedId}?dispatch_failed=..."
      via: "router.push with query param"
      pattern: "dispatch_failed"
    - from: "[id]/page.tsx"
      to: "DispatchFailedBanner"
      via: "rendered above ResponsiveSwitch"
      pattern: "DispatchFailedBanner"
---

<objective>
Surface driver dispatch-readiness in the New Load dispatch section and make a failed
Create & Dispatch persistent instead of a transient toast.

Today: Create & Dispatch saves the load, POSTs /api/v1/carrier/dispatches, the Phase 45
readiness gate (trips.ts:198-208) returns 409 DRIVER_NOT_DISPATCH_READY for any driver
still mid-onboarding, and the only feedback is a 6s toast before redirecting to the loads
list — the customer's driver/truck/departure inputs vanish with no trail.

Purpose: Give owners a pre-flight signal (which drivers aren't ready) and a persistent,
actionable landing state (a banner on the saved load's detail page) when dispatch is blocked.
The load itself always saves — only the trip is blocked — so the flow should never feel like
a hard error.

Output: readiness threaded query -> DriverOption -> dropdown tag + inline warning; dispatch
failures redirect to the load detail page; a dismissible banner on the detail page.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Key source (already located — read the exact ranges, do not re-scan the tree)
# apps/web/src/app/(owner)/carrier/loads/new/page.tsx      — driver query (21-25), driverOptions (39-43), desktop LoadForm (63)
# apps/web/src/components/carrier/loads/LoadForm.tsx        — DriverOption type (38-42), submit dispatch-failure branches (487-496), driver <select> (769-786)
# apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx      — driverOptions (183-187), return/ResponsiveSwitch (238-353)
# apps/web/src/lib/carrier/trips.ts                          — readiness gate (198-208) — DO NOT MODIFY
</context>

<constraints>
HARD CONSTRAINTS — call these out and honor them exactly:
- Do NOT weaken or bypass the readiness gate in apps/web/src/lib/carrier/trips.ts. No overrideReason auto-fill. No change to the dispatches API contract.
- Banner is display-only. NO Prisma schema change, NO new DB state. State lives entirely in the URL query param + local dismiss state.
- Do NOT modify the internals of NewLoadMobile or LoadDetailMobile. The detail banner is a separate shared client component rendered ABOVE the ResponsiveSwitch.
- Match existing amber/warning styling in apps/web. Blue precedent at LoadForm.tsx ~760 uses
  `text-blue-700 dark:text-blue-300`; the info-box pattern elsewhere uses
  `bg-blue-50 border border-blue-200 dark:bg-blue-950/40 dark:border-blue-800`. Use the amber equivalent:
  `bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800` with text
  `text-amber-800 dark:text-amber-300`.
- NO emoji in copy. Use a hyphen "-" exactly as written in the copy below, never an em-dash.
- Driver detail route is `/carrier/fleet/drivers/[id]` (verified) — NOT `/carrier/drivers/[id]`.
- A driver with a null userId (pre-invite-acceptance) is treated as NOT dispatch-ready.
- Submit button MUST stay enabled when a not-ready driver is selected — saving the load is valid.
- `tsc --noEmit` is NOT sufficient (baseline ~35 pre-existing errors from missing @types). Executor MUST run `next build` in apps/web before declaring done; only regressions in touched files or a build failure count.
- Commit atomically. Do NOT push. Do NOT run vercel. The orchestrator handles the final push/deploy.
</constraints>

<tasks>

<task type="auto">
  <name>Task 1: Thread readiness into New Load dispatch section + pre-flight UI + redirect-to-detail on dispatch failure</name>
  <files>apps/web/src/app/(owner)/carrier/loads/new/page.tsx, apps/web/src/components/carrier/loads/LoadForm.tsx</files>
  <action>
DATA (new/page.tsx):
- In the `prisma.carrierDriver.findMany` at lines 21-25, add the linked-user relation to the
  select: `user: { select: { isDispatchReady: true } }` alongside the existing id/firstName/lastName.
- In `driverOptions` (39-43), add `isDispatchReady: d.user?.isDispatchReady ?? false` (null userId /
  no linked user => false = NOT ready).

TYPE (LoadForm.tsx):
- Extend `DriverOption` (line 38): add `isDispatchReady?: boolean;` (optional so the edit-mode caller
  that omits `drivers` stays valid).

DROPDOWN TAG (LoadForm.tsx, Primary Driver <select> ~782-784):
- For each option label, append a text-only tag when not ready:
  `{d.name}{d.isDispatchReady === false ? ' - Not dispatch-ready' : ''}`
  (native <option> can't be styled; text tag only). Apply the same label treatment to the Co-Driver
  <select> options (~833-837) for consistency.

INLINE WARNING (LoadForm.tsx, under the Primary Driver field, inside its wrapping <div> after the </select> ~785):
- Compute the selected primary driver: `const selectedPrimaryDriver = drivers?.find((d) => d.id === primaryDriverId);`
  near the other render-time derivations (or inline).
- When `selectedPrimaryDriver && selectedPrimaryDriver.isDispatchReady === false`, render an amber box:
  wrapper `mt-2 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 px-3 py-2`,
  text `text-xs text-amber-800 dark:text-amber-300`.
  Copy: "This driver hasn't completed onboarding requirements yet. The load will be saved, but the trip can't start until they're ready."
  Include a link to `/carrier/fleet/drivers/${selectedPrimaryDriver.id}` with label "View driver" (use next/link
  `Link` — confirm it's already imported; if not, add it). The submit button logic is UNCHANGED (stays enabled).

REDIRECT-TO-DETAIL (LoadForm.tsx submit flow, the dispatch-failure block at 487-496):
- Replace the two `router.push('/carrier/loads')` in that block:
  - DRIVER_NOT_DISPATCH_READY branch: keep today's toast, then
    `const driverName = drivers?.find((d) => d.id === primaryDriverId)?.name ?? '';`
    `router.push(\`/carrier/loads/${savedId}?dispatch_failed=not_ready&driver=${encodeURIComponent(driverName)}\`);`
  - Other-failure branch (else): keep today's toast, then
    `router.push(\`/carrier/loads/${savedId}?dispatch_failed=other\`);`
- Leave the happy-path (successful dispatch -> `/carrier/dispatches/{newDispatchId}`) and the
  attach-failure redirect exactly as-is.
  </action>
  <verify>
- `grep -n "isDispatchReady" apps/web/src/app/(owner)/carrier/loads/new/page.tsx` shows it in both the select and driverOptions.
- `grep -n "Not dispatch-ready\|dispatch_failed\|isDispatchReady" apps/web/src/components/carrier/loads/LoadForm.tsx` shows the tag, the warning, and both redirects.
- Reason through: ready driver -> no tag, no warning, happy path unchanged; not-ready selected -> tag + amber warning, submit still enabled; 409 -> toast + push to `/carrier/loads/{id}?dispatch_failed=not_ready&driver=...`; other failure -> toast + push to `/carrier/loads/{id}?dispatch_failed=other`.
  </verify>
  <done>driverOptions carry isDispatchReady (false when userId null); the Primary/Co-Driver dropdowns tag not-ready drivers; selecting a not-ready primary driver shows the amber warning with a working link to `/carrier/fleet/drivers/[id]`; both dispatch-failure branches redirect to the load detail page with the query param; submit stays enabled.</done>
</task>

<task type="auto">
  <name>Task 2: Dismissible dispatch-failed banner on the load detail page</name>
  <files>apps/web/src/components/carrier/loads/DispatchFailedBanner.tsx, apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx</files>
  <action>
NEW COMPONENT (DispatchFailedBanner.tsx):
- `'use client'`. Reads `useSearchParams()` from next/navigation. If `dispatch_failed` is absent, render null.
- Local `useState` `dismissed` (default false); if dismissed, render null.
- Decode `driver` param (may be empty). Compose copy per reason:
  - `not_ready` (and default): "This load isn't on a trip yet - {driverName} wasn't dispatch-ready when you tried to start it. Complete their onboarding checklist, then use Add to Trip."
    If driverName is empty, use "the selected driver" in its place so the sentence still reads.
  - `other`: "This load isn't on a trip yet - the trip couldn't be started. You can add it to a trip later using Add to Trip."
- Styling: amber box matching the constraint tokens
  (`rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800 px-4 py-3`,
  text `text-sm text-amber-800 dark:text-amber-300`, flex row with the message and a dismiss control).
- Dismiss control: a button (accessibilityLabel/aria-label "Dismiss") that sets `dismissed=true` AND strips
  the params via `router.replace` — build a fresh path with the query params removed
  (`const params = new URLSearchParams(searchParams); params.delete('dispatch_failed'); params.delete('driver'); router.replace(pathname + (params.toString() ? \`?${params}\` : ''))`)
  using `usePathname()` + `useRouter()`. No emoji; use an X lucide icon or a plain "Dismiss" text button consistent with other dismissible UI in apps/web.

WIRE INTO DETAIL PAGE ([id]/page.tsx):
- Import DispatchFailedBanner.
- In the return (line 238), wrap `<ResponsiveSwitch .../>` in a fragment and render
  `<DispatchFailedBanner />` ABOVE it so it appears on both mobile and desktop branches without
  touching LoadDetailMobile internals. Keep the existing `-m-4` spacing intact for the mobile branch;
  place the banner with sensible padding so it doesn't collide with the `-m-4` (e.g. wrap banner in a
  `px-4 pt-4` container, or render it inside the existing spacing context — pick the option that keeps
  the mobile layout clean and the desktop `space-y-6` unaffected).
- OPTIONAL (only if trivial and non-breaking): thread `isDispatchReady` into this page's `driverOptions`
  (183-187) by adding `user: { select: { isDispatchReady: true } }` to the rawDrivers query (36-40) and
  `isDispatchReady: d.user?.isDispatchReady ?? false` to driverOptions, so a future Add-to-Trip picker can
  reuse it. Do NOT change LoadDetailActions or LoadDetailMobile behavior. Skip if it risks the build.
  </action>
  <verify>
- `grep -n "DispatchFailedBanner" apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` shows import + render above ResponsiveSwitch.
- `grep -n "useSearchParams\|dispatch_failed\|dismissed" apps/web/src/components/carrier/loads/DispatchFailedBanner.tsx` confirms the client wiring.
- Reason through: landing on `/carrier/loads/{id}?dispatch_failed=not_ready&driver=Jane%20Doe` shows the amber banner naming Jane Doe; dismiss hides it and strips the params; visiting the detail page with no param shows no banner.
  </verify>
  <done>A dismissible amber banner renders on the load detail page (both branches) derived solely from the URL query param, names the driver for the not_ready reason, falls back gracefully when the driver name is empty, dismiss clears local state and strips the param, and no DB state was added.</done>
</task>

</tasks>

<verification>
- Run `next build` from apps/web (NOT just tsc). Build must pass; no new type errors in the four touched files.
- `grep -rn "isDispatchReady" apps/web/src/app/(owner)/carrier/loads/new/page.tsx apps/web/src/components/carrier/loads/LoadForm.tsx` confirms readiness threaded query -> DriverOption -> label + warning.
- Confirm trips.ts is untouched (`git diff --name-only` shows no lib/carrier/trips.ts).
- Confirm no schema.prisma / migration changes.
- Confirm the driver link uses `/carrier/fleet/drivers/[id]`.
</verification>

<success_criteria>
- New Load dispatch section: not-ready drivers tagged in the Primary/Co-Driver dropdowns; selecting a not-ready primary driver shows the amber inline warning with a working driver link; submit stays enabled.
- Create & Dispatch failures (both 409 not-ready and any other) redirect to the created load's DETAIL page with a query param, not the loads list.
- Load detail page shows a persistent, dismissible amber banner derived from the query param, on both mobile and desktop branches, without modifying LoadDetailMobile internals.
- Readiness gate, dispatches API contract, and DB schema unchanged. No emoji; hyphen used in copy as specified.
- `next build` passes in apps/web. Committed atomically, not pushed, no vercel run.
</success_criteria>

<output>
After completion, create `.planning/quick/499-surface-driver-dispatch-readiness-in-new/499-SUMMARY.md`.
</output>
