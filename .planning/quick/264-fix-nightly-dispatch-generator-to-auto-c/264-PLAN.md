---
phase: quick-264
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/dispatch-generator.ts
  - apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
  - apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts
autonomous: true

must_haves:
  truths:
    - "Nightly cron creates dispatch + load + stops in one transaction per scheduled date"
    - "Load gets auto-generated referenceNumber (LD-YYYY-NNNNN), links to contract/client from template"
    - "Stops get loadId, appointment times from scheduled_departure + offset_min, address snapshot, bol/pod flags"
    - "If template has no clientId, dispatch+stops are created without a load, needs_assignment=true"
    - "Transaction rollback: if load or stop creation fails, the dispatch for that date is NOT created"
    - "Manual generate endpoint returns created dispatch with load and stops"
    - "InAppNotification created after each dispatch generation (dispatch_generated or needs_assignment type)"
  artifacts:
    - path: "apps/web/src/lib/carrier/dispatch-generator.ts"
      provides: "Transactional dispatch+load+stops generation"
    - path: "apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts"
      provides: "Manual trigger endpoint returning full dispatch+load+stops"
    - path: "apps/web/prisma/schema.prisma"
      provides: "dispatch_generated enum value on InAppNotificationType"
  key_links:
    - from: "dispatch-generator.ts"
      to: "prisma.$transaction"
      via: "wrap dispatch+load+stops in single tx"
    - from: "dispatch-generator.ts"
      to: "in-app-notifications.ts"
      via: "createNotification after each dispatch"
---

<objective>
Fix the nightly dispatch generator to auto-create loads and stops from route templates, not just dispatch records. Wrap all creation in a transaction so partial failures roll back cleanly. Add dispatcher notifications via after().

Purpose: Eliminates manual load/stop creation after auto-dispatch, making the nightly cron actually useful.
Output: Updated dispatch-generator.ts, updated cron route, updated manual generate endpoint, schema migration for new enum value.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/dispatch-generator.ts
@apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
@apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts
@apps/web/src/lib/carrier/in-app-notifications.ts
@apps/web/src/lib/carrier/loads.ts (referenceNumber generation pattern at line 184-194)
@apps/web/prisma/schema.prisma (CarrierDispatch line 1516, CarrierLoad line 1560, CarrierStop line 1609, RouteTemplate line 1452, RouteTemplateStop line 1491, InAppNotificationType line 106)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add dispatch_generated enum + migrate, rewrite generateDispatches to create dispatch+load+stops in transaction</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/src/lib/carrier/dispatch-generator.ts
  </files>
  <action>
1. In schema.prisma, add `dispatch_generated` to the `InAppNotificationType` enum (after `needs_assignment`, before `fleet_message`).

2. Create migration: `cd apps/web && npx prisma migrate dev --name add_dispatch_generated_notification_type`. Then run `npx prisma generate`.

3. Rewrite `dispatch-generator.ts` — the core `generateDispatches` function. Keep ALL existing helpers (expandSchedule, parseISODate, toISODate, applyTimeToDate) and the GenerationResult type UNCHANGED.

Key changes to `generateDispatches`:

a. **Update GenerationResult** — add fields to the interface:
   ```
   loadsCreated: number;
   stopsCreated: number;
   notifications: Array<{ orgId: string; dispatchId: string; templateName: string; dispatchNumber: string; needsAssignment: boolean; }>
   ```

b. **Wrap each date's work in `prisma.$transaction`** — replace the current sequential create calls (lines 306-348) with a single `prisma.$transaction(async (tx) => { ... })`. Inside the tx:
   - Create dispatch (same as current, using `tx.carrierDispatch.create`)
   - Auto-generate load referenceNumber using the same pattern as `loads.ts` line 184-194: query `tx.carrierLoad.findFirst({ where: { orgId, referenceNumber: { startsWith: 'LD-YYYY-' } }, orderBy: { referenceNumber: 'desc' } })`, parse last seq, increment
   - If template has `clientId`: create `tx.carrierLoad.create` with: orgId, dispatchId, contractId (from template), clientId (from template), loadType 'ftl', referenceNumber (auto-generated), commodityDescription (from template), rateType + rateAmount + fuelSurcharge from contract (same FSC logic as current), status 'assigned'
   - If template has NO clientId: skip load creation, set `needsAssignment = true` on the dispatch notes
   - Create stops via `tx.carrierStop.create` for each template stop: dispatchId, loadId (from created load or null), sequenceOrder, stopType, facilityId, contactName, contactPhone, commodityDescription, specialInstructions, bolRequired, podRequired, status 'pending', notes with address_snapshot JSON (same as current)
   - **Appointment times**: compute `appointmentStart` from `scheduledDeparture + stop.apptWindowStartOffsetMin` minutes (if offset exists), `appointmentEnd` from `scheduledDeparture + stop.apptWindowEndOffsetMin` minutes (if offset exists). Use `new Date(scheduledDeparture.getTime() + offsetMin * 60000)`.

c. **Conflict detection stays outside the transaction** (same as current — read-only check).

d. **Logging**: after successful transaction, log dispatch_id, load_id (or null), stop count, template_id, dispatchNumber.

e. **Collect notification params** in the `notifications` array on GenerationResult (do NOT call createNotification inside generateDispatches — let the caller handle it via after()). Each entry: `{ orgId, dispatchId, templateName: template.templateName, dispatchNumber, needsAssignment }`.

f. **Initialize new fields** in the result object: `loadsCreated: 0, stopsCreated: 0, notifications: []`.

Important: Do NOT import `after` or `createNotification` in dispatch-generator.ts. Keep it a pure data function. The cron route and API route will handle notifications.
  </action>
  <verify>
    Run `cd C:/Users/sammy/Projects/DriveCommand/apps/web && npx tsc --noEmit` — no TypeScript errors.
    Confirm schema migration applied: check that `dispatch_generated` exists in the generated Prisma client types.
  </verify>
  <done>
    generateDispatches creates dispatch+load+stops in a single transaction per date. Load gets auto-generated referenceNumber. Stops get loadId, appointment times from offsets, bol/pod flags. If no clientId, skips load and marks needs_assignment. GenerationResult includes loadsCreated, stopsCreated, and notification params for callers.
  </done>
</task>

<task type="auto">
  <name>Task 2: Update cron route + manual generate endpoint with after() notifications and enriched response</name>
  <files>
    apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
    apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts
  </files>
  <action>
1. **Update cron route** (`carrier-auto-dispatch/route.ts`):
   - Add imports: `import { after } from 'next/server';` and `import { createNotification } from '@/lib/carrier/in-app-notifications';`
   - After each `generateDispatches` call, iterate over `result.notifications` and fire `after(() => createNotification({ ... }))` for each:
     - If `needsAssignment`: type `'needs_assignment'`, title `'Dispatch Needs Assignment'`, message `'Auto-generated dispatch ${dispatchNumber} from template "${templateName}" needs driver/truck assignment'`, entityType `'dispatch'`, entityId: dispatchId
     - If NOT needsAssignment: type `'dispatch_generated'`, title `'Dispatch Generated'`, message `'Dispatch ${dispatchNumber} auto-generated from template "${templateName}"'`, entityType `'dispatch'`, entityId: dispatchId
     - orgId from tenant.id, userId null (visible to all owners in org)
   - Update summary to include `total_loads_created` and `total_stops_created` fields, aggregated from results.
   - Keep the existing tenant-isolation try/catch pattern.

2. **Update manual generate endpoint** (`route-templates/[id]/generate/route.ts`):
   - Add imports: `import { after } from 'next/server';` and `import { createNotification } from '@/lib/carrier/in-app-notifications';`
   - After `generateDispatches` returns, fire the same `after(() => createNotification(...))` pattern for each notification in `result.notifications`.
   - Enrich the response JSON to include `loads_created` and `stops_created` from the result.
   - Add optional `date` field to the request body schema (defaults to today in YYYY-MM-DD format if not provided). Pass this as `generateThroughDate` so the endpoint generates for a specific date. Keep existing `generate_through_date` field as the primary, add `date` as alias.
  </action>
  <verify>
    Run `cd C:/Users/sammy/Projects/DriveCommand/apps/web && npx tsc --noEmit` — no TypeScript errors.
    Verify the cron route still handles tenant isolation (one tenant failure does not block others).
    Verify the manual endpoint returns enriched response with loads_created and stops_created.
  </verify>
  <done>
    Cron route fires after() notifications for each auto-generated dispatch (dispatch_generated or needs_assignment type). Manual endpoint returns full creation details and also fires notifications. Both routes aggregate load and stop counts in their responses. No TypeScript errors.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. `npx prisma validate` confirms schema is valid
3. Grep for `$transaction` in dispatch-generator.ts confirms transactional wrapping
4. Grep for `createNotification` in both route files confirms notification wiring
5. Grep for `dispatch_generated` in schema.prisma confirms enum addition
6. Grep for `appointmentStart` in dispatch-generator.ts confirms stop appointment time computation
7. Grep for `referenceNumber` in dispatch-generator.ts confirms load number generation
</verification>

<success_criteria>
- Nightly cron creates dispatch + load + stops (not just dispatch) from each active route template
- All three entities created in a single prisma.$transaction per scheduled date
- Load gets auto-generated LD-YYYY-NNNNN referenceNumber, contract rate, FSC, commodity from template
- Stops get loadId link, appointment times from departure + offset, address snapshot, bol/pod flags
- Templates without clientId create dispatch+stops only (no load), with needs_assignment=true
- Transaction rolls back entirely if any create fails (no orphaned dispatches)
- InAppNotification fired via after() for each generated dispatch
- Manual POST /api/v1/carrier/route-templates/[id]/generate returns dispatch+load+stops counts
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/264-fix-nightly-dispatch-generator-to-auto-c/264-SUMMARY.md`
</output>
