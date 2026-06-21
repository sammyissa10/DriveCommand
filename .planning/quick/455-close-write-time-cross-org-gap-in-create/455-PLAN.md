# Quick Task 455 — Plan
## Close write-time cross-org gap in createCarrierDriver

**Goal:** Add the same userId org-ownership guard to `createCarrierDriver` that `updateCarrierDriver` already uses, so a cross-org userId can never be stored on a CarrierDriver row.

**File:** `apps/web/src/lib/carrier/fleet-drivers.ts`

---

### Task 1 — Add userId org-ownership guard to createCarrierDriver

**Location:** Inside the `if (userId)` block, lines 186–191, after the uniqueness check.

**Current code (lines 186–191):**
```ts
if (userId) {
  const existing = await tenantPrisma.carrierDriver.findFirst({ where: { userId } });
  if (existing) {
    throw new Error('User already linked to a carrier driver');
  }
}
```

**Target code (mirror updateCarrierDriver lines 485–492):**
```ts
if (userId) {
  const existing = await tenantPrisma.carrierDriver.findFirst({ where: { userId } });
  if (existing) {
    throw new Error('User already linked to a carrier driver');
  }
  const user = await prisma.user.findFirst({
    where: { id: userId, tenantId: orgId },
  });
  if (!user) {
    throw new Error('Invalid userId: user not found in this organization');
  }
}
```

**What changes:** One `prisma.user.findFirst` guard added inside the existing `if (userId)` block. Uses the bare `prisma` client (not `tenantPrisma`) exactly as `updateCarrierDriver` does — `User` is a platform table queried without RLS.

**What does NOT change:** The email-invite auto-link path (lines 216–234), invite/send flow, revoke/restore, UI, schema.

---

### Commit
`fix(quick-455): validate explicit userId org-membership in createCarrierDriver`
