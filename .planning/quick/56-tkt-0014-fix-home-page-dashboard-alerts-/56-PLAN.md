---
phase: quick-56
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/dashboard.ts
autonomous: true
must_haves:
  truths:
    - "Clicking a truck registration/insurance alert navigates to that specific truck's page"
    - "Driver document alerts still navigate to the specific driver page"
    - "All other alert types (invoices, safety) retain their existing hrefs"
  artifacts:
    - path: "src/app/(owner)/actions/dashboard.ts"
      provides: "Truck-specific href in notification alerts"
      contains: "/trucks/${truck.id}"
  key_links:
    - from: "src/app/(owner)/actions/dashboard.ts"
      to: "src/components/dashboard/notifications-panel.tsx"
      via: "alert.href used in Link component"
      pattern: "href.*alert\\.href"
---

<objective>
Fix TKT-0014: Dashboard truck document alerts (expired/expiring registration, insurance) navigate to `/trucks` (the all-trucks list page) instead of `/trucks/{truckId}` (the specific truck page).

Purpose: When an owner sees an alert about a truck's expired registration, clicking it should take them directly to that truck so they can take action, not dump them on the list page where they have to find it.

Output: One-line fix in `src/app/(owner)/actions/dashboard.ts`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/app/(owner)/actions/dashboard.ts — Line 214: `href: '/trucks'` should be `href: `/trucks/${truck.id}``
@src/components/dashboard/notifications-panel.tsx — Uses `alert.href` in Link component (line 109)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix truck document alert href to include truck ID</name>
  <files>src/app/(owner)/actions/dashboard.ts</files>
  <action>
In `_fetchNotificationAlerts`, inside the `checkDoc` closure (around line 214), change:
```
href: '/trucks',
```
to:
```
href: `/trucks/${truck.id}`,
```

This is inside the `alerts.push()` call within the `checkDoc` helper function that processes truck registration and insurance expiry alerts. The `truck.id` is already available in scope from the outer `for (const truck of truckDocAlerts)` loop.

Do NOT change any other href values. Driver alerts already correctly use `/drivers/${doc.driverId}`, invoice alerts use `/invoices`, and safety alerts use `/safety`.
  </action>
  <verify>
1. `npx tsc --noEmit` — confirms no type errors
2. Grep the file for `href:` and verify truck alerts now use template literal with truck.id while other alert hrefs remain unchanged
  </verify>
  <done>Truck document expiry alerts in the dashboard notifications panel link to `/trucks/{truckId}` instead of `/trucks`</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes
- In `src/app/(owner)/actions/dashboard.ts`, the truck document alert `href` uses `` `/trucks/${truck.id}` `` (template literal with truck ID)
- Driver document alerts still use `/drivers/${doc.driverId}`
- Invoice alerts still use `/invoices`
- Safety alerts still use `/safety`
</verification>

<success_criteria>
Clicking a truck registration or insurance alert on the dashboard navigates to `/trucks/{truckId}` — the specific truck's detail page — not the all-trucks list.
</success_criteria>

<output>
After completion, create `.planning/quick/56-tkt-0014-fix-home-page-dashboard-alerts-/56-SUMMARY.md`
</output>
