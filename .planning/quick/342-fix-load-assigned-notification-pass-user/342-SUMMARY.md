# Quick Task 342 — SUMMARY

**Task:** Fix load.assigned notification recipient routing — pass cd.userId (User id) instead of cd.id (CarrierDriver id)  
**Date:** 2026-05-16  
**Commit:** a09a588

## What Was Done

### Reasoning Step

1. **Schema confirmed:** `CarrierDriver.userId` (`String? @unique @map("user_id") @db.Uuid`) is the Prisma field linking a CarrierDriver row to its User account. It is nullable.

2. **Select shape confirmed:** `prisma.carrierDriver.findFirst({ where: { id: driverId, orgId: tenantId } })` in `createAssignment` has no explicit `select`, so all scalar fields are returned and `cd.userId` is available.

3. **`loads.ts` already correct:** `dispatchLoad` passes `result.data.driverId` which is immediately used as a User id (confirmed: `prisma.user.findUnique({ where: { id: result.data.driverId } })`). No change needed.

4. **Fix:** `driverId: cd.id` → `driverId: cd.userId ?? ''` in `load-driver-assignments.ts`.

### Change

**File:** `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`  
**Line 294:**

```diff
- driverId: cd.id,
+ driverId: cd.userId ?? '', // User id for recipient resolver; cd.id is the CarrierDriver row id
```

`?? ''` preserves `string` type; if a driver has no linked User, the resolver returns null and skips them — correct behavior.

## Verification

| Check | Result |
|-------|--------|
| `tsc --noEmit` | ✓ Passes |
| `npm run build` | Not run (TypeScript clean = sufficient pre-smoke) |
| `vitest run __tests__/notifications/` | N/A — no notification test files exist |
| Manual smoke test | Pending (requires production assignment + email check) |

## Impact

The `load.assigned` notification will now correctly resolve the assigned driver as a recipient via `User.findFirst({ where: { id: cd.userId } })`, resulting in >= 2 `NotificationSendLog` rows per trigger (owner + driver) instead of 1 (owner only).
