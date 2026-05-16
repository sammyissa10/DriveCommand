# Quick Task 342 — Fix load.assigned Notification Recipient Routing

**Date:** 2026-05-16  
**Status:** Ready to execute

## Problem

`load.assigned` notification only reaches the load owner — not the assigned driver — because the dispatch payload passes `cd.id` (CarrierDriver row id) where the recipient resolver expects a User id.

`defaultRecipients` config: `[{"type":"related","payloadKey":"driverId"},{"role":"OWNER","type":"role"}]`  
Resolver does: `User.findFirst({ where: { id: payload.driverId } })` → silently returns `null` when given a CarrierDriver id.

## Analysis

- `CarrierDriver.userId` — Prisma field (`String? @unique @map("user_id")`) — links to the User row. Nullable.
- `carrierDriver.findFirst` at line 187 of `load-driver-assignments.ts` has no explicit `select` → all scalar fields returned → `cd.userId` is available.
- `loads.ts` `dispatchLoad` already passes a User id correctly (confirmed: uses same id for `prisma.user.findUnique` lookup). No change needed there.

## Tasks

### Task 1 — Fix `driverId` in `load-driver-assignments.ts` createAssignment

**File:** `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`  
**Line:** 294

Change:
```ts
driverId: cd.id,
```
To:
```ts
driverId: cd.userId ?? '', // User id for recipient resolver; cd.id is the CarrierDriver row id
```

**Why `?? ''`:** `cd.userId` is `string | null`. Passing `''` when null keeps the type as `string`; the resolver's `User.findFirst({ where: { id: '' } })` returns null and skips the driver — correct behavior for a driver without a linked user account.

## Verification

1. `npx tsc --noEmit` from `apps/web` passes
2. `npm run build` from `apps/web` succeeds
3. `npx vitest run __tests__/notifications/` from `apps/web` passes
4. Manual smoke test: assign driver to load, verify `NotificationSendLog` has >= 2 rows with at least one `recipientEmail = sammy.issa21@gmail.com`
