---
phase: quick-268
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
autonomous: true
must_haves:
  truths:
    - "Attaching a second load to a dispatch succeeds (no 500 error)"
    - "New stops get sequenceOrder values that do not collide with existing dispatch stops"
    - "PATCH error logs show the actual error message, not [object Object]"
  artifacts:
    - path: "apps/web/src/lib/carrier/loads.ts"
      provides: "sequenceOrder offset logic in persistStops"
      contains: "existingDispatchStopCount"
    - path: "apps/web/src/app/api/v1/carrier/loads/[id]/route.ts"
      provides: "Improved error logging in PATCH catch block"
      contains: "err instanceof Error"
  key_links:
    - from: "persistStops"
      to: "carrierStop.createMany"
      via: "sequenceOrder offset by existing dispatch stop count"
      pattern: "existingDispatchStopCount"
---

<objective>
Fix 500 error when attaching a second load to a dispatch. The CarrierStop table has a unique constraint on (dispatchId, sequenceOrder), so new stops from a second load collide with existing stops. Also improve error logging in the PATCH handler so real error messages appear in Vercel logs.

Purpose: Unblock multi-load dispatches and improve debugging visibility.
Output: Two files patched — loads.ts and route.ts.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
@apps/web/prisma/schema.prisma (line 1646: @@unique([dispatchId, sequenceOrder]))
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix sequenceOrder collision in persistStops and improve PATCH error logging</name>
  <files>
    apps/web/src/lib/carrier/loads.ts
    apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
  </files>
  <action>
**In `apps/web/src/lib/carrier/loads.ts` — `persistStops` function (line ~258):**

1. After the existing `existingStopCount` query (line 266, which counts stops by `loadId`), add a NEW query to count stops on the **dispatch** level:

```typescript
const existingDispatchStopCount = await prisma.carrierStop.count({
  where: { dispatchId },
});
```

2. In the `createMany` call (line ~334), offset each new stop's `sequenceOrder` by `existingDispatchStopCount`:

Change:
```typescript
sequenceOrder: s.sequence_order,
```
To:
```typescript
sequenceOrder: s.sequence_order + existingDispatchStopCount,
```

This ensures new stops from a second load get sequenceOrder values like 3, 4 (if dispatch already has stops 1, 2) instead of colliding at 1, 2.

IMPORTANT: Only apply the offset to `incomingNewStops` in the `createMany` block. Do NOT change the `sequenceOrder` in the update block for `incomingWithId` — those are existing stops being edited and already have valid sequence numbers.

IMPORTANT: The `existingDispatchStopCount` must be queried INSIDE the transaction (use `tx.carrierStop.count` not `prisma.carrierStop.count`) to avoid race conditions. Move the query inside the `$transaction` callback, right before the createMany block. Only query it if `incomingNewStops.length > 0`.

**In `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts` — PATCH catch block (line ~96):**

The current logging on lines 97-100 already uses structured logging with `err instanceof Error`. Looking at it again, this is actually fine — the logger handles objects properly. However, to be safe and match the user's request, update the catch block to also include the raw error string representation:

Replace lines 97-100:
```typescript
logger.error('PATCH /api/v1/carrier/loads/[id] failed', {
  message: err instanceof Error ? err.message : String(err),
  stack: err instanceof Error ? err.stack : undefined,
});
```

With:
```typescript
logger.error('PATCH /api/v1/carrier/loads/[id] failed', {
  error: err instanceof Error ? err.message : JSON.stringify(err, Object.getOwnPropertyNames(err as object)),
  stack: err instanceof Error ? err.stack : undefined,
});
```

This ensures non-Error objects (like Prisma's PrismaClientKnownRequestError) get fully serialized instead of showing as `[object Object]`.
  </action>
  <verify>
    1. Run `npx tsc --noEmit` from `apps/web` — no TypeScript errors
    2. Grep for `existingDispatchStopCount` in loads.ts to confirm the offset logic exists
    3. Grep for `Object.getOwnPropertyNames` in route.ts to confirm error logging improvement
  </verify>
  <done>
    - persistStops offsets new stop sequenceOrder values by the count of existing stops on the dispatch
    - The offset is computed inside the transaction to avoid race conditions
    - Only new stops (createMany) get the offset, not updates to existing stops
    - PATCH error logging serializes non-Error objects properly
    - No TypeScript errors
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors in apps/web
- The unique constraint `@@unique([dispatchId, sequenceOrder])` will no longer be violated when attaching a second load
- Error logging in the PATCH handler produces readable error messages for all error types
</verification>

<success_criteria>
- Second load can be attached to a dispatch without 500 error
- New stops get sequenceOrder values offset by existing dispatch stop count
- Existing stops on the dispatch are not modified
- PATCH errors are properly logged with full error details
</success_criteria>

<output>
After completion, create `.planning/quick/268-fix-attach-second-load-to-dispatch-retur/268-SUMMARY.md`
</output>
