# quick-606 · 04 — the digests test mock, witnessed RED

`tests/cron/digests.test.ts` mocked `@/lib/db/extensions/tenant-rls` (`withTenantRLS: () => ({})`)
and `@/lib/db/prisma` (`prisma.$extends`). After Task 2 the three routes call neither, so those two
mocks would have injected into a **dead code path**: the file would go green forever while testing
nothing — the Phase-10 `sendDispatchAssignedNotification` shape.

Retargeted to the function the routes now call:

```ts
vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrismaForOrg: vi.fn(async () => ({ user: { findMany: h.userFindMany } })),
}));
```

## Green after the retarget

```
 ✓ tests/cron/digests.test.ts (9 tests) 760ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
```

## RED, witnessed — the retargeted mock made to throw

```ts
getTenantPrismaForOrg: vi.fn(async () => { throw new Error('606 RED WITNESS: the retargeted mock IS load-bearing'); }),
```

```
 FAIL tests/cron/digests.test.ts > cron/digest-compliance-30day — injection > is unchanged on a fully-successful run
AssertionError: expected 500 to be 200 // Object.is equality
 ❯ tests/cron/digests.test.ts:145:26
 Test Files  1 failed (1)
      Tests  9 failed (9)
```

**All nine tests** fail, on all three routes. Reverted; green re-confirmed.
