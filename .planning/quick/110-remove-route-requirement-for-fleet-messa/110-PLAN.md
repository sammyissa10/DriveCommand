---
phase: quick-110
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(driver)/actions/driver-messages.ts
  - apps/web/src/components/driver/messaging-panel.tsx
autonomous: true
must_haves:
  truths:
    - "Driver can send messages from web portal without an active route"
    - "Driver can view all their messages from web portal regardless of route status"
    - "Existing messages (route-scoped and load-scoped) still display correctly"
  artifacts:
    - path: "apps/web/src/app/(driver)/actions/driver-messages.ts"
      provides: "Route-free message send and fetch for web driver portal"
    - path: "apps/web/src/components/driver/messaging-panel.tsx"
      provides: "Updated FleetMessage type with optional routeId"
  key_links:
    - from: "apps/web/src/components/driver/messaging-panel.tsx"
      to: "apps/web/src/app/(driver)/actions/driver-messages.ts"
      via: "server action imports"
      pattern: "getDriverMessages|sendDriverMessage"
---

<objective>
Remove the route requirement from fleet messaging in the web driver portal. Currently, drivers cannot send or view messages unless they have an active route. The mobile API (quick-102) already allows route-free messaging. Align the web driver portal to match.

Purpose: Drivers should always be able to communicate with dispatch, regardless of whether they have an assigned route.
Output: Updated server actions and messaging panel that work without a route.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/(driver)/actions/driver-messages.ts
@apps/web/src/components/driver/messaging-panel.tsx
@apps/web/src/app/api/mobile/driver/messages/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Remove route requirement from web driver message server actions</name>
  <files>apps/web/src/app/(driver)/actions/driver-messages.ts</files>
  <action>
Rewrite both server actions to remove the route dependency, aligning with how the mobile API already works (see `/api/mobile/driver/messages/route.ts` for reference pattern):

**`getDriverMessages()`:**
- Remove the route lookup query entirely.
- Instead, fetch all FleetMessages where the driver is involved. Use an OR clause:
  1. Messages on loads assigned to the driver: find all loads where `driverId = user.id`, collect their IDs, then query `fleetMessage.findMany` where `loadId IN loadIds`.
  2. Legacy messages sent by this driver without a loadId: `loadId: null, senderId: user.id`.
  3. Legacy route-scoped messages: find any routes where `driverId = user.id`, collect their IDs, and include `routeId IN routeIds` in the OR clause.
- Keep `orderBy: { createdAt: 'asc' }`.
- Return the messages array (empty array if none found, never block).

**`sendDriverMessage()`:**
- Remove the route lookup and the "No active route found" error block entirely.
- Create the FleetMessage with `routeId: null` and `loadId: null` (general message not scoped to a specific load or route).
- Keep the email notification. For `routeName`, pass `undefined` since there is no route context.
- Keep existing validation (non-empty message, auth check).
- The create call becomes: `prisma.fleetMessage.create({ data: { tenantId: user.tenantId, senderId: user.id, senderRole: 'DRIVER', body: message.trim() } })`.
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web` to confirm no type errors. Grep for "No active route" to confirm the blocking message is gone.</verify>
  <done>Both server actions work without requiring an active route. getDriverMessages returns messages across loads/routes/unscoped. sendDriverMessage creates messages without route restriction.</done>
</task>

<task type="auto">
  <name>Task 2: Update MessagingPanel FleetMessage type</name>
  <files>apps/web/src/components/driver/messaging-panel.tsx</files>
  <action>
Update the local `FleetMessage` type definition at the top of the file:
- Change `routeId: string` to `routeId: string | null` (routeId is now optional in the schema).
- Add `loadId?: string | null` field to match the current schema.

No other changes needed to this component -- the rendering logic does not reference routeId or loadId, so it will continue to work as-is.
  </action>
  <verify>Run `npx tsc --noEmit` from `apps/web` to confirm no type errors.</verify>
  <done>FleetMessage type in MessagingPanel matches the updated schema with optional routeId and loadId.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` -- no type errors.
2. `grep -r "No active route" apps/web/src/` -- returns no results.
3. `grep -r "active route" apps/web/src/app/\(driver\)/actions/driver-messages.ts` -- returns no results.
</verification>

<success_criteria>
- Web driver portal messaging works without an active route (no blocking error).
- getDriverMessages returns messages from loads, routes, and unscoped sources.
- sendDriverMessage creates messages without requiring a route lookup.
- TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/110-remove-route-requirement-for-fleet-messa/110-SUMMARY.md`
</output>
