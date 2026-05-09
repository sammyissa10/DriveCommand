---
phase: quick-225
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/app/api/auth/accept-invitation/route.ts
autonomous: true
must_haves:
  truths:
    - "Creating a carrier driver for an email that already has a User account immediately populates userId"
    - "Accepting a driver invitation links the new User to the matching carrier_drivers record"
    - "Existing non-null userId values are never overwritten"
  artifacts:
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "Post-create userId backfill for existing users"
    - path: "apps/web/src/app/api/auth/accept-invitation/route.ts"
      provides: "Post-acceptance userId link to carrier_drivers"
  key_links:
    - from: "fleet-drivers.ts createCarrierDriver"
      to: "prisma.user.findFirst + prisma.carrierDriver.update"
      via: "email + orgId lookup after create"
    - from: "accept-invitation route.ts POST"
      to: "prisma.carrierDriver.updateMany"
      via: "email + tenantId + userId null match after User creation"
---

<objective>
Fix carrier_drivers.user_id always being null for new drivers by linking the User record at two points: (1) at driver creation time if a User already exists for that email, and (2) at invitation acceptance time after the new User record is created.

Purpose: userId is required for email notifications, driver portal access, and any join between carrier_drivers and User.
Output: Two modified files with userId backfill logic.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/fleet-drivers.ts
@apps/web/src/app/api/auth/accept-invitation/route.ts
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Link userId at driver creation and invitation acceptance</name>
  <files>
    apps/web/src/lib/carrier/fleet-drivers.ts
    apps/web/src/app/api/auth/accept-invitation/route.ts
  </files>
  <action>
**Fix 1 — fleet-drivers.ts createCarrierDriver (after line 153, after `prisma.carrierDriver.create`):**

After the driver record is created and before the invitation email logic, add a lookup for an existing User with the same email in the same org. If found, update the new carrier driver's userId:

```typescript
// Link to existing User if one exists for this email in the same org
if (data.email && !userId) {
  try {
    const existingUser = await prisma.user.findFirst({
      where: {
        email: data.email.toLowerCase().trim(),
        tenantId: orgId,
      },
    });
    if (existingUser) {
      await prisma.carrierDriver.update({
        where: { id: driver.id },
        data: { userId: existingUser.id },
      });
    }
  } catch (linkError) {
    logger.error('Failed to link existing user to carrier driver:', linkError);
    // Non-fatal — driver record still valid, can be linked later
  }
}
```

Place this block at line 154, right after `const driver = await prisma.carrierDriver.create(...)` and before `if (data.email) {` invitation block. The `!userId` guard avoids redundant work when userId was already provided in the create call. Use `data.email.toLowerCase().trim()` to match the normalization pattern used in accept-invitation.

**Fix 2 — accept-invitation/route.ts POST handler (inside the transaction at line 209-237):**

After creating the User (line 212-225) and updating the invitation (line 227-234), add a `carrierDriver.updateMany` to link any unlinked carrier_drivers record for this email + tenantId. Add this INSIDE the existing `prisma.$transaction` block, after the `tx.driverInvitation.update` call (after line 234, before `return newUser`):

```typescript
// Link carrier_drivers record to the newly created user
await tx.carrierDriver.updateMany({
  where: {
    orgId: invitation.tenantId,
    email: userEmail,
    userId: null, // Only link records that have no user yet
  },
  data: {
    userId: newUser.id,
  },
});
```

Using `updateMany` with `userId: null` condition ensures:
- Never overwrites an existing non-null userId
- Handles edge case of multiple unlinked records (though unlikely)
- Is safe inside the existing transaction (rolls back if anything fails)
  </action>
  <verify>
1. Run `npx tsc --noEmit` from apps/web — no TypeScript errors
2. Read both files to confirm:
   - fleet-drivers.ts: userId lookup exists after carrierDriver.create, guarded by `!userId` and `data.email`
   - accept-invitation/route.ts: carrierDriver.updateMany exists inside the transaction, uses `userId: null` condition
  </verify>
  <done>
- createCarrierDriver links userId when a User with matching email+orgId already exists
- accept-invitation POST links userId to carrier_drivers after creating User record
- Both paths guard with userId: null to never overwrite existing links
- Both paths scope by orgId/tenantId for tenant isolation
- No schema changes, no migration files modified
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. fleet-drivers.ts contains `prisma.user.findFirst` lookup after `prisma.carrierDriver.create`
3. accept-invitation/route.ts contains `tx.carrierDriver.updateMany` with `userId: null` guard inside the transaction
4. No changes to prisma/schema.prisma or any migration files
</verification>

<success_criteria>
- Both userId linking paths implemented with tenant isolation and null-guard
- Zero TypeScript errors
- No schema or migration changes
</success_criteria>

<output>
After completion, create `.planning/quick/225-fix-carrier-driver-creation-to-write-use/225-SUMMARY.md`
</output>
