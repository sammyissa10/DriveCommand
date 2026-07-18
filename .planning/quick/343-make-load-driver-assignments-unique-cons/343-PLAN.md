---
phase: quick-343
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql
  - apps/web/src/components/driver-pay/assign-driver-modal.tsx
autonomous: true
must_haves:
  truths:
    - "The hard `@@unique([loadId, driverId])` constraint on LoadDriverAssignment is replaced with a partial unique index that only enforces uniqueness for rows where deleted_at IS NULL"
    - "A driver soft-deleted from a load can be re-assigned to that same load without hitting Prisma P2002 UniqueConstraintViolation"
    - "AssignDriverModal.handleAssign always re-enables the Assign Driver button (sets isSubmitting back to false) even when createAssignment throws an exception"
    - "When createAssignment throws, the modal displays the generic message 'Something went wrong. Please try again.' instead of leaving the button frozen on 'Assigning...'"
    - "`npx tsc --noEmit` from apps/web passes cleanly"
    - "`npm run build` from apps/web passes cleanly"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "LoadDriverAssignment model without @@unique([loadId, driverId]) and with a comment pointing to the partial unique index migration"
      contains: "Uniqueness enforced by partial unique index in DB"
    - path: "apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql"
      provides: "Migration record of the DROP CONSTRAINT + CREATE UNIQUE INDEX (applied via Supabase MCP, recorded for repo history)"
      contains: "load_driver_assignments_load_id_driver_id_active_unique"
    - path: "apps/web/src/components/driver-pay/assign-driver-modal.tsx"
      provides: "handleAssign wrapped in try/catch/finally so isSubmitting always resets and exceptions surface as a user-facing error"
      contains: "try {"
  key_links:
    - from: "LoadDriverAssignment Prisma model"
      to: "Postgres partial unique index load_driver_assignments_load_id_driver_id_active_unique"
      via: "comment in schema.prisma + migration SQL file"
      pattern: "load_driver_assignments_load_id_driver_id_active_unique"
    - from: "AssignDriverModal handleAssign"
      to: "isSubmitting state"
      via: "finally { setIsSubmitting(false); }"
      pattern: "finally\\s*\\{\\s*setIsSubmitting\\(false\\)"
---

<objective>
Fix two related bugs blocking driver re-assignment on a load:

1. **DB constraint bug:** `LoadDriverAssignment` has `@@unique([loadId, driverId])`, which becomes a full unique constraint at the Postgres level. The app uses soft deletes (`deletedAt`). When a driver is removed (soft-delete sets `deletedAt`) and then re-assigned, the new INSERT collides with the still-present (soft-deleted) row → Prisma `P2002 UniqueConstraintViolation`. The fix is to drop the full unique constraint and replace it with a **partial unique index** that only enforces uniqueness when `deleted_at IS NULL`.

2. **UI frozen state bug:** In `assign-driver-modal.tsx`, `handleAssign` awaits `createAssignment` without `try/catch/finally`. If the Server Action throws (which is what happens today on the P2002), control never returns to the line that calls `setIsSubmitting(false)`, so the **Assign Driver** button stays disabled showing "Assigning..." until the page is refreshed.

Purpose: Unblock the driver-pay assignment flow. After this plan a user can soft-delete a driver assignment, re-assign the same driver, and recover the modal even if the Server Action errors.

Output:
- Schema change + recorded migration file
- Partial unique index applied to Supabase
- Modal `handleAssign` resilient to Server Action throws
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/schema.prisma
@apps/web/src/components/driver-pay/assign-driver-modal.tsx
@.planning/quick/341-fix-createassignment-load-prefetch-field/341-PLAN.md
@.planning/quick/342-fix-load-assigned-notification-pass-user/342-PLAN.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Apply partial unique index via Supabase MCP + record migration file</name>
  <files>apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql</files>
  <action>
**IMPORTANT: Apply the DB change BEFORE touching schema.prisma or running prisma generate. Do NOT run `prisma migrate dev` — use the Supabase MCP `apply_migration` tool.**

Step 1 — Discover the actual constraint name (Prisma names it predictably but always verify on a real DB). Use Supabase MCP `execute_sql`:

```sql
SELECT conname
FROM pg_constraint
WHERE conrelid = 'load_driver_assignments'::regclass
  AND contype  = 'u';
```

Record the returned name (expected: `load_driver_assignments_load_id_driver_id_key`, but trust whatever the query returns).

Step 2 — Build the migration SQL using the **actual** constraint name from Step 1. Apply via Supabase MCP `apply_migration` with name `apply_partial_unique_load_driver`:

```sql
-- Drop the full unique constraint (soft-delete-unaware)
ALTER TABLE load_driver_assignments
  DROP CONSTRAINT <actual_constraint_name_from_step_1>;

-- Replace with a partial unique index that only constrains live rows
CREATE UNIQUE INDEX load_driver_assignments_load_id_driver_id_active_unique
  ON load_driver_assignments (load_id, driver_id)
  WHERE deleted_at IS NULL;
```

Step 3 — Verify the change landed. Run two confirmation SELECTs via Supabase MCP `execute_sql`:

```sql
-- Should return ZERO rows
SELECT conname FROM pg_constraint
WHERE conrelid = 'load_driver_assignments'::regclass
  AND contype  = 'u'
  AND conname  = '<actual_constraint_name_from_step_1>';

-- Should return ONE row
SELECT indexname, indexdef FROM pg_indexes
WHERE tablename = 'load_driver_assignments'
  AND indexname = 'load_driver_assignments_load_id_driver_id_active_unique';
```

Step 4 — Record the migration in the repo for history (it's already in the DB, but Prisma's migration table tracks it and other devs need the file). Create the directory and migration.sql with the **exact same SQL** that was applied (substituting the real constraint name):

Path: `apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql`

Contents:
```sql
-- Applied via Supabase MCP apply_migration on 2026-05-15.
-- Replaces the unique constraint (loadId, driverId) with a partial unique
-- index that only enforces uniqueness for live rows (deleted_at IS NULL),
-- so soft-deleted driver assignments do not block re-assigning the same
-- driver to the same load.

ALTER TABLE load_driver_assignments
  DROP CONSTRAINT <actual_constraint_name_from_step_1>;

CREATE UNIQUE INDEX load_driver_assignments_load_id_driver_id_active_unique
  ON load_driver_assignments (load_id, driver_id)
  WHERE deleted_at IS NULL;
```

Note: Do NOT run `prisma migrate dev`, `prisma migrate deploy`, or `prisma db push` for this task. The migration file is for repo history only; the DB has already been changed via MCP.
  </action>
  <verify>
1. The pre-flight SELECT returned a constraint name and you used it literally in the DROP statement (no placeholders left in the applied SQL).
2. The post-apply verification SELECT for the constraint returns zero rows.
3. The post-apply verification SELECT for `load_driver_assignments_load_id_driver_id_active_unique` returns one row whose `indexdef` includes `WHERE (deleted_at IS NULL)`.
4. `apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql` exists with the actual constraint name baked in (no `<placeholder>` text remaining).
  </verify>
  <done>
The full unique constraint on `load_driver_assignments(load_id, driver_id)` is gone from Postgres. A partial unique index limited to `deleted_at IS NULL` is in place. The migration file is checked into the repo with the exact SQL that was applied.
  </done>
</task>

<task type="auto">
  <name>Task 2: Remove @@unique from Prisma schema + regenerate client</name>
  <files>apps/web/prisma/schema.prisma</files>
  <action>
Edit `apps/web/prisma/schema.prisma` at the `LoadDriverAssignment` model (around line 2666, ends ~line 2716).

Locate this block at the end of the model:

```prisma
  @@unique([loadId, driverId])
  @@index([tenantId])
  @@index([loadId])
  @@index([driverId])
  @@index([tenantId, driverId])
  @@index([settlementId])
  @@map("load_driver_assignments")
```

Replace the `@@unique([loadId, driverId])` line with a comment so future readers know where uniqueness lives:

```prisma
  // Uniqueness enforced by partial unique index in DB (only live rows);
  // see migration apply-partial-unique-load-driver.sql
  @@index([tenantId])
  @@index([loadId])
  @@index([driverId])
  @@index([tenantId, driverId])
  @@index([settlementId])
  @@map("load_driver_assignments")
```

Do NOT touch any other model, field, relation, or `@@unique` elsewhere in the schema.

Then, from `apps/web/`, regenerate the Prisma client so generated types match the new schema:

```bash
cd apps/web && npx prisma generate
```

Why this is safe: Prisma doesn't model partial indexes, so this is a pure metadata change — the runtime behavior is governed by the DB index applied in Task 1. We do NOT run `prisma migrate dev` because that would try to diff against the DB and may try to recreate the unique constraint.
  </action>
  <verify>
1. `grep -n "@@unique([loadId, driverId])" apps/web/prisma/schema.prisma` returns **no matches** inside the LoadDriverAssignment model (lines ~2666-2716).
2. `grep -n "Uniqueness enforced by partial unique index in DB" apps/web/prisma/schema.prisma` returns exactly one match.
3. `npx prisma generate` from `apps/web` exits 0 with "Generated Prisma Client" output.
4. All sibling `@@index(...)` lines and `@@map("load_driver_assignments")` are still present in the model.
  </verify>
  <done>
Prisma schema no longer declares the full unique constraint, generated client reflects the change, no other models touched.
  </done>
</task>

<task type="auto">
  <name>Task 3: Wrap handleAssign in try/catch/finally + verify build</name>
  <files>apps/web/src/components/driver-pay/assign-driver-modal.tsx</files>
  <action>
Edit `apps/web/src/components/driver-pay/assign-driver-modal.tsx`. Only modify the `handleAssign` function (currently lines 116-173). Do not change any imports, JSX, holiday lists, props, or other state setters.

Current shape:

```tsx
async function handleAssign() {
  if (!selectedDriverId || !selectedRole) return;
  setIsSubmitting(true);
  setError(null);

  const result = await createAssignment(loadId, {
    driverId: selectedDriverId,
    driverRole: selectedRole,
  });

  setIsSubmitting(false);

  if (result.error) {
    setError(result.error);
    return;
  }

  if (result.data) {
    // ...optimistic update + onAssigned + handleClose
  }
}
```

Replace with this exact shape:

```tsx
async function handleAssign() {
  if (!selectedDriverId || !selectedRole) return;
  setIsSubmitting(true);
  setError(null);

  try {
    const result = await createAssignment(loadId, {
      driverId: selectedDriverId,
      driverRole: selectedRole,
    });

    if (result.error) {
      setError(result.error);
      return;
    }

    if (result.data) {
      const driverName = selectedDriver
        ? `${selectedDriver.firstName} ${selectedDriver.lastName}`
        : 'Driver';
      toast.success(`${driverName} assigned to this load.`);

      // Build a partial SerializedAssignment for optimistic update
      const partial: SerializedAssignment = {
        id: result.data.id,
        tenantId: '',
        loadId,
        driverId: selectedDriverId,
        driverRole: selectedRole,
        templateId: null,
        payType: '',
        baseRate: '0',
        rateUnit: '',
        currency: 'USD',
        loadedMilesOnly: false,
        fuelSurchargeRate: null,
        perDiemEnabled: false,
        perDiemRate: null,
        estimatedMiles: null,
        actualMiles: null,
        mileageSource: null,
        overrideReason: null,
        payStatus: 'DRAFT',
        createdAt: new Date().toISOString(),
        deletedAt: null,
        driver: {
          id: selectedDriverId,
          firstName: selectedDriver?.firstName ?? '',
          lastName: selectedDriver?.lastName ?? '',
        },
        template: null,
      };

      onAssigned(partial);
      handleClose();
    }
  } catch {
    setError('Something went wrong. Please try again.');
  } finally {
    setIsSubmitting(false);
  }
}
```

Key requirements (do not deviate):
- The existing `setIsSubmitting(false)` call that was on its own line after the await must be **removed** — `finally` handles it now.
- The catch parameter is omitted (`catch {`) — TypeScript strict mode + no-unused-vars compatible. Do not introduce an `err` variable.
- The generic message text is exactly: `Something went wrong. Please try again.`
- `setError(null)` at the top stays — clears any prior error before retry.
- All existing happy-path code (toast, optimistic partial, onAssigned, handleClose, the result.error early return) is preserved inside the `try` block.
- Do NOT modify `createAssignment`, `handleClose`, or any other function in this file.

After editing, run from repo root:

```bash
cd apps/web && npx tsc --noEmit
cd apps/web && npm run build
```

Both must pass. If `npm run build` complains about an unused variable in the catch, you wrote `catch (err)` — switch to `catch {`.
  </action>
  <verify>
1. `grep -n "try {" apps/web/src/components/driver-pay/assign-driver-modal.tsx` shows the new try block inside `handleAssign`.
2. `grep -n "finally" apps/web/src/components/driver-pay/assign-driver-modal.tsx` shows `finally { setIsSubmitting(false); }` (or equivalent multi-line form).
3. `grep -n "Something went wrong. Please try again." apps/web/src/components/driver-pay/assign-driver-modal.tsx` returns exactly one match.
4. The standalone `setIsSubmitting(false);` line that previously sat between the await and the `if (result.error)` check is gone (only the one inside `finally` remains).
5. `npx tsc --noEmit` from `apps/web` exits 0.
6. `npm run build` from `apps/web` exits 0.
  </verify>
  <done>
`handleAssign` is exception-safe. The Assign Driver button always re-enables — on success, on returned error, and on thrown exception. Build and typecheck pass. With Task 1's DB change in place, a soft-deleted assignment can be re-created without hitting P2002, and even if any future error occurs, the modal recovers instead of freezing.
  </done>
</task>

</tasks>

<verification>
End-to-end checks across both bugs:

1. **DB layer (Task 1):**
   - `SELECT conname FROM pg_constraint WHERE conrelid = 'load_driver_assignments'::regclass AND contype = 'u';` returns zero rows.
   - `SELECT indexname FROM pg_indexes WHERE tablename = 'load_driver_assignments' AND indexname = 'load_driver_assignments_load_id_driver_id_active_unique';` returns one row.

2. **Prisma layer (Task 2):**
   - `@@unique([loadId, driverId])` no longer appears in `LoadDriverAssignment` block.
   - `npx prisma generate` succeeds.

3. **App layer (Task 3):**
   - `npx tsc --noEmit` from `apps/web` exits 0.
   - `npm run build` from `apps/web` exits 0.
   - `handleAssign` contains `try { ... } catch { setError('Something went wrong. Please try again.'); } finally { setIsSubmitting(false); }`.

4. **Functional (manual, not gating — record in SUMMARY):**
   - Re-assignment path no longer raises P2002 in app logs after soft-deleting + re-creating an assignment for the same `(loadId, driverId)`.
   - If `createAssignment` throws for any reason, the modal shows "Something went wrong. Please try again." and the button is clickable again.
</verification>

<success_criteria>
- Postgres unique constraint dropped, partial unique index in place (verified via two SELECTs).
- `apps/web/prisma/schema.prisma` no longer declares `@@unique([loadId, driverId])` on `LoadDriverAssignment`; replaced with the comment pointing at the migration.
- Migration file `apps/web/prisma/migrations/20260515000001_apply_partial_unique_load_driver/migration.sql` exists with the exact SQL that was applied.
- `apps/web/src/components/driver-pay/assign-driver-modal.tsx` `handleAssign` is wrapped in try/catch/finally with the specified generic error message and unconditional `setIsSubmitting(false)`.
- `npx tsc --noEmit` and `npm run build` both pass from `apps/web`.
- No changes to: `createAssignment`, any test file, any other modal, or any other Prisma model.
</success_criteria>

<output>
After completion, create `.planning/quick/343-make-load-driver-assignments-unique-cons/343-SUMMARY.md` recording:
- The actual constraint name found in pg_constraint (so future devs see what was dropped).
- Confirmation outputs from the two post-apply verification SELECTs.
- Confirmation that `tsc --noEmit` and `npm run build` passed.
- Brief note that `prisma migrate dev` was intentionally NOT used.
</output>
