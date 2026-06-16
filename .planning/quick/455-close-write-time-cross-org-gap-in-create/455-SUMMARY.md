# Quick Task 455 — Summary
## Close write-time cross-org gap in createCarrierDriver

**Date:** 2026-06-16
**Commit:** 5f62f13d

---

## What was done

Added the userId org-ownership guard to `createCarrierDriver` in `apps/web/src/lib/carrier/fleet-drivers.ts`, mirroring the identical guard already present in `updateCarrierDriver`.

**Guard added (inside the existing `if (userId)` block):**
```ts
const user = await prisma.user.findFirst({
  where: { id: userId, tenantId: orgId },
});
if (!user) {
  throw new Error('Invalid userId: user not found in this organization');
}
```

## Guard path (cross-org rejection)

1. Caller provides `userId` from a different org.
2. Uniqueness check passes (no existing CarrierDriver link).
3. **New guard fires:** `prisma.user.findFirst({ id: userId, tenantId: orgId })` returns `null`.
4. Throws `'Invalid userId: user not found in this organization'` — row is never written.

## Unchanged paths

- **Email-invite auto-link path** (`if (data.email && !userId)`) — untouched; resolves users by `email + tenantId` in the same org, already correct.
- Revoke/restore actions — not touched.
- UI, schema — not touched.

## Verification

- `tsc --noEmit` on `apps/web`: zero new errors in `fleet-drivers.ts`.
- `git diff` shows only `fleet-drivers.ts`, exactly +6 lines inside the `if (userId)` block.
- Guard is byte-for-byte identical to `updateCarrierDriver` lines 485–492.
